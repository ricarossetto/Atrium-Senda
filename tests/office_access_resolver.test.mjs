import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProcessIndex,
  canAccessProcess,
  canAccessTask,
  filterOfficeState,
  filterPrivateScopeState,
  mergePrivateScopeState,
  mergeVisibleClientState
} from '../lib/office/access-control.mjs';
import { normalizeGrantExpiry } from '../lib/http/process-access-routes.mjs';

const manager = { id: 'u-manager', username: 'manager', permissions: ['office.manage'] };
const associate = { id: 'u-assoc', username: 'assoc', permissions: ['processes.create', 'publications.treat'] };
const other = { id: 'u-other', username: 'other', permissions: [] };
const teams = [{ id: 'team-prev', memberIds: ['u-assoc'] }];
const process = {
  id: 'proc-1',
  number: '5000000-00.2026.8.21.0001',
  scope: 'office',
  assignmentStatus: 'assigned',
  responsibleUserIds: ['u-assoc'],
  assignedTeamIds: [],
  accessGrants: []
};
const teamProcess = {
  id: 'proc-2',
  number: '5000001-00.2026.8.21.0001',
  scope: 'office',
  assignmentStatus: 'assigned',
  responsibleUserIds: [],
  assignedTeamIds: ['team-prev'],
  accessGrants: []
};
const privateProcess = {
  id: 'proc-private',
  number: '5000002-00.2026.8.21.0001',
  scope: 'private',
  privateOwnerUserId: 'u-other',
  assignmentStatus: 'assigned',
  responsibleUserIds: ['u-assoc'],
  assignedTeamIds: [],
  accessGrants: []
};

test('gestor vê processos do escritório, mas não o escopo privado de outro membro', () => {
  assert.equal(canAccessProcess(manager, process, teams), true);
  assert.equal(canAccessProcess(manager, teamProcess, teams), true);
  assert.equal(canAccessProcess(manager, privateProcess, teams), false);
  assert.equal(canAccessProcess({ id: 'u-other', permissions: [] }, privateProcess, teams), true);
});

test('responsável e equipe concedem acesso; processo sem atribuição não vaza', () => {
  assert.equal(canAccessProcess(associate, process, teams), true);
  assert.equal(canAccessProcess(associate, teamProcess, teams), true);
  const unassigned = { ...process, id: 'proc-3', responsibleUserIds: [], assignedTeamIds: [] };
  assert.equal(canAccessProcess(associate, unassigned, teams), false);
  assert.equal(canAccessProcess(other, process, teams), false);
});

test('tarefa e publicação herdam o processo; tarefa sem processo só aparece ao envolvido', () => {
  const index = buildProcessIndex([process, teamProcess, privateProcess]);
  assert.equal(canAccessTask(associate, { id: 't1', process: process.number }, index, teams), true);
  assert.equal(canAccessTask(associate, { id: 't2', process: privateProcess.number }, index, teams), false);
  assert.equal(canAccessTask(associate, { id: 't3', assigneeUserId: 'u-assoc' }, index, teams), true);
  assert.equal(canAccessTask(other, { id: 't4', process: process.number }, index, teams), false);
});

test('termos privados ficam restritos ao dono na leitura e na gravação', () => {
  const privateTerm = { id: 'term-p', scope: 'private', privateOwnerUserId: 'u-assoc' };
  const officeTerm = { id: 'term-o', scope: 'office' };
  const state = { processes: [], tasks: [], terms: [privateTerm, officeTerm] };
  const otherView = filterPrivateScopeState(state, other, { teams: [] });
  assert.deepEqual(otherView.terms.map(term => term.id), ['term-o']);
  const ownView = filterPrivateScopeState(state, associate, { teams: [] });
  assert.deepEqual(ownView.terms.map(term => term.id).sort(), ['term-o', 'term-p']);
  const incoming = { ...state, terms: [{ ...privateTerm, name: 'sequestrado' }, officeTerm] };
  const merged = mergePrivateScopeState(state, incoming, other, { teams: [] });
  const kept = merged.terms.find(term => term.id === 'term-p');
  assert.equal(kept.name, undefined);
  assert.equal(kept.scope, 'private');
  assert.equal(kept.privateOwnerUserId, 'u-assoc');
  assert.deepEqual(merged.terms.map(term => term.id).sort(), ['term-o', 'term-p']);
});

test('filtro remove financeiro e preserva registros ocultos no merge', () => {
  const state = {
    processes: [process, privateProcess],
    tasks: [
      { id: 't1', process: process.number, title: 'Visível' },
      { id: 't2', process: privateProcess.number, title: 'Privada' }
    ],
    intimations: [],
    contacts: [],
    agenda: [],
    documents: [],
    officeExpenses: [{ id: 'e1', amount: 100 }],
    financialEntries: [{ id: 'f1' }],
    audit: [{ id: 'a1' }]
  };
  const filtered = filterOfficeState(state, associate, { teams });
  assert.equal(filtered.processes.length, 1);
  assert.equal(filtered.tasks.length, 1);
  assert.equal(filtered.officeExpenses.length, 0);
  assert.equal(filtered.financialEntries.length, 0);
  assert.equal(filtered.audit.length, 0);

  const incoming = {
    ...filtered,
    processes: [{ ...process, assignedTeamIds: ['team-prev'], responsibleUserIds: ['u-other'] }],
    tasks: [{ id: 't1', process: process.number, title: 'Editada' }]
  };
  const merged = mergeVisibleClientState(state, incoming, associate, { teams });
  assert.deepEqual(merged.processes.find(item => item.id === process.id).responsibleUserIds, ['u-assoc']);
  assert.deepEqual(merged.processes.find(item => item.id === process.id).assignedTeamIds, []);
  assert.equal(merged.processes.some(item => item.id === privateProcess.id), true, 'registro privado oculto é preservado');
  assert.equal(merged.tasks.find(item => item.id === 't1').title, 'Editada');
  assert.equal(merged.tasks.find(item => item.id === 't2').title, 'Privada', 'tarefa oculta é preservada');
});

test('concessão expira por epoch ou data sem hora, nunca por NaN silencioso', () => {
  const future = { ...process, id: 'proc-future', responsibleUserIds: [], accessGrants: [{ userId: 'u-assoc', expiresAt: '2099-12-31' }] };
  const past = { ...process, id: 'proc-past', responsibleUserIds: [], accessGrants: [{ userId: 'u-assoc', expiresAt: '2000-01-01' }] };
  const epoch = { ...process, id: 'proc-epoch', responsibleUserIds: [], accessGrants: [{ userId: 'u-assoc', expiresAt: String(Date.now() + 60000) }] };
  assert.equal(canAccessProcess(associate, future, teams), true, 'data futura sem hora vale até o fim do dia');
  assert.equal(canAccessProcess(associate, past, teams), false);
  assert.equal(canAccessProcess(associate, epoch, teams), true);
  assert.equal(normalizeGrantExpiry('2099-12-31'), String(Date.parse('2099-12-31T23:59:59-03:00')));
  assert.equal(normalizeGrantExpiry(1767225599000), '1767225599000');
  assert.equal(normalizeGrantExpiry(''), null);
  assert.throws(() => normalizeGrantExpiry('data-invalida'), /data válida/);
});
