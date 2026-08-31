import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-onboarding');
const SCENARIOS = [
  { file: '01-light-1440-welcome.png', theme: 'light', viewport: { width: 1440, height: 900 }, slide: 0 },
  { file: '02-dark-1440-relationships.png', theme: 'dark', viewport: { width: 1440, height: 900 }, slide: 3 },
  { file: '03-light-1280-integrations.png', theme: 'light', viewport: { width: 1280, height: 800 }, slide: 5 },
  { file: '04-dark-390-workflow.png', theme: 'dark', viewport: { width: 390, height: 844 }, slide: 2 }
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
      await page.evaluate(slide => {
        window.Atrium.App.openGuidedTour(true);
        window.Atrium.App.showTourSlide(slide);
      }, scenario.slide);
      await page.locator('#guidedTourBackdrop:not(.hidden)').waitFor();
      await page.locator(`.tour-slide.active[data-slide="${scenario.slide}"]`).waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('#guidedTourBackdrop *')]
        .flatMap(element => element.getAnimations())
        .every(animation => animation.effect?.getTiming().iterations === Infinity
          || animation.playState === 'finished'));

      const evidence = await page.evaluate(slide => {
        const backdrop = document.getElementById('guidedTourBackdrop');
        const dialog = backdrop.querySelector('[role="dialog"]');
        const dialogRect = dialog.getBoundingClientRect();
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const visibleControls = [...dialog.querySelectorAll('button')].filter(element => element.getClientRects().length);
        return {
          activeSlide: Number(backdrop.querySelector('.tour-slide.active')?.dataset.slide),
          title: dialog.getAttribute('aria-labelledby'),
          selectedDot: Number(backdrop.querySelector('.tour-dot[aria-selected="true"]')?.dataset.slideTarget),
          overflow: document.documentElement.scrollWidth - innerWidth,
          dialogBounds: {
            left: dialogRect.left,
            right: dialogRect.right,
            top: dialogRect.top,
            bottom: dialogRect.bottom,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight
          },
          undersized: innerWidth <= 520 ? visibleControls.filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.width < 43.5 || rect.height < 43.5;
          }).map(element => element.id || element.getAttribute('aria-label')) : [],
          duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
          slide
        };
      }, scenario.slide);

      assert.equal(evidence.activeSlide, scenario.slide); assertions++;
      assert.equal(evidence.selectedDot, scenario.slide); assertions++;
      assert.equal(evidence.title, 'tourModalTitle'); assertions++;
      assert.ok(evidence.overflow <= 2); assertions++;
      assert.ok(evidence.dialogBounds.left >= -2 && evidence.dialogBounds.right <= evidence.dialogBounds.viewportWidth + 2); assertions++;
      assert.ok(evidence.dialogBounds.top >= -2 && evidence.dialogBounds.bottom <= evidence.dialogBounds.viewportHeight + 2); assertions++;
      assert.deepEqual(evidence.undersized, []); assertions++;
      assert.deepEqual(evidence.duplicates, []); assertions++;
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
  console.log('✓ UI V2 ONBOARDING VISUAL QA CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
