import './fixtures/omni-network.mjs';
import assert from 'node:assert/strict';
import { nextDailySyncAt, millisecondsUntilDailySync } from '../js/core/sync-schedule.js';
import { postJson, startTestServer } from './helpers.mjs';

const beforeTen = new Date(2026, 8, 5, 9, 30, 0);
const afterTen = new Date(2026, 8, 5, 10, 0, 1);
assert.equal(nextDailySyncAt(beforeTen).getTime(), new Date(2026, 8, 5, 10, 0, 0).getTime());
assert.equal(nextDailySyncAt(afterTen).getTime(), new Date(2026, 8, 6, 10, 0, 0).getTime());
assert.equal(millisecondsUntilDailySync(beforeTen), 30 * 60 * 1000);

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
  assert.equal(status.syncSchedule.dailyAt, '10:00');
  assert.equal(status.syncSchedule.timeZone, 'America/Sao_Paulo');
  assert.ok(status.serverStartedAt);

  const sync = async trigger => {
    const response = await postJson(`${server.baseUrl}/api/sync`, {}, { ...headers, 'X-Atrium-Sync-Trigger': trigger });
    assert.equal(response.status, 200);
    return response.json();
  };

  assert.notEqual((await sync('startup')).skipped, true);
  assert.equal((await sync('startup')).skipped, true);
  assert.notEqual((await sync('daily')).skipped, true);
  assert.equal((await sync('daily')).skipped, true);
  assert.notEqual((await sync('manual')).skipped, true);
  assert.notEqual((await sync('manual')).skipped, true);

  console.log('PASS startup once, daily 10h once, reload/tab dedupe and unrestricted manual sync');
} finally {
  await server.stop();
}
