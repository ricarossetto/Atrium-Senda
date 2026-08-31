import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2MonitoringFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-monitoring');
fs.mkdirSync(OUTPUT, { recursive: true });

const SCENARIOS = [
  { file: '01-light-1440x900-monitoring.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'workspace' },
  { file: '02-dark-1440x900-monitoring.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'workspace' },
  { file: '03-light-1280x800-mixed-health.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'workspace' },
  { file: '04-dark-1280x800-no-last-check.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'no-check' },
  { file: '05-light-1440x900-primary-term-drawer.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'term' },
  { file: '06-dark-1280x800-document-term-drawer.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'document-term' },
  { file: '07-light-1280x800-source-drawer.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'source' },
  { file: '08-dark-1280x800-datajud-drawer.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'datajud' },
  { file: '09-light-390x844-mobile-monitoring.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'workspace' },
  { file: '10-dark-390x844-mobile-monitoring.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'workspace' },
  { file: '11-light-390x844-mobile-sources.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'source-list' },
  { file: '12-dark-390x844-mobile-config-sheet.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'source' }
];

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;
try {
  for (const scenario of SCENARIOS) {
    const context = await session.createContext({ viewport: scenario.viewport });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await prepareUiV2MonitoringFixture(page);

      if (scenario.state === 'no-check') {
        await page.evaluate(() => {
          const { App, Store } = window.Atrium;
          Store.state.sources.forEach(source => { source.lastCheck = null; });
          App.renderMonitoring();
        });
      }
      if (scenario.state === 'term') await page.locator('#primaryTermCard').click();
      if (scenario.state === 'document-term') {
        await page.locator('#newTermButton').click();
        await page.locator('#field-type').selectOption('document');
      }
      if (scenario.state === 'source') await page.locator('[data-source-id="generic-source"]').click();
      if (scenario.state === 'datajud') await page.locator('[data-source-id="datajud-cnj"]').click();
      if (scenario.state === 'source-list') await page.locator('.source-table').scrollIntoViewIfNeeded();
      if (['term', 'document-term', 'source', 'datajud'].includes(scenario.state)) {
        await page.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
      }

      await page.waitForFunction(() => [...document.querySelectorAll('#view-monitoring, #modalBackdrop')]
        .flatMap(element => element.getAnimations({ subtree: true })).every(animation => animation.playState === 'finished'));

      const layout = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const sheet = document.querySelector('#modalBackdrop:not(.hidden) .modal');
        const sheetRect = sheet?.getBoundingClientRect();
        const rows = [...document.querySelectorAll('#monitorSourceList .monitor-v2-source-row')];
        const interactive = [...document.querySelectorAll('#view-monitoring button, #view-monitoring [role="button"], #modalBackdrop:not(.hidden) button')]
          .filter(element => element.getClientRects().length);
        return {
          active: document.getElementById('view-monitoring').classList.contains('active'),
          ui: document.documentElement.dataset.ui,
          overflow: document.documentElement.scrollWidth - innerWidth,
          duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
          rowOverflow: rows.filter(row => row.scrollWidth - row.clientWidth > 2).length,
          sourceRows: rows.length,
          sheet: sheetRect ? {
            left: sheetRect.left, right: sheetRect.right, top: sheetRect.top, bottom: sheetRect.bottom,
            width: innerWidth, height: innerHeight, overflow: sheet.scrollWidth - sheet.clientWidth
          } : null,
          undersized: innerWidth <= 560 ? interactive.filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.width < 43.5 || rect.height < 43.5;
          }).map(element => element.getAttribute('aria-label') || element.textContent.trim()) : []
        };
      });
      assert.equal(layout.active, true); assertions++;
      assert.equal(layout.ui, 'v2'); assertions++;
      assert.ok(layout.overflow <= 2, `${scenario.file}: overflow global ${layout.overflow}px.`); assertions++;
      assert.equal(layout.rowOverflow, 0, `${scenario.file}: source row com overflow horizontal.`); assertions++;
      assert.equal(layout.sourceRows, 5); assertions++;
      assert.deepEqual(layout.duplicates, []); assertions++;
      assert.deepEqual(layout.undersized, []); assertions++;
      assert.deepEqual(pageErrors, []); assertions++;
      if (layout.sheet) {
        assert.ok(layout.sheet.left >= -2 && layout.sheet.right <= layout.sheet.width + 2, `${scenario.file}: sheet horizontal.`); assertions++;
        assert.ok(layout.sheet.top >= -2 && layout.sheet.bottom <= layout.sheet.height + 2, `${scenario.file}: sheet vertical.`); assertions++;
        assert.ok(layout.sheet.overflow <= 2, `${scenario.file}: sheet com overflow horizontal.`); assertions++;
      }

      const output = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: output, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
    } finally {
      await context.close();
    }
  }

  assert.equal(hashes.size, SCENARIOS.length, 'Os doze estados visuais de Monitoring devem produzir hashes distintos.');
  console.log('======================================================');
  console.log('✓ UI V2 MONITORING VISUAL QA CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
