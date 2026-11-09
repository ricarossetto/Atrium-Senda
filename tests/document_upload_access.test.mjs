import assert from 'node:assert/strict';
import { generateTotp } from '../lib/security.mjs';
import { startTestServer, postJson } from './helpers.mjs';

// Contrato: o upload de documento não pode anexar a um processo/contato que a
// sessão não pode acessar. Escopo privado vale nos dois modos; RBAC de escritório
// vale no modo enforced (mesmo predicado da leitura em /api/documents). Ver run-5 v05.
const server = await startTestServer();
try {
  let res = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_doc', displayName: 'Admin Doc', email: 'doc-admin@example.test', password: 'Senha-Admin-2026!'
  });
  const setup = await res.json();
  res = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  const adminAuth = { Cookie: res.headers.get('set-cookie').split(';')[0] };
  const adminCsrf = (await res.json()).csrfToken;

  res = await postJson(`${server.baseUrl}/api/auth/register`, {
    username: 'membro_doc', displayName: 'Membro Doc', email: 'doc-membro@example.test', password: 'Senha-Membro-2026!'
  }, { ...adminAuth, 'X-CSRF-Token': adminCsrf });
  const registration = await res.json();
  await postJson(`${server.baseUrl}/api/auth/register/verify`, { setupToken: registration.setupToken, skipMfa: true });
  res = await fetch(`${server.baseUrl}/api/auth/users`, { headers: adminAuth });
  const member = (await res.json()).users.find(user => user.username === 'membro_doc');
  assert.ok(member?.id, 'membro deve existir');
  await postJson(`${server.baseUrl}/api/auth/users/manage`, {
    userId: member.id, status: 'active', password: 'Senha-Admin-2026!', code: generateTotp(setup.manualSecret)
  }, { ...adminAuth, 'X-CSRF-Token': adminCsrf });
  res = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'membro_doc', password: 'Senha-Membro-2026!' });
  const memberAuth = { Cookie: res.headers.get('set-cookie').split(';')[0] };
  const memberCsrf = (await res.json()).csrfToken;

  // B cria um processo privado próprio.
  res = await postJson(`${server.baseUrl}/api/state`, {
    state: { processes: [{ id: 'proc-b', number: '0000002-22.2026.8.21.0001', scope: 'private', privateOwnerUserId: member.id, client: 'Cliente B' }] }
  }, { ...memberAuth, 'X-CSRF-Token': memberCsrf });
  assert.equal(res.status, 200, 'B deve criar processo privado');

  const base = Buffer.from('conteudo-sintetico').toString('base64');
  const stateA = await (await fetch(`${server.baseUrl}/api/state`, { headers: adminAuth })).json();
  assert.ok(stateA.revision, 'revisão deve existir');

  // A tenta anexar documento ao processo privado de B.
  res = await postJson(`${server.baseUrl}/api/documents`, {
    ownerType: 'process', ownerId: 'proc-b', contentBase64: base, originalName: 'a.txt', revision: stateA.revision
  }, { ...adminAuth, 'X-CSRF-Token': adminCsrf });
  assert.equal(res.status, 403, 'A não pode anexar a processo privado de B');

  // Controle: B anexa ao próprio processo privado.
  const stateB = await (await fetch(`${server.baseUrl}/api/state`, { headers: memberAuth })).json();
  res = await postJson(`${server.baseUrl}/api/documents`, {
    ownerType: 'process', ownerId: 'proc-b', contentBase64: base, originalName: 'b.txt', revision: stateB.revision
  }, { ...memberAuth, 'X-CSRF-Token': memberCsrf });
  assert.equal(res.status, 201, 'B pode anexar ao próprio processo privado');

  console.log('document_upload_access: PASS');
} finally {
  await server.stop();
}
process.exit(0);
