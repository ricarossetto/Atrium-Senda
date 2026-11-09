/**
 * Preferência local de personalização do painel (experimental).
 *
 * Desligada por padrão: enquanto `enabled` for falso, o dashboard permanece
 * exatamente como sempre foi. Quando ligada, o usuário escolhe quais blocos do
 * painel aparecem; a preferência é **somente deste navegador** (localStorage),
 * não toca o Store, o backend, prazos, permissões ou dados.
 *
 * Módulo puro quanto a DOM/rede: o storage é injetável e a leitura é
 * fail-closed (valor inválido volta ao padrão desligado).
 */

export const DASHBOARD_WIDGETS_STORAGE_KEY = 'atrium_dashboard_widgets';
export const DASHBOARD_WIDGETS_SETTINGS_KEY = 'dashboardWidgets';
export const UI_DENSITY_STORAGE_KEY = 'atrium_ui_density';
export const UI_DENSITIES = Object.freeze(['basic', 'pro']);

export function normalizeUiDensity(raw) {
  const value = String(raw || '').trim().toLowerCase();
  return UI_DENSITIES.includes(value) ? value : null;
}

export function readUiDensityPreference(storage = null) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  try {
    return normalizeUiDensity(storage.getItem(UI_DENSITY_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeUiDensityPreference(storage, value) {
  const normalized = normalizeUiDensity(value) || 'pro';
  if (!storage || typeof storage.setItem !== 'function') return { value: normalized, persisted: false };
  try {
    storage.setItem(UI_DENSITY_STORAGE_KEY, normalized);
    return { value: normalized, persisted: storage.getItem(UI_DENSITY_STORAGE_KEY) === normalized };
  } catch {
    return { value: normalized, persisted: false };
  }
}

export const DASHBOARD_WIDGETS = Object.freeze([
  Object.freeze({
    id: 'attention',
    label: 'Painel de atenção',
    description: 'Tarefas atrasadas, publicações pendentes, prazos em 7 dias e próximo compromisso.',
    selector: '#v2DashboardOpening'
  }),
  Object.freeze({
    id: 'metrics',
    label: 'Métricas do escritório',
    description: 'Publicações novas, prazos, processos ativos e fontes saudáveis.',
    selector: '#view-dashboard .metric-grid'
  }),
  Object.freeze({
    id: 'tasks',
    label: 'Lista de tarefas e prazos',
    description: 'Coluna de tarefas com filtros, ordenação e conclusão.',
    selector: '#view-dashboard .dashboard-tasks-column'
  }),
  Object.freeze({
    id: 'widgets',
    label: 'Widgets do escritório',
    description: 'Minhas atividades, processos e casos, estatísticas e lembretes.',
    selector: '#view-dashboard .dashboard-widgets-column'
  }),
  Object.freeze({
    id: 'inbox',
    label: 'Caixa de atividades',
    description: 'O que precisa da sua atenção.',
    selector: '#view-dashboard .activity-inbox'
  }),
  Object.freeze({
    id: 'insights',
    label: 'Indicadores do escritório',
    description: 'Carga de trabalho, fluxo de publicações, saúde operacional e carteira.',
    selector: '#view-dashboard .dashboard-actionable-insights'
  })
]);

const WIDGET_IDS = new Set(DASHBOARD_WIDGETS.map(widget => widget.id));

export function emptyDashboardWidgetPreferences() {
  return { enabled: false, hidden: [] };
}

export function normalizeDashboardWidgetPreferences(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyDashboardWidgetPreferences();
  const hidden = Array.isArray(raw.hidden)
    ? [...new Set(raw.hidden.map(value => String(value || '').trim()).filter(id => WIDGET_IDS.has(id)))]
    : [];
  return { enabled: raw.enabled === true, hidden };
}

function resolveStorage(storage) {
  if (storage && typeof storage.getItem === 'function') return storage;
  return null;
}

export function readDashboardWidgetPreferences(storage = null) {
  const target = resolveStorage(storage);
  if (!target) return emptyDashboardWidgetPreferences();
  try {
    return normalizeDashboardWidgetPreferences(JSON.parse(target.getItem(DASHBOARD_WIDGETS_STORAGE_KEY)));
  } catch {
    return emptyDashboardWidgetPreferences();
  }
}

export function writeDashboardWidgetPreferences(storage, preferences) {
  const target = resolveStorage(storage);
  const normalized = normalizeDashboardWidgetPreferences(preferences);
  if (!target || typeof target.setItem !== 'function') return normalized;
  try {
    target.setItem(DASHBOARD_WIDGETS_STORAGE_KEY, JSON.stringify(normalized));
  } catch { /* preferência local indisponível: mantém o padrão em memória */ }
  return normalized;
}

/**
 * Preferência única do workspace: vive em `state.settings.dashboardWidgets`
 * (Store + servidor), valendo para todos os navegadores do escritório. O
 * localStorage permanece apenas como leitura legada de migração.
 */
export function readDashboardWidgetPreferencesFromState(state) {
  const raw = state?.settings?.[DASHBOARD_WIDGETS_SETTINGS_KEY];
  if (raw === undefined || raw === null) return null;
  return normalizeDashboardWidgetPreferences(raw);
}

export function writeDashboardWidgetPreferencesToState(state, preferences) {
  const normalized = normalizeDashboardWidgetPreferences(preferences);
  if (state && typeof state === 'object' && !Array.isArray(state)) {
    if (!state.settings || typeof state.settings !== 'object' || Array.isArray(state.settings)) state.settings = {};
    state.settings[DASHBOARD_WIDGETS_SETTINGS_KEY] = normalized;
  }
  return normalized;
}

export function setDashboardWidgetEnabled(preferences, id, enabled) {
  const base = normalizeDashboardWidgetPreferences(preferences);
  const widgetId = String(id || '').trim();
  if (!WIDGET_IDS.has(widgetId)) return base;
  const hidden = new Set(base.hidden);
  if (enabled) hidden.delete(widgetId);
  else hidden.add(widgetId);
  return { enabled: base.enabled, hidden: [...hidden] };
}

export function isDashboardWidgetVisible(preferences, id) {
  const base = normalizeDashboardWidgetPreferences(preferences);
  const widgetId = String(id || '').trim();
  if (!WIDGET_IDS.has(widgetId)) return true;
  return !base.enabled || !base.hidden.includes(widgetId);
}

export function resetDashboardWidgetPreferences(storage = null) {
  return writeDashboardWidgetPreferences(storage, emptyDashboardWidgetPreferences());
}

/**
 * Modo do grid do workspace do dashboard quando a personalização está ligada:
 * `default` (duas colunas), `single-tasks`, `single-widgets` ou `hidden`.
 */
export function dashboardWorkspaceMode(preferences) {
  const base = normalizeDashboardWidgetPreferences(preferences);
  if (!base.enabled) return 'default';
  const tasksHidden = base.hidden.includes('tasks');
  const widgetsHidden = base.hidden.includes('widgets');
  if (tasksHidden && widgetsHidden) return 'hidden';
  if (tasksHidden) return 'single-widgets';
  if (widgetsHidden) return 'single-tasks';
  return 'default';
}
