import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-dashboard');
const CONFIGS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '390x844', width: 390, height: 844 }
];

fs.mkdirSync(OUTPUT, { recursive: true });
const session = await startUiV2Session();
const hashes = new Set();
let screenshots = 0;
let assertions = 0;

try {
  for (const theme of ['light', 'dark']) {
    for (const config of CONFIGS) {
      const context = await session.createContext({ viewport: { width: config.width, height: config.height } });
      try {
        const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
        await page.waitForTimeout(180);
        const layout = await page.evaluate(() => {
          const opening = document.getElementById('v2DashboardOpening')?.getBoundingClientRect();
          const topbar = document.querySelector('.topbar')?.getBoundingClientRect();
          const search = document.querySelector('.global-search')?.getBoundingClientRect();
          const status = document.getElementById('systemStatusBar')?.getBoundingClientRect();
          const cards = [...document.querySelectorAll('#view-dashboard :is(.v2-attention-item, .metric-card, .dashboard-widget)')];
          return {
            ui: document.documentElement.dataset.ui,
            theme: document.documentElement.getAttribute('data-theme') || 'dark',
            activeDashboard: document.getElementById('view-dashboard')?.classList.contains('active'),
            pageOverflow: document.documentElement.scrollWidth - innerWidth,
            opening: opening && { left: opening.left, right: opening.right, top: opening.top, width: opening.width },
            topbarHeight: topbar?.height || 0,
            searchVisible: Boolean(search && search.width > 0 && search.height >= 40),
            statusVisible: Boolean(status && status.width > 0 && status.height > 0),
            clippedCards: cards.filter(card => card.scrollWidth > card.clientWidth + 2).length,
            duplicateIds: (() => {
              const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
              return ids.filter((id, index) => ids.indexOf(id) !== index);
            })(),
            unexpectedOverlay: [...document.querySelectorAll('.modal-backdrop:not(.hidden), #guidedTourBackdrop:not(.hidden)')].length
          };
        });

        assert.equal(layout.ui, 'v2'); assertions++;
        assert.equal(layout.theme, theme); assertions++;
        assert.equal(layout.activeDashboard, true); assertions++;
        assert.ok(layout.pageOverflow <= 2, `Overflow global em ${theme} ${config.name}: ${layout.pageOverflow}px.`); assertions++;
        assert.ok(layout.opening && layout.opening.left >= -2 && layout.opening.right <= config.width + 2, `Hero fora do viewport em ${theme} ${config.name}.`); assertions++;
        assert.ok(layout.topbarHeight <= (config.width <= 390 ? 175 : 92), `Topbar excessiva em ${theme} ${config.name}: ${layout.topbarHeight}px.`); assertions++;
        assert.equal(layout.searchVisible, true, `Busca deve permanecer visível em ${theme} ${config.name}.`); assertions++;
        assert.equal(layout.statusVisible, true, `Status persistente deve estar visível em ${theme} ${config.name}.`); assertions++;
        assert.equal(layout.clippedCards, 0, `Cards com conteúdo cortado em ${theme} ${config.name}.`); assertions++;
        assert.deepEqual(layout.duplicateIds, []); assertions++;
        assert.equal(layout.unexpectedOverlay, 0); assertions++;
        assert.deepEqual(pageErrors, [], `Pageerror em ${theme} ${config.name}: ${pageErrors.join(' | ')}`); assertions++;

        const file = path.join(OUTPUT, `${theme}-${config.name}.png`);
        await page.screenshot({ path: file, fullPage: false });
        const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
        assert.equal(hashes.has(hash), false, `Screenshot V2 duplicado em ${theme} ${config.name}.`);
        hashes.add(hash);
        screenshots++;
      } finally {
        await context.close();
      }
    }
  }

  console.log('======================================================');
  console.log('✓ UI V2 DASHBOARD VISUAL QA CONCLUÍDO COM SUCESSO!');
  console.log(`- Screenshots V2: ${screenshots}`);
  console.log(`- Hashes V2 únicos: ${hashes.size}`);
  console.log(`- Asserções V2: ${assertions}/${assertions}`);
  console.log(`- Artefatos V2: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
