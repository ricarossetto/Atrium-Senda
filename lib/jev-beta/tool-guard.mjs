import { decide } from './decision.mjs';
import { buildDecisionContext } from './context.mjs';

export const TOOL_DECISIONS = Object.freeze(['allow', 'confirm', 'review', 'deny']);

const STRICTNESS = Object.freeze({ allow: 0, confirm: 1, review: 2, deny: 3 });

export function normalizeToolPolicy(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return TOOL_DECISIONS.includes(normalized) ? normalized : 'deny';
}

export function escalateToolPolicy(localPolicy) {
  const local = normalizeToolPolicy(localPolicy);
  if (local === 'allow') return 'confirm';
  if (local === 'confirm' || local === 'review') return 'deny';
  return 'deny';
}

export function intersectPermission(localPolicy, jevDecision) {
  const local = normalizeToolPolicy(localPolicy);
  const jev = TOOL_DECISIONS.includes(String(jevDecision || '')) ? jevDecision : null;
  if (!jev) return local;
  return STRICTNESS[jev] >= STRICTNESS[local] ? jev : local;
}

export async function guardToolCall({
  action = null,
  localPolicy = 'deny',
  entity = null,
  transport = null,
  telemetry = null,
  timeoutMs
} = {}, { decideImpl = decide } = {}) {
  const local = normalizeToolPolicy(localPolicy);
  const summary = action && typeof action === 'object'
    ? { id: String(action.id || '').slice(0, 80), kind: String(action.kind || '').slice(0, 60), summary: String(action.summary || '').slice(0, 500), reversibility: action.reversibility === 'irreversible' ? 'irreversible' : 'reversible' }
    : null;
  if (!summary || !summary.id) {
    return { workflow: 'tool-check', local, jev: null, effective: 'deny', widened: false, reason: 'action-invalid', confidence: 1, action: 'deny', fallbackUsed: false };
  }
  const context = buildDecisionContext({
    taskType: 'tool-check',
    source: 'agent',
    legalArea: 'outro',
    objective: `Avaliar se esta ação consequencial pode prosseguir: ${summary.kind} (${summary.id}). Política local: ${local}.`,
    evidenceSummary: `Resumo: ${summary.summary}. Reversibilidade: ${summary.reversibility}.`,
    stakes: summary.reversibility === 'irreversible' ? 'high' : 'low',
    reversibility: summary.reversibility,
    requiresHumanReview: true
  });
  const out = await decideImpl({ workflow: 'tool-check', schemaId: 'tool_check', context, transport, telemetry, entity, timeoutMs, critical: true });
  if (out.fallbackUsed || out.action === 'abstain' || !out.decision) {
    const effective = escalateToolPolicy(local);
    return { ...out, local, jev: null, effective, widened: false, reason: out.reason || 'Falha de avaliação: política local mais conservadora.' };
  }
  const raw = out.decision?.suggestion?.decision?.label || '';
  const jev = TOOL_DECISIONS.includes(raw) ? raw : null;
  const effective = intersectPermission(local, jev);
  return { ...out, local, jev, effective, widened: false };
}
