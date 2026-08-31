import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2JudicialFixture, prepareUiV2Page, startUiV2Session, UI_V2_JUDICIAL_STATUS } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-judicial-integrations');
fs.mkdirSync(OUTPUT, { recursive: true });

const UNCONFIGURED = {
  ...UI_V2_JUDICIAL_STATUS,
  certificate: { valid: false, accessible: false, status: 'missing' },
  pjeOffice: { available: false },
  portals: UI_V2_JUDICIAL_STATUS.portals.map(portal => ({ ...portal, enabled: false, totpConfigured: false }))
};

const SCENARIOS = [
  { file: '01-light-1440x900-integrations-hub.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'hub' },
  { file: '02-dark-1440x900-integrations-hub.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'hub' },
  { file: '03-light-1440x900-judicial-active.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'active' },
  { file: '04-dark-1440x900-judicial-active.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'active' },
  { file: '05-light-1280x800-a1-upload.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'upload' },
  { file: '06-dark-1280x800-a1-upload.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'upload' },
  { file: '07-light-1280x800-portal-coverage.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'coverage' },
  { file: '08-dark-1280x800-totp.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'totp' },
  { file: '09-light-1280x800-sandbox.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'sandbox' },
  { file: '10-light-390x844-integrations-hub.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'hub' },
  { file: '11-light-390x844-judicial-sheet.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'active' },
  { file: '12-dark-390x844-judicial-sheet.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'totp' }
];

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;
try {
  for (const scenario of SCENARIOS) {
    const context = await session.createContext({ viewport: scenario.viewport });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      const status = scenario.state === 'upload' ? UNCONFIGURED : UI_V2_JUDICIAL_STATUS;
      await prepareUiV2JudicialFixture(page, status);
      if (scenario.state !== 'hub') {
        await page.locator('#certificateGuideButton').click();
        await page.waitForFunction(() => document.querySelector('#judicialSetupBackdrop [role="dialog"]')?.contains(document.activeElement));
      }
      if (scenario.state === 'coverage') await page.locator('#portalCoverageList').scrollIntoViewIfNeeded();
      if (scenario.state === 'totp') await page.locator('#totpSetupSection').scrollIntoViewIfNeeded();
      if (scenario.state === 'sandbox') {
        await page.locator('#btnRunA1Sandbox').click();
        await page.locator('#chkStep-pfxFile').filter({ hasText: 'OK' }).waitFor();
        await page.locator('#a1ActiveCard').scrollIntoViewIfNeeded();
      }
      await page.waitForFunction(() => [...document.querySelectorAll('#view-integrations, #judicialSetupBackdrop')]
        .flatMap(element => element.getAnimations({ subtree: true })).every(animation => animation.playState === 'finished'));

      const layout = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const dialog = document.querySelector('#judicialSetupBackdrop:not(.hidden) [role="dialog"]');
        const rect = dialog?.getBoundingClientRect();
        const interactive = [...document.querySelectorAll('#view-integrations button, #judicialSetupBackdrop:not(.hidden) button, #judicialSetupBackdrop:not(.hidden) input:not([type="checkbox"]):not([type="file"]), #judicialSetupBackdrop:not(.hidden) select')]
          .filter(element => element.getClientRects().length);
        return {
          active: document.getElementById('view-integrations').classList.contains('active'),
          ui: document.documentElement.dataset.ui,
          overflow: document.documentElement.scrollWidth - innerWidth,
          duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
          dialog: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight, overflow: dialog.scrollWidth - dialog.clientWidth } : null,
          undersized: innerWidth <= 560 ? interactive.filter(element => {
            const target = element.getBoundingClientRect();
            return target.width < 43.5 || target.height < 43.5;
          }).map(element => element.id || element.textContent.trim()) : []
        };
      });
      assert.equal(layout.active, true); assertions++;
      assert.equal(layout.ui, 'v2'); assertions++;
      assert.ok(layout.overflow <= 2, `${scenario.file}: overflow global ${layout.overflow}px.`); assertions++;
      assert.deepEqual(layout.duplicates, []); assertions++;
      assert.deepEqual(layout.undersized, []); assertions++;
      assert.deepEqual(pageErrors, []); assertions++;
      if (layout.dialog) {
        assert.ok(layout.dialog.left >= -2 && layout.dialog.right <= layout.dialog.width + 2); assertions++;
        assert.ok(layout.dialog.top >= -2 && layout.dialog.bottom <= layout.dialog.height + 2); assertions++;
        assert.ok(layout.dialog.overflow <= 2); assertions++;
      }

      const output = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: output, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
    } finally {
      await context.close();
    }
  }
  assert.equal(hashes.size, SCENARIOS.length, 'Os doze estados judiciais devem gerar imagens distintas.');
  console.log('======================================================');
  console.log('✓ UI V2 JUDICIAL INTEGRATIONS VISUAL QA CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
