import assert from 'node:assert/strict';
import { prepareUiV2FinancialFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 FINANCIAL ACCESSIBILITY & RESPONSIVE');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'light' });
  await prepareUiV2FinancialFixture(page);

  assert.equal(await page.locator('label[for="financialSearch"]').count(), 1);
  assert.equal(await page.locator('#financialSearch').getAttribute('aria-label'), 'Pesquisar operações financeiras');
  assert.equal(await page.locator('.financial-v2-table').isVisible(), true);
  assert.equal(await page.locator('.financial-v2-table thead th[scope="col"]').count(), 6);
  assert.equal(await page.locator('.financial-v2-record-list').isVisible(), false);
  assert.equal(await page.locator('[data-fin-filter][aria-pressed="true"]').count(), 1);
  assert.match(await page.locator('[data-financial-record="fin-rpv-fallback"]').first().textContent(), /Aguardando Depósito/);

  const duplicateIds = await page.locator('[id]').evaluateAll(nodes => {
    const ids = nodes.map(node => node.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  assert.deepEqual(duplicateIds, []);

  await page.locator('#newFinancialEntryButton').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#financialEntryBackdrop .financial-entry-modal')?.contains(document.activeElement));
  assert.equal(await page.locator('#financialEntryBackdrop .financial-entry-modal').getAttribute('role'), 'dialog');
  assert.equal(await page.locator('#financialEntryBackdrop .financial-entry-modal').getAttribute('aria-modal'), 'true');
  assert.equal(await page.locator('#financialEntryBackdrop .financial-entry-modal').getAttribute('aria-labelledby'), 'finModalTitle');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), '');

  await page.locator('#financialEntryClose').focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.querySelector('#financialEntryBackdrop .financial-entry-modal')?.contains(document.activeElement)), true, 'Shift+Tab deve permanecer contido.');
  await page.keyboard.press('Escape');
  await page.locator('#financialEntryBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'newFinancialEntryButton');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), null);

  await page.locator('#newFinancialEntryButton').click();
  await page.locator('#finProcessSelect').selectOption('fin-target-custas');
  await page.locator('#finTypeSelect').selectOption('despesa');
  await page.locator('#finGrossInput').fill('100');
  await page.locator('#finDescriptionInput').fill('Custa processual sintética');
  await page.locator('#financialEntryForm button[type="submit"]').click();
  await page.locator('#financialEntryBackdrop').waitFor({ state: 'hidden' });
  const successToast = page.locator('#toastRegion .toast.success').last();
  await successToast.waitFor();
  assert.match(await successToast.textContent(), /salvo com sucesso/i);
  assert.ok(['polite', 'assertive'].includes(await page.locator('#toastRegion').getAttribute('aria-live')));
  assert.deepEqual(pageErrors, []);
  await desktop.close();

  const mobile = await session.createContext({ viewport: { width: 390, height: 844 } });
  const mobileResult = await prepareUiV2Page(mobile, session.server.baseUrl, { theme: 'dark' });
  await prepareUiV2FinancialFixture(mobileResult.page);
  const mobilePage = mobileResult.page;
  assert.equal(await mobilePage.locator('.financial-v2-table').isVisible(), false);
  assert.equal(await mobilePage.locator('.financial-v2-record-list').isVisible(), true);
  assert.equal(await mobilePage.locator('.financial-v2-record[role="listitem"]').count(), 8);
  assert.match(await mobilePage.locator('.financial-v2-record').first().getAttribute('aria-label'), /Cliente Zero Sintética/);

  const mobileLayout = await mobilePage.evaluate(() => {
    const visibleButtons = [...document.querySelectorAll('#view-financial button')].filter(button => button.getClientRects().length);
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      undersized: visibleButtons.filter(button => {
        const rect = button.getBoundingClientRect();
        return rect.width < 43.5 || rect.height < 43.5;
      }).map(button => button.textContent.trim()),
      recordsOverflow: [...document.querySelectorAll('.financial-v2-record')].filter(record => record.scrollWidth - record.clientWidth > 2).length
    };
  });
  assert.ok(mobileLayout.overflow <= 2, `Overflow global: ${mobileLayout.overflow}px.`);
  assert.deepEqual(mobileLayout.undersized, []);
  assert.equal(mobileLayout.recordsOverflow, 0);

  await mobilePage.locator('#newFinancialEntryButton').click();
  await mobilePage.waitForFunction(() => document.querySelector('#financialEntryBackdrop .financial-entry-modal')?.contains(document.activeElement));
  await mobilePage.waitForFunction(() => {
    const rect = document.querySelector('#financialEntryBackdrop .financial-entry-modal')?.getBoundingClientRect();
    return rect && rect.left >= -2 && rect.right <= innerWidth + 2 && rect.top >= -2 && rect.bottom <= innerHeight + 2;
  });
  const sheet = await mobilePage.locator('#financialEntryBackdrop .financial-entry-modal').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight, overflow: element.scrollWidth - element.clientWidth };
  });
  assert.ok(sheet.left >= -2 && sheet.right <= sheet.width + 2);
  assert.ok(sheet.top >= -2 && sheet.bottom <= sheet.height + 2);
  assert.ok(sheet.overflow <= 2);
  await mobilePage.keyboard.press('Escape');
  assert.equal(await mobilePage.evaluate(() => document.activeElement?.id), 'newFinancialEntryButton');
  assert.deepEqual(mobileResult.pageErrors, []);
  await mobile.close();
} finally {
  await session.stop();
}

console.log('✓ Financeiro V2 acessível: semântica, foco, Escape, retorno, mobile e targets aprovados.');
