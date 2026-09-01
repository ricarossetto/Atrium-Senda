import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateTotp } from '../lib/security.mjs';
import {
  API_CONTRACT_VERSION,
  API_STABILITY,
  apiContractHeaders,
  buildApiMetadata,
  isUnknownVersionedApiPath
} from '../lib/api/api-contract.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — API EVOLUTION FOUNDATION');
console.log('===============================================================\n');

assert.equal(API_CONTRACT_VERSION, '2026-09-01');
assert.equal(API_STABILITY, 'internal');
assert.deepEqual(apiContractHeaders(), {
  'X-Atrium-API-Version': '2026-09-01',
  'X-Atrium-API-Stability': 'internal'
});
assert.deepEqual(buildApiMetadata({ applicationVersion: '2.0.0' }), {
  product: 'ATRIUM',
  applicationVersion: '2.0.0',
  contractVersion: '2026-09-01',
  stability: 'internal',
  routeVersioning: 'unversioned-internal',
  publicApi: false,
  supportedVersionPrefixes: []
});
assert.equal(isUnknownVersionedApiPath('/api/v1/state'), true);
assert.equal(isUnknownVersionedApiPath('/api/v999'), true);
assert.equal(isUnknownVersionedApiPath('/api/state'), false);
assert.equal(isUnknownVersionedApiPath('/api/version'), false);

const server = await startTestServer();
try {
  let response = await fetch(`${server.baseUrl}/api/auth/status`);
  const initialStatus = await response.json();
  assert.equal(response.status, 200);
  assert.equal(initialStatus.configured, false);
  assert.equal(response.headers.get('x-atrium-api-version'), API_CONTRACT_VERSION);
  assert.equal(response.headers.get('x-atrium-api-stability'), API_STABILITY);

  response = await fetch(`${server.baseUrl}/api/system/api-metadata`);
  assert.equal(response.status, 401, 'Metadata da API não pode criar exposição pública acidental.');
  assert.deepEqual(Object.keys(await response.json()), ['message'], 'Envelope legado de erro deve permanecer compatível.');

  response = await fetch(`${server.baseUrl}/api/v999/state`);
  assert.equal(response.status, 401, 'Prefixo desconhecido não pode contornar autenticação.');

  const password = 'Senha-API-2026!';
  response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin.api',
    displayName: 'Administradora API Sintética',
    password
  });
  const setup = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  const verified = await response.json();
  const cookie = response.headers.get('set-cookie').split(';')[0];
  assert.equal(response.status, 200);

  response = await fetch(`${server.baseUrl}/api/system/api-metadata`, { headers: { Cookie: cookie } });
  const metadata = await response.json();
  assert.equal(response.status, 200);
  assert.equal(metadata.product, 'ATRIUM');
  assert.equal(metadata.contractVersion, API_CONTRACT_VERSION);
  assert.equal(metadata.stability, 'internal');
  assert.equal(metadata.publicApi, false);
  assert.deepEqual(metadata.supportedVersionPrefixes, []);
  assert.equal(Object.hasOwn(metadata, 'routes'), false, 'Metadata não deve enumerar superfície sensível.');

  response = await fetch(`${server.baseUrl}/api/v999/state`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    message: 'Versão de API não suportada.',
    code: 'UNSUPPORTED_API_VERSION'
  });

  response = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookie } });
  const stateEnvelope = await response.json();
  assert.equal(response.status, 200, 'Rota interna existente deve permanecer operacional.');
  assert.ok(Object.hasOwn(stateEnvelope, 'state'));
  assert.ok(Object.hasOwn(stateEnvelope, 'revision'));

  response = await fetch(`${server.baseUrl}/api/status`, { headers: { Cookie: cookie } });
  const operationalStatus = await response.json();
  assert.equal(response.status, 200);
  assert.equal(operationalStatus.mode, 'local-protected');
  assert.equal(response.headers.get('x-atrium-api-version'), API_CONTRACT_VERSION);

  const source = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\/api\/v1\/(?:state|documents|auth)/, 'Foundation não pode duplicar as rotas internas em v1.');
  assert.equal((source.match(/\/api\/system\/api-metadata/g) || []).length, 1);
  assert.ok(verified.csrfToken, 'Fluxo de autenticação existente deve permanecer intacto.');

  console.log('✓ API foundation: metadata autenticada, headers determinísticos, versão desconhecida segura e clientes internos preservados PASS.');
} finally {
  await server.stop();
}
