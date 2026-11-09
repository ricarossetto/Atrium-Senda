import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — LIMITE DE TRANSPORTE DO FLUSH DE ESTADO             ');
console.log('===============================================================\n');

const PASSWORD = 'Limite-Estado-Sintetico-2026!';
const OLD_LIMIT_BYTES = 3_000_000;
const NEW_LIMIT_BYTES = 16_000_000;

async function setupAuth(server, username) {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username,
    displayName: 'Administrador de Estado',
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
    Cookie: response.headers.get('set-cookie').split(';')[0],
    'Content-Type': 'application/json',
    'X-CSRF-Token': verified.csrfToken
  };
}

function stateWithTextBytes(bytes) {
  const filler = 'Conteúdo sintético de publicação para medir o limite de transporte. ';
  const repetitions = Math.ceil(bytes / Buffer.byteLength(filler));
  return {
    version: 1,
    schemaVersion: 12,
    terms: [], sources: [], tasks: [], processes: [], agenda: [], audit: [],
    contacts: [], leads: [], customPrompts: [], customLinks: [], configuration: {},
    settings: { officeName: 'Escritório Sintético', deadlineMode: 'auto' },
    intimations: [{ id: 'synthetic-large-state', externalId: 'manual:large-state', text: filler.repeat(repetitions) }]
  };
}

const server = await startTestServer({});
try {
  const headers = await setupAuth(server, `admin-limite-${randomBytes(3).toString('hex')}`);

  console.log('[C1] Estado legítimo acima do teto antigo de 3 MB é aceito...');
  const aboveOldLimit = stateWithTextBytes(OLD_LIMIT_BYTES + 400_000);
  const bodyBytes = Buffer.byteLength(JSON.stringify({ state: aboveOldLimit, revision: null }));
  assert.ok(bodyBytes > OLD_LIMIT_BYTES, `Corpo sintético precisa superar o teto antigo (gerado: ${bodyBytes}).`);
  assert.ok(bodyBytes < NEW_LIMIT_BYTES, 'Corpo sintético precisa ficar abaixo do teto novo.');
  const accepted = await postJson(`${server.baseUrl}/api/state`, { state: aboveOldLimit, revision: null }, headers);
  const acceptedBody = await accepted.json().catch(() => ({}));
  assert.equal(accepted.status, 200, `Flush de ${(bodyBytes / 1048576).toFixed(2)} MB não pode ser recusado por tamanho.`);
  assert.equal(acceptedBody.ok, true);
  assert.ok(acceptedBody.revision, 'Flush aceito precisa devolver revision oficial.');
  console.log(`  ✓ ${(bodyBytes / 1048576).toFixed(2)} MB persistidos com revision ${acceptedBody.revision}.`);

  console.log('[C2] Teto de segurança continua existindo e é honesto...');
  const aboveNewLimit = stateWithTextBytes(NEW_LIMIT_BYTES + 600_000);
  const rejected = await postJson(`${server.baseUrl}/api/state`, { state: aboveNewLimit, revision: null }, headers).catch(error => error);
  assert.equal(rejected.status, 413, 'Estado acima do teto de transporte precisa falhar com 413, nunca gravar pela metade.');
  console.log('  ✓ Acima do teto novo, 413 explícito (sem gravação parcial).');

  console.log('[C3] O estado pequeno continua funcionando após o flush grande...');
  const small = stateWithTextBytes(2_000);
  const savedSmall = await postJson(`${server.baseUrl}/api/state`, { state: small, revision: acceptedBody.revision }, headers);
  assert.equal(savedSmall.status, 200);
  console.log('  ✓ Escrita ordinária preservada.');

  console.log('\n>>> LIMITE DE ESTADO: PASS <<<\n');
} finally {
  await server.stop();
}
