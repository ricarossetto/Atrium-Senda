import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SecurityManager, generateTotp } from '../lib/security.mjs';
import { CURRENT_DATA_VERSION, CURRENT_SCHEMA_VERSION } from '../lib/state-migrations.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const STARTUP_TIMEOUT_MS = 45_000;
const SENSITIVE_MARKERS = [
  'CLIENTE-SENSIVEL-TESTE-RESTORE',
  'CPF-SINTETICO-000',
  'SEGREDO-PROCESSUAL-TESTE'
];

console.log('\n=== TESTES DEDICADOS DE BACKUP / RESTORE ===\n');

const server = await startBackupRestoreServer();

try {
  const cryptoManager = new SecurityManager({
    dataDirectory: server.dataDirectory,
    sessionSecret: server.sessionSecret,
    encryptionKey: server.encryptionKey,
    secureCookies: false
  });
  await cryptoManager.init();

  const master = await setupMaster(server.baseUrl);
  const collaborator = await setupCollaborator(server.baseUrl, master);
  const backupDir = path.join(server.dataDirectory, 'backups');

  console.log('1. Validando autenticação, CSRF, RBAC e backup de estado vazio...');
  const createResponse = await fetch(`${server.baseUrl}/api/system/backup/create`, {
    method: 'POST',
    headers: master.headers
  });
  assert.equal(createResponse.status, 200, 'Master com CSRF deve conseguir criar backup.');
  const createPayload = await createResponse.json();
  assert.equal(createPayload.ok, true);
  assert.equal(createPayload.backupData.format, 'atrium-encrypted-backup-v1');
  const emptyBackupPlaintext = cryptoManager.decrypt(createPayload.backupData.encryptedState);
  const emptyBackupState = JSON.parse(emptyBackupPlaintext);
  assert.equal(emptyBackupState.schemaVersion, CURRENT_SCHEMA_VERSION, 'Backup vazio deve ser restaurável no schema corrente.');
  assert.equal(emptyBackupState.dataVersion, CURRENT_DATA_VERSION, 'Backup vazio deve carregar dataVersion corrente.');
  assert.equal(createPayload.backupData.checksum, sha256(emptyBackupPlaintext), 'Backup create deve preservar checksum atual.');

  let response = await restore(server.baseUrl, createPayload.backupData, { 'Content-Type': 'application/json' });
  assert.equal(response.status, 401, 'Restore sem autenticação deve retornar 401.');

  response = await restore(server.baseUrl, createPayload.backupData, {
    Cookie: master.cookie,
    'Content-Type': 'application/json'
  });
  assert.equal(response.status, 403, 'Restore sem CSRF deve retornar 403.');

  response = await restore(server.baseUrl, createPayload.backupData, collaborator.headers);
  assert.equal(response.status, 403, 'Colaborador não pode restaurar backup.');

  const snapshotsBeforeEmptyRestore = await listSafetySnapshots(backupDir);
  response = await restore(server.baseUrl, createPayload.backupData, master.headers);
  assert.equal(response.status, 200, 'Master com CSRF deve restaurar backup válido em estado vazio.');
  assert.equal((await response.json()).ok, true);
  assert.deepEqual(
    await listSafetySnapshots(backupDir),
    snapshotsBeforeEmptyRestore,
    'Estado vazio não deve produzir snapshot pré-restore sem conteúdo anterior.'
  );
  console.log('✓ Autenticação, CSRF, master-only e estado vazio validados.');

  console.log('\n2. Validando rejeições antes de snapshot ou alteração do estado...');
  let current = await readState(server.baseUrl, master.headers);
  const stateA = makeState('A', { sensitive: true });
  await saveState(server.baseUrl, master.headers, stateA, current.revision);
  current = await readState(server.baseUrl, master.headers);
  const candidateB = encryptedBackup(cryptoManager, makeState('B'));

  await expectRejectedWithoutMutation({
    label: 'JSON inválido',
    expectedStatus: 400,
    server,
    headers: master.headers,
    request: () => fetch(`${server.baseUrl}/api/system/backup/restore`, {
      method: 'POST',
      headers: master.headers,
      body: '{'
    })
  });

  await expectRejectedWithoutMutation({
    label: 'envelope inválido',
    expectedStatus: 400,
    server,
    headers: master.headers,
    request: () => restore(server.baseUrl, [], master.headers)
  });

  await expectRejectedWithoutMutation({
    label: 'payload ausente',
    expectedStatus: 400,
    server,
    headers: master.headers,
    request: () => restore(server.baseUrl, {
      format: 'atrium-encrypted-backup-v1',
      checksum: candidateB.checksum
    }, master.headers)
  });

  await expectRejectedWithoutMutation({
    label: 'formato desconhecido',
    expectedStatus: 400,
    server,
    headers: master.headers,
    request: () => restore(server.baseUrl, { ...candidateB, format: 'atrium-encrypted-backup-v2' }, master.headers)
  });

  await expectRejectedWithoutMutation({
    label: 'payload criptografado inválido',
    expectedStatus: 400,
    server,
    headers: master.headers,
    request: () => restore(server.baseUrl, {
      ...candidateB,
      encryptedState: { iv: 'AAAA', tag: 'AAAA', ciphertext: 'AAAA' }
    }, master.headers)
  });

  await expectRejectedWithoutMutation({
    label: 'checksum divergente',
    expectedStatus: 400,
    server,
    headers: master.headers,
    request: () => restore(server.baseUrl, { ...candidateB, checksum: '0'.repeat(64) }, master.headers)
  });

  const invalidSchemaState = makeState('SCHEMA-INVALIDO');
  invalidSchemaState.contacts = { invalid: true };
  await expectRejectedWithoutMutation({
    label: 'schema inválido',
    expectedStatus: 400,
    server,
    headers: master.headers,
    request: () => restore(server.baseUrl, encryptedBackup(cryptoManager, invalidSchemaState), master.headers)
  });

  const futureSchemaState = makeState('SCHEMA-FUTURO');
  futureSchemaState.schemaVersion = CURRENT_SCHEMA_VERSION + 1;
  futureSchemaState.dataVersion = CURRENT_DATA_VERSION + 1;
  await expectRejectedWithoutMutation({
    label: 'future schema',
    expectedStatus: 422,
    server,
    headers: master.headers,
    request: () => restore(server.baseUrl, encryptedBackup(cryptoManager, futureSchemaState), master.headers)
  });

  const legacySchemaState = makeState('SCHEMA-LEGADO');
  legacySchemaState.schemaVersion = CURRENT_SCHEMA_VERSION - 1;
  legacySchemaState.dataVersion = CURRENT_DATA_VERSION - 1;
  delete legacySchemaState.migratedAt;
  response = await restore(server.baseUrl, encryptedBackup(cryptoManager, legacySchemaState), master.headers);
  assert.equal(response.status, 200, 'Backup de schema anterior suportado deve ser migrado antes do restore.');
  const migratedLegacy = await readState(server.baseUrl, master.headers);
  assert.equal(migratedLegacy.state.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(migratedLegacy.state.dataVersion, CURRENT_DATA_VERSION);
  assert.equal(migratedLegacy.state.settings.officeName, 'Escritório SCHEMA-LEGADO');
  await saveState(server.baseUrl, master.headers, stateA, migratedLegacy.revision);
  console.log('✓ Backups inválidos não alteram bytes, semântica, revision ou snapshots.');

  console.log('\n3. Validando snapshot cifrado, atomicidade e concorrência revision-aware...');
  const stateBeforeRace = await readState(server.baseUrl, master.headers);
  const snapshotsBeforeRace = await listSafetySnapshots(backupDir);
  const restorePromise = restore(server.baseUrl, candidateB, master.headers);
  const safetyFileName = await waitForNewSafetySnapshot(backupDir, snapshotsBeforeRace);

  const stateC = makeState('C-CONCORRENTE');
  const concurrentSave = await saveState(server.baseUrl, master.headers, stateC, stateBeforeRace.revision);
  assert.ok(concurrentSave.revision && concurrentSave.revision !== stateBeforeRace.revision, 'Atualização concorrente deve avançar revision.');
  const concurrentState = await captureState(server, master.headers);

  const conflictResponse = await restorePromise;
  assert.equal(conflictResponse.status, 409, 'Restore deve retornar 409 quando revision muda antes do commit.');
  const conflictPayload = await conflictResponse.json();
  assert.match(conflictPayload.message, /atualizados|recarregue/i, '409 deve explicar o conflito sem confirmar sucesso.');

  const afterConflict = await captureState(server, master.headers);
  assert.equal(afterConflict.raw, concurrentState.raw, 'Restore em conflito não pode alterar os bytes do estado concorrente.');
  assert.equal(afterConflict.revision, concurrentSave.revision, 'Restore em conflito deve preservar revision concorrente.');
  assert.equal(afterConflict.state.settings.officeName, stateC.settings.officeName, 'Restore em conflito deve preservar estado R2.');
  assert.equal((await listAppStateTemps(server.dataDirectory)).length, 0, 'Restore em conflito não deve deixar app-state parcial.');

  const safetyPath = path.join(backupDir, safetyFileName);
  const safetyText = await readFile(safetyPath, 'utf8');
  for (const marker of SENSITIVE_MARKERS) {
    assert.equal(safetyText.includes(marker), false, `Snapshot não pode conter ${marker} em plaintext.`);
  }
  const safetyEnvelope = JSON.parse(safetyText);
  assert.equal(safetyEnvelope.format, 'atrium-encrypted-backup-v1');
  assert.equal(safetyEnvelope.purpose, 'pre-restore-safety-snapshot');
  assert.equal(safetyEnvelope.sourceRevision, stateBeforeRace.revision);
  assert.ok(safetyEnvelope.encryptedState, 'Snapshot deve conter payload cifrado.');
  const safetyPlaintext = cryptoManager.decrypt(safetyEnvelope.encryptedState);
  assert.equal(safetyEnvelope.checksum, sha256(safetyPlaintext), 'Snapshot deve ser recuperável com o checksum vigente.');
  const safetyState = JSON.parse(safetyPlaintext);
  assert.equal(safetyState.settings.officeName, stateBeforeRace.state.settings.officeName);
  assert.equal(safetyState.contacts[0].name, SENSITIVE_MARKERS[0]);
  assert.equal(safetyState.contacts[0].cpf, SENSITIVE_MARKERS[1]);
  assert.equal(safetyState.processes[0].notes, SENSITIVE_MARKERS[2]);

  const safetyStat = await stat(safetyPath);
  if (process.platform !== 'win32') {
    assert.equal(safetyStat.mode & 0o777, 0o600, 'Snapshot deve usar mode 0o600 quando suportado.');
  }
  assert.equal((await listBackupTemps(backupDir)).length, 0, 'Escrita atômica não deve deixar temporários de snapshot.');
  console.log('✓ Concorrência retorna 409, preserva R2 e mantém snapshot cifrado recuperável.');

  console.log('\n4. Validando restore populado bem-sucedido e contrato atômico de source...');
  const snapshotsBeforeSuccess = await listSafetySnapshots(backupDir);
  response = await restore(server.baseUrl, candidateB, master.headers);
  assert.equal(response.status, 200, 'Restore válido em estado populado deve retornar 200.');
  assert.equal((await response.json()).ok, true);
  const restored = await readState(server.baseUrl, master.headers);
  assert.equal(restored.state.settings.officeName, 'Escritório B', 'Estado candidato deve substituir o estado corrente.');
  assert.equal((await listSafetySnapshots(backupDir)).length, snapshotsBeforeSuccess.length + 1, 'Restore populado deve criar um snapshot.');
  assert.equal((await listBackupTemps(backupDir)).length, 0, 'Restore concluído não deve deixar snapshot parcial.');
  assert.equal((await listAppStateTemps(server.dataDirectory)).length, 0, 'Restore concluído não deve deixar app-state parcial.');

  const serverSource = await readFile(path.join(ROOT, 'server.mjs'), 'utf8');
  const atomicHelper = sourceBlock(serverSource, 'async function writePrivateJsonAtomically', 'async function createPreRestoreSafetySnapshot');
  assert.match(atomicHelper, /writeFile\(tmpFile,[\s\S]*mode:\s*0o600/, 'Snapshot deve ser escrito primeiro em temporário privado.');
  assert.match(atomicHelper, /rename\(tmpFile,\s*targetPath\)/, 'Snapshot deve ser publicado por rename atômico.');
  assert.match(serverSource, /saveAppStateDirect\(restoredState,\s*currentEnv\.revision\)/, 'Restore deve passar a revision capturada ao save direto validado, inclusive em recovery mode.');
  assert.doesNotMatch(serverSource, /JSON\.stringify\(currentEnv\s*,/, 'Restore não pode serializar currentEnv descriptografado em snapshot.');
  console.log('✓ Estado populado, expectedRevision, temp+rename e ausência de app-state parcial validados.');

  console.log('\n===============================================================');
  console.log('✓ BACKUP / RESTORE: 20 CONTRATOS DE SEGURANÇA APROVADOS');
  console.log('===============================================================\n');
} finally {
  await server.stop();
}

function makeState(label, { sensitive = false } = {}) {
  return {
    appVersion: '2.0.0',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    dataVersion: CURRENT_DATA_VERSION,
    terms: [{
      id: `term-${label}`,
      name: 'Advogada Teste',
      registration: 'OAB/RS 000000',
      oabNumber: '',
      oabUf: 'RS',
      active: true,
      primary: true
    }],
    sources: [{ id: `source-${label}`, name: 'Fonte Sintética', status: 'ok' }],
    intimations: [{
      id: `intimation-${label}`,
      title: `Publicação ${label}`,
      text: sensitive ? SENSITIVE_MARKERS[2] : `Conteúdo sintético ${label}`,
      publishedAt: '2026-08-28',
      treatmentStatus: 'untreated'
    }],
    tasks: [],
    processes: [{
      id: `process-${label}`,
      number: '0000000-00.0000.0.00.0000',
      client: sensitive ? SENSITIVE_MARKERS[0] : `Cliente ${label}`,
      notes: sensitive ? SENSITIVE_MARKERS[2] : `Observação ${label}`
    }],
    agenda: [],
    audit: [],
    contacts: [{
      id: `contact-${label}`,
      name: sensitive ? SENSITIVE_MARKERS[0] : `Cliente ${label}`,
      cpf: sensitive ? SENSITIVE_MARKERS[1] : 'CPF-SINTETICO-TESTE'
    }],
    leads: [],
    financial: [],
    customPrompts: [],
    customLinks: [],
    settings: { officeName: `Escritório ${label}`, officeSlogan: 'Fixture sintética' },
    configuration: {}
  };
}

function encryptedBackup(manager, state) {
  const plaintext = JSON.stringify(state);
  return {
    format: 'atrium-encrypted-backup-v1',
    createdAt: new Date().toISOString(),
    createdBy: 'backup-restore-test',
    appVersion: '2.0.0',
    encryptedState: manager.encrypt(plaintext),
    checksum: sha256(plaintext)
  };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function setupMaster(baseUrl) {
  let response = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'admin.restore',
    displayName: 'Administradora Restore',
    password: 'Senha-Restore-2026!'
  });
  const setup = await response.json();
  assert.equal(response.status, 200);
  response = await postJson(`${baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  const verified = await response.json();
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  return {
    cookie,
    csrf: verified.csrfToken,
    headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': verified.csrfToken }
  };
}

async function setupCollaborator(baseUrl, master) {
  const password = 'Colaborador-Restore-2026!';
  let response = await postJson(`${baseUrl}/api/auth/register`, {
    username: 'colaborador.restore',
    displayName: 'Pessoa Colaboradora Restore',
    email: 'colaborador.restore@example.test',
    password
  });
  const registration = await response.json();
  assert.equal(response.status, 200);
  response = await postJson(`${baseUrl}/api/auth/register/verify`, {
    setupToken: registration.setupToken,
    code: generateTotp(registration.manualSecret)
  });
  assert.equal(response.status, 200);
  response = await fetch(`${baseUrl}/api/auth/users`, { headers: { Cookie: master.cookie } });
  const users = await response.json();
  const collaborator = users.users.find(user => user.username === 'colaborador.restore');
  assert.ok(collaborator);
  response = await postJson(`${baseUrl}/api/auth/users/manage`, {
    userId: collaborator.id,
    status: 'active'
  }, master.headers);
  assert.equal(response.status, 200);
  response = await postJson(`${baseUrl}/api/auth/login`, {
    username: 'colaborador.restore',
    password,
    code: generateTotp(registration.manualSecret)
  });
  const login = await response.json();
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  return {
    headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': login.csrfToken }
  };
}

async function restore(baseUrl, backupData, headers) {
  return fetch(`${baseUrl}/api/system/backup/restore`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ backupData })
  });
}

async function saveState(baseUrl, headers, state, revision) {
  const response = await postJson(`${baseUrl}/api/state`, { state, revision }, headers);
  const payload = await response.json();
  assert.equal(response.status, 200, payload.message || 'Estado sintético deve persistir.');
  return payload;
}

async function readState(baseUrl, headers) {
  const response = await fetch(`${baseUrl}/api/state`, { headers });
  const payload = await response.json();
  assert.equal(response.status, 200);
  return payload;
}

async function captureState(serverInfo, headers) {
  const payload = await readState(serverInfo.baseUrl, headers);
  const raw = await readFile(path.join(serverInfo.dataDirectory, 'app-state.json'), 'utf8');
  return { raw, state: payload.state, revision: payload.revision };
}

async function expectRejectedWithoutMutation({ label, expectedStatus, server: serverInfo, headers, request }) {
  const before = await captureState(serverInfo, headers);
  const snapshotsBefore = await listSafetySnapshots(path.join(serverInfo.dataDirectory, 'backups'));
  const response = await request();
  assert.equal(response.status, expectedStatus, `${label} deve retornar ${expectedStatus}.`);
  const after = await captureState(serverInfo, headers);
  assert.equal(after.raw, before.raw, `${label} não pode alterar bytes do app-state.`);
  assert.equal(after.revision, before.revision, `${label} não pode avançar revision.`);
  assert.deepEqual(after.state, before.state, `${label} não pode alterar o estado semântico.`);
  assert.deepEqual(
    await listSafetySnapshots(path.join(serverInfo.dataDirectory, 'backups')),
    snapshotsBefore,
    `${label} não deve criar snapshot antes da validação completa.`
  );
}

async function listSafetySnapshots(backupDir) {
  try {
    return (await readdir(backupDir))
      .filter(name => name.startsWith('safety-snapshot-pre-restore-') && !name.includes('.tmp-'))
      .sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function listBackupTemps(backupDir) {
  try {
    return (await readdir(backupDir)).filter(name => name.startsWith('safety-snapshot-pre-restore-') && name.includes('.tmp-'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function listAppStateTemps(dataDirectory) {
  return (await readdir(dataDirectory)).filter(name => name.startsWith('app-state.json.tmp-'));
}

async function waitForNewSafetySnapshot(backupDir, previous, timeoutMs = 5_000) {
  const known = new Set(previous);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const current = await listSafetySnapshots(backupDir);
    const added = current.find(name => !known.has(name));
    if (added) return added;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Snapshot pré-restore não apareceu dentro do prazo de teste.');
}

function sourceBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `Bloco de source ausente: ${startMarker}.`);
  return source.slice(start, end);
}

async function postJson(url, body, headers = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
}

async function startBackupRestoreServer() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'atrium-backup-restore-test-'));
  const port = await findAvailablePort();
  const sessionSecret = randomBytes(48).toString('base64url');
  const encryptionKey = randomBytes(32).toString('base64');
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      KELLER_DATA_DIR: dataDirectory,
      JURISFLOW_DATA_DIR: dataDirectory,
      KELLER_SKIP_COLLECTOR_ENV: 'true',
      ATRIUM_MOCK_SMTP: 'true',
      AUTH_SESSION_SECRET: sessionSecret,
      AUTH_ENCRYPTION_KEY: encryptionKey,
      COLLECTOR_INGEST_TOKEN: randomBytes(32).toString('base64url'),
      COOKIE_SECURE: 'false',
      ADVBOX_WEBCAL_URL: '',
      ATRIUM_TEST_RESTORE_BEFORE_SAVE_DELAY_MS: '1200'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;
  const started = Date.now();
  while (Date.now() - started < STARTUP_TIMEOUT_MS) {
    if (child.exitCode !== null) {
      await safeRemoveTestDirectory(dataDirectory);
      throw new Error(`Servidor de restore encerrou cedo: ${output || `código ${child.exitCode}`}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/auth/status`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        return {
          baseUrl,
          dataDirectory,
          sessionSecret,
          encryptionKey,
          async stop() {
            try { await stopChild(child); } finally { await safeRemoveTestDirectory(dataDirectory); }
          }
        };
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  await stopChild(child);
  await safeRemoveTestDirectory(dataDirectory);
  throw new Error(`Servidor de restore não iniciou: ${output || 'sem saída'}`);
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5_000))]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await exited;
  }
}

async function safeRemoveTestDirectory(directory) {
  const resolved = path.resolve(directory);
  const tempRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
  if (!resolved.startsWith(tempRoot) || !path.basename(resolved).startsWith('atrium-backup-restore-test-')) {
    throw new Error('Diretório temporário de backup/restore inesperado; limpeza cancelada.');
  }
  await rm(resolved, { recursive: true, force: true });
}

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
  });
}
