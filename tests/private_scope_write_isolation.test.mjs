import assert from 'node:assert/strict';
import { generateTotp } from '../lib/security.mjs';
import { startTestServer, postJson } from './helpers.mjs';

// Contrato: no flush de estado (POST /api/state), um registro com dono privado
// diferente da sessão só é válido se já existia no estado consolidado (registro oculto
// re-adicionado pela mesclagem). Registros novos com dono alheio são descartados —
// um membro não pode "plantar" na área privada de outro. Ver run-5 v17.
const server = await startTestServer();
try {
  let res = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_pv', displayName: 'Admin Pv', email: 'pv-admin@example.test', password: 'Senha-Admin-2026!'
  });
  const setup = await res.json();
  res = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  const adminAuth = { Cookie: res.headers.get('set-cookie').split(';')[0] };
  const adminCsrf = (await res.json()).csrfToken;

  res = await postJson(`${server.baseUrl}/api/auth/register`, {
    username: 'membro_pv', displayName: 'Membro Pv', email: 'pv-membro@example.test', password: 'Senha-Membro-2026!'
  }, { ...adminAuth, 'X-CSRF-Token': adminCsrf });
  const registration = await res.json();
  await postJson(`${server.baseUrl}/api/auth/register/verify`, { setupToken: registration.setupToken, skipMfa: true });
  res = await fetch(`${server.baseUrl}/api/auth/users`, { headers: adminAuth });
  const member = (await res.json()).users.find(user => user.username === 'membro_pv');
  assert.ok(member?.id, 'membro deve existir');
  await postJson(`${server.baseUrl}/api/auth/users/manage`, {
    userId: member.id, status: 'active', password: 'Senha-Admin-2026!', code: generateTotp(setup.manualSecret)
  }, { ...adminAuth, 'X-CSRF-Token': adminCsrf });

  res = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'membro_pv', password: 'Senha-Membro-2026!' });
  const memberAuth = { Cookie: res.headers.get('set-cookie').split(';')[0] };

  // A tenta plantar uma tarefa e uma intimação privadas com dono = membro.
  res = await fetch(`${server.baseUrl}/api/auth/users`, { headers: adminAuth });
  const adminId = (await res.json()).users.find(user => user.username === 'admin_pv')?.id;
  assert.ok(adminId, 'id do admin deve existir');
  res = await postJson(`${server.baseUrl}/api/state`, {
    state: {
      tasks: [
        { id: 'planted-by-a', title: 'Plantada', scope: 'private', privateOwnerUserId: member.id },
        { id: 'own-private-a', title: 'Própria', scope: 'private', privateOwnerUserId: adminId }
      ],
      intimations: [
        { id: 'planted-int', process: '0000009-99.2026.8.21.0001', scope: 'private', privateOwnerUserId: member.id, title: 'Intimação plantada' }
      ]
    }
  }, { ...adminAuth, 'X-CSRF-Token': adminCsrf });
  assert.equal(res.status, 200, 'flush deve salvar');

  const stateA = await (await fetch(`${server.baseUrl}/api/state`, { headers: adminAuth })).json();
  const tasksA = stateA.state.tasks || [];
  assert.ok(!tasksA.some(task => task.id === 'planted-by-a'), 'registro com dono alheio não pode persistir');
  assert.ok(tasksA.some(task => task.id === 'own-private-a'), 'o próprio registro privado do autor deve persistir');
  const stateB = await (await fetch(`${server.baseUrl}/api/state`, { headers: memberAuth })).json();
  const intimationsB = stateB.state.intimations || [];
  assert.ok(!intimationsB.some(item => item.id === 'planted-int'), 'intimação com dono alheio não pode persistir');

  // Reúso de um id oficial do PRÓPRIO autor para forjar dono alheio não pode persistir.
  const envelopeA = await (await fetch(`${server.baseUrl}/api/state`, { headers: adminAuth })).json();
  res = await postJson(`${server.baseUrl}/api/state`, {
    revision: envelopeA.revision,
    state: { ...envelopeA.state, tasks: [{ id: 'own-private-a', title: 'Forjada reuso', scope: 'private', privateOwnerUserId: member.id }] }
  }, { ...adminAuth, 'X-CSRF-Token': adminCsrf });
  assert.equal(res.status, 200, 'flush de reúso deve salvar');
  const stateA2 = await (await fetch(`${server.baseUrl}/api/state`, { headers: adminAuth })).json();
  const ownTask = (stateA2.state.tasks || []).find(task => task.id === 'own-private-a');
  assert.ok(ownTask && String(ownTask.privateOwnerUserId) === String(adminId), 'id oficial do autor mantém o dono do autor');
  const stateB2 = await (await fetch(`${server.baseUrl}/api/state`, { headers: memberAuth })).json();
  assert.ok(!(stateB2.state.tasks || []).some(task => task.id === 'own-private-a'), 'vítima não vê registro forjado por reúso de id');

  console.log('private_scope_write_isolation: PASS');
} finally {
  await server.stop();
}
process.exit(0);
