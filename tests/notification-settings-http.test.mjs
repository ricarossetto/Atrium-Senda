import assert from 'node:assert/strict';
import { SecurityManager } from '../lib/security.mjs';
import { NotificationDatabase } from '../lib/notifications/db.mjs';
import { postJson } from './helpers.mjs';
import { startNotificationRuntime } from './helpers-notification-runtime.mjs';
import path from 'node:path';

const types = ['PUBLICATION_NEW', 'DEADLINE_CRITICAL', 'HEARING_NEW', 'MOVEMENT_NEW', 'SYNC_FAILED', 'A1_CERT_EXPIRING'];
const server = await startNotificationRuntime();
let db;
try {
  const password = 'Synthetic-Settings-Password-2026!';
  const setup = await (await postJson(`${server.baseUrl}/api/auth/setup`, { username: 'settings.admin', displayName: 'Admin Teste', email: 'admin@example.test', password })).json();
  const verified = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, skipMfa: true });
  assert.equal(verified.status, 200);
  const session = await verified.json();
  const headers = { Cookie: verified.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': session.csrfToken };
  const url = `${server.baseUrl}/api/user/notification-preferences`;
  const put = (body, requestHeaders = headers) => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...requestHeaders }, body: JSON.stringify(body) });
  const get = async (requestHeaders = headers) => {
    const response = await fetch(url, { headers: requestHeaders });
    assert.equal(response.status, 200);
    return (await response.json()).preferences;
  };
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await put({ eventType: 'MOVEMENT_NEW', cadence: 'BULLETINS' }, {})).status, 401);
  assert.equal((await put({ eventType: 'MOVEMENT_NEW', cadence: 'BULLETINS' }, { Cookie: headers.Cookie })).status, 403);
  const initial = await put({ preferences: types.map(eventType => ({ eventType, cadence: 'BULLETINS', enabled: true })) });
  assert.equal(initial.status, 200, 'All six operational types must accept the UI BULLETINS cadence');
  assert.equal((await initial.json()).preferences.length, 6);
  let preferences = await get();
  assert.deepEqual(preferences.map(item => item.event_type).sort(), [...types].sort());
  assert(preferences.every(item => item.cadence === 'BULLETINS' && item.enabled));

  const identity = await (await fetch(`${server.baseUrl}/api/auth/status`, { headers })).json();
  const adminUser = (await (await fetch(`${server.baseUrl}/api/auth/users`, { headers })).json()).users.find(user => user.username === 'settings.admin');
  const security = new SecurityManager({ dataDirectory: server.dataDirectory, sessionSecret: server.sessionSecret, encryptionKey: server.encryptionKey });
  db = new NotificationDatabase({ dbPath: path.join(server.dataDirectory, 'notifications.sqlite'), securityManager: security });
  assert.equal(db.getUserPreferences(identity.workspace.id, adminUser.id).length, 6);
  assert.equal(db.getUserPreferences(identity.workspace.id, 'forged-user').length, 0);

  for (const cadence of ['IMMEDIATE', 'DAILY', 'SYNC_DIGEST']) {
    const result = await put({ preferences: types.map(eventType => ({ eventType, cadence, enabled: true })), userId: 'forged-user', workspaceId: 'ws-forged' });
    assert.equal(result.status, 200);
    assert((await result.json()).preferences.every(item => item.cadence === 'BULLETINS'));
    assert((await get()).every(item => item.cadence === 'BULLETINS'));
  }
  for (const enabled of [false, 0]) {
    assert.equal((await put({ eventType: 'MOVEMENT_NEW', cadence: 'BULLETINS', enabled })).status, 200);
    const movement = (await get()).find(item => item.event_type === 'MOVEMENT_NEW');
    assert.equal(movement.cadence, 'DISABLED');
    assert.equal(Boolean(movement.enabled), false);
    assert((await get()).filter(item => item.event_type !== 'MOVEMENT_NEW').every(item => item.cadence === 'BULLETINS'));
  }
  assert.equal((await put({ eventType: 'MOVEMENT_NEW', cadence: 'DISABLED', enabled: true })).status, 200);
  assert.equal(Boolean((await get()).find(item => item.event_type === 'MOVEMENT_NEW').enabled), false);
  const beforeInvalid = await get();
  for (const invalid of [{ eventType: 'SYSTEM_TEST', cadence: 'BULLETINS' }, { eventType: 'PASSWORD_RESET', cadence: 'BULLETINS' }, { eventType: 'UNKNOWN', cadence: 'BULLETINS' }, { eventType: 'PUBLICATION_NEW', cadence: 'UNKNOWN' }, { eventType: 'PUBLICATION_NEW', cadence: 'BULLETINS', enabled: 'false' }]) {
    const response = await put({ preferences: [{ eventType: 'PUBLICATION_NEW', cadence: 'DISABLED' }, invalid] });
    assert.equal(response.status, 400);
    assert.deepEqual(await get(), beforeInvalid, 'Rejected batch cannot partially overwrite preferences');
  }

  const registration = await (await postJson(`${server.baseUrl}/api/auth/register`, { username: 'settings.collab', displayName: 'Colaborador Teste', email: 'collab@example.test', password }, headers)).json();
  const verification = await postJson(`${server.baseUrl}/api/auth/register/verify`, { setupToken: registration.setupToken, skipMfa: true });
  assert.equal(verification.status, 200);
  const list = await (await fetch(`${server.baseUrl}/api/auth/users`, { headers })).json();
  const collaborator = list.users.find(user => user.username === 'settings.collab');
  const missingStepUp = await postJson(`${server.baseUrl}/api/auth/users/manage`, { userId: collaborator.id, status: 'active', role: 'admin' }, headers);
  assert.equal(missingStepUp.status, 403);
  assert.equal((await missingStepUp.json()).code, 'REAUTH_REQUIRED');
  const promote = await postJson(`${server.baseUrl}/api/auth/users/manage`, { userId: collaborator.id, status: 'active', role: 'collaborator', password }, headers);
  assert.equal(promote.status, 200);
  const login = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'settings.collab', password });
  assert.equal(login.status, 200);
  const collabSession = await login.json();
  assert.equal(collabSession.user.role, 'collaborator');
  const collabHeaders = { Cookie: login.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': collabSession.csrfToken };
  assert.equal((await put({ eventType: 'MOVEMENT_NEW', cadence: 'BULLETINS' }, collabHeaders)).status, 200);
  for (const eventType of ['SYNC_FAILED', 'A1_CERT_EXPIRING']) {
    assert.equal((await put({ eventType, cadence: 'BULLETINS', role: 'master_admin' }, collabHeaders)).status, 403);
    assert(!(await get(collabHeaders)).some(item => item.event_type === eventType));
  }
  assert.equal((await fetch(`${server.baseUrl}/api/admin/mail/status`, { headers: collabHeaders })).status, 403);
  assert.deepEqual(await get(), beforeInvalid, 'Collaborator writes cannot change admin preferences');
  const adminPromotion = await postJson(`${server.baseUrl}/api/auth/users/manage`, { userId: collaborator.id, status: 'active', role: 'admin', password }, headers);
  assert.equal(adminPromotion.status, 200);
  const adminLogin = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'settings.collab', password });
  assert.equal(adminLogin.status, 200);
  const adminSession = await adminLogin.json();
  assert.equal(adminSession.user.role, 'admin');
  const adminHeaders = { Cookie: adminLogin.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': adminSession.csrfToken };
  for (const eventType of ['SYNC_FAILED', 'A1_CERT_EXPIRING']) {
    assert.equal((await put({ eventType, cadence: 'BULLETINS' }, adminHeaders)).status, 200);
    assert.equal((await get(adminHeaders)).find(item => item.event_type === eventType).cadence, 'BULLETINS');
  }
  assert.equal((await fetch(`${server.baseUrl}/api/admin/mail/status`, { headers: adminHeaders })).status, 403, 'Admin is not master_admin for workspace Mail management');
  assert.deepEqual(await get(), beforeInvalid);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM notification_outbox').get().n, 0);
  console.log('PASS notification settings HTTP: six types, legacy normalization, persisted GET/PUT, opt-outs, batch rejection, RBAC, CSRF and isolation');
} finally {
  db?.close();
  await server.stop();
}
