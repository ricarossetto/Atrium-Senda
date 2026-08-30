import assert from 'node:assert/strict';
import { prepareUiV2LeadsFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 LEADS ACCESSIBILITY & RESPONSIVE');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const desktopResult = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'dark' });
  const page = desktopResult.page;
  await prepareUiV2LeadsFixture(page);

  assert.equal(await page.locator('label[for="leadSearch"]').count(), 1);
  assert.equal(await page.locator('#leadStatusFilters [aria-pressed="true"]').count(), 1);
  const record = page.locator('[data-lead-id="lead-v2-new"]');
  assert.match((await record.getAttribute('aria-label')) || '', /Ana Interessada Sintética.+Aposentadoria especial.+Novo/);
  await record.focus();
  await page.keyboard.press('Enter');
  await page.locator('#modalBackdrop:not(.hidden)').waitFor();
  await page.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
  assert.equal(await page.locator('#modalBackdrop .modal').getAttribute('role'), 'dialog');
  assert.equal(await page.locator('#modalBackdrop .modal').getAttribute('aria-modal'), 'true');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), '');
  assert.equal(await page.locator('.lead-form-section').count(), 6);
  assert.deepEqual(await page.locator('.lead-form-section legend').allTextContents(), ['Interessado', 'Demanda jurídica', 'Andamento', 'Origem', 'Estimativa', 'Relato']);
  for (const name of ['client', 'serviceType', 'status', 'origin', 'estimatedFee', 'responsible', 'notes']) {
    assert.equal(await page.locator(`label[for="field-${name}"]`).count(), 1);
  }
  await page.locator('#modalCancel').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.dataset?.leadId), 'lead-v2-new');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), null);
  const duplicateIds = await page.locator('[id]').evaluateAll(nodes => {
    const ids = nodes.map(node => node.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  assert.deepEqual(duplicateIds, []);
  assert.deepEqual(desktopResult.pageErrors, []);
  await desktop.close();

  const mobile = await session.createContext({ viewport: { width: 390, height: 844 } });
  const mobileResult = await prepareUiV2Page(mobile, session.server.baseUrl, { theme: 'light' });
  const mobilePage = mobileResult.page;
  await prepareUiV2LeadsFixture(mobilePage);
  const mobileLayout = await mobilePage.evaluate(() => {
    const records = [...document.querySelectorAll('.lead-v2-record')];
    const controls = [...document.querySelectorAll('#view-leads button, #view-leads input')].filter(element => element.getClientRects().length);
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      records: records.length,
      recordOverflow: records.filter(record => record.scrollWidth - record.clientWidth > 2).length,
      undersized: controls.filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width < 43.5 || rect.height < 43.5;
      }).map(element => element.getAttribute('aria-label') || element.textContent.trim())
    };
  });
  assert.ok(mobileLayout.overflow <= 2);
  assert.equal(mobileLayout.records, 7);
  assert.equal(mobileLayout.recordOverflow, 0);
  assert.deepEqual(mobileLayout.undersized, []);

  await mobilePage.locator('[data-lead-id="lead-v2-long"]').click();
  await mobilePage.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
  await mobilePage.waitForFunction(() => {
    const rect = document.querySelector('#modalBackdrop .modal')?.getBoundingClientRect();
    return rect && rect.left >= -2 && rect.right <= innerWidth + 2 && rect.top >= -2 && rect.bottom <= innerHeight + 2;
  });
  const drawer = await mobilePage.locator('#modalBackdrop .modal').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const buttons = [...element.querySelectorAll('button')].filter(button => button.getClientRects().length);
    return {
      left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      width: innerWidth, height: innerHeight,
      overflow: element.scrollWidth - element.clientWidth,
      undersized: buttons.filter(button => {
        const target = button.getBoundingClientRect();
        return target.width < 43.5 || target.height < 43.5;
      }).map(button => button.textContent.trim())
    };
  });
  assert.ok(drawer.left >= -2 && drawer.right <= drawer.width + 2);
  assert.ok(drawer.top >= -2 && drawer.bottom <= drawer.height + 2);
  assert.ok(drawer.overflow <= 2);
  assert.deepEqual(drawer.undersized, []);
  await mobilePage.keyboard.press('Escape');
  assert.equal(await mobilePage.evaluate(() => document.activeElement?.dataset?.leadId), 'lead-v2-long');
  assert.deepEqual(mobileResult.pageErrors, []);
  await mobile.close();

  const reduced = await session.createContext({ viewport: { width: 1280, height: 800 } });
  const reducedResult = await prepareUiV2Page(reduced, session.server.baseUrl);
  await reducedResult.page.emulateMedia({ reducedMotion: 'reduce' });
  await prepareUiV2LeadsFixture(reducedResult.page);
  assert.ok(await reducedResult.page.locator('.lead-v2-record').first().evaluate(element => parseFloat(getComputedStyle(element).transitionDuration) <= 0.001));
  await reducedResult.page.locator('[data-lead-id="lead-v2-new"]').click();
  assert.equal(await reducedResult.page.locator('#modalBackdrop .modal').evaluate(element => getComputedStyle(element).animationName), 'none');
  await reduced.close();
} finally {
  await session.stop();
}

console.log('✓ Leads V2 acessível: teclado, foco, Escape, retorno, mobile e reduced motion aprovados.');
