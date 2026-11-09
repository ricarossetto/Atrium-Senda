import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { SecurityManager, generateTotp } from '../lib/security.mjs';

const directory = await mkdtemp(path.join(os.tmpdir(), 'atrium-factory-reset-security-'));
try {
  const security = new SecurityManager({
    dataDirectory: directory,
    sessionSecret: randomBytes(48).toString('base64url'),
    encryptionKey: randomBytes(32).toString('base64')
  });
  await security.init();
  const password = 'Synthetic-Reset-Password-2026!';
  const pending = await security.beginSetup({ username: 'master.synthetic', displayName: 'Master Teste', email: 'master@example.test', workspaceName: 'Workspace Sintético', password }, '127.0.0.1');
  const setup = await security.finishSetup({ setupToken: pending.setupToken, code: generateTotp(pending.manualSecret) });
  const workspaceId = setup.user.workspaceId;
  const actor = { username: setup.user.username, role: setup.user.role, workspaceId };
  const req = { headers: { cookie: `keller_session=${setup.token}` } };

  assert.equal(await security.verifyFactoryResetReauthentication({ username: actor.username, workspaceId, password, code: generateTotp(pending.manualSecret) }), true);
  assert.equal(await security.verifyFactoryResetReauthentication({ username: actor.username, workspaceId, password: 'wrong synthetic password', code: generateTotp(pending.manualSecret) }), false);
  assert.equal(await security.verifyFactoryResetReauthentication({ username: actor.username, workspaceId, password, code: '000000' }), false);
  assert.equal(security.authorizeFactoryReset(actor), true);
  assert.equal(security.authorizeFactoryReset({ ...actor, role: 'admin' }), false);

  security.state.users.push({ id: 'synthetic-collaborator', username: 'collaborator.synthetic', role: 'collaborator', status: 'active', workspaceId });
  security.state.users.push({ id: 'synthetic-other-master', username: 'other.master', role: 'master_admin', status: 'active', workspaceId: 'ws-other-synthetic' });
  const otherWorkspaceLogin = security.createSession('other.master', 'Other Master', 'master_admin', '', '', '', '', '', false, 'ws-other-synthetic');
  const collaboratorLogin = security.createSession('collaborator.synthetic', 'Colaborador Sintético', 'collaborator', '', '', '', '', '', false, workspaceId);
  security.state.trustedDevices ||= [];
  security.state.trustedDevices.push({ id: 'synthetic-trusted-this', username: actor.username, workspaceId, expiresAt: Date.now() + 60_000 });
  security.state.trustedDevices.push({ id: 'synthetic-trusted-other', username: 'other.master', workspaceId: 'ws-other-synthetic', expiresAt: Date.now() + 60_000 });
  const loginMfaBefore = security.state.users.find(user => user.username === actor.username).encryptedTotp;
  const identitySnapshot = await security.snapshotFactoryResetIdentity({ workspaceId });
  const persistedSnapshotFile = path.join(directory, 'synthetic-identity-snapshot.json');
  await security.persistFactoryResetIdentitySnapshot({ file: persistedSnapshotFile, snapshot: identitySnapshot });
  assert.equal((await readFile(persistedSnapshotFile, 'utf8')).includes(password), false);

  await security.preserveWorkspaceMasterIdentity({ workspaceId, username: actor.username, req });
  assert.deepEqual(security.state.users.filter(user => user.workspaceId === workspaceId).map(user => user.username), [actor.username]);
  assert.equal(security.sessions.has(sessionKey(setup.token)), true);
  assert.equal(security.sessions.has(sessionKey(collaboratorLogin.token)), false);
  assert.equal(security.sessions.has(sessionKey(otherWorkspaceLogin.token)), true);
  assert.equal(security.state.trustedDevices.some(device => device.workspaceId === workspaceId), false);
  assert.equal(security.state.trustedDevices.some(device => device.workspaceId === 'ws-other-synthetic'), true);
  assert.deepEqual(security.state.users.find(user => user.username === actor.username).encryptedTotp, loginMfaBefore);
  assert.equal(await security.verifyFactoryResetReauthentication({ username: actor.username, workspaceId, password, code: generateTotp(pending.manualSecret) }), true);
  await security.restorePersistedFactoryResetIdentitySnapshot({ workspaceId, file: persistedSnapshotFile });
  console.log('factory reset security: MFA reauthentication, master/session preservation and tenant-scoped revocation passed');
} finally {
  await rm(directory, { recursive: true, force: true });
}

function sessionKey(token) { return createHash('sha256').update(token).digest('base64url'); }
