import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2FinancialFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-financial');
fs.mkdirSync(OUTPUT, { recursive: true });

const SCENARIOS = [
  { file: '01-light-1440x900-all.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'all' },
  { file: '02-dark-1440x900-all.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'all' },
  { file: '03-light-1440x900-rpv.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'rpv' },
  { file: '04-dark-1440x900-fees.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'fees' },
  { file: '05-light-1280x800-status-mix.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'status' },
  { file: '06-dark-1024x768-empty-search.png', theme: 'dark', viewport: { width: 1024, height: 768 }, state: 'empty' },
  { file: '07-light-1440x900-entry-drawer.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'drawer' },
  { file: '08-dark-1440x900-preview.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'preview' },
  { file: '09-light-390x844-mobile-list.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'all' },
  { file: '10-dark-390x844-mobile-list.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'fees' },
  { file: '11-light-390x844-mobile-entry-sheet.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'preview' }
];

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;
try {
  for (const scenario of SCENARIOS) {
    const context = await session.createContext({ viewport: scenario.viewport });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await prepareUiV2FinancialFixture(page);

      if (scenario.state === 'rpv') await page.locator('[data-fin-filter="rpv"]').click();
      if (scenario.state === 'fees') await page.locator('[data-fin-filter="honorarios"]').click();
      if (scenario.state === 'status') await page.locator('#financialSearch').fill('Sintétic');
      if (scenario.state === 'empty') await page.locator('#financialSearch').fill('nenhuma operação financeira correspondente');
      if (scenario.state === 'drawer' || scenario.state === 'preview') {
        await page.locator('#newFinancialEntryButton').click();
        await page.waitForFunction(() => document.querySelector('#financialEntryBackdrop .financial-entry-modal')?.contains(document.activeElement));
      }
      if (scenario.state === 'preview') {
        await page.locator('#finProcessSelect').selectOption('fin-target-exito');
        await page.locator('#finTypeSelect').selectOption('exito');
        await page.locator('#finGrossInput').fill('12500');
        await page.locator('#finFeePctInput').fill('25');
      }
      await page.waitForTimeout(280);

      const layout = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const workspace = document.getElementById('financialV2Workspace');
        const workspaceRect = workspace?.getBoundingClientRect();
        const drawer = document.querySelector('#financialEntryBackdrop:not(.hidden) .financial-entry-modal');
        const drawerRect = drawer?.getBoundingClientRect();
        const buttons = [...document.querySelectorAll('#view-financial button, #financialEntryBackdrop:not(.hidden) button')].filter(button => button.getClientRects().length);
        const tableVisible = Boolean(document.querySelector('.financial-v2-table')?.getClientRects().length);
        const listVisible = Boolean(document.querySelector('.financial-v2-record-list')?.getClientRects().length);
        return {
          active: document.getElementById('view-financial').classList.contains('active'),
          ui: document.documentElement.dataset.ui,
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
          duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
          content: document.querySelectorAll('.financial-v2-table [data-financial-record]').length || document.querySelectorAll('.financial-v2-record').length || document.querySelectorAll('.financial-v2-empty').length,
          empty: Boolean(document.querySelector('.financial-v2-empty')),
          visibleRepresentations: Number(tableVisible) + Number(listVisible),
          workspace: workspaceRect ? { left: workspaceRect.left, right: workspaceRect.right, width: innerWidth } : null,
          drawer: drawerRect ? { left: drawerRect.left, right: drawerRect.right, top: drawerRect.top, bottom: drawerRect.bottom, width: innerWidth, height: innerHeight, overflow: drawer.scrollWidth - drawer.clientWidth } : null,
          undersized: innerWidth <= 760 ? buttons.filter(button => {
            const rect = button.getBoundingClientRect();
            return rect.width < 43.5 || rect.height < 43.5;
          }).map(button => button.getAttribute('aria-label') || button.textContent.trim()) : []
        };
      });

      assert.equal(layout.active, true); assertions++;
      assert.equal(layout.ui, 'v2'); assertions++;
      assert.ok(layout.pageOverflow <= 2, `${scenario.file}: overflow global ${layout.pageOverflow}px.`); assertions++;
      assert.deepEqual(layout.duplicateIds, []); assertions++;
      assert.ok(layout.content > 0, `${scenario.file}: superfície sem conteúdo.`); assertions++;
      assert.equal(layout.visibleRepresentations, layout.empty ? 0 : 1, `${scenario.file}: representação visual ativa inconsistente.`); assertions++;
      assert.ok(layout.workspace && layout.workspace.left >= -2 && layout.workspace.right <= layout.workspace.width + 2, `${scenario.file}: workspace fora do viewport.`); assertions++;
      assert.deepEqual(layout.undersized, [], `${scenario.file}: targets mobile abaixo de 44px.`); assertions++;
      assert.deepEqual(pageErrors, []); assertions++;
      if (layout.drawer) {
        assert.ok(layout.drawer.left >= -2 && layout.drawer.right <= layout.drawer.width + 2, `${scenario.file}: drawer horizontal.`); assertions++;
        assert.ok(layout.drawer.top >= -2 && layout.drawer.bottom <= layout.drawer.height + 2, `${scenario.file}: drawer vertical.`); assertions++;
        assert.ok(layout.drawer.overflow <= 2, `${scenario.file}: drawer com overflow horizontal.`); assertions++;
      }

      const output = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: output, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
    } finally {
      await context.close();
    }
  }

  assert.equal(hashes.size, SCENARIOS.length, 'Os 11 estados visuais devem produzir hashes distintos.');
  console.log('======================================================');
  console.log('✓ UI V2 FINANCIAL VISUAL QA CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
