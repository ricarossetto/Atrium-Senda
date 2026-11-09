import assert from 'node:assert/strict';
import { createConfigurationFeature } from '../js/features/configuration.js';
import { createDashboardFeature } from '../js/features/dashboard.js';
import {
  DASHBOARD_WIDGETS,
  dashboardWorkspaceMode,
  readDashboardWidgetPreferences,
  resetDashboardWidgetPreferences,
  writeDashboardWidgetPreferences
} from '../js/core/dashboard-widgets.js';

console.log('\n===============================================================');
console.log('  ATRIUM — WIDGETS EXPERIMENTAIS (CONFIGURACAO + DASHBOARD)     ');
console.log('===============================================================\n');

function makeStorage() {
  const data = new Map();
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    raw: () => data.get('atrium_dashboard_widgets')
  };
}
const storage = makeStorage();
const bridge = Object.freeze({
  catalog: DASHBOARD_WIDGETS,
  read: () => readDashboardWidgetPreferences(storage),
  write: preferences => writeDashboardWidgetPreferences(storage, preferences),
  reset: () => resetDashboardWidgetPreferences(storage),
  workspaceMode: preferences => dashboardWorkspaceMode(preferences)
});

function makeClassList(initial = []) {
  const values = new Set(initial);
  return {
    toggle(name, force) { if (force) values.add(name); else values.delete(name); },
    contains: name => values.has(name)
  };
}
function makeConfigElement() {
  const listeners = new Map();
  return {
    innerHTML: '', textContent: '', classList: makeClassList(), listeners,
    wrapper: { classList: makeClassList() },
    closest(selector) { return selector === '.table-search' ? this.wrapper : null; },
    addEventListener(type, handler) { (listeners.get(type) || listeners.set(type, []).get(type)).push(handler); }
  };
}
const configIds = ['configurationSearch', 'configurationTabs', 'newConfigurationButton', 'configurationList', 'configurationMetrics', 'configurationHeading', 'configurationCount', 'modalForm', 'modalClose', 'modalCancel'];
const configElements = Object.fromEntries(configIds.map(id => [id, makeConfigElement()]));
const toasts = [];
let dashboardRenders = 0;
const configurationFeature = createConfigurationFeature({
  store: { state: { configuration: {}, contacts: [] }, save() {}, audit() {}, flush: async () => true },
  documentRef: { getElementById: id => configElements[id] || null },
  escapeHtml: value => String(value ?? ''),
  normalizeText: value => String(value ?? '').toLowerCase(),
  dashboardWidgets: bridge,
  onDashboardWidgetsChanged: () => { dashboardRenders += 1; },
  showToast: (message, type) => toasts.push({ message, type })
});
configurationFeature.init();
configurationFeature.section = 'experimental';
configurationFeature.render();
const list = configElements.configurationList;
assert.equal(configElements.configurationHeading.textContent, 'Preferências deste navegador');
assert.equal(configElements.configurationCount.textContent, 'Preferência local');
assert.equal(configElements.newConfigurationButton.classList.contains('hidden'), true, 'Seção especial não mostra "novo registro".');
assert.match(list.innerHTML, /Personalização do painel/);
assert.match(list.innerHTML, /Desligada por padrão/);
assert.match(list.innerHTML, /data-experimental-toggle(?! checked)/, 'Toggle mestre começa desligado.');
assert.equal((list.innerHTML.match(/data-experimental-widget="/g) || []).length, 6, 'Os 6 blocos aparecem na lista.');
assert.equal((list.innerHTML.match(/data-experimental-widget="[^"]+" checked disabled/g) || []).length, 6, 'Com a personalização desligada, todos ficam marcados e desabilitados.');
assert.match(list.innerHTML, /data-experimental-reset disabled/);
console.log('✓ Seção Experimental desligada por padrão, com o layout atual preservado.');

configurationFeature.setDashboardWidgetsEnabled(true);
assert.deepEqual(JSON.parse(storage.raw()), { enabled: true, hidden: [] });
assert.equal(dashboardRenders, 1, 'Ativar re-renderiza o dashboard.');
assert.match(list.innerHTML, /data-experimental-toggle checked/);
assert.equal((list.innerHTML.match(/data-experimental-widget="[^"]+" checked(?! disabled)/g) || []).length, 6, 'Todos os blocos ligados ao ativar.');
assert.match(toasts.at(-1).message, /Personalização do painel ativada/);

configurationFeature.setDashboardWidget('inbox', false);
assert.deepEqual(JSON.parse(storage.raw()), { enabled: true, hidden: ['inbox'] });
assert.equal(dashboardRenders, 2);
assert.match(list.innerHTML, /data-experimental-widget="inbox"(?! checked)/, 'Bloco desligado sai da marcação.');
configurationFeature.setDashboardWidget('inbox', true);
assert.deepEqual(JSON.parse(storage.raw()), { enabled: true, hidden: [] });

configurationFeature.setDashboardWidgetsEnabled(false);
assert.deepEqual(JSON.parse(storage.raw()), { enabled: false, hidden: [] });
assert.equal(dashboardRenders, 4);
assert.match(toasts.at(-1).message, /layout original restaurado/);

configurationFeature.setDashboardWidgetsEnabled(true);
configurationFeature.setDashboardWidget('metrics', false);
configurationFeature.resetDashboardWidgets();
assert.deepEqual(JSON.parse(storage.raw()), { enabled: false, hidden: [] });
assert.equal(dashboardRenders, 7);
console.log('✓ Ativar, desligar bloco e restaurar padrão (com re-render do dashboard).');

const selectors = new Map(DASHBOARD_WIDGETS.map(widget => [widget.id, { hidden: false, classList: makeClassList() }]));
const wrap = { classList: makeClassList() };
const dashboardFeature = createDashboardFeature({
  store: { state: {} },
  documentRef: { querySelector: selector => selector === '#view-dashboard .dashboard-workspace-wrap' ? wrap : (selectors.get(DASHBOARD_WIDGETS.find(widget => widget.selector === selector)?.id) || null) },
  dashboardWidgets: bridge
});
assert.equal(dashboardFeature.applyDashboardWidgetPreferences(), true);
for (const [id, element] of selectors) assert.equal(element.hidden, false, `${id}: visível com a personalização desligada.`);
assert.equal(wrap.classList.contains('is-single-column'), false);
assert.equal(wrap.classList.contains('is-empty-columns'), false);
console.log('✓ Desligado: todos os blocos visíveis e grid original.');

bridge.write({ enabled: true, hidden: ['tasks', 'inbox'] });
dashboardFeature.applyDashboardWidgetPreferences();
assert.equal(selectors.get('tasks').hidden, true);
assert.equal(selectors.get('inbox').hidden, true);
assert.equal(selectors.get('attention').hidden, false);
assert.equal(selectors.get('widgets').hidden, false);
assert.equal(wrap.classList.contains('is-single-column'), true, 'Uma coluna escondida vira grid de coluna única.');
assert.equal(wrap.classList.contains('is-empty-columns'), false);

bridge.write({ enabled: true, hidden: ['tasks', 'widgets'] });
dashboardFeature.applyDashboardWidgetPreferences();
assert.equal(wrap.classList.contains('is-empty-columns'), true, 'Duas colunas escondidas removem o workspace.');

bridge.reset();
dashboardFeature.applyDashboardWidgetPreferences();
for (const [id, element] of selectors) assert.equal(element.hidden, false, `${id}: restaurado.`);
assert.equal(wrap.classList.contains('is-single-column'), false);
assert.equal(wrap.classList.contains('is-empty-columns'), false);
console.log('✓ Ligado: blocos desmarcados escondem, colunas ajustam e restaurar volta ao original.');

console.log('\n>>> WIDGETS EXPERIMENTAIS: PASS <<<\n');
