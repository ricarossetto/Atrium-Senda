import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDashboardFeature } from '../js/features/dashboard.js';

const moduleSource = readFileSync(new URL('../js/features/dashboard.js', import.meta.url), 'utf8');
const portalSource = readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
assert.match(moduleSource, /export function createDashboardFeature/);
assert.doesNotMatch(moduleSource, /portal\.js|features\/(?:tasks|agenda|financial|publications)\.js/);
assert.doesNotMatch(moduleSource, /store\.(?:save|flush|audit|upsert)\s*\(/, 'Dashboard não deve criar persistência própria.');
assert.match(portalSource, /renderDashboard\(\) \{ return getDashboardFeature\(\)\.render\(\); \}/);
assert.match(portalSource, /renderMetrics\(\) \{ return getDashboardFeature\(\)\.renderMetrics\(\); \}/);
assert.match(portalSource, /renderDashboardTasks\(\) \{ return getDashboardFeature\(\)\.renderTasks\(\); \}/);
assert.match(portalSource, /renderDashboardWidgets\(\) \{ return getDashboardFeature\(\)\.renderWidgets\(\); \}/);
assert.doesNotMatch(portalSource, /let totalHonorariosAFaturar|titleLower\.includes\('prazo'\)/);

function makeClassList(initial = []) {
  const values = new Set(initial);
  return {
    add: name => values.add(name),
    remove: name => values.delete(name),
    toggle(name, force) { if (force) values.add(name); else values.delete(name); },
    contains: name => values.has(name)
  };
}

function makeNode(dataset = {}) {
  const listeners = new Map();
  return {
    dataset,
    listeners,
    classList: makeClassList(),
    addEventListener(type, handler) { (listeners.get(type) || listeners.set(type, []).get(type)).push(handler); }
  };
}

function makeElement() {
  const element = makeNode();
  element.innerHTML = '';
  element.textContent = '';
  element.value = '';
  element.style = {};
  element.dynamic = new Map();
  element.querySelectorAll = selector => {
    if (element.dynamic.has(selector)) return element.dynamic.get(selector);
    let matches = [];
    if (selector === '[data-dashboard-task-id]') {
      matches = [...element.innerHTML.matchAll(/data-dashboard-task-id="([^"]+)"/g)].map(match => makeNode({ dashboardTaskId: match[1] }));
    } else if (selector === '[data-complete-task-id]') {
      matches = [...element.innerHTML.matchAll(/data-complete-task-id="([^"]+)"/g)].map(match => makeNode({ completeTaskId: match[1] }));
    } else if (selector === '[data-agenda-id]') {
      matches = [...element.innerHTML.matchAll(/data-agenda-id="([^"]+)"/g)].map(match => makeNode({ agendaId: match[1] }));
    } else if (selector === 'button') {
      matches = [makeNode(), makeNode(), makeNode(), makeNode()];
    }
    element.dynamic.set(selector, matches);
    return matches;
  };
  return element;
}

const ids = [
  'btnDashboardNewTask', 'dashboardTaskSortSelect', 'dashboardTaskFilters', 'dashboardTaskList', 'dashboardTaskCount',
  'metricInbox', 'metricDeadlines', 'metricTasks', 'metricSources', 'inboxBadge', 'notificationDot',
  'widgetCompletedTasks', 'widgetLateTasks', 'widgetPendingTasks', 'widgetProcActive', 'widgetProcInactive',
  'widgetActiveLeads', 'widgetHonorariosPending', 'widgetTimesheetHours', 'widgetDocsCount', 'dashboardRemindersList'
];
const elements = Object.fromEntries(ids.map(id => [id, makeElement()]));
const documentRef = { getElementById: id => elements[id] || null };
const days = { '-1': -1, 1: 1, 2: 2, 5: 5, 9: 9, '': Infinity };
const tasks = [
  { id: 'task-prazo', title: 'Prazo de decisão', type: 'Judicial', status: 'triagem', deadline: '2', points: 20, client: 'Cliente B' },
  { id: 'task-audiencia', title: 'Audiência de julgamento', type: '', status: 'andamento', deadline: '5', points: 50, client: 'Cliente C' },
  { id: 'task-reuniao', title: 'Reunião de atendimento', type: '', status: 'prioridade', deadline: '9', points: 10, client: 'Cliente D' },
  { id: 'task-generic', title: 'Conferir documento', type: 'Tarefa', status: 'triagem', deadline: '1', points: 5, processId: 'linked-process', priority: 'urgente', timeLogs: [{ minutes: 30 }] },
  { id: 'task-late', title: 'Recurso extraordinário', type: '', status: 'andamento', deadline: '-1', points: 30, client: 'Cliente E' },
  { id: 'task-done', title: 'Tarefa concluída', status: 'concluida', deadline: '1', timeLogs: [{ minutes: 15, date: '2000-01-01' }] }
];
const processes = [
  { id: 'linked-process', number: '5000000-00.2026.8.21.0001', client: 'Cliente A', actionType: 'Indenização por danos morais', monitoring: 'active' },
  { id: 'fixed', feeType: 'fixo', feeAmount: 100, monitoring: 'active' },
  { id: 'monthly', feeType: 'mensal', feeMonthly: 200, monitoring: 'inactive', archived: true },
  { id: 'mixed', feeType: 'misto', feeAmount: 300, feeMonthly: 50, monitoring: 'active' },
  { id: 'percentage', feePercentage: 10, requisitionAmount: 1000, monitoring: 'active' },
  { id: 'percentage-fallback', feePercentage: 20, economicValue: 0, feeAmount: 80, monitoring: 'active' },
  { id: 'paid', feeType: 'fixo', feeAmount: 999, feeStatus: 'pago', monitoring: 'active' },
  { id: 'explicit-zero', feeType: 'fixo', feeAmount: 0, rpvAmount: 5000, monitoring: 'active' }
];
const reminders = Array.from({ length: 5 }, (_, index) => ({ id: `agenda-${index}`, date: `2026-09-0${index + 1}`, title: `Lembrete ${index}`, client: `Cliente ${index}` }));
const store = {
  state: {
    tasks,
    processes,
    sources: [{ status: 'ok' }, { status: 'attention' }, { status: 'ok' }],
    leads: [{ status: 'novo' }, { status: 'fechado' }, { status: 'declinado' }, { status: 'qualificado' }],
    agenda: reminders,
    customDocs: [{}, {}]
  }
};
const openedTasks = [];
const completedTasks = [];
const openedAgenda = [];
const toasts = [];
let renderAllCalls = 0;
let officeRenders = 0;
let publicationMetricRenders = 0;
const feature = createDashboardFeature({
  store,
  documentRef,
  escapeHtml: value => String(value ?? '').replaceAll('<', '&lt;'),
  formatDate: value => `DATA:${value}`,
  formatMinutes: minutes => minutes ? `${minutes}m` : '',
  formatCurrency: value => `BRL:${value}`,
  daysUntil: value => days[value] ?? Infinity,
  isTerminalStatus: status => ['concluida', 'arquivada', 'cancelada'].includes(status),
  getUntreatedCount: () => 3,
  renderPublicationsMetrics: () => { publicationMetricRenders++; },
  renderOfficeIdentity: () => { officeRenders++; },
  onOpenTask: task => openedTasks.push(task),
  onCompleteTask: async id => { completedTasks.push(id); return store.state.tasks.find(task => task.id === id); },
  onRenderAll: () => { renderAllCalls++; },
  onOpenAgenda: item => openedAgenda.push(item),
  showToast: (message, type) => toasts.push({ message, type })
});

assert.equal(feature.init(), true);
assert.equal(feature.init(), false);
for (const [id, type] of [['btnDashboardNewTask', 'click'], ['dashboardTaskSortSelect', 'change'], ['dashboardTaskFilters', 'click']]) {
  assert.equal(elements[id].listeners.get(type)?.length, 1, `${id} deve ter um único listener.`);
}
elements.btnDashboardNewTask.listeners.get('click')[0]();
assert.equal(openedTasks[0], undefined);

feature.taskFilter = 'prazo';
assert.deepEqual(feature.visibleTasks().map(task => task.id), ['task-late', 'task-prazo']);
feature.taskFilter = 'audiencia';
assert.deepEqual(feature.visibleTasks().map(task => task.id), ['task-audiencia']);
feature.taskFilter = 'tarefa';
assert.deepEqual(feature.visibleTasks().map(task => task.id), ['task-late', 'task-generic', 'task-reuniao']);
feature.taskFilter = 'all';
for (const [sort, expectedFirst] of [
  ['date-asc', 'task-late'], ['date-desc', 'task-reuniao'], ['name-asc', 'task-generic'],
  ['difficulty-desc', 'task-audiencia'], ['difficulty-asc', 'task-generic'], ['priority', 'task-generic']
]) {
  feature.taskSort = sort;
  assert.equal(feature.visibleTasks()[0].id, expectedFirst, `Ordenação ${sort} mudou.`);
}

const metrics = feature.renderMetrics();
assert.deepEqual(metrics, { untreatedIntimations: 3, deadlines: 3, activeProcesses: 7, activeSources: 2, sourceCount: 3 });
assert.equal(elements.metricInbox.textContent, 3);
assert.equal(elements.metricDeadlines.textContent, 3);
assert.equal(elements.metricTasks.textContent, 7);
assert.equal(elements.metricSources.textContent, '2/3');
assert.equal(elements.inboxBadge.style.display, 'inline-block');
assert.equal(elements.notificationDot.style.display, '');
assert.equal(publicationMetricRenders, 1);

feature.taskSort = 'date-asc';
feature.renderTasks();
assert.equal(elements.dashboardTaskCount.textContent, '5 tarefas');
assert.match(elements.dashboardTaskList.innerHTML, /Prazo/);
assert.match(elements.dashboardTaskList.innerHTML, /Audiência/);
assert.match(elements.dashboardTaskList.innerHTML, /Reunião/);
assert.match(elements.dashboardTaskList.innerHTML, /Tarefa/);
assert.match(elements.dashboardTaskList.innerHTML, /Cliente A/);
assert.match(elements.dashboardTaskList.innerHTML, /5000000-00\.2026\.8\.21\.0001/);
assert.match(elements.dashboardTaskList.innerHTML, /Indenização por danos morais/);
assert.match(elements.dashboardTaskList.innerHTML, /Processo não vinculado/);
const taskNode = elements.dashboardTaskList.dynamic.get('[data-dashboard-task-id]')[0];
taskNode.listeners.get('click')[0]({ target: { closest: () => null } });
assert.equal(openedTasks.at(-1).id, taskNode.dataset.dashboardTaskId);
const completionNode = elements.dashboardTaskList.dynamic.get('[data-complete-task-id]')[0];
await completionNode.listeners.get('change')[0]({ stopPropagation() {} });
assert.equal(completedTasks.at(-1), completionNode.dataset.completeTaskId);
assert.equal(renderAllCalls, 1);
assert.ok(toasts.some(toast => toast.message === 'Tarefa concluída com sucesso!' && toast.type === 'success'));

const widgets = feature.renderWidgets();
assert.equal(widgets.completed, 1);
assert.equal(widgets.late, 1);
assert.equal(widgets.pending, 4);
assert.equal(widgets.processActive, 7);
assert.equal(widgets.processInactive, 1);
assert.equal(widgets.activeLeads, 2);
assert.equal(widgets.feesPending, 830, 'Fórmula financeira do dashboard mudou.');
assert.equal(widgets.minutes30d, 30);
assert.equal(widgets.documentCount, 2);
assert.equal(widgets.reminders.length, 4);
assert.equal(elements.widgetHonorariosPending.textContent, 'BRL:830');
assert.equal(elements.widgetTimesheetHours.textContent, '30m');
const reminderNode = elements.dashboardRemindersList.dynamic.get('[data-agenda-id]')[0];
reminderNode.listeners.get('click')[0]();
assert.equal(openedAgenda.at(-1).id, reminderNode.dataset.agendaId);

feature.render();
assert.equal(officeRenders, 1);
console.log('✓ Dashboard modular aprovado: filtros, sort, métricas, interações, widgets, finanças, timesheet e lembretes.');
