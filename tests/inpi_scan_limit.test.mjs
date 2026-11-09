import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — FRONTEIRA DE LIMITE DA VARREDURA INPI / RPI         ');
console.log('===============================================================\n');

const PASSWORD = 'Limite-Inpi-Sintetico-2026!';

async function setupAuth(server, username) {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username,
    displayName: 'Advogada Teste',
    email: 'teste@example.test',
    password: PASSWORD
  });
  const setup = await response.json();
  assert.equal(response.status, 200, `setup deve concluir (status=${response.status})`);
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  const verified = await response.json();
  assert.equal(response.status, 200, `setup/verify deve concluir (status=${response.status})`);
  return {
    Cookie: response.headers.get('set-cookie').split(';')[0],
    'Content-Type': 'application/json',
    'X-CSRF-Token': verified.csrfToken
  };
}

async function scan(server, headers, body) {
  const response = await postJson(`${server.baseUrl}/api/integrations/inpi/scan`, body, headers);
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

const server = await startTestServer({});
try {
  const headers = await setupAuth(server, `admin-inpi-limite-${randomBytes(3).toString('hex')}`);

  console.log('[C1] Limites inválidos são rejeitados na fronteira HTTP com 400...');
  const invalidLimits = [
    { label: 'zero', value: 0 },
    { label: 'negativo', value: -1 },
    { label: 'texto', value: 'abc' },
    { label: 'enorme', value: 100_000_000 },
    { label: 'fracionário', value: 1.5 },
    { label: 'string negativa', value: '-3' }
  ];
  for (const { label, value } of invalidLimits) {
    const result = await scan(server, headers, { limit: value });
    assert.equal(result.status, 400, `limit inválido (${label}=${JSON.stringify(value)}) deve responder 400 (recebido ${result.status}).`);
    assert.equal(result.payload.ok, false);
    assert.match(result.payload.message || '', /limit/i, 'A rejeição deve explicar o parâmetro limit.');
    console.log(`  ✓ limit ${label} (${JSON.stringify(value)}) → 400.`);
  }

  console.log('[C2] Valor válido pequeno atravessa a validação (não é 400)...');
  const valid = await scan(server, headers, { limit: 2 });
  assert.notEqual(valid.status, 400, 'limit válido não pode ser recusado pela validação de fronteira.');
  assert.ok([200, 409, 500].includes(valid.status), `limit válido deve prosseguir para o serviço (status=${valid.status}).`);
  assert.doesNotMatch(valid.payload.message || '', /limit inválido/i, 'O caminho válido não pode emitir erro de limite.');
  console.log(`  ✓ limit 2 → ${valid.status} (segue para o serviço, sem erro de validação).`);

  console.log('[C3] Ausência de limit preserva o default (1) e não é rejeitada...');
  const absent = await scan(server, headers, { force: false });
  assert.notEqual(absent.status, 400, 'Ausência de limit deve manter o default, nunca 400.');
  assert.ok([200, 409, 500].includes(absent.status), `Ausência de limit deve prosseguir para o serviço (status=${absent.status}).`);
  console.log(`  ✓ sem limit → ${absent.status} (default preservado).`);

  console.log('\n>>> INPI SCAN LIMIT: PASS <<<\n');
} finally {
  await server.stop();
}
