const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const OWNED_OVERLAYS = Object.freeze([
  'publicationsEmailModalBackdrop',
  'publicationEmailBackdrop',
  'discardPublicationBackdrop',
  'treatPublicationBackdrop'
]);

export function createPublicationsV2Presenter({
  documentRef = globalThis.document,
  onCloseDetail
} = {}) {
  let initialized = false;
  let activeOverlay = null;
  let overlayReturnFocus = null;
  let overlayBodyOverflow = '';
  let detailReturnId = null;
  let detailBodyOverflow = '';
  let detailFocusPending = false;

  const byId = id => documentRef?.getElementById(id);
  const isV2 = () => documentRef?.documentElement?.dataset?.ui === 'v2';
  const isMobile = () => documentRef?.defaultView?.matchMedia?.('(max-width: 767px)').matches;

  function init() {
    if (initialized) return false;
    initialized = true;
    byId('intimationDetail')?.addEventListener('keydown', handleDetailKeydown);
    for (const id of OWNED_OVERLAYS) {
      byId(id)?.addEventListener('keydown', event => handleOverlayKeydown(event, id));
    }
    return true;
  }

  function updateCount({ visible, total }) {
    const count = byId('publicationResultCount');
    if (count) count.textContent = `${visible} de ${total} publicaç${total === 1 ? 'ão' : 'ões'}`;
  }

  function prepareDetailOpen(invoker, id) {
    detailReturnId = id || invoker?.dataset?.intimationId || null;
    detailFocusPending = true;
  }

  function syncDetailOpen() {
    if (!isV2()) return;
    const detail = byId('intimationDetail');
    const view = byId('view-inbox');
    if (!detail || !view) return;
    detail.setAttribute('aria-label', 'Leitura e tratamento da publicação selecionada');
    if (isMobile()) {
      if (!view.classList.contains('publication-detail-open')) detailBodyOverflow = documentRef.body?.style.overflow || '';
      view.classList.add('publication-detail-open');
      detail.setAttribute('role', 'dialog');
      detail.setAttribute('aria-modal', 'true');
      setDetailSiblingsInert(true);
      if (documentRef.body) documentRef.body.style.overflow = 'hidden';
      if (detailFocusPending) queueMicrotask(() => byId('publicationDetailClose')?.focus());
    } else {
      view.classList.remove('publication-detail-open');
      detail.setAttribute('role', 'region');
      detail.removeAttribute('aria-modal');
      setDetailSiblingsInert(false);
    }
    detailFocusPending = false;
  }

  function closeDetail({ restoreFocus = true } = {}) {
    const view = byId('view-inbox');
    const wasOpen = Boolean(view?.classList.contains('publication-detail-open'));
    view?.classList.remove('publication-detail-open');
    setDetailSiblingsInert(false);
    const detail = byId('intimationDetail');
    detail?.setAttribute('role', 'region');
    detail?.removeAttribute('aria-modal');
    if (wasOpen && documentRef.body) documentRef.body.style.overflow = detailBodyOverflow;
    if (restoreFocus && detailReturnId) {
      const returnTarget = [...(byId('inboxList')?.querySelectorAll('[data-intimation-id]') || [])]
        .find(element => element.dataset.intimationId === detailReturnId);
      if (returnTarget?.isConnected && typeof returnTarget.focus === 'function') queueMicrotask(() => returnTarget.focus());
    }
    detailFocusPending = false;
    return wasOpen;
  }

  function openOverlay(id, focusId) {
    if (!isV2()) return false;
    const backdrop = byId(id);
    if (!backdrop) return false;
    if (activeOverlay && activeOverlay !== id) closeOverlay(activeOverlay, { restoreFocus: false });
    activeOverlay = id;
    overlayReturnFocus = documentRef.activeElement;
    overlayBodyOverflow = documentRef.body?.style.overflow || '';
    backdrop.classList.remove('hidden');
    byId('appShell')?.setAttribute('inert', '');
    if (documentRef.body) documentRef.body.style.overflow = 'hidden';
    queueMicrotask(() => (byId(focusId) || firstFocusable(backdrop))?.focus());
    return true;
  }

  function closeOverlay(id, { restoreFocus = true } = {}) {
    if (!isV2()) return false;
    const backdrop = byId(id);
    const wasOpen = Boolean(backdrop && !backdrop.classList.contains('hidden'));
    backdrop?.classList.add('hidden');
    if (activeOverlay === id) {
      activeOverlay = null;
      byId('appShell')?.removeAttribute('inert');
      if (documentRef.body) documentRef.body.style.overflow = overlayBodyOverflow;
      if (wasOpen && restoreFocus && overlayReturnFocus?.isConnected && typeof overlayReturnFocus.focus === 'function') {
        queueMicrotask(() => overlayReturnFocus.focus());
      }
    }
    return wasOpen;
  }

  function handleDetailKeydown(event) {
    if (!isV2() || !isMobile() || !byId('view-inbox')?.classList.contains('publication-detail-open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCloseDetail?.();
      return;
    }
    trapFocus(event, byId('intimationDetail'));
  }

  function handleOverlayKeydown(event, id) {
    if (!isV2() || activeOverlay !== id) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeOverlay(id);
      return;
    }
    trapFocus(event, byId(id)?.querySelector('[role="dialog"]'));
  }

  function setDetailSiblingsInert(inert) {
    const view = byId('view-inbox');
    if (!view) return;
    for (const element of view.children) {
      if (element === byId('intimationDetail')) continue;
      if (element.classList.contains('inbox-layout')) {
        for (const child of element.children) {
          if (child !== byId('intimationDetail')) toggleInert(child, inert);
        }
      } else toggleInert(element, inert);
    }
  }

  return Object.freeze({ init, updateCount, prepareDetailOpen, syncDetailOpen, closeDetail, openOverlay, closeOverlay });
}

export function renderPublicationRow({ item, act, parties, selected, escapeHtml, formatDate, formatAge }) {
  const treatment = treatmentPresentation(item.treatmentStatus);
  const unread = item.unread === true;
  const urgent = Boolean(item.urgent || item.priority === 'urgente');
  const excerpt = String(item.text || 'Sem texto original.').replace(/\s+/g, ' ').trim();
  const priority = [urgent ? 'Urgente' : '', item.important ? 'Importante' : ''].filter(Boolean);
  const accessiblePriority = priority.length ? `${priority.join(' e ')}. ` : '';
  return `<button type="button" class="inbox-row v2-publication-record ${selected ? 'active' : ''} ${urgent ? 'is-urgent' : ''} ${item.important ? 'is-important' : ''} ${treatment.key === 'untreated' ? 'row-untreated' : ''}" data-intimation-id="${escapeHtml(item.id)}" aria-controls="intimationDetail" aria-pressed="${selected ? 'true' : 'false'}" aria-label="${accessiblePriority}${unread ? 'Não lida' : 'Lida'}. ${escapeHtml(item.title || 'Publicação sem título')}. Tratamento: ${treatment.label}">
    <span class="publication-record-status" aria-hidden="true"><i class="unread-dot ${unread ? '' : 'read'}"></i><span>${unread ? 'Não lida' : 'Lida'}</span></span>
    <span class="publication-record-copy">
      <span class="publication-record-flags">${priority.map(label => `<span class="publication-priority">${label}</span>`).join('')}<span class="act-chip ${escapeHtml(act.css)}">${escapeHtml(act.label)}</span></span>
      <strong>${escapeHtml(item.title || 'Publicação sem título')}</strong>
      <span class="publication-record-excerpt">${escapeHtml(excerpt)}</span>
      <span class="publication-record-case"><b>${escapeHtml(item.process || 'Sem processo vinculado')}</b><em>${escapeHtml(parties || 'Partes não identificadas')}</em></span>
    </span>
    <span class="publication-record-origin"><b>${escapeHtml(item.source || item.court || 'Origem não informada')}</b><small>${escapeHtml(item.court || 'Órgão não informado')}</small></span>
    <span class="publication-record-date"><b>${escapeHtml(formatAge(item.publishedAt))}</b><small>${escapeHtml(formatDate(item.publishedAt))}</small></span>
    <span class="treatment-badge ${treatment.css}">${treatment.label}</span>
    <span class="publication-record-action" aria-hidden="true">Ler publicação <span>→</span></span>
  </button>`;
}

export function renderPublicationEmpty({ total, filter, escapeHtml }) {
  const untreatedEmpty = total > 0 && (filter === 'untreated' || !filter);
  const title = total === 0
    ? 'Nenhuma publicação capturada.'
    : untreatedEmpty
      ? 'Não há publicações pendentes de tratamento.'
      : 'Nenhuma publicação encontrada.';
  const message = total === 0
    ? 'Importe ou cadastre uma publicação usando as ações existentes.'
    : untreatedEmpty
      ? 'As publicações capturadas estão em análise, tratadas ou descartadas.'
      : 'Não há publicações para o período, filtro ou ordenação selecionados.';
  return `<div class="v2-empty-state publication-empty-state"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>`;
}

export function renderPublicationDetail({
  item,
  act,
  parties,
  linkedTasks,
  privileged,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatAge
}) {
  const treatment = treatmentPresentation(item.treatmentStatus);
  const status = treatment.key;
  const unreadLabel = item.unread ? 'Não lida' : 'Lida';
  const urgent = Boolean(item.urgent || item.priority === 'urgente');
  const priorityLabels = [urgent ? 'Urgente' : '', item.important ? 'Importante' : ''].filter(Boolean);
  const treatmentInfo = renderTreatmentInfo({ item, treatment, escapeHtml, formatDateTime });
  const tasks = renderLinkedTasks({ linkedTasks, escapeHtml, formatDate });
  const actions = renderActions({ status, privileged });

  return `<div class="publication-detail-shell">
    <header class="detail-header">
      <button type="button" class="icon-button publication-detail-close" id="publicationDetailClose" aria-label="Fechar leitura da publicação">×</button>
      <div class="publication-detail-kicker"><span class="publication-read-state ${item.unread ? 'is-unread' : ''}">${unreadLabel}</span><span class="treatment-badge ${treatment.css}">${treatment.label}</span><span class="act-chip ${escapeHtml(act.css)}">${escapeHtml(act.label)}</span></div>
      <h2 id="publicationDetailTitle" tabindex="-1">${escapeHtml(item.title || 'Publicação sem título')}</h2>
      <p>${escapeHtml(item.court || 'Origem judicial não informada')}</p>
      ${priorityLabels.length ? `<div class="publication-detail-priority" aria-label="Prioridade: ${escapeHtml(priorityLabels.join(', '))}">${priorityLabels.map(label => `<span>${label}</span>`).join('')}</div>` : ''}
    </header>
    ${treatmentInfo}
    <dl class="detail-meta publication-detail-meta">
      ${definition('Processo', item.process || 'Não identificado', escapeHtml)}
      ${definition('Partes', parties || 'Ainda não identificadas', escapeHtml)}
      ${definition('Publicação', `${formatDate(item.publishedAt)} · ${formatAge(item.publishedAt)}`, escapeHtml)}
      ${definition('Origem', item.source || item.court || 'Não informada', escapeHtml)}
      ${definition('Responsável', item.responsible || item.lawyers || 'Advogado', escapeHtml)}
      ${definition('Estado de leitura', unreadLabel, escapeHtml)}
    </dl>
    ${tasks}
    <section class="publication-original" aria-labelledby="publicationOriginalHeading">
      <div><p>Conteúdo oficial</p><h3 id="publicationOriginalHeading">Texto original preservado</h3></div>
      <div class="original-text">${escapeHtml(item.text || 'Sem texto original.')}</div>
    </section>
    <footer class="detail-actions">${actions}</footer>
  </div>`;
}

function renderTreatmentInfo({ item, treatment, escapeHtml, formatDateTime }) {
  if (treatment.key === 'untreated') {
    return '<section class="treatment-info-banner untreated"><div><strong>Aguardando triagem humana</strong><span>Nenhuma providência foi iniciada automaticamente.</span></div></section>';
  }
  const metadata = treatment.key === 'in_review'
    ? { actor: item.treatmentStartedBy || 'Advogado', at: item.treatmentStartedAt, label: 'Análise iniciada por' }
    : treatment.key === 'treated'
      ? { actor: item.treatedBy || 'Advogado', at: item.treatedAt, label: 'Tratada por' }
      : { actor: item.discardedBy || 'Advogado', at: item.discardedAt, label: 'Descartada por' };
  return `<section class="treatment-info-banner ${treatment.css}"><div><strong>${escapeHtml(metadata.label)} ${escapeHtml(metadata.actor)}</strong><span>${metadata.at ? escapeHtml(formatDateTime(metadata.at)) : 'Data não informada'}</span>${item.treatmentNote ? `<small>${escapeHtml(item.treatmentNote)}</small>` : ''}</div></section>`;
}

function renderLinkedTasks({ linkedTasks, escapeHtml, formatDate }) {
  if (!linkedTasks.length) {
    return '<section class="linked-tasks-card is-empty"><div class="linked-tasks-header"><span>Providências vinculadas</span><strong>0</strong></div><p>Nenhuma tarefa foi criada para esta publicação.</p></section>';
  }
  return `<section class="linked-tasks-card"><div class="linked-tasks-header"><span>Providências vinculadas</span><strong>${linkedTasks.length}</strong></div><div class="linked-tasks-list">${linkedTasks.map(task => `<article class="linked-task-item"><div class="linked-task-info"><strong>${escapeHtml(task.title || 'Tarefa sem título')}</strong><small>${task.responsible ? `Responsável: ${escapeHtml(task.responsible)}` : 'Responsável não informado'}${task.deadline ? ` · Prazo informado: ${escapeHtml(formatDate(task.deadline))}` : ''}</small></div><button type="button" class="button ghost" data-open-task-id="${escapeHtml(task.id)}">Abrir tarefa</button></article>`).join('')}</div></section>`;
}

function renderActions({ status, privileged }) {
  const email = privileged ? '<button type="button" class="button ghost" data-detail-action="send-email" id="btnSendIntimationEmail">Enviar por e-mail</button>' : '';
  if (status === 'untreated') return `<button type="button" class="button gold" data-detail-action="start-review" id="btnStartReview">Iniciar análise</button><button type="button" class="button ghost" data-detail-action="task" id="btnCreateTask">Criar tarefa</button><button type="button" class="button ghost btn-success-action" data-detail-action="treat" id="btnMarkTreated">Marcar como tratada</button>${email}<button type="button" class="button ghost btn-danger-action" data-detail-action="discard" id="btnDiscardPublication">Descartar</button>`;
  if (status === 'in_review') return `<button type="button" class="button gold btn-success-action" data-detail-action="treat" id="btnMarkTreated">Marcar como tratada</button><button type="button" class="button ghost" data-detail-action="task" id="btnCreateTask">Criar tarefa</button>${email}<button type="button" class="button ghost btn-danger-action" data-detail-action="discard" id="btnDiscardPublication">Descartar</button>`;
  if (status === 'treated') return `<button type="button" class="button ghost" data-detail-action="reopen" id="btnReopenPublication">Reabrir análise</button><button type="button" class="button ghost" data-detail-action="task" id="btnCreateTask">Criar tarefa</button>${email}`;
  return `<button type="button" class="button gold" data-detail-action="restore" id="btnRestorePublication">Restaurar para triagem</button>${email}`;
}

function treatmentPresentation(value) {
  return ({
    untreated: { key: 'untreated', label: 'Não tratada', css: 'treatment-untreated' },
    in_review: { key: 'in_review', label: 'Em análise', css: 'treatment-in-review' },
    treated: { key: 'treated', label: 'Tratada', css: 'treatment-treated' },
    discarded: { key: 'discarded', label: 'Descartada', css: 'treatment-discarded' }
  })[value || 'untreated'] || { key: 'untreated', label: 'Não tratada', css: 'treatment-untreated' };
}

function definition(label, value, escapeHtml) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function firstFocusable(root) {
  return [...(root?.querySelectorAll(FOCUSABLE) || [])].find(element => element.getClientRects().length > 0);
}

function trapFocus(event, root) {
  if (event.key !== 'Tab') return;
  const focusable = [...(root?.querySelectorAll(FOCUSABLE) || [])].filter(element => element.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  const activeElement = root?.ownerDocument?.activeElement;
  if (event.shiftKey && activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function toggleInert(element, inert) {
  if (inert) element.setAttribute('inert', '');
  else element.removeAttribute('inert');
}
