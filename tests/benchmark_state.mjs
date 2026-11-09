import assert from 'node:assert/strict';
import { generateTotp } from '../lib/security.mjs';
import { startTestServer, postJson } from './helpers.mjs';

const server = await startTestServer();
const adminPass = 'Senha-Perf-2026!';
try {
  let res = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_perf', displayName: 'Admin Perf', email: 'perf@example.test', password: adminPass
  });
  const setup = await res.json();
  res = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken, code: generateTotp(setup.manualSecret)
  });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const csrf = (await res.json()).csrfToken;
  const auth = { Cookie: cookie };

  // Popula estado com revisão oficial
  res = await postJson(`${server.baseUrl}/api/state`, { state: { tasks: [{ id: 't1', title: 'Tarefa Perf' }] } }, { ...auth, 'X-CSRF-Token': csrf });
  assert.equal(res.status, 200);

  // Primeira leitura (200 com ETag)
  const first = await fetch(`${server.baseUrl}/api/state`, { headers: auth });
  assert.equal(first.status, 200);
  const etag = first.headers.get('etag');
  assert.ok(etag, 'ETag deve estar presente');
  const text200 = await first.text();
  const bytes200 = Buffer.byteLength(text200);

  // Segunda leitura com If-None-Match (304 sem payload)
  const start304 = performance.now();
  let bytes304Total = 0;
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`${server.baseUrl}/api/state`, { headers: { ...auth, 'If-None-Match': etag } });
    assert.equal(r.status, 304, 'ETag matching deve responder 304 Not Modified');
    const text304 = await r.text();
    bytes304Total += Buffer.byteLength(text304);
  }
  const avg304 = (performance.now() - start304) / 5;
  console.log(`BENCHMARK_AFTER: 200_bytes=${bytes200} | 304_avg=${avg304.toFixed(2)}ms 304_bytes=${bytes304Total / 5}`);
  assert.equal(bytes304Total, 0, '304 não deve transferir corpo (0 bytes transferidos vs ' + bytes200 + ' bytes no 200)');
  console.log('performance_etag_304: PASS');
} finally {
  await server.stop();
}
process.exit(0);
