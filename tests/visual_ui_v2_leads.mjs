import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2LeadsFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-leads');
fs.mkdirSync(OUTPUT, { recursive: true });

const SCENARIOS = [
  { file: '01-light-1440x900-list.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'list' },
  { file: '02-dark-1440x900-list.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'list' },
  { file: '03-light-1440x900-analysis-filter.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'analysis' },
  { file: '04-dark-1440x900-new-drawer.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'new' },
  { file: '05-light-1280x800-edit-drawer.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'edit' },
  { file: '06-dark-1024x768-long-data.png', theme: 'dark', viewport: { width: 1024, height: 768 }, state: 'long' },
  { file: '07-light-1024x768-empty-search.png', theme: 'light', viewport: { width: 1024, height: 768 }, state: 'empty' },
  { file: '08-light-390x844-mobile-list.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'list' },
  { file: '09-dark-390x844-mobile-list.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'list' },
  { file: '10-dark-390x844-mobile-drawer.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'edit' }
];

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;
try {
  for (const scenario of SCENARIOS) {
    const context = await session.createContext({ viewport: scenario.viewport });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await prepareUiV2LeadsFixture(page);

      if (scenario.state === 'analysis') await page.locator('[data-lead-filter="em_analise"]').click();
      if (scenario.state === 'new') await page.locator('#newLeadButton').click();
      if (scenario.state === 'edit') await page.locator('[data-lead-id="lead-v2-long"]').click();
      if (scenario.state === 'empty') await page.locator('#leadSearch').fill('busca sintética sem resultado visual');
      if (scenario.state === 'long') await page.locator('[data-lead-id="lead-v2-long"]').scrollIntoViewIfNeeded();

      if (['new', 'edit'].includes(scenario.state)) {
        await page.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
      }
      await page.waitForFunction(() => document.querySelector('#view-leads')?.getAnimations({ subtree: true }).every(animation => animation.playState === 'finished'));

      const layout = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const modal = document.querySelector('#modalBackdrop:not(.hidden) .modal');
        const modalRect = modal?.getBoundingClientRect();
        const visibleButtons = [...document.querySelectorAll('#view-leads button, #modalBackdrop:not(.hidden) button')].filter(button => button.getClientRects().length);
        const records = [...document.querySelectorAll('.lead-v2-record')];
        return {
          active: document.getElementById('view-leads').classList.contains('active'),
          ui: document.documentElement.dataset.ui,
          overflow: document.documentElement.scrollWidth - innerWidth,
          duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
          classicRows: document.querySelectorAll('#leadTableBody [data-lead-id]').length,
          recordOverflow: records.filter(record => record.scrollWidth - record.clientWidth > 2).length,
          modal: modalRect ? { left: modalRect.left, right: modalRect.right, top: modalRect.top, bottom: modalRect.bottom, width: innerWidth, height: innerHeight, overflow: modal.scrollWidth - modal.clientWidth } : null,
          undersized: innerWidth <= 760 ? visibleButtons.filter(button => {
            const rect = button.getBoundingClientRect();
            return rect.width < 43.5 || rect.height < 43.5;
          }).map(button => button.getAttribute('aria-label') || button.textContent.trim()) : []
        };
      });
      assert.equal(layout.active, true); assertions++;
      assert.equal(layout.ui, 'v2'); assertions++;
      assert.ok(layout.overflow <= 2, `${scenario.file}: overflow global ${layout.overflow}px.`); assertions++;
      assert.deepEqual(layout.duplicates, []); assertions++;
      assert.equal(layout.classicRows, 0); assertions++;
      assert.equal(layout.recordOverflow, 0); assertions++;
      assert.deepEqual(layout.undersized, []); assertions++;
      assert.deepEqual(pageErrors, []); assertions++;
      if (layout.modal) {
        assert.ok(layout.modal.left >= -2 && layout.modal.right <= layout.modal.width + 2, `${scenario.file}: drawer horizontal.`); assertions++;
        assert.ok(layout.modal.top >= -2 && layout.modal.bottom <= layout.modal.height + 2, `${scenario.file}: drawer vertical.`); assertions++;
        assert.ok(layout.modal.overflow <= 2, `${scenario.file}: drawer com overflow horizontal.`); assertions++;
      }

      const output = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: output, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
    } finally {
      await context.close();
    }
  }

  assert.equal(hashes.size, SCENARIOS.length, 'Os dez estados visuais devem produzir hashes distintos.');
  console.log('======================================================');
  console.log('✓ UI V2 LEADS VISUAL QA CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
