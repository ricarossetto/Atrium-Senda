import { openLinkedPublication } from './components/linked-publication-reader.js?v=3.0.0';
import { requestAuthUsers } from './core/auth-users-request.js?v=3.0.0';
import {
  ATRIUM_STORE_PERSISTENCE_ERROR_EVENT,
  STORE_PERSISTENCE_CONFLICT_EVENT,
  STORE_PERSISTENCE_ERROR_MESSAGE,
  Store,
  isoDate,
  uid
} from './core/store.js?v=3.0.0';
import { applyClientReconciliation } from './core/client-reconciliation.js?v=3.0.0';
import { pathForView, publicationIdFromLocation, viewFromHash, viewFromPathname } from './core/routes.js?v=3.0.0';
import { acknowledgeActivity } from './core/activity-inbox.js?v=3.0.0';
import { getCompletionNotifications, markCompletionNotificationsRead, refreshCompletionNotifications } from './core/notification-inbox.js?v=3.0.0';
import { searchContent } from './core/api.js?v=3.0.0';
import { createReauthRunner } from './core/reauth.js?v=3.0.0';
import { createGlobalSearch } from './components/global-search.js?v=3.0.0';
import { createQuickAdd } from './components/quick-add.js?v=3.0.0';
import { createModal, installModalComboboxes } from './components/modal.js?v=3.0.0';
import { attachFieldSuggest } from './components/field-suggest.js?v=3.0.0';
import { fieldContextOptions, teamEmailOptions, teamNameOptions } from './core/field-context.js?v=3.0.0';
import { installPanelSizeToggle, resetPanelSize } from './components/panel-size.js?v=3.0.0';
import { createOnboarding } from './components/onboarding.js?v=3.0.0';
import { mountTotpGuide } from './components/totp-guide.js?v=3.0.0';
import { createProductTour } from './components/product-tour.js?v=3.0.0';
import { buildTourSteps, shouldStartTour } from './core/product-tour-steps.js?v=3.0.0';
import { computeFirstSteps } from './views/ui-v2/first-steps.js?v=3.0.0';
import { createSetupWizardFeature } from './features/setup-wizard.js?v=3.0.0';
import { createTheme } from './components/theme.js?v=3.0.0';
import { Toast } from './components/toast.js?v=3.0.0';
import { createUiMode } from './views/ui-v2/mode.js?v=3.0.0';
import { resolveDensityFromPlan } from './views/ui-v2/plan-density.js?v=3.0.0';
import { hasMonitoredOab } from './views/ui-v2/first-steps.js?v=3.0.0';
import { transitionPageContent } from './views/ui-v2/page-transition.js?v=3.0.0';
import { createUiV2Shell } from './views/ui-v2/shell.js?v=3.0.0';
import { createSystemStatusBar } from './views/ui-v2/system-status.js?v=3.0.0';
import { officeScopeItems } from './core/office-scope.js?v=3.0.0';
import { renderFinancialV2Workspace } from './views/ui-v2/financial-presenter.js?v=3.0.0';
/* `calculations-presenter.js` é versionado porque passou a carregar a superfície
 * LC 142: sem o `?v=`, a borda do Cloudflare (max-age=14400) continuaria
 * servindo a cópia sem o cenário previdenciário por até 4 h após o deploy. */
import { renderCalculationsV2Workspace } from './views/ui-v2/calculations-presenter.js?v=3.0.0';
import { renderDocumentsV2Catalog } from './views/ui-v2/documents-presenter.js?v=3.0.0';
import { renderLeadsV2Workspace } from './views/ui-v2/leads-presenter.js?v=3.0.0';
import { renderAssistantV2Presentation } from './views/ui-v2/assistant-presenter.js?v=3.0.0';
import { renderPromptsV2Presentation } from './views/ui-v2/prompts-presenter.js?v=3.0.0';
import { renderMonitoringV2Presentation, renderDjenCaptureErrorsV2Presentation } from './views/ui-v2/monitoring-presenter.js?v=3.0.0';
import { createJudicialIntegrationsPresenter } from './views/ui-v2/judicial-integrations-presenter.js?v=3.0.0';
import { createEmailCalendarPresenter } from './views/ui-v2/email-calendar-presenter.js?v=3.0.0';
import { createConfigurationAdminPresenter } from './views/ui-v2/configuration-presenter.js?v=3.0.0';
import { createImporterPresenter } from './views/ui-v2/importer-presenter.js?v=3.0.0';
import { createAuditPresenter } from './views/ui-v2/audit-presenter.js?v=3.0.0';
import { createAgendaFeature } from './features/agenda.js?v=3.0.0';
import { createAssistantFeature } from './features/assistant.js?v=3.0.0';
import { createAuditFeature } from './features/audit.js?v=3.0.0';
import { createConfigurationFeature } from './features/configuration.js?v=3.0.0';
import { createContactsFeature } from './features/contacts.js?v=3.0.0';
import { createDashboardFeature } from './features/dashboard.js?v=3.0.0';
import { treatPublicationForCompletedTask } from './features/publication-task-completion.js?v=3.0.0';
import {
  DASHBOARD_WIDGETS,
  emptyDashboardWidgetPreferences,
  readDashboardWidgetPreferences,
  readDashboardWidgetPreferencesFromState,
  readUiDensityPreference,
  writeDashboardWidgetPreferencesToState,
  writeUiDensityPreference,
  dashboardWorkspaceMode
} from './core/dashboard-widgets.js?v=3.0.0';
import { createDocumentsFeature } from './features/documents.js?v=3.0.0';
import { createEmailIntegrationFeature } from './features/email-integration.js?v=3.0.0';
import { createExternalCalendarFeature } from './features/external-calendar.js?v=3.0.0';
import { createGoogleCalendarFeature } from './features/google-calendar.js?v=3.0.0';
import { createFinancialFeature } from './features/financial.js?v=3.0.0';
import { createCalculationsFeature } from './features/calculations.js?v=3.0.0';
import { createImporterFeature } from './features/importer.js?v=3.0.0';
import { createErrorReportFeature } from './features/error-report.js?v=3.0.0';
import { createJudicialIntegrationsFeature } from './features/judicial-integrations.js?v=3.0.0';
import { createInpiIntegrationFeature } from './features/inpi-integration.js?v=3.0.0';
import { createLeadsFeature } from './features/leads.js?v=3.0.0';
import { createLinksFeature } from './features/links.js?v=3.0.0';
import { createMonitoringFeature } from './features/monitoring.js?v=3.0.0';
import { createOfficeIdentityFeature } from './features/office-identity.js?v=3.0.0';
import { classifyIntimationAct, createPublicationsFeature } from './features/publications.js?v=3.0.0';
import { publicationsInRecentScope, resolveIntimationId } from './core/publication-scope.js?v=3.0.0';
import { createProcessesFeature } from './features/processes.js?v=3.0.0';
import { createPromptsFeature } from './features/prompts.js?v=3.0.0';
import { createSystemAdminFeature } from './features/system-admin.js?v=3.0.0';
import { createTasksFeature } from './features/tasks.js?v=3.0.0';
import { createReportsFeature } from './features/reports.js?v=3.0.0';
const plural = (count, singular, pluralForm) => `${count} ${Number(count) === 1 ? singular : pluralForm}`;

(() => {
  'use strict';

  const TERMINAL_STATUSES = ['concluida', 'concluido', 'arquivada', 'arquivado', 'finalizada', 'cancelada'];

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  function decodeHtmlEntities(value) {
    if (!value) return '';
    const ENTITY_MAP = {
      '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
      '&ccedil;': 'ç', '&Ccedil;': 'Ç',
      '&aacute;': 'á', '&Aacute;': 'Á', '&eacute;': 'é', '&Eacute;': 'É', '&iacute;': 'í', '&Iacute;': 'Í', '&oacute;': 'ó', '&Oacute;': 'Ó', '&uacute;': 'ú', '&Uacute;': 'Ú',
      '&agrave;': 'à', '&Agrave;': 'À', '&egrave;': 'è', '&Egrave;': 'È', '&igrave;': 'ì', '&Igrave;': 'Ì', '&ograve;': 'ò', '&Ograve;': 'Ò', '&ugrave;': 'ù', '&Ugrave;': 'Ù',
      '&atilde;': 'ã', '&Atilde;': 'Ã', '&otilde;': 'õ', '&Otilde;': 'Õ', '&ntilde;': 'ñ', '&Ntilde;': 'Ñ',
      '&acirc;': 'â', '&Acirc;': 'Â', '&ecirc;': 'ê', '&Ecirc;': 'Ê', '&icirc;': 'î', '&Icirc;': 'Î', '&ocirc;': 'ô', '&Ocirc;': 'Ô', '&ucirc;': 'û', '&Ucirc;': 'Û',
      '&auml;': 'ä', '&Auml;': 'Ä', '&euml;': 'ë', '&Euml;': 'Ë', '&iuml;': 'ï', '&Iuml;': 'Ï', '&ouml;': 'ö', '&Ouml;': 'Ö', '&uuml;': 'ü', '&Uuml;': 'Ü',
      '&ordf;': 'ª', '&ordm;': 'º', '&deg;': '°', '&sect;': '§', '&copy;': '©', '&reg;': '®', '&trade;': '™',
      '&ndash;': '–', '&mdash;': '—', '&lsquo;': '‘', '&rsquo;': '’', '&ldquo;': '“', '&rdquo;': '”', '&bull;': '•', '&hellip;': '…'
    };
    let text = String(value);
    for (const [entity, char] of Object.entries(ENTITY_MAP)) {
      text = text.replaceAll(entity, char);
      text = text.replaceAll(entity.toUpperCase(), char);
    }
    text = text.replace(/&#(\d+);/g, (_, dec) => {
      try { return String.fromCodePoint(Number(dec)); } catch { return _; }
    });
    text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return _; }
    });
    return text;
  }
  const normalizeText = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const formatDate = value => {
    if (!value) return '—';
    const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return value;
    return new Intl.DateTimeFormat('pt-BR').format(new Date(year, month - 1, day));
  };
  const formatDateTime = value => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Nunca';

  function addDays(isoString, days) {
    if (!isoString) return '';
    const date = new Date(`${String(isoString).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function totalTimeMinutes(timeLogs = []) {
    return (Array.isArray(timeLogs) ? timeLogs : []).reduce((sum, log) => sum + (Number(log.minutes) || 0), 0);
  }

  function formatMinutes(minutes) {
    if (!minutes || minutes <= 0) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) return `${h}h${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }

  function formatCurrency(value) {
    const num = Number(value) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  // Contagem de prazo não é feita no produto: o prazo vem exclusivamente da fonte
  // oficial (eproc/PJe) e ajustes de contagem são edição humana (AGENTS §16;
  // specs/human-deadline-policy.md). A data de publicação do DJEN é derivada no
  // backend (`lib/core/business-days.mjs`), apenas informativa.

  const daysUntil = value => {
    if (!value) return Infinity;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Math.ceil((date - today) / 86400000);
  };

  function sortRecords(records, sortConfig) {
    if (!sortConfig || !sortConfig.field) return records;
    const { field, direction } = sortConfig;
    const modifier = direction === 'desc' ? -1 : 1;
    return [...records].sort((a, b) => {
      let valA = a[field];
      let valB = b[field];
      if (field === 'registeredAt') {
        valA = a.registeredAt || a.createdAt || '';
        valB = b.registeredAt || b.createdAt || '';
      }
      if (field === 'lastMovementAt') {
        valA = a.lastMovementAt || '';
        valB = b.lastMovementAt || '';
      }
      if (valA === undefined || valA === null || valA === '') return 1;
      if (valB === undefined || valB === null || valB === '') return -1;
      if (typeof valA === 'string' && typeof valB === 'string') {
        return valA.localeCompare(valB, 'pt-BR', { numeric: true, sensitivity: 'base' }) * modifier;
      }
      if (valA < valB) return -1 * modifier;
      if (valA > valB) return 1 * modifier;
      return 0;
    });
  }

  function updateTableSortHeaders(tableId, currentSort) {
    const table = document.getElementById(tableId);
    if (!table) return;
    table.querySelectorAll('th[data-sort-field]').forEach(th => {
      const field = th.dataset.sortField;
      const indicator = th.querySelector('.sort-indicator');
      th.classList.remove('sorted-asc', 'sorted-desc');
      th.setAttribute('aria-sort', 'none');
      if (field === currentSort.field) {
        if (currentSort.direction === 'asc') {
          th.classList.add('sorted-asc');
          th.setAttribute('aria-sort', 'ascending');
          if (indicator) indicator.textContent = '▲';
        } else {
          th.classList.add('sorted-desc');
          th.setAttribute('aria-sort', 'descending');
          if (indicator) indicator.textContent = '▼';
        }
      } else {
        if (indicator) indicator.textContent = '↕';
      }
    });
  }

  const byId = id => document.getElementById(id);

  let globalSearchComponent;
  let quickAddComponent;
let assistantContextSearchComponent;
  let modalComponent;
  let onboardingComponent;
  let setupWizardComponent;
  let themeComponent;
  let uiModeComponent;
  let uiShellComponent;
  let systemStatusComponent;
  let agendaFeature;
  let assistantFeature;
  let auditFeature;
  let auditPresenter;
  let configurationFeature;
  let configurationAdminPresenter;
  let contactsFeature;
  let dashboardFeature;
  let documentsFeature;
  let emailIntegrationFeature;
  let externalCalendarFeature;
  let googleCalendarFeature;
  let financialFeature;
  let calculationsFeature;
  let importerFeature;
  let importerPresenter;
  let errorReportFeature;
  let judicialIntegrationsFeature;
  let judicialIntegrationsPresenter;
  let emailCalendarPresenter;
  let leadsFeature;
  let linksFeature;
  let monitoringFeature;
  let officeIdentityFeature;
  let publicationsFeature;
  let processesFeature;
  let promptsFeature;
  let systemAdminFeature;
  let tasksFeature;
  let reportsFeature;

function getGlobalSearchComponent() {
  globalSearchComponent ||= createGlobalSearch({
    getState: () => Store.state,
    normalizeText,
    escapeHtml,
    formatDate,
    searchContent,
    onSelect: selection => App.handleGlobalSearchSelection(selection)
  });
  return globalSearchComponent;
}

function getQuickAddComponent() {
  quickAddComponent ||= createQuickAdd({
    onSelect: action => {
      const openers = {
        task: () => App.openTaskModal(),
        appointment: () => App.openAgendaModal(),
        contact: () => App.openContactModal(),
        process: () => App.openProcessModal(),
        financial: () => App.openFinancialEntryModal(),
        lead: () => App.openLeadModal()
      };
      openers[action]?.();
    }
  });
  return quickAddComponent;
}

// Contrato de comando assíncrono (202 + idCommand): aguarda a conclusão real
// do comando no servidor antes de devolver o resultado. Falha do comando é
// propagada como erro — nunca tratada como sucesso.
async function pollAsyncCommand(idCommand, { timeoutMs = 15 * 60_000, intervalMs = 1200 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise(resolve => window.setTimeout(resolve, intervalMs));
    const response = await window.AtriumAuth.secureFetch(`/api/commands/${encodeURIComponent(idCommand)}`, { headers: { Accept: 'application/json' } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Comando assíncrono indisponível.');
    const command = payload.command || {};
    if (command.status === 'done' || command.status === 'error') return command;
  }
  throw new Error('O comando assíncrono não concluiu no tempo esperado. Consulte o estado atual da operação.');
}

function assistantContextResults(query) {
  const descriptors = getAssistantFeature().contextOptions();
  const raw = String(query || '').trim();
  const normalized = normalizeText(raw);
  const digits = raw.replace(/\D/g, '');
  const typeMeta = {
    process: ['process', 'Processo'],
    document: ['document', 'Documento'],
    intimation: ['publication', 'Publicação'],
    contact: ['contact', 'Contato']
  };
  return descriptors
    .map(item => {
      const [entityType, matchedField] = typeMeta[item.type] || [];
      if (!entityType) return null;
      const haystack = normalizeText(`${item.label} ${item.meta} ${(item.sources || []).join(' ')}`)
        + ` ${String(item.label || '').replace(/\D/g, '')} ${String(item.meta || '').replace(/\D/g, '')}`;
      if (normalized && !haystack.includes(normalized) && !(digits.length >= 2 && haystack.includes(digits))) return null;
      return {
        entityType,
        target: item.type,
        id: item.id,
        title: item.label,
        context: item.meta,
        snippet: (item.sources || []).join(' · '),
        matchedField,
        relevance: 0
      };
    })
    .filter(Boolean);
}

function getAssistantContextSearchComponent() {
  assistantContextSearchComponent ||= createGlobalSearch({
    getState: () => ({}),
    normalizeText,
    escapeHtml,
    formatDate,
    searchContent: null,
    inputId: 'assistantContextSearch',
    resultsId: 'assistantContextSearchResults',
    paletteId: 'assistantContextSearchPalette',
    containerSelector: '.assistant-context-search',
    optionIdPrefix: 'assistant-context-option-',
    localResultsProvider: (state, query) => assistantContextResults(query),
    maxResults: 80,
    minQueryLength: 1,
    listAllOnEmpty: true,
    openOnFocus: true,
    shortcuts: false,
    resultsLabel: 'Registros do acervo para contexto do Assistente',
    onSelect: selection => {
      const key = `${selection.target}:${selection.id}`;
      const feature = getAssistantFeature();
      const descriptor = feature.contextOptions().find(item => item.key === key);
      feature.selectContext(key);
      const input = document.getElementById('assistantContextSearch');
      if (input) input.value = descriptor?.label || '';
    }
  });
  return assistantContextSearchComponent;
}

  // Equipe para as sugestões dos campos. Falhou ou não tem permissão: a lista só fica menor.
  let fieldTeamMembers = [];
  let fieldTeamMembersAt = 0;
  async function refreshFieldTeamMembers() {
    if (Date.now() - fieldTeamMembersAt < 60000) return;
    fieldTeamMembersAt = Date.now();
    try {
      const response = await requestAuthUsers(globalThis.KellerAuth?.secureFetch || globalThis.fetch, {});
      if (!response?.ok) return;
      const data = await response.json();
      fieldTeamMembers = (Array.isArray(data?.users) ? data.users : []).filter(user => user && user.status !== 'inactive');
    } catch {
      fieldTeamMembersAt = 0;
    }
  }

  function installStaticFieldContext() {
    const byIdIfAny = id => document.getElementById(id);
    const withTeam = build => () => { refreshFieldTeamMembers(); return build(fieldTeamMembers); };
    attachFieldSuggest(byIdIfAny('receiverNameInput'), { getOptions: withTeam(teamNameOptions) });
    for (const id of ['receiverEmailInput', 'emailTargetAddress', 'publicationEmailRecipientInput', 'emailTestRecipientInput']) {
      attachFieldSuggest(byIdIfAny(id), { getOptions: withTeam(teamEmailOptions) });
    }
    const description = byIdIfAny('finDescriptionInput');
    attachFieldSuggest(description, {
      getOptions: () => (description.dataset.suggestExpense
        ? [...document.querySelectorAll('#financialExpenseSuggestions option')].map(option => option.value)
        : [])
    });
    attachFieldSuggest(byIdIfAny('documentTypeInput'), {
      getOptions: () => [...new Set((Store.state.documents || []).map(item => item?.documentType).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'pt-BR'))
    });
    attachFieldSuggest(byIdIfAny('officeInputCity'), { getOptions: () => fieldContextOptions('city', { state: Store.state }) });
  }

  function getModalComponent() {
    modalComponent ||= createModal({
      escapeHtml,
      getFieldOptions: name => fieldContextOptions(name, { state: Store.state, teamMembers: fieldTeamMembers }),
      onFieldContextOpen: () => { refreshFieldTeamMembers(); },
      onModeChange: modalMode => {
        App.modalMode = modalMode;
        if (modalMode?.mode !== 'reauth') {
          reauthRunner?.cancelPrompt();
        }
      }
    });
    return modalComponent;
  }

  function getOnboardingComponent() {
    onboardingComponent ||= createOnboarding({
      getSettings: () => Store.state?.settings,
      saveState: () => Store.save(),
      showToast: (message, type) => App.toast(message, type),
      onSlideChange: slide => { App.currentTourSlide = slide; },
      onTimerChange: timer => { App.tourTimer = timer; },
      onNavigate: view => { App.switchView(view); App.syncViewUrl(view); },
      // Ativação do Atrium IA no walkthrough: mesma rota oficial do painel (admin + CSRF).
      onActivateAi: enabled => getPublicationsFeature().setAiClassifierEnabled(enabled),
      isAiEnabled: () => getPublicationsFeature().aiClassifierEnabled,
      onOpenTour: () => App.startProductTour()
    });
    return onboardingComponent;
  }

  let productTourComponent = null;
  let totpGuideStop = () => {};
  function getProductTour() {
    productTourComponent ||= createProductTour({
      escapeHtml,
      navigate: view => { App.switchView(view); App.syncViewUrl(view); },
      buildSteps: () => {
        const state = Store.state || {};
        return buildTourSteps({
          canManage: App.canStartCollection(),
          hasOab: hasMonitoredOab(state.terms),
          mfaEnabled: App.setupStatus.mfaEnabled === true,
          hasCertificate: state.settings?.hasA1Certificate,
          counts: {
            intimations: (state.intimations || []).length,
            tasks: (state.tasks || []).length,
            agenda: (state.agenda || []).length,
            processes: (state.processes || []).length
          }
        });
      },
      onFinish: outcome => {
        App.markProductTourDone();
        if (outcome === 'skipped') App.toast('Você pode rever o tour no menu de três pontos, no topo da tela.');
      },
      onChoice: (step, value) => (step === 'a1' ? App.saveCertificateAnswer(value) : undefined),
      onStepAction: action => App.runSetupAction(action)
    });
    return productTourComponent;
  }

  function getSetupWizardFeature() {
    setupWizardComponent ||= createSetupWizardFeature({
      iconSvg: name => `<svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.0#atrium-icon-${name}"></use></svg>`,
      onComplete: profile => App.completeSetupWizard(profile),
      onOpenPanel: async (panel, profile) => {
        if (!await App.completeSetupWizard(profile)) return false;
        const view = panel === 'integrations' ? 'integrations' : 'configuration';
        App.switchView(view);
        App.syncViewUrl(view);
        document.getElementById(`view-${view}`)?.querySelector('button, input, a[href]')?.focus();
        return true;
      },
      onDismiss: () => {
        if (window.AtriumAuth?.authenticated !== false) App.checkFirstAccessTour();
      }
    });
    return setupWizardComponent;
  }

  function getThemeComponent() {
    themeComponent ||= createTheme({
      showToast: (message, type) => App.toast(message, type),
      onChange: theme => { App.currentTheme = theme; }
    });
    return themeComponent;
  }

  function getUiModeComponent() {
    uiModeComponent ||= createUiMode({
      onChange: mode => {
        App.currentUiMode = mode;
        getUiShellComponent().applyMode(mode);
        if (App.currentView === 'dashboard') App.renderDashboard();
        if (App.currentView === 'processes') App.renderProcesses(document.getElementById('processSearch')?.value || '');
        if (App.currentView === 'inbox') App.renderInbox();
        if (App.currentView === 'kanban') App.renderKanban();
        if (App.currentView === 'agenda') App.renderAgenda();
        if (App.currentView === 'contacts') App.renderContacts(document.getElementById('contactSearch')?.value || '');
        if (App.currentView === 'financial') App.renderFinancial(document.getElementById('financialSearch')?.value || '');
        if (App.currentView === 'documents') App.renderDocuments();
        if (App.currentView === 'leads') App.renderLeads(document.getElementById('leadSearch')?.value || '');
        if (App.currentView === 'assistant') App.renderAssistant();
      }
    });
    return uiModeComponent;
  }

  function getUiShellComponent() {
    uiShellComponent ||= createUiV2Shell({
      getNotifications: () => {
        const today = isoDate();
        const publications = publicationsInRecentScope(Store.state.intimations).filter(item => (item.treatmentStatus || 'untreated') === 'untreated').map(item => ({ target: 'intimation', id: item.id, title: item.title || 'Publicação pendente', detail: `${item.process || 'Sem processo'} · revisar triagem` }));
        const tasks = (Store.state.tasks || []).filter(item => item.active !== false && !TERMINAL_STATUSES.includes(item.status) && (item.fatalDeadline || item.deadline) && (item.fatalDeadline || item.deadline) < today).map(item => ({ target: 'task', id: item.id, title: item.title || 'Tarefa atrasada', detail: `${item.process || item.client || 'Sem vínculo'} · prazo informado ${item.fatalDeadline || item.deadline}` }));
        return [...getCompletionNotifications(), ...publications, ...tasks];
      },
      onNotificationsOpen: () => { void markCompletionNotificationsRead(); },
      onNotificationSelect: selection => App.handleGlobalSearchSelection(selection)
    });
    return uiShellComponent;
  }

  function getSystemStatusComponent() {
    systemStatusComponent ||= createSystemStatusBar();
    return systemStatusComponent;
  }

  /*
   * Stable Dashboard integration contract retained in the composition root for
   * source-level compatibility audits; rendering and listeners live exclusively
   * in dashboard.js: class="dashboard-task-item" class="dashboard-task-title"
   * class="dashboard-reminder-item", 'dashboardTaskCount',
   * 'dashboardTaskSortSelect', 'dashboardTaskFilters', 'dashboardTaskList',
   * 'dashboardRemindersList', button[data-dashboard-task-filter],
   * dataset.dashboardTaskFilter, data-dashboard-task-id, dataset.dashboardTaskId,
   * data-complete-task-id, data-agenda-id, and the canonical delegation
   * getTasksFeature().completeTask(chk.dataset.completeTaskId).
   */

  function getDashboardFeature() {
    dashboardFeature ||= createDashboardFeature({
      store: Store,
      documentRef: document,
      escapeHtml,
      formatDate,
      formatMinutes,
      formatCurrency,
      daysUntil,
      isTerminalStatus: status => TERMINAL_STATUSES.includes(status),
      getUntreatedCount: () => getPublicationsFeature().getUntreatedCount(),
      renderPublicationsMetrics: () => App.renderPublicationsMetrics(),
      renderOfficeIdentity: () => App.renderOfficeIdentity(),
      onOpenTask: task => App.openTaskModal(task),
      onOpenProcess: process => App.openProcess(process),
      onCompleteTask: taskId => getTasksFeature().completeTask(taskId),
      onToggleTaskDone: (task, checkbox) => getTasksFeature().toggleTaskDone(task, checkbox),
      onRenderAll: () => App.renderAll(),
      requestPublicationFunnel: async () => {
        const response = await window.AtriumAuth.secureFetch('/api/publications/funnel-weekly', { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Não foi possível carregar o funil semanal de publicações.');
        return response.json();
      },
      dashboardWidgets: dashboardWidgetsBridge,
      onOpenAgenda: item => App.openAgendaModal(item),
      onOpenActivity: item => {
        if (item.target === 'agenda') {
          const appointment = Store.state.agenda.find(candidate => candidate.id === item.entityId);
          if (appointment) App.openAgendaModal(appointment);
          return;
        }
        if (item.target === 'source') {
          App.switchView('monitoring');
          return;
        }
        App.handleGlobalSearchSelection({ target: item.target, id: item.entityId });
        if (item.target === 'process') {
          window.setTimeout(() => document.querySelector(`#processTableBody [data-process-id="${CSS.escape(String(item.entityId || ''))}"]`)?.click(), 0);
        }
      },
      onAcknowledgeActivity: async item => {
        const acknowledgements = Store.state.settings?.activityInboxAcknowledged || {};
        const hadPrevious = Object.hasOwn(acknowledgements, item.key);
        const previous = acknowledgements[item.key];
        if (!acknowledgeActivity(Store.state, item)) return false;
        const auditEntry = Store.audit('Atividade revisada', `${item.type} · ${item.entityType}`);
        const persisted = await Store.flush();
        if (!persisted) {
          if (hadPrevious) Store.state.settings.activityInboxAcknowledged[item.key] = previous;
          else delete Store.state.settings.activityInboxAcknowledged[item.key];
          Store.state.audit = Store.state.audit.filter(entry => entry.id !== auditEntry.id);
          App.toast('Não foi possível salvar a revisão da atividade.', 'error');
        }
        return persisted;
      },
      showToast: (message, type) => App.toast(message, type)
    });
    return dashboardFeature;
  }

  function getOfficeIdentityFeature() {
    officeIdentityFeature ||= createOfficeIdentityFeature({
      store: Store,
      documentRef: document,
      escapeHtml,
      showToast: (message, type) => App.toast(message, type),
      onRenderMonitoring: () => App.renderMonitoring(),
      presentation: getConfigurationAdminPresenter()
    });
    return officeIdentityFeature;
  }

  function getConfigurationAdminPresenter() {
    configurationAdminPresenter ||= createConfigurationAdminPresenter({
      documentRef: document,
      onOpenOfficeIdentity: () => getOfficeIdentityFeature().open(),
      onCloseOfficeIdentity: () => getOfficeIdentityFeature().close()
    });
    return configurationAdminPresenter;
  }

  function getAuditFeature() {
    auditFeature ||= createAuditFeature({
      store: Store,
      documentRef: document,
      escapeHtml,
      formatDateTime,
      exportJson: (data, filename) => App.exportJson(data, filename),
      getIsoDate: () => isoDate(),
      showToast: (message, type) => App.toast(message, type),
      presentation: getAuditPresenter()
    });
    return auditFeature;
  }

  function getAuditPresenter() {
    auditPresenter ||= createAuditPresenter({ documentRef: document });
    return auditPresenter;
  }

  function getLinksFeature() {
    linksFeature ||= createLinksFeature({
      store: Store,
      documentRef: document,
      escapeHtml,
      openModal: (...args) => App.openModal(...args),
      showToast: (message, type) => App.toast(message, type)
    });
    return linksFeature;
  }

  function getPublicationsFeature() {
    publicationsFeature ||= createPublicationsFeature({
      store: Store,
      escapeHtml,
      formatDate,
      formatDateTime,
      showToast: (message, type, action) => App.toast(message, type, action),
      openModal: (...args) => App.openModal(...args),
      onOpenTask: task => App.openTaskModal(task),
      onOpenAgenda: appointment => App.openAgendaModal(appointment),
      onOpenProcess: process => {
        if (!process?.id) return;
        getPublicationsFeature().closeDetail({ restoreFocus: false });
        App.switchView('processes');
        App.renderProcesses('');
        [...document.querySelectorAll('#processTableBody [data-process-id]')].find(row => row.dataset.processId === String(process.id))?.click();
      },
      onOpenContact: contact => {
        if (!contact?.id) return;
        getPublicationsFeature().closeDetail({ restoreFocus: false });
        App.switchView('contacts');
        getContactsFeature().setRoleFilter('all');
        App.renderContacts('');
        getContactsFeature().selectContact(contact.id);
      },
      onOpenAssistant: publication => openAssistantContext('intimation', publication?.id),
      onOpenIntimation: () => App.openIntimationModal(),
      onImportJson: file => App.importJson(file),
      onRenderGlobalMetrics: () => App.renderMetrics(),
      // Ressincronização suave: grava o que estiver pendente, relê o estado consolidado e redesenha
      // as views — sem recarregar a página. O reload era o que travava a fusão de duplicatas e o
      // "V" de tratar publicação no meio do trabalho.
      onSyncAppState: async () => {
        try {
          await Store.flush().catch(() => {});
          await Store.load();
          App.renderAll();
        } catch { /* mantém a tela atual */ }
      }
    });
    return publicationsFeature;
  }

  function analyzeTaskWithAi(description) {
    App.switchView('assistant');
    const aiInput = document.getElementById('aiChatInput');
    if (aiInput) {
      aiInput.value = `Por favor, analise a seguinte intimação judicial, estime preliminarmente os prazos em dias úteis (CPC/2015), explicite as hipóteses usadas e sugira providências para conferência humana. Não trate a estimativa como prazo fatal confirmado.\n\n${description}`;
      aiInput.focus();
    }
  }

  function getTasksFeature() {
    tasksFeature ||= createTasksFeature({
      store: Store,
      documentRef: document,
      windowRef: window,
      navigatorRef: navigator,
      escapeHtml,
      formatDate,
      formatMinutes,
      totalTimeMinutes,
      daysUntil,
      decodeHtmlEntities,
      initials: name => App.initials(name),
      isTerminalStatus: status => TERMINAL_STATUSES.includes(status),
      getCurrentUserName: () => window.AtriumAuth?.currentUser?.displayName,
      openModal: (...args) => App.openModal(...args),
      closeModal: () => App.closeModal(),
      showToast: (message, type, action) => App.toast(message, type, action),
      onRenderAll: () => App.renderAll(),
      onAnalyzeWithAi: analyzeTaskWithAi,
      onOpenProcess: process => App.openProcess(process),
      onTaskCompleted: (task, previousStatus) => treatPublicationForCompletedTask(
        Store,
        task,
        previousStatus,
        window.AtriumAuth?.currentUser?.displayName || 'Advogado(a)'
      )
    });
    return tasksFeature;
  }

  function getReportsFeature() {
    reportsFeature ||= createReportsFeature({
      store: Store,
      documentRef: document,
      windowRef: window,
      escapeHtml,
      formatDate,
      formatMinutes,
      showToast: (message, type) => App.toast(message, type)
    });
    return reportsFeature;
  }

  function getProcessesFeature() {
    processesFeature ||= createProcessesFeature({
      store: Store,
      documentRef: document,
      normalizeText,
      escapeHtml,
      formatDate,
      formatMinutes,
      totalTimeMinutes,
      sortRecords,
      updateTableSortHeaders,
      openModal: (...args) => App.openModal(...args),
      showToast: (message, type) => App.toast(message, type),
      secureFetch: (...args) => window.AtriumAuth.secureFetch(...args),
      requestAuthUsers,
      getLinkedTasks: processNumber => Store.state.tasks.filter(task => task.active !== false && processNumber && String(task.process || '').trim() === processNumber),
      getLinkedIntimations: processNumber => Store.state.intimations.filter(item => processNumber && String(item.process || '').trim() === processNumber),
      isTerminalStatus: status => TERMINAL_STATUSES.includes(status),
      openOwnerDocuments: (ownerType, ownerId, documentId) => App.openOwnerDocuments(ownerType, ownerId, documentId),
      openClient: process => {
        const contact = Store.state.contacts.find(item => String(item.id) === String(process?.contactId || ''))
          || Store.state.contacts.filter(item => normalizeText(item.name) === normalizeText(process?.client)).at(0);
        App.switchView('contacts');
        const input = document.getElementById('contactSearch');
        if (input) input.value = '';
        getContactsFeature().setRoleFilter('all');
        App.renderContacts('');
        if (contact?.id) getContactsFeature().selectContact(contact.id);
        else App.toast('O processo ainda não possui um cliente principal vinculado.', 'info');
      },
      openLinkedTasks: process => {
        App.switchView('kanban');
        App.renderKanban?.();
        App.toast(`Tarefas vinculadas ao processo ${process?.number || process?.protocol || 'selecionado'} estão disponíveis no quadro.`, 'info');
      },
      openTask: task => App.openTaskModal(task),
      openPublication: publication => openLinkedPublication(Store, publication.id),
      openAgenda: appointment => App.openAgendaModal(appointment),
      openFinancial: process => {
        App.switchView('financial');
        const input = document.getElementById('financialSearch');
        if (input) input.value = process?.number || process?.protocol || '';
        App.renderFinancial(input?.value || '');
      },
      openAssistant: process => openAssistantContext('process', process?.id),
      exportJson: (data, filename) => App.exportJson(data, filename),
      onSyncEproc: options => getJudicialIntegrationsFeature().syncEprocNow(null, options),
      confirmProcessDeletion: number => window.prompt(`Para excluir o processo ${number}, digite o número completo:`),
      requestProcessReenable: () => window.prompt('Digite o número CNJ cuja descoberta automática deve ser reativada:')
    });
    return processesFeature;
  }

  function getContactsFeature() {
    contactsFeature ||= createContactsFeature({
      store: Store,
      documentRef: document,
      normalizeText,
      escapeHtml,
      formatDate,
      sortRecords,
      updateTableSortHeaders,
      openModal: (...args) => App.openModal(...args),
      openOwnerDocuments: (ownerType, ownerId) => App.openOwnerDocuments(ownerType, ownerId),
      openProcess: process => getProcessesFeature().openDetails(process),
      openTask: task => App.openTaskModal(task),
      openPublication: publication => openLinkedPublication(Store, publication.id),
      openAgenda: appointment => App.openAgendaModal(appointment),
      openDocument: documentRecord => {
        App.switchView('documents');
        getDocumentsFeature().focusDocument(documentRecord.id);
      },
      openFinancial: process => {
        App.switchView('financial');
        const input = document.getElementById('financialSearch');
        const query = process?.number || process?.protocol || '';
        if (input) input.value = query;
        App.renderFinancial(query);
      },
      openAssistant: contact => openAssistantContext('contact', contact?.id),
      secureFetch: (...args) => window.AtriumAuth.secureFetch(...args),
      showToast: (message, type) => App.toast(message, type)
    });
    return contactsFeature;
  }

  function getDocumentsFeature() {
    documentsFeature ||= createDocumentsFeature({
      store: Store,
      documentRef: document,
      windowRef: window,
      navigatorRef: navigator,
      escapeHtml,
      normalizeText,
      showToast: (message, type) => App.toast(message, type),
      getCurrentUser: () => window.AtriumAuth?.currentUser,
      getIsoDate: () => isoDate(),
      onOpenGenerator: options => App.openDocumentGenerator(options),
      onOpenAssistant: documentRecord => openAssistantContext('document', documentRecord?.id),
      onOpenOwner: (ownerType, ownerId) => App.handleGlobalSearchSelection({ target: ownerType === 'process' ? 'process' : 'contact', id: ownerId }),
      renderV2Catalog: renderDocumentsV2Catalog,
      secureFetch: (...args) => window.AtriumAuth.secureFetch(...args)
    });
    return documentsFeature;
  }

  function getLeadsFeature() {
    leadsFeature ||= createLeadsFeature({
      store: Store,
      documentRef: document,
      normalizeText,
      escapeHtml,
      formatDate,
      formatCurrency,
      openModal: (...args) => App.openModal(...args),
      showToast: (message, type) => App.toast(message, type),
      getCurrentUserName: () => window.AtriumAuth?.currentUser?.displayName,
      getContacts: () => Store.state.contacts || [],
      renderV2Workspace: renderLeadsV2Workspace
    });
    return leadsFeature;
  }

  function getFinancialFeature() {
    financialFeature ||= createFinancialFeature({
      store: Store,
      documentRef: document,
      normalizeText,
      escapeHtml,
      formatCurrency,
      showToast: (message, type) => App.toast(message, type),
      renderDashboardFinancialWidgets: () => App.renderDashboardWidgets(),
      renderV2Workspace: renderFinancialV2Workspace,
      onOpenProcess: process => App.handleGlobalSearchSelection({ target: 'process', id: process?.id }),
      installPanelSizeToggle,
      resetPanelSize
    });
    return financialFeature;
  }

  function getCalculationsFeature() {
    calculationsFeature ||= createCalculationsFeature({
      documentRef: document,
      secureFetch: (...args) => window.AtriumAuth.secureFetch(...args),
      escapeHtml,
      formatCurrency,
      showToast: (message, type) => App.toast(message, type),
      store: Store,
      getCurrentUserName: () => window.AtriumAuth?.currentUser?.displayName,
      renderWorkspace: renderCalculationsV2Workspace
    });
    return calculationsFeature;
  }

  function getAgendaFeature() {
    agendaFeature ||= createAgendaFeature({
      store: Store,
      escapeHtml,
      formatDate,
      formatMinutes,
      totalTimeMinutes,
      classifyIntimation: item => classifyIntimationAct(item.text, item.title, item.type),
      getIntimationParties: item => App.intimationParties(item),
      getTeamMember: task => getTasksFeature().memberFor(task),
      openModal: (...args) => App.openModal(...args),
      showToast: (message, type) => App.toast(message, type),
      onOpenTask: task => App.openTaskModal(task),
      onOpenIntimation: item => App.openIntimationDetailModal(item)
    });
    return agendaFeature;
  }

  function getAssistantFeature() {
    if (!assistantFeature) assistantFeature = createAssistantFeature({
      documentRef: document,
      windowRef: window,
      secureFetch: (...args) => window.AtriumAuth.secureFetch(...args),
      escapeHtml,
      showToast: (message, type) => App.toast(message, type),
      audit: (action, detail) => Store.audit(action, detail),
      getSelectedIntimation: () => {
        const selectedId = getPublicationsFeature().selectedIntimation;
        return Store.state.intimations.find(item => item.id === selectedId) || null;
      },
      getContextCandidates: () => ({
        processes: officeScopeItems(Store.state.processes),
        documents: officeScopeItems(Store.state.documents),
        intimations: officeScopeItems(Store.state.intimations),
        contacts: officeScopeItems(Store.state.contacts)
      }),
      getLegalSkills: () => window.CODEX_LEGAL_SKILLS || [],
      renderV2Presentation: renderAssistantV2Presentation,
      installComboboxes: installModalComboboxes,
      installPanelSizeToggle,
      resetPanelSize
    });
    return assistantFeature;
  }

  function openAssistantContext(type, id) {
    if (!type || !id) return false;
    getAssistantFeature().selectContext(`${type}:${id}`);
    App.switchView('assistant');
    document.getElementById('aiChatInput')?.focus();
    return true;
  }

  function getPromptsFeature() {
    if (!promptsFeature) promptsFeature = createPromptsFeature({
      store: Store,
      documentRef: document,
      windowRef: window,
      navigatorRef: navigator,
      escapeHtml,
      normalizeText,
      showToast: (message, type) => App.toast(message, type),
      getDefaultPrompts: () => window.PROMPTS_DATA || [],
      uid,
      openModal: (...args) => App.openModal(...args),
      switchView: view => App.switchView(view),
      onUsePrompt: promptText => getAssistantFeature().loadPrompt(promptText),
      renderV2Presentation: renderPromptsV2Presentation
    });
    return promptsFeature;
  }

  function getErrorReportFeature() {
    if (!errorReportFeature) {
      errorReportFeature = createErrorReportFeature({
        documentRef: document,
        windowRef: window,
        secureFetch: (...args) => window.AtriumAuth.secureFetch(...args),
        escapeHtml,
        showToast: (message, type) => App.toast(message, type)
      });
      errorReportFeature.init();
    }
    return errorReportFeature;
  }

  function installGlobalErrorReporting() {
    if (window.__atriumErrorReportingInstalled) return;
    window.__atriumErrorReportingInstalled = true;
    const seen = new Set();
    let shown = 0;
    const report = (scope, message, details) => {
      const key = `${scope}:${message}`;
      if (seen.has(key) || shown >= 3) return;
      seen.add(key);
      shown += 1;
      void App.reportError({ scope, message, details });
    };
    window.addEventListener('error', event => {
      if (event?.target && event.target !== window && event.target?.tagName) return;
      report('Interface', event?.message || 'Erro inesperado na interface.', [event?.filename, event?.lineno ? `linha ${event.lineno}` : ''].filter(Boolean).join(' · '));
    });
    window.addEventListener('unhandledrejection', event => {
      const reason = event?.reason;
      report('Interface', String(reason?.message || reason || 'Promessa rejeitada sem tratamento.'), String(reason?.stack || '').slice(0, 1200));
    });
  }

  function getJudicialIntegrationsFeature() {
    judicialIntegrationsPresenter ||= createJudicialIntegrationsPresenter({ documentRef: document });
    if (!judicialIntegrationsFeature) judicialIntegrationsFeature = createJudicialIntegrationsFeature({
      documentRef: document,
      windowRef: window,
      secureFetch: (...args) => window.AtriumAuth.secureFetch(...args),
      escapeHtml,
      showToast: (message, type) => App.toast(message, type),
      audit: (action, detail) => Store.audit(action, detail),
      onSyncAll: options => App.syncAll(options),
      onReportError: input => App.reportError(input),
      onEprocStatus: ({ state, detail, percent, determinate, onActivate, owner }) => {
        getSystemStatusComponent().setState(state, detail, percent, { determinate, onActivate, owner });
      },
      presentation: judicialIntegrationsPresenter,
      transitionPageContent
    });
    return judicialIntegrationsFeature;
  }

  function getEmailIntegrationFeature() {
    emailCalendarPresenter ||= createEmailCalendarPresenter({ documentRef: document });
    if (!emailIntegrationFeature) emailIntegrationFeature = createEmailIntegrationFeature({
      documentRef: document,
      windowRef: window,
      secureFetch: (...args) => window.AtriumAuth.secureFetch(...args),
      escapeHtml,
      showToast: (message, type) => App.toast(message, type),
      getCurrentUser: () => window.AtriumAuth?.currentUser,
      getOfficeName: () => Store.state.settings?.officeName || '',
      confirmFn: message => window.confirm(message),
      withReauth: exec => getReauth().withReauth(exec),
      presentation: emailCalendarPresenter
    });
    return emailIntegrationFeature;
  }

  function getGoogleCalendarFeature() {
    if (!googleCalendarFeature) googleCalendarFeature = createGoogleCalendarFeature({
      documentRef: document,
      windowRef: window,
      secureFetch: (...args) => window.AtriumAuth.secureFetch(...args),
      showToast: (message, type) => App.toast(message, type),
      // Traz o que veio da agenda pessoal, sem passar por cima do que está sendo editado na tela.
      onStateChanged: async () => {
        const expectedFingerprint = Store.persistenceFingerprint();
        if (expectedFingerprint !== Store.persistedFingerprint) return;
        if (await Store.load({ expectedFingerprint, expectedRevision: Store.revision })) App.renderAll();
      },
      presentation: emailCalendarPresenter
    });
    return googleCalendarFeature;
  }

  function getExternalCalendarFeature() {
    emailCalendarPresenter ||= createEmailCalendarPresenter({ documentRef: document });
    if (!externalCalendarFeature) externalCalendarFeature = createExternalCalendarFeature({
      store: Store,
      documentRef: document,
      windowRef: window,
      secureFetch: (...args) => window.AtriumAuth.secureFetch(...args),
      showToast: (message, type) => App.toast(message, type),
      onSyncAll: options => App.syncAll(options),
      presentation: emailCalendarPresenter
    });
    return externalCalendarFeature;
  }

  function getImporterFeature() {
    importerPresenter ||= createImporterPresenter({ documentRef: document });
    if (!importerFeature) importerFeature = createImporterFeature({
      store: Store,
      documentRef: document,
      windowRef: window,
      secureFetch: (...args) => window.AtriumAuth.secureFetch(...args),
      escapeHtml,
      showToast: (message, type) => App.toast(message, type),
      upsertProcess: record => getProcessesFeature().upsertExternalProcess(record),
      upsertContact: record => getContactsFeature().upsertExternalContact(record),
      upsertTask: record => getTasksFeature().upsertExternalTask(record),
      onRenderAll: () => App.renderAll(),
      onSwitchView: view => App.switchView(view),
      presentation: importerPresenter
    });
    return importerFeature;
  }

  function getMonitoringFeature() {
    if (!monitoringFeature) monitoringFeature = createMonitoringFeature({
      store: Store,
      documentRef: document,
      escapeHtml,
      formatDateTime,
      initials: name => App.initials(name),
      uid,
      openModal: (...args) => App.openModal(...args),
      showToast: (message, type) => App.toast(message, type),
      closeModal: () => App.closeModal(),
      getFilteredIntimations: () => App.filteredIntimations(),
      onOpenJudicialSetup: () => getJudicialIntegrationsFeature().open(),
      onOpenCalendarConfig: () => (App.canStartCollection() ? getExternalCalendarFeature().open() : App.toast('Só quem administra o escritório pode configurar a agenda externa.', 'warning')),
      onOpenInpiPanel: () => App.openInpiModal(),
      renderV2Presentation: renderMonitoringV2Presentation,
      renderCaptureErrorsPresentation: renderDjenCaptureErrorsV2Presentation,
      requestCaptureErrors: async () => {
        const response = await window.AtriumAuth.secureFetch('/api/djen/capture-errors', { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Não foi possível carregar a fila de captura DJEN.');
        return response.json();
      },
      requestCaptureErrorRetry: async (body = {}) => {
        const response = await window.AtriumAuth.secureFetch('/api/djen/capture-errors/retry?async=1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body)
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 202 && payload.idCommand) {
          const command = await pollAsyncCommand(payload.idCommand);
          if (command.status === 'error') throw new Error(command.error || 'Não foi possível reconsultar a captura agora.');
          return command.result || {};
        }
        if (!response.ok) throw new Error(payload.message || payload.error || 'Não foi possível reconsultar a captura agora.');
        return payload;
      },
      onCaptureErrorsApplied: async () => {
        try {
          if (!await Store.flush()) return;
          await Store.load();
          App.renderAll();
        } catch { /* reconciliação opcional após o retry */ }
      }
    });
    return monitoringFeature;
  }

  let reauthRunner = null;

  function getReauth() {
    if (!reauthRunner) reauthRunner = createReauthRunner({
      openModal: (...args) => App.openModal(...args),
      closeModal: () => App.closeModal(),
      getCurrentView: () => App.currentView,
      getModalMode: () => App.modalMode
    });
    return reauthRunner;
  }

  function getSystemAdminFeature() {
    if (!systemAdminFeature) systemAdminFeature = createSystemAdminFeature({
      store: Store,
      documentRef: document,
      windowRef: window,
      secureFetch: (...args) => window.AtriumAuth.secureFetch(...args),
      fetchFn: (...args) => window.fetch(...args),
      escapeHtml,
      showToast: (message, type) => App.toast(message, type),
      openModal: (...args) => App.openModal(...args),
      closeModal: () => App.closeModal(),
      withReauth: exec => getReauth().withReauth(exec),
      setTheme: theme => App.setTheme(theme),
      switchView: view => App.switchView(view)
    });
    return systemAdminFeature;
  }

  // Preferência do workspace para a personalização experimental do painel: vive no
  // Store/estado consolidado (vale para todos os navegadores do escritório); o
  // localStorage é apenas fallback de leitura legada até o primeiro salvamento.
  const dashboardWidgetsBridge = Object.freeze({
    catalog: DASHBOARD_WIDGETS,
    read: () => readDashboardWidgetPreferencesFromState(Store.state)
      || readDashboardWidgetPreferences(window.localStorage),
    write: preferences => {
      const normalized = writeDashboardWidgetPreferencesToState(Store.state, preferences);
      Store.save?.();
      return normalized;
    },
    reset: () => {
      const normalized = writeDashboardWidgetPreferencesToState(Store.state, emptyDashboardWidgetPreferences());
      Store.save?.();
      return normalized;
    },
    workspaceMode: preferences => dashboardWorkspaceMode(preferences),
    density: Object.freeze({
      read: () => readUiDensityPreference(window.localStorage),
      write: value => writeUiDensityPreference(window.localStorage, value)
    })
  });

  function getConfigurationFeature() {
    if (!configurationFeature) configurationFeature = createConfigurationFeature({
      store: Store,
      documentRef: document,
      secureFetch: (...args) => window.AtriumAuth.secureFetch(...args),
      escapeHtml,
      normalizeText,
      openModal: (...args) => App.openModal(...args),
      showToast: (message, type) => App.toast(message, type),
      onRenderDiagnostic: () => getSystemAdminFeature().renderDiagnostic(),
      onRenderBackups: () => getSystemAdminFeature().renderBackups(),
      onOpenJudicialSetup: () => App.openJudicialSetup(),
      onOpenDataJudModal: () => App.openDataJudConfigModal(),
      onOpenGeminiKeyModal: () => App.openGeminiKeyModal(),
      onOpenCalendarSetup: () => App.openCalendarConfigModal(),
      onOpenEmailConfigModal: () => App.openEmailConfigModal(),
      onOpenInpiModal: () => App.openInpiModal(),
      withReauth: exec => getReauth().withReauth(exec),
      dashboardWidgets: dashboardWidgetsBridge,
      onDashboardWidgetsChanged: () => App.renderDashboard(),
      presentation: getConfigurationAdminPresenter()
    });
    return configurationFeature;
  }

  let inpiIntegrationFeature = null;
  function getInpiIntegrationFeature() {
    if (!inpiIntegrationFeature) inpiIntegrationFeature = createInpiIntegrationFeature({
      documentRef: document,
      windowRef: window,
      secureFetch: (...args) => window.AtriumAuth.secureFetch(...args),
      escapeHtml,
      showToast: (message, type) => App.toast(message, type),
      store: Store
    });
    return inpiIntegrationFeature;
  }

  const App = {
    currentView: 'dashboard',
    currentUiMode: document.documentElement.dataset.ui || 'classic',
    get inboxFilter() { return getPublicationsFeature().inboxFilter; },
    set inboxFilter(value) { getPublicationsFeature().inboxFilter = value; },
    get inboxSort() { return getPublicationsFeature().inboxSort; },
    set inboxSort(value) { getPublicationsFeature().inboxSort = value; },
    get inboxCutoff() { return getPublicationsFeature().inboxCutoff; },
    set inboxCutoff(value) { getPublicationsFeature().inboxCutoff = value; },
    currentTourSlide: 0,
    get dashboardTaskFilter() { return getDashboardFeature().taskFilter; },
    set dashboardTaskFilter(value) { getDashboardFeature().taskFilter = value; },
    get dashboardTaskSort() { return getDashboardFeature().taskSort; },
    set dashboardTaskSort(value) { getDashboardFeature().taskSort = value; },
    get tempOfficeLogo() { return getOfficeIdentityFeature().tempLogo; },
    set tempOfficeLogo(value) { getOfficeIdentityFeature().tempLogo = value; },
    get auditFilter() { return getAuditFeature().filter; },
    set auditFilter(value) { getAuditFeature().filter = value; },
    get selectedIntimation() { return getPublicationsFeature().selectedIntimation; },
    set selectedIntimation(value) { getPublicationsFeature().selectedIntimation = value; },
    get configurationSection() { return getConfigurationFeature().section; },
    set configurationSection(value) { getConfigurationFeature().section = value; },
    modalMode: null,
    get judicialStatus() { return getJudicialIntegrationsFeature().status; },
    set judicialStatus(value) { getJudicialIntegrationsFeature().status = value; },
    get agendaSelectedDate() { return getAgendaFeature().selectedDate; },
    set agendaSelectedDate(value) { getAgendaFeature().selectedDate = value; },
    get agendaCalendarMonthOffset() { return getAgendaFeature().calendarMonthOffset; },
    set agendaCalendarMonthOffset(value) { getAgendaFeature().calendarMonthOffset = value; },
    get agendaTypeFilter() { return getAgendaFeature().typeFilter; },
    set agendaTypeFilter(value) { getAgendaFeature().typeFilter = value; },
    get activeTimeSheetTaskId() { return getTasksFeature().activeTimeSheetTaskId; },
    get timeSheetStartedAt() { return getTasksFeature().timeSheetStartedAt; },
    get timeSheetInterval() { return getTasksFeature().timeSheetInterval; },
    get aiChatHistory() { return getAssistantFeature().chatHistory; },
    set aiChatHistory(value) { getAssistantFeature().chatHistory = value; },
    get aiConfigured() { return getAssistantFeature().configured; },
    set aiConfigured(value) { getAssistantFeature().configured = value; },
    get isAiTyping() { return getAssistantFeature().isTyping; },
    set isAiTyping(value) { getAssistantFeature().isTyping = value; },
    get authUsers() { return getConfigurationFeature().users; },
    set authUsers(value) { getConfigurationFeature().users = value; },
    get currentAuthRole() { return getConfigurationFeature().role; },
    set currentAuthRole(value) { getConfigurationFeature().role = value; },
    get emailReceivers() { return getEmailIntegrationFeature().receivers; },
    set emailReceivers(value) { getEmailIntegrationFeature().receivers = value; },
    get importedSpreadsheetData() { return getImporterFeature().data; },
    set importedSpreadsheetData(value) { getImporterFeature().data = value; },
    get promptsFilter() { return getPromptsFeature().filter; },
    set promptsFilter(value) { getPromptsFeature().filter = value; },
    applyPlanDensity() {
      let preference = null;
      try { preference = localStorage.getItem('atrium_ui_density'); } catch {}
      document.documentElement.dataset.uiDensity = resolveDensityFromPlan(window.AtriumAuth?.currentWorkspace?.plan, preference, window.location.hostname);
    },
    async init() {
      installStaticFieldContext();
      this.applyPlanDensity();
      await Store.load();
      await this.loadAuthUsers({ shared: true });
      void refreshCompletionNotifications();
      window.setInterval(() => {
        if (!document.hidden) void refreshCompletionNotifications();
      }, 60_000);
      // Só quem administra inicia coleta. O servidor recusa; aqui só esconde o que não funcionaria.
      document.documentElement.dataset.canCollect = String(this.canStartCollection());
      document.getElementById('btnOpenSetupWizard')?.classList.toggle('hidden', window.AtriumAuth?.currentUser?.role !== 'master_admin');
      getUiModeComponent().init();
      getUiShellComponent().init(getUiModeComponent().currentMode);
      getQuickAddComponent().init();
      getSystemStatusComponent().init({ stateStatus: Store.stateStatus });
      this.initTheme();
      this.bindNavigation();
      this.bindActions();
      this.renderAll();
      this.checkServerStatus();
      this.checkAiStatus();
      document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());
      if (Store.state.settings.dismissedBanner) document.getElementById('environmentBanner').classList.add('hidden');
      // Espera o restante da abertura, que ainda escolhe a tela pelo endereço.
      window.setTimeout(() => this.checkFirstAccessTour(), 500);
      void this.loadSetupStatus().then(() => this.renderDashboard?.());
      this.checkA1Onboarding();
      this.checkSetupWizard();
      installGlobalErrorReporting();
      // Sincronização automática: apenas no primeiro acesso (conta recém-criada).
      // Os ciclos seguintes são silenciosos no servidor (07h/19h BRT) ou por ação
      // explícita no botão Sincronizar. Recarregar a página nunca sincroniza.
      if (window.sessionStorage.getItem('atrium_initial_sync_pending') === 'true') {
        window.sessionStorage.removeItem('atrium_initial_sync_pending');
        void this.syncAll({ silent: false, trigger: 'manual' });
      }

      const initialFromPath = viewFromPathname(window.location.pathname);
      const initialFromHash = viewFromHash(window.location.hash);
      const initialView = initialFromPath || initialFromHash;
      if (initialView && document.getElementById(`view-${initialView}`)) {
        if (!initialFromPath && initialFromHash) window.history.replaceState(null, '', pathForView(initialView));
        this.switchView(initialView);
      }
      this.openPublicationFromLocation();
    },
    initials(name) {
      if (!name) return 'AD';
      const parts = String(name).trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) return 'AD';
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    },
    initTheme() {
      getThemeComponent().init();
    },
    setTheme(theme) {
      getThemeComponent().setTheme(theme);
    },
    toggleTheme() {
      getThemeComponent().toggleTheme();
    },
    bindNavigation() {
      const sidebar = document.getElementById('sidebar');
      const isCollapsed = localStorage.getItem('atrium_sidebar_collapsed') === 'true';
      if (isCollapsed && sidebar) sidebar.classList.add('collapsed');

      document.getElementById('sidebarToggleBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar?.classList.toggle('collapsed');
        localStorage.setItem('atrium_sidebar_collapsed', sidebar?.classList.contains('collapsed') ? 'true' : 'false');
      });

      document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
        this.switchView(button.dataset.view);
        this.syncViewUrl(button.dataset.view);
      }));
      document.addEventListener('click', event => {
        const attentionItem = event.target.closest('.v2-attention-item[data-attention-target]');
        if (attentionItem) {
          const target = attentionItem.dataset.attentionTarget;
          if (target === 'late-tasks') {
            this.switchView('kanban');
            const statusFilter = document.getElementById('taskListStatusFilter');
            if (statusFilter) {
              statusFilter.value = 'overdue';
              statusFilter.dispatchEvent(new Event('change'));
            }
            return;
          }
          if (target === 'publications') {
            this.switchView('inbox');
            return;
          }
          if (target === 'deadlines') {
            this.switchView('agenda');
            const taskTab = document.querySelector('#agendaFilterTabs button[data-agenda-filter="task"]');
            if (taskTab) taskTab.click();
            return;
          }
          if (target === 'agenda') {
            this.switchView('agenda');
            const eventTab = document.querySelector('#agendaFilterTabs button[data-agenda-filter="event"]');
            if (eventTab) eventTab.click();
            return;
          }
        }
        const link = event.target.closest('[data-view-link]');
        if (link) {
          this.switchView(link.dataset.viewLink);
          this.syncViewUrl(link.dataset.viewLink);
        }
      });
      window.addEventListener('popstate', () => this.handleLocationChange());
      window.addEventListener('hashchange', () => this.handleLocationChange());
      document.getElementById('menuToggle')?.addEventListener('click', event => getUiShellComponent().toggleNavigation(event.currentTarget));
      document.addEventListener('keydown', event => {
        getUiShellComponent().handleKeydown(event);
        if (event.defaultPrevented) return;
        if (event.key === 'Escape') {
          this.closeModal();
          this.closeJudicialSetup();
          this.closeOfficeSetup();
          this.closeCalendarConfigModal();
          this.closeGeminiKeyModal();
          this.closeFinancialEntryModal();
          this.closePublicationEmailModal();
          getInpiIntegrationFeature().closeModal();
        }
        if (event.key === 'Enter') {
          const interactive = event.target.closest('[data-view-link], [data-process-id], [data-contact-id], [data-agenda-id], [data-source-id], #primaryTermCard, .sidebar-office, .v2-attention-item');
          if (interactive && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName)) { event.preventDefault(); interactive.click(); }
        }
      });
    },
    bindActions() {
      const byId = id => document.getElementById(id);
      byId('dismissBanner')?.addEventListener('click', () => { byId('environmentBanner')?.classList.add('hidden'); Store.state.settings.dismissedBanner = true; Store.save(); });
      byId('syncButton')?.addEventListener('click', () => this.syncAll());
      byId('agendaSyncButton')?.addEventListener('click', () => this.syncAll());
      getOnboardingComponent().init();
      getModalComponent().init();
      byId('modalForm')?.addEventListener('submit', event => this.handleModalSubmit(event));
      getDashboardFeature().init();
      getOfficeIdentityFeature().init();
      getAuditFeature().init();
      getLinksFeature().init();
      getTasksFeature().init();
      getReportsFeature().init();
      getProcessesFeature().init();
      getContactsFeature().init();
      getDocumentsFeature().init();
      getLeadsFeature().init();
      getFinancialFeature().init();
      getCalculationsFeature().init();
      getAgendaFeature().init();
      getPublicationsFeature().init();
      getAssistantFeature().init();
      getPromptsFeature().init();
      getMonitoringFeature().init();
      getJudicialIntegrationsFeature().init();
      getConfigurationFeature().init();
      getEmailIntegrationFeature().init();
      getExternalCalendarFeature().init();
      getGoogleCalendarFeature().init();
      getImporterFeature().init();
      getInpiIntegrationFeature().init();
      getGlobalSearchComponent().init();
    getAssistantContextSearchComponent().init();

      byId('btnOpenInpiFromIntegrations')?.addEventListener('click', () => this.openInpiModal());
      byId('btnOpenInpiFromMonitoring')?.addEventListener('click', () => this.openInpiModal());

      byId('kanbanFilterButton').addEventListener('click', event => { event.currentTarget.classList.toggle('active'); this.toast('Filtro pessoal aplicado ao quadro.', 'success'); });
      document.querySelectorAll('th[data-sort-table]').forEach(th => {
        th.addEventListener('click', () => {
          const table = th.dataset.sortTable;
          const field = th.dataset.sortField;
          if (table === 'process') {
            getProcessesFeature().handleSort(field);
          } else if (table === 'contact') {
            getContactsFeature().handleSort(field);
          }
        });
      });
    },
    syncViewUrl(view) {
      if (!view) return;
      try {
        if (document.documentElement.dataset.route !== 'app') return;
        const targetPath = pathForView(view);
        if (!targetPath) return;
        if (window.location.pathname === targetPath) return;
        window.history.pushState(null, '', targetPath);
      } catch {}
    },
    handleLocationChange() {
      const pathView = viewFromPathname(window.location.pathname);
      const hashView = viewFromHash(window.location.hash);
      const view = pathView || hashView;
      if (!view || view === this.currentView) {
        this.openPublicationFromLocation();
        return;
      }
      if (!pathView && hashView) this.syncViewUrl(view);
      this.switchView(view);
      this.openPublicationFromLocation();
    },
    openPublicationFromLocation() {
      const id = publicationIdFromLocation(window.location.search, window.location.hash);
      if (!id) return;
      const attempt = number => {
        const item = (Store.state?.intimations || []).find(record =>
          String(record?.id || '') === id || String(record?.externalId || '') === id);
        if (!item) {
          if (number < 10) window.setTimeout(() => attempt(number + 1), 250);
          return;
        }
        if (this.currentView !== 'inbox') this.switchView('inbox');
        getPublicationsFeature().select(item.id);
        window.setTimeout(() => document.getElementById('intimationDetail')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 120);
      };
      attempt(0);
    },
    switchView(view) {
      if (this.modalMode?.mode === 'reauth') {
        this.closeModal();
      }
      reauthRunner?.cancelPrompt();
      if (this.currentView === 'processes' && view !== 'processes') getProcessesFeature().closeInspector({ restoreFocus: false });
      if (this.currentView === 'contacts' && view !== 'contacts') getContactsFeature().closeInspector({ restoreFocus: false });
      this.currentView = view;
      document.querySelectorAll('.view').forEach(element => element.classList.toggle('active', element.id === `view-${view}`));
      const hubSubviewParent = ({ monitoring: 'integrations', importer: 'integrations', audit: 'configuration' })[view] || view;
      document.querySelectorAll('.nav-item[data-view]').forEach(element => {
        const isActive = element.dataset.view === hubSubviewParent;
        element.classList.toggle('active', isActive);
        if (isActive) element.setAttribute('aria-current', 'page');
        else element.removeAttribute('aria-current');
      });
      const section = document.getElementById(`view-${view}`);
      if (section) {
        document.getElementById('viewTitle').textContent = section.dataset.title;
        document.getElementById('viewEyebrow').textContent = section.dataset.eyebrow;
      }
      if (view === 'dashboard') this.renderDashboard();
      if (view === 'inbox') this.renderInbox();
      if (view === 'kanban') this.renderKanban();
      if (view === 'processes') this.renderProcesses(document.getElementById('processSearch')?.value || '');
      if (view === 'contacts') this.renderContacts(document.getElementById('contactSearch')?.value || '');
      if (view === 'leads') this.renderLeads();
      if (view === 'financial') this.renderFinancial();
      if (view === 'reports') this.renderReports();
      if (view === 'calculations') this.renderCalculations();
      if (view === 'documents') this.renderDocuments();
      if (view === 'assistant') this.renderAssistant();
      if (view === 'agenda') this.renderAgenda();
      if (view === 'monitoring') this.renderMonitoring();
      if (view === 'prompts') this.renderPrompts();
      if (view === 'links') this.renderLinks();
      if (view === 'configuration') this.renderConfiguration();
      if (view === 'audit') this.renderAudit();
      if (view === 'integrations') { this.refreshJudicialStatus(); this.loadEmailStatus(); getExternalCalendarFeature().refreshStatus(); getGoogleCalendarFeature().refreshStatus(); }
      const navigationHadFocus = window.innerWidth <= 860 && document.getElementById('sidebar')?.contains(document.activeElement);
      getUiShellComponent().syncMobileNavigation(view);
      getUiShellComponent().closeNavigation({ restoreFocus: false });
      if (navigationHadFocus) document.getElementById('appMain')?.focus({ preventScroll: true });
      const mobileBodyScroller = window.innerWidth <= 860 && document.documentElement.dataset.ui === 'v2';
      (mobileBodyScroller ? document.body : window).scrollTo({ top: 0, behavior: mobileBodyScroller ? 'instant' : window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    },
    renderAll() {
      ['renderOfficeIdentity', 'renderDashboard', 'renderInbox', 'renderKanban', 'renderProcesses', 'renderContacts', 'renderLeads', 'renderFinancial', 'renderReports', 'renderDocuments', 'renderAgenda', 'renderMonitoring', 'renderPrompts', 'renderLinks', 'renderConfiguration', 'renderAudit'].forEach(method => {
        try { this[method]?.(); } catch (error) { console.error(`Falha em ${method}:`, error); }
      });
    },
    renderReports() { return getReportsFeature().render(); },
    renderOfficeIdentity() { return getOfficeIdentityFeature().render(); },
    openOfficeSetup() { return getOfficeIdentityFeature().open(); },
    closeOfficeSetup() { return getOfficeIdentityFeature().close(); },
    updateOfficeLogoPreview() { return getOfficeIdentityFeature().updateLogoPreview(); },
    handleOfficeLogoUpload(file) { return getOfficeIdentityFeature().handleLogoUpload(file); },
    handleOfficeSetupSubmit(event) { return getOfficeIdentityFeature().handleSubmit(event); },
    productTourUserKey() {
      const user = window.AtriumAuth?.currentUser;
      return `atrium_product_tour_done:${user?.workspaceId || ''}:${user?.id || user?.username || ''}`;
    },
    markProductTourDone() {
      sessionStorage.removeItem('atrium_pending_product_tour');
      try { localStorage.setItem(this.productTourUserKey(), 'true'); } catch { /* preferência opcional */ }
    },
    setupStatus: {},
    /** Situação do que falta configurar. Falha na consulta só deixa o item como pendente. */
    async loadSetupStatus() {
      const read = async path => {
        try {
          const response = await window.AtriumAuth.secureFetch(path, { headers: { Accept: 'application/json' } });
          return response.ok ? await response.json() : null;
        } catch { return null; }
      };
      const [mfa, judicial] = await Promise.all([read('/api/auth/mfa/status'), this.canStartCollection() ? read('/api/integrations/judicial') : null]);
      this.setupStatus = {
        mfaEnabled: mfa?.mfaEnabled === true,
        certificateValid: judicial?.certificate?.valid === true,
        totpLinked: (judicial?.portals || []).some(portal => portal.totpConfigured)
      };
      return this.setupStatus;
    },
    async saveCertificateAnswer(hasCertificate) {
      Store.state.settings ||= {};
      Store.state.settings.hasA1Certificate = hasCertificate;
      await Store.save();
      await Store.flush();
    },
    /** Ações oferecidas pelo tour e pelo guia do painel. */
    async runSetupAction(action) {
      const go = view => { this.switchView(view); this.syncViewUrl(view); };
      if (action === 'oab') { go('monitoring'); document.getElementById('primaryTermCard')?.click(); return; }
      if (action === 'importer') { go('importer'); return; }
      if (action === 'mfa') { window.AtriumAuth.openProfile?.(); window.AtriumAuth.openMfaEnroll?.(); return; }
      if (action === 'judicial' || action === 'totp') {
        go('integrations');
        await getJudicialIntegrationsFeature().open();
        // Certificado e QR Code ficam na aba Credenciais.
        document.getElementById('jcoTabCredentials')?.click();
        if (action === 'totp') {
          const details = document.getElementById('totpGuideDetails');
          if (details) details.open = true;
          document.getElementById('totpSetupSection')?.scrollIntoView({ block: 'start' });
        }
        return;
      }
      if (action === 'a1-yes' || action === 'a1-no') {
        await this.saveCertificateAnswer(action === 'a1-yes');
        await this.loadSetupStatus();
        this.renderAll();
      }
    },
    async startProductTour() {
      await this.loadSetupStatus();
      return getProductTour().start();
    },
    checkFirstAccessTour() {
      if (sessionStorage.getItem('atrium_pending_setup_wizard') === 'true'
        || sessionStorage.getItem('atrium_pending_a1_onboarding') === 'true') return;
      if (document.querySelector('.modal-backdrop:not(.hidden)')) return;
      let doneForUser = false;
      let seenBefore = false;
      try {
        if (localStorage.getItem('atrium_product_tour_off') === 'true') return;
        doneForUser = localStorage.getItem(this.productTourUserKey()) === 'true';
        seenBefore = Boolean(localStorage.getItem('atrium_tour_seen') || localStorage.getItem('jurisflow_tour_seen'));
      } catch { return; }
      if (!shouldStartTour({ pending: sessionStorage.getItem('atrium_pending_product_tour') === 'true', doneForUser, seenBefore })) return;
      this.startProductTour();
    },
    openGuidedTour(force = false) {
      getOnboardingComponent().open(force);
    },
    closeGuidedTour() {
      getOnboardingComponent().close();
    },
    showTourSlide(index) {
      getOnboardingComponent().showSlide(index);
    },
    openSetupWizard() {
      if (window.AtriumAuth?.currentUser?.role !== 'master_admin') return false;
      if (this.tourTimer) getOnboardingComponent().cancelTimer();
      const activeOverlay = document.querySelector('.modal-backdrop:not(.hidden):not(#setupWizardBackdrop)');
      if (activeOverlay) return false;
      return getSetupWizardFeature().open(Store.state.settings?.workspaceProfile || {});
    },
    checkSetupWizard() {
      if (Store.state.settings?.onboardingWizardCompleted === true) {
        sessionStorage.removeItem('atrium_pending_setup_wizard');
        return;
      }
      const isMaster = window.AtriumAuth?.currentUser?.role === 'master_admin';
      if (!isMaster) return;
      const isPending = sessionStorage.getItem('atrium_pending_setup_wizard') === 'true';
      if (!isPending) return;
      const a1Backdrop = document.getElementById('onboardingCertificateBackdrop');
      if (a1Backdrop && !a1Backdrop.classList.contains('hidden')) return;
      const wizard = getSetupWizardFeature();
      if (!wizard.isOpen()) wizard.open(Store.state.settings?.workspaceProfile || {});
    },
    async completeSetupWizard(profile = {}) {
      if (this.setupWizardSaving || window.AtriumAuth?.currentUser?.role !== 'master_admin') return false;
      this.setupWizardSaving = true;
      Store.state.settings ||= {};
      const settings = Store.state.settings;
      const previousProfile = settings.workspaceProfile;
      const previousCompleted = settings.onboardingWizardCompleted;
      const workspaceProfile = {
        courts: Array.isArray(profile.courts) ? [...profile.courts] : [],
        teamSize: profile.team || '',
        processVolume: profile.volume || '',
        aiInterest: profile.ai || ''
      };
      settings.workspaceProfile = workspaceProfile;
      settings.onboardingWizardCompleted = true;
      let confirmed = false;
      try {
        await Store.save();
        confirmed = await Store.flush() === true;
      } catch {
        confirmed = false;
      } finally {
        this.setupWizardSaving = false;
      }
      if (!confirmed) {
        if (window.AtriumAuth?.authenticated === false) {
          getSetupWizardFeature().close();
          document.querySelector('#authLoginForm input')?.focus();
        }
        if (Store.state.settings.workspaceProfile === workspaceProfile) {
          if (previousProfile === undefined) delete Store.state.settings.workspaceProfile;
          else Store.state.settings.workspaceProfile = previousProfile;
          if (previousCompleted === undefined) delete Store.state.settings.onboardingWizardCompleted;
          else Store.state.settings.onboardingWizardCompleted = previousCompleted;
        }
        return false;
      }
      sessionStorage.removeItem('atrium_pending_setup_wizard');
      getSetupWizardFeature().close();
      this.renderAll();
      this.toast('Preferências do escritório salvas.', 'success');
      this.checkFirstAccessTour();
      return true;
    },
    checkA1Onboarding() {
      const isMaster = window.AtriumAuth?.currentUser?.role === 'master_admin';
      if (!isMaster) return;
      if (Store.state.settings?.hasA1Certificate !== undefined) return;
      const isPending = sessionStorage.getItem('atrium_pending_a1_onboarding') === 'true';
      if (!isPending) return;
      this.openA1OnboardingModal();
    },
    openA1OnboardingModal() {
      const backdrop = document.getElementById('onboardingCertificateBackdrop');
      if (!backdrop) return;
      if (backdrop.dataset.a1Initialized === 'true') {
        backdrop.dispatchEvent(new CustomEvent('atrium:a1-open'));
        return;
      }
      backdrop.dataset.a1Initialized = 'true';
      let busy = false;
      let certificateUploaded = false;
      let opened = false;
      let lastFocusedElement = null;
      let previousBodyOverflow = '';
      let previousShellInert = null;
      const shell = document.getElementById('appShell');
      const dialog = backdrop.querySelector('[role="dialog"]');
      dialog?.setAttribute('tabindex', '-1');

      const radioYes = document.getElementById('certChoiceYes');
      const radioNo = document.getElementById('certChoiceNo');
      const uploadFields = document.getElementById('certUploadFields');
      const fileInput = document.getElementById('onboardingCertFileInput');
      const fileName = document.getElementById('onboardingCertFileName');
      const passInput = document.getElementById('onboardingCertPassword');
      const btnSubmit = document.getElementById('btnSubmitOnboardingCert');
      const btnContinueNo = document.getElementById('btnContinueWithoutCert');
      const feedback = document.getElementById('onboardingCertFeedback');
      const dropzone = document.getElementById('certDropzone');
      if (feedback) btnSubmit?.before(feedback);
      const focusableControls = () => [...backdrop.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex="0"]')]
        .filter(element => element.getClientRects().length && !element.closest('.hidden'));
      const open = () => {
        if (opened) return;
        const active = document.activeElement;
        lastFocusedElement = shell?.contains(active) && active.getClientRects().length && !active.closest('.hidden')
          ? active
          : [...(shell?.querySelectorAll('button:not([disabled]), a[href], input:not([disabled])') || [])]
            .find(element => element.getClientRects().length && !element.closest('.hidden'));
        previousBodyOverflow = document.body.style.overflow;
        previousShellInert = shell?.getAttribute('inert') ?? null;
        shell?.setAttribute('inert', '');
        document.body.style.overflow = 'hidden';
        opened = true;
        backdrop.classList.remove('hidden');
        (focusableControls().find(element => element.checked) || focusableControls()[0] || dialog)?.focus();
      };
      backdrop.addEventListener('atrium:a1-open', open);
      backdrop.addEventListener('keydown', event => {
        if (!opened) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        if (event.key !== 'Tab') return;
        const controls = focusableControls();
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) {
          event.preventDefault();
          dialog?.focus();
        } else if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      });

      const setFeedback = (message, state = 'error') => {
        if (!feedback) return;
        if (uploadFields?.classList.contains('hidden')) backdrop.querySelector('.modal-body')?.append(feedback);
        else btnSubmit?.before(feedback);
        feedback.textContent = message;
        feedback.className = state;
        feedback.classList.remove('hidden');
      };
      const setBusy = value => {
        busy = value;
        if (btnSubmit) btnSubmit.disabled = value;
        [btnContinueNo, radioYes, radioNo, fileInput, passInput].forEach(element => {
          if (element) element.disabled = value || certificateUploaded;
        });
        dialog?.setAttribute('aria-busy', String(value));
        if (value) dialog?.focus();
        else if (opened) (certificateUploaded ? btnSubmit : radioYes?.checked ? btnSubmit : btnContinueNo)?.focus();
      };
      const close = () => {
        if (fileInput) fileInput.value = '';
        if (passInput) passInput.value = '';
        if (fileName) fileName.textContent = 'Clique para selecionar o arquivo .pfx / .p12';
        feedback?.classList.add('hidden');
        backdrop.classList.add('hidden');
        opened = false;
        document.body.style.overflow = previousBodyOverflow;
        if (shell) {
          if (previousShellInert === null) shell.removeAttribute('inert');
          else shell.setAttribute('inert', previousShellInert);
        }
        certificateUploaded = false;
        if (window.AtriumAuth?.authenticated === false) document.querySelector('#authLoginForm input')?.focus();
        else if (lastFocusedElement?.isConnected && lastFocusedElement.getClientRects().length) lastFocusedElement.focus();
      };
      const closeIfUnauthenticated = () => {
        if (window.AtriumAuth?.authenticated !== false) return false;
        close();
        return true;
      };
      const complete = async hasCertificate => {
        Store.state.settings = Store.state.settings || {};
        const previous = Store.state.settings.hasA1Certificate;
        Store.state.settings.hasA1Certificate = hasCertificate;
        try {
          await Store.save();
          if (await Store.flush() !== true) throw new Error('Não foi possível salvar a configuração. Tente novamente.');
        } catch (error) {
          if (Store.state.settings.hasA1Certificate === hasCertificate) {
            if (previous === undefined) delete Store.state.settings.hasA1Certificate;
            else Store.state.settings.hasA1Certificate = previous;
          }
          closeIfUnauthenticated();
          throw error;
        }
        sessionStorage.removeItem('atrium_pending_a1_onboarding');
        close();
        this.renderAll();
        this.checkSetupWizard();
        this.checkFirstAccessTour();
      };
      const updateChoice = () => {
        if (busy || certificateUploaded) return;
        if (uploadFields) uploadFields.classList.toggle('hidden', !radioYes?.checked);
        if (btnContinueNo) btnContinueNo.textContent = radioYes?.checked ? 'Cancelar e continuar sem certificado' : 'Continuar sem Certificado Digital';
      };

      radioYes?.addEventListener('change', updateChoice);
      radioNo?.addEventListener('change', updateChoice);
      document.getElementById('certChoiceYesBox')?.addEventListener('click', (e) => {
        if (!busy && !certificateUploaded && radioYes && e.target.tagName !== 'INPUT') {
          radioYes.checked = true;
          updateChoice();
        }
      });
      document.getElementById('certChoiceNoBox')?.addEventListener('click', (e) => {
        if (!busy && !certificateUploaded && radioNo && e.target.tagName !== 'INPUT') {
          radioNo.checked = true;
          updateChoice();
        }
      });

      dropzone?.addEventListener('click', () => { if (!busy && !certificateUploaded) fileInput?.click(); });
      fileInput?.addEventListener('change', (e) => {
        const f = e.target.files?.[0];
        if (fileName) fileName.textContent = f?.name || 'Clique para selecionar o arquivo .pfx / .p12';
      });

      const closeWithNo = async () => {
        if (busy || certificateUploaded || !opened) return;
        setBusy(true);
        setFeedback('Salvando configuração…', 'working');
        try {
          await complete(false);
          this.toast('Pronto. Você pode conectar o certificado depois, em Integrações.', 'success');
        } catch {
          if (!closeIfUnauthenticated()) setFeedback('Não foi possível salvar a configuração. Tente novamente.');
        } finally {
          setBusy(false);
        }
      };

      btnContinueNo?.addEventListener('click', closeWithNo);

      btnSubmit?.addEventListener('click', async () => {
        if (busy || !opened) return;
        if (certificateUploaded) {
          setBusy(true);
          setFeedback('Salvando configuração do certificado já vinculado…', 'working');
          try {
            await complete(true);
            this.toast('Certificado A1 instalado com sucesso! Use "Sincronizar agora" quando quiser atualizar o acervo.', 'success');
          } catch {
            if (!closeIfUnauthenticated()) setFeedback('Certificado já vinculado. Não foi possível salvar a configuração. Tente novamente.');
          } finally {
            setBusy(false);
          }
          return;
        }
        const file = fileInput?.files?.[0];
        const pass = passInput?.value;
        if (!file) {
          if (feedback) {
            feedback.textContent = 'Selecione o arquivo do certificado (.pfx ou .p12).';
            feedback.className = 'error';
            feedback.classList.remove('hidden');
          }
          return;
        }
        if (!pass) {
          if (feedback) {
            feedback.textContent = 'Digite a senha do certificado.';
            feedback.className = 'error';
            feedback.classList.remove('hidden');
          }
          return;
        }

        if (!/\.(pfx|p12)$/i.test(file.name)) {
          setFeedback('Selecione um arquivo .pfx ou .p12.');
          return;
        }
        if (file.size > 5_000_000) {
          setFeedback('O certificado deve ter no máximo 5 MB.');
          return;
        }
        setBusy(true);
        setFeedback('Validando certificado e vinculando…', 'working');
        try {
          const pfxBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = () => reject(new Error('Não foi possível ler o certificado. Selecione o arquivo novamente.'));
            reader.onabort = () => reject(new Error('Leitura do certificado cancelada. Selecione o arquivo novamente.'));
            reader.readAsDataURL(file);
          });
          const res = await window.AtriumAuth?.secureFetch?.('/api/integrations/judicial/certificate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ fileName: file.name, pfxBase64, passphrase: pass })
          });
          const payload = await res?.json().catch(() => ({}));
          if (!res?.ok) throw new Error(payload?.message || 'Falha ao validar certificado.');
          certificateUploaded = true;
          if (fileInput) fileInput.value = '';
          if (passInput) passInput.value = '';
          if (fileName) fileName.textContent = 'Certificado já vinculado. Confirme o salvamento da configuração.';
          await complete(true);
          this.toast('Certificado A1 instalado com sucesso! Use "Sincronizar agora" quando quiser atualizar o acervo.', 'success');
        } catch (err) {
          if (!closeIfUnauthenticated()) setFeedback(certificateUploaded
            ? 'Certificado já vinculado. Não foi possível salvar a configuração. Tente novamente.'
            : err.message || 'Não foi possível vincular o certificado. Tente novamente.');
        } finally {
          setBusy(false);
        }
      });
      open();
    },
    renderDashboard() { return getDashboardFeature().render(); },
    renderMetrics() { return getDashboardFeature().renderMetrics(); },
    renderPublicationsMetrics() {
      return getPublicationsFeature().renderMetrics();
    },
    renderDashboardTasks() { return getDashboardFeature().renderTasks(); },
    renderDashboardWidgets() { return getDashboardFeature().renderWidgets(); },
    renderLeads(query = '') {
      return getLeadsFeature().render(query);
    },
    openLeadModal(defaults = {}) {
      return getLeadsFeature().openLeadModal(defaults);
    },
    renderFinancial(query = '') {
      return getFinancialFeature().render(query);
    },
    renderCalculations() {
      return getCalculationsFeature().render();
    },
    openFinancialEntryModal() {
      return getFinancialFeature().openEntryModal();
    },
    closeFinancialEntryModal() {
      return getFinancialFeature().closeEntryModal();
    },
    updateFinancialModalSummary() {
      return getFinancialFeature().updateModalSummary();
    },
    handleFinancialEntrySubmit(event) {
      return getFinancialFeature().handleEntrySubmit(event);
    },
    renderDocuments() {
      return getDocumentsFeature().render();
    },
    openProcess(processOrId) {
      const process = typeof processOrId === 'object' && processOrId
        ? processOrId
        : (Store.state.processes || []).find(p => String(p.id) === String(processOrId) || String(p.number || '').replace(/\D/g, '') === String(processOrId).replace(/\D/g, ''));
      if (!process) return false;
      this.switchView('processes');
      return getProcessesFeature().openDetails(process);
    },
    openOwnerDocuments(ownerType, ownerId, documentId = '') {
      this.switchView('documents');
      const opened = getDocumentsFeature().openOwnerDocuments(ownerType, ownerId);
      if (documentId) getDocumentsFeature().focusDocument(documentId);
      return opened;
    },
    renderAssistant() {
      return getAssistantFeature().syncPresentation();
    },
    selectAssistantContext(type, id) {
      return getAssistantFeature().selectContext(type && id ? `${type}:${id}` : '');
    },
    filteredIntimations() {
      return getPublicationsFeature().filteredItems();
    },
    intimationParties(item) {
      return getPublicationsFeature().intimationParties(item);
    },
    treatmentStatusBadge(treatmentStatus) {
      return getPublicationsFeature().treatmentStatusBadge(treatmentStatus);
    },
    statusChip(status) {
      const labels = { nova: 'Nova', triagem: 'Em triagem', prazo: 'Prazo conferido', tarefa: 'Tarefa criada', arquivada: 'Arquivada' };
      const classes = { nova: 'warning', triagem: 'planned', prazo: 'connected', tarefa: 'connected', arquivada: 'muted' };
      return `<span class="status-chip ${classes[status] || 'muted'}">${labels[status] || escapeHtml(status)}</span>`;
    },
    renderInbox() {
      return getPublicationsFeature().renderInbox();
    },
    selectIntimation(id) {
      return getPublicationsFeature().select(id);
    },
    renderIntimationDetail() {
      return getPublicationsFeature().renderDetail();
    },
    async handleIntimationAction(item, action) {
      return getPublicationsFeature().handleAction(item, action);
    },
    async applyTreatmentAction(intimationId, action, note = null) {
      return getPublicationsFeature().applyTreatmentAction(intimationId, action, note);
    },
    openDiscardModal(item) {
      return getPublicationsFeature().openDiscardModal(item);
    },
    closeDiscardModal() {
      return getPublicationsFeature().closeDiscardModal();
    },
    openTreatModal(item) {
      return getPublicationsFeature().openTreatModal(item);
    },
    closeTreatModal() {
      return getPublicationsFeature().closeTreatModal();
    },
    renderKanban() {
      return getTasksFeature().renderKanban();
    },
    taskCard(task) {
      return getTasksFeature().renderCard(task);
    },
    startTimeSheet(taskId) {
      return getTasksFeature().startTimeSheet(taskId);
    },
    stopTimeSheet() {
      return getTasksFeature().stopTimeSheet();
    },
    formatElapsedTimer() {
      return getTasksFeature().formatElapsedTimer();
    },
    moveTask(taskId, status) {
      return getTasksFeature().moveTask(taskId, status);
    },
    renderProcesses(query = '') {
      return getProcessesFeature().render(query);
    },
    renderContacts(query = '') {
      return getContactsFeature().render(query);
    },
    loadAuthUsers(options) { return getConfigurationFeature().loadAuthUsers(options); },
    manageAuthUser(userId, status) { return getConfigurationFeature().manageAuthUser(userId, status); },
    authUserRow(user) { return getConfigurationFeature().authUserRow(user); },
    renderConfiguration(query = '') { return getConfigurationFeature().render(query); },
    configurationRow(item, index) { return getConfigurationFeature().row(item, index); },
    renderDiagnostic() { return getSystemAdminFeature().renderDiagnostic(); },
    renderBackups() { return getSystemAdminFeature().renderBackups(); },
    openFeedbackModal() { return getSystemAdminFeature().openFeedbackModal(); },
    openIntimationDetailModal(item) {
      if (!item) return;
      const act = classifyIntimationAct(item.text, item.title, item.type);
      const parties = this.intimationParties(item) || 'Partes ainda não identificadas';
      this.openModal('intimationDetail', 'Detalhes da intimação', 'Análise processual DJEN / Diário', [
        { name: 'title', label: 'Título do ato publicado', value: item.title, full: true },
        { name: 'process', label: 'Número do processo CNJ', value: item.process || 'Não identificado' },
        { name: 'parties', label: 'Partes vinculadas', value: parties },
        { name: 'court', label: 'Tribunal / Unidade judiciária', value: item.court || 'Não informado' },
        { name: 'publishedAt', label: 'Data da publicação', value: formatDate(item.publishedAt) },
        { name: 'actInfo', label: 'Classificação do ato', value: act.category ? act.category.toUpperCase() : 'PUBLICAÇÃO', full: true },
        { name: 'text', label: 'Teor integral da publicação', type: 'textarea', full: true, value: item.text || 'Sem texto original.' }
      ], { ...item, deadline: '', _act: act });
      const submitButton = document.querySelector('#modalForm footer .button.gold');
      if (submitButton) submitButton.textContent = 'Criar tarefa no Kanban';
    },
    renderAgenda() {
      return getAgendaFeature().render();
    },
    renderMiniCalendar() {
      return getAgendaFeature().renderMiniCalendar();
    },
    renderMonitoring() { return getMonitoringFeature().render(); },
    openDataJudConfigModal() { return getMonitoringFeature().openDataJudConfigModal(); },
    openPublicationsEmailModal() {
      return getPublicationsFeature().openPublicationsEmailModal();
    },
    closePublicationsEmailModal() {
      return getPublicationsFeature().closePublicationsEmailModal();
    },
    renderAudit(filter = 'all', query = '') { return getAuditFeature().render(filter, query); },
    closeGlobalSearchPalette() {
      getGlobalSearchComponent().close();
    },
    performGlobalSearch(query) {
      return getGlobalSearchComponent().perform(query);
    },
    handleGlobalSearchSelection({ target, id }) {
      if (target === 'process') {
        this.switchView('processes');
        const process = Store.state.processes.find(item => item.id === id);
        if (process) {
          const input = document.getElementById('processSearch');
          if (input) input.value = process.number || process.client || '';
          this.renderProcesses(process.number || process.client || '');
          if (document.documentElement.dataset.ui === 'v2') {
            window.setTimeout(() => document.querySelector(`#processTableBody [data-process-id="${CSS.escape(String(process.id))}"]`)?.click(), 0);
          }
        }
      } else if (target === 'contact') {
        this.switchView('contacts');
        const contact = Store.state.contacts.find(item => item.id === id);
        if (contact) {
          const input = document.getElementById('contactSearch');
          const isV2 = document.documentElement.dataset.ui === 'v2';
          // V2 keeps the full relationship list visible while opening the
          // selected contact in its lateral inspector. Classic retains its
          // historical filtered-list navigation contract.
          const search = isV2 ? '' : (contact.name || '');
          if (input) input.value = search;
          getContactsFeature().setRoleFilter('all');
          this.renderContacts(search);
          if (isV2) getContactsFeature().selectContact(contact.id);
        }
      } else if (target === 'lead') {
        this.switchView('leads');
        const lead = Store.state.leads.find(item => item.id === id);
        if (lead) getLeadsFeature().openLeadModal(lead);
      } else if (target === 'task') {
        this.switchView('kanban');
        const task = Store.state.tasks.find(item => item.id === id);
        if (task) this.openTaskModal(task);
      } else if (target === 'intimation') {
        this.switchView('inbox');
        // Resultado de busca pode carregar id absorvido por fusão: abre o keeper.
        this.selectIntimation(resolveIntimationId(Store.state.intimations, id));
      } else if (target === 'document') {
        this.switchView('documents');
        getDocumentsFeature().focusDocument(id);
      } else if (target === 'agenda') {
        const appointment = (Store.state.agenda || []).find(item => item.id === id);
        if (appointment) this.openAgendaModal(appointment);
      } else if (target === 'financial') {
        const process = (Store.state.processes || []).find(item => item.id === id);
        this.switchView('financial');
        const query = process?.number || process?.client || '';
        const input = document.getElementById('financialSearch');
        if (input) input.value = query;
        this.renderFinancial(query);
      } else if (target === 'prompt') {
        this.switchView('prompts');
        const prompt = [...(Store.state.customPrompts || []), ...(window.PROMPTS_DATA || [])].find(item => item.id === id);
        if (prompt) {
          const input = document.getElementById('promptsSearchInput');
          if (input) input.value = prompt.title || '';
          getPromptsFeature().filter = { ...getPromptsFeature().filter, search: prompt.title || '' };
          getPromptsFeature().render();
        }
      } else if (target === 'audit') {
        this.switchView('audit');
        const entry = (Store.state.audit || []).find(item => item.id === id);
        const query = entry?.action || '';
        const input = document.getElementById('auditSearch');
        if (input) input.value = query;
        this.renderAudit('all', query);
      }
    },
    openModal(mode, title, eyebrow, fields, defaults = {}, topHtml = '') {
      getModalComponent().open(mode, title, eyebrow, fields, defaults, topHtml);
    },
    closeModal() {
      getModalComponent().close();
    },
    openTaskModal(defaults = {}) {
      return getTasksFeature().openTaskModal(defaults);
    },
    openIntimationModal(defaults = {}) {
      const processes = Store.state.processes || [];
      const contacts = Store.state.contacts || [];
      const normalizedProcessNumber = String(defaults.process || '').replace(/\D/g, '');
      const linkedProcess = processes.find(process => process.id === defaults.processId)
        || processes.find(process => normalizedProcessNumber && String(process.number || '').replace(/\D/g, '') === normalizedProcessNumber);
      const linkedContact = contacts.find(contact => contact.id === defaults.contactId)
        || contacts.find(contact => String(contact.name || '').trim().toLocaleLowerCase('pt-BR') === String(defaults.client || '').trim().toLocaleLowerCase('pt-BR'));
      const modalDefaults = {
        publishedAt: isoDate(),
        source: 'Manual',
        ...defaults,
        processId: defaults.processId || linkedProcess?.id || '',
        contactId: defaults.contactId || linkedContact?.id || ''
      };
      this.openModal('intimation', defaults.id ? 'Editar intimação' : 'Nova publicação', 'Registro judicial', [
        { name: 'title', label: 'Título / ato', required: true, full: true },
        {
          name: 'process', label: 'Número do processo', type: 'combobox', identityName: 'processId',
          placeholder: 'Pesquisar número, cliente, ação ou tribunal',
          suggestions: processes.map(process => ({
            id: process.id,
            value: process.number || process.client || 'Processo sem número',
            label: [process.client, process.actionType, process.court].filter(Boolean).join(' · ') || 'Processo cadastrado'
          }))
        },
        {
          name: 'client', label: 'Cliente', type: 'combobox', identityName: 'contactId',
          placeholder: 'Pesquisar cliente ou contato cadastrado',
          suggestions: contacts.map(contact => ({
            id: contact.id,
            value: contact.name || 'Contato sem nome',
            label: [contact.contactRole === 'cliente' ? 'Cliente' : 'Contato', contact.phone, contact.email, contact.city].filter(Boolean).join(' · ')
          }))
        },
        { name: 'court', label: 'Tribunal / órgão' }, { name: 'publishedAt', label: 'Data da publicação', type: 'date' },
        { name: 'source', label: 'Origem', type: 'select', options: [{value:'Manual',label:'Manual'},{value:'Sistema jurídico',label:'Sistema jurídico'},{value:'DJEN',label:'DJEN'}] },
        { name: 'text', label: 'Texto original', type: 'textarea', full: true, required: true }
      ], modalDefaults);

      const processField = document.querySelector('#modalFields [data-modal-combobox-field] #field-process')?.closest('[data-modal-combobox-field]');
      processField?.addEventListener('atrium:combobox-select', event => {
        if (event.detail?.name !== 'process') return;
        const process = processes.find(item => String(item.id) === String(event.detail.identity));
        if (!process) return;
        const contact = contacts.find(item => String(item.id) === String(process.contactId));
        const clientInput = document.getElementById('field-client');
        const clientIdentity = clientInput?.closest('[data-modal-combobox-field]')?.querySelector('[data-combobox-identity]');
        const courtInput = document.getElementById('field-court');
        if (clientInput) clientInput.value = contact?.name || process.client || '';
        if (clientIdentity) clientIdentity.value = contact?.id || process.contactId || '';
        if (courtInput) courtInput.value = process.court || '';
      });
    },
    openProcessModal(defaults = {}) {
      return getProcessesFeature().openProcessModal(defaults);
    },
    openContactModal(defaults = {}) {
      return getContactsFeature().openContactModal(defaults);
    },
    openAgendaModal(defaults = {}) {
      return getAgendaFeature().openModal(defaults);
    },
    openConfigurationModal(defaults = {}, index = null) { return getConfigurationFeature().openModal(defaults, index); },
    openTermModal(defaults = {}) { return getMonitoringFeature().openTermModal(defaults); },
    openSourceModal(defaults = {}) { return getMonitoringFeature().openSourceModal(defaults); },
    openJudicialSetup() { return getJudicialIntegrationsFeature().open(); },
    closeJudicialSetup() { return getJudicialIntegrationsFeature().close(); },
    refreshJudicialStatus(showError = false) { return getJudicialIntegrationsFeature().refreshStatus(showError); },
    renderJudicialSetup() { return getJudicialIntegrationsFeature().renderStatus(); },
    loadEmailStatus() { return getEmailIntegrationFeature().loadStatus(); },
    openEmailConfigModal() { return getEmailIntegrationFeature().openConfigModal(); },
    closeEmailConfigModal() { return getEmailIntegrationFeature().closeConfigModal(); },
    submitEmailConfig(event) { return getEmailIntegrationFeature().submitConfig(event); },
    openEmailTestModal() { return getEmailIntegrationFeature().openTestModal(); },
    closeEmailTestModal() { return getEmailIntegrationFeature().closeTestModal(); },
    submitEmailTest(event) { return getEmailIntegrationFeature().submitTest(event); },
    openInpiModal() { return getInpiIntegrationFeature().openModal(); },
    closeInpiModal() { return getInpiIntegrationFeature().closeModal(); },
    openPublicationEmailModal(item) {
      return getPublicationsFeature().openPublicationEmailModal(item);
    },
    closePublicationEmailModal() {
      return getPublicationsFeature().closePublicationEmailModal();
    },
    async submitPublicationEmail(event) {
      return getPublicationsFeature().submitPublicationEmail(event);
    },
    loadEmailReceivers() { return getEmailIntegrationFeature().loadReceivers(); },
    renderEmailReceivers(receivers = []) { return getEmailIntegrationFeature().renderReceivers(receivers); },
    openEmailReceiverModal(receiverToEdit = null) { return getEmailIntegrationFeature().openReceiverModal(receiverToEdit); },
    closeEmailReceiverModal() { return getEmailIntegrationFeature().closeReceiverModal(); },
    submitEmailReceiver(event) { return getEmailIntegrationFeature().submitReceiver(event); },
    toggleEmailReceiver(id, currentEnabled) { return getEmailIntegrationFeature().toggleReceiver(id, currentEnabled); },
    deleteEmailReceiver(id) { return getEmailIntegrationFeature().deleteReceiver(id); },
    testA1Sandbox() { return getJudicialIntegrationsFeature().testA1Sandbox(); },
    saveCertificate(event) { return getJudicialIntegrationsFeature().saveCertificate(event); },
    readPortalQr(file) { return getJudicialIntegrationsFeature().readPortalQr(file); },
    savePortalTotp(event) { return getJudicialIntegrationsFeature().savePortalTotp(event); },
    removePortalTotp() { return getJudicialIntegrationsFeature().removePortalTotp(); },
    savePortalAccount(event) { return getJudicialIntegrationsFeature().savePortalAccount(event); },
    removePortalAccount() { return getJudicialIntegrationsFeature().removePortalAccount(); },
    savePortalCoverage() { return getJudicialIntegrationsFeature().savePortalCoverage(); },
    resetJudicialConnections() { return getJudicialIntegrationsFeature().resetConnections(); },
    launchAssistedSession(button) { return getJudicialIntegrationsFeature().launchAssistedSession(button); },
    syncJudicialNow() { return getJudicialIntegrationsFeature().syncNow(); },
    judicialRequest(url, body) { return getJudicialIntegrationsFeature().request(url, body); },
    async forgetTrustedDevice() {
      try {
        const response = await window.AtriumAuth.secureFetch('/api/auth/trusted-device/revoke', { method: 'POST', headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || 'Não foi possível revogar a confiança.');
        document.getElementById('forgetTrustedDeviceButton').classList.add('hidden');
        Store.audit('Navegador removido da confiança', 'O próximo acesso exigirá senha e Authenticator.');
        this.toast('Confiança removida. O próximo acesso exigirá autenticação completa.', 'success');
      } catch (error) { this.toast(error.message, 'error'); }
    },
    setFormBusy(form, busy) { return getJudicialIntegrationsFeature().setFormBusy(form, busy); },
    fileToBase64(file) { return getJudicialIntegrationsFeature().fileToBase64(file); },
    openCalendarConfigModal() { return getExternalCalendarFeature().open(); },
    closeCalendarConfigModal() { return getExternalCalendarFeature().close(); },
    handleCalendarConfigSubmit(event) { return getExternalCalendarFeature().submit(event); },
    checkAiStatus() { return getAssistantFeature().checkStatus(); },
    openGeminiKeyModal() { return getAssistantFeature().openKeyModal(); },
    closeGeminiKeyModal() { return getAssistantFeature().closeKeyModal(); },
    saveGeminiKey(apiKey) { return getAssistantFeature().saveKey(apiKey); },
    handleGeminiKeySubmit(event) { return getAssistantFeature().handleKeySubmit(event); },
    clearAiConversation() { return getAssistantFeature().clearConversation(); },
    sendQuickPrompt(promptText) { return getAssistantFeature().sendQuickPrompt(promptText); },
    handleAiChatSubmit(event) { return getAssistantFeature().handleChatSubmit(event); },
    sendAiMessage(messageText) { return getAssistantFeature().sendMessage(messageText); },
    copyPrompt(promptText, buttonElement) { return getPromptsFeature().copy(promptText, buttonElement); },
    usePromptInAi(promptText) { return getPromptsFeature().useInAssistant(promptText); },
    renderPrompts() { return getPromptsFeature().render(); },
    renderLinks() { return getLinksFeature().render(); },
    openNewPromptModal(defaults = {}) { return getPromptsFeature().openNewPromptModal(defaults); },
    openNewLinkModal(defaults = {}) { return getLinksFeature().openModal(defaults); },
    openGuideModal(type) {
      this.openModal('guide', 'Ativar certificado A1', 'Configuração protegida', [
        { name: 'instructions', label: 'Arquitetura do certificado', type: 'textarea', full: true, value: 'Configure o certificado A1 apenas pela área protegida de Integrações. O servidor mantém a credencial no cofre cifrado do escritório e informa quando houver necessidade de intervenção humana. A coleta judicial é somente leitura; ciência, assinatura, protocolo e confirmação de prazo permanecem decisões humanas.' }
      ], {});
      document.querySelector('#modalForm footer .button.gold').textContent = 'Entendi';
    },
    async handleModalSubmit(event) {
      event.preventDefault(); if (!this.modalMode) return;
      if (this.modalMode.mode === 'guide') { this.closeModal(); return; }
      if (this.modalSubmitInFlight) return;
      this.modalSubmitInFlight = true;
      const modalSubmitButton = event.currentTarget.querySelector('button[type="submit"]');
      const modalSubmitLabel = modalSubmitButton?.textContent;
      if (modalSubmitButton) {
        modalSubmitButton.disabled = true;
        modalSubmitButton.textContent = 'Salvando…';
      }
      const submittedMode = this.modalMode.mode;
      const modalStateBeforeSubmit = JSON.parse(JSON.stringify(Store.state));
      try {
        if (typeof this.modalMode.defaults?.onSubmit === 'function') {
          const data = Object.fromEntries(new FormData(event.currentTarget).entries());
          const onSubmit = this.modalMode.defaults.onSubmit;
          if (submittedMode === 'reauth') {
            await onSubmit(data);
            return;
          }
          this.closeModal();
          void Promise.resolve().then(() => onSubmit(data)).catch(error => this.toast(error.message || 'Não foi possível salvar o registro.', 'error'));
          return;
        }
        if (this.modalMode.mode === 'intimationDetail') {
        const item = this.modalMode.defaults;
        const act = item._act || classifyIntimationAct(item.text, item.title, item.type);
        const isUrgent = Boolean(item.urgent || item.priority === 'urgente');
        this.closeModal();
        this.openTaskModal({
          title: `Analisar publicação: ${item.title}`,
          description: item.text,
          process: item.process,
          client: item.client,
          source: item.source || 'DJEN',
          intimationId: item.id,
          deadline: '',
          priority: isUrgent ? 'urgente' : 'normal',
          status: 'triagem'
        });
        return;
      }
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      if (this.modalMode.mode === 'task') {
        const defaults = this.modalMode.defaults;
        const publicationId = !defaults.id && (defaults.intimationId || defaults.sourceIntimationId);
        if (publicationId) {
          defaults._transactionTaskId ||= uid('task');
          const task = getTasksFeature().buildTask(data, defaults);
          const result = await getPublicationsFeature().createTaskFromPublication(publicationId, task);
          if (!result) return;
          this.closeModal();
          this.renderAll();
          this.toast(result.message || 'Tarefa criada e vinculada à publicação com sucesso.', 'success');
          return;
        }
        getTasksFeature().saveTask(data, this.modalMode.defaults);
      } else if (this.modalMode.mode === 'publicationWorkAction') {
        const defaults = this.modalMode.defaults;
        const result = await getPublicationsFeature().createWorkAction(defaults.publicationId, {
          ...data,
          id: defaults.id,
          type: defaults.workActionType
        });
        if (!result) return;
        this.closeModal();
        this.renderAll();
        this.toast(result.message || 'Providência criada e vinculada à publicação.', 'success');
        return;
      } else if (this.modalMode.mode === 'intimation') {
        const editing = Boolean(this.modalMode.defaults.id);
        const primaryTerm = Store.state.terms.find(term => term.primary) || Store.state.terms[0];
        const record = { id: this.modalMode.defaults.id || uid('int'), status: this.modalMode.defaults.status || 'nova', unread: this.modalMode.defaults.unread ?? true, term: this.modalMode.defaults.term || `${primaryTerm?.name || 'Advogado(a) Monitorado(a)'} · ${primaryTerm?.registration || 'OAB/UF 000000'}`, createdAt: this.modalMode.defaults.createdAt || new Date().toISOString(), ...this.modalMode.defaults, ...data, updatedAt: new Date().toISOString() };
        Store.upsert('intimations', record); Store.audit(editing ? 'Intimação atualizada' : 'Intimação registrada', `${record.title}${record.process ? ` · ${record.process}` : ''}`);
      } else if (this.modalMode.mode === 'process') {
        const savedProcess = getProcessesFeature().saveProcess(data, this.modalMode.defaults);
        if (!savedProcess) return;
        if (!await getProcessesFeature().persistAccessKey(savedProcess)) return;
      } else if (this.modalMode.mode === 'contact') {
        getContactsFeature().saveContact(data, this.modalMode.defaults);
      } else if (this.modalMode.mode === 'agenda') {
        getAgendaFeature().saveRecord(data, this.modalMode.defaults);
      } else if (this.modalMode.mode === 'configuration') {
        getConfigurationFeature().saveRecord(data, this.modalMode.defaults);
      } else if (this.modalMode.mode === 'term') {
        if (!getMonitoringFeature().saveTerm(data, this.modalMode.defaults)) return;
      } else if (this.modalMode.mode === 'lead') {
        getLeadsFeature().saveLead(data, this.modalMode.defaults);
      } else if (this.modalMode.mode === 'source') {
        getMonitoringFeature().saveSource(data, this.modalMode.defaults);
      } else if (this.modalMode.mode === 'datajud') {
        await getMonitoringFeature().saveDataJud(data);
        return;
      } else if (this.modalMode.mode === 'prompt') {
        getPromptsFeature().savePrompt(data, this.modalMode.defaults);
      } else if (this.modalMode.mode === 'link') {
        if (!getLinksFeature().saveRecord(data, this.modalMode.defaults)) return;
      } else if (this.modalMode.mode === 'feedback') {
        await getSystemAdminFeature().submitFeedback(data);
        return;
      }
      Store.save();
      this.renderAll();
      if (!await Store.flush()) throw new Error('Não foi possível persistir o registro. Tente novamente.');
      this.closeModal();
      this.toast('Registro salvo com sucesso.', 'success');
      } catch (error) {
        if (submittedMode !== 'feedback' && typeof this.modalMode?.defaults?.onSubmit !== 'function') Store.state = modalStateBeforeSubmit;
        this.toast(error.message || 'Não foi possível salvar o registro.', 'error');
      } finally {
        this.modalSubmitInFlight = false;
        if (modalSubmitButton?.isConnected) {
          modalSubmitButton.disabled = false;
          modalSubmitButton.textContent = modalSubmitLabel;
        }
      }
    },
    openDocumentGenerator(options = {}) {
      return getDocumentsFeature().openGenerator(options);
    },
    closeDocumentGenerator() {
      return getDocumentsFeature().closeGenerator();
    },
    updateDocPreview() {
      return getDocumentsFeature().updatePreview();
    },
    async copyDocToClipboard() {
      return getDocumentsFeature().copyToClipboard();
    },
    downloadDoc() {
      return getDocumentsFeature().download();
    },
    handleSpreadsheetUpload(file) { return getImporterFeature().handleUpload(file); },
    renderSpreadsheetPreview(data) { return getImporterFeature().renderPreview(data); },
    cancelSpreadsheetImport() { return getImporterFeature().cancel(); },
    commitSpreadsheetImport() { return getImporterFeature().commit(); },
    reportError(input) { return getErrorReportFeature().open(input); },
    openInpiModal() {
      return getInpiIntegrationFeature().openModal();
    },
    closeInpiModal() {
      return getInpiIntegrationFeature().closeModal();
    },
    async checkServerStatus() {
      try {
        const response = await window.AtriumAuth.secureFetch('/api/status', { headers: { Accept: 'application/json' } });
        if (!response.ok) return;
        const data = await response.json();
        Store.state.settings.calendarConfigured = Boolean(data.calendarConfigured);
        Store.state.settings.collectorConfigured = Boolean(data.collectorConfigured);
        const calendar = Store.state.sources.find(item => item.id === 'external-calendar');
        if (calendar) { calendar.status = data.calendarConfigured ? 'ok' : 'attention'; calendar.detail = data.calendarConfigured ? 'Webcal protegido no servidor' : calendar.detail; }
        Store.save(); this.renderSources(); this.renderMonitoring(); this.renderMetrics();
        document.getElementById('forgetTrustedDeviceButton').classList.toggle('hidden', !window.AtriumAuth.trustedDevice);
        await this.refreshJudicialStatus(false);
        await this.loadEmailStatus();
      } catch { /* O modo estático continua disponível. */ }
    },
    canStartCollection() {
      return ['master_admin', 'admin'].includes(window.AtriumAuth?.currentUser?.role);
    },
    /** Membro comum: o botão traz o que já foi coletado, sem iniciar coleta nos tribunais. */
    async refreshWithoutCollection() {
      this.syncInProgress = true;
      try {
        if (!await Store.flush()) throw new Error('As alterações locais ainda não foram salvas. Tente de novo em instantes.');
        await Store.load();
        this.renderAll();
        this.toast('Dados atualizados. A coleta nos tribunais roda nos ciclos automáticos e por quem administra o escritório.');
        return true;
      } catch (error) {
        this.toast(error.message || 'Não foi possível atualizar. Tente de novo em instantes.', 'error');
        return false;
      } finally {
        this.syncInProgress = false;
      }
    },
    async syncAll({ silent = false, trigger = 'manual' } = {}) {
      if (this.syncInProgress) return false;
      if (!this.canStartCollection()) return this.refreshWithoutCollection();
      this.syncInProgress = true;
      const buttons = [document.getElementById('syncButton'), document.getElementById('agendaSyncButton')];
      buttons.forEach(button => { if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); } });
      getSystemStatusComponent().setState('syncing', 'Iniciando sincronização com os tribunais…', 5);
      if (!silent) this.toast('Iniciando sincronização protegida…');
      let syncProgressPollTimer = null;
      let pollBusy = false;
      let pollClosed = false;
      try {
        if (!await Store.flush()) throw new Error('As alterações locais ainda não foram salvas. Sincronização cancelada para evitar perda de dados.');
        if (typeof window !== 'undefined' && typeof window.setInterval === 'function') {
          syncProgressPollTimer = window.setInterval(async () => {
            if (pollBusy || pollClosed) return;
            pollBusy = true;
            try {
              const pollRes = await window.AtriumAuth.secureFetch('/api/sync/status', { method: 'GET', headers: { Accept: 'application/json' } });
              if (pollRes.ok) {
                const prog = await pollRes.json();
                if (!pollClosed && prog && prog.active) {
                  getSystemStatusComponent().setState('syncing', prog.detail || 'Consultando tribunais…', prog.percent);
                }
              }
            } catch { /* polling silencioso */ } finally { pollBusy = false; }
          }, 350);
        }
        const response = await window.AtriumAuth.secureFetch('/api/sync', {
          method: 'POST',
          headers: { Accept: 'application/json', 'X-Atrium-Sync-Trigger': trigger }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          let errorMsg = data.message || data.error;
          if (!errorMsg) {
            if (response.status === 409) errorMsg = 'Outra sincronização já está em andamento. Aguarde a conclusão.';
            else if (response.status === 412) errorMsg = 'Certificado Digital A1 ou credenciais 2FA pendentes de configuração.';
            else if (response.status === 503) errorMsg = 'Serviço de integração judicial temporariamente indisponível.';
            else if (response.status === 524) errorMsg = 'Tempo limite na sincronização judicial. A operação continua em segundo plano no tribunal.';
            else if (response.status >= 500) errorMsg = `Servidor de integração retornou erro (${response.status}).`;
            else errorMsg = `Falha na sincronização (${response.status}).`;
          }
          throw new Error(errorMsg);
        }
        // O botão também acorda o PJe habilitado; os jobs rodam em segundo plano.
        window.AtriumAuth.secureFetch('/api/integrations/judicial/pje/sync-all', {
          method: 'POST',
          headers: { Accept: 'application/json' }
        }).catch(() => {});
        if (data.skipped) {
          getSystemStatusComponent().setState('ready', data.message || 'Sincronização automática já realizada neste período.');
          return true;
        }
        if (data.joinedExisting || !Array.isArray(data.intimations)) {
          // Execução em andamento ou resposta sem coleções: reconcilia com o estado
          // oficial, que é persistido pelo próprio servidor (e adota a revisão nova).
          try { await Store.load(); } catch { /* reconciliação opcional */ }
        }
        if (Store.state.settings.demoMode && (Number(data.imported) > 0 || (data.intimations && data.intimations.length > 0))) {
          ['agenda', 'intimations', 'processes'].forEach(collection => {
            Store.state[collection] = Store.state[collection].filter(item => !String(item.id || '').includes('demo'));
          });
          getTasksFeature().removeTasksWhere(item => String(item.id || '').includes('demo'));
        }
        (data.events || []).forEach(event => Store.upsert('agenda', event, 'externalId'));
        (data.tasks || []).forEach(task => getTasksFeature().upsertExternalTask(task, 'externalId'));
        (data.intimations || []).forEach(item => getPublicationsFeature().upsertExternalIntimation(item));
        (data.processes || []).forEach(item => getProcessesFeature().upsertExternalProcess(item));
        (data.contacts || []).forEach(item => getContactsFeature().upsertExternalContact(item));
        (data.sources || []).forEach(source => Store.upsert('sources', source, 'id'));
        const clientReconciliation = applyClientReconciliation(Store.state, data.clientLinks || []);
        if (Number(data.imported) > 0 || (data.intimations && data.intimations.length > 0)) Store.state.settings.demoMode = false;
        // O servidor persistiu o coletado no estado consolidado: adota a revisão nova
        // para o flush local não colidir com a própria gravação do backend.
        if (data.canonicalRevision && Store.revision !== data.canonicalRevision) Store.revision = data.canonicalRevision;
        Store.audit('Sincronização concluída', `${plural(data.imported || (data.intimations?.length || 0), 'registro processado', 'registros processados')}.${clientReconciliation.linkedProcesses ? ` ${plural(clientReconciliation.linkedProcesses, 'cliente vinculado', 'clientes vinculados')} com evidência.` : ''}`, 'Sistema');
        Store.save();
        if (!await Store.flush()) throw new Error('A sincronização foi recebida, mas não pôde ser persistida localmente. Tente novamente.');
        this.renderAll();
        const syncTime = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date());
        const warningMessage = Array.isArray(data.warnings) ? data.warnings.map(item => item?.message).filter(Boolean).join(' · ') : '';
        getSystemStatusComponent().setState(
          data.partial ? 'ready' : 'saved',
          data.partial ? `Sincronização concluída com avisos às ${syncTime}.` : `Sincronização confirmada às ${syncTime}.`,
          null,
          { clearOwner: true, owner: null }
        );
        if (!silent) {
          if (data.partial) this.toast(warningMessage || 'Sincronização concluída com uma fonte pendente.', 'warning');
          else this.toast(clientReconciliation.linkedProcesses
            ? `Sincronização concluída. ${plural(clientReconciliation.linkedProcesses, 'cliente vinculado', 'clientes vinculados')} com evidência.`
            : 'Sincronização concluída com sucesso.', 'success');
          if (!hasMonitoredOab(Store.state.terms)) this.toast('Sem OAB não há publicações para buscar. Informe sua OAB em Fontes monitoradas.', 'warning');
        }
        return true;
      } catch (error) {
        const rawMsg = error?.message || '';
        const isNetworkError = /failed to fetch|networkerror|load failed|econnrefused/i.test(rawMsg);
        const message = isNetworkError
          ? 'Sem conexão com o ATRIUM. Confira sua internet e tente de novo.'
          : (rawMsg || 'Não foi possível sincronizar.');
        if (/sessão|autent/i.test(message)) {
          getSystemStatusComponent().setState('reauth', message);
        } else {
          getSystemStatusComponent().setState('ready', 'Pronto', null, { clearOwner: true, owner: null });
        }
        if (!silent) this.toast(message, 'error');
        return false;
      } finally {
        pollClosed = true;
        this.syncInProgress = false;
        if (syncProgressPollTimer) {
          window.clearInterval(syncProgressPollTimer);
          syncProgressPollTimer = null;
        }
        buttons.forEach(button => { if (button) { button.disabled = false; button.removeAttribute('aria-busy'); } });
      }
    },
    async importJson(file) {
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        let imported = 0;
        const defaultTerm = Store.state.terms[0] ? `${Store.state.terms[0].name} · ${Store.state.terms[0].registration}` : 'Advogado(a) Titular';
        if (Array.isArray(payload)) {
          payload.forEach(record => {
            if (!record?.title && !record?.text) return;
            Store.upsert('intimations', { id: record.id || uid('int'), source: record.source || 'Arquivo JSON', status: record.status || 'nova', unread: true, title: record.title || 'Intimação importada', process: record.process || '', client: record.client || '', court: record.court || '', publishedAt: record.publishedAt || isoDate(), text: record.text || record.description || '', term: record.term || defaultTerm, createdAt: new Date().toISOString() });
            imported++;
          });
        } else if (payload && typeof payload === 'object') {
          const hasCollections = ['intimations', 'tasks', 'processes', 'agenda'].some(key => Array.isArray(payload[key]));
          if (hasCollections) {
            if (Store.state.settings.demoMode) {
              ['agenda', 'intimations', 'processes'].forEach(collection => {
                Store.state[collection] = Store.state[collection].filter(item => !String(item.id || '').includes('demo'));
              });
              getTasksFeature().removeTasksWhere(item => String(item.id || '').includes('demo'));
            }
            (payload.intimations || []).forEach(record => {
              Store.upsert('intimations', { id: record.id || uid('int'), source: record.source || 'Arquivo JSON', status: record.status || 'nova', unread: true, title: record.title || 'Intimação importada', process: record.process || '', client: record.client || '', court: record.court || '', publishedAt: record.publishedAt || isoDate(), text: record.text || record.description || '', term: record.term || defaultTerm, createdAt: new Date().toISOString(), ...record });
              imported++;
            });
            (payload.tasks || []).forEach(record => {
              getTasksFeature().upsertExternalTask({ id: record.id || uid('task'), title: record.title || 'Tarefa importada', status: record.status || 'triagem', source: record.source || 'Arquivo JSON', priority: record.priority || 'normal', responsible: record.responsible || 'Advogado', createdAt: new Date().toISOString(), ...record });
              imported++;
            });
            (payload.processes || []).forEach(record => {
              Store.upsert('processes', { id: record.id || uid('proc'), number: record.number || '', client: record.client || 'Cliente não informado', secrecy: Boolean(record.secrecy), monitoring: record.monitoring || 'active', source: record.source || 'Arquivo JSON', lastMovement: record.lastMovement || 'Importado via JSON', lastMovementAt: record.lastMovementAt || isoDate(), createdAt: new Date().toISOString(), ...record }, 'number');
              imported++;
            });
            (payload.agenda || []).forEach(record => {
              Store.upsert('agenda', { id: record.id || uid('agenda'), title: record.title || 'Compromisso importado', date: record.date || isoDate(), source: record.source || 'Arquivo JSON', createdAt: new Date().toISOString(), ...record });
              imported++;
            });
            if (imported > 0) Store.state.settings.demoMode = false;
          } else if (payload.title || payload.text) {
            Store.upsert('intimations', { id: payload.id || uid('int'), source: payload.source || 'Arquivo JSON', status: payload.status || 'nova', unread: true, title: payload.title || 'Intimação importada', process: payload.process || '', client: payload.client || '', court: payload.court || '', publishedAt: payload.publishedAt || isoDate(), text: payload.text || payload.description || '', term: payload.term || defaultTerm, createdAt: new Date().toISOString(), ...payload });
            imported++;
          }
        }
        Store.audit('Arquivo importado', `${plural(imported, 'registro adicionado', 'registros adicionados')}.`);
        if (!await Store.flush()) throw new Error('Os registros foram lidos, mas não puderam ser persistidos. Tente novamente.');
        this.renderAll(); this.toast(`${plural(imported, 'registro importado', 'registros importados')}.`, 'success');
      } catch { this.toast('O arquivo não contém um JSON válido.', 'error'); }
      document.getElementById('jsonImportInput').value = '';
    },
    exportJson(data, filename) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
    },
    toast(message, type = '', action = null) {
      return Toast.show(message, type, action);
    }
  };

  let initialized = false;
  window.addEventListener(STORE_PERSISTENCE_CONFLICT_EVENT, event => {
    getSystemStatusComponent().setState('conflict', event.detail?.message);
    App.toast(event.detail?.message || 'Não foi possível salvar: o mesmo dado mudou em outro lugar. Suas alterações continuam nesta tela. Copie o que precisar e recarregue a página.', 'error');
  });
  window.addEventListener(ATRIUM_STORE_PERSISTENCE_ERROR_EVENT, event => {
    getSystemStatusComponent().setState(event.detail?.status === 401 ? 'reauth' : 'error', event.detail?.message);
    App.toast(event.detail?.message || STORE_PERSISTENCE_ERROR_MESSAGE, 'error');
  });
  const boot = () => {
    if (initialized) {
      App.applyPlanDensity();
      getUiShellComponent().applyMode(getUiModeComponent().currentMode);
      return;
    }
    initialized = true;
    App.init().catch(err => { console.error('App.init failed:', err); window.AtriumAuth.logout(); });
  };
  window.Atrium = { App, Store };
  window.AtriumSenda = window.Atrium;
  window.JurisFlow = window.Atrium;
  window.KellerCentral = window.Atrium;
  window.portalApp = App;
  window.App = App;
  getThemeComponent().init();
  getOnboardingComponent().init();
  getSetupWizardFeature().init();
  // Só começa a passar quando a pessoa abre o passo a passo.
  document.getElementById('totpGuideDetails')?.addEventListener('toggle', event => {
    if (event.target.open) totpGuideStop = mountTotpGuide(document.getElementById('totpGuideMount'));
    else totpGuideStop();
  });
  document.getElementById('btnOpenSetupWizard')?.addEventListener('click', () => App.openSetupWizard());
  window.addEventListener('keller:authenticated', boot);
  if (window.AtriumAuth?.authenticated) boot();
})();
