import assert from 'node:assert/strict';
import {
  DASHBOARD_WIDGETS,
  DASHBOARD_WIDGETS_STORAGE_KEY,
  dashboardWorkspaceMode,
  emptyDashboardWidgetPreferences,
  isDashboardWidgetVisible,
  normalizeDashboardWidgetPreferences,
  readDashboardWidgetPreferences,
  readDashboardWidgetPreferencesFromState,
  resetDashboardWidgetPreferences,
  setDashboardWidgetEnabled,
  writeDashboardWidgetPreferences,
  writeDashboardWidgetPreferencesToState
} from '../js/core/dashboard-widgets.js';
import { validateAppState } from '../lib/state-migrations.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — PERSONALIZACAO DO PAINEL (EXPERIMENTAL, LOCAL)       ');
console.log('===============================================================\n');

assert.equal(DASHBOARD_WIDGETS.length, 6, 'Seis blocos compõem o catálogo.');
assert.deepEqual(DASHBOARD_WIDGETS.map(widget => widget.id), ['attention', 'metrics', 'tasks', 'widgets', 'inbox', 'insights']);
for (const widget of DASHBOARD_WIDGETS) {
  assert.match(widget.selector, /^#view-dashboard|^#v2DashboardOpening$/, `${widget.id}: seletor deve ser escopado ao dashboard.`);
  assert.ok(widget.label && widget.description, `${widget.id}: rótulo e descrição obrigatórios.`);
}
console.log('✓ Catálogo dos 6 blocos com seletores escopados.');

assert.deepEqual(emptyDashboardWidgetPreferences(), { enabled: false, hidden: [] });
assert.deepEqual(normalizeDashboardWidgetPreferences(null), { enabled: false, hidden: [] });
assert.deepEqual(normalizeDashboardWidgetPreferences('lixo'), { enabled: false, hidden: [] });
assert.deepEqual(normalizeDashboardWidgetPreferences([]), { enabled: false, hidden: [] });
assert.deepEqual(normalizeDashboardWidgetPreferences({ enabled: 'sim', hidden: 'tasks' }), { enabled: false, hidden: [] }, 'Tipos errados não ligam a personalização.');
assert.deepEqual(normalizeDashboardWidgetPreferences({ enabled: true, hidden: ['tasks', 'tasks', 'inexistente', 42] }), { enabled: true, hidden: ['tasks'] }, 'Somente ids conhecidos, sem duplicar.');
console.log('✓ Normalização fail-closed (padrão desligado) e ids filtrados.');

function fakeStorage(initial = null) {
  const data = new Map();
  if (initial !== null) data.set(DASHBOARD_WIDGETS_STORAGE_KEY, initial);
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    raw: () => data.get(DASHBOARD_WIDGETS_STORAGE_KEY)
  };
}
assert.deepEqual(readDashboardWidgetPreferences(fakeStorage()), { enabled: false, hidden: [] });
assert.deepEqual(readDashboardWidgetPreferences(fakeStorage('{invalido')), { enabled: false, hidden: [] }, 'JSON inválido volta ao padrão.');
assert.deepEqual(readDashboardWidgetPreferences(fakeStorage(JSON.stringify({ enabled: true, hidden: ['inbox'] }))), { enabled: true, hidden: ['inbox'] });
assert.deepEqual(readDashboardWidgetPreferences(null), { enabled: false, hidden: [] }, 'Sem storage, padrão desligado.');
const storage = fakeStorage();
writeDashboardWidgetPreferences(storage, { enabled: true, hidden: ['metrics', 'metrics'] });
assert.deepEqual(JSON.parse(storage.raw()), { enabled: true, hidden: ['metrics'] });
resetDashboardWidgetPreferences(storage);
assert.deepEqual(JSON.parse(storage.raw()), { enabled: false, hidden: [] });
console.log('✓ Leitura/escrita/reset com storage injetável e sem quebrar sem storage.');

const off = { enabled: false, hidden: ['inbox'] };
assert.equal(isDashboardWidgetVisible(off, 'inbox'), true, 'Com a personalização desligada, todos os blocos aparecem.');
assert.equal(isDashboardWidgetVisible(off, 'inexistente'), true);
const on = { enabled: true, hidden: ['inbox'] };
assert.equal(isDashboardWidgetVisible(on, 'inbox'), false);
assert.equal(isDashboardWidgetVisible(on, 'tasks'), true);

assert.deepEqual(setDashboardWidgetEnabled(emptyDashboardWidgetPreferences(), 'tasks', false), { enabled: false, hidden: ['tasks'] });
assert.deepEqual(setDashboardWidgetEnabled({ enabled: true, hidden: ['tasks'] }, 'tasks', true), { enabled: true, hidden: [] });
assert.deepEqual(setDashboardWidgetEnabled({ enabled: true, hidden: [] }, 'inexistente', false), { enabled: true, hidden: [] }, 'Id desconhecido é ignorado.');
console.log('✓ Visibilidade e ligar/desligar por bloco.');

assert.equal(dashboardWorkspaceMode({ enabled: false, hidden: ['tasks', 'widgets'] }), 'default', 'Desligado mantém o grid original.');
assert.equal(dashboardWorkspaceMode({ enabled: true, hidden: [] }), 'default');
assert.equal(dashboardWorkspaceMode({ enabled: true, hidden: ['tasks'] }), 'single-widgets');
assert.equal(dashboardWorkspaceMode({ enabled: true, hidden: ['widgets'] }), 'single-tasks');
assert.equal(dashboardWorkspaceMode({ enabled: true, hidden: ['tasks', 'widgets'] }), 'hidden');
console.log('✓ Modo do grid derivado sem trilha vazia.');

// Preferencia do workspace: estado canonico (Store/servidor) com leitura legada local.
{
  const state = { settings: {} };
  assert.equal(readDashboardWidgetPreferencesFromState(state), null, 'Sem preferencia no estado, o bridge cai para a leitura legada.');
  const written = writeDashboardWidgetPreferencesToState(state, { enabled: true, hidden: ['metrics', 'inexistente'] });
  assert.deepEqual(written, { enabled: true, hidden: ['metrics'] });
  assert.deepEqual(state.settings.dashboardWidgets, { enabled: true, hidden: ['metrics'] }, 'Preferencia vive no estado do workspace.');
  assert.deepEqual(readDashboardWidgetPreferencesFromState(state), { enabled: true, hidden: ['metrics'] });
  assert.equal(readDashboardWidgetPreferencesFromState({ settings: {} }), null);
  assert.deepEqual(readDashboardWidgetPreferencesFromState({ settings: { dashboardWidgets: 'lixo' } }), { enabled: false, hidden: [] }, 'Valor invalido no estado cai no padrao desligado.');
  writeDashboardWidgetPreferencesToState(state, emptyDashboardWidgetPreferences());
  assert.deepEqual(state.settings.dashboardWidgets, { enabled: false, hidden: [] });

  const baseState = () => ({
    schemaVersion: 12, terms: [], sources: [], intimations: [], tasks: [], processes: [], agenda: [],
    audit: [], contacts: [], documents: [], customPrompts: [], customLinks: [], officeExpenses: [], calculations: [],
    communications: [], settings: { officeName: 'Escritorio Sintetico' }
  });
  const validState = baseState();
  validState.settings.dashboardWidgets = { enabled: true, hidden: ['tasks'] };
  assert.equal(validateAppState(validState).valid, true, 'Preferencia valida do painel passa na validacao estrita.');
  const invalidState = baseState();
  invalidState.settings.dashboardWidgets = { enabled: 'sim', hidden: ['inexistente'] };
  assert.throws(() => validateAppState(invalidState), /dashboardWidgets/, 'Preferencia invalida e recusada pelo servidor.');
  console.log('OK: preferencia do workspace validada no estado canonico (com leitura legada preservada).');
}

console.log('\n>>> PERSONALIZACAO DO PAINEL: PASS <<<\n');
