import { decide } from './decision.mjs';
import { buildDecisionContext } from './context.mjs';

export const TASK_ROUTES = Object.freeze(['proceed_fast', 'deep_review', 'split_task', 'block']);

export function isTaskRoute(value) {
  return TASK_ROUTES.includes(String(value || ''));
}

export async function routeTask({
  taskType = '',
  objective = '',
  evidenceSummary = '',
  constraints = [],
  stakes = 'low',
  reversibility = 'reversible',
  legalArea = 'outro',
  source = 'orchestrator',
  metadata = {},
  entity = null,
  transport = null,
  telemetry = null,
  timeoutMs
} = {}, { decideImpl = decide } = {}) {
  const context = buildDecisionContext({ taskType, source, legalArea, objective, evidenceSummary, constraints, stakes, reversibility, metadata });
  const out = await decideImpl({ workflow: 'task-router', schemaId: 'task_routing', context, transport, telemetry, entity, timeoutMs });
  if (out.fallbackUsed || out.action === 'abstain' || !out.decision) {
    return { ...out, route: 'deep_review', risk: 'unknown', uncertain: true, halt: false, fallbackRoute: true, reason: out.reason || 'Sem decisão do roteador: escrutínio ampliado por padrão. Nunca proceed_fast em falha.' };
  }
  const suggestion = out.decision.suggestion || {};
  const rawRoute = suggestion.route?.label || '';
  const route = isTaskRoute(rawRoute) ? rawRoute : 'deep_review';
  const riskEntry = suggestion.risky || null;
  const risk = riskEntry ? { label: riskEntry.label, confidence: riskEntry.confidence } : { label: 'unknown', confidence: 0 };
  return {
    ...out,
    route,
    risk: risk.label,
    riskConfidence: risk.confidence,
    uncertain: out.action !== 'suggest' || !isTaskRoute(rawRoute),
    halt: route === 'block',
    fallbackRoute: false
  };
}
