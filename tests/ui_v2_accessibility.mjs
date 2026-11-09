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
  assert.equal(
    await page.evaluate(() => document.activeElement?.id),
    'modalSizeToggle',
    'Tab deve permanecer contido no modal compartilhado, retornando ao primeiro controle do cabeçalho.'
  );
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'modalClose', 'O Tab segue do tamanho para o fechar.');
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

    assert.equal(await mobile.page.locator('#globalSearch').getAttribute('placeholder'), 'Pesquisar', 'O mobile não deve anunciar atalho de teclado na busca.');
    assert.equal(await mobile.page.locator('.global-search kbd').isVisible(), false, 'O badge de atalho não deve aparecer no mobile.');

    await mobile.page.waitForFunction(() => {
      const bar = document.getElementById('systemStatusBar');
      return bar?.classList.contains('is-transient-hidden') && bar.getBoundingClientRect().height <= 2;
    }, null, { timeout: 5000 });
    const collapsed = await mobile.page.evaluate(() => {
      const bar = document.getElementById('systemStatusBar');
      const rect = bar.getBoundingClientRect();
      return { height: Math.round(rect.height), opacity: Number(getComputedStyle(bar).opacity), pointerEvents: getComputedStyle(bar).pointerEvents };
    });
    assert.ok(collapsed.height <= 2, `A barra de status transitória deve recolher no mobile (altura ${collapsed.height}px).`);
    assert.ok(collapsed.opacity <= 0.05, `A barra recolhida deve ficar invisível (opacidade ${collapsed.opacity}).`);
    assert.equal(collapsed.pointerEvents, 'none', 'A barra recolhida não pode capturar toques.');

    await mobile.page.evaluate(() => window.Atrium.App.switchView('agenda'));
    await mobile.page.locator('#view-agenda.active').waitFor();
    const agendaFilters = await mobile.page.evaluate(() => {
      const container = document.getElementById('agendaFilterTabs');
      const buttons = [...container.querySelectorAll('button')];
      const tops = new Set(buttons.map(button => Math.round(button.getBoundingClientRect().top)));
      return { display: getComputedStyle(container).display, rows: tops.size, count: buttons.length };
    });
    assert.equal(agendaFilters.count, 4);
    assert.equal(agendaFilters.rows, 1, 'Os filtros da Agenda devem ocupar uma única faixa no mobile.');
    await mobile.page.evaluate(() => window.Atrium.App.switchView('dashboard'));
    await mobile.page.locator('.notification-button').click();
    const panel = await mobile.page.locator('.notification-panel:not(.hidden)').boundingBox();
    assert.ok(panel && panel.x >= 0 && panel.x + panel.width <= 390, 'Notificações precisam permanecer inteiras dentro da largura mobile.');
    await mobile.page.locator('.notification-button').click();
    await mobile.page.evaluate(() => window.Atrium.App.switchView('configuration'));
    await mobile.page.locator('#view-configuration.active').waitFor();
    assert.equal(await mobile.page.locator('#uiModeControl, [data-ui-mode]').count(), 0, 'O modo Classic não pode ser selecionável no produto.');
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
