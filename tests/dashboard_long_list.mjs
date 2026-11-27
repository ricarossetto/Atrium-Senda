import './fixtures/omni-network.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { CNJ } from './fixtures/omni-network.mjs';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';
const session = await startUiV2Session();
await mkdir('artifacts/omni-ui', { recursive: true });
await mkdir('artifacts/header-alignment-qa', { recursive: true });
try {
  for (const width of [1440, 390]) {
    const context = await session.createContext({ viewport: { width, height: 900 } });
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
    await page.evaluate(number => {
      const { Store, App } = window.Atrium;
      Store.state.processes = [{ id: 'long-process', number, client: 'Cliente Sintético', actionType: 'Danos materiais' }];
      Store.state.tasks = Array.from({ length: 40 }, (_, i) => ({ id: 'long-' + i, title: 'Tarefa Sintética ' + (i + 1), processId: 'long-process', status: 'andamento', deadline: '2099-01-02', responsible: 'Equipe Sintética' }));
      App.renderAll();
    }, CNJ);

    // Padrão limita em 10 tarefas para manter a Caixa de atividades acessível.
    assert.equal(await page.locator('#dashboardTaskLimitSelect').inputValue(), '10');
    assert.equal(await page.locator('#dashboardTaskList [data-dashboard-task-id]').count(), 10);
    assert.equal(await page.locator('.dashboard-actionable-insights-header').textContent().then(t => t.includes('Somente dados registrados no ATRIUM')), false, 'Texto redundante removido.');

    await page.locator('#dashboardTaskLimitSelect').selectOption('5');
    assert.equal(await page.locator('#dashboardTaskList [data-dashboard-task-id]').count(), 5);

    if (width === 1440) {
      await page.locator('.dashboard-tasks-header').scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -88));
      await page.screenshot({ path: 'artifacts/header-alignment-qa/dashboard-tasks-1440-light.png', animations: 'disabled' });
    }

    await page.locator('#dashboardTaskLimitSelect').selectOption('20');
    assert.equal(await page.locator('#dashboardTaskList [data-dashboard-task-id]').count(), 20);
    await page.locator('#dashboardTaskLimitSelect').selectOption('50');
    assert.equal(await page.locator('#dashboardTaskList [data-dashboard-task-id]').count(), 40);

    const layout = await page.evaluate(() => {
      const list = document.querySelector('#dashboardTaskList'), secondary = document.querySelector('.activity-inbox');
      const style = getComputedStyle(list), rect = list.getBoundingClientRect();
      const limitBox = document.querySelector('.dashboard-task-limit-control')?.getBoundingClientRect();
      const sortBox = document.querySelector('#dashboardTaskSortSelect')?.closest('.inbox-sort-control')?.getBoundingClientRect();
      const tabsBox = document.querySelector('#dashboardTaskFilters')?.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        secondaryTop: secondary.getBoundingClientRect().top,
        maxHeight: style.maxHeight,
        overflow: document.documentElement.scrollWidth - innerWidth,
        controlHeights: limitBox && sortBox && tabsBox ? [Math.round(limitBox.height), Math.round(sortBox.height), Math.round(tabsBox.height)] : []
      };
    });
    assert.ok(layout.bottom <= layout.secondaryTop);
    assert.equal(layout.maxHeight, 'none');
    assert.ok(layout.overflow <= 1);
    if (width === 1440) {
      assert.ok(Math.max(...layout.controlHeights) - Math.min(...layout.controlHeights) <= 1, `Controles da Área de trabalho devem ter a mesma altura (${layout.controlHeights.join(', ')}px).`);
    }
    assert.match(await page.locator('[data-dashboard-task-id="long-0"]').textContent(), /Cliente Sintético/);
    assert.match(await page.locator('[data-dashboard-task-id="long-0"]').textContent(), /Danos materiais/);
    await page.locator('#dashboardTaskList').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/omni-ui/dashboard-long-${width}.png` });
    await page.locator('[data-dashboard-task-id="long-0"] .dashboard-task-title').click();
    await page.locator('#modalBackdrop[data-modal-mode="task"]:not(.hidden)').waitFor();
    assert.equal(await page.locator('#field-title').inputValue(), 'Tarefa Sintética 1');
    await page.keyboard.press('Escape');

    if (width === 1440) {
      // Confere títulos restaurados e alturas idênticas nos cabeçalhos de Tarefas e Agenda.
      await switchUiV2View(page, 'kanban');
      const taskHeader = await page.evaluate(() => {
        const h2 = document.querySelector('#view-kanban .v2-task-heading h2');
        const chip = document.getElementById('taskResultCount')?.getBoundingClientRect();
        const sw = document.getElementById('taskViewSwitch')?.getBoundingClientRect();
        const btns = [...document.querySelectorAll('#view-kanban .toolbar-actions .button')].filter(b => b.getClientRects().length).map(b => Math.round(b.getBoundingClientRect().height));
        return {
          h2Height: h2 ? Math.round(h2.getBoundingClientRect().height) : 0,
          heights: [Math.round(chip?.height || 0), Math.round(sw?.height || 0), ...btns]
        };
      });
      assert.ok(taskHeader.h2Height >= 24, `Título de Tarefas restaurado e visível (${taskHeader.h2Height}px).`);
      assert.ok(Math.max(...taskHeader.heights) - Math.min(...taskHeader.heights) <= 1, `Cabeçalho de Tarefas com alturas uniformes (${taskHeader.heights.join(', ')}px).`);
      await page.screenshot({ path: 'artifacts/header-alignment-qa/tasks-header-1440-light.png', animations: 'disabled' });

      await switchUiV2View(page, 'agenda');
      const agendaHeader = await page.evaluate(() => {
        const h2 = document.querySelector('#view-agenda .v2-agenda-heading h2');
        const tabs = document.getElementById('agendaFilterTabs')?.getBoundingClientRect();
        const btns = [...document.querySelectorAll('#view-agenda .toolbar-actions .button')].filter(b => b.getClientRects().length).map(b => Math.round(b.getBoundingClientRect().height));
        return {
          h2Height: h2 ? Math.round(h2.getBoundingClientRect().height) : 0,
          heights: [Math.round(tabs?.height || 0), ...btns]
        };
      });
      assert.ok(agendaHeader.h2Height >= 24, `Título de Agenda restaurado e visível (${agendaHeader.h2Height}px).`);
      assert.ok(Math.max(...agendaHeader.heights) - Math.min(...agendaHeader.heights) <= 1, `Cabeçalho de Agenda com alturas uniformes (${agendaHeader.heights.join(', ')}px).`);
      await page.screenshot({ path: 'artifacts/header-alignment-qa/agenda-header-1440-light.png', animations: 'disabled' });
    }

    assert.deepEqual(pageErrors, []);
    await context.close();
    console.log('PASS long dashboard list + header alignment ' + width + 'px');
  }
} finally { await session.stop(); }
