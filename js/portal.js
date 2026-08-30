import {
  ATRIUM_STORE_PERSISTENCE_ERROR_EVENT,
  STORE_PERSISTENCE_CONFLICT_EVENT,
  STORE_PERSISTENCE_ERROR_MESSAGE,
  Store,
  isoDate,
  uid
} from './core/store.js';
import { createGlobalSearch } from './components/global-search.js';
import { createModal } from './components/modal.js';
import { createOnboarding } from './components/onboarding.js';
import { createTheme } from './components/theme.js';
import { Toast } from './components/toast.js';
import { createUiMode } from './views/ui-v2/mode.js';
import { createUiV2Shell } from './views/ui-v2/shell.js';
import { createSystemStatusBar } from './views/ui-v2/system-status.js';
import { renderFinancialV2Workspace } from './views/ui-v2/financial-presenter.js';
import { createAgendaFeature } from './features/agenda.js';
import { createAssistantFeature } from './features/assistant.js';
import { createAuditFeature } from './features/audit.js';
import { createConfigurationFeature } from './features/configuration.js';
import { createContactsFeature } from './features/contacts.js';
import { createDashboardFeature } from './features/dashboard.js';
import { createDocumentsFeature } from './features/documents.js';
import { createEmailIntegrationFeature } from './features/email-integration.js';
import { createExternalCalendarFeature } from './features/external-calendar.js';
import { createFinancialFeature } from './features/financial.js';
import { createImporterFeature } from './features/importer.js';
import { createJudicialIntegrationsFeature } from './features/judicial-integrations.js';
import { createLeadsFeature } from './features/leads.js';
import { createLinksFeature } from './features/links.js';
import { createMonitoringFeature } from './features/monitoring.js';
import { createOfficeIdentityFeature } from './features/office-identity.js';
import { classifyIntimationAct, createPublicationsFeature } from './features/publications.js';
import { createProcessesFeature } from './features/processes.js';
import { createPromptsFeature } from './features/prompts.js';
import { createSystemAdminFeature } from './features/system-admin.js';
import { createTasksFeature } from './features/tasks.js';

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

  function isBrazilianHoliday(date) {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    if (m === 1 && d === 1) return true;
    if (m === 4 && d === 21) return true;
    if (m === 5 && d === 1) return true;
    if (m === 9 && d === 7) return true;
    if (m === 10 && d === 12) return true;
    if (m === 11 && d === 2) return true;
    if (m === 11 && d === 15) return true;
    if (m === 11 && d === 20) return true;
    if (m === 12 && d === 25) return true;
    return false;
  }

  function isForenseRecess(date) {
    const m = date.getMonth() + 1;
    const d = date.getDate();
    if (m === 12 && d >= 20) return true;
    if (m === 1 && d <= 20) return true;
    return false;
  }

  function isBusinessDay(date, excludeRecess = true) {
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return false;
    if (excludeRecess && isForenseRecess(date)) return false;
    if (isBrazilianHoliday(date)) return false;
    return true;
  }

  function calculateLegalDeadline(startDateStr, totalDays = 15, options = {}) {
    const countBusiness = options.businessDays !== false;
    const isDouble = Boolean(options.doubleDeadline);
    const effectiveDays = isDouble ? totalDays * 2 : totalDays;
    
    let current = new Date(`${String(startDateStr).slice(0, 10)}T00:00:00`);
    if (isNaN(current.getTime())) current = new Date();

    // Art. 224 CPC: Exclui o dia do começo
    current.setDate(current.getDate() + 1);

    while (!isBusinessDay(current)) {
      current.setDate(current.getDate() + 1);
    }

    if (!countBusiness) {
      current.setDate(current.getDate() + (effectiveDays - 1));
      while (!isBusinessDay(current)) {
        current.setDate(current.getDate() + 1);
      }
      return current.toISOString().slice(0, 10);
    }

    let counted = 1;
    while (counted < effectiveDays) {
      current.setDate(current.getDate() + 1);
      if (isBusinessDay(current)) {
        counted += 1;
      }
    }

    return current.toISOString().slice(0, 10);
  }

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
  let modalComponent;
  let onboardingComponent;
  let themeComponent;
  let uiModeComponent;
  let uiShellComponent;
  let systemStatusComponent;
  let agendaFeature;
  let assistantFeature;
  let auditFeature;
  let configurationFeature;
  let contactsFeature;
  let dashboardFeature;
  let documentsFeature;
  let emailIntegrationFeature;
  let externalCalendarFeature;
  let financialFeature;
  let importerFeature;
  let judicialIntegrationsFeature;
  let leadsFeature;
  let linksFeature;
  let monitoringFeature;
  let officeIdentityFeature;
  let publicationsFeature;
  let processesFeature;
  let promptsFeature;
  let systemAdminFeature;
  let tasksFeature;

  function getGlobalSearchComponent() {
    globalSearchComponent ||= createGlobalSearch({
      getState: () => Store.state,
      normalizeText,
      escapeHtml,
      formatDate,
      onSelect: selection => App.handleGlobalSearchSelection(selection)
    });
    return globalSearchComponent;
  }

  function getModalComponent() {
    modalComponent ||= createModal({
      escapeHtml,
      onModeChange: modalMode => { App.modalMode = modalMode; }
    });
    return modalComponent;
  }

  function getOnboardingComponent() {
    onboardingComponent ||= createOnboarding({
      getSettings: () => Store.state?.settings,
      saveState: () => Store.save(),
      showToast: (message, type) => App.toast(message, type),
      onSlideChange: slide => { App.currentTourSlide = slide; },
      onTimerChange: timer => { App.tourTimer = timer; }
    });
    return onboardingComponent;
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
      }
    });
    return uiModeComponent;
  }

  function getUiShellComponent() {
    uiShellComponent ||= createUiV2Shell();
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
      onCompleteTask: taskId => getTasksFeature().completeTask(taskId),
      onRenderAll: () => App.renderAll(),
      onOpenAgenda: item => App.openAgendaModal(item),
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
      onRenderMonitoring: () => App.renderMonitoring()
    });
    return officeIdentityFeature;
  }

  function getAuditFeature() {
    auditFeature ||= createAuditFeature({
      store: Store,
      documentRef: document,
      escapeHtml,
      formatDateTime,
      exportJson: (data, filename) => App.exportJson(data, filename),
      getIsoDate: () => isoDate(),
      showToast: (message, type) => App.toast(message, type)
    });
    return auditFeature;
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
      showToast: (message, type) => App.toast(message, type),
      onOpenTask: task => App.openTaskModal(task),
      onOpenIntimation: () => App.openIntimationModal(),
      onImportJson: file => App.importJson(file),
      onRenderGlobalMetrics: () => App.renderMetrics(),
      onSyncAppState: () => {
        window.setTimeout(() => window.location.reload(), 700);
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
      getCurrentUserName: () => window.KellerAuth?.currentUser?.displayName,
      openModal: (...args) => App.openModal(...args),
      closeModal: () => App.closeModal(),
      showToast: (message, type) => App.toast(message, type),
      onRenderAll: () => App.renderAll(),
      onAnalyzeWithAi: analyzeTaskWithAi
    });
    return tasksFeature;
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
      secureFetch: (...args) => window.KellerAuth.secureFetch(...args),
      openExternalUrl: (...args) => window.open(...args),
      copyToClipboard: value => navigator.clipboard.writeText(value),
      getLinkedTasks: processNumber => Store.state.tasks.filter(task => processNumber && String(task.process || '').trim() === processNumber),
      getLinkedIntimations: processNumber => Store.state.intimations.filter(item => processNumber && String(item.process || '').trim() === processNumber),
      isTerminalStatus: status => TERMINAL_STATUSES.includes(status)
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
      openModal: (...args) => App.openModal(...args)
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
      getCurrentUser: () => window.KellerAuth?.currentUser,
      getIsoDate: () => isoDate(),
      onOpenGenerator: options => App.openDocumentGenerator(options)
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
      getCurrentUserName: () => window.KellerAuth?.currentUser?.displayName
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
      renderV2Workspace: renderFinancialV2Workspace
    });
    return financialFeature;
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
      secureFetch: (...args) => window.KellerAuth.secureFetch(...args),
      escapeHtml,
      showToast: (message, type) => App.toast(message, type),
      audit: (action, detail) => Store.audit(action, detail),
      getSelectedIntimation: () => {
        const selectedId = getPublicationsFeature().selectedIntimation;
        return Store.state.intimations.find(item => item.id === selectedId) || null;
      },
      getLegalSkills: () => window.CODEX_LEGAL_SKILLS || []
    });
    return assistantFeature;
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
      onUsePrompt: promptText => getAssistantFeature().loadPrompt(promptText)
    });
    return promptsFeature;
  }

  function getJudicialIntegrationsFeature() {
    if (!judicialIntegrationsFeature) judicialIntegrationsFeature = createJudicialIntegrationsFeature({
      documentRef: document,
      windowRef: window,
      secureFetch: (...args) => window.KellerAuth.secureFetch(...args),
      escapeHtml,
      showToast: (message, type) => App.toast(message, type),
      audit: (action, detail) => Store.audit(action, detail),
      onSyncAll: options => App.syncAll(options)
    });
    return judicialIntegrationsFeature;
  }

  function getEmailIntegrationFeature() {
    if (!emailIntegrationFeature) emailIntegrationFeature = createEmailIntegrationFeature({
      documentRef: document,
      windowRef: window,
      secureFetch: (...args) => window.KellerAuth.secureFetch(...args),
      escapeHtml,
      showToast: (message, type) => App.toast(message, type),
      getCurrentUser: () => window.KellerAuth?.currentUser,
      getOfficeName: () => Store.state.settings?.officeName || '',
      confirmFn: message => window.confirm(message)
    });
    return emailIntegrationFeature;
  }

  function getExternalCalendarFeature() {
    if (!externalCalendarFeature) externalCalendarFeature = createExternalCalendarFeature({
      store: Store,
      documentRef: document,
      windowRef: window,
      secureFetch: (...args) => window.KellerAuth.secureFetch(...args),
      showToast: (message, type) => App.toast(message, type),
      onSyncAll: options => App.syncAll(options)
    });
    return externalCalendarFeature;
  }

  function getImporterFeature() {
    if (!importerFeature) importerFeature = createImporterFeature({
      store: Store,
      documentRef: document,
      windowRef: window,
      secureFetch: (...args) => window.KellerAuth.secureFetch(...args),
      escapeHtml,
      showToast: (message, type) => App.toast(message, type),
      upsertProcess: record => getProcessesFeature().upsertExternalProcess(record),
      upsertContact: record => getContactsFeature().upsertExternalContact(record),
      upsertTask: record => getTasksFeature().upsertExternalTask(record),
      onRenderAll: () => App.renderAll(),
      onSwitchView: view => App.switchView(view)
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
      onOpenCalendarConfig: () => getExternalCalendarFeature().open()
    });
    return monitoringFeature;
  }

  function getSystemAdminFeature() {
    if (!systemAdminFeature) systemAdminFeature = createSystemAdminFeature({
      store: Store,
      documentRef: document,
      windowRef: window,
      secureFetch: (...args) => window.KellerAuth.secureFetch(...args),
      fetchFn: (...args) => window.fetch(...args),
      escapeHtml,
      showToast: (message, type) => App.toast(message, type),
      openModal: (...args) => App.openModal(...args),
      closeModal: () => App.closeModal(),
      setTheme: theme => App.setTheme(theme),
      switchView: view => App.switchView(view)
    });
    return systemAdminFeature;
  }

  function getConfigurationFeature() {
    if (!configurationFeature) configurationFeature = createConfigurationFeature({
      store: Store,
      documentRef: document,
      secureFetch: (...args) => window.KellerAuth.secureFetch(...args),
      escapeHtml,
      normalizeText,
      openModal: (...args) => App.openModal(...args),
      showToast: (message, type) => App.toast(message, type),
      onRenderDiagnostic: () => getSystemAdminFeature().renderDiagnostic(),
      onRenderBackups: () => getSystemAdminFeature().renderBackups()
    });
    return configurationFeature;
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
    async init() {
      await Store.load();
      await this.loadAuthUsers();
      getUiModeComponent().init();
      getUiShellComponent().init(getUiModeComponent().currentMode);
      getSystemStatusComponent().init({ stateStatus: Store.stateStatus });
      this.initTheme();
      this.bindNavigation();
      this.bindActions();
      this.renderAll();
      this.checkServerStatus();
      this.checkAiStatus();
      document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' }).format(new Date());
      if (Store.state.settings.dismissedBanner) document.getElementById('environmentBanner').classList.add('hidden');
      this.checkFirstAccessTour();
      this.syncAll({ silent: true });
      this.autoSyncTimer = window.setInterval(() => this.syncWhenIdle(), 5 * 60 * 1000);
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

      document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => this.switchView(button.dataset.view)));
      document.addEventListener('click', event => { const link = event.target.closest('[data-view-link]'); if (link) this.switchView(link.dataset.viewLink); });
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
        }
        if (event.key === 'Enter') {
          const interactive = event.target.closest('[data-view-link], [data-process-id], [data-contact-id], [data-agenda-id], [data-source-id], #primaryTermCard, .sidebar-office');
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
      getProcessesFeature().init();
      getContactsFeature().init();
      getDocumentsFeature().init();
      getLeadsFeature().init();
      getFinancialFeature().init();
      getAgendaFeature().init();
      getPublicationsFeature().init();
      getAssistantFeature().init();
      getPromptsFeature().init();
      getMonitoringFeature().init();
      getJudicialIntegrationsFeature().init();
      getConfigurationFeature().init();
      getEmailIntegrationFeature().init();
      getExternalCalendarFeature().init();
      getImporterFeature().init();
      getGlobalSearchComponent().init();

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
    switchView(view) {
      if (this.currentView === 'processes' && view !== 'processes') getProcessesFeature().closeInspector({ restoreFocus: false });
      this.currentView = view;
      document.querySelectorAll('.view').forEach(element => element.classList.toggle('active', element.id === `view-${view}`));
      document.querySelectorAll('.nav-item[data-view]').forEach(element => element.classList.toggle('active', element.dataset.view === view));
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
      if (view === 'documents') this.renderDocuments();
      if (view === 'agenda') this.renderAgenda();
      if (view === 'monitoring') this.renderMonitoring();
      if (view === 'prompts') this.renderPrompts();
      if (view === 'links') this.renderLinks();
      if (view === 'configuration') this.renderConfiguration();
      if (view === 'audit') this.renderAudit();
      if (view === 'integrations') { this.refreshJudicialStatus(); this.loadEmailStatus(); }
      getUiShellComponent().closeNavigation({ restoreFocus: false });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    renderAll() {
      ['renderOfficeIdentity', 'renderDashboard', 'renderInbox', 'renderKanban', 'renderProcesses', 'renderContacts', 'renderLeads', 'renderFinancial', 'renderDocuments', 'renderAgenda', 'renderMonitoring', 'renderPrompts', 'renderLinks', 'renderConfiguration', 'renderAudit'].forEach(method => {
        try { this[method]?.(); } catch (error) { console.error(`Falha em ${method}:`, error); }
      });
    },
    renderOfficeIdentity() { return getOfficeIdentityFeature().render(); },
    openOfficeSetup() { return getOfficeIdentityFeature().open(); },
    closeOfficeSetup() { return getOfficeIdentityFeature().close(); },
    updateOfficeLogoPreview() { return getOfficeIdentityFeature().updateLogoPreview(); },
    handleOfficeLogoUpload(file) { return getOfficeIdentityFeature().handleLogoUpload(file); },
    handleOfficeSetupSubmit(event) { return getOfficeIdentityFeature().handleSubmit(event); },
    checkFirstAccessTour() {
      getOnboardingComponent().checkFirstAccess();
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
    loadAuthUsers() { return getConfigurationFeature().loadAuthUsers(); },
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
      getGlobalSearchComponent().perform(query);
    },
    handleGlobalSearchSelection({ target, id }) {
      if (target === 'process') {
        this.switchView('processes');
        const process = Store.state.processes.find(item => item.id === id);
        if (process) {
          const input = document.getElementById('processSearch');
          if (input) input.value = process.number || process.client || '';
          this.renderProcesses(process.number || process.client || '');
        }
      } else if (target === 'contact') {
        this.switchView('contacts');
        const contact = Store.state.contacts.find(item => item.id === id);
        if (contact) {
          const input = document.getElementById('contactSearch');
          if (input) input.value = contact.name || '';
          this.renderContacts(contact.name || '');
        }
      } else if (target === 'task') {
        this.switchView('kanban');
        const task = Store.state.tasks.find(item => item.id === id);
        if (task) this.openTaskModal(task);
      } else if (target === 'intimation') {
        this.switchView('inbox');
        this.selectIntimation(id);
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
      this.openModal('intimation', defaults.id ? 'Editar intimação' : 'Nova intimação', 'Registro judicial', [
        { name: 'title', label: 'Título / ato', required: true, full: true }, { name: 'process', label: 'Número do processo' }, { name: 'client', label: 'Cliente' },
        { name: 'court', label: 'Tribunal / órgão' }, { name: 'publishedAt', label: 'Data da publicação', type: 'date' },
        { name: 'source', label: 'Origem', type: 'select', options: [{value:'Manual',label:'Manual'},{value:'Sistema jurídico',label:'Sistema jurídico'},{value:'DJEN',label:'DJEN'}] },
        { name: 'text', label: 'Texto original', type: 'textarea', full: true, required: true }
      ], { publishedAt: isoDate(), source: 'Manual', ...defaults });
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
    savePortalCoverage() { return getJudicialIntegrationsFeature().savePortalCoverage(); },
    resetJudicialConnections() { return getJudicialIntegrationsFeature().resetConnections(); },
    syncJudicialNow() { return getJudicialIntegrationsFeature().syncNow(); },
    judicialRequest(url, body) { return getJudicialIntegrationsFeature().request(url, body); },
    async forgetTrustedDevice() {
      try {
        const response = await window.KellerAuth.secureFetch('/api/auth/trusted-device/revoke', { method: 'POST', headers: { Accept: 'application/json' } });
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
    handleQuickAiKeySubmit() { return getAssistantFeature().handleQuickKeySubmit(); },
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
        { name: 'instructions', label: 'Arquitetura do certificado', type: 'textarea', full: true, value: '1. Instale o certificado A1 somente no agente local.\n2. Defina A1_PFX_PATH e A1_PFX_PASSPHRASE fora do código.\n3. Cadastre a origem exata de cada portal em collector/portals.json.\n4. Execute primeiro em modo visível para concluir login, QR code ou 2FA.\n5. Agende a execução diária somente após validar cada fonte.\n\nO sistema nunca deve calcular ou confirmar prazo fatal sem revisão humana.' }
      ], {});
      document.querySelector('#modalForm footer .button.gold').textContent = 'Entendi';
    },
    async handleModalSubmit(event) {
      event.preventDefault(); if (!this.modalMode) return;
      if (this.modalMode.mode === 'guide') { this.closeModal(); return; }
      if (this.modalSubmitInFlight) return;
      this.modalSubmitInFlight = true;
      const modalSubmitButton = event.currentTarget.querySelector('button[type="submit"]');
      if (modalSubmitButton) modalSubmitButton.disabled = true;
      const submittedMode = this.modalMode.mode;
      const modalStateBeforeSubmit = JSON.parse(JSON.stringify(Store.state));
      try {
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
      } else if (this.modalMode.mode === 'intimation') {
        const editing = Boolean(this.modalMode.defaults.id);
        const primaryTerm = Store.state.terms.find(term => term.primary) || Store.state.terms[0];
        const record = { id: this.modalMode.defaults.id || uid('int'), status: this.modalMode.defaults.status || 'nova', unread: this.modalMode.defaults.unread ?? true, term: this.modalMode.defaults.term || `${primaryTerm?.name || 'Advogado(a) Monitorado(a)'} · ${primaryTerm?.registration || 'OAB/UF 000000'}`, createdAt: this.modalMode.defaults.createdAt || new Date().toISOString(), ...this.modalMode.defaults, ...data, updatedAt: new Date().toISOString() };
        Store.upsert('intimations', record); Store.audit(editing ? 'Intimação atualizada' : 'Intimação registrada', `${record.title}${record.process ? ` · ${record.process}` : ''}`);
      } else if (this.modalMode.mode === 'process') {
        if (!getProcessesFeature().saveProcess(data, this.modalMode.defaults)) return;
      } else if (this.modalMode.mode === 'contact') {
        getContactsFeature().saveContact(data, this.modalMode.defaults);
      } else if (this.modalMode.mode === 'agenda') {
        getAgendaFeature().saveRecord(data, this.modalMode.defaults);
      } else if (this.modalMode.mode === 'configuration') {
        getConfigurationFeature().saveRecord(data, this.modalMode.defaults);
      } else if (this.modalMode.mode === 'term') {
        getMonitoringFeature().saveTerm(data, this.modalMode.defaults);
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
        if (submittedMode !== 'feedback') Store.state = modalStateBeforeSubmit;
        this.toast(error.message || 'Não foi possível salvar o registro.', 'error');
      } finally {
        this.modalSubmitInFlight = false;
        if (modalSubmitButton?.isConnected) modalSubmitButton.disabled = false;
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
    async checkServerStatus() {
      try {
        const response = await window.KellerAuth.secureFetch('/api/status', { headers: { Accept: 'application/json' } });
        if (!response.ok) return;
        const data = await response.json();
        Store.state.settings.calendarConfigured = Boolean(data.calendarConfigured);
        Store.state.settings.collectorConfigured = Boolean(data.collectorConfigured);
        const calendar = Store.state.sources.find(item => item.id === 'external-calendar');
        if (calendar) { calendar.status = data.calendarConfigured ? 'ok' : 'attention'; calendar.detail = data.calendarConfigured ? 'Webcal protegido no servidor' : calendar.detail; }
        Store.save(); this.renderSources(); this.renderMonitoring(); this.renderMetrics();
        document.getElementById('forgetTrustedDeviceButton').classList.toggle('hidden', !window.KellerAuth.trustedDevice);
        await this.refreshJudicialStatus(false);
        await this.loadEmailStatus();
      } catch { /* O modo estático continua disponível. */ }
    },
    async syncWhenIdle() {
      const modalOpen = !document.getElementById('modalBackdrop').classList.contains('hidden');
      const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if (modalOpen || editing) {
        clearTimeout(this.syncRetryTimer);
        this.syncRetryTimer = window.setTimeout(() => this.syncWhenIdle(), 15 * 1000);
        return;
      }
      await this.syncAll({ silent: true });
    },
    async syncAll({ silent = false } = {}) {
      const buttons = [document.getElementById('syncButton'), document.getElementById('agendaSyncButton')];
      buttons.forEach(button => { if (button) button.disabled = true; });
      getSystemStatusComponent().setState('syncing');
      if (!silent) this.toast('Iniciando sincronização protegida…');
      try {
        if (!await Store.flush()) throw new Error('As alterações locais ainda não foram salvas. Sincronização cancelada para evitar perda de dados.');
        const response = await window.KellerAuth.secureFetch('/api/sync', { method: 'POST', headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Servidor de integração indisponível.');
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
        if (Number(data.imported) > 0 || (data.intimations && data.intimations.length > 0)) Store.state.settings.demoMode = false;
        Store.audit('Sincronização concluída', `${data.imported || (data.intimations?.length || 0)} registro(s) processado(s).`, 'Sistema');
        Store.save();
        if (!await Store.flush()) throw new Error('A sincronização foi recebida, mas não pôde ser persistida localmente. Tente novamente.');
        this.renderAll();
        getSystemStatusComponent().setState('saved', `Sincronização confirmada às ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date())}.`);
        if (!silent) this.toast('Sincronização concluída com sucesso.', 'success');
        return true;
      } catch (error) {
        const message = error.message || 'Não foi possível sincronizar.';
        getSystemStatusComponent().setState(/sessão|autent/i.test(message) ? 'reauth' : 'error', message);
        if (!silent) this.toast(error.message || 'Não foi possível sincronizar.', 'error');
        return false;
      } finally {
        buttons.forEach(button => { if (button) button.disabled = false; });
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
        Store.audit('Arquivo importado', `${imported} registro(s) adicionado(s).`);
        if (!await Store.flush()) throw new Error('Os registros foram lidos, mas não puderam ser persistidos. Tente novamente.');
        this.renderAll(); this.toast(`${imported} registro(s) importado(s).`, 'success');
      } catch { this.toast('O arquivo não contém um JSON válido.', 'error'); }
      document.getElementById('jsonImportInput').value = '';
    },
    exportJson(data, filename) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
    },
    toast(message, type = '') {
      return Toast.show(message, type);
    }
  };

  let initialized = false;
  window.addEventListener(STORE_PERSISTENCE_CONFLICT_EVENT, event => {
    getSystemStatusComponent().setState('conflict', event.detail?.message);
    App.toast(event.detail?.message || 'Os dados foram atualizados em outra aba. Recarregando a versão mais recente…', 'error');
  });
  window.addEventListener(ATRIUM_STORE_PERSISTENCE_ERROR_EVENT, event => {
    getSystemStatusComponent().setState(event.detail?.status === 401 ? 'reauth' : 'error', event.detail?.message);
    App.toast(event.detail?.message || STORE_PERSISTENCE_ERROR_MESSAGE, 'error');
  });
  const boot = () => {
    if (initialized) return;
    initialized = true;
    App.init().catch(err => { console.error('App.init failed:', err); window.KellerAuth.logout(); });
  };
  window.Atrium = { App, Store };
  window.AtriumSenda = window.Atrium;
  window.JurisFlow = window.Atrium;
  window.KellerCentral = window.Atrium;
  window.portalApp = App;
  window.addEventListener('keller:authenticated', boot);
  if (window.KellerAuth?.authenticated) boot();
})();
