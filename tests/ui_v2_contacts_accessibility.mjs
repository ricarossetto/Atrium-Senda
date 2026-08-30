import assert from 'node:assert/strict';
import { prepareUiV2ContactsFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 CONTACTS ACCESSIBILITY');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  const desktop = await session.createContext();
  const { page, pageErrors } = await prepareUiV2Page(desktop, session.server.baseUrl);
  await prepareUiV2ContactsFixture(page);

  assert.equal(await page.locator('label[for="contactSearch"]').textContent(), 'Buscar pessoas');
  assert.equal(await page.locator('#contactSearch').getAttribute('aria-label'), 'Pesquisar contatos');
  assert.equal(await page.locator('[data-contact-role-filter="all"]').getAttribute('aria-pressed'), 'true');

  const opener = page.locator('[data-contact-id="ui-v2-contact-client"]');
  assert.equal(await opener.evaluate(element => element.tagName), 'BUTTON');
  assert.match(await opener.getAttribute('aria-label'), /Marina Duarte Sintética, papel Cliente/);
  await opener.focus();
  await opener.press('Enter');
  await page.waitForFunction(() => document.activeElement?.id === 'contactInspectorHeading');
  assert.equal(await page.locator('#contactInspector').getAttribute('role'), 'region');
  assert.equal(await page.locator('#contactInspectorHeading').getAttribute('tabindex'), '-1');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.dataset?.contactId === 'ui-v2-contact-client');
  assert.equal(await page.locator('#contactInspector').getAttribute('aria-modal'), null);

  await page.locator('[data-contact-id="ui-v2-contact-client"]').click();
  await page.locator('[data-contact-edit]').click();
  await page.locator('#modalBackdrop[data-modal-mode="contact"]:not(.hidden)').waitFor();
  assert.equal(await page.locator('#modalBackdrop .modal').getAttribute('aria-modal'), 'true');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), '');
  await page.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
  assert.equal(await page.evaluate(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement)), true);
  assert.equal(await page.locator('.contact-form-section legend').count(), 5);
  assert.equal(await page.locator('#modalForm [name]').evaluateAll(nodes => nodes.every(node => {
    const label = document.querySelector(`label[for="${node.id}"]`);
    return Boolean(label && label.textContent.trim());
  })), true, 'Todos os 18 campos devem manter labels conectados.');
  await page.keyboard.press('Escape');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-contact-edit')), true);
  assert.equal(await page.locator('#appShell').getAttribute('inert'), null);

  const duplicateIds = await page.locator('[id]').evaluateAll(elements => {
    const ids = elements.map(element => element.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  assert.deepEqual(duplicateIds, []);
  assert.deepEqual(pageErrors, []);
  await desktop.close();

  const mobile = await session.createContext({ viewport: { width: 390, height: 844 } });
  const mobileState = await prepareUiV2Page(mobile, session.server.baseUrl);
  await prepareUiV2ContactsFixture(mobileState.page);
  const mobilePage = mobileState.page;
  assert.equal(await mobilePage.locator('.contact-record-list').getAttribute('role'), 'list');
  assert.equal(await mobilePage.locator('.contacts-classic-table').isHidden(), true);

  const targets = await mobilePage.locator('#view-contacts button:visible').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { label: element.getAttribute('aria-label') || element.textContent.trim(), width: rect.width, height: rect.height };
  }));
  const undersized = targets.filter(item => item.width < 43.5 || item.height < 43.5);
  assert.deepEqual(undersized, [], `Targets mobile abaixo de 44px: ${JSON.stringify(undersized)}`);

  const mobileOpener = mobilePage.locator('[data-contact-id="ui-v2-contact-client"]');
  await mobileOpener.focus();
  await mobileOpener.press('Enter');
  const inspector = mobilePage.locator('#contactInspector');
  await inspector.waitFor();
  assert.equal(await inspector.getAttribute('role'), 'dialog');
  assert.equal(await inspector.getAttribute('aria-modal'), 'true');
  await mobilePage.waitForFunction(() => document.querySelector('#contactInspector')?.contains(document.activeElement));
  await mobilePage.waitForFunction(() => {
    const rect = document.querySelector('#contactInspector')?.getBoundingClientRect();
    return rect && rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1;
  });
  const inspectorRect = await inspector.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight };
  });
  assert.ok(inspectorRect.left >= -1 && inspectorRect.right <= inspectorRect.width + 1, `Inspector mobile horizontal: ${JSON.stringify(inspectorRect)}`);
  assert.ok(inspectorRect.top >= -1 && inspectorRect.bottom <= inspectorRect.height + 1, `Inspector mobile vertical: ${JSON.stringify(inspectorRect)}`);
  await mobilePage.locator('[data-contact-inspector-close]').click();
  await mobilePage.waitForFunction(() => document.activeElement?.dataset?.contactId === 'ui-v2-contact-client');

  await mobilePage.locator('[data-contact-id="ui-v2-contact-client"]').click();
  await mobilePage.locator('[data-contact-edit]').click();
  const sheet = mobilePage.locator('#modalBackdrop[data-modal-mode="contact"] .modal');
  await sheet.waitFor();
  await mobilePage.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
  assert.equal(await mobilePage.locator('#contactInspector').isVisible(), false, 'O edit sheet deve substituir visualmente o inspector, não ficar atrás dele.');
  const sheetRect = await sheet.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight, formOverflow: element.querySelector('form').scrollWidth - element.querySelector('form').clientWidth };
  });
  assert.ok(sheetRect.left >= -1 && sheetRect.right <= sheetRect.width + 1);
  assert.ok(sheetRect.top >= -1 && sheetRect.bottom <= sheetRect.height + 1);
  assert.ok(sheetRect.formOverflow <= 2);

  const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 2, `Contatos mobile não pode ter overflow global: ${overflow}px.`);
  await mobilePage.emulateMedia({ reducedMotion: 'reduce' });
  const reducedDuration = await mobilePage.locator('.contact-form-section').first().evaluate(element => getComputedStyle(element).animationDuration);
  assert.ok(parseFloat(reducedDuration) <= 0.02 || reducedDuration === '0s');
  assert.deepEqual(mobileState.pageErrors, []);
  await mobile.close();
} finally {
  await session.stop();
}

console.log('✓ Registros, inspector, drawer, labels, foco, Escape, mobile e reduced motion cumprem o contrato acessível.');
