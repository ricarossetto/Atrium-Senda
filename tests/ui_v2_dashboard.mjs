import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderDashboardV2Summary } from '../js/views/ui-v2/dashboard.js';

function makeElement() {
  return { textContent: '', dataset: {} };
}

const ids = ['v2AttentionLate', 'v2AttentionPublications', 'v2AttentionDeadlines', 'v2AttentionAgenda', 'v2AttentionAgendaDetail', 'v2AttentionSummary', 'v2DashboardOpening'];
const elements = Object.fromEntries(ids.map(id => [id, makeElement()]));
const documentRef = { getElementById: id => elements[id] || null };
const metrics = { untreatedIntimations: 4, deadlines: 2, activeProcesses: 8, activeSources: 3, sourceCount: 4 };
const widgets = {
  late: 3,
  pending: 5,
  reminders: [{ id: 'agenda-sintetica', date: '2026-09-01', title: 'Audiência sintética' }]
};

const result = renderDashboardV2Summary({ documentRef, metrics, widgets, formatDate: value => `DATA:${value}` });
assert.deepEqual(result, { late: 3, untreated: 4, deadlines: 2, nextAgendaId: 'agenda-sintetica', attentionState: 'attention' });
assert.equal(elements.v2AttentionLate.textContent, '3');
assert.equal(elements.v2AttentionPublications.textContent, '4');
assert.equal(elements.v2AttentionDeadlines.textContent, '2');
assert.equal(elements.v2AttentionAgenda.textContent, 'DATA:2026-09-01');
assert.equal(elements.v2AttentionAgendaDetail.textContent, 'Audiência sintética');
assert.equal(elements.v2DashboardOpening.dataset.attentionState, 'attention');

const clear = renderDashboardV2Summary({ documentRef, metrics: {}, widgets: { reminders: [] } });
assert.equal(clear.attentionState, 'clear');
assert.match(elements.v2AttentionSummary.textContent, /Nenhuma pendência crítica/);
assert.equal(elements.v2AttentionAgenda.textContent, 'Livre');

const dashboardFeatureSource = readFileSync(new URL('../js/features/dashboard.js', import.meta.url), 'utf8');
const dashboardPresenterSource = readFileSync(new URL('../js/views/ui-v2/dashboard.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(dashboardFeatureSource, /renderDashboardV2Summary\(\{ documentRef, metrics, widgets, formatDate \}\)/, 'O presenter V2 deve receber somente valores já derivados.');
assert.doesNotMatch(dashboardPresenterSource, /fetch\(|secureFetch|Store|save\(|flush\(/, 'O presenter do Dashboard não pode acessar rede ou Store.');
for (const id of ids) assert.equal((indexSource.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} deve existir uma única vez.`);
assert.match(indexSource, /Triagem humana necessária/, 'A hierarquia deve explicitar ação humana sobre publicações.');
assert.match(indexSource, /Confirme datas críticas/, 'A UI não pode apresentar prazo como inferência automática.');

console.log('✓ Dashboard V2 aprovado: atenção, atrasos, publicações, agenda e empty state usam somente dados derivados existentes.');
