import assert from 'node:assert/strict';
import {
  prepareUiV2EmailCalendarFixture,
  prepareUiV2Page,
  startUiV2Session
} from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 EMAIL + CALENDAR ACCESSIBILITY');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const desktopResult = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'dark' });
  const page = desktopResult.page;
  await prepareUiV2EmailCalendarFixture(page);

  const configTrigger = page.locator('#btnConfigureEmail');
  await configTrigger.focus();
  await configTrigger.click();
  await page.waitForFunction(() => document.activeElement?.id === 'emailHostInput');
  assert.equal(await page.locator('#emailConfigBackdrop [role="dialog"]').getAttribute('aria-labelledby'), 'emailConfigTitle');
  assert.equal(await page.locator('#emailConfigBackdrop [role="dialog"]').getAttribute('aria-describedby'), 'emailConfigDescription');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), '');
  for (const id of ['emailHostInput', 'emailPortInput', 'emailSecureInput', 'emailUserInput', 'emailPasswordInput', 'emailFromNameInput', 'emailFromAddressInput']) {
    assert.equal(await page.locator(`label:has(#${id})`).count(), 1, `${id} precisa de label associado.`);
  }
  assert.equal(await page.locator('#emailPasswordInput').getAttribute('type'), 'password');
  assert.equal(await page.locator('#emailPasswordInput').getAttribute('aria-describedby'), 'emailPasswordHelp');
  await page.locator('#emailConfigSubmitBtn').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'emailConfigClose');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'emailConfigSubmitBtn');
  await page.keyboard.press('Escape');
  await page.locator('#emailConfigBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'btnConfigureEmail');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), null);

  const testTrigger = page.locator('#btnTestEmail');
  await testTrigger.focus();
  await testTrigger.click();
  await page.waitForFunction(() => document.activeElement?.id === 'emailTestRecipientInput');
  assert.equal(await page.locator('label:has(#emailTestRecipientInput)').count(), 1);
  assert.equal(await page.locator('#emailTestBackdrop [role="dialog"]').getAttribute('aria-describedby'), 'emailTestDescription');
  await page.keyboard.press('Escape');
  await page.locator('#emailTestBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'btnTestEmail');

  const receiverTrigger = page.locator('#btnAddEmailReceiver');
  await receiverTrigger.focus();
  await receiverTrigger.click();
  await page.locator('#emailReceiverModalBackdrop:not(.hidden)').waitFor();
  await page.waitForFunction(() => document.querySelector('#emailReceiverModalBackdrop [role="dialog"]')?.contains(document.activeElement));
  for (const id of ['receiverTypeInternal', 'receiverTypeExternal', 'receiverUserSelect', 'receiverNameInput', 'receiverEmailInput', 'receiverEnabledInput']) {
    assert.equal(await page.locator(`label:has(#${id})`).count(), 1, `${id} precisa de label associado.`);
  }
  await page.keyboard.press('Escape');
  await page.locator('#emailReceiverModalBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'btnAddEmailReceiver');
  assert.equal(await page.locator('[data-receiver-action="delete"][aria-label]').count(), 3);

  const calendarTrigger = page.locator('#configureCalendarButton');
  await calendarTrigger.focus();
  await calendarTrigger.click();
  await page.waitForFunction(() => document.activeElement?.id === 'calendarInputUrl');
  assert.equal(await page.locator('#calendarConfigBackdrop [role="dialog"]').getAttribute('aria-labelledby'), 'calendarConfigTitle');
  assert.equal(await page.locator('#calendarConfigBackdrop [role="dialog"]').getAttribute('aria-describedby'), 'calendarConfigDescription');
  assert.equal(await page.locator('label[for="calendarInputUrl"]').count(), 1);
  assert.equal(await page.locator('#calendarInputUrl').getAttribute('aria-describedby'), 'calendarInputHelp calendarProfessionalWarning');
  assert.equal(await page.locator('#calendarConfigStatus').getAttribute('role'), 'status');
  assert.equal(await page.locator('#calendarConfigStatus').getAttribute('aria-live'), 'polite');
  await page.keyboard.press('Escape');
  await page.locator('#calendarConfigBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'configureCalendarButton');

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
  await prepareUiV2EmailCalendarFixture(mobilePage);
  const surfaces = [
    ['btnConfigureEmail', 'emailConfigBackdrop'],
    ['btnTestEmail', 'emailTestBackdrop'],
    ['btnAddEmailReceiver', 'emailReceiverModalBackdrop'],
    ['configureCalendarButton', 'calendarConfigBackdrop']
  ];
  for (const [triggerId, backdropId] of surfaces) {
    await mobilePage.locator(`#${triggerId}`).click();
    await mobilePage.locator(`#${backdropId}:not(.hidden)`).waitFor();
    await mobilePage.waitForFunction(id => [...document.querySelectorAll(`#${id}`)].flatMap(element => element.getAnimations({ subtree: true })).every(animation => animation.playState === 'finished'), backdropId);
    const layout = await mobilePage.locator(`#${backdropId} [role="dialog"]`).evaluate(dialog => {
      const rect = dialog.getBoundingClientRect();
      const interactive = [...dialog.querySelectorAll('button, input:not([type="checkbox"]):not([type="radio"]), select')]
        .filter(element => element.getClientRects().length);
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
          return target.width < 43.5 || target.height < 43.5;
        }).map(element => element.id || element.textContent.trim())
      };
    });
    assert.ok(layout.pageOverflow <= 2, `${backdropId}: overflow global ${layout.pageOverflow}px`);
    assert.ok(layout.dialogOverflow <= 2, `${backdropId}: overflow do sheet ${layout.dialogOverflow}px`);
    assert.ok(layout.left >= -2 && layout.right <= layout.width + 2);
    assert.ok(layout.top >= -2 && layout.bottom <= layout.height + 2);
    assert.deepEqual(layout.undersized, [], `${backdropId}: alvos menores que 44px.`);
    await mobilePage.keyboard.press('Escape');
    await mobilePage.locator(`#${backdropId}`).waitFor({ state: 'hidden' });
    assert.equal(await mobilePage.evaluate(id => document.activeElement?.id === id, triggerId), true);
  }
  assert.deepEqual(mobileResult.pageErrors, []);
  await mobile.close();
} finally {
  await session.stop();
}

console.log('✓ UI V2 Email + Calendar: foco, Escape, retorno, labels, mobile e overflow PASS.');
