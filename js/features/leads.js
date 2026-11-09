import { Store, isoDate, uid } from '../core/store.js?v=3.0.0';
import { transitionPageContent, focusPageControl } from '../views/ui-v2/page-transition.js?v=3.0.0';

export const LEAD_PAGE_SIZES = Object.freeze([25, 100, 500, 1000]);
export const LEAD_DEFAULT_PAGE_SIZE = 25;

function leadTotalPages(total, size) {
  const safeSize = LEAD_PAGE_SIZES.includes(size) ? size : LEAD_DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.ceil((Number(total) || 0) / safeSize));
}

export function createLeadsFeature({
  store = Store,
  documentRef = globalThis.document,
  normalizeText,
  escapeHtml,
  formatDate,
  formatCurrency,
  openModal,
  showToast,
  getCurrentUserName,
  getContacts = () => [],
  renderV2Workspace
} = {}) {
  let initialized = false;
  let statusFilter = 'all';
  const byId = id => documentRef?.getElementById(id);
  let leadPage = 1;
  let leadPageSize = LEAD_DEFAULT_PAGE_SIZE;
  let lastLeadTotal = 0;
  let leadView = 'list';
  let draggedLeadId = null;
  try {
    const storedView = globalThis.localStorage?.getItem('atrium:leads:view');
    if (storedView === 'kanban' || storedView === 'list') leadView = storedView;
  } catch { /* preferência local indisponível: mantém a lista */ }

  const feature = {
    get statusFilter() { return statusFilter; },
    get view() { return leadView; },
    get page() { return leadPage; },
    get pageSize() { return leadPageSize; },
    get pagination() {
      return {
        page: leadPage,
        pageSize: leadPageSize,
        total: lastLeadTotal,
        totalPages: leadTotalPages(lastLeadTotal, leadPageSize)
      };
    },

    setPageSize(value) {
      const size = Number(value);
      if (!LEAD_PAGE_SIZES.includes(size) || size === leadPageSize) return leadPageSize;
      leadPageSize = size;
      leadPage = 1;
      this.render(byId('leadSearch')?.value || '');
      return leadPageSize;
    },

    setPage(value) {
      const pages = leadTotalPages(lastLeadTotal, leadPageSize);
      let next = leadPage;
      if (value === 'first') next = 1;
      else if (value === 'prev') next = leadPage - 1;
      else if (value === 'next') next = leadPage + 1;
      else if (value === 'last') next = pages;
      else if (Number.isFinite(Number(value))) next = Math.trunc(Number(value));
      leadPage = Math.max(1, Math.min(pages, next || 1));
      this.render(byId('leadSearch')?.value || '');
      return leadPage;
    },

    init() {
      if (initialized) return false;
      initialized = true;
      byId('newLeadButton')?.addEventListener('click', () => this.openLeadModal());
      byId('leadStatusFilters')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-lead-filter]');
        if (!button) return;
        statusFilter = button.dataset.leadFilter;
        byId('leadStatusFilters').querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
        this.render(undefined, { resetPage: true });
      });
      byId('leadSearch')?.addEventListener('input', event => this.render(event.target.value, { resetPage: true }));
      byId('leadViewSwitch')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-lead-view-mode]');
        if (!button) return;
        this.setLeadView(button.dataset.leadViewMode);
      });
      byId('view-leads')?.addEventListener('click', event => this.handlePaginationClick(event));
      return true;
    },

    setLeadView(mode) {
      if (!['list', 'kanban'].includes(mode) || mode === leadView) return false;
      leadView = mode;
      try { globalThis.localStorage?.setItem('atrium:leads:view', mode); } catch { /* preferência local indisponível */ }
      this.render(byId('leadSearch')?.value || '');
      queueMicrotask(() => byId('leadViewSwitch')?.querySelector(`[data-lead-view-mode="${mode}"]`)?.focus({ preventScroll: true }));
      return true;
    },

    applyLeadViewMode() {
      const mode = leadView === 'kanban' ? 'kanban' : 'list';
      byId('view-leads')?.setAttribute('data-lead-view', mode);
      byId('leadViewSwitch')?.setAttribute('data-active-mode', mode);
      documentRef.querySelectorAll?.('#leadViewSwitch [data-lead-view-mode]').forEach(button => {
        const active = button.dataset.leadViewMode === mode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    },

    bindKanbanDragAndDrop(workspace) {
      workspace.querySelectorAll('[data-lead-drag]').forEach(card => {
        card.addEventListener('dragstart', event => {
          draggedLeadId = card.dataset.leadDrag;
          event.dataTransfer?.setData('text/plain', draggedLeadId);
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
          card.classList.add('is-dragging');
        });
        card.addEventListener('dragend', () => {
          draggedLeadId = null;
          card.classList.remove('is-dragging');
        });
      });
      workspace.querySelectorAll('[data-lead-drop]').forEach(column => {
        column.addEventListener('dragover', event => {
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
          column.classList.add('drag-over');
        });
        column.addEventListener('dragleave', event => {
          if (!column.contains(event.relatedTarget)) column.classList.remove('drag-over');
        });
        column.addEventListener('drop', event => {
          event.preventDefault();
          column.classList.remove('drag-over');
          const leadId = event.dataTransfer?.getData('text/plain') || draggedLeadId;
          if (leadId) this.moveLead(leadId, column.dataset.leadDrop);
        });
      });
    },

    async moveLead(leadId, status) {
      if (!['novo', 'em_analise', 'proposta', 'fechado', 'declinado'].includes(status)) return null;
      const lead = (store.state.leads || []).find(item => String(item.id) === String(leadId));
      if (!lead || lead.status === status) return null;
      const previous = lead.status;
      const previousUpdatedAt = lead.updatedAt;
      lead.status = status;
      lead.updatedAt = new Date().toISOString();
      const audit = store.audit('Atendimento movimentado', `${lead.client || 'Interessado'} · ${previous} → ${status}`);
      if (await store.flush() !== true) {
        lead.status = previous;
        if (previousUpdatedAt === undefined) delete lead.updatedAt; else lead.updatedAt = previousUpdatedAt;
        store.state.audit = (store.state.audit || []).filter(entry => entry.id !== audit?.id);
        store.save?.();
        showToast?.('Não foi possível mover o atendimento. Tente novamente.', 'error');
        this.render(byId('leadSearch')?.value || '');
        return null;
      }
      this.render(byId('leadSearch')?.value || '');
      showToast?.('Atendimento movimentado.', 'success');
      return lead;
    },

    async handlePaginationClick(event) {
      const sizeTarget = event.target.closest?.('[data-lead-page-size]');
      if (sizeTarget) {
        const size = Number(sizeTarget.dataset.leadPageSize);
        if (!LEAD_PAGE_SIZES.includes(size) || size === leadPageSize) return true;
        leadPageSize = size;
        leadPage = 1;
        this.render(byId('leadSearch')?.value || '');
        queueMicrotask(() => {
          documentRef.querySelector?.(`#view-leads [data-lead-page-size="${size}"]`)?.focus({ preventScroll: true });
        });
        return true;
      }
      const pageTarget = event.target.closest?.('[data-lead-page]');
      if (!pageTarget) return false;
      const pages = leadTotalPages(lastLeadTotal, leadPageSize);
      const action = pageTarget.dataset.leadPage;
      let next = leadPage;
      if (action === 'first') next = 1;
      else if (action === 'prev') next = leadPage - 1;
      else if (action === 'next') next = leadPage + 1;
      else if (action === 'last') next = pages;
      else if (Number.isFinite(Number(action))) next = Math.trunc(Number(action));
      next = Math.max(1, Math.min(pages, next || 1));
      if (next === leadPage) return true;
      const direction = Math.sign(next - leadPage);
      leadPage = next;
      await transitionPageContent(documentRef, { v2: '#leadsV2Workspace .lead-v2-record-list' }, direction,
        () => this.render(byId('leadSearch')?.value || ''));
      focusPageControl(documentRef, '#view-leads', 'data-lead-page', action, direction > 0 ? 'prev' : 'next');
      return true;
    },

    render(query = '', { resetPage = false } = {}) {
      const listEl = byId('leadTableBody');
      if (!listEl) return;
      if (resetPage) leadPage = 1;
      const filter = statusFilter || 'all';
      const needle = normalizeText(query);
      const leads = store.state.leads || [];

      const filtered = leads.filter(lead => {
        if (filter !== 'all' && lead.status !== filter) return false;
        if (!needle) return true;
        return normalizeText(`${lead.client} ${lead.serviceType} ${lead.origin} ${lead.responsible}`).includes(needle);
      });

      const countEl = byId('leadCount');
      if (countEl) countEl.textContent = `${filtered.length} atendimentos`;

      byId('leadStatusFilters')?.querySelectorAll('button[data-lead-filter]').forEach(button => {
        const selected = button.dataset.leadFilter === filter;
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });

      lastLeadTotal = filtered.length;
      const totalPages = leadTotalPages(filtered.length, leadPageSize);
      if (leadPage > totalPages) leadPage = totalPages;
      if (leadPage < 1) leadPage = 1;
      const start = (leadPage - 1) * leadPageSize;
      const pageRecords = filtered.slice(start, start + leadPageSize);
      const pagination = { page: leadPage, pageSize: leadPageSize, total: filtered.length, totalPages };

      const workspace = byId('leadsV2Workspace');
      const isV2 = documentRef?.documentElement?.dataset?.ui === 'v2';
      if (isV2 && workspace && renderV2Workspace) {
        listEl.innerHTML = '';
        workspace.innerHTML = renderV2Workspace({
          allLeads: leads,
          leads: pageRecords,
          filteredLeads: filtered,
          statusFilter: filter,
          pagination: leadView === 'list' ? pagination : null,
          view: leadView,
          escapeHtml,
          formatDate,
          formatCurrency,
          fallbackDate: isoDate()
        });
        this.applyLeadViewMode();
        workspace.querySelectorAll('[data-lead-id]').forEach(record => {
          record.addEventListener('click', () => {
            const lead = store.state.leads.find(item => item.id === record.dataset.leadId);
            if (lead) this.openLeadModal(lead);
          });
        });
        workspace.querySelectorAll('[data-lead-move]').forEach(select => {
          select.addEventListener('change', event => this.moveLead(event.target.dataset.leadMove, event.target.value));
        });
        this.bindKanbanDragAndDrop(workspace);
        return pageRecords;
      }
      if (workspace) workspace.innerHTML = '';

      if (!pageRecords.length) {
        listEl.innerHTML = '<tr><td colspan="7" class="empty-table" style="text-align:center;padding:24px;color:var(--muted);">Nenhum atendimento ou oportunidade registrada. Clique em "+ Novo atendimento" para cadastrar.</td></tr>';
        this.renderClassicPagination(pagination);
        return pageRecords;
      }

      listEl.innerHTML = pageRecords.map(lead => {
        const statusMap = {
          novo: '<span class="lead-status-chip novo">Novo</span>',
          em_analise: '<span class="lead-status-chip em_analise">Em análise</span>',
          proposta: '<span class="lead-status-chip proposta">Proposta Enviada</span>',
          fechado: '<span class="lead-status-chip fechado">Fechado</span>',
          declinado: '<span class="lead-status-chip declinado">Declinado</span>'
        };
        const statusHtml = statusMap[lead.status] || '<span class="lead-status-chip novo">Novo</span>';
        const valueFormatted = lead.estimatedFee ? formatCurrency(Number(lead.estimatedFee)) : 'A definir';

        return `
          <tr data-lead-id="${escapeHtml(lead.id)}" style="cursor:pointer;">
            <td><strong>${escapeHtml(lead.client || 'Interessado')}</strong></td>
            <td>${escapeHtml(lead.serviceType || 'Consulta Inicial')}</td>
            <td><span class="status-chip muted">${escapeHtml(lead.origin || 'Direto')}</span></td>
            <td><strong style="color:var(--gold);">${valueFormatted}</strong></td>
            <td>${escapeHtml(lead.responsible || 'Advogado(a)')}</td>
            <td>${escapeHtml(formatDate(lead.registeredAt || isoDate()))}</td>
            <td>${statusHtml}</td>
          </tr>
        `;
      }).join('');

      listEl.querySelectorAll('[data-lead-id]').forEach(row => {
        row.addEventListener('click', () => {
          const lead = store.state.leads.find(item => item.id === row.dataset.leadId);
          if (lead) this.openLeadModal(lead);
        });
      });
      this.renderClassicPagination(pagination);
      return pageRecords;
    },

    renderClassicPagination(pagination) {
      const table = byId('leadTableBody')?.closest?.('table');
      if (!table) return false;
      let container = byId('leadClassicPagination');
      if (!container) {
        container = documentRef.createElement?.('div');
        if (!container) return false;
        container.id = 'leadClassicPagination';
        container.className = 'lead-classic-pagination classic-only';
        table.parentElement?.appendChild(container);
      }
      const totalLabel = Number(pagination.total).toLocaleString('pt-BR');
      container.innerHTML = `<nav class="lead-pagination is-classic" aria-label="Paginação de atendimentos">`
        + `<p class="lead-pagination-status">Página ${pagination.page} de ${pagination.totalPages} · ${totalLabel} no filtro</p>`
        + `<div class="lead-pagination-nav" role="group" aria-label="Navegar páginas">`
        + `<button type="button" class="button ghost" data-lead-page="first"${pagination.page <= 1 ? ' disabled' : ''} aria-label="Primeira página">Primeira</button>`
        + `<button type="button" class="button ghost" data-lead-page="prev"${pagination.page <= 1 ? ' disabled' : ''} aria-label="Página anterior">Anterior</button>`
        + `<button type="button" class="button ghost" data-lead-page="next"${pagination.page >= pagination.totalPages ? ' disabled' : ''} aria-label="Próxima página">Próxima</button>`
        + `<button type="button" class="button ghost" data-lead-page="last"${pagination.page >= pagination.totalPages ? ' disabled' : ''} aria-label="Última página">Última</button>`
        + `</div>`
        + `<div class="lead-page-size" role="group" aria-label="Atendimentos por página"><span>Por página</span>`
        + LEAD_PAGE_SIZES.map(size => `<button type="button" class="${size === pagination.pageSize ? 'button gold' : 'button ghost'}" data-lead-page-size="${size}" aria-pressed="${size === pagination.pageSize}">${size}</button>`).join('')
        + `</div></nav>`;
      return true;
    },

    openLeadModal(defaults = {}) {
      const editing = Boolean(defaults.id);
      const fields = [
        {
          name: 'client', identityName: 'contactId', type: 'combobox', label: 'Cliente / interessado', required: true, full: true,
          placeholder: 'Busque um contato ou informe um novo interessado',
          suggestions: getContacts().slice().sort((left, right) => Number(right.contactRole === 'cliente') - Number(left.contactRole === 'cliente') || String(left.name).localeCompare(String(right.name), 'pt-BR')).map(contact => ({
            id: contact.id,
            value: contact.name,
            label: [contact.contactRole === 'cliente' ? 'Cliente' : contact.contactRole, contact.mobile || contact.phone, contact.email].filter(Boolean).join(' · ')
          })),
          note: 'A seleção preserva o vínculo com o contato oficial. Um nome digitado livremente não cria contato automaticamente.'
        },
        { name: 'serviceType', label: 'Tipo de Ação / Serviço Jurídico', required: true, full: true, placeholder: 'Ex: Concessão de Aposentadoria Especial' },
        {
          name: 'status', label: 'Status do Atendimento', type: 'select',
          options: [
            { value: 'novo', label: 'Novo Lead / Contato Inicial' },
            { value: 'em_analise', label: 'Em Análise Documental' },
            { value: 'proposta', label: 'Proposta de Honorários Enviada' },
            { value: 'fechado', label: 'Contrato Fechado (Virou Cliente)' },
            { value: 'declinado', label: 'Declinado / Não Viável' }
          ]
        },
        {
          name: 'origin', label: 'Origem da Captação', type: 'select',
          options: [
            { value: 'Indicação de Cliente', label: 'Indicação de Cliente' },
            { value: 'Google / Site', label: 'Google / Site' },
            { value: 'Instagram / Redes Sociais', label: 'Instagram / Redes Sociais' },
            { value: 'Parceiro / Correspondente', label: 'Parceiro / Correspondente' },
            { value: 'Sindicato / Associação', label: 'Sindicato / Associação' },
            { value: 'Passante / Balcão', label: 'Passante / Balcão' },
            { value: 'Outro', label: 'Outro' }
          ]
        },
        { name: 'estimatedFee', label: 'Honorários Estimados (R$)', type: 'number', placeholder: 'Ex: 5000' },
        { name: 'responsible', label: 'Responsável pelo Atendimento', placeholder: 'Ex: Dra. Beatriz' },
        { name: 'notes', label: 'Observações e Relato do Caso', type: 'textarea', full: true, placeholder: 'Descreva a pretensão do cliente e próximos passos...' }
      ];

      openModal?.('lead', editing ? 'Editar Atendimento' : 'Novo atendimento / Oportunidade', 'CRM Jurídico', fields, {
        status: 'novo',
        origin: 'Indicação de Cliente',
        responsible: getCurrentUserName?.() || 'Advogado(a)',
        ...defaults
      });
    },

    saveLead(data, defaults = {}) {
      const editing = Boolean(defaults.id);
      const record = {
        id: defaults.id || uid('lead'),
        registeredAt: defaults.registeredAt || isoDate(),
        ...defaults,
        ...data,
        estimatedFee: data.estimatedFee ? Number(data.estimatedFee) : null,
        updatedAt: new Date().toISOString()
      };
      store.upsert('leads', record);
      store.audit(editing ? 'Atendimento atualizado' : 'Novo atendimento registrado', `${record.client} · ${record.serviceType}`);
      return record;
    }
  };

  return feature;
}
