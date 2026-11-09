import assert from 'node:assert/strict';
import { startUiV2Session, prepareUiV2Page, switchUiV2View, prepareUiV2ConfigurationAdminFixture } from './ui_v2_helpers.mjs';

const session = await startUiV2Session();
try {
  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 390]) {
      const context = await session.createContext({ viewport: { width, height: 900 } });
      try {
        const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
        const trigger = page.locator('#notificationButton');
        const panel = page.locator('#notificationPanel');
        assert.equal(await trigger.getAttribute('aria-haspopup'), 'dialog');
        assert.equal(await trigger.getAttribute('aria-controls'), 'notificationPanel');
        assert.equal(await panel.count(), 1, 'ID de destino é único, inclusive enquanto fechado.');
        assert.equal(await panel.getAttribute('role'), 'dialog');
        assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
        await trigger.click();
        await panel.waitFor({ state: 'visible' });
        assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
        assert.equal(await panel.evaluate(el => el.contains(document.activeElement)), true);
        await page.keyboard.press('Escape');
        await panel.waitFor({ state: 'hidden' });
        assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'notificationButton');

        await prepareUiV2ConfigurationAdminFixture(page);
        await switchUiV2View(page, 'configuration');
        const officeTrigger = page.locator('#openOfficeIdentityFromConfiguration');
        const officeDialog = page.locator('#officeSetupDialog');
        assert.equal(await officeTrigger.getAttribute('aria-haspopup'), 'dialog');
        assert.equal(await officeTrigger.getAttribute('aria-controls'), 'officeSetupDialog');
        assert.equal(await officeDialog.count(), 1);
        assert.equal(await officeDialog.getAttribute('role'), 'dialog');
        await officeTrigger.click();
        await officeDialog.waitFor({ state: 'visible' });
        await page.waitForFunction(() => document.getElementById('officeSetupDialog')?.contains(document.activeElement));
        assert.equal(await page.locator('#appShell').getAttribute('inert'), '');
        await page.keyboard.press('Escape');
        await officeDialog.waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'openOfficeIdentityFromConfiguration');
        assert.deepEqual(pageErrors, []);
        console.log(`PASS ${theme}/${width}: destinos únicos, roles corretos, abertura, Escape e retorno de foco.`);
      } finally { await context.close(); }
    }
  }
} finally { await session.stop(); }
