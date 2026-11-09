import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';
import { serverSourceText } from './server-source.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — API DA FILA DE FALHAS DE CAPTURA DJEN               ');
console.log('===============================================================\n');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'Senha-Djen-Fila-2026!';

console.log('[C1] Contrato estrutural do servidor...');
const serverSource = serverSourceText;
assert.match(serverSource, /url\.pathname === '\/api\/djen\/capture-errors'/, 'GET da fila deve existir.');
assert.match(serverSource, /url\.pathname === '\/api\/djen\/capture-errors\/retry'/, 'POST de retry deve existir.');
assert.match(serverSource, /recordDjenCaptureErrorsRun\(\{[\s\S]{0,160}attemptedTerms: monitoredTerms,[\s\S]{0,120}counters: djenCounters/, 'Caminho manual do /api/sync deve reconciliar a fila.');
assert.match(serverSource, /collectAndPersistDjenTerms\(\{ appState, monitoredTerms(: scopeTerms)?, marker, trigger: 'scheduled' \}\)/, 'Agendador deve usar a coleta compartilhada.');
assert.match(serverSource, /collectAndPersistDjenTerms\(\{[\s\S]{0,200}trigger: 'retry'/, 'Retry deve usar a coleta compartilhada.');
assert.match(serverSource, /djenRetryWorkspaces/, 'Retry deve ter single-flight local por workspace.');
assert.match(serverSource, /url\.pathname\.startsWith\('\/api\/commands\/'\)/, 'Rota de consulta de comando assíncrono deve existir.');
assert.match(serverSource, /asyncCommands\.start\(\{ kind: 'djen-capture-retry'/, 'Retry deve suportar o contrato 202 + idCommand.');
assert.match(serverSource, /statusUrl: `\/api\/commands\/\$\{command\.id\}`/, 'Resposta 202 deve apontar a rota de consulta.');
console.log('  ✓ Rotas, reconciliação nos dois caminhos, single-flight e comando assíncrono presentes.');

const server = await startTestServer({});
try {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin.djen.fila',
    displayName: 'Administradora Fila Sintética',
    email: 'fila.djen@example.test',
    workspaceName: 'Fila DJEN Teste',
    password: PASSWORD
  });
  const pending = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: pending.setupToken,
    code: generateTotp(pending.manualSecret)
  });
  const session = await response.json();
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const headers = { Cookie: cookie, 'X-CSRF-Token': session.csrfToken };

  console.log('[C2] Fila vazia: GET autenticado e retry no-op...');
  response = await fetch(`${server.baseUrl}/api/djen/capture-errors`, { headers: { Cookie: cookie } });
  const emptyQueue = await response.json();
  assert.equal(response.status, 200);
  assert.equal(emptyQueue.ok, true);
  assert.deepEqual(emptyQueue.terms, []);
  assert.equal(emptyQueue.summary.count, 0);
  response = await postJson(`${server.baseUrl}/api/djen/capture-errors/retry`, {}, headers);
  const emptyRetry = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(emptyRetry.retried, []);
  console.log('  ✓ Fila vazia responde sem ação e sem erro.');

  console.log('[C2b] Comandos assíncronos: fronteira e ausência...');
  response = await fetch(`${server.baseUrl}/api/commands/cmd-inexistente`);
  assert.equal(response.status, 401, 'Consulta de comando exige autenticação.');
  response = await fetch(`${server.baseUrl}/api/commands/cmd-inexistente`, { headers: { Cookie: cookie } });
  const missingCommand = await response.json();
  assert.equal(response.status, 404, 'Comando desconhecido não pode devolver sucesso.');
  assert.equal(missingCommand.code, 'COMMAND_NOT_FOUND');
  console.log('  ✓ Rota de comandos exige sessão e não inventa comando.');

  console.log('[C3] Fila persistida: leitura e validação de intenção...');
  const queueFile = path.join(server.dataDirectory, 'djen-capture-errors.json');
  await writeFile(queueFile, JSON.stringify({
    version: 1,
    updatedAt: '2026-09-20T07:00:00.000Z',
    lastRun: { at: '2026-09-20T07:00:00.000Z', trigger: 'scheduled', termCount: 2, failedCount: 1 },
    terms: [{
      termId: 'term-falho-sintetico',
      oabUf: 'RS',
      oabNumber: '000123',
      name: 'Advogada Teste',
      registration: 'OAB/RS 000123',
      message: 'DJEN limitou requisições (HTTP 429). Tente novamente em instantes.',
      attempts: 2,
      firstFailedAt: '2026-09-19T19:00:00.000Z',
      lastFailedAt: '2026-09-20T07:00:00.000Z'
    }]
  }, null, 2), 'utf8');

  response = await fetch(`${server.baseUrl}/api/djen/capture-errors`, { headers: { Cookie: cookie } });
  const queue = await response.json();
  assert.equal(response.status, 200);
  assert.equal(queue.summary.count, 1);
  assert.equal(queue.terms[0].termId, 'term-falho-sintetico');
  assert.equal(queue.terms[0].attempts, 2);
  assert.equal(queue.lastRun.trigger, 'scheduled');

  response = await postJson(`${server.baseUrl}/api/djen/capture-errors/retry`, {}, headers);
  const noIntent = await response.json();
  assert.equal(response.status, 400, 'Retry sem termo e sem all deve ser recusado.');
  assert.match(noIntent.message, /Informe o termo pendente/);
  assert.equal(noIntent.code, undefined);

  response = await postJson(`${server.baseUrl}/api/djen/capture-errors/retry?async=1`, {}, headers);
  const asyncNoIntent = await response.json();
  assert.equal(response.status, 400, 'Validação de intenção acontece antes do comando assíncrono.');
  assert.match(asyncNoIntent.message, /Informe o termo pendente/);

  response = await postJson(`${server.baseUrl}/api/djen/capture-errors/retry`, { termId: 'term-desconhecido' }, headers);
  const unknown = await response.json();
  assert.equal(response.status, 404, 'Termo fora da fila/estado não pode ser reconsultado.');
  assert.match(unknown.message, /Nenhum termo pendente/);

  response = await postJson(`${server.baseUrl}/api/djen/capture-errors/retry`, { all: true }, headers);
  const notMonitored = await response.json();
  assert.equal(response.status, 404, 'Termo da fila que não existe mais no monitoramento não dispara coleta.');
  assert.match(notMonitored.message, /Nenhum termo pendente/);
  console.log('  ✓ Intenção obrigatória, termo desconhecido e termo removido recusados sem coleta.');

  console.log('[C4] Fronteira de segurança...');
  response = await fetch(`${server.baseUrl}/api/djen/capture-errors`);
  assert.equal(response.status, 401, 'GET sem sessão deve ser negado.');
  response = await fetch(`${server.baseUrl}/api/djen/capture-errors/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ termId: 'term-falho-sintetico' })
  });
  assert.equal(response.status, 403, 'POST sem CSRF deve ser negado.');
  console.log('  ✓ Sessão obrigatória e CSRF fail-closed.');

  console.log('\n>>> API DA FILA DE CAPTURA DJEN: PASS <<<\n');
} finally {
  await server.stop();
}
