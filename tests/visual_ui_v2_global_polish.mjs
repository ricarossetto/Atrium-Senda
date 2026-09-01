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
const BASELINE = process.env.ATRIUM_G24_BASELINE === '1';
const OUTPUT = path.join(
  ROOT,
  'artifacts',
  'visual-qa',
  BASELINE ? 'ui-v2-global-polish-baseline' : 'ui-v2-global-polish'
);
fs.mkdirSync(OUTPUT, { recursive: true });

const SWEEP_MATRICES = Object.freeze([
  { name: 'desktop-light', theme: 'light', viewport: { width: 1440, height: 900 } },
  { name: 'desktop-dark', theme: 'dark', viewport: { width: 1440, height: 900 } },
  { name: 'mobile-light', theme: 'light', viewport: { width: 390, height: 844 } },
  { name: 'mobile-dark', theme: 'dark', viewport: { width: 390, height: 844 } },
  { name: 'compact-320', theme: 'light', viewport: { width: 320, height: 700 } },
  { name: 'reflow-640', theme: 'dark', viewport: { width: 640, height: 800 } }
]);

const MOBILE_SHOTS = Object.freeze([
  { file: '35-mobile-light-dashboard.png', view: 'dashboard', theme: 'light', viewport: { width: 390, height: 844 } },
  { file: '36-mobile-light-processes.png', view: 'processes', theme: 'light', viewport: { width: 390, height: 844 } },
  { file: '37-mobile-light-kanban.png', view: 'kanban', theme: 'light', viewport: { width: 390, height: 844 } },
  { file: '38-mobile-light-documents.png', view: 'documents', theme: 'light', viewport: { width: 390, height: 844 } },
  { file: '39-mobile-light-configuration.png', view: 'configuration', theme: 'light', viewport: { width: 390, height: 844 } },
  { file: '40-mobile-dark-publications.png', view: 'inbox', theme: 'dark', viewport: { width: 390, height: 844 } },
  { file: '41-mobile-dark-agenda.png', view: 'agenda', theme: 'dark', viewport: { width: 390, height: 844 } },
  { file: '42-mobile-dark-assistant.png', view: 'assistant', theme: 'dark', viewport: { width: 390, height: 844 } },
  { file: '43-compact-light-contacts.png', view: 'contacts', theme: 'light', viewport: { width: 320, height: 700 } },
  { file: '44-compact-dark-links.png', view: 'links', theme: 'dark', viewport: { width: 320, height: 700 } }
]);

async function waitForStableView(page, view) {
  await page.waitForFunction(selectedView => new Promise(resolve => {
    let previous = '';
    let stableFrames = 0;
    const inspect = () => {
      const target = document.getElementById(`view-${selectedView}`);
      const rect = target?.getBoundingClientRect();
      const current = rect
        ? [rect.x, rect.y, rect.width, rect.height, scrollX, scrollY]
            .map(value => Math.round(value * 10) / 10)
            .join('|')
        : '';
      const settled = target?.getAnimations({ subtree: true })
        .every(animation => animation.playState === 'finished');
      stableFrames = current && current === previous && settled ? stableFrames + 1 : 0;
      previous = current;
      if (stableFrames >= 4) resolve(true);
      else requestAnimationFrame(inspect);
    };
    requestAnimationFrame(inspect);
  }), view);
}

async function takeShot(page, filename, hashes) {
  const output = path.join(OUTPUT, filename);
  await page.screenshot({ path: output, fullPage: false });
  hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
}

console.log('\n===============================================================');
console.log(`  ATRIUM — UI V2 GLOBAL POLISH ${BASELINE ? 'BASELINE' : 'VISUAL QA'}`);
console.log('===============================================================\n');

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;
try {
  for (const matrix of SWEEP_MATRICES) {
    const context = await session.createContext({ viewport: matrix.viewport, reducedMotion: 'reduce' });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: matrix.theme });
      for (const view of UI_V2_CANONICAL_VIEWS) {
        await switchUiV2View(page, view);
        await waitForStableView(page, view);
        const evidence = await collectUiV2LayoutEvidence(page);
        const box = await page.locator(`#view-${view}.active`).boundingBox();
        if (!BASELINE) {
          assert.ok(box && box.width > 0 && box.height > 0, `${matrix.name}/${view}: view visível.`); assertions++;
          assert.equal(evidence.activeViews.length, 1, `${matrix.name}/${view}: uma view ativa.`); assertions++;
          assert.ok(evidence.globalOverflow <= 2, `${matrix.name}/${view}: overflow global ${evidence.globalOverflow}px.`); assertions++;
          assert.deepEqual(evidence.duplicateIds, [], `${matrix.name}/${view}: IDs duplicados.`); assertions++;
          assert.deepEqual(evidence.visibleOverlays, [], `${matrix.name}/${view}: overlay residual.`); assertions++;
        }
      }

      if (matrix.name === 'desktop-light' || matrix.name === 'desktop-dark') {
        for (const [index, view] of UI_V2_CANONICAL_VIEWS.entries()) {
          await switchUiV2View(page, view);
          await waitForStableView(page, view);
          const prefix = matrix.name === 'desktop-light' ? index + 1 : index + 18;
          await takeShot(page, `${String(prefix).padStart(2, '0')}-${matrix.name}-${view}.png`, hashes);
        }
      }

      if (!BASELINE) {
        assert.deepEqual(pageErrors, [], `${matrix.name}: page errors: ${pageErrors.join(' | ')}`); assertions++;
      }
    } finally {
      await context.close();
    }
  }

  for (const shot of MOBILE_SHOTS) {
    const context = await session.createContext({ viewport: shot.viewport, reducedMotion: 'reduce' });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: shot.theme });
      await switchUiV2View(page, shot.view);
      await waitForStableView(page, shot.view);
      await takeShot(page, shot.file, hashes);
      if (!BASELINE) {
        assert.deepEqual(pageErrors, [], `${shot.file}: page errors: ${pageErrors.join(' | ')}`); assertions++;
      }
    } finally {
      await context.close();
    }
  }
} finally {
  await session.stop();
}

assert.equal(hashes.size, 44, 'As 44 capturas devem produzir 44 hashes distintos.'); assertions++;
console.log(`✓ Gate 24: 17/17 views em 6 matrizes, 44 screenshots, ${hashes.size}/44 hashes e ${assertions}/${assertions} asserções.`);
