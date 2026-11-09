import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const server = await startTestServer();
try {
  const password = 'Synthetic-Factory-Reset-2026!';
  const setupResponse = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'master.reset', displayName: 'Master Reset Teste', email: 'master@example.test',
    workspaceName: 'Escritório Sintético', password
  });
  const setup = await setupResponse.json();
  const verifyResponse = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken, code: generateTotp(setup.manualSecret)
  });
  assert.equal(verifyResponse.status, 200);
  const verified = await verifyResponse.json();
  const cookie = verifyResponse.headers.get('set-cookie').split(';')[0];
  const headers = { Cookie: cookie, 'X-CSRF-Token': verified.csrfToken };

  const stateResponse = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookie } });
  const envelope = await stateResponse.json();
  const saveResponse = await postJson(`${server.baseUrl}/api/state`, {
    revision: envelope.revision,
    state: { ...envelope.state, processes: [{ id: 'synthetic-process' }], contacts: [{ id: 'synthetic-client' }], tasks: [{ id: 'synthetic-task' }] }
  }, headers);
  assert.equal(saveResponse.status, 200);
  await mkdir(path.join(server.dataDirectory, 'documents', 'blobs'), { recursive: true });
  await writeFile(path.join(server.dataDirectory, 'documents', 'blobs', 'synthetic.bin'), 'synthetic');
  await writeFile(path.join(server.dataDirectory, 'judicial-sessions.json'), '{"synthetic":true}');
  await mkdir(path.join(server.dataDirectory, 'system'), { recursive: true });
  await writeFile(path.join(server.dataDirectory, 'system', 'control-plane-marker.json'), '{"synthetic":true}');
  await writeFile(path.join(server.dataDirectory, 'system', 'tenants.json'), '[]');
  await mkdir(path.join(server.dataDirectory, 'tenants', 'escritorio-sintetico'), { recursive: true });
  await writeFile(path.join(server.dataDirectory, 'tenants', 'escritorio-sintetico', 'tenant.json'), '{"slug":"escritorio-sintetico"}');

  const resetResponse = await postJson(`${server.baseUrl}/api/admin/workspace/factory-reset`, {
    workspaceId: verified.user.workspaceId,
    password,
    code: generateTotp(setup.manualSecret),
    confirmationToken: 'ZERAR_ESCRITORIO'
  }, headers);
  const reset = await resetResponse.json();
  assert.equal(resetResponse.status, 200, `${reset.message || ''}\n${server.output()}`);
  assert.equal(reset.onboardingRequired, true);

  const statusResponse = await fetch(`${server.baseUrl}/api/auth/status`, { headers: { Cookie: cookie } });
  const status = await statusResponse.json();
  assert.equal(status.authenticated, true, 'sessão master atual deve permanecer válida');
  const resetStateResponse = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookie } });
  const resetEnvelope = await resetStateResponse.json();
  const resetState = resetEnvelope.state;
  assert.ok(resetState, `estado inicial deve existir após reset: ${JSON.stringify(resetEnvelope)}`);
  assert.deepEqual(resetState.processes || [], []);
  assert.deepEqual(resetState.contacts || [], []);
  assert.deepEqual(resetState.tasks || [], []);
  assert.notEqual(resetState.settings?.guidedTourSeen, true);
  await assert.rejects(() => readFile(path.join(server.dataDirectory, 'documents', 'blobs', 'synthetic.bin')));
  await assert.rejects(() => readFile(path.join(server.dataDirectory, 'judicial-sessions.json')));
  assert.equal(await readFile(path.join(server.dataDirectory, 'security.json'), 'utf8').then(() => true), true);
  assert.equal(await readFile(path.join(server.dataDirectory, 'system', 'control-plane-marker.json'), 'utf8'), '{"synthetic":true}', 'control-plane preservado após reset via API');
  assert.equal(await readFile(path.join(server.dataDirectory, 'system', 'platform.sqlite'), 'utf8').then(() => true), true, 'platform.sqlite preservado após reset via API');
  assert.equal(await readFile(path.join(server.dataDirectory, 'tenants', 'escritorio-sintetico', 'tenant.json'), 'utf8'), '{"slug":"escritorio-sintetico"}', 'tenants/ preservado após reset via API');

  const invalidResponse = await postJson(`${server.baseUrl}/api/admin/workspace/factory-reset`, {
    workspaceId: verified.user.workspaceId, password: 'wrong', code: '000000', confirmationToken: 'ZERAR_ESCRITORIO'
  }, headers);
  assert.equal(invalidResponse.status, 403);
  console.log('FACTORY RESET INTEGRATION: master reauth, isolated cleanup, onboarding state and session preservation passed');
} finally {
  await server.stop();
}
