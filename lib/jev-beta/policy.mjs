import { isJevFlagEnabled, parseJevFlagValue } from './feature-flags.mjs';

export const JEV_WORKFLOW_FLAGS = Object.freeze({
  'task-router': 'JEV_TASK_ROUTER_ENABLED',
  'research-check': 'JEV_RESEARCH_GUARD_ENABLED',
  'completion-review': 'JEV_COMPLETION_REVIEW_ENABLED',
  'tool-check': 'JEV_TOOL_GUARD_ENABLED',
  triage: 'JEV_TRIAGE_ENABLED'
});

export function isWorkflowEnabled(workflow, env = process.env) {
  const flagId = JEV_WORKFLOW_FLAGS[workflow];
  if (!flagId) throw new TypeError(`Workflow JEV desconhecido: ${workflow}`);
  if (!isJevFlagEnabled('BETA_JEV_ENABLED', env)) return false;
  if (env?.[flagId] === undefined || env?.[flagId] === null || String(env[flagId]).trim() === '') {
    return workflow === 'triage';
  }
  return parseJevFlagValue(env[flagId], false);
}

export function isLiveEnabled(env = process.env) {
  return isJevFlagEnabled('BETA_JEV_ENABLED', env) && isJevFlagEnabled('BETA_JEV_LIVE', env);
}

const FAILURE_FALLBACK = Object.freeze({
  timeout: 'transport-timeout',
  unavailable: 'provider-unavailable',
  rate_limited: 'rate-limited',
  invalid_response: 'invalid-response',
  schema_mismatch: 'schema-mismatch',
  low_confidence: 'low-confidence',
  auth_invalid: 'auth-invalid',
  unknown: 'unknown-error'
});

export function resolveFailure({ kind = 'unknown', critical = false } = {}) {
  const fallback = FAILURE_FALLBACK[kind] || FAILURE_FALLBACK.unknown;
  if (critical) {
    return { fallbackUsed: true, fallback, decision: 'deny', action: 'deny', reason: 'Falha de avaliação em ação crítica: política local mais conservadora aplicada. Erro nunca vira permissão.' };
  }
  return { fallbackUsed: true, fallback, decision: 'abstain', action: 'abstain', reason: 'JEV indisponível: funcionalidade principal preservada, nenhuma decisão inventada.' };
}

export function resolveTransport(env = process.env) {
  if (!isJevFlagEnabled('BETA_JEV_ENABLED', env) || !isJevFlagEnabled('BETA_JEV_LIVE', env)) return null;
  const kind = String(env?.JEV_TRANSPORT || '').trim().toLowerCase();
  if (kind === 'headless') {
    return { kind: 'headless', bin: String(env?.JEV_CMD_BIN || 'commandcode').trim() || 'commandcode', model: String(env?.JEV_MODEL || 'typesafe/jev').trim() || 'typesafe/jev' };
  }
  if (kind === 'http') {
    const baseUrl = String(env?.JEV_API_URL || '').trim();
    const apiKey = String(env?.JEV_API_KEY || '').trim();
    const model = String(env?.JEV_MODEL || '').trim();
    if (!baseUrl || !apiKey || !model) return null;
    return { kind: 'http', baseUrl, apiKey, model };
  }
  return null;
}

export function validateModelCandidates(candidates, catalogIds) {
  const catalog = new Set((Array.isArray(catalogIds) ? catalogIds : []).map(id => String(id || '').trim()).filter(Boolean));
  const seen = new Set();
  const valid = [];
  const refused = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const id = String(candidate || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (catalog.has(id)) valid.push(id);
    else refused.push(id);
  }
  return { valid, refused };
}

export function resolveModelRoute() {
  return { route: null, reason: 'model-routing-not-enabled' };
}
