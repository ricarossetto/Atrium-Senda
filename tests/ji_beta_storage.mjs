import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SecurityManager } from '../lib/security.mjs';
import { BetaStore, BETA_SCHEMA_VERSION, assertBetaId, assertBetaKind } from '../lib/judicial-intelligence/core/beta-storage.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — JUDICIAL INTELLIGENCE BETA: ARMAZENAMENTO ISOLADO');
console.log('===============================================================\n');

const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'atrium-ji-beta-store-'));
const securityFor = (directory, encryptionKey) => new SecurityManager({
  dataDirectory: directory,
  sessionSecret: randomBytes(32).toString('base64url'),
  encryptionKey,
  secureCookies: false
});

try {
  assert.equal(BETA_SCHEMA_VERSION, 1);
  assert.equal(assertBetaId('processo-0001'), 'processo-0001');
  assert.throws(() => assertBetaId('../escape'), error => error.code === 'INVALID_ARGUMENT');
  assert.throws(() => assertBetaId('a/b'), error => error.code === 'INVALID_ARGUMENT');
  assert.throws(() => assertBetaKind('MAIUSCULO'), error => error.code === 'INVALID_ARGUMENT');

  const encryptionKey = randomBytes(32).toString('base64');
  const security = securityFor(path.join(tempRoot, 'ws-a'), encryptionKey);
  await security.init();

  const store = new BetaStore({ dataDirectory: path.join(tempRoot, 'ws-a'), securityManager: security });
  await store.init();

  console.log('[B1] Put/get/update/list/lookup/count/remove...');
  const created = store.put('process', 'proc:0000000-00.0000.0.00.0000', {
    cnj: '0000000-00.0000.0.00.0000',
    court: 'TJRS',
    source: 'FIXTURE'
  }, { lookup: '00000000000000000000' });
  assert.equal(created.created, true);
  const loaded = store.get('process', 'proc:0000000-00.0000.0.00.0000');
  assert.equal(loaded.court, 'TJRS');
  const updated = store.put('process', 'proc:0000000-00.0000.0.00.0000', { cnj: '0000000-00.0000.0.00.0000', court: 'TJRS', source: 'FIXTURE', phase: 'SENTENCA' });
  assert.equal(updated.created, false);
  assert.equal(store.get('process', 'proc:0000000-00.0000.0.00.0000').phase, 'SENTENCA');
  store.put('process', 'proc:outro', { cnj: 'outro' }, { lookup: 'outro-lookup' });
  assert.equal(store.list('process').length, 2);
  assert.equal(store.list('process', { lookup: '00000000000000000000' }).length, 1);
  assert.equal(store.list('process', { lookup: 'outro-lookup' })[0].cnj, 'outro');
  assert.equal(store.list('process', { lookup: 'inexistente' }).length, 0);
  assert.equal(store.count('process'), 2);
  assert.equal(store.remove('process', 'proc:outro'), true);
  assert.equal(store.remove('process', 'proc:outro'), false);
  assert.equal(store.count('process'), 1);
  assert.equal(store.get('process', 'proc:inexistente'), null);
  assert.throws(() => store.put('PROCESSO!', 'id', {}), error => error.code === 'INVALID_ARGUMENT');
  assert.throws(() => store.put('process', 'id-com-acentuação-ç', {}), error => error.code === 'INVALID_ARGUMENT');

  console.log('[B2] Runs sanitizados (sem segredo, sem payload judicial)...');
  store.recordRun({ provider: 'pdpj', operation: 'findProcesses', status: 'ok', durationMs: 120, items: 4, cacheHit: false, errorClass: null });
  store.recordRun({ provider: 'pdpj', operation: 'getProcess', status: 'failed', durationMs: 30, items: 0, cacheHit: false, errorClass: 'UNAVAILABLE', token: 'nao-deve-persistir' });
  const runs = store.runs({ provider: 'pdpj' });
  assert.equal(runs.length, 2);
  assert.deepEqual(Object.keys(runs[0]).sort(), ['cacheHit', 'createdAt', 'durationMs', 'errorClass', 'id', 'items', 'operation', 'provider', 'status']);
  assert.equal(JSON.stringify(runs).includes('nao-deve-persistir'), false);
  assert.equal(runs[0].status, 'failed');

  console.log('[B3] Cifragem em repouso comprovada no arquivo SQLite...');
  const rawFile = await readFile(store.dbPath, 'utf8').catch(() => '');
  assert.equal(rawFile.includes('TJRS'), false, 'Valores do beta não podem aparecer em claro no SQLite.');
  assert.equal(rawFile.includes('0000000-00.0000.0.00.0000'), false);

  console.log('[B4] Isolamento entre workspaces distintos...');
  const securityB = securityFor(path.join(tempRoot, 'ws-b'), randomBytes(32).toString('base64'));
  await securityB.init();
  const storeB = new BetaStore({ dataDirectory: path.join(tempRoot, 'ws-b'), securityManager: securityB });
  await storeB.init();
  assert.equal(storeB.get('process', 'proc:0000000-00.0000.0.00.0000'), null);
  assert.equal(storeB.count('process'), 0);
  storeB.put('process', 'proc:0000000-00.0000.0.00.0000', { cnj: '0000000-00.0000.0.00.0000', court: 'OUTRO' });
  assert.equal(store.get('process', 'proc:0000000-00.0000.0.00.0000').court, 'TJRS');
  assert.equal(storeB.get('process', 'proc:0000000-00.0000.0.00.0000').court, 'OUTRO');
  storeB.close();

  console.log('[B5] Persistência após reabertura e fail-closed com chave errada...');
  store.close();
  const reopened = new BetaStore({ dataDirectory: path.join(tempRoot, 'ws-a'), securityManager: security });
  await reopened.init();
  assert.equal(reopened.get('process', 'proc:0000000-00.0000.0.00.0000').phase, 'SENTENCA');
  assert.equal(reopened.runs({ provider: 'pdpj' }).length, 2);
  reopened.close();

  const wrongSecurity = securityFor(path.join(tempRoot, 'ws-a'), randomBytes(32).toString('base64'));
  await wrongSecurity.init();
  const wrongStore = new BetaStore({ dataDirectory: path.join(tempRoot, 'ws-a'), securityManager: wrongSecurity });
  await assert.rejects(() => wrongStore.init(), 'Chave errada deve falhar fechado.');
  wrongStore.close();

  console.log('✓ Armazenamento beta: contrato, cifra, lookup, runs, isolamento e reabertura aprovados.');
} finally {
  const resolved = path.resolve(tempRoot);
  const safePrefix = path.resolve(os.tmpdir()) + path.sep;
  if (!resolved.startsWith(safePrefix) || !path.basename(resolved).startsWith('atrium-ji-beta-store-')) {
    throw new Error('Diretório temporário inesperado; limpeza cancelada.');
  }
  await rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
}
