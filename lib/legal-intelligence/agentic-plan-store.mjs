/**
 * Persistência pura da fila de planos agênticos por workspace.
 *
 * O servidor mantém o arquivo `agentic-plans.json` (0600, escrita atômica) e
 * este módulo normaliza, limita e indexa os planos. Nada aqui toca disco: as
 * funções recebem e devolvem estruturas serializáveis.
 */

import { deriveAgenticPlanStatus, unblockAgenticPlan } from './agentic-plan.mjs';

export const AGENTIC_PLAN_FILE_VERSION = 1;
export const AGENTIC_PLAN_LIMIT = 50;

const PLAN_ID_RE = /^plan-[a-z0-9-]{6,60}$/;

function cleanText(value, max = 300) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeStep(raw, position) {
  if (!raw || typeof raw !== 'object') return null;
  const id = cleanText(raw.id, 40);
  if (!id) return null;
  return {
    id,
    position: Number.isFinite(Number(raw.position)) ? Number(raw.position) : position,
    label: cleanText(raw.label, 80) || id,
    status: ['done', 'skipped', 'failed', 'running', 'approved', 'pending-approval', 'pending', 'blocked'].includes(raw.status) ? raw.status : 'pending',
    requiresApproval: raw.requiresApproval === true,
    approvedBy: cleanText(raw.approvedBy, 100) || null,
    approvedAt: cleanText(raw.approvedAt, 40) || null,
    startedAt: cleanText(raw.startedAt, 40) || null,
    finishedAt: cleanText(raw.finishedAt, 40) || null,
    summary: cleanText(raw.summary, 300) || null,
    error: cleanText(raw.error, 300) || null
  };
}

function sanitizeResearch(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    status: cleanText(raw.status, 30) || null,
    partial: raw.partial === true,
    queries: (Array.isArray(raw.queries) ? raw.queries : []).slice(0, 4).map(query => cleanText(query, 200)),
    sources: (Array.isArray(raw.sources) ? raw.sources : []).slice(0, 8).map(source => ({
      id: cleanText(source?.id, 40) || null,
      label: cleanText(source?.label, 60) || null,
      status: cleanText(source?.status, 20) || 'unknown',
      calls: Math.max(0, Number(source?.calls) || 0),
      items: Math.max(0, Number(source?.items) || 0),
      error: cleanText(source?.error, 60) || null,
      ...(source?.partial ? { partial: true } : {})
    })),
    items: (Array.isArray(raw.items) ? raw.items : []).slice(0, 40).map(item => ({
      kind: cleanText(item?.kind, 30),
      identifier: cleanText(item?.identifier, 40),
      court: cleanText(item?.court, 12),
      title: cleanText(item?.title, 300),
      summary: cleanText(item?.summary, 600),
      date: cleanText(item?.date, 40) || null,
      url: cleanText(item?.url, 500) || null,
      sourceId: cleanText(item?.sourceId, 40) || null
    })),
    totals: raw.totals && typeof raw.totals === 'object'
      ? {
          items: Math.max(0, Number(raw.totals.items) || 0),
          unique: Math.max(0, Number(raw.totals.unique) || 0),
          duplicates: Math.max(0, Number(raw.totals.duplicates) || 0),
          providers: Math.max(0, Number(raw.totals.providers) || 0),
          calls: Math.max(0, Number(raw.totals.calls) || 0)
        }
      : null,
    verification: cleanText(raw.verification, 300) || null
  };
}

function sanitizeCitations(raw) {
  if (!Array.isArray(raw)) return null;
  return raw.slice(0, 120).map(entry => ({
    id: cleanText(entry?.id, 20) || null,
    kind: cleanText(entry?.kind, 30) || null,
    raw: cleanText(entry?.raw, 120) || null,
    court: cleanText(entry?.court, 12) || null,
    status: cleanText(entry?.status, 20) || 'unverified',
    policy: cleanText(entry?.policy, 20) || 'required',
    note: cleanText(entry?.note, 300) || null
  }));
}

function sanitizeReview(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const blockers = (Array.isArray(raw.blockers) ? raw.blockers : []).slice(0, 30).map(blocker => ({
    id: cleanText(blocker?.id, 20) || null,
    kind: cleanText(blocker?.kind, 30) || null,
    raw: cleanText(blocker?.raw, 120) || null,
    status: cleanText(blocker?.status, 20) || 'unverified',
    message: cleanText(blocker?.message, 300) || null
  }));
  return {
    status: cleanText(raw.status, 20) || null,
    ready: raw.ready === true,
    counts: raw.counts && typeof raw.counts === 'object'
      ? {
          total: Math.max(0, Number(raw.counts.total) || 0),
          verified: Math.max(0, Number(raw.counts.verified) || 0),
          conflict: Math.max(0, Number(raw.counts.conflict) || 0),
          pending: Math.max(0, Number(raw.counts.pending) || 0),
          unverified: Math.max(0, Number(raw.counts.unverified) || 0)
        }
      : null,
    blockers,
    overrideApplied: raw.overrideApplied === true,
    override: raw.override && typeof raw.override === 'object'
      ? {
          justification: cleanText(raw.override.justification, 500) || null,
          actor: cleanText(raw.override.actor, 100) || null,
          at: cleanText(raw.override.at, 40) || null
        }
      : null
  };
}

export function normalizeAgenticPlan(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = cleanText(raw.id, 60);
  if (!PLAN_ID_RE.test(id)) return null;
  const steps = [];
  for (const [index, step] of (Array.isArray(raw.steps) ? raw.steps : []).entries()) {
    const normalized = normalizeStep(step, index);
    if (normalized) steps.push(normalized);
  }
  if (!steps.length) return null;
  const plan = {
    version: AGENTIC_PLAN_FILE_VERSION,
    id,
    status: cleanText(raw.status, 30) || 'in_progress',
    supervision: raw.supervision !== false,
    pieceType: cleanText(raw.pieceType, 60) || null,
    area: cleanText(raw.area, 60) || null,
    message: cleanText(raw.message, 600),
    researchNeeded: raw.researchNeeded === true,
    createdAt: cleanText(raw.createdAt, 40) || null,
    updatedAt: cleanText(raw.updatedAt, 40) || null,
    artifacts: {
      research: sanitizeResearch(raw.artifacts?.research),
      draft: cleanText(raw.artifacts?.draft, 40000) || null,
      model: cleanText(raw.artifacts?.model, 80) || null,
      citations: sanitizeCitations(raw.artifacts?.citations),
      review: sanitizeReview(raw.artifacts?.review)
    },
    steps,
    history: (Array.isArray(raw.history) ? raw.history : []).slice(-100).map(entry => ({
      at: cleanText(entry?.at, 40) || null,
      action: cleanText(entry?.action, 60) || 'evento',
      stepId: cleanText(entry?.stepId, 40) || null,
      actor: cleanText(entry?.actor, 100) || null
    }))
  };
  plan.status = deriveAgenticPlanStatus(unblockAgenticPlan(plan));
  return plan;
}

export function normalizeAgenticPlanFile(raw) {
  const plans = [];
  const seen = new Set();
  for (const entry of Array.isArray(raw?.plans) ? raw.plans : []) {
    const plan = normalizeAgenticPlan(entry);
    if (!plan || seen.has(plan.id)) continue;
    seen.add(plan.id);
    plans.push(plan);
  }
  plans.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  return {
    version: AGENTIC_PLAN_FILE_VERSION,
    updatedAt: cleanText(raw?.updatedAt, 40) || null,
    plans: plans.slice(-AGENTIC_PLAN_LIMIT)
  };
}

export function upsertAgenticPlan(file, plan, { now = new Date().toISOString() } = {}) {
  const base = normalizeAgenticPlanFile(file);
  const normalized = normalizeAgenticPlan(plan);
  if (!normalized) return base;
  const plans = [...base.plans.filter(entry => entry.id !== normalized.id), normalized]
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .slice(-AGENTIC_PLAN_LIMIT);
  return { version: AGENTIC_PLAN_FILE_VERSION, updatedAt: cleanText(normalized.updatedAt, 40) || now, plans };
}

export function findAgenticPlan(file, id) {
  const base = normalizeAgenticPlanFile(file);
  return base.plans.find(plan => plan.id === String(id || '').trim()) || null;
}

export function newAgenticPlanId({ now = Date.now(), random = () => Math.random().toString(36).slice(2, 10) } = {}) {
  const stamp = new Date(now).toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const suffix = String(random()).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
  return `plan-${stamp}-${suffix || 'x'}`;
}
