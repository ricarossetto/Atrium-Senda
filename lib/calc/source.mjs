import { toFixedString } from './decimal.mjs';
import { SGS_SERIES, fetchSeries } from './indices.mjs';
import { daysInMonth, isoFromParts, monthOf } from './calendar.mjs';

export class SerieError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SerieError';
  }
}

export const SERIES_ALIASES = Object.freeze({
  IPCA: { catalog: 'IPCA_MONTHLY', rotulo: 'IPCA' },
  INPC: { catalog: 'INPC_MONTHLY', rotulo: 'INPC' },
  'IGP-M': { catalog: 'IGP_M_MONTHLY', rotulo: 'IGP-M' },
  'IGP-DI': { catalog: 'IGP_DI_MONTHLY', rotulo: 'IGP-DI' },
  'IPCA-15': { catalog: 'IPCA_15_MONTHLY', rotulo: 'IPCA-15' },
  'IPCA-E': { catalog: 'IPCA_E_MONTHLY', rotulo: 'IPCA-E' },
  'IPC-FIPE': { catalog: 'IPC_FIPE_MONTHLY', rotulo: 'IPC-FIPE' },
  SELIC: { catalog: 'SELIC_MONTH_ACCUMULATED', rotulo: 'SELIC mensal' },
  TR: { catalog: 'TR_FIRST_DAY', rotulo: 'TR' },
  POUPANCA: { catalog: 'SAVINGS_NEW', rotulo: 'Poupança' },
  'TAXA-LEGAL': { catalog: 'TAXA_LEGAL_MONTHLY', rotulo: 'Taxa legal' }
});

export function resolverSerie(key) {
  const normalized = String(key || '').trim().toUpperCase();
  const found = Object.entries(SERIES_ALIASES).find(([alias]) => alias.toUpperCase() === normalized);
  if (!found) throw new SerieError(`Série não suportada: ${key}.`);
  const [alias, config] = found;
  const entry = SGS_SERIES[config.catalog];
  if (!entry) throw new SerieError(`Série ${key} sem entrada no catálogo SGS.`);
  return { key: alias, rotulo: config.rotulo, entry };
}

export function serializeRows(rows, kind) {
  const decimals = kind === 'factor' ? 8 : 6;
  return rows.map(row => ({ date: row.date, period: row.period, value: toFixedString(row.value, decimals) }));
}

export function ultimaCompetencia(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[rows.length - 1].period;
}

export function calcularJanela(fromIso, toIso) {
  const fromPeriod = monthOf(fromIso);
  const toPeriod = monthOf(toIso);
  const [fromYear, fromMonth] = fromPeriod.split('-').map(Number);
  const [toYear, toMonth] = toPeriod.split('-').map(Number);
  return {
    fromPeriod,
    toPeriod,
    from: isoFromParts(fromYear, fromMonth, 1),
    to: isoFromParts(toYear, toMonth, daysInMonth(toPeriod))
  };
}

export function createCalcSource({ fetchSeriesImpl = fetchSeries, ttlMs = 6 * 60 * 60 * 1000, now = () => Date.now() } = {}) {
  if (typeof fetchSeriesImpl !== 'function') throw new SerieError('Transporte de séries inválido.');
  const cache = new Map();

  async function rows(key, fromIso, toIso) {
    const resolved = resolverSerie(key);
    if (resolved.entry.kind === 'percent-day') {
      throw new SerieError(`Série diária ${resolved.key} exige agregação específica.`);
    }
    const cacheKey = `${resolved.entry.code}|${fromIso}|${toIso}`;
    const cached = cache.get(cacheKey);
    if (cached && now() - cached.at < ttlMs) return cached.rows;
    const fetched = await fetchSeriesImpl(resolved.entry.code, { from: fromIso, to: toIso });
    cache.set(cacheKey, { at: now(), rows: fetched });
    return fetched;
  }

  async function taxaLegalRates(fromIso, toIso) {
    const seriesRows = await rows('TAXA-LEGAL', fromIso, toIso);
    const rates = new Map();
    for (const row of seriesRows) rates.set(row.period, row.value);
    return rates;
  }

  function catalog() {
    return Object.entries(SERIES_ALIASES).map(([key, config]) => {
      const entry = SGS_SERIES[config.catalog];
      return { key, rotulo: config.rotulo, code: entry.code, kind: entry.kind };
    });
  }

  function clear() {
    cache.clear();
  }

  function size() {
    return cache.size;
  }

  return { rows, taxaLegalRates, catalog, clear, size };
}
