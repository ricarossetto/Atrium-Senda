import { ownerMatchesUser } from '../office/monitoring-scope.mjs';
/**
 * Fila durável de falhas de captura do DJEN por termo/OAB.
 *
 * O agendador 07h/19h, o botão manual e o retry registram aqui os termos cuja
 * coleta falhou ou veio parcial, para conferência na UI e nova tentativa
 * manual. O arquivo `djen-capture-errors.json` vive no diretório de dados do
 * workspace, fora do estado editável pelo frontend; um termo que volta a
 * coletar com sucesso sai da fila automaticamente na próxima execução que o
 * cobrir. Este módulo é puro: recebe a fila anterior e devolve a fila
 * reconciliada, sem tocar em disco, rede ou estado oficial.
 */

export const DJEN_CAPTURE_ERRORS_VERSION = 1;
export const DJEN_CAPTURE_ERRORS_LIMIT = 100;
export const DJEN_CAPTURE_ERROR_MESSAGE_MAX = 200;

const TRIGGERS = new Set(['manual', 'scheduled', 'startup', 'retry']);

function cleanText(value, max = 160) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function normalizeCaptureErrorMessage(value, max = DJEN_CAPTURE_ERROR_MESSAGE_MAX) {
  return cleanText(value, max);
}

export function emptyDjenCaptureErrorsQueue() {
  return { version: DJEN_CAPTURE_ERRORS_VERSION, updatedAt: null, lastRun: null, terms: [] };
}

/**
 * Identidade estável do termo na fila: o `id` oficial quando existir e, na
 * ausência dele, a inscrição OAB (`oab:UF:numero`) já usada pelo coletor.
 */
export function termKeyForCaptureErrors(term = {}) {
  const id = cleanText(term.id || term.termId, 80);
  if (id) return id;
  const uf = cleanText(term.oabUf || term.uf, 2).toUpperCase();
  const number = cleanText(term.oabNumber || term.num, 20).replace(/\D/g, '');
  if (uf && number) return `oab:${uf}:${number}`;
  return '';
}

export function normalizeCaptureFailure(record = {}) {
  const termId = termKeyForCaptureErrors(record);
  if (!termId) return null;
  return {
    termId,
    oabUf: cleanText(record.oabUf || record.uf, 2).toUpperCase(),
    oabNumber: cleanText(record.oabNumber || record.num, 20).replace(/\D/g, ''),
    name: cleanText(record.name, 120),
    registration: cleanText(record.registration, 60),
    scope: cleanText(record.scope || 'office', 20) === 'private' ? 'private' : 'office',
    message: normalizeCaptureErrorMessage(record.message)
  };
}

export function normalizeDjenCaptureErrorsQueue(raw) {
  if (!raw || typeof raw !== 'object') return emptyDjenCaptureErrorsQueue();
  const seen = new Set();
  const terms = [];
  for (const entry of Array.isArray(raw.terms) ? raw.terms : []) {
    const failure = normalizeCaptureFailure(entry);
    if (!failure || seen.has(failure.termId)) continue;
    seen.add(failure.termId);
    terms.push({
      ...failure,
      attempts: Math.max(1, Math.floor(Number(entry.attempts) || 1)),
      firstFailedAt: cleanText(entry.firstFailedAt, 40) || null,
      lastFailedAt: cleanText(entry.lastFailedAt, 40) || null
    });
  }
  terms.sort((a, b) => String(b.lastFailedAt || '').localeCompare(String(a.lastFailedAt || '')) || a.termId.localeCompare(b.termId));
  const lastRun = raw.lastRun && typeof raw.lastRun === 'object'
    ? {
        at: cleanText(raw.lastRun.at, 40) || null,
        trigger: TRIGGERS.has(raw.lastRun.trigger) ? raw.lastRun.trigger : 'scheduled',
        termCount: Math.max(0, Math.floor(Number(raw.lastRun.termCount) || 0)),
        failedCount: Math.max(0, Math.floor(Number(raw.lastRun.failedCount) || 0))
      }
    : null;
  return {
    version: DJEN_CAPTURE_ERRORS_VERSION,
    updatedAt: cleanText(raw.updatedAt, 40) || null,
    lastRun,
    terms: terms.slice(0, DJEN_CAPTURE_ERRORS_LIMIT)
  };
}

/**
 * Reconcilia a fila com o resultado de uma execução:
 * - termo tentado e bem-sucedido sai da fila (resolvido);
 * - termo tentado e falho entra ou tem `attempts`/`lastFailedAt` atualizados,
 *   preservando `firstFailedAt`;
 * - termo fora do lote tentado permanece intacto (falha antiga ainda pendente);
 * - falha de termo que não pertence ao lote tentado é ignorada.
 */
export function reconcileDjenCaptureErrors(queue, { attemptedTerms = [], failures = [], run = {}, scope = 'office', now = new Date().toISOString() } = {}) {
  const base = normalizeDjenCaptureErrorsQueue(queue);
  const activeScope = cleanText(scope, 20) === 'private' ? 'private' : 'office';
  const attempted = new Set();
  for (const term of Array.isArray(attemptedTerms) ? attemptedTerms : []) {
    const termScope = cleanText(term?.scope || 'office', 20) === 'private' ? 'private' : 'office';
    if (termScope !== activeScope) continue;
    const key = termKeyForCaptureErrors(term);
    if (key) attempted.add(key);
  }
  const failureMap = new Map();
  for (const record of Array.isArray(failures) ? failures : []) {
    const failure = normalizeCaptureFailure(record);
    if (failure && failure.scope === activeScope && !failureMap.has(failure.termId)) failureMap.set(failure.termId, failure);
  }
  const nowIso = cleanText(now, 40) || new Date().toISOString();
  const terms = base.terms.filter(entry => {
    const entryScope = cleanText(entry.scope || 'office', 20) === 'private' ? 'private' : 'office';
    if (entryScope !== activeScope) return true;
    return !attempted.has(entry.termId);
  });
  for (const [termId, failure] of failureMap) {
    if (attempted.size && !attempted.has(termId)) continue;
    const previous = base.terms.find(entry => entry.termId === termId);
    terms.push({
      ...failure,
      attempts: previous ? previous.attempts + 1 : 1,
      firstFailedAt: previous?.firstFailedAt || nowIso,
      lastFailedAt: nowIso
    });
  }
  terms.sort((a, b) => String(b.lastFailedAt || '').localeCompare(String(a.lastFailedAt || '')) || a.termId.localeCompare(b.termId));
  return {
    version: DJEN_CAPTURE_ERRORS_VERSION,
    updatedAt: nowIso,
    lastRun: {
      at: nowIso,
      trigger: TRIGGERS.has(run.trigger) ? run.trigger : 'scheduled',
      termCount: attempted.size,
      failedCount: failureMap.size
    },
    terms: terms.slice(0, DJEN_CAPTURE_ERRORS_LIMIT)
  };
}

function termOwner(term) {
  return String(term?.privateOwnerUserId || term?.ownerUserId || '').trim();
}

function termMatchesEntry(term, entry) {
  const id = String(term?.id || term?.termId || '').trim();
  if (id && id === entry.termId) return true;
  const uf = String(term?.oabUf || term?.uf || '').trim().toUpperCase();
  const number = String(term?.oabNumber || term?.registration || '').replace(/\D/g, '');
  return Boolean(uf && number && uf === entry.oabUf && number === entry.oabNumber);
}

export function filterCaptureErrorsForSession(queue, { session, terms = [] } = {}) {
  const base = normalizeDjenCaptureErrorsQueue(queue);
  const visible = base.terms.filter(entry => {
    if (entry.scope !== 'private') return true;
    const term = (Array.isArray(terms) ? terms : []).find(candidate => termMatchesEntry(candidate, entry));
    const owner = termOwner(term);
    return ownerMatchesUser(owner, session);
  });
  return { ...base, terms: visible };
}

export function summarizeDjenCaptureErrors(queue) {
  const base = normalizeDjenCaptureErrorsQueue(queue);
  return {
    count: base.terms.length,
    updatedAt: base.updatedAt,
    lastRunAt: base.lastRun?.at || null,
    lastRunTrigger: base.lastRun?.trigger || null,
    oldestFailedAt: base.terms.length ? base.terms[base.terms.length - 1].lastFailedAt : null
  };
}
