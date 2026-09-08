import './fixtures/omni-network.mjs';
import assert from 'node:assert/strict';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1186, height: 698 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl);
  await page.evaluate(async () => {
    const { App, Store } = window.Atrium;
    Store.state.contacts.push({
      id: 'process-task-contact',
      name: 'Cliente da Tarefa Processual',
      contactRole: 'cliente'
    });
    Store.state.processes.push({
      id: 'process-task-source',
      number: '5000000-00.2026.8.21.0003',
      client: 'Cliente da Tarefa Processual',
      actionType: 'Execução Contextual Sintética',
      court: 'TJ Sintético'
    });
    Store.save();
    if (!await Store.flush()) throw new Error('Fixture save failed');
    App.renderAll();
    App.switchView('processes');
  });

  const processRow = page.locator('#processTableBody [data-process-id="process-task-source"]');
  await processRow.waitFor();
  await processRow.click();
  await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
  const createTaskButton = page.locator('#processInspectorCreateTask');
  assert.equal(await createTaskButton.isVisible(), true);
  await createTaskButton.click();

  await page.locator('#processInspectorBackdrop.hidden').waitFor({ state: 'attached' });
  await page.locator('#modalBackdrop[data-modal-mode="task"]:not(.hidden)').waitFor();
  assert.equal(await page.locator('#view-processes.active').count(), 1, 'Criar tarefa não deve trocar a view de origem.');
  assert.equal(await page.locator('#field-process').inputValue(), '5000000-00.2026.8.21.0003');
  assert.equal(await page.locator('#modalForm [name="processId"]').inputValue(), 'process-task-source');
  assert.equal(await page.locator('#field-client').inputValue(), 'Cliente da Tarefa Processual');
  assert.equal(await page.locator('#modalForm [name="contactId"]').inputValue(), 'process-task-contact');
  assert.equal(await page.locator('#field-actionType').inputValue(), 'Execução Contextual Sintética');

  await page.locator('#field-title').fill('Tarefa criada pelo processo sintético');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  await page.reload();
  await page.waitForFunction(() => window.Atrium?.Store?.state?.tasks?.some(item => item.title === 'Tarefa criada pelo processo sintético'));
  const saved = await page.evaluate(() => window.Atrium.Store.state.tasks.find(item => item.title === 'Tarefa criada pelo processo sintético'));
  assert.equal(saved.processId, 'process-task-source');
  assert.equal(saved.process, '5000000-00.2026.8.21.0003');
  assert.equal(saved.contactId, 'process-task-contact');
  assert.equal(saved.client, 'Cliente da Tarefa Processual');
  assert.equal(saved.actionType, 'Execução Contextual Sintética');
  assert.deepEqual(pageErrors, []);
  await context.close();
  console.log('PASS Process inspector creates a canonically linked task without changing views');
} finally {
  await session.stop();
}
