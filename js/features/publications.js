import { Store, isoDate } from '../core/store.js';
import {
  createPublicationsV2Presenter,
  renderPublicationDetail,
  renderPublicationEmpty,
  renderPublicationRow
} from '../views/ui-v2/publications-presenter.js';
import { iconSvg } from '../views/ui-v2/icons.js';

export const ACT_RULES = [
  { regex: /\b(embargos?\s+de\s+declara[cç][aã]o|embargos?\s+declarat[oó]rios?)\b/i, category: 'Embargos de Declaração', priority: 'importante', label: 'Embargos', css: 'embargos' },
  { regex: /\b(audi[eê]nc|sess[aã]o\s+de\s+julgamento|designad.{0,30}audi)\b/i, category: 'Audiência', priority: 'urgente', label: 'Audiência', css: 'audiencia' },
  { regex: /\b(apelac|agravo\s+de\s+instrumento|recurso\s+inominado|recurso\s+especial|recurso\s+extraordin[aá]rio|recurso\s+ordin[aá]rio|recurs(o|ar))\b/i, category: 'Recurso', priority: 'importante', label: 'Recurso', css: 'recurso' },
  { regex: /\b(contestac|contestaç|conteste|defes(a|ar)|apresentar\s+defesa)\b/i, category: 'Contestação', priority: 'importante', label: 'Contestação', css: 'contestacao' },
  { regex: /\b(cumprimento\s+de\s+senten[cç]|pague|pagamento.{0,30}volunt|multa.{0,30}10%|execu[cç][aã]o)\b/i, category: 'Cumprimento de Sentença', priority: 'urgente', label: 'Cumprimento', css: 'cumprimento' },
  { regex: /\b(manifest|impugn|r[eé]plic|especifica(r|cao|ção).{0,20}prov|contrarraz)\b/i, category: 'Manifestação', priority: 'normal', label: 'Manifestação', css: 'manifestacao' },
  { regex: /\b(edital|recupera[cç][aã]o\s+judicial|fal[eê]ncia|concedo\s+o\s+prazo)\b/i, category: 'Edital / Geral', priority: 'normal', label: 'Edital', css: 'recurso' },
  { regex: /\b(senten[cç]|ac[oó]rd[aã]o)\b/i, category: 'Sentença / Acórdão', priority: 'importante', label: 'Sentença', css: 'recurso' },
  { regex: /\b(decis[aã]o)\b/i, category: 'Decisão Interlocutória', priority: 'normal', label: 'Decisão', css: 'recurso' },
  { regex: /\b(despacho|ato\s+ordinat[oó]rio)\b/i, category: 'Despacho', priority: 'normal', label: 'Despacho', css: 'rotina' }
];

export function classifyIntimationAct(text = '', title = '', type = '') {
  const combined = `${title} ${type} ${text}`;
  for (const rule of ACT_RULES) {
    if (rule.regex.test(combined)) return rule;
  }
  return { category: 'Publicação', priority: 'normal', label: 'Publicação', css: 'rotina' };
}

export function parsePublicationLocalDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [year, month, day] = str.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatPublicationAge(dateValue, now = new Date()) {
  const date = parsePublicationLocalDate(dateValue);
  if (!date) return 'Data não informada';
  const publicationDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((currentDay - publicationDay) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'Hoje';
  if (diffDays === 1) return 'Há 1 dia';
  return `Há ${diffDays} dias`;
}

function isDateToday(dateValue, now = new Date()) {
  const date = parsePublicationLocalDate(dateValue);
  if (!date) return false;
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

export function filterPublications(items, {
  filter = 'untreated',
  sort = 'priority-urgent',
  cutoff = 'all',
  now = new Date()
} = {}) {
  const todayStr = isoDate(0, now);
  const filtered = (Array.isArray(items) ? items : []).filter(item => {
    const pubDate = (item.publishedAt || '').slice(0, 10);
    if (cutoff === 'today' && pubDate && pubDate < todayStr) return false;
    if (cutoff === '7days' && pubDate) {
      if (pubDate < isoDate(-7, now)) return false;
    }
    if (cutoff === '30days' && pubDate) {
      if (pubDate < isoDate(-30, now)) return false;
    }

    const treatmentStatus = item.treatmentStatus || 'untreated';
    if (filter === 'untreated' || filter === 'pendentes') return treatmentStatus === 'untreated';
    if (filter === 'in_review') return treatmentStatus === 'in_review';
    if (filter === 'treated') return treatmentStatus === 'treated';
    if (filter === 'discarded') return treatmentStatus === 'discarded';
    if (filter === 'all') return true;
    if (filter === 'urgente') return Boolean(item.urgent || item.priority === 'urgente');
    if (filter === 'importante') return Boolean(item.important);
    if (filter === 'prazo-fatal') return Boolean(item.fatalDeadline);
    if (filter === 'triagem') return item.status === 'triagem' || treatmentStatus === 'in_review';
    if (filter === 'prazo') return item.status === 'prazo' || treatmentStatus === 'treated';
    return item.status === filter;
  });

  filtered.sort((a, b) => {
    if (sort === 'priority-urgent') {
      const urgentA = (a.urgent || a.priority === 'urgente') ? 1 : 0;
      const urgentB = (b.urgent || b.priority === 'urgente') ? 1 : 0;
      if (urgentA !== urgentB) return urgentB - urgentA;
      const importantA = a.important ? 1 : 0;
      const importantB = b.important ? 1 : 0;
      if (importantA !== importantB) return importantB - importantA;
      if ((a.treatmentStatus || 'untreated') === 'untreated' && (b.treatmentStatus || 'untreated') === 'untreated') {
        return new Date(a.publishedAt || 0) - new Date(b.publishedAt || 0);
      }
      return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
    }
    if (sort === 'priority-important') {
      const importantA = a.important ? 1 : 0;
      const importantB = b.important ? 1 : 0;
      if (importantA !== importantB) return importantB - importantA;
      return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
    }
    if (sort === 'date-asc') return new Date(a.publishedAt || 0) - new Date(b.publishedAt || 0);
    if (sort === 'date-desc') return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
    if (sort === 'process') return String(a.process || '').localeCompare(String(b.process || ''));
    return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
  });

  return filtered;
}

export function createPublicationsFeature({
  store = Store,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  navigatorRef = globalThis.navigator,
  escapeHtml,
  formatDate,
  formatDateTime,
  showToast,
  onOpenTask,
  onOpenIntimation,
  onImportJson,
  onRenderGlobalMetrics,
  onSyncAppState
}) {
  let initialized = false;
  let selectedIntimation = null;
  let inboxFilter = null;
  let inboxFilterExplicit = false;
  let inboxFilterMode = null;
  let inboxSort = 'priority-urgent';
  let inboxCutoff = 'all';
  let currentEmailBulletin = null;
  let publicationsPresenter;

  const byId = id => documentRef?.getElementById(id);
  const toast = (message, type = '') => showToast?.(message, type);
  const isV2 = () => documentRef?.documentElement?.dataset?.ui === 'v2';
  const ensurePresentationFilter = () => {
    const mode = isV2() ? 'v2' : 'classic';
    if (inboxFilter === null || (!inboxFilterExplicit && inboxFilterMode !== mode)) {
      inboxFilter = mode === 'v2' ? 'all' : 'untreated';
    }
    inboxFilterMode = mode;
  };
  const getPresenter = () => {
    publicationsPresenter ||= createPublicationsV2Presenter({
      documentRef,
      onCloseDetail: () => feature.closeDetail()
    });
    return publicationsPresenter;
  };

  const feature = {
    get selectedIntimation() { return selectedIntimation; },
    set selectedIntimation(value) { selectedIntimation = value; },
    get inboxFilter() { ensurePresentationFilter(); return inboxFilter; },
    set inboxFilter(value) { inboxFilter = value; inboxFilterExplicit = true; inboxFilterMode = isV2() ? 'v2' : 'classic'; },
    get inboxSort() { return inboxSort; },
    set inboxSort(value) { inboxSort = value; },
    get inboxCutoff() { return inboxCutoff; },
    set inboxCutoff(value) { inboxCutoff = value; },
    get currentEmailBulletin() { return currentEmailBulletin; },
    get initialized() { return initialized; },

    upsertExternalIntimation(record) {
      if (!record || typeof record !== 'object') return null;
      store.state.intimations = Array.isArray(store.state.intimations) ? store.state.intimations : [];
      const identity = record.externalId ?? record.id;
      const index = store.state.intimations.findIndex(item => (item.externalId ?? item.id) === identity);
      if (index < 0) {
        store.state.intimations.unshift({ ...record });
        return store.state.intimations[0];
      }
      const current = store.state.intimations[index];
      const merged = { ...current, ...record };
      const protectedFields = [
        'status', 'unread', 'treatmentStatus', 'treatmentStartedAt', 'treatmentStartedBy',
        'treatedAt', 'treatedBy', 'discardedAt', 'discardedBy', 'treatmentNote',
        'linkedTaskIds', 'taskId', 'deadline', 'fatalDeadline', 'responsible', 'completedAt'
      ];
      for (const field of protectedFields) {
        if (Object.prototype.hasOwnProperty.call(current, field)) merged[field] = current[field];
      }
      store.state.intimations[index] = merged;
      return merged;
    },

    init() {
      if (initialized) return false;
      initialized = true;
      ensurePresentationFilter();
      this.bindListeners();
      getPresenter().init();
      return true;
    },

    bindListeners() {
      byId('newIntimationButton')?.addEventListener('click', () => onOpenIntimation?.());
      byId('importIntimationButton')?.addEventListener('click', () => byId('jsonImportInput')?.click());
      byId('jsonImportInput')?.addEventListener('change', event => onImportJson?.(event.target.files[0]));

      byId('inboxFilters')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-filter]');
        if (!button) return;
        inboxFilter = button.dataset.filter;
        inboxFilterExplicit = true;
        byId('inboxFilters').querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
        documentRef.querySelectorAll('#publicationsMetrics .pub-metric-card').forEach(card => card.classList.toggle('active', card.dataset.filter === inboxFilter));
        this.renderInbox();
      });
      byId('publicationsMetrics')?.addEventListener('click', event => {
        const card = event.target.closest('.pub-metric-card[data-filter]');
        if (!card) return;
        inboxFilter = card.dataset.filter;
        inboxFilterExplicit = true;
        documentRef.querySelectorAll('#publicationsMetrics .pub-metric-card').forEach(item => item.classList.toggle('active', item === card));
        byId('inboxFilters')?.querySelectorAll('button').forEach(item => item.classList.toggle('active', item.dataset.filter === inboxFilter));
        this.renderInbox();
      });
      byId('publicationsMetrics')?.addEventListener('keydown', event => {
        const card = event.target.closest('.pub-metric-card[data-filter]');
        if (!card || !['Enter', ' '].includes(event.key) || !isV2()) return;
        event.preventDefault();
        card.click();
      });
      byId('inboxSortSelect')?.addEventListener('change', event => {
        inboxSort = event.target.value;
        this.renderInbox();
      });
      byId('inboxCutoffSelect')?.addEventListener('change', event => {
        inboxCutoff = event.target.value;
        this.renderInbox();
      });
      documentRef.querySelectorAll('.list-head-sort').forEach(button => {
        button.addEventListener('click', () => {
          const column = button.dataset.inboxSortCol;
          if (column === 'date') inboxSort = inboxSort === 'date-desc' ? 'date-asc' : 'date-desc';
          else if (column === 'deadline') inboxSort = inboxSort === 'deadline-asc' ? 'deadline-desc' : 'deadline-asc';
          if (byId('inboxSortSelect')) byId('inboxSortSelect').value = inboxSort;
          this.renderInbox();
        });
      });

      byId('discardPublicationClose')?.addEventListener('click', () => this.closeDiscardModal());
      byId('discardPublicationCancel')?.addEventListener('click', () => this.closeDiscardModal());
      byId('discardPublicationBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('discardPublicationBackdrop')) this.closeDiscardModal();
      });
      byId('discardPublicationForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const id = byId('discardPublicationIdInput')?.value;
        const note = byId('discardReasonInput')?.value;
        this.closeDiscardModal();
        await this.applyTreatmentAction(id, 'discard', note);
      });
      byId('treatPublicationClose')?.addEventListener('click', () => this.closeTreatModal());
      byId('treatPublicationCancel')?.addEventListener('click', () => this.closeTreatModal());
      byId('treatPublicationBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('treatPublicationBackdrop')) this.closeTreatModal();
      });
      byId('treatPublicationForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const id = byId('treatPublicationIdInput')?.value;
        const note = byId('treatNoteInput')?.value;
        this.closeTreatModal();
        await this.applyTreatmentAction(id, 'mark_treated', note);
      });

      byId('btnEmailPublications')?.addEventListener('click', () => this.openPublicationsEmailModal());
      byId('publicationsEmailClose')?.addEventListener('click', () => this.closePublicationsEmailModal());
      byId('publicationsEmailCancel')?.addEventListener('click', () => this.closePublicationsEmailModal());
      byId('publicationsEmailModalBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('publicationsEmailModalBackdrop')) this.closePublicationsEmailModal();
      });
      byId('btnSendEmailDirect')?.addEventListener('click', () => this.sendBatchEmail());
      byId('btnCopyEmailHtml')?.addEventListener('click', () => this.copyEmailBulletin());
      byId('btnDownloadEmailHtml')?.addEventListener('click', () => this.downloadEmailBulletin());

      byId('publicationEmailClose')?.addEventListener('click', () => this.closePublicationEmailModal());
      byId('publicationEmailCancel')?.addEventListener('click', () => this.closePublicationEmailModal());
      byId('publicationEmailBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('publicationEmailBackdrop')) this.closePublicationEmailModal();
      });
      byId('publicationEmailForm')?.addEventListener('submit', event => this.submitPublicationEmail(event));
    },

    filteredItems() {
      ensurePresentationFilter();
      return filterPublications(store.state.intimations, { filter: inboxFilter, sort: inboxSort, cutoff: inboxCutoff });
    },

    getUntreatedCount() {
      return (store.state.intimations || []).filter(item => (item.treatmentStatus || 'untreated') === 'untreated').length;
    },

    getMetrics(now = new Date()) {
      const intimations = Array.isArray(store.state.intimations) ? store.state.intimations : [];
      return {
        untreated: intimations.filter(item => (item.treatmentStatus || 'untreated') === 'untreated').length,
        inReview: intimations.filter(item => item.treatmentStatus === 'in_review').length,
        treatedToday: intimations.filter(item => item.treatmentStatus === 'treated' && isDateToday(item.treatedAt, now)).length,
        discardedToday: intimations.filter(item => item.treatmentStatus === 'discarded' && isDateToday(item.discardedAt, now)).length
      };
    },

    renderMetrics() {
      ensurePresentationFilter();
      const metrics = this.getMetrics();
      if (byId('pubMetricUntreated')) byId('pubMetricUntreated').textContent = String(metrics.untreated);
      if (byId('pubMetricInReview')) byId('pubMetricInReview').textContent = String(metrics.inReview);
      if (byId('pubMetricTreatedToday')) byId('pubMetricTreatedToday').textContent = String(metrics.treatedToday);
      if (byId('pubMetricDiscardedToday')) byId('pubMetricDiscardedToday').textContent = String(metrics.discardedToday);
      documentRef.querySelectorAll('#publicationsMetrics .pub-metric-card').forEach(card => {
        card.classList.toggle('active', card.dataset.filter === (inboxFilter || 'untreated'));
        card.setAttribute('aria-pressed', card.dataset.filter === (inboxFilter || 'untreated') ? 'true' : 'false');
      });
    },

    intimationParties(item) {
      const process = store.state.processes.find(record => record.number === item.process);
      const direct = String(item.client || '').trim();
      if (direct && !/^(?:cliente|partes?) (?:não|nao) identificad/i.test(direct)) return direct;
      return [process?.client, process?.opposingParty]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(' × ');
    },

    treatmentStatusBadge(treatmentStatus) {
      const badges = {
        untreated: { label: 'Não tratada', css: 'treatment-untreated' },
        in_review: { label: 'Em análise', css: 'treatment-in-review' },
        treated: { label: 'Tratada', css: 'treatment-treated' },
        discarded: { label: 'Descartada', css: 'treatment-discarded' }
      };
      const badge = badges[treatmentStatus || 'untreated'] || badges.untreated;
      return `<span class="treatment-badge ${badge.css}">${badge.label}</span>`;
    },

    renderInbox() {
      ensurePresentationFilter();
      this.renderMetrics();
      byId('inboxFilters')?.querySelectorAll('button[data-filter]').forEach(button => {
        const active = button.dataset.filter === inboxFilter;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      const items = this.filteredItems();
      const allItems = Array.isArray(store.state.intimations) ? store.state.intimations : [];
      const dateButton = documentRef.querySelector('button[data-inbox-sort-col="date"]');
      const dateIcon = byId('inboxSortIconDate');
      if (dateButton && dateIcon) {
        dateButton.classList.toggle('active', inboxSort === 'date-desc' || inboxSort === 'date-asc');
        dateIcon.textContent = inboxSort === 'date-asc' ? '▲' : inboxSort === 'date-desc' ? '▼' : '↕';
      }

      const emptyMessage = (inboxFilter === 'untreated' || !inboxFilter)
        ? `<div class="empty-detail"><span>${iconSvg('check')}</span><h3>Não há publicações pendentes de tratamento.</h3><p>Todas as publicações capturadas estão em análise, tratadas ou descartadas.</p></div>`
        : `<div class="empty-detail"><span>${iconSvg('check')}</span><h3>Nenhuma publicação encontrada</h3><p>Não há publicações para o filtro ou ordenação selecionados.</p></div>`;
      const list = byId('inboxList');
      if (!list) return;
      if (isV2()) {
        getPresenter().updateCount({ visible: items.length, total: allItems.length });
        list.innerHTML = items.length ? items.map(item => renderPublicationRow({
          item,
          act: classifyIntimationAct(item.text, item.title, item.type),
          parties: this.intimationParties(item),
          selected: selectedIntimation === item.id,
          escapeHtml,
          formatDate,
          formatAge: formatPublicationAge
        })).join('') : renderPublicationEmpty({ total: allItems.length, filter: inboxFilter, escapeHtml });
      } else list.innerHTML = items.length ? items.map(item => {
        const act = classifyIntimationAct(item.text, item.title, item.type);
        const urgent = Boolean(item.urgent || item.priority === 'urgente');
        const urgentBadge = urgent ? '<span class="badge-urgent">URGENTE</span>' : '';
        const importantBadge = item.important ? '<span class="badge-important">IMPORTANTE</span>' : '';
        const untreated = (item.treatmentStatus || 'untreated') === 'untreated';
        const parties = this.intimationParties(item);
        return `
        <button class="inbox-row ${selectedIntimation === item.id ? 'active' : ''} ${urgent ? 'is-urgent' : ''} ${item.important ? 'is-important' : ''} ${untreated ? 'row-untreated' : ''}" data-intimation-id="${escapeHtml(item.id)}" aria-label="Publicação ${escapeHtml(item.title)}">
          <span class="inbox-primary">
            <i class="unread-dot ${item.unread ? '' : 'read'}" title="${item.unread ? 'Não lida' : 'Lida'}"></i>
            <span>
              <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">${urgentBadge}${importantBadge}<strong>${escapeHtml(item.title)}</strong></div>
              <small class="inbox-case-line"><b>${escapeHtml(item.process || 'Sem processo vinculado')}</b>${parties ? `<em> · ${escapeHtml(parties)}</em>` : '<em> · Partes não identificadas</em>'}</small>
            </span>
          </span>
          <span class="source-label"><span class="act-chip ${act.css}">${escapeHtml(act.label)}</span></span>
          <span class="date-label">
            <span class="pub-age ${untreated ? 'age-untreated' : ''}">${formatPublicationAge(item.publishedAt)}</span>
            <small class="pub-full-date">${formatDate(item.publishedAt)}</small>
          </span>
          <span>${this.treatmentStatusBadge(item.treatmentStatus)}</span>
        </button>`;
      }).join('') : emptyMessage;

      list.querySelectorAll('[data-intimation-id]').forEach(button => {
        button.addEventListener('click', () => this.select(button.dataset.intimationId, button));
      });
      if (selectedIntimation) this.renderDetail();
      else if (isV2()) this.renderDetail();
    },

    select(id, invoker = null) {
      selectedIntimation = id;
      if (isV2()) getPresenter().prepareDetailOpen(invoker, id);
      const item = store.state.intimations.find(record => record.id === id);
      if (item && item.unread) {
        item.unread = false;
        store.save();
      }
      this.renderInbox();
      this.renderMetrics();
      onRenderGlobalMetrics?.();
      this.renderDetail();
    },

    closeDetail() {
      if (!isV2()) return false;
      const selectedId = selectedIntimation;
      selectedIntimation = null;
      getPresenter().closeDetail({ restoreFocus: false });
      this.renderInbox();
      this.renderDetail();
      if (selectedId) {
        const returnTarget = [...(byId('inboxList')?.querySelectorAll('[data-intimation-id]') || [])]
          .find(element => element.dataset.intimationId === selectedId);
        if (returnTarget?.isConnected) queueMicrotask(() => returnTarget.focus());
      }
      return true;
    },

    renderDetail() {
      const item = store.state.intimations.find(record => record.id === selectedIntimation);
      const container = byId('intimationDetail');
      if (!container) return;
      if (!item) {
        getPresenter().closeDetail({ restoreFocus: false });
        container.innerHTML = `<div class="empty-detail"><span>${iconSvg('publications')}</span><h3>Selecione uma publicação</h3><p>O texto original, o processo, alertas de urgência e o fluxo de tratamento aparecerão aqui.</p></div>`;
        return;
      }

      const act = classifyIntimationAct(item.text, item.title, item.type);
      const urgent = Boolean(item.urgent || item.priority === 'urgente');
      const treatmentStatus = item.treatmentStatus || 'untreated';
      const currentUser = windowRef?.KellerAuth?.currentUser;
      const privileged = currentUser?.role === 'master_admin' || currentUser?.role === 'admin';
      const emailAction = privileged
        ? `<button type="button" class="button ghost" data-detail-action="send-email" id="btnSendIntimationEmail" title="Enviar publicação por e-mail">${iconSvg('email')} Enviar por e-mail</button>`
        : '';

      if (isV2()) {
        const linkedTaskIds = Array.isArray(item.linkedTaskIds) ? item.linkedTaskIds : (item.taskId ? [item.taskId] : []);
        const linkedTasks = (store.state.tasks || []).filter(task => linkedTaskIds.includes(task.id) || task.intimationId === item.id || task.sourceIntimationId === item.id);
        container.innerHTML = renderPublicationDetail({
          item,
          act,
          parties: this.intimationParties(item),
          linkedTasks,
          privileged,
          escapeHtml,
          formatDate,
          formatDateTime,
          formatAge: formatPublicationAge
        });
        container.querySelectorAll('[data-detail-action]').forEach(button => {
          button.addEventListener('click', () => this.handleAction(item, button.dataset.detailAction));
        });
        container.querySelectorAll('[data-open-task-id]').forEach(button => {
          button.addEventListener('click', () => {
            const task = store.state.tasks.find(record => record.id === button.dataset.openTaskId);
            if (task) onOpenTask?.(task);
          });
        });
        byId('publicationDetailClose')?.addEventListener('click', () => this.closeDetail());
        getPresenter().syncDetailOpen();
        return;
      }

      let treatmentInfo = '';
      if (treatmentStatus === 'treated') {
        treatmentInfo = `
        <div class="treatment-info-banner treated">
          <div class="treatment-info-icon">${iconSvg('check')}</div>
          <div class="treatment-info-text">
            <strong>Tratada por ${escapeHtml(item.treatedBy || 'Advogado')}</strong>
            <span>${item.treatedAt ? formatDateTime(item.treatedAt) : 'Data registrada'}</span>
            ${item.treatmentNote ? `<small class="treatment-note-display">Obs: ${escapeHtml(item.treatmentNote)}</small>` : ''}
          </div>
        </div>`;
      } else if (treatmentStatus === 'discarded') {
        treatmentInfo = `
        <div class="treatment-info-banner discarded">
          <div class="treatment-info-icon">${iconSvg('close')}</div>
          <div class="treatment-info-text">
            <strong>Descartada por ${escapeHtml(item.discardedBy || 'Advogado')}</strong>
            <span>${item.discardedAt ? formatDateTime(item.discardedAt) : 'Data registrada'}</span>
            ${item.treatmentNote ? `<small class="treatment-note-display">Motivo: ${escapeHtml(item.treatmentNote)}</small>` : ''}
          </div>
        </div>`;
      } else if (treatmentStatus === 'in_review') {
        treatmentInfo = `
        <div class="treatment-info-banner in-review">
          <div class="treatment-info-icon">${iconSvg('search')}</div>
          <div class="treatment-info-text">
            <strong>Em análise por ${escapeHtml(item.treatmentStartedBy || 'Advogado')}</strong>
            <span>Iniciada em ${item.treatmentStartedAt ? formatDateTime(item.treatmentStartedAt) : 'Hoje'}</span>
          </div>
        </div>`;
      }

      const linkedTaskIds = Array.isArray(item.linkedTaskIds) ? item.linkedTaskIds : (item.taskId ? [item.taskId] : []);
      const linkedTasks = (store.state.tasks || []).filter(task => linkedTaskIds.includes(task.id) || task.intimationId === item.id || task.sourceIntimationId === item.id);
      const linkedTasksHtml = linkedTasks.length > 0 ? `
        <div class="linked-tasks-card">
          <div class="linked-tasks-header"><span>${iconSvg('tasks')} Providência criada (${linkedTasks.length})</span></div>
          <div class="linked-tasks-list">
            ${linkedTasks.map(task => `
              <div class="linked-task-item">
                <div class="linked-task-info">
                  <strong>Tarefa: ${escapeHtml(task.title)}</strong>
                  <small>${task.responsible ? `Responsável: ${escapeHtml(task.responsible)}` : ''} ${task.deadline ? `· Prazo: ${formatDate(task.deadline)}` : ''}</small>
                </div>
                <button type="button" class="button ghost" data-open-task-id="${escapeHtml(task.id)}" style="padding:4px 10px; font-size:12px;">Abrir tarefa</button>
              </div>
            `).join('')}
          </div>
        </div>` : '';

      let actions = '';
      if (treatmentStatus === 'untreated') {
        actions = `
          <button type="button" class="button gold" data-detail-action="start-review" id="btnStartReview">${iconSvg('search')} Iniciar análise</button>
          <button type="button" class="button ghost" data-detail-action="task" id="btnCreateTask">${iconSvg('add')} Criar tarefa</button>
          <button type="button" class="button ghost btn-success-action" data-detail-action="treat" id="btnMarkTreated">${iconSvg('check')} Marcar como tratada</button>
          <button type="button" class="button ghost btn-danger-action" data-detail-action="discard" id="btnDiscardPublication">${iconSvg('delete')} Descartar</button>
          ${emailAction}`;
      } else if (treatmentStatus === 'in_review') {
        actions = `
          <button type="button" class="button ghost" data-detail-action="task" id="btnCreateTask">${iconSvg('add')} Criar tarefa</button>
          <button type="button" class="button gold btn-success-action" data-detail-action="treat" id="btnMarkTreated">${iconSvg('check')} Marcar como tratada</button>
          <button type="button" class="button ghost btn-danger-action" data-detail-action="discard" id="btnDiscardPublication">${iconSvg('delete')} Descartar</button>
          ${emailAction}`;
      } else if (treatmentStatus === 'treated') {
        actions = `
          <button type="button" class="button ghost" data-detail-action="reopen" id="btnReopenPublication">${iconSvg('reopen')} Reabrir</button>
          <button type="button" class="button ghost" data-detail-action="task" id="btnCreateTask">${iconSvg('add')} Criar tarefa</button>
          ${emailAction}`;
      } else if (treatmentStatus === 'discarded') {
        actions = `
          <button type="button" class="button ghost" data-detail-action="restore" id="btnRestorePublication">${iconSvg('reopen')} Restaurar</button>
          ${emailAction}`;
      }

      container.innerHTML = `
        <div class="detail-header">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
            ${this.treatmentStatusBadge(item.treatmentStatus)}
            <span class="act-chip ${act.css}">${escapeHtml(act.label)}</span>
            ${urgent ? '<span class="badge-urgent">URGENTE</span>' : ''}
            ${item.important ? '<span class="badge-important">IMPORTANTE</span>' : ''}
          </div>
          <h2>${escapeHtml(item.title)}</h2>
          <p>${escapeHtml(item.court || 'Origem judicial não informada')}</p>
        </div>
        ${treatmentInfo}
        <div class="detail-meta">
          <div><small>Processo</small><strong>${escapeHtml(item.process || 'Não identificado')}</strong></div>
          <div><small>Partes</small><strong>${escapeHtml(this.intimationParties(item) || 'Ainda não identificadas')}</strong></div>
          <div><small>Publicação</small><strong>${formatDate(item.publishedAt)} (${formatPublicationAge(item.publishedAt)})</strong></div>
          <div><small>Responsável</small><strong>${escapeHtml(item.responsible || item.lawyers || 'Advogado')}</strong></div>
        </div>
        ${linkedTasksHtml}
        <p class="eyebrow" style="margin-top:16px;">Texto original preservado</p>
        <div class="original-text">${escapeHtml(item.text || 'Sem texto original.')}</div>
        <div class="detail-actions" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">${actions}</div>`;

      container.querySelectorAll('[data-detail-action]').forEach(button => {
        button.addEventListener('click', () => this.handleAction(item, button.dataset.detailAction));
      });
      container.querySelectorAll('[data-open-task-id]').forEach(button => {
        button.addEventListener('click', () => {
          const task = store.state.tasks.find(record => record.id === button.dataset.openTaskId);
          if (task) onOpenTask?.(task);
        });
      });
    },

    async handleAction(item, action) {
      if (!item) return;
      if (action === 'send-email') return this.openPublicationEmailModal(item);
      if (action === 'task') {
        const urgent = Boolean(item.urgent || item.priority === 'urgente');
        onOpenTask?.({
          title: `Analisar publicação: ${item.title}`,
          description: item.text,
          process: item.process,
          client: item.client,
          source: item.source || 'DJEN',
          intimationId: item.id,
          deadline: '',
          priority: urgent ? 'urgente' : 'normal',
          status: 'triagem'
        });
        return;
      }
      if (action === 'start-review') return this.applyTreatmentAction(item.id, 'start_review');
      if (action === 'treat') return this.openTreatModal(item);
      if (action === 'discard') return this.openDiscardModal(item);
      if (action === 'reopen') return this.applyTreatmentAction(item.id, 'reopen');
      if (action === 'restore') return this.applyTreatmentAction(item.id, 'restore');
    },

    async createTaskFromPublication(publicationId, task) {
      try {
        const response = await windowRef.fetch(`/api/publications/${encodeURIComponent(publicationId)}/task`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': windowRef.KellerAuth?.csrfToken || ''
          },
          body: JSON.stringify({
            publicationId,
            revision: store.revision ?? store.state?.revision ?? undefined,
            task
          })
        });
        if (response.status === 409) {
          const errorData = await response.json().catch(() => ({}));
          toast(errorData.error || errorData.message || 'Esta publicação foi atualizada por outro usuário. Recarregue os dados.', 'warning');
          await onSyncAppState?.();
          return null;
        }
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          toast(errorData.error || errorData.message || 'Não foi possível criar a tarefa vinculada à publicação.', 'error');
          return null;
        }

        const data = await response.json();
        const canonicalPublication = data.publication || data.intimation;
        if (!data.task || !canonicalPublication || !data.revision) {
          toast('O servidor não devolveu o estado canônico completo da tarefa.', 'error');
          return null;
        }
        if (!Array.isArray(store.state.tasks)) store.state.tasks = [];
        const taskIndex = store.state.tasks.findIndex(record => record.id === data.task.id);
        if (taskIndex === -1) store.state.tasks.unshift(data.task);
        else store.state.tasks[taskIndex] = data.task;
        const publicationIndex = store.state.intimations.findIndex(record => record.id === canonicalPublication.id || record.externalId === canonicalPublication.id);
        if (publicationIndex !== -1) store.state.intimations[publicationIndex] = canonicalPublication;
        store.revision = data.revision;
        this.renderInbox();
        this.renderMetrics();
        onRenderGlobalMetrics?.();
        this.renderDetail();
        return data;
      } catch {
        toast('Não foi possível criar a tarefa vinculada à publicação.', 'error');
        return null;
      }
    },

    async applyTreatmentAction(intimationId, action, note = null) {
      const item = store.state.intimations.find(record => record.id === intimationId);
      if (!item) return;
      try {
        const response = await windowRef.fetch(`/api/intimations/${encodeURIComponent(intimationId)}/treatment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': windowRef.KellerAuth?.csrfToken || ''
          },
          body: JSON.stringify({
            action,
            note,
            revision: store.revision || store.state?.revision || undefined
          })
        });
        if (response.status === 409) {
          const errorData = await response.json().catch(() => ({}));
          toast(errorData.error || errorData.message || 'Esta publicação foi atualizada por outro usuário. Recarregue os dados.', 'warning');
          await onSyncAppState?.();
          return;
        }
        if (response.ok) {
          const data = await response.json();
          if (data.intimation) {
            const index = store.state.intimations.findIndex(record => record.id === intimationId);
            if (index !== -1) store.state.intimations[index] = data.intimation;
            if (data.revision) store.revision = data.revision;
          }
          this.renderInbox();
          this.renderMetrics();
          onRenderGlobalMetrics?.();
          this.renderDetail();
          toast(data.message || 'Tratamento atualizado com sucesso!', 'success');
          return;
        }
        const errorData = await response.json().catch(() => ({}));
        toast(errorData.error || 'Não foi possível atualizar o tratamento da publicação. Tente novamente.', 'error');
      } catch (error) {
        console.error('Falha na requisição de tratamento:', error);
        toast('Não foi possível atualizar o tratamento da publicação. Tente novamente.', 'error');
      }
    },

    openDiscardModal(item) {
      if (!item) return;
      byId('discardPublicationIdInput').value = item.id;
      byId('discardPublicationProcessRef').textContent = item.process || 'Sem processo vinculado';
      byId('discardPublicationTitleRef').textContent = item.title || 'Publicação';
      byId('discardReasonInput').value = '';
      if (!getPresenter().openOverlay('discardPublicationBackdrop', 'discardReasonInput')) {
        byId('discardPublicationBackdrop').classList.remove('hidden');
        byId('discardReasonInput').focus();
      }
    },
    closeDiscardModal() {
      if (!getPresenter().closeOverlay('discardPublicationBackdrop')) byId('discardPublicationBackdrop')?.classList.add('hidden');
    },
    openTreatModal(item) {
      if (!item) return;
      byId('treatPublicationIdInput').value = item.id;
      byId('treatPublicationProcessRef').textContent = item.process || 'Sem processo vinculado';
      byId('treatPublicationTitleRef').textContent = item.title || 'Publicação';
      byId('treatNoteInput').value = '';
      if (!getPresenter().openOverlay('treatPublicationBackdrop', 'treatNoteInput')) {
        byId('treatPublicationBackdrop').classList.remove('hidden');
        byId('treatNoteInput').focus();
      }
    },
    closeTreatModal() {
      if (!getPresenter().closeOverlay('treatPublicationBackdrop')) byId('treatPublicationBackdrop')?.classList.add('hidden');
    },

    openPublicationsEmailModal() {
      currentEmailBulletin = null;
      const preview = byId('emailPreviewContainer');
      if (preview) preview.innerHTML = `<div style="padding:24px;text-align:center;color:#64748b;">${iconSvg('info')} Informe o destinatário e confirme o envio manual para gerar o boletim com dados canônicos do servidor.</div>`;
      if (!getPresenter().openOverlay('publicationsEmailModalBackdrop', 'emailTargetAddress')) {
        byId('publicationsEmailModalBackdrop')?.classList.remove('hidden');
      }
    },
    closePublicationsEmailModal() {
      if (!getPresenter().closeOverlay('publicationsEmailModalBackdrop')) byId('publicationsEmailModalBackdrop')?.classList.add('hidden');
    },

    async sendBatchEmail() {
      const recipient = byId('emailTargetAddress')?.value?.trim();
      if (!recipient) return toast('Informe um e-mail de destino.', 'error');
      const publicationIds = this.filteredItems().map(item => item?.id || item?.externalId).filter(Boolean);
      if (!publicationIds.length) return toast('Nenhuma publicação foi selecionada para o boletim.', 'error');
      const sendButton = byId('btnSendEmailDirect');
      if (sendButton) {
        sendButton.disabled = true;
        sendButton.textContent = 'Enviando…';
      }
      toast('Processando envio do boletim de publicações…');
      try {
        const response = await windowRef.KellerAuth.secureFetch('/api/publications/email/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipient, publicationIds })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Falha no envio.');
        currentEmailBulletin = data;
        const preview = byId('emailPreviewContainer');
        if (preview) preview.innerHTML = data.emailHtml || '<div style="padding:16px;">Boletim enviado com sucesso.</div>';
        toast(data.message || 'Boletim enviado com sucesso!', 'success');
      } catch (error) {
        toast(`Erro na requisição: ${error.message}`, 'error');
      } finally {
        if (sendButton) {
          sendButton.disabled = false;
          sendButton.innerHTML = `${iconSvg('send')} Enviar E-mail via Servidor`;
        }
      }
    },

    async copyEmailBulletin() {
      if (!currentEmailBulletin?.emailHtml) return toast('Nenhum conteúdo para copiar.', 'error');
      try {
        const htmlBlob = new Blob([currentEmailBulletin.emailHtml], { type: 'text/html' });
        const textBlob = new Blob([currentEmailBulletin.emailText || ''], { type: 'text/plain' });
        await navigatorRef.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })]);
        toast('HTML e texto do e-mail copiados com sucesso!', 'success');
      } catch {
        await navigatorRef.clipboard.writeText(currentEmailBulletin.emailText || '');
        toast('Texto do e-mail copiado com sucesso!', 'success');
      }
    },

    downloadEmailBulletin() {
      if (!currentEmailBulletin?.emailHtml) return toast('Gere o boletim primeiro.', 'error');
      const blob = new Blob([currentEmailBulletin.emailHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = documentRef.createElement('a');
      anchor.href = url;
      anchor.download = `boletim-publicacoes-${isoDate()}.html`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast('Arquivo HTML baixado com sucesso.', 'success');
    },

    openPublicationEmailModal(item) {
      if (!item) return;
      const backdrop = byId('publicationEmailBackdrop');
      if (!backdrop) return;
      const idInput = byId('publicationEmailIdInput');
      const reference = byId('publicationEmailRef');
      const recipient = byId('publicationEmailRecipientInput');
      const submitButton = byId('publicationEmailSubmitBtn');
      if (idInput) idInput.value = item.id;
      if (reference) reference.textContent = item.process || item.number || item.title || 'Publicação judicial';
      if (recipient) recipient.value = '';
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Enviar';
      }
      if (!getPresenter().openOverlay('publicationEmailBackdrop', 'publicationEmailRecipientInput')) {
        backdrop.classList.remove('hidden');
        documentRef.body.style.overflow = 'hidden';
        if (recipient) windowRef.setTimeout(() => recipient.focus(), 50);
      }
    },

    closePublicationEmailModal() {
      if (!getPresenter().closeOverlay('publicationEmailBackdrop')) {
        byId('publicationEmailBackdrop')?.classList.add('hidden');
        if (byId('modalBackdrop')?.classList.contains('hidden')) documentRef.body.style.overflow = '';
      }
    },

    async submitPublicationEmail(event) {
      event?.preventDefault();
      const publicationId = byId('publicationEmailIdInput')?.value;
      const recipient = byId('publicationEmailRecipientInput')?.value?.trim();
      const submitButton = byId('publicationEmailSubmitBtn');
      if (!publicationId) return toast('Identificador da publicação não encontrado.', 'error');
      if (!recipient) return toast('Informe o endereço de e-mail do destinatário.', 'warning');
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Enviando...';
      }
      try {
        const response = await windowRef.KellerAuth.secureFetch('/api/intimations/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ publicationId, recipient })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Falha ao enviar publicação por e-mail.');
        this.closePublicationEmailModal();
        toast('Publicação enviada por e-mail.', 'success');
      } catch (error) {
        toast(error.message || 'Falha ao enviar publicação.', 'error');
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Enviar';
        }
      }
    },

    classifyAct: classifyIntimationAct,
    formatAge: formatPublicationAge
  };

  return feature;
}
