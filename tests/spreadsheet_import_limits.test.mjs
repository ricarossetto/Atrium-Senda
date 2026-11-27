import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — TETOS DA IMPORTAÇÃO DE PLANILHA                    ');
console.log('===============================================================\n');

const PASSWORD = 'Limite-Sintetico-2026!';

async function setupAuth(server, username) {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username,
    displayName: 'Administrador de Planilha',
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

const server = await startTestServer({});
try {
  const headers = await setupAuth(server, `admin-planilha-${randomBytes(3).toString('hex')}`);

  console.log('[C1] Planilha acima do teto de linhas é recusada com 400...');
  const hugeCsv = 'Nome;Telefone\n' + 'Cliente Sintético;51999999999\n'.repeat(50_001);
  const rows = await postJson(`${server.baseUrl}/api/import/spreadsheet`, { filename: 'grande.csv', content: hugeCsv }, headers);
  const rowsBody = await rows.json().catch(() => ({}));
  assert.equal(rows.status, 400, `planilha acima do teto deveria ser recusada: ${JSON.stringify(rowsBody)}`);
  assert.match(String(rowsBody.message || ''), /50\.000 linhas/);

  console.log('[C2] Planilha pequena e legítima continua aceita...');
  const smallCsv = 'Nome;Telefone\nCliente Sintético;51999999999\n';
  const small = await postJson(`${server.baseUrl}/api/import/spreadsheet`, { filename: 'pequena.csv', content: smallCsv }, headers);
  const smallBody = await small.json().catch(() => ({}));
  assert.equal(small.status, 200, `planilha pequena deveria ser aceita: ${JSON.stringify(smallBody)}`);
  assert.equal(smallBody.ok, true);

  console.log('\nOK — tetos da importação de planilha ativos.\n');
} finally {
  await server.stop();
}
