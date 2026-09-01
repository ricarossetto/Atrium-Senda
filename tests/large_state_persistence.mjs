import assert from 'node:assert/strict';
import { persistState } from '../js/core/api.js';

const calls = [];
globalThis.KellerAuth = {
  secureFetch(path, options) {
    calls.push({ path, options });
    return Promise.resolve({ ok: true, status: 200 });
  }
};

const state = { documents: [{ id: 'large-state', content: 'x'.repeat(128 * 1024) }] };
const response = await persistState(state, 7);
assert.equal(response.status, 200);
assert.equal(calls.length, 1);
assert.equal(calls[0].path, '/api/state');
assert.equal(calls[0].options.method, 'POST');
assert.ok(Buffer.byteLength(calls[0].options.body, 'utf8') > 100 * 1024);
assert.equal(Object.hasOwn(calls[0].options, 'keepalive'), false, 'Persistência ordinária não pode usar o limite de corpo de keepalive.');
assert.deepEqual(JSON.parse(calls[0].options.body), { state, revision: 7 });

delete globalThis.KellerAuth;
console.log('Large state persistence contract: PASS');
