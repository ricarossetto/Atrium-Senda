import assert from 'node:assert/strict';
import {
  IndicesError,
  SGS_BASE_URL,
  SGS_SERIES,
  monthAfter,
  periodFromDate,
  normalizeSgsRows,
  accumulatedFactors,
  factorBetween,
  prorataMonthlyRate,
  fetchSeries,
  describeSeries,
  factorSummary
} from '../lib/calc/indices.mjs';
import { toFixedString } from '../lib/calc/decimal.mjs';

const rowsVariation = [
  { data: '31/01/2026', valor: '1.00' },
  { data: '28/02/2026', valor: '2.00' },
  { data: '31/03/2026', valor: '-0.50' }
];

const normalized = normalizeSgsRows(rowsVariation, 'fixture');
assert.equal(normalized.length, 3);
assert.equal(normalized[0].date, '2026-01-31');
assert.equal(normalized[0].period, '2026-01');
assert.equal(toFixedString(normalized[0].value, 2), '1.00');

const reversed = normalizeSgsRows([...rowsVariation].reverse());
assert.deepEqual(reversed.map(row => row.period), ['2026-01', '2026-02', '2026-03'], 'Pontos devem ser ordenados por data.');

const deduped = normalizeSgsRows([{ data: '31/01/2026', valor: '1.00' }, { data: '31/01/2026', valor: '1.25' }]);
assert.equal(deduped.length, 1);
assert.equal(toFixedString(deduped[0].value, 2), '1.25', 'Data repetida mantém o último valor recebido.');

assert.throws(() => normalizeSgsRows('não é lista'), IndicesError);
assert.throws(() => normalizeSgsRows([{ data: '31/13/2026', valor: '1.00' }]), IndicesError);
assert.throws(() => normalizeSgsRows([{ data: '31/01/2026', valor: 'abc' }]), IndicesError);
assert.throws(() => normalizeSgsRows([null]), IndicesError);

const points = normalizeSgsRows(rowsVariation, 'fixture');
const factors = accumulatedFactors(points, { label: 'fixture' });
assert.equal(toFixedString(factors.get('2026-01'), 6), '1.010000');
assert.equal(toFixedString(factors.get('2026-02'), 6), '1.030200');
assert.equal(toFixedString(factors.get('2026-03'), 6), '1.025049');
assert.throws(() => accumulatedFactors([], { label: 'fixture' }), IndicesError);
assert.throws(() => accumulatedFactors(points, { kind: 'percent-day', label: 'fixture' }), IndicesError);
assert.throws(() => accumulatedFactors(rowsVariation, { label: 'fixture' }), IndicesError, 'Ponto cru do SGS não pode ser aceito sem normalização.');

assert.equal(toFixedString(factorBetween(points, '2026-01', '2026-03'), 6), '1.014900');
assert.equal(toFixedString(factorBetween(points, '2026-02', '2026-02'), 6), '1.000000');
assert.equal(toFixedString(factorBetween(points, '2026-03', '2026-03'), 6), '1.000000');
assert.throws(() => factorBetween(points, '2026-03', '2026-01'), IndicesError);
assert.throws(() => factorBetween(points, '2025-12', '2026-03'), IndicesError);
assert.throws(() => factorBetween(points, '2026-01', '2026-05'), IndicesError, 'Mês ausente não pode ser silenciado.');

const withGap = normalizeSgsRows([{ data: '31/01/2026', valor: '1.00' }, { data: '31/03/2026', valor: '1.00' }], 'gap');
assert.throws(() => factorBetween(withGap, '2026-01', '2026-03'), IndicesError, 'Lacuna entre meses deve falhar de forma explícita.');

const factorRows = normalizeSgsRows([
  { data: '31/08/2024', valor: '1.00060000' },
  { data: '30/09/2024', valor: '1.00090000' }
], 'fatores');
assert.equal(toFixedString(factorBetween(factorRows, '2024-08', '2024-09', { kind: 'factor' }), 8), '1.00090000');
assert.equal(toFixedString(accumulatedFactors(factorRows, { kind: 'factor' }).get('2024-09'), 8), '1.00150054');

assert.equal(toFixedString(prorataMonthlyRate('0.605306', 15, 31), 6), '0.292890');
assert.equal(toFixedString(prorataMonthlyRate('0.605306', 0, 31), 6), '0.000000');
assert.equal(toFixedString(prorataMonthlyRate('0.605306', 31, 31), 6), '0.605306');
assert.throws(() => prorataMonthlyRate('1', 32, 31), IndicesError);
assert.throws(() => prorataMonthlyRate('1', -1, 31), IndicesError);
assert.throws(() => prorataMonthlyRate('1', 1, 0), IndicesError);

assert.equal(periodFromDate('2026-09-18'), '2026-09');
assert.throws(() => periodFromDate('2026-02-30'), IndicesError);
assert.equal(monthAfter('2026-12'), '2027-01');
assert.equal(monthAfter('2026-01'), '2026-02');
assert.throws(() => monthAfter('2026-13'), IndicesError);

const calls = [];
const payloads = [
  [{ data: '31/01/2000', valor: '0.50' }],
  [{ data: '31/01/2010', valor: '0.40' }],
  [{ data: '31/01/2020', valor: '0.30' }]
];
const merged = await fetchSeries(433, {
  from: '2000-01-01',
  to: '2024-12-31',
  fetchImpl: async (url) => {
    calls.push(url);
    return { ok: true, status: 200, json: async () => payloads[calls.length - 1] };
  }
});
assert.equal(calls.length, 3, 'Janela de 10 anos do SGS deve ser dividida em 3 consultas.');
assert.equal(calls[0], `${SGS_BASE_URL}/bcdata.sgs.433/dados?formato=json&dataInicial=01/01/2000&dataFinal=31/12/2009`);
assert.equal(calls[1], `${SGS_BASE_URL}/bcdata.sgs.433/dados?formato=json&dataInicial=01/01/2010&dataFinal=31/12/2019`);
assert.equal(calls[2], `${SGS_BASE_URL}/bcdata.sgs.433/dados?formato=json&dataInicial=01/01/2020&dataFinal=31/12/2024`);
assert.deepEqual(merged.map(row => row.period), ['2000-01', '2010-01', '2020-01']);

const singleCall = [];
const single = await fetchSeries(226, {
  from: '2016-03-01',
  to: '2016-03-31',
  fetchImpl: async (url) => {
    singleCall.push(url);
    return { ok: true, status: 200, json: async () => [{ data: '31/03/2016', valor: '0.10' }] };
  }
});
assert.equal(singleCall.length, 1);
assert.ok(singleCall[0].includes('dataInicial=01/03/2016'));
assert.ok(singleCall[0].includes('dataFinal=31/03/2016'));
assert.equal(single.length, 1);

await assert.rejects(
  () => fetchSeries(433, { from: '2026-01-01', to: '2026-01-31', fetchImpl: async () => ({ ok: false, status: 500, json: async () => null }) }),
  IndicesError
);
await assert.rejects(
  () => fetchSeries(433, { from: '2026-01-01', to: '2026-01-31', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ erro: true }) }) }),
  IndicesError
);
await assert.rejects(
  () => fetchSeries(433, { from: '2026-01-31', to: '2026-01-01', fetchImpl: async () => ({ ok: true, status: 200, json: async () => [] }) }),
  IndicesError
);
await assert.rejects(
  () => fetchSeries(433, { from: '2026-01-01', to: '2026-01-31', fetchImpl: async () => { throw new Error('offline'); } }),
  IndicesError
);

assert.equal(Object.isFrozen(SGS_SERIES), true, 'Catálogo de séries deve ser imutável.');
assert.equal(SGS_SERIES.IPCA_MONTHLY.code, 433);
assert.equal(SGS_SERIES.INPC_MONTHLY.code, 188);
assert.equal(SGS_SERIES.IGP_M_MONTHLY.code, 189);
assert.equal(SGS_SERIES.IPCA_15_MONTHLY.code, 7478);
assert.equal(SGS_SERIES.IPCA_E_MONTHLY.code, 10764);
assert.equal(SGS_SERIES.TR_MONTHLY.code, 226);
assert.equal(SGS_SERIES.TR_MONTHLY.kind, 'percent-day', 'Série 226 é divulgação diária e não entra em cadeia mensal.');
assert.equal(SGS_SERIES.TR_FIRST_DAY.code, 7811);
assert.equal(SGS_SERIES.TR_FIRST_DAY.kind, 'percent-month');
assert.throws(() => accumulatedFactors([{ period: '2026-01', date: '2026-01-01', value: 1n }], { kind: 'percent-day', label: 'tr' }), IndicesError);
assert.equal(SGS_SERIES.SELIC_DAILY.code, 11);
assert.equal(SGS_SERIES.SELIC_MONTH_ACCUMULATED.code, 4390);
assert.equal(SGS_SERIES.TAXA_LEGAL_SELIC_FACTOR.code, 29541);
assert.equal(SGS_SERIES.TAXA_LEGAL_IPCA_FACTOR.code, 29542);
assert.equal(SGS_SERIES.TAXA_LEGAL_MONTHLY.code, 29543);
assert.equal(describeSeries(SGS_SERIES.TAXA_LEGAL_MONTHLY).verifiedVia, 'resolucao-cmn-5171-trf4');
assert.throws(() => describeSeries(null), IndicesError);

const summary = factorSummary(points);
assert.deepEqual(summary.map(item => item.period), ['2026-01', '2026-02', '2026-03']);
assert.equal(summary[2].factor, '1.025049000000');

console.log('Índices SGS aprovados: normalização, catálogo com procedência, fatores acumulados, janelas de 10 anos e pró-rata PASS.');
