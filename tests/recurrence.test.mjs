import assert from 'node:assert/strict';
import {
  RECURRENCE_MAX_OCCURRENCES,
  applyRecurrenceEdit,
  describeRecurrence,
  expandOccurrences,
  isSeriesException,
  isSeriesMaster,
  materializeCollection,
  materializeSeries,
  normalizeRecurrence,
  occurrenceId,
  parseOccurrenceId
} from '../js/core/recurrence.js';

console.log('\n===============================================================');
console.log('  ATRIUM — RECORRENCIA DE COMPROMISSOS E TAREFAS (FASE 4)       ');
console.log('===============================================================\n');

console.log('[C1] Regra normalizada e descrição...');
assert.equal(normalizeRecurrence(null), null);
assert.equal(normalizeRecurrence({ frequency: 'hourly' }), null);
assert.deepEqual(normalizeRecurrence({ frequency: 'weekly' }), { frequency: 'weekly', interval: 1 });
assert.deepEqual(normalizeRecurrence({ frequency: 'monthly', interval: 99, until: '2026-12-31', count: 999 }), { frequency: 'monthly', interval: 12, until: '2026-12-31', count: RECURRENCE_MAX_OCCURRENCES });
assert.equal(normalizeRecurrence({ frequency: 'daily', until: '31/12/2026' }).until, undefined, 'Data fora do formato ISO é descartada.');
assert.equal(describeRecurrence({ frequency: 'weekly' }), 'Repete a cada semana');
assert.equal(describeRecurrence({ frequency: 'daily', interval: 2 }), 'Repete a cada 2 dias');
assert.equal(describeRecurrence({ frequency: 'monthly', until: '2026-12-31' }), 'Repete a cada mês até 2026-12-31');
assert.equal(describeRecurrence(null), 'Sem repetição');
console.log('  ✓ Normalização fail-closed e rótulos legíveis.');

console.log('[C2] Expansão de ocorrências...');
assert.deepEqual(
  expandOccurrences({ frequency: 'daily' }, { startDate: '2026-09-21', limit: 4 }),
  ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']
);
assert.deepEqual(
  expandOccurrences({ frequency: 'weekly', interval: 2 }, { startDate: '2026-09-21', limit: 3 }),
  ['2026-09-21', '2026-10-05', '2026-10-19']
);
assert.deepEqual(
  expandOccurrences({ frequency: 'monthly' }, { startDate: '2026-01-31', limit: 3 }),
  ['2026-01-31', '2026-02-28', '2026-03-31'],
  'Mês sem o dia 31 usa o último dia disponível.'
);
assert.deepEqual(
  expandOccurrences({ frequency: 'daily', until: '2026-09-23' }, { startDate: '2026-09-21' }),
  ['2026-09-21', '2026-09-22', '2026-09-23']
);
assert.deepEqual(
  expandOccurrences({ frequency: 'daily', count: 2 }, { startDate: '2026-09-21' }),
  ['2026-09-21', '2026-09-22']
);
assert.deepEqual(
  expandOccurrences({ frequency: 'daily' }, { startDate: '2026-09-01', from: '2026-09-10', to: '2026-09-12' }),
  ['2026-09-10', '2026-09-11', '2026-09-12'],
  'Janela limita a materialização sem alterar a série.'
);
assert.equal(expandOccurrences({ frequency: 'daily' }, { startDate: '2026-09-21' }).length, RECURRENCE_MAX_OCCURRENCES, 'Expansão sem janela respeita o teto.');
assert.deepEqual(expandOccurrences({ frequency: 'daily' }, { startDate: 'invalida' }), []);
console.log('  ✓ Diária, semanal, mensal com clamp, until, count, janela e teto.');

console.log('[C3] Identidade de ocorrência e detecção de série...');
assert.equal(occurrenceId('task-1', '2026-09-21'), 'task-1::2026-09-21');
assert.deepEqual(parseOccurrenceId('task-1::2026-09-21'), { seriesId: 'task-1', date: '2026-09-21' });
assert.equal(parseOccurrenceId('task-1'), null);
assert.equal(parseOccurrenceId('task-1::invalida'), null);
const master = { id: 'task-1', title: 'Protocolar', deadline: '2026-09-21', recurrence: { rule: { frequency: 'daily' }, seriesId: 'task-1', startDate: '2026-09-21' } };
assert.equal(isSeriesMaster(master), true);
assert.equal(isSeriesMaster({ id: 'x' }), false);
const exception = { id: 'task-1::2026-09-23', recurrence: { exceptionOf: 'task-1', occurrenceDate: '2026-09-23' } };
assert.equal(isSeriesException(exception), true);
console.log('  ✓ Ocorrência virtual identificável e exceção detectável.');

console.log('[C4] Materialização com exceções e tombstone...');
const occurrences = materializeSeries(master, {
  exceptions: [
    { id: 'task-1::2026-09-23', title: 'Protocolar (adiado)', deadline: '2026-09-24', recurrence: { exceptionOf: 'task-1', occurrenceDate: '2026-09-23' } },
    { id: 'task-1::2026-09-25', recurrence: { exceptionOf: 'task-1', occurrenceDate: '2026-09-25', skipped: true } }
  ],
  limit: 6
});
assert.deepEqual(occurrences.map(item => item.date), ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-26']);
assert.equal(occurrences[2].title, 'Protocolar (adiado)', 'Exceção sobrepõe o mestre.');
assert.equal(occurrences[2].virtual, false);
assert.equal(occurrences[0].virtual, true);
assert.equal(occurrences.find(item => item.date === '2026-09-25'), undefined, 'Tombstone remove a ocorrência.');
assert.equal(master.deadline, '2026-09-21', 'Mestre permanece intacto.');
console.log('  ✓ Exceções, adiamento e cancelamento por ocorrência.');

console.log('[C5] Edição com escopo...');
const collection = [
  { id: 'task-1', title: 'Protocolar', deadline: '2026-09-21', recurrence: { rule: { frequency: 'weekly' }, seriesId: 'task-1', startDate: '2026-09-21' } },
  { id: 'other', title: 'Sem série', deadline: '2026-09-22' }
];
const single = applyRecurrenceEdit({ items: collection, masterId: 'task-1', occurrenceDate: '2026-09-28', scope: 'single', patch: { title: 'Protocolar (reagendado)' }, createId: () => 'series-nova' });
assert.equal(single.ok, true);
assert.equal(single.exceptionId, 'task-1::2026-09-28');
assert.equal(single.items.find(item => item.id === single.exceptionId).title, 'Protocolar (reagendado)');
assert.equal(single.items.find(item => item.id === 'task-1').recurrence.rule.frequency, 'weekly', 'Mestre não muda em edição single.');
const removal = applyRecurrenceEdit({ items: single.items, masterId: 'task-1', occurrenceDate: '2026-10-05', scope: 'single', remove: true });
assert.equal(removal.items.find(item => item.id === 'task-1::2026-10-05').recurrence.skipped, true);

const following = applyRecurrenceEdit({ items: collection, masterId: 'task-1', occurrenceDate: '2026-10-05', scope: 'following', patch: { title: 'Protocolar (nova fase)' }, newRule: { frequency: 'daily' }, createId: () => 'series-nova' });
assert.equal(following.ok, true);
assert.equal(following.newSeriesId, 'series-nova');
assert.equal(following.items.find(item => item.id === 'task-1').recurrence.rule.until, '2026-10-04', 'Mestre antigo encerra um dia antes.');
const nova = following.items.find(item => item.id === 'series-nova');
assert.equal(nova.recurrence.rule.frequency, 'daily');
assert.equal(nova.recurrence.startDate, '2026-10-05');
assert.equal(nova.title, 'Protocolar (nova fase)');
const beforeStart = applyRecurrenceEdit({ items: collection, masterId: 'task-1', occurrenceDate: '2026-09-21', scope: 'following' });
assert.equal(beforeStart.reason, 'following-before-start', 'Divisão na primeira ocorrência exige edição de série.');

const wholeSeries = applyRecurrenceEdit({ items: collection, masterId: 'task-1', occurrenceDate: '2026-09-28', scope: 'series', patch: { title: 'Protocolar (série)' }, newRule: { frequency: 'monthly' } });
assert.equal(wholeSeries.items.find(item => item.id === 'task-1').title, 'Protocolar (série)');
assert.equal(wholeSeries.items.find(item => item.id === 'task-1').recurrence.rule.frequency, 'monthly');
assert.equal(applyRecurrenceEdit({ items: collection, masterId: 'inexistente', occurrenceDate: '2026-09-28', scope: 'single' }).ok, false);
assert.equal(applyRecurrenceEdit({ items: collection, masterId: 'task-1', occurrenceDate: '2026-09-28', scope: 'tudo' }).ok, false);
assert.equal(applyRecurrenceEdit({ items: collection, masterId: 'task-1', occurrenceDate: 'invalida', scope: 'single' }).ok, false);
console.log('  ✓ Escopos single/following/series e recusas fail-closed.');

console.log('[C6] Materialização de coleção...');
const mixed = materializeCollection([
  ...collection,
  { id: 'task-1::2026-09-28', title: 'Protocolar (reagendado)', deadline: '2026-09-29', recurrence: { exceptionOf: 'task-1', occurrenceDate: '2026-09-28' } }
], { from: '2026-09-21', to: '2026-10-12' });
assert.equal(mixed.some(item => item.id === 'task-1'), false, 'Mestre é substituído pelas ocorrências.');
assert.equal(mixed.some(item => item.id === 'other'), true, 'Item sem série permanece.');
assert.equal(mixed.find(item => item.id === 'task-1::2026-09-28').title, 'Protocolar (reagendado)');
assert.equal(mixed.find(item => item.id === 'task-1::2026-09-21').virtual, true);
assert.equal(materializeCollection([{ id: 'plain' }]).length, 1, 'Coleção sem séries é devolvida como está.');
console.log('  ✓ Coleção materializada sem duplicar exceções.');

console.log('\n>>> RECORRENCIA DE COMPROMISSOS E TAREFAS: PASS <<<\n');
