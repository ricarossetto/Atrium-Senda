import assert from 'node:assert/strict';
import { readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const password = 'Senha-Restart-2026!';
let server = await startTestServer({ preserveDataDirectory: true });
const dataDirectory = server.dataDirectory;
const secrets = { AUTH_SESSION_SECRET: server.sessionSecret, AUTH_ENCRYPTION_KEY: server.encryptionKey };

async function createInitialWorkspace() {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'restart-a', displayName: 'Administradora Teste A A', email: 'restart-a-a@example.test',
    workspaceName: 'Escritório Reinício A', password
  });
  const pending = await response.json();
  assert.equal(response.ok, true);
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: pending.setupToken, code: generateTotp(pending.manualSecret)
  });
  const session = await response.json();
  return { ...session, secret: pending.manualSecret, cookie: response.headers.get('set-cookie').split(';')[0] };
}

async function createAdditionalWorkspace() {
  let response = await postJson(`${server.baseUrl}/api/auth/workspaces/register`, {
    username: 'restart-b', displayName: 'Administrador Teste B', email: 'restart-b@example.test',
    workspaceName: 'Escritório Reinício B', password
  });
  const pending = await response.json();
  assert.equal(response.ok, true);
  response = await postJson(`${server.baseUrl}/api/auth/workspaces/register/verify`, {
    setupToken: pending.setupToken, code: generateTotp(pending.manualSecret)
  });
  const session = await response.json();
  return { ...session, secret: pending.manualSecret, cookie: response.headers.get('set-cookie').split(';')[0] };
}

async function saveState(session, marker) {
  const response = await postJson(`${server.baseUrl}/api/state`, {
    state: {
      version: 1, terms: [], sources: [], intimations: [], tasks: [], processes: [], contacts: [], agenda: [], audit: [],
      settings: { officeName: marker }
    }
  }, { Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken });
  assert.equal(response.ok, true);
}

async function login(username, secret) {
  const response = await postJson(`${server.baseUrl}/api/auth/login`, {
    username, password, code: generateTotp(secret)
  });
  const body = await response.json();
  assert.equal(response.ok, true, body.message);
  return { ...body, cookie: response.headers.get('set-cookie').split(';')[0] };
}

try {
  const first = await createInitialWorkspace();
  const second = await createAdditionalWorkspace();
  await saveState(first, 'MARCADOR-A');
  await saveState(second, 'MARCADOR-B');

  await server.stop();
  const secondDirectory = path.join(dataDirectory, 'workspaces', second.user.workspaceId);
  await writeFile(path.join(secondDirectory, 'app-state.json'), '{arquivo-corrompido', 'utf8');

  server = await startTestServer({ dataDirectory, env: secrets, preserveDataDirectory: true });
  const restoredFirst = await login('restart-a', first.secret);
  const restoredSecond = await login('restart-b', second.secret);

  const firstState = await (await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: restoredFirst.cookie } })).json();
  const secondState = await (await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: restoredSecond.cookie } })).json();
  assert.equal(firstState.state?.settings?.officeName, 'MARCADOR-A', 'Estado íntegro não sobreviveu ao reinício.');
  assert.equal(secondState.stateStatus, 'RECOVERY_REQUIRED', 'Workspace corrompido não foi isolado em recuperação.');
  assert.equal(secondState.state, null, 'Workspace corrompido não pode expor estado parcial.');

  const recoveryFiles = await readdir(path.join(secondDirectory, 'recovery'));
  assert.equal(recoveryFiles.some(name => name.startsWith('app-state-corrupt-')), true, 'Arquivo corrompido não foi preservado na recuperação do próprio workspace.');
  const defaultRecovery = await readdir(path.join(dataDirectory, 'recovery')).catch(() => []);
  assert.equal(defaultRecovery.some(name => name.startsWith('app-state-corrupt-')), false, 'Falha do segundo workspace contaminou a recuperação do primeiro.');

  console.log('Multi-workspace restart and isolated corruption tests passed.');
} finally {
  await server.stop().catch(() => {});
  await rm(dataDirectory, { recursive: true, force: true });
}
