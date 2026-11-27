import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProcessIndex,
  filterPrivateScopeState,
  mergePrivateScopeState
} from '../lib/office/access-control.mjs';
import { privateOwnerForRecord } from '../lib/office/monitoring-scope.mjs';

// Dados sintéticos: nenhuma pessoa, processo ou escritório real.
const owner = { id: 'usr-autor', username: 'autor.teste@example.test', permissions: [] };
const stranger = { id: 'usr-outro', username: 'outro.teste@example.test', permissions: ['office.manage', 'processes.read_all'] };

function stateWith(process) {
  return {
    processes: [process],
    tasks: [],
    intimations: [],
    communications: [],
    contacts: [],
    agenda: [],
    documents: [],
    leads: [],
    terms: [],
    calculations: []
  };
}

const legacyProcess = {
  id: 'proc-legado',
  number: '5000000-00.2026.8.21.0001',
  scope: 'private',
  createdByUserId: owner.id
};

test('autor é dono alternativo só de registro explicitamente privado sem dono declarado', () => {
  assert.equal(privateOwnerForRecord(legacyProcess), owner.id);
  assert.equal(
    privateOwnerForRecord({ ...legacyProcess, ownerUserId: stranger.id }),
    stranger.id,
    'dono declarado prevalece sobre o autor'
  );
  assert.equal(
    privateOwnerForRecord({ ...legacyProcess, privateOwnerUserId: owner.username }),
    owner.username,
    'privateOwnerUserId prevalece sobre o autor'
  );
  assert.equal(
    privateOwnerForRecord({ ...legacyProcess, createdByUserId: undefined }),
    '',
    'sem dono resolvível, o dono continua vazio'
  );
  assert.equal(
    privateOwnerForRecord({ ...legacyProcess, scope: 'office' }),
    '',
    'o autor não transforma registro do escritório em privado'
  );
});

test('autor não substitui o dono de vínculo privado alheio', () => {
  const privateProcess = {
    id: 'proc-vinculo',
    number: '5000001-00.2026.8.21.0001',
    scope: 'private',
    privateOwnerUserId: stranger.id
  };
  const linkedTask = {
    id: 'tarefa-vinculada',
    processNumber: privateProcess.number,
    createdByUserId: owner.id
  };
  const state = stateWith(privateProcess);
  state.tasks = [linkedTask];
  assert.equal(
    privateOwnerForRecord(linkedTask, { processIndex: buildProcessIndex(state.processes) }),
    stranger.id,
    'o vínculo privado continua definindo o dono'
  );
});

test('no legado privado, vínculo conhecido vence o autor e dono declarado vence o vínculo', () => {
  const foreignPrivate = {
    id: 'proc-vinculo-privado',
    number: '5000003-00.2026.8.21.0001',
    scope: 'private',
    privateOwnerUserId: stranger.id
  };
  const indices = { processIndex: buildProcessIndex([foreignPrivate]) };
  const byNumber = {
    id: 'tarefa-por-numero',
    scope: 'private',
    processNumber: foreignPrivate.number,
    createdByUserId: owner.id
  };
  assert.equal(
    privateOwnerForRecord(byNumber, indices),
    stranger.id,
    'registro privado com vínculo privado conhecido não adota o autor'
  );
  const byOwnerId = {
    id: 'tarefa-por-id',
    scope: 'private',
    ownerType: 'process',
    ownerId: foreignPrivate.id,
    createdByUserId: owner.id
  };
  assert.equal(
    privateOwnerForRecord(byOwnerId, indices),
    stranger.id,
    'vínculo explícito por id também prevalece'
  );
  assert.equal(
    privateOwnerForRecord({ ...byNumber, privateOwnerUserId: owner.id }, indices),
    owner.id,
    'dono declarado no registro vem antes do vínculo'
  );
  assert.equal(
    privateOwnerForRecord({ ...byNumber, ownerUserId: owner.id }, indices),
    owner.id,
    'ownerUserId declarado também vem antes do vínculo'
  );
  const officeWithOwner = {
    id: 'tarefa-office',
    scope: 'office',
    processNumber: foreignPrivate.number,
    ownerUserId: owner.id
  };
  assert.equal(
    privateOwnerForRecord(officeWithOwner, indices),
    stranger.id,
    'registro office conserva a precedência anterior: o vínculo privado vence o ownerUserId'
  );
});

test('vínculo privado sem dono resolvido falha fechado mesmo com autor legado', () => {
  const noOwnerLinked = {
    id: 'proc-vinculo-sem-dono',
    number: '5000004-00.2026.8.21.0001',
    scope: 'private'
  };
  const record = {
    id: 'tarefa-vinculada-sem-dono',
    scope: 'private',
    processNumber: noOwnerLinked.number,
    createdByUserId: owner.id
  };
  const state = stateWith(noOwnerLinked);
  state.tasks = [record];
  const indices = { processIndex: buildProcessIndex(state.processes) };
  assert.equal(privateOwnerForRecord(record, indices), '', 'o autor não preenche vínculo privado sem dono');

  for (const user of [owner, stranger]) {
    assert.equal(filterPrivateScopeState(state, user).tasks.length, 0, 'registro ligado a privado sem dono não é exposto');
    const incoming = { ...stateWith(noOwnerLinked), tasks: [{ ...record, notes: 'Versão do navegador' }] };
    const merged = mergePrivateScopeState(state, incoming, user);
    const preserved = merged.tasks.find(item => item.id === record.id);
    assert.equal(preserved.notes, undefined, 'registro oculto é preservado');
  }
});

test('leitura e merge convergem para registro privado legado com autor como dono', () => {
  const state = stateWith(legacyProcess);
  assert.equal(filterPrivateScopeState(state, owner).processes.length, 1, 'o autor vê o próprio registro');
  assert.equal(filterPrivateScopeState(state, stranger).processes.length, 0, 'gestor não vê registro privado alheio');

  const incoming = stateWith({ ...legacyProcess, notes: 'Versão do navegador', privateOwnerUserId: stranger.id });
  const merged = mergePrivateScopeState(state, incoming, stranger);
  const preserved = merged.processes.find(item => item.id === legacyProcess.id);
  assert.equal(preserved.notes, undefined, 'a versão oficial prevalece sobre a do navegador');
  assert.equal(preserved.createdByUserId, owner.id, 'a autoria oficial permanece');
  assert.equal(preserved.privateOwnerUserId, undefined, 'o dono forjado não entra');

  const incomingFromOwner = stateWith({ ...legacyProcess, notes: 'Edição do dono' });
  const keptForOwner = mergePrivateScopeState(state, incomingFromOwner, owner);
  assert.equal(
    keptForOwner.processes.find(item => item.id === legacyProcess.id).notes,
    'Edição do dono',
    'o dono continua editando o próprio registro'
  );
});

test('registro privado sem dono resolvível fica oculto e é preservado no merge', () => {
  const noOwner = { id: 'proc-sem-dono', number: '5000002-00.2026.8.21.0001', scope: 'private' };
  const state = stateWith(noOwner);
  const incoming = stateWith({ ...noOwner, notes: 'Versão do navegador' });
  for (const user of [owner, stranger]) {
    assert.equal(filterPrivateScopeState(state, user).processes.length, 0, 'sem dono, ninguém vê');
    const merged = mergePrivateScopeState(state, incoming, user);
    const preserved = merged.processes.find(item => item.id === noOwner.id);
    assert.equal(preserved.notes, undefined, 'registro oculto não é reescrito');
    assert.equal(preserved.scope, 'private', 'escopo privado não é rebaixado');
  }
});

test('registro suprimido não é reescrito pelo flush', () => {
  const suppressed = { ...legacyProcess, id: 'proc-suprimido', captureSuppressed: true };
  const state = stateWith(suppressed);
  const incoming = stateWith({ ...suppressed, notes: 'Versão do navegador' });
  const merged = mergePrivateScopeState(state, incoming, owner);
  const preserved = merged.processes.find(item => item.id === suppressed.id);
  assert.equal(preserved.notes, undefined, 'a versão oficial do registro suprimido prevalece');
});
