/**
 * Conferência de contagem de prazo (informativa, sem gravar nada).
 *
 * Calcula o que a fonte declarou: a partir da data inicial e do número de dias
 * informado pelo usuário, devolve a data proposta em dias úteis ou corridos,
 * o primeiro dia útil posterior e o último dia útil anterior, com a lista das
 * datas contadas para conferência. Feriados locais, pontos facultativos,
 * recesso forense e suspensões não são inferidos: suspensões registradas podem
 * ser informadas explicitamente. Nenhum prazo é criado, alterado ou confirmado
 * por este módulo (AGENTS §16; specs/human-deadline-policy.md).
 */

import { isBusinessDay } from './business-days.mjs';

export const DEADLINE_CONFERENCE_MAX_DAYS = 365;
export const DEADLINE_CONFERENCE_MAX_STEPS = 90;

export const DEADLINE_CONFERENCE_NOTE =
  'Cálculo informativo a partir da data e dos dias informados. Feriados locais, pontos facultativos, recesso forense e suspensões podem deslocar a data; a confirmação do prazo é humana e nada é gravado automaticamente.';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(value, max = 120) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeDateOnly(value) {
  const raw = cleanText(value, 10);
  if (!DATE_ONLY_RE.test(raw)) return null;
  const parsed = new Date(`${raw}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw ? raw : null;
}

function shiftDays(dateOnly, amount) {
  const date = new Date(`${dateOnly}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function expandSuspensions(suspensions = []) {
  const dates = new Set();
  for (const entry of Array.isArray(suspensions) ? suspensions.slice(0, 20) : []) {
    const from = normalizeDateOnly(entry?.from);
    if (!from) continue;
    const to = normalizeDateOnly(entry?.to) || from;
    let cursor = from;
    for (let index = 0; index < 400 && cursor <= to; index += 1) {
      dates.add(cursor);
      cursor = shiftDays(cursor, 1);
    }
  }
  return dates;
}

export function conferenceDeadline({ startDate, days = 15, counting = 'business', direction = 'after', suspensions = [] } = {}) {
  const start = normalizeDateOnly(startDate);
  const totalDays = Math.floor(Number(days));
  if (!start) return { ok: false, reason: 'invalid-start-date' };
  if (!Number.isFinite(totalDays) || totalDays < 1 || totalDays > DEADLINE_CONFERENCE_MAX_DAYS) {
    return { ok: false, reason: 'invalid-days', maxDays: DEADLINE_CONFERENCE_MAX_DAYS };
  }
  const countingMode = counting === 'calendar' ? 'calendar' : counting === 'business' ? 'business' : null;
  const movement = direction === 'before' ? 'before' : direction === 'after' ? 'after' : null;
  if (!countingMode || !movement) return { ok: false, reason: 'invalid-mode' };

  const suspensionSet = expandSuspensions(suspensions);
  const isOpenBusinessDay = value => isBusinessDay(value) && !suspensionSet.has(value);
  const firstBusinessDayAfter = (() => {
    let cursor = start;
    for (let index = 0; index < DEADLINE_CONFERENCE_MAX_DAYS; index += 1) {
      cursor = shiftDays(cursor, 1);
      if (isOpenBusinessDay(cursor)) return cursor;
    }
    return null;
  })();
  const lastBusinessDayBefore = (() => {
    let cursor = start;
    for (let index = 0; index < DEADLINE_CONFERENCE_MAX_DAYS; index += 1) {
      cursor = shiftDays(cursor, -1);
      if (isOpenBusinessDay(cursor)) return cursor;
    }
    return null;
  })();

  const steps = [];
  let countedDays = 0;
  let cursor = start;
  if (countingMode === 'business') {
    const step = movement === 'after' ? 1 : -1;
    for (let index = 0; index < totalDays; index += 1) {
      for (let guard = 0; guard < DEADLINE_CONFERENCE_MAX_DAYS; guard += 1) {
        cursor = shiftDays(cursor, step);
        if (isOpenBusinessDay(cursor)) break;
      }
      countedDays += 1;
      if (steps.length < DEADLINE_CONFERENCE_MAX_STEPS) steps.push(cursor);
    }
  } else {
    const step = movement === 'after' ? totalDays : -totalDays;
    cursor = shiftDays(start, step);
    countedDays = totalDays;
    if (steps.length < DEADLINE_CONFERENCE_MAX_STEPS) steps.push(cursor);
  }

  return {
    ok: true,
    startDate: start,
    days: totalDays,
    counting: countingMode,
    direction: movement,
    proposedDate: cursor,
    firstBusinessDayAfter,
    lastBusinessDayBefore,
    countedDays,
    steps: steps.slice(-DEADLINE_CONFERENCE_MAX_STEPS),
    suspensionsApplied: suspensionSet.size,
    note: DEADLINE_CONFERENCE_NOTE
  };
}
