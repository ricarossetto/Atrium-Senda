/**
 * Convenção de contagem de tempo do perfil LC 142 de grau constante.
 *
 * Esta convenção é COMPARATIVA E VERSIONADA (`declared_30_360_inclusive_union`),
 * derivada do motor de referência, e NÃO substitui `calendar.mjs`, que governa
 * as convenções civis e trabalhistas do ATRIUM (fração de mês com início
 * exclusivo e fim inclusivo). Não use estas funções em cálculo cível/trabalhista.
 *
 * Regras (espelhadas de `period_days`, `duration` e `salary_days` do motor de origem):
 *  - 30/360 inclusivo: dias limitados a 30 no início e no fim, somando 1 pelo
 *    dia final inclusivo.
 *  - Trechos sobrepostos ou adjacentes são unidos antes de contar.
 *  - Dias por competência recortam os trechos cobertos, limitam o início ao dia 1,
 *    o dia final a 30 e usam 30 quando o fim recortado é o último dia da
 *    competência; a soma é limitada a 30.
 *
 * Toda aritmética de data aqui é inteira. Nenhum valor monetário participa.
 */

export class Lc142CalendarError extends Error {
  constructor(message) {
    super(message);
    this.name = 'Lc142CalendarError';
  }
}

export const LC142_TIME_CONVENTION = 'declared_30_360_inclusive_union';

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

/**
 * Valida e decompõe uma data ISO. A mensagem de erro é a do motor de origem,
 * porque o oráculo compara o texto exato das exceções.
 */
export function parseIsoDate(value) {
  if (typeof value !== 'string' || value.length !== 10 || !isAscii(value)) {
    throw new Lc142CalendarError('Data ISO inválida.');
  }
  const match = value.match(ISO_PATTERN);
  if (!match) throw new Lc142CalendarError('Data ISO inválida.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) throw new Lc142CalendarError('Data ISO inválida.');
  if (day > daysInMonth(year, month)) throw new Lc142CalendarError('Data ISO inválida.');
  if (year < MIN_YEAR || year > MAX_YEAR) {
    throw new Lc142CalendarError('Data fora do intervalo operacional 1900–2100.');
  }
  return { year, month, day };
}

export function isValidIsoDate(value) {
  try {
    parseIsoDate(value);
    return true;
  } catch {
    return false;
  }
}

function isAscii(text) {
  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) > 127) return false;
  }
  return true;
}

export function daysInMonth(year, month) {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Valida uma competência AAAA-MM.
 */
export function parseCompetence(value) {
  if (typeof value !== 'string' || value.length !== 7 || !isAscii(value) || value[4] !== '-') {
    throw new Lc142CalendarError('Competência AAAA-MM inválida.');
  }
  const match = value.match(MONTH_PATTERN);
  if (!match) throw new Lc142CalendarError('Competência AAAA-MM inválida.');
  // O motor de origem valida a competência compondo `<competência>-01` e
  // descarta a mensagem específica de data: qualquer falha vira
  // "Competência AAAA-MM inválida.", inclusive ano fora de 1900–2100.
  try {
    parseIsoDate(`${value}-01`);
  } catch {
    throw new Lc142CalendarError('Competência AAAA-MM inválida.');
  }
  return value;
}

export function isValidCompetence(value) {
  try {
    parseCompetence(value);
    return true;
  } catch {
    return false;
  }
}

export function competenceOf(date) {
  return `${pad4(date.year)}-${pad2(date.month)}`;
}

export function nextCompetence(competence) {
  parseCompetence(competence);
  const year = Number(competence.slice(0, 4));
  const month = Number(competence.slice(5, 7));
  return month === 12 ? `${pad4(year + 1)}-01` : `${pad4(year)}-${pad2(month + 1)}`;
}

export function pad2(value) {
  return String(value).padStart(2, '0');
}

export function pad4(value) {
  return String(value).padStart(4, '0');
}

function compareDates(a, b) {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

export function compareIso(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Soma dias corridos em uma data ISO, sem depender de fuso do sistema. */
export function addDaysIso(iso, days) {
  const date = parseIsoDate(iso);
  let remaining = days;
  let { year, month, day } = date;
  while (remaining > 0) {
    const limit = daysInMonth(year, month);
    if (day < limit) {
      day += 1;
    } else if (month < 12) {
      month += 1;
      day = 1;
    } else {
      year += 1;
      month = 1;
      day = 1;
    }
    remaining -= 1;
  }
  while (remaining < 0) {
    if (day > 1) {
      day -= 1;
    } else if (month > 1) {
      month -= 1;
      day = daysInMonth(year, month);
    } else {
      year -= 1;
      month = 12;
      day = daysInMonth(year, 12);
    }
    remaining += 1;
  }
  return `${pad4(year)}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Dias 30/360 inclusivos entre duas datas, na convenção do perfil.
 * `min(dia,30)` em ambas as pontas e +1 para incluir o dia final.
 */
export function periodDays30_360(startIso, endIso) {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  return (
    (end.year - start.year) * 360 +
    (end.month - start.month) * 30 +
    Math.min(end.day, 30) -
    Math.min(start.day, 30) +
    1
  );
}

/**
 * Une trechos sobrepostos ou adjacentes. Entrada: array de `[inicio, fim]` ISO.
 * Saída ordenada e determinística.
 */
export function mergePeriods(periods) {
  const sorted = periods
    .map(([start, end]) => [start, end])
    .sort((a, b) => compareIso(a[0], b[0]) || compareIso(a[1], b[1]));
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last) {
      const dayAfterLastEnd = addDaysIso(last[1], 1);
      if (compareIso(start, dayAfterLastEnd) <= 0) {
        if (compareIso(end, last[1]) > 0) last[1] = end;
        continue;
      }
    }
    merged.push([start, end]);
  }
  return merged;
}

/**
 * Duração acumulada até uma data de corte, em dias 30/360.
 * Trechos iniciados depois do corte não entram; trechos que atravessam o corte
 * são truncados no corte.
 */
export function durationUntil(periods, untilIso) {
  parseIsoDate(untilIso);
  let days = 0;
  for (const [start, end] of periods) {
    if (compareIso(start, untilIso) > 0) continue;
    const clippedEnd = compareIso(end, untilIso) <= 0 ? end : untilIso;
    days += periodDays30_360(start, clippedEnd);
  }
  return durationFromDays(days);
}

export function durationFromDays(days) {
  return {
    days_30_360: days,
    years: Math.trunc(days / 360),
    months: Math.trunc((days % 360) / 30),
    days: days % 30
  };
}

/**
 * Dias da competência cobertos pelos trechos unidos, na convenção do perfil.
 * Nunca imprime 30 em mês parcial coberto por trecho que não alcança o fim do mês.
 */
export function salaryDays30_360(mergedPeriods, competence) {
  parseCompetence(competence);
  const startIso = `${competence}-01`;
  const endOfMonthIso = `${competence}-${pad2(daysInMonth(Number(competence.slice(0, 4)), Number(competence.slice(5, 7))))}`;
  let total = 0;
  for (const [periodStart, periodEnd] of mergedPeriods) {
    if (compareIso(periodStart, endOfMonthIso) > 0) continue;
    if (compareIso(periodEnd, startIso) < 0) continue;
    const clippedStart = compareIso(periodStart, startIso) <= 0 ? startIso : periodStart;
    const clippedEnd = compareIso(periodEnd, endOfMonthIso) <= 0 ? periodEnd : endOfMonthIso;
    const firstDay = Math.min(parseIsoDate(clippedStart).day, 30);
    const lastDay = compareIso(clippedEnd, endOfMonthIso) === 0
      ? 30
      : Math.min(parseIsoDate(clippedEnd).day, 30);
    total += lastDay - firstDay + 1;
  }
  return Math.min(total, 30);
}

/**
 * Competências distintas cobertas pelos trechos unidos. É a contagem usada como
 * carência do cenário: aritmética de cobertura, não certificação jurídica.
 */
export function coveredCompetences(mergedPeriods) {
  const months = new Set();
  for (const [start, end] of mergedPeriods) {
    let cursor = competenceOf(parseIsoDate(start));
    const last = competenceOf(parseIsoDate(end));
    while (compareIso(cursor, last) <= 0) {
      months.add(cursor);
      cursor = nextCompetence(cursor);
    }
  }
  return months;
}

/**
 * Lista as competências de um intervalo, inclusive, em ordem ascendente.
 */
export function competencesBetween(first, lastExclusive) {
  parseCompetence(first);
  parseCompetence(lastExclusive);
  const list = [];
  let cursor = first;
  while (compareIso(cursor, lastExclusive) < 0) {
    list.push(cursor);
    cursor = nextCompetence(cursor);
  }
  return list;
}
