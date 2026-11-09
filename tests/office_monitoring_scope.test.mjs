import assert from 'node:assert/strict';
import test from 'node:test';
import { appendDjenItem } from '../collector/adapters/djen.mjs';
import { selectNewPublicationEvents } from '../lib/publications/intimation-merge-engine.mjs';
import { reconcileDjenCaptureErrors } from '../lib/judicial/djen-capture-errors.mjs';
import {
  buildProcessIndex,
  canAccessContact,
  canAccessPublication,
  canAccessTask,
  filterPrivateScopeState
} from '../lib/office/access-control.mjs';
import { applyMonitoringScopes } from '../lib/office/monitoring-scope.mjs';

const terms = [
  { id: 'office', name: 'Escritório Teste', registration: 'OAB/RS 000001', scope: 'office', primary: true },
  { id: 'private', name: 'Advogada Teste', registration: 'OAB/RS 000002', scope: 'private', privateOwnerUserId: 'u-owner' }
];

const privateProcess = {
  id: 'p-private',
  number: '5000000-00.2026.8.21.0001',
  monitoredTermIds: ['private']
};
const officeProcess = {
  id: 'p-office',
  number: '5000001-00.2026.8.21.0001',
  monitoredTermIds: ['office']
};
const bothProcess = {
  id: 'p-both',
  number: '5000002-00.2026.8.21.0001',
  monitoredTermIds: ['private', 'office']
};
const privatePublication = {
  id: 'pub-private',
  process: privateProcess.number,
  monitoredTermIds: ['private']
};
const bothPublication = {
  id: 'pub-both',
  process: bothProcess.number,
  monitoredTermIds: ['private', 'office']
};
const privateTask = { id: 'task-private', process: privateProcess.number };
const officeTask = { id: 'task-office', process: officeProcess.number };

test('escopo aplica privado por termo e escritório vence quando os dois aparecem', () => {
  const state = {
    terms,
    processes: [privateProcess, officeProcess, bothProcess],
    intimations: [privatePublication, bothPublication],
    tasks: [privateTask, officeTask],
    contacts: [{ id: 'c-private', relatedProcessNumbers: [privateProcess.number] }],
    agenda: [],
    documents: []
  };
  const scoped = applyMonitoringScopes(state);
  assert.equal(scoped.processes.find(item => item.id === 'p-private').scope, 'private');
  assert.equal(scoped.processes.find(item => item.id === 'p-private').privateOwnerUserId, 'u-owner');
  assert.equal(scoped.processes.find(item => item.id === 'p-office').scope, 'office');
  assert.equal(scoped.processes.find(item => item.id === 'p-both').scope, 'office');
  assert.equal(scoped.intimations.find(item => item.id === 'pub-private').scope, 'private');
  assert.equal(scoped.intimations.find(item => item.id === 'pub-both').scope, 'office');
  assert.equal(scoped.tasks.find(item => item.id === 'task-private').scope, 'private');
  assert.equal(scoped.tasks.find(item => item.id === 'task-private').privateOwnerUserId, 'u-owner');
  assert.equal(scoped.tasks.find(item => item.id === 'task-office').scope, 'office');
  assert.equal(scoped.contacts[0].scope, 'private');
});

test('migração antiga reclassifica publicação e processo DJEN privados pelo texto da OAB', () => {
  const scoped = applyMonitoringScopes({
    terms,
    processes: [{
      id: 'djen:process:50000030020268210001',
      number: '5000003-00.2026.8.21.0001',
      source: 'DJEN / CNJ Oficial',
      monitoredTermIds: ['office'],
      scope: 'office'
    }],
    intimations: [{
      id: 'pub-legacy-private',
      process: '5000003-00.2026.8.21.0001',
      term: 'Advogada Teste · OAB/RS 000002',
      monitoredTermIds: ['office'],
      scope: 'office'
    }],
    tasks: [],
    contacts: [],
    agenda: [],
    documents: []
  });
  assert.equal(scoped.intimations[0].scope, 'private');
  assert.equal(scoped.intimations[0].privateOwnerUserId, 'u-owner');
  assert.equal(scoped.processes[0].scope, 'private');
  assert.equal(scoped.processes[0].privateOwnerUserId, 'u-owner');
});

test('filtro privado esconde conteúdo de outro dono até para gestor com read_all', () => {
  const scoped = applyMonitoringScopes({
    terms,
    processes: [privateProcess, officeProcess],
    intimations: [privatePublication, bothPublication],
    tasks: [privateTask, officeTask],
    contacts: [{ id: 'c-private', relatedProcessNumbers: [privateProcess.number] }],
    agenda: [],
    documents: []
  });
  const manager = {
    id: 'u-manager',
    permissions: ['office.manage', 'tasks.read_all', 'publications.read_all', 'clients.read_all']
  };
  const visible = filterPrivateScopeState(scoped, manager);
  assert.deepEqual(visible.processes.map(item => item.id), ['p-office']);
  assert.deepEqual(visible.intimations.map(item => item.id), ['pub-both']);
  assert.deepEqual(visible.tasks.map(item => item.id), ['task-office']);
  assert.equal(visible.contacts.length, 0);

  const index = buildProcessIndex(scoped.processes);
  assert.equal(canAccessTask(manager, privateTask, index), false);
  assert.equal(canAccessPublication(manager, privatePublication, index), false);
  assert.equal(canAccessContact(manager, { relatedProcessNumbers: [privateProcess.number] }, index), false);

  const owner = { id: 'u-owner', permissions: [] };
  const ownerVisible = filterPrivateScopeState(scoped, owner);
  assert.equal(ownerVisible.processes.some(item => item.id === 'p-private'), true);
  assert.equal(ownerVisible.intimations.some(item => item.id === 'pub-private'), true);
  assert.equal(ownerVisible.tasks.some(item => item.id === 'task-private'), true);
});

test('processo privado sem dono não expõe processo nem publicação na projeção', () => {
  const noOwnerProcess = { id: 'p-private-sem-dono', number: '5000000-00.2026.8.21.9999', scope: 'private' };
  const publication = { id: 'pub-sem-dono', process: noOwnerProcess.number };
  const state = {
    processes: [noOwnerProcess],
    intimations: [publication],
    tasks: [{ id: 'task-private-sem-dono', scope: 'private' }],
    contacts: [],
    agenda: [],
    documents: []
  };
  const manager = { id: 'u-manager', permissions: ['office.manage', 'publications.read_all'] };
  const normalized = applyMonitoringScopes(state);
  assert.equal(normalized.processes[0].scope, 'private', 'A normalização não pode rebaixar processo privado sem dono para escritório.');
  assert.equal(normalized.tasks[0].scope, 'private', 'Tarefa privada sem dono não pode ser rebaixada para escritório.');
  const visible = filterPrivateScopeState(normalized, manager);
  assert.deepEqual(visible.processes, [], 'Processo privado sem dono não pode aparecer no estado.');
  assert.deepEqual(visible.intimations, [], 'Publicação de processo privado sem dono não pode aparecer no estado.');
  assert.deepEqual(visible.tasks, [], 'Tarefa privada sem dono não pode aparecer no estado.');
  assert.equal(canAccessPublication(manager, normalized.intimations[0], buildProcessIndex(normalized.processes)), false);
});

test('termo office vence processo privado com dono e preserva o acesso do dono', () => {
  const privateOfficeProcess = {
    id: 'p-private-office',
    number: '5000004-00.2026.8.21.0001',
    scope: 'private',
    privateOwnerUserId: 'u-owner'
  };
  const officePublication = {
    id: 'pub-office-term',
    process: privateOfficeProcess.number,
    monitoredTermIds: ['office']
  };
  const manager = { id: 'u-manager', permissions: ['office.manage', 'publications.read_all'] };
  const owner = { id: 'u-owner', permissions: [] };
  const normalized = applyMonitoringScopes({
    terms,
    processes: [privateOfficeProcess],
    intimations: [officePublication],
    tasks: [],
    contacts: [],
    agenda: [],
    documents: []
  });
  assert.equal(normalized.processes[0].scope, 'office', 'Termo office explícito vence o processo privado.');
  assert.equal(normalized.processes[0].responsibleUserIds.includes('u-owner'), true, 'O dono anterior continua responsável após a promoção.');
  assert.equal(normalized.intimations[0].scope, 'office');
  const index = buildProcessIndex(normalized.processes);
  assert.equal(canAccessPublication(manager, normalized.intimations[0], index), true);
  assert.equal(canAccessPublication(owner, normalized.intimations[0], index), true, 'O dono do processo privado não pode perder acesso na promoção.');
});

test('DJEN privado sem dono no processo recupera o dono da publicação', () => {
  const djenProcess = {
    id: 'djen:process:50000050020268210001',
    number: '5000005-00.2026.8.21.0001',
    source: 'DJEN / CNJ Oficial',
    scope: 'private'
  };
  const publication = {
    id: 'pub-djen-private-owner',
    process: djenProcess.number,
    scope: 'private',
    privateOwnerUserId: 'u-owner'
  };
  const normalized = applyMonitoringScopes({
    terms,
    processes: [djenProcess],
    intimations: [publication],
    tasks: [],
    contacts: [],
    agenda: [],
    documents: []
  });
  assert.equal(normalized.processes[0].scope, 'private');
  assert.equal(normalized.processes[0].privateOwnerUserId, 'u-owner');
  const index = buildProcessIndex(normalized.processes);
  const owner = { id: 'u-owner', permissions: [] };
  assert.equal(canAccessPublication(owner, normalized.intimations[0], index), true);
  assert.equal(filterPrivateScopeState(normalized, owner).intimations.some(item => item.id === 'pub-djen-private-owner'), true);
});

function djenItem(id, number) {
  return {
    id,
    numeroprocessocommascara: number,
    data_disponibilizacao: '2026-10-20',
    tipoComunicacao: 'Intimação',
    tipoDocumento: 'Decisão',
    siglaTribunal: 'TJRS',
    nomeOrgao: 'Vara de Teste',
    destinatarioadvogados: [{ advogado: { nome: 'Advogada Teste', numero_oab: '000002', uf_oab: 'RS' } }]
  };
}

test('captura privada de donos diferentes não compartilha registro', () => {
  const ownerA = { ...terms[1], privateOwnerUserId: 'u-a' };
  const ownerB = { ...terms[1], id: 'private-b', privateOwnerUserId: 'u-b' };
  const targetA = { intimations: [], processes: [], contacts: [] };
  const targetB = { intimations: [], processes: [], contacts: [] };
  appendDjenItem(djenItem('10', '50000040020268210001'), { name: 'DJEN' }, { monitoredTerm: ownerA, monitoredTerms: [ownerA] }, targetA);
  appendDjenItem(djenItem('10', '50000040020268210001'), { name: 'DJEN' }, { monitoredTerm: ownerB, monitoredTerms: [ownerB] }, targetB);
  assert.equal(targetA.intimations[0].scope, 'private');
  assert.equal(targetA.intimations[0].privateOwnerUserId, 'u-a');
  assert.equal(targetB.intimations[0].scope, 'private');
  assert.equal(targetB.intimations[0].privateOwnerUserId, 'u-b');
  assert.notEqual(targetA.intimations[0].id, targetB.intimations[0].id);
  assert.notEqual(targetA.processes[0].id, targetB.processes[0].id);
});

test('captura do escritório suprime a cópia privada do mesmo item', () => {
  const ownerA = { ...terms[1], privateOwnerUserId: 'u-a' };
  const target = { intimations: [], processes: [], contacts: [] };
  appendDjenItem(djenItem('11', '50000050020268210001'), { name: 'DJEN' }, { monitoredTerm: ownerA, monitoredTerms: [ownerA] }, target);
  const privateId = target.intimations[0].id;
  const officeTerm = terms[0];
  const outcome = appendDjenItem(djenItem('11', '50000050020268210001'), { name: 'DJEN' }, { monitoredTerm: officeTerm, monitoredTerms: [officeTerm] }, target);
  assert.equal(outcome, 'added');
  const officeRecord = target.intimations.find(item => item.scope === 'office');
  assert.ok(officeRecord, 'registro do escritório criado');
  const privateRecord = target.intimations.find(item => item.id === privateId);
  assert.equal(privateRecord.captureSuppressed, true);
  assert.equal(privateRecord.canonicalPublicationId, officeRecord.id);
});

test('fila de falhas do DJEN separa escopos', () => {
  const queue = reconcileDjenCaptureErrors({ version: 1, terms: [] }, {
    attemptedTerms: [{ ...terms[1], id: 'private-term' }],
    failures: [{ ...terms[1], id: 'private-term', message: 'falha privada' }],
    scope: 'private',
    run: { trigger: 'manual' }
  });
  assert.equal(queue.terms.length, 1);
  assert.equal(queue.terms[0].scope, 'private');
  const officeQueue = reconcileDjenCaptureErrors(queue, {
    attemptedTerms: [{ ...terms[0], id: 'office-term' }],
    failures: [{ ...terms[0], id: 'office-term', message: 'falha do escritorio' }],
    scope: 'office',
    run: { trigger: 'manual' }
  });
  assert.equal(officeQueue.terms.length, 2);
  assert.ok(officeQueue.terms.some(item => item.scope === 'private'));
  assert.ok(officeQueue.terms.some(item => item.scope === 'office'));
});

test('digest de publicações exclui escopo privado', () => {
  const selected = selectNewPublicationEvents([
    { id: 'office-1', scope: 'office' },
    { id: 'private-1', scope: 'private' }
  ]);
  assert.deepEqual(selected.map(item => item.id), ['office-1']);
});

test('coletor marca privado e não duplica CNJ já pertencente ao escritório', () => {
  const privateTerm = terms[1];
  const target = { intimations: [], processes: [], contacts: [] };
  const outcome = appendDjenItem(djenItem('1', '50000000020268210001'), { name: 'DJEN' }, { monitoredTerm: privateTerm, monitoredTerms: [privateTerm] }, target);
  assert.equal(outcome, 'added');
  assert.equal(target.intimations[0].scope, 'private');
  assert.equal(target.intimations[0].privateOwnerUserId, 'u-owner');
  assert.equal(target.processes[0].scope, 'private');
  assert.equal(target.processes[0].privateOwnerUserId, 'u-owner');

  const officeTarget = {
    intimations: [],
    processes: [{ id: 'p', number: '5000001-00.2026.8.21.0001', scope: 'office' }],
    contacts: []
  };
  const skipped = appendDjenItem(djenItem('2', '50000010020268210001'), { name: 'DJEN' }, { monitoredTerm: privateTerm, monitoredTerms: [privateTerm] }, officeTarget);
  assert.equal(skipped, 'skipped_office_owned');
  assert.equal(officeTarget.intimations.length, 0);

  const privateTarget = {
    intimations: [],
    processes: [{ id: 'p', number: '5000002-00.2026.8.21.0001', scope: 'private', privateOwnerUserId: 'u-owner' }],
    contacts: []
  };
  const promoted = appendDjenItem(djenItem('3', '50000020020268210001'), { name: 'DJEN' }, { monitoredTerm: terms[0], monitoredTerms: [terms[0]] }, privateTarget);
  assert.equal(promoted, 'added');
  const officeProcess = privateTarget.processes.find(item => item.scope === 'office');
  assert.ok(officeProcess, 'processo do escritório criado');
  const suppressedProcess = privateTarget.processes.find(item => item.scope === 'private');
  assert.equal(suppressedProcess.captureSuppressed, true);
  assert.equal(suppressedProcess.canonicalProcessId, officeProcess.id);
  const officePublication = privateTarget.intimations.find(item => item.scope === 'office');
  assert.ok(officePublication, 'publicação do escritório criada');
});
