/**
 * ATRIUM — Omni court-key hardening (run-5 v11)
 *
 * Unit coverage for the discover/oab court key:
 * - an unknown court never mints an arbitrary queue-provider key;
 * - a known court keeps its canonical provider key;
 * - the route rejects an unknown court (400) before touching the queue;
 * - the queue provider history stays bounded (FIFO eviction).
 *
 * Synthetic data only; no external requests.
 */

import assert from 'node:assert/strict';
import { PriorityQueueManager } from '../lib/judicial/omni/queue.mjs';
import { OmniCollectorHub } from '../lib/judicial/omni/hub.mjs';
import { createOmniHttpHandler } from '../lib/judicial/omni/http-routes.mjs';

// Valid synthetic CNJ (segment 8.21 -> TJRS); never a real process.
const VALID_CNJ = '00000015820998210000';
const ROUTE = 'http://127.0.0.1/api/integrations/omni/discover/oab';

const stubAdapter = cnjs => ({ source: 'STUB', discoverByOab: async () => cnjs });
const makeHub = queue => new OmniCollectorHub({
  queueManager: queue,
  adapters: { tjrs: stubAdapter([VALID_CNJ]), djen: stubAdapter([VALID_CNJ]) }
});

console.log('\n[omni_court_key] Verificando chave de tribunal do coletor Omni...\n');

// --- Queue: bounded provider history (FIFO eviction) -------------------
{
  const queue = new PriorityQueueManager({ minDelayMs: 1, maxProviderHistory: 2 });
  await queue.enqueue(async () => 'A', { provider: 'A' });
  await queue.enqueue(async () => 'B', { provider: 'B' });
  assert.equal(queue.getProviderHistorySize(), 2, 'histórico deve atingir o cap');
  await queue.enqueue(async () => 'C', { provider: 'C' });
  assert.equal(queue.getProviderHistorySize(), 2, 'histórico não pode crescer além do cap');
  assert.equal(queue.lastRunTimes.has('A'), false, 'chave mais antiga deve ser evictada (FIFO)');
  assert.equal(queue.lastRunTimes.has('B'), true);
  assert.equal(queue.lastRunTimes.has('C'), true);
  assert.ok(queue.backoffLevels.size <= 2, 'backoff também precisa ser limitado');
  console.log('  ✓ Histórico de provedores limitado com evicção FIFO');
}

// --- Queue: repeated keys stay at the cap ------------------------------
{
  const queue = new PriorityQueueManager({ minDelayMs: 1, maxProviderHistory: 1 });
  await queue.enqueue(async () => 1, { provider: 'ONLY' });
  await queue.enqueue(async () => 1, { provider: 'ONLY' });
  assert.equal(queue.getProviderHistorySize(), 1, 'chave repetida não pode crescer o histórico');
  console.log('  ✓ Chaves repetidas permanecem dentro do cap');
}

// --- Hub: known court keeps its canonical provider key -----------------
{
  const queue = new PriorityQueueManager({ minDelayMs: 1, maxProviderHistory: 8 });
  const hub = makeHub(queue);
  assert.equal(hub.isKnownCourt('tjrs'), true, 'TJRS deve ser conhecido');
  assert.equal(hub.isKnownCourt('FOO'), false, 'código arbitrário não pode ser conhecido');
  assert.equal(hub.providerKey('tjrs'), 'TJRS');
  assert.equal(hub.providerKey('TJSP'), 'TJSP');
  assert.equal(hub.providerKey('arbitrary'), 'GLOBAL');
  assert.equal(hub.providerKey(''), 'GLOBAL');

  const result = await hub.discoverByOab({ oab: '123456', uf: 'RS', court: 'TJRS' });
  assert.equal(result.success, true);
  assert.equal(result.court, 'TJRS');
  assert.equal(queue.lastRunTimes.has('TJRS'), true, 'tribunal conhecido mantém chave oficial');
  console.log('  ✓ Tribunal conhecido preserva a chave oficial');
}

// --- Hub: unknown court is folded into the canonical bucket ------------
{
  const queue = new PriorityQueueManager({ minDelayMs: 1, maxProviderHistory: 8 });
  const hub = makeHub(queue);
  const result = await hub.discoverByOab({ oab: '123456', uf: 'RS', court: 'COURT-ARBITRARY-1' });
  assert.equal(result.success, true);
  assert.equal(queue.lastRunTimes.has('COURT-ARBITRARY-1'), false,
    'chave arbitrária não pode existir na fila');
  assert.equal(queue.lastRunTimes.has('GLOBAL'), true,
    'chave desconhecida é dobrada no bucket oficial GLOBAL');
  console.log('  ✓ Tribunal desconhecido não cria chave arbitrária');
}

// --- Route: unknown court rejected (400) before touching the queue -----
{
  const queue = new PriorityQueueManager({ minDelayMs: 1, maxProviderHistory: 8 });
  const hub = makeHub(queue);
  const handler = createOmniHttpHandler({
    hub,
    assertAuthenticated: () => ({ user: 'test' }),
    readJson: async () => ({ oab: '123456', uf: 'RS', court: 'COURT-ARBITRARY-1' }),
    json: (res, code, data) => { res.statusCode = code; res.body = data; }
  });
  await assert.rejects(
    () => handler({ method: 'POST' }, {}, new URL(ROUTE)),
    error => error?.statusCode === 400,
    'tribunal desconhecido deve ser rejeitado com 400'
  );
  assert.equal(queue.lastRunTimes.size, 0, 'rota rejeitada não deve tocar a fila');
  console.log('  ✓ Rota discover/oab rejeita tribunal desconhecido (400)');
}

// --- Route: known court accepted; omission derives from UF -------------
{
  const queue = new PriorityQueueManager({ minDelayMs: 1, maxProviderHistory: 8 });
  const hub = makeHub(queue);
  const run = readJson => createOmniHttpHandler({
    hub,
    assertAuthenticated: () => ({ user: 'test' }),
    readJson,
    json: (res, code, data) => { res.statusCode = code; res.body = data; }
  });

  const knownRes = {};
  const knownHandled = await run(async () => ({ oab: '123456', uf: 'RS', court: 'tjrs' }))(
    { method: 'POST' }, knownRes, new URL(ROUTE));
  assert.equal(knownHandled, true);
  assert.equal(knownRes.statusCode, 200);
  assert.equal(knownRes.body.ok, true);

  const derivedRes = {};
  const derivedHandled = await run(async () => ({ oab: '123456', uf: 'RS' }))(
    { method: 'POST' }, derivedRes, new URL(ROUTE));
  assert.equal(derivedHandled, true);
  assert.equal(derivedRes.statusCode, 200);
  assert.equal(derivedRes.body.ok, true);
  console.log('  ✓ Tribunal conhecido aceito e omissão derivada da UF');
}

console.log('\n[omni_court_key] TODOS OS TESTES PASSARAM.\n');
