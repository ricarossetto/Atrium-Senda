import assert from 'node:assert/strict';
import { createCipheriv, randomBytes } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n=== RUNTIME RECOVERY: AUSÊNCIA, MIGRAÇÃO E QUARENTENA ===\n');

function encrypt(value, encryptionKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'base64'), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

function runtimeEnvelope(runtime, encryptionKey, updatedAt = '2026-08-29T12:00:00.000Z') {
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    updatedAt,
    encrypted: encrypt(JSON.stringify(runtime), encryptionKey)
  };
}

async function setupAuth(server, username = `runtime-${randomBytes(3).toString('hex')}`) {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username,
    displayName: 'Administrador Runtime',
    password: 'Runtime-Sintetico-2026!'
  });
  const setup = await response.json();
  assert.equal(response.status, 200, 'Setup sintético do runtime deve funcionar.');
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  const verified = await response.json();
  assert.equal(response.status, 200, 'Confirmação TOTP sintética deve funcionar.');
  return {
    Cookie: response.headers.get('set-cookie').split(';')[0],
    'Content-Type': 'application/json',
    'X-CSRF-Token': verified.csrfToken
  };
}

async function pathExists(target) {
  try { await access(target); return true; } catch { return false; }
}

async function createScenarioDirectory() {
  return mkdtemp(path.join(tmpdir(), 'atrium-runtime-recovery-test-'));
}

async function cleanScenarioDirectory(directory) {
  const resolved = path.resolve(directory);
  const expectedRoot = `${path.resolve(tmpdir())}${path.sep}`;
  assert.ok(resolved.startsWith(expectedRoot) && path.basename(resolved).startsWith('atrium-runtime-recovery-test-'));
  await rm(resolved, { recursive: true, force: true });
}

async function startScenario(dataDirectory, encryptionKey, extraEnv = {}) {
  return startTestServer({
    dataDirectory,
    env: { NODE_ENV: 'test', AUTH_ENCRYPTION_KEY: encryptionKey, ...extraEnv }
  });
}

// 1. Arquivo ausente é um estado normal e explícito.
{
  const dataDirectory = await createScenarioDirectory();
  const encryptionKey = randomBytes(32).toString('base64');
  const server = await startScenario(dataDirectory, encryptionKey);
  try {
    const headers = await setupAuth(server);
    const response = await fetch(`${server.baseUrl}/api/system/state-diagnostics`, { headers });
    const diagnostic = await response.json();
    assert.equal(diagnostic.runtimeStateStatus, 'EMPTY');
    assert.equal(diagnostic.runtimeFileExists, false);
    assert.equal(diagnostic.runtimeRecoveryDetails, null);
  } finally {
    await server.stop();
    await cleanScenarioDirectory(dataDirectory);
  }
}

// 2. Envelope cifrado válido permanece READY.
{
  const dataDirectory = await createScenarioDirectory();
  const encryptionKey = randomBytes(32).toString('base64');
  const runtimeFile = path.join(dataDirectory, 'runtime.json');
  const runtime = { events: [{ id: 'runtime-valid-synthetic' }], updatedAt: '2026-08-29T12:00:00.000Z' };
  await writeFile(runtimeFile, JSON.stringify(runtimeEnvelope(runtime, encryptionKey), null, 2), { mode: 0o600 });
  const server = await startScenario(dataDirectory, encryptionKey);
  try {
    const headers = await setupAuth(server);
    const diagnostic = await (await fetch(`${server.baseUrl}/api/system/diagnostic`, { headers })).json();
    assert.equal(diagnostic.diagnostic.runtime.status, 'READY');
    assert.equal(diagnostic.diagnostic.runtime.fileExists, true);
    assert.equal(diagnostic.diagnostic.runtime.lastRuntimeUpdate, runtime.updatedAt);
    const recovered = await (await fetch(`${server.baseUrl}/api/events`, { headers })).json();
    assert.equal(recovered.events[0].id, 'runtime-valid-synthetic');
  } finally {
    await server.stop();
    await cleanScenarioDirectory(dataDirectory);
  }
}

// 3. Runtime legado válido é migrado para o envelope cifrado.
{
  const dataDirectory = await createScenarioDirectory();
  const encryptionKey = randomBytes(32).toString('base64');
  const runtimeFile = path.join(dataDirectory, 'runtime.json');
  await writeFile(runtimeFile, JSON.stringify({ events: [{ id: 'runtime-legacy-synthetic' }], updatedAt: '2026-08-29T13:00:00.000Z' }), { mode: 0o600 });
  const server = await startScenario(dataDirectory, encryptionKey);
  try {
    const headers = await setupAuth(server);
    const diagnostic = await (await fetch(`${server.baseUrl}/api/system/state-diagnostics`, { headers })).json();
    assert.equal(diagnostic.runtimeStateStatus, 'READY');
    const migratedText = await readFile(runtimeFile, 'utf8');
    assert.match(migratedText, /"algorithm": "aes-256-gcm"/);
    assert.doesNotMatch(migratedText, /runtime-legacy-synthetic/);
  } finally {
    await server.stop();
    await cleanScenarioDirectory(dataDirectory);
  }
}

// 4. JSON corrompido é preservado, sinalizado e só é limpo por rebuild explícito.
{
  const dataDirectory = await createScenarioDirectory();
  const encryptionKey = randomBytes(32).toString('base64');
  const runtimeFile = path.join(dataDirectory, 'runtime.json');
  const recoveryDirectory = path.join(dataDirectory, 'recovery');
  const firstMarker = 'SYNTHETIC_CORRUPT_RUNTIME_MARKER_ONE';
  await writeFile(runtimeFile, `{${firstMarker}`, { mode: 0o600 });
  let server = await startScenario(dataDirectory, encryptionKey);
  let headers;
  try {
    headers = await setupAuth(server);
    const statePayload = await (await fetch(`${server.baseUrl}/api/state`, { headers })).json();
    assert.notEqual(statePayload.stateStatus, 'RECOVERY_REQUIRED', 'Corrupção exclusiva do runtime não pode bloquear o app-state.');

    const diagnostic = await (await fetch(`${server.baseUrl}/api/system/diagnostic`, { headers })).json();
    assert.equal(diagnostic.diagnostic.runtime.status, 'QUARANTINED');
    assert.equal(diagnostic.diagnostic.runtime.fileExists, false);
    assert.ok(diagnostic.diagnostic.runtime.recoveryDetails?.recoveryFile?.startsWith('recovery/runtime-corrupt-'));
    assert.equal(diagnostic.diagnostic.integrations.collector.status, 'atencao_runtime_quarentenado');
    assert.equal(JSON.stringify(diagnostic).includes(dataDirectory), false, 'Diagnóstico não deve expor caminho absoluto do diretório de dados.');

    const recoveryFiles = (await readdir(recoveryDirectory)).filter(name => name.startsWith('runtime-corrupt-'));
    assert.equal(recoveryFiles.length, 1);
    const recoveryFile = path.join(recoveryDirectory, recoveryFiles[0]);
    assert.match(await readFile(recoveryFile, 'utf8'), new RegExp(firstMarker));
    if (process.platform !== 'win32') assert.equal((await stat(recoveryFile)).mode & 0o777, 0o600);
    assert.equal(await pathExists(runtimeFile), false);

    const rebuild = await postJson(`${server.baseUrl}/api/system/rebuild-runtime`, {}, headers);
    assert.equal(rebuild.status, 200);
    const rebuilt = await (await fetch(`${server.baseUrl}/api/system/state-diagnostics`, { headers })).json();
    assert.equal(rebuilt.runtimeStateStatus, 'READY');
    assert.equal(rebuilt.runtimeRecoveryDetails, null);
    assert.equal(rebuilt.runtimeFileExists, true);
  } finally {
    await server.stop();
  }

  const secondMarker = 'SYNTHETIC_CORRUPT_RUNTIME_MARKER_TWO';
  await writeFile(runtimeFile, `{${secondMarker}`, { mode: 0o600 });
  server = await startScenario(dataDirectory, encryptionKey, { AUTH_SESSION_SECRET: server.sessionSecret });
  try {
    const recoveryFiles = (await readdir(recoveryDirectory)).filter(name => name.startsWith('runtime-corrupt-')).sort();
    assert.equal(recoveryFiles.length, 2, 'Nova quarentena não pode sobrescrever recuperação anterior.');
    const contents = await Promise.all(recoveryFiles.map(name => readFile(path.join(recoveryDirectory, name), 'utf8')));
    assert.ok(contents.some(value => value.includes(firstMarker)) && contents.some(value => value.includes(secondMarker)));
  } finally {
    await server.stop();
    await cleanScenarioDirectory(dataDirectory);
  }
}

// 5. Envelope inválido e falha de descriptografia também entram em quarentena.
for (const scenario of [
  {
    name: 'invalid-envelope',
    expectedReason: 'INVALID_RUNTIME_ENVELOPE',
    create: () => ({ version: 1, algorithm: 'aes-256-gcm', updatedAt: '2026-08-29T14:00:00.000Z' })
  },
  {
    name: 'decrypt-failure',
    expectedReason: 'RUNTIME_DECRYPTION_FAILED',
    create: encryptionKey => runtimeEnvelope({ events: [] }, encryptionKey === 'unused' ? encryptionKey : randomBytes(32).toString('base64'))
  }
]) {
  const dataDirectory = await createScenarioDirectory();
  const encryptionKey = randomBytes(32).toString('base64');
  await writeFile(path.join(dataDirectory, 'runtime.json'), JSON.stringify(scenario.create(encryptionKey), null, 2), { mode: 0o600 });
  const server = await startScenario(dataDirectory, encryptionKey);
  try {
    const headers = await setupAuth(server, `runtime-${scenario.name}`);
    const diagnostic = await (await fetch(`${server.baseUrl}/api/system/state-diagnostics`, { headers })).json();
    assert.equal(diagnostic.runtimeStateStatus, 'QUARANTINED');
    assert.equal(diagnostic.runtimeRecoveryDetails.reason, scenario.expectedReason);
  } finally {
    await server.stop();
    await cleanScenarioDirectory(dataDirectory);
  }
}

console.log('✓ Runtime ausente, válido, legado, corrompido, quarentena e rebuild explícito aprovados.');
