import assert from 'node:assert/strict';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — API DA CONFERENCIA DE PRAZO (INFORMATIVA)            ');
console.log('===============================================================\n');

const PASSWORD = 'Senha-Conferencia-Prazo-2026!';

const server = await startTestServer({});
try {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin.conferencia.prazo',
    displayName: 'Administradora Conferência Sintética',
    email: 'conferencia@example.test',
    workspaceName: 'Conferência Teste',
    password: PASSWORD
  });
  const pending = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: pending.setupToken,
    code: generateTotp(pending.manualSecret)
  });
  const session = await response.json();
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const headers = { Cookie: cookie, 'X-CSRF-Token': session.csrfToken };

  console.log('[C1] Fronteira de segurança...');
  const anonymous = await postJson(`${server.baseUrl}/api/calc/deadline/conference`, { startDate: '2026-09-18', days: 5 });
  assert.equal(anonymous.status, 401, 'Conferência exige sessão.');
  const withoutCsrf = await postJson(`${server.baseUrl}/api/calc/deadline/conference`, { startDate: '2026-09-18', days: 5 }, { Cookie: cookie });
  assert.equal(withoutCsrf.status, 403, 'Conferência exige CSRF.');
  console.log('  ✓ Sessão e CSRF fail-closed.');

  console.log('[C2] Cálculo informativo e validação...');
  const before = await (await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookie } })).json();
  const business = await postJson(`${server.baseUrl}/api/calc/deadline/conference`, {
    startDate: '2026-09-18',
    days: 5,
    counting: 'business',
    direction: 'after'
  }, headers);
  const businessBody = await business.json();
  assert.equal(business.status, 200);
  assert.equal(businessBody.ok, true);
  assert.equal(businessBody.conference.proposedDate, '2026-09-25');
  assert.equal(businessBody.conference.firstBusinessDayAfter, '2026-09-21');
  assert.equal(businessBody.conference.lastBusinessDayBefore, '2026-09-17');
  assert.equal(businessBody.conference.countedDays, 5);
  assert.match(businessBody.conference.note, /nada é gravado automaticamente/);

  const calendar = await postJson(`${server.baseUrl}/api/calc/deadline/conference`, {
    startDate: '2026-09-18',
    days: 5,
    counting: 'calendar',
    direction: 'after'
  }, headers);
  assert.equal((await calendar.json()).conference.proposedDate, '2026-09-23');

  const suspended = await postJson(`${server.baseUrl}/api/calc/deadline/conference`, {
    startDate: '2026-09-21',
    days: 2,
    counting: 'business',
    suspensions: [{ from: '2026-09-22', to: '2026-09-23' }]
  }, headers);
  const suspendedBody = await suspended.json();
  assert.deepEqual(suspendedBody.conference.steps, ['2026-09-24', '2026-09-25']);
  assert.equal(suspendedBody.conference.suspensionsApplied, 2);

  const invalidDays = await postJson(`${server.baseUrl}/api/calc/deadline/conference`, { startDate: '2026-09-18', days: 0 }, headers);
  assert.equal(invalidDays.status, 400);
  assert.match((await invalidDays.json()).message, /1 a 365/);
  const invalidDate = await postJson(`${server.baseUrl}/api/calc/deadline/conference`, { startDate: '18/09/2026', days: 5 }, headers);
  assert.equal(invalidDate.status, 400);
  assert.match((await invalidDate.json()).message, /AAAA-MM-DD/);
  console.log('  ✓ Dias úteis/corridos, suspensões e entradas inválidas.');

  const after = await (await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookie } })).json();
  assert.equal(after.revision, before.revision, 'Conferência nunca grava estado, revision ou prazo.');
  console.log('  ✓ Nenhuma escrita: revision do workspace permanece intacta.');

  console.log('\n>>> API DA CONFERENCIA DE PRAZO: PASS <<<\n');
} finally {
  await server.stop();
}
