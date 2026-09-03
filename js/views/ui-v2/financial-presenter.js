const TYPE_LABELS = Object.freeze({
  exito: 'Honorários de êxito',
  fixo: 'Honorários fixos',
  mensal: 'Honorários mensais'
});

export function renderFinancialV2Workspace({ records, query, filter, escapeHtml, formatCurrency }) {
  const content = records.length
    ? `${renderDesktopTable(records, escapeHtml, formatCurrency)}${renderMobileList(records, escapeHtml, formatCurrency)}`
    : renderEmpty(Boolean(query), filter);

  return `<section class="financial-v2-surface" aria-labelledby="financialOperationsHeading">
    <header class="financial-v2-surface-header">
      <div><p>Carteira financeira</p><h3 id="financialOperationsHeading">Operações vinculadas a processos</h3></div>
      <span aria-live="polite">${records.length} registro${records.length === 1 ? '' : 's'}</span>
    </header>
    ${content}
  </section>`;
}

function renderDesktopTable(records, escapeHtml, formatCurrency) {
  return `<div class="financial-v2-table-wrap">
    <table class="financial-v2-table">
      <caption class="sr-only">Operações financeiras vinculadas aos processos</caption>
      <thead><tr>
        <th scope="col">Processo e cliente</th>
        <th scope="col">Tipo</th>
        <th scope="col" class="is-money">Bruto</th>
        <th scope="col" class="is-money">Honorários</th>
        <th scope="col" class="is-money">Líquido do cliente</th>
        <th scope="col">Status</th>
      </tr></thead>
      <tbody>${records.map(record => `<tr data-financial-record="${escapeHtml(record.id)}">
        <td><strong>${escapeHtml(record.processNumber)}</strong><small>${escapeHtml(record.client)}</small></td>
        <td><span class="financial-type is-${escapeHtml(record.kind)}">${escapeHtml(typeLabel(record))}</span></td>
        <td class="financial-money">${formatCurrency(record.gross)}</td>
        <td class="financial-money is-fee">${record.feeAmount === null ? '—' : formatCurrency(record.feeAmount)}</td>
        <td class="financial-money">${record.netClient === null ? '—' : formatCurrency(record.netClient)}</td>
        <td>${statusMarkup(record, escapeHtml)}</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>`;
}

function renderMobileList(records, escapeHtml, formatCurrency) {
  return `<div class="financial-v2-record-list" role="list" aria-label="Operações financeiras">
    ${records.map(record => `<article class="financial-v2-record" role="listitem" data-financial-record="${escapeHtml(record.id)}" aria-label="${escapeHtml(`${record.processNumber}, ${record.client}, ${typeLabel(record)}, ${record.statusLabel}`)}">
      <header><div><span class="financial-type is-${escapeHtml(record.kind)}">${escapeHtml(typeLabel(record))}</span><strong>${escapeHtml(record.processNumber)}</strong><small>${escapeHtml(record.client)}</small></div>${statusMarkup(record, escapeHtml)}</header>
      <dl>
        <div><dt>Bruto</dt><dd>${formatCurrency(record.gross)}</dd></div>
        <div><dt>Honorários</dt><dd class="is-fee">${record.feeAmount === null ? '—' : formatCurrency(record.feeAmount)}</dd></div>
        ${record.netClient === null ? '' : `<div><dt>Líquido cliente</dt><dd>${formatCurrency(record.netClient)}</dd></div>`}
      </dl>
    </article>`).join('')}
  </div>`;
}

function statusMarkup(record, escapeHtml) {
  return `<span class="financial-status is-${escapeHtml(record.statusTone)}"><span aria-hidden="true"></span>${escapeHtml(record.statusLabel)}</span>`;
}

function typeLabel(record) {
  if (record.kind === 'rpv') return record.typeLabel;
  if (record.kind === 'despesa') return record.typeLabel || 'Despesa processual';
  return TYPE_LABELS[record.feeType] || record.typeLabel || 'Honorários contratuais';
}

function renderEmpty(hasQuery, filter) {
  const filtered = hasQuery || filter !== 'all';
  return `<div class="financial-v2-empty">
    <span aria-hidden="true">◇</span>
    <strong>${filtered ? 'Nenhuma operação encontrada.' : 'Nenhum lançamento financeiro cadastrado.'}</strong>
    <p>${filtered ? 'Revise a busca ou selecione outro filtro.' : 'Os lançamentos continuarão vinculados diretamente aos processos.'}</p>
  </div>`;
}
