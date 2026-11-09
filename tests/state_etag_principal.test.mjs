import assert from 'node:assert/strict';
import { generateTotp } from '../lib/security.mjs';
import { startTestServer, postJson } from './helpers.mjs';

// Contrato: /api/state é projetado por principal (escopo privado/papéis). O ETag
// precisa ser escopado à identidade e o 304 só pode reutilizar o corpo do MESMO
// principal — caso contrário um cache de navegador replaya o corpo filtrado de
// outro membro (mesma URL, sem Vary). Ver run-5 v16.
const server = await startTestServer();
try {
  let res = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_etag', displayName: 'Admin Etag', email: 'etag-admin@example.test', password: 'Senha-Admin-2026!'
  });
  const setup = await res.json();
  res = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken, code: generateTotp(setup.manualSecret)
  });
  const adminCookie = res.headers.get('set-cookie').split(';')[0];
  const adminCsrf = (await res.json()).csrfToken;
  const adminAuth = { Cookie: adminCookie };

  // Segundo membro no MESMO workspace (mesma revisão de estado).
  res = await postJson(`${server.baseUrl}/api/auth/register`, {
    username: 'membro_etag', displayName: 'Membro Etag', email: 'etag-membro@example.test', password: 'Senha-Membro-2026!'
  }, { ...adminAuth, 'X-CSRF-Token': adminCsrf });
  const registration = await res.json();
  res = await postJson(`${server.baseUrl}/api/auth/register/verify`, { setupToken: registration.setupToken, skipMfa: true });
  assert.equal(res.status, 200, 'verificação do membro deve concluir');

  // Aprovação administrativa (reautenticação exige senha + TOTP do admin).
  res = await fetch(`${server.baseUrl}/api/auth/users`, { headers: adminAuth });
  const member = (await res.json()).users.find(user => user.username === 'membro_etag');
  assert.ok(member?.id, 'membro pendente deve aparecer na lista de usuários');
  res = await postJson(`${server.baseUrl}/api/auth/users/manage`, {
    userId: member.id, status: 'active', password: 'Senha-Admin-2026!', code: generateTotp(setup.manualSecret)
  }, { ...adminAuth, 'X-CSRF-Token': adminCsrf });
  assert.equal(res.status, 200, 'admin deve aprovar o membro');

  res = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'membro_etag', password: 'Senha-Membro-2026!' });
  assert.equal(res.status, 200, 'login do membro (sem MFA) deve funcionar');
  const memberAuth = { Cookie: res.headers.get('set-cookie').split(';')[0] };

  // Popula estado para existir revisão oficial (o ETag deriva da revisão).
  res = await postJson(`${server.baseUrl}/api/state`, { state: { tasks: [{ id: 't1', title: 'Tarefa ETag' }] } }, { ...adminAuth, 'X-CSRF-Token': adminCsrf });
  assert.equal(res.status, 200, 'estado inicial deve ser salvo');

  const adminState = await fetch(`${server.baseUrl}/api/state`, { headers: adminAuth });
  const memberState = await fetch(`${server.baseUrl}/api/state`, { headers: memberAuth });
  assert.equal(adminState.status, 200);
  assert.equal(memberState.status, 200);
  const etagAdmin = adminState.headers.get('etag');
  const etagMember = memberState.headers.get('etag');
  assert.ok(etagAdmin && etagMember, 'ETag deve estar presente');
  assert.notEqual(etagAdmin, etagMember, 'ETag deve ser escopado ao principal (mesma revisão)');
  assert.match(String(adminState.headers.get('vary') || ''), /cookie/i, 'Vary deve incluir Cookie');

  const revalid = await fetch(`${server.baseUrl}/api/state`, { headers: { ...adminAuth, 'If-None-Match': etagAdmin } });
  assert.equal(revalid.status, 304, 'mesmo principal deve continuar recebendo 304');

  const cross = await fetch(`${server.baseUrl}/api/state`, { headers: { ...memberAuth, 'If-None-Match': etagAdmin } });
  assert.notEqual(cross.status, 304, 'ETag de outro principal não pode gerar 304 (replay de corpo)');

  console.log('state_etag_principal: PASS');
} finally {
  await server.stop();
}
process.exit(0);
