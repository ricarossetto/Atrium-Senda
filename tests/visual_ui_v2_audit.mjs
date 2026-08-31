import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareUiV2AuditFixture,
  prepareUiV2Page,
  startUiV2Session
} from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-audit');
fs.mkdirSync(OUTPUT, { recursive: true });

const SCENARIOS = [
  { file: '01-light-1440x900-all.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'all', count: 6 },
  { file: '02-dark-1440x900-all.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'all', count: 6 },
  { file: '03-light-1440x900-security.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'security', count: 1 },
  { file: '04-dark-1440x900-synchronizations.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'sync', count: 2 },
  { file: '05-light-1440x900-tasks.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'task', count: 1 },
  { file: '06-dark-1440x900-processes.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'process', count: 1 },
  { file: '07-light-1280x800-search.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'search', query: 'Equipe de Dados', count: 1 },
  { file: '08-dark-1280x800-empty.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'empty', query: 'evento sem correspondência', count: 0 },
  { file: '09-light-1024x768-long-content.png', theme: 'light', viewport: { width: 1024, height: 768 }, state: 'long', query: 'responsável com nome extenso', count: 1 },
  { file: '10-dark-390x844-mobile.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'all', count: 6 }
];

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;
try {
  for (const scenario of SCENARIOS) {
    const context = await session.createContext({ viewport: scenario.viewport, reducedMotion: 'reduce' });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await prepareUiV2AuditFixture(page);
      if (['security', 'sync', 'task', 'process'].includes(scenario.state)) {
        await page.locator(`#auditFilters button[data-audit-filter="${scenario.state}"]`).click();
      }
      if (scenario.query) await page.locator('#auditSearch').fill(scenario.query);
      await page.waitForFunction(expected => {
        const count = document.querySelectorAll('#auditList tbody tr').length;
        const empty = Boolean(document.querySelector('#auditList .audit-empty-state'));
        return expected === 0 ? empty && count === 0 : count === expected;
      }, scenario.count);
      await page.waitForFunction(() => {
        const root = document.querySelector('#view-audit');
        return root && root.getAnimations({ subtree: true }).every(animation => animation.playState === 'finished');
      });
      if (['search', 'empty', 'long'].includes(scenario.state) || scenario.viewport.width <= 720) {
        await page.locator('.audit-layout').evaluate(element => element.scrollIntoView({ behavior: 'auto', block: 'start' }));
        await page.evaluate(() => new Promise(resolve => {
          let previousY = scrollY;
          let stableFrames = 0;
          const observe = () => {
            const ledger = document.querySelector('.audit-layout');
            const rect = ledger?.getBoundingClientRect();
            const stable = Math.abs(scrollY - previousY) < .5;
            const visible = Boolean(rect && rect.bottom > 0 && rect.top < innerHeight);
            const finished = ledger?.getAnimations({ subtree: true }).every(animation => animation.playState === 'finished');
            stableFrames = stable && visible && finished ? stableFrames + 1 : 0;
            previousY = scrollY;
            if (stableFrames >= 4) resolve(true);
            else requestAnimationFrame(observe);
          };
          requestAnimationFrame(observe);
        }));
      }

      const layout = await page.locator('#view-audit').evaluate((view, expected) => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const rows = [...view.querySelectorAll('.audit-ledger-table tbody tr')];
        const critical = [...view.querySelectorAll('#auditFilters button, #auditSearch, #btnExportAuditLog, #btnClearAuditLog')]
          .filter(element => element.getClientRects().length);
        return {
          active: view.classList.contains('active'),
          ui: document.documentElement.dataset.ui,
          theme: document.documentElement.dataset.theme || 'dark',
          count: rows.length,
          empty: Boolean(view.querySelector('.audit-empty-state')),
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
          viewOverflow: view.scrollWidth - view.clientWidth,
          duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
          rawElements: view.querySelectorAll('#auditList script, #auditList img').length,
          mobileRecordLayout: innerWidth > 720 || !rows.length || getComputedStyle(rows[0]).display === 'flex',
          undersized: innerWidth > 720 ? [] : critical.filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.width < 43.5 || rect.height < 43.5;
          }).map(element => element.id || element.textContent.trim()),
          expected
        };
      }, scenario.count);

      assert.equal(layout.active, true); assertions++;
      assert.equal(layout.ui, 'v2'); assertions++;
      assert.equal(layout.theme, scenario.theme); assertions++;
      assert.equal(layout.count, scenario.count); assertions++;
      assert.equal(layout.empty, scenario.count === 0); assertions++;
      assert.ok(layout.pageOverflow <= 2, `${scenario.file}: overflow global ${layout.pageOverflow}px.`); assertions++;
      assert.ok(layout.viewOverflow <= 2, `${scenario.file}: overflow da view ${layout.viewOverflow}px.`); assertions++;
      assert.deepEqual(layout.duplicates, []); assertions++;
      assert.equal(layout.rawElements, 0); assertions++;
      assert.equal(layout.mobileRecordLayout, true); assertions++;
      assert.deepEqual(layout.undersized, []); assertions++;
      assert.deepEqual(pageErrors, []); assertions++;

      const output = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: output, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
    } finally {
      await context.close();
    }
  }
  assert.equal(hashes.size, SCENARIOS.length, 'Todos os estados visuais da Auditoria devem ser distintos.');
  console.log('======================================================');
  console.log('✓ UI V2 AUDIT VISUAL QA CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
