import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';
import { serverSourceText } from './server-source.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — H2.2: CÓDIGOS PÚBLICOS DE ERRO (ALLOWLIST)          ');
console.log('===============================================================\n');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'Senha-H2-2-Codes-2026!';
const SYNTHETIC_CNJ = '5001234-56.2025.8.21.0001';

console.log('[C1] Allowlist estrutural no handler central...');
const serverSource = serverSourceText;
const setMatch = serverSource.match(/const PUBLIC_ERROR_CODES = new Set\(\[([\s\S]*?)\]\);/);
assert.ok(setMatch, 'PUBLIC_ERROR_CODES deve existir como Set explícito.');
const listedCodes = [...setMatch[1].matchAll(/'([A-Z0-9_]+)'/g)].map(match => match[1]).sort();
assert.deepEqual(
  listedCodes,
  ['A1_CERT_MISSING', 'A1_PASSPHRASE_MISSING', 'EPROC_BUSY', 'EPROC_CREDENTIAL_MANAGER_REQUIRED', 'EPROC_CREDENTIAL_MISSING', 'LAST_MANAGER', 'PRINCIPAL_TRANSFER_REQUIRED', 'REVISION_CONFLICT', 'ROLE_ESCALATION', 'TEAM_IN_USE', 'TOTP_2FA_MISSING'],
  'Somente os códigos públicos aprovados podem estar na allowlist.'
);
assert.equal(listedCodes.length, 11, 'A allowlist deve ter exatamente onze códigos públicos.');
assert.match(serverSource, /PUBLIC_ERROR_CODES\.has\(error\.code\)/, 'Handler deve gatear code pela allowlist.');
console.log('  ✓ Allowlist com exatamente os códigos aprovados.');

const server = await startTestServer({});
try {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin-h22-codes',
    displayName: 'Dra. Codes Teste',
    email: 'codes@example.test',
    workspaceName: 'Codes Teste',
    password: PASSWORD
  });
  const pending = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: pending.setupToken,
    code: generateTotp(pending.manualSecret)
  });
  const body = await response.json();
  const headers = { Cookie: response.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': body.csrfToken };

  console.log('[C2] Código público permitido chega ao cliente...');
  response = await postJson(`${server.baseUrl}/api/integrations/eproc/processes/enrich-single`, {
    processNumber: SYNTHETIC_CNJ
  }, headers);
  const enrichBody = await response.json();
  assert.equal(response.status, 412, 'Sem cofre próprio, o enriquecimento deve falhar fechado com 412.');
  assert.equal(enrichBody.code, 'EPROC_CREDENTIAL_MISSING', 'EPROC_CREDENTIAL_MISSING deve trafegar por ser público.');
  assert.ok(enrichBody.message, 'Mensagem deve estar presente.');
  assert.deepEqual(Object.keys(enrichBody).sort(), ['code', 'message'], 'Body de erro deve conter apenas message e code permitido.');
  assert.doesNotMatch(JSON.stringify(enrichBody), new RegExp(SYNTHETIC_CNJ), 'Body de erro não pode ecoar o CNJ enviado.');
  assert.doesNotMatch(JSON.stringify(enrichBody), /token|owner|workspaceId|eprocLock/i, 'Body de erro não pode expor metadados internos.');
  console.log('  ✓ 412 com code permitido, sem metadados internos.');

  console.log('[C3] Código de aplicação NÃO permitido permanece oculto...');
  response = await postJson(`${server.baseUrl}/api/admin/workspace/factory-reset`, {
    confirmationToken: 'TOKEN_ERRADO',
    password: PASSWORD
  }, headers);
  const resetBody = await response.json();
  assert.ok(response.status >= 400 && response.status < 500, `Reset com confirmação inválida deve falhar (recebido ${response.status}).`);
  assert.ok(resetBody.message, 'Mensagem deve estar presente.');
  assert.equal(resetBody.code, undefined, 'Código interno de factory reset não pode ser exposto.');
  assert.doesNotMatch(JSON.stringify(resetBody), /CONFIRMATION_REQUIRED|REAUTH_REQUIRED|FACTORY_RESET/, 'Nenhum código interno de reset pode vazar no body.');
  console.log('  ✓ Código interno de aplicação fora da allowlist não vaza.');

  console.log('[C4] errorCode de sandbox (A1) não é propagado...');
  response = await postJson(`${server.baseUrl}/api/integrations/judicial/certificate`, {
    fileName: 'sintetico-invalido.pfx',
    pfxBase64: Buffer.from('synthetic-not-a-pfx', 'utf8').toString('base64'),
    passphrase: 'test-only-passphrase'
  }, headers);
  const certificateBody = await response.json();
  assert.ok(response.status >= 400, `Certificado sintético inválido deve falhar (recebido ${response.status}).`);
  assert.equal(certificateBody.code, undefined, 'errorCode de sandbox não pode virar code público.');
  assert.equal(certificateBody.errorCode, undefined, 'errorCode de sandbox não pode ser propagado.');
  assert.deepEqual(Object.keys(certificateBody).sort(), ['message'], 'Body deve conter apenas a mensagem sanitizada.');
  console.log('  ✓ errorCode de sandbox permanece interno.');

  console.log('[C5] A1_PASSPHRASE_MISSING também é código público...');
  const fixtureDirectory = path.join(server.dataDirectory, 'fixtures');
  const dummyCertificatePath = path.join(fixtureDirectory, 'dummy-certificate.pfx');
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { SecurityManager } = await import('../lib/security.mjs');
  await mkdir(fixtureDirectory, { recursive: true });
  await writeFile(dummyCertificatePath, 'synthetic-not-a-pfx', 'utf8');
  const vaultSecurity = new SecurityManager({
    dataDirectory: server.dataDirectory,
    sessionSecret: server.sessionSecret,
    encryptionKey: server.encryptionKey
  });
  const vaultEnvelope = {
    version: 2,
    algorithm: 'aes-256-gcm',
    updatedAt: new Date().toISOString(),
    encrypted: vaultSecurity.encrypt(JSON.stringify({
      certificate: { path: dummyCertificatePath, fileName: 'dummy-certificate.pfx' },
      portalCredentials: {},
      totpSecrets: {},
      managedIdentities: {},
      processAccessKeys: {},
      allowAutomatedTotp: false,
      lastSandboxValidation: null,
      lastTotpValidation: {}
    }))
  };
  await writeFile(
    path.join(server.dataDirectory, 'judicial-integrations.json'),
    JSON.stringify(vaultEnvelope, null, 2),
    'utf8'
  );
  response = await postJson(`${server.baseUrl}/api/integrations/eproc/processes/enrich-single`, {
    processNumber: SYNTHETIC_CNJ
  }, headers);
  const passphraseBody = await response.json();
  assert.equal(response.status, 412, 'Certificado sem senha deve falhar fechado com 412.');
  assert.equal(passphraseBody.code, 'A1_PASSPHRASE_MISSING', 'A1_PASSPHRASE_MISSING deve trafegar como código público.');
  assert.deepEqual(Object.keys(passphraseBody).sort(), ['code', 'message'], 'Body deve conter apenas message e code permitido.');
  console.log('  ✓ 412 com code A1_PASSPHRASE_MISSING.');

  console.log('\n>>> API ERROR CODE ALLOWLIST: PASS <<<\n');
} finally {
  await server.stop();
}
