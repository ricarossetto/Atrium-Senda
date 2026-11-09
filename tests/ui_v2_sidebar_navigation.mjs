import assert from 'node:assert/strict';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('\n=== MENU LATERAL V2 — ORDEM E GRUPOS RECOLHÍVEIS ===\n');

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  assert.equal(await page.locator('#v2MobileNav').isVisible(), false, 'A barra inferior é exclusiva do celular.');

  // Ordem de trabalho pedida: Tarefas, Publicações, Agenda, Processos e casos.
  const workOrder = await page.$$eval('#v2NavWork [data-view]', elements => elements.map(element => element.dataset.view));
  assert.deepEqual(workOrder, ['kanban', 'inbox', 'agenda', 'processes'], `Ordem do grupo Trabalho divergente: ${workOrder.join(', ')}`);
  const workLabels = await page.$$eval('#v2NavWork [data-view]', elements => elements.map(element => element.textContent.trim()));
  assert.match(workLabels[0], /Tarefas/);
  assert.match(workLabels[1], /Publicações/);
  assert.match(workLabels[2], /Agenda/);
  assert.match(workLabels[3], /Processos e casos/);
  console.log('✓ Ordem do grupo Trabalho: Tarefas, Publicações, Agenda, Processos e casos.');

  // Padrão: todos os grupos expandidos, com toggle acessível por grupo.
  const initial = await page.$$eval('[data-v2-nav-toggle]', elements => elements.map(element => ({
    group: element.dataset.v2NavToggle,
    expanded: element.getAttribute('aria-expanded'),
    controls: element.getAttribute('aria-controls'),
    hidden: document.getElementById(element.getAttribute('aria-controls'))?.hidden
  })));
  assert.equal(initial.length, 6, 'Todos os grupos devem ter toggle.');
  assert.ok(initial.every(item => item.expanded === 'true' && item.hidden === false), 'O padrão é todos os grupos expandidos.');
  assert.ok(initial.every(item => item.controls), 'Cada toggle deve apontar para o seu grupo.');
  console.log('✓ Seis grupos com toggle, todos expandidos por padrão.');

  // Recolher e expandir (estado em memória; sem persistência no shell).
  await page.locator('[data-v2-nav-toggle="work"]').click();
  assert.equal(await page.locator('[data-v2-nav-toggle="work"]').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#v2NavWork').evaluate(element => element.hidden), true);
  assert.equal(await page.locator('[data-v2-nav-toggle="work"]').evaluate(element => element.classList.contains('is-collapsed')), true);
  assert.equal(await page.locator('[data-v2-nav-toggle="relationship"]').getAttribute('aria-expanded'), 'true', 'Recolher um grupo não afeta os demais.');

  await page.locator('[data-v2-nav-toggle="work"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('[data-v2-nav-toggle="work"]').getAttribute('aria-expanded'), 'true', 'Enter expande o grupo.');
  assert.equal(await page.locator('#v2NavWork').evaluate(element => element.hidden), false);
  await page.keyboard.press('Space');
  assert.equal(await page.locator('[data-v2-nav-toggle="work"]').getAttribute('aria-expanded'), 'false', 'Espaço recolhe o grupo.');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('[data-v2-nav-toggle="work"]').getAttribute('aria-expanded'), 'true');
  console.log('✓ Recolher/expandir com teclado e sem afetar os demais grupos.');

  // Navegação continua funcionando com o grupo expandido.
  await page.locator('#v2NavWork [data-view="inbox"]').click();
  await page.locator('#view-inbox.active').waitFor();
  console.log('✓ Navegação do grupo permanece funcional.');

  assert.deepEqual(pageErrors, [], `Erros de página: ${pageErrors.join(' | ')}`);
  await context.close();

  // Mobile: o toggle mantém alvo de toque de 44px no drawer.
  const routeContext = await session.createContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
  try {
    const { page } = await prepareUiV2Page(routeContext, session.server.baseUrl, { theme: 'light' });
    await page.evaluate(() => document.body.scrollTo({ top: 650, behavior: 'instant' }));
    await page.waitForFunction(() => document.documentElement.dataset.v2MobileChrome === 'reading');
    const routeStart = await page.evaluate(() => {
      const previous = document.body.scrollTop;
      window.Atrium.App.switchView('kanban');
      return { previous, current: document.body.scrollTop, chrome: document.documentElement.dataset.v2MobileChrome };
    });
    assert.ok(routeStart.previous > 0 && routeStart.current === 0 && routeStart.chrome === 'expanded', `A troca de view deve trazer conteúdo e chrome ao topo juntos: ${JSON.stringify(routeStart)}`);
  } finally {
    await routeContext.close();
  }
  const mobileContext = await session.createContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  try {
    const mobile = await prepareUiV2Page(mobileContext, session.server.baseUrl, { theme: 'dark' });
    const mobileNav = mobile.page.locator('#v2MobileNav');
    assert.equal(await mobileNav.isVisible(), true);
    assert.deepEqual(await mobileNav.locator('button').evaluateAll(buttons => buttons.map(button => button.textContent.trim())), ['Hoje', 'Tarefas', 'Publicações', 'Agenda', 'Mais']);
    await mobile.page.evaluate(() => document.body.scrollTo(0, 650));
    assert.ok(await mobile.page.evaluate(() => document.body.scrollTop) > 0, 'O conteúdo móvel deve rolar no body.');
    await mobile.page.waitForFunction(() => document.documentElement.dataset.v2MobileChrome === 'reading');
    await mobile.page.evaluate(() => document.body.scrollTo(0, 0));
    await mobile.page.waitForFunction(() => document.documentElement.dataset.v2MobileChrome === 'expanded');
    await mobileNav.locator('[data-view-link="kanban"]').click();
    await mobile.page.locator('#view-kanban.active').waitFor();
    assert.equal(await mobile.page.evaluate(() => document.body.scrollTop), 0, 'Trocar de view deve voltar ao topo do body.');
    await mobileNav.locator('[data-view-link="dashboard"]').click();
    await mobile.page.locator('#view-dashboard.active').waitFor();
    await mobileNav.locator('#v2MobileMore').focus();
    await mobile.page.evaluate(() => document.body.scrollTo(0, 500));
    const scrollBeforeMenu = await mobile.page.evaluate(() => document.body.scrollTop);
    assert.equal(await mobile.page.evaluate(() => document.documentElement.dataset.v2MobileChrome), 'expanded', 'Navegação focada deve permanecer visível durante o scroll.');
    await mobileNav.locator('#v2MobileMore').click();
    assert.equal(await mobile.page.evaluate(() => getComputedStyle(document.body).overflowY), 'hidden', 'Menu lateral bloqueia o scroller efetivo.');
    await mobile.page.keyboard.press('Escape');
    assert.equal(await mobile.page.evaluate(() => document.body.scrollTop), scrollBeforeMenu, 'Fechar o menu preserva a posição de leitura.');
    assert.equal(await mobile.page.evaluate(() => getComputedStyle(document.body).overflowY), 'auto', 'Fechar o menu restaura o body scroller.');
    await mobile.page.evaluate(() => document.body.scrollTo(0, 0));
    for (const [view, path] of [['kanban', '/trabalho/tarefas'], ['inbox', '/trabalho/publicacoes'], ['agenda', '/trabalho/agenda']]) {
      await mobileNav.locator(`[data-view-link="${view}"]`).click();
      await mobile.page.locator(`#view-${view}.active`).waitFor();
      assert.equal(new URL(mobile.page.url()).pathname, path);
      assert.equal(await mobileNav.locator(`[data-view-link="${view}"]`).getAttribute('aria-current'), 'page');
    }
    await mobile.page.goBack();
    await mobile.page.locator('#view-inbox.active').waitFor();
    await mobileNav.locator('#v2MobileMore').click();
    assert.equal(await mobileNav.locator('#v2MobileMore').getAttribute('aria-expanded'), 'true');
    await mobile.page.locator('#sidebar.open').waitFor();
    await mobile.page.keyboard.press('Escape');
    assert.equal(await mobileNav.locator('#v2MobileMore').getAttribute('aria-expanded'), 'false');
    assert.equal(await mobile.page.evaluate(() => document.activeElement?.id), 'v2MobileMore');
    await mobileNav.locator('#v2MobileMore').click();
    await mobile.page.locator('#v2NavWork [data-view="processes"]').click();
    await mobile.page.locator('#view-processes.active').waitFor();
    assert.equal(await mobileNav.locator('#v2MobileMore').getAttribute('aria-current'), 'page');
    assert.equal(await mobile.page.evaluate(() => document.activeElement?.id), 'appMain', 'O foco não pode ficar na sidebar recolhida.');
    await mobile.page.waitForFunction(() => getComputedStyle(document.getElementById('v2MobileNav')).transform === 'none');
    const layout = await mobile.page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      const nav = box('#v2MobileNav');
      const statusElement = document.getElementById('systemStatusBar');
      const status = statusElement.getBoundingClientRect();
      const statusStyle = getComputedStyle(statusElement);
      const region = document.querySelector('.toast-region');
      return { nav, status, statusVisible: !statusElement.classList.contains('is-transient-hidden') && statusStyle.opacity === '1' && statusStyle.transform === 'none', toastBottom: getComputedStyle(region).bottom, paddingBottom: getComputedStyle(document.querySelector('.main-content')).paddingBottom, overflow: document.documentElement.scrollWidth - innerWidth };
    });
    assert.ok(layout.overflow <= 1, 'O shell mobile não pode criar overflow horizontal.');
    assert.ok(parseFloat(layout.paddingBottom) >= 180, 'O conteúdo deve ter reserva para barra inferior e status.');
    assert.ok(parseFloat(layout.toastBottom) >= layout.nav.height, 'Toasts devem ficar acima da navegação.');
    if (layout.statusVisible) assert.ok(layout.status.bottom <= layout.nav.top + 1, `O status não pode cobrir a navegação (status.bottom=${layout.status.bottom}, nav.top=${layout.nav.top}, nav=${JSON.stringify(layout.nav)}).`);
    await mobile.page.evaluate(() => {
      const status = document.getElementById('systemStatusBar');
      status.classList.remove('is-transient-hidden');
      status.dataset.status = 'syncing';
      document.getElementById('systemStatusDetail').textContent = 'Sincronização em andamento com verificação de várias fontes e resultados parciais.';
      document.getElementById('systemStatusProgressTrack').classList.remove('hidden');
    });
    await mobile.page.waitForFunction(() => {
      const status = document.getElementById('systemStatusBar');
      const style = getComputedStyle(status);
      return !status.classList.contains('is-transient-hidden') && style.opacity === '1' && style.transform === 'none';
    });
    assert.equal(await mobile.page.locator('#systemStatusBar').evaluate(element => !element.classList.contains('is-transient-hidden') && getComputedStyle(element).opacity === '1' && getComputedStyle(element).transform === 'none'), true, 'O status ativo precisa estar visível antes de verificar a navegação.');
    const runningStatus = await mobile.page.evaluate(() => {
      const nav = document.getElementById('v2MobileNav').getBoundingClientRect();
      const status = document.getElementById('systemStatusBar').getBoundingClientRect();
      return { navTop: nav.top, statusBottom: status.bottom, statusHeight: status.height, reserved: parseFloat(getComputedStyle(document.querySelector('.main-content')).paddingBottom) };
    });
    assert.ok(runningStatus.statusBottom <= runningStatus.navTop + 1, 'Status ativo não pode cobrir a barra inferior.');
    assert.ok(runningStatus.reserved >= runningStatus.statusHeight + layout.nav.height, 'Conteúdo precisa de reserva para status ativo e navegação.');
    await mobile.page.locator('#menuToggle').click();
    await mobile.page.locator('#sidebar.open').waitFor();
    const box = await mobile.page.locator('[data-v2-nav-toggle="work"]').boundingBox();
    assert.ok(box && box.height >= 44, `Toggle de grupo no mobile precisa de 44px de altura (atual: ${box?.height}).`);
    const navTargets = await mobile.page.locator('#sidebar .nav-item:visible').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
    assert.ok(navTargets.every(height => height >= 44), `Destinos do menu mobile precisam de 44px: ${navTargets.join(', ')}`);
    await mobile.page.locator('[data-v2-nav-toggle="work"]').click();
    assert.equal(await mobile.page.locator('#v2NavWork').evaluate(element => element.hidden), true);

    // Abrir a identidade pelo bloco do escritório precisa fechar o drawer antes do sheet,
    // senão o backdrop (z-index 80) fica atrás do drawer (100) e a interface trava inerte.
    await mobile.page.locator('.sidebar-office').click();
    await mobile.page.locator('#officeSetupBackdrop:not(.hidden)').waitFor();
    assert.equal(await mobile.page.locator('#sidebar.open').count(), 0, 'Abrir a identidade deve fechar o menu lateral.');
    assert.equal(await mobileNav.locator('#v2MobileMore').getAttribute('aria-expanded'), 'false');
    const officeOnTop = await mobile.page.evaluate(() => {
      const modal = document.querySelector('#officeSetupBackdrop .office-setup-modal');
      const target = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(innerHeight / 2));
      return Boolean(modal && target && modal.contains(target));
    });
    assert.equal(officeOnTop, true, 'O sheet da identidade não pode ficar atrás do drawer/scrim.');
    await mobile.page.locator('#officeSetupClose').click();
    await mobile.page.locator('#officeSetupBackdrop.hidden').waitFor({ state: 'attached' });
    assert.equal(await mobile.page.locator('#appShell').getAttribute('inert'), null, 'Fechar a identidade deve devolver a interação à aplicação.');
    console.log('✓ Mobile: identidade do escritório abre sobre o drawer sem travar a interface.');

    // A marca fixa no topo é o atalho permanente para a Área de Trabalho.
    await mobile.page.locator('.v2-topbar-brand').click();
    await mobile.page.locator('#view-dashboard.active').waitFor();
    assert.equal(await mobileNav.locator('[data-view-link="dashboard"]').getAttribute('aria-current'), 'page', 'A marca do topo deve retornar para Hoje.');
    console.log('✓ Mobile: marca do topo retorna para a Área de Trabalho.');
    assert.deepEqual(mobile.pageErrors, [], `Erros de página no mobile: ${mobile.pageErrors.join(' | ')}`);
    console.log('✓ Mobile: alvo de 44px e recolhimento no drawer.');
  } finally {
    await mobileContext.close();
  }
} finally {
  await session.stop();
}

console.log('\n>>> MENU LATERAL V2: PASS <<<\n');
