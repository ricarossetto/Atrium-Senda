import './fixtures/omni-network.mjs';
import assert from 'node:assert/strict';
import { prepareUiV2Page, prepareUiV2TasksFixture, startUiV2Session } from './ui_v2_helpers.mjs';

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1186, height: 698 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl);
  await prepareUiV2TasksFixture(page);
  await page.evaluate(async () => {
    const { Store } = window.Atrium;
    Store.save();
    if (!await Store.flush()) throw new Error('Fixture save failed');
  });

  assert.equal(await page.locator('[data-view="kanban"] span:last-child').textContent(), 'Gestão de tarefas');
  assert.equal(await page.locator('#view-kanban').getAttribute('data-title'), 'Gestão de tarefas');
  assert.equal(await page.locator('#taskKanbanViewButton').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#kanbanBoard').isVisible(), true);
  assert.equal(await page.locator('#taskListPanel').isHidden(), true);

  await page.locator('#taskListViewButton').click();
  assert.equal(await page.locator('#taskListViewButton').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#taskKanbanViewButton').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#kanbanBoard').isHidden(), true);
  assert.equal(await page.locator('#taskListPanel').isVisible(), true);
  assert.equal(await page.locator('#taskListSummary article').count(), 4);
  assert.equal(await page.locator('#taskList [data-task-list-id]').count(), 6);
  assert.equal(await page.evaluate(() => localStorage.getItem('atrium:tasks:view')), 'list');

  await page.locator('#taskListSearch').fill('5022222-22.2026');
  assert.equal(await page.locator('#taskList [data-task-list-id]').count(), 1);
  assert.match(await page.locator('#taskList').textContent(), /Elaborar minuta de manifestação/);
  await page.locator('#taskListSearch').fill('');
  await page.locator('#taskListStatusFilter').selectOption('completed');
  assert.equal(await page.locator('#taskList [data-task-list-id]').count(), 1);
  assert.match(await page.locator('#taskList').textContent(), /Providência sintética concluída/);
  await page.locator('#taskListStatusFilter').selectOption('all');
  await page.locator('#taskListSort').selectOption('priority');
  assert.equal(await page.locator('#taskList [data-task-list-id]').first().getAttribute('data-task-list-id'), 'ui-v2-task-overdue');

  await page.locator('[data-task-list-id="ui-v2-task-active"] [data-task-list-open]').click();
  await page.locator('#modalBackdrop[data-modal-mode="task"]:not(.hidden)').waitFor();
  assert.equal(await page.locator('#field-title').inputValue(), 'Elaborar minuta de manifestação');
  await page.locator('#modalCancel').click();
  await page.locator('#modalBackdrop.hidden').waitFor({ state: 'attached' });

  await page.reload();
  await page.locator('#view-dashboard.active').waitFor();
  await page.evaluate(() => window.Atrium.App.switchView('kanban'));
  await page.locator('#taskListPanel:not(.hidden)').waitFor();
  assert.equal(await page.locator('#taskListViewButton').getAttribute('aria-pressed'), 'true', 'A preferência visual deve sobreviver ao reload.');
  assert.equal(await page.locator('#taskList [data-task-list-id]').count(), 6);

  await page.locator('#taskKanbanViewButton').click();
  assert.equal(await page.locator('#kanbanBoard').isVisible(), true);
  assert.equal(await page.locator('#taskListPanel').isHidden(), true);
  assert.deepEqual(pageErrors, []);
  await context.close();
  console.log('PASS Task management uses one canonical queue in List and Kanban modes');
} finally {
  await session.stop();
}
