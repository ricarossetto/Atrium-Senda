import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startUiV2Session, prepareUiV2Page, switchUiV2View, prepareUiV2TasksFixture } from './ui_v2_helpers.mjs';

const artifacts = new URL('../artifacts/visual-qa/shell-keyboard-regression/', import.meta.url);
await mkdir(artifacts, { recursive: true });
const session = await startUiV2Session();
try {
  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 390]) {
      const context = await session.createContext({ viewport: { width, height: 900 } });
      try {
        const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
        await page.evaluate(() => {
          document.body.tabIndex = -1;
          document.body.focus();
          document.body.removeAttribute('tabindex');
        });
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement?.matches('.skip-link')), true,
          `${theme}/${width}: Tab precisa alcançar o atalho antes da navegação.`);
        const box = await page.locator('.skip-link').boundingBox();
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width,
          `${theme}/${width}: atalho focado visível dentro do viewport.`);
        assert.equal(await page.locator('.skip-link').evaluate(el => getComputedStyle(el).opacity), '1');
        const previousUrl = page.url();
        await page.keyboard.press('Enter');
        assert.equal(page.url(), previousUrl, `${theme}/${width}: o atalho não deve navegar para o documento raiz.`);
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'appMain',
          `${theme}/${width}: Enter deve levar o foco ao conteúdo principal.`);
        const hiddenAuth = await page.locator('#authGate').evaluate(el => ({ classes: el.className, display: getComputedStyle(el).display, height: el.getBoundingClientRect().height }));
        assert.equal(hiddenAuth.display, 'none', `${theme}/${width}: pular ao conteúdo não pode reexibir login: ${JSON.stringify(hiddenAuth)}`);
        await prepareUiV2TasksFixture(page);
        await switchUiV2View(page, 'kanban');
        const toggle = page.locator('.task-analysis-toggle');
        assert.ok(await toggle.evaluate(el => parseFloat(getComputedStyle(el).fontSize)) <= 16,
          `${theme}/${width}: controle secundário não pode virar título gigante.`);
        for (const mode of ['list', 'kanban']) {
          await page.locator(`[data-task-view-mode="${mode}"]`).click();
          await page.waitForFunction(selectedMode => {
            const group = document.getElementById('taskViewSwitch');
            const button = group?.querySelector(`[data-task-view-mode="${selectedMode}"]`);
            if (!button || button.getAttribute('aria-pressed') !== 'true') return false;
            const indicator = getComputedStyle(group, '::before');
            const parentBox = group.getBoundingClientRect();
            const buttonBox = button.getBoundingClientRect();
            const translation = indicator.transform === 'none' ? 0 : new DOMMatrix(indicator.transform).m41;
            const indicatorLeft = parentBox.left + parseFloat(getComputedStyle(group).borderLeftWidth) + parseFloat(indicator.left) + translation;
            return Math.abs(indicatorLeft - buttonBox.left) <= 1 && Math.abs(parseFloat(indicator.width) - buttonBox.width) <= 1;
          }, mode);
          const heights = await page.locator('#taskViewSwitch button').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().height));
          assert.ok(heights.every(height => height >= (width === 390 ? 43.5 : 39.5)), `${theme}/${width}: segmentos com alvo adequado.`);
        }
        await page.screenshot({ path: fileURLToPath(new URL(`kanban-${theme}-${width}.png`, artifacts)) });
        assert.deepEqual(pageErrors, [], `${theme}/${width}: sem erro de página.`);
        console.log(`PASS ${theme}/${width}: Tab, Enter, foco no conteúdo e controle secundário legível.`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await session.stop();
}
