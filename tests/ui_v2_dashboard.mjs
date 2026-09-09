import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderDashboardV2Summary } from '../js/views/ui-v2/dashboard.js';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

function makeElement() {
  return { textContent: '', innerHTML: '', dataset: {} };
}

const ids = ['v2AttentionLate', 'v2AttentionPublications', 'v2AttentionDeadlines', 'v2AttentionAgenda', 'v2AttentionAgendaDetail', 'v2AttentionSummary', 'v2DashboardOpening', 'dashboardActionableInsights'];
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

const result = renderDashboardV2Summary({ documentRef, metrics, widgets, insights, formatDate: value => `DATA:${value}`, formatCurrency: value => `BRL:${value}`, escapeHtml: value => String(value) });
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

const clear = renderDashboardV2Summary({ documentRef, metrics: {}, widgets: { reminders: [] } });
assert.equal(clear.attentionState, 'clear');
assert.match(elements.v2AttentionSummary.textContent, /Nenhuma pendência crítica/);
assert.equal(elements.v2AttentionAgenda.textContent, 'Livre');

const dashboardFeatureSource = readFileSync(new URL('../js/features/dashboard.js', import.meta.url), 'utf8');
const dashboardPresenterSource = readFileSync(new URL('../js/views/ui-v2/dashboard.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(dashboardFeatureSource, /renderDashboardV2Summary\(\{ documentRef, metrics, widgets, insights, formatDate, formatCurrency, escapeHtml \}\)/, 'O presenter V2 deve receber somente valores já derivados.');
assert.doesNotMatch(dashboardPresenterSource, /fetch\(|secureFetch|Store|save\(|flush\(/, 'O presenter do Dashboard não pode acessar rede ou Store.');
for (const id of ids) assert.equal((indexSource.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} deve existir uma única vez.`);
assert.match(indexSource, /Triagem humana necessária/, 'A hierarquia deve explicitar ação humana sobre publicações.');
assert.match(indexSource, /Confirme datas críticas/, 'A UI não pode apresentar prazo como inferência automática.');
assert.match(indexSource, /Indicadores para decisão/, 'O dashboard deve expor somente indicadores úteis para decisão.');
assert.match(indexSource, /Prazos em 7 dias/, 'Prazos de tarefas não podem ser rotulados como compromissos.');

const responsiveSession = await startUiV2Session({ viewport: { width: 1635, height: 912 } });
try {
  for (const viewport of [{ width: 1635, height: 912 }, { width: 1440, height: 900 }]) {
    const context = await responsiveSession.createContext({ viewport });
    const { page, pageErrors } = await prepareUiV2Page(context, responsiveSession.server.baseUrl);
    const layout = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      const tasks = rect('.dashboard-tasks-column');
      const widgetsColumn = rect('.dashboard-widgets-column');
      const filters = rect('#dashboardTaskFilters');
      const controls = rect('.dashboard-tasks-header > div:last-child');
      const title = rect('.dashboard-tasks-title');
      return {
        tasksRight: tasks.right,
        tasksWidth: tasks.width,
        widgetsLeft: widgetsColumn.left,
        filtersRight: filters.right,
        controlsTop: controls.top,
        titleBottom: title.bottom,
        globalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
      };
    });

    assert.ok(layout.tasksRight < layout.widgetsLeft, `${viewport.width}px: tarefas não podem invadir Minhas atividades.`);
    assert.ok(layout.filtersRight <= layout.tasksRight + 1, `${viewport.width}px: filtros devem permanecer dentro do cartão.`);
    assert.ok(layout.globalOverflow <= 1, `${viewport.width}px: o ajuste não pode criar rolagem horizontal.`);
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
