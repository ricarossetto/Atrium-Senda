import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

for (const currentState of ['connected', 'error']) {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'atrium-coverage-http-'));
  let server;
  const lastSuccessfulSyncAt = '2026-09-16T11:00:00.000Z';
  const lastAttemptAt = '2026-09-16T12:00:00.000Z';
  try {
    server = await startTestServer({ dataDirectory });
    let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
      username: 'master.coverage', displayName: 'Master Sintético', password: 'Senha-Sintetica-Coverage-2026!'
    });
    assert.equal(response.status, 200);
    const setup = await response.json();
    response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
      setupToken: setup.setupToken, code: generateTotp(setup.manualSecret)
    });
    assert.equal(response.status, 200);
    const verified = await response.json();
    assert.ok(verified.user.workspaceId);
    await writeFile(path.join(dataDirectory, 'judicial-sessions.json'), JSON.stringify({
      [`${verified.user.workspaceId}:eproc-sync:tjrs-eproc-1g`]: {
        status: currentState, lastSuccessfulSyncAt, lastAttemptAt,
        error: currentState === 'error' ? 'Falha sintética atual' : null, counts: { processes: 3 }
      }
    }));
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    response = await fetch(`${server.baseUrl}/api/integrations/judicial`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    const status = await response.json();
    const row = status.managedCoverage.find(item => item.id === 'eproc-tjrs-1g');
    assert.ok(row, 'Cobertura real do endpoint deve conter TJRS 1G.');
    assert.equal(row.connectivityState, currentState);
    assert.equal(row.verification, 'verified');
    assert.equal(row.lastError, currentState === 'error' ? 'Falha sintética atual' : null);
    assert.equal(row.lastSuccessfulSyncAt, lastSuccessfulSyncAt);
    assert.equal(row.lastAttemptAt, lastAttemptAt);
    assert.deepEqual(status.diagnostics.coverage.find(item => item.id === row.id), row);
    assert.deepEqual(status.portals.find(item => item.id === row.id)?.managed, row);
  } finally {
    await server?.stop();
    await rm(dataDirectory, { recursive: true, force: true });
  }
}
console.log('EPROC COVERAGE HTTP: PASS (success/error, managed/diagnostics/portals)');
