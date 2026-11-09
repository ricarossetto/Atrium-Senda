import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startUiV2Session, prepareUiV2Page, prepareUiV2TasksFixture, prepareUiV2ProcessesFixture, prepareUiV2PublicationsFixture, switchUiV2View } from './ui_v2_helpers.mjs';

console.log('=== Equipe: filtros por membro e painel de convites (visual + comportamento) ===');
const shots = fs.mkdtempSync(path.join(os.tmpdir(), 'atrium-team-filters-'));

async function geometry(page, selector) {
  return page.locator(selector).evaluate(element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, display: style.display, overflow: document.documentElement.scrollWidth - innerWidth };
  });
}

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1280, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
    await prepareUiV2TasksFixture(page);
    await prepareUiV2ProcessesFixture(page);

    await switchUiV2View(page, 'kanban');
    await page.locator('#taskListViewButton').click();
    const mineBox = page.locator('#taskListMineOnly');
    assert.equal(await mineBox.count(), 1, 'Filtro apenas meus itens deve existir na lista de tarefas.');
    assert.ok(await mineBox.isVisible(), 'Filtro deve estar visível em 1280.');
    const mineGeo = await geometry(page, '#taskListMineOnly');
    assert.ok(mineGeo.height >= 16 && mineGeo.height <= 44, `Checkbox com altura útil: ${mineGeo.height}px.`);
    assert.ok(mineGeo.overflow <= 1, 'Toolbar de tarefas sem overflow global.');
    const countBefore = await page.locator('#taskListVisibleCount').textContent();
    await mineBox.check();
    await page.waitForTimeout(300);
    assert.ok((await page.locator('#taskListVisibleCount').textContent()) !== undefined, 'Lista re-renderiza após o filtro.');
    await mineBox.uncheck();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#taskListVisibleCount').textContent(), countBefore, 'Desmarcar restaura a lista.');
    await page.locator('.task-list-controls').screenshot({ path: path.join(shots, 'tasks-toolbar-light-1280.png') });

    await switchUiV2View(page, 'processes');
    const procBox = page.locator('#processMineOnly');
    assert.equal(await procBox.count(), 1, 'Filtro apenas meus processos deve existir.');
    assert.ok(await procBox.isVisible(), 'Filtro deve estar visível na carteira.');
    const procGeo = await geometry(page, '#processMineOnly');
    assert.ok(procGeo.height >= 16 && procGeo.height <= 44, `Checkbox com altura útil: ${procGeo.height}px.`);
    assert.ok(procGeo.overflow <= 1, 'Busca de processos sem overflow global.');
    await page.locator('#view-processes .table-search').screenshot({ path: path.join(shots, 'processes-search-light-1280.png') });

    await prepareUiV2PublicationsFixture(page);
    await switchUiV2View(page, 'inbox');
    const pubMineBox = page.locator('#publicationMineOnly');
    assert.equal(await pubMineBox.count(), 1, 'Filtro só processos em que atuo deve existir em publicações.');
    assert.ok(await pubMineBox.isVisible(), 'Filtro deve estar visível no toolbar de publicações.');
    const pubMineGeo = await geometry(page, '#publicationMineOnly');
    assert.ok(pubMineGeo.height >= 16 && pubMineGeo.height <= 44, `Checkbox de publicações com altura útil: ${pubMineGeo.height}px.`);
    assert.ok(pubMineGeo.overflow <= 1, 'Toolbar de publicações sem overflow global.');

    await page.evaluate(() => {
      const { App, Store } = window.Atrium;
      const me = window.KellerAuth.currentUser || {};
      const involved = Store.state.processes.find(process => process.id === 'ui-v2-publication-process');
      involved.responsibleUserIds = [me.id || me.username];
      involved.responsible = me.displayName || me.username;
      Store.state.processes.push({ id: 'ui-v2-publication-other', number: '5009999-99.2026.8.21.0001', client: 'Cliente Alheio Sintético' });
      const urgent = Store.state.intimations.find(item => item.id === 'ui-v2-publication-urgent');
      urgent.process = '5009999-99.2026.8.21.0001';
      App.renderAll();
    });
    await switchUiV2View(page, 'inbox');
    const urgentRow = page.locator('#inboxList [data-intimation-id="ui-v2-publication-urgent"]');
    await pubMineBox.uncheck();
    await urgentRow.waitFor({ state: 'visible' });
    await pubMineBox.check();
    await urgentRow.waitFor({ state: 'hidden' });
    await pubMineBox.uncheck();
    await urgentRow.waitFor({ state: 'visible' });

    await page.locator('#view-inbox .section-toolbar').screenshot({ path: path.join(shots, 'publications-toolbar-light-1280.png') });

    await switchUiV2View(page, 'admin');
    await page.locator('[data-admin-tab="users"]').click();
    await page.locator('#adminInviteForm').waitFor();
    assert.ok(await page.locator('#adminInviteName').isVisible(), 'Campo nome do convite visível.');
    assert.ok(await page.locator('#adminInviteEmail').isVisible(), 'Campo e-mail do convite visível.');
    await page.fill('#adminInviteName', 'Colega Teste');
    await page.fill('#adminInviteEmail', 'colega@example.test');
    await page.locator('#btnAdminInvite').click();
    await page.locator('#toastRegion .toast.success', { hasText: 'Convite criado' }).waitFor();
    await page.locator('.admin-table tbody tr', { hasText: 'colega@example.test' }).waitFor();
    const inviteGeo = await geometry(page, '#adminInviteForm');
    assert.ok(inviteGeo.overflow <= 1, 'Cartão de convites sem overflow global.');
    await page.locator('.admin-invite-card').first().screenshot({ path: path.join(shots, 'admin-invites-light-1280.png') });

    assert.equal(await page.locator('#sidebarOfficeLabel').textContent(), 'Escritório', 'Cartão usa rótulo fixo curto.');
    assert.equal(await page.locator('.profile-copy strong').textContent(), 'Advogada', 'Chip mostra o primeiro nome.');
    assert.equal(await page.locator('.profile-copy small').textContent(), 'Advogado', 'Chip mostra o papel curto.');
    const profileTitle = await page.locator('#profileButton').getAttribute('title');
    assert.ok(profileTitle.includes('Advogada Teste UI V2'), 'Tooltip preserva a identidade completa.');

    await page.locator('.sidebar-office').click();
    await page.locator('#officeSetupBackdrop:not(.hidden)').waitFor();
    await page.waitForTimeout(500);
    const drawerScroll = await page.evaluate(() => {
      const form = document.getElementById('officeSetupForm');
      const layout = document.querySelector('.office-identity-layout');
      const scroller = layout.scrollHeight > layout.clientHeight + 2 ? layout : null;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      const footer = form.querySelector(':scope > footer');
      const footerRect = footer.getBoundingClientRect();
      return {
        formScrolls: form.scrollHeight > form.clientHeight + 2,
        footerVisible: footerRect.top >= 0 && footerRect.bottom <= innerHeight + 1,
        saveVisible: document.getElementById('officeSetupForm').querySelector('button[type="submit"]').getBoundingClientRect().bottom <= innerHeight + 1
      };
    });
    assert.equal(drawerScroll.formScrolls, false, 'Só a área de conteúdo rola; o rodapé não é arrastado.');
    assert.equal(drawerScroll.footerVisible, true, 'Rodapé com Cancelar/Salvar permanece visível ao fim da rolagem.');
    assert.equal(drawerScroll.saveVisible, true, 'Botão salvar alcançável sem sobreposição.');
    await page.screenshot({ path: path.join(shots, 'office-drawer-scrolled-light-1280.png') });
    assert.deepEqual(pageErrors, [], 'Sem erros de página no fluxo.');
  } finally {
    await context.close();
  }

  const mobile = await session.createContext({ viewport: { width: 390, height: 844 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(mobile, session.server.baseUrl, { theme: 'dark' });
    await prepareUiV2TasksFixture(page);
    await switchUiV2View(page, 'kanban');
    await page.locator('#taskListViewButton').click();
    await page.locator('#taskFiltersToggle').click();
    const mineBox = page.locator('#taskListMineOnly');
    assert.ok(await mineBox.isVisible(), 'Filtro visível em 390px dark.');
    const mineGeo = await geometry(page, '#taskListMineOnly');
    assert.ok(mineGeo.overflow <= 1, 'Sem overflow global em 390px dark.');
    await page.locator('.task-list-controls').screenshot({ path: path.join(shots, 'tasks-toolbar-dark-390.png') });

    await prepareUiV2PublicationsFixture(page);
    await switchUiV2View(page, 'inbox');
    await page.locator('#inboxFiltersToggle').click();
    const mobilePubMine = page.locator('#publicationMineOnly');
    assert.ok(await mobilePubMine.isVisible(), 'Filtro de publicações visível em 390px dark.');
    const mobilePubGeo = await geometry(page, '#publicationMineOnly');
    assert.ok(mobilePubGeo.overflow <= 1, 'Sem overflow global em publicações 390px dark.');
    await page.locator('#view-inbox .section-toolbar').screenshot({ path: path.join(shots, 'publications-toolbar-dark-390.png') });
    assert.deepEqual(pageErrors, [], 'Sem erros de página no mobile dark.');
  } finally {
    await mobile.close();
  }
} finally {
  await session.stop();
}
console.log(`team_filters: PASS (prints em ${shots})`);
process.exit(0);
