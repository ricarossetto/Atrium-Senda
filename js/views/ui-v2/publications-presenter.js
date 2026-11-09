import { installPanelSizeToggle, resetPanelSize, syncPanelSizeControl } from '../../components/panel-size.js?v=3.0.2';
import { publicationReadableText } from '../../core/html-text.js?v=3.0.2';
import { buildPublicationBrief, publicationTodayReason } from '../../core/publication-brief.js?v=3.0.2';
import { isMergedIntimation } from '../../core/publication-scope.js?v=3.0.2';
import { layoutPublicationText } from '../../core/publication-text-layout.js?v=3.0.2';
import { SUSPENSION_NOTE, describeSuspension, suspensionForDate } from '../../core/suspension-calendar.js?v=3.0.2';
import { isValidCnj } from '../../core/cnj.js?v=3.0.2';
import { describeLinkSafety } from '../../core/link-safety.js?v=3.0.2';
import { formatPublicationLawyers, officeLawyerMatch, publicationLawyersList } from '../../core/publication-lawyers.js?v=3.0.2';
import { formatLawyerNames, officeSideLawyers } from '../../core/publication-parties.js?v=3.0.2';

/**
 * Conferência informativa do conteúdo mínimo da intimação no DJEN
 * (Resolução CNJ 455/2022, art. 12, §1º). Nunca bloqueia leitura ou tratamento.
 */
function djenQualityIssues(item, parties) {
  const externalId = String(item?.externalId || item?.id || '');
  const isDjen = item?.type === 'djen' || /^(?:djen:|intimation:djen:)/.test(externalId);
  if (!isDjen) return [];
  const issues = [];
  if (!isValidCnj(item?.process)) issues.push('número único do processo ausente ou com dígito verificador inválido');
  if (!String(item?.court || '').trim()) issues.push('tribunal ou órgão julgador não identificado');
  if (!String(item?.client || '').trim() && !String(parties || '').trim()) issues.push('partes não identificadas');
  if (!String(item?.disponibilizadoEm || item?.publishedAt || '').trim()) issues.push('data de disponibilização não informada');
  return issues;
}

const FOCUSABLE = 'summary, button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function publicationDisplayText(item) {
  const original = String(item?.text || item?.sourceText || item?.description || 'Sem texto original.');
  const full = item?.fullTextSource === 'domicilio' && item?.fullText ? String(item.fullText) : original;
  if (/<head\b/i.test(full) && !/<\/head\s*>/i.test(full)) return 'Conteúdo completo indisponível. Consulte a fonte oficial.';
  const readable = publicationReadableText(full);
  return readable || 'Conteúdo completo indisponível. Consulte a fonte oficial.';
}

/**
 * Um controle foi editado pelo usuário? Compara com o valor padrão renderizado.
 * Restrito a input/textarea/select: botões possuem `.value` mas não `.defaultValue`,
 * então incluí-los os marcaria como "editados" a todo re-render.
 */
export function isDetailControlEdited(element) {
  if (!element || typeof element.tagName !== 'string') return false;
  if (element.tagName === 'SELECT') {
    const marked = [...element.options].findIndex(option => option.defaultSelected);
    const baseline = marked >= 0 ? marked : 0;
    return element.selectedIndex !== baseline;
  }
  if (!element.matches('input, textarea')) return false;
  if (element.type === 'checkbox' || element.type === 'radio') return element.checked !== element.defaultChecked;
  return element.value !== element.defaultValue;
}
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
  let detailSnapshot = '';

  const byId = id => documentRef?.getElementById(id);
  const isV2 = () => documentRef?.documentElement?.dataset?.ui === 'v2';
  function init() {
    if (initialized) return false;
    initialized = true;
    byId('intimationDetail')?.addEventListener('keydown', handleDetailKeydown);
    byId('intimationDetail')?.addEventListener('click', event => {
      const toggle = event.target.closest?.('[data-original-text-toggle]');
      if (toggle) setOriginalTextExpanded(toggle.closest('.publication-original'), !toggle.closest('.publication-original').classList.contains('is-expanded'));
    });
    installPanelSizeToggle(byId('intimationDetail'), { documentRef });
    byId('publicationInspectorBackdrop')?.addEventListener('click', event => {
      if (event.target === byId('publicationInspectorBackdrop')) onCloseDetail?.();
    });
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
    if (!view.classList.contains('publication-detail-open')) detailBodyOverflow = documentRef.body?.style.overflow || '';
    view.classList.add('publication-detail-open');
    byId('publicationInspectorBackdrop')?.classList.remove('hidden');
    byId('publicationInspectorBackdrop')?.setAttribute('aria-hidden', 'false');
    detail.setAttribute('aria-label', 'Leitura e tratamento da publicação selecionada');
    detail.setAttribute('role', 'dialog');
    detail.setAttribute('aria-modal', 'true');
    setDetailSiblingsInert(true);
    if (documentRef.body) documentRef.body.style.overflow = 'hidden';
    if (detailFocusPending) {
      const focusClose = () => {
        if (!activeOverlay && !detail.closest('[inert]') && view.classList.contains('publication-detail-open')) {
          byId('publicationDetailClose')?.focus({ preventScroll: true });
        }
      };
      const requestFrame = documentRef?.defaultView?.requestAnimationFrame;
      if (typeof requestFrame === 'function') requestFrame.call(documentRef.defaultView, focusClose);
      else queueMicrotask(focusClose);
    }
    if (detailFocusPending || !detailSnapshot) detailSnapshot = detailFormSnapshot();
    detailFocusPending = false;
  }

  function captureDetailRender(id) {
    const detail = byId('intimationDetail');
    if (!detail || detail.dataset.publicationId !== String(id)) return null;
    const controls = [...detail.querySelectorAll(`${FOCUSABLE}, input, textarea, select`)];
    const identity = element => element.id
      ? [['id', element.id]]
      : [...element.attributes].filter(attribute => attribute.name.startsWith('data-')).map(attribute => [attribute.name, attribute.value]);
    const edited = controls.filter(isDetailControlEdited)
      .map(element => ({ key: identity(element), value: element.value, checked: element.checked }));
    const active = documentRef.activeElement;
    const focused = !activeOverlay && !detail.closest('[inert]') && detail.contains(active)
      ? { key: identity(active), start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection }
      : null;
    const folds = Object.fromEntries([...detail.querySelectorAll('details[data-fold]')].map(fold => [fold.dataset.fold, fold.open]));
    const textExpanded = Boolean(detail.querySelector('.publication-original.is-expanded'));
    return { id: String(id), edited, focused, folds, textExpanded, scrollTop: detail.scrollTop };
  }

  function restoreDetailRender(snapshot) {
    const detail = byId('intimationDetail');
    if (!snapshot || !detail || detail.dataset.publicationId !== snapshot.id) return;
    detailSnapshot = detailFormSnapshot();
    // Primeiro as seções: campo dentro de seção recolhida não recebe foco.
    for (const fold of detail.querySelectorAll('details[data-fold]')) {
      if (fold.dataset.fold in snapshot.folds) fold.open = snapshot.folds[fold.dataset.fold] || fold.open;
    }
    if (snapshot.textExpanded) setOriginalTextExpanded(detail.querySelector('.publication-original'), true);
    const controls = [...detail.querySelectorAll(`${FOCUSABLE}, input, textarea, select`)];
    const resolve = key => key.length ? controls.find(element => key.every(([name, value]) => element.getAttribute(name) === value)) : null;
    for (const edit of snapshot.edited) {
      const control = resolve(edit.key);
      if (!control) continue;
      if ('value' in control) control.value = edit.value;
      if ('checked' in control) control.checked = edit.checked;
    }
    detail.scrollTop = snapshot.scrollTop;
    if (!snapshot.focused || activeOverlay || detail.closest('[inert]')) return;
    const active = documentRef.activeElement;
    if (active !== documentRef.body && active !== documentRef.documentElement && !detail.contains(active)) return;
    const target = resolve(snapshot.focused.key);
    if (!target || target.disabled || !target.getClientRects().length) return;
    target.focus({ preventScroll: true });
    if (snapshot.focused.start != null && typeof target.setSelectionRange === 'function') {
      target.setSelectionRange(snapshot.focused.start, snapshot.focused.end, snapshot.focused.direction);
    }
  }

  function detailFormSnapshot() {
    const detail = byId('intimationDetail');
    if (!detail) return '';
    return JSON.stringify([...detail.querySelectorAll('input, textarea, select, [contenteditable="true"]')].map(element => ({
      name: element.name || element.id || '',
      value: element.isContentEditable ? element.textContent : element.value,
      checked: 'checked' in element ? element.checked : undefined
    })));
  }

  function hasUnsavedDetailChanges() {
    return Boolean(detailSnapshot && detailSnapshot !== detailFormSnapshot());
  }

  function closeDetail({ restoreFocus = true } = {}) {
    const view = byId('view-inbox');
    const wasOpen = Boolean(view?.classList.contains('publication-detail-open'));
    view?.classList.remove('publication-detail-open');
    byId('publicationInspectorBackdrop')?.classList.add('hidden');
    byId('publicationInspectorBackdrop')?.setAttribute('aria-hidden', 'true');
    setDetailSiblingsInert(false);
    const detail = byId('intimationDetail');
    detail?.setAttribute('role', 'region');
    detail?.removeAttribute('aria-modal');
    detail?.removeAttribute('data-publication-id');
    resetPanelSize(detail);
    detailSnapshot = '';
    if (wasOpen && documentRef.body) documentRef.body.style.overflow = detailBodyOverflow;
    if (restoreFocus && detailReturnId) {
      const returnRecord = [...(byId('inboxList')?.querySelectorAll('[data-intimation-id]') || [])]
        .find(element => element.dataset.intimationId === detailReturnId);
      const returnTarget = returnRecord?.querySelector('.publication-record-open') || returnRecord;
      if (returnTarget?.isConnected && typeof returnTarget.focus === 'function') queueMicrotask(() => returnTarget.focus({ preventScroll: true }));
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
    if (!isV2() || !byId('view-inbox')?.classList.contains('publication-detail-open')) return;
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
    for (const shellElement of [byId('sidebar'), documentRef?.querySelector?.('.topbar')]) toggleInert(shellElement, inert);
    for (const element of view.children) {
      if (element === byId('intimationDetail')) continue;
      if (element.classList.contains('inbox-layout')) {
        for (const child of element.children) {
          if (child !== byId('intimationDetail') && child !== byId('publicationInspectorBackdrop')) toggleInert(child, inert);
        }
      } else toggleInert(element, inert);
    }
  }

  function syncDetailSizeControl() {
    return syncPanelSizeControl(byId('intimationDetail'));
  }

  return Object.freeze({ init, updateCount, prepareDetailOpen, syncDetailOpen, captureDetailRender, restoreDetailRender, syncDetailSizeControl, closeDetail, hasUnsavedDetailChanges, openOverlay, closeOverlay });
}

export function publicationCaptureDate(item) {
  return item?.sourceCollectedAt || item?.firstSeenAt || item?.createdAt || '';
}

const DUPLICATE_VERDICT_LABELS = Object.freeze({
  mesma: 'Mesma publicação',
  diferente: 'Publicações diferentes',
  incerto: 'Incerto'
});

/**
 * Painel de duplicatas prováveis: mostra os pares candidatos e o veredito assistivo.
 * Nenhuma fusão acontece aqui — o fusão oficial continua sendo ação humana.
 */
export function renderDuplicateReviewPanel({ panel, escapeHtml }) {
  if (!panel || !panel.enabled) return '';
  const pairs = Array.isArray(panel.pairs) ? panel.pairs : [];
  if (!pairs.length) {
    return '<header class="duplicate-review-head"><strong>Duplicatas prováveis</strong>'
      + '<span>Nenhuma duplicata para revisar.</span></header>';
  }
  const confirmable = pairs.filter(pair => pair.verdict === 'mesma');
  const rows = pairs.map(pair => {
    const verdict = DUPLICATE_VERDICT_LABELS[pair.verdict] || '';
    const confidence = Number(pair.confidence) || 0;
    const chip = verdict
      ? `<span class="duplicate-verdict verdict-${escapeHtml(pair.verdict)}" title="Sugestão automática para conferência (confiança ${Math.round(confidence * 100)}%). Nada foi fundido.">${escapeHtml(verdict)}</span>`
      : '<span class="duplicate-verdict verdict-pendente" title="Par candidato ainda não analisado pela IA de conferência.">Não analisado</span>';
    const record = (id, label, source) => `<button type="button" class="duplicate-record" data-duplicate-open="${escapeHtml(id)}" title="Abrir a publicação no acervo">`
      + `<span class="duplicate-record-source">${escapeHtml(source || 'fonte')}</span>`
      + `<span class="duplicate-record-label">${escapeHtml(label || id)}</span></button>`;
    const confirming = String(panel.mergeCandidate || '') === pair.key;
    const refusal = pair.refusal && pair.refusal.label
      ? `<span class="duplicate-refusal" title="${escapeHtml(pair.refusal.detail || pair.refusal.label)}">${escapeHtml(pair.refusal.label)}</span>`
      : '';
    const verdictCell = `<span class="duplicate-verdict-cell">${chip}${refusal}</span>`;
    const mergeControls = confirming
      ? `<span class="duplicate-merge-actions"><button type="button" class="button gold" data-duplicate-action="merge-confirm" data-duplicate-a="${escapeHtml(pair.aId)}" data-duplicate-b="${escapeHtml(pair.bId)}">Sim, fundir</button>`
        + '<button type="button" class="button ghost" data-duplicate-action="merge-cancel">Cancelar</button></span>'
      : `<span class="duplicate-merge-actions"><button type="button" class="button ghost duplicate-merge-start" data-duplicate-action="merge" data-duplicate-key="${escapeHtml(pair.key)}" title="Mantém o registro mais completo, transforma o outro em alias reversível e reaponta as tarefas para o oficial.">Confirmar fusão</button>`
        + `<button type="button" class="button ghost duplicate-dismiss-start" data-duplicate-action="dismiss" data-duplicate-key="${escapeHtml(pair.key)}" data-duplicate-a="${escapeHtml(pair.aId)}" data-duplicate-b="${escapeHtml(pair.bId)}" title="Não fundir: o par sai da conferência e a decisão vira exemplo do aprendizado do Atrium IA.">Descartar sugestão</button></span>`;
    return `<li class="duplicate-pair" data-duplicate-key="${escapeHtml(pair.key)}">`
      + record(pair.aId, pair.aLabel, pair.aSource)
      + '<span class="duplicate-vs" aria-hidden="true">×</span>'
      + record(pair.bId, pair.bLabel, pair.bSource)
      + verdictCell
      + mergeControls
      + '</li>';
  }).join('');
  const bulk = confirmable.length > 1
    ? `<button type="button" class="button gold duplicate-review-bulk" data-duplicate-action="confirm-all" data-duplicate-count="${confirmable.length}" title="Confirma em lote as sugestões em que o Atrium IA viu a mesma publicação. Cada confirmação fica na auditoria.">Confirmar tudo (${confirmable.length})</button>`
    : '';
  return '<header class="duplicate-review-head">'
    + `<strong>Duplicatas prováveis (${pairs.length})</strong>`
    + '<span>Mesmo processo e mesmo ato — revise e confirme a fusão (manual e reversível).</span>'
    + bulk
    + `<button type="button" class="button ghost duplicate-review-run" data-duplicate-action="analyze"${panel.running ? ' disabled' : ''}>${panel.running ? 'Procurando…' : 'Procurar duplicatas'}</button>`
    + '</header>'
    + `<ul class="duplicate-pair-list">${rows}</ul>`;
}

function deadlineSourceName(source) {
  const value = String(source || '').trim().toLowerCase();
  if (value === 'pje') return 'PJe';
  if (value === 'eproc') return 'eproc';
  return value;
}

export function renderPublicationRow({ item, act, parties, selected, escapeHtml, formatDate, formatDateTime = formatDate, formatAge, aiClassifier = null, involved = '' }) {
  if (!item || isMergedIntimation(item)) return '';
  const treatment = treatmentPresentation(item.treatmentStatus);
  const unread = item.unread === true;
  const urgent = Boolean(item.urgent || item.priority === 'urgente');
  const excerpt = publicationDisplayText(item).replace(/\s+/g, ' ').trim();
  const priority = [urgent ? 'Urgente' : '', item.important ? 'Importante' : ''].filter(Boolean);
  const accessiblePriority = priority.length ? `${priority.join(' e ')}. ` : '';
  const aiChip = renderAiClassifierChip({ classifier: aiClassifier, escapeHtml });
  const aiDeadlineChip = renderAiClassifierDeadlineChip({ classifier: aiClassifier, escapeHtml });
  const todayReason = publicationTodayReason(item, { classifier: aiClassifier });
  const todayLabel = todayReason
    ? (todayReason.startsWith('vencido')
      ? `${todayReason.charAt(0).toUpperCase()}${todayReason.slice(1)}`
      : `Hoje · ${todayReason}`)
    : '';
  const todayChip = todayLabel
    ? `<span class="publication-today-chip" title="Entra na fila do dia">${escapeHtml(todayLabel)}</span>`
    : '';
  const aiHint = aiChip ? 'Atrium IA sugere uma área para conferência. ' : '';
  const capturedValue = publicationCaptureDate(item);
  const capturedLabel = capturedValue
    ? (/\d{2}:\d{2}/.test(String(capturedValue)) ? formatDateTime(capturedValue) : formatDate(capturedValue))
    : '';
  const capture = capturedLabel ? `<span class="publication-record-capture">Capturada em ${escapeHtml(capturedLabel)}</span>` : '';
  const sourceDeadlineApplied = item.deadlineSource === 'eproc' || item.deadlineSource === 'pje';
  const sourceDeadlineLabel = sourceDeadlineApplied
    ? `Prazo do ${escapeHtml(deadlineSourceName(item.deadlineSource))}`
    : (item.sourceReportedDeadlineSource === 'domicilio' ? 'Domicílio Eletrônico informou' : item.sourceReportedDeadlineSource === 'pje' ? 'PJe informou' : 'Eproc informou');
  const eprocDeadline = item.sourceReportedDeadlineAt
    ? (sourceDeadlineApplied
      ? `<span class="publication-source-deadline">${sourceDeadlineLabel}: ${escapeHtml(formatDate(item.sourceReportedDeadlineAt))}</span>`
      : `<span class="publication-source-deadline">${sourceDeadlineLabel} ${escapeHtml(formatDate(item.sourceReportedDeadlineAt))} · conferir</span>`)
    : '';
  const quickTreat = treatment.key === 'untreated' || treatment.key === 'in_review'
    ? `<button type="button" class="publication-row-quick" data-row-action="mark_treated" data-publication-id="${escapeHtml(item.id)}" aria-label="Marcar como tratada sem abrir">${iconSvg('check')}</button>`
    : '';
  const aside = `<span class="publication-record-aside">${involved}${quickTreat}<span class="treatment-badge ${treatment.css}">${treatment.label}</span></span>`;
  return `<div class="publication-record-shell" data-intimation-id="${escapeHtml(item.id)}">
  <button type="button" class="inbox-row v2-publication-record publication-record-open ${selected ? 'active' : ''} ${urgent ? 'is-urgent' : ''} ${item.important ? 'is-important' : ''} ${treatment.key === 'untreated' ? 'row-untreated' : ''}" aria-controls="intimationDetail" aria-pressed="${selected ? 'true' : 'false'}" aria-label="${accessiblePriority}${todayReason ? `Hoje: ${escapeHtml(todayReason)}. ` : ''}${aiHint}${unread ? 'Não lida' : 'Lida'}. ${escapeHtml(item.title || 'Publicação sem título')}. Tratamento: ${treatment.label}">
    <span class="publication-record-status" aria-hidden="true"><i class="unread-dot ${unread ? '' : 'read'}"></i><span>${unread ? 'Não lida' : 'Lida'}</span></span>
    <span class="publication-record-copy">
          <span class="publication-record-flags">${priority.map(label => `<span class="publication-priority">${label}</span>`).join('')}${todayChip}${aiChip}${aiDeadlineChip}<span class="act-chip ${escapeHtml(act.css)}">${escapeHtml(act.label)}</span></span>
      <strong>${escapeHtml(item.title || 'Publicação sem título')}</strong>
      <span class="publication-record-case"><b>${escapeHtml(item.process || 'Sem processo vinculado')}</b><em>${escapeHtml(parties || 'Partes não identificadas')}</em>${capture}</span>
      ${eprocDeadline}
      <span class="publication-record-excerpt">${escapeHtml(excerpt)}</span>
    </span>
    <span class="publication-record-origin"><b>${escapeHtml(item.source || item.court || 'Origem não informada')}</b><small>${escapeHtml(item.court || 'Órgão não informado')}</small></span>
    <span class="publication-record-date"><b>${item.publishedAt ? escapeHtml(formatAge(item.publishedAt)) : item.disponibilizadoEm ? 'Disponibilização' : item.sourceReportedAt ? 'Data da fonte' : escapeHtml(formatAge(item.publishedAt))}</b><small>${escapeHtml(formatDate(item.publishedAt || item.disponibilizadoEm || item.sourceReportedAt))}</small></span>
    <span class="publication-record-action" aria-hidden="true">Ler publicação <svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.2#atrium-icon-chevron-right"></use></svg></span>
  </button>
  ${aside}
</div>`;
}

export function renderPublicationEmpty({ total, filter, escapeHtml }) {
  const untreatedEmpty = total > 0 && (filter === 'untreated' || !filter);
  const todayEmpty = filter === 'today';
  const title = total === 0
    ? 'Nenhuma publicação capturada.'
    : todayEmpty
      ? 'Nada exige sua atenção hoje.'
      : untreatedEmpty
        ? 'Não há publicações pendentes de tratamento.'
        : 'Nenhuma publicação encontrada.';
  const message = total === 0
    ? 'Importe ou cadastre uma publicação usando as ações existentes.'
    : todayEmpty
      ? 'Nenhuma publicação exige sua atenção hoje. Veja todas as publicações para conferir o acervo.'
      : untreatedEmpty
        ? 'As publicações capturadas estão em análise, tratadas ou descartadas.'
        : 'Não há publicações para o período, filtro ou ordenação selecionados.';
  return `<div class="v2-empty-state publication-empty-state"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>`;
}

const AI_CLASSIFIER_AREA_LABELS = {
  civil: 'Cível',
  trabalhista: 'Trabalhista',
  previdenciario: 'Previdenciário',
  fazenda: 'Fazenda pública',
  marcas: 'Marcas e patentes',
  criminal: 'Criminal',
  tributario: 'Tributário',
  outro: 'Outra área'
};

const AI_CLASSIFIER_PRIORITY_LABELS = {
  alta: 'Alta',
  normal: 'Normal',
  baixa: 'Baixa'
};

function aiClassifierLabel(map, value) {
  const key = String(value || '').trim();
  if (!key) return '';
  return map[key] || key;
}

function aiClassifierConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return `Confiança ${number.toFixed(2).replace('.', ',')}`;
}

export function renderAiClassifierChip({ classifier = null, escapeHtml }) {
  if (!classifier || classifier.enabled !== true || !classifier.action) return '';
  const detail = classifier.suggestion && classifier.suggestion.suggestion ? classifier.suggestion.suggestion : (classifier.suggestion || {});
  const areaLabel = aiClassifierLabel(AI_CLASSIFIER_AREA_LABELS, detail.area?.label || classifier.area);
  const priority = aiClassifierLabel(AI_CLASSIFIER_PRIORITY_LABELS, detail.priority?.label || classifier.priority);
  if (!areaLabel && !priority) return '';
  // Área incerta não aparece como fato na lista: a pessoa vê que falta conferir.
  const areaConfidence = Number(detail.area?.confidence ?? classifier.areaConfidence ?? classifier.confidence);
  const area = areaLabel && Number.isFinite(areaConfidence) && areaConfidence < 0.6 ? 'Área a conferir' : areaLabel;
  const firm = classifier.action === 'suggest';
  const confidence = aiClassifierConfidence(detail.area?.confidence ?? classifier.areaConfidence ?? classifier.confidence);
  const label = [area, priority].filter(Boolean).join(' · ');
  const title = ['Atrium IA', confidence, firm ? 'sugestão para conferência' : 'sem sugestão firme'].filter(Boolean).join(' · ');
  return `<span class="publication-ai-chip ${firm ? 'is-firm' : 'is-soft'}" title="${escapeHtml(title)}">${iconSvg('assistant')}<span>${escapeHtml(label)}</span></span>`;
}

const AI_DEADLINE_DAYS = Object.freeze({ d5: 5, d10: 10, d15: 15, d20: 20, d30: 30 });

export function renderAiClassifierDeadlineChip({ classifier = null, escapeHtml }) {
  if (!classifier || classifier.enabled !== true) return '';
  const signal = String(classifier.deadlineSignal || classifier.suggestion?.suggestion?.deadline_signal?.label || '');
  if (signal !== 'sim') return '';
  const daysLabel = String(classifier.deadlineDays || classifier.suggestion?.suggestion?.deadline_days?.label || '');
  const days = AI_DEADLINE_DAYS[daysLabel] || null;
  const label = days ? `Possível prazo · ${days} dias` : 'Possível prazo no texto';
  const title = `Atrium IA: o texto menciona prazo, audiência ou ato com data${days ? ` (${days} dias)` : ''}. Confira na contagem — nada é gravado automaticamente.`;
  return `<span class="publication-ai-deadline" title="${escapeHtml(title)}">${iconSvg('warning')}<span>${escapeHtml(label)}</span></span>`;
}

export function renderAiClassifierPanel({ panel, escapeHtml }) {
  if (!panel || panel.enabled !== true) return '';
  const status = panel.status || 'loading';
  const head = '<strong>Atrium IA</strong>';
  const open = `<section class="ai-classifier-panel" role="status" aria-label="Atrium IA">`;
  if (status === 'loading') {
    return `${open}${iconSvg('assistant')}<div class="ai-classifier-panel-body">${head}<span>Gerando sugestão…</span></div></section>`;
  }
  if (status === 'unavailable' || status === 'error') {
    const fallback = status === 'unavailable'
      ? 'Atrium IA indisponível no servidor.'
      : 'Não foi possível gerar a sugestão.';
    return `${open}${iconSvg('warning')}<div class="ai-classifier-panel-body">${head}<span>${escapeHtml(panel.message || fallback)}</span><div><button type="button" class="button ghost ai-classifier-refresh" data-ai-classifier-action="refresh">${iconSvg('refresh')}<span>Tentar de novo</span></button></div></div></section>`;
  }
  const detail = panel.suggestion && panel.suggestion.suggestion ? panel.suggestion.suggestion : {};
  const chips = [];
  const area = aiClassifierLabel(AI_CLASSIFIER_AREA_LABELS, detail.area?.label);
  const humanArea = detail.area?.origin === 'humano';
  if (area) chips.push(`<span class="act-chip${humanArea ? ' is-human' : ''}">Área: ${escapeHtml(area)}${humanArea ? ' · conferida por você' : ''}</span>`);
  const priority = aiClassifierLabel(AI_CLASSIFIER_PRIORITY_LABELS, detail.priority?.label);
  const humanPriority = detail.priority?.origin === 'humano';
  if (priority) chips.push(`<span class="act-chip${humanPriority ? ' is-human' : ''}">Prioridade: ${escapeHtml(priority)}${humanPriority ? ' · conferida por você' : ''}</span>`);
  const confidence = aiClassifierConfidence(detail.area?.confidence ?? panel.suggestion?.confidence);
  if (confidence && !humanArea) chips.push(`<span class="act-chip">${escapeHtml(confidence)}</span>`);
  const firm = panel.suggestion?.action === 'suggest';
  const correcting = String(panel.correcting || '');
  const optionButton = (questionKey, value, text) => `<button type="button" class="button ghost ai-classifier-option" data-ai-classifier-action="correct-apply" data-ai-classifier-question="${escapeHtml(questionKey)}" data-ai-classifier-label="${escapeHtml(value)}">${escapeHtml(text)}</button>`;
  const optionButtons = (questionKey, labels) => Object.entries(labels)
    .map(([value, text]) => optionButton(questionKey, value, text))
    .join('');
  // Áreas fixas do vocabulário + as nomeadas pelo escritório (cadastradas em "Outra área"): todas
  // viram botão; "Outra área" abre o campo para nomear uma nova.
  const fixedAreaLabels = Object.fromEntries(Object.entries(AI_CLASSIFIER_AREA_LABELS).filter(([value]) => value !== 'outro'));
  const customAreas = (Array.isArray(panel.customAreas) ? panel.customAreas : []).map(String).filter(Boolean).slice(0, 24);
  const cancelButton = '<button type="button" class="button ghost" data-ai-classifier-action="correct-cancel">Cancelar</button>';
  const correctBlock = correcting === 'area'
    ? '<div class="ai-classifier-correct" role="group" aria-label="Corrigir área da publicação">'
      + '<span class="ai-classifier-correct-title">Qual é a área correta?</span>'
      + `<div class="ai-classifier-correct-options">${optionButtons('area', fixedAreaLabels)}`
      + customAreas.map(area => optionButton('area', area, area)).join('')
      + optionButton('area', 'outro', 'Outra área…')
      + cancelButton
      + '</div></div>'
    : correcting === 'area-custom'
      ? '<div class="ai-classifier-correct ai-classifier-custom" role="group" aria-label="Nomear outra área">'
        + '<span class="ai-classifier-correct-title">Qual é o nome da área?</span>'
        + '<div class="ai-classifier-correct-options ai-classifier-custom-row">'
        + '<input id="aiClassifierCustomAreaInput" type="text" maxlength="48" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Ex.: Direito do consumidor" aria-label="Nome da área">'
        + '<button type="button" class="button ghost ai-classifier-option" data-ai-classifier-action="custom-save">Salvar área</button>'
        + optionButton('area', 'outro', 'Usar "Outra área" sem nomear')
        + cancelButton
        + '</div></div>'
      : correcting === 'priority'
        ? '<div class="ai-classifier-correct" role="group" aria-label="Corrigir prioridade da publicação">'
          + '<span class="ai-classifier-correct-title">Qual é a prioridade correta?</span>'
          + `<div class="ai-classifier-correct-options">${optionButtons('priority', AI_CLASSIFIER_PRIORITY_LABELS)}`
          + `${cancelButton}</div></div>`
        : '';
  const panelActions = '<div class="ai-classifier-actions">'
    + (!correcting ? `<button type="button" class="button ghost" data-ai-classifier-action="correct" data-ai-classifier-question="area">${iconSvg('check')}<span>Corrigir área</span></button>`
      + `<button type="button" class="button ghost" data-ai-classifier-action="correct" data-ai-classifier-question="priority">${iconSvg('check')}<span>Corrigir prioridade</span></button>` : '')
    + `<button type="button" class="button ghost ai-classifier-refresh" data-ai-classifier-action="refresh">${iconSvg('refresh')}<span>Atualizar sugestão</span></button></div>`;
  const note = humanArea || humanPriority
    ? 'Rótulo conferido por você: o classificador aprende com a correção e não sobrescreve esta escolha.'
    : firm
      ? 'Sugestão automática para conferência. Não altera tratamento, prazo ou responsável.'
      : 'Sem sugestão firme · confira manualmente ou corrija o rótulo para o classificador aprender.';
  return `${open}${iconSvg('assistant')}<div class="ai-classifier-panel-body">${head}`
    + `${chips.length ? `<div class="ai-classifier-chips">${chips.join('')}</div>` : ''}`
    + `<p class="ai-classifier-note">${escapeHtml(note)}</p>`
    + correctBlock
    + panelActions + '</div></section>';
}

/**
 * Nota do prazo da conferência no bloco da providência: o valor calculado entra na tarefa criada
 * (data humana confirmada na contagem — a IA não decide nada). Exportada porque o recurso atualiza
 * a nota em tempo real quando a contagem roda, sem re-renderizar o detalhe inteiro.
 */
export function renderProvidenceDeadlineNote({ conference = null, escapeHtml }) {
  const date = conference?.date ? String(conference.date) : '';
  if (!date) {
    return '<p class="publication-providence-note" data-providence-conference-deadline>Sem prazo calculado na conferência acima — a tarefa nasce com <strong>prazo em branco</strong>.</p>';
  }
  const label = conference?.label || date;
  return `<p class="publication-providence-note" data-providence-conference-deadline>Prazo calculado na conferência: <strong>${escapeHtml(label)}</strong> — vai como prazo da tarefa criada (ajuste na tarefa se precisar).</p>`;
}

export function renderProvidence({ providence = null, escapeHtml }) {
  const sugestao = providence?.suggestion || null;
  const undo = providence?.undo || null;
  const playbook = providence?.playbook || null;
  const itensPlaybook = Array.isArray(playbook?.items) ? playbook.items : [];
  const referenciasPlaybook = Array.isArray(playbook?.references) ? playbook.references : [];
  const tituloPlaybook = playbook?.actLabel ? `Providências cabíveis: ${escapeHtml(playbook.actLabel)}` : 'Providências cabíveis';
  const blocoNota = playbook?.note ? `<p class="publication-providence-note">${escapeHtml(playbook.note)}</p>` : '';
  const blocoMotivo = playbook?.reason ? `<p class="publication-providence-note">${escapeHtml(playbook.reason)} Você decide se a providência cabe: o Atrium não sabe se a parte venceu ou perdeu.</p>` : '';
  const blocoReferencias = referenciasPlaybook.length
    ? `<p class="publication-providence-note">Temas da base jurídica ligados a este texto: ${referenciasPlaybook.map(titulo => escapeHtml(titulo)).join('; ')}.</p>`
    : '';
  const playbookBloco = itensPlaybook.length
    ? `<div class="publication-playbook" data-playbook-block>
        <h4>${tituloPlaybook}</h4>
        ${blocoMotivo}
        ${blocoNota}
        <p class="publication-providence-note">Nada é criado até você confirmar, e a tarefa nasce <strong>sem prazo</strong>.</p>
        <ul>${itensPlaybook.map((item, indice) => `<li>
          <span class="publication-playbook-item">
            <strong>${escapeHtml(item.label || item.definition?.name || 'Escolha o modelo')}</strong>
            <small>${[item.legal, item.definition ? `Modelo: ${item.definition.name} · ${Number(item.definition.points) || 0} pts` : 'Sem modelo no catálogo: escolha na lista'].filter(Boolean).map(parte => escapeHtml(parte)).join(' · ')}</small>
            ${item.base ? `<small>Base jurídica: ${escapeHtml(item.base)}</small>` : ''}
          </span>
          ${item.definition ? `<button type="button" class="button ghost" data-providence-item-index="${indice}">Criar tarefa</button>` : ''}
        </li>`).join('')}</ul>
        ${blocoReferencias}
        ${itensPlaybook.some(item => item.definition) ? `<footer class="publication-playbook-actions"><button type="button" class="button" data-providence-item-batch>Revisar e criar todas (${itensPlaybook.filter(item => item.definition).length})</button></footer>` : ''}
      </div>`
    : (playbook?.actLabel || playbook?.note)
      ? `<div class="publication-playbook" data-playbook-block>
          <h4>${tituloPlaybook}</h4>
          ${blocoMotivo}
          ${blocoNota}
          ${blocoReferencias}
        </div>`
      : playbook
        ? '<p class="publication-providence-note" data-playbook-empty>Não identifiquei o tipo de ato nesta publicação. Leia o texto e escolha o modelo na lista de tarefas.</p>'
        : '';
  if (!sugestao) {
    return `<section class="publication-providence" data-providence-block aria-labelledby="publicationProvidenceHeading">
      <div class="publication-providence-header">
        <div><p>Do prazo à providência</p><h3 id="publicationProvidenceHeading">Providência cabível</h3></div>
        <button type="button" class="button ghost" data-detail-action="suggest-providence">Sugerir providência</button>
      </div>
      ${itensPlaybook.length ? '' : '<p class="publication-providence-note">Nada é criado sem a sua confirmação.</p>'}
      ${renderProvidenceDeadlineNote({ conference: providence?.conference, escapeHtml })}
      ${playbookBloco}
    </section>`;
  }
  const acoes = (Array.isArray(sugestao.actions) ? sugestao.actions : []).map(opcao =>
    `<option value="${escapeHtml(opcao.id)}"${opcao.id === sugestao.action ? ' selected' : ''}>${escapeHtml(opcao.label)}</option>`).join('');
  const catalogo = Array.isArray(sugestao.catalog) ? sugestao.catalog : [];
  const escolhido = sugestao.taskDefinition?.name || '';
  // Combobox com busca incremental (mesma família do formulário de tarefa): o catálogo do
  // escritório é longo e é digitado com mais frequência do que percorrido.
  const gruposModelo = [];
  for (const modelo of catalogo) {
    const nome = String(modelo?.name || '');
    if (!nome) continue;
    const area = String(modelo?.area || '').trim() || 'Sem área';
    let grupo = gruposModelo.find(item => item.area === area);
    if (!grupo) { grupo = { area, itens: [] }; gruposModelo.push(grupo); }
    grupo.itens.push({ nome, points: Number(modelo?.points) || 0 });
  }
  const listaModelos = gruposModelo.map(grupo => `<div class="modal-combobox-group" role="group" aria-label="${escapeHtml(grupo.area)}" data-combobox-group><p class="modal-combobox-group-title">${escapeHtml(grupo.area)}</p>${grupo.itens.map(modelo => `<button type="button" role="option" data-combobox-option data-value="${escapeHtml(modelo.nome)}" aria-selected="${modelo.nome === escolhido}"><strong>${escapeHtml(modelo.nome)}</strong><small>${modelo.points} pts</small></button>`).join('')}</div>`).join('');
  const avisoCatalogoVazio = catalogo.length ? '' : '<p class="modal-combobox-empty" data-combobox-empty>Catálogo do escritório vazio.</p>';
  const confianca = Number(sugestao.confidence) || 0;
  const semModelo = !escolhido;
  // O aviso fica sempre no DOM (oculto quando há modelo): o botão reage à escolha no campo em
  // tempo real — sem isso, o estado calculado no render deixava o botão travado.
  const avisoModelo = `<p class="publication-providence-warning" data-providence-model-warning${semModelo ? '' : ' hidden'}>Nenhum modelo do catálogo combina com esta providência — escolha o modelo na lista antes de confirmar.</p>`;
  const notaModelo = avisoModelo;
  // Contagem de conferência: uma vez calculada, o prazo entra na tarefa criada (data humana
  // confirmada na contagem — nada é inferido pela IA).
  const prazoConferencia = renderProvidenceDeadlineNote({ conference: providence?.conference, escapeHtml });
  const desfazer = undo
    ? `<div class="publication-providence-undo"><span>${undo.conferenceConcluded
      ? 'Providência criada agora — a conferência desta publicação foi concluída.'
      : 'Providência criada agora — esta publicação não tinha tarefa de conferência.'}</span><button type="button" class="text-button" data-detail-action="undo-providence">Desfazer</button></div>`
    : '';
  // Depois de criar, o botão sai de cena: a ação está feita e o caminho de volta é o desfazer
  // (sem isso, o segundo clique criava outra tarefa e a tela dizia que não havia conferência).
  const acao = undo
    ? `<p class="publication-providence-note"><strong>Providência já criada nesta sessão.</strong> Desfaça abaixo para criar outra.</p>`
    : `<footer class="publication-providence-actions">
      <button type="button" class="button gold" data-detail-action="apply-providence"${semModelo ? ' disabled title="Escolha o modelo do catálogo"' : ''}>Concluir conferência e criar tarefa</button>
    </footer>`;
  return `<section class="publication-providence" data-providence-block aria-labelledby="publicationProvidenceHeading">
    <div class="publication-providence-header">
      <div><p>Do prazo à providência</p><h3 id="publicationProvidenceHeading">Providência cabível</h3></div>
      <button type="button" class="button ghost" data-detail-action="suggest-providence">Sugerir de novo</button>
    </div>
    <p class="publication-providence-suggestion" data-providence-suggestion>
      <strong>${escapeHtml(sugestao.actionLabel || sugestao.action || 'Providência')}</strong>
      <span>confiança ${escapeHtml(confianca.toFixed(2).replace('.', ','))}</span>
      ${sugestao.reasonLabel ? `<small>${escapeHtml(sugestao.reasonLabel)}</small>` : (sugestao.reason ? `<small>${escapeHtml(sugestao.reason)}</small>` : '')}
    </p>
    <div class="publication-providence-form">
      <label>Providência<select data-providence-action>${acoes}</select></label>
      <div class="publication-providence-field" data-modal-combobox-field data-model-combobox-field>
        <label for="providenceDefinitionInput">Modelo do catálogo</label>
        <div class="modal-combobox">
          <input id="providenceDefinitionInput" name="providenceDefinition" type="text" value="${escapeHtml(escolhido)}" placeholder="Busque pelo nome do modelo" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="providenceDefinitionListbox" data-modal-combobox data-providence-definition>
          <div class="modal-combobox-listbox hidden" id="providenceDefinitionListbox" role="listbox" aria-label="Modelo do catálogo">${listaModelos || avisoCatalogoVazio}</div>
        </div>
      </div>
    </div>
    ${notaModelo}
    ${prazoConferencia}
    ${acao}
    ${desfazer}
    ${playbookBloco}
    <p class="publication-providence-note">${providence?.conference?.date
      ? 'O tratamento da publicação e a ciência judicial não mudam.'
      : 'O tratamento da publicação e a ciência judicial não mudam. Se a conferência concluída carregava o prazo da fonte, <strong>registre a data na tarefa criada</strong>.'}</p>
  </section>`;
}

const ORIGINAL_TEXT_CLAMP = 1800;

function setOriginalTextExpanded(section, expanded) {
  if (!section) return;
  section.classList.toggle('is-expanded', expanded);
  const toggle = section.querySelector('[data-original-text-toggle]');
  if (!toggle) return;
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.textContent = expanded ? 'Recolher texto' : 'Ler texto completo';
}

function renderOriginalText({ item, escapeHtml }) {
  const layout = layoutPublicationText(publicationDisplayText(item));
  const clamped = layout.text.length > ORIGINAL_TEXT_CLAMP;
  const toggle = clamped ? '<button type="button" class="button ghost publication-original-toggle" data-original-text-toggle aria-expanded="false">Ler texto completo</button>' : '';
  if (!layout.structured) return `<div class="original-text${clamped ? ' is-clamped' : ''}">${escapeHtml(layout.text)}</div>${toggle}`;
  const parts = [];
  for (const block of layout.blocks) {
    if (block.type === 'heading') parts.push(`<div class="original-text-heading">${escapeHtml(block.text)}</div>`);
    else if (block.type === 'field') parts.push(`<div class="original-text-field"><span>${escapeHtml(block.label)}</span> ${escapeHtml(block.value)}</div>`);
    else parts.push(`<div class="original-text-paragraph">${escapeHtml(block.text)}</div>`);
  }
  return `<div class="original-text is-structured${clamped ? ' is-clamped' : ''}">${parts.join('\n')}</div>${toggle}`;
}

function renderFold({ key, title, hint = '', open = false, body }) {
  if (!body) return '';
  return `<details class="publication-fold" data-fold="${key}"${open ? ' open' : ''}><summary><span class="publication-fold-title">${iconSvg('chevron-right')}<span>${title}</span></span>${hint ? `<small>${hint}</small>` : ''}</summary><div class="publication-fold-body">${body}</div></details>`;
}

function aiFoldHint(panel, escapeHtml) {
  if (panel?.status === 'loading') return 'Gerando sugestão…';
  const detail = panel?.suggestion?.suggestion || {};
  const area = aiClassifierLabel(AI_CLASSIFIER_AREA_LABELS, detail.area?.label);
  const priority = aiClassifierLabel(AI_CLASSIFIER_PRIORITY_LABELS, detail.priority?.label);
  const parts = [area, priority ? `Prioridade ${priority.toLowerCase()}` : ''].filter(Boolean);
  return parts.length ? escapeHtml(parts.join(' · ')) : 'Sem sugestão';
}

function flattenClassifier(panel) {
  if (!panel?.enabled) return null;
  const suggestion = panel.suggestion || {};
  const detail = suggestion.suggestion || {};
  const confidence = detail.area?.confidence ?? panel.areaConfidence ?? suggestion.confidence;
  return {
    enabled: true,
    action: suggestion.action || panel.action || '',
    area: detail.area?.label || panel.area || '',
    areaConfidence: detail.area?.confidence ?? panel.areaConfidence,
    priority: detail.priority?.label || panel.priority || '',
    deadlineSignal: detail.deadline_signal?.label || panel.deadlineSignal || '',
    deadlineDays: detail.deadline_days?.label || panel.deadlineDays || '',
    confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : null
  };
}

function renderPublicationBrief({ brief, item, classifier, briefTask = null, escapeHtml }) {
  if (!brief || !brief.what) return '';
  const priority = brief.priority
    ? `<span class="publication-brief-priority is-${escapeHtml(brief.tone)}">Prioridade ${escapeHtml(brief.priority)}</span>`
    : '';
  const confidence = brief.confidence !== null && Number.isFinite(brief.confidence)
    ? `Área com confiança ${brief.confidence < 0.6 ? 'baixa' : brief.confidence < 0.85 ? 'média' : 'alta'}`
    : '';
  const pieceLabel = brief.pieceKind === 'peca' ? 'Peça' : 'Providência';
  const canCreate = classifier?.enabled === true
    && ['suggest', 'review'].includes(String(classifier.action || ''))
    && item?.treatmentStatus !== 'discarded';
  const undo = briefTask?.undo || null;
  const blocked = briefTask?.blocked || null;
  const actionBlock = blocked
    ? `<div class="publication-brief-undo is-blocked"><span>Tarefa criada: <strong>${escapeHtml(blocked.title || 'tarefa vinculada')}</strong></span><small>${escapeHtml(blocked.reason || 'Não é possível desfazer esta tarefa.')}</small></div>`
    : undo
      ? `<div class="publication-brief-undo"><span>Tarefa criada: <strong>${escapeHtml(undo.title || 'tarefa vinculada')}</strong></span><button type="button" class="text-button" id="btnUndoBriefTask" data-detail-action="undo-brief-task">Desfazer criação da tarefa</button></div>`
      : canCreate
      ? `<div class="publication-brief-actions"><button type="button" class="button gold" id="btnCreateBriefTask" data-detail-action="create-brief-task">${iconSvg('add')}<span>Criar tarefa da sugestão</span></button></div>`
      : '';
  return `<section class="publication-brief" aria-labelledby="publicationBriefHeading">
    <div class="publication-brief-head">
      <div>
        <p class="publication-brief-kicker">${iconSvg('assistant')}<span>${escapeHtml(brief.source)}</span></p>
        <h3 id="publicationBriefHeading">Leitura rápida</h3>
      </div>
      <div class="publication-brief-meta">${priority}${confidence ? `<span class="publication-brief-confidence">${escapeHtml(confidence)}</span>` : ''}</div>
    </div>
    <dl class="publication-brief-grid">
      <div><dt>Resumo</dt><dd>${escapeHtml(brief.what)}</dd></div>
      <div><dt>O que fazer</dt><dd>${escapeHtml(brief.action)}</dd></div>
      ${brief.pieceIsGeneric ? '' : `<div><dt>${pieceLabel}</dt><dd>${escapeHtml(brief.piece)}</dd></div>`}
    </dl>
    <p class="publication-brief-note">${escapeHtml(brief.note)}</p>
    ${actionBlock}
  </section>`;
}

export function renderPublicationDetail({
  item,
  act,
  parties,
  linkedTasks,
  linkedProcess,
  linkedContact,
  linkedWorkActions = [],
  privileged,
  suspensions = [],
  officeUsers = [],
  officeOabKeys = [],
  aiClassifier = null,
  briefTask = null,
  providence = null,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatAge
}) {
  if (!item || isMergedIntimation(item)) return '';
  const treatment = treatmentPresentation(item.treatmentStatus);
  const status = treatment.key;
  const unreadLabel = item.unread ? 'Não lida' : 'Lida';
  const urgent = Boolean(item.urgent || item.priority === 'urgente');
  const priorityLabels = [urgent ? 'Urgente' : '', item.important ? 'Importante' : ''].filter(Boolean);
  const treatmentInfo = renderTreatmentInfo({ item, treatment, escapeHtml, formatDateTime });
  const tasks = renderLinkedTasks({ linkedTasks, escapeHtml, formatDate });
  const workActions = renderLinkedWorkActions({ linkedWorkActions, escapeHtml, formatDate });
  const actions = renderActions({ status, privileged });
  const suspension = suspensionForDate(item.publishedAt || item.disponibilizadoEm, suspensions);
  const qualityIssues = djenQualityIssues(item, parties);
  const lawyers = publicationLawyersList(item);
  const lawyersLabel = formatPublicationLawyers(lawyers);
  const sideLawyers = officeSideLawyers(item, { oabKeys: officeOabKeys });
  const sideLawyersLabel = formatLawyerNames(sideLawyers);
  const officeMatch = officeLawyerMatch(lawyers, officeUsers);
  const suspensionSafety = suspension?.sourceUrl ? describeLinkSafety(suspension.sourceUrl) : null;
  const suspensionSafetyChip = suspensionSafety?.warn
    ? `<span class="link-safety-note is-${escapeHtml(suspensionSafety.kind)}" title="${escapeHtml(suspensionSafety.reason)}">${escapeHtml(suspensionSafety.label)}</span>`
    : '';
  const flatClassifier = flattenClassifier(aiClassifier);
  const brief = buildPublicationBrief({ item, act, classifier: flatClassifier });
  const conferenceSignalled = aiClassifier?.suggestion?.suggestion?.deadline_signal?.label === 'sim';

  return `<div class="publication-detail-shell">
    <header class="detail-header">
      <button type="button" class="icon-button publication-detail-close" id="publicationDetailClose" aria-label="Fechar leitura da publicação">${iconSvg('close')}</button>
      <button type="button" class="button ghost publication-detail-next" id="publicationDetailNext">Próxima</button>
      <button type="button" class="icon-button publication-detail-size" data-panel-size-toggle aria-pressed="false" aria-label="Maximizar painel" title="Maximizar painel">${iconSvg('maximize')}</button>
      <div class="publication-detail-kicker"><span class="publication-read-state ${item.unread ? 'is-unread' : ''}">${unreadLabel}</span><span class="treatment-badge ${treatment.css}">${treatment.label}</span><span class="act-chip ${escapeHtml(act.css)}">${escapeHtml(act.label)}</span></div>
      <h2 id="publicationDetailTitle" tabindex="-1">${escapeHtml(item.title || 'Publicação sem título')}</h2>
      <p>${escapeHtml(item.court || 'Origem judicial não informada')}</p>
      ${priorityLabels.length ? `<div class="publication-detail-priority" aria-label="Prioridade: ${escapeHtml(priorityLabels.join(', '))}">${priorityLabels.map(label => `<span>${label}</span>`).join('')}</div>` : ''}
    </header>
    ${treatmentInfo}
    ${qualityIssues.length ? `<div class="publication-quality-notice" role="status">${iconSvg('info')}<span>Conferência de conteúdo (Res. CNJ 455/2022, art. 12, §1º): ${escapeHtml(qualityIssues.join('; '))}. Confira a fonte oficial antes de qualquer providência.</span></div>` : ''}
    ${suspension ? `<div class="publication-suspension-notice" role="status">${iconSvg('deadline')}<span>${escapeHtml(SUSPENSION_NOTE)} Registro: ${escapeHtml(describeSuspension(suspension))}${suspension.sourceUrl ? ` · <a href="${escapeHtml(suspension.sourceUrl)}" target="_blank" rel="noopener noreferrer">fonte oficial</a>` : ''}${suspensionSafetyChip}</span></div>` : ''}
    <section class="publication-original" aria-labelledby="publicationOriginalHeading">
      <div class="publication-original-header"><div><p>Conteúdo oficial</p><h3 id="publicationOriginalHeading">Texto original preservado</h3></div>${renderDecisionToolbar({ item, escapeHtml })}</div>
      ${renderOriginalText({ item, escapeHtml })}
    </section>
    ${renderPublicationBrief({ brief, item, classifier: flatClassifier, briefTask, escapeHtml })}
    <dl class="detail-meta publication-detail-meta">
      ${linkedDefinition('Processo', item.process || 'Não identificado', linkedProcess?.id, 'process', escapeHtml)}
      ${linkedDefinition('Cliente / contato', linkedContact?.name || item.client || 'Não identificado', linkedContact?.id, 'contact', escapeHtml)}
      ${definition('Partes', parties || 'Ainda não identificadas', escapeHtml)}
      ${definition('Publicação', `${formatDate(item.publishedAt)} · ${formatAge(item.publishedAt)}`, escapeHtml)}
      ${item.sourceReportedDeadlineAt ? definition((item.deadlineSource === 'eproc' || item.deadlineSource === 'pje') ? `Prazo informado pelo ${deadlineSourceName(item.deadlineSource)} (fonte oficial)` : (item.sourceReportedDeadlineSource === 'domicilio' ? 'Referência do Domicílio Eletrônico (o prazo oficial vem do eproc)' : item.sourceReportedDeadlineSource === 'pje' ? 'Data informada pelo PJe (conferência obrigatória)' : 'Data informada pelo eproc (conferência obrigatória)'), formatDate(item.sourceReportedDeadlineAt), escapeHtml) : ''}
      ${definition('Responsável', item.responsible || sideLawyersLabel || (officeMatch ? officeMatch.displayName : 'Não atribuído'), escapeHtml)}
    </dl>
    ${renderFold({
      key: 'source',
      title: 'Mais dados da publicação',
      body: `<dl class="detail-meta publication-detail-meta is-secondary">
      ${item.disponibilizadoEm && item.disponibilizadoEm !== item.publishedAt ? definition('Disponibilização', formatDate(item.disponibilizadoEm), escapeHtml) : ''}
      ${definition('Origem', item.source || item.court || 'Não informada', escapeHtml)}
      ${item.portalId ? definition('Portal eproc', item.portalId, escapeHtml) : ''}
      ${item.sourceCollectedAt ? definition('Coletado da fonte', formatDateTime(item.sourceCollectedAt), escapeHtml) : ''}
      ${item.sourceStatus ? definition('Presença na fonte', item.sourceStatus === 'active' ? 'Presente na última coleta' : 'Não presente na última coleta — evidência preservada', escapeHtml) : ''}
      ${lawyersLabel ? definition('Advogados na publicação', lawyersLabel, escapeHtml) : ''}
      ${officeMatch ? definition('Vínculo por OAB', `${officeMatch.displayName}${officeMatch.uf ? ` · OAB/${officeMatch.uf} ${officeMatch.oab}` : ''}`, escapeHtml) : ''}
      ${definition('Estado de leitura', unreadLabel, escapeHtml)}
    </dl>`
    })}
    ${tasks}
    ${workActions}
    ${renderFold({
      key: 'conference',
      title: 'Contagem de prazo',
      hint: conferenceSignalled ? 'O texto menciona prazo ou data' : 'Conferência informativa',
      open: conferenceSignalled,
      body: renderDeadlineConference({ item, escapeHtml, aiClassifier })
    })}
    ${renderProvidence({ providence, escapeHtml })}
    ${renderFold({
      key: 'classifier',
      title: 'Área e prioridade',
      hint: aiClassifier?.enabled === true ? aiFoldHint(aiClassifier, escapeHtml) : '',
      open: Boolean(aiClassifier?.correcting) || ['unavailable', 'error'].includes(aiClassifier?.status),
      body: renderAiClassifierPanel({ panel: aiClassifier, escapeHtml })
    })}
    <footer class="detail-actions">${actions}<button type="button" class="button ghost detail-actions-more" data-detail-more aria-expanded="false">Mais ações</button></footer>
  </div>`;
}

export function renderDeadlineConference({ item, escapeHtml, aiClassifier = null }) {
  const startDate = String(item?.publishedAt || item?.disponibilizadoEm || '').slice(0, 10);
  const deadlineDetail = aiClassifier?.suggestion?.suggestion || {};
  const signalled = deadlineDetail.deadline_signal?.label === 'sim';
  const suggestedDays = AI_DEADLINE_DAYS[deadlineDetail.deadline_days?.label] || null;
  const daysValue = suggestedDays || 15;
  const hint = signalled
    ? `<p class="publication-deadline-conference-hint" data-conference-signal="sim"><strong>Motivo da sugestão:</strong> o texto menciona prazo, audiência ou ato com data${suggestedDays ? ` (${suggestedDays} dias)` : ''}. Confira a data e os dias antes de calcular — nada é gravado.</p>`
    : '';
  return `<section class="publication-deadline-conference" aria-labelledby="publicationDeadlineConferenceHeading">${hint}
    <div class="publication-deadline-conference-header">
      <div><p>Conferência informativa</p><h3 id="publicationDeadlineConferenceHeading">Contagem de prazo</h3></div>
      <button type="button" class="button ghost" data-detail-action="conference-deadline">Calcular contagem</button>
    </div>
    <div class="publication-deadline-conference-form">
      <label>Data inicial<input type="date" data-conference-start value="${escapeHtml(startDate)}"></label>
      <label>Dias<input type="number" min="1" max="365" step="1" value="${daysValue}" data-conference-days></label>
      <label>Contagem<select data-conference-counting><option value="business">Dias úteis</option><option value="calendar">Dias corridos</option></select></label>
      <label>Direção<select data-conference-direction><option value="after">Depois do início</option><option value="before">Antes do início</option></select></label>
    </div>
    <div class="publication-deadline-conference-result" data-conference-result role="status" aria-live="polite">Informe os dias e calcule — nada é gravado automaticamente.</div>
    <small class="publication-deadline-conference-note">Cálculo informativo a partir da data e dos dias informados. Feriados locais, recesso e suspensões podem deslocar a data; a confirmação do prazo é humana.</small>
  </section>`;
}

export function renderDecisionToolbar({ item, escapeHtml }) {
  if (!item?.hasHtml || !String(item.rawHtml || '').trim()) return '';
  const label = escapeHtml(item.title || 'publicação');
  return `<div class="publication-decision-toolbar" aria-label="Documento HTML de ${label}"><button type="button" class="button ghost publication-doc-btn" data-detail-action="view-decision-html">Decisão completa (HTML)</button><button type="button" class="button ghost publication-doc-btn" data-detail-action="download-decision-html">Baixar (.html)</button></div>`;
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
  return `<section class="linked-tasks-card"><div class="linked-tasks-header"><span>Providências vinculadas</span><strong>${linkedTasks.length}</strong></div><div class="linked-tasks-list">${linkedTasks.map(task => `<article class="linked-task-item"><div class="linked-task-info"><strong>${escapeHtml(task.title || 'Tarefa sem título')}</strong><small>${escapeHtml(task.status || 'Situação não informada')} · ${task.responsible ? `Responsável: ${escapeHtml(task.responsible)}` : 'Responsável não informado'}${task.deadline ? ` · Prazo informado: ${escapeHtml(formatDate(task.deadline))}` : ''}</small></div><button type="button" class="button ghost" data-open-task-id="${escapeHtml(task.id)}">Abrir tarefa</button></article>`).join('')}</div></section>`;
}

function renderLinkedWorkActions({ linkedWorkActions, escapeHtml, formatDate }) {
  const actions = linkedWorkActions.filter(action => action?.entityType !== 'task');
  if (!actions.length) return '';
  const labels = { agenda: 'Compromisso', note: 'Nota interna', process: 'Processo vinculado' };
  return `<section class="linked-tasks-card publication-linked-work"><div class="linked-tasks-header"><span>Outras providências</span><strong>${actions.length}</strong></div><div class="linked-tasks-list">${actions.map(action => {
    const entity = action.entity || {};
    const label = labels[action.entityType] || 'Providência';
    const title = action.entityType === 'note' ? entity.text : action.entityType === 'process' ? entity.number : entity.title;
    const detail = action.entityType === 'agenda'
      ? `${entity.status || 'Situação não informada'} · ${entity.date ? formatDate(entity.date) : 'Data não informada'}${entity.time ? ` · ${entity.time}` : ''}`
      : `Registrada por ${action.createdBy || 'usuário autenticado'}`;
    const openAttribute = action.entityType === 'agenda'
      ? `data-open-agenda-id="${escapeHtml(action.entityId)}"`
      : action.entityType === 'process'
        ? `data-open-process-id="${escapeHtml(action.entityId)}"`
        : '';
    return `<article class="linked-task-item"><div class="linked-task-info"><span class="publication-work-kind">${escapeHtml(label)}</span><strong>${escapeHtml(title || 'Sem descrição')}</strong><small>${escapeHtml(detail)}</small></div>${openAttribute ? `<button type="button" class="button ghost" ${openAttribute}>Abrir</button>` : ''}</article>`;
  }).join('')}</div></section>`;
}

function renderActions({ status, privileged }) {
  const email = privileged ? `<button type="button" class="button ghost" data-detail-action="send-email" id="btnSendIntimationEmail">${iconSvg('email')}Enviar por e-mail</button>` : '';
  const task = `<button type="button" class="button ghost" data-detail-action="task" id="btnCreateTask">${iconSvg('add')}Criar tarefa</button>`;
  const assistant = '<button type="button" class="button ghost" data-detail-action="assistant">Usar no Assistente</button>';
  const workMenu = `<details class="publication-work-menu"><summary class="button ghost">Outras providências</summary><div class="publication-work-menu-popover"><button type="button" data-detail-action="appointment">Compromisso</button><button type="button" data-detail-action="deadline">Prazo confirmado</button><button type="button" data-detail-action="note">Nota interna</button><button type="button" data-detail-action="link">Vincular processo</button></div></details>`;
  if (status === 'untreated') return `<button type="button" class="button gold" data-detail-action="start-review" id="btnStartReview">${iconSvg('search')}Iniciar análise</button><button type="button" class="button gold btn-success-action" data-detail-action="treat" id="btnMarkTreated">${iconSvg('check')}Marcar como tratada</button>${assistant}${task}${workMenu}${email}<button type="button" class="button ghost btn-danger-action" data-detail-action="discard" id="btnDiscardPublication">${iconSvg('delete')}Descartar</button>`;
  if (status === 'in_review') return `<button type="button" class="button gold btn-success-action" data-detail-action="treat" id="btnMarkTreated">${iconSvg('check')}Marcar como tratada</button>${assistant}${task}${workMenu}${email}<button type="button" class="button ghost btn-danger-action" data-detail-action="discard" id="btnDiscardPublication">${iconSvg('delete')}Descartar</button>`;
  if (status === 'treated') return `<button type="button" class="button ghost" data-detail-action="reopen" id="btnReopenPublication">${iconSvg('reopen')}Reabrir análise</button>${assistant}${task}${workMenu}${email}`;
  return `<button type="button" class="button gold" data-detail-action="restore" id="btnRestorePublication">${iconSvg('reopen')}Restaurar para triagem</button>${assistant}${email}`;
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

function linkedDefinition(label, value, id, type, escapeHtml) {
  if (!id) return definition(label, value, escapeHtml);
  return `<div><dt>${escapeHtml(label)}</dt><dd><button type="button" class="publication-entity-link" data-open-${type}-id="${escapeHtml(id)}">${escapeHtml(value)} <span aria-hidden="true">→</span></button></dd></div>`;
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
  if (!element) return;
  if (inert) element.setAttribute('inert', '');
  else element.removeAttribute('inert');
}
import { iconSvg } from './icons.js?v=3.0.2';
