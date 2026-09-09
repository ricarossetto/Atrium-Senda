import { compactSourceLabel } from '../../core/legal-timeline.js';

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function createProcessesV2Presenter({
  documentRef = globalThis.document,
  escapeHtml,
  formatDate,
  formatMinutes,
  onEdit,
  onConsult,
  onDownloadAutos,
  onDocuments,
  onPreviewDocument,
  onDownloadDocument,
  onClient,
  onTasks,
  onTask,
  onPublication,
  onExport,
  onAgenda,
  onFinancial,
  onAssistant,
  onAccessKey,
  onAccessKeyStatus,
  onCreateTask,
  onDelete
} = {}) {
  let initialized = false;
  let selectedItem = null;
  let selectedTasks = [];
  let selectedPublications = [];
  let selectedAppointments = [];
  let selectedDocuments = [];
  let selectedTimeline = [];
  let lastFocusedElement = null;
  let previousBodyOverflow = '';
  let previewObjectUrl = '';

  const byId = id => documentRef?.getElementById(id);

  function init() {
    if (initialized) return false;
    initialized = true;
    byId('processInspectorClose')?.addEventListener('click', () => close());
    byId('processInspectorBackdrop')?.addEventListener('click', event => {
      if (event.target === byId('processInspectorBackdrop')) close();
    });
    byId('processInspectorBackdrop')?.addEventListener('keydown', handleInspectorKeydown);
    byId('processInspectorContent')?.addEventListener('click', event => {
      if (!selectedItem) return;
      const taskButton = event.target.closest('[data-process-task]');
      if (taskButton) {
        const task = selectedTasks.find(item => String(item.id) === taskButton.dataset.processTask);
        if (task) { close({ restoreFocus: false }); onTask?.(task); }
      } else if (event.target.closest('[data-process-publication]')) {
        const publication = selectedPublications.find(item => String(item.id) === event.target.closest('[data-process-publication]').dataset.processPublication);
        if (publication) onPublication?.(publication);
      } else if (event.target.closest('[data-process-agenda]')) {
        const appointment = selectedAppointments.find(item => String(item.id) === event.target.closest('[data-process-agenda]').dataset.processAgenda);
        if (appointment) { close({ restoreFocus: false }); onAgenda?.({ entityId: appointment.id }); }
      } else if (event.target.closest('[data-process-document]')) {
        const docId = event.target.closest('[data-process-document]').dataset.processDocument;
        openProcessDocuments(selectedItem, docId);
      } else if (event.target.closest('[data-process-timeline]')) {
        const timelineEvent = selectedTimeline.find(item => String(item.id) === event.target.closest('[data-process-timeline]').dataset.processTimeline);
        if (!timelineEvent) return;
        if (timelineEvent.target === 'task') {
          const task = selectedTasks.find(item => String(item.id) === timelineEvent.entityId);
          if (task) { close({ restoreFocus: false }); onTask?.(task); }
        } else if (timelineEvent.target === 'publication') {
          const publication = selectedPublications.find(item => String(item.id) === timelineEvent.entityId);
          if (publication) onPublication?.(publication);
        } else if (timelineEvent.target === 'agenda') {
          close({ restoreFocus: false }); onAgenda?.(timelineEvent);
        } else if (timelineEvent.target === 'document') {
          openProcessDocuments(selectedItem, timelineEvent.entityId);
        } else if (timelineEvent.target === 'financial') {
          const item = selectedItem; close({ restoreFocus: false }); onFinancial?.(item);
        }
      } else if (event.target.closest('[data-process-client]')) {
        const item = selectedItem; close({ restoreFocus: false }); onClient?.(item);
      } else if (event.target.closest('[data-process-tasks]')) {
        const item = selectedItem; close({ restoreFocus: false }); onTasks?.(item);
      } else if (event.target.closest('[data-process-financial]')) {
        const item = selectedItem; close({ restoreFocus: false }); onFinancial?.(item);
      } else if (event.target.closest('[data-download-autos]')) {
        onDownloadAutos?.(event.target.closest('[data-download-autos]'), selectedItem);
      } else if (event.target.closest('[data-process-access-key]')) {
        onAccessKey?.(selectedItem);
      }
    });
    byId('processInspectorEdit')?.addEventListener('click', () => {
      if (!selectedItem) return;
      const item = selectedItem;
      const returnTarget = lastFocusedElement;
      close({ restoreFocus: false });
      if (returnTarget?.isConnected && typeof returnTarget.focus === 'function') returnTarget.focus();
      onEdit?.(item);
    });
    byId('processInspectorCreateTask')?.addEventListener('click', () => {
      if (!selectedItem) return;
      const item = selectedItem;
      close({ restoreFocus: false });
      onCreateTask?.(item);
    });
    byId('processInspectorTjrs')?.addEventListener('click', event => {
      if (selectedItem) onConsult?.(event.currentTarget, selectedItem);
    });
    byId('processInspectorDownloadAutos')?.addEventListener('click', event => {
      if (selectedItem) onDownloadAutos?.(event.currentTarget, selectedItem);
    });
    byId('processInspectorDocuments')?.addEventListener('click', () => {
      if (!selectedItem) return;
      openProcessDocuments(selectedItem);
    });
    byId('processDocumentsClose')?.addEventListener('click', () => closeProcessDocuments({ returnToProcess: false }));
    byId('processDocumentsBackToProcess')?.addEventListener('click', () => closeProcessDocuments({ returnToProcess: true }));
    byId('processDocumentsBackdrop')?.addEventListener('click', event => {
      if (event.target === byId('processDocumentsBackdrop')) closeProcessDocuments({ returnToProcess: false });
    });
    byId('processDocumentsBackdrop')?.addEventListener('keydown', handleDocumentsKeydown);
    byId('processDocumentPreviewClose')?.addEventListener('click', () => closeProcessDocumentPreview());
    byId('processDocumentsBody')?.addEventListener('click', event => {
      const previewBtn = event.target.closest('[data-preview-process-doc]');
      if (previewBtn) {
        previewProcessDoc(previewBtn.dataset.previewProcessDoc);
        return;
      }
      const downloadBtn = event.target.closest('[data-download-process-doc]');
      if (downloadBtn) {
        downloadProcessDoc(downloadBtn.dataset.downloadProcessDoc);
        return;
      }
      const assistantBtn = event.target.closest('[data-assistant-process-doc]');
      if (assistantBtn) {
        closeProcessDocuments({ returnToProcess: false });
        onAssistant?.(selectedItem);
        return;
      }
      const card = event.target.closest('[data-doc-card-id]');
      if (card && !event.target.closest('button')) {
        previewProcessDoc(card.dataset.docCardId);
      }
    });
    byId('processInspectorAssistant')?.addEventListener('click', () => {
      if (!selectedItem) return;
      const item = selectedItem;
      close({ restoreFocus: false });
      onAssistant?.(item);
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
    selectedTasks = summary.linkedTasks || [];
    selectedPublications = summary.linkedIntimationRecords || [];
    selectedAppointments = summary.linkedAppointments || [];
    selectedDocuments = summary.linkedDocuments || [];
    selectedTimeline = summary.timeline || [];
    lastFocusedElement = invoker || documentRef.activeElement;
    previousBodyOverflow = documentRef.body?.style.overflow || '';

    const number = item.number || item.protocol || 'Processo sem número';
    byId('processInspectorTitle').textContent = number;
    byId('processInspectorContent').innerHTML = renderInspector({ item, summary, escapeHtml, formatDate, formatMinutes });

    const consultButton = byId('processInspectorTjrs');
    consultButton.classList.toggle('hidden', !summary.canConsultTjrs);
    consultButton.dataset.tjrsConsult = summary.canConsultTjrs ? String(item.number || '') : '';
    byId('processInspectorDownloadAutos')?.classList.toggle('hidden', !summary.canConsultTjrs);
    const exportButton = byId('processInspectorExport');
    if (exportButton) {
      exportButton.textContent = item.dossierDownloadedAt ? 'Dados exportados' : 'Exportar dados';
      exportButton.classList.toggle('is-complete', Boolean(item.dossierDownloadedAt));
      exportButton.title = item.dossierDownloadedAt
        ? 'Exportar novamente o backup técnico deste processo'
        : 'Exportar um arquivo JSON para backup ou transferência; não contém os autos em PDF';
    }
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
    void onAccessKeyStatus?.(item);
    return true;
  }

  function close({ restoreFocus = true } = {}) {
    const backdrop = byId('processInspectorBackdrop');
    const documentsBackdrop = byId('processDocumentsBackdrop');
    const wasOpen = Boolean(
      (backdrop && !backdrop.classList.contains('hidden')) ||
      (documentsBackdrop && !documentsBackdrop.classList.contains('hidden'))
    );
    backdrop?.classList.add('hidden');
    byId('processDocumentsBackdrop')?.classList.add('hidden');
    closeProcessDocumentPreview();
    byId('appShell')?.removeAttribute('inert');
    documentRef.querySelectorAll('#processTableBody [aria-current="true"]').forEach(row => {
      row.removeAttribute('aria-current');
      row.classList.remove('is-selected');
    });
    selectedItem = null;
    selectedTasks = [];
    selectedPublications = [];
    selectedAppointments = [];
    selectedDocuments = [];
    selectedTimeline = [];
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

  function extractEventNumber(doc) {
    const name = String(doc?.name || doc?.originalName || '').trim();
    const leadingMatch = name.match(/^(\d{1,5})\s*[-_.]/);
    if (leadingMatch) return parseInt(leadingMatch[1], 10);
    const eventMatch = name.match(/(?:evento|ev\.?)\s*(\d{1,5})/i);
    if (eventMatch) return parseInt(eventMatch[1], 10);
    if (doc?.metadata?.event != null) return Number(doc.metadata.event);
    if (doc?.derivation?.index != null) return Number(doc.derivation.index);
    return 999999;
  }

  function openProcessDocuments(item, focusDocId = '') {
    if (!item) return;
    const documentsBackdrop = byId('processDocumentsBackdrop');
    if (!documentsBackdrop) {
      onDocuments?.(item, focusDocId);
      return;
    }
    const number = item.number || item.protocol || 'Processo sem número';
    const client = item.client || 'Cliente não informado';
    if (byId('processDocumentsTitle')) byId('processDocumentsTitle').textContent = number;
    if (byId('processDocumentsSubtitle')) byId('processDocumentsSubtitle').textContent = `${client} · Autos e documentos processuais`;

    const docs = (selectedDocuments || []).slice();
    docs.sort((a, b) => {
      const evA = extractEventNumber(a);
      const evB = extractEventNumber(b);
      if (evA !== evB) return evA - evB;
      const dateA = a.documentDate || a.createdAt || '';
      const dateB = b.documentDate || b.createdAt || '';
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

    renderProcessDocumentsList(docs, focusDocId);

    byId('processInspectorBackdrop')?.classList.add('hidden');
    documentsBackdrop.classList.remove('hidden');
    queueMicrotask(() => byId('processDocumentsClose')?.focus());
  }

  function closeProcessDocuments({ returnToProcess = true } = {}) {
    if (!returnToProcess) return close({ restoreFocus: true });
    byId('processDocumentsBackdrop')?.classList.add('hidden');
    closeProcessDocumentPreview();
    if (selectedItem) {
      byId('processInspectorBackdrop')?.classList.remove('hidden');
      queueMicrotask(() => byId('processInspectorDocuments')?.focus());
    }
  }

  function closeProcessDocumentPreview() {
    if (previewObjectUrl) {
      globalThis.URL?.revokeObjectURL?.(previewObjectUrl);
      previewObjectUrl = '';
    }
    byId('processDocumentPreviewPanel')?.classList.add('hidden');
    const body = byId('processDocumentPreviewBody');
    if (body) body.replaceChildren();
  }

  function renderProcessDocumentsList(docs, focusDocId = '') {
    const container = byId('processDocumentsBody');
    if (!container) return;
    if (!docs.length) {
      container.innerHTML = `
        <div class="process-documents-empty">
          <p>Nenhum documento anexado a este processo no momento.</p>
          <small>Use “Gerar caderno em PDFs” para reunir os andamentos disponíveis no acervo.</small>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="process-documents-list-header">
        <span class="process-documents-count"><strong>${docs.length}</strong> documento${docs.length === 1 ? '' : 's'} no acervo (ordem cronológica de eventos)</span>
      </div>
      <div class="process-documents-items-list">
        ${docs.map(doc => {
          const eventNum = extractEventNumber(doc);
          const eventBadge = eventNum < 999999 ? `<span class="process-doc-event-badge">Ev. ${String(eventNum).padStart(3, '0')}</span>` : '';
          const isA1 = (doc.metadata?.origin || '').includes('eproc') || (doc.metadata?.tags || []).includes('a1-oficial');
          const a1Badge = isA1 ? '<span class="process-doc-a1-badge">Oficial A1</span>' : '';
          const sizeKb = doc.size ? `${Math.round(doc.size / 1024)} KB` : '';
          const dateStr = doc.documentDate || (doc.createdAt ? doc.createdAt.slice(0, 10) : '');
          const isFocused = String(doc.id) === String(focusDocId);

          return `
            <article class="process-doc-card ${isFocused ? 'is-focused' : ''}" data-doc-card-id="${escapeHtml(doc.id)}">
              <div class="process-doc-card-top">
                <div class="process-doc-card-badges">
                  ${eventBadge}
                  ${a1Badge}
                  <span class="process-doc-type-badge">${escapeHtml(doc.documentType || doc.type || 'Documento')}</span>
                </div>
                <span class="process-doc-meta">${dateStr ? formatDate(dateStr) : '—'}${sizeKb ? ` · ${sizeKb}` : ''}</span>
              </div>
              <h4 class="process-doc-card-name" title="${escapeHtml(doc.name || doc.originalName)}">${escapeHtml(doc.name || doc.originalName || 'Documento sem nome')}</h4>
              ${doc.metadata?.summary ? `<p class="process-doc-card-summary">${escapeHtml(doc.metadata.summary)}</p>` : ''}
              <div class="process-doc-card-actions">
                <button type="button" class="button ghost text-xs" data-preview-process-doc="${escapeHtml(doc.id)}">Preview</button>
                <button type="button" class="button ghost text-xs" data-download-process-doc="${escapeHtml(doc.id)}">Baixar</button>
                <button type="button" class="button ghost text-xs" data-assistant-process-doc="${escapeHtml(doc.id)}">Assistente</button>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;

    if (focusDocId) {
      queueMicrotask(() => {
        const escapedId = globalThis.CSS?.escape ? globalThis.CSS.escape(String(focusDocId)) : String(focusDocId).replace(/["\\]/g, '\\$&');
        container.querySelector(`[data-doc-card-id="${escapedId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    }
  }

  async function previewProcessDoc(docId) {
    const doc = (selectedDocuments || []).find(d => String(d.id) === String(docId));
    if (!doc) return;
    const panel = byId('processDocumentPreviewPanel');
    const titleEl = byId('processDocumentPreviewTitle');
    const metaEl = byId('processDocumentPreviewMeta');
    const bodyEl = byId('processDocumentPreviewBody');
    if (!panel || !bodyEl) return;

    titleEl.textContent = doc.name || doc.originalName || 'Preview do documento';
    metaEl.textContent = `${doc.documentType || 'Documento'} · ${formatDate(doc.documentDate || doc.createdAt)} · Original preservado`;
    bodyEl.innerHTML = '<p class="document-intelligence-loading">Carregando visualização segura…</p>';
    panel.classList.remove('hidden');
    panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    const downloadBtn = byId('processDocumentPreviewDownload');
    if (downloadBtn) {
      downloadBtn.onclick = () => downloadProcessDoc(doc.id, doc.name);
    }

    try {
      if (typeof onPreviewDocument === 'function') {
        const result = await onPreviewDocument(doc);
        bodyEl.replaceChildren();
        if (result?.type === 'image' && result.blob) {
          if (previewObjectUrl) globalThis.URL?.revokeObjectURL?.(previewObjectUrl);
          previewObjectUrl = globalThis.URL?.createObjectURL?.(result.blob) || '';
          if (!previewObjectUrl) throw new Error('Este navegador não oferece visualização local deste arquivo.');
          const img = documentRef.createElement('img');
          img.src = previewObjectUrl;
          img.className = 'process-doc-preview-image';
          img.alt = `Preview seguro de ${doc.name || doc.originalName || 'documento'}`;
          bodyEl.append(img);
        } else if (result?.text) {
          const pre = documentRef.createElement('pre');
          pre.className = 'process-doc-preview-text';
          pre.textContent = result.text;
          bodyEl.append(pre);
        } else {
          bodyEl.innerHTML = '<div class="empty-state"><p>Visualização não disponível.</p></div>';
        }
      } else {
        bodyEl.innerHTML = '<div class="empty-state"><p>Pré-visualização não configurada.</p></div>';
      }
    } catch (err) {
      bodyEl.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message || 'Falha ao exibir preview.')}</p></div>`;
    }
  }

  async function downloadProcessDoc(docId, docName) {
    const doc = (selectedDocuments || []).find(d => String(d.id) === String(docId));
    if (typeof onDownloadDocument === 'function') {
      await onDownloadDocument(doc || { id: docId, name: docName });
    }
  }

  function handleDocumentsKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeProcessDocuments({ returnToProcess: true });
      return;
    }
    if (event.key !== 'Tab') return;
    const drawer = byId('processDocumentsDrawer');
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

  return Object.freeze({ init, renderRows, renderEmpty, updateCount, open, close, openProcessDocuments, closeProcessDocuments });
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
  const displayedClient = item.resolvedClient || (/^cliente n[aã]o informado$/i.test(String(item.client || '').trim()) ? '' : item.client);
  const partyMeta = displayedClient
    ? (unique([item.clientPosition, item.opposingParty ? `vs. ${item.opposingParty}` : '']).join(' · ') || 'Vínculo confirmado na carteira')
    : 'A fonte não identificou com segurança a parte representada';
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
      <strong>${escapeHtml(displayedClient || 'Cliente ainda não vinculado')}</strong>
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
      <small>${escapeHtml(compactSourceLabel(item.source) || 'eproc / Cadastro')}</small>
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
    <h3><button type="button" class="process-inspector-client-link" data-process-client aria-label="Abrir contato de ${escapeHtml(item.client || 'cliente não informado')}">${escapeHtml(item.client || 'Cliente não informado')}</button></h3>
    <p>${escapeHtml(item.clientPosition || 'Posição não informada')}${item.opposingParty ? ` <span>vs.</span> ${escapeHtml(item.opposingParty)}` : ''}</p>
    <div class="process-inspector-context"><strong>${escapeHtml(item.court || item.county || 'Órgão não informado')}</strong><span>${escapeHtml(unique([item.courtUnit, item.actionType, item.judicialPhase, item.stage]).join(' · ') || 'Classificação não informada')}</span></div>
  </section>

  <section class="process-inspector-section" aria-labelledby="processOperationalHeading">
    <h3 id="processOperationalHeading">Resumo operacional</h3>
    <div class="process-inspector-metrics">
      <button type="button" class="process-inspector-metric-link" data-process-tasks>${metric(summary.openTasks, 'Tarefas abertas', escapeHtml)}</button>
      ${metric(summary.linkedIntimations, 'Intimações vinculadas', escapeHtml)}
      ${metric(formatMinutes(summary.timeMinutes), 'Tempo apontado', escapeHtml)}
      ${metric(summary.nextDeadline ? formatDate(summary.nextDeadline) : '—', 'Próximo prazo existente', escapeHtml)}
    </div>
    <div class="process-last-movement"><span>Último andamento</span><strong>${escapeHtml(item.lastMovement || 'Ainda não informado.')}</strong><small>${formatDate(item.lastMovementAt)}</small></div>
  </section>

  ${renderProcessFinance(item, escapeHtml, formatDate)}

  <section class="process-inspector-section" aria-labelledby="processTimelineHeading">
    <h3 id="processTimelineHeading">Linha do tempo jurídica</h3>
    ${renderLegalTimeline(summary.timeline || [], escapeHtml, formatDate)}
  </section>

  <section class="process-inspector-section" aria-labelledby="processTasksHeading">
    <div class="process-inspector-section-heading"><h3 id="processTasksHeading">Tarefas vinculadas</h3><button type="button" class="button ghost" data-process-tasks>Abrir em Tarefas</button></div>
    ${renderLinkedTasks(summary.linkedTasks || [], escapeHtml, formatDate)}
  </section>

  ${renderOperationalLinks(summary.linkedAppointments || [], summary.linkedDocuments || [], escapeHtml, formatDate)}

  ${renderJudicialContext(item, escapeHtml, formatDate)}

  <section class="process-inspector-section" aria-labelledby="processPublicationsHeading">
    <h3 id="processPublicationsHeading">Publicações vinculadas</h3>
    ${renderLinkedPublications(summary.linkedIntimationRecords || [], escapeHtml, formatDate)}
  </section>

  <section class="process-inspector-section" aria-labelledby="processDataHeading">
    <h3 id="processDataHeading">Dados processuais</h3>
    <dl class="process-metadata-grid">
      ${definition('Tribunal / órgão', item.court, escapeHtml)}
      ${definition('Comarca / seção', item.county, escapeHtml)}
      ${definition('Vara / unidade', item.courtUnit, escapeHtml)}
      ${definition('Tipo de ação', item.actionType, escapeHtml)}
      ${definition('Assunto', item.subject, escapeHtml)}
      ${definition('Fase processual', item.judicialPhase, escapeHtml)}
      ${definition('Etapa', item.stage, escapeHtml)}
      ${definition('Responsável', item.responsible, escapeHtml)}
      ${definition('Distribuição / cadastro', formatDate(item.registeredAt || item.createdAt), escapeHtml)}
      ${definition('Fonte', compactSourceLabel(item.source), escapeHtml)}
      ${definition('Monitoramento', monitoring, escapeHtml)}
      ${definition('Notas / contexto', item.notes, escapeHtml)}
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

function renderProcessFinance(item, escapeHtml, formatDate) {
  const installments = Array.isArray(item.feeInstallments) ? item.feeInstallments : [];
  const allReceipts = Array.isArray(item.receipts) ? item.receipts : [];
  const receipts = allReceipts.filter(receipt => receipt.status !== 'estornado');
  const expenses = Array.isArray(item.expenses) ? item.expenses : [];
  const hasTerms = Boolean(feePresentation(item) || requisitionPresentation(item));
  if (!hasTerms && !installments.length && !receipts.length && !expenses.length) return '';
  const scheduled = installments.reduce((total, record) => total + financialNumber(record.amount), 0);
  const received = receipts.reduce((total, record) => total + financialNumber(record.amount), 0);
  const pending = installments.length
    ? installments.filter(record => !isFinancialSettled(record.status)).reduce((total, record) => total + financialNumber(record.amount), 0)
    : Math.max(0, contractedFee(item) - received);
  const expenseTotal = expenses.reduce((total, record) => total + financialNumber(record.amount), 0);
  const records = [
    ...installments.map(record => ({ label: record.description || 'Parcela de honorários', value: record.amount, status: isFinancialSettled(record.status) ? 'Paga' : 'Pendente', date: record.dueDate })),
    ...allReceipts.map(record => ({ label: record.description || 'Recebimento de honorários', value: record.amount, status: record.status === 'estornado' ? 'Estornado' : 'Recebido', date: record.date })),
    ...expenses.map(record => ({ label: record.description || 'Despesa processual', value: record.amount, status: String(record.status || 'Pendente').replaceAll('_', ' '), date: record.date }))
  ].sort((left, right) => String(right.date || '').localeCompare(String(left.date || ''))).slice(0, 8);

  return `<section class="process-inspector-section" aria-labelledby="processFinancialHeading">
    <div class="process-inspector-section-heading"><h3 id="processFinancialHeading">Visão financeira do processo</h3><button type="button" class="button ghost" data-process-financial>Abrir Financeiro</button></div>
    <div class="process-inspector-metrics process-financial-metrics">
      ${metric(formatFinancialValue(installments.length ? scheduled : contractedFee(item)), installments.length ? 'Honorários parcelados' : 'Honorários contratados', escapeHtml)}
      ${metric(formatFinancialValue(received), 'Recebido', escapeHtml)}
      ${metric(formatFinancialValue(pending), 'Pendente', escapeHtml)}
      ${metric(formatFinancialValue(expenseTotal), 'Despesas do processo', escapeHtml)}
    </div>
    ${records.length ? `<div class="process-financial-records">${records.map(record => `<div><span><strong>${escapeHtml(record.label)}</strong><small>${escapeHtml(record.status)}${record.date ? ` · ${escapeHtml(formatDate(record.date))}` : ''}</small></span><b>${escapeHtml(formatFinancialValue(record.value))}</b></div>`).join('')}</div>` : ''}
    <p class="process-inspector-note">Valores jurídicos informativos, vinculados a este processo. Não substituem conciliação bancária ou escrituração fiscal.</p>
  </section>`;
}

function contractedFee(item) {
  if (item.feeType === 'misto') return financialNumber(item.feeAmount) + financialNumber(item.feeMonthly);
  if (item.feeAmount !== '' && item.feeAmount !== null && item.feeAmount !== undefined) return financialNumber(item.feeAmount);
  if (item.feeMonthly !== '' && item.feeMonthly !== null && item.feeMonthly !== undefined) return financialNumber(item.feeMonthly);
  const base = financialNumber(item.requisitionAmount ?? item.rpvAmount ?? item.economicValue);
  const percentage = financialNumber(item.feePercentage);
  return base * percentage / 100;
}

function financialNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function isFinancialSettled(value) {
  return ['pago', 'paga', 'quitado', 'repassado', 'recebido', 'reembolsado'].includes(String(value || '').toLowerCase());
}

function formatFinancialValue(value) {
  return `R$ ${financialNumber(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderLinkedTasks(tasks, escapeHtml, formatDate) {
  if (!tasks.length) return '<p class="process-inspector-empty">Nenhuma tarefa vinculada a este processo.</p>';
  return `<div class="process-linked-list">${tasks.map(task => `<button type="button" data-process-task="${escapeHtml(task.id)}" aria-label="Abrir tarefa ${escapeHtml(task.title || 'sem título')}"><strong>${escapeHtml(task.title || 'Tarefa sem título')}</strong><span>${escapeHtml(task.status || 'Status não informado')}${task.fatalDeadline || task.deadline ? ` · ${escapeHtml(formatDate(task.fatalDeadline || task.deadline))}` : ''}${task.responsible ? ` · ${escapeHtml(task.responsible)}` : ''}</span></button>`).join('')}</div>`;
}

function renderOperationalLinks(appointments, documents, escapeHtml, formatDate) {
  if (!appointments.length && !documents.length) return '';
  const appointmentItems = appointments.map(item => `<button type="button" data-process-agenda="${escapeHtml(item.id)}" aria-label="Abrir compromisso ${escapeHtml(item.title || 'sem título')}"><strong>${escapeHtml(item.title || 'Compromisso sem título')}</strong><span>${escapeHtml(formatDate(item.date || item.startAt))}${item.time ? ` · ${escapeHtml(item.time)}` : ''}</span></button>`).join('');
  const documentItems = documents.map(item => {
    const isOfficialA1 = item.documentType?.includes('eproc A1') || item.metadata?.origin?.includes('eproc TJRS (Certificado A1)');
    const sizeKb = item.size ? `${Math.round(item.size / 1024)} KB` : '';
    const badge = isOfficialA1 ? ' <span class="process-doc-a1-badge">Oficial A1</span>' : '';
    return `<button type="button" data-process-document="${escapeHtml(item.id)}" aria-label="Abrir documento ${escapeHtml(item.name || item.originalName || 'sem nome')}"><strong>${escapeHtml(item.name || item.originalName || 'Documento sem nome')}${badge}</strong><span>${escapeHtml(item.documentType || item.type || 'Documento')}${sizeKb ? ` · ${sizeKb}` : ''} · ${escapeHtml(formatDate(item.documentDate || item.createdAt))}</span></button>`;
  }).join('');
  return `<section class="process-inspector-section" aria-labelledby="processRelationsHeading"><h3 id="processRelationsHeading">Compromissos e documentos (${documents.length})</h3><div class="process-linked-list">${appointmentItems}${documentItems}</div></section>`;
}

function renderLinkedPublications(publications, escapeHtml, formatDate) {
  if (!publications.length) return '<p class="process-inspector-empty">Nenhuma publicação vinculada a este processo.</p>';
  return `<div class="process-linked-list">${publications.map(item => `<button type="button" data-process-publication="${escapeHtml(item.id)}" aria-label="Abrir publicação ${escapeHtml(item.title || 'sem título')}"><strong>${escapeHtml(item.title || 'Publicação sem título')}</strong><span>${escapeHtml(item.treatmentStatus || 'untreated')} · ${escapeHtml(formatDate(item.publishedAt))}</span></button>`).join('')}</div>`;
}

function renderLegalTimeline(events, escapeHtml, formatDate) {
  if (!events.length) return '<p class="process-inspector-empty">Nenhum evento relacionado foi encontrado.</p>';
  const labels = {
    movement: 'Andamento', publication: 'Publicação', task: 'Tarefa', deadline: 'Prazo', appointment: 'Agenda',
    document: 'Documento', financial: 'Financeiro', audit: 'Auditoria', process: 'Processo'
  };
  return `<ol class="legal-timeline">${events.map(event => {
    const content = `<span class="legal-timeline-marker" aria-hidden="true"></span><div class="legal-timeline-date"><time>${escapeHtml(event.date ? formatDate(event.date) : 'Sem data')}</time><span>${escapeHtml(labels[event.type] || 'Evento')}</span></div><div class="legal-timeline-copy"><strong>${escapeHtml(event.title)}</strong>${event.detail ? `<small>${escapeHtml(event.detail)}</small>` : ''}${event.source ? `<em>${escapeHtml(event.source)}</em>` : ''}</div>`;
    return `<li class="is-${escapeHtml(event.type)}">${event.target ? `<button type="button" data-process-timeline="${escapeHtml(event.id)}" aria-label="Abrir ${escapeHtml(labels[event.type] || 'evento')}: ${escapeHtml(event.title)}">${content}<span class="legal-timeline-open" aria-hidden="true">→</span></button>` : `<div>${content}</div>`}</li>`;
  }).join('')}</ol>`;
}

function renderMovements(movements, item, escapeHtml, formatDate) {
  const records = movements.length ? movements : (item.lastMovement ? [{ description: item.lastMovement, date: item.lastMovementAt }] : []);
  if (!records.length) return '<p class="process-inspector-empty">Nenhuma movimentação cadastrada.</p>';
  return `<ol class="process-movement-list">${records.slice().sort((a, b) => String(b.date || b.occurredAt || '').localeCompare(String(a.date || a.occurredAt || ''))).map(movement => `<li><time>${escapeHtml(formatDate(movement.date || movement.occurredAt || movement.createdAt))}</time><p>${escapeHtml(movement.description || movement.text || movement.name || 'Movimentação sem descrição')}</p></li>`).join('')}</ol>`;
}

function renderJudicialContext(item, escapeHtml, formatDate) {
  const integration = item.judicialIntegration || item.judicialSnapshot || item.tjrsCollector;
  const parties = Array.isArray(item.judicialParties) && item.judicialParties.length
    ? item.judicialParties
    : (Array.isArray(integration?.parties) ? integration.parties : []);
  if (!parties.length && !integration) return `<section class="process-inspector-section" aria-labelledby="processJudicialHeading"><h3 id="processJudicialHeading">Contexto judicial</h3><p class="process-inspector-empty">Nenhuma consulta judicial incorporada. Atualize o processo para consultar as fontes disponíveis.</p>${renderAccessKeyAction(item)}${renderAutosAction(item, escapeHtml)}</section>`;
  const partyList = parties.length
    ? `<div class="process-linked-list process-judicial-parties">${parties.filter(Boolean).map(party => {
        const lawyers = (Array.isArray(party.lawyers) ? party.lawyers : []).filter(Boolean)
          .map(lawyer => unique([lawyer.name, lawyer.oabNumber ? `OAB ${lawyer.oabUf || ''} ${lawyer.oabNumber}` : '']).join(' · '))
          .filter(Boolean)
          .join('; ');
        return `<div><strong>${escapeHtml(party.name || 'Parte sem nome')}</strong><span>${escapeHtml(unique([party.role, lawyers]).join(' · '))}</span></div>`;
      }).join('')}</div>`
    : '<p class="process-inspector-empty">O TJRS não informou as partes deste processo.</p>';
  const diff = integration?.diff;
  const newMovsCount = Array.isArray(diff?.newMovements) ? diff.newMovements.length : (diff?.newMovements || 0);
  const collectorMeta = integration
    ? `<dl class="process-metadata-grid process-collector-metadata">
        ${definition('Fonte / Provedor', compactSourceLabel(integration.source) || 'Fonte não informada', escapeHtml)}
        ${integration.collectorVersion ? definition('Versão do coletor', integration.collectorVersion, escapeHtml) : ''}
        ${integration.snapshotsCount != null ? definition('Consultas armazenadas', integration.snapshotsCount, escapeHtml) : ''}
        ${definition('Tribunal', integration.court || item.court || 'Oficial', escapeHtml)}
        ${definition('Última coleta', formatDate(integration.syncedAt), escapeHtml)}
        ${definition('Andamentos coletados', integration.movementsCount != null ? integration.movementsCount : (integration.movements?.length ?? '—'), escapeHtml)}
        ${definition('Novos andamentos', diff ? (newMovsCount > 0 ? `+${newMovsCount} novos` : 'Nenhum novo andamento') : 'Sem comparação disponível', escapeHtml)}
      </dl>`
    : '';
  return `<section class="process-inspector-section" aria-labelledby="processJudicialHeading">
    <h3 id="processJudicialHeading">Contexto judicial coletado</h3>
    ${collectorMeta}
    ${partyList}
    ${renderAccessKeyAction(item)}
    ${renderAutosAction(item, escapeHtml)}
    <p class="process-inspector-note">Leitura local e somente consulta. O vínculo do cliente continua sob controle do escritório.</p>
  </section>`;
}

function renderAccessKeyAction(item) {
  const isTjrs = String(item?.number || '').includes('.8.21.') || String(item?.court || '').toUpperCase().includes('TJRS');
  if (!isTjrs) return '';
  return `<div class="process-access-key-action" data-process-access-key-status="loading"><div><strong>Chave de acesso do processo</strong><span data-process-access-key-copy>Verificando o cofre local…</span></div><button type="button" class="button ghost" data-process-access-key>Adicionar chave</button></div>`;
}

function renderAutosAction(item, escapeHtml) {
  const isTjrs = String(item?.number || '').includes('.8.21.') || String(item?.court || '').toUpperCase().includes('TJRS');
  if (!isTjrs) return '';
  return `<div class="process-autos-action"><div><strong>Caderno processual para consulta offline</strong><span>Gera PDFs a partir dos dados já consultados no TJRS e guarda tudo no acervo cifrado deste processo.</span></div><button type="button" class="button ghost" data-download-autos data-process-id="${escapeHtml(item.id || '')}">Gerar caderno em PDFs</button></div>`;
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
