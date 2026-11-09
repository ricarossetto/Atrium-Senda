// A auditoria é lida por gente: CPF e CNPJ aparecem mascarados e identificador interno sai do texto.
export function readableAuditDetail(value) {
  return String(value ?? '')
    .replace(/\b(\d{3})\.\d{3}\.\d{3}-(\d{2})\b/g, '$1.***.***-$2')
    .replace(/\b(\d{2})\.\d{3}\.\d{3}\/\d{4}-(\d{2})\b/g, '$1.***.***/****-$2')
    .replace(/\b(?:task|intimation|proc|process|contact):[\w:.-]{6,}/gi, '(registro)')
    .replace(/\bcan[oô]nic[ao]s?\b/gi, 'oficial');
}

const AUDIT_COLUMN_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'at', label: 'Data e hora' }),
  Object.freeze({ key: 'actor', label: 'Ator' }),
  Object.freeze({ key: 'action', label: 'Ação' }),
  Object.freeze({ key: 'detail', label: 'Detalhes' }),
  Object.freeze({ key: 'status', label: 'Situação' })
]);

export function createAuditPresenter({ documentRef = globalThis.document } = {}) {
  let initialized = false;
  const byId = id => documentRef?.getElementById(id);
  const isV2 = () => documentRef?.documentElement?.dataset?.ui === 'v2';

  function cell(label, className, content) {
    const element = documentRef.createElement('td');
    element.dataset.label = label;
    if (className) element.className = className;
    element.append(content);
    return element;
  }

  function updateFilterState(filter) {
    for (const button of byId('auditFilters')?.querySelectorAll?.('button[data-audit-filter]') || []) {
      const selected = button.dataset.auditFilter === filter;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
  }

  function renderEmpty(query) {
    const empty = documentRef.createElement('div');
    empty.className = 'audit-empty-state';
    const marker = documentRef.createElement('span');
    marker.className = 'audit-empty-marker';
    marker.setAttribute('aria-hidden', 'true');
    marker.textContent = '—';
    const heading = documentRef.createElement('h3');
    heading.textContent = query ? 'Nenhum evento encontrado' : 'Nenhum evento registrado';
    const description = documentRef.createElement('p');
    description.textContent = query
      ? 'Não há eventos de auditoria para esta busca e os filtros selecionados.'
      : 'Não há eventos de auditoria para os filtros selecionados.';
    empty.append(marker, heading, description);
    return empty;
  }

  function renderLedger(events, formatDateTime) {
    const wrapper = documentRef.createElement('div');
    wrapper.className = 'audit-ledger-scroll';
    const table = documentRef.createElement('table');
    table.className = 'audit-ledger-table';
    const caption = documentRef.createElement('caption');
    caption.className = 'sr-only';
    caption.textContent = 'Registro cronológico de atividades do sistema';
    const head = documentRef.createElement('thead');
    const headRow = documentRef.createElement('tr');
    for (const definition of AUDIT_COLUMN_DEFINITIONS) {
      const th = documentRef.createElement('th');
      th.scope = 'col';
      th.textContent = definition.label;
      headRow.append(th);
    }
    head.append(headRow);
    const body = documentRef.createElement('tbody');
    for (const item of events) {
      const row = documentRef.createElement('tr');
      const time = documentRef.createElement('time');
      time.dateTime = String(item?.at || '');
      time.textContent = formatDateTime(item?.at);
      const actor = documentRef.createElement('strong');
      actor.textContent = item?.actor || 'Sistema';
      const action = documentRef.createElement('span');
      action.className = 'audit-action-label';
      action.textContent = item?.action || '';
      const detail = documentRef.createElement('span');
      detail.className = 'audit-detail-text';
      detail.textContent = readableAuditDetail(item?.detail);
      const status = documentRef.createElement('span');
      status.className = 'audit-status-label';
      status.textContent = 'Registrado';
      row.append(
        cell('Data e hora', 'audit-time-cell', time),
        cell('Ator', 'audit-actor-cell', actor),
        cell('Ação', 'audit-action-cell', action),
        cell('Detalhes', 'audit-detail-cell', detail),
        cell('Situação', 'audit-status-cell', status)
      );
      body.append(row);
    }
    table.append(caption, head, body);
    wrapper.append(table);
    return wrapper;
  }

  function renderPagination(pagination) {
    const page = Math.max(1, Number(pagination?.page) || 1);
    const pageSize = Number(pagination?.pageSize) || 100;
    const total = Math.max(0, Number(pagination?.total) || 0);
    const totalPages = Math.max(1, Number(pagination?.totalPages) || 1);
    const nav = documentRef.createElement('nav');
    nav.className = 'audit-pagination';
    nav.setAttribute('aria-label', 'Paginação de auditoria');
    const status = documentRef.createElement('p');
    status.className = 'audit-pagination-status';
    status.setAttribute('aria-live', 'polite');
    status.textContent = `Página ${page} de ${totalPages} · ${total.toLocaleString('pt-BR')} no filtro`;
    const group = documentRef.createElement('div');
    group.className = 'audit-pagination-nav';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Navegar páginas');
    for (const [action, label, description] of [['first', 'Primeira', 'Primeira página'], ['prev', 'Anterior', 'Página anterior'], ['next', 'Próxima', 'Próxima página'], ['last', 'Última', 'Última página']]) {
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = 'v2-button is-secondary audit-pagination-button';
      button.dataset.auditPage = action;
      button.setAttribute('aria-label', description);
      button.textContent = label;
      if ((action === 'first' || action === 'prev') ? page <= 1 : page >= totalPages) button.disabled = true;
      group.append(button);
    }
    const sizes = documentRef.createElement('div');
    sizes.className = 'audit-page-size';
    sizes.setAttribute('role', 'group');
    sizes.setAttribute('aria-label', 'Eventos por página');
    const caption = documentRef.createElement('span');
    caption.textContent = 'Por página';
    sizes.append(caption);
    for (const size of [25, 100, 500, 1000]) {
      const option = documentRef.createElement('button');
      option.type = 'button';
      option.className = `audit-page-size-option${size === pageSize ? ' is-active' : ''}`;
      option.dataset.auditPageSize = String(size);
      option.setAttribute('aria-pressed', String(size === pageSize));
      option.textContent = String(size);
      sizes.append(option);
    }
    nav.append(status, group, sizes);
    const slot = documentRef.createElement('div');
    slot.className = 'audit-pagination-slot';
    slot.append(nav);
    return slot;
  }

  return Object.freeze({
    init() {
      if (initialized) return false;
      initialized = true;
      byId('auditFilters')?.setAttribute('aria-label', 'Filtrar registro de auditoria');
      byId('auditSearch')?.setAttribute('aria-label', 'Pesquisar no registro de auditoria');
      byId('btnExportAuditLog')?.setAttribute('aria-label', 'Exportar registro completo de auditoria em JSON');
      byId('btnClearAuditLog')?.setAttribute('aria-label', 'Redefinir filtros de auditoria');
      updateFilterState('all');
      return true;
    },

    render({ events = [], filter = 'all', query = '', formatDateTime = String, pagination = null } = {}) {
      if (!isV2()) return false;
      const list = byId('auditList');
      if (!list) return false;
      updateFilterState(filter);
      list.replaceChildren(events.length ? renderLedger(events, formatDateTime) : renderEmpty(String(query || '').trim()));
      if (pagination) list.append(renderPagination(pagination));
      return true;
    }
  });
}
