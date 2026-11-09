import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDashboardFeature } from '../js/features/dashboard.js';
import { renderDashboardV2Summary } from '../js/views/ui-v2/dashboard.js';

console.log('\n===============================================================');
console.log('  ATRIUM — FUNIL SEMANAL NO DASHBOARD (UI V2)                  ');
console.log('===============================================================\n');

const portalSource = readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
assert.match(portalSource, /requestPublicationFunnel: async \(\) =>/, 'Portal deve injetar a leitura do funil semanal.');
const dashboardFeatureSource = readFileSync(new URL('../js/features/dashboard.js', import.meta.url), 'utf8');
assert.match(dashboardFeatureSource, /views\/ui-v2\/dashboard\.js\?v=/, 'O presenter do dashboard precisa de versão explícita para furar cache.');
console.log('✓ Wiring do portal presente.');

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function makeNode(dataset = {}) {
  return {
    dataset,
    innerHTML: '',
    textContent: '',
    value: '',
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {},
    querySelectorAll: () => []
  };
}
const presenterIds = ['v2AttentionLate', 'v2AttentionPublications', 'v2AttentionDeadlines', 'v2AttentionAgenda', 'v2AttentionAgendaDetail', 'v2AttentionSummary', 'v2DashboardOpening', 'dashboardActionableInsights'];
const presenterElements = Object.fromEntries(presenterIds.map(id => [id, makeNode()]));
const presenterDoc = { getElementById: id => presenterElements[id] || null };
const baseInsights = { pendingPublications: 3, averageTreatmentMinutes: 90, recentActivityCount: 1, treatmentSampleSize: 2 };

const weekly = [
  { week: '2026-W37', weekStart: '2026-09-07', weekEnd: '2026-09-13', received: 12, treated: 9, discarded: 2, pending: 4 },
  { week: '2026-W38', weekStart: '2026-09-14', weekEnd: '2026-09-20', received: 7, treated: 5, discarded: 1, pending: 5 }
];
renderDashboardV2Summary({ documentRef: presenterDoc, metrics: {}, widgets: {}, insights: { ...baseInsights, weeklyFunnel: weekly }, formatDate: v => `DATA:${v}`, formatCurrency: v => `BRL:${v}`, escapeHtml });
const withFunnel = presenterElements.dashboardActionableInsights.innerHTML;
assert.match(withFunnel, /dashboard-funnel-weekly/);
assert.match(withFunnel, /Semana de 14\/09 a 20\/09/, 'Cabeçalho da semana deve ter faixa completa acessível.');
assert.match(withFunnel, /<th scope="row">Recebidas<\/th><td>12<\/td><td>7<\/td>/, 'Contagens da coorte devem aparecer por semana.');
assert.match(withFunnel, /<th scope="row">Tratadas<\/th><td>9<\/td><td>5<\/td>/);
assert.match(withFunnel, /últimas 2 semanas/);
assert.deepEqual(
  [...withFunnel.matchAll(/<th scope="col"[^>]*>([^<]+)<\/th>/g)].map(match => match[1]),
  ['Métrica', '07/09', '14/09']
);
assert.equal((withFunnel.match(/scope="row"/g) || []).length, 4, 'Quatro métricas compõem o funil.');

renderDashboardV2Summary({ documentRef: presenterDoc, metrics: {}, widgets: {}, insights: { ...baseInsights, pendingPublications: 1, pendingSyncs: 1 }, formatDate: v => `DATA:${v}`, formatCurrency: v => `BRL:${v}`, escapeHtml });
const singular = presenterElements.dashboardActionableInsights.innerHTML;
assert.match(singular, /1 pendente\b/, 'Uma publicação pendente exige singular.');
assert.match(singular, /1 pendência\b/, 'Uma pendência operacional exige singular.');
assert.doesNotMatch(singular, /1 pendentes|1 pendências/, 'Singular não pode usar plural.');

const manyWeeks = Array.from({ length: 6 }, (_, index) => ({
  week: `2026-W${String(30 + index).padStart(2, '0')}`,
  weekStart: '2026-07-20', weekEnd: '2026-07-26',
  received: index, treated: 0, discarded: 0, pending: index
}));
renderDashboardV2Summary({ documentRef: presenterDoc, metrics: {}, widgets: {}, insights: { ...baseInsights, weeklyFunnel: manyWeeks }, formatDate: v => `DATA:${v}`, formatCurrency: v => `BRL:${v}`, escapeHtml });
const cappedRows = presenterElements.dashboardActionableInsights.innerHTML;
assert.equal((cappedRows.match(/scope="col"/g) || []).length, 5, 'O card mostra no máximo as 4 semanas mais recentes.');
assert.match(cappedRows, /últimas 4 semanas/);

renderDashboardV2Summary({ documentRef: presenterDoc, metrics: {}, widgets: {}, insights: { ...baseInsights, weeklyFunnel: [{ week: '2026-W38', weekStart: '2026-09-14', weekEnd: '2026-09-20', received: 0, treated: 0, discarded: 0, pending: 0 }] }, formatDate: v => `DATA:${v}`, formatCurrency: v => `BRL:${v}`, escapeHtml });
assert.doesNotMatch(presenterElements.dashboardActionableInsights.innerHTML, /dashboard-funnel-weekly/, 'Semana zerada não polui o card.');
renderDashboardV2Summary({ documentRef: presenterDoc, metrics: {}, widgets: {}, insights: { ...baseInsights, weeklyFunnel: null }, formatDate: v => `DATA:${v}`, formatCurrency: v => `BRL:${v}`, escapeHtml });
assert.doesNotMatch(presenterElements.dashboardActionableInsights.innerHTML, /dashboard-funnel-weekly/, 'Ausência de funil mantém o card atual.');

const hostileWeek = [{ week: '2026-W38<script>', weekStart: 'inválido', weekEnd: '', received: 1, treated: 0, discarded: 0, pending: 0 }];
renderDashboardV2Summary({ documentRef: presenterDoc, metrics: {}, widgets: {}, insights: { ...baseInsights, weeklyFunnel: hostileWeek }, formatDate: v => `DATA:${v}`, formatCurrency: v => `BRL:${v}`, escapeHtml });
assert.doesNotMatch(presenterElements.dashboardActionableInsights.innerHTML, /<script>/, 'Semana de fonte externa deve ser escapada.');
console.log('✓ Presenter: semanas legíveis, teto de 4, semana zerada oculta e escape.');

const featureIds = [
  'btnDashboardNewTask', 'dashboardTaskSortSelect', 'dashboardTaskFilters', 'dashboardTaskList', 'dashboardTaskCount',
  'metricInbox', 'metricDeadlines', 'metricTasks', 'metricSources', 'inboxBadge', 'notificationDot',
  'widgetCompletedTasks', 'widgetLateTasks', 'widgetPendingTasks', 'widgetProcActive', 'widgetProcInactive',
  'widgetActiveLeads', 'widgetHonorariosPending', 'widgetTimesheetHours', 'widgetDocsCount', 'dashboardRemindersList',
  'activityInboxFilters', 'activityInboxList', 'activityInboxCount', 'dashboardActionableInsights'
];
const featureElements = Object.fromEntries(featureIds.map(id => [id, makeNode()]));
const store = {
  state: {
    tasks: [], processes: [], sources: [], intimations: [], leads: [], agenda: [], customDocs: [], documents: []
  }
};
let funnelCalls = 0;
const feature = createDashboardFeature({
  store,
  documentRef: { documentElement: { dataset: { ui: 'v2' } }, getElementById: id => featureElements[id] || null },
  escapeHtml,
  formatDate: value => `DATA:${value}`,
  formatMinutes: value => `${value} min`,
  formatCurrency: value => `BRL:${value}`,
  daysUntil: () => 1,
  isTerminalStatus: () => false,
  requestPublicationFunnel: async () => { funnelCalls += 1; return { ok: true, weeks: weekly }; }
});
const rendered = feature.render();
assert.equal(funnelCalls, 1, 'Primeiro render do dashboard carrega o funil uma vez.');
assert.equal(rendered.insights.weeklyFunnel, null, 'Render síncrono não bloqueia no funil.');
await new Promise(resolve => setImmediate(resolve));
assert.match(featureElements.dashboardActionableInsights.innerHTML, /dashboard-funnel-weekly/, 'Funil aparece após a carga assíncrona.');
feature.render();
await new Promise(resolve => setImmediate(resolve));
assert.equal(funnelCalls, 1, 'Renders seguintes reutilizam o funil em cache.');

const classicElements = Object.fromEntries(featureIds.map(id => [id, makeNode()]));
let classicCalls = 0;
const classicFeature = createDashboardFeature({
  store,
  documentRef: { documentElement: { dataset: { ui: 'classic' } }, getElementById: id => classicElements[id] || null },
  escapeHtml,
  formatDate: value => `DATA:${value}`,
  formatMinutes: value => `${value} min`,
  formatCurrency: value => `BRL:${value}`,
  daysUntil: () => 1,
  isTerminalStatus: () => false,
  requestPublicationFunnel: async () => { classicCalls += 1; return { weeks: weekly }; }
});
classicFeature.render();
await new Promise(resolve => setImmediate(resolve));
assert.equal(classicCalls, 0, 'Classic não consulta o funil semanal.');
console.log('✓ Feature: carga única em v2, cache e isolamento do Classic.');

console.log('\n>>> FUNIL SEMANAL NO DASHBOARD: PASS <<<\n');
