/**
 * Recorrência de compromissos e tarefas (séries com escopo de edição).
 *
 * Modelo: o registro mestre guarda `recurrence: { rule, seriesId, startDate }`;
 * ocorrências são **virtuais** (materializadas na leitura por
 * `materializeSeries`) e exceções ficam persistidas como itens próprios com
 * `recurrence.exceptionOf` + `occurrenceDate` (inclusive tombstone `skipped`).
 * Editar uma ocorrência exige escopo explícito: `single` (exceção), `following`
 * (divide a série) ou `series` (altera o mestre). O módulo é puro.
 */

export const RECURRENCE_FREQUENCIES = Object.freeze(['daily', 'weekly', 'monthly', 'yearly']);
export const RECURRENCE_MAX_OCCURRENCES = 60;
export const RECURRENCE_EDIT_SCOPES = Object.freeze(['single', 'following', 'series']);

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(value, max = 80) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function normalizeDateOnly(value) {
  const raw = cleanText(value, 10);
  if (!DATE_ONLY_RE.test(raw)) return null;
  const parsed = new Date(`${raw}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw ? raw : null;
}

export function normalizeRecurrence(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const frequency = RECURRENCE_FREQUENCIES.includes(raw.frequency) ? raw.frequency : null;
  if (!frequency) return null;
  const interval = Math.max(1, Math.min(12, Math.floor(Number(raw.interval) || 1)));
  const until = normalizeDateOnly(raw.until);
  const count = raw.count === null || raw.count === undefined
    ? null
    : Math.max(1, Math.min(RECURRENCE_MAX_OCCURRENCES, Math.floor(Number(raw.count) || 1)));
  return {
    frequency,
    interval,
    ...(until ? { until } : {}),
    ...(count ? { count } : {})
  };
}

export function describeRecurrence(rule) {
  const normalized = normalizeRecurrence(rule);
  if (!normalized) return 'Sem repetição';
  const every = normalized.interval > 1 ? `a cada ${normalized.interval} ` : '';
  const [singular, pluralForm] = { daily: ['dia', 'dias'], weekly: ['semana', 'semanas'], monthly: ['mês', 'meses'], yearly: ['ano', 'anos'] }[normalized.frequency];
  const base = normalized.interval > 1 ? `Repete ${every}${pluralForm}` : `Repete a cada ${singular}`;
  return normalized.until ? `${base} até ${normalized.until}` : normalized.count ? `${base} por ${normalized.count} ${normalized.count === 1 ? 'ocorrência' : 'ocorrências'}` : base;
}

function addDays(dateOnly, days) {
  const date = new Date(`${dateOnly}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(dateOnly, months) {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1, 12));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

function occurrenceAt(startDate, rule, index) {
  if (rule.frequency === 'daily') return addDays(startDate, index * rule.interval);
  if (rule.frequency === 'weekly') return addDays(startDate, index * 7 * rule.interval);
  if (rule.frequency === 'monthly') return addMonths(startDate, index * rule.interval);
  return addMonths(startDate, index * 12 * rule.interval);
}

/**
 * Expande as datas da série dentro da janela [from, to], respeitando `until`
 * e `count`. Sempre limitado por `RECURRENCE_MAX_OCCURRENCES`. Cada ocorrência
 * é ancorada na data inicial (dia 31 continua dia 31 quando o mês permitir).
 */
export function expandOccurrences(rule, { startDate, from = null, to = null, limit = RECURRENCE_MAX_OCCURRENCES } = {}) {
  const normalized = normalizeRecurrence(rule);
  const start = normalizeDateOnly(startDate);
  if (!normalized || !start) return [];
  const max = Math.max(1, Math.min(RECURRENCE_MAX_OCCURRENCES, Number(limit) || RECURRENCE_MAX_OCCURRENCES));
  const windowEnd = normalizeDateOnly(to) || normalized.until || null;
  const dates = [];
  for (let index = 0; index < max; index += 1) {
    const cursor = occurrenceAt(start, normalized, index);
    if (normalized.until && cursor > normalized.until) break;
    if (normalized.count && index >= normalized.count) break;
    if (windowEnd && cursor > windowEnd) break;
    if (!from || cursor >= from) dates.push(cursor);
  }
  return dates;
}

export function occurrenceId(seriesId, date) {
  return `${cleanText(seriesId, 80)}::${date}`;
}

export function parseOccurrenceId(value) {
  const raw = cleanText(value, 120);
  const separator = raw.lastIndexOf('::');
  if (separator <= 0) return null;
  const seriesId = raw.slice(0, separator);
  const date = normalizeDateOnly(raw.slice(separator + 2));
  return seriesId && date ? { seriesId, date } : null;
}

export function isSeriesMaster(item) {
  return Boolean(item?.recurrence && !item.recurrence.exceptionOf && normalizeRecurrence(item.recurrence.rule));
}

export function isSeriesException(item) {
  return Boolean(item?.recurrence?.exceptionOf && normalizeDateOnly(item.recurrence.occurrenceDate));
}

/**
 * Materializa a série de um mestre na janela pedida, aplicando exceções
 * (inclusive tombstone `skipped`). Ocorrências virtuais recebem
 * `id = seriesId::date` e não alteram o registro mestre.
 */
export function materializeSeries(master, { exceptions = [], from = null, to = null, limit } = {}) {
  if (!isSeriesMaster(master)) return [];
  const startDate = normalizeDateOnly(master.recurrence.startDate) || normalizeDateOnly(master.date) || normalizeDateOnly(master.deadline);
  const dates = expandOccurrences(master.recurrence.rule, { startDate, from, to, limit });
  const byDate = new Map((Array.isArray(exceptions) ? exceptions : [])
    .filter(exception => exception?.recurrence?.exceptionOf === master.id)
    .map(exception => [exception.recurrence.occurrenceDate, exception]));
  return dates
    .map(date => {
      const exception = byDate.get(date);
      if (exception?.recurrence?.skipped === true) return null;
      const base = exception ? { ...master, ...exception } : { ...master };
      return {
        ...base,
        id: occurrenceId(master.id, date),
        date,
        ...(base.deadline !== undefined ? { deadline: date } : {}),
        recurrence: { ...master.recurrence, occurrenceDate: date, exceptionId: exception?.id || null },
        seriesId: master.id,
        virtual: !exception
      };
    })
    .filter(Boolean);
}

/**
 * Aplica uma edição de série com escopo:
 * - `single`: grava exceção para a data (patch) ou tombstone quando `remove`;
 * - `following`: encerra o mestre um dia antes e cria novo mestre a partir da data;
 * - `series`: altera o mestre (campos e/ou regra).
 * Retorna a lista de itens já atualizada (sem tocar em coleções externas).
 */
export function applyRecurrenceEdit({ items = [], masterId, occurrenceDate, scope, patch = {}, remove = false, newRule = null, createId } = {}) {
  const list = Array.isArray(items) ? items.map(item => ({ ...item })) : [];
  const master = list.find(item => item.id === masterId);
  const date = normalizeDateOnly(occurrenceDate);
  if (!master || !isSeriesMaster(master) || !date || !RECURRENCE_EDIT_SCOPES.includes(scope)) {
    return { ok: false, reason: 'invalid-edit', items: list };
  }
  const nextId = typeof createId === 'function' ? createId : (prefix => `${prefix}-${Date.now().toString(36)}`);
  if (scope === 'single') {
    const exceptionId = occurrenceId(master.id, date);
    const index = list.findIndex(item => item.id === exceptionId);
    const exception = {
      ...(index >= 0 ? list[index] : {}),
      ...patch,
      id: exceptionId,
      recurrence: {
        exceptionOf: master.id,
        occurrenceDate: date,
        ...(remove ? { skipped: true } : {})
      }
    };
    if (index >= 0) list[index] = exception;
    else list.push(exception);
    return { ok: true, items: list, scope, exceptionId, changedIds: [exceptionId] };
  }
  if (scope === 'following') {
    const previousUntil = addDays(date, -1);
    if (previousUntil < (normalizeDateOnly(master.recurrence.startDate) || date)) {
      return { ok: false, reason: 'following-before-start', items: list };
    }
    const masterIndex = list.findIndex(item => item.id === master.id);
    list[masterIndex] = {
      ...master,
      recurrence: { ...master.recurrence, rule: { ...master.recurrence.rule, until: previousUntil, count: undefined } }
    };
    const seriesId = nextId('series');
    const splitMaster = {
      ...master,
      ...patch,
      id: seriesId,
      recurrence: {
        rule: normalizeRecurrence(newRule) || { ...master.recurrence.rule, until: undefined },
        seriesId,
        startDate: date
      },
      ...(master.date !== undefined ? { date } : {}),
      ...(master.deadline !== undefined ? { deadline: date } : {})
    };
    delete splitMaster.recurrence.count;
    list.push(splitMaster);
    return { ok: true, items: list, scope, newSeriesId: seriesId, changedIds: [master.id, seriesId] };
  }
  const masterIndex = list.findIndex(item => item.id === master.id);
  const rule = normalizeRecurrence(newRule) || master.recurrence.rule;
  list[masterIndex] = {
    ...master,
    ...patch,
    recurrence: { ...master.recurrence, rule }
  };
  return { ok: true, items: list, scope, seriesId: master.id, changedIds: [master.id] };
}

/**
 * Materializa todas as séries de uma coleção dentro da janela, substituindo os
 * mestres pelas ocorrências virtuais + exceções. Itens sem recorrência
 * permanecem exatamente como estão.
 */
export function materializeCollection(items = [], { from = null, to = null, limit } = {}) {
  const list = Array.isArray(items) ? items : [];
  const masters = list.filter(isSeriesMaster);
  const exceptions = list.filter(isSeriesException);
  if (!masters.length) return [...list];
  const mastersById = new Set(masters.map(master => master.id));
  const output = list.filter(item => !isSeriesMaster(item) && !(isSeriesException(item) && mastersById.has(item.recurrence.exceptionOf)));
  for (const master of masters) {
    output.push(...materializeSeries(master, { exceptions, from, to, limit }));
  }
  return output;
}
