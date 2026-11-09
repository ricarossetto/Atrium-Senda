import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [searchSource, dashboardSource, tasksPresenterSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/components/global-search.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/features/dashboard.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/views/ui-v2/tasks-presenter.js'), 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — PERF VOLUME REGRESSION GUARD');
console.log('===============================================================\n');

// Contratos estáticos: teto por grupo no primeiro paint local e resolução
// de contexto por índice (sem varredura por comparação de sort).
assert.match(searchSource, /export const LOCAL_GROUP_LIMIT/);
assert.match(searchSource, /export function capGroups/);
assert.match(dashboardSource, /function buildProcessLookup/);
assert.match(dashboardSource, /const resolveTaskContext/);
assert.doesNotMatch(dashboardSource, /taskContext\(a, processes\)/);
assert.doesNotMatch(searchSource, /\bStore\b|\bfetch\s*\(|\bflush\s*\(|\baudit\s*\(|setInterval/);
assert.match(tasksPresenterSource, /export const KANBAN_COLUMN_LIMIT/);
assert.match(tasksPresenterSource, /export function buildTaskLinkLookup/);
assert.match(tasksPresenterSource, /kanban-column-more/);
assert.doesNotMatch(tasksPresenterSource, /\bStore\b|\bfetch\s*\(|\.save\s*\(|\.flush\s*\(|\.audit\s*\(|setInterval|clearInterval|\/api\//);

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl);
  await page.evaluate(() => {
    const contacts = new Array(500);
    for (let i = 0; i < 500; i++) contacts[i] = { id: `v-${i}`, name: `Volume Busca Sintetica ${String(i).padStart(3, '0')}`, contactRole: 'cliente' };
    const processes = new Array(300);
    for (let i = 0; i < 300; i++) processes[i] = { id: `vp-${i}`, number: `5000${String(i).padStart(3, '0')}-11.2026.8.21.0001`, client: `Volume Busca Sintetica ${String(i).padStart(3, '0')}`, court: 'TJRS' };
    const tasks = new Array(600);
    for (let i = 0; i < 600; i++) tasks[i] = { id: `vt-${i}`, title: `Providencia volumetrica ${i}`, status: 'pendente', client: `Volume Busca Sintetica ${String(i % 500).padStart(3, '0')}`, deadline: '2026-12-31' };
    window.Atrium.Store.state.contacts = contacts;
    window.Atrium.Store.state.processes = processes;
    window.Atrium.Store.state.tasks = tasks;
  });

  // Dashboard com volume: orçamento folgado contra os 41s medidos no baseline.
  await switchUiV2View(page, 'dashboard');
  const dashboardMs = await page.evaluate(() => {
    const t0 = performance.now();
    window.Atrium.App.renderDashboard();
    return Math.round(performance.now() - t0);
  });
  assert.ok(dashboardMs < 10000, `renderDashboard com volume estourou: ${dashboardMs}ms.`);
  assert.equal(await page.locator('#dashboardTaskList [data-dashboard-task-id], #dashboardTaskList [data-task-id]').count() > 0, true);

  // Busca global com 500 correspondências: primeiro paint limitado e honesto.
  // (Remota bloqueada para observar o passo local de forma determinística.)
  await context.route('**/api/search*', route => route.abort());
  const t0 = Date.now();
  await page.locator('#globalSearch').fill('Volume Busca');
  await page.locator('#globalSearchPalette:not(.hidden)').waitFor({ timeout: 30000 });
  const searchMs = Date.now() - t0;
  const items = await page.locator('#searchPaletteResults .search-palette-item').count();
  assert.ok(items <= 120, `Paleta local sem teto: ${items} itens.`);
  assert.ok(searchMs < 15000, `Busca local com volume estourou: ${searchMs}ms.`);
  const badges = await page.locator('#searchPaletteResults .search-palette-group-title span').evaluateAll(nodes => nodes.map(node => node.textContent));
  assert.ok(badges.some(text => /10 de 500/.test(text)), `Badge sem total real: ${JSON.stringify(badges.slice(0, 3))}.`);

  // Kanban com volume: teto por coluna, contadores integrais e vínculo por índice.
  await page.evaluate(() => {
    const tasks = new Array(250);
    for (let i = 0; i < 250; i++) tasks[i] = { id: `kt-${i}`, title: `Tarefa Kanban ${i}`, status: 'andamento', processId: 'vp-5', deadline: '2026-12-31' };
    window.Atrium.Store.state.tasks = tasks;
  });
  await switchUiV2View(page, 'kanban');
  const kanbanMs = await page.evaluate(() => {
    const t0 = performance.now();
    window.Atrium.App.renderKanban();
    return Math.round(performance.now() - t0);
  });
  assert.ok(kanbanMs < 8000, `renderKanban com volume estourou: ${kanbanMs}ms.`);
  assert.equal(await page.locator('#kanbanBoard [data-column="andamento"] [data-task-id]').count(), 200);
  assert.match(await page.locator('#kanbanBoard [data-column="andamento"] .kanban-column-more').textContent(), /Mostrando 200 de 250/);
  assert.match(await page.locator('#kanbanBoard [data-column="andamento"] .column-count').textContent(), /250/);
  assert.match(await page.locator('#kanbanBoard [data-column="andamento"] [data-task-id="kt-0"]').textContent(), /Volume Busca Sintetica 005/);

  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ Guarda de volume: dashboard, busca global e kanban limitados com 500+ registros sintéticos.');
