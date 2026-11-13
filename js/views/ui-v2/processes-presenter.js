import { installPanelSizeToggle, resetPanelSize, syncPanelSizeControl } from '../../components/panel-size.js?v=3.1.0';
import { compactSourceLabel } from '../../core/legal-timeline.js?v=3.1.0';
import { describeCnj } from '../../core/cnj.js?v=3.1.0';
import { safeImageSource } from '../../core/link-safety.js?v=3.1.0';
import { sanitizeRichHtml } from '../../core/html-safety.js?v=3.1.0';
import { memberAvatarHtml } from '../../core/member-avatar.js?v=3.1.0';

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function createProcessesV2Presenter({
  documentRef = globalThis.document,
  escapeHtml,
  formatDate,
  formatMinutes,
  onEdit,
  onConsult,
  onRefreshWithCertificate,
  onDownloadAutos,
  onDownloadEprocA1,
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
  onCreateMovement,
  onDelete,
  getHasA1Certificate = () => false,
  getTriage = () => null
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

  const byId = id => documentRef?.getElementById(id);

  function init() {
    if (initialized) return false;
    initialized = true;
    byId('processInspectorClose')?.addEventListener('click', () => close());
    installPanelSizeToggle(byId('processInspector'));
    installPanelSizeToggle(byId('processDocumentsDrawer'));
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
      } else if (event.target.closest('[data-process-new-movement]')) {
        const item = selectedItem;
        close({ restoreFocus: false });
        onCreateMovement?.(item);
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
          const item = selectedItem; close({ restoreFocus: false }); onDocuments?.(item, timelineEvent.entityId);
        } else if (timelineEvent.target === 'financial') {
          const item = selectedItem; close({ restoreFocus: false }); onFinancial?.(item);
        }
      } else if (event.target.closest('[data-process-client]')) {
        const item = selectedItem; close({ restoreFocus: false }); onClient?.(item);
      } else if (event.target.closest('[data-process-tasks]')) {
        const item = selectedItem; close({ restoreFocus: false }); onTasks?.(item);
      } else if (event.target.closest('[data-process-financial]')) {
        const item = selectedItem; close({ restoreFocus: false }); onFinancial?.(item);
      } else if (event.target.closest('[data-download-eproc-a1]')) {
        onDownloadEprocA1?.(event.target.closest('[data-download-eproc-a1]'), selectedItem);
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
    byId('processInspectorDownloadEprocA1')?.addEventListener('click', event => {
      if (selectedItem) onDownloadEprocA1?.(event.currentTarget, selectedItem);
    });
    byId('processInspectorTjrs')?.addEventListener('click', event => {
      if (selectedItem) onRefreshWithCertificate?.(event.currentTarget, selectedItem);
    });
    byId('processInspectorDownloadAutos')?.addEventListener('click', event => {
      if (selectedItem) onDownloadAutos?.(event.currentTarget, selectedItem);
    });
    byId('processInspectorAccessKey')?.addEventListener('click', () => {
      if (selectedItem) onAccessKey?.(selectedItem);
    });
    byId('processInspectorTasks')?.addEventListener('click', () => {
      if (!selectedItem) return;
      const item = selectedItem;
      close({ restoreFocus: false });
      onTasks?.(item);
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
    const hasA1 = typeof getHasA1Certificate === 'function' ? Boolean(getHasA1Certificate()) : false;
    return records.map(item => renderRow({
      item,
      escapeHtml,
      formatDate,
      hasA1Certificate: hasA1,
      triage: typeof getTriage === 'function' ? getTriage(item) : null
    })).join('');
  }

  function renderPagination({ pagination, escapeHtml: escape = escapeHtml }) {
    const page = Math.max(1, Number(pagination?.page) || 1);
    const pageSize = Number(pagination?.pageSize) || 100;
    const total = Math.max(0, Number(pagination?.total) || 0);
    const totalPages = Math.max(1, Number(pagination?.totalPages) || 1);
    const totalLabel = total.toLocaleString('pt-BR');
    const firstDisabled = page <= 1 ? ' disabled' : '';
    const lastDisabled = page >= totalPages ? ' disabled' : '';
    const sizes = [25, 100, 500, 1000];
    return `<nav class="process-pagination" aria-label="Paginação de processos">`
      + `<p class="process-pagination-status" aria-live="polite">Página ${page} de ${totalPages} · ${escape(totalLabel)} no filtro</p>`
      + `<div class="process-pagination-nav" role="group" aria-label="Navegar páginas">`
      + `<button type="button" class="v2-button is-secondary process-pagination-button" data-process-page="first"${firstDisabled} aria-label="Primeira página">Primeira</button>`
      + `<button type="button" class="v2-button is-secondary process-pagination-button" data-process-page="prev"${firstDisabled} aria-label="Página anterior">Anterior</button>`
      + `<button type="button" class="v2-button is-secondary process-pagination-button" data-process-page="next"${lastDisabled} aria-label="Próxima página">Próxima</button>`
      + `<button type="button" class="v2-button is-secondary process-pagination-button" data-process-page="last"${lastDisabled} aria-label="Última página">Última</button>`
      + `</div>`
      + `<div class="process-page-size" role="group" aria-label="Processos por página"><span>Por página</span>`
      + sizes.map(size => `<button type="button" class="process-page-size-option${size === pageSize ? ' is-active' : ''}" data-process-page-size="${size}" aria-pressed="${size === pageSize}">${size}</button>`).join('')
      + `</div></nav>`;
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
    const isTjrs = String(item.number || '').includes('.8.21.') || String(item.court || '').toUpperCase().includes('TJRS');
    const hasA1 = typeof getHasA1Certificate === 'function' ? Boolean(getHasA1Certificate()) : false;
    byId('processInspectorTitle').textContent = number;
    byId('processInspectorContent').innerHTML = renderInspector({ item, summary, escapeHtml, formatDate, formatMinutes, hasA1Certificate: hasA1 });

    const a1Button = byId('processInspectorDownloadEprocA1');
    if (a1Button) {
      a1Button.classList.remove('hidden');
      const isDownloaded = Boolean(item.dossierDownloadedAt || item.documentsDownloadedAt || (selectedDocuments || []).some(d => (d.metadata?.origin || '').includes('eproc') || (d.metadata?.tags || []).includes('a1-oficial') || d.documentType === 'Índice de Autos Oficiais'));
      // Estado verdadeiro por rótulo/título; sem cor de destaque concorrente com a ação primária.
      a1Button.classList.remove('is-available', 'is-complete');
      if (isDownloaded) {
        a1Button.disabled = false;
        a1Button.innerHTML = '<svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.1.0#atrium-icon-check"></use></svg><span>Autos baixados</span>';
        a1Button.title = 'Autos oficiais já baixados do eproc TJRS via Certificado A1.';
      } else if (!isTjrs) {
        a1Button.disabled = true;
        a1Button.innerHTML = '<svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.1.0#atrium-icon-download"></use></svg><span>Baixar Autos com A1</span>';
        a1Button.title = 'Baixar autos com A1 disponível apenas para processos do TJRS (eproc).';
      } else if (!hasA1) {
        a1Button.disabled = true;
        a1Button.innerHTML = '<svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.1.0#atrium-icon-download"></use></svg><span>Baixar Autos com A1</span>';
        a1Button.title = 'Requer Certificado Digital A1 ativo nas configurações do escritório.';
      } else {
        a1Button.disabled = false;
        a1Button.innerHTML = '<svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.1.0#atrium-icon-download"></use></svg><span>Baixar Autos com A1</span>';
        a1Button.title = 'Baixar peças oficiais e autos integrais do eproc TJRS via Certificado A1.';
      }
    }

    const consultButton = byId('processInspectorTjrs');
    if (consultButton) {
      consultButton.classList.remove('hidden');
      if (!isTjrs) {
        consultButton.disabled = true;
        consultButton.dataset.tjrsConsult = '';
        consultButton.title = 'Atualização pelo eproc disponível apenas para processos TJRS.';
      } else {
        consultButton.disabled = !summary.canConsultTjrs;
        consultButton.dataset.tjrsConsult = summary.canConsultTjrs ? String(item.number || '') : '';
        consultButton.title = summary.canConsultTjrs
          ? 'Atualizar capa, partes, movimentos, sigilo e chave pelo eproc com Certificado A1'
          : 'Atualização pelo eproc indisponível para este número';
      }
    }

    const keyButton = byId('processInspectorAccessKey');
    if (keyButton) {
      keyButton.classList.remove('hidden');
      if (!isTjrs) {
        keyButton.disabled = true;
        keyButton.textContent = 'Chave de acesso';
        keyButton.classList.remove('is-available', 'is-configured', 'is-complete');
        keyButton.title = 'Chave de acesso aplicável a processos do eproc TJRS.';
      } else {
        const hasKey = Boolean(item.accessKey || item.chaveAcesso || item.hasAccessKey
          || (Array.isArray(item.tags) && item.tags.includes('chave-disponivel')));
        if (hasKey) {
          keyButton.textContent = 'Chave no cofre';
          keyButton.disabled = true;
          keyButton.classList.remove('is-available');
          keyButton.classList.add('is-configured', 'is-complete');
          keyButton.title = 'Chave de acesso do eproc já guardada no cofre cifrado para este processo.';
        } else {
          keyButton.textContent = 'Chave de acesso';
          keyButton.disabled = false;
          keyButton.classList.add('is-available');
          keyButton.classList.remove('is-configured', 'is-complete');
          keyButton.title = 'Adicionar chave de acesso para consulta restrita e autos.';
        }
      }
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
    const wasOpen = Boolean(backdrop && !backdrop.classList.contains('hidden'));
    backdrop?.classList.add('hidden');
    byId('processDocumentsBackdrop')?.classList.add('hidden');
    resetPanelSize(byId('processInspector'));
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
    syncPanelSizeControl(byId('processDocumentsDrawer'));
    queueMicrotask(() => byId('processDocumentsClose')?.focus());
  }

  function closeProcessDocuments({ returnToProcess = true } = {}) {
    byId('processDocumentsBackdrop')?.classList.add('hidden');
    resetPanelSize(byId('processDocumentsDrawer'));
    closeProcessDocumentPreview();
    if (returnToProcess && selectedItem) {
      byId('processInspectorBackdrop')?.classList.remove('hidden');
      queueMicrotask(() => byId('processInspectorDocuments')?.focus());
    } else {
      close({ restoreFocus: true });
    }
  }

  function closeProcessDocumentPreview() {
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
          <small>Use "Gerar caderno em PDFs" ou "Baixar Autos com A1" para capturar as peças oficiais.</small>
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
      setTimeout(() => {
        container.querySelector(`[data-doc-card-id="${focusDocId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 50);
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
        if (result?.type === 'image' && safeImageSource(result.src)) {
          const img = documentRef.createElement('img');
          img.src = safeImageSource(result.src);
          img.style.maxWidth = '100%';
          img.style.height = 'auto';
          img.style.borderRadius = '6px';
          img.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
          bodyEl.append(img);
        } else if (result?.text) {
          const pre = documentRef.createElement('pre');
          pre.className = 'process-doc-preview-text';
          pre.textContent = result.text;
          bodyEl.append(pre);
        } else if (result?.html) {
          bodyEl.innerHTML = sanitizeRichHtml(result.html);
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

  return Object.freeze({ init, renderRows, renderEmpty, renderPagination, updateCount, open, close, openProcessDocuments, closeProcessDocuments });
}

// Grau/competência derivado do OOOO do número CNJ (Resolução CNJ 65/2008);
// exibido apenas quando o dígito verificador confere.
function cnjDegreeChip(item, escapeHtml) {
  const descriptor = describeCnj(item?.number || item?.protocol || '');
  if (!descriptor?.valid) return '';
  return `<span class="process-phase">${escapeHtml(descriptor.degreeLabel)}</span>`;
}

function hasConfirmedEprocEnrichment(item) {
  const statusValues = [
    item?.enrichmentStatus,
    item?.eprocEnrichmentStatus,
    item?.eproc?.enrichmentStatus,
    item?.enrichment?.status
  ];
  const normalizedStatuses = statusValues.map(value => String(value || '').trim().toUpperCase()).filter(Boolean);
  // A retry/error/pending marker is authoritative and must not be hidden by
  // a stale completion timestamp or the legacy varredura-a1 tag.
  if (normalizedStatuses.some(value => ['PENDING', 'RETRYABLE_ERROR', 'ERROR', 'FAILED', 'IN_PROGRESS', 'RUNNING'].includes(value))) return false;
  const completeStatus = normalizedStatuses.some(value => ['COMPLETE', 'COMPLETED', 'ENRICHED', 'SUCCESS', 'SUCCEEDED'].includes(value));
  if (completeStatus) return true;

  const completionTimestamp = item?.eprocEnrichedAt
    || item?.eprocEnrichmentCompletedAt
    || item?.enrichmentCompletedAt
    || item?.eproc?.enrichedAt
    || item?.enrichment?.completedAt;
  if (completionTimestamp) return true;

  // Legacy tags are not completion evidence: varredura-a1 is also written
  // when only one detail field changes. Keep the marker until the canonical
  // enrichment status (or its completion timestamp) confirms completion.
  return false;
}

export function isProcessEnrichmentCandidate(item, hasA1 = true) {
  if (!item || hasA1 === false) return false;

  const isKnownEproc = [item.source, item.portalId, item.system, item.origin]
    .some(value => /eproc/i.test(String(value || '')));
  const isTjrs = String(item.number || '').includes('.8.21.') || String(item.court || '').toUpperCase().includes('TJRS');
  if (!isKnownEproc && !isTjrs) return false;
  // Pendência/erro explícito do enriquecimento é autoridade e mantém a indicação,
  // independentemente de cliente ou sigilo.
  const statusValues = [item.enrichmentStatus, item.eprocEnrichmentStatus, item.eproc?.enrichmentStatus, item.enrichment?.status]
    .map(value => String(value || '').trim().toUpperCase())
    .filter(Boolean);
  const explicitPending = item.needsEnrichment === true
    || statusValues.some(value => ['PENDING', 'RETRYABLE_ERROR', 'ERROR', 'FAILED'].includes(value));
  if (explicitPending && !hasConfirmedEprocEnrichment(item)) return true;
  if (hasConfirmedEprocEnrichment(item)) return false;
  const client = String(item.client || '').trim();
  // Enriquecimento é sobre cliente ausente/genérico — nunca sobre sigilo. A marca
  // de sigilo é dado da fonte e não indica que falte cadastro.
  return !client || /^(?:cliente\s+)?(?:geral|n[aã]o\s+informado|n[aã]o\s+identificado|modelo|do\s+escrit[oó]rio|sigilo|n\/?i|sem\s+cliente)$/i.test(client);
}

/**
 * Selos da triagem assistiva do processo: tipo de andamento sugerido e lacunas de
 * cadastro. Sempre aviso para conferência — nada é gravado, criado ou alterado.
 */
const PROCESS_MOVEMENT_LABELS = Object.freeze({
  peticao: 'Petição',
  decisao: 'Decisão',
  despacho: 'Despacho',
  sentenca: 'Sentença',
  audiencia: 'Audiência',
  cumprimento: 'Cumprimento',
  recurso: 'Recurso',
  expediente: 'Expediente',
  outro: 'Outro'
});

function processMissingFieldsChip({ triage, escapeHtml }) {
  const missingFields = Array.isArray(triage?.missingFields) ? triage.missingFields.map(String).filter(Boolean) : [];
  if (missingFields.length === 0) return '';
  return `<span class="process-triage-chip is-missing" title="Campos de cadastro em branco ou genéricos. Nada foi alterado.">Cadastro incompleto: ${escapeHtml(missingFields.join(', '))}</span>`;
}

function processTriageChips({ triage, escapeHtml }) {
  const chips = [];
  const movementKey = String(triage?.movementType || '').trim();
  const movement = PROCESS_MOVEMENT_LABELS[movementKey];
  const confidence = Number(triage?.movementConfidence) || 0;
  if (movement) {
    const note = confidence > 0
      ? `Sugestão automática de tipo de andamento (confiança ${Math.round(confidence * 100)}%). Nada foi alterado.`
      : 'Sugestão automática de tipo de andamento. Nada foi alterado.';
    chips.push(`<span class="process-triage-chip is-movement" title="${escapeHtml(note)}">${escapeHtml(movement)}</span>`);
  }
  if (String(triage?.needsAttention || '') === 'sim') {
    chips.push('<span class="process-triage-chip is-attention" title="O andamento parece exigir providência do escritório. Confira antes de agir.">Conferir providência</span>');
  }
  return chips;
}

export function renderRow({ item, escapeHtml, formatDate, hasA1Certificate = false, triage = null }) {
  const number = item.number || item.protocol || 'Sem número';
  const tribunal = item.court || 'TJRS';
  const phase = item.judicialPhase || item.stage || 'Fase não informada';
  const processMeta = unique([item.actionType, item.subject]).join(' · ') || 'Tipo de ação não informado';
  const registeredDate = item.registeredAt || item.createdAt;
  const genericClientRe = /^(?:cliente\s+)?(?:geral|n[aã]o\s+informado|n[aã]o\s+identificado|modelo|do\s+escrit[oó]rio|sigilo|n\/?i|sem\s+cliente)$/i;
  const displayedClient = item.resolvedClient || (genericClientRe.test(String(item.client || '').trim()) ? '' : item.client);
  const partyMeta = displayedClient
    ? (unique([item.clientPosition, item.opposingParty ? `vs. ${item.opposingParty}` : '']).join(' · ') || 'Vínculo confirmado na carteira')
    : 'A fonte não identificou com segurança a parte representada';
  const monitoringActive = item.monitoring === 'active';
  const monitoringLabel = monitoringActive ? 'Monitorando' : 'Monitoramento inativo';
  const riskLabel = riskPresentation(item.risk);
  const secrecy = item.secrecy
    ? '<span class="process-secrecy"><span aria-hidden="true">●</span> Segredo de justiça</span>'
    : '';
  const hasStoredKey = Boolean(item.hasAccessKey) || (Array.isArray(item.tags) && item.tags.includes('chave-disponivel'));
  const keyFlag = hasStoredKey
    ? '<span class="process-key-stored" title="Chave de acesso do eproc guardada no cofre do escritório; não significa segredo de justiça."><span aria-hidden="true">●</span> Chave de acesso guardada</span>'
    : '';
  const needsEnrichment = isProcessEnrichmentCandidate(item, hasA1Certificate);
  const enrichmentFlag = needsEnrichment
    ? '<span class="process-enrichment-flag" title="Processo necessita de enriquecimento eproc (cliente ainda não identificado)"><span aria-hidden="true">●</span> Enriquecimento eproc</span>'
    : '';
  const triageChips = processTriageChips({ triage, escapeHtml });
  const missingFieldsChip = processMissingFieldsChip({ triage, escapeHtml });

  return `<tr data-process-id="${escapeHtml(item.id)}" tabindex="0" aria-label="Ver detalhes do processo ${escapeHtml(number)}">
    <td class="process-cell-number" data-label="Processo">
      <strong data-process-number>${escapeHtml(number)}</strong>
      <small>${escapeHtml(processMeta)}</small>
      ${secrecy}
      ${keyFlag}
      ${enrichmentFlag}
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
      <strong>${escapeHtml(formatDate(registeredDate))}</strong>
      <small>${escapeHtml(compactSourceLabel(item.source) || 'eproc / Cadastro')}</small>
    </td>
    <td class="process-cell-movement" data-label="Último andamento">
      <strong>${escapeHtml(item.lastMovement || 'Sem movimentação')}</strong>
      <small>${escapeHtml(formatDate(item.lastMovementAt))}</small>
      ${(missingFieldsChip || triageChips.length) ? `<span class="process-triage-line">${missingFieldsChip}${triageChips.join('')}</span>` : ''}
    </td>
    <td class="process-cell-monitoring" data-label="Monitoramento">
      <span class="v2-status-badge ${monitoringActive ? 'is-success' : 'is-neutral'}"><span aria-hidden="true">${monitoringActive ? '●' : '○'}</span><span>${monitoringLabel}</span></span>
      <button type="button" class="v2-button is-secondary process-details-button" data-process-details aria-label="Ver detalhes do processo ${escapeHtml(number)}">Ver detalhes</button>
    </td>
  </tr>`;
}

export function renderInspector({ item, summary, escapeHtml, formatDate, formatMinutes, hasA1Certificate = false }) {
  const number = item.number || item.protocol || 'Processo sem número';
  const secrecy = item.secrecy
    ? '<span class="process-secrecy"><span aria-hidden="true">●</span> Segredo de justiça</span>'
    : '<span class="process-visibility">Consulta pública</span>';
  const needsEnrichment = isProcessEnrichmentCandidate(item, hasA1Certificate);
  const enrichmentFlag = needsEnrichment
    ? '<span class="process-enrichment-flag" title="Processo necessita de enriquecimento eproc (Segredo ou Cliente ausente)"><span aria-hidden="true">●</span> Enriquecimento eproc</span>'
    : '';
  const enrichmentBanner = needsEnrichment
    ? `<div class="process-enrichment-banner" role="status">
        <span class="process-enrichment-icon" aria-hidden="true">●</span>
        <div>
          <strong>Identificação eproc pendente</strong>
          <p>Processo em segredo de justiça ou com cliente ainda não identificado. O coletor eproc A1 busca os dados oficiais automaticamente.</p>
        </div>
      </div>`
    : '';
  const monitoring = item.monitoring === 'active' ? 'Monitorando' : 'Monitoramento inativo';
  const risk = riskPresentation(item.risk);
  const fee = feePresentation(item);
  const requisition = requisitionPresentation(item);

  return `<section class="process-inspector-identity" aria-labelledby="processInspectorIdentityHeading">
    <p class="process-inspector-kicker" id="processInspectorIdentityHeading">Leitura processual</p>
    <div class="process-inspector-number"><strong data-process-number>${escapeHtml(number)}</strong>${secrecy}${enrichmentFlag}</div>
    ${enrichmentBanner}
    <h3><button type="button" class="process-inspector-client-link" data-process-client aria-label="Abrir contato de ${escapeHtml(item.client || 'cliente não informado')}">${escapeHtml(item.client || 'Cliente não informado')}</button></h3>
    <p>${escapeHtml(item.clientPosition || 'Posição não informada')}${item.opposingParty ? ` <span>vs.</span> ${escapeHtml(item.opposingParty)}` : ''}</p>
    <div class="process-inspector-context"><strong>${escapeHtml(item.court || item.county || 'Órgão não informado')}</strong><span>${escapeHtml(unique([item.courtUnit, item.actionType, item.judicialPhase, item.stage]).join(' · ') || 'Classificação não informada')}</span>${cnjDegreeChip(item, escapeHtml)}</div>
  </section>

  <section class="process-inspector-section" aria-labelledby="processOperationalHeading">
    <h3 id="processOperationalHeading">Resumo operacional</h3>
    <div class="process-inspector-metrics">
      <button type="button" class="process-inspector-metric-link" data-process-tasks>${metric(summary.openTasks, 'Tarefas abertas', escapeHtml)}</button>
      ${metric(summary.linkedIntimations, 'Intimações vinculadas', escapeHtml)}
      ${metric(formatMinutes(summary.timeMinutes), 'Tempo apontado', escapeHtml)}
      ${metric(summary.nextDeadline ? formatDate(summary.nextDeadline) : '—', 'Próximo prazo existente', escapeHtml)}
    </div>
    <div class="process-last-movement"><span>Último andamento</span><strong>${escapeHtml(item.lastMovement || 'Ainda não informado.')}</strong><small>${escapeHtml(formatDate(item.lastMovementAt))}</small></div>
  </section>

  ${renderProcessAccess(item, summary, escapeHtml)}

  ${renderProcessFinance(item, escapeHtml, formatDate)}

  <section class="process-inspector-section" aria-labelledby="processTimelineHeading">
    <div class="process-inspector-section-heading"><h3 id="processTimelineHeading">Linha do tempo jurídica</h3><button type="button" class="button ghost" data-process-new-movement><svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.1.0#atrium-icon-add"></use></svg><span>Novo andamento</span></button></div>
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
      ${Array.isArray(summary.responsibleMembers) && summary.responsibleMembers.length
        ? `<div><dt>Responsável</dt><dd class="process-responsible-avatar">${memberAvatarHtml(summary.responsibleMembers[0], escapeHtml)}<span>${escapeHtml(item.responsible || summary.responsibleMembers[0].displayName || summary.responsibleMembers[0].username || '')}</span></dd></div>`
        : definition('Responsável', item.responsible, escapeHtml)}
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
      ${definition('Números anteriores', (Array.isArray(item.originNumbers) ? item.originNumbers : []).join(' · '), escapeHtml)}
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

function renderProcessAccess(item, summary, escapeHtml) {
  const access = summary?.access || {};
  const teams = Array.isArray(access.teams) ? access.teams : [];
  const members = Array.isArray(access.members) ? access.members : [];
  const teamIds = new Set((item.assignedTeamIds || []).map(String));
  const responsibleIds = new Set((item.responsibleUserIds || []).map(String));
  const currentTeams = teams.filter(team => teamIds.has(String(team.id)));
  const currentMembers = members.filter(member => responsibleIds.has(String(member.id)));
  const readOnly = !access.canAssign;
  const teamList = currentTeams.length
    ? currentTeams.map(team => `<span class="process-access-chip">${escapeHtml(team.name)}</span>`).join('')
    : '<span class="process-inspector-empty">Nenhuma equipe atribuída.</span>';
  const peopleList = currentMembers.length
    ? currentMembers.map(member => `<span class="process-access-chip">${escapeHtml(member.displayName || member.username)}</span>`).join('')
    : '<span class="process-inspector-empty">Nenhum advogado responsável vinculado.</span>';
  if (readOnly) {
    return `<section class="process-inspector-section" aria-labelledby="processAccessHeading"><h3 id="processAccessHeading">Equipe e acesso</h3><div class="process-access-readonly"><div><small>Equipe</small>${teamList}</div><div><small>Responsáveis</small>${peopleList}</div></div><p class="process-inspector-note">Somente gestores com permissão de atribuição podem alterar o acesso deste processo.</p></section>`;
  }
  const teamOptions = teams.length
    ? teams.map(team => `<label class="office-check"><input type="checkbox" data-process-access-team value="${escapeHtml(team.id)}" ${teamIds.has(String(team.id)) ? 'checked' : ''}> <span>${escapeHtml(team.name)}</span></label>`).join('')
    : '<span class="process-inspector-empty">Nenhuma equipe criada no escritório.</span>';
  const memberOptions = members.length
    ? members.map(member => `<label class="office-check"><input type="checkbox" data-process-access-user value="${escapeHtml(member.id)}" ${responsibleIds.has(String(member.id)) ? 'checked' : ''}> <span>${escapeHtml(member.displayName || member.username)}</span></label>`).join('')
    : '<span class="process-inspector-empty">Nenhum membro ativo.</span>';
  return `<section class="process-inspector-section" aria-labelledby="processAccessHeading"><div class="process-inspector-section-heading"><h3 id="processAccessHeading">Equipe e acesso</h3><button type="button" class="button ghost" data-process-access-save="${escapeHtml(item.id)}">Salvar acesso</button></div><div class="process-access-grid"><div><small>Equipe responsável</small><div class="office-check-grid">${teamOptions}</div></div><div><small>Advogados responsáveis</small><div class="office-check-grid">${memberOptions}</div></div></div><p class="process-inspector-note">Só equipes e advogados marcados veem este processo, suas tarefas, publicações, atendimentos e agenda. O financeiro continua dependendo de permissão própria.</p></section>`;
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
  return `<div class="process-linked-list">${tasks.map(task => `<button type="button" data-process-task="${escapeHtml(task.id)}" aria-label="Abrir tarefa ${escapeHtml(task.title || 'sem título')}"><strong>${escapeHtml(task.title || 'Tarefa sem título')}</strong><span>${escapeHtml(TASK_STATUS_LABELS[task.status] || task.status || 'Situação não informada')}${task.fatalDeadline || task.deadline ? ` · ${escapeHtml(formatDate(task.fatalDeadline || task.deadline))}` : ''}${task.responsible ? ` · ${escapeHtml(task.responsible)}` : ''}</span></button>`).join('')}</div>`;
}

function renderOperationalLinks(appointments, documents, escapeHtml, formatDate) {
  if (!appointments.length && !documents.length) return '';
  const appointmentItems = appointments.map(item => `<button type="button" data-process-agenda="${escapeHtml(item.id)}" aria-label="Abrir compromisso ${escapeHtml(item.title || 'sem título')}"><strong>${escapeHtml(item.title || 'Compromisso sem título')}</strong><span>${escapeHtml(formatDate(item.date || item.startAt))}${item.time ? ` · ${escapeHtml(item.time)}` : ''}</span></button>`).join('');
  const documentItems = documents.map(item => {
    const isOfficialA1 = item.documentType?.includes('eproc A1') || item.metadata?.origin?.includes('eproc TJRS (Certificado A1)');
    const sizeKb = item.size ? `${Math.round(item.size / 1024)} KB` : '';
    const badge = isOfficialA1 ? ' <span style="display:inline-block;padding:1px 5px;font-size:9px;border-radius:4px;background:rgba(37,99,235,0.15);color:var(--v2-color-primary,#2563eb);font-weight:600;">OFICIAL A1</span>' : '';
    return `<button type="button" data-process-document="${escapeHtml(item.id)}" aria-label="Abrir documento ${escapeHtml(item.name || item.originalName || 'sem nome')}"><strong>${escapeHtml(item.name || item.originalName || 'Documento sem nome')}${badge}</strong><span>${escapeHtml(item.documentType || item.type || 'Documento')}${sizeKb ? ` · ${sizeKb}` : ''} · ${escapeHtml(formatDate(item.documentDate || item.createdAt))}</span></button>`;
  }).join('');
  return `<section class="process-inspector-section" aria-labelledby="processRelationsHeading"><h3 id="processRelationsHeading">Compromissos e documentos (${documents.length})</h3><div class="process-linked-list">${appointmentItems}${documentItems}</div></section>`;
}

// Os códigos ficam no estado; aqui só muda o que aparece na tela.
const TREATMENT_LABELS = { untreated: 'Não tratada', in_review: 'Em análise', treated: 'Tratada', discarded: 'Descartada' };
const TASK_STATUS_LABELS = { triagem: 'Entrada e triagem', prioridade: 'Prioridade', fazendo: 'Em andamento', aguardando: 'Aguardando', revisao: 'Revisão', concluida: 'Concluída' };

function renderLinkedPublications(publications, escapeHtml, formatDate) {
  if (!publications.length) return '<p class="process-inspector-empty">Nenhuma publicação vinculada a este processo.</p>';
  return `<div class="process-linked-list">${publications.map(item => `<button type="button" data-process-publication="${escapeHtml(item.id)}" aria-label="Abrir publicação ${escapeHtml(item.title || 'sem título')}"><strong>${escapeHtml(item.title || 'Publicação sem título')}</strong><span>${escapeHtml(TREATMENT_LABELS[item.treatmentStatus] || TREATMENT_LABELS.untreated)} · ${escapeHtml(formatDate(item.publishedAt))}</span></button>`).join('')}</div>`;
}

function renderLegalTimeline(events, escapeHtml, formatDate) {
  if (!events.length) return '<p class="process-inspector-empty">Nenhum evento relacionado foi encontrado.</p>';
  const labels = {
    movement: 'Andamento', publication: 'Publicação', task: 'Tarefa', deadline: 'Prazo', appointment: 'Agenda',
    document: 'Documento', financial: 'Financeiro', audit: 'Auditoria', process: 'Processo'
  };
  return `<ol class="legal-timeline">${events.map(event => {
    const eventBadge = event.eventNumber != null ? `<span class="legal-timeline-event-badge">Ev. ${escapeHtml(event.eventNumber)}</span>` : '';
    const content = `<span class="legal-timeline-marker" aria-hidden="true"></span><div class="legal-timeline-date"><time>${escapeHtml(event.date ? formatDate(event.date) : 'Sem data')}</time><span>${escapeHtml(labels[event.type] || 'Evento')}</span>${eventBadge}</div><div class="legal-timeline-copy"><strong>${escapeHtml(event.title)}</strong>${event.detail ? `<small>${escapeHtml(event.detail)}</small>` : ''}${event.source ? `<em>${escapeHtml(event.source)}</em>` : ''}</div>`;
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
  return `<div class="process-access-key-action" data-process-access-key-status="loading"><div><strong>Chave de acesso do processo</strong><span data-process-access-key-copy>Verificando o cofre do escritório…</span></div><button type="button" class="button ghost" data-process-access-key>Adicionar chave</button></div>`;
}

function renderAutosAction(item, escapeHtml) {
  return '';
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
