import assert from 'node:assert/strict';
import { generateTotp } from '../lib/security.mjs';
import * as backendAssignees from '../lib/tasks/task-assignees.mjs';
import * as frontendAssignees from '../js/core/task-assignees.js';
import { startTestServer, postJson } from './helpers.mjs';

console.log('=== Delegação de tarefas: vínculo oficial por membro ===');

const members = [
  { id: 'u-ricardo', username: 'ricardo', displayName: 'Ricardo Teste', email: 'ricardo@example.test', role: 'admin', status: 'active' },
  { id: 'u-rogerio', username: 'rogerio', displayName: 'Rogério Teste', email: 'rogerio@example.test', role: 'collaborator', status: 'active' },
  { id: 'u-maria', username: 'maria', displayName: 'Maria Silva', email: 'maria@example.test', role: 'collaborator', status: 'active' },
  { id: 'u-maria2', username: 'maria-costa', displayName: 'Maria Silva', email: 'maria2@example.test', role: 'collaborator', status: 'active' },
  { id: 'u-inativo', username: 'inativo', displayName: 'Ex Membro', email: 'ex@example.test', role: 'collaborator', status: 'inactive' }
];

const fixtures = [
  [{ responsible: 'Rogério Teste' }, { assigneeUserId: 'u-rogerio', followerUserIds: [] }],
  [{ responsible: 'rogerio', responsibles: 'Ricardo Teste, Maria' }, { assigneeUserId: 'u-rogerio', followerUserIds: ['u-ricardo', 'u-maria'] }],
  [{ responsible: 'Maria Silva' }, { assigneeUserId: null, followerUserIds: [] }],
  [{ responsible: 'Zé Ninguém' }, { assigneeUserId: null, followerUserIds: [] }],
  [{ responsible: 'Ex Membro' }, { assigneeUserId: null, followerUserIds: [] }],
  [{ responsible: '', assigneeUserId: 'u-ricardo' }, { assigneeUserId: 'u-ricardo', followerUserIds: [] }],
  [{ responsible: '', assigneeUserId: 'u-fantasma' }, { assigneeUserId: null, followerUserIds: [] }],
  [{ responsible: 'Ricardo', responsibles: ['u-rogerio', 'fantasma', 'Ricardo Teste', 'Maria Silva', 'Rogério Teste'] }, { assigneeUserId: 'u-ricardo', followerUserIds: ['u-rogerio'] }]
];

for (const [input, expected] of fixtures) {
  const backend = backendAssignees.resolveTaskAssignees(input, members);
  const frontend = frontendAssignees.resolveTaskAssignees(input, members);
  assert.deepEqual(backend, expected, `backend diverge em ${JSON.stringify(input)}`);
  assert.deepEqual(frontend, expected, `frontend diverge em ${JSON.stringify(input)}`);
  assert.deepEqual(backend, frontend, `espelhos divergem em ${JSON.stringify(input)}`);
}
assert.deepEqual(backendAssignees.resolveMemberIdList('Rogério Teste, ricardo, Maria Silva, Zé Ninguém', members), ['u-rogerio', 'u-ricardo']);
assert.deepEqual(frontendAssignees.resolveMemberIdList(['maria-costa', 'Maria Silva', 'Ex Membro'], members), ['u-maria2']);
assert.equal(backendAssignees.itemVisibleToMember({}, members[1], { ids: ['u-rogerio'] }), true);
assert.equal(frontendAssignees.itemVisibleToMember({}, members[1], { ids: ['u-ricardo'] }), false);
assert.equal(backendAssignees.itemVisibleToMember({}, members[1], { ids: [], names: 'Rogério Teste, Outro' }), true);
assert.equal(backendAssignees.itemVisibleToMember({}, members[1], { ids: [], names: 'Outro' }), false);
assert.equal(backendAssignees.itemVisibleToMember({}, members[1], { ids: [], names: '' }), true);
assert.equal(backendAssignees.itemVisibleToMember({}, null, { ids: ['u-ricardo'] }), true);
assert.equal(backendAssignees.matchMemberByName(members, '  ROGERIO TESTE ')?.id, 'u-rogerio');
assert.equal(backendAssignees.matchMemberByName(members, 'Maria Silva'), null);
assert.equal(frontendAssignees.matchMemberByName(members, 'Ex Membro'), null);
console.log('paridade backend/frontend: PASS (8 fixtures, sem vínculo inventado)');

const server = await startTestServer();
try {
  let res = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'delegante', displayName: 'Ricardo Delegante', email: 'delegante@example.test', password: 'Senha-Deleg-2026!'
  });
  const setup = await res.json();
  res = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken, code: generateTotp(setup.manualSecret)
  });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const csrf = (await res.json()).csrfToken;
  const auth = { Cookie: cookie, 'X-CSRF-Token': csrf };

  res = await fetch(`${server.baseUrl}/api/admin/users`, { headers: auth });
  assert.equal(res.status, 200);
  const me = (await res.json()).users.find(user => user.username === 'delegante');
  assert.ok(me?.id, 'usuário de setup deve ter id oficial');

  const before = await (await fetch(`${server.baseUrl}/api/state`, { headers: auth })).json();
  const base = before.state || {};
  const tasks = [
    { id: 'task-delegada', title: 'Delegada oficial', status: 'triagem', responsible: 'Outro Nome', responsibles: [], assigneeUserId: me.id, followerUserIds: [] },
    { id: 'task-fantasma', title: 'ID inválido', status: 'triagem', responsible: 'Alguém', responsibles: [], assigneeUserId: 'u-fantasma', followerUserIds: ['u-fantasma'] },
    { id: 'task-legada', title: 'Nome legado', status: 'triagem', responsible: 'Ricardo Delegante', responsibles: [] }
  ];
  const processes = [
    { id: 'proc-dupla', number: '5000000-00.2026.8.21.0001', client: 'Cliente Teste', responsible: 'Ricardo Delegante, Zé Ninguém' },
    { id: 'proc-vazia', number: '5000001-00.2026.8.21.0001', client: 'Cliente Teste', responsible: '' }
  ];
  res = await postJson(`${server.baseUrl}/api/state`, { state: { ...base, tasks, processes }, revision: before.revision ?? null }, auth);
  assert.equal(res.status, 200);
  const after = await (await fetch(`${server.baseUrl}/api/state`, { headers: auth })).json();
  const byId = new Map((after.state.tasks || []).map(task => [task.id, task]));
  assert.equal(byId.get('task-delegada')?.assigneeUserId, me.id);
  assert.equal(byId.get('task-fantasma')?.assigneeUserId, null);
  assert.deepEqual(byId.get('task-fantasma')?.followerUserIds, []);
  assert.equal(byId.get('task-legada')?.assigneeUserId, me.id);
  assert.equal(byId.get('task-legada')?.responsible, 'Ricardo Delegante');
  const procs = new Map((after.state.processes || []).map(proc => [proc.id, proc]));
  assert.deepEqual(procs.get('proc-dupla')?.responsibleUserIds, [me.id]);
  assert.equal(procs.get('proc-dupla')?.responsible, 'Ricardo Delegante, Zé Ninguém');
  assert.deepEqual(procs.get('proc-vazia')?.responsibleUserIds, []);

  const cleared = { ...after.state, processes: (after.state.processes || []).map(proc => proc.id === 'proc-dupla' ? { ...proc, responsible: '' } : proc) };
  res = await postJson(`${server.baseUrl}/api/state`, { state: cleared, revision: after.revision ?? null }, auth);
  assert.equal(res.status, 200);
  const recleared = await (await fetch(`${server.baseUrl}/api/state`, { headers: auth })).json();
  assert.deepEqual(recleared.state.processes.find(proc => proc.id === 'proc-dupla')?.responsibleUserIds, []);
  console.log('flush server-authoritative: PASS (preserva válido, saneia inválido, preenche legado inequívoco)');
} finally {
  await server.stop();
}
console.log('task_delegation: PASS');
process.exit(0);
