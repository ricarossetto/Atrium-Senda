import assert from 'node:assert/strict';
import { createIdempotentRequests, readIdempotencyKey } from '../lib/http/idempotent-requests.mjs';
import { createAttemptKey } from '../js/core/attempt-key.js';

console.log('--- Iniciando Testes: pedidos repetidos ---');
const KEY = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
let clock = 1_000;
const run = createIdempotentRequests({ ttlMs: 100, now: () => clock });
let sent = 0;
const send = async () => { sent += 1; return { messageId: `m${sent}` }; };
const call = (key = KEY, fingerprint = 'a') => run({ scope: 'ws', key, fingerprint, operation: send });

const [one, two] = await Promise.all([call(), call()]);
assert.equal(sent, 1, 'duas chamadas juntas enviam uma vez');
assert.deepEqual(one.value, two.value);
assert.deepEqual([one.replayed, two.replayed].sort(), [false, true]);
assert.equal((await call()).replayed, true, 'repetir depois também não reenvia');
assert.equal(sent, 1);
await assert.rejects(() => call(KEY, 'b'), error => error.statusCode === 409, 'mesma chave em outro pedido');
assert.equal((await run({ scope: 'outro', key: KEY, fingerprint: 'a', operation: send })).replayed, false, 'chave não vale entre escritórios');
clock += 200;
await call('5f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e');
assert.equal((await call()).replayed, false, 'chave vencida envia de novo');

let attempts = 0;
const flaky = () => run({ scope: 'ws', key: '6f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e', fingerprint: 'x', operation: async () => { attempts += 1; if (attempts === 1) throw new Error('falhou'); return 'ok'; } });
await assert.rejects(flaky, /falhou/);
assert.equal((await flaky()).value, 'ok', 'falha não fica guardada');

const headerOf = value => ({ headers: value === undefined ? {} : { 'idempotency-key': value } });
assert.equal(readIdempotencyKey(headerOf()), null, 'sem chave segue normal');
assert.equal(readIdempotencyKey(headerOf(KEY.toUpperCase())), KEY);
assert.throws(() => readIdempotencyKey(headerOf('teste@example.test')), error => error.statusCode === 400, 'só aceita UUID');

const attempt = createAttemptKey();
const first = attempt.for('pro');
assert.equal(attempt.for('pro'), first, 'nova tentativa mantém a chave');
assert.notEqual(attempt.for('basic'), first, 'outro plano é outra operação');
const second = attempt.for('pro');
attempt.settle();
assert.notEqual(attempt.for('pro'), second, 'com resposta, a próxima intenção tem outra chave');
console.log('[PASS] Pedidos repetidos.');
