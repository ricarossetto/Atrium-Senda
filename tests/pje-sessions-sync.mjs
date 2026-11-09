import assert from 'node:assert/strict';
import { reconcileEprocSessions } from '../lib/judicial/eproc/sync/sessions-sync.mjs';

let assertions = 0;
const ok = (condition, message) => { assert.ok(condition, message); assertions += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };

console.log('--- Iniciando Testes: sessões do PJe na Agenda ---');

const presencial = {
  cnj: '50000000020268210001',
  processNumber: '5000000-00.2026.8.21.0001',
  sessionStart: '2026-11-15T14:00:00',
  sessionEnd: '',
  sessionMode: 'PRESENCIAL',
  panel: '1ª Câmara Cível',
  sequential: '12',
  status: 'DESIGNADA',
  event: 'Sessão de Julgamento Presencial'
};
const assincrona = {
  cnj: '50000000020268210002',
  processNumber: '5000000-00.2026.8.21.0002',
  sessionStart: '2026-10-28T00:00:00',
  sessionEnd: '2026-10-30T17:00:00',
  sessionMode: 'VIRTUAL_ASSINCRONA',
  panel: '15ª Câmara Cível',
  sequential: '341',
  status: 'DESIGNADA',
  event: 'Sessão Virtual Assíncrona'
};

const state = { agenda: [] };
const base = {
  portalId: 'pje-tjmt-2g',
  portalLabel: 'TJMT 2G',
  sourcePrefix: 'pje'
};

const first = reconcileEprocSessions(state, {
  ...base,
  collectedAt: '2026-10-30T05:00:00.000Z',
  sessions: [presencial, assincrona],
  collectionStatus: { discovered: true, collected: true }
});
eq(first.created, 2, 'cria as duas sessões');
const presencialEvent = state.agenda.find(item => item.processNumber === presencial.processNumber);
const assincronaEvent = state.agenda.find(item => item.processNumber === assincrona.processNumber);
eq(presencialEvent.source, 'pje TJMT 2G', 'origem com prefixo pje');
eq(presencialEvent.hearingType, 'SESSÃO DE JULGAMENTO', 'tipo de audiência');
eq(presencialEvent.date, '2026-11-15', 'data');
eq(presencialEvent.time, '14:00', 'hora');
eq(presencialEvent.sourceStatus, 'active', 'situação ativa');
ok(!('deadline' in presencialEvent) && !('fatalDeadline' in presencialEvent) && !('taskId' in presencialEvent), 'não cria prazo nem tarefa');
ok(String(presencialEvent.id).startsWith('pje:'), 'id com prefixo pje');
eq(assincronaEvent.sessionEnd, '2026-10-30T17:00:00', 'período preservado');
eq(assincronaEvent.title, 'Sessão de Julgamento — 15ª Câmara Cível', 'título com o órgão');

const second = reconcileEprocSessions(state, {
  ...base,
  collectedAt: '2026-10-30T06:00:00.000Z',
  sessions: [presencial, assincrona],
  collectionStatus: { discovered: true, collected: true }
});
eq(second.created, 0, 'não duplica');
eq(second.unchanged, 2, 'reconhece inalteradas');
eq(state.agenda.length, 2, 'duas entradas');

reconcileEprocSessions(state, {
  ...base,
  collectedAt: '2026-10-30T07:00:00.000Z',
  sessions: [],
  collectionStatus: { discovered: true, collected: false }
});
eq(state.agenda.filter(item => item.sourceStatus === 'active').length, 2, 'ausência sem coleta completa não inativa');

const completeEmpty = reconcileEprocSessions(state, {
  ...base,
  collectedAt: '2026-10-30T08:00:00.000Z',
  sessions: [],
  collectionStatus: { discovered: true, collected: true }
});
eq(completeEmpty.inactive, 2, 'lista completa e vazia inativa');
eq(state.agenda.filter(item => item.sourceStatus === 'active').length, 0, 'nenhuma ativa');

console.log(`✓ ${assertions} verificações aprovadas.`);
console.log('PASS: sessões do PJe reconciliadas.');
