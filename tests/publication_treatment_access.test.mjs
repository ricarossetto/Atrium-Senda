import assert from 'node:assert/strict';
import { generateTotp } from '../lib/security.mjs';
import { startTestServer, postJson } from './helpers.mjs';

// Contrato: a derivação de tratamento por conclusão de tarefa casa tarefa↔publicação
// por id. Ela só pode encerrar a triagem de publicação que o ator pode acessar
// (mesmo predicado da rota oficial de tratamento). Ver run-5 v14.
const server = await startTestServer();
try {
  let res = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_trt', displayName: 'Admin Trt', email: 'trt-admin@example.test', password: 'Senha-Admin-2026!'
  });
  const setup = await res.json();
  res = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  const adminAuth = { Cookie: res.headers.get('set-cookie').split(';')[0] };
  const adminCsrf = (await res.json()).csrfToken;

  res = await postJson(`${server.baseUrl}/api/auth/register`, {
    username: 'membro_trt', displayName: 'Membro Trt', email: 'trt-membro@example.test', password: 'Senha-Membro-2026!'
  }, { ...adminAuth, 'X-CSRF-Token': adminCsrf });
  const registration = await res.json();
  await postJson(`${server.baseUrl}/api/auth/register/verify`, { setupToken: registration.setupToken, skipMfa: true });
  res = await fetch(`${server.baseUrl}/api/auth/users`, { headers: adminAuth });
  const member = (await res.json()).users.find(user => user.username === 'membro_trt');
  assert.ok(member?.id, 'membro deve existir');
  await postJson(`${server.baseUrl}/api/auth/users/manage`, {
    userId: member.id, status: 'active', password: 'Senha-Admin-2026!', code: generateTotp(setup.manualSecret)
  }, { ...adminAuth, 'X-CSRF-Token': adminCsrf });
  res = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'membro_trt', password: 'Senha-Membro-2026!' });
  const memberAuth = { Cookie: res.headers.get('set-cookie').split(';')[0] };
  const memberCsrf = (await res.json()).csrfToken;

  // B cria sua própria publicação privada (dono legítimo).
  res = await postJson(`${server.baseUrl}/api/state`, {
    state: { intimations: [{ id: 'pub-b', externalId: 'ext-pub-b', process: '0000001-11.2026.8.21.0001', scope: 'private', privateOwnerUserId: member.id, treatmentStatus: 'untreated', title: 'Publicação privada B' }] }
  }, { ...memberAuth, 'X-CSRF-Token': memberCsrf });
  assert.equal(res.status, 200, 'B deve criar publicação privada');

  // A tenta encerrar a triagem via tarefa concluída apontando para a publicação de B.
  const stateA = await (await fetch(`${server.baseUrl}/api/state`, { headers: adminAuth })).json();
  assert.ok(stateA.revision, 'revisão deve existir');
  res = await postJson(`${server.baseUrl}/api/state`, {
    revision: stateA.revision,
    state: { ...stateA.state, tasks: [...(stateA.state.tasks || []), { id: 'task-a', title: 'Tarefa A', status: 'concluida', publicationId: 'pub-b' }] }
  }, { ...adminAuth, 'X-CSRF-Token': adminCsrf });
  assert.equal(res.status, 200, 'flush de A deve salvar');

  const stateB = await (await fetch(`${server.baseUrl}/api/state`, { headers: memberAuth })).json();
  const pubB = (stateB.state.intimations || []).find(item => item.id === 'pub-b');
  assert.ok(pubB, 'B deve continuar vendo sua publicação privada');
  assert.equal(pubB.treatmentStatus, 'untreated', 'A não pode tratar publicação privada de B');
  assert.notEqual(pubB.treatedBy, 'Admin Trt', 'tratamento não pode ser atribuído a A');

  console.log('publication_treatment_access: PASS');
} finally {
  await server.stop();
}
process.exit(0);
