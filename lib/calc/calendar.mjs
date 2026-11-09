import { periodFromDate, monthAfter } from './indices.mjs';

export { monthAfter, periodFromDate } from './indices.mjs';

export class CalendarError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CalendarError';
  }
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const PERIOD_PATTERN = /^(\d{4})-(\d{2})$/;

export function partsFromIso(iso, label = 'data') {
  const match = typeof iso === 'string' ? iso.match(ISO_DATE_PATTERN) : null;
  if (!match) throw new CalendarError(`${label} inválida: ${iso}. Use AAAA-MM-DD.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new CalendarError(`${label} inválida: ${iso}.`);
  }
  return { year, month, day };
}

export function isoFromParts(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function monthOf(iso) {
  partsFromIso(iso);
  return iso.slice(0, 7);
}

export function assertPeriodValue(period, label = 'período') {
  const match = typeof period === 'string' ? period.match(PERIOD_PATTERN) : null;
  if (!match) throw new CalendarError(`${label} inválido: ${period}. Use AAAA-MM.`);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new CalendarError(`${label} inválido: ${period}.`);
  return period;
}

export function monthBefore(period) {
  assertPeriodValue(period);
  const [year, month] = period.split('-').map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

export function addDays(iso, days) {
  const { year, month, day } = partsFromIso(iso);
  if (!Number.isInteger(days)) throw new CalendarError(`Dias inválidos: ${days}.`);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return isoFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function addYears(iso, years) {
  const { year, month, day } = partsFromIso(iso);
  if (!Number.isInteger(years)) throw new CalendarError(`Anos inválidos: ${years}.`);
  const date = new Date(Date.UTC(year + years, month - 1, day));
  return isoFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function daysBetween(fromIso, toIso) {
  const from = partsFromIso(fromIso, 'data inicial');
  const to = partsFromIso(toIso, 'data final');
  const fromTime = Date.UTC(from.year, from.month - 1, from.day);
  const toTime = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((toTime - fromTime) / 86400000);
}

export function daysInMonth(period) {
  assertPeriodValue(period);
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthFractions(fromIso, toIso) {
  partsFromIso(fromIso, 'data inicial');
  partsFromIso(toIso, 'data final');
  if (toIso <= fromIso) return [];
  const lastPeriod = periodFromDate(toIso);
  const fractions = [];
  let cursorPeriod = periodFromDate(fromIso);
  while (cursorPeriod <= lastPeriod) {
    const total = daysInMonth(cursorPeriod);
    const [year, month] = cursorPeriod.split('-').map(Number);
    const monthStart = isoFromParts(year, month, 1);
    const monthEnd = isoFromParts(year, month, total);
    const overlapStart = fromIso >= monthStart ? addDays(fromIso, 1) : monthStart;
    const overlapEnd = toIso <= monthEnd ? toIso : monthEnd;
    if (overlapStart <= overlapEnd) {
      const days = daysBetween(overlapStart, overlapEnd) + 1;
      if (days > 0) fractions.push({ period: cursorPeriod, days, daysInMonth: total, fraction: `${days}/${total}` });
    }
    cursorPeriod = monthAfter(cursorPeriod);
  }
  return fractions;
}

export function periodsInRange(fromPeriod, toPeriod) {
  assertPeriodValue(fromPeriod, 'período inicial');
  assertPeriodValue(toPeriod, 'período final');
  if (fromPeriod > toPeriod) throw new CalendarError(`Período inicial ${fromPeriod} é posterior ao final ${toPeriod}.`);
  const periods = [];
  let cursor = fromPeriod;
  while (cursor <= toPeriod) {
    periods.push(cursor);
    cursor = monthAfter(cursor);
  }
  return periods;
}

export function previousPeriodsBetween(fromPeriod, toPeriod) {
  assertPeriodValue(fromPeriod, 'período inicial');
  assertPeriodValue(toPeriod, 'período final');
  if (fromPeriod >= toPeriod) return [];
  const periods = [];
  let cursor = monthAfter(fromPeriod);
  while (cursor <= toPeriod) {
    periods.push(cursor);
    cursor = monthAfter(cursor);
  }
  return periods;
}
