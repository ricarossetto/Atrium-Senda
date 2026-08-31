import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareUiV2ConfigurationAdminFixture,
  prepareUiV2Page,
  startUiV2Session
} from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-configuration-admin');
fs.mkdirSync(OUTPUT, { recursive: true });

const SCENARIOS = [
  { file: '01-light-1440x900-configuration.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'configuration' },
  { file: '02-dark-1440x900-configuration.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'configuration' },
  { file: '03-light-1440x900-action-groups.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'action-groups' },
  { file: '04-dark-1440x900-user-access.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'users' },
  { file: '05-light-1280x800-configuration-edit.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'edit' },
  { file: '06-light-1440x900-office-identity.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'office' },
  { file: '07-dark-1440x900-office-identity-logo.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'office-logo', withLogo: true },
  { file: '08-light-1440x900-diagnostic-ready.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'diagnostic' },
  { file: '09-dark-1440x900-diagnostic-attention.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'diagnostic', runtimeStatus: 'ATTENTION' },
  { file: '10-light-1280x800-backups.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'backups' },
  { file: '11-dark-1280x800-feedback.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'feedback' },
  { file: '12-light-390x844-configuration.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'configuration' },
  { file: '13-dark-390x844-office-sheet.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'office' },
  { file: '14-light-390x844-backups.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'backups' }
];

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;
try {
  for (const scenario of SCENARIOS) {
    const context = await session.createContext({ viewport: scenario.viewport });
    try {
      context.setDefaultNavigationTimeout(60_000);
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await prepareUiV2ConfigurationAdminFixture(page, {
        runtimeStatus: scenario.runtimeStatus || 'READY',
        withLogo: Boolean(scenario.withLogo)
      });

      let activeDialog = null;
      if (scenario.state === 'action-groups' || scenario.state === 'edit') {
        await page.locator('[data-config-section="actionGroups"]').evaluate(button => button.click());
      }
      if (scenario.state === 'users') {
        await page.locator('[data-config-section="users"]').evaluate(button => button.click());
        await page.locator('[data-auth-user-id="pending-user-synthetic"]').waitFor();
      } else if (scenario.state === 'edit') {
        activeDialog = '#modalBackdrop[data-modal-mode="configuration"] .modal';
        await page.locator('#configurationList .config-row-open').first().click();
      } else if (scenario.state === 'office' || scenario.state === 'office-logo') {
        activeDialog = '#officeSetupBackdrop .office-setup-modal';
        await page.locator('#openOfficeIdentityFromConfiguration').click();
      } else if (scenario.state === 'diagnostic') {
        await page.locator('[data-config-section="diagnostic"]').click();
        await page.locator('.diagnostic-v2-panel').waitFor();
      } else if (scenario.state === 'backups') {
        await page.locator('[data-config-section="backups"]').click();
        await page.locator('.backup-v2-panel').waitFor();
      } else if (scenario.state === 'feedback') {
        activeDialog = '#modalBackdrop[data-modal-mode="feedback"] .modal';
        await page.locator('[data-config-section="diagnostic"]').click();
        await page.locator('#btnOpenFeedbackModal').click();
        await page.locator('#field-type').selectOption('bug');
        await page.locator('#field-component').selectOption('Configurações');
        await page.locator('#field-message').fill('Relato sintético sem dados jurídicos ou pessoais.');
      }

      if (activeDialog) {
        await page.locator(activeDialog).waitFor();
        await page.waitForFunction(selector => document.querySelector(selector)?.contains(document.activeElement), activeDialog);
      }
      await page.waitForFunction(selector => {
        const root = selector ? document.querySelector(selector) : document.getElementById('view-configuration');
        return root && root.getAnimations({ subtree: true }).every(animation => animation.playState === 'finished');
      }, activeDialog);

      const layout = await page.evaluate(({ dialogSelector, mobile }) => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const dialog = dialogSelector ? document.querySelector(dialogSelector) : null;
        const root = dialog || document.getElementById('view-configuration');
        const dialogRect = dialog?.getBoundingClientRect();
        const interactive = [...root.querySelectorAll('button, input:not([type="hidden"]):not([type="file"]), select, textarea, label[for="inputRestoreBackup"]')]
          .filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
        return {
          active: document.getElementById('view-configuration').classList.contains('active'),
          ui: document.documentElement.dataset.ui,
          theme: document.documentElement.dataset.theme || 'dark',
          overflow: document.documentElement.scrollWidth - innerWidth,
          duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
          dialog: dialogRect ? {
            left: dialogRect.left,
            right: dialogRect.right,
            top: dialogRect.top,
            bottom: dialogRect.bottom,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            overflow: dialog.scrollWidth - dialog.clientWidth
          } : null,
          undersized: mobile ? interactive.filter(element => {
            const target = element.getBoundingClientRect();
            return target.width < 43.5 || target.height < 43.5;
          }).map(element => element.id || element.textContent.trim()) : []
        };
      }, { dialogSelector: activeDialog, mobile: scenario.viewport.width <= 560 });

      assert.equal(layout.active, true); assertions++;
      assert.equal(layout.ui, 'v2'); assertions++;
      assert.equal(layout.theme, scenario.theme); assertions++;
      assert.ok(layout.overflow <= 2, `${scenario.file}: overflow global ${layout.overflow}px.`); assertions++;
      assert.deepEqual(layout.duplicates, []); assertions++;
      assert.deepEqual(layout.undersized, [], `${scenario.file}: alvos menores que 44px.`); assertions++;
      assert.deepEqual(pageErrors, []); assertions++;
      if (layout.dialog) {
        assert.ok(layout.dialog.left >= -2 && layout.dialog.right <= layout.dialog.viewportWidth + 2); assertions++;
        assert.ok(layout.dialog.top >= -2 && layout.dialog.bottom <= layout.dialog.viewportHeight + 2); assertions++;
        assert.ok(layout.dialog.overflow <= 2); assertions++;
      }

      const output = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: output, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
    } finally {
      await context.close();
    }
  }
  assert.equal(hashes.size, SCENARIOS.length, 'Todos os estados visuais de Configuração/Admin devem ser distintos.');
  console.log('======================================================');
  console.log('✓ UI V2 CONFIGURATION + ADMIN VISUAL QA CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
