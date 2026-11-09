import { parseDec, div, sub, mul, roundTo, formatBR, isNegative } from './decimal.mjs';
import { periodFromDate } from './indices.mjs';

export class RegimeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RegimeError';
  }
}

function regime(id, from, to, correction, interest, legalBasis, note) {
  if (!id || !from) throw new RegimeError('Regime exige identificador e data inicial.');
  return Object.freeze({ id, from, to, correction, interest: Object.freeze(interest), legalBasis, note: note || null });
}

export const REGIMES = Object.freeze({
  CC_1916: regime('CC_1916', '1900-01-01', '2003-01-11', 'Conforme título ou lei', { kind: 'fixed-annual', ratePercent: '6' }, 'CC/1916, art. 1.062'),
  CC_2002: regime('CC_2002', '2003-01-12', '2024-08-29', 'Conforme título ou lei', { kind: 'fixed-annual', ratePercent: '12' }, 'CC/2002, art. 406 (redação original)'),
  LEI_14905: regime('LEI_14905', '2024-08-30', null, 'IPCA quando não convencionado nem previsto em lei', { kind: 'taxa-legal' }, 'Lei 14.905/2024; Res. CMN 5.171/2024'),
  FAZENDA_PRE_11960: regime('FAZENDA_PRE_11960', '1900-01-01', '2009-06-29', 'Conforme Tema 905/STJ e período', { kind: 'conforme-tema-905' }, 'STJ, Tema 905'),
  FAZENDA_11960: regime('FAZENDA_11960', '2009-06-30', '2021-12-08', 'IPCA-E (a partir de 25/03/2015; anteriores conforme Tema 905)', { kind: 'poupanca' }, 'Lei 11.960/2009; STJ, Tema 905'),
  FAZENDA_EC113: regime('FAZENDA_EC113', '2021-12-09', null, 'SELIC acumulada mensalmente sobre o débito consolidado em 11/2021', { kind: 'selic-unica' }, 'EC 113/2021, art. 3º; Res. CNJ 303/2019'),
  PRECATORIOS_CNJ_303: regime('PRECATORIOS_CNJ_303', '2019-12-18', null, 'Linha própria: INPC, UFIR, IPCA-E, TR e SELIC conforme o período', { kind: 'linha-propria' }, 'Res. CNJ 303/2019, 448/2022 e 482/2022'),
  PRECATORIOS_FEDERAIS_EC136: regime('PRECATORIOS_FEDERAIS_EC136', '2025-09-01', null, 'Conforme o título', { kind: 'simples-2aa' }, 'EC 136/2025, art. 3º', 'Trilha específica de débitos federais; conferir leitura do tribunal.')
});

export const REGIME_TRACKS = Object.freeze({
  geral: Object.freeze([REGIMES.CC_1916, REGIMES.CC_2002, REGIMES.LEI_14905]),
  fazendaPublica: Object.freeze([REGIMES.FAZENDA_PRE_11960, REGIMES.FAZENDA_11960, REGIMES.FAZENDA_EC113]),
  precatorios: Object.freeze([REGIMES.PRECATORIOS_CNJ_303]),
  precatoriosFederais: Object.freeze([REGIMES.PRECATORIOS_FEDERAIS_EC136])
});

function normalizeDate(value) {
  periodFromDate(value);
  return value;
}

export function regimeForDate(track, date) {
  const timeline = REGIME_TRACKS[track];
  if (!timeline) throw new RegimeError(`Trilha de regime desconhecida: ${track}.`);
  const iso = normalizeDate(date);
  const matches = timeline.filter(entry => entry.from <= iso && (entry.to === null || iso <= entry.to));
  if (matches.length !== 1) {
    throw new RegimeError(`Trilha ${track}: ${matches.length} regimes ativos em ${iso}; a trilha deve ser contínua e sem sobreposição.`);
  }
  return matches[0];
}

export function timelineForTrack(track) {
  const timeline = REGIME_TRACKS[track];
  if (!timeline) throw new RegimeError(`Trilha de regime desconhecida: ${track}.`);
  return timeline.slice();
}

export function taxaLegalFromFactors(selicFactor, ipcaFactor) {
  const selic = parseDec(selicFactor);
  const ipca = parseDec(ipcaFactor);
  if (selic <= 0n) throw new RegimeError('Fator Selic precisa ser positivo.');
  if (ipca <= 0n) throw new RegimeError('Fator IPCA precisa ser positivo.');
  const ratio = div(selic, ipca);
  const delta = sub(ratio, parseDec('1'));
  if (isNegative(delta) || delta === 0n) return parseDec('0');
  return roundTo(mul(delta, 100), 6, 'half-even');
}

export function taxaLegalFromSeries(selicRows, ipcaRows) {
  if (!Array.isArray(selicRows) || selicRows.length === 0) throw new RegimeError('Série do fator Selic vazia.');
  if (!Array.isArray(ipcaRows) || ipcaRows.length === 0) throw new RegimeError('Série do fator IPCA vazia.');
  const ipcaByPeriod = new Map(ipcaRows.map(row => [row.period, row.value]));
  const ordered = selicRows.slice().sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
  const computed = new Map();
  for (const row of ordered) {
    if (typeof row.value !== 'bigint' || typeof row.period !== 'string') {
      throw new RegimeError('Série do fator Selic exige pontos normalizados.');
    }
    const ipca = ipcaByPeriod.get(row.period);
    if (ipca === undefined) throw new RegimeError(`Sem fator IPCA para ${row.period}.`);
    computed.set(row.period, taxaLegalFromFactors(row.value, ipca));
  }
  return computed;
}

export function simpleRatesSum(rates) {
  if (!Array.isArray(rates) || rates.length === 0) throw new RegimeError('Soma de juros simples exige taxas mensais.');
  let total = 0n;
  for (const rate of rates) total += parseDec(rate);
  return total;
}

export function compareRateMaps(publishedMap, computedMap, options = {}) {
  if (!(publishedMap instanceof Map) || !(computedMap instanceof Map)) {
    throw new RegimeError('Comparação exige dois mapas de taxas.');
  }
  const tolerance = parseDec(options.tolerance || '0.000001');
  const periods = [...new Set([...computedMap.keys(), ...publishedMap.keys()])].sort();
  const divergences = [];
  for (const period of periods) {
    const computed = computedMap.get(period);
    const published = publishedMap.get(period);
    if (computed === undefined) {
      divergences.push({ period, published: formatBR(published, 6), computed: null, difference: null });
      continue;
    }
    if (published === undefined) {
      divergences.push({ period, published: null, computed: formatBR(computed, 6), difference: null });
      continue;
    }
    const difference = sub(published, computed);
    const absolute = difference < 0n ? -difference : difference;
    if (absolute > tolerance) {
      divergences.push({ period, published: formatBR(published, 6), computed: formatBR(computed, 6), difference: formatBR(difference, 6) });
    }
  }
  return divergences;
}

export function regimeSummary(entry) {
  if (!entry || typeof entry !== 'object') throw new RegimeError('Regime desconhecido.');
  return {
    id: entry.id,
    from: entry.from,
    to: entry.to,
    correction: entry.correction,
    interest: entry.interest.kind,
    legalBasis: entry.legalBasis,
    note: entry.note
  };
}
