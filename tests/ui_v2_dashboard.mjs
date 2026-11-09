import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeTaskPerformance } from '../js/core/task-performance.js';
import { renderDashboardV2Summary } from '../js/views/ui-v2/dashboard.js';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

function makeElement() {
  return { textContent: '', innerHTML: '', dataset: {} };
}

const ids = ['v2AttentionLate', 'v2AttentionPublications', 'v2AttentionDeadlines', 'v2AttentionAgenda', 'v2AttentionAgendaDetail', 'v2DashboardOpening', 'v2PerformancePanel', 'dashboardActionableInsights'];
const elements = Object.fromEntries(ids.map(id => [id, makeElement()]));
const documentRef = { getElementById: id => elements[id] || null };
const metrics = { untreatedIntimations: 4, deadlines: 2, activeProcesses: 8, activeSources: 3, sourceCount: 4 };
const widgets = {
  late: 3,
  pending: 5,
  reminders: [{ id: 'agenda-sintetica', date: '2026-09-01', title: 'Audiência sintética' }]
};
const insights = {
  tasksByResponsible: [{ label: 'Equipe Cível', count: 3 }],
  processesByStatus: [{ label: 'Conhecimento', count: 5 }],
  averageTreatmentMinutes: 90,
  treatmentSampleSize: 2,
  pendingPublications: 4,
  recentActivityCount: 7,
  latestCollectorCheck: '2026-09-01T12:00:00.000Z',
  pendingSyncs: 1,
  unclassifiedDocuments: 2,
  receiptsTotal: 1500,
  receiptsCount: 2
};

const performanceNow = new Date('2026-09-18T12:00:00.000Z');
const performance = computeTaskPerformance([
  { id: 'done-1', points: 25, completedAt: '2026-09-02T12:00:00.000Z' },
  { id: 'done-2', points: 15, completedAt: '2026-09-12T12:00:00.000Z' },
  { id: 'prev-1', points: 100, completedAt: '2026-08-10T12:00:00.000Z' },
  { id: 'open-1', points: 10, deadline: '2026-09-01' }
], { goal: 100, now: performanceNow });

const result = renderDashboardV2Summary({ documentRef, metrics, widgets, insights, performance, formatDate: value => `DATA:${value}`, formatCurrency: value => `BRL:${value}`, escapeHtml: value => String(value) });
assert.deepEqual(result, { late: 3, untreated: 4, deadlines: 2, nextAgendaId: 'agenda-sintetica', attentionState: 'attention' });
assert.equal(elements.v2AttentionLate.textContent, '3');
assert.equal(elements.v2AttentionPublications.textContent, '4');
assert.equal(elements.v2AttentionDeadlines.textContent, '2');
assert.equal(elements.v2AttentionAgenda.textContent, 'DATA:2026-09-01');
assert.equal(elements.v2AttentionAgendaDetail.textContent, 'Audiência sintética');
assert.equal(elements.v2DashboardOpening.dataset.attentionState, 'attention');
assert.match(elements.dashboardActionableInsights.innerHTML, /Equipe Cível/);
assert.match(elements.dashboardActionableInsights.innerHTML, /1,5 h/);
assert.match(elements.dashboardActionableInsights.innerHTML, /DATA:2026-09-01T12:00:00.000Z/);
assert.match(elements.dashboardActionableInsights.innerHTML, /BRL:1500/);
assert.match(elements.v2PerformancePanel.innerHTML, /Desempenho/, 'Painel de performance deve renderizar no hero.');
assert.match(elements.v2PerformancePanel.innerHTML, /v2-performance-svg/, 'Gráfico SVG deve renderizar com atividade concluída.');
assert.match(elements.v2PerformancePanel.innerHTML, /Alcance da meta/);
assert.match(elements.v2PerformancePanel.innerHTML, /Mês atual/);

const clear = renderDashboardV2Summary({ documentRef, metrics: {}, widgets: { reminders: [] }, performance: computeTaskPerformance([], { goal: null, now: performanceNow }) });
assert.equal(clear.attentionState, 'clear');

// A tile de audiências não sobrescreve o cartão de agenda: o cartão continua sendo o
// próximo compromisso da Agenda, e a pauta tem sua própria tile.
{
  const hearingElements = { ...elements, v2PerformancePanel: makeElement(), v2AttentionAgenda: makeElement(), v2AttentionAgendaDetail: makeElement() };
  const hearingDoc = { getElementById: id => hearingElements[id] || null };
  const result = renderDashboardV2Summary({
    documentRef: hearingDoc,
    metrics,
    widgets: { ...widgets, hearings: { today: 1, week: 2, next: { id: 'h1', date: '2026-09-02', time: '14:30' }, items: [] } },
    insights,
    performance,
    formatDate: value => `DATA:${value}`,
    formatCurrency: value => `BRL:${value}`,
    escapeHtml: value => String(value)
  });
  assert.equal(hearingElements.v2AttentionAgenda.textContent, 'DATA:2026-09-01', 'o cartão segue o próximo compromisso');
  assert.equal(result.attentionState, 'attention');
}

assert.equal(elements.v2AttentionAgenda.textContent, 'Livre');
assert.match(elements.v2PerformancePanel.innerHTML, /v2-performance-empty/, 'Sem conclusões o painel mostra estado vazio honesto.');

const dashboardFeatureSource = readFileSync(new URL('../js/features/dashboard.js', import.meta.url), 'utf8');
const dashboardPresenterSource = readFileSync(new URL('../js/views/ui-v2/dashboard.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(dashboardFeatureSource, /renderDashboardV2Summary\(\{ documentRef, metrics, widgets, insights, performance, formatDate, formatCurrency, escapeHtml \}\)/, 'O presenter V2 deve receber somente valores já derivados.');
assert.doesNotMatch(dashboardPresenterSource, /fetch\(|secureFetch|Store|save\(|flush\(/, 'O presenter do Dashboard não pode acessar rede ou Store.');
for (const id of ids) assert.equal((indexSource.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} deve existir uma única vez.`);
assert.match(indexSource, /Precisam de triagem/, 'A hierarquia deve explicitar ação humana sobre publicações.');
assert.match(indexSource, /Confirme datas críticas/, 'A UI não pode apresentar prazo como inferência automática.');
assert.match(indexSource, /Indicadores para decisão/, 'O dashboard deve expor somente indicadores úteis para decisão.');
assert.match(indexSource, /Prazos em 7 dias/, 'Prazos de tarefas não podem ser rotulados como compromissos.');
assert.match(indexSource, /id="dashboardHearingsPanel"/, 'a tile de audiências e sessões deve existir');
assert.doesNotMatch(indexSource, /v2AttentionSummary/, 'o resumo fixo saiu da abertura');

const responsiveSession = await startUiV2Session({ viewport: { width: 1635, height: 912 } });
try {
  for (const viewport of [{ width: 1635, height: 912 }, { width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 620, height: 844 }, { width: 390, height: 844 }, { width: 320, height: 844 }]) {
    const context = await responsiveSession.createContext({ viewport });
    const { page, pageErrors } = await prepareUiV2Page(context, responsiveSession.server.baseUrl);
    const layout = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const tasks = rect('.dashboard-tasks-column');
      const widgetsColumn = rect('.dashboard-widgets-column');
      const filters = rect('#dashboardTaskFilters');
      const controls = rect('.dashboard-tasks-header > div:last-child');
      const title = rect('.dashboard-tasks-title');
      const hearings = rect('#dashboardHearingsPanel');
      const performancePanel = rect('#v2PerformancePanel');
      const attention = rect('.v2-attention-grid');
      const hero = rect('#v2DashboardOpening');
      const toolbar = rect('#view-dashboard > .section-toolbar');
      const action = rect('#btnDashboardNewTask');
      const actionElement = document.getElementById('btnDashboardNewTask');
      actionElement.focus();
      const hit = document.elementFromPoint(action.left + action.width / 2, action.top + action.height / 2);
      return {
        tasksRight: tasks.right,
        tasksWidth: tasks.width,
        widgetsLeft: widgetsColumn.left,
        filtersRight: filters.right,
        controlsTop: controls.top,
        titleBottom: title.bottom,
        attentionRight: attention.right,
        hearingsLeft: hearings.left,
        performanceLeft: performancePanel.left,
        performanceRight: performancePanel.right,
        performanceWidth: performancePanel.width,
        attentionLeft: attention.left,
        heroTop: hero.top,
        toolbarTop: toolbar.top,
        actionTop: action.top,
        actionBottom: action.bottom,
        actionWidth: action.width,
        actionFocused: document.activeElement === actionElement,
        actionUnobstructed: actionElement === hit || actionElement.contains(hit),
        globalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
      };
    });

    if (viewport.width > 1100) {
      assert.ok(layout.tasksRight < layout.widgetsLeft, `${viewport.width}px: tarefas não podem invadir Minhas atividades.`);
assert.ok(layout.performanceRight <= layout.attentionLeft + 2, `${viewport.width}px: painel de performance não pode sobrepor os cartões de atenção.`);
      assert.ok(layout.attentionRight <= layout.hearingsLeft + 2, `${viewport.width}px: cartões de atenção não podem sobrepor a tile de audiências.`);
    }
    assert.ok(layout.actionTop < layout.heroTop, `${viewport.width}px: a ação principal deve preceder o resumo longo.`);
    assert.ok(layout.toolbarTop < layout.heroTop, `${viewport.width}px: a toolbar deve preceder o resumo.`);
    assert.equal(layout.actionFocused, true, `${viewport.width}px: ação principal deve aceitar foco.`);
    assert.equal(layout.actionUnobstructed, true, `${viewport.width}px: ação principal não pode estar encoberta.`);
    if (viewport.width <= 620) {
      assert.ok(layout.actionBottom <= viewport.height, `${viewport.width}px: a ação principal deve caber na primeira tela.`);
      assert.ok(layout.actionWidth >= 44, `${viewport.width}px: ação principal deve ter alvo de toque utilizável.`);
    }
    assert.ok(layout.filtersRight <= layout.tasksRight + 1, `${viewport.width}px: filtros devem permanecer dentro do cartão.`);
    assert.ok(layout.globalOverflow <= 1, `${viewport.width}px: o ajuste não pode criar rolagem horizontal.`);
    assert.ok(layout.performanceWidth > 200, `${viewport.width}px: painel de performance deve permanecer utilizável.`);
    if (viewport.width <= 860) {
      const mobileOrder = await page.evaluate(() => {
        const attention = document.querySelector('.v2-attention-grid');
        const performance = document.getElementById('v2PerformancePanel');
        const hero = document.getElementById('v2DashboardOpening');
        const task = document.querySelector('.dashboard-tasks-column');
        const check = document.querySelector('.dashboard-task-check');
        return {
domOrder: performance.compareDocumentPosition(attention) & Node.DOCUMENT_POSITION_FOLLOWING,
performanceBottom: performance.getBoundingClientRect().bottom,
attentionTop: attention.getBoundingClientRect().top,
          heroHeight: hero.getBoundingClientRect().height,
          taskVisible: getComputedStyle(task).display !== 'none',
          checkWidth: check?.getBoundingClientRect().width || 0
        };
      });
assert.ok(mobileOrder.domOrder, `${viewport.width}px: desempenho precisa preceder as pendências na ordem de leitura.`);
assert.ok(mobileOrder.performanceBottom <= mobileOrder.attentionTop + 1, `${viewport.width}px: desempenho deve vir antes das pendências.`);
      assert.ok(mobileOrder.taskVisible, `${viewport.width}px: tarefas existentes devem permanecer visíveis.`);
      if (mobileOrder.checkWidth) assert.ok(mobileOrder.checkWidth >= 44, `${viewport.width}px: checkbox de tarefa precisa de alvo touch.`);
    }
    if (layout.tasksWidth <= 920) {
      assert.ok(layout.controlsTop >= layout.titleBottom - 1, `${viewport.width}px: controles devem descer quando faltar largura.`);
    }
    assert.deepEqual(pageErrors, []);
    await context.close();
  }
} finally {
  await responsiveSession.stop();
}

console.log('✓ Dashboard V2 aprovado: atenção, agenda e panorama acionável usam somente dados derivados existentes.');
