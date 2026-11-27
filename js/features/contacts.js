import { Store, isoDate, uid } from '../core/store.js?v=3.4.0';
import { buildClientContext } from '../core/client-context.js?v=3.4.0';
import { findStrongDuplicateIndexes, pickKeeperIndex } from '../core/contact-identity.js?v=3.4.0';
import { renderContactsV2Workspace } from '../views/ui-v2/contacts-presenter.js?v=3.4.0';
import { transitionPageContent, focusPageControl } from '../views/ui-v2/page-transition.js?v=3.4.0';
import { installPanelSizeToggleFor, isPanelMaximized, resetPanelSize, setPanelSize, syncPanelSizeControl } from '../components/panel-size.js?v=3.4.0';
const plural = (count, singular, pluralForm) => `${count} ${Number(count) === 1 ? singular : pluralForm}`;

export const CONTACT_PAGE_SIZES = Object.freeze([25, 100, 500, 1000]);
export const CONTACT_DEFAULT_PAGE_SIZE = 25;
export const CONTACT_SEARCH_DEBOUNCE_MS = 150;

function contactTotalPages(total, size) {
  const safeSize = CONTACT_PAGE_SIZES.includes(size) ? size : CONTACT_DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.ceil((Number(total) || 0) / safeSize));
}

export function createContactsFeature({
  store = Store,
  documentRef = globalThis.document,
  normalizeText,
  escapeHtml,
  formatDate,
  sortRecords,
  updateTableSortHeaders,
  openModal,
  openOwnerDocuments,
  openProcess,
  openTask,
  openPublication,
  openAgenda,
  openDocument,
  openFinancial,
  openAssistant,
  secureFetch,
  showToast = () => {}
} = {}) {
  let initialized = false;
  const sort = { field: 'name', direction: 'asc' };
  let roleFilter = 'all';
  let selectedContactId = null;
  let restoreContactId = null;
  let currentPage = 1;
  let pageSize = CONTACT_DEFAULT_PAGE_SIZE;
  let lastFilteredTotal = 0;
  let searchDebounceTimer = 0;
  let contactsDataVersion = 0;
  let lastListRef = null;
  let lastListLength = -1;
  let lastDataVersion = -1;
  let lastNeedle = null;
  let lastRole = null;
  let lastSortField = null;
  let lastSortDir = null;
  let lastFilteredSorted = null;
  const inspectorInertElements = new Set();
  const byId = id => documentRef?.getElementById(id);
  const isV2 = () => documentRef?.documentElement?.dataset?.ui === 'v2';

  const readContacts = () => (Array.isArray(store.state.contacts) ? store.state.contacts : []);
  // Reaproveita filtro+sort entre navegações de página sem alterar resultado:
  // a chave inclui identidade/tamanho do array, versão de escritas da feature,
  // busca, papel e ordenação. Hidratacões e substituicões trocam a referência;
  // escritas externas elemento a elemento não existem fora desta feature.
  const getFilteredSorted = needle => {
    const list = readContacts();
    if (lastFilteredSorted
      && lastListRef === list
      && lastListLength === list.length
      && lastDataVersion === contactsDataVersion
      && lastNeedle === needle
      && lastRole === roleFilter
      && lastSortField === sort.field
      && lastSortDir === sort.direction) return lastFilteredSorted;
    const filtered = sortRecords(list.filter(item => !needle || normalizeText(`${item.name} ${item.document} ${item.mobile} ${item.phone} ${item.email} ${item.origin} ${item.contactRole || ''} ${item.leadOrigin || ''} ${item.city || ''} ${item.registeredAt || item.createdAt || ''} ${item.companyProfile?.tradeName || ''} ${item.companyProfile?.primaryActivity || ''} ${item.companyProfile?.status || ''} ${item.companyProfile?.legalNature || ''} ${(item.companyProfile?.qsa || []).map(p => p.name).join(' ')}`).includes(needle)), sort);
    lastListRef = list;
    lastListLength = list.length;
    lastDataVersion = contactsDataVersion;
    lastNeedle = needle;
    lastRole = roleFilter;
    lastSortField = sort.field;
    lastSortDir = sort.direction;
    lastFilteredSorted = filtered;
    return filtered;
  };

  const feature = {
    init() {
      if (initialized) return false;
      initialized = true;
      byId('newContactButton')?.addEventListener('click', () => this.openContactModal());
      byId('contactSearch')?.addEventListener('input', event => {
        const value = event.target.value;
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          searchDebounceTimer = 0;
          this.render(value, { resetPage: true });
        }, CONTACT_SEARCH_DEBOUNCE_MS);
      });
      installPanelSizeToggleFor(byId('contactsV2Workspace'), '#contactInspector');
      byId('contactsV2Workspace')?.addEventListener('click', event => this.handleWorkspaceClick(event));
      byId('contactsV2Workspace')?.addEventListener('keydown', event => this.handleWorkspaceKeydown(event));
      byId('view-contacts')?.addEventListener('click', event => this.handlePaginationClick(event));
      return true;
    },

    get roleFilter() { return roleFilter; },
    get selectedContactId() { return selectedContactId; },
    get page() { return currentPage; },
    get pageSize() { return pageSize; },
    get pagination() {
      return {
        page: currentPage,
        pageSize,
        total: lastFilteredTotal,
        totalPages: contactTotalPages(lastFilteredTotal, pageSize)
      };
    },

    setPageSize(value) {
      const size = Number(value);
      if (!CONTACT_PAGE_SIZES.includes(size) || size === pageSize) return pageSize;
      pageSize = size;
      currentPage = 1;
      this.render(byId('contactSearch')?.value || '', { resetPage: false });
      return pageSize;
    },

    setPage(value) {
      const pages = contactTotalPages(lastFilteredTotal, pageSize);
      let next = currentPage;
      if (value === 'first') next = 1;
      else if (value === 'prev') next = currentPage - 1;
      else if (value === 'next') next = currentPage + 1;
      else if (value === 'last') next = pages;
      else if (Number.isFinite(Number(value))) next = Math.trunc(Number(value));
      currentPage = Math.max(1, Math.min(pages, next || 1));
      this.render(byId('contactSearch')?.value || '');
      return currentPage;
    },

    setRoleFilter(value) {
      const allowed = ['all', 'cliente', 'testemunha', 'perito', 'adverso', 'correspondente', 'preposto', 'outro'];
      roleFilter = allowed.includes(value) ? value : 'all';
      selectedContactId = null;
      this.render(byId('contactSearch')?.value || '', { resetPage: true });
      return roleFilter;
    },

    selectContact(id, { focusInspector = true } = {}) {
      const item = store.state.contacts.find(record => String(record.id) === String(id));
      if (!item) return null;
      selectedContactId = item.id;
      restoreContactId = item.id;
      const needle = normalizeText(byId('contactSearch')?.value || '');
      const scoped = (roleFilter === 'all' ? getFilteredSorted(needle) : getFilteredSorted(needle).filter(candidate => candidate.contactRole === roleFilter));
      const index = scoped.findIndex(candidate => String(candidate.id) === String(item.id));
      if (index >= 0) currentPage = Math.floor(index / pageSize) + 1;
      this.render(byId('contactSearch')?.value || '');
      if (focusInspector) queueMicrotask(() => {
        const target = byId('contactInspector')?.querySelector('[data-contact-inspector-close]');
        target?.focus();
      });
      return item;
    },

    closeInspector({ restoreFocus = true } = {}) {
      const contactId = restoreContactId;
      selectedContactId = null;
      resetPanelSize(byId('contactInspector'));
      this.render(byId('contactSearch')?.value || '');
      if (restoreFocus && contactId) queueMicrotask(() => {
        [...documentRef.querySelectorAll('#contactsV2Workspace [data-contact-id]')]
          .find(element => String(element.dataset.contactId) === String(contactId))?.focus();
      });
      return true;
    },

    handleSort(field) {
      if (sort.field === field) {
        sort.direction = sort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        sort.field = field;
        sort.direction = field.includes('At') || field.includes('date') ? 'desc' : 'asc';
      }
      this.render(byId('contactSearch')?.value || '', { resetPage: true });
      return { ...sort };
    },

    upsertExternalContact(record) {
      const incoming = safeExternalRecord(record);
      if (!meaningful(incoming.name)) return null;
      store.state.contacts = Array.isArray(store.state.contacts) ? store.state.contacts : [];
      const index = contactMatchIndex(store.state.contacts, incoming);
      if (index < 0) {
        // Colapso de duplicados fortes: 2+ registros com o mesmo documento ou
        // externalId fundem o recebido no mais antigo em vez de gerar outro.
        // Homônimos só por nome continuam criando registro próprio.
        const strong = findStrongDuplicateIndexes(store.state.contacts, incoming);
        if (strong.length > 1) {
          const keeperIndex = pickKeeperIndex(store.state.contacts, strong);
          const merged = mergeExternalContact(store.state.contacts[keeperIndex], incoming);
          if (!merged.id) merged.id = incoming.id || String(store.state.contacts[keeperIndex]?.id || '') || uid('contact');
          if (!meaningful(merged.contactRole) && isExternalContact(incoming)) merged.contactRole = 'outro';
          store.state.contacts[keeperIndex] = merged;
          contactsDataVersion++;
          return merged;
        }
      }
      const merged = mergeExternalContact(index >= 0 ? store.state.contacts[index] : null, incoming);
      if (!merged.id) merged.id = incoming.id || uid('contact');
      if (!meaningful(merged.contactRole) && isExternalContact(incoming)) merged.contactRole = 'outro';
      if (index >= 0) store.state.contacts[index] = merged;
      else store.state.contacts.unshift(merged);
      contactsDataVersion++;
      return merged;
    },

    render(query = '', { resetPage = false } = {}) {
      if (resetPage) currentPage = 1;
      const needle = normalizeText(query);
      const records = getFilteredSorted(needle);
      // Busca + papel definem o recorte visível. O contador do toolbar precisa acompanhar
      // esse recorte; antes ele lia `store.state.contacts.length` e contradizia a lista e o
      // rodapé ("250 contatos" acima de um resultado só).
      const visibleFiltered = roleFilter === 'all'
        ? records
        : records.filter(item => String(item.contactRole || '').trim() === roleFilter);
      updateTableSortHeaders('contactTable', sort);
      const countTarget = byId('contactCount');
      if (countTarget) {
        const filteredRecords = isV2() ? visibleFiltered : records;
        const total = store.state.contacts.length;
        countTarget.textContent = (needle || (isV2() && roleFilter !== 'all'))
          ? `${filteredRecords.length} de ${plural(total, 'contato', 'contatos')}`
          : plural(total, 'contato', 'contatos');
      }
      if (isV2()) {
        if (selectedContactId && !visibleFiltered.some(item => String(item.id) === String(selectedContactId))) selectedContactId = null;
        lastFilteredTotal = visibleFiltered.length;
        const totalPages = contactTotalPages(visibleFiltered.length, pageSize);
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;
        const start = (currentPage - 1) * pageSize;
        const pageRecords = visibleFiltered.slice(start, start + pageSize);
        const pagination = { page: currentPage, pageSize, total: visibleFiltered.length, totalPages };
        const previousFilterScroll = byId('contactsV2Workspace')?.querySelector('.contact-role-filters')?.scrollLeft || 0;
        const tableBody = byId('contactTableBody');
        if (tableBody) tableBody.innerHTML = '';
        const workspace = byId('contactsV2Workspace');
        const inspectorWasMaximized = isPanelMaximized(byId('contactInspector'));
        if (workspace) workspace.innerHTML = renderContactsV2Workspace({
          records: pageRecords,
          allRecords: store.state.contacts,
          selectedId: selectedContactId,
          selectedContext: buildClientContext(store.state, store.state.contacts.find(item => String(item.id) === String(selectedContactId || ''))),
          roleFilter,
          query,
          sort,
          pagination,
          escapeHtml,
          formatDate
        });
        const renderedInspector = byId('contactInspector');
        if (renderedInspector) {
          if (inspectorWasMaximized) setPanelSize(renderedInspector, true);
          syncPanelSizeControl(renderedInspector);
        }
        const filterStrip = byId('contactsV2Workspace')?.querySelector('.contact-role-filters');
        if (filterStrip) {
          filterStrip.scrollLeft = previousFilterScroll;
          const activeFilter = filterStrip.querySelector('.contact-role-filter.is-active');
          if (activeFilter && filterStrip.clientWidth < filterStrip.scrollWidth) {
            const left = activeFilter.offsetLeft - filterStrip.offsetLeft;
            const right = left + activeFilter.offsetWidth;
            if (left < filterStrip.scrollLeft) filterStrip.scrollLeft = left;
            else if (right > filterStrip.scrollLeft + filterStrip.clientWidth) filterStrip.scrollLeft = right - filterStrip.clientWidth;
          }
        }
        this.syncInspectorSemantics();
        return pageRecords;
      }
      lastFilteredTotal = records.length;
      const classicTotalPages = contactTotalPages(records.length, pageSize);
      if (currentPage > classicTotalPages) currentPage = classicTotalPages;
      if (currentPage < 1) currentPage = 1;
      const classicStart = (currentPage - 1) * pageSize;
      const classicPage = records.slice(classicStart, classicStart + pageSize);
      const classicPagination = { page: currentPage, pageSize, total: records.length, totalPages: classicTotalPages };
      const workspace = byId('contactsV2Workspace');
      if (workspace) workspace.innerHTML = '';
      const roleMap = { cliente: 'Cliente', testemunha: 'Testemunha', perito: 'Perito Judicial', adverso: 'Adv. Adverso', correspondente: 'Correspondente', preposto: 'Preposto', outro: 'Outro' };
      const tableBody = byId('contactTableBody');
      if (tableBody) tableBody.innerHTML = classicPage.length ? classicPage.map(item => {
        const registeredDate = item.registeredAt || item.createdAt;
        const roleLabel = roleMap[item.contactRole] || (item.contactRole ? escapeHtml(item.contactRole) : 'Cliente');
        const roleBadge = `<span class="fee-chip fixo" style="font-size:0.72rem;padding:2px 6px;margin-right:4px;">${roleLabel}</span>`;
        const originLabel = item.leadOrigin ? escapeHtml(item.leadOrigin) : escapeHtml(item.origin || 'Direta');
        return `
        <tr data-contact-id="${escapeHtml(item.id)}" tabindex="0">
          <td>
            ${roleBadge}<strong>${escapeHtml(item.name)}</strong>
            <small>${escapeHtml(item.profession || 'Pessoa cadastrada')}</small>
          </td>
          <td><strong>${escapeHtml(item.document || '—')}</strong><small>${escapeHtml(item.rg || '')}</small></td>
          <td><strong>${escapeHtml(item.mobile || item.phone || '—')}</strong><small>${escapeHtml(item.email || '')}</small></td>
          <td><strong>${escapeHtml(item.city || '—')}</strong><small>${escapeHtml([item.state, item.country].filter(Boolean).join(' · '))}</small></td>
          <td><strong>${escapeHtml(formatDate(registeredDate))}</strong><small>${item.externalId ? `ID ${escapeHtml(item.externalId)}` : 'Manual'}</small></td>
          <td>${originLabel}</td>
        </tr>`;
      }).join('') : '<tr><td colspan="6">Nenhum contato encontrado.</td></tr>';
      this.renderClassicPagination(classicPagination);
      documentRef.querySelectorAll('#contactTableBody [data-contact-id]').forEach(row => row.addEventListener('click', () => {
        const item = store.state.contacts.find(record => record.id === row.dataset.contactId);
        if (item) this.openContactModal(item);
      }));
      return classicPage;
    },

    renderClassicPagination(pagination) {
      const table = byId('contactTable');
      if (!table) return false;
      let container = byId('contactsClassicPagination');
      if (!container) {
        container = documentRef.createElement?.('div');
        if (!container) return false;
        container.id = 'contactsClassicPagination';
        container.className = 'contacts-classic-pagination classic-only';
        table.parentElement?.appendChild(container);
      }
      const totalLabel = Number(pagination.total).toLocaleString('pt-BR');
      container.innerHTML = `<nav class="contact-pagination is-classic" aria-label="Paginação de contatos">`
        + `<p class="contact-pagination-status">Página ${pagination.page} de ${pagination.totalPages} · ${totalLabel} no filtro</p>`
        + `<div class="contact-pagination-nav" role="group" aria-label="Navegar páginas">`
        + `<button type="button" class="button ghost" data-contact-page="first"${pagination.page <= 1 ? ' disabled' : ''} aria-label="Primeira página">Primeira</button>`
        + `<button type="button" class="button ghost" data-contact-page="prev"${pagination.page <= 1 ? ' disabled' : ''} aria-label="Página anterior">Anterior</button>`
        + `<button type="button" class="button ghost" data-contact-page="next"${pagination.page >= pagination.totalPages ? ' disabled' : ''} aria-label="Próxima página">Próxima</button>`
        + `<button type="button" class="button ghost" data-contact-page="last"${pagination.page >= pagination.totalPages ? ' disabled' : ''} aria-label="Última página">Última</button>`
        + `</div>`
        + `<div class="contact-page-size" role="group" aria-label="Contatos por página"><span>Por página</span>`
        + CONTACT_PAGE_SIZES.map(size => `<button type="button" class="${size === pagination.pageSize ? 'button gold' : 'button ghost'}" data-contact-page-size="${size}" aria-pressed="${size === pagination.pageSize}">${size}</button>`).join('')
        + `</div></nav>`;
      return true;
    },

    async handlePaginationClick(event) {
      const sizeTarget = event.target.closest?.('[data-contact-page-size]');
      if (sizeTarget) {
        const size = Number(sizeTarget.dataset.contactPageSize);
        if (!CONTACT_PAGE_SIZES.includes(size) || size === pageSize) return true;
        pageSize = size;
        currentPage = 1;
        this.render(byId('contactSearch')?.value || '');
        queueMicrotask(() => {
          documentRef.querySelector?.(`#view-contacts [data-contact-page-size="${size}"]`)?.focus({ preventScroll: true });
        });
        return true;
      }
      const pageTarget = event.target.closest?.('[data-contact-page]');
      if (!pageTarget) return false;
      const pages = contactTotalPages(lastFilteredTotal, pageSize);
      const action = pageTarget.dataset.contactPage;
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
      await transitionPageContent(documentRef, { v2: '#contactsV2Workspace .contact-record-list' }, direction,
        () => this.render(byId('contactSearch')?.value || ''));
      focusPageControl(documentRef, '#view-contacts', 'data-contact-page', action, direction > 0 ? 'prev' : 'next');
      return true;
    },

    handleWorkspaceClick(event) {
      if (event.target.hasAttribute?.('data-contact-backdrop')) { this.closeInspector(); return; }
      if (event.target.closest?.('[data-contact-page],[data-contact-page-size]')) return;
      const target = event.target.closest('button');
      if (!target) return;
      if (target.dataset.contactRoleFilter) {
        this.setRoleFilter(target.dataset.contactRoleFilter);
        return;
      }
      if (target.dataset.contactSortField) {
        this.handleSort(target.dataset.contactSortField);
        return;
      }
      if (target.dataset.contactId) {
        this.selectContact(target.dataset.contactId);
        return;
      }
      if (target.hasAttribute('data-contact-inspector-close')) {
        this.closeInspector();
        return;
      }
      if (target.hasAttribute('data-contact-edit')) {
        const item = store.state.contacts.find(record => String(record.id) === String(selectedContactId));
        if (item) this.openContactModal(item);
        return;
      }
      if (target.hasAttribute('data-contact-registry-refresh')) {
        const item = store.state.contacts.find(record => String(record.id) === String(selectedContactId));
        if (item) this.openContactModal(item, { autoLookupDocument: true });
        return;
      }
      if (target.hasAttribute('data-contact-documents')) {
        byId('btnGenDocContact')?.click();
        return;
      }
      if (target.hasAttribute('data-contact-archive')) {
        if (selectedContactId) openOwnerDocuments?.('contact', selectedContactId);
        return;
      }
      if (target.hasAttribute('data-contact-assistant')) {
        const item = store.state.contacts.find(record => String(record.id) === String(selectedContactId));
        if (item) openAssistant?.(item);
        return;
      }
      const context = buildClientContext(store.state, store.state.contacts.find(item => String(item.id) === String(selectedContactId || '')));
      if (target.dataset.contactProcess) {
        const process = context.processes.find(item => String(item.id) === target.dataset.contactProcess);
        if (process) openProcess?.(process);
        return;
      }
      if (target.dataset.contactTask) {
        const task = context.tasks.find(item => String(item.id) === target.dataset.contactTask);
        if (task) openTask?.(task);
        return;
      }
      if (target.dataset.contactPublication) {
        const publication = context.publications.find(item => String(item.id) === target.dataset.contactPublication);
        if (publication) openPublication?.(publication);
        return;
      }
      if (target.dataset.contactAgenda) {
        const appointment = context.appointments.find(item => String(item.id) === target.dataset.contactAgenda);
        if (appointment) openAgenda?.(appointment);
        return;
      }
      if (target.dataset.contactDocument) {
        const document = context.documents.find(item => String(item.id) === target.dataset.contactDocument);
        if (document) openDocument?.(document);
        return;
      }
      if (target.dataset.contactFinancial) {
        const process = context.processes.find(item => String(item.id) === target.dataset.contactFinancial);
        if (process) openFinancial?.(process);
        return;
      }
      if (target.dataset.contactContextEvent) {
        const timelineEvent = context.timeline.find(item => item.contextId === target.dataset.contactContextEvent);
        if (!timelineEvent) return;
        if (timelineEvent.target === 'task') {
          const task = context.tasks.find(item => String(item.id) === timelineEvent.entityId);
          if (task) openTask?.(task);
        } else if (timelineEvent.target === 'publication') {
          const publication = context.publications.find(item => String(item.id) === timelineEvent.entityId);
          if (publication) openPublication?.(publication);
        } else if (timelineEvent.target === 'agenda') {
          const appointment = context.appointments.find(item => String(item.id) === timelineEvent.entityId);
          if (appointment) openAgenda?.(appointment);
        } else if (timelineEvent.target === 'document') {
          const document = context.documents.find(item => String(item.id) === timelineEvent.entityId);
          if (document) openDocument?.(document);
        } else if (timelineEvent.target === 'financial') {
          const process = context.processes.find(item => String(item.id) === timelineEvent.processId);
          if (process) openFinancial?.(process);
        }
        return;
      }
      if (target.hasAttribute('data-contact-create')) this.openContactModal();
      if (target.hasAttribute('data-contact-clear-search')) {
        const search = byId('contactSearch');
        if (search) search.value = '';
        this.render('', { resetPage: true });
        search?.focus();
      }
    },

    handleWorkspaceKeydown(event) {
      if (event.key === 'Escape' && selectedContactId) {
        event.preventDefault();
        event.stopPropagation();
        this.closeInspector();
        return;
      }
      if (event.key !== 'Tab' || !selectedContactId) return;
      const inspector = byId('contactInspector');
      const focusable = [...(inspector?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])]
        .filter(element => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && documentRef.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && documentRef.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },

    syncInspectorSemantics() {
      for (const element of inspectorInertElements) element.removeAttribute('inert');
      inspectorInertElements.clear();
      const inspector = byId('contactInspector');
      if (!inspector) return;
      inspector.setAttribute('role', selectedContactId ? 'dialog' : 'region');
      if (selectedContactId) inspector.setAttribute('aria-modal', 'true');
      else inspector.removeAttribute('aria-modal');
      if (selectedContactId) {
        // Isolate only the application behind this nested drawer. Body-level
        // editors and document dialogs remain available above it.
        const shell = byId('appShell');
        if (!shell?.contains(inspector)) return;
        for (let branch = inspector; branch && branch !== shell; branch = branch.parentElement) {
          for (const sibling of branch.parentElement.children) {
            if (sibling === branch || sibling.hasAttribute('data-contact-backdrop') || sibling.hasAttribute('inert') || sibling.classList.contains('topbar')) continue;
            sibling.setAttribute('inert', '');
            inspectorInertElements.add(sibling);
          }
        }
      }
    },

    isMobileViewport() {
      return Boolean(documentRef?.defaultView?.matchMedia?.('(max-width: 760px)').matches);
    },

    openContactModal(defaults = {}, { autoLookupDocument = false } = {}) {
      const v2 = isV2();
      const modalDefaults = { source: 'Interna', contactRole: 'cliente', leadOrigin: 'indicacao', ...defaults };
      openModal?.('contact', defaults.id ? (v2 ? 'Editar contato' : 'Detalhes do contato') : 'Novo contato', v2 ? 'Pessoas e relacionamentos' : 'Cadastro de pessoas', [
        { name: 'name', label: 'Nome completo / razão social', required: true, full: true },
        { name: 'contactRole', label: 'Papel do contato', type: 'select', options: [{value:'cliente',label:'Cliente / Outorgante'},{value:'testemunha',label:'Testemunha'},{value:'perito',label:'Perito Judicial / Assistente'},{value:'adverso',label:'Advogado Adverso / Parte Contrária'},{value:'correspondente',label:'Correspondente Jurídico'},{value:'preposto',label:'Preposto / Representante'},{value:'outro',label:'Outro Contato'}] },
        { name: 'leadOrigin', label: 'Origem do contato / captação', type: 'select', options: [{value:'indicacao',label:'Indicação de Cliente'},{value:'parceria',label:'Parceria Profissional'},{value:'balcao',label:'Balcão / Atendimento Direto'},{value:'redes_sociais',label:'Redes Sociais / WhatsApp'},{value:'google_site',label:'Google / Site do Escritório'},{value:'convenio',label:'Convênio / Entidade Sindical'},{value:'outro',label:'Outra Origem'}] },
        { name: 'document', label: 'CPF / CNPJ' }, { name: 'rg', label: 'RG' },
        { name: 'birthDate', label: 'Data de nascimento', type: 'date' }, { name: 'profession', label: 'Profissão' }, { name: 'maritalStatus', label: 'Estado civil' },
        { name: 'gender', label: 'Sexo' }, { name: 'nationality', label: 'Nacionalidade' }, { name: 'birthPlace', label: 'Naturalidade' },
        { name: 'motherName', label: 'Nome da mãe' }, { name: 'fatherName', label: 'Nome do pai' },
        { name: 'mobile', label: 'Celular' }, { name: 'phone', label: 'Telefone' }, { name: 'email', label: 'E-mail', type: 'email' },
        { name: 'origin', label: 'Origem (texto livre)' }, { name: 'city', label: 'Cidade' }, { name: 'state', label: 'Estado' },
        { name: 'address', label: 'Endereço', full: true }, { name: 'district', label: 'Bairro' }, { name: 'zip', label: 'CEP' },
        { name: 'notes', label: 'Anotações gerais', type: 'textarea', full: true }
      ], modalDefaults, v2 ? registryReviewShell({ collapsed: Boolean(defaults.id) && !autoLookupDocument }) : '');
      if (v2) this.installRegistryReview(modalDefaults, { autoLookupDocument });
    },

    installRegistryReview(modalDefaults, { autoLookupDocument = false } = {}) {
      const panel = byId('contactRegistryReview');
      if (!panel || typeof secureFetch !== 'function') return false;
      let currentResult = null;
      let cepLookupActive = false;
      let documentLookupActive = false;
      let autoLookupTimer = 0;
      let lastQueriedDocument = '';
      const setStatus = (message, state = 'neutral') => {
        const status = panel.querySelector('[data-registry-status]');
        if (!status) return;
        status.textContent = message;
        status.dataset.state = state;
      };
      const applySelectedFields = (boxes, { formatDocumentField = false } = {}) => {
        const appliedFields = [];
        boxes.forEach(input => {
          const target = byId(`field-${input.dataset.registryField}`);
          if (!target) return;
          target.value = input.dataset.registryValue || '';
          target.dispatchEvent(new Event('input', { bubbles: true }));
          appliedFields.push(input.dataset.registryField);
        });
        if (formatDocumentField && currentResult?.document) {
          const docTarget = byId('field-document');
          const rawDoc = String(docTarget?.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (docTarget && (!rawDoc || rawDoc === currentResult.normalizedDocument) && docTarget.value !== currentResult.document) {
            docTarget.value = currentResult.document;
            docTarget.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        return appliedFields;
      };
      const runDocumentLookup = async ({ triggeredByAuto = false } = {}) => {
        if (autoLookupTimer) { clearTimeout(autoLookupTimer); autoLookupTimer = 0; }
        if (documentLookupActive || !panel.isConnected) return;
        const documentInput = byId('field-document');
        const value = documentInput?.value || '';
        const normalizedRaw = String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!normalizedRaw) {
          if (!triggeredByAuto) setStatus('Informe um CPF ou CNPJ para validar/consultar.', 'attention');
          return;
        }
        documentLookupActive = true;
        setStatus('Validando o documento informado…', 'loading');
        try {
          const validation = await registryRequest(secureFetch, `/api/registry/document/validate?value=${encodeURIComponent(value)}`);
          if (!panel.isConnected) return;
          if (validation.type === 'cpf') {
            currentResult = null;
            panel.querySelector('[data-registry-results]').innerHTML = registryCpfResult(validation, escapeHtml);
            setStatus(validation.valid ? validation.message : 'CPF inválido. Revise os dígitos antes de salvar.', validation.valid ? 'attention' : 'error');
            return;
          }
          if (validation.type !== 'cnpj' || !validation.valid) {
            if (triggeredByAuto) {
              setStatus('CNPJ com dígito verificador inválido. Revise antes de consultar.', 'attention');
              return;
            }
            throw new Error('CNPJ inválido. Revise os caracteres e os dígitos verificadores.');
          }
          lastQueriedDocument = validation.normalized;
          setStatus('Consultando CNPJ (CNPJá Open / fonte pública)…', 'loading');
          store.audit('Consulta cadastral iniciada', 'CNPJ · fonte pública supervisionada');
          currentResult = await registryRequest(secureFetch, `/api/registry/cnpj?value=${encodeURIComponent(validation.normalized)}`);
          if (!panel.isConnected) return;
          const candidates = registryDuplicateCandidates(store.state, currentResult, modalDefaults.id);
          const currentValues = registryCurrentValues(byId);
          panel.querySelector('[data-registry-results]').innerHTML = registryCnpjResult(currentResult, candidates, currentValues, escapeHtml);
          setStatus(`Consulta ${currentResult.registry?.freshness === 'cached' ? 'em cache' : 'ao vivo'} concluída. Revise ou preencha os campos vazios antes de salvar.`, 'success');
        } catch (error) {
          lastQueriedDocument = '';
          if (triggeredByAuto) {
            setStatus(error.message || 'Não foi possível consultar o CNPJ automaticamente.', 'attention');
            return;
          }
          currentResult = null;
          const resultsEl = panel.querySelector('[data-registry-results]');
          if (resultsEl) resultsEl.innerHTML = '';
          setStatus(error.message || 'Não foi possível consultar o cadastro.', 'error');
        } finally {
          documentLookupActive = false;
        }
      };

      byId('field-document')?.addEventListener('input', event => {
        if (autoLookupTimer) { clearTimeout(autoLookupTimer); autoLookupTimer = 0; }
        const normalized = String(event.target?.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (/^[A-Z0-9]{12}\d{2}$/.test(normalized) && normalized !== lastQueriedDocument) {
          autoLookupTimer = setTimeout(() => {
            autoLookupTimer = 0;
            runDocumentLookup({ triggeredByAuto: true });
          }, 450);
        }
      });
      byId('field-zip')?.addEventListener('change', () => {
        if (/^\d{8}$/.test(String(byId('field-zip')?.value || '').replace(/\D/g, ''))) panel.querySelector('[data-registry-action="cep"]')?.click();
      });
      panel.addEventListener('click', async event => {
        const actionEl = event.target.closest('[data-registry-action]');
        const action = actionEl?.dataset.registryAction;
        if (!action) return;
        if (action === 'document') {
          await runDocumentLookup({ triggeredByAuto: false });
          return;
        }
        if (action === 'cep') {
          if (cepLookupActive) return;
          cepLookupActive = true;
          const value = byId('field-zip')?.value || '';
          setStatus('Consultando o CEP informado…', 'loading');
          try {
            store.audit('Consulta cadastral iniciada', 'CEP · fonte pública supervisionada');
            const result = await registryRequest(secureFetch, `/api/registry/cep?value=${encodeURIComponent(value)}`);
            currentResult = { ...(currentResult || {}), ...result, registry: result.registry };
            panel.querySelector('[data-registry-results]').innerHTML = registryAddressResult(result, escapeHtml);
            setStatus(`Endereço ${result.registry?.freshness === 'cached' ? 'em cache' : 'consultado ao vivo'}. Revise antes de aplicar.`, 'success');
          } catch (error) {
            setStatus(error.message || 'Não foi possível consultar o CEP.', 'error');
          } finally {
            cepLookupActive = false;
          }
          return;
        }
        if (action === 'toggle-all') {
          const boxes = [...panel.querySelectorAll('[data-registry-field]')];
          if (!boxes.length) return;
          const nextState = boxes.some(box => !box.checked);
          boxes.forEach(box => { box.checked = nextState; });
          if (actionEl) actionEl.textContent = nextState ? 'Desmarcar todos' : 'Marcar todos';
          return;
        }
        if (action === 'apply-empty') {
          const emptyBoxes = [...panel.querySelectorAll('[data-registry-field]')].filter(input => {
            const target = byId(`field-${input.dataset.registryField}`);
            return target && !String(target.value || '').trim();
          });
          if (!emptyBoxes.length) {
            setStatus('Todos os campos encontrados já estão preenchidos. Marque manualmente caso queira substituir.', 'attention');
            return;
          }
          emptyBoxes.forEach(input => { input.checked = true; });
          const appliedFields = applySelectedFields(emptyBoxes, { formatDocumentField: true });
          modalDefaults.registryProvenance = mergeRegistryProvenance(modalDefaults.registryProvenance, currentResult, appliedFields);
          if (currentResult?.normalizedDocument || currentResult?.legalName) {
            modalDefaults.companyProfile = buildCompanyProfile(currentResult);
          }
          store.audit('Campos cadastrais revisados', `${appliedFields.join(', ')} · preenchimento de vazios`);
          setStatus(`${plural(appliedFields.length, 'campo vazio preenchido', 'campos vazios preenchidos')}. O salvamento continua sob sua confirmação.`, 'success');
          return;
        }
        if (action === 'apply') {
          const selected = [...panel.querySelectorAll('[data-registry-field]:checked')];
          const appliedFields = applySelectedFields(selected, { formatDocumentField: true });
          if (!appliedFields.length) {
            setStatus('Selecione ao menos um campo para aplicar.', 'attention');
            return;
          }
          modalDefaults.registryProvenance = mergeRegistryProvenance(modalDefaults.registryProvenance, currentResult, appliedFields);
          if (currentResult?.normalizedDocument || currentResult?.legalName) {
            modalDefaults.companyProfile = buildCompanyProfile(currentResult);
          }
          store.audit('Campos cadastrais revisados', `${appliedFields.join(', ')} · aplicação humana`);
          setStatus(`${plural(appliedFields.length, 'campo aplicado', 'campos aplicados')}. O salvamento continua sob sua confirmação.`, 'success');
          return;
        }
        if (action === 'keep-current' || action === 'cancel-review') {
          currentResult = null;
          panel.querySelector('[data-registry-results]').innerHTML = '';
          setStatus(action === 'keep-current' ? 'Cadastro atual mantido. Nenhum campo foi alterado.' : 'Revisão cancelada. Nenhum campo foi alterado.', 'neutral');
          return;
        }
        if (action === 'qsa') {
          const partnerIndex = Number(event.target.closest('[data-registry-partner-index]')?.dataset.registryPartnerIndex);
          const partner = currentResult?.qsa?.[partnerIndex];
          if (!partner?.name) return;
          const match = registryPartnerMatch(store.state.contacts, partner.name);
          if (match) {
            setStatus(`Já existe contato com o mesmo nome: ${match.name}. Nenhuma mesclagem foi feita.`, 'attention');
            return;
          }
          modalDefaults._registryQsaImports = Array.isArray(modalDefaults._registryQsaImports) ? modalDefaults._registryQsaImports : [];
          const registrySource = currentResult.registry?.source || 'CNPJá Open · dados públicos de CNPJ';
          const providerLabel = String(registrySource).split('·')[0].trim() || 'Fonte pública';
          if (!modalDefaults._registryQsaImports.some(item => normalizeIdentity(item.name) === normalizeIdentity(partner.name))) {
            modalDefaults._registryQsaImports.push({
              ...partner,
              sourceName: currentResult.legalName || currentResult.tradeName || 'Pessoa jurídica consultada',
              providerLabel,
              registrySource
            });
          }
          event.target.closest('[data-registry-partner-index]').disabled = true;
          event.target.closest('[data-registry-partner-index]').textContent = 'Importação preparada';
          setStatus('Sócio preparado como contato de papel “Outro”. A criação ocorrerá somente ao salvar.', 'success');
        }
      });
      if (autoLookupDocument && /^[A-Z0-9]{12}\d{2}$/.test(String(byId('field-document')?.value || '').toUpperCase().replace(/[^A-Z0-9]/g, ''))) {
        queueMicrotask(() => runDocumentLookup({ triggeredByAuto: false }));
      }
      return true;
    },

    saveContact(data, defaults = {}) {
      const editing = Boolean(defaults.id);
      const pendingQsaImports = Array.isArray(defaults._registryQsaImports) ? defaults._registryQsaImports : [];
      const safeDefaults = { ...defaults };
      delete safeDefaults._registryQsaImports;
      const record = {
        id: safeDefaults.id || uid('contact'),
        externalId: safeDefaults.externalId || null,
        registeredAt: safeDefaults.registeredAt || isoDate(),
        ...safeDefaults,
        ...data,
        ...(safeDefaults.companyProfile && typeof safeDefaults.companyProfile === 'object'
          ? { companyProfile: structuredClone(safeDefaults.companyProfile) }
          : {}),
        ...(safeDefaults.eprocPerson && typeof safeDefaults.eprocPerson === 'object'
          ? { eprocPerson: structuredClone(safeDefaults.eprocPerson) }
          : {}),
        ...(Array.isArray(safeDefaults.relatedProcessNumbers)
          ? { relatedProcessNumbers: [...safeDefaults.relatedProcessNumbers] }
          : {}),
        updatedAt: new Date().toISOString()
      };
      store.upsert('contacts', record);
      contactsDataVersion++;
      store.audit(editing ? 'Contato atualizado' : 'Contato cadastrado', record.name);
      for (const partner of pendingQsaImports) {
        if (!partner?.name || registryPartnerMatch(store.state.contacts, partner.name)) continue;
        const providerLabel = partner.providerLabel || 'CNPJá Open';
        const registrySource = partner.registrySource || 'CNPJá Open · dados públicos de CNPJ';
        const related = {
          id: uid('contact'), externalId: null, registeredAt: isoDate(), updatedAt: new Date().toISOString(),
          name: partner.name, profession: partner.role || '', contactRole: 'outro', leadOrigin: 'outro',
          origin: `Quadro societário de ${partner.sourceName}`, source: `${providerLabel} · importação QSA supervisionada`,
          registryProvenance: [{ source: registrySource, appliedFields: ['name', 'profession'], appliedAt: new Date().toISOString() }]
        };
        store.upsert('contacts', related);
        store.audit('Contato cadastrado', related.name);
      }
      if (pendingQsaImports.length) showToast(`${plural(pendingQsaImports.length, 'vínculo societário revisado', 'vínculos societários revisados')} no cadastro.`, 'success');
      return record;
    }
  };

  return feature;
}

function mergeExternalContact(existing, incoming) {
  const current = safeExternalRecord(existing);
  const external = safeExternalRecord(incoming);
  const merged = { ...current };
  for (const [field, value] of Object.entries(external)) {
    if (!meaningful(value) || ['source', 'relatedProcessNumbers', 'monitoredTermIds', 'contactRole'].includes(field)) continue;
    if (['datajudAlias', 'collectedAt'].includes(field) || !meaningful(merged[field])) merged[field] = value;
  }
  const currentWasExternal = /DataJud/i.test(String(current.source || ''));
  if (meaningful(external.contactRole) && (!meaningful(current.contactRole) || (currentWasExternal && current.contactRole === 'outro'))) {
    merged.contactRole = external.contactRole;
  }
  const source = mergeSources(current.source, external.source);
  if (source) merged.source = source;
  const relatedProcessNumbers = uniqueStrings([...(current.relatedProcessNumbers || []), ...(external.relatedProcessNumbers || [])]);
  if (relatedProcessNumbers.length) merged.relatedProcessNumbers = relatedProcessNumbers;
  const monitoredTermIds = uniqueStrings([...(current.monitoredTermIds || []), ...(external.monitoredTermIds || [])]);
  if (monitoredTermIds.length) merged.monitoredTermIds = monitoredTermIds;
  return merged;
}

function isExternalContact(record) {
  return meaningful(record?.externalId)
    || meaningful(record?.datajudAlias)
    || /DataJud/i.test(String(record?.source || ''));
}

function contactMatchIndex(records, incoming) {
  const document = normalizeDocument(incoming.document);
  let strongerIdentityAmbiguous = false;
  if (document) {
    const matches = matchingIndexes(records, record => normalizeDocument(record.document) === document);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) strongerIdentityAmbiguous = true;
  }
  const externalId = String(incoming.externalId || '').trim();
  if (externalId) {
    const matches = matchingIndexes(records, record => String(record.externalId || '').trim() === externalId);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return -1;
  }
  if (strongerIdentityAmbiguous) return -1;
  const name = normalizeIdentity(incoming.name);
  if (!name) return -1;
  const matches = matchingIndexes(records, record => {
    if (normalizeIdentity(record.name) !== name) return false;
    const recordExternalId = String(record.externalId || '').trim();
    const conflictingExternalId = externalId && recordExternalId && recordExternalId !== externalId;
    const recordDocument = normalizeDocument(record.document);
    const conflictingDocument = document && recordDocument && recordDocument !== document;
    return !conflictingExternalId && !conflictingDocument;
  });
  return matches.length === 1 ? matches[0] : -1;
}

function matchingIndexes(records, predicate) {
  return records.map((record, index) => predicate(record) ? index : -1).filter(index => index >= 0);
}

function safeExternalRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return {};
  return Object.fromEntries(Object.entries(record).filter(([key]) => !['__proto__', 'prototype', 'constructor'].includes(key)));
}

function meaningful(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function normalizeDocument(value) {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

function normalizeIdentity(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function mergeSources(left, right) {
  return [...new Set([...(String(left || '').split(' + ')), right].map(value => String(value || '').trim()).filter(Boolean))].join(' + ');
}

function uniqueStrings(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function registryReviewShell({ collapsed = false } = {}) {
  // Na edição o cadastro já existe: a consulta fica recolhida para a identificação aparecer primeiro.
  const panel = `<section class="contact-registry-review" id="contactRegistryReview" aria-labelledby="contactRegistryHeading">
    <div class="contact-registry-heading"><div><span>INTELIGÊNCIA CADASTRAL</span><h3 id="contactRegistryHeading">Consultar antes de preencher</h3></div><p>Fontes públicas, com revisão humana antes de qualquer alteração.</p></div>
    <div class="contact-registry-actions">
      <button type="button" class="v2-button is-secondary" data-registry-action="document">Validar / consultar CPF ou CNPJ</button>
      <button type="button" class="v2-button is-secondary" data-registry-action="cep">Consultar CEP</button>
    </div>
    <p class="contact-registry-status" data-registry-status data-state="neutral" role="status" aria-live="polite">Nenhum dado é aplicado automaticamente.</p>
    <div class="contact-registry-results" data-registry-results></div>
  </section>`;
  if (!collapsed) return panel;
  return `<details class="contact-registry-disclosure"><summary>Consultar CPF, CNPJ ou CEP em fontes públicas</summary>${panel}</details>`;
}

async function registryRequest(secureFetch, url) {
  const response = await secureFetch(url, { headers: { Accept: 'application/json' } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'Consulta cadastral indisponível.');
  return payload;
}

function registryCpfResult(validation, escapeHtml) {
  return `<div class="registry-validation-card ${validation.valid ? 'is-valid' : 'is-invalid'}"><strong>${validation.valid ? 'CPF estruturalmente válido' : 'CPF inválido'}</strong><p>${escapeHtml(validation.message)}</p><small>A validação local não identifica a pessoa nem consulta situação cadastral.</small></div>`;
}

function registryCnpjResult(result, candidates, currentValues, escapeHtml) {
  const fields = [
    ['name', 'Razão social', result.legalName],
    ['email', 'E-mail', result.email],
    ...(result.mobile && result.mobile !== result.phone ? [['mobile', 'Celular', result.mobile]] : []),
    ['phone', 'Telefone', result.phone],
    ['address', 'Endereço', result.address],
    ['district', 'Bairro', result.district],
    ['city', 'Cidade', result.city],
    ['state', 'UF', result.state],
    ['zip', 'CEP', result.zip]
  ].filter(([, , value]) => value);
  const emptyApplyCount = fields.filter(([field]) => !String(currentValues[field] || '').trim()).length;
  const duplicates = candidates.length ? `<div class="registry-duplicate-hint"><strong>Possíveis registros ou relações a revisar</strong>${candidates.map(item => `<p><span>Nível ${escapeHtml(item.level)}</span>${escapeHtml(item.name)} · ${escapeHtml(item.reason)}</p>`).join('')}<small>É apenas um indício cadastral. Nenhuma mesclagem, vínculo ou conclusão de conflito foi realizada.</small></div>` : '';
  const qsa = result.qsa?.length ? `<section class="registry-qsa"><h4>Quadro societário (${result.qsa.length})</h4>${result.qsa.map((partner, index) => {
    const metaParts = [partner.role || 'Qualificação não informada', partner.personType, partner.since ? `desde ${brDateTime(partner.since)}` : ''].filter(Boolean);
    return `<div><span><strong>${escapeHtml(partner.name)}</strong><small>${escapeHtml(metaParts.join(' · '))}</small></span><button type="button" class="v2-button is-secondary" data-registry-action="qsa" data-registry-partner-index="${index}">Preparar contato</button></div>`;
  }).join('')}<p>Sócios são importados como “Outro” após confirmação; nunca como cliente automático.</p></section>` : '';
  function brDateTime(value) {
    const text = String(value || '');
    if (/^\d{4}-\d{2}-\d{2}T/.test(text) && !Number.isNaN(Date.parse(text))) {
      return new Date(text).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(text);
    return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}` : ''}` : text;
  }
  const capitalLabel = Number.isFinite(Number(result.capital)) && Number(result.capital) > 0
    ? `Capital social: R$ ${Number(result.capital).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '';
  const secondaryCount = Array.isArray(result.secondaryActivities) ? result.secondaryActivities.length : 0;
  const cnaeLabel = result.primaryActivity
    ? `CNAE principal: ${result.primaryActivityCode ? `${result.primaryActivityCode} — ` : ''}${result.primaryActivity}${secondaryCount ? ` (+${secondaryCount} secundário${secondaryCount === 1 ? '' : 's'})` : ''}`
    : '';
  const sizeLabel = result.size
    ? `Porte: ${result.size}${result.sizeAcronym && !result.size.toUpperCase().includes(result.sizeAcronym.toUpperCase()) ? ` (${result.sizeAcronym})` : ''}`
    : '';
  const isInactiveStatus = Boolean(result.status && !/^ativa$/i.test(String(result.status).trim()));
  const facts = [
    result.establishmentType && `Tipo: ${result.establishmentType}`,
    result.tradeName && `Nome fantasia: ${result.tradeName}`,
    result.legalNature && `Natureza jurídica: ${result.legalNature}`,
    sizeLabel,
    capitalLabel,
    result.openedAt && `Abertura: ${brDateTime(result.openedAt)}`,
    cnaeLabel,
    result.statusDate && `Situação desde: ${brDateTime(result.statusDate)}`,
    result.municipalityIbgeCode && `IBGE: ${result.municipalityIbgeCode}`,
    typeof result.simpleNational === 'boolean' && `Simples Nacional: ${result.simpleNational ? `Sim${result.simpleNationalSince ? ` (desde ${brDateTime(result.simpleNationalSince)})` : ''}` : 'Não'}`,
    typeof result.mei === 'boolean' && `MEI: ${result.mei ? 'Sim' : 'Não'}`,
    result.sourceUpdatedAt && `Base atualizada em: ${brDateTime(result.sourceUpdatedAt)}`
  ].filter(Boolean);
  const registryLabel = `${result.registry?.freshness === 'cached' ? 'Consulta guardada' : 'Consulta ao vivo'} · ${result.registry?.source || 'Fonte pública'} · ${result.registry?.consultedAt ? `consultado em ${brDateTime(result.registry.consultedAt)}` : 'sem horário informado'}`;
  return `<div class="registry-company-summary"><div><span${isInactiveStatus ? ' class="is-inactive"' : ''}>${escapeHtml(result.status || 'Situação não informada')}${result.establishmentType ? ` · ${escapeHtml(result.establishmentType)}` : ''}</span><strong>${escapeHtml(result.legalName || result.tradeName || 'Pessoa jurídica')}</strong><small>${escapeHtml(result.document)} · ${escapeHtml(registryLabel)}</small>${facts.length ? `<p>${facts.map(escapeHtml).join(' · ')}</p>` : ''}</div></div>${duplicates}<fieldset class="registry-field-review"><legend>Cadastro atual versus dado encontrado</legend>${fields.map(([field, label, value]) => `<label><input type="checkbox" data-registry-field="${field}" data-registry-value="${escapeHtml(value)}"><span><strong>${label}</strong><small><b>Atual</b> ${escapeHtml(currentValues[field] || 'não informado')}</small><small><b>Encontrado</b> ${escapeHtml(value)}</small></span></label>`).join('')}</fieldset><div class="registry-review-actions"><button type="button" class="v2-button is-secondary" data-registry-action="cancel-review">Cancelar revisão</button><button type="button" class="v2-button is-secondary" data-registry-action="keep-current">Manter cadastro atual</button><button type="button" class="v2-button is-secondary" data-registry-action="toggle-all">Marcar todos</button>${emptyApplyCount ? `<button type="button" class="v2-button is-secondary" data-registry-action="apply-empty">Preencher vazios (${emptyApplyCount})</button>` : ''}<button type="button" class="v2-button is-primary registry-apply" data-registry-action="apply">Aplicar campos selecionados</button></div>${qsa}`;
}

function registryAddressResult(result, escapeHtml) {
  const fields = [['address', 'Endereço', result.address], ['district', 'Bairro', result.district], ['city', 'Cidade', result.city], ['state', 'UF', result.state], ['zip', 'CEP', result.zip]];
  return `${result.ibgeCode ? `<p class="registry-address-context">Município IBGE ${escapeHtml(result.ibgeCode)} · Brasil</p>` : ''}<fieldset class="registry-field-review"><legend>Endereço encontrado — revise antes de aplicar</legend>${fields.filter(([, , value]) => value).map(([field, label, value]) => `<label><input type="checkbox" checked data-registry-field="${field}" data-registry-value="${escapeHtml(value)}"><span><strong>${label}</strong><small>${escapeHtml(value)}</small></span></label>`).join('')}</fieldset><div class="registry-review-actions"><button type="button" class="v2-button is-secondary" data-registry-action="cancel-review">Cancelar revisão</button><button type="button" class="v2-button is-primary registry-apply" data-registry-action="apply">Aplicar endereço selecionado</button></div>`;
}

function registryDuplicateCandidates(state, result, currentId) {
  const contacts = state?.contacts || [];
  const document = normalizeDocument(result.normalizedDocument || result.document);
  const rootCnpj = document.length === 14 ? document.slice(0, 8) : '';
  const email = normalizeIdentity(result.email);
  const phone = String(result.phone || '').replace(/\D/g, '');
  const names = [result.legalName, result.tradeName].map(normalizeIdentity).filter(Boolean);
  const contactCandidates = contacts.filter(item => String(item.id) !== String(currentId || '')).map(item => {
    const itemDoc = normalizeDocument(item.document);
    const itemName = normalizeIdentity(item.name);
    const nameStrength = Math.max(...names.map(name => identitySimilarity(name, itemName)), 0);
    const sameChannel = (email && normalizeIdentity(item.email) === email) || (phone && [item.mobile, item.phone].some(value => String(value || '').replace(/\D/g, '') === phone));
    const sameLocation = Boolean(result.city && normalizeIdentity(item.city) === normalizeIdentity(result.city));
    if ((document && itemDoc === document) || (result.externalId && item.externalId === result.externalId)) return { level: 'A', name: item.name, reason: 'mesmo identificador forte' };
    if (rootCnpj && itemDoc.length === 14 && itemDoc.slice(0, 8) === rootCnpj) return { level: 'B', name: item.name, reason: 'mesmo grupo econômico (mesma raiz CNPJ — Matriz/Filial)' };
    if (nameStrength >= 0.72 && (sameChannel || sameLocation)) return { level: 'B', name: item.name, reason: `nome compatível + ${sameChannel ? 'canal de contato' : 'localidade'}` };
    if (nameStrength >= 0.72) return { level: 'C', name: item.name, reason: 'semelhança nominal; exige revisão humana' };
    return null;
  }).filter(Boolean);

  const qsaPartnerCandidates = [];
  for (const partner of result.qsa || []) {
    const partnerName = normalizeIdentity(partner?.name);
    if (!partnerName) continue;
    const matched = contacts.find(item => String(item.id) !== String(currentId || '') && normalizeIdentity(item.name) === partnerName);
    if (matched) {
      qsaPartnerCandidates.push({ level: 'C', name: matched.name, reason: `sócio do QSA já cadastrado (${partner.role || 'sócio'}); vínculo não criado` });
    }
  }

  const relatedNames = new Set([...names, ...(result.qsa || []).map(item => normalizeIdentity(item.name))].filter(Boolean));
  const processCandidates = (state?.processes || []).flatMap(process => {
    const parties = [process.client, process.opponent, process.opposingParty].filter(Boolean);
    return parties.filter(party => [...relatedNames].some(name => identitySimilarity(name, normalizeIdentity(party)) >= 0.86)).map(party => ({ level: 'C', name: party, reason: `nome presente no processo ${process.number || 'sem número'}; vínculo não criado` }));
  });
  const leadCandidates = (state?.leads || []).filter(lead => {
    const leadName = normalizeIdentity(lead?.client);
    return leadName && [...relatedNames].some(name => identitySimilarity(name, leadName) >= 0.82);
  }).map(lead => ({ level: 'C', name: lead.client, reason: `nome presente em atendimento CRM (${lead.status || 'novo'})` }));

  return [...contactCandidates, ...qsaPartnerCandidates, ...processCandidates, ...leadCandidates].slice(0, 10);
}

function registryCurrentValues(byId) {
  return Object.fromEntries(['name', 'email', 'mobile', 'phone', 'address', 'district', 'city', 'state', 'zip'].map(field => [field, byId(`field-${field}`)?.value || '']));
}

function buildCompanyProfile(result) {
  if (!result || (!result.legalName && !result.normalizedDocument)) return null;
  return {
    document: result.document || '',
    normalizedDocument: result.normalizedDocument || '',
    establishmentType: result.establishmentType || '',
    tradeName: result.tradeName || '',
    status: result.status || '',
    statusDate: result.statusDate || '',
    statusReason: result.statusReason || '',
    openedAt: result.openedAt || '',
    legalNature: result.legalNature || '',
    legalNatureCode: result.legalNatureCode || '',
    size: result.size || '',
    sizeAcronym: result.sizeAcronym || '',
    capital: Number.isFinite(Number(result.capital)) ? Number(result.capital) : null,
    primaryActivity: result.primaryActivity || '',
    primaryActivityCode: result.primaryActivityCode || '',
    secondaryActivities: Array.isArray(result.secondaryActivities) ? result.secondaryActivities.slice(0, 8) : [],
    municipalityIbgeCode: result.municipalityIbgeCode || '',
    simpleNational: typeof result.simpleNational === 'boolean' ? result.simpleNational : null,
    simpleNationalSince: result.simpleNationalSince || '',
    taxEvents: Array.isArray(result.taxEvents) ? result.taxEvents.slice(0, 6) : [],
    mei: typeof result.mei === 'boolean' ? result.mei : null,
    meiSince: result.meiSince || '',
    suframaCount: Number(result.suframaCount) || 0,
    qsa: Array.isArray(result.qsa) ? result.qsa.slice(0, 12) : [],
    sourceUpdatedAt: result.sourceUpdatedAt || '',
    source: result.registry?.source || 'CNPJá Open · dados públicos de CNPJ',
    consultedAt: result.registry?.consultedAt || new Date().toISOString()
  };
}

function identitySimilarity(left, right) {
  const leftTokens = new Set(String(left || '').split(' ').filter(token => token.length > 1));
  const rightTokens = new Set(String(right || '').split(' ').filter(token => token.length > 1));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter(token => rightTokens.has(token)).length;
  return (2 * intersection) / (leftTokens.size + rightTokens.size);
}

function registryPartnerMatch(contacts, name) {
  const normalized = normalizeIdentity(name);
  return (contacts || []).find(item => normalizeIdentity(item.name) === normalized) || null;
}

function mergeRegistryProvenance(current, result, appliedFields) {
  const previous = Array.isArray(current) ? current : [];
  const source = result?.registry?.source || 'Fonte pública cadastral';
  return [...previous, {
    source, freshness: result?.registry?.freshness || 'live', consultedAt: result?.registry?.consultedAt || new Date().toISOString(),
    appliedAt: new Date().toISOString(), applicationMode: 'human_selected', appliedFields: [...new Set(appliedFields)]
  }].slice(-10);
}
