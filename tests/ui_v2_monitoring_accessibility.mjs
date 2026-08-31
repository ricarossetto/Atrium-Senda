import assert from 'node:assert/strict';
import { prepareUiV2MonitoringFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 MONITORING ACCESSIBILITY & RESPONSIVE');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const desktopResult = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'light' });
  const page = desktopResult.page;
  await prepareUiV2MonitoringFixture(page);

  assert.equal(await page.locator('.v2-monitoring-heading h2').textContent(), 'Monitoramento');
  assert.equal(await page.locator('#primaryTermCard').getAttribute('role'), 'button');
  assert.match(await page.locator('#primaryTermCard').getAttribute('aria-label'), /Editar termo principal Advogada Mineral Sintética/);
  assert.deepEqual(await page.locator('#primaryTermCard .monitor-stats .v2-only').allTextContents(), ['Fontes', 'Atenção', 'Novas publicações']);
  assert.equal(await page.locator('#monitorSourceList [role="button"]').count(), 5);
  assert.match(await page.locator('[data-source-id="a1"]').getAttribute('aria-label'), /Configurar Certificado A1 Sintético\. Status Ativo\./);
  assert.deepEqual(await page.locator('#monitorSourceList .status-chip').allTextContents(), ['Ativo', 'Atenção', 'Falha', 'Preparado', 'Desativado']);

  const duplicateIds = await page.locator('[id]').evaluateAll(nodes => {
    const ids = nodes.map(node => node.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  assert.deepEqual(duplicateIds, []);

  const primary = page.locator('#primaryTermCard');
  await primary.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
  assert.equal(await page.locator('#modalBackdrop .modal').getAttribute('role'), 'dialog');
  assert.equal(await page.locator('#modalBackdrop .modal').getAttribute('aria-modal'), 'true');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), '');
  assert.deepEqual(await page.locator('#modalFields fieldset legend').allTextContents(), ['Identidade', 'OAB', 'Documento']);
  assert.equal(await page.locator('#modalForm label').count(), 5);
  assert.equal(await page.locator('#field-oabUf option').count(), 27);
  assert.equal(await page.locator('#field-oabNumber').isVisible(), true);
  assert.equal(await page.locator('#field-oabUf').isVisible(), true);
  assert.equal(await page.locator('#field-document').isVisible(), false);
  await page.locator('#field-type').selectOption('document');
  assert.equal(await page.locator('#field-oabNumber').isVisible(), false);
  assert.equal(await page.locator('#field-oabUf').isVisible(), false);
  assert.equal(await page.locator('#field-document').isVisible(), true);
  await page.locator('#field-type').selectOption('name');
  assert.equal(await page.locator('#field-oabNumber').isVisible(), false);
  assert.equal(await page.locator('#field-oabUf').isVisible(), false);
  assert.equal(await page.locator('#field-document').isVisible(), false);
  await page.keyboard.press('Escape');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'primaryTermCard');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), null);

  const generic = page.locator('[data-source-id="generic-source"]');
  await generic.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
  assert.deepEqual(await page.locator('#modalFields fieldset legend').allTextContents(), ['Fonte', 'Estado', 'Detalhes']);
  assert.equal(await page.locator('#modalForm label').count(), 5);
  assert.equal(await page.locator('#field-status option').count(), 5);
  await page.locator('#modalClose').focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement)), true);
  await page.locator('#modalForm button[type="submit"]').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-source-id')), 'generic-source');

  const dataJud = page.locator('[data-source-id="datajud-cnj"]');
  await dataJud.focus();
  await page.keyboard.press(' ');
  await page.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
  assert.deepEqual(await page.locator('#modalFields fieldset legend').allTextContents(), ['Acesso', 'Comportamento', 'Abrangência']);
  assert.equal(await page.locator('#modalForm label').count(), 3);
  assert.equal(await page.locator('.monitoring-contract-note').getAttribute('role'), 'note');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-source-id')), 'datajud-cnj');
  assert.deepEqual(desktopResult.pageErrors, []);
  await desktop.close();

  const mobile = await session.createContext({ viewport: { width: 390, height: 844 } });
  const mobileResult = await prepareUiV2Page(mobile, session.server.baseUrl, { theme: 'dark' });
  const mobilePage = mobileResult.page;
  await prepareUiV2MonitoringFixture(mobilePage);
  const layout = await mobilePage.evaluate(() => {
    const interactive = [...document.querySelectorAll('#view-monitoring button, #view-monitoring [role="button"]')].filter(element => element.getClientRects().length);
    const rows = [...document.querySelectorAll('#monitorSourceList .monitor-v2-source-row')];
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      rowOverflow: rows.filter(row => row.scrollWidth - row.clientWidth > 2).length,
      undersized: interactive.filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width < 43.5 || rect.height < 43.5;
      }).map(element => element.getAttribute('aria-label') || element.textContent.trim())
    };
  });
  assert.ok(layout.overflow <= 2);
  assert.equal(layout.rowOverflow, 0);
  assert.deepEqual(layout.undersized, []);

  await mobilePage.locator('[data-source-id="generic-source"]').click();
  await mobilePage.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
  await mobilePage.waitForFunction(() => [...document.querySelectorAll('#modalBackdrop .modal')]
    .flatMap(element => element.getAnimations({ subtree: true })).every(animation => animation.playState === 'finished'));
  const sheet = await mobilePage.locator('#modalBackdrop .modal').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const buttons = [...element.querySelectorAll('button')].filter(button => button.getClientRects().length);
    return {
      left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      width: innerWidth, height: innerHeight,
      overflow: element.scrollWidth - element.clientWidth,
      undersized: buttons.filter(button => {
        const target = button.getBoundingClientRect();
        return target.width < 43.5 || target.height < 43.5;
      }).map(button => button.getAttribute('aria-label') || button.textContent.trim())
    };
  });
  assert.ok(sheet.left >= -2 && sheet.right <= sheet.width + 2);
  assert.ok(sheet.top >= -2 && sheet.bottom <= sheet.height + 2);
  assert.ok(sheet.overflow <= 2);
  assert.deepEqual(sheet.undersized, []);
  await mobilePage.keyboard.press('Escape');
  assert.equal(await mobilePage.evaluate(() => document.activeElement?.getAttribute('data-source-id')), 'generic-source');
  assert.deepEqual(mobileResult.pageErrors, []);
  await mobile.close();

  const reduced = await session.createContext({ viewport: { width: 1280, height: 800 } });
  const reducedResult = await prepareUiV2Page(reduced, session.server.baseUrl);
  await reducedResult.page.emulateMedia({ reducedMotion: 'reduce' });
  await prepareUiV2MonitoringFixture(reducedResult.page);
  assert.ok(await reducedResult.page.locator('#monitorSourceList .monitor-v2-source-row').first()
    .evaluate(element => parseFloat(getComputedStyle(element).transitionDuration) <= 0.001));
  await reduced.close();
} finally {
  await session.stop();
}

console.log('✓ Monitoring V2 acessível: teclado, foco, campos condicionais, drawers, mobile e reduced motion aprovados.');
