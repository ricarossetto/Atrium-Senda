import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectUiV2LayoutEvidence,
  prepareUiV2Page,
  startUiV2Session,
  switchUiV2View,
  UI_V2_CANONICAL_VIEWS
} from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-final-rollout');
fs.mkdirSync(OUTPUT, { recursive: true });

const MATRICES = [
  {
    name: 'desktop-light', theme: 'light', viewport: { width: 1440, height: 900 },
    shots: [
      ['01-desktop-light-dashboard.png', 'dashboard'],
      ['02-desktop-light-processes.png', 'processes'],
      ['03-desktop-light-kanban.png', 'kanban'],
      ['04-desktop-light-contacts.png', 'contacts'],
      ['05-desktop-light-integrations.png', 'integrations'],
      ['06-desktop-light-importer.png', 'importer'],
      ['07-desktop-light-links.png', 'links']
    ]
  },
  {
    name: 'desktop-dark', theme: 'dark', viewport: { width: 1440, height: 900 },
    shots: [
      ['08-desktop-dark-dashboard.png', 'dashboard'],
      ['09-desktop-dark-publications.png', 'inbox'],
      ['10-desktop-dark-agenda.png', 'agenda'],
      ['11-desktop-dark-financial.png', 'financial'],
      ['12-desktop-dark-configuration.png', 'configuration'],
      ['13-desktop-dark-audit.png', 'audit']
    ]
  },
  {
    name: 'mobile-light', theme: 'light', viewport: { width: 390, height: 844 },
    shots: [
      ['14-mobile-light-navigation.png', 'dashboard', 'menu'],
      ['15-mobile-light-processes.png', 'processes']
    ]
  },
  {
    name: 'mobile-dark-320', theme: 'dark', viewport: { width: 320, height: 700 }, shots: []
  },
  {
    name: 'reflow-light', theme: 'light', viewport: { width: 640, height: 800 }, shots: []
  },
  {
    name: 'reflow-dark', theme: 'dark', viewport: { width: 640, height: 800 },
    shots: [['16-reflow-dark-configuration.png', 'configuration']]
  }
];

async function waitForStableView(page, view) {
  await page.waitForFunction(selectedView => new Promise(resolve => {
    let previous = '';
    let stableFrames = 0;
    const inspect = () => {
      const target = document.getElementById(`view-${selectedView}`);
      const rect = target?.getBoundingClientRect();
      const current = rect ? [rect.x, rect.y, rect.width, rect.height, scrollX, scrollY].map(value => Math.round(value * 10) / 10).join('|') : '';
      const settled = target?.getAnimations({ subtree: true }).every(animation => animation.playState === 'finished');
      stableFrames = current && current === previous && settled ? stableFrames + 1 : 0;
      previous = current;
      if (stableFrames >= 4) resolve(true);
      else requestAnimationFrame(inspect);
    };
    requestAnimationFrame(inspect);
  }), view);
}

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 FINAL ROLLOUT VISUAL QA');
console.log('===============================================================\n');

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;
try {
  for (const matrix of MATRICES) {
    const context = await session.createContext({ viewport: matrix.viewport, reducedMotion: 'reduce' });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: matrix.theme });
      for (const view of UI_V2_CANONICAL_VIEWS) {
        await switchUiV2View(page, view);
        const evidence = await collectUiV2LayoutEvidence(page);
        const active = page.locator(`#view-${view}`);
        const box = await active.boundingBox();
        assert.ok(box && box.width > 0 && box.height > 0, `${matrix.name}/${view}: view deve ser visível.`); assertions++;
        assert.equal(evidence.activeViews.length, 1, `${matrix.name}/${view}: uma view ativa.`); assertions++;
        assert.equal(evidence.navItems, 17, `${matrix.name}/${view}: navegação canônica.`); assertions++;
        assert.ok(evidence.globalOverflow <= 2, `${matrix.name}/${view}: overflow global ${evidence.globalOverflow}px.`); assertions++;
        assert.deepEqual(evidence.duplicateIds, [], `${matrix.name}/${view}: IDs duplicados.`); assertions++;
        assert.deepEqual(evidence.visibleOverlays, [], `${matrix.name}/${view}: overlay residual.`); assertions++;
      }

      for (const [filename, view, state] of matrix.shots) {
        await switchUiV2View(page, view);
        if (state === 'menu') {
          await page.locator('#menuToggle').click();
          await page.locator('#sidebar.open').waitFor();
        }
        await waitForStableView(page, view);
        const output = path.join(OUTPUT, filename);
        await page.screenshot({ path: output, fullPage: false });
        hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
        if (state === 'menu') {
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => !document.getElementById('sidebar')?.classList.contains('open'));
        }
      }
      assert.deepEqual(pageErrors, [], `${matrix.name}: page errors: ${pageErrors.join(' | ')}`); assertions++;
    } finally {
      await context.close();
    }
  }
} finally {
  await session.stop();
}

assert.equal(hashes.size, 16, 'As 16 capturas finais devem produzir 16 hashes distintos.'); assertions++;
console.log(`✓ Final rollout: 17/17 views em 6 matrizes, 16 screenshots, ${hashes.size}/16 hashes e ${assertions}/${assertions} assertions.`);
