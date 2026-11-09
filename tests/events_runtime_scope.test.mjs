import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateTotp, SecurityManager } from '../lib/security.mjs';
import { startTestServer, postJson } from './helpers.mjs';

// Contrato: GET /api/events serve o runtime pela mesma projeção consolidada de acesso.
// O runtime carrega escopo privado inclusive DERIVADO (termo/processo privado), que a
// checagem crua de `scope` não enxerga. Ver run-5 (crítico 2ª passada).
const CNJ_PRIV = '0000031-31.2026.8.21.0001';
const CNJ_OFFICE = '0000032-32.2026.8.21.0001';
const SENT_PRIV = 'EVENTO-RUNTIME-PRIVADO-5a1c';
const SENT_OFFICE = 'EVENTO-RUNTIME-OFICIO-9b2d';

const server = await startTestServer();
try {
  let res = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_ev', displayName: 'Admin Ev', email: 'ev-admin@example.test', password: 'Senha-Admin-2026!'
  });
  const setup = await res.json();
  res = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  const adminAuth = { Cookie: res.headers.get('set-cookie').split(';')[0] };
  const adminCsrf = (await res.json()).csrfToken;

  res = await postJson(`${server.baseUrl}/api/auth/register`, {
    username: 'membro_ev', displayName: 'Membro Ev', email: 'ev-membro@example.test', password: 'Senha-Membro-2026!'
  }, { ...adminAuth, 'X-CSRF-Token': adminCsrf });
  const registration = await res.json();
  await postJson(`${server.baseUrl}/api/auth/register/verify`, { setupToken: registration.setupToken, skipMfa: true });
  res = await fetch(`${server.baseUrl}/api/auth/users`, { headers: adminAuth });
  const member = (await res.json()).users.find(user => user.username === 'membro_ev');
  await postJson(`${server.baseUrl}/api/auth/users/manage`, {
    userId: member.id, status: 'active', password: 'Senha-Admin-2026!', code: generateTotp(setup.manualSecret)
  }, { ...adminAuth, 'X-CSRF-Token': adminCsrf });
  res = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'membro_ev', password: 'Senha-Membro-2026!' });
  const memberAuth = { Cookie: res.headers.get('set-cookie').split(';')[0] };
  const memberCsrf = (await res.json()).csrfToken;

  // B cria um termo privado (o runtime derivará privacidade dele via monitoredTermIds).
  res = await postJson(`${server.baseUrl}/api/state`, {
    state: { terms: [{ id: 'term-ev-priv', name: 'Termo Ev Privado', scope: 'private', oabNumber: '999001' }] }
  }, { ...memberAuth, 'X-CSRF-Token': memberCsrf });
  assert.equal(res.status, 200, 'B deve criar termo privado');

  // Semeia o runtime: um processo derivado do termo privado (SEM scope) e um de escritório.
  const mgr = new SecurityManager({ dataDirectory: server.dataDirectory, encryptionKey: server.encryptionKey, sessionSecret: server.sessionSecret });
  const runtimePayload = {
    events: [], tasks: [], intimations: [], contacts: [], sources: [], updatedAt: new Date().toISOString(),
    processes: [
      { id: 'rt-derived-priv', number: CNJ_PRIV, client: SENT_PRIV, monitoredTermIds: ['term-ev-priv'] },
      { id: 'rt-oficio-ev', number: CNJ_OFFICE, client: SENT_OFFICE, scope: 'office' }
    ]
  };
  await writeFile(path.join(server.dataDirectory, 'runtime.json'), JSON.stringify({
    version: 1, algorithm: 'aes-256-gcm', updatedAt: new Date().toISOString(),
    encrypted: mgr.encrypt(JSON.stringify(runtimePayload))
  }), { mode: 0o600 });

  // A (admin) lê /api/events: o processo derivado do termo privado de B não pode aparecer.
  const events = await (await fetch(`${server.baseUrl}/api/events`, { headers: adminAuth })).json();
  const clients = (events.processes || []).map(item => String(item.client || ''));
  assert.ok(clients.includes(SENT_OFFICE), 'runtime de escritório deve ser servido');
  assert.ok(!clients.includes(SENT_PRIV), 'runtime derivado de termo privado de B NÃO pode ser servido a A');

  console.log('events_runtime_scope: PASS');
} finally {
  await server.stop();
}
process.exit(0);
