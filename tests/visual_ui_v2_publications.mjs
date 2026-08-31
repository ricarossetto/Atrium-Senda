import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, prepareUiV2PublicationsFixture, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-publications');
const SCENARIOS = [
  { file: '01-light-1440-list.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'list' },
  { file: '02-dark-1440-list.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'list' },
  { file: '03-light-1440-inspector.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'inspector' },
  { file: '04-dark-1440-inspector.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'inspector' },
  { file: '05-light-1280-untreated.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'untreated' },
  { file: '06-dark-1280-treated.png', theme: 'dark', viewport: { width: 1280, height: 800 }, state: 'treated' },
  { file: '07-light-390-list.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'list' },
  { file: '08-dark-390-inspector.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'inspector' }
];

fs.mkdirSync(OUTPUT, { recursive: true });
const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;

try {
  for (const scenario of SCENARIOS) {
    const context = await session.createContext({ viewport: scenario.viewport });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await prepareUiV2PublicationsFixture(page);

      if (scenario.state === 'untreated' || scenario.state === 'treated') {
        await page.locator(`#inboxFilters [data-filter="${scenario.state}"]`).click();
        await page.waitForFunction(filter => document.querySelector(`#inboxFilters [data-filter="${filter}"]`)?.getAttribute('aria-pressed') === 'true', scenario.state);
      } else if (scenario.state === 'inspector') {
        await page.locator('[data-intimation-id="ui-v2-publication-review"]').click();
        await page.locator('#view-inbox.publication-detail-open').waitFor();
        await page.waitForFunction(() => document.activeElement?.id === 'publicationDetailClose');
      }

      await page.waitForFunction(() => [...document.querySelectorAll('#view-inbox, #intimationDetail')]
        .flatMap(element => element.getAnimations({ subtree: true }))
        .every(animation => animation.playState === 'finished'));

      const layout = await page.evaluate(state => {
        const view = document.getElementById('view-inbox');
        const queue = document.querySelector('.inbox-list-card').getBoundingClientRect();
        const workspace = document.querySelector('.inbox-layout').getBoundingClientRect();
        const detail = document.getElementById('intimationDetail');
        const rect = detail.getBoundingClientRect();
        const detailStyle = getComputedStyle(detail);
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        return {
          active: view.classList.contains('active'),
          filter: [...document.querySelectorAll('#inboxFilters [data-filter]')].find(button => button.getAttribute('aria-pressed') === 'true')?.dataset.filter,
          recordCount: document.querySelectorAll('#inboxList [data-intimation-id]').length,
          queueRatio: queue.width / workspace.width,
          open: view.classList.contains('publication-detail-open'),
          detailVisible: detailStyle.visibility !== 'hidden'
            && detailStyle.display !== 'none'
            && Number(detailStyle.opacity) > 0,
          detailBounds: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight },
          overflow: document.documentElement.scrollWidth - innerWidth,
          duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
          hasCanonicalDetail: detail.textContent.includes('Conteúdo sintético integral da decisão em análise.') && detail.textContent.includes('Advogada Revisora Sintética'),
          state
        };
      }, scenario.state);
      assert.equal(layout.active, true); assertions++;
      assert.ok(layout.queueRatio >= .98); assertions++;
      assert.ok(layout.overflow <= 2); assertions++;
      assert.deepEqual(layout.duplicates, []); assertions++;
      if (scenario.state === 'list') {
        assert.equal(layout.filter, 'all'); assertions++;
        assert.equal(layout.recordCount, 4); assertions++;
        assert.equal(layout.open, false); assertions++;
        assert.equal(layout.detailVisible, false); assertions++;
      } else if (scenario.state === 'inspector') {
        assert.equal(layout.open, true); assertions++;
        assert.equal(layout.detailVisible, true); assertions++;
        assert.equal(layout.hasCanonicalDetail, true); assertions++;
        assert.ok(layout.detailBounds.left >= -2 && layout.detailBounds.right <= layout.detailBounds.width + 2); assertions++;
        assert.ok(layout.detailBounds.top >= -2 && layout.detailBounds.bottom <= layout.detailBounds.height + 2); assertions++;
      } else {
        assert.equal(layout.filter, scenario.state); assertions++;
        assert.ok(layout.recordCount >= 1); assertions++;
        assert.equal(layout.open, false); assertions++;
      }
      assert.deepEqual(pageErrors, []); assertions++;

      const output = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: output, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
    } finally {
      await context.close();
    }
  }

  assert.equal(hashes.size, SCENARIOS.length);
  console.log('======================================================');
  console.log('✓ UI V2 PUBLICAÇÕES VISUAL QA CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
