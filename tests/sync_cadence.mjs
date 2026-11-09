import './fixtures/omni-network.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { postJson, startTestServer } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

console.log('\n===============================================================');
console.log('  ATRIUM — CADENCIA DE SINCRONIZACAO (PRIMEIRO ACESSO/07-19/MANUAL)');
console.log('===============================================================\n');

console.log('[C1] Contrato estrutural: sem sync por inicializacao nem agenda no navegador...');
const [serverSource, portalSource] = await Promise.all([
  readFile(path.join(ROOT, 'server.mjs'), 'utf8'),
  readFile(path.join(ROOT, 'js/portal.js'), 'utf8')
]);
assert.doesNotMatch(serverSource, /claimAutomaticSync|syncTriggerFromRequest/, 'Servidor nao pode manter claim de startup/daily.');
assert.doesNotMatch(portalSource, /scheduleDailySync|trigger: 'startup'/, 'Portal nao pode sincronizar na inicializacao nem agendar no navegador.');
assert.match(portalSource, /atrium_initial_sync_pending/, 'Primeiro acesso deve consumir o marcador de sync completo.');
assert.match(serverSource, /firstAccess: true, automaticAt: \['07:00', '12:00', '19:00'\], manual: true/, 'Status deve declarar a nova cadencia.');
console.log('  ✓ Startup/daily removidos; primeiro acesso e 07h/12h/19h declarados.');

const server = await startTestServer();
try {
  const setupResponse = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_cadencia',
    password: 'Senha-Teste-Cadencia-2026!',
    displayName: 'Advogada Teste'
  });
  const setup = await setupResponse.json();
  const verifyResponse = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: setup.syntheticCode
  });
  const verified = await verifyResponse.json();
  const cookie = verifyResponse.headers.get('set-cookie').split(';')[0];
  const headers = { Cookie: cookie, 'X-CSRF-Token': verified.csrfToken };

  const statusResponse = await fetch(`${server.baseUrl}/api/status`, { headers: { Cookie: cookie } });
  const status = await statusResponse.json();
  assert.deepEqual(status.syncSchedule.automaticAt, ['07:00', '12:00', '19:00'], 'Ciclos silenciosos do servidor sao 07h/12h/19h.');
  assert.equal(status.syncSchedule.firstAccess, true);
  assert.equal(status.syncSchedule.manual, true);
  assert.equal(status.syncSchedule.timeZone, 'America/Sao_Paulo');
  assert.equal(status.syncSchedule.startup, undefined, 'Nao existe mais sync por inicializacao do servidor.');
  assert.equal(status.syncSchedule.dailyAt, undefined, 'Nao existe mais sync diaria agendada pelo navegador.');
  assert.ok(status.serverStartedAt);

  const sync = async trigger => {
    const response = await postJson(`${server.baseUrl}/api/sync`, {}, { ...headers, 'X-Atrium-Sync-Trigger': trigger });
    assert.equal(response.status, 200);
    return response.json();
  };

  assert.notEqual((await sync('manual')).skipped, true, 'Botao manual sempre sincroniza.');
  assert.notEqual((await sync('startup')).skipped, true, 'Header legado de startup nao pode pular a sincronizacao.');
  assert.notEqual((await sync('daily')).skipped, true, 'Header legado de daily nao pode pular a sincronizacao.');
  assert.notEqual((await sync('manual')).skipped, true, 'Nova chamada manual continua permitida.');

  console.log('  ✓ Status com cadencia nova e /api/sync sem skip de startup/daily.');
  console.log('\n>>> CADENCIA DE SINCRONIZACAO: PASS <<<\n');
} finally {
  await server.stop();
}
