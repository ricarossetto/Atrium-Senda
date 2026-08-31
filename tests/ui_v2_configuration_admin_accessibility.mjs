import assert from 'node:assert/strict';
import {
  prepareUiV2ConfigurationAdminFixture,
  prepareUiV2Page,
  startUiV2Session
} from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 CONFIGURATION + ADMIN ACCESSIBILITY');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const desktopResult = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'dark' });
  const page = desktopResult.page;
  await prepareUiV2ConfigurationAdminFixture(page);

  assert.equal(await page.locator('#configurationTabs').getAttribute('role'), 'navigation');
  assert.equal(await page.locator('#configurationTabs').getAttribute('aria-label'), 'Seções administrativas');
  assert.equal(await page.locator('[data-config-section="taskDefinitions"]').getAttribute('aria-current'), 'page');
  assert.equal(await page.locator('#configurationSearch').getAttribute('aria-label'), 'Buscar na configuração ativa');
  assert.equal(await page.locator('#configurationList').getAttribute('role'), 'list');
  assert.match(await page.locator('#configurationList').getAttribute('aria-label'), /Tarefas/);

  const firstRow = page.locator('.config-row-open').first();
  await firstRow.focus();
  await page.keyboard.press('Enter');
  await page.locator('#modalBackdrop[data-modal-mode="configuration"]:not(.hidden)').waitFor();
  await page.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
  assert.equal(await page.locator('#modalBackdrop .modal').getAttribute('aria-modal'), 'true');
  assert.equal(await page.locator('#modalBackdrop .modal').getAttribute('aria-labelledby'), 'modalTitle');
  await page.keyboard.press('Escape');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('config-row-open')), true);

  const deleteButtons = page.locator('[data-delete-config]');
  assert.equal(await deleteButtons.count(), 2);
  for (const label of await deleteButtons.evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')))) {
    assert.match(label, /^Excluir /);
  }

  await page.locator('[data-config-section="users"]').click();
  await page.locator('[data-auth-user-id]').first().waitFor();
  for (const row of await page.locator('[data-auth-user-id]').all()) {
    assert.match(await row.textContent(), /Administrador mestre|Colaborador/);
    assert.match(await row.textContent(), /Ativo|Suspenso|Aguardando aprovação/);
  }
  assert.equal(await page.locator('[data-auth-user-id="master-admin-synthetic"] [data-auth-user-status]').count(), 0);

  const officeTrigger = page.locator('#openOfficeIdentityFromConfiguration');
  assert.equal(await officeTrigger.getAttribute('aria-haspopup'), 'dialog');
  await officeTrigger.focus();
  await officeTrigger.click();
  await page.locator('#officeSetupBackdrop:not(.hidden)').waitFor();
  await page.waitForFunction(() => document.activeElement?.id === 'officeInputName');
  assert.equal(await page.locator('.office-setup-modal').getAttribute('aria-labelledby'), 'officeSetupTitle');
  assert.equal(await page.locator('.office-setup-modal').getAttribute('aria-describedby'), 'officeSetupDescription');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), '');
  for (const id of ['officeInputName', 'officeInputSlogan', 'officeInputLawyer', 'officeInputOab', 'officeInputAddress', 'officeInputCity']) {
    assert.equal(await page.locator(`label:has(#${id})`).count(), 1, `${id} precisa de label associado.`);
  }
  await page.locator('#officeSetupForm button[type="submit"]').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'officeSetupClose');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.matches('#officeSetupForm button[type="submit"]')), true);
  await page.keyboard.press('Escape');
  await page.locator('#officeSetupBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'openOfficeIdentityFromConfiguration');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), null);

  await page.locator('[data-config-section="diagnostic"]').click();
  await page.locator('.diagnostic-v2-panel').waitFor();
  assert.equal(await page.locator('.diagnostic-v2-panel [aria-labelledby="diagnosticActionsTitle"]').count(), 1);
  assert.equal(await page.locator('.diagnostic-v2-panel .configuration-status-badge').count(), 4);
  for (const id of ['btnExportDiagnosticJson', 'btnOpenFeedbackModal', 'btnClearUiCache', 'btnResetVisualPrefs', 'btnRebuildRuntime', 'btnManagePortalSessions']) {
    assert.ok((await page.locator(`#${id}`).textContent()).trim().length > 3, `${id} precisa de nome visível.`);
  }

  await page.locator('#btnOpenFeedbackModal').focus();
  await page.locator('#btnOpenFeedbackModal').click();
  await page.locator('#modalBackdrop[data-modal-mode="feedback"]:not(.hidden)').waitFor();
  await page.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
  for (const id of ['field-type', 'field-component', 'field-message']) assert.equal(await page.locator(`label[for="${id}"]`).count(), 1);
  await page.keyboard.press('Escape');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'btnOpenFeedbackModal');

  const duplicates = await page.locator('[id]').evaluateAll(nodes => {
    const ids = nodes.map(node => node.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  assert.deepEqual(duplicates, []);
  assert.deepEqual(desktopResult.pageErrors, []);
  await desktop.close();

  const mobile = await session.createContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const mobileResult = await prepareUiV2Page(mobile, session.server.baseUrl, { theme: 'light' });
  const mobilePage = mobileResult.page;
  await prepareUiV2ConfigurationAdminFixture(mobilePage, { withLogo: true });
  const baseLayout = await mobilePage.locator('#view-configuration').evaluate(view => ({
    pageOverflow: document.documentElement.scrollWidth - innerWidth,
    viewOverflow: view.scrollWidth - view.clientWidth,
    horizontalTabs: getComputedStyle(document.getElementById('configurationTabs')).overflowX,
    undersized: [...view.querySelectorAll('button, input')]
      .filter(element => element.getClientRects().length)
      .filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width < 43.5 || rect.height < 43.5;
      })
      .map(element => element.id || element.textContent.trim())
  }));
  assert.ok(baseLayout.pageOverflow <= 2, `Overflow global mobile: ${baseLayout.pageOverflow}px`);
  assert.ok(baseLayout.viewOverflow <= 2, `Overflow da view mobile: ${baseLayout.viewOverflow}px`);
  assert.deepEqual(baseLayout.undersized, []);

  await mobilePage.locator('#openOfficeIdentityFromConfiguration').click();
  await mobilePage.locator('#officeSetupBackdrop:not(.hidden)').waitFor();
  await mobilePage.waitForFunction(() => document.querySelector('#officeSetupBackdrop [role="dialog"]')?.contains(document.activeElement));
  const officeLayout = await mobilePage.locator('.office-setup-modal').evaluate(dialog => {
    const rect = dialog.getBoundingClientRect();
    const interactive = [...dialog.querySelectorAll('button, input')].filter(element => element.getClientRects().length);
    return {
      left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      viewportWidth: innerWidth, viewportHeight: innerHeight,
      overflow: dialog.scrollWidth - dialog.clientWidth,
      animationName: getComputedStyle(dialog).animationName,
      undersized: interactive.filter(element => {
        const target = element.getBoundingClientRect();
        return target.width < 43.5 || target.height < 43.5;
      }).map(element => element.id || element.textContent.trim())
    };
  });
  assert.ok(officeLayout.left >= -2 && officeLayout.right <= officeLayout.viewportWidth + 2);
  assert.ok(officeLayout.top >= -2 && officeLayout.bottom <= officeLayout.viewportHeight + 2);
  assert.ok(officeLayout.overflow <= 2);
  assert.equal(officeLayout.animationName, 'none');
  assert.deepEqual(officeLayout.undersized, []);
  await mobilePage.keyboard.press('Escape');

  await mobilePage.locator('[data-config-section="backups"]').click();
  await mobilePage.locator('.backup-v2-panel').waitFor();
  const backupLayout = await mobilePage.locator('.backup-v2-panel').evaluate(panel => ({
    pageOverflow: document.documentElement.scrollWidth - innerWidth,
    panelOverflow: panel.scrollWidth - panel.clientWidth,
    restoreTarget: (() => {
      const rect = panel.querySelector('.configuration-restore-button').getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    })()
  }));
  assert.ok(backupLayout.pageOverflow <= 2);
  assert.ok(backupLayout.panelOverflow <= 2);
  assert.ok(backupLayout.restoreTarget.width >= 43.5 && backupLayout.restoreTarget.height >= 43.5);
  assert.deepEqual(mobileResult.pageErrors, []);
  await mobile.close();
} finally {
  await session.stop();
}

console.log('✓ UI V2 Configuração/Admin: navegação, foco, Escape, retorno, mobile, targets e overflow PASS.');
