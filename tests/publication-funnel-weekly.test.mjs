import assert from 'node:assert/strict';
import {
  PUBLICATION_FUNNEL_HISTORY_LIMIT,
  computePublicationFunnelSnapshot,
  isoWeekOf,
  isoWeekRange,
  normalizePublicationFunnelHistory,
  saoPauloDateOnly,
  upsertPublicationFunnelSnapshot
} from '../lib/publications/publication-funnel-weekly.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — FUNIL SEMANAL DE PUBLICACOES (SNAPSHOT DURAVEL)     ');
console.log('===============================================================\n');

assert.equal(saoPauloDateOnly('2026-09-21T01:00:00.000Z'), '2026-09-20', 'Instante UTC de madrugada pertence ao dia anterior em Sao Paulo.');
assert.equal(saoPauloDateOnly('2026-09-20T15:00:00.000Z'), '2026-09-20');
assert.equal(saoPauloDateOnly('texto-invalido'), '');
console.log('✓ Conversao de instante para data civil de Sao Paulo.');

const week38 = isoWeekOf('2026-09-20');
assert.equal(week38.week, '2026-W38', 'Domingo pertence a semana ISO iniciada na segunda anterior.');
assert.deepEqual(isoWeekRange('2026-09-20'), { weekStart: '2026-09-14', weekEnd: '2026-09-20' });
const week39 = isoWeekOf('2026-09-21');
assert.equal(week39.week, '2026-W39', 'Segunda-feira abre a semana seguinte.');
assert.deepEqual(isoWeekRange('2026-09-21'), { weekStart: '2026-09-21', weekEnd: '2026-09-27' });
const newYear = isoWeekOf('2026-01-01');
assert.equal(newYear.week, '2026-W01', 'Ano que comeca na quinta mantem a semana ISO 01 com dias do ano anterior.');
assert.deepEqual(isoWeekRange('2026-01-01'), { weekStart: '2025-12-29', weekEnd: '2026-01-04' });
assert.equal(isoWeekOf('invalido'), null);
console.log('✓ Semanas ISO com virada de ano e limites segunda/domingo.');

const intimations = [
  { id: 'tratada', treatmentStatus: 'treated', publishedAt: '2026-09-16', treatedAt: '2026-09-18T12:00:00.000Z' },
  { id: 'descartada', treatmentStatus: 'discarded', publishedAt: '2026-09-20', discardedAt: '2026-09-20T23:00:00.000Z' },
  { id: 'pendente-antiga', treatmentStatus: 'untreated', publishedAt: '2026-09-10' },
  { id: 'em-analise', treatmentStatus: 'in_review', disponibilizadoEm: '2026-09-19' },
  { id: 'tratada-madrugada', treatmentStatus: 'treated', publishedAt: '2026-09-14', treatedAt: '2026-09-21T01:00:00.000Z' },
  { id: 'fundida', treatmentStatus: 'treated', publishedAt: '2026-09-15', treatedAt: '2026-09-16T12:00:00.000Z', mergedInto: 'tratada' }
];
const snapshot = computePublicationFunnelSnapshot({ intimations, now: '2026-09-20T15:00:00.000Z' });
assert.equal(snapshot.week, '2026-W38');
assert.equal(snapshot.weekStart, '2026-09-14');
assert.equal(snapshot.weekEnd, '2026-09-20');
assert.equal(snapshot.received, 4, 'Recebidas conta a coorte por data da fonte dentro da semana (fundida nao conta).');
assert.equal(snapshot.treated, 2, 'Tratadas conta o evento de tratamento na semana, inclusive madrugada de Sao Paulo.');
assert.equal(snapshot.discarded, 1);
assert.equal(snapshot.pending, 2, 'Pendentes e o estoque atual de untreated + in_review.');
assert.equal(snapshot.at, '2026-09-20T15:00:00.000Z');
console.log('✓ Coorte por data da fonte, fluxo de tratamento por semana e estoque pendente.');

const empty = computePublicationFunnelSnapshot({ intimations: [], now: '2026-09-20T15:00:00.000Z' });
assert.deepEqual(
  { received: empty.received, treated: empty.treated, discarded: empty.discarded, pending: empty.pending },
  { received: 0, treated: 0, discarded: 0, pending: 0 }
);
console.log('✓ Semana sem publicacoes produz snapshot zerado (nunca inventa dado).');

const first = upsertPublicationFunnelSnapshot(null, snapshot);
assert.equal(first.weeks.length, 1);
assert.equal(first.updatedAt, '2026-09-20T15:00:00.000Z');
const updated = upsertPublicationFunnelSnapshot(first, { ...snapshot, pending: 5, at: '2026-09-20T19:00:00.000Z' });
assert.equal(updated.weeks.length, 1, 'A mesma semana e substituida, nunca duplicada.');
assert.equal(updated.weeks[0].pending, 5);
const accumulated = upsertPublicationFunnelSnapshot(updated, {
  week: '2026-W39', weekStart: '2026-09-21', weekEnd: '2026-09-27',
  received: 3, treated: 1, discarded: 0, pending: 6, at: '2026-09-27T15:00:00.000Z'
});
assert.deepEqual(accumulated.weeks.map(entry => entry.week), ['2026-W38', '2026-W39'], 'Historico mantem ordem cronologica.');
const malformed = normalizePublicationFunnelHistory({
  weeks: [
    { week: 'semana-invalida' },
    { week: '2026-W39', weekStart: '2026-09-21', weekEnd: '2026-09-27', received: -5, treated: '2', pending: 1.9 },
    { week: '2026-W39', weekStart: '2026-09-21', weekEnd: '2026-09-27', received: 99 }
  ]
});
assert.equal(malformed.weeks.length, 1, 'Semanas invalidas e duplicadas sao descartadas na leitura.');
assert.equal(malformed.weeks[0].received, 0, 'Contagem negativa e normalizada para zero.');
assert.equal(malformed.weeks[0].treated, 2, 'Contagem textual e convertida.');
assert.equal(malformed.weeks[0].pending, 1, 'Contagem fracionaria e truncada.');
let capped = null;
for (let index = 0; index < PUBLICATION_FUNNEL_HISTORY_LIMIT + 4; index += 1) {
  capped = upsertPublicationFunnelSnapshot(capped, {
    week: `2026-W${String(index + 1).padStart(2, '0')}`,
    weekStart: '2026-01-05', weekEnd: '2026-01-11',
    received: index, treated: 0, discarded: 0, pending: index, at: '2026-01-11T15:00:00.000Z'
  });
}
assert.equal(capped.weeks.length, PUBLICATION_FUNNEL_HISTORY_LIMIT, 'Historico e limitado as semanas mais recentes.');
assert.equal(capped.weeks.at(-1).week, '2026-W16');
console.log('✓ Upsert idempotente, normalizacao fail-closed e teto de historico.');

console.log('\n>>> FUNIL SEMANAL DE PUBLICACOES: PASS <<<\n');
