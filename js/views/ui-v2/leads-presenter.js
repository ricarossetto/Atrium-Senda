const STATUS_PRESENTATION = Object.freeze({
  novo: Object.freeze({ label: 'Novo', className: 'novo' }),
  em_analise: Object.freeze({ label: 'Em análise', className: 'em_analise' }),
  proposta: Object.freeze({ label: 'Proposta enviada', className: 'proposta' }),
  fechado: Object.freeze({ label: 'Fechado', className: 'fechado' }),
  declinado: Object.freeze({ label: 'Declinado', className: 'declinado' })
});

const PIPELINE_STATUSES = Object.freeze(['novo', 'em_analise', 'proposta', 'fechado', 'declinado']);
const KANBAN_COLUMN_LIMIT = 200;

function statusPresentation(status) {
  return STATUS_PRESENTATION[status] || STATUS_PRESENTATION.novo;
}

function columnStatusOf(lead) {
  return STATUS_PRESENTATION[lead?.status] ? lead.status : 'novo';
}

export function renderLeadPagination({
  pagination,
  escapeHtml
} = {}) {
  const page = Math.max(1, Number(pagination?.page) || 1);
  const pageSize = Number(pagination?.pageSize) || 100;
  const total = Math.max(0, Number(pagination?.total) || 0);
  const totalPages = Math.max(1, Number(pagination?.totalPages) || 1);
  const totalLabel = total.toLocaleString('pt-BR');
  const firstDisabled = page <= 1 ? ' disabled' : '';
  const lastDisabled = page >= totalPages ? ' disabled' : '';
  const sizes = [25, 100, 500, 1000];
  return `<nav class="lead-pagination" aria-label="Paginação de atendimentos">`
    + `<p class="lead-pagination-status" aria-live="polite">Página ${page} de ${totalPages} · ${escapeHtml(totalLabel)} no filtro</p>`
    + `<div class="lead-pagination-nav" role="group" aria-label="Navegar páginas">`
    + `<button type="button" class="v2-button is-secondary lead-pagination-button" data-lead-page="first"${firstDisabled} aria-label="Primeira página">Primeira</button>`
    + `<button type="button" class="v2-button is-secondary lead-pagination-button" data-lead-page="prev"${firstDisabled} aria-label="Página anterior">Anterior</button>`
    + `<button type="button" class="v2-button is-secondary lead-pagination-button" data-lead-page="next"${lastDisabled} aria-label="Próxima página">Próxima</button>`
    + `<button type="button" class="v2-button is-secondary lead-pagination-button" data-lead-page="last"${lastDisabled} aria-label="Última página">Última</button>`
    + `</div>`
    + `<div class="lead-page-size" role="group" aria-label="Atendimentos por página"><span>Por página</span>`
    + sizes.map(size => `<button type="button" class="lead-page-size-option${size === pageSize ? ' is-active' : ''}" data-lead-page-size="${size}" aria-pressed="${size === pageSize}">${size}</button>`).join('')
    + `</div></nav>`;
}

function renderLeadKanbanCard(lead, { escapeHtml, formatDate, formatCurrency, fallbackDate }) {
  const status = statusPresentation(lead.status);
  const client = lead.client || 'Interessado';
  const serviceType = lead.serviceType || 'Consulta inicial';
  const responsible = lead.responsible || 'Advogado(a)';
  const value = lead.estimatedFee ? formatCurrency(Number(lead.estimatedFee)) : 'A definir';
  const date = formatDate(lead.registeredAt || fallbackDate);
  const current = columnStatusOf(lead);
  const options = PIPELINE_STATUSES.map(value => {
    const presentation = STATUS_PRESENTATION[value];
    return `<option value="${value}" ${value === current ? 'selected' : ''}>${escapeHtml(presentation.label)}</option>`;
  }).join('');
  return `<article class="lead-kanban-card">
    <button type="button" class="lead-kanban-open" data-lead-id="${escapeHtml(lead.id)}" data-lead-drag="${escapeHtml(lead.id)}" draggable="true" aria-label="Abrir atendimento de ${escapeHtml(client)}, ${escapeHtml(serviceType)}, status ${escapeHtml(status.label)}">
      <span class="lead-kanban-card-main"><strong>${escapeHtml(client)}</strong><small>${escapeHtml(serviceType)}</small></span>
      <span class="lead-kanban-card-meta"><span>${escapeHtml(responsible)}</span><span class="lead-kanban-card-value">${escapeHtml(value)}</span></span>
      <span class="lead-kanban-card-date">${escapeHtml(date)}</span>
    </button>
    <label class="lead-kanban-move">
      <span class="sr-only">Mover ${escapeHtml(client)} para outro estágio</span>
      <select data-lead-move="${escapeHtml(lead.id)}" aria-label="Mover ${escapeHtml(client)} para outro estágio">${options}</select>
    </label>
  </article>`;
}

function renderKanban({ filteredLeads, statusFilter, escapeHtml, formatDate, formatCurrency, fallbackDate }) {
  if (!filteredLeads.length) {
    return `<section class="lead-intake-surface">${renderEmptyState(statusFilter)}</section>`;
  }
  const columns = PIPELINE_STATUSES.map(status => {
    const presentation = STATUS_PRESENTATION[status];
    const items = filteredLeads.filter(lead => columnStatusOf(lead) === status);
    const shown = items.slice(0, KANBAN_COLUMN_LIMIT);
    return `<div class="lead-kanban-column" data-lead-column="${status}">
      <header class="lead-kanban-column-header">
        <span class="lead-kanban-dot is-${presentation.className}" aria-hidden="true"></span>
        <h4>${escapeHtml(presentation.label)}</h4>
        <span class="lead-kanban-count">${items.length}</span>
      </header>
      <div class="lead-kanban-cards" data-lead-drop="${status}">
        ${shown.map(lead => renderLeadKanbanCard(lead, { escapeHtml, formatDate, formatCurrency, fallbackDate })).join('')}
        ${items.length > KANBAN_COLUMN_LIMIT ? `<p class="lead-kanban-more">Mostrando ${KANBAN_COLUMN_LIMIT} de ${items.length}.</p>` : ''}
        ${items.length === 0 ? '<p class="lead-kanban-empty">Nenhum atendimento neste estágio.</p>' : ''}
      </div>
    </div>`;
  }).join('');
  return `<section class="lead-kanban" aria-labelledby="leadKanbanTitle" aria-describedby="leadKanbanInstructions">
    <header class="lead-kanban-header">
      <div><p>Fluxo de entrada</p><h3 id="leadKanbanTitle">Kanban de atendimentos</h3></div>
      <span>${filteredLeads.length} ${filteredLeads.length === 1 ? 'atendimento neste filtro' : 'atendimentos neste filtro'}</span>
    </header>
    <p class="sr-only" id="leadKanbanInstructions">Arraste um cartão entre as colunas ou use o seletor "Mover para" de cada cartão.</p>
    <div class="lead-kanban-board">${columns}</div>
  </section>`;
}

function renderEmptyState(statusFilter) {
  return `<div class="lead-v2-empty" role="status">
    <span aria-hidden="true">◇</span>
    <strong>${statusFilter === 'all' ? 'Nenhum atendimento registrado.' : 'Nenhum atendimento neste estágio.'}</strong>
    <p>${statusFilter === 'all' ? 'Cadastre o primeiro atendimento para iniciar a triagem jurídica.' : 'Altere o estágio selecionado ou revise a busca.'}</p>
  </div>`;
}

export function renderLeadsV2Workspace({
  allLeads = [],
  leads = [],
  filteredLeads = null,
  statusFilter = 'all',
  pagination = null,
  view = 'list',
  escapeHtml,
  formatDate,
  formatCurrency,
  fallbackDate
} = {}) {
  const summary = PIPELINE_STATUSES.map(status => {
    const presentation = STATUS_PRESENTATION[status];
    const count = allLeads.filter(lead => columnStatusOf(lead) === status).length;
    return `
      <div class="lead-pipeline-item is-${presentation.className}">
        <span>${escapeHtml(presentation.label)}</span>
        <strong>${count}</strong>
      </div>`;
  }).join('');

  if (view === 'kanban') {
    const scoped = Array.isArray(filteredLeads) ? filteredLeads : leads;
    return `
      <div class="leads-v2-shell">
        <section class="lead-pipeline-summary" aria-label="Resumo do pipeline de atendimentos">
          ${summary}
        </section>
        ${renderKanban({ filteredLeads: scoped, statusFilter, escapeHtml, formatDate, formatCurrency, fallbackDate })}
      </div>`;
  }

  const records = leads.length
    ? leads.map(lead => {
        const status = statusPresentation(lead.status);
        const client = lead.client || 'Interessado';
        const serviceType = lead.serviceType || 'Consulta inicial';
        const origin = lead.origin || 'Direto';
        const responsible = lead.responsible || 'Advogado(a)';
        const value = lead.estimatedFee ? formatCurrency(Number(lead.estimatedFee)) : 'A definir';
        const date = formatDate(lead.registeredAt || fallbackDate);
        return `
          <button type="button" class="lead-v2-record" data-lead-id="${escapeHtml(lead.id)}" aria-label="Abrir atendimento de ${escapeHtml(client)}, ${escapeHtml(serviceType)}, status ${escapeHtml(status.label)}">
            <span class="lead-v2-record-main">
              <strong>${escapeHtml(client)}</strong>
              <small>${escapeHtml(serviceType)}</small>
            </span>
            <span class="lead-v2-record-meta">
              <small>Origem</small>
              <span>${escapeHtml(origin)}</span>
            </span>
            <span class="lead-v2-record-meta">
              <small>Responsável</small>
              <span>${escapeHtml(responsible)}</span>
            </span>
            <span class="lead-v2-record-meta lead-v2-record-value">
              <small>Estimativa</small>
              <span>${escapeHtml(value)}</span>
            </span>
            <span class="lead-v2-record-meta lead-v2-record-date">
              <small>Entrada</small>
              <span>${escapeHtml(date)}</span>
            </span>
            <span class="lead-v2-status is-${status.className}">${escapeHtml(status.label)}</span>
            <span class="lead-v2-record-action" aria-hidden="true">›</span>
          </button>`;
      }).join('')
    : renderEmptyState(statusFilter);

  return `
    <div class="leads-v2-shell">
      <section class="lead-pipeline-summary" aria-label="Resumo do pipeline de atendimentos">
        ${summary}
      </section>
      <section class="lead-intake-surface" aria-labelledby="leadIntakeTitle">
        <header class="lead-intake-header">
          <div>
            <p>Fluxo de entrada</p>
            <h3 id="leadIntakeTitle">Atendimentos</h3>
          </div>
          <span>${leads.length} ${leads.length === 1 ? 'registro exibido' : 'registros exibidos'}</span>
        </header>
        <div class="lead-v2-column-headings" aria-hidden="true">
          <span>Interessado / demanda</span><span>Origem</span><span>Responsável</span><span>Estimativa</span><span>Entrada</span><span>Situação</span><span></span>
        </div>
        <div class="lead-v2-record-list">${records}</div>
        ${pagination ? renderLeadPagination({ pagination, escapeHtml }) : ''}
      </section>
    </div>`;
}
