import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

import { postJson, startTestServer } from './helpers.mjs';
import { SecurityManager, generateTotp } from '../lib/security.mjs';
import { CURRENT_SCHEMA_VERSION } from '../lib/state-migrations.mjs';

const LEGACY_KEY = 'CHAVE-LEGADA-HTTP-9F3A';
const CNJ = '5000001-00.2026.8.21.0016';
const PASSWORD = 'Senha-Http-Boundary-2026!';

async function setupWorkspace(server) {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin-http-boundary',
    displayName: 'Dra. Boundary Teste',
    email: 'boundary@example.test',
    workspaceName: 'Boundary Teste',
    password: PASSWORD
  });
  const pending = await response.json();
  assert.ok(pending.setupToken, 'Falha ao iniciar cadastro.');
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: pending.setupToken,
    code: generateTotp(pending.manualSecret)
  });
  const body = await response.json();
  return {
    cookie: response.headers.get('set-cookie').split(';')[0],
    csrf: body.csrfToken
  };
}

async function run() {
  console.log('=== TESTE FOCAL: FRONTEIRA HTTP DA CHAVE DE ACESSO EPROC ===\n');

  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'atrium-eproc-http-boundary-'));
  const sessionSecret = randomBytes(48).toString('base64url');
  const encryptionKey = randomBytes(32).toString('base64');
  const securityManager = new SecurityManager({ dataDirectory, sessionSecret, encryptionKey });
  await securityManager.init();
  await mkdir(dataDirectory, { recursive: true });

  const legacyState = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    terms: [],
    sources: [],
    intimations: [],
    tasks: [],
    processes: [
      {
        id: 'proc:eproc:50000010020268210016',
        number: CNJ,
        client: 'Cliente Teste',
        accessKey: LEGACY_KEY,
        chaveAcesso: LEGACY_KEY,
        portalId: 'tjrs-eproc-1g',
        source: 'eproc-tjrs'
      }
    ],
    agenda: [],
    audit: [],
    contacts: [],
    documents: [],
    settings: {}
  };
  const envelope = {
    version: 1,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: 'test',
    algorithm: 'aes-256-gcm',
    revision: 'revision-legacy-key',
    encrypted: securityManager.encrypt(JSON.stringify(legacyState)),
    updatedAt: new Date().toISOString()
  };
  const stateFile = path.join(dataDirectory, 'app-state.json');
  await writeFile(stateFile, JSON.stringify(envelope, null, 2), 'utf8');

  // Prova de que o estado em disco realmente contém a chave (o teste falharia se nada vazasse).
  const rawEnvelope = JSON.parse(await readFile(stateFile, 'utf8'));
  const rawState = JSON.parse(securityManager.decrypt(rawEnvelope.encrypted));
  assert.equal(rawState.processes[0].accessKey, LEGACY_KEY, 'Pré-condição: estado em disco contém a chave legada');

  const server = await startTestServer({
    dataDirectory,
    env: { AUTH_SESSION_SECRET: sessionSecret, AUTH_ENCRYPTION_KEY: encryptionKey }
  });
  try {
    const session = await setupWorkspace(server);
    const headers = { Cookie: session.cookie, 'X-CSRF-Token': session.csrf, Accept: 'application/json' };

    const response = await fetch(`${server.baseUrl}/api/state`, { headers });
    assert.equal(response.status, 200);
    const payload = await response.json();
    const serialized = JSON.stringify(payload);
    assert.doesNotMatch(serialized, new RegExp(LEGACY_KEY), 'GET /api/state não pode devolver a chave de acesso');
    assert.doesNotMatch(serialized, /"accessKey"|"chaveAcesso"/, 'Campos de chave não podem atravessar a API pública');
    const proc = payload.state.processes.find(item => item.number === CNJ);
    assert.ok(proc, 'Processo deve permanecer visível no estado público');
    assert.equal(proc.client, 'Cliente Teste', 'Dados não sensíveis permanecem disponíveis');
    console.log('✓ 1. /api/state redige a chave em texto claro na borda HTTP.');

    const enrich = await postJson(`${server.baseUrl}/api/integrations/eproc/processes/enrich-single`, { processNumber: CNJ }, headers);
    const enrichBody = await enrich.json().catch(() => ({}));
    assert.equal(enrich.status, 412, 'Sem cofre, o enriquecimento segue fail-closed.');
    assert.deepEqual(Object.keys(enrichBody).sort(), ['code', 'message'], 'Erro público não pode vazar a chave nem metadados internos');
    assert.doesNotMatch(JSON.stringify(enrichBody), new RegExp(LEGACY_KEY));
    console.log('✓ 2. enrich-single falha fechado sem ecoar a chave legada.');

    console.log('\n>>> EPROC ACCESS KEY HTTP BOUNDARY TEST PASSED! <<<\n');
  } finally {
    await server.stop();
    await rm(dataDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

run().catch(error => {
  console.error('Falha no teste de fronteira HTTP da chave eproc:', error);
  process.exit(1);
});
