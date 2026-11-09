import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  startUiV2Session, prepareUiV2Page, prepareUiV2EmailCalendarFixture
} from './ui_v2_helpers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'artifacts', 'visual-qa', 'integration-comments');
await mkdir(output, { recursive: true });
const session = await startUiV2Session();
try {
  for (const theme of ['light', 'dark']) {
    for (const width of [1538, 1280, 1186, 390]) {
      const context = await session.createContext({ viewport: { width, height: 844 } });
      try {
        const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
        await prepareUiV2EmailCalendarFixture(page, { receivers: [] });
        await page.locator('#atriumMailIntegrationCard').scrollIntoViewIfNeeded();
        const geometry = await page.evaluate(() => {
          const grid = document.querySelector('#view-integrations .integration-grid');
          const mail = document.querySelector('#atriumMailIntegrationCard');
          const inpi = document.querySelector('.inpi-integration-card');
          const bounds = element => {
            const rect = element.getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height };
          };
          return {
            mail: bounds(mail), inpi: bounds(inpi),
            gridOverflow: grid.scrollWidth - grid.clientWidth,
            cardOverflow: mail.scrollWidth - mail.clientWidth,
            documentOverflow: document.documentElement.scrollWidth - innerWidth,
            buttons: [...mail.querySelectorAll('button')].filter(el => el.getClientRects().length).map(bounds)
          };
        });
        assert.ok(geometry.gridOverflow <= 2, `${theme}/${width}: grid overflow`);
        assert.ok(geometry.cardOverflow <= 2, `${theme}/${width}: card overflow`);
        assert.ok(geometry.documentOverflow <= 2, `${theme}/${width}: document overflow`);
        assert.equal(await page.locator('#atriumMailIntegrationCard h3').textContent(), 'ATRIUM Mail e Notificações');
        assert.equal(await page.locator('#emailReceiversSection').isVisible(), false, 'Empty recipients must not expand the card');
        assert.equal(await page.locator('#btnTestAtriumMail').isVisible(), true, 'Master can test Mail');
        if (width > 760) {
          assert.ok(Math.abs(geometry.mail.top - geometry.inpi.top) <= 2, 'Mail and INPI must share a grid row');
          assert.ok(geometry.mail.left >= geometry.inpi.right, 'Mail must sit to the right, without overlap');
          assert.ok(Math.abs(geometry.mail.width - geometry.inpi.width) <= 2, 'Equal column widths');
          assert.ok(geometry.mail.height <= 370, `Compact Mail card is too tall: ${geometry.mail.height}`);
        } else {
          assert.ok(geometry.mail.top >= geometry.inpi.bottom, 'Mobile cards must stack');
          for (const button of geometry.buttons) {
            assert.ok(button.height >= 43.5, 'Mobile actions need 44px touch height');
            assert.ok(button.left >= geometry.mail.left && button.right <= geometry.mail.right, 'Mobile action must fit card');
          }
        }
        await page.locator('#atriumMailIntegrationCard').screenshot({ path: path.join(output, `mail-${theme}-${width}.png`) });
        await page.locator('#btnConfigureMailPreferences').click();
        await page.locator('#mailPreferencesBackdrop:not(.hidden)').waitFor();
        assert.equal(await page.locator('#mailPreferencesTitle').textContent(), 'Preferências de notificações');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'mailPrefPublication');
        assert.equal(await page.locator('#appShell').getAttribute('inert'), '');
        for (const id of ['mailPrefPublication', 'mailPrefDeadline', 'mailPrefHearing', 'mailPrefMovements', 'mailPrefSyncFailed', 'mailPrefCertificate']) {
          assert.deepEqual(await page.locator(`#${id} option`).evaluateAll(options => options.map(option => ({ value: option.value, label: option.textContent }))), [
            { value: 'BULLETINS', label: 'Boletins (08h, 14h e 20h)' }, { value: 'DISABLED', label: 'Desativado' }
          ]);
          assert.equal(await page.locator(`#${id}`).getAttribute('aria-describedby'), 'mailPreferencesCadenceHelp');
          assert.equal(await page.locator(`#${id}`).inputValue(), 'BULLETINS');
        }
        await page.evaluate(() => document.fonts.ready);
        const drawerGeometry = await page.evaluate(() => {
          const drawer = document.querySelector('.mail-preferences-drawer');
          const form = document.getElementById('mailPreferencesForm');
          const rect = drawer.getBoundingClientRect();
          return {
            left: rect.left, right: rect.right, bottom: rect.bottom,
            overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
            formOverflow: form.scrollWidth - form.clientWidth,
            controls: [...form.querySelectorAll('select')].filter(el => el.getClientRects().length).map(el => ({ height: el.getBoundingClientRect().height, font: parseFloat(getComputedStyle(el).fontSize) }))
          };
        });
        assert.ok(drawerGeometry.left >= -2 && drawerGeometry.right <= width + 2);
        assert.ok(drawerGeometry.bottom <= 846);
        assert.ok(drawerGeometry.overflow <= 2 && drawerGeometry.formOverflow <= 2);
        for (const control of drawerGeometry.controls) { assert.ok(control.height >= 44); assert.ok(control.font >= 16); }
        await page.screenshot({ path: path.join(output, `preferences-after-${theme}-${width}.png`) });
        await page.locator('#mailPreferencesSubmit').focus();
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => {
          const first = [...document.querySelectorAll('.mail-preferences-drawer button')].find(element => element.getClientRects().length && !element.disabled);
          return document.activeElement === first;
        }), true);
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'mailPreferencesSubmit');
        await page.locator('#mailPreferencesSubmit').screenshot({ path: path.join(output, `preferences-action-${theme}-${width}.png`) });
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'btnConfigureMailPreferences');
        assert.equal(await page.locator('#appShell').getAttribute('inert'), null);
        await page.locator('#btnConfigureMailPreferences').click();
        await page.locator('#mailPreferencesClose').click();
        await page.locator('#mailPreferencesBackdrop').waitFor({ state: 'hidden' });
        assert.deepEqual(pageErrors, []);
        console.log(`PASS Mail/INPI layout + drawer ${theme} ${width}px`);
      } finally { await context.close(); }
    }
  }
   for (const role of ['admin', 'collaborator', 'master_admin']) {
    const context = await session.createContext();
    try {
      const { page } = await prepareUiV2Page(context, session.server.baseUrl);
      await prepareUiV2EmailCalendarFixture(page, { receivers: [], role });
      assert.equal(await page.locator('#btnTestAtriumMail').isVisible(), role === 'master_admin', `${role}: master-only test`);
      assert.equal(await page.locator('#btnConfigureMailPreferences').isVisible(), true, `${role} can configure own preferences`);
      assert.equal(await page.locator('#emailReceiversSection').isVisible(), false);
      await page.locator('#btnConfigureMailPreferences').click();
      await page.locator('#mailPreferencesBackdrop:not(.hidden)').waitFor();
      assert.equal(await page.locator('#mailPrefSyncFailedField').isVisible(), role !== 'collaborator');
      assert.equal(await page.locator('#mailPrefCertificateField').isVisible(), role !== 'collaborator');
      await page.locator('#mailPreferencesSubmit').click();
      await page.locator('#mailPreferencesBackdrop').waitFor({ state: 'hidden' });
      const preferences = await page.evaluate(() => window.__uiV2EmailCalendarRequests.find(item => item.method === 'PUT').body.preferences);
      assert.equal(preferences.length, role === 'collaborator' ? 4 : 6);
      assert.equal(preferences.some(item => ['SYSTEM_TEST', 'PASSWORD_RESET'].includes(item.eventType)), false);
      assert.ok(preferences.every(item => item.cadence === 'BULLETINS'));
    } finally { await context.close(); }
  }
  for (const theme of ['light', 'dark']) {
    const context = await session.createContext({ viewport: { width: 390, height: 500 } });
    try {
      const { page } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
      await prepareUiV2EmailCalendarFixture(page, { receivers: [] });
      await page.evaluate(() => {
        const original = window.KellerAuth.secureFetch.bind(window.KellerAuth);
        window.__mailPreferenceStatus = 500;
        window.__mailSavedPreferences = [
          { event_type: 'PUBLICATION_NEW', cadence: 'BULLETINS', enabled: false },
          { event_type: 'MOVEMENT_NEW', cadence: 'BULLETINS', enabled: true }
        ];
        window.KellerAuth.secureFetch = async (url, options = {}) => {
          if (url !== '/api/user/notification-preferences') return original(url, options);
          if (options.method !== 'PUT') return { ok: true, json: async () => ({ preferences: window.__mailSavedPreferences }) };
          window.__mailPreferencePuts = (window.__mailPreferencePuts || 0) + 1;
          if (window.__mailPreferenceStatus !== 200) return { ok: false, status: window.__mailPreferenceStatus, json: async () => ({ message: `Falha sintética ${window.__mailPreferenceStatus}: preferências não salvas. Tente novamente.` }) };
          window.__mailSavedPreferences = JSON.parse(options.body).preferences.map(item => ({ ...item, event_type: item.eventType }));
          return { ok: true, json: async () => ({ ok: true }) };
        };
      });
      await page.locator('#btnConfigureMailPreferences').click();
      assert.equal(await page.locator('#mailPrefPublication').inputValue(), 'DISABLED');
      for (const status of [500, 409]) {
        await page.evaluate(value => { window.__mailPreferenceStatus = value; }, status);
        await page.locator('#mailPreferencesSubmit').click();
        await page.locator('#mailPreferencesFeedback').filter({ hasText: String(status) }).waitFor();
        assert.equal(await page.locator('#mailPreferencesBackdrop').isVisible(), true);
        assert.equal(await page.locator('#mailPrefPublication').inputValue(), 'DISABLED');
        assert.equal(await page.locator('#mailPreferencesSubmit').isEnabled(), true);
        const hit = await page.locator('#mailPreferencesSubmit').evaluate(element => {
          const rect = element.getBoundingClientRect();
          const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return element === target || element.contains(target);
        });
        assert.equal(hit, true);
        await page.screenshot({ path: path.join(output, `preferences-${status}-${theme}-390x500.png`) });
      }
      assert.equal(await page.evaluate(() => window.__uiV2EmailCalendarToasts.some(item => item.type === 'success')), false);
      await page.evaluate(() => { window.__mailPreferenceStatus = 200; });
      await page.locator('#mailPreferencesSubmit').click();
      await page.locator('#mailPreferencesBackdrop').waitFor({ state: 'hidden' });
      await page.locator('#btnConfigureMailPreferences').click();
      assert.equal(await page.locator('#mailPrefPublication').inputValue(), 'DISABLED');
      const saved = await page.evaluate(() => window.__mailSavedPreferences);
      await page.keyboard.press('Escape');
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('#appShell:not(.hidden)').waitFor();
      await prepareUiV2EmailCalendarFixture(page, { receivers: [] });
      await page.evaluate(preferences => {
        const original = window.KellerAuth.secureFetch.bind(window.KellerAuth);
        window.KellerAuth.secureFetch = async (url, options = {}) => url === '/api/user/notification-preferences' && options.method !== 'PUT'
          ? { ok: true, json: async () => ({ preferences }) } : original(url, options);
      }, saved);
      await page.locator('#btnConfigureMailPreferences').click();
      assert.equal(await page.locator('#mailPrefPublication').inputValue(), 'DISABLED');
      assert.equal(await page.locator('#mailPrefMovements').inputValue(), 'BULLETINS');
      await page.locator('#mailPreferencesSubmit').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(output, `preferences-refresh-${theme}-390x500.png`) });
      assert.ok(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth <= 2));
      console.log(`PASS ${theme}: 390x500, 500/409, retry, backend fixture refresh, opt-out`);
    } finally { await context.close(); }
  }
} finally { await session.stop(); }
console.log('Integration comments layout: PASS (8 theme/viewport cases + 3 roles + 500/409/refresh)');
