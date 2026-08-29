import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n=== MIGRAÇÕES DE SEGURANÇA: IA LEGADA E FEEDBACK LOCAL ===\n');

const AI_MARKER = 'SYNTHETIC_GEMINI_SECRET_MARKER';
const FEEDBACK_MARKER = 'SYNTHETIC_FEEDBACK_MESSAGE_MARKER';
const EXCLUDED_MARKER = 'SYNTHETIC_EXCLUDED_SECRET_MARKER';
const PASSWORD = 'Seguranca-Sintetica-2026!';

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

function decrypt(payload, encryptionKey) {
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'base64'), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

async function setupAuth(server, username) {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username,
    displayName: 'Administrador de Segurança',
    password: PASSWORD
  });
  const setup = await response.json();
  assert.equal(response.status, 200);
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  const verified = await response.json();
  assert.equal(response.status, 200);
  return {
    username,
    manualSecret: setup.manualSecret,
    headers: {
      Cookie: response.headers.get('set-cookie').split(';')[0],
      'Content-Type': 'application/json',
      'X-CSRF-Token': verified.csrfToken
    }
  };
}

async function login(server, auth) {
  const response = await postJson(`${server.baseUrl}/api/auth/login`, {
    username: auth.username,
    password: PASSWORD,
    code: generateTotp(auth.manualSecret)
  });
  const payload = await response.json();
  assert.equal(response.status, 200, 'Login após restart deve preservar autenticação.');
  return {
    Cookie: response.headers.get('set-cookie').split(';')[0],
    'Content-Type': 'application/json',
    'X-CSRF-Token': payload.csrfToken
  };
}

function minimalState() {
  return {
    version: 1,
    terms: [], sources: [], intimations: [], tasks: [], processes: [], agenda: [], audit: [],
    contacts: [], leads: [], customPrompts: [], customLinks: [], configuration: {}, settings: { officeName: 'Escritório Sintético' }
  };
}

async function bootstrapLegacyAiState(prefix, marker = AI_MARKER) {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), prefix));
  const encryptionKey = randomBytes(32).toString('base64');
  const sessionSecret = randomBytes(48).toString('base64url');
  let server = await startTestServer({
    dataDirectory,
    env: { NODE_ENV: 'test', AUTH_ENCRYPTION_KEY: encryptionKey, AUTH_SESSION_SECRET: sessionSecret }
  });
  const auth = await setupAuth(server, `admin-${randomBytes(4).toString('hex')}`);
  const saved = await postJson(`${server.baseUrl}/api/state`, { state: minimalState() }, auth.headers);
  assert.equal(saved.status, 200, 'Estado sintético inicial deve ser persistido.');
  await server.stop();

  const appStateFile = path.join(dataDirectory, 'app-state.json');
  const envelope = JSON.parse(await readFile(appStateFile, 'utf8'));
  const state = JSON.parse(decrypt(envelope.encrypted, encryptionKey));
  state.schemaVersion = 5;
  state.settings = { ...(state.settings || {}), geminiApiKey: marker };
  envelope.encrypted = encrypt(JSON.stringify(state), encryptionKey);
  await writeFile(appStateFile, JSON.stringify(envelope, null, 2), { mode: 0o600 });

  return { dataDirectory, encryptionKey, sessionSecret, auth, appStateFile };
}

async function cleanDirectory(directory, prefix) {
  const resolved = path.resolve(directory);
  assert.ok(resolved.startsWith(`${path.resolve(tmpdir())}${path.sep}`));
  assert.ok(path.basename(resolved).startsWith(prefix));
  await rm(resolved, { recursive: true, force: true });
}

async function fileExists(target) {
  try { await access(target); return true; } catch { return false; }
}

// 1. A chave legada migra somente no startup e GET /api/state permanece read-only.
const successContext = await bootstrapLegacyAiState('atrium-security-migration-success-');
let successServer = await startTestServer({
  dataDirectory: successContext.dataDirectory,
  env: {
    NODE_ENV: 'test',
    AUTH_ENCRYPTION_KEY: successContext.encryptionKey,
    AUTH_SESSION_SECRET: successContext.sessionSecret
  }
});

try {
  const headers = await login(successServer, successContext.auth);
  const aiSecretsFile = path.join(successContext.dataDirectory, 'ai-secrets.json');
  const aiSecretsText = await readFile(aiSecretsFile, 'utf8');
  const aiEnvelope = JSON.parse(aiSecretsText);
  assert.equal(aiEnvelope.algorithm, 'aes-256-gcm');
  assert.doesNotMatch(aiSecretsText, new RegExp(AI_MARKER));
  assert.equal(JSON.parse(decrypt(aiEnvelope.encrypted, successContext.encryptionKey)).geminiApiKey, AI_MARKER);
  if (process.platform !== 'win32') assert.equal((await stat(aiSecretsFile)).mode & 0o777, 0o600);

  const migratedEnvelopeBeforeGet = await readFile(successContext.appStateFile, 'utf8');
  const migratedState = JSON.parse(decrypt(JSON.parse(migratedEnvelopeBeforeGet).encrypted, successContext.encryptionKey));
  assert.equal(Object.prototype.hasOwnProperty.call(migratedState.settings, 'geminiApiKey'), false);

  const stateResponse = await fetch(`${successServer.baseUrl}/api/state`, { headers });
  const publicState = await stateResponse.json();
  assert.equal(stateResponse.status, 200);
  assert.equal(JSON.stringify(publicState).includes(AI_MARKER), false);
  const migratedEnvelopeAfterGet = await readFile(successContext.appStateFile, 'utf8');
  assert.equal(migratedEnvelopeAfterGet, migratedEnvelopeBeforeGet, 'GET /api/state não pode gravar nem trocar revision.');
  assert.equal(successServer.output().includes(AI_MARKER), false, 'Logs não podem conter o segredo sintético.');

  // 2. Feedback exige sessão + CSRF, recusa vazio e persiste somente no arquivo local cifrado.
  let feedbackResponse = await postJson(`${successServer.baseUrl}/api/system/feedback`, { message: FEEDBACK_MARKER }, { Cookie: headers.Cookie });
  assert.equal(feedbackResponse.status, 403);
  feedbackResponse = await postJson(`${successServer.baseUrl}/api/system/feedback`, { message: '   ' }, headers);
  assert.equal(feedbackResponse.status, 400);
  feedbackResponse = await postJson(`${successServer.baseUrl}/api/system/feedback`, {
    type: 'bug',
    component: 'Configurações',
    message: FEEDBACK_MARKER,
    token: EXCLUDED_MARKER,
    diagnostic: { secret: EXCLUDED_MARKER },
    processes: [{ id: EXCLUDED_MARKER }]
  }, headers);
  assert.equal(feedbackResponse.status, 200);

  const feedbackFile = path.join(successContext.dataDirectory, 'feedback', 'beta-feedback.json');
  let feedbackText = await readFile(feedbackFile, 'utf8');
  let feedbackEnvelope = JSON.parse(feedbackText);
  assert.equal(feedbackEnvelope.algorithm, 'aes-256-gcm');
  assert.doesNotMatch(feedbackText, new RegExp(FEEDBACK_MARKER));
  assert.doesNotMatch(feedbackText, new RegExp(EXCLUDED_MARKER));
  let feedbackEntries = JSON.parse(decrypt(feedbackEnvelope.encrypted, successContext.encryptionKey));
  assert.equal(feedbackEntries[0].message, FEEDBACK_MARKER);
  assert.deepEqual(Object.keys(feedbackEntries[0]).sort(), ['appVersion', 'component', 'createdAt', 'id', 'message', 'type', 'user']);
  assert.equal(JSON.stringify(feedbackEntries).includes(EXCLUDED_MARKER), false);
  if (process.platform !== 'win32') assert.equal((await stat(feedbackFile)).mode & 0o777, 0o600);

  // 3. O array legado é lido sem perda e reescrito cifrado, limitado aos 100 registros mais recentes.
  const legacyEntries = Array.from({ length: 100 }, (_, index) => ({
    id: `legacy-${index}`,
    type: 'sugestao',
    component: 'Geral',
    message: `Feedback legado sintético ${index}`,
    createdAt: `2026-08-28T00:${String(index % 60).padStart(2, '0')}:00.000Z`
  }));
  await writeFile(feedbackFile, JSON.stringify(legacyEntries, null, 2), { mode: 0o600 });
  feedbackResponse = await postJson(`${successServer.baseUrl}/api/system/feedback`, {
    type: 'performance', component: 'Geral', message: 'Novo feedback após migração legada'
  }, headers);
  assert.equal(feedbackResponse.status, 200);
  feedbackText = await readFile(feedbackFile, 'utf8');
  feedbackEnvelope = JSON.parse(feedbackText);
  feedbackEntries = JSON.parse(decrypt(feedbackEnvelope.encrypted, successContext.encryptionKey));
  assert.equal(feedbackEntries.length, 100);
  assert.equal(feedbackEntries[0].message, 'Novo feedback após migração legada');
  assert.ok(feedbackEntries.some(entry => entry.id === 'legacy-0'));
  assert.equal(feedbackEntries.some(entry => entry.id === 'legacy-99'), false);
  assert.doesNotMatch(feedbackText, /Feedback legado sintético|Novo feedback após migração legada/);

  const serverSource = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
  const feedbackBlock = serverSource.slice(
    serverSource.indexOf("url.pathname === '/api/system/feedback'"),
    serverSource.indexOf("url.pathname === '/api/events'", serverSource.indexOf("url.pathname === '/api/system/feedback'"))
  );
  assert.doesNotMatch(feedbackBlock, /\bfetch\s*\(|https?\.request|emailService|sendMail/);
} finally {
  await successServer.stop();
  await cleanDirectory(successContext.dataDirectory, 'atrium-security-migration-success-');
}

// 4. Falha ao salvar o secret mantém a cópia legada intacta e não a registra em log.
const failureContext = await bootstrapLegacyAiState('atrium-security-migration-failure-');
const failureServer = await startTestServer({
  dataDirectory: failureContext.dataDirectory,
  env: {
    NODE_ENV: 'test',
    AUTH_ENCRYPTION_KEY: failureContext.encryptionKey,
    AUTH_SESSION_SECRET: failureContext.sessionSecret,
    ATRIUM_TEST_FAIL_AI_SECRET_SAVE: 'true'
  }
});
try {
  const preservedEnvelope = JSON.parse(await readFile(failureContext.appStateFile, 'utf8'));
  const preservedState = JSON.parse(decrypt(preservedEnvelope.encrypted, failureContext.encryptionKey));
  assert.equal(preservedState.settings.geminiApiKey, AI_MARKER);
  assert.equal(await fileExists(path.join(failureContext.dataDirectory, 'ai-secrets.json')), false);
  assert.equal(failureServer.output().includes(AI_MARKER), false);
} finally {
  await failureServer.stop();
  await cleanDirectory(failureContext.dataDirectory, 'atrium-security-migration-failure-');
}

console.log('✓ Migração de IA no startup, GET read-only, falha sem perda e feedback local cifrado aprovados.');
