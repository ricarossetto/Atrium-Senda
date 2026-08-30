import assert from 'node:assert/strict';
import { prepareUiV2DocumentsFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 DOCUMENTS ACCESSIBILITY & RESPONSIVE');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const desktopResult = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'light' });
  const page = desktopResult.page;
  await prepareUiV2DocumentsFixture(page);

  assert.equal(await page.locator('#documentsTemplateGrid [data-generate-doc-type]').count(), 5);
  for (const button of await page.locator('#documentsTemplateGrid [data-generate-doc-type]').all()) {
    assert.match((await button.getAttribute('aria-label')) || '', /^Gerar .+/);
  }
  const duplicateIds = await page.locator('[id]').evaluateAll(nodes => {
    const ids = nodes.map(node => node.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  assert.deepEqual(duplicateIds, []);

  const trigger = page.locator('#btnOpenDocGenModal');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#docGeneratorBackdrop .doc-generator-modal')?.contains(document.activeElement));
  assert.equal(await page.locator('#docGeneratorBackdrop .doc-generator-modal').getAttribute('role'), 'dialog');
  assert.equal(await page.locator('#docGeneratorBackdrop .doc-generator-modal').getAttribute('aria-modal'), 'true');
  assert.equal(await page.locator('#docGeneratorBackdrop .doc-generator-modal').getAttribute('aria-labelledby'), 'docGenTitle');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), '');
  assert.equal(await page.locator('label[for="docGenTypeSelect"]').count(), 1);
  assert.equal(await page.locator('label[for="docGenContactSelect"]').count(), 1);
  assert.equal(await page.locator('label[for="docGenProcessSelect"]').count(), 1);
  assert.equal(await page.locator('label[for="docGenPreviewText"]').count(), 1);
  assert.match(await page.locator('#docGenCopyButton').textContent(), /Copiar/);
  assert.match(await page.locator('#docGenDownloadButton').textContent(), /Baixar/);

  await page.locator('#docGenTypeSelect').focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.querySelector('#docGeneratorBackdrop .doc-generator-modal')?.contains(document.activeElement)), true);
  await page.locator('#docGenCancel').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.querySelector('#docGeneratorBackdrop .doc-generator-modal')?.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  await page.locator('#docGeneratorBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'btnOpenDocGenModal');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), null);
  assert.deepEqual(desktopResult.pageErrors, []);
  await desktop.close();

  const mobile = await session.createContext({ viewport: { width: 390, height: 844 } });
  const mobileResult = await prepareUiV2Page(mobile, session.server.baseUrl, { theme: 'dark' });
  const mobilePage = mobileResult.page;
  await prepareUiV2DocumentsFixture(mobilePage);
  const catalogLayout = await mobilePage.evaluate(() => {
    const cards = [...document.querySelectorAll('#documentsTemplateGrid .document-template-card')];
    const buttons = [...document.querySelectorAll('#view-documents button')].filter(button => button.getClientRects().length);
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      columns: getComputedStyle(document.getElementById('documentsTemplateGrid')).gridTemplateColumns.split(' ').length,
      cardOverflow: cards.filter(card => [...card.querySelectorAll('.prompt-card-header, .document-template-copy, .prompt-card-actions')]
        .some(region => region.scrollWidth - region.clientWidth > 2)).length,
      undersized: buttons.filter(button => {
        const rect = button.getBoundingClientRect();
        return rect.width < 43.5 || rect.height < 43.5;
      }).map(button => button.textContent.trim())
    };
  });
  assert.ok(catalogLayout.overflow <= 2);
  assert.equal(catalogLayout.columns, 1);
  assert.equal(catalogLayout.cardOverflow, 0);
  assert.deepEqual(catalogLayout.undersized, []);

  await mobilePage.locator('#btnOpenDocGenModal').click();
  await mobilePage.waitForFunction(() => document.querySelector('#docGeneratorBackdrop .doc-generator-modal')?.contains(document.activeElement));
  await mobilePage.waitForFunction(() => {
    const rect = document.querySelector('#docGeneratorBackdrop .doc-generator-modal')?.getBoundingClientRect();
    return rect && rect.left >= -2 && rect.right <= innerWidth + 2 && rect.top >= -2 && rect.bottom <= innerHeight + 2;
  });
  const sheet = await mobilePage.locator('#docGeneratorBackdrop .doc-generator-modal').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const controls = document.querySelector('.doc-gen-controls').getBoundingClientRect();
    const preview = document.querySelector('.doc-preview-wrap').getBoundingClientRect();
    const buttons = [...element.querySelectorAll('button')].filter(button => button.getClientRects().length);
    return {
      left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      width: innerWidth, height: innerHeight, overflow: element.scrollWidth - element.clientWidth,
      stacked: preview.top >= controls.bottom - 2,
      undersized: buttons.filter(button => {
        const target = button.getBoundingClientRect();
        return target.width < 43.5 || target.height < 43.5;
      }).map(button => button.getAttribute('aria-label') || button.textContent.trim())
    };
  });
  assert.ok(sheet.left >= -2 && sheet.right <= sheet.width + 2);
  assert.ok(sheet.top >= -2 && sheet.bottom <= sheet.height + 2);
  assert.ok(sheet.overflow <= 2);
  assert.equal(sheet.stacked, true);
  assert.deepEqual(sheet.undersized, []);
  await mobilePage.keyboard.press('Escape');
  assert.equal(await mobilePage.evaluate(() => document.activeElement?.id), 'btnOpenDocGenModal');
  assert.deepEqual(mobileResult.pageErrors, []);
  await mobile.close();

  const reduced = await session.createContext({ viewport: { width: 1280, height: 800 } });
  const reducedResult = await prepareUiV2Page(reduced, session.server.baseUrl);
  await reducedResult.page.emulateMedia({ reducedMotion: 'reduce' });
  await prepareUiV2DocumentsFixture(reducedResult.page);
  assert.ok(await reducedResult.page.locator('.document-template-card').first().evaluate(element => parseFloat(getComputedStyle(element).transitionDuration) <= 0.001));
  await reducedResult.page.locator('#btnOpenDocGenModal').click();
  assert.equal(await reducedResult.page.locator('.doc-generator-modal').evaluate(element => getComputedStyle(element).animationName), 'none');
  await reduced.close();
} finally {
  await session.stop();
}

console.log('✓ Documentos V2 acessível: teclado, foco, Escape, retorno, mobile e reduced motion aprovados.');
