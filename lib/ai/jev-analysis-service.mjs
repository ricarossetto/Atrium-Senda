import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { analyzePendingPublications, prioritizeTasks, analyzeTeamProductivity, identifyProcessRisks, generateActionPlan } from './jev-analyzer.mjs';
import { buildHeadlessPayload, callJev, CMD_PROVIDER_MODEL, JEV_PROVIDER_API_URL } from '../jev-beta/client.mjs';
import { cleanCnj, isValidCnj } from '../../js/core/cnj.js';

export const JEV_ANALYSIS_SCHEMA = 'atrium-operational-analysis/1';
export const JEV_ANALYSIS_KINDS = Object.freeze(['publications', 'tasks', 'productivity', 'risks']);
const TTL = 5000;
const MAX_RESPONSE = 262144;
const MAX_MODEL_RESPONSE = 16384;
const MODEL_TIMEOUT = 8000;
const LABELS = Object.freeze({ publications: 'Conferir publicações pendentes.', tasks: 'Revisar prioridades operacionais das tarefas.', productivity: 'Conferir a carga global registrada.', risks: 'Conferir os riscos operacionais registrados.', abstain: 'Dados insuficientes para uma recomendação adicional.' });
const QUESTIONS = Object.freeze({ focus: { type: 'choice', instructions: 'Selecione um foco de revisão humana com base apenas nas contagens globais observadas. Valores null estão suprimidos e não significam zero. Não inferir prazo, capacidade individual ou ato jurídico. Sem evidência suficiente, abstenha-se.', criteria: { publications: 'Revisão de publicações pendentes.', tasks: 'Revisão de tarefas abertas.', productivity: 'Revisão da carga global.', risks: 'Revisão de riscos operacionais.', abstain: 'Evidência insuficiente.' } } });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' ? value.trim() : '';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function analysisError(statusCode, code, message) { return Object.assign(new Error(message), { statusCode, code }); }

export function normalizeAnalysisFilters(input = {}) {
  const windowDays = input.windowDays === undefined ? 90 : typeof input.windowDays === 'string' && /^\d{1,2}$/.test(input.windowDays) ? Number(input.windowDays) : input.windowDays;
  const limit = input.limit === undefined ? 50 : typeof input.limit === 'string' && /^\d{1,3}$/.test(input.limit) ? Number(input.limit) : input.limit;
  const timeZone = input.timeZone === undefined ? 'America/Sao_Paulo' : input.timeZone;
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 90 || !Number.isInteger(limit) || limit < 1 || limit > 100 || !['America/Sao_Paulo', 'UTC'].includes(timeZone)) throw analysisError(400, 'INVALID_FILTERS', 'Janela de 1 a 90 dias, limite de 1 a 100 e fuso permitido são obrigatórios.');
  return { windowDays, timeZone, limit };
}

function snapshot(envelope) {
  if (!object(envelope?.state) || typeof envelope.revision !== 'string' || !envelope.revision || envelope.revision.length > 128) throw analysisError(503, 'STATE_UNAVAILABLE', 'Estado oficial indisponível para análise.');
  return envelope;
}

function bounded(value, depth = 0) {
  if (depth > 10) return null;
  if (typeof value === 'string') return value.slice(0, 512);
  if (Array.isArray(value)) return value.slice(0, 100).map(item => bounded(item, depth + 1));
  if (object(value)) return Object.fromEntries(Object.entries(value).filter(([key]) => !['coverage', 'provenance'].includes(key)).map(([key, item]) => [key, bounded(item, depth + 1)]));
  return value;
}

function coverageOf(coverage = {}) {
  return { status: coverage.status || 'insufficient_data', issueCount: coverage.issues?.length || 0, excludedCount: coverage.excluded?.length || 0, outsideWindow: coverage.outsideWindow || 0, durationDenominator: coverage.durationDenominator ?? null, deadlineDenominator: coverage.deadlineDenominator ?? null };
}

function compute(kind, state, options) {
  if (kind === 'publications') return analyzePendingPublications(state, options);
  if (kind === 'tasks') return prioritizeTasks(state, options);
  if (kind === 'productivity') return analyzeTeamProductivity(state, options);
  return identifyProcessRisks(state, options);
}

function project(kind, analysis, offset, limit) {
  let scalar;
  let lists;
  let coverage;
  if (kind === 'publications') {
    scalar = { pendingCount: analysis.pendingCount };
    lists = { details: analysis.details };
    coverage = analysis.coverage;
  } else if (kind === 'tasks') {
    scalar = { pendingCount: analysis.length, overdueCount: analysis.filter(row => row.overdue === true).length };
    lists = { details: analysis };
    coverage = analysis[0]?.coverage;
  } else if (kind === 'productivity') {
    scalar = { totals: analysis.totals, rates: analysis.rates, range: analysis.range, assignmentCoverage: analysis.assignmentCoverage };
    lists = Object.fromEntries(['rows', 'completions', 'byType', 'factors', 'workload', 'assignmentSuggestions'].map(key => [key, analysis[key]]));
    coverage = analysis.coverage;
  } else if (kind === 'risks') {
    scalar = {};
    lists = { risks: analysis.risks, processes: analysis.processes, unresolvedReferences: analysis.unresolvedReferences };
    coverage = analysis.coverage;
  } else {
    scalar = { automaticActions: [], summary: analysis.summary };
    lists = { suggestions: analysis.suggestions, missingReferences: analysis.missingReferences };
    coverage = analysis.coverage;
  }
  const totals = Object.fromEntries(Object.entries(lists).map(([key, rows]) => [key, rows.length]));
  return { data: { ...bounded(scalar), ...Object.fromEntries(Object.entries(lists).map(([key, rows]) => [key, rows.slice(offset, offset + limit).map(row => bounded(row))])) }, coverage: coverageOf(coverage), totals, total: Math.max(0, ...Object.values(totals)) };
}

function restricted(record) {
  const publicValues = new Set([false, 0, 'false', '0', 'nao', 'não', 'public', 'publico', 'público', '']);
  for (const key of ['secrecy', 'restricted', 'segredoJustica', 'isSecret', 'confidential', 'sealed', 'isSealed', 'sigiloso', 'secrecyLevel', 'nivelSigilo']) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    if (!publicValues.has(typeof value === 'string' ? value.trim().toLowerCase() : value)) return true;
  }
  return Array.isArray(record.tags) && record.tags.some(tag => ['segredo-de-justica', 'sigilo', 'sigiloso', 'restricted'].includes(text(tag).toLowerCase()));
}

export function minimizeAnalysisEgress(state, options) {
  const nodes = [];
  const indexes = {};
  for (const collection of ['processes', 'intimations', 'tasks']) {
    indexes[collection] = new Map();
    for (const record of Array.isArray(state[collection]) ? state[collection] : []) {
      const node = { collection, record, edges: new Set(), blocked: !object(record) || !text(record.id) || restricted(record) };
      nodes.push(node);
      const keys = object(record) ? [text(record.id), ...(collection === 'intimations' ? [text(record.externalId)] : [])] : [];
      for (const key of new Set(keys.filter(Boolean))) indexes[collection].set(key, [...(indexes[collection].get(key) || []), node]);
    }
  }
  const numbers = new Map();
  for (const node of nodes.filter(node => node.collection === 'processes')) {
    const number = node.record?.number;
    if (isValidCnj(number)) numbers.set(cleanCnj(number), [...(numbers.get(cleanCnj(number)) || []), node]);
  }
  for (const index of [...Object.values(indexes), numbers]) for (const matches of index.values()) if (matches.length > 1) for (const node of matches) node.blocked = true;
  const connect = (node, matches) => {
    if (!matches || matches.length !== 1) node.blocked = true;
    for (const target of matches || []) { node.edges.add(target); target.edges.add(node); }
  };
  for (const node of nodes) {
    if (!object(node.record)) continue;
    const record = node.record;
    if (node.collection !== 'processes') {
      if (record.processId) connect(node, indexes.processes.get(text(record.processId)));
      for (const field of ['process', 'processNumber', 'number']) if (record[field]) connect(node, isValidCnj(record[field]) ? numbers.get(cleanCnj(record[field])) : null);
    }
    if (node.collection === 'tasks') {
      if (record.absorbedInto) connect(node, indexes.tasks.get(text(record.absorbedInto)));
      for (const field of ['intimationId', 'sourceIntimationId', 'publicationId']) if (record[field]) connect(node, indexes.intimations.get(text(record[field])));
    }
    if (node.collection === 'intimations') {
      if (record.mergedInto) connect(node, indexes.intimations.get(text(record.mergedInto)));
      for (const id of [record.taskId, ...(Array.isArray(record.linkedTaskIds) ? record.linkedTaskIds : [])].filter(Boolean)) connect(node, indexes.tasks.get(text(id)));
    }
  }
  for (const node of nodes) {
    const processes = [...node.edges].filter(target => target.collection === 'processes');
    const publications = [...node.edges].filter(target => target.collection === 'intimations');
    if (node.collection !== 'processes' && processes.length > 1 || node.collection === 'tasks' && publications.length > 1) node.blocked = true;
  }
  const pending = nodes.filter(node => node.blocked);
  for (let index = 0; index < pending.length; index += 1) for (const target of pending[index].edges) if (!target.blocked) { target.blocked = true; pending.push(target); }
  const safe = { tasks: [], intimations: [], processes: [], configuration: { users: [] } };
  for (const node of nodes) if (!node.blocked) safe[node.collection].push(node.record);
  const publications = analyzePendingPublications(safe, options);
  const tasks = prioritizeTasks(safe, options);
  const productivity = analyzeTeamProductivity(safe, options);
  const risks = identifyProcessRisks(safe, options);
  const counts = { pendingPublications: publications.pendingCount, openTasks: tasks.length, overdueTasks: tasks.filter(row => row.overdue === true).length, completedTasks: productivity.totals.completed, operationalRisks: risks.risks.length };
  const aggregates = Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Number.isSafeInteger(value) && value >= 5 ? value : null]));
  return { aggregates, coverage: { includedCount: nodes.length - pending.length, excludedCount: pending.length, minimumCellSize: 5, suppressedCount: Object.values(aggregates).filter(value => value === null).length } };
}

export function createNativeJevAnalysisAdapter({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  return async ({ aggregates, signal }) => {
    const apiKey = String(env.JEV_API_KEY || env.CMD_API_KEY || '').trim();
    if (!apiKey) return null;
    const { stdin } = buildHeadlessPayload({ model: CMD_PROVIDER_MODEL, state: JSON.stringify(aggregates), questions: QUESTIONS });
    const request = { mode: 'provider-api', url: JEV_PROVIDER_API_URL, headers: { 'Content-Type': 'application/json' }, body: JSON.parse(stdin) };
    const boundedFetch = async (url, init) => {
      const response = await fetchImpl(url, { ...init, signal: AbortSignal.any([init.signal, signal]) });
      let size = 0;
      const chunks = [];
      if (!response.body) throw analysisError(502, 'INVALID_MODEL_RESPONSE', 'Resposta de decisão inválida.');
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > MAX_MODEL_RESPONSE) throw analysisError(502, 'INVALID_MODEL_RESPONSE', 'Resposta de decisão excede o limite.');
        chunks.push(Buffer.from(chunk));
      }
      return { ok: response.ok, status: response.status, json: async () => JSON.parse(Buffer.concat(chunks).toString('utf8')) };
    };
    const payload = await callJev({ request, apiKey, fetchImpl: boundedFetch, timeoutMs: MODEL_TIMEOUT });
    if (!object(payload?.answers)) throw analysisError(502, 'INVALID_MODEL_RESPONSE', 'Resposta de decisão inválida.');
    return payload;
  };
}

function decisionOf(payload) {
  const entry = payload?.answers?.focus;
  if (!object(entry) || Object.keys(payload.answers).length !== 1 || Object.keys(entry).some(key => !['type', 'choice', 'confidence', 'probabilities'].includes(key)) || entry.type !== undefined && entry.type !== 'choice' || !Object.hasOwn(LABELS, entry.choice) || typeof entry.choice !== 'string') return null;
  if (entry.confidence !== undefined && (typeof entry.confidence !== 'number' || !Number.isFinite(entry.confidence) || entry.confidence < 0 || entry.confidence > 1)) return null;
  if (entry.probabilities !== undefined && (!object(entry.probabilities) || Object.entries(entry.probabilities).some(([key, value]) => !Object.hasOwn(LABELS, key) || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1))) return null;
  if (entry.confidence === undefined && !object(entry.probabilities)) return null;
  return { decision: entry.choice, label: LABELS[entry.choice], confidence: null };
}

export function createJevAnalysisService({ clock = () => new Date(), resolveDecision = createNativeJevAnalysisAdapter(), timeoutMs = MODEL_TIMEOUT, cacheLimit = 64, inflightLimit = 8 } = {}) {
  const cache = new Map();
  const plans = new Map();
  const modelInflight = new Map();
  const budgets = new Map();
  const cursorSecret = randomBytes(32);
  const now = () => {
    const date = new Date(clock());
    if (!Number.isFinite(date.getTime())) throw analysisError(503, 'CLOCK_UNAVAILABLE', 'Relógio do servidor indisponível.');
    return date.getTime();
  };
  const sign = value => createHmac('sha256', cursorSecret).update(value).digest('base64url');
  const binding = (workspaceId, envelope, kind, filters) => hash([workspaceId, envelope.revision, envelope.state.schemaVersion, JEV_ANALYSIS_SCHEMA, kind, filters]);
  const cursor = (bind, at, offset) => {
    const payload = Buffer.from(JSON.stringify({ bind, at, offset })).toString('base64url');
    return `${payload}.${sign(payload)}`;
  };
  const location = (token, bind, instant) => {
    if (!token) return { at: instant, offset: 0 };
    if (typeof token !== 'string' || token.length > 500) throw analysisError(400, 'INVALID_CURSOR', 'Cursor inválido.');
    const [payload, signature, extra] = token.split('.');
    const expected = sign(payload || '');
    if (extra || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw analysisError(400, 'INVALID_CURSOR', 'Cursor inválido.');
    let parsed;
    try { parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw analysisError(400, 'INVALID_CURSOR', 'Cursor inválido.'); }
    if (parsed.bind !== bind) throw analysisError(409, 'STALE_ANALYSIS', 'A revisão ou os filtros mudaram; recarregue a análise.');
    if (!Number.isSafeInteger(parsed.offset) || parsed.offset < 0 || !Number.isSafeInteger(parsed.at) || parsed.at > instant || instant - parsed.at >= TTL) throw analysisError(409, 'STALE_ANALYSIS', 'Análise expirada; recarregue a primeira página.');
    return parsed;
  };
  const envelopeOf = (workspaceId, envelope, kind, filters, at, offset, analysis) => {
    const page = project(kind, analysis, offset, filters.limit);
    const result = { ok: true, kind, sourceRevision: envelope.revision, evaluatedAt: new Date(at).toISOString(), schema: JEV_ANALYSIS_SCHEMA, engine: 'backend_local_deterministic', mode: 'local', externalModelUsed: false, requiresHumanReview: true, training: false, confidence: null, filters, data: page.data, coverage: page.coverage, pagination: { limit: filters.limit, offset, total: page.total, totals: page.totals, nextCursor: offset + filters.limit < page.total ? cursor(binding(workspaceId, envelope, kind, filters), at, offset + filters.limit) : null } };
    if (Buffer.byteLength(JSON.stringify(result)) > MAX_RESPONSE) throw analysisError(503, 'ANALYSIS_TOO_LARGE', 'A página excede o limite; reduza o tamanho da página.');
    return result;
  };
  const analyze = ({ workspaceId, envelope, kind, filters: input = {}, cursor: token }) => {
    snapshot(envelope);
    if (!text(workspaceId)) throw analysisError(403, 'WORKSPACE_REQUIRED', 'Escritório autenticado obrigatório.');
    if (!JEV_ANALYSIS_KINDS.includes(kind)) throw analysisError(404, 'ANALYSIS_NOT_FOUND', 'Análise não encontrada.');
    const filters = normalizeAnalysisFilters(input);
    const instant = now();
    for (const [key, entry] of cache) if (entry.expires <= instant) cache.delete(key);
    const bind = binding(workspaceId, envelope, kind, filters);
    const { at, offset } = location(token, bind, instant);
    const key = hash([bind, at, offset]);
    if (cache.has(key)) return structuredClone(cache.get(key).result);
    const analysis = compute(kind, envelope.state, { ...filters, evaluatedAt: new Date(at).toISOString() });
    const result = envelopeOf(workspaceId, envelope, kind, filters, at, offset, analysis);
    while (cache.size >= cacheLimit && cache.size) cache.delete(cache.keys().next().value);
    if (cacheLimit > 0) cache.set(key, { expires: at + TTL, result: structuredClone(result) });
    return result;
  };
  const advisory = async (workspaceId, envelope, filters, options, signal) => {
    const minimized = minimizeAnalysisEgress(envelope.state, options);
    const base = { status: 'suppressed', decision: null, confidence: null, coverage: minimized.coverage };
    if (Object.values(minimized.aggregates).every(value => value === null)) return base;
    const key = hash([workspaceId, envelope.revision, JEV_ANALYSIS_SCHEMA, filters, options.evaluatedAt]);
    if (modelInflight.has(key)) return modelInflight.get(key);
    const instant = now();
    for (const [id, budget] of budgets) if (budget.reset <= instant) budgets.delete(id);
    const budget = budgets.get(workspaceId) || { reset: instant + 60000, count: 0 };
    if (budget.count >= 3 || modelInflight.size >= inflightLimit || !budgets.has(workspaceId) && budgets.size >= 256) return { ...base, status: 'rate_limited' };
    budget.count += 1;
    budgets.set(workspaceId, budget);
    const operation = (async () => {
      const controller = new AbortController();
      let timer;
      let rejectCancellation;
      const cancellation = new Promise((_, reject) => { rejectCancellation = reject; });
      const cancelled = () => { controller.abort(); rejectCancellation(analysisError(499, 'CANCELLED', 'Análise cancelada.')); };
      signal?.addEventListener('abort', cancelled, { once: true });
      try {
        if (signal?.aborted) return { ...base, status: 'cancelled' };
        const payload = await Promise.race([
          cancellation,
          Promise.resolve().then(() => resolveDecision({ aggregates: minimized.aggregates, signal: controller.signal })),
          new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(analysisError(504, 'TIMEOUT', 'Tempo de decisão esgotado.')); }, Math.min(MODEL_TIMEOUT, Math.max(1, timeoutMs))); })
        ]);
        if (controller.signal.aborted) return { ...base, status: 'cancelled' };
        if (payload === null) return { ...base, status: 'unavailable' };
        const decision = decisionOf(payload);
        return decision ? { ...base, ...decision, status: decision.decision === 'abstain' ? 'abstained' : 'completed' } : { ...base, status: 'invalid_response' };
      } catch (error) {
        return { ...base, status: error?.code === 'TIMEOUT' ? 'timeout' : controller.signal.aborted ? 'cancelled' : 'unavailable' };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancelled);
      }
    })();
    modelInflight.set(key, operation);
    try { return await operation; } finally { modelInflight.delete(key); }
  };
  const actionPlan = async ({ workspaceId, envelope, filters: input = {}, advisory: requested = false, actor, signal, audit }) => {
    snapshot(envelope);
    if (!text(workspaceId)) throw analysisError(403, 'WORKSPACE_REQUIRED', 'Escritório autenticado obrigatório.');
    const filters = normalizeAnalysisFilters(input);
    const key = hash([workspaceId, envelope.revision, filters, requested, actor, JEV_ANALYSIS_SCHEMA]);
    if (plans.has(key)) return structuredClone(await plans.get(key));
    if (plans.size >= inflightLimit) throw analysisError(429, 'ANALYSIS_BUSY', 'Há análises em andamento; tente novamente.');
    const operation = (async () => {
      const at = now();
      const options = { ...filters, evaluatedAt: new Date(at).toISOString() };
      const publications = analyzePendingPublications(envelope.state, options);
      const tasks = prioritizeTasks(envelope.state, options);
      const productivity = analyzeTeamProductivity(envelope.state, options);
      const processRisks = identifyProcessRisks(envelope.state, options);
      const plan = generateActionPlan(envelope.state, { publications, tasks, processRisks, productivity }, options);
      plan.summary = { publications: publications.pendingCount, tasks: tasks.length, productivity: productivity.totals, risks: processRisks.risks.length };
      const result = envelopeOf(workspaceId, envelope, 'action-plan', filters, at, 0, plan);
      const started = await audit({ phase: 'requested', sourceRevision: envelope.revision, expectedRevision: envelope.revision, advisory: requested, status: 'requested' });
      const extra = requested ? await advisory(workspaceId, envelope, filters, options, signal) : { status: 'not_requested', decision: null, confidence: null };
      const finished = await audit({ phase: 'completed', sourceRevision: envelope.revision, advisory: requested, status: extra.status });
      result.pagination.nextCursor = null;
      result.pagination.truncated = result.pagination.total > filters.limit;
      return { ...result, revision: finished.revision, refreshCanonicalState: true, sourceChangedDuringAnalysis: finished.previousRevision !== started.revision, advisory: extra, externalModelUsed: ['completed', 'abstained', 'invalid_response'].includes(extra.status), engine: ['completed', 'abstained'].includes(extra.status) ? 'backend_local_deterministic+jev_provider_api' : result.engine, mode: ['completed', 'abstained'].includes(extra.status) ? 'advisory' : 'local' };
    })();
    plans.set(key, operation);
    try { return structuredClone(await operation); } finally { plans.delete(key); }
  };
  return { analyze, actionPlan };
}
