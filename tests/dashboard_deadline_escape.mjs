import assert from 'node:assert/strict';
import { createDashboardFeature } from '../js/features/dashboard.js';

// Regressão de segurança (run-5 v04): js/portal.js `formatDate` devolve o valor
// cru quando a data não é parseável; js/features/dashboard.js interpolava esse
// retorno em innerHTML sem escape (sink de tarefas ~412 e de agenda ~629).
// Este teste reproduz o contrato real do helper (fallback cru) com o escape
// oficial do portal e prova que um valor não-parseável com markup NÃO vira HTML.

// Mesma implementação do helper de escape oficial (js/portal.js:89).
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

// Mesmo contrato de js/portal.js:117-122: devolve o valor original quando não parseável.
const formatDate = value => {
  if (!value) return '—';
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('pt-BR').format(new Date(year, month - 1, day));
};

const daysUntil = value => {
  if (!value) return Infinity;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Math.ceil((date - today) / 86400000);
};

function makeClassList() {
  const values = new Set();
  return { add: n => values.add(n), remove: n => values.delete(n), toggle(n, f) { if (f) values.add(n); else values.delete(n); }, contains: n => values.has(n) };
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
      matches = [...element.innerHTML.matchAll(/data-dashboard-task-id="([^"]+)"/g)].map(m => makeNode({ dashboardTaskId: m[1] }));
    } else if (selector === '[data-agenda-id]') {
      matches = [...element.innerHTML.matchAll(/data-agenda-id="([^"]+)"/g)].map(m => makeNode({ agendaId: m[1] }));
    }
    element.dynamic.set(selector, matches);
    return matches;
  };
  return element;
}

const ids = [
  'dashboardTaskList', 'dashboardTaskCount', 'dashboardRemindersList',
  'widgetCompletedTasks', 'widgetLateTasks', 'widgetPendingTasks', 'widgetProcActive', 'widgetProcInactive',
  'widgetActiveLeads', 'widgetHonorariosPending', 'widgetTimesheetHours', 'widgetDocsCount'
];
const elements = Object.fromEntries(ids.map(id => [id, makeElement()]));
const documentRef = { getElementById: id => elements[id] || null };

const TASK_PAYLOAD = '<img src=x onerror="alert(1)">';
const SOURCE_PAYLOAD = '<svg onload="alert(2)">';
const SOURCE_LABEL_PAYLOAD = '<b>fonte</b>';
const AGENDA_PAYLOAD = '<img src=x onerror="alert(3)">2027-01-01';

const store = {
  state: {
    tasks: [
      { id: 'task-deadline-xss', title: 'Conferir documento', status: 'triagem', deadline: TASK_PAYLOAD, points: 5, responsible: 'Advogada Teste' },
      { id: 'task-source-xss', title: 'Conferir anexo', status: 'triagem', sourceReportedDeadlineAt: SOURCE_PAYLOAD, sourceReportedDeadlineSource: SOURCE_LABEL_PAYLOAD, points: 3 }
    ],
    processes: [],
    intimations: [],
    sources: [],
    leads: [],
    customDocs: [],
    documents: [],
    terms: [],
    agenda: [{ id: 'agenda-xss', date: AGENDA_PAYLOAD, title: 'Compromisso Teste', client: 'Cliente Teste' }]
  }
};

const feature = createDashboardFeature({
  store,
  documentRef,
  escapeHtml,
  formatDate,
  formatMinutes: minutes => minutes ? `${minutes}m` : '',
  formatCurrency: value => `BRL:${value}`,
  daysUntil,
  isTerminalStatus: status => ['concluida', 'arquivada', 'cancelada'].includes(status),
  getUntreatedCount: () => 0
});

feature.init();
feature.renderTasks();

const taskHtml = elements.dashboardTaskList.innerHTML;
assert.ok(taskHtml.includes('task-deadline-xss'), 'sanity: a tarefa com deadline malicioso deve renderizar.');
assert.ok(
  taskHtml.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'),
  'deadline não-parseável deve entrar escapado no sink de tarefas.'
);
assert.equal(taskHtml.includes(TASK_PAYLOAD), false, 'markup do deadline não pode virar HTML cru no sink de tarefas.');
assert.equal(taskHtml.includes('<img src=x'), false, 'nenhuma tag <img> injetada pode sobreviver no sink de tarefas.');

assert.ok(
  taskHtml.includes('&lt;svg onload=&quot;alert(2)&quot;&gt;'),
  'referência de prazo da fonte deve entrar escapada no sink de tarefas.'
);
assert.ok(
  taskHtml.includes('&lt;b&gt;fonte&lt;/b&gt;'),
  'rótulo da fonte de prazo deve entrar escapado no sink de tarefas.'
);
assert.equal(taskHtml.includes('<svg onload'), false, 'nenhuma tag <svg> injetada pode sobreviver no sink de tarefas.');
assert.equal(taskHtml.includes(SOURCE_LABEL_PAYLOAD), false, 'rótulo de fonte cru não pode virar HTML.');

feature.renderWidgets();

const remindersHtml = elements.dashboardRemindersList.innerHTML;
assert.ok(remindersHtml.includes('agenda-xss'), 'sanity: o lembrete com data maliciosa deve renderizar.');
assert.ok(
  remindersHtml.includes('&lt;img src=x onerror=&quot;alert(3)&quot;&gt;2027-01-01'),
  'data não-parseável deve entrar escapada no sink de agenda.'
);
assert.equal(remindersHtml.includes(AGENDA_PAYLOAD), false, 'markup da data não pode virar HTML cru no sink de agenda.');
assert.equal(remindersHtml.includes('<img src=x'), false, 'nenhuma tag <img> injetada pode sobreviver no sink de agenda.');

console.log('✓ Dashboard escapa deadline/data não-parseável nos sinks de tarefas e agenda (sem markup cru em innerHTML).');
