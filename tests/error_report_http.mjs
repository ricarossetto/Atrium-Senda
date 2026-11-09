import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — API DO RELATO DE ERRO (CÓDIGO PRÓPRIO E SUPORTE)    ');
console.log('===============================================================\n');

const PASSWORD = 'Senha-Relato-Erro-2026!';

const server = await startTestServer({});
try {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin.relato.erro',
    displayName: 'Administradora Relato Sintético',
    email: 'relato.erro@example.test',
    workspaceName: 'Relato de Erro Teste',
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

  console.log('[C1] Fronteira de segurança...');
  response = await postJson(`${server.baseUrl}/api/system/error-report`, { message: 'Falha sintética.' });
  assert.equal(response.status, 401, 'Relato de erro exige autenticação.');
  response = await postJson(`${server.baseUrl}/api/system/error-report`, { message: 'Falha sintética.' }, { Cookie: cookie });
  assert.equal(response.status, 403, 'Relato de erro exige CSRF.');
  response = await postJson(`${server.baseUrl}/api/system/error-report`, { message: '   ' }, headers);
  assert.equal(response.status, 400, 'Relato sem mensagem é recusado.');
  console.log('  ✓ Sessão, CSRF e mensagem obrigatória.');

  console.log('[C2] Relato válido: código próprio, persistência e redação...');
  const dirtyMessage = 'Falha para advogada@example.test com CPF 123.456.789-00 e telefone (51) 99999-8888.';
  response = await postJson(`${server.baseUrl}/api/system/error-report`, {
    scope: 'Sincronização eproc · trf4-eproc-2g',
    message: dirtyMessage,
    details: 'Job: job-sintetico · senha: SuperSecreta123'
  }, headers);
  const report = await response.json();
  assert.equal(response.status, 200);
  assert.equal(report.ok, true);
  assert.equal(report.stored, true);
  assert.match(report.code, /^ATR-\d{8}-[0-9A-F]{8}$/);
  assert.equal(['sent', 'not_configured', 'error'].includes(report.emailStatus), true, `emailStatus inesperado: ${report.emailStatus}`);
  const stored = JSON.parse(await readFile(path.join(server.dataDirectory, 'system', 'error-reports.json'), 'utf8'));
  assert.equal(stored.reports.length, 1);
  const entry = stored.reports[0];
  assert.equal(entry.code, report.code);
  assert.equal(entry.scope, 'Sincronização eproc · trf4-eproc-2g');
  assert.doesNotMatch(entry.message, /advogada@example\.test/);
  assert.doesNotMatch(entry.message, /123\.456\.789-00/);
  assert.doesNotMatch(entry.message, /99999-8888/);
  assert.doesNotMatch(entry.details, /SuperSecreta123/);
  assert.match(entry.message, /\[e-mail removido\]/);
  assert.ok(entry.createdAt && entry.workspaceId && entry.appVersion, 'Relato guarda contexto mínimo.');
  console.log(`  ✓ Relato ${report.code} persistido e redigido (emailStatus=${report.emailStatus}).`);

  console.log('[C3] Código determinístico no servidor...');
  response = await postJson(`${server.baseUrl}/api/system/error-report`, {
    scope: 'Sincronização eproc · trf4-eproc-2g',
    message: dirtyMessage,
    details: 'Job: job-sintetico · senha: SuperSecreta123'
  }, headers);
  const repeated = await response.json();
  assert.equal(repeated.code, report.code, 'O mesmo erro mantém o mesmo código.');
  console.log('  ✓ Mesmo relato gera o mesmo código.');

  console.log('[C4] Limite de relatos em sequência...');
  let limited = false;
  for (let index = 0; index < 25; index++) {
    response = await postJson(`${server.baseUrl}/api/system/error-report`, { scope: 'Interface', message: `Falha sintética ${index}` }, headers);
    if (response.status === 429) { limited = true; break; }
  }
  assert.equal(limited, true, 'O limite de 20 relatos por hora precisa proteger a rota.');
  console.log('  ✓ Limite por workspace ativo (429).');

  console.log('\n>>> API DO RELATO DE ERRO: PASS <<<\n');
} finally {
  await server.stop();
}
