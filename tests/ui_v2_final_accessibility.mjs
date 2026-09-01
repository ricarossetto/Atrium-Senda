import assert from 'node:assert/strict';
import {
  collectUiV2LayoutEvidence,
  prepareUiV2Page,
  prepareUiV2ProcessesFixture,
  startUiV2Session,
  switchUiV2View,
  UI_V2_CANONICAL_VIEWS
} from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 FINAL ACCESSIBILITY');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  try {
    const { page, pageErrors } = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'dark' });
    assert.equal(await page.locator('nav[data-v2-nav-group]').count(), 6);

    const processNav = page.locator('.nav-item[data-view="processes"]');
    await processNav.focus();
    await page.keyboard.press('Enter');
    await page.locator('#view-processes.active').waitFor();
    assert.equal(await processNav.evaluate(element => element.classList.contains('active')), true, 'Enter deve manter a navegação operacional e selecionar Processos.');

    await page.evaluate(() => {
      window.Atrium.Store.state.contacts.push({
        id: 'final-a11y-contact', name: 'Contato Final Acessível Sintético',
        document: '000.000.000-00', email: 'final-a11y@example.test', contactRole: 'cliente'
      });
    });
    const search = page.locator('#globalSearch');
    await search.focus();
    await search.fill('Contato Final Acessível Sintético');
    await page.locator('#globalSearchPalette:not(.hidden)').waitFor();
    await page.keyboard.press('ArrowDown');
    assert.ok(await search.getAttribute('aria-activedescendant'));
    await page.keyboard.press('Enter');
    await page.locator('#view-contacts.active').waitFor();

    await switchUiV2View(page, 'dashboard');
    const taskTrigger = page.locator('#btnDashboardNewTask');
    await taskTrigger.focus();
    const focusStyle = await taskTrigger.evaluate(element => {
      const style = getComputedStyle(element);
      return { outline: style.outlineStyle, width: style.outlineWidth, shadow: style.boxShadow };
    });
    assert.ok((focusStyle.outline !== 'none' && focusStyle.width !== '0px') || focusStyle.shadow !== 'none', 'O foco visível deve ser perceptível.');
    await taskTrigger.click();
    await page.locator('#modalBackdrop:not(.hidden)').waitFor();
    await page.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
    await page.locator('#modalForm button[type="submit"]').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'modalClose');
    await page.keyboard.press('Escape');
    await page.locator('#modalBackdrop.hidden').waitFor({ state: 'attached' });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'btnDashboardNewTask');

    await prepareUiV2ProcessesFixture(page);
    const origin = page.locator('#processTableBody [data-process-id="ui-v2-process-tjrs"]');
    await origin.focus();
    await page.keyboard.press('Enter');
    await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
    await page.waitForFunction(() => document.querySelector('#processInspector')?.contains(document.activeElement));
    await page.locator('#processInspectorEdit').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'processInspectorClose');
    await page.keyboard.press('Escape');
    await page.locator('#processInspectorBackdrop.hidden').waitFor({ state: 'attached' });
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.processId), 'ui-v2-process-tjrs');

    const desktopLayout = await collectUiV2LayoutEvidence(page);
    assert.deepEqual(desktopLayout.duplicateIds, []);
    assert.deepEqual(desktopLayout.visibleOverlays, []);
    assert.deepEqual(pageErrors, [], `Desktop page errors: ${pageErrors.join(' | ')}`);
  } finally {
    await desktop.close();
  }

  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 700 }, { width: 640, height: 800 }]) {
    const context = await session.createContext({ viewport, reducedMotion: 'reduce' });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: viewport.width === 320 ? 'dark' : 'light' });
      for (const view of UI_V2_CANONICAL_VIEWS) {
        await switchUiV2View(page, view);
        const evidence = await collectUiV2LayoutEvidence(page);
        assert.equal(evidence.activeViews.length, 1, `${viewport.width}px/${view}: exatamente uma view ativa.`);
        assert.ok(evidence.globalOverflow <= 2, `${viewport.width}px/${view}: overflow global ${evidence.globalOverflow}px.`);
        assert.deepEqual(evidence.duplicateIds, [], `${viewport.width}px/${view}: IDs duplicados.`);
      }

      if (viewport.width <= 390) {
        const menu = page.locator('#menuToggle');
        const menuBox = await menu.boundingBox();
        assert.ok(menuBox && menuBox.width >= 43.5 && menuBox.height >= 43.5, `Menu mobile deve manter target 44px; medido ${menuBox?.width}x${menuBox?.height}.`);
        await menu.click();
        await page.locator('#sidebar.open').waitFor();
        assert.equal(await menu.getAttribute('aria-expanded'), 'true');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.getElementById('menuToggle')?.getAttribute('aria-expanded') === 'false');
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'menuToggle');
      }

      await switchUiV2View(page, 'dashboard');
      await page.locator('#btnDashboardNewTask').click();
      await page.locator('#modalBackdrop:not(.hidden)').waitFor();
      await page.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
      const dialogBounds = await page.locator('#modalBackdrop .modal').evaluate(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight };
      });
      assert.ok(dialogBounds.left >= -2 && dialogBounds.right <= dialogBounds.width + 2);
      assert.ok(dialogBounds.top >= -2 && dialogBounds.bottom <= dialogBounds.height + 2);
      await page.keyboard.press('Escape');
      await page.locator('#modalBackdrop.hidden').waitFor({ state: 'attached' });
      assert.deepEqual(pageErrors, [], `${viewport.width}px page errors: ${pageErrors.join(' | ')}`);
    } finally {
      await context.close();
    }
  }

  console.log('✓ Teclado, foco, dialogs/drawers, 320px, mobile, reflow 200% proxy and reduced motion approved.');
} finally {
  await session.stop();
}
