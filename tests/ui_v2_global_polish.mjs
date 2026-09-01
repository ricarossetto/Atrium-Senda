import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareUiV2Page,
  startUiV2Session,
  switchUiV2View,
  UI_V2_CANONICAL_VIEWS
} from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_ROOT = path.join(ROOT, 'css', 'views', 'ui-v2');
const cssFiles = fs.readdirSync(CSS_ROOT).filter(file => file.endsWith('.css'));
const css = cssFiles.map(file => fs.readFileSync(path.join(CSS_ROOT, file), 'utf8')).join('\n');
const tokens = fs.readFileSync(path.join(CSS_ROOT, 'tokens.css'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

assert.equal(cssFiles.includes('final-fixes.css'), false, 'Gate 24 não cria folha de overrides aleatórios.');
assert.doesNotMatch(css, /radial-gradient\s*\(/i, 'A UI V2 não usa bolhas radiais no polish final.');
assert.doesNotMatch(css, /translateY\(\s*-[12]px\s*\)/i, 'Hover elevado por translateY não integra o contrato final.');
assert.doesNotMatch(css, /(?:neon|liquid-glass|chrome|glossy)/i, 'Materiais proibidos não entram na linguagem V2.');
assert.match(tokens, /--v2-duration-instant:\s*90ms/);
assert.match(tokens, /--v2-duration-fast:\s*140ms/);
assert.match(tokens, /--v2-duration-base:\s*200ms/);
assert.match(tokens, /--v2-duration-slow:\s*280ms/);
assert.match(tokens, /--v2-duration-max:\s*360ms/);
assert.match(tokens, /--v2-shadow-xs:/);
assert.match(tokens, /--v2-shadow-overlay:/);
assert.match(tokens, /--v2-color-border-strong:/);

const forbiddenFrameworks = ['react', 'vue', 'angular', 'svelte', 'next', 'vite', 'webpack'];
for (const framework of forbiddenFrameworks) {
  assert.equal(packageJson.dependencies?.[framework], undefined, `Dependência ${framework} não deve existir.`);
  assert.equal(packageJson.devDependencies?.[framework], undefined, `Dev dependency ${framework} não deve existir.`);
}

const session = await startUiV2Session();
try {
  for (const theme of ['light', 'dark']) {
    const context = await session.createContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
      const material = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const shell = getComputedStyle(document.querySelector('.app-shell'));
        const topbar = getComputedStyle(document.querySelector('.topbar'));
        const primary = document.querySelector('#appShell .button.gold');
        return {
          background: root.getPropertyValue('--v2-color-background').trim(),
          surface: root.getPropertyValue('--v2-color-surface').trim(),
          borderStrong: root.getPropertyValue('--v2-color-border-strong').trim(),
          actionBackground: root.getPropertyValue('--v2-action-primary-bg').trim(),
          shellImage: shell.backgroundImage,
          topbarBackdrop: topbar.backdropFilter,
          primaryFont: primary ? getComputedStyle(primary).fontFamily : ''
        };
      });
      assert.ok(material.background && material.surface && material.borderStrong && material.actionBackground, `${theme}: tokens materiais resolvidos.`);
      assert.doesNotMatch(material.shellImage, /radial-gradient/i, `${theme}: shell sem bolhas radiais.`);
      assert.match(material.topbarBackdrop, /blur\(10px\)/, `${theme}: topbar fosca e contida.`);
      assert.match(material.primaryFont, /Inter/i, `${theme}: controles usam Inter.`);

      for (const view of UI_V2_CANONICAL_VIEWS) {
        await switchUiV2View(page, view);
        const hierarchy = await page.locator(`#view-${view}`).evaluate(element => {
          const heading = element.querySelector('h1, h2');
          const controls = [...element.querySelectorAll('button, input, select, textarea')]
            .filter(control => control.getClientRects().length)
            .slice(0, 8);
          return {
            heading: heading ? getComputedStyle(heading).fontFamily : '',
            controlFonts: controls.map(control => getComputedStyle(control).fontFamily),
            width: element.getBoundingClientRect().width
          };
        });
        assert.ok(hierarchy.width > 0, `${theme}/${view}: view ativa com geometria.`);
        assert.match(hierarchy.heading, /Playfair/i, `${theme}/${view}: heading editorial.`);
        assert.ok(hierarchy.controlFonts.every(font => /Inter/i.test(font)), `${theme}/${view}: controles coerentes.`);
      }
      assert.deepEqual(pageErrors, [], `${theme}: sem erros de página.`);
    } finally {
      await context.close();
    }
  }

  for (const viewport of [{ width: 1280, height: 800 }, { width: 1024, height: 768 }]) {
    const context = await session.createContext({ viewport, reducedMotion: 'reduce' });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
      for (const view of ['dashboard', 'processes', 'kanban', 'documents', 'integrations', 'configuration']) {
        await switchUiV2View(page, view);
        const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
        assert.ok(overflow <= 2, `${viewport.width}/${view}: sem overflow global (${overflow}px).`);
      }
      assert.deepEqual(pageErrors, [], `${viewport.width}: sem erros de página.`);
    } finally {
      await context.close();
    }
  }
} finally {
  await session.stop();
}

console.log('✓ UI V2 Global Polish: materiais, hierarquia, motion, breakpoints e dependências PASS.');
