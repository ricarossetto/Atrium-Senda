import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TASK_COLUMNS } from '../js/features/tasks.js';
import { renderTaskCard } from '../js/views/ui-v2/tasks-presenter.js';
import { prepareUiV2Page, prepareUiV2TasksFixture, startUiV2Session } from './ui_v2_helpers.mjs';

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const unitCard = renderTaskCard({
  task: {
    id: 'task-unit', title: 'Tarefa <sintética>', description: 'Descrição & segura', source: 'DJEN', status: 'triagem',
    priority: 'urgente', points: 25, client: 'Cliente Unitário', process: '5000000-00.2026.8.21.0001',
    deadline: '2026-08-20', fatalDeadline: '2026-08-30', responsible: 'Advogada Unitária', timeLogs: [{ minutes: 65 }]
  },
  columns: TASK_COLUMNS,
  activeTaskId: null,
  elapsedLabel: '00:00:00',
  sourceLabel: 'DJEN',
  escapeHtml,
  formatDate: String,
  formatMinutes: minutes => `${minutes}m`,
  totalTimeMinutes: logs => logs.reduce((total, log) => total + Number(log.minutes || 0), 0),
  daysUntil: () => -1,
  initials: () => 'AU'
});
for (const expected of ['task-unit', 'Tarefa &lt;sintética&gt;', 'Descrição &amp; segura', 'Urgente', '25 pts', 'Prazo fatal', '65m apontados', 'Mover para']) {
  assert.ok(unitCard.includes(expected), `Card unitário deve preservar: ${expected}`);
}

const presenterSource = readFileSync(new URL('../js/views/ui-v2/tasks-presenter.js', import.meta.url), 'utf8');
const featureSource = readFileSync(new URL('../js/features/tasks.js', import.meta.url), 'utf8');
assert.doesNotMatch(presenterSource, /\bStore\b|\bfetch\s*\(|\.save\s*\(|\.flush\s*\(|\.audit\s*\(|setInterval|clearInterval|\/api\//, 'Presenter não pode possuir domínio, persistência, rede ou timer.');
assert.equal((featureSource.match(/createTasksFeature\(/g) || []).length, 1, 'A feature funcional canônica deve permanecer única.');
assert.doesNotMatch(featureSource, /createTasksV2Feature/);
assert.deepEqual(TASK_COLUMNS.map(column => column.id), ['triagem', 'prioridade', 'andamento', 'aguardando', 'revisao', 'concluida']);

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });
    await prepareUiV2TasksFixture(page);
    const requests = [];
    page.on('request', request => requests.push({ method: request.method(), url: request.url() }));

    const columns = page.locator('#kanbanBoard .kanban-column');
    assert.equal(await columns.count(), 6);
    assert.deepEqual(await columns.evaluateAll(items => items.map(item => item.dataset.column)), TASK_COLUMNS.map(column => column.id));
    assert.equal(await page.locator('#taskResultCount').textContent(), '6 tarefas');
    assert.equal(await page.locator('#kanbanBoard [data-task-id]').count(), 6, 'Deve existir uma única árvore com seis registros sintéticos.');

    const overdue = await page.locator('[data-task-id="ui-v2-task-overdue"]').textContent();
    for (const expected of ['Revisar contestação sintética', 'Cliente Sintética Tarefas', '5004321-12.2026.8.21.0001', 'Urgente', 'Atrasada']) {
      assert.ok(overdue.includes(expected), `Card atrasado deve mostrar: ${expected}`);
    }
    const fatal = await page.locator('[data-task-id="ui-v2-task-fatal"]').textContent();
    for (const expected of ['Prazo fatal', '03/09/2026', '1h15m apontados']) assert.ok(fatal.includes(expected));
    assert.equal(requests.filter(request => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)).length, 0, 'Renderização V2 não pode criar request de mutação.');

    const moveSelect = page.locator('[data-task-id="ui-v2-task-overdue"] [data-task-move]');
    await moveSelect.selectOption('andamento');
    await page.locator('#toastRegion .toast.success', { hasText: 'Tarefa movimentada com sucesso.' }).waitFor();
    await page.locator('[data-column="andamento"] [data-task-id="ui-v2-task-overdue"]').waitFor();
    const moved = await page.evaluate(() => window.Atrium.Store.state.tasks.find(task => task.id === 'ui-v2-task-overdue'));
    assert.equal(moved.status, 'andamento');
    assert.equal(await page.evaluate(() => window.Atrium.Store.state.audit.some(item => item.action === 'Tarefa movimentada')), true);
    assert.match(await page.locator('#taskBoardLive').textContent(), /movida para Em andamento/);

    const rollback = await page.evaluate(async () => {
      const { App, Store } = window.Atrium;
      const task = Store.state.tasks.find(item => item.id === 'ui-v2-task-waiting');
      const auditLength = Store.state.audit.length;
      const originalFlush = Store.flush;
      Store.flush = async () => false;
      const result = await App.moveTask(task.id, 'revisao');
      Store.flush = originalFlush;
      return { result, status: task.status, auditLength, finalAuditLength: Store.state.audit.length };
    });
    assert.deepEqual(rollback, { result: null, status: 'aguardando', auditLength: rollback.auditLength, finalAuditLength: rollback.auditLength });
    assert.match(await page.locator('#taskBoardLive').textContent(), /voltou para a etapa anterior/);

    await page.waitForTimeout(400);
    const mutationCountBeforeTimer = requests.filter(request => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)).length;
    await page.locator('[data-timesheet-start="ui-v2-task-active"]').click();
    assert.equal(await page.locator('#kanbanBoard .timesheet-live').count(), 1);
    await page.waitForTimeout(1100);
    assert.match(await page.locator('.timesheet-live').textContent(), /00:00:0[1-9]/);
    assert.equal(requests.filter(request => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)).length, mutationCountBeforeTimer, 'Tick do cronômetro não pode gerar rede.');
    await page.locator('[data-timesheet-stop="ui-v2-task-active"]').dispatchEvent('click');
    assert.equal(await page.locator('#kanbanBoard .timesheet-live').count(), 0);
    const timerState = await page.evaluate(() => ({ active: window.Atrium.App.activeTimeSheetTaskId, interval: window.Atrium.App.timeSheetInterval }));
    assert.deepEqual(timerState, { active: null, interval: null });

    await page.locator('[data-task-id="ui-v2-task-publication"] [data-task-open]').click();
    await page.locator('#modalBackdrop[data-modal-mode="task"]:not(.hidden)').waitFor();
    const names = await page.locator('#modalForm [name]').evaluateAll(elements => elements.map(element => element.name));
    assert.deepEqual(names, ['title', 'taskDefinition', 'description', 'process', 'client', 'actionType', 'protocol', 'fatalDeadline', 'deadline', 'date', 'time', 'responsible', 'responsibles', 'status', 'priority', 'points', 'addMinutes', 'timeDescription']);
    assert.equal(await page.locator('.task-form-section').count(), 5);
    assert.equal(await page.locator('#field-deadline').inputValue(), '', 'Texto de 15 dias não pode inferir prazo.');
    assert.equal(await page.locator('#field-fatalDeadline').inputValue(), '');
    await page.fill('#field-title', 'Publicação vinculada editada na V2');
    await page.locator('#modalForm button[type="submit"]').click();
    await page.locator('#modalBackdrop.hidden').waitFor({ state: 'attached' });
    const preserved = await page.evaluate(() => {
      const item = window.Atrium.Store.state.tasks.find(task => task.id === 'ui-v2-task-publication');
      return { id: item.id, intimationId: item.intimationId, sourceIntimationId: item.sourceIntimationId, deadline: item.deadline, fatalDeadline: item.fatalDeadline };
    });
    assert.deepEqual(preserved, {
      id: 'ui-v2-task-publication', intimationId: 'ui-v2-task-publication-source', sourceIntimationId: 'ui-v2-task-publication-source', deadline: '', fatalDeadline: ''
    });

    await page.locator('[data-task-id="ui-v2-task-complete"] [data-task-open]').click();
    await page.locator('#btnDirectReopenTask').click();
    await page.locator('[data-column="triagem"] [data-task-id="ui-v2-task-complete"]').waitFor();
    const reopened = await page.evaluate(() => window.Atrium.Store.state.tasks.find(task => task.id === 'ui-v2-task-complete'));
    assert.equal(reopened.status, 'triagem');
    assert.equal(Object.hasOwn(reopened, 'completedAt'), false);

    const runtime = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
      return { duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index), activeTimer: window.Atrium.App.activeTimeSheetTaskId };
    });
    assert.deepEqual(runtime.duplicateIds, []);
    assert.equal(runtime.activeTimer, null);
    assert.deepEqual(pageErrors, [], `Pageerrors: ${pageErrors.join(' | ')}`);

    assert.equal(await page.locator('#uiModeControl, [data-ui-mode]').count(), 0, 'Tarefas estáveis não podem expor retorno ao Classic.');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.ui), 'v2');
    assert.equal(await page.locator('.v2-task-heading').isVisible(), true);
  } finally {
    await context.close();
  }
} finally {
  await session.stop();
}

console.log('✓ Tarefas V2 aprovada: uma feature, seis estados, movimento/rollback, timer, formulário e vínculo com publicação preservados.');
