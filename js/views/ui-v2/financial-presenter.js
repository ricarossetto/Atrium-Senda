const TYPE_LABELS = Object.freeze({
  exito: 'Honorários de êxito',
  fixo: 'Honorários fixos',
  mensal: 'Honorários mensais',
  misto: 'Honorários mistos',
  horas: 'Honorários por hora'
});

export function renderFinancialPagination({ pagination, escapeHtml }) {
  const page = Math.max(1, Number(pagination?.page) || 1);
  const pageSize = Number(pagination?.pageSize) || 100;
  const total = Math.max(0, Number(pagination?.total) || 0);
  const totalPages = Math.max(1, Number(pagination?.totalPages) || 1);
  const totalLabel = total.toLocaleString('pt-BR');
  const firstDisabled = page <= 1 ? ' disabled' : '';
  const lastDisabled = page >= totalPages ? ' disabled' : '';
  const sizes = [25, 100, 500, 1000];
  return `<nav class="financial-pagination" aria-label="Paginação financeira">`
    + `<p class="financial-pagination-status" aria-live="polite">Página ${page} de ${totalPages} · ${escapeHtml(totalLabel)} no filtro</p>`
    + `<div class="financial-pagination-nav" role="group" aria-label="Navegar páginas">`
    + `<button type="button" class="v2-button is-secondary financial-pagination-button" data-fin-page="first"${firstDisabled} aria-label="Primeira página">Primeira</button>`
    + `<button type="button" class="v2-button is-secondary financial-pagination-button" data-fin-page="prev"${firstDisabled} aria-label="Página anterior">Anterior</button>`
    + `<button type="button" class="v2-button is-secondary financial-pagination-button" data-fin-page="next"${lastDisabled} aria-label="Próxima página">Próxima</button>`
    + `<button type="button" class="v2-button is-secondary financial-pagination-button" data-fin-page="last"${lastDisabled} aria-label="Última página">Última</button>`
    + `</div>`
    + `<div class="financial-page-size" role="group" aria-label="Lançamentos por página"><span>Por página</span>`
    + sizes.map(size => `<button type="button" class="financial-page-size-option${size === pageSize ? ' is-active' : ''}" data-fin-page-size="${size}" aria-pressed="${size === pageSize}">${size}</button>`).join('')
    + `</div></nav>`;
}

export const FINANCIAL_BUCKET_LABELS = Object.freeze({
  honorarios: 'Honorários',
  custas: 'Custas',
  reembolso: 'Reembolso',
  rpv_alvara: 'RPV/alvará',
  despesa_operacional: 'Despesa operacional',
  outros: 'Outros'
});

/**
 * Selo de conferência do bucket sugerido pelo classificador. É sugestão: nunca grava nada no
 * lançamento e nunca cria categoria obrigatória (`specs/financial-entries.md`).
 */
function renderBucketChip(record, suggestions, escapeHtml) {
  const suggestion = suggestions instanceof Map ? suggestions.get(String(record.id || '')) : suggestions?.[String(record.id || '')];
  const bucket = String(suggestion?.bucket || '').trim();
  if (!bucket) return '';
  const label = FINANCIAL_BUCKET_LABELS[bucket] || bucket;
  const confianca = Number(suggestion?.bucketConfidence) || 0;
  const titulo = `Sugestão de conferência do classificador${confianca ? ` (confiança ${confianca.toFixed(2).replace('.', ',')})` : ''}: ${label}. Nada foi gravado no lançamento.`;
  return `<span class="financial-bucket-chip" title="${escapeHtml(titulo)}">${escapeHtml(label)}</span>`;
}

export function renderFinancialV2Workspace({ records, query, filter, pagination = null, suggestions = null, escapeHtml, formatCurrency }) {
  const content = records.length
    ? `${renderDesktopTable(records, escapeHtml, formatCurrency, suggestions)}${renderMobileList(records, escapeHtml, formatCurrency, suggestions)}`
    : renderEmpty(Boolean(query), filter);

  return `<section class="financial-v2-surface" aria-labelledby="financialOperationsHeading">
    <header class="financial-v2-surface-header">
      <div><p>Carteira financeira</p><h3 id="financialOperationsHeading">Operações do escritório e de clientes</h3></div>
      <span aria-live="polite">${records.length} registro${records.length === 1 ? '' : 's'}</span>
    </header>
    ${content}
    ${pagination ? renderFinancialPagination({ pagination, escapeHtml }) : ''}
  </section>`;
}

function renderDesktopTable(records, escapeHtml, formatCurrency, suggestions = null) {
  return `<div class="financial-v2-table-wrap">
    <table class="financial-v2-table">
      <caption class="sr-only">Operações financeiras</caption>
      <thead><tr>
        <th scope="col">Processo e cliente</th>
        <th scope="col">Tipo</th>
        <th scope="col" class="is-money">Bruto</th>
        <th scope="col" class="is-money">Honorários</th>
        <th scope="col" class="is-money">Líquido do cliente</th>
        <th scope="col">Situação</th>
      </tr></thead>
      <tbody>${records.map(record => `<tr tabindex="0" data-financial-edit="${escapeHtml(String(record.editKey))}" title="Editar lançamento" data-financial-record="${escapeHtml(record.id)}">
        <td>${renderRecordOwner(record, escapeHtml)}</td>
        <td><span class="financial-type is-${escapeHtml(record.kind)}">${escapeHtml(typeLabel(record))}</span>${renderBucketChip(record, suggestions, escapeHtml)}${record.date ? `<small>${escapeHtml(financialDate(record.date))}</small>` : ''}</td>
        <td class="financial-money">${formatCurrency(record.gross)}</td>
        <td class="financial-money is-fee">${record.feeAmount === null ? '—' : formatCurrency(record.feeAmount)}</td>
        <td class="financial-money">${record.netClient === null ? '—' : formatCurrency(record.netClient)}</td>
        <td>${statusMarkup(record, escapeHtml)}</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>`;
}

function renderMobileList(records, escapeHtml, formatCurrency, suggestions = null) {
  return `<div class="financial-v2-record-list" role="list" aria-label="Operações financeiras">
    ${records.map(record => `<article tabindex="0" data-financial-edit="${escapeHtml(String(record.editKey))}" class="financial-v2-record" role="listitem" data-financial-record="${escapeHtml(record.id)}" aria-label="${escapeHtml(`${record.processNumber}, ${record.client}, ${typeLabel(record)}, ${record.statusLabel}`)}">
      <header><div><span class="financial-type is-${escapeHtml(record.kind)}">${escapeHtml(typeLabel(record))}</span>${renderBucketChip(record, suggestions, escapeHtml)}${renderRecordOwner(record, escapeHtml)}</div>${statusMarkup(record, escapeHtml)}</header>
      <dl>
        <div><dt>Bruto</dt><dd>${formatCurrency(record.gross)}</dd></div>
        <div><dt>Honorários</dt><dd class="is-fee">${record.feeAmount === null ? '—' : formatCurrency(record.feeAmount)}</dd></div>
        ${record.date ? `<div><dt>Data</dt><dd>${escapeHtml(financialDate(record.date))}</dd></div>` : ''}
        ${record.netClient === null ? '' : `<div><dt>Líquido cliente</dt><dd>${formatCurrency(record.netClient)}</dd></div>`}
      </dl>
    </article>`).join('')}
  </div>`;
}

function statusMarkup(record, escapeHtml) {
  return `<span class="financial-status is-${escapeHtml(record.statusTone)}"><span aria-hidden="true"></span>${escapeHtml(record.statusLabel)}</span>`;
}

function renderRecordOwner(record, escapeHtml) {
  const label = `<strong>${escapeHtml(record.processNumber)}</strong><small>${escapeHtml(record.client)}</small>`;
  if (!record.processId) return `<div class="financial-process-link is-static">${label}</div>`;
  return `<button type="button" class="financial-process-link" data-financial-process-id="${escapeHtml(record.processId)}">${label}<span class="financial-process-arrow" aria-hidden="true"></span></button>`;
}

function typeLabel(record) {
  if (record.kind === 'rpv') return record.typeLabel;
  if (record.kind === 'despesa') return record.typeLabel || 'Despesa processual';
  if (record.kind === 'parcela') return record.typeLabel || 'Parcela de honorários';
  if (record.kind === 'recebimento') return record.typeLabel || 'Recebimento de honorários';
  return TYPE_LABELS[record.feeType] || record.typeLabel || 'Honorários contratuais';
}

function financialDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '');
}

function renderEmpty(hasQuery, filter) {
  const filtered = hasQuery || filter !== 'all';
  return `<div class="financial-v2-empty">
    <span aria-hidden="true">◇</span>
    <strong>${filtered ? 'Nenhuma operação encontrada.' : 'Nenhum lançamento financeiro cadastrado.'}</strong>
    <p>${filtered ? 'Revise a busca ou selecione outro filtro.' : 'Cadastre despesas do escritório ou lançamentos vinculados a processos e contatos.'}</p>
  </div>`;
}
