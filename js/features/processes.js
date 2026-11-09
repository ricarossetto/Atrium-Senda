import { Store, isoDate, uid } from '../core/store.js?v=3.0.0';
import { requestAuthUsers } from '../core/auth-users-request.js?v=3.0.0';
import { resolveMemberIdList, matchMemberByName } from '../core/task-assignees.js?v=3.0.0';
import { userInvolvedInProcess } from '../core/office-involvement.js?v=3.0.0';
import { isAvatarDataUrl } from '../core/member-avatar.js?v=3.0.0';
import { cleanCnj, formatCnj, isValidCnj, suggestCnjCorrection, describeCnj } from '../core/cnj.js?v=3.0.0';
import { createProcessesV2Presenter } from '../views/ui-v2/processes-presenter.js?v=3.0.0';
import { transitionPageContent, focusPageControl } from '../views/ui-v2/page-transition.js?v=3.0.0';
import { iconSvg } from '../views/ui-v2/icons.js?v=3.0.0';
import { buildLegalTimeline } from '../core/legal-timeline.js?v=3.0.0';
import { refreshProcessTriage, processTriageBadge } from '../core/process-triage.js?v=3.0.0';
import { getOfficeDirectory, officeDirectoryLoaded, refreshOfficeDirectory } from '../core/office-directory.js?v=3.0.0';
import { isOfficeScopeItem } from '../core/office-scope.js?v=3.0.0';
const plural = (count, singular, pluralForm) => `${count} ${Number(count) === 1 ? singular : pluralForm}`;

export const PROCESS_PAGE_SIZES = Object.freeze([25, 100, 500, 1000]);
export const PROCESS_DEFAULT_PAGE_SIZE = 25;

function processTotalPages(total, size) {
  const safeSize = PROCESS_PAGE_SIZES.includes(size) ? size : PROCESS_DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.ceil((Number(total) || 0) / safeSize));
}

function ensureCnjHint(documentRef, field) {
  if (!documentRef || !field) return null;

  const container = field.closest?.('.field') || field.parentElement;
  if (!container) return null;
  let hint = container.querySelector('[data-cnj-hint]');
  if (!hint) {
    hint = documentRef.createElement('small');
    hint.className = 'field-note';
    hint.dataset.cnjHint = '';
    hint.setAttribute('role', 'status');
    hint.setAttribute('aria-live', 'polite');
    container.appendChild(hint);
  }
  return hint;
}

export function createProcessesFeature({
  store = Store,
  documentRef = globalThis.document,
  normalizeText,
  escapeHtml,
  formatDate,
  formatMinutes,
  totalTimeMinutes,
  sortRecords,
  updateTableSortHeaders,
  openModal,
  showToast,
  secureFetch,
  getLinkedTasks,
  getLinkedIntimations,
  isTerminalStatus,
  openOwnerDocuments,
  openClient,
  openLinkedTasks,
  openTask,
  openPublication,
  openAgenda,
  openFinancial,
  openAssistant,
  exportJson,
  onSyncEproc,
  confirmProcessDeletion = number => globalThis.prompt?.(`Para excluir o processo ${number}, digite o número completo:`) || '',
  requestProcessReenable = () => globalThis.prompt?.('Digite o número CNJ cuja descoberta automática deve ser reativada:') || ''
} = {}) {
  let initialized = false;
  const sort = { field: 'registeredAt', direction: 'desc' };
  const byId = id => documentRef?.getElementById(id);
  const isV2 = () => documentRef?.documentElement?.dataset?.ui === 'v2';
  let processesPresenter;
  let pendingTjrsDraft = null;
  let pendingTjrsAppliedFields = new Map();
  let pendingAccessKeyProcess = null;
  const processAccessKeys = new Map();
  let currentPage = 1;
  let pageSize = PROCESS_DEFAULT_PAGE_SIZE;
  let lastFilteredTotal = 0;
  // Filtro organizacional "apenas meus processos": apresentação, não fronteira.
  const isProcessMineOnlyActive = () => {
    try {
      const stored = globalThis.localStorage?.getItem('atrium:processes:mineOnly');
      if (stored === '1') return true;
      if (stored === '0') return false;
    } catch { /* armazenamento indisponível: usa o padrão por papel */ }
    return globalThis.KellerAuth?.currentUser?.role === 'collaborator';
  };
  const resolveProcessMe = () => {
    const currentUser = globalThis.KellerAuth?.currentUser || {};
    return matchMemberByName(teamDirectory, currentUser.username)
      || matchMemberByName(teamDirectory, currentUser.displayName)
      || { username: currentUser.username, displayName: currentUser.displayName, email: currentUser.email };
  };
  // Diretório de integrantes para responsáveis do processo (espelho do de tarefas).
  let teamDirectory = [];
  let teamDirectoryAt = 0;
  const refreshTeamDirectory = async (force = false) => {
    if (!force && Date.now() - teamDirectoryAt < 60000 && teamDirectory.length) return teamDirectory;
    try {
      const fetchFn = globalThis.KellerAuth?.secureFetch || secureFetch || globalThis.fetch;
      const response = await requestAuthUsers(fetchFn, { force });
      if (!response?.ok) return teamDirectory;
      const data = await response.json();
      const users = Array.isArray(data?.users) ? data.users : [];
      teamDirectory = users.filter(user => user && user.status !== 'inactive');
      teamDirectoryAt = Date.now();
    } catch {
      // Mantém o último diretório conhecido; nomes avulsos seguem válidos.
    }
    return teamDirectory;
  };
  const memberOptions = () => teamDirectory.map(member => ({
    id: String(member.id || member.username || ''),
    value: String(member.displayName || member.username || ''),
    label: [member.role === 'admin' ? 'Administrador' : member.role === 'master_admin' ? 'Mestre' : 'Colaborador', member.email].filter(Boolean).join(' · '),
    avatar: isAvatarDataUrl(member.avatar) ? member.avatar : ''
  })).filter(option => option.id && option.value);

  const getPresenter = () => {
    processesPresenter ||= createProcessesV2Presenter({
      documentRef,
      escapeHtml,
      formatDate,
      formatMinutes,
      getHasA1Certificate: () => store.state?.settings?.hasA1Certificate !== false,
      getTriage: item => processTriageBadge(item?.id),
      onEdit: item => feature.openProcessModal(item),
      onConsult: (button, item) => feature.consultTjrs(button, item),
      onRefreshWithCertificate: (button, item) => feature.refreshWithCertificate(button, item),
      onDownloadAutos: (button, item) => feature.downloadAutos(button, item),
      onDownloadEprocA1: (button, item) => feature.downloadEprocA1(button, item),
      onDocuments: (item, documentId) => openOwnerDocuments?.('process', item.id, documentId),
      onPreviewDocument: async doc => {
        if (!doc?.id) throw new Error('Documento inválido');
        const secureFetchFn = globalThis.KellerAuth?.secureFetch || globalThis.fetch;
        const response = await secureFetchFn(`/api/documents/${encodeURIComponent(doc.id)}/preview`, {
          headers: { Accept: 'text/plain,image/png,image/jpeg,image/webp' }
        });
        if (!response.ok) throw new Error('Não foi possível carregar a visualização deste documento.');
        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (contentType.startsWith('image/')) {
          const buffer = await response.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
          }
          return { type: 'image', src: `data:${contentType.split(';')[0]};base64,${globalThis.btoa(binary)}` };
        } else {
          const text = await response.text();
          return { type: 'text', text };
        }
      },
      onDownloadDocument: async doc => {
        const docId = doc?.id;
        if (!docId) return;
        const name = doc?.name || doc?.originalName || 'documento.pdf';
        const secureFetchFn = globalThis.KellerAuth?.secureFetch || globalThis.fetch;
        const response = await secureFetchFn(`/api/documents/${encodeURIComponent(docId)}/content`, {
          headers: { Accept: 'application/octet-stream' }
        });
        if (!response.ok) throw new Error('Falha ao baixar arquivo.');
        const blob = await response.blob();
        const url = globalThis.URL.createObjectURL(blob);
        const a = documentRef.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        globalThis.URL.revokeObjectURL(url);
      },
      onClient: item => openClient?.(item),
      onTasks: item => openLinkedTasks?.(item),
      onTask: task => openTask?.(task),
      onPublication: publication => openPublication?.(publication),
      onAgenda: event => {
        const appointment = (store.state.agenda || []).find(item => String(item.id) === String(event?.entityId || ''));
        if (appointment) openAgenda?.(appointment);
      },
      onFinancial: item => openFinancial?.(item),
      onAssistant: item => openAssistant?.(item),
      onAccessKey: item => feature.openAccessKeyDialog(item),
      onAccessKeyStatus: item => feature.refreshAccessKeyStatus(item),
      onCreateTask: item => {
        const linkedContact = (store.state.contacts || []).find(contact => String(contact.id) === String(item.contactId || ''))
          || (store.state.contacts || []).find(contact => normalizeText(contact.name) === normalizeText(item.client));
        openTask?.({
          processId: item.id || '',
          process: item.number || item.protocol || '',
          contactId: linkedContact?.id || item.contactId || '',
          client: linkedContact?.name || item.client || '',
          actionType: item.actionType || item.subject || '',
          source: 'Interna'
        });
      },
      onCreateMovement: item => feature.openMovementModal(item),
      onExport: item => feature.exportProcess(item),
      onDelete: item => feature.deleteProcess(item)
    });
    return processesPresenter;
  };

  // Índice O(n) por render para resolver o cliente do processo sem varrer
  // os contatos por linha: mesma semântica do resolve anterior (=== estrito
  // no id, papel cliente, vínculo único por número normalizado).
  function buildContactLookup(contacts) {
    const byId = new Map();
    const byNumber = new Map();
    const idKeyOf = value => (value === undefined || value === null || value === '' ? null : value);
    for (const contact of contacts || []) {
      if (!contact || contact.contactRole !== 'cliente') continue;
      const id = idKeyOf(contact.id);
      if (id !== null && !byId.has(id)) byId.set(id, contact);
      for (const value of contact.relatedProcessNumbers || []) {
        const digits = String(value || '').replace(/\D/g, '');
        if (!digits) continue;
        const bucket = byNumber.get(digits);
        if (!bucket) byNumber.set(digits, [contact]);
        else if (bucket.length < 2) bucket.push(contact);
      }
    }
    return { byId, byNumber };
  }

  function resolveClientWithLookup(process, lookup) {
    if (meaningful(process?.client)) return String(process.client).trim();
    if (process?.contactId) {
      const linked = lookup.byId.get(process.contactId);
      if (linked?.name) return linked.name;
    }
    const number = String(process?.number || process?.protocol || '').replace(/\D/g, '');
    if (!number) return '';
    const bucket = lookup.byNumber.get(number);
    if (bucket && bucket.length === 1) return String(bucket[0].name || '').trim();
    return '';
  }

  const canConsultTjrs = item => String(item.number || '').includes('.8.21.') || String(item.court || '').toUpperCase().includes('TJRS');

  const getProcessSummary = item => {
    const processNumber = String(item?.number || item?.protocol || '').trim();
    const directLinks = records => (records || []).filter(record => String(record?.processId || '') === String(item?.id || ''));
    const ownerLinks = records => (records || []).filter(record => record?.ownerType === 'process' && String(record?.ownerId || '') === String(item?.id || ''));
    const numberLinks = records => (records || []).filter(record => processNumber && String(record?.process || record?.processNumber || '').trim() === processNumber);
    const uniqueLinks = records => [...new Map(records.filter(Boolean).map(record => [String(record.id || ''), record])).values()];
    const linkedTasks = item?.id ? uniqueLinks([...(getLinkedTasks?.(processNumber) || []), ...directLinks(store.state.tasks)]) : [];
    const linkedIntimations = item?.id ? uniqueLinks([...(getLinkedIntimations?.(processNumber) || []), ...directLinks(store.state.intimations)]) : [];
    const linkedAppointments = item?.id ? uniqueLinks([...directLinks(store.state.agenda), ...numberLinks(store.state.agenda)]) : [];
    const linkedDocuments = item?.id ? uniqueLinks([...ownerLinks(store.state.documents), ...directLinks(store.state.documents), ...numberLinks(store.state.documents)]).filter(record => !record.deletedAt) : [];
    const openTasks = linkedTasks.filter(task => !isTerminalStatus(task.status));
    const timeMinutes = linkedTasks.reduce((total, task) => total + totalTimeMinutes(task.timeLogs), 0);
    const nextDeadline = openTasks.map(task => task.fatalDeadline || task.deadline).filter(Boolean).sort()[0];
    const responsibleMembers = (Array.isArray(item?.responsibleUserIds) ? item.responsibleUserIds : [])
      .map(id => teamDirectory.find(member => String(member.id || member.username || '') === String(id)))
      .filter(Boolean);
    const officeDirectory = getOfficeDirectory();
    return Object.freeze({
      processNumber,
      access: {
        teams: officeDirectory.teams || [],
        members: officeDirectory.users || [],
        canAssign: Boolean(globalThis.KellerAuth?.currentUser?.permissions?.includes('processes.assign') || globalThis.KellerAuth?.currentUser?.permissions?.includes('office.manage'))
      },
      openTasks: openTasks.length,
      linkedIntimations: linkedIntimations.length,
      timeMinutes,
      nextDeadline,
      responsibleMembers,
      linkedTasks,
      linkedIntimationRecords: linkedIntimations,
      linkedAppointments,
      linkedDocuments,
      movements: Array.isArray(item.movements) ? item.movements : [],
      timeline: buildLegalTimeline(store.state, item, { order: 'autos' }),
      canConsultTjrs: canConsultTjrs(item)
    });
  };

  const feature = {
    init() {
      if (initialized) return false;
      initialized = true;
      byId('newProcessButton')?.addEventListener('click', () => this.openProcessModal());
      byId('btnSyncEprocA1')?.addEventListener('click', async () => {
        if (typeof onSyncEproc === 'function') {
          const btn = byId('btnSyncEprocA1');
          btn?.classList.add('is-syncing');
          btn?.setAttribute?.('aria-busy', 'true');
          try {
            await onSyncEproc({ silent: false });
          } finally {
            btn?.classList.remove('is-syncing');
            btn?.removeAttribute?.('aria-busy');
          }
        } else {
          this.syncEprocA1();
        }
      });
      byId('eprocSyncModalClose')?.addEventListener('click', () => this.closeSyncModal());
      byId('eprocSyncModalMinimize')?.addEventListener('click', () => this.closeSyncModal());
      byId('eprocSyncModalDone')?.addEventListener('click', () => this.closeSyncModal());
      byId('eprocSyncModalConfigLink')?.addEventListener('click', () => {
        this.closeSyncModal();
        if (typeof globalThis.location !== 'undefined') {
          globalThis.location.hash = '#configuration';
        }
      });
      byId('eprocSyncModalBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('eprocSyncModalBackdrop')) this.closeSyncModal();
      });
      byId('eprocSyncModalBackdrop')?.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        this.closeSyncModal();
      });
      byId('processSearch')?.addEventListener('input', event => this.render(event.target.value, { resetPage: true }));
      const mineOnlyBox = byId('processMineOnly');
      if (mineOnlyBox) {
        mineOnlyBox.checked = isProcessMineOnlyActive();
        mineOnlyBox.addEventListener('change', event => {
          try { globalThis.localStorage?.setItem('atrium:processes:mineOnly', event.target.checked ? '1' : '0'); } catch { /* preferência de apresentação */ }
          this.render(byId('processSearch')?.value || '', { resetPage: true });
        });
      }
      byId('view-processes')?.addEventListener('click', event => this.handlePaginationClick(event));
      byId('processSuppressionButton')?.addEventListener('click', () => this.reenableProcessDiscovery());
      byId('processAccessKeyCancel')?.addEventListener('click', () => this.closeAccessKeyDialog());
      byId('processAccessKeyClose')?.addEventListener('click', () => this.closeAccessKeyDialog());
      byId('processAccessKeyBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('processAccessKeyBackdrop')) this.closeAccessKeyDialog();
      });
      byId('processAccessKeyBackdrop')?.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        this.closeAccessKeyDialog();
      });
      byId('processAccessKeyForm')?.addEventListener('submit', event => this.saveAccessKey(event));
      getPresenter().init();
      void this.refreshProcessTriageSuggestions();
      return true;
    },

    /**
     * Selos assistivos do processo (tipo de andamento e lacunas de cadastro). Somente
     * leitura do derivado: nada é gravado, criado ou alterado no processo.
     */
    async refreshProcessTriageSuggestions() {
      await refreshProcessTriage();
      this.render(byId('processSearch')?.value || '');
      return true;
    },

    handleSort(field) {
      if (sort.field === field) {
        sort.direction = sort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        sort.field = field;
        sort.direction = field.includes('At') || field.includes('date') ? 'desc' : 'asc';
      }
      this.render(byId('processSearch')?.value || '', { resetPage: true });
      return { ...sort };
    },

    get page() { return currentPage; },
    get pageSize() { return pageSize; },
    get pagination() {
      return {
        page: currentPage,
        pageSize,
        total: lastFilteredTotal,
        totalPages: processTotalPages(lastFilteredTotal, pageSize)
      };
    },

    setPageSize(value) {
      const size = Number(value);
      if (!PROCESS_PAGE_SIZES.includes(size) || size === pageSize) return pageSize;
      pageSize = size;
      currentPage = 1;
      this.render(byId('processSearch')?.value || '');
      return pageSize;
    },

    setPage(value) {
      const pages = processTotalPages(lastFilteredTotal, pageSize);
      let next = currentPage;
      if (value === 'first') next = 1;
      else if (value === 'prev') next = currentPage - 1;
      else if (value === 'next') next = currentPage + 1;
      else if (value === 'last') next = pages;
      else if (Number.isFinite(Number(value))) next = Math.trunc(Number(value));
      currentPage = Math.max(1, Math.min(pages, next || 1));
      this.render(byId('processSearch')?.value || '');
      return currentPage;
    },

    upsertExternalProcess(record) {
      const incoming = safeExternalRecord(record);
      const identity = processIdentity(incoming);
      if (!identity) return null;
      if (isProcessSuppressed(store.state, incoming.number)) return null;
      store.state.processes = Array.isArray(store.state.processes) ? store.state.processes : [];
      const index = store.state.processes.findIndex(item => processIdentity(item) === identity);
      const merged = mergeExternalProcess(index >= 0 ? store.state.processes[index] : null, incoming);
      if (!merged.id) merged.id = incoming.id || uid('proc');
      if (index >= 0) store.state.processes[index] = merged;
      else store.state.processes.unshift(merged);
      return merged;
    },

    render(query = '', { resetPage = false } = {}) {
      if (resetPage) currentPage = 1;
      // Avatar do responsável: a lista pré-carrega o diretório; o clique no processo aguarda o cache.
      if (!teamDirectoryAt) void refreshTeamDirectory();
      if (!officeDirectoryLoaded()) void refreshOfficeDirectory().then(() => this.render());
      const needle = normalizeText(query);
      const allProcesses = Array.isArray(store.state.processes) ? store.state.processes : [];
      const suppressions = processSuppressions(store.state);
      const suppressionButton = byId('processSuppressionButton');
      if (suppressionButton) {
        suppressionButton.classList.toggle('hidden', suppressions.length === 0);
        suppressionButton.textContent = `Reativar descoberta (${suppressions.length})`;
      }
      const btnSyncEproc = byId('btnSyncEprocA1');
      if (btnSyncEproc) {
        const hasA1 = store.state?.settings?.hasA1Certificate !== false;
        btnSyncEproc.classList.toggle('hidden', !hasA1);
      }
      const contactLookup = buildContactLookup(Array.isArray(store.state.contacts) ? store.state.contacts : []);
      const mineOnlyActive = isProcessMineOnlyActive();
      const me = mineOnlyActive ? resolveProcessMe() : null;
      let records = allProcesses
        .map(item => ({ ...item, resolvedClient: resolveClientWithLookup(item, contactLookup) }))
        .filter(item => !needle || normalizeText(`${item.number} ${item.resolvedClient || item.client} ${item.court} ${item.county || ''} ${item.nb || ''} ${item.opposingParty || ''} ${item.registeredAt || item.createdAt || ''}`).includes(needle))
        .filter(item => !mineOnlyActive || !me || userInvolvedInProcess(item, me, getOfficeDirectory().teams || store.state.teams || []));
      records = sortRecords(records, sort);
      updateTableSortHeaders('processTable', sort);
      lastFilteredTotal = records.length;
      const totalPages = processTotalPages(records.length, pageSize);
      if (currentPage > totalPages) currentPage = totalPages;
      if (currentPage < 1) currentPage = 1;
      const start = (currentPage - 1) * pageSize;
      const pageRecords = records.slice(start, start + pageSize);
      const pagination = { page: currentPage, pageSize, total: records.length, totalPages };
      const presenter = getPresenter();
      if (isV2()) {
        presenter.close({ restoreFocus: false });
        presenter.updateCount({ visible: records.length, total: allProcesses.length, query: String(query || '').trim() });
        byId('processTableBody').innerHTML = records.length
          ? presenter.renderRows(pageRecords)
          : presenter.renderEmpty({ hasProcesses: allProcesses.length > 0, query: String(query || '').trim() });
      } else {
        presenter.close({ restoreFocus: false });
        byId('processTableBody').innerHTML = records.length ? pageRecords.map(item => {
        const registeredDate = item.registeredAt || item.createdAt;
        let feeBadge = '';
        if (item.feeAmount && Number(item.feeAmount) > 0) {
          feeBadge = `<span class="fee-chip fixo">Valor: R$ ${Number(item.feeAmount).toLocaleString('pt-BR')}</span>`;
        } else if (item.feePercentage && Number(item.feePercentage) > 0) {
          const feeStatusClass = ['quitado', 'repassado', 'em_dia'].includes(item.feeStatus) ? 'fee-status-paid' : item.feeStatus === 'pendente' ? 'fee-status-pending' : 'fee-status-waiting';
          feeBadge = `<span class="fee-chip ${escapeHtml(item.feeType || 'exito')}">${escapeHtml(item.feePercentage)}% êxito<span class="fee-status-badge ${feeStatusClass}">${escapeHtml(item.feeStatus || 'regular')}</span></span>`;
        } else if (item.feeType && item.feeType !== 'exito' && item.feeType !== 'none') {
          const feeStatusClass = ['quitado', 'repassado', 'em_dia'].includes(item.feeStatus) ? 'fee-status-paid' : item.feeStatus === 'pendente' ? 'fee-status-pending' : 'fee-status-waiting';
          feeBadge = `<span class="fee-chip ${escapeHtml(item.feeType)}">${escapeHtml(item.feeType.toUpperCase())}<span class="fee-status-badge ${feeStatusClass}">${escapeHtml(item.feeStatus || 'regular')}</span></span>`;
        }

        const nbChip = item.nb ? `<span class="nb-chip" title="Número do Benefício INSS">NB ${escapeHtml(item.nb)}</span>` : '';
        const riskChip = item.risk ? `<span class="risk-chip ${item.risk === 'remoto' ? 'remoto' : item.risk === 'possivel' ? 'possivel' : 'provavel'}" title="Probabilidade de Êxito">${item.risk === 'remoto' ? 'Risco Alto' : item.risk === 'possivel' ? 'Risco Médio' : 'Êxito Provável'}</span>` : '';
        const tjrsButton = canConsultTjrs(item) ? `<button type="button" class="btn-tjrs-consult" data-tjrs-consult="${escapeHtml(item.number)}" title="Atualizar o processo com os dados disponíveis no TJRS">${iconSvg('court')}Atualizar TJRS</button>` : '';

        const clientPosition = item.clientPosition ? `<small style="color:var(--gold-soft);">${escapeHtml(item.clientPosition)}</small> ` : '';
        const opposingParty = item.opposingParty ? `<small> vs ${escapeHtml(item.opposingParty)}</small>` : '';

        return `
        <tr data-process-id="${escapeHtml(item.id)}" tabindex="0">
          <td>
            <strong>${escapeHtml(item.number || item.protocol || 'Sem número')}</strong>
            <small>${item.secrecy ? 'Segredo de justiça' : 'Consulta pública'}${item.caseFolder ? ` · ${escapeHtml(item.caseFolder)}` : ''}</small>
            ${nbChip}
          </td>
          <td>
            ${clientPosition}<strong>${escapeHtml(item.client)}</strong>${opposingParty}
            ${feeBadge ? `<br>${feeBadge}` : ''}
          </td>
          <td>
            <strong>${escapeHtml(item.court || item.county || '—')}</strong>
            <small>${escapeHtml([...new Set([item.actionType, item.judicialPhase, item.stage].filter(Boolean))].join(' · '))}</small>
            <div>${riskChip}</div>
          </td>
          <td>
            <strong>${escapeHtml(formatDate(registeredDate))}</strong>
            <small>${escapeHtml(item.source || 'eproc / Cadastro')}</small>
            ${tjrsButton}
          </td>
          <td><strong>${escapeHtml(item.lastMovement || 'Sem movimentação')}</strong><small>${escapeHtml(formatDate(item.lastMovementAt))}</small></td>
          <td>${item.monitoring === 'active' ? '<span class="status-chip connected">Monitorando</span>' : '<span class="status-chip warning">Atenção</span>'}</td>
        </tr>`;
        }).join('') : '<tr><td colspan="6">Nenhum processo encontrado.</td></tr>';
      }

      byId('processTableBody')?.querySelector('[data-process-create]')?.addEventListener('click', () => this.openProcessModal());

      documentRef.querySelectorAll('#processTableBody [data-process-id]').forEach(row => row.addEventListener('click', async event => {
        if (event.target.closest('.btn-tjrs-consult, [data-tjrs-consult]')) return;
        const item = store.state.processes.find(record => record.id === row.dataset.processId);
        if (!item) return;
        if (isV2()) {
          await refreshTeamDirectory();
          if (!getOfficeDirectory().teams.length) await refreshOfficeDirectory();
          presenter.open(item, getProcessSummary(item), event.target.closest('[data-process-details]') || row);
          this.bindProcessAccessControls(item);
        } else this.openProcessModal(item);
      }));

      documentRef.querySelectorAll('#processTableBody [data-tjrs-consult]').forEach(button => {
        button.addEventListener('click', event => {
          event.stopPropagation();
          this.consultTjrs(button);
        });
      });
      this.renderPagination(pagination);
      return pageRecords;
    },

    renderPagination(pagination) {
      const table = byId('processTable');
      if (!table) return false;
      let container = byId('processPagination');
      if (!container) {
        container = documentRef.createElement?.('div');
        if (!container) return false;
        container.id = 'processPagination';
        container.className = 'process-pagination-slot';
        table.parentElement?.appendChild(container);
      }
      container.innerHTML = getPresenter().renderPagination({ pagination, escapeHtml });
      return true;
    },

    async handlePaginationClick(event) {
      const sizeTarget = event.target.closest?.('[data-process-page-size]');
      if (sizeTarget) {
        const size = Number(sizeTarget.dataset.processPageSize);
        if (!PROCESS_PAGE_SIZES.includes(size) || size === pageSize) return true;
        pageSize = size;
        currentPage = 1;
        this.render(byId('processSearch')?.value || '');
        queueMicrotask(() => {
          documentRef.querySelector?.(`#view-processes [data-process-page-size="${size}"]`)?.focus({ preventScroll: true });
        });
        return true;
      }
      const pageTarget = event.target.closest?.('[data-process-page]');
      if (!pageTarget) return false;
      const pages = processTotalPages(lastFilteredTotal, pageSize);
      const action = pageTarget.dataset.processPage;
      let next = currentPage;
      if (action === 'first') next = 1;
      else if (action === 'prev') next = currentPage - 1;
      else if (action === 'next') next = currentPage + 1;
      else if (action === 'last') next = pages;
      else if (Number.isFinite(Number(action))) next = Math.trunc(Number(action));
      next = Math.max(1, Math.min(pages, next || 1));
      if (next === currentPage) return true;
      const direction = Math.sign(next - currentPage);
      currentPage = next;
      await transitionPageContent(documentRef, { v2: '#processTableBody' }, direction,
        () => this.render(byId('processSearch')?.value || ''));
      focusPageControl(documentRef, '#view-processes', 'data-process-page', action, direction > 0 ? 'prev' : 'next');
      return true;
    },

    closeInspector(options) {
      return getPresenter().close(options);
    },

    exportProcess(item) {
      if (!isOfficeScopeItem(item)) {
        showToast?.('Exportação disponível apenas para processos do escopo do escritório.', 'warning');
        return null;
      }
      const dossier = buildProcessDossier(store.state, item);
      const digits = String(item?.number || item?.id || 'sem-numero').replace(/\D/g, '') || 'sem-numero';
      exportJson?.(dossier, `processo-${digits}.json`);
      item.dossierDownloadedAt = new Date().toISOString();
      store.save();
      const button = byId('processInspectorExport');
      if (button) {
        button.textContent = 'Dados exportados';
        button.classList.add('is-complete');
        button.title = 'Exportar novamente o backup técnico deste processo';
      }
      showToast?.('Backup técnico exportado em JSON. Ele serve para guardar ou transferir os dados do processo; os autos em PDF ficam em “Gerar caderno em PDFs”.', 'success');
      return dossier;
    },

    async refreshAccessKeyStatus(item) {
      const panel = byId('processInspectorContent')?.querySelector('[data-process-access-key-status]');
      const keyButton = byId('processInspectorAccessKey');
      if (!item?.number) return false;
      try {
        const response = await secureFetch(`/api/integrations/tjrs-sidecar/processes/access-key/status?processNumber=${encodeURIComponent(item.number)}`, { headers: { Accept: 'application/json' } });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(result.message || 'Status indisponível.');
        if (panel) {
          panel.dataset.processAccessKeyStatus = result.configured ? 'configured' : 'missing';
          panel.querySelector('[data-process-access-key-copy]').textContent = result.configured
            ? 'Chave cadastrada no cofre cifrado. Ela será usada automaticamente nas próximas consultas.'
            : 'Chave ausente. Cadastre-a para consultar processos restritos e manter o monitoramento completo.';
          panel.querySelector('[data-process-access-key]').textContent = result.configured ? 'Trocar chave' : 'Adicionar chave';
        }
        if (keyButton) {
          if (result.configured) {
            keyButton.textContent = 'Chave no cofre';
            keyButton.disabled = true;
            keyButton.classList.remove('is-available');
            keyButton.classList.add('is-configured', 'is-complete');
            keyButton.title = 'Chave de acesso do eproc já guardada no cofre cifrado para este processo.';
          } else {
            keyButton.textContent = 'Chave de acesso';
            keyButton.disabled = false;
            keyButton.classList.add('is-available');
            keyButton.classList.remove('is-configured', 'is-complete');
            keyButton.title = 'Adicionar chave de acesso para consulta restrita e autos.';
          }
        }
        return result.configured;
      } catch {
        if (panel) {
          panel.dataset.processAccessKeyStatus = 'unknown';
          panel.querySelector('[data-process-access-key-copy]').textContent = 'Não foi possível confirmar a chave no cofre do escritório.';
        }
        return false;
      }
    },

    openAccessKeyDialog(item, { reason = '' } = {}) {
      if (!item?.id || !item?.number) return false;
      pendingAccessKeyProcess = item;
      byId('processAccessKeyNumber').textContent = item.number;
      byId('processAccessKeyMessage').textContent = reason || 'Informe a chave exibida pelo eproc para liberar a consulta restrita deste processo.';
      byId('processAccessKeyInput').value = '';
      byId('processAccessKeyBackdrop').classList.remove('hidden');
      queueMicrotask(() => byId('processAccessKeyInput')?.focus());
      return true;
    },

    closeAccessKeyDialog() {
      byId('processAccessKeyBackdrop')?.classList.add('hidden');
      if (byId('processAccessKeyInput')) byId('processAccessKeyInput').value = '';
      pendingAccessKeyProcess = null;
      byId('processInspectorContent')?.querySelector('[data-process-access-key]')?.focus();
    },

    async saveAccessKey(event) {
      event?.preventDefault?.();
      const item = pendingAccessKeyProcess;
      const accessKey = cleanAccessKey(byId('processAccessKeyInput')?.value);
      if (!item || !accessKey) {
        showToast?.('Informe a chave de acesso do processo.', 'error');
        return false;
      }
      const submit = byId('processAccessKeySave');
      if (submit) { submit.disabled = true; submit.textContent = 'Validando…'; }
      try {
        const response = await secureFetch('/api/integrations/tjrs-sidecar/processes/access-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ processNumber: item.number, accessKey })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(result.message || 'Não foi possível guardar a chave.');
        processAccessKeys.delete(item.id);
        this.closeAccessKeyDialog();
        await this.refreshAccessKeyStatus(item);
        try {
          const syncResult = await this.refreshProcessViaEproc(item);
          this.render(byId('processSearch')?.value || '');
          const refreshed = store.state.processes.find(process => process.id === item.id);
          if (refreshed) getPresenter().open(refreshed, getProcessSummary(refreshed), null);
          showToast?.(syncResult.message ? `Chave validada e processo atualizado: ${syncResult.message}` : 'Chave validada e processo atualizado com os dados oficiais do eproc.', 'success');
        } catch (syncError) {
          showToast?.(`A chave foi validada e guardada. A atualização da ficha do processo ficou pendente: ${syncError.message}`, 'error');
        }
        return true;
      } catch (error) {
        showToast?.(error.message || 'Não foi possível guardar a chave.', 'error');
        return false;
      } finally {
        if (submit) { submit.disabled = false; submit.textContent = 'Validar e guardar chave'; }
      }
    },

    async deleteProcess(item) {
      const number = String(item?.number || item?.protocol || '').trim();
      if (!item?.id || !number) return false;
      const confirmation = String(await confirmProcessDeletion(number) || '').trim();
      if (confirmation !== number) {
        showToast?.('Exclusão cancelada: o número informado não confere.', 'error');
        return false;
      }
      const snapshot = snapshotProcessCollections(store.state);
      try {
        store.state.processes = (store.state.processes || []).filter(record => record.id !== item.id);
        unlinkProcessReferences(store.state, item);
        if (isExternallyDiscoveredProcess(item)) addProcessSuppression(store.state, item);
        store.audit('Processo excluído', `${number} · registros vinculados preservados e desvinculados`);
        if (!await store.flush()) throw new Error('Não foi possível persistir a exclusão do processo.');
        getPresenter().close({ restoreFocus: false });
        feature.render(byId('processSearch')?.value || '');
        showToast?.('Processo excluído. Registros vinculados foram preservados.', 'success');
        return true;
      } catch (error) {
        restoreProcessCollections(store.state, snapshot);
        feature.render(byId('processSearch')?.value || '');
        showToast?.(error.message || 'Não foi possível excluir o processo.', 'error');
        return false;
      }
    },

    async reenableProcessDiscovery(value) {
      const informed = String(value || await requestProcessReenable() || '').trim();
      const cnj = normalizeCnj(informed);
      const suppressions = processSuppressions(store.state);
      if (!cnj || !suppressions.some(item => normalizeCnj(item?.cnj || item) === cnj)) {
        showToast?.('Nenhuma supressão de descoberta foi localizada para esse número.', 'error');
        return false;
      }
      const previous = structuredClone(suppressions);
      store.state.settings ||= {};
      store.state.settings.processDiscoverySuppressions = suppressions.filter(item => normalizeCnj(item?.cnj || item) !== cnj);
      store.audit('Descoberta processual reativada', formatProcessNumber(cnj));
      if (!await store.flush()) {
        store.state.settings.processDiscoverySuppressions = previous;
        feature.render(byId('processSearch')?.value || '');
        showToast?.('Não foi possível persistir a reativação.', 'error');
        return false;
      }
      feature.render(byId('processSearch')?.value || '');
      showToast?.('Descoberta automática reativada para esse processo.', 'success');
      return true;
    },

    async consultTjrs(button, fallbackItem = null) {
      const processNumber = button?.dataset?.tjrsConsult || fallbackItem?.number;
      const cleanTarget = normalizeCnj(processNumber);
      const process = fallbackItem || store.state.processes.find(item => item.number === processNumber || (cleanTarget && normalizeCnj(item.number) === cleanTarget));
      if (!process?.id) {
        showToast?.('Processo local não encontrado para atualização.', 'error');
        return false;
      }

      const originalLabel = button?.textContent || 'Atualizar TJRS';
      const inspectorWasOpen = Boolean(byId('processInspectorBackdrop') && !byId('processInspectorBackdrop').classList.contains('hidden'));
      const isTjrs = normalizeCnj(processNumber).slice(13, 16) === '821';
      const hasA1 = store.state?.settings?.hasA1Certificate !== false;
      showToast?.(isTjrs ? `Buscando os dados mais recentes do processo ${processNumber} no TJRS…` : `Consultando fontes judiciais oficiais para ${processNumber}…`);
      if (button) {
        button.disabled = true;
        button.textContent = 'Atualizando…';
      }
      try {
        let result = null;

        // Se for processo TJRS e o escritório tiver Certificado A1 ativo, tenta enriquecimento oficial direto via A1 (revela segredo de justiça e chave)
        if (isTjrs && hasA1) {
          try {
            const enrichRes = await secureFetch('/api/integrations/eproc/processes/enrich-single', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ processId: process.id, processNumber: process.number, revision: store.revision })
            });
            const enrichData = await enrichRes.json().catch(() => ({}));
            if (enrichRes.ok && enrichData.ok && enrichData.process) {
              result = enrichData;
            }
          } catch (e1) {
            console.warn('[processes] Aviso consulta eproc A1 direta:', e1.message);
          }
        }

        // Se não usou A1 ou se a consulta A1 falhou, utiliza o coletor / sidecar local
        if (!result || !result.ok || !result.process) {
          const syncUrl = isTjrs ? '/api/integrations/tjrs-sidecar/processes/sync' : '/api/integrations/omni/processes/sync';
          const payload = { processId: process.id, processNumber, revision: store.revision };
          const accessKey = processAccessKeys.get(process.id) || '';
          if (isTjrs && accessKey) {
            payload.accessKey = accessKey;
            payload.chaveAcesso = accessKey;
          }
          const response = await secureFetch(syncUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const sidecarResult = await response.json().catch(() => ({}));
          if (response.ok && sidecarResult.ok && sidecarResult.process) {
            result = sidecarResult;
          } else if (!result) {
            result = sidecarResult;
          }
        }

        if (!result || !result.ok || !result.process) {
          if (isTjrs && result?.state === 'STALE') {
            this.openAccessKeyDialog(process, { reason: 'Este processo ainda não foi consultado pelo coletor. Informe a chave do eproc para fazer a primeira consulta ao TJRS.' });
          }
          showToast?.(result?.message || (isTjrs ? 'Não foi possível obter os dados deste processo no TJRS.' : 'Não foi possível sincronizar com as fontes judiciais.'), 'error');
          return false;
        }

        const index = store.state.processes.findIndex(item => item.id === process.id);
        if (index >= 0) store.state.processes[index] = result.process;
        store.revision = result.revision || store.revision;
        this.render(byId('processSearch')?.value || '');
        if (inspectorWasOpen && index >= 0) {
          const updated = store.state.processes[index];
          getPresenter().open(updated, getProcessSummary(updated), null);
        }
        showToast?.(result.message || (isTjrs ? 'Dados mais recentes do TJRS incorporados ao processo.' : 'Dados judiciais incorporados ao processo.'), 'success');
        return true;
      } catch (error) {
        showToast?.(isTjrs ? `Falha ao consultar o coletor TJRS local: ${error.message}` : `Falha ao consultar fontes judiciais: ${error.message}`, 'error');
        return false;
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = originalLabel;
        }
      }
    },

    async downloadAutos(button, item) {
      const process = item || store.state.processes.find(record => record.id === button?.dataset?.processId);
      if (!process?.id || !canConsultTjrs(process)) {
        showToast?.('Este recurso exige um processo TJRS cadastrado.', 'error');
        return false;
      }
      const originalLabel = button?.textContent || 'Gerar caderno processual';
      if (button) {
        button.disabled = true;
        button.textContent = 'Gerando PDFs…';
      }
      try {
        const payload = { processId: process.id, processNumber: process.number, revision: store.revision };
        const accessKey = processAccessKeys.get(process.id) || '';
        if (accessKey) {
          payload.accessKey = accessKey;
          payload.chaveAcesso = accessKey;
        }
        const response = await secureFetch('/api/integrations/tjrs-sidecar/processes/download-autos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) {
          showToast?.(result.message || 'Não foi possível gerar o caderno processual.', 'error');
          return false;
        }
        if (Array.isArray(result.documents)) store.state.documents = result.documents;
        store.revision = result.revision || store.revision;
        const refreshed = store.state.processes.find(record => record.id === process.id) || process;
        getPresenter().open(refreshed, getProcessSummary(refreshed), null);
        showToast?.(result.message || 'Caderno processual adicionado ao acervo documental.', 'success');
        return true;
      } catch (error) {
        showToast?.(`Falha ao gerar o caderno processual: ${error.message}`, 'error');
        return false;
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = originalLabel;
        }
      }
    },

    /**
     * Atualiza UM processo com os dados oficiais do eproc via Certificado A1
     * (`enrich-single`): capa, partes, movimentos, sigilo e chave. Compartilhado
     * pelo botão "Atualizar com Certificado" e pelo pós-cadastro de chave.
     */
    async refreshProcessViaEproc(item) {
      const response = await secureFetch('/api/integrations/eproc/processes/enrich-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ processId: item.id, processNumber: item.number, revision: store.revision })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.message || 'Não foi possível atualizar o processo pelo eproc.');
      if (result.process) {
        const index = store.state.processes.findIndex(record => record.id === result.process.id);
        if (index >= 0) store.state.processes[index] = { ...store.state.processes[index], ...result.process };
        else store.state.processes.unshift(result.process);
      }
      store.revision = result.revision || store.revision;
      return result;
    },

    async refreshWithCertificate(button, item) {
      const process = item || store.state.processes.find(record => record.id === button?.dataset?.processId);
      if (!process?.id || !canConsultTjrs(process)) {
        showToast?.('Este recurso exige um processo TJRS cadastrado.', 'error');
        return false;
      }
      const originalHtml = button?.innerHTML || 'Atualizar com Certificado';
      if (button) {
        button.disabled = true;
        button.innerHTML = `<svg class="atrium-icon" aria-hidden="true" focusable="false" style="animation: v2-sync-spin 1s linear infinite;"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.0#atrium-icon-sync"></use></svg><span>Atualizando pelo eproc…</span>`;
      }
      try {
        const result = await this.refreshProcessViaEproc(process);
        const refreshed = store.state.processes.find(record => record.id === process.id) || process;
        getPresenter().open(refreshed, getProcessSummary(refreshed), null);
        showToast?.(result.message || 'Processo atualizado com os dados oficiais do eproc.', 'success');
        return true;
      } catch (error) {
        showToast?.(`Falha ao atualizar pelo eproc: ${error.message}`, 'error');
        return false;
      } finally {
        if (button) {
          button.disabled = false;
          button.innerHTML = originalHtml;
        }
      }
    },

    async downloadEprocA1(button, item) {
      const process = item || store.state.processes.find(record => record.id === button?.dataset?.processId);
      if (!process?.id || !canConsultTjrs(process)) {
        showToast?.('Este recurso exige um processo TJRS cadastrado.', 'error');
        return false;
      }
      const originalHtml = button?.innerHTML || 'Baixar Autos com A1';
      if (button) {
        button.disabled = true;
        button.innerHTML = `<svg class="atrium-icon" aria-hidden="true" focusable="false" style="animation: v2-sync-spin 1s linear infinite;"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.0#atrium-icon-sync"></use></svg><span>Baixando peças via A1…</span>`;
      }
      showToast?.(`Solicitando as peças de ${process.number} ao eproc via Certificado A1. Se houver sincronização em andamento, o download entra na fila e começa em seguida.`, 'info');
      try {
        const payload = { processId: process.id, processNumber: process.number, revision: store.revision, maxPieces: 15 };
        const response = await secureFetch('/api/integrations/eproc/processes/download-autos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) {
          showToast?.(result.message || 'Não foi possível baixar os autos via Certificado A1.', 'error');
          return false;
        }
        if (Array.isArray(result.documents)) store.state.documents = result.documents;
        if (Array.isArray(result.processes)) {
          store.state.processes = result.processes;
        } else if (result.process?.id) {
          const idx = store.state.processes.findIndex(p => p.id === result.process.id || p.number === result.process.number);
          if (idx >= 0) {
            store.state.processes[idx] = { ...store.state.processes[idx], ...result.process };
          }
        }
        store.revision = result.revision || store.revision;
        const refreshed = store.state.processes.find(record => record.id === process.id) || process;
        getPresenter().open(refreshed, getProcessSummary(refreshed), null);
        void this.refreshAccessKeyStatus(refreshed);
        const count = result.piecesCount || (result.documents || []).length || 0;
        showToast?.(result.message || `${plural(count, 'peça oficial baixada pelo Certificado A1 e arquivada', 'peças oficiais baixadas pelo Certificado A1 e arquivadas')}.`, 'success');
        // Abre automaticamente a listagem de documentos dos autos para visualização
        setTimeout(() => {
          byId('processInspectorDocuments')?.click();
        }, 300);
        return true;
      } catch (error) {
        showToast?.(`Falha ao baixar autos via A1: ${error.message}`, 'error');
        return false;
      } finally {
        if (button) {
          button.disabled = false;
          button.innerHTML = originalHtml;
        }
      }
    },

    openSyncModal() {
      const modal = byId('eprocSyncModalBackdrop');
      if (modal) {
        modal.classList.remove('hidden');
        modal.setAttribute?.('aria-hidden', 'false');
      }
    },

    closeSyncModal() {
      const modal = byId('eprocSyncModalBackdrop');
      if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute?.('aria-hidden', 'true');
      }
    },

    async syncEprocA1({ silent = false } = {}) {
      if (this._syncEprocInFlight) {
        if (!silent) this.openSyncModal();
        return false;
      }
      const btn = byId('btnSyncEprocA1');
      const topSyncBtn = byId('syncButton');
      const originalHtml = btn?.innerHTML;
      this._syncEprocInFlight = true;

      // Ativa visualmente o botão local e o do topo
      if (btn) {
        btn.classList.add('is-syncing');
        btn.setAttribute?.('aria-busy', 'true');
        btn.innerHTML = `<svg class="atrium-icon" aria-hidden="true" focusable="false" style="animation: v2-sync-spin 1s linear infinite;"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.0#atrium-icon-sync"></use></svg><span>Sincronizando eproc...</span>`;
        btn.title = 'Sincronização eproc em andamento — clique para abrir o monitor';
      }
      if (topSyncBtn) {
        topSyncBtn.disabled = true;
        topSyncBtn.setAttribute?.('aria-busy', 'true');
      }

      // Prepara referências aos elementos do modal
      const modal = byId('eprocSyncModalBackdrop');
      const statusLabel = byId('eprocSyncStatusLabel');
      const percentLabel = byId('eprocSyncPercentLabel');
      const modalTrack = byId('eprocSyncModalTrack');
      const modalFill = byId('eprocSyncModalFill');
      const currentAction = byId('eprocSyncCurrentAction');
      const consoleLogs = byId('eprocSyncConsoleLogs');
      const minimizeBtn = byId('eprocSyncModalMinimize');
      const doneBtn = byId('eprocSyncModalDone');
      const configLink = byId('eprocSyncModalConfigLink');

      const safeEscape = typeof escapeHtml === 'function' ? escapeHtml : (v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])));
      const formatTime = () => {
        const now = new Date();
        return [
          String(now.getHours()).padStart(2, '0'),
          String(now.getMinutes()).padStart(2, '0'),
          String(now.getSeconds()).padStart(2, '0')
        ].join(':');
      };

      const appendLog = (text, type = 'info') => {
        if (!consoleLogs) return;
        const timeStr = formatTime();
        if (documentRef?.createElement) {
          const line = documentRef.createElement('div');
          line.className = `eproc-sync-log-line is-${type}`;
          line.innerHTML = `<span class="log-time">[${timeStr}]</span> ${safeEscape(text)}`;
          consoleLogs.appendChild(line);
        } else if (typeof consoleLogs.innerHTML === 'string') {
          consoleLogs.innerHTML += `<div class="eproc-sync-log-line is-${type}"><span class="log-time">[${timeStr}]</span> ${safeEscape(text)}</div>`;
        }
        if (consoleLogs.scrollHeight) {
          consoleLogs.scrollTop = consoleLogs.scrollHeight;
        }
      };

      const setStepStatus = (stepNumber, status) => {
        const stepEl = byId(`eprocStep${stepNumber}`);
        if (stepEl) {
          if (stepEl.dataset) stepEl.dataset.status = status;
          else stepEl.setAttribute?.('data-status', status);
        }
      };

      let lastMonotonicPercent = 0;

      const updateProgress = (percent, label, action, options = {}) => {
        const isDeterminate = options.determinate !== false && typeof percent === 'number' && Number.isFinite(percent);
        let p = null;
        if (isDeterminate) {
          const raw = Math.min(100, Math.max(0, Math.round(percent)));
          p = Math.max(lastMonotonicPercent, raw);
          lastMonotonicPercent = p;
        }

        // 1. Modal eproc
        if (isDeterminate) {
          if (percentLabel) {
            percentLabel.classList.remove('hidden');
            percentLabel.textContent = `${p}%`;
          }
          if (modalFill) modalFill.style.width = `${p}%`;
          if (modalTrack) {
            modalTrack.classList.remove('is-indeterminate');
            modalTrack.setAttribute?.('aria-valuenow', String(p));
          }
        } else {
          if (percentLabel) {
            percentLabel.classList.add('hidden');
            percentLabel.textContent = '';
          }
          if (modalFill) modalFill.style.width = '';
          if (modalTrack) {
            modalTrack.classList.add('is-indeterminate');
            modalTrack.removeAttribute?.('aria-valuenow');
          }
        }

        if (statusLabel && label) statusLabel.textContent = label;
        if (currentAction && action) currentAction.textContent = action;

        // 2. Barra de status do topo (compacta)
        const bar = byId('systemStatusBar');
        if (bar) {
          bar.classList.remove('is-transient-hidden');
          bar.dataset.status = 'syncing';
          bar.dataset.tone = 'info';
          const icon = byId('systemStatusIcon');
          const lbl = byId('systemStatusLabel');
          const percentEl = byId('systemStatusPercent');
          const det = byId('systemStatusDetail');
          const track = byId('systemStatusProgressTrack');
          const fill = byId('systemStatusProgressFill');

          if (icon) {
            icon.innerHTML = `<svg class="atrium-icon is-running" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.0#atrium-icon-sync"></use></svg>`;
          }

          if (lbl) lbl.textContent = label || 'Sincronizando';

          if (isDeterminate) {
            if (percentEl) {
              percentEl.classList.remove('hidden');
              percentEl.textContent = `${p}%`;
            } else if (lbl) {
              lbl.textContent = `${label || 'Sincronizando'} (${p}%)`;
            }
            if (track && fill) {
              track.classList.remove('hidden', 'is-indeterminate');
              track.removeAttribute?.('aria-hidden');
              track.setAttribute?.('role', 'progressbar');
              track.setAttribute?.('aria-label', 'Progresso da sincronização');
              track.setAttribute?.('aria-valuemin', '0');
              track.setAttribute?.('aria-valuemax', '100');
              track.setAttribute?.('aria-valuenow', String(p));
              fill.style.width = `${p}%`;
            }
          } else {
            if (percentEl) {
              percentEl.classList.add('hidden');
              percentEl.textContent = '';
            }
            if (track && fill) {
              track.classList.remove('hidden');
              track.classList.add('is-indeterminate');
              track.removeAttribute?.('aria-hidden');
              track.setAttribute?.('role', 'progressbar');
              track.setAttribute?.('aria-label', 'Progresso da sincronização');
              track.removeAttribute?.('aria-valuenow');
              track.removeAttribute?.('aria-valuemin');
              track.removeAttribute?.('aria-valuemax');
              fill.style.width = '';
            }
          }

          if (det && action) det.textContent = action;
        }
      };

      // Reset inicial do modal
      if (!silent) {
        this.openSyncModal();
        if (consoleLogs) consoleLogs.innerHTML = '';
        if (doneBtn) doneBtn.classList.add('hidden');
        if (configLink) configLink.classList.add('hidden');
        if (minimizeBtn) minimizeBtn.classList.remove('hidden');
        for (let i = 1; i <= 5; i++) setStepStatus(i, i === 1 ? 'active' : 'waiting');
      }

      updateProgress(null, 'Sincronizando...', 'Iniciando canal seguro com o tribunal TJRS via mTLS...', { determinate: false });
      appendLog('Iniciando comunicação com o tribunal TJRS (eproc 1G)...');
      appendLog('Conectando canal seguro mTLS (porta 443)...');

      let isCompleted = false;
      let cancelPolling = false;
      const seenLogs = new Set([
        'Iniciando comunicação com o tribunal TJRS (eproc 1G)...',
        'Conectando canal seguro mTLS (porta 443)...'
      ]);

      const cleanup = () => {
        cancelPolling = true;
        this._syncEprocInFlight = false;
        if (btn) {
          btn.classList.remove('is-syncing');
          btn.removeAttribute?.('aria-busy');
          if (originalHtml) btn.innerHTML = originalHtml;
        }
        if (topSyncBtn) {
          topSyncBtn.disabled = false;
          topSyncBtn.removeAttribute?.('aria-busy');
        }
      };

      try {
        if (!silent) showToast?.('Iniciando sincronização com Certificado A1 no eproc TJRS...', 'info');

        // Dispara o sweep no servidor de forma desacoplada/assíncrona (retorno HTTP 202 imediato < 50ms)
        let response = await secureFetch('/api/integrations/eproc/sweep', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ maxProcesses: 4 })
        });

        // A trava de concorrência eproc é autoritativa no servidor e não pode ser
        // liberada enquanto a operação do dono está ativa. O 409 é tratado abaixo
        // com a mensagem sanitizada, sem reset automático nem segunda tentativa.
        const startResult = await response.json().catch(() => ({}));

        if (!response.ok || !startResult.ok) {
          let errorMsg = startResult.message || startResult.error;
          if (!errorMsg) {
            if (response.status === 412) {
              errorMsg = 'Certificado Digital A1 ou 2FA TOTP não configurado.';
            } else if (response.status === 409) {
              errorMsg = 'Outra sincronização eproc já está em andamento no servidor.';
            } else if (response.status === 503) {
              errorMsg = 'A consulta eproc está temporariamente indisponível no serviço. Tente novamente mais tarde.';
            } else {
              errorMsg = `Falha na comunicação com o tribunal TJRS (${response.status}).`;
            }
          }
          const err = new Error(errorMsg);
          err.code = startResult.code;
          throw err;
        }

        // Loop de polling sequencial contra GET /api/integrations/eproc/sweep/status
        let completedJob = null;
        let consecutiveErrors = 0;
        const maxErrors = 10;
        let safetySeconds = 0;
        const maxSafetySeconds = 360; // 6 minutos máximo

        while (!isCompleted && !cancelPolling) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (cancelPolling) break;
          safetySeconds += 1;
          if (safetySeconds > maxSafetySeconds) {
            throw new Error('Tempo limite excedido na sincronização eproc.');
          }

          try {
            const statusRes = await secureFetch('/api/integrations/eproc/sweep/status', {
              headers: { Accept: 'application/json' }
            });
            if (!statusRes.ok) {
              consecutiveErrors++;
              if (consecutiveErrors >= maxErrors) {
                throw new Error(`Falha de comunicação com o servidor (${statusRes.status}).`);
              }
              continue;
            }
            consecutiveErrors = 0;
            const data = await statusRes.json().catch(() => ({}));

            if (!data.ok) continue;

            // Atualiza progresso e ação atual vindos diretamente do backend
            const isDeterminate = data.determinate === true && typeof data.progress === 'number' && Number.isFinite(data.progress);
            const currentProgress = isDeterminate ? data.progress : null;
            const currentStep = data.step || 1;
            const currentActionText = data.action || 'Processando dados do tribunal e atualizando base local...';

            updateProgress(currentProgress, 'Sincronizando...', currentActionText, {
              determinate: isDeterminate,
              completed: data.completed,
              total: data.total,
              phase: data.phase
            });

            // Atualiza os passos 1 a 5
            for (let s = 1; s <= 5; s++) {
              if (s < currentStep) setStepStatus(s, 'completed');
              else if (s === currentStep) setStepStatus(s, 'active');
              else setStepStatus(s, 'waiting');
            }

            // Imprime novos logs emitidos pelo servidor
            if (Array.isArray(data.logs)) {
              data.logs.forEach(logItem => {
                const text = typeof logItem === 'string' ? logItem : logItem?.text;
                if (text && !seenLogs.has(text)) {
                  seenLogs.add(text);
                  appendLog(text, logItem?.type || 'info');
                }
              });
            }

            // Se o servidor marcou o job como concluído
            if (data.status === 'completed') {
              isCompleted = true;
              completedJob = data;
              break;
            } else if (data.status === 'error') {
              throw new Error(data.error || 'Erro na sincronização eproc TJRS.');
            }
          } catch (pollErr) {
            consecutiveErrors++;
            if (consecutiveErrors >= maxErrors) {
              throw pollErr;
            }
          }
        }

        // Marca todos os 5 passos como concluídos
        for (let i = 1; i <= 5; i++) setStepStatus(i, 'completed');
        updateProgress(100, 'Sincronização Concluída', 'Processos e dados do eproc TJRS consolidados com sucesso.', { determinate: true });
        appendLog('Sincronização e enriquecimento finalizados com sucesso!', 'success');

        const resData = completedJob.result || {};
        const count = resData.enrichedCount || (resData.updatedProcesses || []).length || 0;
        const successMsg = count > 0
          ? `${plural(count, 'processo do TJRS sincronizado e atualizado', 'processos do TJRS sincronizados e atualizados')}.`
          : (resData.message || 'Varredura eproc concluída com sucesso.');

        appendLog(successMsg, 'success');

        if (doneBtn) {
          doneBtn.textContent = 'Concluir';
          doneBtn.classList.remove('hidden');
        }
        if (minimizeBtn) minimizeBtn.classList.add('hidden');

        await store.fetchState?.();
        this.render(byId('processSearch')?.value || '');
        globalThis.App?.renderTasks?.();
        globalThis.App?.renderDashboard?.();

        const bar = byId('systemStatusBar');
        if (bar) {
          bar.dataset.status = 'saved';
          bar.dataset.tone = 'success';
          const icon = byId('systemStatusIcon');
          const lbl = byId('systemStatusLabel');
          const percentEl = byId('systemStatusPercent');
          const det = byId('systemStatusDetail');
          const track = byId('systemStatusProgressTrack');
          const fill = byId('systemStatusProgressFill');
          if (icon) {
            icon.innerHTML = `<svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.0#atrium-icon-check"></use></svg>`;
          }
          if (lbl) lbl.textContent = 'Sincronização Concluída';
          if (percentEl) {
            percentEl.classList.remove('hidden');
            percentEl.textContent = '100%';
          }
          if (det) det.textContent = successMsg;
          if (fill) fill.style.width = '100%';
          if (track) {
            track.classList.remove('is-indeterminate');
            track.setAttribute?.('aria-valuenow', '100');
          }
          setTimeout(() => {
            if (track) track.classList.add('hidden');
            if (percentEl) percentEl.classList.add('hidden');
            bar.classList.add('is-transient-hidden');
          }, 3500);
        }

        showToast?.(successMsg, 'success');
        return true;
      } catch (err) {
        setStepStatus(5, 'error');
        const errMsg = err.message || 'Falha na sincronização eproc A1.';
        if (statusLabel) statusLabel.textContent = 'Falha na Sincronização';
        if (currentAction) currentAction.textContent = errMsg;
        appendLog(`[FALHA] ${errMsg}`, 'error');

        const isConfigIssue = /certificado|a1|2fa|totp|pfx|cobertura judicial|conexões com tribunais/i.test(errMsg) || err.code === 'A1_CERT_MISSING' || err.code === 'TOTP_2FA_MISSING';
        if (isConfigIssue && configLink) {
          configLink.classList.remove('hidden');
          appendLog('Dica: Configure o Certificado A1 ou o 2FA TOTP em Conexões com tribunais.', 'info');
        }

        if (doneBtn) {
          doneBtn.textContent = 'Fechar';
          doneBtn.classList.remove('hidden');
        }
        if (minimizeBtn) minimizeBtn.classList.add('hidden');

        const bar = byId('systemStatusBar');
        if (bar) {
          bar.dataset.status = 'error';
          bar.dataset.tone = 'danger';
          const icon = byId('systemStatusIcon');
          const lbl = byId('systemStatusLabel');
          const percentEl = byId('systemStatusPercent');
          const det = byId('systemStatusDetail');
          const track = byId('systemStatusProgressTrack');
          const fill = byId('systemStatusProgressFill');
          if (icon) {
            icon.innerHTML = `<svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.0#atrium-icon-warning"></use></svg>`;
          }
          if (lbl) lbl.textContent = 'Falha na Sincronização';
          if (percentEl) {
            percentEl.classList.add('hidden');
            percentEl.textContent = '';
          }
          if (det) det.textContent = errMsg;
          if (fill) fill.style.width = '0%';
          if (track) {
            track.classList.remove('is-indeterminate');
            track.removeAttribute?.('aria-valuenow');
          }
          setTimeout(() => track?.classList.add('hidden'), 2500);
        }

        if (!silent) showToast?.(`Falha na sincronização eproc A1: ${errMsg}`, 'error');
        console.warn('[processes] Erro ao sincronizar eproc A1:', err);
        return false;
      } finally {
        cleanup();
      }
    },

    openDetails(item) {
      return getPresenter().open(item, getProcessSummary(item), documentRef.activeElement);
    },

    bindProcessAccessControls(item) {
      const button = byId('processInspectorContent')?.querySelector(`[data-process-access-save="${CSS.escape(String(item.id))}"]`);
      if (!button) return;
      button.addEventListener('click', async () => {
        const teamIds = [...byId('processInspectorContent').querySelectorAll('[data-process-access-team]:checked')].map(input => input.value);
        const responsibleUserIds = [...byId('processInspectorContent').querySelectorAll('[data-process-access-user]:checked')].map(input => input.value);
        button.disabled = true;
        try {
          const response = await secureFetch(`/api/processes/${encodeURIComponent(item.id)}/assignment`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ teamIds, responsibleUserIds, expectedRevision: store.revision })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.message || 'Não foi possível salvar a atribuição.');
          store.upsert('processes', payload.process);
          store.adoptServerRevision(payload.revision);
          showToast?.('Equipe e acesso do processo atualizados.');
          presenter.close?.();
          this.render();
        } catch (error) {
          console.warn('[processes] Atribuição processual:', error.message);
          showToast?.(error.message);
        } finally {
          button.disabled = false;
        }
      });
    },

    openProcessModal(defaults = {}) {
      void refreshTeamDirectory();
      pendingTjrsDraft = null;
      pendingTjrsAppliedFields = new Map();
      const actionTypes = (store.state.configuration?.actionTypes || []).map(item => ({ value: item.name, label: item.name }));
      const actionGroups = (store.state.configuration?.actionGroups || []).map(item => ({ value: item.name, label: item.name }));
      const summary = getProcessSummary(defaults);
      const summaryHtml = defaults.id ? `<section class="process-summary-card" data-process-summary>
        <div class="process-summary-heading"><div><span>Resumo rápido do processo</span><strong>${escapeHtml(summary.processNumber || 'Processo sem número')}</strong></div><small>${escapeHtml(defaults.client || 'Cliente não informado')} · ${escapeHtml(defaults.court || 'Órgão não informado')}</small></div>
        <div class="process-summary-metrics">
          <div><strong>${summary.openTasks}</strong><span>Tarefas abertas</span></div>
          <div><strong>${summary.linkedIntimations}</strong><span>Intimações</span></div>
          <div><strong>${escapeHtml(formatMinutes(summary.timeMinutes))}</strong><span>Tempo apontado</span></div>
          <div><strong>${summary.nextDeadline ? escapeHtml(formatDate(summary.nextDeadline)) : '—'}</strong><span>Próximo prazo</span></div>
        </div>
        <p><b>Último andamento:</b> ${escapeHtml(defaults.lastMovement || 'Ainda não informado.')} ${defaults.lastMovementAt ? `· ${escapeHtml(formatDate(defaults.lastMovementAt))}` : ''}</p>
      </section>` : '';

      // A consulta assistida só existe no TJRS: em processo de outro tribunal ela só atrapalha.
      const showTjrsAssist = !defaults.id || /^\d{13}821\d{4}$/.test(String(defaults.number || '').replace(/\D/g, ''));
      const tjrsAssistHtml = !showTjrsAssist ? '' : `<section class="process-tjrs-assist" aria-labelledby="processTjrsAssistHeading">
        <div><span>Cadastro assistido</span><strong id="processTjrsAssistHeading">Consultar processo no TJRS</strong><p>Preenche somente dados judiciais disponíveis. Cliente e posição processual continuam sob sua revisão.</p></div>
        <button type="button" class="button ghost" id="processTjrsPreview">Consultar dados do TJRS</button>
        <div class="process-tjrs-assist-key">
          <label for="field-accessKey">Chave de acesso do eproc</label>
          <input type="password" id="field-accessKey" class="v2-input" autocomplete="off" maxlength="500" placeholder="Informe para processo em segredo de justiça">
          <small>A chave será guardada no cofre cifrado e reutilizada no monitoramento. Deixe em branco para manter a chave já cadastrada.</small>
        </div>
        <div class="process-tjrs-preview-status" id="processTjrsPreviewStatus" aria-live="polite">Informe um CNJ do TJRS no campo abaixo.</div>
      </section>`;

      openModal?.('process', defaults.id ? 'Editar processo' : 'Cadastrar processo', 'Carteira processual', [
        { name: 'number', label: 'Número CNJ', full: true, placeholder: '0000000-00.0000.8.21.0000' },
        { name: 'oldNumber', label: 'Número antigo / físico', placeholder: 'Ex: 029/1.12.0001234-5' },
        { name: 'originNumbers', label: 'Números anteriores / origem', full: true, placeholder: 'CNJ anterior separado por ponto e vírgula' },
        { name: 'nb', label: 'NB — Número do Benefício (INSS)', placeholder: 'Ex: 123.456.789-0' },
        { name: 'client', label: 'Cliente principal', required: true },
        { name: 'clientPosition', label: 'Posição do cliente', type: 'select', options: [{value:'Autor(a)',label:'Autor(a)'},{value:'Réu / Ré',label:'Réu / Ré'},{value:'Exequente',label:'Exequente'},{value:'Executado(a)',label:'Executado(a)'},{value:'Reclamante',label:'Reclamante (Trabalhista)'},{value:'Reclamada',label:'Reclamada (Trabalhista)'},{value:'Terceiro Interessado',label:'Terceiro Interessado'},{value:'Litisconsorte',label:'Litisconsorte'}] },
        { name: 'opposingParty', label: 'Parte contrária principal', placeholder: 'Nome da parte adversa' },
        { name: 'actionGroup', label: 'Grupo de ação', type: actionGroups.length ? 'select' : 'text', options: [{value:'',label:'Selecione o grupo'}, ...actionGroups] },
        { name: 'actionType', label: 'Tipo de ação / Matéria', type: actionTypes.length ? 'select' : 'text', options: [{value:'',label:'Selecione o tipo de ação'}, ...actionTypes] },
        { name: 'judicialPhase', label: 'Fase processual', type: 'select', options: [{value:'Conhecimento',label:'Conhecimento'},{value:'Recursal',label:'Recursal'},{value:'Execução / Cumprimento',label:'Execução / Cumprimento'},{value:'Acordo',label:'Acordo'},{value:'Administrativo',label:'Administrativo'},{value:'Arquivado',label:'Arquivado'}] },
        { name: 'risk', label: 'Risco / Probabilidade de êxito (Opcional)', type: 'select', options: [{value:'',label:'Não informado / Sem prognóstico'},{value:'provavel',label:'Provável (Alto êxito)'},{value:'possivel',label:'Possível (Médio risco)'},{value:'remoto',label:'Remoto (Alto risco)'}] },
        { name: 'stage', label: 'Etapa do fluxo' },
        { name: 'protocol', label: 'Protocolo / Local' },
        { name: 'caseFolder', label: 'Pasta física / Caso' },
        { name: 'court', label: 'Tribunal / Órgão', placeholder: 'Ex: TJRS, TRF4, TST' },
        { name: 'county', label: 'Comarca / Seção Judiciária', placeholder: 'Ex: Ijuí, Porto Alegre' },
        { name: 'courtUnit', label: 'Vara / Unidade Judiciária', placeholder: 'Ex: 1ª Vara Cível, 2ª Vara Federal' },
        { name: 'responsible', label: 'Responsáveis (nomes por vírgula)', type: 'combobox', identityName: 'responsibleUserId', suggestions: memberOptions(), placeholder: 'Ex: Ana Beatriz, João Pedro', note: 'Nomes de integrantes viram responsáveis vinculados e recebem as movimentações. É possível escolher um integrante ou digitar vários nomes.' },
        { name: 'registeredAt', label: 'Data de distribuição / cadastro', type: 'date' },
        { name: 'lastMovementAt', label: 'Data do último andamento', type: 'date' },
        { name: 'lastMovement', label: 'Último andamento', type: 'textarea', full: true },
        { name: 'feeType', label: 'Tipo de honorários', type: 'select', options: [{value:'',label:'Não definido'},{value:'exito',label:'Êxito (Quota Litis %)'},{value:'fixo',label:'Fixo (Pró-labore)'},{value:'misto',label:'Misto (Fixo + Êxito)'},{value:'mensal',label:'Mensalidade (Partido)'},{value:'horas',label:'Cobrança por Hora'}] },
        { name: 'feePercentage', label: 'Percentual de êxito (%)', type: 'number', placeholder: 'Ex: 30' },
        { name: 'feeAmount', label: 'Valor fixo / causa (R$)', type: 'number', placeholder: 'Ex: 5000' },
        { name: 'feeMonthly', label: 'Valor mensal (R$)', type: 'number', placeholder: 'Ex: 1500' },
        { name: 'feeStatus', label: 'Situação dos honorários', type: 'select', options: [{value:'em_dia',label:'Em dia / Regular'},{value:'aguardando_exito',label:'Aguardando êxito processual'},{value:'pendente',label:'Pendente / Cobrança'},{value:'quitado',label:'Quitado'},{value:'repassado',label:'Quitado (compatibilidade legada)'}] },
        { name: 'requisitionType', label: 'Requisição judicial (RPV / Alvará)', type: 'select', options: [{value:'',label:'Nenhuma requisição ativa'},{value:'rpv_federal',label:'RPV Federal (TRF4)'},{value:'precatorio_federal',label:'Precatório Federal (TRF4)'},{value:'alvara_estadual',label:'Alvará Judicial Estadual (TJRS)'},{value:'alvara_trabalhista',label:'Alvará Trabalhista (TRT4)'}] },
        { name: 'requisitionAmount', label: 'Valor bruto requisitado (R$)', type: 'number', placeholder: 'Ex: 45000' },
        { name: 'requisitionBank', label: 'Banco depositário', type: 'select', options: [{value:'',label:'Não definido'},{value:'bb',label:'Banco do Brasil'},{value:'cef',label:'Caixa Econômica Federal'},{value:'banrisul',label:'Banrisul'},{value:'outro',label:'Outro banco'}] },
        { name: 'requisitionStatus', label: 'Status da requisição', type: 'select', options: [{value:'requisitado',label:'Requisitado / Expedido'},{value:'aguardando_deposito',label:'Aguardando Depósito Bancário'},{value:'disponivel_saque',label:'Disponível para Saque / Levantamento'},{value:'repassado',label:'Pago e Repassado ao Cliente'}] },
        { name: 'feeNotes', label: 'Condições de pagamento e faturamento', type: 'textarea', full: true },
        { name: 'secrecy', label: 'Visibilidade', type: 'select', options: [{value:'false',label:'Consulta pública'},{value:'true',label:'Segredo de justiça'}] },
        { name: 'monitoring', label: 'Monitoramento', type: 'select', options: [{value:'active',label:'Monitorando'},{value:'attention',label:'Precisa de atenção'}] },
        { name: 'notes', label: 'Anotações gerais', type: 'textarea', full: true }
      ], {
        secrecy: false,
        monitoring: 'active',
        feeStatus: 'em_dia',
        clientPosition: 'Autor(a)',
        judicialPhase: 'Conhecimento',
        risk: 'provavel',
        registeredAt: defaults.registeredAt || (defaults.createdAt ? defaults.createdAt.slice(0, 10) : isoDate()),
        ...defaults,
        secrecy: String(Boolean(defaults.secrecy))
      }, `${summaryHtml}${tjrsAssistHtml}`);
      byId('processTjrsPreview')?.addEventListener('click', event => this.previewTjrsDraft(event.currentTarget));
      const numberField = byId('field-number');
      if (numberField) {
        numberField.addEventListener('input', () => this.updateCnjAssist());
        numberField.addEventListener('blur', () => this.updateCnjAssist());
        this.updateCnjAssist();
      }
      byId('field-number')?.addEventListener('input', event => {
        if (!pendingTjrsDraft || normalizeCnj(event.currentTarget.value) === normalizeCnj(pendingTjrsDraft.number)) return;
        for (const [name, applied] of pendingTjrsAppliedFields) {
          const field = byId(`field-${name}`);
          if (!field || String(field.value) !== applied.value) continue;
          field.value = applied.previous;
          field.dispatchEvent?.(new Event('change', { bubbles: true }));
        }
        pendingTjrsDraft = null;
        pendingTjrsAppliedFields = new Map();
        const status = byId('processTjrsPreviewStatus');
        if (status) status.textContent = 'O CNJ foi alterado. Consulte novamente para carregar dados judiciais compatíveis.';
        const previewButton = byId('processTjrsPreview');
        if (previewButton) previewButton.textContent = 'Consultar dados locais';
      });
    },

    updateCnjAssist() {
      const numberField = byId('field-number');
      const hint = ensureCnjHint(documentRef, numberField);
      if (!numberField || !hint) return;
      hint.querySelector('[data-cnj-fix]')?.remove();
      const digits = cleanCnj(numberField.value);
      if (digits.length !== 20) {
        hint.textContent = 'Confira o número CNJ (20 dígitos) para validar o dígito verificador.';
        hint.dataset.state = 'idle';
        return;
      }
      const descriptor = describeCnj(numberField.value);
      if (descriptor?.valid) {
        const hintParts = [descriptor.courtName || descriptor.court, descriptor.degreeLabel];
        if (descriptor.delegated) hintParts.push('vincule o processo de origem em "Números anteriores"');
        hint.textContent = hintParts.filter(Boolean).join(' · ') || 'Número CNJ válido.';
        hint.dataset.state = 'valid';
        const courtField = byId('field-court');
        if (courtField && !String(courtField.value || '').trim() && descriptor.court) {
          courtField.value = descriptor.court;
          courtField.dispatchEvent?.(new Event('change', { bubbles: true }));
        }
        return;
      }
      const correction = suggestCnjCorrection(numberField.value);
      hint.textContent = correction
        ? `Dígito verificador não confere. Número sugerido: ${correction}`
        : 'Número CNJ inválido.';
      hint.dataset.state = 'invalid';
      if (!correction) return;
      const fix = documentRef.createElement('button');
      fix.type = 'button';
      fix.className = 'button ghost';
      fix.dataset.cnjFix = '';
      fix.textContent = 'Usar número corrigido';
      fix.addEventListener('click', () => {
        numberField.value = correction;
        numberField.dispatchEvent?.(new Event('input', { bubbles: true }));
        numberField.focus?.();
      });
      hint.appendChild(documentRef.createTextNode(' '));
      hint.appendChild(fix);
    },

    async previewTjrsDraft(button) {
      const processNumber = byId('field-number')?.value?.trim() || '';
      const accessKey = cleanAccessKey(byId('field-accessKey')?.value);
      const status = byId('processTjrsPreviewStatus');
      const field = byId('field-number');
      if (!processNumber) {
        if (status) status.textContent = 'Informe primeiro o número CNJ do processo.';
        byId('field-number')?.focus();
        return false;
      }
      const originalLabel = button?.textContent || 'Consultar dados do TJRS';
      if (button) {
        button.disabled = true;
        button.textContent = 'Consultando…';
      }
      if (status) status.textContent = 'Consultando os dados disponíveis no TJRS…';
      try {
        const isTjrs = normalizeCnj(processNumber).slice(13, 16) === '821';
        const previewUrl = isTjrs ? '/api/integrations/tjrs-sidecar/processes/preview' : '/api/integrations/omni/processes/preview';
        const payload = { processNumber };
        if (isTjrs && accessKey) {
          payload.accessKey = accessKey;
          payload.chaveAcesso = accessKey;
        }
        const response = await secureFetch(previewUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (byId('field-number') !== field || normalizeCnj(field?.value) !== normalizeCnj(processNumber)) return false;
        if (result.draft && normalizeCnj(result.draft.number) !== normalizeCnj(processNumber)) return false;
        if (!response.ok || !result.ok || !result.draft) {
          if (status) status.textContent = result.message || 'Ainda não foi possível carregar os dados deste processo.';
          return false;
        }
        const assistedFieldNames = ['court', 'county', 'courtUnit', 'actionType', 'registeredAt', 'lastMovementAt', 'lastMovement'];
        const previousValues = new Map(assistedFieldNames.map(name => [name, String(byId(`field-${name}`)?.value || '')]));
        const sameDraft = normalizeCnj(pendingTjrsDraft?.number) === normalizeCnj(result.draft.number);
        const previouslyApplied = sameDraft ? pendingTjrsAppliedFields : new Map();
        pendingTjrsDraft = structuredClone(result.draft);
        fillAssistedProcessFields(result.draft, { documentRef, today: isoDate() });
        pendingTjrsAppliedFields = new Map(previouslyApplied);
        for (const name of assistedFieldNames) {
          const value = String(byId(`field-${name}`)?.value || '');
          const previous = previousValues.get(name) || '';
          if (value !== previous) pendingTjrsAppliedFields.set(name, { previous, value });
        }
        const parties = Array.isArray(result.draft.judicialParties) ? result.draft.judicialParties : [];
        byId('modalForm')?.querySelector('.process-form-more')?.setAttribute('open', '');
        if (status) status.innerHTML = `<strong>Dados judiciais carregados para revisão.</strong><span>${escapeHtml(result.draft.court || 'TJRS')} · ${escapeHtml(result.draft.actionType || 'Classe não informada')} · ${plural(parties.length, 'parte', 'partes')} · ${plural(result.summary?.movements || 0, 'andamento', 'andamentos')}.</span><small>Nenhuma parte foi definida automaticamente como cliente.</small>`;
        if (button) button.textContent = 'Consultar novamente';
        showToast?.(result.message || 'Dados judiciais carregados para revisão.', 'success');
        return true;
      } catch (error) {
        if (status) status.textContent = `Collector local indisponível: ${error.message}`;
        return false;
      } finally {
        if (button) {
          button.disabled = false;
          if (button.textContent === 'Consultando…') button.textContent = originalLabel;
        }
      }
    },

    saveProcess(data, defaults = {}) {
      const editing = Boolean(defaults.id);
      const accessKey = cleanAccessKey(data.accessKey || data.chaveAcesso || byId('field-accessKey')?.value);
      // Número CNJ de 20 dígitos: DV conferido, duplicidade bloqueada e formato
      // oficial garantido. Números antigos/provisórios (menos de 20 dígitos)
      // permanecem livres. Dado legado não alterado não é revalidado.
      const numberDigits = cleanCnj(data.number);
      if (numberDigits.length === 20) {
        const numberChanged = !editing || numberDigits !== cleanCnj(defaults.number);
        if (numberChanged && !isValidCnj(numberDigits)) {
          showToast?.('Dígito verificador do número CNJ não confere. Use o número sugerido no formulário.', 'error');
          return null;
        }
        if (numberChanged) {
          const duplicate = (store.state?.processes || []).find(item => item && item.id !== defaults.id && cleanCnj(item.number || item.protocol) === numberDigits);
          if (duplicate) {
            showToast?.(`Este número CNJ já está cadastrado${duplicate.client ? ` para ${duplicate.client}` : ''}. Abra o processo existente em vez de duplicar.`, 'error');
            return null;
          }
        }
      }
      const safeData = { ...data, ...(numberDigits.length === 20 ? { number: formatCnj(numberDigits) } : {}) };
      delete safeData.responsibleUserId;
      // Vínculo de número original (redistribuição/recurso delegado — art. 4º §7º e
      // art. 5º §1º da Resolução): lista normalizada, deduplicada e limitada.
      const originFieldProvided = Object.prototype.hasOwnProperty.call(data, 'originNumbers');
      const rawOriginNumbers = Array.isArray(data.originNumbers)
        ? data.originNumbers
        : String(data.originNumbers || '').split(/[,;\n]/);
      const originNumbers = [...new Set(rawOriginNumbers
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .map(value => (cleanCnj(value).length === 20 ? formatCnj(value) : value))
        .filter(value => value.length <= 60))].slice(0, 10);
      if (originNumbers.length || (editing && originFieldProvided)) safeData.originNumbers = originNumbers;
      // Responsáveis vinculados: nomes de integrantes viram IDs oficiais.
      // Texto avulso é preservado; o backend é a autoridade final do vínculo.
      const resolvedResponsibles = resolveMemberIdList(safeData.responsible, teamDirectory);
      const previousResponsibles = Array.isArray(defaults.responsibleUserIds) ? defaults.responsibleUserIds : [];
      // Texto explicitamente vazio limpa o vínculo; nomes sem correspondência
      // preservam o vínculo anterior (falha de diretório não revoga delegação).
      const responsibleTextBlank = typeof safeData.responsible === 'string' && !String(safeData.responsible).trim();
      const responsibleUserIds = resolvedResponsibles.length
        ? resolvedResponsibles
        : (responsibleTextBlank ? [] : (editing ? previousResponsibles.filter(id => String(id || '').trim()) : []));
      const safeDefaults = { ...defaults };
      delete safeData.accessKey;
      delete safeData.chaveAcesso;
      delete safeDefaults.accessKey;
      delete safeDefaults.chaveAcesso;
      const assistedDraft = !editing && pendingTjrsDraft && normalizeCnj(pendingTjrsDraft.number) === normalizeCnj(data.number)
        ? structuredClone(pendingTjrsDraft)
        : {};
      const parseOptionalNumber = (value, { percentage = false } = {}) => {
        if (value === '' || value === null || value === undefined) return null;
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0 || (percentage && number > 100)) return undefined;
        return number;
      };
      const feePercentage = parseOptionalNumber(data.feePercentage, { percentage: true });
      const feeAmount = parseOptionalNumber(data.feeAmount);
      const feeMonthly = parseOptionalNumber(data.feeMonthly);
      const requisitionAmount = parseOptionalNumber(data.requisitionAmount);
      if ([feePercentage, feeAmount, feeMonthly, requisitionAmount].includes(undefined)) {
        showToast?.('Informe valores financeiros válidos, não negativos e percentual entre 0 e 100.', 'error');
        return null;
      }
      const secrecyValue = data.secrecy === 'true';
      // Proveniência da marcação: só é manual quando o usuário definiu/alterou o
      // campo (ou já era manual). Marca da fonte pré-preenchida não vira manual,
      // para a reconciliação oficial poder limpá-la.
      const secrecyManual = secrecyValue && (defaults.secrecyManual === true || secrecyValue !== (defaults.secrecy === true));
      const record = {
        id: defaults.id || uid('proc'),
        source: defaults.source || assistedDraft.source || 'Interna',
        lastMovement: 'Cadastro manual',
        lastMovementAt: isoDate(),
        ...assistedDraft,
        ...safeDefaults,
        ...safeData,
        feePercentage,
        feeAmount,
        feeMonthly,
        requisitionAmount,
        secrecy: secrecyValue,
        secrecyManual,
        responsibleUserIds,
        updatedAt: new Date().toISOString()
      };
      store.upsert('processes', record);

      // Propaga o cliente real para todas as tarefas, intimações e agenda vinculadas a este processo
      if (record.client && !/^(?:cliente\s+)?(?:geral|n[aã]o\s+informado|n[aã]o\s+identificado|modelo|do\s+escrit[oó]rio|sigilo|n\/?i|sem\s+cliente)$/i.test(record.client.trim())) {
        const normProc = (record.number || record.protocol || '').replace(/\D/g, '');
        (store.state.tasks || []).forEach(task => {
          const taskNorm = (task.process || task.processNumber || '').replace(/\D/g, '');
          if (task.processId === record.id || (normProc && taskNorm === normProc)) {
            task.client = record.client;
            if (!task.processId) task.processId = record.id;
            if (record.contactId && !task.contactId) task.contactId = record.contactId;
          }
        });
        (store.state.intimations || []).forEach(item => {
          const itemNorm = (item.process || item.processNumber || '').replace(/\D/g, '');
          if (item.processId === record.id || (normProc && itemNorm === normProc)) {
            item.client = record.client;
            if (!item.processId) item.processId = record.id;
          }
        });
        (store.state.agenda || []).forEach(evt => {
          const evtNorm = (evt.process || evt.processNumber || '').replace(/\D/g, '');
          if (evt.processId === record.id || (normProc && evtNorm === normProc)) {
            evt.client = record.client;
            if (!evt.processId) evt.processId = record.id;
          }
        });
      }

      const persistedRecord = store.state.processes.find(item => item.id === record.id) || record;
      delete persistedRecord.accessKey;
      delete persistedRecord.chaveAcesso;
      if (accessKey) processAccessKeys.set(record.id, accessKey);
      store.audit(editing ? 'Processo atualizado' : 'Processo cadastrado', `${record.number || record.protocol || 'sem número'} · ${record.client}${record.feeType ? ` · ${record.feeType}` : ''}`);
      pendingTjrsDraft = null;
      pendingTjrsAppliedFields = new Map();
      return record;
    },

    /**
     * Andamento manual append-only: entra no array principal `movements` do processo, com
     * origem interna explícita, sem criar coleção, rota, prazo ou ciência judicial.
     */
    openMovementModal(item) {
      if (!item?.id || typeof openModal !== 'function') return false;
      const currentUser = globalThis.KellerAuth?.currentUser || {};
      openModal('processMovement', 'Novo andamento', 'Registro manual do escritório', [
        { name: 'date', label: 'Data do andamento', type: 'date', required: true },
        { name: 'description', label: 'Descrição', type: 'textarea', required: true, full: true, note: 'Registro interno do escritório. Não é ato processual, prazo nem ciência judicial.' },
        { name: 'author', label: 'Autor do registro', placeholder: 'Quem registrou este andamento' }
      ], {
        processId: item.id,
        date: isoDate(),
        author: currentUser.displayName || currentUser.username || '',
        onSubmit: data => feature.appendMovement(item.id, data)
      });
      return true;
    },

    async appendMovement(processId, data = {}) {
      const process = (store.state.processes || []).find(item => String(item.id) === String(processId));
      if (!process) {
        showToast?.('Processo não encontrado para registrar o andamento.', 'error');
        return null;
      }
      const description = String(data.description || '').trim();
      if (!description) {
        showToast?.('Descreva o andamento antes de salvar.', 'error');
        return null;
      }
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(data.date || '')) ? String(data.date) : isoDate();
      const createdAt = new Date().toISOString();
      const movementId = uid('mov');
      const movement = {
        id: movementId,
        code: movementId,
        source: 'Interna',
        manual: true,
        date,
        at: date,
        description,
        name: description,
        author: String(data.author || '').trim(),
        createdAt
      };
      const previousMovements = Array.isArray(process.movements) ? process.movements : [];
      const previousLastMovement = process.lastMovement;
      const previousLastMovementAt = process.lastMovementAt;
      const previousUpdatedAt = process.updatedAt;
      const isNewest = !previousLastMovementAt || String(date) >= String(previousLastMovementAt).slice(0, 10);
      process.movements = [...previousMovements, movement];
      if (isNewest) {
        process.lastMovement = description;
        process.lastMovementAt = date;
      }
      process.updatedAt = createdAt;
      const audit = store.audit('Andamento manual registrado', `${process.number || process.protocol || 'sem número'} · ${description.slice(0, 120)}`);
      if (await store.flush() !== true) {
        process.movements = previousMovements;
        if (previousLastMovement === undefined) delete process.lastMovement; else process.lastMovement = previousLastMovement;
        if (previousLastMovementAt === undefined) delete process.lastMovementAt; else process.lastMovementAt = previousLastMovementAt;
        if (previousUpdatedAt === undefined) delete process.updatedAt; else process.updatedAt = previousUpdatedAt;
        store.state.audit = (store.state.audit || []).filter(entry => entry.id !== audit?.id);
        store.save?.();
        showToast?.('Não foi possível salvar o andamento. Tente novamente.', 'error');
        return null;
      }
      if (byId('processInspectorContent')) getPresenter().open(process, getProcessSummary(process), null);
      showToast?.('Andamento manual registrado.', 'success');
      return movement;
    },

    async persistAccessKey(process) {
      const accessKey = processAccessKeys.get(process?.id) || '';
      if (!accessKey) return true;
      try {
        const response = await secureFetch('/api/integrations/tjrs-sidecar/processes/access-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ processId: process.id, processNumber: process.number, accessKey, chaveAcesso: accessKey })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(result.message || 'Não foi possível guardar a chave de acesso.');
        return true;
      } catch (error) {
        showToast?.(error.message || 'Não foi possível guardar a chave de acesso.', 'error');
        return false;
      }
    }
  };

  return feature;
}

export function fillAssistedProcessFields(draft, { documentRef = globalThis.document, today = isoDate() } = {}) {
  if (!draft || !documentRef) return false;
  const values = {
    number: draft.number,
    court: draft.court,
    county: draft.county,
    courtUnit: draft.courtUnit,
    actionType: draft.actionType,
    registeredAt: String(draft.registeredAt || '').slice(0, 10),
    lastMovementAt: String(draft.lastMovementAt || '').slice(0, 10),
    lastMovement: draft.lastMovement
  };
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined || value === null || String(value).trim() === '') continue;
    const field = documentRef.getElementById(`field-${name}`);
    if (!field) continue;
    const mayReplace = !String(field.value || '').trim() || name === 'number' || (name === 'registeredAt' && field.value === today);
    if (!mayReplace) continue;
    if (field.tagName === 'SELECT' && ![...field.options].some(option => option.value === String(value))) {
      const option = documentRef.createElement('option');
      option.value = String(value);
      option.textContent = String(value);
      field.append(option);
    }
    field.value = String(value);
    field.dispatchEvent?.(new Event('change', { bubbles: true }));
  }
  const secrecy = documentRef.getElementById('field-secrecy');
  if (secrecy && draft.secrecy === true) secrecy.value = 'true';
  return true;
}

function processSuppressions(state) {
  return Array.isArray(state?.settings?.processDiscoverySuppressions) ? state.settings.processDiscoverySuppressions : [];
}

function normalizeCnj(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 20 ? digits : '';
}

function cleanAccessKey(value) {
  return String(value || '').trim().slice(0, 500);
}

function isProcessSuppressed(state, number) {
  const cnj = normalizeCnj(number);
  return Boolean(cnj && processSuppressions(state).some(item => normalizeCnj(item?.cnj || item) === cnj));
}

function isExternallyDiscoveredProcess(item) {
  return Boolean(normalizeCnj(item?.number) && (item?.externalId || item?.datajudAlias || /DJEN|DataJud|CNJ/i.test(String(item?.source || ''))));
}

function addProcessSuppression(state, item) {
  const cnj = normalizeCnj(item.number);
  if (!cnj || isProcessSuppressed(state, cnj)) return;
  state.settings ||= {};
  state.settings.processDiscoverySuppressions = [...processSuppressions(state), {
    cnj,
    deletedAt: new Date().toISOString(),
    source: String(item.source || 'Descoberta judicial').slice(0, 160),
    reason: 'user-deleted'
  }];
}

function snapshotProcessCollections(state) {
  return structuredClone({
    processes: state.processes,
    tasks: state.tasks,
    intimations: state.intimations,
    documents: state.documents,
    settings: state.settings,
    audit: state.audit
  });
}

function restoreProcessCollections(state, snapshot) {
  for (const key of ['processes', 'tasks', 'intimations', 'documents', 'settings', 'audit']) state[key] = snapshot[key];
}

function unlinkProcessReferences(state, item) {
  const number = String(item.number || '').trim();
  const cnj = normalizeCnj(number);
  for (const collection of ['tasks', 'intimations', 'documents']) {
    if (!Array.isArray(state[collection])) continue;
    state[collection] = state[collection].map(record => {
      const directId = String(record?.processId || '') === String(item.id);
      const owner = record?.ownerType === 'process' && String(record?.ownerId || '') === String(item.id);
      const linkedNumber = cnj && normalizeCnj(record?.process || record?.processNumber) === cnj;
      if (!directId && !owner && !linkedNumber) return record;
      const next = { ...record, unlinkedProcessNumber: number, unlinkedAt: new Date().toISOString() };
      if (directId) delete next.processId;
      if (owner) { delete next.ownerType; delete next.ownerId; }
      if (linkedNumber) {
        if ('process' in next) next.process = '';
        if ('processNumber' in next) next.processNumber = '';
      }
      return next;
    });
  }
}

function buildProcessDossier(state, item) {
  const number = String(item?.number || '').trim();
  const cnj = normalizeCnj(number);
  const linked = record => String(record?.processId || '') === String(item?.id)
    || (record?.ownerType === 'process' && String(record?.ownerId || '') === String(item?.id))
    || Boolean(cnj && normalizeCnj(record?.process || record?.processNumber) === cnj);
  const safe = value => stripSecrets(structuredClone(value));
  return {
    format: 'atrium-process-dossier',
    version: 1,
    exportedAt: new Date().toISOString(),
    scope: { processId: String(item?.id || ''), processNumber: number },
    process: safe(item),
    provenance: safe({ source: item?.source || '', externalId: item?.externalId || null, datajudAlias: item?.datajudAlias || null, collectedAt: item?.collectedAt || null, datajudUpdatedAt: item?.datajudUpdatedAt || null }),
    movements: safe(Array.isArray(item?.movements) ? item.movements : []),
    linked: {
      intimations: safe((state.intimations || []).filter(linked)),
      tasks: safe((state.tasks || []).filter(linked)),
      documents: safe((state.documents || []).filter(linked).map(document => ({
        id: document.id,
        name: document.name || document.fileName || document.title || '',
        type: document.type || document.mimeType || '',
        createdAt: document.createdAt || null,
        updatedAt: document.updatedAt || null,
        source: document.source || ''
      })))
    },
    audit: safe((state.audit || []).filter(entry => number && String(entry?.detail || '').includes(number)))
  };
}

function stripSecrets(value) {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (/(?:passphrase|password|secret|token|cookie|apiKey|certificate|pfx)/i.test(key)) continue;
    result[key] = stripSecrets(item);
  }
  return result;
}

function mergeExternalProcess(existing, incoming) {
  const current = safeExternalRecord(existing);
  const external = safeExternalRecord(incoming);
  const merged = { ...current };
  const officialFields = new Set(['court', 'actionType', 'subject', 'datajudAlias', 'collectedAt']);
  const authoritativeExternal = /DataJud|CNJ/i.test(String(external.source || ''));
  for (const [field, value] of Object.entries(external)) {
    if (!meaningful(value) || ['lastMovement', 'lastMovementAt', 'movements', 'monitoredTermIds', 'source'].includes(field)) continue;
    if (['id', 'externalId', 'number'].includes(field)) {
      if (!meaningful(merged[field])) merged[field] = value;
    } else if (field === 'datajudUpdatedAt') {
      if (!timestamp(merged[field]) || timestamp(value) >= timestamp(merged[field])) merged[field] = value;
    } else if (officialFields.has(field) && authoritativeExternal) {
      merged[field] = value;
    } else if (!meaningful(merged[field])) {
      merged[field] = value;
    }
  }
  merged.number = formatProcessNumber(external.number || current.number) || String(external.number || current.number || '').trim();
  const source = mergeSources(current.source, external.source);
  if (source) merged.source = source;
  const monitoredTermIds = uniqueStrings([...(current.monitoredTermIds || []), ...(external.monitoredTermIds || [])]);
  if (monitoredTermIds.length) merged.monitoredTermIds = monitoredTermIds;
  const currentMovementAt = timestamp(current.lastMovementAt);
  const incomingMovementAt = timestamp(external.lastMovementAt);
  if (incomingMovementAt && (!currentMovementAt || incomingMovementAt > currentMovementAt || (incomingMovementAt === currentMovementAt && !meaningful(current.lastMovement)))) {
    merged.lastMovementAt = external.lastMovementAt;
    if (meaningful(external.lastMovement)) merged.lastMovement = external.lastMovement;
  }
  if (Array.isArray(current.movements) || Array.isArray(external.movements)) merged.movements = mergeMovements(current.movements, external.movements);
  return merged;
}

function mergeMovements(left, right) {
  const byIdentity = new Map();
  for (const movement of [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])]) {
    if (!movement || typeof movement !== 'object' || Array.isArray(movement)) continue;
    const clean = safeExternalRecord(movement);
    const key = `${clean.code || ''}:${timestamp(clean.at)}:${String(clean.name || '').trim()}`;
    if (!byIdentity.has(key)) byIdentity.set(key, clean);
  }
  return [...byIdentity.values()].sort((a, b) => timestamp(b.at) - timestamp(a.at)).slice(0, 20);
}

function processIdentity(record) {
  const digits = String(record?.number || '').replace(/\D/g, '');
  if (digits.length === 20) return `number:${digits}`;
  const externalId = String(record?.externalId || record?.id || '').trim();
  return externalId ? `external:${externalId}` : '';
}

function formatProcessNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 20
    ? `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`
    : '';
}

function safeExternalRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return {};
  return Object.fromEntries(Object.entries(record).filter(([key]) => !['__proto__', 'prototype', 'constructor'].includes(key)));
}

function meaningful(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '' && !/^cliente n[aã]o informado$/i.test(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function mergeSources(left, right) {
  const sources = [left, right]
    .flatMap(value => String(value || '').split(' + '))
    .map(value => value.trim())
    .filter(Boolean);
  const unique = new Map();
  for (const source of sources) {
    const key = source.toLocaleLowerCase('pt-BR');
    if (!unique.has(key)) unique.set(key, source);
  }
  return [...unique.values()].join(' + ');
}

function timestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function uniqueStrings(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}
