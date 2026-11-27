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
import { buildRelevantOfficeContext, hasPrivateOfficeContext } from '../ai-context.mjs';
import { filterPrivateScopeState } from '../office/access-control.mjs';
import { publicClientAddress } from './client-address.mjs';

const SYSTEM_PUBLIC_USER = Object.freeze({ id: '\u0000atrium-system', username: '\u0000atrium-system' });

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
  const planWriteQueues = new Map();
  const planRunQueues = new Map();

  const planStreamKey = (workspaceId, planId) => `${String(workspaceId || 'default')}:${String(planId)}`;

  const withPlanLock = (workspaceId, operation) => {
    const key = String(workspaceId || 'default');
    const previous = planWriteQueues.get(key) || Promise.resolve();
    const run = previous.catch(() => {}).then(operation);
    const cleanup = () => {
      if (planWriteQueues.get(key) === tail) planWriteQueues.delete(key);
    };
    const tail = run.then(cleanup, cleanup);
    planWriteQueues.set(key, tail);
    return run;
  };

  const withPlanRunLock = (workspaceId, planId, operation) => {
    const key = planStreamKey(workspaceId, planId);
    const previous = planRunQueues.get(key) || Promise.resolve();
    const run = previous.catch(() => {}).then(operation);
    const cleanup = () => {
      if (planRunQueues.get(key) === tail) planRunQueues.delete(key);
    };
    const tail = run.then(cleanup, cleanup);
    planRunQueues.set(key, tail);
    return run;
  };

  const sessionPrincipalId = session => String(session?.id || session?.userId || '').trim();
  const isWorkspaceAdmin = session => session?.role === 'admin' || session?.role === 'master_admin';
  const isPlanOwner = (session, plan) => {
    if (!plan || typeof plan !== 'object') return false;
    const ownerId = String(plan.ownerUserId || '').trim();
    const ownerUsername = String(plan.ownerUsername || '').trim();
    const callerId = sessionPrincipalId(session);
    const callerUsername = String(session?.username || '').trim();
    return Boolean((ownerId && callerId && ownerId === callerId)
      || (ownerUsername && callerUsername && ownerUsername === callerUsername));
  };
  const requestedContextFromPlan = plan => {
    const saved = plan?.artifacts?.context;
    if (!saved || typeof saved !== 'object') return {};
    const requested = {};
    if (saved.documentId) requested.document = { id: saved.documentId };
    if (saved.intimationId) requested.intimation = { id: saved.intimationId };
    if (saved.processId) requested.process = { id: saved.processId };
    if (saved.contactId) requested.contact = { id: saved.contactId };
    return requested;
  };
  const stripPrivateRuntimeRecords = runtime => {
    if (!runtime || typeof runtime !== 'object') return {};
    const isPrivate = record => Boolean(record && (record.scope === 'private' || record.privateOwnerUserId || record.ownerUserId || record.captureSuppressed));
    const filtered = { ...runtime };
    for (const key of ['processes', 'intimations', 'tasks', 'events', 'contacts', 'documents']) {
      if (Array.isArray(filtered[key])) filtered[key] = filtered[key].filter(record => !isPrivate(record));
    }
    return filtered;
  };
  const contextHasPrivateScope = selectedContext => {
    if (!selectedContext || typeof selectedContext !== 'object') return false;
    return ['document', 'intimation', 'process', 'contact'].some(key => {
      const record = selectedContext[key];
      return Boolean(record && (record.scope === 'private' || record.privateOwnerUserId || record.ownerUserId || record.restricted));
    });
  };
  const canSessionAccessPlan = (session, plan) => {
    if (!plan || typeof plan !== 'object') return false;
    const ownerId = String(plan.ownerUserId || '').trim();
    const ownerUsername = String(plan.ownerUsername || '').trim();
    const isOwner = isPlanOwner(session, plan);
    if (plan.scope === 'private') return isOwner;
    if (!ownerId && !ownerUsername) return isWorkspaceAdmin(session);
    return isOwner || isWorkspaceAdmin(session);
  };

  const isStreamOwner = (streamEntry, plan) => {
    const planOwnerId = String(plan?.ownerUserId || '').trim();
    const planOwnerUsername = String(plan?.ownerUsername || '').trim();
    return Boolean(
      (planOwnerId && streamEntry.ownerId && planOwnerId === streamEntry.ownerId)
      || (planOwnerUsername && streamEntry.username && planOwnerUsername === streamEntry.username)
    );
  };
  const pruneIneligiblePlanStreams = (workspaceId, planId, plan) => {
    if (plan?.scope !== 'private') return null;
    const key = planStreamKey(workspaceId, planId);
    const streams = planStreams.get(key);
    if (!streams) return null;
    for (const entry of [...streams]) {
      if (!isStreamOwner(entry, plan)) {
        streams.delete(entry);
        try { entry.res.end(); } catch { /* stream encerrado */ }
      }
    }
    if (!streams.size) planStreams.delete(key);
    return streams.size ? streams : null;
  };
  const emitPlanEvent = (workspaceId, planId, event, payload, plan = null) => {
    const key = planStreamKey(workspaceId, planId);
    const streams = pruneIneligiblePlanStreams(workspaceId, planId, plan) || planStreams.get(key);
    if (!streams || !streams.size) return;
    const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const entry of [...streams]) {
      try { entry.res.write(frame); } catch { /* stream encerrado */ }
    }
    if (!streams.size) planStreams.delete(key);
  };
  const closePlanStreams = (workspaceId, planId) => {
    const key = planStreamKey(workspaceId, planId);
    const streams = planStreams.get(key);
    if (!streams) return;
    for (const entry of streams) {
      try { entry.res.end(); } catch { /* stream encerrado */ }
    }
    planStreams.delete(key);
  };

  const readPlanFile = async () => {
    if (!planStore?.read || !planStore?.write) return null;
    try {
      return normalizeAgenticPlanFile(await planStore.read());
    } catch {
      return normalizeAgenticPlanFile(null);
    }
  };
  const persistPlan = (plan, workspaceId = 'default') => withPlanLock(workspaceId, async () => {
    if (!planStore?.write) return false;
    const file = await readPlanFile();
    if (!file) return false;
    await planStore.write(upsertAgenticPlan(file, plan));
    return true;
  });
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
      plan.ownerUserId = sessionPrincipalId(session) || null;
      plan.ownerUsername = String(session?.username || '').trim() || null;
      const hasPrivateContext = Boolean(
        context?.hasPrivateContext
        || contextHasPrivateScope(context?.selectedContext)
        || hasPrivateOfficeContext(context?.state, context?.runtime, message, context?.selectedContext)
      );
      plan.scope = hasPrivateContext ? 'private' : 'workspace';
      plan.artifacts = {
        ...(plan.artifacts || {}),
        context: {
          documentId: context.selectedContext?.document?.id || null,
          intimationId: context.selectedContext?.intimation?.id || null,
          processId: context.selectedContext?.process?.id || null,
          contactId: context.selectedContext?.contact?.id || null
        }
      };
      await persistPlan(plan, session?.workspaceId);
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
      const visible = (file?.plans || []).filter(plan => canSessionAccessPlan(session, plan));
      json(res, 200, {
        ok: true,
        plans: visible.slice(-20).reverse().map(plan => summarizeAgenticPlan(plan))
      });
      return true;
    }

    if (isPlanRoute) {
      const planId = decodeURIComponent(planMatch[1]);
      const action = planMatch[2] || null;
      const file = await readPlanFile();
      const plan = findAgenticPlan(file, planId);
      if (!plan || !canSessionAccessPlan(session, plan)) {
        return json(res, 404, { ok: false, message: 'Plano não encontrado.' });
      }

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
        const streamKey = planStreamKey(session?.workspaceId, planId);
        const streams = planStreams.get(streamKey) || new Set();
        const streamEntry = {
          res,
          ownerId: sessionPrincipalId(session),
          username: String(session?.username || '').trim()
        };
        streams.add(streamEntry);
        planStreams.set(streamKey, streams);
        const keepAlive = setInterval(() => {
          try { res.write(': keep-alive\n\n'); } catch { /* stream encerrado */ }
        }, 15_000);
        keepAlive.unref?.();
        req.on('close', () => {
          clearInterval(keepAlive);
          const current = planStreams.get(streamKey);
          if (current) {
            current.delete(streamEntry);
            if (!current.size) planStreams.delete(streamKey);
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
        return withPlanRunLock(session?.workspaceId, planId, async () => {
          const latestFile = await readPlanFile();
          const currentPlan = findAgenticPlan(latestFile, planId);
          if (!currentPlan || !canSessionAccessPlan(session, currentPlan)) {
            return json(res, 404, { ok: false, message: 'Plano não encontrado.' });
          }
          const approval = approveAgenticStep(currentPlan, stepId, { actor });
          if (!approval.ok) {
            throw Object.assign(new Error(
              approval.reason === 'step-not-found' ? 'Etapa não encontrada no plano.'
                : approval.reason === 'actor-required' ? 'Sessão sem ator identificável para aprovar.'
                  : 'A etapa não está aguardando aprovação.'
            ), { statusCode: approval.reason === 'step-not-found' ? 404 : 409 });
          }
          currentPlan.status = deriveAgenticPlanStatus(currentPlan);
          await persistPlan(currentPlan, session?.workspaceId);
          emitPlanEvent(session?.workspaceId, planId, 'plan', summarizeAgenticPlan(currentPlan), currentPlan);
          json(res, 200, { ok: true, plan: summarizeAgenticPlan(currentPlan) });
          return true;
        });
      }

      if (req.method === 'POST' && action === 'recover') {
        return withPlanRunLock(session?.workspaceId, planId, async () => {
          const latestFile = await readPlanFile();
          const currentPlan = findAgenticPlan(latestFile, planId);
          if (!currentPlan || !canSessionAccessPlan(session, currentPlan)) {
            return json(res, 404, { ok: false, message: 'Plano não encontrado.' });
          }
          recoverAgenticPlan(currentPlan);
          await persistPlan(currentPlan, session?.workspaceId);
          emitPlanEvent(session?.workspaceId, planId, 'plan', summarizeAgenticPlan(currentPlan), currentPlan);
          json(res, 200, { ok: true, plan: summarizeAgenticPlan(currentPlan) });
          return true;
        });
      }

      if (req.method === 'POST' && action === 'confirm') {
        const actor = session?.displayName || session?.username || session?.userId || '';
        if (!actor) throw Object.assign(new Error('Sessão sem ator identificável para registrar a conferência.'), { statusCode: 409 });
        return withPlanRunLock(session?.workspaceId, planId, async () => {
          const latestFile = await readPlanFile();
          const currentPlan = findAgenticPlan(latestFile, planId);
          if (!currentPlan || !canSessionAccessPlan(session, currentPlan)) {
            return json(res, 404, { ok: false, message: 'Plano não encontrado.' });
          }
          const step = (currentPlan.steps || []).find(candidate => candidate.id === 'conferencia-humana');
          if (!step) return json(res, 404, { ok: false, message: 'Etapa de conferência humana não encontrada.' });
          if (step.status !== 'pending') {
            return json(res, 409, {
              ok: false,
              reason: 'step-not-pending',
              message: step.status === 'done'
                ? 'A conferência humana já foi registrada.'
                : 'A conferência humana só pode ser confirmada após a conclusão das etapas anteriores.',
              plan: summarizeAgenticPlan(currentPlan)
            });
          }
          finishAgenticStep(currentPlan, 'conferencia-humana', { ok: true, summary: `Conferência humana registrada por ${actor}` });
          currentPlan.status = deriveAgenticPlanStatus(currentPlan);
          await persistPlan(currentPlan, session?.workspaceId);
          emitPlanEvent(session?.workspaceId, planId, 'plan', summarizeAgenticPlan(currentPlan), currentPlan);
          if (['done', 'failed'].includes(currentPlan.status)) closePlanStreams(session?.workspaceId, planId);
          json(res, 200, { ok: true, plan: summarizeAgenticPlan(currentPlan) });
          return true;
        });
      }

      if (req.method === 'POST' && action === 'run') {
        return withPlanRunLock(session?.workspaceId, planId, async () => {
          const latestFile = await readPlanFile();
          const currentPlan = findAgenticPlan(latestFile, planId);
          if (!currentPlan || !canSessionAccessPlan(session, currentPlan)) {
            return json(res, 404, { ok: false, message: 'Plano não encontrado.' });
          }
          const owner = isPlanOwner(session, currentPlan);
          const hasBodyContext = Boolean(
            body?.context
            && typeof body.context === 'object'
            && ['process', 'intimation', 'document', 'contact'].some(type => body.context?.[type]?.id)
          );
          const requestedContext = owner && hasBodyContext ? body.context : requestedContextFromPlan(currentPlan);
          const context = await loadRequestContext(requestedContext, currentPlan.message);
          const hasPrivateContext = Boolean(
            context?.hasPrivateContext
            || contextHasPrivateScope(context?.selectedContext)
            || hasPrivateOfficeContext(context?.state, context?.runtime, currentPlan.message, context?.selectedContext)
          );
          if (owner && hasBodyContext) {
            currentPlan.artifacts = {
              ...(currentPlan.artifacts || {}),
              context: {
                documentId: context.selectedContext?.document?.id || null,
                intimationId: context.selectedContext?.intimation?.id || null,
                processId: context.selectedContext?.process?.id || null,
                contactId: context.selectedContext?.contact?.id || null
              }
            };
          }
          if (owner && hasPrivateContext) {
            currentPlan.scope = 'private';
          }
          const safeSelectedContext = !owner && currentPlan.scope !== 'private' && contextHasPrivateScope(context?.selectedContext)
            ? {}
            : context.selectedContext;
          const documents = typeof service.documentsFromContext === 'function'
            ? service.documentsFromContext(safeSelectedContext)
            : [];
          let relevantOfficeContext = context.relevantOfficeContext || '';
          if (!owner && currentPlan.scope !== 'private') {
            if (context?.state) {
              const publicState = filterPrivateScopeState(context.state, SYSTEM_PUBLIC_USER, { teams: [] });
              const publicRuntime = stripPrivateRuntimeRecords(context.runtime);
              relevantOfficeContext = buildRelevantOfficeContext(publicState, publicRuntime, currentPlan.message, safeSelectedContext);
            } else if (hasPrivateContext) {
              relevantOfficeContext = '';
            }
          }
          const targetId = String(body.stepId || '').trim() || null;
          const target = targetId
            ? (currentPlan.steps || []).find(step => step.id === targetId)
            : (currentPlan.steps || []).find(step => ['approved', 'pending'].includes(step.status)) || null;
          if (target?.id === 'redacao') {
            const apiKey = await readApiKey();
            if (!apiKey) {
              throw Object.assign(new Error('Nenhum provedor de IA configurado. Configure uma chave em Assistente IA.'), { statusCode: 400 });
            }
          }
          const result = await service.runAgenticStep({
            plan: currentPlan,
            stepId: targetId,
            documents,
            office: context.office || {},
            relevantOfficeContext,
            history: [],
            callModel: async (systemInstruction, contents) => {
              const apiKey = await readApiKey();
              return callModel(apiKey, systemInstruction, contents);
            }
          });
          if (!result?.ok && ['approval-required', 'human-step-not-automatable', 'no-runnable-step', 'step-not-runnable'].includes(result?.reason)) {
            await persistPlan(currentPlan, session?.workspaceId);
            pruneIneligiblePlanStreams(session?.workspaceId, planId, currentPlan);
            return json(res, 409, { ok: false, reason: result.reason, message: result.reason === 'approval-required' ? 'A etapa de pesquisa aguarda aprovação humana.' : 'Nenhuma etapa executável disponível.', plan: summarizeAgenticPlan(currentPlan) });
          }
          await persistPlan(currentPlan, session?.workspaceId);
          emitPlanEvent(session?.workspaceId, planId, 'plan', summarizeAgenticPlan(currentPlan), currentPlan);
          if (['done', 'failed'].includes(currentPlan.status)) closePlanStreams(session?.workspaceId, planId);
          json(res, 200, {
            ok: Boolean(result?.ok),
            step: result?.step ? { id: result.step.id, status: result.step.status, summary: result.step.summary, error: result.step.error } : null,
            plan: summarizeAgenticPlan(currentPlan),
            draft: result?.draft || null,
            intelligence: result?.intelligence
              ? { gates: result.intelligence.gates, citations: result.intelligence.citations, research: result.intelligence.research }
              : null
          });
          return true;
        });
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
  const key = publicClientAddress(req) || 'local';
  const now = Date.now();
  const current = windows.get(key);
  const bucket = !current || now - current.startedAt >= 60_000 ? { startedAt: now, count: 0 } : current;
  bucket.count += 1;
  windows.set(key, bucket);
  if (bucket.count > 30) throw Object.assign(new Error('Limite temporário de operações de inteligência jurídica atingido.'), { statusCode: 429 });
}
