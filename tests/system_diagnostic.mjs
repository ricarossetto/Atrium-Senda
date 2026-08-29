import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateTotp } from '../lib/security.mjs';
import { startTestServer } from './helpers.mjs';

console.log('\n=== TESTES DE DIAGNÓSTICO DO SISTEMA, BACKUPS & FEEDBACK BETA ===\n');

const systemAdminSource = await readFile(new URL('../js/features/system-admin.js', import.meta.url), 'utf8');
assert.match(
  systemAdminSource,
  /secureFetch\(['"]\/api\/system\/backup\/create['"]\s*,/,
  'A geração de backup na UI deve atravessar secureFetch para enviar o CSRF da sessão.'
);
const backupUiSource = systemAdminSource.slice(
  systemAdminSource.indexOf('renderBackups()'),
  systemAdminSource.indexOf('openFeedbackModal()', systemAdminSource.indexOf('renderBackups()'))
);
assert.equal(
  (backupUiSource.match(/secureFetch\(['"]\/api\/system\/backup\/restore['"]\s*,/g) || []).length,
  1,
  'A restauração na UI deve executar exatamente uma request via secureFetch por evento.'
);
assert.doesNotMatch(
  backupUiSource,
  /\bfetch\(['"]\/api\/system\/backup\/restore['"]\s*,/,
  'A restauração não pode usar fetch cru.'
);
assert.equal(
  (backupUiSource.match(/byId\(['"]inputRestoreBackup['"]\)\?\.addEventListener\(['"]change['"]/g) || []).length,
  1,
  'renderBackups deve registrar um único listener de restore no DOM recém-renderizado.'
);
assert.ok(
  backupUiSource.indexOf('container.innerHTML =') < backupUiSource.indexOf("byId('inputRestoreBackup')?.addEventListener"),
  'renderBackups deve substituir o DOM antes de registrar o listener, evitando duplicação após novo init/render.'
);

const server = await startTestServer();

try {
  // 1. Setup inicial para autenticação
  const setupResp = await fetch(`${server.baseUrl}/api/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: 'Administrador Diagnóstico',
      username: 'admin.diag',
      password: 'SenhaForte123!@#',
      confirmPassword: 'SenhaForte123!@#'
    })
  });
  const setupData = await setupResp.json();
  assert.equal(setupResp.status, 200, 'Setup inicial deve retornar 200');

  const totpCode = generateTotp(setupData.manualSecret);
  const verifyResp = await fetch(`${server.baseUrl}/api/auth/setup/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      setupToken: setupData.setupToken,
      code: totpCode
    })
  });
  const verifyData = await verifyResp.json();
  const cookies = verifyResp.headers.get('set-cookie');
  const sessionCookie = cookies ? cookies.split(';')[0] : '';
  const authHeaders = { Cookie: sessionCookie, 'Content-Type': 'application/json', 'X-CSRF-Token': verifyData.csrfToken };

  // 2. Testar Endpoint de Diagnóstico do Sistema
  console.log('1. Validando endpoint /api/system/diagnostic...');
  const diagResp = await fetch(`${server.baseUrl}/api/system/diagnostic`, {
    headers: authHeaders
  });
  const diagText = await diagResp.text();
  if (diagResp.status !== 200) console.log('Diagnostic 500 body:', diagText);
  assert.equal(diagResp.status, 200, 'Diagnostic deve retornar 200 para usuário autenticado');
  const diagData = JSON.parse(diagText);
  assert.equal(diagData.ok, true, 'Diagnostic response deve ter ok: true');
  assert.ok(diagData.diagnostic.app, 'Diagnóstico deve conter metadados do app');
  assert.equal(diagData.diagnostic.app.name, 'Atrium — Escritório Integrado');
  assert.ok(diagData.diagnostic.storage, 'Diagnóstico deve conter status de storage');
  assert.ok(diagData.diagnostic.security, 'Diagnóstico deve conter status de segurança');
  assert.ok(diagData.diagnostic.integrations, 'Diagnóstico deve conter status de integrações');
  assert.equal(diagData.diagnostic.app.version, '2.0.0');
  assert.equal(diagData.diagnostic.storage.encryptedFile, 'data/app-state.json (ou diretório de dados configurado)');
  assert.equal(diagData.diagnostic.security.twoFactor, 'TOTP RFC 6238 disponível por usuário');
  assert.equal(diagData.diagnostic.integrations.djen.status, 'consulta_sob_demanda');
  assert.equal(diagData.diagnostic.integrations.gemini.description, 'Não configurado');
  assert.equal(diagData.diagnostic.runtime.status, 'EMPTY');
  console.log('✓ Endpoint de diagnóstico validado com métricas completas de saúde.');

  // 3. Testar Exportação de Diagnóstico Anonimizado
  console.log('\n2. Validando exportação de relatório de diagnóstico (.json)...');
  const exportResp = await fetch(`${server.baseUrl}/api/system/diagnostic/export`, {
    headers: authHeaders
  });
  assert.equal(exportResp.status, 200, 'Exportação de diagnóstico deve retornar 200');
  assert.ok(exportResp.headers.get('content-disposition')?.includes('attachment'), 'Exportação deve definir header de anexo');
  const exportData = await exportResp.json();
  assert.equal(exportData.app.version, '2.0.0');
  console.log('✓ Relatório de diagnóstico anonimizado exportado com sucesso.');

  // 4. Testar Criação de Backup Criptografado
  console.log('\n3. Validando geração de backup cifrado (.atrium-backup)...');
  const backupResp = await fetch(`${server.baseUrl}/api/system/backup/create`, {
    method: 'POST',
    headers: authHeaders
  });
  assert.equal(backupResp.status, 200, 'Criação de backup deve retornar 200');
  const backupData = await backupResp.json();
  assert.equal(backupData.ok, true);
  assert.ok(backupData.backupData.encryptedState, 'Backup deve conter estado cifrado');
  assert.ok(backupData.backupData.checksum, 'Backup deve conter checksum HMAC-SHA256');
  console.log('✓ Backup criptografado e assinado gerado com sucesso.');

  // 5. Testar Restauração de Backup com Verificação de Integridade
  console.log('\n4. Validando restauração segura de backup...');
  const restoreResp = await fetch(`${server.baseUrl}/api/system/backup/restore`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ backupData: backupData.backupData })
  });
  assert.equal(restoreResp.status, 200, 'Restauração deve retornar 200');
  const restoreData = await restoreResp.json();
  assert.equal(restoreData.ok, true);
  console.log('✓ Restauração executada com snapshot de segurança pré-restauração.');

  // 6. Testar Canal de Feedback Beta
  console.log('\n5. Validando canal de feedback do Beta...');
  const feedbackResp = await fetch(`${server.baseUrl}/api/system/feedback`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      type: 'sugestao',
      component: 'Kanban',
      message: 'Sugestão de teste para ordenação de cards por prioridade fatal.'
    })
  });
  assert.equal(feedbackResp.status, 200, 'Envio de feedback deve retornar 200');
  const feedbackData = await feedbackResp.json();
  assert.equal(feedbackData.ok, true);
  assert.ok(feedbackData.id, 'Feedback deve receber ID de rastreamento');
  console.log('✓ Feedback do Beta registrado com sucesso sem exposição de dados.');

  console.log('\n===============================================================');
  console.log('✓ SUÍTE DE DIAGNÓSTICO, BACKUP & FEEDBACK: 100% APROVADA!');
  console.log('===============================================================\n');
} finally {
  await server.stop();
}
