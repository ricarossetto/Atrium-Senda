import assert from 'node:assert/strict';
import { prepareUiV2JudicialFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 JUDICIAL ACCESSIBILITY & RESPONSIVE');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const desktopResult = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'dark' });
  const page = desktopResult.page;
  await prepareUiV2JudicialFixture(page);
  const trigger = page.locator('#certificateGuideButton');
  await trigger.focus();
  await trigger.click();
  await page.waitForFunction(() => document.querySelector('#judicialSetupBackdrop [role="dialog"]')?.contains(document.activeElement));

  assert.equal(await page.locator('#judicialSetupBackdrop [role="dialog"]').getAttribute('aria-labelledby'), 'judicialSetupTitle');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), '');
  assert.equal(await page.locator('#certificateFileInput').getAttribute('type'), 'file');
  assert.equal(await page.locator('#certificatePassphrase').getAttribute('type'), 'password');
  assert.equal(await page.locator('#portalTotpSecret').getAttribute('type'), 'password');
  assert.equal(await page.locator('#portalTotpCode').getAttribute('pattern'), '[0-9]{6}');
  assert.equal(await page.locator('label:has(#certificateFileInput)').count(), 1);
  assert.equal(await page.locator('label:has(#certificatePassphrase)').count(), 1);
  assert.equal(await page.locator('label:has(#portalQrInput)').count(), 1);
  assert.equal(await page.locator('label:has(#portalTotpCode)').count(), 1);

  await page.locator('#judicialSetupClose').focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.querySelector('#judicialSetupBackdrop [role="dialog"]')?.contains(document.activeElement)), true);
  await page.locator('#judicialSetupBackdrop [role="dialog"]').evaluate(dialog => {
    const focusable = [...dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter(element => !element.hidden && element.getClientRects().length > 0);
    focusable.at(-1)?.focus();
  });
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => document.activeElement?.id === 'judicialSetupClose');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'judicialSetupClose');
  await page.keyboard.press('Escape');
  await page.locator('#judicialSetupBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'certificateGuideButton');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), null);

  const duplicates = await page.locator('[id]').evaluateAll(nodes => {
    const ids = nodes.map(node => node.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  assert.deepEqual(duplicates, []);
  assert.deepEqual(desktopResult.pageErrors, []);
  await desktop.close();

  const mobile = await session.createContext({ viewport: { width: 390, height: 844 } });
  const mobileResult = await prepareUiV2Page(mobile, session.server.baseUrl, { theme: 'light' });
  const mobilePage = mobileResult.page;
  await prepareUiV2JudicialFixture(mobilePage);
  await mobilePage.locator('#certificateGuideButton').click();
  await mobilePage.waitForFunction(() => document.querySelector('#judicialSetupBackdrop [role="dialog"]')?.contains(document.activeElement));
  await mobilePage.waitForFunction(() => [...document.querySelectorAll('#judicialSetupBackdrop')].flatMap(element => element.getAnimations({ subtree: true })).every(animation => animation.playState === 'finished'));
  const layout = await mobilePage.evaluate(() => {
    const dialog = document.querySelector('#judicialSetupBackdrop [role="dialog"]');
    const rect = dialog.getBoundingClientRect();
    const interactive = [...dialog.querySelectorAll('button, input:not([type="file"]), select')].filter(element => element.getClientRects().length);
    return {
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      dialogOverflow: dialog.scrollWidth - dialog.clientWidth,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: innerWidth,
      height: innerHeight,
      undersized: interactive.filter(element => {
        const target = element.getBoundingClientRect();
        if (element.matches('input[type="checkbox"]')) return false;
        return target.width < 43.5 || target.height < 43.5;
      }).map(element => element.id || element.textContent.trim())
    };
  });
  assert.ok(layout.pageOverflow <= 2, `overflow global ${layout.pageOverflow}px`);
  assert.ok(layout.dialogOverflow <= 2, `overflow do dialog ${layout.dialogOverflow}px`);
  assert.ok(layout.left >= -2 && layout.right <= layout.width + 2);
  assert.ok(layout.top >= -2 && layout.bottom <= layout.height + 2);
  assert.deepEqual(layout.undersized, []);
  assert.deepEqual(mobileResult.pageErrors, []);
  await mobile.close();
} finally {
  await session.stop();
}

console.log('✓ UI V2 Judicial: foco, Escape, retorno, labels, mobile e overflow PASS.');
