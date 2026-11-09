import assert from 'node:assert/strict';
import { persistState } from '../js/core/api.js';

const calls = [];
globalThis.KellerAuth = {
  secureFetch(path, options) {
    calls.push({ path, options });
    return Promise.resolve({ ok: true, status: 200 });
  }
};

// O flush carrega apenas coleções do cliente: documentos e comunicações PJe são
// server-authoritative e o servidor as restaura do estado consolidado.
const state = {
  documents: [{ id: 'large-document', content: 'x'.repeat(128 * 1024) }],
  communications: [{ id: 'large-communication', text: 'y'.repeat(128 * 1024) }],
  tasks: [{ id: 'task-synthetic', title: 'Tarefa sintética' }]
};
const response = await persistState(state, 7);
assert.equal(response.status, 200);
assert.equal(calls.length, 1);
assert.equal(calls[0].path, '/api/state');
assert.equal(calls[0].options.method, 'POST');
assert.ok(Buffer.byteLength(calls[0].options.body, 'utf8') < 20 * 1024, 'Flush não pode carregar coleções server-authoritative (corpo inflado).');
assert.equal(Object.hasOwn(calls[0].options, 'keepalive'), false, 'Persistência ordinária não pode usar o limite de corpo de keepalive.');
const sent = JSON.parse(calls[0].options.body);
assert.equal(sent.revision, 7);
assert.equal('documents' in sent.state, false, 'Documentos são restaurados pelo servidor a partir do oficial.');
assert.equal('communications' in sent.state, false, 'Communications (PJe) também são restauradas pelo servidor.');
assert.deepEqual(sent.state.tasks, state.tasks, 'Coleções do cliente seguem no flush.');

delete globalThis.KellerAuth;
console.log('Large state persistence contract: PASS');
