import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareUiV2EmailCalendarFixture,
  prepareUiV2Page,
  startUiV2Session
} from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [emailSource, calendarSource, presenterSource, portalSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/email-integration.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/features/external-calendar.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/views/ui-v2/email-calendar-presenter.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/portal.js'), 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 EMAIL + EXTERNAL CALENDAR INTEGRATIONS');
console.log('===============================================================\n');

assert.equal((portalSource.match(/createEmailIntegrationFeature\s*\(/g) || []).length, 1);
assert.equal((portalSource.match(/createExternalCalendarFeature\s*\(/g) || []).length, 1);
for (const source of [emailSource, calendarSource]) {
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
}
assert.doesNotMatch(emailSource, /\bStore\b|store\.state|localStorage|sessionStorage|setInterval/);
assert.doesNotMatch(presenterSource, /\bStore\b|store\.state|localStorage|sessionStorage|secureFetch|\bfetch\s*\(|setTimeout|setInterval|\baudit\s*\(|\.save\s*\(|\.flush\s*\(/);
assert.match(emailSource, /\/api\/admin\/mail\/status/);
assert.doesNotMatch(emailSource, /secureFetch\(['"]\/api\/integrations\/email\//);
assert.match(calendarSource, /presentation\?\.open\?\.\('externalCalendar'\)/);

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });
  const before = await page.evaluate(() => ({
    state: JSON.stringify(window.Atrium.Store.state),
    revision: window.Atrium.Store.revision,
    mutations: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));
  await prepareUiV2EmailCalendarFixture(page);

  assert.equal(await page.locator('.v2-integrations-header h2').textContent(), 'Integrações');
  assert.equal(await page.locator('.email-integration-card').count(), 1);
  assert.equal(await page.locator('.external-calendar-integration-card').count(), 1);
  assert.equal(await page.locator('#emailIntegrationStatus').textContent(), 'Desativado');
  assert.match(await page.locator('#emailIntegrationDetail').textContent(), /E-mail conectado pelo Resend/);
  assert.match(await page.locator('#emailIntegrationDetail').textContent(), /Envios automáticos pausados/);
  assert.equal(await page.locator('#atriumMailTodayCount').textContent(), '3 / 100');
  assert.equal(await page.locator('#atriumMailMonthCount').textContent(), '17 / 3000');
  assert.equal(await page.locator('#atriumMailQueueCount').textContent(), '2 na fila');
  assert.equal(await page.locator('.email-receiver-item').count(), 3);
  assert.match(await page.locator('#emailReceiversList').textContent(), /Usuário Inativo/);
  assert.equal(await page.locator('[data-receiver-action="delete"]').count(), 3);

  const afterPresentation = await page.evaluate(() => ({
    state: JSON.stringify(window.Atrium.Store.state),
    revision: window.Atrium.Store.revision,
    mutations: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals,
    requests: window.__uiV2EmailCalendarRequests
  }));
  assert.equal(afterPresentation.state, before.state, 'Presenter não pode mutar Store ao renderizar.');
  assert.equal(afterPresentation.revision, before.revision);
  assert.equal(afterPresentation.mutations, before.mutations);
  assert.equal(afterPresentation.intervals, before.intervals);
  assert.ok(afterPresentation.requests.every(request => request.method === 'GET'));

  await page.locator('#btnConfigureMailPreferences').click();
  await page.locator('#mailPreferencesBackdrop:not(.hidden)').waitFor();
  assert.equal(await page.locator('#atriumMailToggleCheckbox').isChecked(), false, 'O fixture inicia o master switch desativado.');
  await page.locator('#atriumMailToggleCheckbox').click();
  await page.waitForFunction(() => window.__uiV2EmailCalendarRequests.some(item => item.url === '/api/admin/mail/toggle'));
  assert.deepEqual(await page.evaluate(() => window.__uiV2EmailCalendarRequests.find(item => item.url === '/api/admin/mail/toggle').body), { enabled: true });

  await page.locator('#btnConfigureMailPreferences').click();
  await page.locator('#mailPreferencesBackdrop:not(.hidden)').waitFor();
   assert.equal(await page.locator('#mailPrefPublication').inputValue(), 'BULLETINS');
  assert.equal(await page.locator('#mailPrefMovements').inputValue(), 'BULLETINS');
  await page.locator('#mailPrefPublication').selectOption('DISABLED');
  await page.locator('#mailPreferencesForm').evaluate(form => form.requestSubmit());
  await page.locator('#mailPreferencesBackdrop').waitFor({ state: 'hidden' });
  const preferenceRequest = await page.evaluate(() => window.__uiV2EmailCalendarRequests.find(item => item.url === '/api/user/notification-preferences' && item.method === 'PUT'));
  assert.deepEqual(preferenceRequest.body.preferences, [
    { eventType: 'PUBLICATION_NEW', cadence: 'DISABLED', enabled: false },
    { eventType: 'DEADLINE_CRITICAL', cadence: 'BULLETINS', enabled: true },
    { eventType: 'HEARING_NEW', cadence: 'BULLETINS', enabled: true },
    { eventType: 'MOVEMENT_NEW', cadence: 'BULLETINS', enabled: true },
    { eventType: 'SYNC_FAILED', cadence: 'BULLETINS', enabled: true },
    { eventType: 'A1_CERT_EXPIRING', cadence: 'BULLETINS', enabled: true }
  ]);

  await page.locator('#btnTestAtriumMail').click();
  await page.locator('#emailTestBackdrop:not(.hidden)').waitFor();
  assert.equal(await page.locator('#emailTestRecipientInput').inputValue(), '');
  await page.locator('#emailTestRecipientInput').fill('explicit-recipient@synthetic.example.test');
  await page.locator('#emailTestSubmitBtn').click();
  await page.locator('#emailTestBackdrop').waitFor({ state: 'hidden' });
  const testRequest = await page.evaluate(() => window.__uiV2EmailCalendarRequests.find(item => item.url === '/api/admin/mail/test'));
  assert.deepEqual(testRequest, {
    url: '/api/admin/mail/test', method: 'POST', body: { recipient: 'explicit-recipient@synthetic.example.test' }
  });

  await page.locator('#btnAddExternalRecipient').click();
  await page.locator('#emailReceiverModalBackdrop:not(.hidden)').waitFor();
  await page.locator('#receiverNameInput').fill('Destinatário Externo V2');
  await page.locator('#receiverEmailInput').fill('externo-v2@synthetic.example.test');
  await page.locator('#receiverSubmitBtn').click();
  await page.locator('#emailReceiverModalBackdrop').waitFor({ state: 'hidden' });
  const externalCreate = await page.evaluate(() => window.__uiV2EmailCalendarRequests.find(item => item.method === 'POST' && item.url === '/api/admin/mail/recipients'));
  assert.deepEqual(externalCreate.body, { enabled: true, name: 'Destinatário Externo V2', email: 'externo-v2@synthetic.example.test' });

  await page.locator('[data-receiver-id="receiver-external"] [data-receiver-action="toggle"]').click();
  await page.waitForFunction(() => window.__uiV2EmailCalendarRequests.some(item => item.method === 'PATCH' && item.url.endsWith('/receiver-external')));
  const toggleRequest = await page.evaluate(() => window.__uiV2EmailCalendarRequests.find(item => item.method === 'PATCH' && item.url.endsWith('/receiver-external')));
  assert.deepEqual(toggleRequest.body, { enabled: true });

  page.once('dialog', dialog => dialog.dismiss());
  const deleteCountBefore = await page.evaluate(() => window.__uiV2EmailCalendarRequests.filter(item => item.method === 'DELETE').length);
  await page.locator('[data-receiver-id="receiver-external"] [data-receiver-action="delete"]').click();
  assert.equal(await page.evaluate(() => window.__uiV2EmailCalendarRequests.filter(item => item.method === 'DELETE').length), deleteCountBefore);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-receiver-id="receiver-external"] [data-receiver-action="delete"]').click();
  await page.waitForFunction(() => window.__uiV2EmailCalendarRequests.some(item => item.method === 'DELETE'));

  await page.evaluate(() => {
    window.Atrium.Store.state.settings.calendarUrl = 'webcal://canonical.synthetic.example.test/calendar';
    window.Atrium.Store.state.settings.externalCalendarUrl = 'webcal://fallback.synthetic.example.test/calendar';
  });
  await page.locator('#configureCalendarButton').click();
  await page.locator('#calendarConfigBackdrop:not(.hidden)').waitFor();
  assert.equal(await page.locator('#calendarInputUrl').inputValue(), 'webcal://canonical.synthetic.example.test/calendar');
  await page.keyboard.press('Escape');
  await page.locator('#calendarConfigBackdrop').waitFor({ state: 'hidden' });

  await page.evaluate(() => {
    window.Atrium.Store.state.settings.calendarUrl = '';
    window.__uiV2CalendarOps = [];
    const store = window.Atrium.Store;
    store.audit = (action, detail) => { window.__uiV2CalendarOps.push({ type: 'audit', action, detail }); };
    store.save = () => { window.__uiV2CalendarOps.push({ type: 'save' }); };
    store.flush = async () => { window.__uiV2CalendarOps.push({ type: 'flush' }); return true; };
    window.Atrium.App.syncAll = async () => { window.__uiV2CalendarOps.push({ type: 'sync' }); };
  });
  await page.locator('#configureCalendarButton').click();
  await page.locator('#calendarConfigBackdrop:not(.hidden)').waitFor();
  assert.equal(await page.locator('#calendarInputUrl').inputValue(), 'webcal://fallback.synthetic.example.test/calendar');
  await page.locator('#calendarInputUrl').fill('https://calendar.synthetic.example.test/feed.ics');
  await page.locator('#calendarConfigSubmit').click();
  await page.locator('#calendarConfigStatus').filter({ hasText: 'Agenda externa sintética sincronizada.' }).waitFor();
  const calendarEvidence = await page.evaluate(() => ({
    settings: window.Atrium.Store.state.settings,
    request: window.__uiV2EmailCalendarRequests.find(item => item.url === '/api/calendar/configure'),
    ops: window.__uiV2CalendarOps
  }));
  assert.equal(calendarEvidence.request.url, '/api/calendar/configure');
  assert.equal(calendarEvidence.request.method, 'POST');
  assert.equal(calendarEvidence.request.body.calendarUrl, 'https://calendar.synthetic.example.test/feed.ics');
  assert.match(calendarEvidence.request.body.revision, /^\S+$/);
  assert.equal(calendarEvidence.settings.calendarUrl, 'https://calendar.synthetic.example.test/feed.ics');
  assert.equal(calendarEvidence.settings.externalCalendarUrl, 'https://calendar.synthetic.example.test/feed.ics');
  assert.equal(calendarEvidence.settings.calendarConfigured, true);
  assert.deepEqual(calendarEvidence.ops.map(item => item.type), ['sync']);
  assert.deepEqual(pageErrors, []);
  await context.close();

  const collaboratorContext = await session.createContext({ viewport: { width: 1280, height: 800 } });
  const collaboratorResult = await prepareUiV2Page(collaboratorContext, session.server.baseUrl, { theme: 'dark' });
  await prepareUiV2EmailCalendarFixture(collaboratorResult.page, { role: 'collaborator' });
  assert.equal(await collaboratorResult.page.locator('#emailReceiversSection').isVisible(), false);
  assert.equal(await collaboratorResult.page.locator('#btnAddExternalRecipient').isVisible(), false);
  assert.equal(await collaboratorResult.page.locator('#btnTestAtriumMail').isVisible(), false);
  assert.equal(await collaboratorResult.page.evaluate(() => window.__uiV2EmailCalendarRequests.filter(item => item.url === '/api/admin/mail/recipients').length), 0);
  assert.deepEqual(collaboratorResult.pageErrors, []);
  await collaboratorContext.close();
} finally {
  await session.stop();
}

console.log('✓ UI V2 Mail + Calendar: Resend, preferências, recipients, RBAC, agenda e persistência PASS.');
