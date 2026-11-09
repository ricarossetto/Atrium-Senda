import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectAgendaActivities } from '../js/features/agenda.js';
import { createAgendaFeature } from '../js/features/agenda.js';
import { materializeCollection } from '../js/core/recurrence.js';

console.log('\n===============================================================');
console.log('  ATRIUM — RECORRENCIA NA AGENDA (SERIES E ESCOPO DE EDICAO)    ');
console.log('===============================================================\n');

const featureSource = readFileSync(new URL('../js/features/agenda.js', import.meta.url), 'utf8');
assert.match(featureSource, /materializeCollection\(store\.state\.agenda/, 'Agenda deve materializar séries na leitura.');
assert.match(featureSource, /applyRecurrenceEdit\(/, 'Edição de ocorrência deve usar o motor de recorrência.');
assert.match(featureSource, /recurrenceScope/, 'Modal de ocorrência deve pedir o escopo.');
console.log('✓ Wiring do motor de recorrência na agenda.');

function fakeStore() {
  const audits = [];
  return {
    state: { agenda: [], contacts: [], processes: [], tasks: [], intimations: [] },
    audits,
    upsert(collection, record) {
      const index = this.state[collection].findIndex(item => item.id === record.id);
      if (index >= 0) this.state[collection][index] = { ...this.state[collection][index], ...record };
      else this.state[collection].unshift(record);
      return record;
    },
    audit(action, detail) { audits.push({ action, detail }); }
  };
}
let modalContract = null;
const store = fakeStore();
const feature = createAgendaFeature({
  store,
  documentRef: { getElementById: () => null, documentElement: { dataset: { ui: 'v2' } } },
  openModal: (...args) => { modalContract = args; },
  showToast: () => {},
  formatDate: value => `DATA:${value}`,
  formatMinutes: value => `${value} min`,
  totalTimeMinutes: () => 0,
  classifyIntimation: () => ({ label: 'Ato', css: 'neutral' }),
  getIntimationParties: () => [],
  onOpenTask: () => {},
  onOpenIntimation: () => {},
  presenter: null
});

const created = feature.saveRecord({ title: 'Reunião semanal', date: '2026-09-21', recurrenceFrequency: 'weekly' }, {});
assert.equal(created.recurrence.rule.frequency, 'weekly');
assert.equal(created.recurrence.seriesId, created.id);
assert.equal(created.recurrence.startDate, '2026-09-21');
assert.equal(store.audits.at(-1).action, 'Compromisso recorrente cadastrado');
assert.match(store.audits.at(-1).detail, /Repete a cada semana/);

const plain = feature.saveRecord({ title: 'Compromisso avulso', date: '2026-09-22' }, {});
assert.equal(plain.recurrence, undefined);
assert.equal(store.audits.at(-1).action, 'Compromisso cadastrado', 'Cadastro simples mantém auditoria anterior.');
console.log('✓ Cadastro recorrente guarda regra/série; avulso permanece igual.');

const master = store.state.agenda.find(item => item.id === created.id);
feature.openModal({ ...master, id: `${created.id}::2026-09-28`, recurrence: { ...master.recurrence, exceptionOf: created.id, occurrenceDate: '2026-09-28' } });
assert.deepEqual(modalContract[3].map(field => field.name).slice(-1), ['recurrenceScope']);
assert.deepEqual(modalContract[3].find(field => field.name === 'recurrenceScope').options.map(option => option.value), ['single', 'following', 'series']);
assert.equal(modalContract[4].recurrenceScope, 'series');

feature.openModal({ id: master.id, title: master.title, date: master.date, recurrence: master.recurrence });
assert.deepEqual(modalContract[3].map(field => field.name).slice(-1), ['recurrenceFrequency'], 'Mestre permite alterar/encerrar a repetição.');
assert.equal(modalContract[4].recurrenceFrequency, 'weekly');

feature.openModal({ id: 'evento-sem-serie', title: 'Avulso', date: '2026-09-22' });
assert.deepEqual(modalContract[3].map(field => field.name).slice(-1), ['description'], 'Evento avulso existente mantém o formulário atual.');
console.log('✓ Modal pede escopo na ocorrência e repetição no mestre/novo.');

const singleEdit = feature.saveRecord({ title: 'Reunião adiada', recurrenceScope: 'single' }, { id: `task-inexistente::2026-09-28` });
assert.equal(singleEdit, null, 'Ocorrência de série inexistente não cria nada.');
const single = feature.saveRecord({ title: 'Reunião adiada', recurrenceScope: 'single' }, { id: `${master.id}::2026-09-28`, title: master.title, recurrence: { ...master.recurrence, occurrenceDate: '2026-09-28' } });
assert.equal(single.id, `${master.id}::2026-09-28`);
assert.equal(single.title, 'Reunião adiada');
assert.equal(store.state.agenda.find(item => item.id === master.id).title, master.title, 'Mestre não muda em edição de ocorrência.');
assert.equal(store.audits.at(-1).action, 'Compromisso atualizado (ocorrência da série)');

const following = feature.saveRecord({ title: 'Reunião (nova fase)', recurrenceScope: 'following' }, { id: `${master.id}::2026-10-05`, title: master.title, recurrence: { ...master.recurrence, occurrenceDate: '2026-10-05' } });
const oldMaster = store.state.agenda.find(item => item.id === master.id);
assert.equal(oldMaster.recurrence.rule.until, '2026-10-04');
const newMaster = store.state.agenda.find(item => item.id === following.id);
assert.equal(newMaster.recurrence.startDate, '2026-10-05');
assert.equal(newMaster.title, 'Reunião (nova fase)');
assert.equal(store.audits.at(-1).action, 'Série de compromissos dividida');

const seriesEdit = feature.saveRecord({ title: 'Reunião semanal (ajustada)', recurrenceScope: 'series' }, { id: `${master.id}::2026-09-28`, title: master.title, recurrence: { ...master.recurrence, occurrenceDate: '2026-09-28' } });
assert.equal(seriesEdit.title, 'Reunião semanal (ajustada)');
assert.equal(store.state.agenda.find(item => item.id === master.id).title, 'Reunião semanal (ajustada)');
assert.equal(store.audits.at(-1).action, 'Série de compromissos atualizada');

const stopped = feature.saveRecord({ title: 'Reunião semanal (ajustada)', date: oldMaster.date, recurrenceFrequency: '' }, { id: master.id, title: master.title, date: master.date, recurrence: master.recurrence });
assert.equal(stopped.recurrence, undefined, 'Escolher "Não repetir" encerra a série.');
assert.equal(store.audits.at(-1).action, 'Compromisso atualizado');
console.log('✓ Escopos single/following/series e encerramento da repetição.');

const collection = materializeCollection([
  { id: 'master', title: 'Reunião', date: '2026-09-21', recurrence: { rule: { frequency: 'weekly' }, seriesId: 'master', startDate: '2026-09-21' } },
  { id: 'master::2026-09-28', title: 'Reunião adiada', date: '2026-09-28', recurrence: { exceptionOf: 'master', occurrenceDate: '2026-09-28' } }
], { from: '2026-09-21', to: '2026-10-05' });
const activities = collectAgendaActivities({
  agenda: collection,
  tasks: [],
  intimations: [],
  selectedDate: null,
  typeFilter: 'all',
  today: '2026-09-21',
  classifyIntimation: () => ({ label: 'Ato', css: 'neutral' }),
  getIntimationParties: () => [],
  totalTimeMinutes: () => 0
});
assert.deepEqual(activities.activities.map(item => item.id), ['master::2026-09-21', 'master::2026-09-28', 'master::2026-10-05']);
assert.equal(activities.activities.find(item => item.id === 'master::2026-09-28').title, 'Reunião adiada');
assert.equal(activities.activities[0].recurring, true);
assert.match(activities.activities[0].subtitle, /Série recorrente/);
console.log('✓ Agenda materializa ocorrências com exceção e marcador de série.');

console.log('\n>>> RECORRENCIA NA AGENDA: PASS <<<\n');
