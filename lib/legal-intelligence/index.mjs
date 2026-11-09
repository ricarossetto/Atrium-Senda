import fs from 'node:fs/promises';
import { createLegalIntelligenceRegistry } from './registry.mjs';
import { createLegalIntelligenceLoader } from './loader.mjs';
import { createLegalMcpProvider, resolveLegalMcpConfig } from './providers/legal-mcp-provider.mjs';
import { createLegalMcpProviders, summarizeLegalMcpProviders } from './providers/provider-registry.mjs';
import { createResearchCache, runMultiSourceResearch, researchCacheKey } from './research-service.mjs';
import {
  analyzeRequest,
  prepareGeneration,
  runMinutaPipeline,
  buildIntelligenceReport,
  runResearch,
  parseSkillDirective,
  kindFromDocument,
  detectConflicts,
  ingestDocuments,
  documentsFromSelectedContext
} from './pipeline.mjs';
import {
  buildAgenticPlan,
  deriveAgenticPlanStatus,
  finishAgenticStep,
  nextRunnableStep,
  recoverAgenticPlan,
  startAgenticStep,
  summarizeAgenticPlan,
  unblockAgenticPlan
} from './agentic-plan.mjs';
import { detectPieceIntent } from './router.mjs';
import { buildCitationRegistry, evaluateCitationReview } from './citation-registry.mjs';
import { redactSensitive, detectPromptInjection } from './source-policy.mjs';
import { isWorkflowEnabled, resolveTransport } from '../jev-beta/policy.mjs';
import { createTelemetry } from '../jev-beta/telemetry.mjs';
import { routeTask } from '../jev-beta/task-router.mjs';
import { checkResearchEvidence, toEvidenceItems } from '../jev-beta/research-guard.mjs';
import { reviewCompletion, COMPLETION_MAX_CYCLES } from '../jev-beta/completion-review.mjs';

export const LEGAL_INTELLIGENCE_ACTIVATION_CONFIDENCE = 0.65;

export function isLegalIntelligenceEligible(message, documents = []) {
  const source = String(message || '');
  if (parseSkillDirective(source)) return { eligible: true, reason: 'skill-directive' };
  const intent = detectPieceIntent(source, { documents });
  if (intent.pieceType && intent.confidence >= LEGAL_INTELLIGENCE_ACTIVATION_CONFIDENCE) {
    return { eligible: true, reason: 'piece-intent', pieceType: intent.pieceType, confidence: intent.confidence };
  }
  return { eligible: false, reason: 'no-legal-generation-intent' };
}

export async function createLegalIntelligenceService({
  rootDir,
  env = {},
  readFile = fs.readFile,
  readdir = fs.readdir,
  fetchImpl,
  jevTransport = undefined
} = {}) {
  if (!rootDir) throw new TypeError('rootDir é obrigatório para o serviço de inteligência jurídica.');
  const registry = await createLegalIntelligenceRegistry({ rootDir, readFile, readdir });
  const loader = createLegalIntelligenceLoader({ rootDir, registry, readFile });
  const provider = createLegalMcpProvider(resolveLegalMcpConfig(env), { fetchImpl });
  const { sources: researchSources, issues: providerIssues, maxResults } = createLegalMcpProviders({ env, fetchImpl });
  const researchCache = createResearchCache();
  const reviewCitations = ({ draft = '', documents = [], message = '', research = {}, override = null } = {}) => {
    const citationRegistry = buildCitationRegistry({ draft, documents, message, research });
    return { registry: citationRegistry, review: evaluateCitationReview(citationRegistry, { override }) };
  };
  const jevTelemetry = createTelemetry();
  const seamTransport = jevTransport !== undefined ? jevTransport : resolveTransport(env);
  const jevEntityFor = (plan, target) => ({ type: 'agentic-step', id: `${plan?.id || 'plan'}:${target?.id || 'step'}` });
  const attachJev = (plan, key, value) => {
    plan.artifacts = { ...(plan.artifacts || {}), jev: { ...(plan.artifacts?.jev || {}), [key]: value } };
  };
  async function maybeTaskRouteAdvisory({ plan, target }) {
    if (!isWorkflowEnabled('task-router', env)) return null;
    if (!jevTransport) return null;
    try {
      return await routeTask({
        taskType: target.id,
        objective: plan.message,
        source: 'agentic-plan',
        legalArea: plan.artifacts?.intent?.area || 'outro',
        entity: jevEntityFor(plan, target),
        transport: seamTransport,
        telemetry: jevTelemetry
      });
    } catch {
      return null;
    }
  }
  async function maybeResearchCheckAdvisory({ plan, items }) {
    if (!isWorkflowEnabled('research-check', env)) return null;
    if (!jevTransport) return null;
    try {
      return await checkResearchEvidence({
        claim: plan.message,
        evidence: items,
        entity: jevEntityFor(plan, { id: 'pesquisa' }),
        transport: seamTransport,
        telemetry: jevTelemetry
      });
    } catch {
      return null;
    }
  }
  async function maybeCitationChecksAdvisory({ plan, entries }) {
    if (!isWorkflowEnabled('research-check', env)) return null;
    if (!jevTransport) return null;
    const pending = (Array.isArray(entries) ? entries : [])
      .filter(entry => ['unverified', 'conflict', 'pending'].includes(entry?.status))
      .slice(0, 3);
    if (pending.length === 0) return [];
    const checks = [];
    for (const entry of pending) {
      try {
        const evidence = (Array.isArray(entry.groundedIn) ? entry.groundedIn : []).map(source => ({
          sourceId: String(source?.ref || source?.id || source?.type || ''),
          citation: String(entry.raw || '').slice(0, 200),
          excerptOrSummary: String(entry.context || entry.note || ''),
          sourceType: String(source?.type || 'fonte')
        }));
        const result = await checkResearchEvidence({
          claim: `${entry.kind || 'referência'} ${entry.raw || ''}`.trim().slice(0, 500),
          evidence,
          entity: jevEntityFor(plan, { id: `citacao-${entry.id || '?'}` }),
          transport: seamTransport,
          telemetry: jevTelemetry
        });
        checks.push({ claimId: entry.id || null, verdict: result.verdict, reason: result.reason, confidence: result.confidence ?? 0 });
      } catch {
        checks.push({ claimId: entry.id || null, verdict: 'verify_more', reason: 'check-error', confidence: 0 });
      }
    }
    return checks;
  }
  async function maybeCompletionGate({ plan, target, objective, completedWork, verification, knownGaps }) {
    if (!isWorkflowEnabled('completion-review', env)) return null;
    if (!jevTransport) return null;
    try {
      return await reviewCompletion({
        objective,
        completedWork,
        verification,
        knownGaps,
        attempts: Number(target.jevReviews) || 0,
        entity: jevEntityFor(plan, target),
        transport: seamTransport,
        telemetry: jevTelemetry
      });
    } catch {
      return null;
    }
  }

  return {
    registry,
    loader,
    provider,
    researchSources,
    eligibility(message, documents = []) {
      return isLegalIntelligenceEligible(message, documents);
    },
    documentsFromContext(selectedContext = {}) {
      return documentsFromSelectedContext(selectedContext);
    },
    jevTelemetry() {
      return jevTelemetry.summary();
    },
    status() {
      return {
        ...registry.status(),
        provider: provider.status(),
        providers: summarizeLegalMcpProviders(researchSources),
        providerIssues,
        multiSource: researchSources.length > 1,
        activationConfidence: LEGAL_INTELLIGENCE_ACTIVATION_CONFIDENCE
      };
    },
    assessDocuments(documents = []) {
      const documentMap = ingestDocuments(documents);
      return {
        documents: documentMap.documents.map(document => ({
          id: document.id,
          name: document.name,
          kind: document.kind || kindFromDocument(document),
          chars: document.chars,
          truncated: document.truncated,
          injections: document.injection.map(finding => ({ code: finding.code, severity: finding.severity }))
        })),
        conflicts: documentMap.conflicts,
        injectionTotal: documentMap.documents.reduce((total, document) => total + document.injection.length, 0)
      };
    },
    scanUnsafeContent(text) {
      return detectPromptInjection(text);
    },
    async prepareChat({ message, documents = [], history = [], office = {}, relevantOfficeContext = '' } = {}) {
      const analysis = await analyzeRequest({ message, documents, registry, provider, providers: researchSources, cache: researchCache });
      if (!analysis.active) return { active: false, analysis };
      const generation = await prepareGeneration({ analysis, loader, office, relevantOfficeContext, history });
      return { active: true, analysis, generation };
    },
    finalize({ analysis, generation, draft, model }) {
      return buildIntelligenceReport({ analysis, generation, draft, model });
    },
    /**
     * Revisão final de citações de uma minuta: constrói o registro por
     * referência e avalia bloqueios/ressalvas, aceitando override explícito
     * com justificativa (a auditoria é responsabilidade do chamador).
     */
    reviewCitations,
    /**
     * Cria um plano agêntico supervisionado sem executar nada: a triagem roda
     * com pesquisa suspensa e a etapa de pesquisa aguarda aprovação humana.
     */
    async createAgenticPlan({ message, documents = [], supervision = true } = {}) {
      const analysis = await analyzeRequest({
        message,
        documents,
        registry,
        provider,
        providers: researchSources,
        cache: researchCache,
        skipResearch: true
      });
      return { analysis, plan: buildAgenticPlan({ analysis, supervision }) };
    },
    /**
     * Executa a próxima etapa executável do plano (ou a etapa indicada).
     * Pesquisa exige aprovação prévia; conferência humana nunca é automatizada.
     */
    async runAgenticStep({ plan, stepId = null, documents = [], office = {}, relevantOfficeContext = '', history = [], callModel } = {}) {
      if (!plan) return { ok: false, reason: 'plan-required' };
      const target = stepId ? (plan.steps || []).find(step => step.id === stepId) : nextRunnableStep(plan);
      if (!target) return { ok: false, reason: 'no-runnable-step', plan };
      if (target.id === 'conferencia-humana') return { ok: false, reason: 'human-step-not-automatable', plan };
      if (target.status === 'pending-approval') return { ok: false, reason: 'approval-required', plan };
      if (!['approved', 'pending'].includes(target.status)) return { ok: false, reason: 'step-not-runnable', status: target.status, plan };
      const jevRouting = await maybeTaskRouteAdvisory({ plan, target });
      if (jevRouting) {
        attachJev(plan, 'taskRouting', {
          route: jevRouting.route,
          risk: jevRouting.risk,
          uncertain: jevRouting.uncertain,
          confidence: jevRouting.confidence,
          fallbackRoute: jevRouting.fallbackRoute,
          at: new Date().toISOString()
        });
        if (jevRouting.halt && !jevRouting.fallbackRoute) {
          target.status = 'pending-approval';
          plan.status = deriveAgenticPlanStatus(plan);
          return { ok: false, reason: 'jev-block-approval-required', plan };
        }
      }
      startAgenticStep(plan, target.id);
      let draft = null;
      let intelligence = null;
      try {
        if (target.id === 'pesquisa') {
          const analysis = await analyzeRequest({
            message: plan.message,
            documents,
            registry,
            provider,
            providers: researchSources,
            cache: researchCache,
            skipResearch: true
          });
          const research = await runResearch({ intent: analysis.intent, message: analysis.message, provider, providers: researchSources, cache: researchCache });
          plan.artifacts = {
            ...(plan.artifacts || {}),
            research,
            intent: { pieceType: analysis.intent.pieceType, area: analysis.intent.area, confidence: analysis.intent.confidence }
          };
          const failed = ['error', 'unavailable'].includes(research.status);
          const jevResearch = await maybeResearchCheckAdvisory({ plan, items: research.items || [] });
          if (jevResearch) {
            attachJev(plan, 'researchCheck', {
              verdict: jevResearch.verdict,
              reason: jevResearch.reason,
              evidenceCount: jevResearch.evidenceCount,
              evidenceSourceIds: jevResearch.evidenceSourceIds,
              confidence: jevResearch.confidence ?? 0,
              at: new Date().toISOString()
            });
          }
          finishAgenticStep(plan, target.id, {
            ok: !failed,
            summary: `${research.sources?.length || 0} fonte(s) · ${research.items?.length || 0} item(ns)`,
            error: failed ? `pesquisa ${research.status}` : null
          });
        } else if (target.id === 'redacao') {
          const analysis = await analyzeRequest({
            message: plan.message,
            documents,
            registry,
            provider,
            providers: researchSources,
            cache: researchCache,
            skipResearch: true,
            researchOverride: plan.artifacts?.research || null
          });
          const generation = await prepareGeneration({ analysis, loader, office, relevantOfficeContext, history });
          const response = await callModel(generation.systemInstruction, generation.contents);
          draft = String(response?.text || response?.reply || '');
          intelligence = buildIntelligenceReport({ analysis, generation, draft, model: response?.model || null });
          plan.artifacts = { ...(plan.artifacts || {}), draft: draft.slice(0, 40000), model: response?.model || null };
          const jevGate = await maybeCompletionGate({
            plan,
            target,
            objective: plan.message,
            completedWork: `minuta com ${draft.length} caractere(s)`,
            verification: `gates ${intelligence.gates.status}`,
            knownGaps: intelligence.gates.status === 'FAIL' ? ['gates FAIL'] : []
          });
          if (jevGate && jevGate.conclusion !== 'complete') {
            target.jevReviews = (Number(target.jevReviews) || 0) + 1;
            const escalate = jevGate.conclusion === 'incomplete' || jevGate.conclusion === 'human_review' || target.jevReviews >= COMPLETION_MAX_CYCLES;
            target.status = escalate ? 'pending-approval' : 'pending';
            attachJev(plan, 'completionReview', {
              conclusion: escalate && jevGate.conclusion === 'verify_more' ? 'human_review' : jevGate.conclusion,
              reason: jevGate.reason,
              attempts: target.jevReviews,
              gaps: jevGate.gaps,
              at: new Date().toISOString()
            });
          } else {
            if (jevGate) {
              attachJev(plan, 'completionReview', {
                conclusion: 'complete',
                reason: jevGate.reason,
                attempts: Number(target.jevReviews) || 0,
                gaps: jevGate.gaps,
                at: new Date().toISOString()
              });
            }
            finishAgenticStep(plan, target.id, { ok: true, summary: `${draft.length} caractere(s) · gates ${intelligence.gates.status}` });
          }
        } else if (target.id === 'revisao-citacoes') {
          const result = reviewCitations({
            draft: plan.artifacts?.draft || '',
            documents,
            message: plan.message,
            research: plan.artifacts?.research || {}
          });
          plan.artifacts = { ...(plan.artifacts || {}), citations: result.registry.entries, review: result.review };
          const jevCitationChecks = await maybeCitationChecksAdvisory({ plan, entries: result.registry.entries });
          if (jevCitationChecks) {
            attachJev(plan, 'citationChecks', jevCitationChecks);
          }
          const blockers = result.review.blockers.length;
          finishAgenticStep(plan, target.id, {
            ok: true,
            summary: blockers ? `${blockers} bloqueio(s) — conferência humana exigida` : 'nenhum bloqueio de citação'
          });
        } else {
          finishAgenticStep(plan, target.id, { ok: false, error: 'etapa não suportada' });
        }
      } catch (error) {
        finishAgenticStep(plan, target.id, { ok: false, error: error?.message || 'falha na etapa' });
      }
      unblockAgenticPlan(plan);
      plan.status = deriveAgenticPlanStatus(plan);
      return { ok: target.status === 'done', step: target, plan, draft, intelligence };
    },
    recoverAgenticPlan,
    summarizeAgenticPlan,
    async runDraft({ message, documents = [], history = [], office = {}, relevantOfficeContext = '', callModel } = {}) {
      return runMinutaPipeline({
        message,
        documents,
        history,
        registry,
        loader,
        provider,
        providers: researchSources,
        cache: researchCache,
        office,
        relevantOfficeContext,
        callModel
      });
    },
    async research({ claim, tools = ['jurisprudencia_buscar', 'jurisprudencia_sumulas'], providers: providerFilter = null } = {}) {
      const providerStatus = provider.status();
      const safeClaim = redactSensitive(String(claim || '')).replace(/\s+/g, ' ').trim().slice(0, 400);
      if (!safeClaim) return { ok: false, degraded: false, reason: 'empty-claim', provider: providerStatus, results: [] };

      // Multi-fonte: fan-out por provedor declarado, com cobertura, dedupe,
      // rerank e cache curto. Com um único provedor, o caminho legado é mantido.
      const selected = researchSources.filter(source => !Array.isArray(providerFilter) || !providerFilter.length || providerFilter.includes(source.id));
      if (selected.length > 1) {
        const cacheKey = researchCacheKey({ claim: safeClaim, tools, providerIds: selected.map(source => source.id) });
        const cached = researchCache.get(cacheKey);
        const result = cached || await runMultiSourceResearch({
          claim: safeClaim,
          queries: [safeClaim],
          sources: selected,
          tools,
          maxResults
        });
        if (!cached) researchCache.set(cacheKey, result);
        return {
          ok: result.status === 'discovery',
          degraded: false,
          provider: { configured: true, multi: true },
          claim: safeClaim,
          status: result.status,
          partial: Boolean(result.partial),
          sources: result.sources,
          items: result.items,
          totals: result.totals,
          verification: result.verification,
          results: result.results || result.sources.map(source => ({ tool: 'multi', ok: source.status === 'ok', error: source.error, provider: source.id, count: source.items }))
        };
      }

      if (!provider.isConfigured()) {
        return { ok: false, degraded: true, reason: 'provider-not-configured', provider: providerStatus, results: [] };
      }
      const allowed = new Set(Object.keys(provider.tools));
      const results = [];
      for (const tool of tools.filter(name => allowed.has(name)).slice(0, 5)) {
        const result = await provider.callTool(tool, { termo: safeClaim, max: providerStatus.maxResults });
        results.push({ tool, ok: Boolean(result.ok), error: result.error?.code || null, result: result.ok ? result.result : null });
      }
      return {
        ok: results.some(item => item.ok),
        degraded: false,
        provider: { configured: true, baseUrl: providerStatus.baseUrl },
        claim: safeClaim,
        verification: 'PENDENTE — confirmar em fonte oficial antes de citar.',
        results
      };
    }
  };
}
