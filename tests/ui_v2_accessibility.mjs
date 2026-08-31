import assert from 'node:assert/strict';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const session = await startUiV2Session();
const desktopContext = await session.createContext();

try {
  const { page, pageErrors } = await prepareUiV2Page(desktopContext, session.server.baseUrl, { theme: 'dark' });
  await page.evaluate(() => {
    window.Atrium.Store.state.contacts.push({
      id: 'contact-ui-v2-accessible',
      name: 'Registro Acessível Sintético',
      document: '000.000.000-00',
      email: 'acessibilidade@example.test',
      phone: '(00) 00000-0000',
      role: 'Cliente Teste'
    });
  });

  const search = page.locator('#globalSearch');
  await search.focus();
  await search.fill('Registro Acessível Sintético');
  await page.locator('#globalSearchPalette:not(.hidden)').waitFor();
  assert.equal(await search.getAttribute('role'), 'combobox');
  assert.equal(await search.getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('ArrowDown');
  const activeId = await search.getAttribute('aria-activedescendant');
  assert.ok(activeId, 'ArrowDown deve definir uma opção ativa acessível.');
  assert.equal(await page.locator(`#${activeId}`).getAttribute('aria-selected'), 'true');
  await page.keyboard.press('ArrowUp');
  assert.ok(await search.getAttribute('aria-activedescendant'), 'ArrowUp deve manter navegação ativa.');
  await page.keyboard.press('Enter');
  await page.locator('#view-contacts.active').waitFor();

  await search.focus();
  await search.fill('Registro Acessível Sintético');
  await page.locator('#globalSearchPalette:not(.hidden)').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await search.getAttribute('aria-expanded'), 'false');
  assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'globalSearch');

  await page.evaluate(() => window.Atrium.App.switchView('dashboard'));
  const trigger = page.locator('#btnDashboardNewTask');
  await trigger.click();
  await page.locator('#modalBackdrop:not(.hidden)').waitFor();
  const submit = page.locator('#modalForm button[type="submit"]');
  await submit.focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'modalClose', 'Tab deve permanecer contido no modal compartilhado.');
  await page.keyboard.press('Escape');
  await page.locator('#modalBackdrop.hidden').waitFor({ state: 'attached' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'btnDashboardNewTask', 'Escape deve devolver foco ao invocador.');

  const duplicateIds = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  assert.deepEqual(duplicateIds, []);
  assert.equal(await page.locator('nav[data-v2-nav-group]').count(), 6, 'A shell V2 deve expor landmarks de navegação por grupo.');
  assert.deepEqual(pageErrors, [], `Acessibilidade desktop gerou pageerror: ${pageErrors.join(' | ')}`);

  const mobileContext = await session.createContext({ viewport: { width: 390, height: 844 } });
  try {
    const mobile = await prepareUiV2Page(mobileContext, session.server.baseUrl, { theme: 'light' });
    for (const selector of ['#menuToggle', '.global-search', '#syncButton', '.notification-button', '#btnDashboardNewTask']) {
      const box = await mobile.page.locator(selector).boundingBox();
      assert.ok(box && box.height >= 44, `${selector} deve possuir target de pelo menos 44px no mobile.`);
    }
    await mobile.page.evaluate(() => window.Atrium.App.switchView('configuration'));
    await mobile.page.locator('#view-configuration.active #uiModeControl').waitFor();
    for (const selector of ['[data-ui-mode="classic"]', '[data-ui-mode="v2"]']) {
      const box = await mobile.page.locator(selector).boundingBox();
      assert.ok(box && box.height >= 44, `${selector} deve possuir target de pelo menos 44px em Configurações no mobile.`);
    }
    await mobile.page.locator('#menuToggle').click();
    await mobile.page.locator('#sidebar.open').waitFor();
    assert.equal(await mobile.page.locator('#menuToggle').getAttribute('aria-expanded'), 'true');
    await mobile.page.keyboard.press('Escape');
    assert.equal(await mobile.page.locator('#menuToggle').getAttribute('aria-expanded'), 'false');
    assert.equal(await mobile.page.evaluate(() => document.activeElement?.id), 'menuToggle', 'O drawer deve devolver foco ao botão de menu.');
    assert.deepEqual(mobile.pageErrors, [], `Acessibilidade mobile gerou pageerror: ${mobile.pageErrors.join(' | ')}`);
  } finally {
    await mobileContext.close();
  }

  console.log('✓ Acessibilidade UI V2 aprovada: combobox, teclado, foco de Dialog/Drawer, landmarks, targets e IDs únicos.');
} finally {
  await desktopContext.close();
  await session.stop();
}
