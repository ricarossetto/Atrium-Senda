import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareUiV2EmailCalendarFixture,
  prepareUiV2Page,
  startUiV2Session,
  UI_V2_EMAIL_STATUS
} from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-email-calendar-integrations');
fs.mkdirSync(OUTPUT, { recursive: true });

const SCENARIOS = [
  { file: '01-light-1440x900-integrations-hub.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'hub' },
  { file: '02-dark-1440x900-integrations-hub.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'hub' },
  { file: '03-dark-1440x900-smtp-unconfigured.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'unconfigured' },
  { file: '04-light-1440x900-smtp-error.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'status-error' },
  { file: '05-light-1280x800-smtp-configuration.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'smtp-config' },
  { file: '06-dark-1280x800-smtp-test.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'smtp-test' },
  { file: '07-light-1280x800-receivers.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'receivers' },
  { file: '08-dark-1280x800-new-external-receiver.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'receiver-new' },
  { file: '09-light-1280x800-external-calendar.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'calendar' },
  { file: '10-dark-1280x800-calendar-status-error.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'calendar-error' },
  { file: '11-light-390x844-smtp-sheet.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'smtp-config' },
  { file: '12-dark-390x844-calendar-sheet.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'calendar' }
];

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;
try {
  for (const scenario of SCENARIOS) {
    const context = await session.createContext({ viewport: scenario.viewport });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await prepareUiV2EmailCalendarFixture(page, {
        emailStatus: scenario.state === 'unconfigured' ? { configured: false } : UI_V2_EMAIL_STATUS,
        statusFailure: scenario.state === 'status-error'
      });

      let activeBackdrop = null;
      if (scenario.state === 'smtp-config') {
        activeBackdrop = 'emailConfigBackdrop';
        await page.locator('#btnConfigureEmail').click();
      } else if (scenario.state === 'smtp-test') {
        activeBackdrop = 'emailTestBackdrop';
        await page.locator('#btnTestEmail').click();
      } else if (scenario.state === 'receiver-new') {
        activeBackdrop = 'emailReceiverModalBackdrop';
        await page.locator('#btnAddEmailReceiver').click();
        await page.locator('#receiverTypeExternal').check();
        await page.locator('#receiverNameInput').fill('Secretaria Externa Sintética');
        await page.locator('#receiverEmailInput').fill('secretaria@synthetic.example.test');
      } else if (scenario.state === 'calendar' || scenario.state === 'calendar-error') {
        activeBackdrop = 'calendarConfigBackdrop';
        await page.locator('#configureCalendarButton').click();
        if (scenario.state === 'calendar-error') {
          await page.evaluate(() => {
            const status = document.getElementById('calendarConfigStatus');
            status.className = 'calendar-sync-status error';
            status.textContent = 'A agenda respondeu com ressalvas. Revise a URL e tente novamente.';
          });
        }
      }

      if (['unconfigured', 'status-error', 'receivers'].includes(scenario.state)) {
        await page.evaluate(() => {
          document.getElementById('view-integrations').style.paddingBottom = '70vh';
          document.querySelector('.email-integration-card')
            ?.scrollIntoView({ block: 'center', inline: 'nearest' });
        });
        await page.waitForFunction(() => {
          const rect = document.querySelector('.email-integration-card')?.getBoundingClientRect();
          return rect && rect.top >= 40 && rect.bottom <= innerHeight - 40;
        });
      }

      if (activeBackdrop) {
        await page.locator(`#${activeBackdrop}:not(.hidden)`).waitFor();
        await page.waitForFunction(id => document.querySelector(`#${id} [role="dialog"]`)?.contains(document.activeElement), activeBackdrop);
      }
      await page.waitForFunction(backdropId => {
        const selectors = ['#view-integrations'];
        if (backdropId) selectors.push(`#${backdropId}`);
        return selectors.flatMap(selector => [...document.querySelectorAll(selector)])
          .flatMap(element => element.getAnimations({ subtree: true }))
          .every(animation => animation.playState === 'finished');
      }, activeBackdrop);

      const layout = await page.evaluate(backdropId => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const dialog = backdropId ? document.querySelector(`#${backdropId}:not(.hidden) [role="dialog"]`) : null;
        const rect = dialog?.getBoundingClientRect();
        const visibleRoot = dialog || document.getElementById('view-integrations');
        const interactive = [...visibleRoot.querySelectorAll('button, input:not([type="checkbox"]):not([type="radio"]), select')]
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
          }).map(element => element.id || element.textContent.trim()) : [],
          passwordVisible: document.getElementById('emailPasswordInput')?.value || ''
        };
      }, activeBackdrop);
      assert.equal(layout.active, true); assertions++;
      assert.equal(layout.ui, 'v2'); assertions++;
      assert.ok(layout.overflow <= 2, `${scenario.file}: overflow global ${layout.overflow}px.`); assertions++;
      assert.deepEqual(layout.duplicates, []); assertions++;
      assert.deepEqual(layout.undersized, []); assertions++;
      assert.equal(layout.passwordVisible, ''); assertions++;
      assert.deepEqual(pageErrors, []); assertions++;
      if (layout.dialog) {
        assert.ok(layout.dialog.left >= -2 && layout.dialog.right <= layout.dialog.width + 2); assertions++;
        assert.ok(layout.dialog.top >= -2 && layout.dialog.bottom <= layout.dialog.height + 2); assertions++;
        assert.ok(layout.dialog.overflow <= 2); assertions++;
      }

      const output = path.join(OUTPUT, scenario.file);
      if (['unconfigured', 'status-error', 'receivers'].includes(scenario.state)) {
        await page.locator('.email-integration-card').screenshot({ path: output });
      } else {
        await page.screenshot({ path: output, fullPage: false });
      }
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
    } finally {
      await context.close();
    }
  }
  assert.equal(hashes.size, SCENARIOS.length, 'Os doze estados de Email e Agenda devem gerar imagens distintas.');
  console.log('======================================================');
  console.log('✓ UI V2 EMAIL + CALENDAR VISUAL QA CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
