import {
  approveAgenticStep,
  deriveAgenticPlanStatus,
  finishAgenticStep,
  recoverAgenticPlan,
  summarizeAgenticPlan
} from '../legal-intelligence/agentic-plan.mjs';
import {
  findAgenticPlan,
  newAgenticPlanId,
  normalizeAgenticPlanFile,
  upsertAgenticPlan
} from '../legal-intelligence/agentic-plan-store.mjs';
import { buildDraftReviewPayload, parseDraftReview } from '../legal-intelligence/draft-review.mjs';

export function createLegalIntelligenceHttpHandler({
  service,
  assertAuthenticated,
  readJson,
  json,
  loadRequestContext,
  readApiKey,
  callModel,
  recordCitationOverride = null,
  planStore = null
} = {}) {
  if (!service || typeof assertAuthenticated !== 'function' || typeof readJson !== 'function' || typeof json !== 'function') {
    throw new TypeError('Dependências das rotas de inteligência jurídica são obrigatórias.');
  }
  const requestWindows = new Map();
  const planStreams = new Map();

  const emitPlanEvent = (planId, event, payload) => {
    const streams = planStreams.get(String(planId));
    if (!streams) return;
    const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const stream of streams) {
      try { stream.write(frame); } catch { /* stream encerrado */ }
    }
  };
  const closePlanStreams = planId => {
    const streams = planStreams.get(String(planId));
    if (!streams) return;
    for (const stream of streams) {
      try { stream.end(); } catch { /* stream encerrado */ }
    }
    planStreams.delete(String(planId));
  };

  const readPlanFile = async () => {
    if (!planStore?.read || !planStore?.write) return null;
    try {
      return normalizeAgenticPlanFile(await planStore.read());
    } catch {
      return normalizeAgenticPlanFile(null);
    }
  };
  const persistPlan = async plan => {
    if (!planStore?.write) return false;
    const file = await readPlanFile();
    if (!file) return false;
    await planStore.write(upsertAgenticPlan(file, plan));
    return true;
  };
  const requirePlanStore = () => {
    if (!planStore?.read || !planStore?.write) {
      throw Object.assign(new Error('Persistência de planos indisponível neste ambiente.'), { statusCode: 503 });
    }
  };

  return async function handleLegalIntelligenceRequest(req, res, url) {
    const isStatus = req.method === 'GET' && url.pathname === '/api/legal-intelligence/status';
    const isDraft = req.method === 'POST' && url.pathname === '/api/ai/draft';
    const isResearch = req.method === 'POST' && url.pathname === '/api/legal-intelligence/research';
    const isCitationReview = req.method === 'POST' && url.pathname === '/api/legal-intelligence/citations/review';
    const isDraftReview = req.method === 'POST' && url.pathname === '/api/legal-intelligence/reviews';
    const isPlansRoot = req.method === 'POST' && url.pathname === '/api/legal-intelligence/plans';
    const isPlansList = req.method === 'GET' && url.pathname === '/api/legal-intelligence/plans';
    const planMatch = url.pathname.match(/^\/api\/legal-intelligence\/plans\/([^/]+)(?:\/(approve|run|recover|confirm|events))?$/);
    const isPlanRoute = Boolean(planMatch && planMatch[1]);
    const isPlanWrite = isPlansRoot || (isPlanRoute && req.method === 'POST' && planMatch[2] !== 'events');
    if (!isStatus && !isDraft && !isResearch && !isCitationReview && !isDraftReview && !isPlansRoot && !isPlansList && !isPlanRoute) return false;
    const session = assertAuthenticated(req, isDraft || isResearch || isCitationReview || isDraftReview || isPlanWrite);
    enforceRateLimit(requestWindows, req);

    if (isStatus) {
      json(res, 200, { ok: true, ...service.status() });
      return true;
    }

    const body = isPlanRoute && planMatch[2] === 'events' ? {} : await readJson(req, 2_000_000);

    if (isResearch) {
      const result = await service.research({
        claim: body.claim,
        tools: body.tools,
        providers: Array.isArray(body.providers) ? body.providers.map(value => String(value || '').trim()).filter(Boolean) : null
      });
      json(res, 200, result);
      return true;
    }

    if (isDraftReview) {
      const draft = String(body.draft || '').trim();
      if (!draft) throw Object.assign(new Error('Minuta vazia para revisão por pares.'), { statusCode: 400 });
      const apiKey = await readApiKey();
      if (!apiKey) {
        throw Object.assign(new Error('Nenhum provedor de IA configurado. Configure uma chave em Assistente IA.'), { statusCode: 400 });
      }
      const payload = buildDraftReviewPayload({
        draft,
        pieceType: body.pieceType,
        area: body.area,
        citations: Array.isArray(body.citations) ? body.citations : []
      });
      const response = await callModel(apiKey, payload.systemInstruction, payload.contents, { operation: 'revisao-minuta' });
      const review = parseDraftReview(response?.text || '');
      json(res, 200, { ok: true, review: { ...review, model: response?.model || null } });
      return true;
    }

    if (isCitationReview) {
      const draft = String(body.draft || '').trim();
      if (!draft) throw Object.assign(new Error('Minuta vazia para revisão de citações.'), { statusCode: 400 });
      const overrideRequest = body.override && typeof body.override === 'object' ? body.override : null;
      const justification = overrideRequest ? String(overrideRequest.justification || '').replace(/\s+/g, ' ').trim().slice(0, 500) : '';
      if (overrideRequest && justification.length < 10) {
        throw Object.assign(new Error('A justificativa do override deve ter ao menos 10 caracteres.'), { statusCode: 400 });
      }
      const context = await loadRequestContext(body.context || {}, String(body.message || ''));
      const documents = typeof service.documentsFromContext === 'function'
        ? service.documentsFromContext(context.selectedContext)
        : [];
      const base = service.reviewCitations({ draft, documents, message: String(body.message || ''), research: {} });
      let override = null;
      if (justification) {
        if (typeof recordCitationOverride !== 'function') {
          throw Object.assign(new Error('Auditoria da revisão indisponível; o override não pode ser aplicado.'), { statusCode: 503 });
        }
        override = { justification, actor: session?.displayName || session?.username || session?.userId || null, at: new Date().toISOString() };
        await recordCitationOverride({
          justification,
          actor: override.actor,
          blockers: base.review.blockers,
          revision: body.revision ?? null
        });
      }
      const result = service.reviewCitations({ draft, documents, message: String(body.message || ''), research: {}, override });
      json(res, 200, {
        ok: true,
        citations: {
          entries: result.registry.entries.map(entry => ({
            id: entry.id,
            kind: entry.kind,
            raw: entry.raw,
            court: entry.court,
            status: entry.status,
            policy: entry.policy,
            groundedIn: entry.groundedIn,
            note: entry.note
          })),
          counts: result.registry.counts
        },
        review: result.review
      });
      return true;
    }

    // ── PLANOS AGÊNTICOS SUPERVISIONADOS ────────────────────────────────────
    if (isPlansRoot) {
      requirePlanStore();
      const message = String(body.message || '').trim();
      if (!message) throw Object.assign(new Error('Mensagem vazia para planejar a peça.'), { statusCode: 400 });
      const context = await loadRequestContext(body.context || {}, message);
      const documents = typeof service.documentsFromContext === 'function'
        ? service.documentsFromContext(context.selectedContext)
        : [];
      const { analysis, plan } = await service.createAgenticPlan({
        message,
        documents,
        supervision: body.supervision !== false
      });
      plan.id = newAgenticPlanId();
      plan.artifacts = {
        ...(plan.artifacts || {}),
        context: {
          documentId: context.selectedContext?.document?.id || null,
          intimationId: context.selectedContext?.intimation?.id || null,
          processId: context.selectedContext?.process?.id || null,
          contactId: context.selectedContext?.contact?.id || null
        }
      };
      await persistPlan(plan);
      json(res, 200, {
        ok: true,
        plan: summarizeAgenticPlan(plan),
        analysis: {
          active: Boolean(analysis.plan.active),
          pieceType: analysis.intent.pieceType,
          area: analysis.intent.area,
          confidence: analysis.intent.confidence,
          requiresConfirmation: Boolean(analysis.intent.requiresConfirmation)
        }
      });
      return true;
    }

    if (isPlansList) {
      const file = await readPlanFile();
      json(res, 200, {
        ok: true,
        plans: (file?.plans || []).slice(-20).reverse().map(plan => summarizeAgenticPlan(plan))
      });
      return true;
    }

    if (isPlanRoute) {
      const planId = decodeURIComponent(planMatch[1]);
      const action = planMatch[2] || null;
      const file = await readPlanFile();
      const plan = findAgenticPlan(file, planId);
      if (!plan) return json(res, 404, { ok: false, message: 'Plano não encontrado.' });

      if (req.method === 'GET' && action === 'events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
          Connection: 'keep-alive',
          'X-Content-Type-Options': 'nosniff'
        });
        res.write(`event: snapshot\ndata: ${JSON.stringify(summarizeAgenticPlan(plan))}\n\n`);
        const terminal = ['done', 'failed'].includes(deriveAgenticPlanStatus(plan));
        if (terminal) {
          res.end();
          return true;
        }
        const streams = planStreams.get(planId) || new Set();
        streams.add(res);
        planStreams.set(planId, streams);
        const keepAlive = setInterval(() => {
          try { res.write(': keep-alive\n\n'); } catch { /* stream encerrado */ }
        }, 15_000);
        keepAlive.unref?.();
        req.on('close', () => {
          clearInterval(keepAlive);
          const current = planStreams.get(planId);
          if (current) {
            current.delete(res);
            if (!current.size) planStreams.delete(planId);
          }
        });
        return true;
      }

      if (req.method === 'GET' && !action) {
        json(res, 200, {
          ok: true,
          plan: summarizeAgenticPlan(plan),
          artifacts: {
            research: plan.artifacts?.research || null,
            model: plan.artifacts?.model || null,
            hasDraft: Boolean(plan.artifacts?.draft),
            draft: plan.artifacts?.draft || null,
            citations: plan.artifacts?.citations || null,
            review: plan.artifacts?.review || null
          }
        });
        return true;
      }

      if (req.method === 'POST' && action === 'approve') {
        const stepId = String(body.stepId || '').trim();
        if (!stepId) throw Object.assign(new Error('Informe a etapa a aprovar.'), { statusCode: 400 });
        const actor = session?.displayName || session?.username || session?.userId || '';
        const approval = approveAgenticStep(plan, stepId, { actor });
        if (!approval.ok) {
          throw Object.assign(new Error(
            approval.reason === 'step-not-found' ? 'Etapa não encontrada no plano.'
              : approval.reason === 'actor-required' ? 'Sessão sem ator identificável para aprovar.'
                : 'A etapa não está aguardando aprovação.'
          ), { statusCode: approval.reason === 'step-not-found' ? 404 : 409 });
        }
        plan.status = deriveAgenticPlanStatus(plan);
        await persistPlan(plan);
        emitPlanEvent(planId, 'plan', summarizeAgenticPlan(plan));
        json(res, 200, { ok: true, plan: summarizeAgenticPlan(plan) });
        return true;
      }

      if (req.method === 'POST' && action === 'recover') {
        recoverAgenticPlan(plan);
        await persistPlan(plan);
        emitPlanEvent(planId, 'plan', summarizeAgenticPlan(plan));
        json(res, 200, { ok: true, plan: summarizeAgenticPlan(plan) });
        return true;
      }

      if (req.method === 'POST' && action === 'confirm') {
        const actor = session?.displayName || session?.username || session?.userId || '';
        if (!actor) throw Object.assign(new Error('Sessão sem ator identificável para registrar a conferência.'), { statusCode: 409 });
        const step = (plan.steps || []).find(candidate => candidate.id === 'conferencia-humana');
        if (!step) return json(res, 404, { ok: false, message: 'Etapa de conferência humana não encontrada.' });
        if (step.status !== 'done') {
          finishAgenticStep(plan, 'conferencia-humana', { ok: true, summary: `Conferência humana registrada por ${actor}` });
        }
        plan.status = deriveAgenticPlanStatus(plan);
        await persistPlan(plan);
        emitPlanEvent(planId, 'plan', summarizeAgenticPlan(plan));
        if (['done', 'failed'].includes(plan.status)) closePlanStreams(planId);
        json(res, 200, { ok: true, plan: summarizeAgenticPlan(plan) });
        return true;
      }

      if (req.method === 'POST' && action === 'run') {
        const context = await loadRequestContext(body.context || {}, plan.message);
        const documents = typeof service.documentsFromContext === 'function'
          ? service.documentsFromContext(context.selectedContext)
          : [];
        const targetId = String(body.stepId || '').trim() || null;
        const target = targetId
          ? (plan.steps || []).find(step => step.id === targetId)
          : (plan.steps || []).find(step => ['approved', 'pending'].includes(step.status)) || null;
        if (target?.id === 'redacao') {
          const apiKey = await readApiKey();
          if (!apiKey) {
            throw Object.assign(new Error('Nenhum provedor de IA configurado. Configure uma chave em Assistente IA.'), { statusCode: 400 });
          }
        }
        const result = await service.runAgenticStep({
          plan,
          stepId: targetId,
          documents,
          office: context.office || {},
          relevantOfficeContext: context.relevantOfficeContext || '',
          history: [],
          callModel: async (systemInstruction, contents) => {
            const apiKey = await readApiKey();
            return callModel(apiKey, systemInstruction, contents);
          }
        });
        if (!result?.ok && ['approval-required', 'human-step-not-automatable', 'no-runnable-step', 'step-not-runnable'].includes(result?.reason)) {
          await persistPlan(plan);
          return json(res, 409, { ok: false, reason: result.reason, message: result.reason === 'approval-required' ? 'A etapa de pesquisa aguarda aprovação humana.' : 'Nenhuma etapa executável disponível.', plan: summarizeAgenticPlan(plan) });
        }
        await persistPlan(plan);
        emitPlanEvent(planId, 'plan', summarizeAgenticPlan(plan));
        if (['done', 'failed'].includes(plan.status)) closePlanStreams(planId);
        json(res, 200, {
          ok: Boolean(result?.ok),
          step: result?.step ? { id: result.step.id, status: result.step.status, summary: result.step.summary, error: result.step.error } : null,
          plan: summarizeAgenticPlan(plan),
          draft: result?.draft || null,
          intelligence: result?.intelligence
            ? { gates: result.intelligence.gates, citations: result.intelligence.citations, research: result.intelligence.research }
            : null
        });
        return true;
      }

      return json(res, 405, { ok: false, message: 'Operação não suportada para planos.' });
    }

    const message = String(body.message || '').trim();
    if (!message) throw Object.assign(new Error('Mensagem vazia.'), { statusCode: 400 });
    const apiKey = await readApiKey();
    if (!apiKey) {
      throw Object.assign(new Error('Nenhum provedor de IA configurado. Configure uma chave em Assistente IA.'), { statusCode: 400 });
    }
    const context = await loadRequestContext(body.context || {}, message);
    const documents = typeof service.documentsFromContext === 'function'
      ? service.documentsFromContext(context.selectedContext)
      : [];
    const result = await service.runDraft({
      message,
      documents,
      history: Array.isArray(body.history) ? body.history : [],
      office: context.office || {},
      relevantOfficeContext: context.relevantOfficeContext || '',
      callModel: (systemInstruction, contents) => callModel(apiKey, systemInstruction, contents)
    });
    json(res, 200, { ok: true, reply: result.reply, model: result.model, intelligence: result.intelligence });
    return true;
  };
}

function enforceRateLimit(windows, req) {
  const key = String(req.socket?.remoteAddress || 'local');
  const now = Date.now();
  const current = windows.get(key);
  const bucket = !current || now - current.startedAt >= 60_000 ? { startedAt: now, count: 0 } : current;
  bucket.count += 1;
  windows.set(key, bucket);
  if (bucket.count > 30) throw Object.assign(new Error('Limite temporário de operações de inteligência jurídica atingido.'), { statusCode: 429 });
}
