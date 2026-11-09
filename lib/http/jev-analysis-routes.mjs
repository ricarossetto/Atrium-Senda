import { randomBytes } from 'node:crypto';
import { analysisError, normalizeAnalysisFilters } from '../ai/jev-analysis-service.mjs';

const FILTER_KEYS = ['windowDays', 'timeZone', 'limit'];
const BODY_KEYS = [...FILTER_KEYS, 'expectedRevision', 'advisory'];
const STATUSES = new Set(['not_requested', 'suppressed', 'unavailable', 'rate_limited', 'cancelled', 'completed', 'abstained', 'invalid_response', 'timeout']);

function queryOf(url, allowed) {
  if (url.search.length > 1000) throw analysisError(400, 'INVALID_INPUT', 'Parâmetros inválidos.');
  const result = {};
  for (const [key, value] of url.searchParams) {
    if (!allowed.includes(key) || Object.hasOwn(result, key) || value.length > 500) throw analysisError(400, 'INVALID_INPUT', 'Parâmetro desconhecido, repetido ou excessivo.');
    result[key] = value;
  }
  return result;
}

function bodyOf(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !BODY_KEYS.includes(key))) throw analysisError(400, 'INVALID_INPUT', 'Corpo de análise inválido.');
  if (typeof body.expectedRevision !== 'string' || !body.expectedRevision || body.expectedRevision.length > 128 || body.advisory !== undefined && typeof body.advisory !== 'boolean') throw analysisError(400, 'INVALID_INPUT', 'Informe revisão oficial e opção de análise válida.');
  return body;
}

export function createJevAnalysisHttpHandler({ service, assertAdmin, readJson, json, readAppStateEnvelope, saveAppStateDirectUnlocked, enqueueAppStateMutation, clock = () => new Date() }) {
  return async function handleJevAnalysisRequest(req, res, url) {
    const match = url.pathname.match(/^\/api\/jev\/analysis\/(publications|tasks|productivity|risks)$/);
    const isPlan = url.pathname === '/api/jev/action-plan';
    if (!match && !isPlan) return false;
    const session = assertAdmin(req, req.method === 'POST', 'Apenas administradores podem consultar as análises operacionais.');
    if (!session?.workspaceId) throw analysisError(403, 'WORKSPACE_REQUIRED', 'Escritório autenticado obrigatório.');
    res.setHeader('Cache-Control', 'private, no-store');
    if (match && req.method === 'GET') {
      const params = queryOf(url, [...FILTER_KEYS, 'cursor']);
      const envelope = await readAppStateEnvelope();
      const result = service.analyze({ workspaceId: session.workspaceId, envelope, kind: match[1], filters: normalizeAnalysisFilters(params), cursor: params.cursor });
      json(res, 200, result);
      return true;
    }
    if (!isPlan || req.method !== 'POST') {
      res.setHeader('Allow', isPlan ? 'POST' : 'GET');
      throw analysisError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.');
    }
    queryOf(url, []);
    const body = bodyOf(await readJson(req, 500));
    const filters = normalizeAnalysisFilters(body);
    const envelope = await readAppStateEnvelope();
    if (envelope.revision !== body.expectedRevision) throw analysisError(409, 'STALE_ANALYSIS', 'Os dados mudaram; recarregue o estado oficial antes de analisar.');
    const actor = session.username || session.userId || 'Usuário autenticado';
    const audit = async metadata => enqueueAppStateMutation(async () => {
      const current = await readAppStateEnvelope();
      if (!current?.state || !current.revision) throw analysisError(503, 'STATE_UNAVAILABLE', 'Estado oficial indisponível para auditoria.');
      if (metadata.expectedRevision !== undefined && current.revision !== metadata.expectedRevision) throw analysisError(409, 'STALE_ANALYSIS', 'Os dados mudaram; recarregue o estado oficial antes de analisar.');
      const status = metadata.phase === 'requested' ? 'requested' : STATUSES.has(metadata.status) ? metadata.status : 'unavailable';
      const state = structuredClone(current.state);
      state.audit = [{ id: `aud-${randomBytes(12).toString('hex')}`, at: new Date(clock()).toISOString(), action: metadata.phase === 'requested' ? 'Análise operacional solicitada' : 'Análise operacional concluída', actor, detail: JSON.stringify({ schema: 'atrium-operational-analysis/1', phase: metadata.phase === 'requested' ? 'requested' : 'completed', status, advisory: body.advisory === true, windowDays: filters.windowDays, timeZone: filters.timeZone, sourceRevision: envelope.revision }) }, ...(Array.isArray(state.audit) ? state.audit : [])].slice(0, 1000);
      let saved;
      try { saved = await saveAppStateDirectUnlocked(state, current.revision); }
      catch (error) { throw analysisError(error?.statusCode === 409 ? 409 : error?.statusCode === 423 ? 423 : 503, 'AUDIT_NOT_CONFIRMED', 'A persistência da auditoria não foi confirmada.'); }
      if (!saved?.revision || saved.revision === current.revision) throw analysisError(503, 'AUDIT_NOT_CONFIRMED', 'A persistência da auditoria não foi confirmada.');
      return { revision: saved.revision, previousRevision: current.revision };
    });
    const controller = new AbortController();
    const aborted = () => controller.abort();
    const closed = () => { if (!res.writableEnded) controller.abort(); };
    req.once('aborted', aborted);
    res.once('close', closed);
    try {
      const result = await service.actionPlan({ workspaceId: session.workspaceId, envelope, filters, advisory: body.advisory === true, actor, signal: controller.signal, audit });
      if (!controller.signal.aborted) json(res, 200, result);
      return true;
    } finally {
      req.removeListener('aborted', aborted);
      res.removeListener('close', closed);
    }
  };
}
