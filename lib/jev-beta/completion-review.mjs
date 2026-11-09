import { decide } from './decision.mjs';
import { buildDecisionContext } from './context.mjs';

export const COMPLETION_CONCLUSIONS = Object.freeze(['complete', 'verify_more', 'incomplete', 'human_review']);
export const COMPLETION_MAX_CYCLES = 2;

export function normalizeGaps(gaps) {
  return (Array.isArray(gaps) ? gaps : [])
    .map(gap => String(gap || '').trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 10);
}

export async function reviewCompletion({
  objective = '',
  completedWork = '',
  verification = '',
  knownGaps = [],
  attempts = 0,
  maxCycles = COMPLETION_MAX_CYCLES,
  entity = null,
  transport = null,
  telemetry = null,
  timeoutMs
} = {}, { decideImpl = decide } = {}) {
  const gaps = normalizeGaps(knownGaps);
  const safeAttempts = Math.max(0, Number(attempts) || 0);
  const safeMax = Math.max(1, Number(maxCycles) || COMPLETION_MAX_CYCLES);
  if (safeAttempts >= safeMax) {
    return {
      workflow: 'completion-review',
      conclusion: 'human_review',
      forced: true,
      reason: 'cycle-budget-exhausted',
      attempts: safeAttempts,
      maxCycles: safeMax,
      gaps,
      confidence: 1,
      action: 'human_review',
      fallbackUsed: false
    };
  }
  const context = buildDecisionContext({
    taskType: 'completion-review',
    source: 'orchestrator',
    legalArea: 'outro',
    objective: String(objective || '').slice(0, 1000),
    evidenceSummary: `Trabalho concluído: ${String(completedWork || '').slice(0, 1500)}\nVerificação: ${String(verification || '').slice(0, 1000)}\nLacunas conhecidas: ${gaps.length > 0 ? gaps.join('; ') : 'nenhuma declarada'}`,
    requiresHumanReview: true
  });
  const out = await decideImpl({ workflow: 'completion-review', schemaId: 'completion_review', context, transport, telemetry, entity, timeoutMs });
  const base = { attempts: safeAttempts, maxCycles: safeMax, gaps };
  if (out.fallbackUsed || out.action === 'abstain' || !out.decision) {
    return { ...out, conclusion: 'verify_more', reason: out.reason || 'Sem revisão: manter pendente, nunca declarar concluído.', ...base };
  }
  const raw = out.decision?.suggestion?.conclusion?.label || '';
  let conclusion = ['complete', 'verify_more', 'incomplete'].includes(raw) ? raw : 'verify_more';
  let reason = out.reason;
  if (conclusion === 'complete' && gaps.length > 0) {
    conclusion = 'verify_more';
    reason = 'gaps-unresolved';
  }
  return { ...out, conclusion, reason, ...base };
}
