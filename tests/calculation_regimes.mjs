import assert from 'node:assert/strict';
import {
  RegimeError,
  REGIMES,
  REGIME_TRACKS,
  regimeForDate,
  timelineForTrack,
  taxaLegalFromFactors,
  taxaLegalFromSeries,
  simpleRatesSum,
  compareRateMaps,
  regimeSummary
} from '../lib/calc/regimes.mjs';
import { normalizeSgsRows } from '../lib/calc/indices.mjs';
import { toFixedString, parseDec } from '../lib/calc/decimal.mjs';

function addDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

assert.equal(Object.isFrozen(REGIMES), true);
assert.equal(Object.isFrozen(REGIME_TRACKS), true);
for (const [key, entry] of Object.entries(REGIMES)) {
  assert.equal(entry.id, key, `Regime ${key}: identificador deve coincidir com a chave.`);
  assert.ok(entry.from && entry.legalBasis && entry.correction, `Regime ${key}: metadados obrigatórios ausentes.`);
  assert.ok(entry.interest && entry.interest.kind, `Regime ${key}: tipo de juros ausente.`);
}

for (const track of ['geral', 'fazendaPublica']) {
  const timeline = timelineForTrack(track);
  for (let index = 0; index < timeline.length - 1; index += 1) {
    const current = timeline[index];
    const next = timeline[index + 1];
    assert.ok(current.to, `Trilha ${track}: regime intermediário ${current.id} precisa de data final.`);
    assert.equal(addDays(current.to, 1), next.from, `Trilha ${track}: lacuna ou sobreposição entre ${current.id} e ${next.id}.`);
  }
}

assert.equal(regimeForDate('geral', '2010-06-01').id, 'CC_2002');
assert.equal(regimeForDate('geral', '2024-08-29').id, 'CC_2002');
assert.equal(regimeForDate('geral', '2024-08-30').id, 'LEI_14905');
assert.equal(regimeForDate('geral', '2026-09-18').id, 'LEI_14905');
assert.equal(regimeForDate('fazendaPublica', '2021-12-08').id, 'FAZENDA_11960');
assert.equal(regimeForDate('fazendaPublica', '2021-12-09').id, 'FAZENDA_EC113');
assert.equal(regimeForDate('precatorios', '2026-01-01').id, 'PRECATORIOS_CNJ_303');
assert.equal(regimeForDate('precatoriosFederais', '2025-09-01').id, 'PRECATORIOS_FEDERAIS_EC136');
assert.throws(() => regimeForDate('inexistente', '2026-01-01'), RegimeError);
assert.throws(() => regimeForDate('geral', '2026-02-30'), Error);

assert.equal(toFixedString(taxaLegalFromFactors('1.00090000', '1.00040000'), 6), '0.049980');
assert.equal(toFixedString(taxaLegalFromFactors('1.00040000', '1.00090000'), 6), '0.000000', 'Taxa legal negativa vira zero.');
assert.equal(toFixedString(taxaLegalFromFactors('1.0004', '1.0004'), 6), '0.000000');
assert.throws(() => taxaLegalFromFactors('0', '1.0004'), RegimeError);
assert.throws(() => taxaLegalFromFactors('1.0004', '0'), RegimeError);

const selicPoints = normalizeSgsRows([
  { data: '31/08/2024', valor: '1.00060000' },
  { data: '30/09/2024', valor: '1.00090000' }
], 'selic');
const ipcaPoints = normalizeSgsRows([
  { data: '31/08/2024', valor: '1.00020000' },
  { data: '30/09/2024', valor: '1.00040000' }
], 'ipca');
const computed = taxaLegalFromSeries(selicPoints, ipcaPoints);
assert.equal(computed.size, 2);
assert.equal(toFixedString(computed.get('2024-09'), 6), '0.049980');
assert.equal(toFixedString(computed.get('2024-08'), 6), '0.039992');
assert.throws(() => taxaLegalFromSeries(selicPoints, ipcaPoints.slice(0, 1)), RegimeError, 'Período sem fator IPCA deve falhar.');
assert.throws(() => taxaLegalFromSeries([], ipcaPoints), RegimeError);
assert.throws(() => taxaLegalFromSeries([{ period: '2024-09', valor: '1.0009' }], ipcaPoints), RegimeError, 'Ponto cru não pode ser aceito sem normalização.');

assert.equal(toFixedString(simpleRatesSum(['0.5', '0.7']), 2), '1.20');
assert.throws(() => simpleRatesSum([]), RegimeError);
assert.throws(() => simpleRatesSum('0.5'), RegimeError);

const published = new Map([
  ['2024-08', parseDec('0.039992')],
  ['2024-09', parseDec('0.0499805')],
  ['2024-10', parseDec('0.060000')]
]);
const divergences = compareRateMaps(published, computed);
assert.equal(divergences.length, 1, 'Divergência fora da tolerância deve ser listada uma única vez.');
assert.equal(divergences[0].period, '2024-10');
assert.equal(divergences[0].published, '0,060000');
assert.equal(divergences[0].computed, null);
const strictDivergences = compareRateMaps(published, computed, { tolerance: '0.0000001' });
assert.equal(strictDivergences.length, 2, 'Tolerância menor captura a diferença de 0,5 micro.');
assert.throws(() => compareRateMaps([], new Map()), RegimeError);

assert.equal(regimeSummary(REGIMES.LEI_14905).interest, 'taxa-legal');
assert.throws(() => regimeSummary(null), RegimeError);

console.log('Regimes civis aprovados: trilhas contínuas, marcos EC 113/Lei 14.905, taxa legal auditável e comparação com tolerância PASS.');
