import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareUiV2LinksFixture,
  prepareUiV2Page,
  startUiV2Session,
  UI_V2_LINKS_FIXTURE
} from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-links');
fs.mkdirSync(OUTPUT, { recursive: true });

const SCENARIOS = [
  { file: '01-light-1440x900-resources.png', theme: 'light', viewport: { width: 1440, height: 900 }, links: [] },
  { file: '02-dark-1440x900-resources.png', theme: 'dark', viewport: { width: 1440, height: 900 }, links: [] },
  { file: '03-light-1440x900-legislation.png', theme: 'light', viewport: { width: 1440, height: 900 }, links: [], target: '[aria-labelledby="legislationLinksHeading"]' },
  { file: '04-dark-1440x900-case-law.png', theme: 'dark', viewport: { width: 1440, height: 900 }, links: [], target: '[aria-labelledby="caseLawLinksHeading"]' },
  { file: '05-light-1280x800-tools.png', theme: 'light', viewport: { width: 1280, height: 800 }, links: [], target: '[aria-labelledby="toolsLinksHeading"]' },
  { file: '06-dark-1440x900-custom.png', theme: 'dark', viewport: { width: 1440, height: 900 }, links: UI_V2_LINKS_FIXTURE, target: '#customLinksSection' },
  { file: '07-light-1024x768-long-custom.png', theme: 'light', viewport: { width: 1024, height: 768 }, links: UI_V2_LINKS_FIXTURE, target: '#customLinksSection' },
  { file: '08-light-1440x900-new-link-modal.png', theme: 'light', viewport: { width: 1440, height: 900 }, links: [], modal: true },
  { file: '09-dark-1280x800-new-link-modal.png', theme: 'dark', viewport: { width: 1280, height: 800 }, links: [], modal: true },
  { file: '10-dark-390x844-mobile.png', theme: 'dark', viewport: { width: 390, height: 844 }, links: UI_V2_LINKS_FIXTURE }
];

async function waitForStableLayout(page, selector) {
  await page.locator(selector).evaluate(element => element.scrollIntoView({ behavior: 'auto', block: 'start' }));
  await page.evaluate(targetSelector => new Promise(resolve => {
    let stableFrames = 0;
    let previous = '';
    const observe = () => {
      const target = document.querySelector(targetSelector);
      const rect = target?.getBoundingClientRect();
      const current = rect ? [scrollX, scrollY, rect.x, rect.y, rect.width, rect.height].map(value => Math.round(value * 10) / 10).join('|') : '';
      const animationsDone = target?.getAnimations({ subtree: true }).every(animation => animation.playState === 'finished');
      stableFrames = current && current === previous && animationsDone ? stableFrames + 1 : 0;
      previous = current;
      if (stableFrames >= 4) resolve(true);
      else requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
  }), selector);
}

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;
try {
  for (const scenario of SCENARIOS) {
    const context = await session.createContext({ viewport: scenario.viewport, reducedMotion: 'reduce' });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await prepareUiV2LinksFixture(page, { links: scenario.links });
      await page.evaluate(() => {
        window.Atrium.App.toast = () => true;
        document.getElementById('toastRegion')?.replaceChildren();
      });
      if (scenario.modal) {
        await page.locator('#btnNewLink').click();
        await page.locator('#modalBackdrop:not(.hidden)').waitFor();
        await page.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
      }
      await page.waitForFunction(() => document.querySelectorAll('#toastRegion .toast').length === 0);
      await waitForStableLayout(page, scenario.modal ? '#modalBackdrop .modal' : (scenario.target || '#view-links'));

      const layout = await page.locator('#view-links').evaluate((view, expected) => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const staticLinks = [...view.querySelectorAll('[data-links-group]:not([data-links-group="custom"]) > a.link-card')];
        const customCards = [...view.querySelectorAll('#customLinksGrid .custom-link-card')];
        const firstGrid = view.querySelector('[data-links-group="legislation"]');
        const mobileTargets = innerWidth > 720 ? [] : [...view.querySelectorAll('#btnNewLink, .links-commandbar [data-view-link], .link-card[href], .custom-link-card a, .custom-link-card button, .prompts-banner-card button')]
          .filter(element => element.getClientRects().length);
        return {
          active: view.classList.contains('active'),
          ui: document.documentElement.dataset.ui,
          theme: document.documentElement.dataset.theme || 'dark',
          heading: view.querySelector('.links-v2-header h2')?.textContent,
          staticCount: staticLinks.length,
          staticSecurity: staticLinks.every(link => link.target === '_blank' && link.rel === 'noopener noreferrer'),
          customCount: customCards.length,
          unsafeCustomAnchors: customCards.filter(card => /Endereço inválido/.test(card.textContent)).reduce((count, card) => count + card.querySelectorAll('a').length, 0),
          rawCustomElements: view.querySelectorAll('#customLinksGrid script, #customLinksGrid img').length,
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
          viewOverflow: view.scrollWidth - view.clientWidth,
          columns: firstGrid ? getComputedStyle(firstGrid).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
          duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
          undersized: mobileTargets.filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.width < 43.5 || rect.height < 43.5;
          }).map(element => element.getAttribute('aria-label') || element.id || element.textContent.trim()),
          visibleToasts: [...document.querySelectorAll('#toastRegion .toast')].filter(element => element.getClientRects().length).length,
          expected
        };
      }, scenario.links.length);

      assert.equal(layout.active, true); assertions++;
      assert.equal(layout.ui, 'v2'); assertions++;
      assert.equal(layout.theme, scenario.theme); assertions++;
      assert.equal(layout.heading, 'Links úteis'); assertions++;
      assert.equal(layout.staticCount, 10); assertions++;
      assert.equal(layout.staticSecurity, true); assertions++;
      assert.equal(layout.customCount, scenario.links.length); assertions++;
      assert.equal(layout.unsafeCustomAnchors, 0); assertions++;
      assert.equal(layout.rawCustomElements, 0); assertions++;
      assert.ok(layout.pageOverflow <= 2, `${scenario.file}: overflow global ${layout.pageOverflow}px.`); assertions++;
      assert.ok(layout.viewOverflow <= 2, `${scenario.file}: overflow da view ${layout.viewOverflow}px.`); assertions++;
      assert.equal(layout.columns, scenario.viewport.width <= 720 ? 1 : scenario.viewport.width <= 1180 ? 2 : 3); assertions++;
      assert.deepEqual(layout.duplicates, []); assertions++;
      assert.deepEqual(layout.undersized, []); assertions++;
      assert.equal(layout.visibleToasts, 0); assertions++;
      assert.equal(await page.locator('#modalBackdrop:not(.hidden)').count(), scenario.modal ? 1 : 0); assertions++;
      assert.deepEqual(pageErrors, []); assertions++;

      const output = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: output, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
    } finally {
      await context.close();
    }
  }
  assert.equal(hashes.size, SCENARIOS.length, 'Todos os estados visuais de Links devem ser distintos.');
  console.log('======================================================');
  console.log('✓ UI V2 LINKS VISUAL QA CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
