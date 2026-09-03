import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, prepareUiV2PromptsFixture, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-prompts');
fs.mkdirSync(OUTPUT, { recursive: true });

const SCENARIOS = [
  { file: '00-light-1920x1080-four-columns.png', theme: 'light', viewport: { width: 1920, height: 1080 }, state: 'all' },
  { file: '01-light-1440x900-library.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'all' },
  { file: '02-dark-1440x900-library.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'all' },
  { file: '03-light-1440x900-search.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'search' },
  { file: '04-dark-1440x900-category.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'category' },
  { file: '05-light-1280x800-type.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'type' },
  { file: '06-dark-1280x800-custom-default.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'all' },
  { file: '07-light-1024x768-long-prompt.png', theme: 'light', viewport: { width: 1024, height: 768 }, state: 'long' },
  { file: '08-dark-1024x768-empty.png', theme: 'dark', viewport: { width: 1024, height: 768 }, state: 'empty' },
  { file: '09-light-1440x900-new-drawer.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'new' },
  { file: '10-dark-1280x800-edit-drawer.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'edit' },
  { file: '11-light-390x844-mobile-library.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'all' },
  { file: '12-dark-390x844-mobile-sheet.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'edit' }
];

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;
try {
  for (const scenario of SCENARIOS) {
    const context = await session.createContext({ viewport: scenario.viewport });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await prepareUiV2PromptsFixture(page);

      if (scenario.state === 'search') await page.locator('#promptsSearchInput').fill('Previdenciário');
      if (scenario.state === 'category') await page.locator('#promptCategorySelect').selectOption('Cível');
      if (scenario.state === 'type') await page.locator('#promptTypeSelect').selectOption('Pesquisa');
      if (scenario.state === 'long') await page.locator('[data-prompt-id="prompt-v2-long"]').scrollIntoViewIfNeeded();
      if (scenario.state === 'empty') await page.locator('#promptsSearchInput').fill('resultado visual inexistente');
      if (scenario.state === 'new') await page.locator('#btnNewPrompt').click();
      if (scenario.state === 'edit') await page.locator('[data-edit-prompt="prompt-v2-custom"]').click();
      if (['new', 'edit'].includes(scenario.state)) {
        await page.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
      }

      await page.waitForFunction(() => [...document.querySelectorAll('#view-prompts, #modalBackdrop')]
        .flatMap(element => element.getAnimations({ subtree: true })).every(animation => animation.playState === 'finished'));

      const layout = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const sheet = document.querySelector('#modalBackdrop:not(.hidden) .modal');
        const sheetRect = sheet?.getBoundingClientRect();
        const cards = [...document.querySelectorAll('#promptsGrid .prompt-library-card')];
        const visibleButtons = [...document.querySelectorAll('#view-prompts button, #modalBackdrop:not(.hidden) button')]
          .filter(button => button.getClientRects().length);
        return {
          active: document.getElementById('view-prompts').classList.contains('active'),
          ui: document.documentElement.dataset.ui,
          overflow: document.documentElement.scrollWidth - innerWidth,
          duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
          cardOverflow: cards.filter(card => card.scrollWidth - card.clientWidth > 2).length,
          cardColumns: new Set(cards.slice(0, 8).map(card => Math.round(card.getBoundingClientRect().left))).size,
          actionButtonMaxHeight: Math.max(0, ...cards.flatMap(card => [...card.querySelectorAll('.prompt-card-actions .button')]).map(button => button.getBoundingClientRect().height)),
          sheet: sheetRect ? {
            left: sheetRect.left,
            right: sheetRect.right,
            top: sheetRect.top,
            bottom: sheetRect.bottom,
            width: innerWidth,
            height: innerHeight,
            overflow: sheet.scrollWidth - sheet.clientWidth
          } : null,
          undersized: innerWidth <= 560 ? visibleButtons.filter(button => {
            const rect = button.getBoundingClientRect();
            return rect.width < 43.5 || rect.height < 43.5;
          }).map(button => button.getAttribute('aria-label') || button.textContent.trim()) : []
        };
      });
      assert.equal(layout.active, true); assertions++;
      assert.equal(layout.ui, 'v2'); assertions++;
      assert.ok(layout.overflow <= 2, `${scenario.file}: overflow global ${layout.overflow}px.`); assertions++;
      assert.equal(layout.cardOverflow, 0, `${scenario.file}: card com overflow horizontal.`); assertions++;
      assert.deepEqual(layout.duplicates, []); assertions++;
      assert.deepEqual(layout.undersized, []); assertions++;
      assert.deepEqual(pageErrors, []); assertions++;
      if (scenario.viewport.width >= 1600 && scenario.state === 'all') {
        assert.equal(layout.cardColumns, 4, `${scenario.file}: a biblioteca deve exibir quatro prompts por linha.`); assertions++;
        assert.ok(layout.actionButtonMaxHeight <= 33, `${scenario.file}: botões de ação estão altos demais (${layout.actionButtonMaxHeight}px).`); assertions++;
      }
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

  assert.equal(hashes.size, SCENARIOS.length, 'Todos os estados visuais devem produzir hashes distintos.');
  console.log('======================================================');
  console.log('✓ UI V2 PROMPTS VISUAL QA CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
