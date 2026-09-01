const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function createProcessesV2Presenter({
  documentRef = globalThis.document,
  escapeHtml,
  formatDate,
  formatMinutes,
  onEdit,
  onConsult,
  onDocuments,
  onExport,
  onDelete
} = {}) {
  let initialized = false;
  let selectedItem = null;
  let lastFocusedElement = null;
  let previousBodyOverflow = '';

  const byId = id => documentRef?.getElementById(id);

  function init() {
    if (initialized) return false;
    initialized = true;
    byId('processInspectorClose')?.addEventListener('click', () => close());
    byId('processInspectorBackdrop')?.addEventListener('click', event => {
      if (event.target === byId('processInspectorBackdrop')) close();
    });
    byId('processInspectorBackdrop')?.addEventListener('keydown', handleInspectorKeydown);
    byId('processInspectorEdit')?.addEventListener('click', () => {
      if (!selectedItem) return;
      const item = selectedItem;
      const returnTarget = lastFocusedElement;
      close({ restoreFocus: false });
      if (returnTarget?.isConnected && typeof returnTarget.focus === 'function') returnTarget.focus();
      onEdit?.(item);
    });
    byId('processInspectorTjrs')?.addEventListener('click', event => {
      if (selectedItem) onConsult?.(event.currentTarget, selectedItem);
    });
    byId('processInspectorDocuments')?.addEventListener('click', () => {
      if (!selectedItem) return;
      const item = selectedItem;
      close({ restoreFocus: false });
      onDocuments?.(item);
    });
    byId('processInspectorExport')?.addEventListener('click', () => {
      if (selectedItem) onExport?.(selectedItem);
    });
    byId('processInspectorDelete')?.addEventListener('click', () => {
      if (selectedItem) onDelete?.(selectedItem);
    });
    return true;
  }

  function renderRows(records) {
    return records.map(item => renderRow({ item, escapeHtml, formatDate })).join('');
  }

  function renderEmpty({ hasProcesses, query }) {
    const title = hasProcesses && query
      ? 'Nenhum processo encontrado para esta busca.'
      : 'Nenhum processo cadastrado.';
    const message = hasProcesses && query
      ? 'Revise os termos pesquisados para localizar outro registro.'
      : 'Cadastre um processo para iniciar a carteira processual.';
    const action = hasProcesses && query
      ? ''
      : '<button type="button" class="v2-button is-primary process-empty-action" data-process-create>Cadastrar processo</button>';
    return `<tr class="process-empty-row"><td colspan="6"><div class="v2-empty-state"><strong>${title}</strong><p>${message}</p>${action}</div></td></tr>`;
  }

  function updateCount({ visible, total, query }) {
    const count = byId('processResultCount');
    if (!count) return;
    count.textContent = query
      ? `${visible} de ${total} processo${total === 1 ? '' : 's'}`
      : `${total} processo${total === 1 ? '' : 's'}`;
  }

  function open(item, summary, invoker) {
    if (!item) return false;
    init();
    close({ restoreFocus: false });
    selectedItem = item;
    lastFocusedElement = invoker || documentRef.activeElement;
    previousBodyOverflow = documentRef.body?.style.overflow || '';

    const number = item.number || item.protocol || 'Processo sem número';
    byId('processInspectorTitle').textContent = number;
    byId('processInspectorContent').innerHTML = renderInspector({ item, summary, escapeHtml, formatDate, formatMinutes });

    const consultButton = byId('processInspectorTjrs');
    consultButton.classList.toggle('hidden', !summary.canConsultTjrs);
    consultButton.dataset.tjrsConsult = summary.canConsultTjrs ? String(item.number || '') : '';

    documentRef.querySelectorAll('#processTableBody [data-process-id]').forEach(row => {
      const selected = row.dataset.processId === String(item.id);
      row.classList.toggle('is-selected', selected);
      if (selected) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    });

    const backdrop = byId('processInspectorBackdrop');
    backdrop.classList.remove('hidden');
    byId('appShell')?.setAttribute('inert', '');
    if (documentRef.body) documentRef.body.style.overflow = 'hidden';
    queueMicrotask(() => byId('processInspectorClose')?.focus());
    return true;
  }

  function close({ restoreFocus = true } = {}) {
    const backdrop = byId('processInspectorBackdrop');
    const wasOpen = Boolean(backdrop && !backdrop.classList.contains('hidden'));
    backdrop?.classList.add('hidden');
    byId('appShell')?.removeAttribute('inert');
    documentRef.querySelectorAll('#processTableBody [aria-current="true"]').forEach(row => {
      row.removeAttribute('aria-current');
      row.classList.remove('is-selected');
    });
    selectedItem = null;
    if (wasOpen && documentRef.body) documentRef.body.style.overflow = previousBodyOverflow;
    if (wasOpen && restoreFocus && lastFocusedElement?.isConnected && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
    return wasOpen;
  }

  function handleInspectorKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const drawer = byId('processInspector');
    const focusable = [...(drawer?.querySelectorAll(FOCUSABLE) || [])]
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
  }

  return Object.freeze({ init, renderRows, renderEmpty, updateCount, open, close });
}

export function renderRow({ item, escapeHtml, formatDate }) {
  const number = item.number || item.protocol || 'Sem número';
  const tribunal = item.court || item.county || 'Órgão não informado';
  const phase = unique([item.actionType, item.judicialPhase, item.stage]).join(' · ') || 'Classificação não informada';
  const registeredDate = item.registeredAt || item.createdAt;
  const processMeta = unique([
    item.secrecy ? 'Segredo de justiça' : 'Consulta pública',
    item.oldNumber ? `Antigo ${item.oldNumber}` : '',
    item.caseFolder ? `Pasta ${item.caseFolder}` : '',
    item.nb ? `NB ${item.nb}` : ''
  ]).join(' · ');
  const partyMeta = unique([item.clientPosition, item.opposingParty ? `vs. ${item.opposingParty}` : '']).join(' · ') || 'Posição processual não informada';
  const monitoringActive = item.monitoring === 'active';
  const monitoringLabel = monitoringActive ? 'Monitorando' : 'Monitoramento inativo';
  const riskLabel = riskPresentation(item.risk);
  const secrecy = item.secrecy
    ? '<span class="process-secrecy"><span aria-hidden="true">●</span> Segredo de justiça</span>'
    : '';

  return `<tr data-process-id="${escapeHtml(item.id)}" tabindex="0" aria-label="Ver detalhes do processo ${escapeHtml(number)}">
    <td class="process-cell-number" data-label="Processo">
      <strong data-process-number>${escapeHtml(number)}</strong>
      <small>${escapeHtml(processMeta)}</small>
      ${secrecy}
    </td>
    <td class="process-cell-parties" data-label="Cliente e partes">
      <strong>${escapeHtml(item.client || 'Cliente não informado')}</strong>
      <small>${escapeHtml(partyMeta)}</small>
    </td>
    <td class="process-cell-court" data-label="Tribunal e fase">
      <strong>${escapeHtml(tribunal)}</strong>
      <small>${escapeHtml(unique([item.courtUnit, item.county]).join(' · '))}</small>
      <span class="process-phase">${escapeHtml(phase)}</span>
      ${riskLabel ? `<span class="process-risk">Probabilidade informada: ${escapeHtml(riskLabel)}</span>` : ''}
    </td>
    <td class="process-cell-registration" data-label="Cadastro">
      <strong>${formatDate(registeredDate)}</strong>
      <small>${escapeHtml(item.source || 'eproc / Cadastro')}</small>
    </td>
    <td class="process-cell-movement" data-label="Último andamento">
      <strong>${escapeHtml(item.lastMovement || 'Sem movimentação')}</strong>
      <small>${formatDate(item.lastMovementAt)}</small>
    </td>
    <td class="process-cell-monitoring" data-label="Monitoramento">
      <span class="v2-status-badge ${monitoringActive ? 'is-success' : 'is-neutral'}"><span aria-hidden="true">${monitoringActive ? '●' : '○'}</span><span>${monitoringLabel}</span></span>
      <button type="button" class="v2-button is-secondary process-details-button" data-process-details aria-label="Ver detalhes do processo ${escapeHtml(number)}">Ver detalhes</button>
    </td>
  </tr>`;
}

export function renderInspector({ item, summary, escapeHtml, formatDate, formatMinutes }) {
  const number = item.number || item.protocol || 'Processo sem número';
  const secrecy = item.secrecy
    ? '<span class="process-secrecy"><span aria-hidden="true">●</span> Segredo de justiça</span>'
    : '<span class="process-visibility">Consulta pública</span>';
  const monitoring = item.monitoring === 'active' ? 'Monitorando' : 'Monitoramento inativo';
  const risk = riskPresentation(item.risk);
  const fee = feePresentation(item);
  const requisition = requisitionPresentation(item);

  return `<section class="process-inspector-identity" aria-labelledby="processInspectorIdentityHeading">
    <p class="process-inspector-kicker" id="processInspectorIdentityHeading">Leitura processual</p>
    <div class="process-inspector-number"><strong data-process-number>${escapeHtml(number)}</strong>${secrecy}</div>
    <h3>${escapeHtml(item.client || 'Cliente não informado')}</h3>
    <p>${escapeHtml(item.clientPosition || 'Posição não informada')}${item.opposingParty ? ` <span>vs.</span> ${escapeHtml(item.opposingParty)}` : ''}</p>
    <div class="process-inspector-context"><strong>${escapeHtml(item.court || item.county || 'Órgão não informado')}</strong><span>${escapeHtml(unique([item.courtUnit, item.actionType, item.judicialPhase, item.stage]).join(' · ') || 'Classificação não informada')}</span></div>
  </section>

  <section class="process-inspector-section" aria-labelledby="processOperationalHeading">
    <h3 id="processOperationalHeading">Resumo operacional</h3>
    <div class="process-inspector-metrics">
      ${metric(summary.openTasks, 'Tarefas abertas', escapeHtml)}
      ${metric(summary.linkedIntimations, 'Intimações vinculadas', escapeHtml)}
      ${metric(formatMinutes(summary.timeMinutes), 'Tempo apontado', escapeHtml)}
      ${metric(summary.nextDeadline ? formatDate(summary.nextDeadline) : '—', 'Próximo prazo existente', escapeHtml)}
    </div>
    <div class="process-last-movement"><span>Último andamento</span><strong>${escapeHtml(item.lastMovement || 'Ainda não informado.')}</strong><small>${formatDate(item.lastMovementAt)}</small></div>
  </section>

  <section class="process-inspector-section" aria-labelledby="processDataHeading">
    <h3 id="processDataHeading">Dados processuais</h3>
    <dl class="process-metadata-grid">
      ${definition('Tribunal / órgão', item.court, escapeHtml)}
      ${definition('Comarca / seção', item.county, escapeHtml)}
      ${definition('Vara / unidade', item.courtUnit, escapeHtml)}
      ${definition('Tipo de ação', item.actionType, escapeHtml)}
      ${definition('Fase processual', item.judicialPhase, escapeHtml)}
      ${definition('Etapa', item.stage, escapeHtml)}
      ${definition('Responsável', item.responsible, escapeHtml)}
      ${definition('Distribuição / cadastro', formatDate(item.registeredAt || item.createdAt), escapeHtml)}
      ${definition('Fonte', item.source, escapeHtml)}
      ${definition('Monitoramento', monitoring, escapeHtml)}
    </dl>
  </section>

  <section class="process-inspector-section" aria-labelledby="processMetadataHeading">
    <h3 id="processMetadataHeading">Informações adicionais</h3>
    <dl class="process-metadata-grid">
      ${definition('Número antigo', item.oldNumber, escapeHtml)}
      ${definition('NB', item.nb, escapeHtml)}
      ${definition('Pasta física / caso', item.caseFolder, escapeHtml)}
      ${definition('Protocolo / local', item.protocol, escapeHtml)}
      ${definition('Probabilidade informada', risk, escapeHtml)}
      ${definition('Honorários cadastrados', fee, escapeHtml)}
      ${definition('Requisição', requisition, escapeHtml)}
    </dl>
  </section>`;
}

function definition(label, value, escapeHtml) {
  if (value === null || value === undefined || String(value).trim() === '' || value === '—') return '';
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function metric(value, label, escapeHtml) {
  return `<div><strong>${escapeHtml(value ?? '—')}</strong><span>${escapeHtml(label)}</span></div>`;
}

function riskPresentation(value) {
  if (!value) return '';
  return ({ provavel: 'Provável', possivel: 'Possível', remoto: 'Remota' })[value] || String(value);
}

function feePresentation(item) {
  const values = [];
  if (item.feeType && item.feeType !== 'none') values.push(String(item.feeType));
  if (Number(item.feePercentage) > 0) values.push(`${Number(item.feePercentage).toLocaleString('pt-BR')}%`);
  if (Number(item.feeAmount) > 0) values.push(`R$ ${Number(item.feeAmount).toLocaleString('pt-BR')}`);
  if (Number(item.feeMonthly) > 0) values.push(`Mensal R$ ${Number(item.feeMonthly).toLocaleString('pt-BR')}`);
  if (item.feeStatus) values.push(String(item.feeStatus).replaceAll('_', ' '));
  return values.join(' · ');
}

function requisitionPresentation(item) {
  return unique([item.requisitionType, item.requisitionStatus]).join(' · ');
}

function unique(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}
