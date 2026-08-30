const STATUS_PRESENTATION = Object.freeze({
  novo: Object.freeze({ label: 'Novo', className: 'novo' }),
  em_analise: Object.freeze({ label: 'Em análise', className: 'em_analise' }),
  proposta: Object.freeze({ label: 'Proposta enviada', className: 'proposta' }),
  fechado: Object.freeze({ label: 'Fechado', className: 'fechado' }),
  declinado: Object.freeze({ label: 'Declinado', className: 'declinado' })
});

const PIPELINE_STATUSES = Object.freeze(['novo', 'em_analise', 'proposta', 'fechado', 'declinado']);

function statusPresentation(status) {
  return STATUS_PRESENTATION[status] || STATUS_PRESENTATION.novo;
}

export function renderLeadsV2Workspace({
  allLeads = [],
  leads = [],
  statusFilter = 'all',
  escapeHtml,
  formatDate,
  formatCurrency,
  fallbackDate
} = {}) {
  const summary = PIPELINE_STATUSES.map(status => {
    const presentation = STATUS_PRESENTATION[status];
    const count = allLeads.filter(lead => lead.status === status).length;
    return `
      <div class="lead-pipeline-item is-${presentation.className}">
        <span>${escapeHtml(presentation.label)}</span>
        <strong>${count}</strong>
      </div>`;
  }).join('');

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
    : `
      <div class="lead-v2-empty" role="status">
        <span aria-hidden="true">◇</span>
        <strong>${statusFilter === 'all' ? 'Nenhum atendimento registrado.' : 'Nenhum atendimento neste estágio.'}</strong>
        <p>${statusFilter === 'all' ? 'Cadastre o primeiro atendimento para iniciar a triagem jurídica.' : 'Altere o estágio selecionado ou revise a busca.'}</p>
      </div>`;

  return `
    <div class="leads-v2-shell">
      <section class="lead-pipeline-summary" aria-label="Resumo do pipeline de atendimentos">
        ${summary}
      </section>
      <section class="lead-intake-surface" aria-labelledby="leadIntakeTitle">
        <header class="lead-intake-header">
          <div>
            <p>Fluxo de entrada</p>
            <h3 id="leadIntakeTitle">Atendimentos jurídicos</h3>
          </div>
          <span>${leads.length} ${leads.length === 1 ? 'registro exibido' : 'registros exibidos'}</span>
        </header>
        <div class="lead-v2-column-headings" aria-hidden="true">
          <span>Interessado / demanda</span><span>Origem</span><span>Responsável</span><span>Estimativa</span><span>Entrada</span><span>Status</span><span></span>
        </div>
        <div class="lead-v2-record-list">${records}</div>
      </section>
    </div>`;
}
