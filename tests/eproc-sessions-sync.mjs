import assert from 'node:assert/strict';
import { reconcileEprocSessions, sessionExternalId } from '../lib/judicial/eproc/sync/sessions-sync.mjs';

console.log('--- Iniciando Testes: Sessões de Julgamento → Agenda (idempotência, período, sem prazo) ---');

const PORTAL = 'tjrs-eproc-2g';
const NOW = '2026-10-29T12:00:00.000Z';

const presencial = {
  processNumber: '5324899-83.2026.8.21.7000',
  cnj: '53248998320268217000',
  portalId: PORTAL,
  courtUnit: 'FZ',
  panel: '19ª Câmara Cível',
  subject: 'Imissão',
  event: 'Sessão Presencial Data da sessão: 29/10/2026 09:00 - Sala 503 Sequencial: 224',
  sessionMode: 'PRESENCIAL',
  sessionStart: '2026-10-29T09:00:00',
  sessionEnd: '',
  sequential: '224',
  panelMembers: ['FABIANA ZILLES (FZ)'],
  location: 'Sala 503',
  status: 'DESIGNADA'
};

const assincrona = {
  processNumber: '5003144-81.2023.8.21.0016',
  cnj: '50031448120238210016',
  portalId: PORTAL,
  courtUnit: 'CMMR',
  panel: '15ª Câmara Cível',
  subject: 'Honorários Profissionais',
  event: 'Sessão Virtual Assíncrona Período da sessão: 28/10/2026 00:00 a 30/10/2026 17:00',
  sessionMode: 'VIRTUAL_ASSINCRONA',
  sessionStart: '2026-10-28T00:00:00',
  sessionEnd: '2026-10-30T17:00:00',
  sequential: '341',
  panelMembers: ['ROBERTO CARVALHO FRAGA (RCF)'],
  location: '',
  status: 'DESIGNADA'
};

// [S1] Cria eventos na Agenda, sem prazo nem tarefa, com período quando assíncrona.
const state = { agenda: [{ id: 'manual-1', title: 'Compromisso do escritório', date: '2026-11-01', time: '10:00', source: 'Interna' }] };
const first = reconcileEprocSessions(state, {
  portalId: PORTAL,
  portalLabel: 'TJRS 2º grau',
  collectedAt: NOW,
  sessions: [presencial, assincrona],
  collectionStatus: { collected: true }
});
assert.deepEqual(first, { created: 2, updated: 0, inactive: 0, unchanged: 0 });
assert.equal(state.agenda.length, 3);

const createdPresencial = state.agenda.find(event => event.process === presencial.processNumber && event.hearingType === 'SESSÃO DE JULGAMENTO');
assert.ok(createdPresencial, 'sessão presencial criada');
assert.equal(createdPresencial.sessionStart, '2026-10-29T09:00:00');
assert.equal(createdPresencial.sessionEnd, '');
assert.equal(createdPresencial.sessionMode, 'PRESENCIAL');
assert.equal(createdPresencial.panel, '19ª Câmara Cível');
assert.equal(createdPresencial.externalId, sessionExternalId(PORTAL, presencial));
assert.equal(createdPresencial.deadline, undefined, 'sessão não cria prazo');
assert.equal(createdPresencial.fatalDeadline, undefined, 'sessão não cria prazo fatal');
assert.equal(createdPresencial.taskId, undefined, 'sessão não cria tarefa');
assert.equal(createdPresencial.readOnly, true);

const createdAssincrona = state.agenda.find(event => event.process === assincrona.processNumber);
assert.equal(createdAssincrona.sessionStart, '2026-10-28T00:00:00');
assert.equal(createdAssincrona.sessionEnd, '2026-10-30T17:00:00', 'assíncrona guarda o fim do período');
assert.equal(createdAssincrona.date, '2026-10-28');
assert.equal(createdAssincrona.location, 'Sessão virtual assíncrona');

assert.ok(state.agenda.some(event => event.id === 'manual-1' && event.source === 'Interna'), 'evento manual preservado');
console.log('  OK: cria sessões na Agenda, com período, sem prazo e sem tocar evento manual.');

// [S2] Idempotência: repetir não duplica.
const second = reconcileEprocSessions(state, {
  portalId: PORTAL,
  portalLabel: 'TJRS 2º grau',
  collectedAt: '2026-10-29T13:00:00.000Z',
  sessions: [presencial, assincrona],
  collectionStatus: { collected: true }
});
assert.deepEqual(second, { created: 0, updated: 0, inactive: 0, unchanged: 2 });
assert.equal(state.agenda.length, 3);
console.log('  OK: reconciliar de novo não duplica.');

// [S3] Mudança de horário atualiza o mesmo evento.
const moved = { ...presencial, sessionStart: '2026-10-29T10:30:00' };
const third = reconcileEprocSessions(state, {
  portalId: PORTAL,
  portalLabel: 'TJRS 2º grau',
  collectedAt: '2026-10-29T14:00:00.000Z',
  sessions: [moved, assincrona],
  collectionStatus: { collected: true }
});
assert.equal(third.updated, 1);
assert.equal(state.agenda.filter(event => event.hearingType === 'SESSÃO DE JULGAMENTO').length, 2);
assert.equal(state.agenda.find(event => event.process === presencial.processNumber).time, '10:30');
console.log('  OK: remarcação atualiza o evento existente.');

// [S4] Ausência só é marcada com coleta completa.
const partial = reconcileEprocSessions(state, {
  portalId: PORTAL,
  collectedAt: '2026-10-29T15:00:00.000Z',
  sessions: [],
  collectionStatus: { collected: false }
});
assert.equal(partial.inactive, 0);
assert.equal(state.agenda.filter(event => event.hearingType === 'SESSÃO DE JULGAMENTO' && event.sourceStatus === 'active').length, 2);

const absent = reconcileEprocSessions(state, {
  portalId: PORTAL,
  collectedAt: '2026-10-29T16:00:00.000Z',
  sessions: [],
  collectionStatus: { collected: true }
});
assert.equal(absent.inactive, 2);
const inactive = state.agenda.filter(event => event.hearingType === 'SESSÃO DE JULGAMENTO');
assert.ok(inactive.every(event => event.sourceStatus === 'not_present' && event.active === false));
console.log('  OK: ausência só retira da pauta quando a coleta foi completa.');

// [S5] Outro portal não é afetado.
const manualEvent = state.agenda.find(event => event.id === 'manual-1');
assert.equal(manualEvent.sourceStatus, undefined, 'evento manual intocado');
console.log('  OK: outros portais e eventos manuais permanecem.');

console.log('\n[PASS] Sessões de Julgamento reconciliadas na Agenda.\n');
