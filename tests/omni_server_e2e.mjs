/**
 * ATRIUM Sovereign Omni-Collector — End-to-End Server Integration Test
 *
 * Boots real ATRIUM HTTP server on random loopback port, authenticates session,
 * and exercises live HTTP endpoints for multi-court and legacy routes.
 */

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { runStateMigrations } from '../lib/state-migrations.mjs';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';
import { formatCnj } from '../lib/judicial/omni/contracts.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM × OMNI-COLLECTOR — SERVER E2E INTEGRATION SUITE');
console.log('===============================================================\n');

import { CNJ, omniTestEnv, syntheticCnj } from './fixtures/omni-network.mjs';
const FORMATTED_CNJ = formatCnj(CNJ);

const instance = await startTestServer({ env: omniTestEnv });

try {
  // 1. Authenticate session
  console.log('[E2E 1] Autenticando sessão administrativa...');
  const setupRes = await postJson(`${instance.baseUrl}/api/auth/setup`, {
    username: 'omni_admin',
    password: 'OmniPassword123!',
    displayName: 'Omni Admin'
  });
  assert.equal(setupRes.status, 200);
  const setupBody = await setupRes.json();
  const cookies = setupRes.headers.get('set-cookie');
  const totpSecret = setupBody.manualSecret || setupBody.totpSecret;
  const totpCode = generateTotp(totpSecret);

  const verifyRes = await postJson(`${instance.baseUrl}/api/auth/setup/verify`, {
    code: totpCode,
    setupToken: setupBody.setupToken
  }, {
    Cookie: cookies
  });
  assert.equal(verifyRes.status, 200);
  const authCookie = verifyRes.headers.get('set-cookie') || cookies;

  const authStatusRes = await fetch(`${instance.baseUrl}/api/auth/status`, { headers: { Cookie: authCookie } });
  const authStatusBody = await authStatusRes.json();
  const csrfToken = authStatusBody.csrfToken;

  const authHeaders = {
    Cookie: authCookie,
    'X-CSRF-Token': csrfToken
  };
  console.log('  ✓ Autenticação e CSRF token obtidos com sucesso');

  // 2. Test GET /api/integrations/omni/status
  console.log('[E2E 2] Testando GET /api/integrations/omni/status...');
  const statusRes = await fetch(`${instance.baseUrl}/api/integrations/omni/status`, { headers: authHeaders });
  assert.equal(statusRes.status, 200);
  const statusBody = await statusRes.json();
  assert.equal(statusBody.ok, true);
  assert.ok(statusBody.health.providers.TJRS);
  assert.ok(statusBody.health.providers.TJDFT);
  assert.ok(statusBody.health.providers.TJSP);
  assert.ok(statusBody.health.providers.DATAJUD);
  assert.ok(statusBody.health.providers.DJEN);
  console.log('  ✓ Health check dos 5 provedores aprovado');

  // 3. Test Backward Compatibility: GET /api/integrations/tjrs-sidecar/status
  console.log('[E2E 3] Testando retrocompatibilidade GET /api/integrations/tjrs-sidecar/status...');
  const legacyStatusRes = await fetch(`${instance.baseUrl}/api/integrations/tjrs-sidecar/status`, { headers: authHeaders });
  assert.equal(legacyStatusRes.status, 200);
  const legacyStatusBody = await legacyStatusRes.json();
  assert.equal(legacyStatusBody.ok, true);
  assert.equal(legacyStatusBody.state, 'AVAILABLE');
  console.log('  ✓ Retrocompatibilidade TJRS sidecar status OK');

  // Dry-run through the real dispatcher: sidecar consumes JSON, then falls back.
  const db = new DatabaseSync(path.join(instance.dataDirectory, 'omni-cache-v1.sqlite'), { readOnly: true });
  const count = () => Number(db.prepare('SELECT COUNT(*) AS n FROM omni_cache').get().n);
  assert.equal(count(), 0);
  for (const prefix of ['tjrs-sidecar', 'omni']) {
    const preview = await postJson(`${instance.baseUrl}/api/integrations/${prefix}/processes/preview`,
      { processNumber: CNJ }, { Cookie: authCookie });
    assert.equal(preview.status, 200, await preview.clone().text());
    const data = await preview.json();
    assert.equal(data.draft.client, '');
    assert.equal(data.draft.number, FORMATTED_CNJ);
    assert.equal(count(), 0, 'Preview must not persist snapshots/diffs');
  }
  const invalid = await postJson(`${instance.baseUrl}/api/integrations/omni/processes/preview`,
    { processNumber: '0'.repeat(20) }, authHeaders);
  assert.equal(invalid.status, 400);
  const state = runStateMigrations({ processes: [{ id: 'omni-test-process', number: FORMATTED_CNJ,
    client: 'Cliente Manual Sintético', contactId: 'manual-contact', courtUnit: 'Vara Manual Sintética' }] }, '2.1.0').state;
  const seed = await postJson(`${instance.baseUrl}/api/state`, { state, revision: null }, authHeaders);
  assert.equal(seed.status, 200, await seed.clone().text());
  const revision = (await seed.json()).revision;
  const syncBody = { processId: 'omni-test-process', processNumber: CNJ, revision };
  const endpoint = `${instance.baseUrl}/api/integrations/omni/processes/sync`;
  assert.equal((await postJson(endpoint, syncBody, { Cookie: authCookie })).status, 403);
  assert.equal((await postJson(endpoint, { ...syncBody, processNumber: syntheticCnj(2) }, authHeaders)).status, 409);
  assert.equal(count(), 0, 'Invalid imports must not mutate the cache');
  const syncedResponse = await postJson(endpoint, syncBody, authHeaders);
  assert.equal(syncedResponse.status, 200, await syncedResponse.clone().text());
  const synced = await syncedResponse.json();
  assert.equal(synced.process.courtUnit, 'Vara Manual Sintética');
  assert.equal(synced.process.client, 'Cliente Manual Sintético');
  assert.equal(synced.process.contactId, 'manual-contact');
  assert.notEqual(synced.revision, revision);
  const countAfterSync = count();
  assert.equal(countAfterSync, 2);
  const repeated = await postJson(endpoint, { ...syncBody, revision: synced.revision }, authHeaders);
  const repeatBody = await repeated.json();
  assert.equal(repeated.status, 200);
  assert.equal(repeatBody.idempotent, true);
  assert.equal(repeatBody.revision, synced.revision);
  assert.equal(count(), countAfterSync);
  assert.equal((await postJson(endpoint, syncBody, authHeaders)).status, 409);
  const rows = JSON.stringify(db.prepare('SELECT * FROM omni_cache').all());
  assert.equal(rows.includes('Parte Adversa Sintética'), false);
  assert.equal(rows.includes(CNJ), false);
  assert.equal(rows.includes('Movimento sintético'), false);
  db.close();
  console.log('  ✓ Dry-run, fallback HTTP, CNJ, CSRF, manual fields, encryption and idempotency');

  // 4. Test POST /api/integrations/omni/watchlist
  console.log('[E2E 4] Testando Watchlist (adição e listagem)...');
  const addWatchRes = await postJson(`${instance.baseUrl}/api/integrations/omni/watchlist`, {
    cnj: CNJ,
    court: 'TJRS',
    clientName: 'Cliente Teste Omni'
  }, authHeaders);
  assert.equal(addWatchRes.status, 200);

  const getWatchRes = await fetch(`${instance.baseUrl}/api/integrations/omni/watchlist`, { headers: authHeaders });
  assert.equal(getWatchRes.status, 200);
  const watchBody = await getWatchRes.json();
  assert.equal(watchBody.ok, true);
  assert.equal(watchBody.count, 1);
  assert.equal(watchBody.items[0].cnj, CNJ);
  console.log('  ✓ Watchlist de monitoramento diário operacional');

  // 5. Test POST /api/integrations/omni/discover/oab
  console.log('[E2E 5] Testando POST /api/integrations/omni/discover/oab...');
  const oabRes = await postJson(`${instance.baseUrl}/api/integrations/omni/discover/oab`, {
    oab: '999999',
    uf: 'RS'
  }, authHeaders);
  assert.equal(oabRes.status, 200);
  const oabBody = await oabRes.json();
  assert.equal(oabBody.ok, true);
  console.log('  ✓ Descoberta por OAB/UF operacional');

  console.log('\n===============================================================');
  console.log('  E2E DO SERVIDOR ATRIUM × OMNI-COLLECTOR: 100% SUCESSO!');
  console.log('===============================================================\n');
} finally {
  await instance.stop();
}
