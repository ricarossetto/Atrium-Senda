/**
 * Planos agênticos supervisionados do Gerador de Minutas.
 *
 * Um plano é uma sequência determinística de etapas com estados explícitos:
 * `analise` (concluída pela triagem), `pesquisa` (egresso externo; exige
 * aprovação humana quando o plano é supervisionado), `redacao` (chamada de
 * modelo), `revisao-citacoes` (grounding) e `conferencia-humana` (sempre
 * pendente). Nada avança sozinho: etapa sensível só executa após aprovação
 * registrada, e a retomada devolve sempre a primeira etapa não terminal.
 *
 * O módulo é puro: não lê disco, rede nem estado oficial.
 */

export const AGENTIC_PLAN_VERSION = 1;
export const AGENTIC_STEP_IDS = Object.freeze(['analise', 'pesquisa', 'redacao', 'revisao-citacoes', 'conferencia-humana']);

const STEP_LABELS = Object.freeze({
  analise: 'Triagem da solicitação',
  pesquisa: 'Pesquisa externa (discovery)',
  redacao: 'Redação supervisionada',
  'revisao-citacoes': 'Revisão de citações',
  'conferencia-humana': 'Conferência humana final'
});

const TERMINAL_STATUSES = new Set(['done', 'skipped', 'failed']);

function cleanText(value, max = 200) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function stepStatusFor(id, { researchNeeded, researchStatus }) {
  if (id === 'analise') return 'done';
  if (id === 'pesquisa') {
    if (!researchNeeded) return 'skipped';
    if (researchStatus === 'not-needed') return 'skipped';
    return 'pending-approval';
  }
  return 'blocked';
}

export function buildAgenticPlan({ analysis = {}, now = new Date().toISOString(), supervision = true } = {}) {
  const researchNeeded = Boolean(analysis?.intent?.needs?.research);
  const researchStatus = analysis?.research?.status || (researchNeeded ? 'pending' : 'not-needed');
  const steps = AGENTIC_STEP_IDS.map((id, position) => ({
    id,
    position,
    label: STEP_LABELS[id],
    status: stepStatusFor(id, { researchNeeded, researchStatus }),
    requiresApproval: id === 'pesquisa' && supervision,
    approvedBy: null,
    approvedAt: null,
    startedAt: id === 'analise' ? now : null,
    finishedAt: id === 'analise' ? now : null,
    summary: id === 'analise'
      ? cleanText(`${analysis?.intent?.pieceType || 'peça não identificada'}${analysis?.intent?.area ? ` · ${analysis.intent.area}` : ''}`, 160)
      : null,
    error: null
  }));
  return {
    version: AGENTIC_PLAN_VERSION,
    id: null,
    status: 'in_progress',
    supervision: supervision !== false,
    pieceType: cleanText(analysis?.intent?.pieceType, 60) || null,
    area: cleanText(analysis?.intent?.area, 60) || null,
    message: cleanText(analysis?.message, 600),
    researchNeeded,
    createdAt: now,
    updatedAt: now,
    steps,
    history: [{ at: now, action: 'plano-criado', stepId: null, actor: null }]
  };
}

function touch(plan, action, stepId, actor, at) {
  plan.updatedAt = at;
  plan.history = [...(plan.history || []), { at, action, stepId: stepId || null, actor: cleanText(actor, 100) || null }].slice(-100);
}

function findStep(plan, stepId) {
  return (plan?.steps || []).find(step => step.id === stepId) || null;
}

export function approveAgenticStep(plan, stepId, { actor = null, at = new Date().toISOString() } = {}) {
  const step = findStep(plan, stepId);
  if (!step) return { ok: false, reason: 'step-not-found' };
  if (step.status !== 'pending-approval') return { ok: false, reason: 'step-not-pending-approval', status: step.status };
  if (!cleanText(actor, 100)) return { ok: false, reason: 'actor-required' };
  step.status = 'approved';
  step.approvedBy = cleanText(actor, 100);
  step.approvedAt = at;
  touch(plan, 'etapa-aprovada', stepId, actor, at);
  return { ok: true, step };
}

export function startAgenticStep(plan, stepId, { at = new Date().toISOString() } = {}) {
  const step = findStep(plan, stepId);
  if (!step) return { ok: false, reason: 'step-not-found' };
  if (!['approved', 'pending'].includes(step.status)) return { ok: false, reason: 'step-not-runnable', status: step.status };
  step.status = 'running';
  step.startedAt = at;
  touch(plan, 'etapa-iniciada', stepId, null, at);
  return { ok: true, step };
}

export function finishAgenticStep(plan, stepId, { ok = true, summary = null, error = null, at = new Date().toISOString() } = {}) {
  const step = findStep(plan, stepId);
  if (!step) return { ok: false, reason: 'step-not-found' };
  step.status = ok ? 'done' : 'failed';
  step.finishedAt = at;
  step.summary = cleanText(summary, 300) || step.summary;
  step.error = ok ? null : cleanText(error, 300) || 'falha não informada';
  touch(plan, ok ? 'etapa-concluida' : 'etapa-falhou', stepId, null, at);
  plan.status = deriveAgenticPlanStatus(plan);
  return { ok: true, step };
}

export function skipAgenticStep(plan, stepId, { reason = '', actor = null, at = new Date().toISOString() } = {}) {
  const step = findStep(plan, stepId);
  if (!step) return { ok: false, reason: 'step-not-found' };
  if (TERMINAL_STATUSES.has(step.status)) return { ok: false, reason: 'step-already-terminal', status: step.status };
  step.status = 'skipped';
  step.finishedAt = at;
  step.summary = cleanText(reason, 300) || 'Etapa dispensada.';
  touch(plan, 'etapa-dispensada', stepId, actor, at);
  plan.status = deriveAgenticPlanStatus(plan);
  return { ok: true, step };
}

export function nextRunnableStep(plan) {
  const steps = plan?.steps || [];
  const running = steps.find(step => step.status === 'running');
  if (running) return running;
  const approved = steps.find(step => step.status === 'approved');
  if (approved) return approved;
  const pendingApproval = steps.find(step => step.status === 'pending-approval');
  if (pendingApproval) return null;
  return steps.find(step => step.status === 'pending') || null;
}

export function unblockAgenticPlan(plan) {
  const steps = plan?.steps || [];
  const byId = new Map(steps.map(step => [step.id, step]));
  const pesquisa = byId.get('pesquisa');
  const redacao = byId.get('redacao');
  const revisao = byId.get('revisao-citacoes');
  const conferencia = byId.get('conferencia-humana');
  if (pesquisa && redacao && TERMINAL_STATUSES.has(pesquisa.status) && redacao.status === 'blocked') redacao.status = 'pending';
  if (redacao && revisao && TERMINAL_STATUSES.has(redacao.status) && revisao.status === 'blocked') revisao.status = 'pending';
  if (revisao && conferencia && TERMINAL_STATUSES.has(revisao.status) && conferencia.status === 'blocked') conferencia.status = 'pending';
  return plan;
}

export function deriveAgenticPlanStatus(plan) {
  const steps = plan?.steps || [];
  if (steps.some(step => step.status === 'failed')) return 'failed';
  if (steps.every(step => TERMINAL_STATUSES.has(step.status))) return 'done';
  if (steps.some(step => step.status === 'running')) return 'running';
  if (steps.some(step => step.status === 'pending-approval')) return 'awaiting-approval';
  const automatable = steps.filter(step => step.id !== 'conferencia-humana');
  const human = steps.find(step => step.id === 'conferencia-humana');
  if (human && automatable.every(step => TERMINAL_STATUSES.has(step.status))) return 'awaiting-human';
  return 'in_progress';
}

export function recoverAgenticPlan(plan, { at = new Date().toISOString() } = {}) {
  const steps = plan?.steps || [];
  for (const step of steps) {
    if (step.status === 'running') {
      step.status = step.requiresApproval && step.approvedAt ? 'approved' : 'pending';
      step.error = null;
      touch(plan, 'retomada', step.id, null, at);
    }
  }
  unblockAgenticPlan(plan);
  plan.status = deriveAgenticPlanStatus(plan);
  return plan;
}

export function summarizeAgenticPlan(plan) {
  const steps = plan?.steps || [];
  return {
    id: plan?.id || null,
    status: deriveAgenticPlanStatus(plan),
    supervision: plan?.supervision !== false,
    pieceType: plan?.pieceType || null,
    steps: steps.map(step => ({
      id: step.id,
      label: step.label,
      status: step.status,
      requiresApproval: Boolean(step.requiresApproval),
      approvedBy: step.approvedBy || null,
      summary: step.summary || null,
      error: step.error || null
    })),
    updatedAt: plan?.updatedAt || null
  };
}
