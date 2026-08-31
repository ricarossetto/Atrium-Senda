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
assert.match(emailSource, /presentation\?\.open\?\.\('emailConfig'\)/);
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

  assert.equal(await page.locator('.v2-integrations-header h2').textContent(), 'Integrações seguras');
  assert.equal(await page.locator('.email-integration-card').count(), 1);
  assert.equal(await page.locator('.external-calendar-integration-card').count(), 1);
  assert.equal(await page.locator('#emailIntegrationStatus').textContent(), 'SMTP conectado');
  assert.match(await page.locator('#emailIntegrationDetail').textContent(), /smtp\.synthetic\.example\.test:465/);
  assert.match(await page.locator('#emailIntegrationDetail').textContent(), /comunicacoes@synthetic\.example\.test/);
  assert.equal(await page.locator('.email-receiver-item').count(), 3);
  assert.match(await page.locator('#emailReceiversList').textContent(), /Usuário Inativo/);
  assert.equal(await page.locator('[data-receiver-action="delete"][aria-label^="Remover destinatário"]').count(), 3);

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

  const smtpSecret = 'Synthetic-Transient-SMTP-Password';
  await page.locator('#btnConfigureEmail').click();
  await page.locator('#emailConfigBackdrop:not(.hidden)').waitFor();
  assert.equal(await page.locator('#emailPasswordInput').inputValue(), '');
  assert.equal(await page.locator('#emailPasswordInput').getAttribute('type'), 'password');
  await page.locator('#emailPasswordInput').fill(smtpSecret);
  await page.locator('#emailConfigSubmitBtn').click();
  await page.locator('#emailConfigBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#emailPasswordInput').inputValue(), '');
  const smtpEvidence = await page.evaluate(secret => {
    const request = window.__uiV2EmailCalendarRequests.find(item => item.url === '/api/integrations/email/configure');
    return {
      request,
      observed: window.__uiV2SmtpPasswordObserved,
      store: JSON.stringify(window.Atrium.Store.state).includes(secret),
      local: Object.values(localStorage).some(value => String(value).includes(secret)),
      session: Object.values(sessionStorage).some(value => String(value).includes(secret)),
      toast: window.__uiV2EmailCalendarToasts.some(item => String(item.message).includes(secret)),
      rendered: document.body.innerText.includes(secret)
    };
  }, smtpSecret);
  assert.deepEqual(Object.keys(smtpEvidence.request.body).sort(), ['fromAddress', 'fromName', 'host', 'password', 'port', 'secure', 'user'].sort());
  assert.equal(smtpEvidence.request.body.password, '[REDACTED]');
  assert.equal(smtpEvidence.observed, true);
  assert.deepEqual({ store: smtpEvidence.store, local: smtpEvidence.local, session: smtpEvidence.session, toast: smtpEvidence.toast, rendered: smtpEvidence.rendered }, {
    store: false, local: false, session: false, toast: false, rendered: false
  });

  await page.locator('#btnTestEmail').click();
  await page.locator('#emailTestBackdrop:not(.hidden)').waitFor();
  assert.equal(await page.locator('#emailTestRecipientInput').inputValue(), '');
  await page.locator('#emailTestRecipientInput').fill('explicit-recipient@synthetic.example.test');
  await page.locator('#emailTestSubmitBtn').click();
  await page.locator('#emailTestBackdrop').waitFor({ state: 'hidden' });
  const testRequest = await page.evaluate(() => window.__uiV2EmailCalendarRequests.find(item => item.url === '/api/integrations/email/test'));
  assert.deepEqual(testRequest, {
    url: '/api/integrations/email/test', method: 'POST', body: { recipient: 'explicit-recipient@synthetic.example.test' }
  });

  await page.locator('#btnAddEmailReceiver').click();
  await page.locator('#emailReceiverModalBackdrop:not(.hidden)').waitFor();
  assert.deepEqual(await page.locator('#receiverUserSelect option').allTextContents(), ['Usuária Ativa Sintética (ativa@synthetic.example.test)']);
  await page.locator('#receiverTypeExternal').check();
  await page.locator('#receiverNameInput').fill('Destinatário Externo V2');
  await page.locator('#receiverEmailInput').fill('externo-v2@synthetic.example.test');
  await page.locator('#receiverSubmitBtn').click();
  await page.locator('#emailReceiverModalBackdrop').waitFor({ state: 'hidden' });
  const externalCreate = await page.evaluate(() => window.__uiV2EmailCalendarRequests.find(item => item.method === 'POST' && item.url === '/api/integrations/email/receivers'));
  assert.deepEqual(externalCreate.body, { type: 'external', enabled: true, name: 'Destinatário Externo V2', email: 'externo-v2@synthetic.example.test' });

  await page.locator('#btnAddEmailReceiver').click();
  await page.locator('#emailReceiverModalBackdrop:not(.hidden)').waitFor();
  await page.locator('#receiverUserSelect').selectOption('user-active');
  await page.locator('#receiverSubmitBtn').click();
  await page.locator('#emailReceiverModalBackdrop').waitFor({ state: 'hidden' });
  const internalCreate = await page.evaluate(() => window.__uiV2EmailCalendarRequests.find(item => item.method === 'POST' && item.body?.type === 'internal'));
  assert.deepEqual(internalCreate.body, { type: 'internal', enabled: true, userId: 'user-active' });

  await page.locator('[data-receiver-id="receiver-external"] [data-receiver-action="edit"]').click();
  await page.locator('#emailReceiverModalBackdrop:not(.hidden)').waitFor();
  await page.locator('#receiverNameInput').fill('Contabilidade Editada V2');
  await page.locator('#receiverEmailInput').fill('contabilidade-editada@synthetic.example.test');
  await page.locator('#receiverSubmitBtn').click();
  const editRequest = await page.evaluate(() => window.__uiV2EmailCalendarRequests.find(item => item.method === 'PATCH' && item.url.endsWith('/receiver-external')));
  assert.deepEqual(editRequest.body, { enabled: false, name: 'Contabilidade Editada V2', email: 'contabilidade-editada@synthetic.example.test' });

  await page.locator('[data-receiver-id="receiver-internal"] [data-receiver-action="toggle"]').click();
  await page.waitForFunction(() => window.__uiV2EmailCalendarRequests.some(item => item.method === 'PATCH' && item.url.endsWith('/receiver-internal')));
  const toggleRequest = await page.evaluate(() => window.__uiV2EmailCalendarRequests.find(item => item.method === 'PATCH' && item.url.endsWith('/receiver-internal')));
  assert.deepEqual(toggleRequest.body, { enabled: false });

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
  assert.deepEqual(calendarEvidence.request, {
    url: '/api/calendar/configure', method: 'POST', body: { calendarUrl: 'https://calendar.synthetic.example.test/feed.ics' }
  });
  assert.equal(calendarEvidence.settings.calendarUrl, 'https://calendar.synthetic.example.test/feed.ics');
  assert.equal(calendarEvidence.settings.externalCalendarUrl, 'https://calendar.synthetic.example.test/feed.ics');
  assert.equal(calendarEvidence.settings.calendarConfigured, true);
  assert.deepEqual(calendarEvidence.ops.map(item => item.type), ['audit', 'save', 'flush', 'sync']);
  assert.deepEqual(calendarEvidence.ops[0], { type: 'audit', action: 'Agenda externa configurada', detail: '4 compromissos sincronizados.' });
  assert.deepEqual(pageErrors, []);
  await context.close();

  const collaboratorContext = await session.createContext({ viewport: { width: 1280, height: 800 } });
  const collaboratorResult = await prepareUiV2Page(collaboratorContext, session.server.baseUrl, { theme: 'dark' });
  await prepareUiV2EmailCalendarFixture(collaboratorResult.page, { role: 'collaborator' });
  assert.equal(await collaboratorResult.page.locator('#emailReceiversSection').isVisible(), false);
  assert.equal(await collaboratorResult.page.locator('#btnAddEmailReceiver').isVisible(), false);
  assert.equal(await collaboratorResult.page.evaluate(() => window.__uiV2EmailCalendarRequests.filter(item => item.url === '/api/integrations/email/receivers').length), 0);
  assert.deepEqual(collaboratorResult.pageErrors, []);
  await collaboratorContext.close();
} finally {
  await session.stop();
}

console.log('✓ UI V2 Email + Calendar: arquitetura, SMTP, receivers, RBAC, segredo, agenda e persistência PASS.');
