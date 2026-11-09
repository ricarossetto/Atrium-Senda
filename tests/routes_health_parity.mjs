import assert from 'node:assert/strict';
import { startTestServer } from './helpers.mjs';
import { createHealthHttpHandler, isHealthRoute } from '../lib/http/health-routes.mjs';

console.log('=== routes_health_parity ===');

const server = await startTestServer({ env: { ATRIUM_MOCK_RESEND: 'true' } });
let assertions = 0;
try {
  for (const pathname of ['/api/health', '/api/version']) {
    const response = await fetch(`${server.baseUrl}${pathname}`);
    assert.equal(response.status, 200, `${pathname} deve responder 200`); assertions += 1;
    assert.ok(response.headers.get('x-atrium-api-version'), `${pathname} deve carregar X-Atrium-API-Version`); assertions += 1;
    const body = await response.json();
    assert.equal(body.ok, true); assertions += 1;
    assert.equal(body.service, 'atrium-api'); assertions += 1;
    assert.equal(body.version, body.appVersion, 'version deve espelhar appVersion'); assertions += 1;
    assert.equal(body.commitSha, body.gitSha, 'commitSha deve espelhar gitSha'); assertions += 1;
    assert.equal(body.uptime, body.uptimeSeconds, 'uptime deve espelhar uptimeSeconds'); assertions += 1;
    assert.ok(['ok', 'degraded'].includes(body.storeIntegrity), 'storeIntegrity deve ser ok|degraded'); assertions += 1;
    assert.ok(typeof body.storeStatus === 'string' && body.storeStatus.length > 0); assertions += 1;
    assert.ok(body.featureFlags && typeof body.featureFlags === 'object'); assertions += 1;
    assert.ok(Array.isArray(body.enabledFeatureFlags)); assertions += 1;
    assert.ok(!Number.isNaN(Date.parse(body.timestamp)), 'timestamp deve ser ISO valido'); assertions += 1;

    const head = await fetch(`${server.baseUrl}${pathname}`, { method: 'HEAD' });
    assert.equal(head.status, 200, `${pathname} HEAD deve responder 200`); assertions += 1;
  }

  // Paridade estrutural: o modulo extraido produz exatamente as chaves do payload real.
  const captured = [];
  const fakeJson = (res, status, payload) => { captured.push({ status, payload }); };
  const handler = createHealthHttpHandler({
    json: fakeJson,
    stateHealth: () => ({ status: 'READY' }),
    getMeta: () => ({
      appVersion: 'x',
      gitSha: 'y',
      buildId: 'z',
      builtAt: 'w',
      schemaVersion: 12,
      betaStatus: { environment: 'production', betaMode: false, featureFlags: {}, enabledFeatureFlags: [] }
    })
  });
  await handler({ method: 'GET' }, {});
  const real = await (await fetch(`${server.baseUrl}/api/health`)).json();
  assert.deepEqual(Object.keys(captured[0].payload).sort(), Object.keys(real).sort(),
    'chaves do payload devem permanecer identicas apos a extracao'); assertions += 1;
  assert.equal(captured[0].status, 200); assertions += 1;
  assert.equal(captured[0].payload.storeIntegrity, 'ok'); assertions += 1;
  assert.equal(captured[0].payload.version, 'x'); assertions += 1;

  assert.equal(isHealthRoute({ method: 'GET' }, new URL('http://x/api/health')), true); assertions += 1;
  assert.equal(isHealthRoute({ method: 'HEAD' }, new URL('http://x/api/version')), true); assertions += 1;
  assert.equal(isHealthRoute({ method: 'POST' }, new URL('http://x/api/health')), false); assertions += 1;
  assert.equal(isHealthRoute({ method: 'GET' }, new URL('http://x/api/state')), false); assertions += 1;

  console.log(`routes_health_parity: PASS (${assertions} assercoes)`);
} finally {
  await server.stop();
  // Teardown deterministico: dar tempo dos stdio pipes do child terminarem de
  // fechar antes do exit (libuv/Windows asserta se handles ainda estao CLOSING).
  await new Promise(resolve => setTimeout(resolve, 700));
}
process.exit(0);
process.exit(0);