import { parseDec, mul, div, factorFromPercent, toFixedString } from './decimal.mjs';

export class IndicesError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IndicesError';
  }
}

export const SGS_BASE_URL = 'https://api.bcb.gov.br/dados/serie';

const SERIES_KINDS = new Set(['percent-month', 'percent-day', 'factor']);

function series(code, name, kind, verifiedVia, note) {
  if (!Number.isInteger(code) || code <= 0) throw new IndicesError(`Código SGS inválido: ${code}.`);
  if (!SERIES_KINDS.has(kind)) throw new IndicesError(`Tipo de série inválido: ${kind}.`);
  return Object.freeze({ code, name, kind, verifiedVia, note: note || null });
}

export const SGS_SERIES = Object.freeze({
  IPCA_MONTHLY: series(433, 'IPCA — variação mensal', 'percent-month', 'documentacao-publica', 'IPCA/IBGE replicado no SGS.'),
  IPCA_12M: series(13522, 'IPCA — variação acumulada em 12 meses', 'percent-month', 'documentacao-publica'),
  INPC_MONTHLY: series(188, 'INPC — variação mensal', 'percent-month', 'documentacao-publica'),
  IGP_M_MONTHLY: series(189, 'IGP-M — variação mensal', 'percent-month', 'documentacao-publica', 'A Calculadora do Cidadão usa a série 28655 para correção; conferir contra a fonte antes de uso processual.'),
  IGP_DI_MONTHLY: series(190, 'IGP-DI — variação mensal', 'percent-month', 'documentacao-publica'),
  IPC_FIPE_MONTHLY: series(193, 'IPC-FIPE — variação mensal', 'percent-month', 'documentacao-publica'),
  IPCA_15_MONTHLY: series(7478, 'IPCA-15 — variação mensal', 'percent-month', 'documentacao-publica'),
  IPCA_E_MONTHLY: series(10764, 'IPCA-E — variação mensal', 'percent-month', 'documentacao-publica'),
  TR_MONTHLY: series(226, 'TR — divulgação diária da taxa mensal', 'percent-day', 'finep-bcb', 'Série diária: use TR_FIRST_DAY (7811) para a TR mensal em cadeias de correção.'),
  TR_FIRST_DAY: series(7811, 'TR — taxa do dia 1º (série mensal)', 'percent-month', 'finep-bcb'),
  SELIC_DAILY: series(11, 'Selic — taxa diária', 'percent-day', 'ckan-11-taxa-de-juros---selic'),
  SELIC_MONTH_ACCUMULATED: series(4390, 'Selic acumulada no mês', 'percent-month', 'ckan-4390-taxa-de-juros---selic-acumulada-no-mes'),
  SELIC_MONTH_ANNUALIZED_252: series(4189, 'Selic acumulada no mês anualizada base 252', 'percent-month', 'ckan-4189-taxa-de-juros---selic-acumulada-no-mes-anualizada-base-252'),
  SELIC_YEAR_ANNUALIZED_252: series(1178, 'Selic anualizada base 252', 'percent-month', 'ckan-1178-taxa-de-juros---selic-anualizada-base-252'),
  SAVINGS_OLD: series(25, 'Poupança até 03/05/2012 — rentabilidade no período', 'percent-month', 'ckan-25-depositos-de-poupanca-ate-03052012---rentabilidade-no-periodo'),
  SAVINGS_NEW: series(195, 'Poupança a partir de 04/05/2012 — rentabilidade no período', 'percent-month', 'ckan-195-depositos-de-poupanca-a-partir-de-04052012---rentabilidade-no-periodo'),
  TAXA_LEGAL_SELIC_FACTOR: series(29541, 'Fator da Taxa Selic mensal para a Taxa Legal', 'factor', 'resolucao-cmn-5171-trf4', '8 casas decimais por norma.'),
  TAXA_LEGAL_IPCA_FACTOR: series(29542, 'Fator IPCA (IPCA-15) para a Taxa Legal', 'factor', 'resolucao-cmn-5171-trf4', '4 casas decimais por norma.'),
  TAXA_LEGAL_MONTHLY: series(29543, 'Taxa Legal mensal', 'percent-month', 'resolucao-cmn-5171-trf4', '6 casas decimais, NBR 5891.')
});

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const PERIOD_PATTERN = /^(\d{4})-(\d{2})$/;
const SGS_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function assertIsoDate(value, label = 'data') {
  const match = typeof value === 'string' ? value.match(ISO_DATE_PATTERN) : null;
  if (!match) throw new IndicesError(`${label} inválida: ${value}. Use AAAA-MM-DD.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new IndicesError(`${label} inválida: ${value}.`);
  }
  return { year, month, day };
}

export function periodFromDate(date) {
  const { year, month } = assertIsoDate(date);
  return `${year}-${pad2(month)}`;
}

export function assertPeriod(value, label = 'período') {
  const match = typeof value === 'string' ? value.match(PERIOD_PATTERN) : null;
  if (!match) throw new IndicesError(`${label} inválido: ${value}. Use AAAA-MM.`);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new IndicesError(`${label} inválido: ${value}.`);
  return value;
}

export function monthAfter(period) {
  assertPeriod(period);
  const [year, month] = period.split('-').map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${pad2(month + 1)}`;
}

function isoToSgsDate(iso) {
  const { year, month, day } = assertIsoDate(iso);
  return `${pad2(day)}/${pad2(month)}/${year}`;
}

function sgsDateToIso(value, label) {
  const match = typeof value === 'string' ? value.match(SGS_DATE_PATTERN) : null;
  if (!match) throw new IndicesError(`${label} inválida na série SGS: ${value}.`);
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  assertIsoDate(iso, label);
  return iso;
}

function addDays(iso, days) {
  const { year, month, day } = assertIsoDate(iso);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function addYears(iso, years) {
  const { year, month, day } = assertIsoDate(iso);
  const date = new Date(Date.UTC(year + years, month - 1, day));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function normalizeSgsRows(raw, label = 'série SGS') {
  if (!Array.isArray(raw)) throw new IndicesError(`${label}: resposta não é uma lista de pontos.`);
  const normalized = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new IndicesError(`${label}: ponto inválido na resposta.`);
    }
    const iso = sgsDateToIso(row.data, 'Data');
    let value;
    try {
      value = parseDec(row.valor);
    } catch (error) {
      throw new IndicesError(`${label}: valor inválido em ${row.data}: ${row.valor}.`);
    }
    normalized.push({ date: iso, period: iso.slice(0, 7), value });
  }
  normalized.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const deduped = [];
  for (const row of normalized) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.date === row.date) deduped[deduped.length - 1] = row;
    else deduped.push(row);
  }
  return deduped;
}

function factorOf(row, kind, label) {
  if (!row || typeof row !== 'object' || typeof row.period !== 'string' || typeof row.value !== 'bigint') {
    throw new IndicesError(`${label}: ponto não normalizado; use normalizeSgsRows antes de calcular fatores.`);
  }
  if (kind === 'percent-month') return factorFromPercent(row.value);
  if (kind === 'factor') return row.value;
  throw new IndicesError(`${label}: série do tipo ${kind} exige agregação específica e não é suportada nesta fase.`);
}

export function accumulatedFactors(rows, options = {}) {
  const kind = options.kind || 'percent-month';
  const label = options.label || 'série';
  if (!Array.isArray(rows) || rows.length === 0) throw new IndicesError(`${label}: série vazia.`);
  const factors = new Map();
  let running = null;
  for (const row of rows) {
    const factor = factorOf(row, kind, label);
    running = running === null ? factor : mul(running, factor);
    factors.set(row.period, running);
  }
  return factors;
}

export function factorBetween(rows, fromPeriod, toPeriod, options = {}) {
  const kind = options.kind || 'percent-month';
  const label = options.label || 'série';
  assertPeriod(fromPeriod, 'período inicial');
  assertPeriod(toPeriod, 'período final');
  if (fromPeriod > toPeriod) {
    throw new IndicesError(`${label}: período inicial ${fromPeriod} é posterior ao final ${toPeriod}.`);
  }
  const factors = accumulatedFactors(rows, { kind, label });
  if (!factors.has(fromPeriod)) throw new IndicesError(`${label}: sem valor para ${fromPeriod}.`);
  if (fromPeriod === toPeriod) return parseDec('1');
  let cursor = monthAfter(fromPeriod);
  while (cursor <= toPeriod) {
    if (!factors.has(cursor)) throw new IndicesError(`${label}: sem valor para ${cursor}.`);
    cursor = monthAfter(cursor);
  }
  return div(factors.get(toPeriod), factors.get(fromPeriod));
}

export function prorataMonthlyRate(ratePercent, days, daysInMonth) {
  if (!Number.isInteger(days) || days < 0) throw new IndicesError(`Dias inválidos: ${days}.`);
  if (!Number.isInteger(daysInMonth) || daysInMonth <= 0) throw new IndicesError(`Dias do mês inválidos: ${daysInMonth}.`);
  if (days > daysInMonth) throw new IndicesError(`Dias ${days} excedem o mês de ${daysInMonth} dias.`);
  const rate = parseDec(ratePercent);
  return div(mul(rate, days), daysInMonth);
}

export async function fetchSeries(code, options = {}) {
  if (!Number.isInteger(code) || code <= 0) throw new IndicesError(`Código SGS inválido: ${code}.`);
  const from = assertIsoDate(options.from, 'data inicial');
  const to = assertIsoDate(options.to, 'data final');
  const fromIso = `${from.year}-${pad2(from.month)}-${pad2(from.day)}`;
  const toIso = `${to.year}-${pad2(to.month)}-${pad2(to.day)}`;
  if (fromIso > toIso) throw new IndicesError(`Período inválido: ${fromIso} é posterior a ${toIso}.`);
  const baseUrl = options.baseUrl || SGS_BASE_URL;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new IndicesError('Transporte HTTP indisponível para consultar o SGS.');

  const windows = [];
  let cursor = fromIso;
  while (cursor <= toIso) {
    const limit = addDays(addYears(cursor, 10), -1);
    const end = limit < toIso ? limit : toIso;
    windows.push({ start: cursor, end });
    cursor = addDays(end, 1);
  }

  const rows = [];
  for (const window of windows) {
    const url = `${baseUrl}/bcdata.sgs.${code}/dados?formato=json&dataInicial=${isoToSgsDate(window.start)}&dataFinal=${isoToSgsDate(window.end)}`;
    let response;
    try {
      response = await fetchImpl(url);
    } catch (error) {
      throw new IndicesError(`Falha de rede ao consultar o SGS (${code}): ${error.message}`);
    }
    if (!response || response.ok !== true) {
      throw new IndicesError(`SGS respondeu ${response ? response.status : 'sem resposta'} para a série ${code}.`);
    }
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new IndicesError(`Resposta do SGS não é JSON válido (série ${code}).`);
    }
    rows.push(...normalizeSgsRows(payload, `SGS ${code}`));
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return rows;
}

export function describeSeries(entry) {
  if (!entry || typeof entry !== 'object') throw new IndicesError('Série desconhecida.');
  return {
    code: entry.code,
    name: entry.name,
    kind: entry.kind,
    verifiedVia: entry.verifiedVia,
    note: entry.note
  };
}

export function factorSummary(rows, options = {}) {
  const factors = accumulatedFactors(rows, options);
  const summary = [];
  for (const [period, factor] of factors) {
    summary.push({ period, factor: toFixedString(factor, 12) });
  }
  return summary;
}
