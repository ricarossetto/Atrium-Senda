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
import { createAgendaFeature } from './features/agenda.js';
import { createAssistantFeature } from './features/assistant.js';
import { createConfigurationFeature } from './features/configuration.js';
import { createContactsFeature } from './features/contacts.js';
import { createDocumentsFeature } from './features/documents.js';
import { createEmailIntegrationFeature } from './features/email-integration.js';
import { createExternalCalendarFeature } from './features/external-calendar.js';
import { createFinancialFeature } from './features/financial.js';
import { createImporterFeature } from './features/importer.js';
import { createJudicialIntegrationsFeature } from './features/judicial-integrations.js';
import { createLeadsFeature } from './features/leads.js';
import { createMonitoringFeature } from './features/monitoring.js';
import { classifyIntimationAct, createPublicationsFeature } from './features/publications.js';
import { createProcessesFeature } from './features/processes.js';
import { createPromptsFeature } from './features/prompts.js';
import { createSystemAdminFeature } from './features/system-admin.js';
import { createTasksFeature } from './features/tasks.js';

(() => {
  'use strict';

  const TERMINAL_STATUSES = ['concluida', 'concluido', 'arquivada', 'arquivado', 'finalizada', 'cancelada'];

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  function normalizeExternalUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
    } catch { return ''; }
  }
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
      if (field === currentSort.field) {
        if (currentSort.direction === 'asc') {
          th.classList.add('sorted-asc');
          if (indicator) indicator.textContent = '▲';
        } else {
          th.classList.add('sorted-desc');
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
  let agendaFeature;
  let assistantFeature;
  let configurationFeature;
  let contactsFeature;
  let documentsFeature;
  let emailIntegrationFeature;
  let externalCalendarFeature;
  let financialFeature;
  let importerFeature;
  let judicialIntegrationsFeature;
  let leadsFeature;
  let monitoringFeature;
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
      renderDashboardFinancialWidgets: () => App.renderDashboardWidgets()
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
      onSyncAll: () => App.syncAll()
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
      onSyncAll: () => App.syncAll()
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
    get inboxFilter() { return getPublicationsFeature().inboxFilter; },
    set inboxFilter(value) { getPublicationsFeature().inboxFilter = value; },
    get inboxSort() { return getPublicationsFeature().inboxSort; },
    set inboxSort(value) { getPublicationsFeature().inboxSort = value; },
    get inboxCutoff() { return getPublicationsFeature().inboxCutoff; },
    set inboxCutoff(value) { getPublicationsFeature().inboxCutoff = value; },
    currentTourSlide: 0,
    tempOfficeLogo: null,
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
      document.getElementById('menuToggle')?.addEventListener('click', () => document.getElementById('sidebar')?.classList.toggle('open'));
      document.addEventListener('keydown', event => {
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
      // Personalização do Escritório
      document.querySelector('.sidebar-office')?.addEventListener('click', () => this.openOfficeSetup());
      byId('officeSetupClose')?.addEventListener('click', () => this.closeOfficeSetup());
      byId('officeSetupCancel')?.addEventListener('click', () => this.closeOfficeSetup());
      byId('officeSetupBackdrop')?.addEventListener('click', event => { if (event.target === byId('officeSetupBackdrop')) this.closeOfficeSetup(); });
      byId('btnChooseOfficeLogo')?.addEventListener('click', () => byId('officeLogoInput')?.click());
      byId('officeLogoInput')?.addEventListener('change', event => this.handleOfficeLogoUpload(event.target.files?.[0]));
      byId('btnRemoveOfficeLogo')?.addEventListener('click', () => { this.tempOfficeLogo = null; this.updateOfficeLogoPreview(); });
      byId('officeSetupForm')?.addEventListener('submit', event => this.handleOfficeSetupSubmit(event));

      getModalComponent().init();
      byId('modalForm')?.addEventListener('submit', event => this.handleModalSubmit(event));
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

      // Alertas & Auditoria
      byId('auditFilters')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-audit-filter]'); if (!button) return;
        this.auditFilter = button.dataset.auditFilter;
        byId('auditFilters').querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
        this.renderAudit(this.auditFilter, byId('auditSearch')?.value);
      });
      byId('auditSearch')?.addEventListener('input', () => this.renderAudit(this.auditFilter, byId('auditSearch').value));
      byId('btnExportAuditLog')?.addEventListener('click', () => this.exportJson(Store.state.audit, `atrium-auditoria-${isoDate()}.json`));
      byId('btnClearAuditLog')?.addEventListener('click', () => {
        this.auditFilter = 'all';
        if (byId('auditSearch')) byId('auditSearch').value = '';
        byId('auditFilters')?.querySelectorAll('button').forEach((item, idx) => item.classList.toggle('active', idx === 0));
        this.renderAudit('all', '');
        this.toast('Filtros de auditoria redefinidos.', 'info');
      });

      getGlobalSearchComponent().init();
      byId('exportAuditButton')?.addEventListener('click', () => this.exportJson(Store.state.audit, `atrium-auditoria-${isoDate()}.json`));

      // Área de Trabalho
      byId('btnDashboardNewTask')?.addEventListener('click', () => this.openTaskModal());
      byId('dashboardTaskSortSelect')?.addEventListener('change', event => {
        this.dashboardTaskSort = event.target.value;
        this.renderDashboardTasks();
      });
      byId('dashboardTaskFilters')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-dashboard-task-filter]'); if (!button) return;
        this.dashboardTaskFilter = button.dataset.dashboardTaskFilter;
        byId('dashboardTaskFilters').querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
        this.renderDashboardTasks();
      });

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
      byId('btnNewLink')?.addEventListener('click', () => this.openNewLinkModal());
      byId('customLinksGrid')?.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('[data-delete-link]');
        if (deleteBtn) {
          e.preventDefault();
          e.stopPropagation();
          const linkId = deleteBtn.dataset.deleteLink;
          const idx = (Store.state.customLinks || []).findIndex(l => l.id === linkId);
          if (idx >= 0) {
            const removed = Store.state.customLinks.splice(idx, 1)[0];
            Store.audit('Link útil excluído', removed?.title || linkId);
            Store.save();
            this.renderLinks();
            this.toast('Link útil excluído com sucesso.', 'success');
          }
          return;
        }
      });
    },
    switchView(view) {
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
      document.getElementById('sidebar').classList.remove('open');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    renderAll() {
      ['renderOfficeIdentity', 'renderDashboard', 'renderInbox', 'renderKanban', 'renderProcesses', 'renderContacts', 'renderLeads', 'renderFinancial', 'renderDocuments', 'renderAgenda', 'renderMonitoring', 'renderPrompts', 'renderLinks', 'renderConfiguration', 'renderAudit'].forEach(method => {
        try { this[method]?.(); } catch (error) { console.error(`Falha em ${method}:`, error); }
      });
    },
    renderOfficeIdentity() {
      const s = Store?.state?.settings || {};
      const officeName = s.officeName || 'Meu Escritório';
      const officeSlogan = s.officeSlogan || 'Desde 1983';
      const officeLogo = s.officeLogo || '';

      const nameEl = document.getElementById('sidebarOfficeName');
      const labelEl = document.getElementById('sidebarOfficeLabel');
      const avatarEl = document.querySelector('.sidebar-office .office-avatar-icon');
      if (nameEl) nameEl.textContent = officeName;
      if (labelEl) labelEl.textContent = officeSlogan;

      if (avatarEl) {
        if (officeLogo) {
          avatarEl.innerHTML = `<img src="${escapeHtml(officeLogo)}" class="office-custom-logo" alt="Logo">`;
          avatarEl.style.background = 'transparent';
          avatarEl.style.backgroundImage = 'none';
        } else {
          avatarEl.innerHTML = '';
          avatarEl.style.backgroundImage = "url('assets/icons/team.svg')";
          avatarEl.style.backgroundSize = 'cover';
          avatarEl.style.backgroundPosition = 'center';
        }
      }
    },
    openOfficeSetup() {
      const s = Store.state.settings || {};
      const primaryTerm = Store.state.terms?.[0] || {};
      document.getElementById('officeInputName').value = s.officeName || 'Meu Escritório';
      document.getElementById('officeInputSlogan').value = s.officeSlogan || 'Desde 1983';
      document.getElementById('officeInputLawyer').value = s.lawyerName || primaryTerm.name || 'Advogado(a) Titular';
      document.getElementById('officeInputOab').value = s.lawyerOab || primaryTerm.registration || 'OAB/UF 000000';
      document.getElementById('officeInputAddress').value = s.lawyerAddress || '';
      document.getElementById('officeInputCity').value = s.city || '';

      this.tempOfficeLogo = s.officeLogo || null;
      this.updateOfficeLogoPreview();

      document.getElementById('officeSetupBackdrop').classList.remove('hidden');
    },
    closeOfficeSetup() {
      document.getElementById('officeSetupBackdrop').classList.add('hidden');
    },
    updateOfficeLogoPreview() {
      const preview = document.getElementById('officeLogoPreview');
      const removeBtn = document.getElementById('btnRemoveOfficeLogo');
      if (this.tempOfficeLogo) {
        preview.innerHTML = `<img src="${escapeHtml(this.tempOfficeLogo)}" alt="Prévia">`;
        removeBtn?.classList.remove('hidden');
      } else {
        preview.innerHTML = `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 10v2M15 10v2M9 15v2M15 15v2"/></svg>`;
        removeBtn?.classList.add('hidden');
      }
    },
    handleOfficeLogoUpload(file) {
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        this.toast('A imagem deve ter no máximo 2MB.', 'danger');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        this.tempOfficeLogo = e.target.result;
        this.updateOfficeLogoPreview();
        this.toast('Logo carregada com sucesso.', 'success');
      };
      reader.readAsDataURL(file);
    },
    async handleOfficeSetupSubmit(event) {
      event.preventDefault();
      Store.state.settings.officeName = document.getElementById('officeInputName').value.trim();
      Store.state.settings.officeSlogan = document.getElementById('officeInputSlogan').value.trim();
      Store.state.settings.lawyerName = document.getElementById('officeInputLawyer').value.trim();
      Store.state.settings.lawyerOab = document.getElementById('officeInputOab').value.trim();
      Store.state.settings.lawyerAddress = document.getElementById('officeInputAddress').value.trim();
      Store.state.settings.city = document.getElementById('officeInputCity').value.trim();
      Store.state.settings.officeLogo = this.tempOfficeLogo;

      if (Store.state.terms?.[0]) {
        Store.state.terms[0].name = Store.state.settings.lawyerName;
        Store.state.terms[0].registration = Store.state.settings.lawyerOab;
      }

      Store.audit('Identidade do escritório atualizada', Store.state.settings.officeName);
      Store.save();
      this.renderOfficeIdentity();
      this.renderMonitoring();
      if (!await Store.flush()) return;
      this.closeOfficeSetup();
      this.toast('Identidade do escritório salva com sucesso!', 'success');
    },
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
    renderDashboard() {
      this.renderOfficeIdentity();
      this.renderMetrics();
      this.renderDashboardTasks();
      this.renderDashboardWidgets();
    },
    renderMetrics() {
      const untreatedIntimations = getPublicationsFeature().getUntreatedCount();
      const deadlines = Store.state.tasks.filter(task => !TERMINAL_STATUSES.includes(task.status) && daysUntil(task.deadline) >= 0 && daysUntil(task.deadline) <= 7).length;
      const activeProcesses = (Store.state.processes || []).filter(process => process.monitoring !== 'inactive').length;
      const activeSources = Store.state.sources.filter(source => source.status === 'ok').length;
      const mInbox = document.getElementById('metricInbox');
      const mDead = document.getElementById('metricDeadlines');
      const mTasks = document.getElementById('metricTasks');
      const mSources = document.getElementById('metricSources');
      const inBadge = document.getElementById('inboxBadge');
      const notifDot = document.getElementById('notificationDot');
      if (mInbox) mInbox.textContent = untreatedIntimations;
      if (mDead) mDead.textContent = deadlines;
      if (mTasks) mTasks.textContent = activeProcesses;
      if (mSources) mSources.textContent = `${activeSources}/${Store.state.sources.length}`;
      if (inBadge) {
        inBadge.textContent = untreatedIntimations;
        inBadge.style.display = untreatedIntimations > 0 ? 'inline-block' : 'none';
      }
      if (notifDot) notifDot.style.display = untreatedIntimations ? '' : 'none';
      this.renderPublicationsMetrics();
    },
    renderPublicationsMetrics() {
      return getPublicationsFeature().renderMetrics();
    },
    renderDashboardTasks() {
      const listEl = document.getElementById('dashboardTaskList');
      if (!listEl) return;
      const filter = this.dashboardTaskFilter || 'all';
      const sort = this.dashboardTaskSort || 'date-asc';
      const tasks = Store.state.tasks || [];
      const processes = Store.state.processes || [];

      let filtered = tasks.filter(t => {
        if (TERMINAL_STATUSES.includes(t.status)) return false;
        if (filter === 'all') return true;
        const lower = String(t.title || '').toLowerCase() + ' ' + String(t.type || '').toLowerCase();
        if (filter === 'prazo') return lower.includes('prazo') || lower.includes('decisão') || lower.includes('recurso');
        if (filter === 'audiencia') return lower.includes('audiência') || lower.includes('audiencia') || lower.includes('julgamento');
        if (filter === 'tarefa') return !lower.includes('audiência') && !lower.includes('prazo');
        return true;
      });

      filtered.sort((a, b) => {
        const procA = processes.find(p => (a.process && p.number === a.process) || (a.client && p.client === a.client));
        const procB = processes.find(p => (b.process && p.number === b.process) || (b.client && p.client === b.client));
        const clientA = a.client || procA?.client || a.title || '';
        const clientB = b.client || procB?.client || b.title || '';
        const pointsA = Number(a.points) || 0;
        const pointsB = Number(b.points) || 0;

        if (sort === 'date-asc') {
          return (daysUntil(a.deadline) - daysUntil(b.deadline)) || (a.priority === 'urgente' ? -1 : 1);
        }
        if (sort === 'date-desc') {
          return (daysUntil(b.deadline) - daysUntil(a.deadline)) || (a.priority === 'urgente' ? -1 : 1);
        }
        if (sort === 'name-asc') {
          return clientA.localeCompare(clientB, 'pt-BR');
        }
        if (sort === 'difficulty-desc') {
          return (pointsB - pointsA) || (daysUntil(a.deadline) - daysUntil(b.deadline));
        }
        if (sort === 'difficulty-asc') {
          return (pointsA - pointsB) || (daysUntil(a.deadline) - daysUntil(b.deadline));
        }
        if (sort === 'priority') {
          const prioScore = (item) => (item.priority === 'urgente' ? 3 : item.priority === 'importante' ? 2 : 1);
          return (prioScore(b) - prioScore(a)) || (daysUntil(a.deadline) - daysUntil(b.deadline));
        }
        return (daysUntil(a.deadline) - daysUntil(b.deadline));
      });

      const countEl = document.getElementById('dashboardTaskCount');
      if (countEl) countEl.textContent = `${filtered.length} tarefas`;

      if (!filtered.length) {
        listEl.innerHTML = '<div class="empty-column" style="padding:24px;text-align:center;"><p>✓ Nenhuma tarefa pendente neste filtro.</p></div>';
        return;
      }

      listEl.innerHTML = filtered.map(task => {
        const proc = processes.find(p => (task.process && p.number === task.process) || (task.client && p.client === task.client));
        const clientName = task.client || proc?.client || 'Atividade interna';
        const processNum = task.process || proc?.number || '';
        const courtName = proc?.court || proc?.county || task.court || '';
        const points = Number(task.points) || 0;

        const titleLower = String(task.title || '').toLowerCase();
        let typeBadge = 'tarefa';
        let typeLabel = 'Tarefa';
        if (titleLower.includes('prazo') || titleLower.includes('recurso') || titleLower.includes('decisão')) {
          typeBadge = 'prazo';
          typeLabel = 'Prazo';
        } else if (titleLower.includes('audiência') || titleLower.includes('audiencia') || titleLower.includes('julgamento')) {
          typeBadge = 'audiencia';
          typeLabel = 'Audiência';
        } else if (titleLower.includes('reunião') || titleLower.includes('reuniao') || titleLower.includes('atendimento')) {
          typeBadge = 'reuniao';
          typeLabel = 'Reunião';
        }

        const days = daysUntil(task.deadline);
        const dateFormatted = task.deadline ? formatDate(task.deadline) : 'Sem data';
        const dateClass = days < 0 ? 'style="color:var(--danger);font-weight:700;"' : days <= 2 ? 'style="color:var(--warning);font-weight:700;"' : '';

        const difficultyText = points >= 50 ? 'Alta Complexidade' : points >= 20 ? 'Média' : points > 0 ? 'Básica' : '';

        return `
          <div class="dashboard-task-item" data-dashboard-task-id="${escapeHtml(task.id)}">
            <input type="checkbox" class="dashboard-task-check" data-complete-task-id="${escapeHtml(task.id)}" title="Concluir tarefa">
            <div class="dashboard-task-body">
              <div class="dashboard-task-title">${escapeHtml(task.title)}</div>
              <div class="dashboard-task-process" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:4px 0 6px 0;font-size:12px;">
                <strong>👤 ${escapeHtml(clientName)}</strong>
                ${processNum ? `<span style="color:var(--muted)">· 📁 <b>${escapeHtml(processNum)}</b></span>` : ''}
                ${courtName ? `<span style="color:var(--muted)">· ⚖️ <em>${escapeHtml(courtName)}</em></span>` : ''}
              </div>
              <div class="dashboard-task-tags">
                <span class="task-tag ${typeBadge}">${typeLabel}</span>
                ${task.responsible ? `<span class="task-tag user">👤 ${escapeHtml(task.responsible)}</span>` : ''}
                ${points ? `<span class="task-tag points" style="background:rgba(212,175,55,0.15);color:var(--gold);font-weight:600;">⚡ ${points} pts${difficultyText ? ` (${difficultyText})` : ''}</span>` : ''}
                ${task.priority === 'urgente' ? `<span class="task-tag" style="background:rgba(239,68,68,0.15);color:var(--danger);font-weight:700;">URGENTE</span>` : ''}
              </div>
            </div>
            <div class="dashboard-task-date" ${dateClass}>${dateFormatted}</div>
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('[data-dashboard-task-id]').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('[data-complete-task-id]')) return;
          const task = Store.state.tasks.find(t => t.id === item.dataset.dashboardTaskId);
          if (task) this.openTaskModal(task);
        });
      });

      listEl.querySelectorAll('[data-complete-task-id]').forEach(chk => {
        chk.addEventListener('change', async (e) => {
          e.stopPropagation();
          const task = await getTasksFeature().completeTask(chk.dataset.completeTaskId);
          if (task) {
            this.renderAll();
            this.toast('Tarefa concluída com sucesso!', 'success');
          }
        });
      });
    },
    renderDashboardWidgets() {
      const tasks = Store.state.tasks || [];
      const completed = tasks.filter(t => TERMINAL_STATUSES.includes(t.status)).length;
      const late = tasks.filter(t => !TERMINAL_STATUSES.includes(t.status) && daysUntil(t.deadline) < 0).length;
      const pending = tasks.filter(t => !TERMINAL_STATUSES.includes(t.status) && daysUntil(t.deadline) >= 0).length;

      const compEl = document.getElementById('widgetCompletedTasks');
      const lateEl = document.getElementById('widgetLateTasks');
      const pendEl = document.getElementById('widgetPendingTasks');
      if (compEl) compEl.textContent = completed;
      if (lateEl) lateEl.textContent = late;
      if (pendEl) pendEl.textContent = pending;

      const processes = Store.state.processes || [];
      const procActive = processes.filter(p => !p.archived).length;
      const pActiveEl = document.getElementById('widgetProcActive');
      const pInactiveEl = document.getElementById('widgetProcInactive');
      if (pActiveEl) pActiveEl.textContent = procActive;
      if (pInactiveEl) pInactiveEl.textContent = Math.max(0, processes.length - procActive);

      const leads = Store.state.leads || [];
      const activeLeads = leads.filter(l => l.status !== 'fechado' && l.status !== 'declinado').length;
      const lEl = document.getElementById('widgetActiveLeads');
      if (lEl) lEl.textContent = activeLeads;

      let totalHonorariosAFaturar = 0;
      processes.forEach(p => {
        const isPaid = p.feeStatus === 'pago' || p.feeStatus === 'quitado' || p.feeStatus === 'repassado' || p.requisitionStatus === 'repassado' || p.requisitionStatus === 'pago';
        if (isPaid) return;

        if (p.feeType === 'fixo' && p.feeAmount) {
          totalHonorariosAFaturar += Number(p.feeAmount);
        } else if (p.feeType === 'mensal' && p.feeMonthly) {
          totalHonorariosAFaturar += Number(p.feeMonthly);
        } else if (p.feeType === 'misto') {
          if (p.feeAmount) totalHonorariosAFaturar += Number(p.feeAmount);
          if (p.feeMonthly) totalHonorariosAFaturar += Number(p.feeMonthly);
        } else if (p.feePercentage) {
          const feePct = Number(p.feePercentage);
          const baseValue = Number(p.requisitionAmount ?? p.rpvAmount ?? p.economicValue ?? 0);
          if (baseValue > 0) {
            totalHonorariosAFaturar += (baseValue * feePct / 100);
          } else if (p.feeAmount) {
            totalHonorariosAFaturar += Number(p.feeAmount);
          }
        } else if (p.feeAmount) {
          totalHonorariosAFaturar += Number(p.feeAmount);
        }
      });
      const honEl = document.getElementById('widgetHonorariosPending');
      if (honEl) honEl.textContent = formatCurrency(totalHonorariosAFaturar);

      const thirtyDaysAgo = Date.now() - 30 * 86400000;
      let totalMinutes30d = 0;
      tasks.forEach(t => {
        if (Array.isArray(t.timeLogs)) {
          t.timeLogs.forEach(log => {
            const logTime = new Date(log.date || log.at || log.createdAt || 0).getTime();
            if (!log.date || logTime >= thirtyDaysAgo) {
              totalMinutes30d += Number(log.minutes || 0);
            }
          });
        }
      });
      const tsEl = document.getElementById('widgetTimesheetHours');
      if (tsEl) tsEl.textContent = formatMinutes(totalMinutes30d) || '0h 0m';

      const docCountEl = document.getElementById('widgetDocsCount');
      if (docCountEl) docCountEl.textContent = Store.state.customDocs?.length || 5;

      const remindersEl = document.getElementById('dashboardRemindersList');
      if (remindersEl) {
        const agenda = Store.state.agenda || [];
        const upcomingAgenda = agenda.slice(0, 4);
        if (!upcomingAgenda.length) {
          remindersEl.innerHTML = '<div class="empty-column" style="padding:8px;"><small style="color:var(--muted);">Nenhum lembrete imediato.</small></div>';
        } else {
          remindersEl.innerHTML = upcomingAgenda.map(item => `
            <div class="dashboard-reminder-item" data-agenda-id="${escapeHtml(item.id)}" style="cursor:pointer;">
              <span class="dashboard-reminder-date">${formatDate(item.date)}</span>
              <div><strong>${escapeHtml(item.title)}</strong><small style="display:block;color:var(--muted);">${escapeHtml(item.client || item.process || 'Compromisso')}</small></div>
            </div>
          `).join('');
          remindersEl.querySelectorAll('[data-agenda-id]').forEach(el => {
            el.addEventListener('click', () => {
              const ev = Store.state.agenda.find(a => a.id === el.dataset.agendaId);
              if (ev) this.openAgendaModal(ev);
            });
          });
        }
      }
    },
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
    renderAudit(filter = 'all', query = '') {
      const list = document.getElementById('auditList');
      const badge = document.getElementById('auditCountBadge');
      if (!list) return;

      this.auditFilter = filter || this.auditFilter || 'all';
      this.auditQuery = query !== undefined ? query : (this.auditQuery || '');

      let events = Store.state.audit || [];
      const q = String(this.auditQuery || '').toLowerCase().trim();
      if (q) {
        events = events.filter(e => String(e.action || '').toLowerCase().includes(q) || String(e.detail || '').toLowerCase().includes(q) || String(e.actor || '').toLowerCase().includes(q));
      }
      if (this.auditFilter && this.auditFilter !== 'all') {
        events = events.filter(e => {
          const a = String(e.action || '').toLowerCase();
          const d = String(e.detail || '').toLowerCase();
          if (this.auditFilter === 'security') return a.includes('auth') || a.includes('login') || a.includes('senha') || a.includes('2fa') || a.includes('totp') || a.includes('chave') || a.includes('sessão');
          if (this.auditFilter === 'sync') return a.includes('sincroniz') || a.includes('colet') || a.includes('djen') || a.includes('datajud') || a.includes('import');
          if (this.auditFilter === 'task') return a.includes('tarefa') || a.includes('prazo') || a.includes('kanban');
          if (this.auditFilter === 'process') return a.includes('processo') || a.includes('caso') || a.includes('cliente');
          return true;
        });
      }

      if (badge) badge.textContent = `${events.length} evento${events.length === 1 ? '' : 's'}`;

      if (!events.length) {
        list.innerHTML = `<div class="empty-detail" style="padding:32px 16px;text-align:center;"><span>✦</span><h3>Nenhum evento registrado</h3><p>Não há eventos de auditoria para os filtros selecionados.</p></div>`;
        return;
      }

      list.innerHTML = `
        <div class="responsive-table">
          <table class="sortable-table">
            <thead>
              <tr>
                <th style="width:170px;">Data e Hora</th>
                <th style="width:140px;">Usuário / Agente</th>
                <th>Ação Executada</th>
                <th>Detalhes do Evento</th>
                <th style="width:100px;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${events.map(item => `
                <tr>
                  <td><time style="font-size:12px;color:var(--muted);">${formatDateTime(item.at)}</time></td>
                  <td><strong style="font-size:12.5px;">${escapeHtml(item.actor || 'Sistema')}</strong></td>
                  <td><span class="gold-pill" style="font-size:11px;">${escapeHtml(item.action)}</span></td>
                  <td><span style="font-size:12.5px;color:var(--text);">${escapeHtml(item.detail || '')}</span></td>
                  <td><span class="status-chip connected" style="font-size:10.5px;">Registrado</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
    },
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
    renderLinks() {
      const customLinks = Store.state.customLinks || [];
      const section = document.getElementById('customLinksSection');
      const grid = document.getElementById('customLinksGrid');
      if (!section || !grid) return;

      if (!customLinks.length) {
        section.classList.add('hidden');
        grid.innerHTML = '';
        return;
      }

      section.classList.remove('hidden');
      grid.innerHTML = customLinks.map(link => {
        const safeUrl = normalizeExternalUrl(link.url);
        let domain = '';
        try { domain = new URL(safeUrl).hostname.replace(/^www\./, ''); } catch { domain = 'Endereço inválido'; }
        return `
          <div class="link-card card custom-link-card">
            <div class="link-card-header">
              <div class="link-badge">${escapeHtml(link.category || 'Link Personalizado')}</div>
              <div class="link-card-top-actions">
                <a href="${escapeHtml(safeUrl || '#')}" target="_blank" rel="noopener noreferrer" class="external-icon" title="Abrir link">↗</a>
                <button type="button" class="btn-delete-link" data-delete-link="${escapeHtml(link.id)}" title="Excluir este link">×</button>
              </div>
            </div>
            <h4>${escapeHtml(link.title)}</h4>
            <p>${escapeHtml(link.description || 'Link personalizado adicionado ao escritório.')}</p>
            <div class="link-card-meta">
              <span class="link-domain">${escapeHtml(domain)}</span>
              <a href="${escapeHtml(safeUrl || '#')}" target="_blank" rel="noopener noreferrer" class="link-tag">Acessar</a>
            </div>
          </div>
        `;
      }).join('');
    },
    openNewPromptModal(defaults = {}) { return getPromptsFeature().openNewPromptModal(defaults); },
    openNewLinkModal(defaults = {}) {
      this.openModal('link', defaults.id ? 'Editar link útil' : 'Adicionar novo link útil', 'Acesso rápido oficial', [
        { name: 'title', label: 'Nome / Título da referência', required: true, full: true, placeholder: 'Ex: Código de Trânsito Brasileiro (CTB)', value: defaults.title || '' },
        { name: 'url', label: 'Endereço Web (URL)', required: true, full: true, placeholder: 'Ex: https://www.planalto.gov.br/ccivil_03/leis/l9503compilado.htm', value: defaults.url || '' },
        { name: 'category', label: 'Categoria', type: 'select', options: [{value:'Legislação',label:'Legislação & Códigos'},{value:'Jurisprudência',label:'Jurisprudência & Tribunais'},{value:'Ferramentas IA',label:'Ferramentas com IA'},{value:'Órgãos Públicos',label:'Órgãos Públicos / Cartórios'},{value:'Outros',label:'Outros Links'}], value: defaults.category || 'Legislação' },
        { name: 'description', label: 'Descrição / O que é este link', type: 'textarea', full: true, placeholder: 'Ex: Lei Federal nº 9.503/1997 compilada com todas as normas de trânsito.', value: defaults.description || '' }
      ], defaults);
    },
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
        const isEditing = Boolean(this.modalMode.defaults.id);
        const normalizedUrl = normalizeExternalUrl(data.url);
        if (!normalizedUrl) { this.toast('Informe um endereço HTTP ou HTTPS válido.', 'error'); return; }
        const record = {
          id: this.modalMode.defaults.id || uid('link'),
          title: data.title || 'Link sem título',
          url: normalizedUrl,
          category: data.category || 'Legislação',
          description: data.description || '',
          createdAt: this.modalMode.defaults.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        Store.state.customLinks = Store.state.customLinks || [];
        const idx = Store.state.customLinks.findIndex(l => l.id === record.id);
        if (idx >= 0) Store.state.customLinks[idx] = record;
        else Store.state.customLinks.unshift(record);
        Store.audit(isEditing ? 'Link útil atualizado' : 'Link útil adicionado', record.title);
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
        if (!silent) this.toast('Sincronização concluída com sucesso.', 'success');
      } catch (error) {
        if (!silent) this.toast(error.message || 'Não foi possível sincronizar.', 'error');
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
    App.toast(event.detail?.message || 'Os dados foram atualizados em outra aba. Recarregando a versão mais recente…', 'error');
  });
  window.addEventListener(ATRIUM_STORE_PERSISTENCE_ERROR_EVENT, event => {
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
