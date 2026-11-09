import assert from 'node:assert/strict';
import { prepareUiV2Page, prepareUiV2TasksFixture, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('=== Tarefas: concluir, excluir e atribuir no navegador ===');

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1280, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
  await prepareUiV2TasksFixture(page);
  await page.evaluate(() => {
    const store = window.Atrium.Store;
    store.state.tasks = [
      { id: 'task-com-prazo', title: 'Tarefa Com Prazo Teste', status: 'triagem', deadline: '2099-12-20', active: true },
      { id: 'task-simples', title: 'Tarefa Simples Teste', status: 'triagem', active: true }
    ];
    document.querySelector('[data-view="kanban"]').click();
    window.Atrium.App.renderAll?.();
  });
  await page.locator('#taskListViewButton').click();
  await page.locator('.task-list-row').first().waitFor();

  const statusOf = id => page.evaluate(taskId => window.Atrium.Store.state.tasks.find(task => task.id === taskId)?.status, id);
  const check = id => page.locator(`.task-list-row[data-task-list-id="${id}"] .task-row-checkbox-label`);

  assert.match(await check('task-simples').innerText(), /Concluir/, 'A caixa diz o que faz.');

  // Sem prazo: conclui e oferece desfazer.
  await check('task-simples').click();
  const undo = page.locator('#toastRegion .toast-action', { hasText: 'Desfazer' }).first();
  await undo.waitFor();
  assert.equal(await statusOf('task-simples'), 'concluida');
  await undo.click();
  await page.waitForFunction(() => window.Atrium.Store.state.tasks.find(task => task.id === 'task-simples')?.status === 'triagem');

  // Com prazo: nada acontece sem confirmar.
  await check('task-com-prazo').click();
  const cancel = page.getByRole('button', { name: 'Não concluir' });
  await cancel.waitFor();
  assert.equal(await statusOf('task-com-prazo'), 'triagem', 'Sem confirmação, a tarefa continua aberta.');
  await cancel.click();
  await page.waitForFunction(() => !document.querySelector('.task-list-row[data-task-list-id="task-com-prazo"] .task-row-checkbox')?.disabled);
  assert.equal(await page.locator('.task-list-row[data-task-list-id="task-com-prazo"] .task-row-checkbox').isChecked(), false, 'A caixa volta como estava.');

  await check('task-com-prazo').click();
  await page.getByRole('button', { name: 'Sim, quero concluir' }).click();
  await page.getByRole('button', { name: 'Concluir tarefa' }).click();
  await page.waitForFunction(() => window.Atrium.Store.state.tasks.find(task => task.id === 'task-com-prazo')?.status === 'concluida');

  // Excluir é recuperável.
  await page.evaluate(() => window.Atrium.App.tasks?.openTaskModal?.(window.Atrium.Store.state.tasks.find(task => task.id === 'task-simples')));
  await page.locator('.task-list-row[data-task-list-id="task-simples"] .task-list-main-col, .task-list-row[data-task-list-id="task-simples"] button').first().click();
  await page.locator('#btnDeleteTask').click();
  await page.getByRole('button', { name: 'Sim, quero excluir' }).click();
  await page.getByRole('button', { name: 'Excluir tarefa' }).last().click();
  await page.waitForFunction(() => window.Atrium.Store.state.tasks.find(task => task.id === 'task-simples')?.active === false);
  await page.locator('.task-list-row[data-task-list-id="task-simples"]').waitFor({ state: 'detached' });
  const persisted = await page.evaluate(async () => {
    const response = await window.KellerAuth.secureFetch('/api/state', { headers: { Accept: 'application/json' } });
    return (await response.json()).state.tasks.find(task => task.id === 'task-simples');
  });
  assert.equal(persisted?.active, false, 'A tarefa continua gravada, para poder voltar.');
  await page.locator('#toastRegion .toast-action', { hasText: 'Desfazer' }).last().click();
  await page.waitForFunction(() => window.Atrium.Store.state.tasks.find(task => task.id === 'task-simples')?.active === true);

  assert.deepEqual(pageErrors, [], `Erros na página: ${pageErrors.join(' | ')}`);
  await context.close();
} finally {
  await session.close?.();
}
console.log('[PASS] Tarefas: concluir, excluir e desfazer funcionam no navegador.');
process.exit(0);
