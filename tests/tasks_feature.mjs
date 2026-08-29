import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { TASK_COLUMNS, createTasksFeature } from '../js/features/tasks.js';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — CARACTERIZAÇÃO DA FEATURE DE TAREFAS / KANBAN');
console.log('===============================================================\n');

const tasksSource = fs.readFileSync(new URL('../js/features/tasks.js', import.meta.url), 'utf8');
const portalSource = fs.readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');

assert.deepEqual(TASK_COLUMNS.map(column => column.id), ['triagem', 'prioridade', 'andamento', 'aguardando', 'revisao', 'concluida']);
for (const forbiddenImport of ['portal.js', 'publications.js', 'agenda.js']) {
  assert.equal(tasksSource.includes(forbiddenImport), false, `Tasks não pode importar ${forbiddenImport}.`);
}
for (const publicationConcern of ['linkedTaskIds', 'treatmentStatus', 'treatmentStartedAt', 'treatmentStartedBy']) {
  assert.equal(tasksSource.includes(publicationConcern), false, `Tasks não pode conhecer ${publicationConcern}.`);
}
assert.match(portalSource, /import \{ createTasksFeature \} from '\.\/features\/tasks\.js';/);
assert.equal((portalSource.match(/createTasksFeature\(/g) || []).length, 1, 'Portal deve instanciar Tasks uma única vez.');
assert.equal(portalSource.includes('KANBAN_COLUMNS'), false, 'Constante canônica não pode permanecer no portal.');
assert.equal(portalSource.includes("Store.upsert('tasks'"), false, 'Portal não pode duplicar persistência canônica de Tasks.');
assert.match(portalSource, /renderKanban\(\) \{\s*return getTasksFeature\(\)\.renderKanban\(\);\s*\}/);
assert.match(portalSource, /openTaskModal\(defaults = \{\}\) \{\s*return getTasksFeature\(\)\.openTaskModal\(defaults\);\s*\}/);
assert.match(portalSource, /getTasksFeature\(\)\.completeTask\(chk\.dataset\.completeTaskId\)/, 'Dashboard deve delegar a conclusão canônica.');

const listeners = [];
let saveCount = 0;
let nowValue = Date.parse('2026-08-28T12:00:00.000Z');
let nextIntervalId = 0;
const intervals = new Set();
const unitStore = {
  state: {
    tasks: [
      { id: 'unit-a', title: 'Unit A', status: 'triagem', timeLogs: [], timeSpentMinutes: 0 },
      { id: 'unit-b', title: 'Unit B', status: 'triagem', timeLogs: [], timeSpentMinutes: 0 }
    ],
    configuration: { taskDefinitions: [] },
    audit: []
  },
  upsert(collection, record, key = 'id') {
    const index = this.state[collection].findIndex(item => item[key] === record[key]);
    if (index >= 0) this.state[collection][index] = { ...this.state[collection][index], ...record };
    else this.state[collection].push(record);
    return record;
  },
  audit(action, detail) { this.state.audit.push({ action, detail }); saveCount++; },
  save() { saveCount++; }
};
const unitFeature = createTasksFeature({
  store: unitStore,
  documentRef: {
    getElementById(id) {
      return id === 'newTaskButton' ? { addEventListener: (type, listener) => listeners.push({ type, listener }) } : null;
    },
    querySelector: () => null
  },
  windowRef: {
    setInterval() { const id = ++nextIntervalId; intervals.add(id); return id; },
    clearInterval(id) { intervals.delete(id); }
  },
  navigatorRef: { clipboard: { writeText: async () => {} } },
  escapeHtml: String,
  formatDate: String,
  formatMinutes: minutes => `${minutes}m`,
  totalTimeMinutes: logs => (logs || []).reduce((total, log) => total + Number(log.minutes || 0), 0),
  daysUntil: () => 0,
  decodeHtmlEntities: String,
  initials: name => name.slice(0, 2).toUpperCase(),
  isTerminalStatus: status => status === 'concluida',
  getCurrentUserName: () => 'Advogada Unitária',
  now: () => nowValue
});
unitFeature.renderKanban = () => {};
assert.equal(unitFeature.init(), true);
assert.equal(unitFeature.init(), false);
assert.equal(listeners.length, 1, 'Segundo init não pode duplicar listener de nova tarefa.');
assert.equal(intervals.size, 0, 'Init não pode criar timer.');

unitFeature.startTimeSheet('unit-a');
assert.equal(unitFeature.activeTimeSheetTaskId, 'unit-a');
assert.equal(unitFeature.timeSheetStartedAt, nowValue);
assert.equal(intervals.size, 1);
nowValue += 1_000;
unitFeature.startTimeSheet('unit-b');
assert.equal(unitFeature.activeTimeSheetTaskId, 'unit-b');
assert.equal(intervals.size, 1, 'Troca de tarefa deve manter um único interval.');
nowValue += 1_000;
unitFeature.stopTimeSheet();
assert.equal(unitFeature.activeTimeSheetTaskId, null);
assert.equal(unitFeature.timeSheetInterval, null);
assert.equal(intervals.size, 0, 'Stop deve remover o interval.');
assert.equal(unitStore.state.tasks[0].timeLogs.at(-1).minutes, 1);
assert.equal(unitStore.state.tasks[1].timeLogs.at(-1).author, 'Advogada Unitária');
assert.equal(unitStore.state.tasks[1].timeLogs.at(-1).description, 'Apontamento via Cronômetro TimeSheet');

const created = unitFeature.saveTask({
  title: 'Prazo de 15 dias para apelação', status: 'triagem', deadline: '', fatalDeadline: '',
  responsible: 'Advogada Unitária', responsibles: 'Colega A; Colega B', points: '12', addMinutes: '25', timeDescription: 'Minuta'
}, {});
assert.equal(created.deadline, '', 'Texto jurídico não pode gerar prazo automaticamente.');
assert.equal(created.fatalDeadline, '', 'Texto jurídico não pode gerar prazo fatal automaticamente.');
assert.equal(created.history.length, 2);
assert.equal(created.timeLogs.at(-1).minutes, 25);
assert.deepEqual(created.responsibles, ['Advogada Unitária', 'Colega A', 'Colega B']);
assert.equal(unitStore.state.audit.at(-1).action, 'Tarefa atribuída');
const edited = unitFeature.saveTask({
  title: 'Título unitário editado', status: 'andamento', responsible: 'Advogada Unitária', responsibles: '', points: '12', addMinutes: '', timeDescription: ''
}, created);
assert.equal(edited.id, created.id);
assert.equal(edited.history.length, 3);
assert.equal(edited.timeLogs.length, 1, 'Edição sem apontamento deve preservar timeLogs.');
assert.equal(unitStore.state.audit.at(-1).action, 'Tarefa atualizada');
assert.ok(saveCount >= 5, 'Mutações canônicas devem persistir/auditar conforme a semântica existente.');

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

try {
  const moduleResponse = await fetch(`${server.baseUrl}/js/features/tasks.js`);
  assert.equal(moduleResponse.status, 200, 'Módulo Tasks deve ser servido com HTTP 200.');
  assert.match(moduleResponse.headers.get('content-type') || '', /javascript/, 'Módulo Tasks deve usar MIME JavaScript.');

  const password = 'Senha-Teste-Tasks-2026!';
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_tasks',
    displayName: 'Advogada Teste',
    email: 'tasks@example.test',
    password
  });
  const setup = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  assert.equal(response.status, 200, 'Setup administrativo da fixture deve concluir.');
  const cookiePair = response.headers.get('set-cookie').split(';')[0];
  const separator = cookiePair.indexOf('=');

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
  await context.addCookies([{
    name: cookiePair.slice(0, separator),
    value: cookiePair.slice(separator + 1),
    url: server.baseUrl
  }]);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('jurisflow_tour_completed', 'true');
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('atrium_tour_seen', 'true');
  });
  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();

  const fixture = await page.evaluate(async () => {
    const store = window.Atrium.Store;
    const app = window.portalApp;
    const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const today = localDate(new Date());
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = localDate(tomorrowDate);
    store.state.tasks = [
      {
        id: 'task-characterization', externalId: 'task-ext-1', title: 'Tarefa Caracterização Kanban',
        description: 'Descrição sintética preservada', source: 'Sistema jurídico', points: 42, priority: 'urgente',
        client: 'Cliente Teste', process: '5000000-00.2026.8.21.0001', deadline: today,
        fatalDeadline: tomorrow, responsible: 'Advogada Teste', status: 'triagem',
        timeLogs: [{ id: 'log-existing', date: today, minutes: 30, description: 'Apontamento existente', actor: 'Advogada Teste' }],
        timeSpentMinutes: 30, history: [{ at: new Date().toISOString(), action: 'Tarefa atribuída', actor: 'Advogada Teste' }]
      },
      {
        id: 'task-timer-b', title: 'Segunda tarefa do cronômetro', description: 'Fixture timer B',
        source: 'Interna', status: 'triagem', priority: 'normal', deadline: tomorrow, responsible: 'Advogada Teste', timeLogs: []
      }
    ];
    store.state.audit = [];
    app.renderAll();
    await store.flush();
    return { today, tomorrow };
  });

  await page.click('button[data-view="kanban"]');
  await page.locator('#view-kanban.active').waitFor();
  const columns = page.locator('#kanbanBoard .kanban-column');
  assert.equal(await columns.count(), 6, 'Board deve manter seis colunas.');
  assert.deepEqual(await columns.evaluateAll(items => items.map(item => item.dataset.column)), ['triagem', 'prioridade', 'andamento', 'aguardando', 'revisao', 'concluida']);
  assert.deepEqual(await columns.locator('.column-title').evaluateAll(items => items.map(item => item.childNodes[1]?.textContent?.trim())), ['Entrada & triagem', 'Prioridade', 'Em andamento', 'Aguardando', 'Revisão', 'Concluída']);

  let card = page.locator('#kanbanBoard [data-task-id="task-characterization"]');
  await card.waitFor();
  const cardText = await card.textContent();
  for (const expected of ['SISTEMA JURÍDICO', '42 pts', 'Tarefa Caracterização Kanban', 'Descrição sintética preservada', 'Cliente Teste', '5000000-00.2026.8.21.0001', 'Prazo fatal', '30m']) {
    assert.ok(cardText.includes(expected), `Card deve preservar: ${expected}`);
  }

  await card.click();
  await page.locator('#modalTitle', { hasText: 'Editar tarefa' }).waitFor();
  assert.deepEqual(
    await page.locator('#modalForm [name]').evaluateAll(elements => elements.map(element => element.name)),
    ['title', 'taskDefinition', 'process', 'client', 'fatalDeadline', 'deadline', 'date', 'time', 'responsible', 'responsibles', 'status', 'priority', 'points', 'addMinutes', 'timeDescription', 'description', 'actionType', 'protocol']
  );
  assert.equal(await page.locator('#modalForm [name="fatalDeadline"]').inputValue(), fixture.tomorrow);
  assert.equal(await page.locator('#modalForm [name="points"]').inputValue(), '42');
  await page.click('#modalCancel');

  assert.match(await page.locator('#kanbanBoard [data-column="triagem"] .column-count').textContent(), /2/);
  assert.equal(await page.locator('#kanbanBoard .empty-column').count(), 5, 'Colunas vazias devem preservar o estado vazio atual.');
  assert.match(cardText, /AT/, 'Card deve exibir avatar derivado do responsável.');

  await page.click('#newTaskButton');
  await page.locator('#modalTitle', { hasText: 'Nova tarefa' }).waitFor();
  await page.fill('#field-title', 'Tarefa Criada Fase 8');
  await page.fill('#field-description', 'Descrição criada pelo fluxo real');
  await page.fill('#field-process', '5008888-00.2026.8.21.0001');
  await page.fill('#field-client', 'Cliente Modular');
  await page.fill('#field-date', fixture.today);
  await page.fill('#field-deadline', fixture.today);
  await page.fill('#field-responsible', 'Advogada Teste');
  await page.selectOption('#field-status', 'prioridade');
  await page.selectOption('#field-priority', 'importante');
  await page.fill('#field-points', '18');
  await page.click('#modalForm button[type="submit"]');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const createdTask = await page.evaluate(() => window.Atrium.Store.state.tasks.find(task => task.title === 'Tarefa Criada Fase 8'));
  assert.ok(createdTask?.id, 'Criação deve persistir um registro de tarefa.');
  assert.equal(createdTask.status, 'prioridade');
  assert.equal(createdTask.points, 18);
  assert.equal(createdTask.history.length, 1);
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.audit.some(item => item.action === 'Tarefa atribuída' && item.detail.includes('Tarefa Criada Fase 8'))), true);
  await page.locator(`#kanbanBoard [data-column="prioridade"] [data-task-id="${createdTask.id}"]`).click();
  await page.fill('#field-title', 'Tarefa Editada Fase 8');
  await page.fill('#field-addMinutes', '25');
  await page.fill('#field-timeDescription', 'Minuta modular');
  await page.click('#modalForm button[type="submit"]');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const editedTask = await page.evaluate(id => window.Atrium.Store.state.tasks.find(task => task.id === id), createdTask.id);
  assert.equal(editedTask.id, createdTask.id, 'Edição deve preservar o ID.');
  assert.equal(editedTask.title, 'Tarefa Editada Fase 8');
  assert.equal(editedTask.history.length, 3, 'Edição e apontamento devem acrescentar histórico.');
  assert.equal(editedTask.timeLogs.length, 1);
  assert.equal(editedTask.timeLogs[0].minutes, 25);
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.audit.some(item => item.action === 'Tarefa atualizada' && item.detail.includes('Tarefa Editada Fase 8'))), true);

  await page.click('button[data-view="agenda"]');
  await page.locator('#view-agenda.active').waitFor();
  await page.click('#agendaFilterTabs button[data-agenda-filter="task"]');
  await page.locator(`#agendaList [data-agenda-activity-id="${createdTask.id}"]`, { hasText: 'Tarefa Editada Fase 8' }).waitFor();

  await page.locator('#globalSearch').fill('Tarefa Editada Fase 8');
  await page.locator('#globalSearchPalette:not(.hidden)').waitFor();
  await page.locator(`[data-search-target="task"][data-search-id="${createdTask.id}"]`).click();
  await page.locator('#view-kanban.active').waitFor();
  await page.locator('#modalTitle', { hasText: 'Editar tarefa' }).waitFor();
  assert.equal(await page.locator('#field-title').inputValue(), 'Tarefa Editada Fase 8');
  await page.click('#modalCancel');

  const secondAuthResult = await page.evaluate(() => {
    const app = window.portalApp;
    const originalOpenModal = app.openModal;
    let openCount = 0;
    app.openModal = function (...args) { openCount++; return originalOpenModal.apply(this, args); };
    window.dispatchEvent(new CustomEvent('keller:authenticated'));
    document.getElementById('newTaskButton').click();
    app.openModal = originalOpenModal;
    return { openCount, activeTimer: app.activeTimeSheetTaskId, interval: app.timeSheetInterval };
  });
  assert.deepEqual(secondAuthResult, { openCount: 1, activeTimer: null, interval: null }, 'Segundo auth não pode duplicar init, listener ou timer.');
  await page.click('#modalCancel');

  await page.click('button[data-view="dashboard"]');
  await page.locator('#view-dashboard.active').waitFor();
  const dashboardCheckbox = page.locator(`[data-complete-task-id="${createdTask.id}"]`);
  await dashboardCheckbox.dispatchEvent('change');
  await page.locator('#toastRegion .toast.success', { hasText: 'Tarefa concluída com sucesso!' }).waitFor();
  const dashboardCompleted = await page.evaluate(id => window.Atrium.Store.state.tasks.find(task => task.id === id), createdTask.id);
  assert.equal(dashboardCompleted.status, 'concluida');
  assert.ok(Date.parse(dashboardCompleted.completedAt));

  await page.evaluate(async today => {
    const store = window.Atrium.Store;
    store.state.intimations = [{
      id: 'publication-task-phase-8', title: 'Apelação publicada', text: 'Prazo de 15 dias para apelação',
      process: '5009999-00.2026.8.21.0001', client: 'Cliente Publicação', source: 'DJEN',
      publishedAt: today, createdAt: new Date().toISOString(), unread: true, treatmentStatus: 'untreated'
    }];
    const app = window.portalApp;
    app.inboxFilter = 'untreated';
    app.switchView('inbox');
    app.renderInbox();
    await store.flush();
  }, fixture.today);
  await page.locator('.inbox-row[data-intimation-id="publication-task-phase-8"]').click();
  await page.locator('#btnCreateTask').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#field-deadline').inputValue(), '', 'Publicação não pode inferir prazo interno.');
  assert.equal(await page.locator('#field-fatalDeadline').inputValue(), '', 'Publicação não pode inferir prazo fatal.');
  await page.click('#modalForm button[type="submit"]');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const publicationLink = await page.evaluate(() => {
    const store = window.Atrium.Store.state;
    const intimation = store.intimations.find(item => item.id === 'publication-task-phase-8');
    const task = store.tasks.find(item => item.intimationId === intimation.id);
    return { intimation, task, linkedCount: store.tasks.filter(item => item.intimationId === intimation.id).length };
  });
  assert.ok(publicationLink.task?.id);
  assert.equal(publicationLink.task.sourceIntimationId, 'publication-task-phase-8');
  assert.equal(publicationLink.task.deadline, '');
  assert.equal(publicationLink.task.fatalDeadline || '', '');
  assert.deepEqual(publicationLink.intimation.linkedTaskIds, [publicationLink.task.id]);
  assert.equal(publicationLink.intimation.taskId, publicationLink.task.id);
  assert.equal(publicationLink.intimation.treatmentStatus, 'in_review');
  assert.ok(Date.parse(publicationLink.intimation.treatmentStartedAt));
  assert.equal(publicationLink.intimation.treatmentStartedBy, 'Advogada Teste');
  assert.equal(publicationLink.linkedCount, 1, 'Fluxo publicação → tarefa não pode duplicar registro.');

  await page.click('button[data-view="kanban"]');
  await page.locator('#view-kanban.active').waitFor();

  card = page.locator('#kanbanBoard [data-task-id="task-characterization"]');
  const targetColumn = page.locator('#kanbanBoard [data-column="andamento"]');
  await card.waitFor({ state: 'visible' });
  await targetColumn.waitFor({ state: 'visible' });
  await card.scrollIntoViewIfNeeded();
  await targetColumn.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const source = document.querySelector('#kanbanBoard [data-task-id="task-characterization"]');
    const target = document.querySelector('#kanbanBoard [data-column="andamento"]');
    if (!(source instanceof HTMLElement)) throw new Error('Card de origem ausente antes do drag-and-drop.');
    if (!(target instanceof HTMLElement)) throw new Error('Coluna de destino ausente antes do drag-and-drop.');

    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }));
  });
  await page.locator('#kanbanBoard [data-column="andamento"] [data-task-id="task-characterization"]').waitFor();
  let moved = await page.evaluate(() => window.Atrium.Store.state.tasks.find(task => task.id === 'task-characterization'));
  assert.equal(moved.status, 'andamento');
  assert.ok(Date.parse(moved.updatedAt));
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.audit.some(item => item.action === 'Tarefa movimentada')), true);
  await page.evaluate(() => window.Atrium.Store.flush());

  await page.locator('#kanbanBoard [data-task-id="task-characterization"]').click();
  await page.click('#btnDirectCompleteTask');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  let completion = await page.evaluate(() => window.Atrium.Store.state.tasks.find(task => task.id === 'task-characterization'));
  assert.equal(completion.status, 'concluida');
  assert.ok(Date.parse(completion.completedAt));
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.audit.some(item => item.action === 'Tarefa concluída')), true);

  await page.locator('#kanbanBoard [data-column="concluida"] [data-task-id="task-characterization"]').click();
  await page.click('#btnDirectReopenTask');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  completion = await page.evaluate(() => window.Atrium.Store.state.tasks.find(task => task.id === 'task-characterization'));
  assert.equal(completion.status, 'triagem');
  assert.equal(Object.hasOwn(completion, 'completedAt'), false);
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.audit.some(item => item.action === 'Tarefa reaberta')), true);

  const modalWasHidden = await page.locator('#modalBackdrop').evaluate(element => element.classList.contains('hidden'));
  assert.equal(modalWasHidden, true);
  await page.locator('[data-timesheet-start="task-characterization"]').click();
  assert.equal(await page.locator('#modalBackdrop').evaluate(element => element.classList.contains('hidden')), true, 'TimeSheet não pode abrir modal.');
  assert.equal(await page.locator('#kanbanBoard .timesheet-live').count(), 1, 'Somente um timer pode ficar ativo.');
  await page.locator('[data-timesheet-start="task-timer-b"]').click();
  assert.equal(await page.locator('#kanbanBoard .timesheet-live').count(), 1, 'Troca de tarefa deve preservar um único timer.');
  await page.locator('[data-timesheet-stop="task-timer-b"]').dispatchEvent('click');
  assert.equal(await page.locator('#kanbanBoard .timesheet-live').count(), 0, 'Stop deve remover o timer ativo.');
  const timerSummary = await page.evaluate(() => {
    const tasks = window.Atrium.Store.state.tasks;
    return {
      taskA: tasks.find(task => task.id === 'task-characterization'),
      taskB: tasks.find(task => task.id === 'task-timer-b'),
      audits: window.Atrium.Store.state.audit.filter(item => item.action === 'TimeSheet registrado').length
    };
  });
  assert.equal(timerSummary.taskA.timeLogs.length, 2, 'Trocar timer deve salvar apontamento mínimo na tarefa A.');
  assert.equal(timerSummary.taskA.timeLogs.at(-1).minutes, 1);
  assert.equal(timerSummary.taskA.timeSpentMinutes, 31);
  assert.equal(timerSummary.taskB.timeLogs.length, 1);
  assert.equal(timerSummary.taskB.timeLogs[0].minutes, 1);
  assert.equal(timerSummary.taskB.timeSpentMinutes, 1);
  assert.equal(timerSummary.audits, 2);

  await page.evaluate(() => window.Atrium.Store.flush());
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  await page.click('button[data-view="kanban"]');
  await page.locator('#kanbanBoard [data-column="triagem"] [data-task-id="task-characterization"]').waitFor();
  const reloaded = await page.evaluate(() => window.Atrium.Store.state.tasks.find(task => task.id === 'task-characterization'));
  assert.equal(reloaded.status, 'triagem');
  assert.equal(reloaded.timeLogs.length, 2);
  assert.equal(reloaded.timeSpentMinutes, 31);
  const persistedFlows = await page.evaluate(() => ({
    edited: window.Atrium.Store.state.tasks.find(task => task.title === 'Tarefa Editada Fase 8'),
    publication: window.Atrium.Store.state.tasks.find(task => task.intimationId === 'publication-task-phase-8'),
    intimation: window.Atrium.Store.state.intimations.find(item => item.id === 'publication-task-phase-8')
  }));
  assert.equal(persistedFlows.edited?.status, 'concluida', 'Conclusão do Dashboard deve persistir após reload.');
  assert.equal(persistedFlows.edited?.timeLogs?.[0]?.minutes, 25, 'Apontamento manual deve persistir após reload.');
  assert.equal(persistedFlows.publication?.deadline, '', 'Ausência de inferência de prazo deve persistir.');
  assert.equal(persistedFlows.intimation?.taskId, persistedFlows.publication?.id, 'Link cross-domain deve persistir.');
  assert.deepEqual(pageErrors, [], `Erros de página detectados: ${pageErrors.join(' | ')}`);

  await context.close();
} finally {
  await browser.close();
  await server.stop();
}

console.log('✓ Feature aprovada: arquitetura, board, CRUD, integrações, persistência, conclusão e TimeSheet.');
