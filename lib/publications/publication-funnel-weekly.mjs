/**
 * Snapshot semanal do funil de publicações.
 *
 * Cada execução de sincronização registra (ou atualiza) a semana ISO corrente
 * com quatro leituras independentes do acervo oficial:
 * - `received`: publicações com data de publicação/divulgação na semana (coorte
 *   pela data da fonte, estável entre execuções);
 * - `treated` / `discarded`: publicações cujo tratamento/descarte ocorreu na
 *   semana, pelo fuso America/Sao_Paulo;
 * - `pending`: estoque atual de `untreated` + `in_review` no instante do snapshot.
 *
 * As semanas passadas ficam congeladas na última gravação; a semana corrente é
 * atualizada a cada execução. Registros fundidos (`mergedInto`) não contam. Este
 * módulo é puro: não lê disco, rede nem estado oficial.
 */

export const PUBLICATION_FUNNEL_HISTORY_LIMIT = 12;

const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_WEEK_RE = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/;

export function saoPauloDateOnly(instant) {
  const parsed = Date.parse(String(instant || ''));
  if (!Number.isFinite(parsed)) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(parsed));
}

function utcDate(dateOnly) {
  if (!DATE_ONLY_RE.test(String(dateOnly || ''))) return null;
  const [year, month, day] = dateOnly.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(date.getTime()) ? date : null;
}

export function isoWeekOf(dateOnly) {
  const date = utcDate(dateOnly);
  if (!date) return null;
  const day = date.getUTCDay() || 7;
  const thursday = new Date(date);
  thursday.setUTCDate(date.getUTCDate() + 4 - day);
  const isoYear = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNumber = Math.ceil((((thursday - yearStart) / 86_400_000) + 1) / 7);
  return { week: `${isoYear}-W${String(weekNumber).padStart(2, '0')}`, isoYear, weekNumber };
}

export function isoWeekRange(dateOnly) {
  const date = utcDate(dateOnly);
  if (!date) return null;
  const day = date.getUTCDay() || 7;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - (day - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { weekStart: monday.toISOString().slice(0, 10), weekEnd: sunday.toISOString().slice(0, 10) };
}

function countWeek(value, weekStart, weekEnd) {
  const dateOnly = saoPauloDateOnly(value);
  return Boolean(dateOnly) && dateOnly >= weekStart && dateOnly <= weekEnd;
}

export function computePublicationFunnelSnapshot({ intimations = [], now = new Date().toISOString() } = {}) {
  const today = saoPauloDateOnly(now);
  const isoWeek = isoWeekOf(today);
  const range = isoWeekRange(today);
  const snapshot = {
    week: isoWeek?.week || '',
    weekStart: range?.weekStart || '',
    weekEnd: range?.weekEnd || '',
    received: 0,
    treated: 0,
    discarded: 0,
    pending: 0,
    at: new Date(now).toISOString()
  };
  if (!snapshot.week || !snapshot.weekStart) return snapshot;
  for (const item of Array.isArray(intimations) ? intimations : []) {
    if (!item || typeof item !== 'object' || item.mergedInto) continue;
    const status = String(item.treatmentStatus || 'untreated');
    if (status === 'untreated' || status === 'in_review') snapshot.pending += 1;
    const publishedDate = String(item.publishedAt || item.disponibilizadoEm || '').slice(0, 10);
    if (DATE_ONLY_RE.test(publishedDate) && publishedDate >= snapshot.weekStart && publishedDate <= snapshot.weekEnd) {
      snapshot.received += 1;
    }
    if (status === 'treated' && countWeek(item.treatedAt, snapshot.weekStart, snapshot.weekEnd)) snapshot.treated += 1;
    if (status === 'discarded' && countWeek(item.discardedAt, snapshot.weekStart, snapshot.weekEnd)) snapshot.discarded += 1;
  }
  return snapshot;
}

function normalizeCount(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

export function normalizePublicationFunnelSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const week = String(raw.week || '').trim();
  if (!ISO_WEEK_RE.test(week)) return null;
  const weekStart = DATE_ONLY_RE.test(String(raw.weekStart || '')) ? String(raw.weekStart) : '';
  const weekEnd = DATE_ONLY_RE.test(String(raw.weekEnd || '')) ? String(raw.weekEnd) : '';
  return {
    week,
    weekStart,
    weekEnd,
    received: normalizeCount(raw.received),
    treated: normalizeCount(raw.treated),
    discarded: normalizeCount(raw.discarded),
    pending: normalizeCount(raw.pending),
    at: String(raw.at || '').slice(0, 40) || null
  };
}

export function normalizePublicationFunnelHistory(raw) {
  const weeks = [];
  const seen = new Set();
  for (const entry of Array.isArray(raw?.weeks) ? raw.weeks : []) {
    const snapshot = normalizePublicationFunnelSnapshot(entry);
    if (!snapshot || seen.has(snapshot.week)) continue;
    seen.add(snapshot.week);
    weeks.push(snapshot);
  }
  weeks.sort((a, b) => a.week.localeCompare(b.week));
  return {
    version: 1,
    updatedAt: String(raw?.updatedAt || '').slice(0, 40) || null,
    weeks: weeks.slice(-PUBLICATION_FUNNEL_HISTORY_LIMIT)
  };
}

export function upsertPublicationFunnelSnapshot(history, snapshot) {
  const base = normalizePublicationFunnelHistory(history);
  const normalized = normalizePublicationFunnelSnapshot(snapshot);
  if (!normalized) return base;
  const weeks = [...base.weeks.filter(entry => entry.week !== normalized.week), normalized]
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-PUBLICATION_FUNNEL_HISTORY_LIMIT);
  return { version: 1, updatedAt: normalized.at, weeks };
}
