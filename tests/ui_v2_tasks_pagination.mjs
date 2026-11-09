import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [featureSource, presenterSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/tasks.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/views/ui-v2/tasks-presenter.js'), 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 TASKS LIST PAGINATION');
console.log('===============================================================\n');

// Contrato estático: paginação da lista é apresentação local; Kanban,
// Store único, CRUD e timers seguem intactos.
assert.match(featureSource, /export const TASK_LIST_PAGE_SIZES/);
assert.match(featureSource, /export const TASK_LIST_DEFAULT_PAGE_SIZE/);
assert.match(featureSource, /TASK_LIST_PAGE_SIZES = Object\.freeze\(\[25, 100, 500, 1000]\)/);
assert.match(featureSource, /setTaskListPageSize\(value\)/);
assert.match(featureSource, /setTaskListPage\(value\)/);
assert.match(featureSource, /handleTaskPaginationClick\(event\)/);
assert.match(featureSource, /get taskListPagination\(\)/);
assert.match(featureSource, /renderTaskList\(\{ resetPage/);
assert.match(presenterSource, /renderTaskPagination\(\{ pagination/);
assert.match(presenterSource, /data-task-page/);
assert.match(presenterSource, /data-task-page-size/);
assert.match(presenterSource, /aria-label="Paginação de tarefas"/);
assert.doesNotMatch(presenterSource, /\bStore\b|\bfetch\s*\(|\.save\s*\(|\.flush\s*\(|\.audit\s*\(|setInterval|clearInterval|\/api\//);
for (const forbiddenSideEffect of ['console.log', 'fetch(', 'XMLHttpRequest', 'WebSocket']) {
  assert.equal(featureSource.includes(forbiddenSideEffect), false, `Tasks não pode introduzir ${forbiddenSideEffect}.`);
}

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { probe: true });
  await page.evaluate(() => {
    const tasks = [];
    for (let i = 0; i < 250; i++) {
      tasks.push({
        id: `vlist-${i}`,
        title: `Providencia lista sintetica ${String(i).padStart(3, '0')}`,
        status: 'andamento',
        deadline: '2026-12-31',
        client: 'Cliente Lista'
      });
    }
    window.Atrium.Store.state.tasks = tasks;
    window.Atrium.Store.state.audit = [];
  });
  await page.evaluate(() => window.Atrium.App.switchView('kanban'));
  await page.locator('#view-kanban.active').waitFor();
  await page.locator('[data-task-view-mode="list"]').click();
  await page.locator('#taskListPanel:not(.hidden)').waitFor();

  const initial = await page.evaluate(() => ({
    audit: window.Atrium.Store.state.audit.length,
    requests: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));

  // Padrão: 25 por página, para a tela abrir curta; a partir daqui o teste usa 100.
  assert.equal(await page.locator('[data-task-page-size="25"]').getAttribute('aria-pressed'), 'true');
  await page.locator('[data-task-page-size="100"]').click();
  // Com 100 por página, primeira de três; Kanban com teto por coluna.
  assert.equal(await page.locator('#taskList [data-task-list-id]').count(), 100);
  assert.match(await page.locator('.task-pagination-status').textContent(), /Página 1 de 3 · 250 no filtro/);
  assert.equal(await page.locator('[data-task-page-size="100"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-task-page="first"]').isDisabled(), true);
  assert.equal(await page.locator('#kanbanBoard [data-column="andamento"] [data-task-id]').count(), 200);
  assert.match(await page.locator('#kanbanBoard [data-column="andamento"] .kanban-column-more').textContent(), /Mostrando 200 de 250/);
  assert.match(await page.locator('#kanbanBoard [data-column="andamento"] .column-count').textContent(), /250/);

  // Navegação: 2, 3 e volta.
  await page.locator('[data-task-page="next"]').click();
  assert.match(await page.locator('.task-pagination-status').textContent(), /Página 2 de 3/);
  assert.equal(await page.locator('#taskList [data-task-list-id]').count(), 100);
  await page.locator('[data-task-page="next"]').click();
  assert.match(await page.locator('.task-pagination-status').textContent(), /Página 3 de 3/);
  assert.equal(await page.locator('#taskList [data-task-list-id]').count(), 50);
  assert.equal(await page.locator('[data-task-page="next"]').isDisabled(), true);
  await page.locator('[data-task-page="prev"]').click();
  assert.match(await page.locator('.task-pagination-status').textContent(), /Página 2 de 3/);

  // Tamanho 500: tudo em uma página.
  await page.locator('[data-task-page-size="500"]').click();
  assert.match(await page.locator('.task-pagination-status').textContent(), /Página 1 de 1 · 250 no filtro/);
  assert.equal(await page.locator('#taskList [data-task-list-id]').count(), 250);

  // Busca reseta para a primeira página.
  await page.locator('[data-task-page-size="100"]').click();
  await page.locator('[data-task-page="next"]').click();
  await page.locator('#taskListSearch').fill('sintetica 001');
  assert.match(await page.locator('.task-pagination-status').textContent(), /Página 1 de 1 · 1 no filtro/);
  assert.equal(await page.locator('#taskList [data-task-list-id]').count(), 1);
  await page.locator('#taskListSearch').fill('');
  assert.equal(await page.locator('#taskList [data-task-list-id]').count(), 100);

  // Segurança de apresentação: sem auditoria, request ou timer da paginação.
  const safety = await page.evaluate(() => ({
    audit: window.Atrium.Store.state.audit.length,
    requests: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));
  assert.deepEqual(safety, initial, 'Paginação não pode auditar, requisitar ou criar timer.');

  // Mobile: alvos de toque e ausência de overflow global.
  await page.setViewportSize({ width: 390, height: 844 });
  const targets = await page.locator('.task-pagination button:visible').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { label: element.getAttribute('aria-label') || element.textContent.trim(), height: rect.height };
  }));
  const undersized = targets.filter(item => item.height < 43.5);
  assert.deepEqual(undersized, [], `Paginação mobile abaixo de 44px: ${JSON.stringify(undersized)}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  assert.ok(overflow <= 2, `Paginação mobile não pode gerar overflow global: ${overflow}px.`);

  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ Tarefas V2 pagina a lista em 100/500/1000 sem travar, com teto por coluna no Kanban e segurança de apresentação.');
