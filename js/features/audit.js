import { Store, isoDate } from '../core/store.js?v=3.0.0';
import { readableAuditDetail } from '../views/ui-v2/audit-presenter.js?v=3.0.0';
import { transitionPageContent, focusPageControl } from '../views/ui-v2/page-transition.js?v=3.0.0';

export const AUDIT_PAGE_SIZES = Object.freeze([25, 100, 500, 1000]);
export const AUDIT_DEFAULT_PAGE_SIZE = 25;

function auditTotalPages(total, size) {
  const safeSize = AUDIT_PAGE_SIZES.includes(size) ? size : AUDIT_DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.ceil((Number(total) || 0) / safeSize));
}

export function createAuditFeature({
  store = Store,
  documentRef = globalThis.document,
  escapeHtml,
  formatDateTime,
  exportJson,
  getIsoDate = isoDate,
  showToast,
  presentation
} = {}) {
  let initialized = false;
  let auditFilter = 'all';
  let auditQuery = '';
  let auditPage = 1;
  let auditPageSize = AUDIT_DEFAULT_PAGE_SIZE;
  let lastAuditTotal = 0;
  const byId = id => documentRef?.getElementById(id);

  const feature = {
    get initialized() { return initialized; },
    get filter() { return auditFilter; },
    set filter(value) { auditFilter = value || 'all'; },
    get query() { return auditQuery; },
    set query(value) { auditQuery = value || ''; },
    get page() { return auditPage; },
    get pageSize() { return auditPageSize; },
    get pagination() {
      return {
        page: auditPage,
        pageSize: auditPageSize,
        total: lastAuditTotal,
        totalPages: auditTotalPages(lastAuditTotal, auditPageSize)
      };
    },

    setPageSize(value) {
      const size = Number(value);
      if (!AUDIT_PAGE_SIZES.includes(size) || size === auditPageSize) return auditPageSize;
      auditPageSize = size;
      auditPage = 1;
      this.render(auditFilter, byId('auditSearch')?.value);
      return auditPageSize;
    },

    setPage(value) {
      const pages = auditTotalPages(lastAuditTotal, auditPageSize);
      let next = auditPage;
      if (value === 'first') next = 1;
      else if (value === 'prev') next = auditPage - 1;
      else if (value === 'next') next = auditPage + 1;
      else if (value === 'last') next = pages;
      else if (Number.isFinite(Number(value))) next = Math.trunc(Number(value));
      auditPage = Math.max(1, Math.min(pages, next || 1));
      this.render(auditFilter, byId('auditSearch')?.value);
      return auditPage;
    },

    init() {
      if (initialized) return false;
      initialized = true;
      presentation?.init?.();
      byId('auditFilters')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-audit-filter]');
        if (!button) return;
        auditFilter = button.dataset.auditFilter;
        byId('auditFilters').querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
        this.render(auditFilter, byId('auditSearch')?.value, { resetPage: true });
      });
      byId('auditSearch')?.addEventListener('input', () => this.render(auditFilter, byId('auditSearch').value, { resetPage: true }));
      byId('view-audit')?.addEventListener('click', event => this.handlePaginationClick(event));
      byId('btnExportAuditLog')?.addEventListener('click', () => this.export());
      byId('btnClearAuditLog')?.addEventListener('click', () => this.resetFilters());
      byId('exportAuditButton')?.addEventListener('click', () => this.export());
      return true;
    },

    filteredEvents(filter = auditFilter, query = auditQuery) {
      let events = store.state.audit || [];
      const normalizedQuery = String(query || '').toLowerCase().trim();
      if (normalizedQuery) {
        events = events.filter(event => String(event.action || '').toLowerCase().includes(normalizedQuery)
          || String(event.detail || '').toLowerCase().includes(normalizedQuery)
          || String(event.actor || '').toLowerCase().includes(normalizedQuery));
      }
      if (filter && filter !== 'all') {
        events = events.filter(event => {
          const action = String(event.action || '').toLowerCase();
          if (filter === 'security') return action.includes('auth') || action.includes('login') || action.includes('senha') || action.includes('2fa') || action.includes('totp') || action.includes('chave') || action.includes('sessão');
          if (filter === 'sync') return action.includes('sincroniz') || action.includes('colet') || action.includes('djen') || action.includes('datajud') || action.includes('import');
          if (filter === 'task') return action.includes('tarefa') || action.includes('prazo') || action.includes('kanban');
          if (filter === 'process') return action.includes('processo') || action.includes('caso') || action.includes('cliente');
          return true;
        });
      }
      return events;
    },

    render(filter = 'all', query = '', { resetPage = false } = {}) {
      const list = byId('auditList');
      const badge = byId('auditCountBadge');
      if (!list) return;
      if (resetPage) auditPage = 1;
      auditFilter = filter || auditFilter || 'all';
      auditQuery = query !== undefined ? query : (auditQuery || '');
      const events = this.filteredEvents(auditFilter, auditQuery);
      if (badge) badge.textContent = `${events.length} evento${events.length === 1 ? '' : 's'}`;
      lastAuditTotal = events.length;
      const totalPages = auditTotalPages(events.length, auditPageSize);
      if (auditPage > totalPages) auditPage = totalPages;
      if (auditPage < 1) auditPage = 1;
      const start = (auditPage - 1) * auditPageSize;
      const pageEvents = events.slice(start, start + auditPageSize);
      const pagination = { page: auditPage, pageSize: auditPageSize, total: events.length, totalPages };
      if (presentation?.render?.({ events: pageEvents, filter: auditFilter, query: auditQuery, formatDateTime, pagination })) {
        return events;
      }
      if (!pageEvents.length) {
        list.innerHTML = `<div class="empty-detail" style="padding:32px 16px;text-align:center;"><span>${iconSvg('audit')}</span><h3>Nenhum evento registrado</h3><p>Não há eventos de auditoria para os filtros selecionados.</p></div>`;
        this.renderClassicPagination(pagination);
        return events;
      }
      list.innerHTML = `
        <div class="responsive-table">
          <table class="sortable-table">
            <thead><tr><th style="width:170px;">Data e Hora</th><th style="width:140px;">Usuário / Agente</th><th>Ação Executada</th><th>Detalhes do Evento</th><th style="width:100px;">Status</th></tr></thead>
            <tbody>${pageEvents.map(item => `
              <tr>
                <td><time style="font-size:12px;color:var(--muted);">${formatDateTime(item.at)}</time></td>
                <td><strong style="font-size:12.5px;">${escapeHtml(item.actor || 'Sistema')}</strong></td>
                <td><span class="gold-pill" style="font-size:11px;">${escapeHtml(item.action)}</span></td>
                <td><span style="font-size:12.5px;color:var(--text);">${escapeHtml(readableAuditDetail(item.detail))}</span></td>
                <td><span class="status-chip connected" style="font-size:10.5px;">Registrado</span></td>
              </tr>`).join('')}</tbody>
          </table>
        </div>`;
      this.renderClassicPagination(pagination);
      return events;
    },

    renderClassicPagination(pagination) {
      const list = byId('auditList');
      if (!list) return false;
      let container = byId('auditClassicPagination');
      if (!container) {
        container = documentRef.createElement?.('div');
        if (!container) return false;
        container.id = 'auditClassicPagination';
        container.className = 'audit-classic-pagination classic-only';
        list.parentElement?.appendChild(container);
      }
      container.innerHTML = renderAuditPagination({ pagination, escapeHtml });
      return true;
    },

    async handlePaginationClick(event) {
      const sizeTarget = event.target.closest?.('[data-audit-page-size]');
      if (sizeTarget) {
        const size = Number(sizeTarget.dataset.auditPageSize);
        if (!AUDIT_PAGE_SIZES.includes(size) || size === auditPageSize) return true;
        auditPageSize = size;
        auditPage = 1;
        this.render(auditFilter, byId('auditSearch')?.value);
        queueMicrotask(() => {
          documentRef.querySelector?.(`#view-audit [data-audit-page-size="${size}"]`)?.focus({ preventScroll: true });
        });
        return true;
      }
      const pageTarget = event.target.closest?.('[data-audit-page]');
      if (!pageTarget) return false;
      const pages = auditTotalPages(lastAuditTotal, auditPageSize);
      const action = pageTarget.dataset.auditPage;
      let next = auditPage;
      if (action === 'first') next = 1;
      else if (action === 'prev') next = auditPage - 1;
      else if (action === 'next') next = auditPage + 1;
      else if (action === 'last') next = pages;
      else if (Number.isFinite(Number(action))) next = Math.trunc(Number(action));
      next = Math.max(1, Math.min(pages, next || 1));
      if (next === auditPage) return true;
      const direction = Math.sign(next - auditPage);
      auditPage = next;
      await transitionPageContent(documentRef, { v2: '#auditList .audit-ledger-table tbody' }, direction,
        () => this.render(auditFilter, byId('auditSearch')?.value));
      focusPageControl(documentRef, '#view-audit', 'data-audit-page', action, direction > 0 ? 'prev' : 'next');
      return true;
    },

    resetFilters() {
      auditFilter = 'all';
      auditQuery = '';
      auditPage = 1;
      if (byId('auditSearch')) byId('auditSearch').value = '';
      byId('auditFilters')?.querySelectorAll('button').forEach((item, index) => item.classList.toggle('active', index === 0));
      this.render('all', '');
      showToast?.('Filtros de auditoria redefinidos.', 'info');
    },

    export() {
      exportJson?.(store.state.audit, `atrium-auditoria-${getIsoDate()}.json`);
    }
  };

  function renderAuditPagination({ pagination, escapeHtml: escape }) {
    const page = Math.max(1, Number(pagination?.page) || 1);
    const pageSize = Number(pagination?.pageSize) || 100;
    const total = Math.max(0, Number(pagination?.total) || 0);
    const totalPages = Math.max(1, Number(pagination?.totalPages) || 1);
    const totalLabel = total.toLocaleString('pt-BR');
    const firstDisabled = page <= 1 ? ' disabled' : '';
    const lastDisabled = page >= totalPages ? ' disabled' : '';
    const sizes = [25, 100, 500, 1000];
    return `<nav class="audit-pagination" aria-label="Paginação de auditoria">`
      + `<p class="audit-pagination-status" aria-live="polite">Página ${page} de ${totalPages} · ${escape(totalLabel)} no filtro</p>`
      + `<div class="audit-pagination-nav" role="group" aria-label="Navegar páginas">`
      + `<button type="button" class="v2-button is-secondary audit-pagination-button" data-audit-page="first"${firstDisabled} aria-label="Primeira página">Primeira</button>`
      + `<button type="button" class="v2-button is-secondary audit-pagination-button" data-audit-page="prev"${firstDisabled} aria-label="Página anterior">Anterior</button>`
      + `<button type="button" class="v2-button is-secondary audit-pagination-button" data-audit-page="next"${lastDisabled} aria-label="Próxima página">Próxima</button>`
      + `<button type="button" class="v2-button is-secondary audit-pagination-button" data-audit-page="last"${lastDisabled} aria-label="Última página">Última</button>`
      + `</div>`
      + `<div class="audit-page-size" role="group" aria-label="Eventos por página"><span>Por página</span>`
      + sizes.map(size => `<button type="button" class="audit-page-size-option${size === pageSize ? ' is-active' : ''}" data-audit-page-size="${size}" aria-pressed="${size === pageSize}">${size}</button>`).join('')
      + `</div></nav>`;
  }

  return feature;
}
import { iconSvg } from '../views/ui-v2/icons.js?v=3.0.0';
