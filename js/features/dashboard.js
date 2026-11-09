import { Store } from '../core/store.js?v=3.0.0';
import { activeIntimations, findIntimationRecord, publicationsInRecentScope } from '../core/publication-scope.js?v=3.0.0';
import { buildActivityInbox } from '../core/activity-inbox.js?v=3.0.0';
import { computeTaskPerformance } from '../core/task-performance.js?v=3.0.0';
import { renderDashboardV2Summary } from '../views/ui-v2/dashboard.js?v=3.0.0';
import { renderFirstSteps } from '../views/ui-v2/first-steps.js?v=3.0.0';
import { iconSvg } from '../views/ui-v2/icons.js?v=3.0.0';
import { renderOfficeInvolved, taskInvolvedPeople, teamForPeople, teamForTask } from '../core/office-involved.js?v=3.0.0';
import { getOfficeDirectory, officeDirectoryLoaded, refreshOfficeDirectory } from '../core/office-directory.js?v=3.0.0';
import { officeOabKeys } from '../core/publication-parties.js?v=3.0.0';
import { officeScopeItems } from '../core/office-scope.js?v=3.0.0';

export function createDashboardFeature({
  store = Store,
  documentRef = globalThis.document,
  escapeHtml,
  formatDate,
  formatMinutes,
  formatCurrency,
  daysUntil,
  isTerminalStatus,
  getUntreatedCount,
  renderPublicationsMetrics,
  renderOfficeIdentity,
  onOpenTask,
  onToggleTaskDone = null,
  onCompleteTask,
  onRenderAll,
  onOpenAgenda,
  onOpenActivity,
  onAcknowledgeActivity,
  onOpenProcess,
  showToast,
  requestPublicationFunnel = null,
  dashboardWidgets = null
} = {}) {
  let initialized = false;
  let dashboardTaskFilter = 'all';
  let dashboardTaskSort = 'date-asc';
  let activityFilter = 'all';
  let currentActivities = [];
  let weeklyFunnel = null;
  let funnelRequested = false;
  let funnelLoading = false;
  const byId = id => documentRef?.getElementById(id);
  const normalizedProcessNumber = value => String(value || '').replace(/\D/g, '');
  const normalizedName = value => String(value || '').trim().toLocaleLowerCase('pt-BR');

  // Data/hora de um evento da Agenda em milissegundos locais (ou NaN).
  const agendaDateTime = item => {
    const date = String(item?.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NaN;
    const time = /^\d{2}:\d{2}/.test(String(item?.time || '')) ? String(item.time).slice(0, 5) : '00:00';
    const [year, month, day] = date.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute).getTime();
  };

  // Índice O(n) para resolver o contexto processo↔tarefa sem varreduras
  // repetidas: mesma semântica de first-match do find/filter originais.
  function buildProcessLookup(processes) {
    const byId = new Map();
    const byNumber = new Map();
    const byClient = new Map();
    // Chaves de id sem coerção: o find original usa === estrito.
    const idKeyOf = value => (value === undefined || value === null || value === '' ? null : value);
    for (const item of processes || []) {
      if (!item) continue;
      const id = idKeyOf(item.id);
      if (id !== null && !byId.has(id)) byId.set(id, item);
      const externalId = idKeyOf(item.externalId);
      if (externalId !== null && !byId.has(externalId)) byId.set(externalId, item);
      const number = normalizedProcessNumber(item.number);
      if (number && !byNumber.has(number)) byNumber.set(number, item);
      const client = normalizedName(item.client);
      if (client) {
        const bucket = byClient.get(client);
        if (!bucket) byClient.set(client, [item]);
        else if (bucket.length < 2) bucket.push(item);
      }
    }
    return { byId, byNumber, byClient };
  }

  // Reconstruído por chamada: processes é mutado in place por sync/save,
  // então cache entre renders ficaria obsoleto. O custo O(n) é irrisório
  // perto das varreduras O(n·m) que o índice elimina.
  const lookupOf = processes => buildProcessLookup(processes);

  const resolveTaskContext = (task, lookup, intimations = store.state.intimations || []) => {
    const intimation = findIntimationRecord(intimations, task.intimationId)
      || findIntimationRecord(intimations, task.sourceIntimationId);
    const processId = task.processId || intimation?.processId || '';
    const processNumber = task.process || intimation?.process || '';
    const normalizedNumber = normalizedProcessNumber(processNumber);
    let process = (processId && lookup.byId.get(processId)) || null;

    if (!process && normalizedNumber) {
      process = lookup.byNumber.get(normalizedNumber) || null;
    }

    if (!process && task.client) {
      const bucket = lookup.byClient.get(normalizedName(task.client));
      if (bucket && bucket.length === 1) process = bucket[0];
    }

    return {
      process,
      clientName: task.client || intimation?.client || process?.client || '',
      processNumber: processNumber || process?.number || '',
      actionType: task.actionType || process?.actionType || process?.subject || intimation?.actionType || ''
    };
  };

  const taskContext = (task, processes = store.state.processes || [], intimations = store.state.intimations || []) => resolveTaskContext(task, lookupOf(processes), intimations);

  const feature = {
    get initialized() { return initialized; },
    get taskFilter() { return dashboardTaskFilter; },
    set taskFilter(value) { dashboardTaskFilter = value || 'all'; },
    get taskSort() { return dashboardTaskSort; },
    set taskSort(value) { dashboardTaskSort = value || 'date-asc'; },

    init() {
      if (initialized) return false;
      initialized = true;
      byId('btnDashboardNewTask')?.addEventListener('click', () => onOpenTask?.());
      byId('dashboardTaskSortSelect')?.addEventListener('change', event => {
        dashboardTaskSort = event.target.value;
        this.renderTasks();
      });
      byId('dashboardTaskFilters')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-dashboard-task-filter]');
        if (!button) return;
        dashboardTaskFilter = button.dataset.dashboardTaskFilter;
        byId('dashboardTaskFilters').querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
        this.renderTasks();
      });
      byId('activityInboxFilters')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-activity-filter]');
        if (!button) return;
        activityFilter = button.dataset.activityFilter || 'all';
        byId('activityInboxFilters').querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
        this.renderActivityInbox();
      });
      byId('activityInboxList')?.addEventListener('click', async event => {
        const row = event.target.closest('[data-activity-key]');
        const item = currentActivities.find(candidate => candidate.key === row?.dataset.activityKey);
        if (!item) return;
        if (event.target.closest('[data-activity-acknowledge]')) {
          event.stopPropagation();
          if (!await onAcknowledgeActivity?.(item)) return;
          this.renderActivityInbox();
          return;
        }
        onOpenActivity?.(item);
      });
      return true;
    },

    render() {
      renderOfficeIdentity?.();
      if (documentRef?.documentElement?.dataset?.ui === 'v2' && !funnelRequested && typeof requestPublicationFunnel === 'function') {
        funnelRequested = true;
        void this.loadWeeklyFunnel();
      }
      const metrics = this.renderMetrics();
      const activities = this.renderActivityInbox();
      this.renderTasks();
      const widgets = this.renderWidgets();
      const insights = { ...this.actionableValues(), weeklyFunnel };
      this.renderHearings(widgets.hearings);
      const performance = this.performanceValues();
      renderDashboardV2Summary({ documentRef, metrics, widgets, insights, performance, formatDate, formatCurrency, escapeHtml });
      renderFirstSteps({ documentRef, state: store.state, status: globalThis.Atrium?.App?.setupStatus || {}, onAction: action => globalThis.Atrium?.App?.runSetupAction(action), canManage: globalThis.AtriumAuth?.currentUser?.role === 'master_admin', storage: documentRef?.defaultView?.localStorage, escapeHtml });
      this.applyDashboardWidgetPreferences();
      return { metrics, widgets, activities, insights, performance };
    },

    /**
     * Projeção de performance (mês atual vs mês anterior) sobre as tarefas
     * registradas. Meta vem de configuration.goals[].pointsGoal.
     */
    performanceValues() {
      const goals = store.state.configuration?.goals || [];
      const goalEntry = goals.find(entry => entry && Number.isFinite(Number(entry.pointsGoal)) && Number(entry.pointsGoal) > 0);
      return computeTaskPerformance(store.state.tasks || [], {
        goal: goalEntry ? Number(goalEntry.pointsGoal) : null,
        now: new Date()
      });
    },

    /**
     * Aplica a preferência experimental de personalização do painel (local ao
     * navegador). Desligada por padrão: todos os blocos permanecem visíveis e
     * o grid original é restaurado.
     */
    applyDashboardWidgetPreferences() {
      const catalog = Array.isArray(dashboardWidgets?.catalog) ? dashboardWidgets.catalog : [];
      if (!catalog.length) return false;
      let preferences = { enabled: false, hidden: [] };
      try {
        preferences = dashboardWidgets?.read?.() || preferences;
      } catch {
        preferences = { enabled: false, hidden: [] };
      }
      for (const widget of catalog) {
        const element = documentRef?.querySelector?.(widget.selector);
        if (!element) continue;
        element.hidden = preferences.enabled === true && preferences.hidden.includes(widget.id);
      }
      const wrap = documentRef?.querySelector?.('#view-dashboard .dashboard-workspace-wrap');
      if (wrap) {
        const mode = dashboardWidgets?.workspaceMode?.(preferences) || 'default';
        wrap.classList?.toggle?.('is-single-column', mode === 'single-tasks' || mode === 'single-widgets');
        wrap.classList?.toggle?.('is-empty-columns', mode === 'hidden');
      }
      return true;
    },

    /**
     * Carrega o funil semanal persistido pelo servidor (uma vez por sessão) e
     * re-renderiza apenas o panorama acionável. Falha aqui é silenciosa: o
     * card mantém as métricas locais já calculadas.
     */
    async loadWeeklyFunnel() {
      if (typeof requestPublicationFunnel !== 'function' || funnelLoading) return weeklyFunnel;
      funnelLoading = true;
      try {
        const payload = await requestPublicationFunnel();
        weeklyFunnel = Array.isArray(payload?.weeks) ? payload.weeks : null;
      } catch {
        weeklyFunnel = null;
      } finally {
        funnelLoading = false;
      }
      const insights = { ...this.actionableValues(), weeklyFunnel };
      renderDashboardV2Summary({
        documentRef,
        metrics: this.renderMetrics(),
        widgets: this.renderWidgets(),
        insights,
        performance: this.performanceValues(),
        formatDate,
        formatCurrency,
        escapeHtml
      });
      return weeklyFunnel;
    },

    activities() {
      const all = buildActivityInbox(store.state || {});
      if (activityFilter === 'work') return all.filter(item => ['overdue-task', 'upcoming-task', 'appointment'].includes(item.type));
      if (activityFilter === 'judicial') return all.filter(item => ['publication', 'judicial-event', 'reconciliation'].includes(item.type));
      if (activityFilter === 'system') return all.filter(item => ['document-review', 'sync-problem'].includes(item.type));
      return all;
    },

    renderActivityInbox() {
      const list = byId('activityInboxList');
      currentActivities = this.activities();
      const count = byId('activityInboxCount');
      if (count) count.textContent = `${currentActivities.length} item${currentActivities.length === 1 ? '' : 's'}`;
      if (!list) return currentActivities;
      if (!currentActivities.length) {
        list.innerHTML = '<div class="activity-inbox-empty"><strong>Nenhuma atividade neste filtro.</strong><span>Os itens reaparecem quando houver um fato operacional novo.</span></div>';
        return currentActivities;
      }
      list.innerHTML = currentActivities.map(item => `<article class="activity-inbox-item priority-${item.priority}" data-activity-key="${escapeHtml(item.key)}" tabindex="0">
        <span class="activity-inbox-marker" aria-hidden="true"></span>
        <div class="activity-inbox-copy"><div><span>${escapeHtml(activityTypeLabel(item.type))}</span><time>${escapeHtml(formatDate(item.date))}</time></div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.context)}</p><small>${escapeHtml(item.origin)}</small></div>
        <div class="activity-inbox-actions"><button type="button" class="v2-button is-secondary" data-activity-open>${escapeHtml(item.actionLabel)}</button>${item.acknowledgeable ? '<button type="button" class="v2-button is-ghost" data-activity-acknowledge>Marcar visto</button>' : ''}</div>
      </article>`).join('');
      return currentActivities;
    },

    renderMetrics() {
      // Métricas do escritório não somam o escopo privado; o selo da caixa de
      // entrada continua reflecting o acervo pessoal do membro.
      const officeIntimations = officeScopeItems(store.state.intimations);
      const untreatedIntimations = getUntreatedCount?.() || 0;
      const officeUntreated = officeIntimations.filter(item => (item.treatmentStatus || 'untreated') === 'untreated').length;
      const deadlines = officeScopeItems(store.state.tasks).filter(task => task.active !== false && !isTerminalStatus(task.status) && daysUntil(task.deadline) >= 0 && daysUntil(task.deadline) <= 7).length;
      const activeProcesses = officeScopeItems(store.state.processes).filter(process => process.monitoring !== 'inactive').length;
      const sources = store.state.sources || [];
      const activeSources = sources.filter(source => source.status === 'ok').length;
      const mInbox = byId('metricInbox');
      const mDead = byId('metricDeadlines');
      const mTasks = byId('metricTasks');
      const mSources = byId('metricSources');
      const inBadge = byId('inboxBadge');
      const notifDot = byId('notificationDot');
      if (mInbox) mInbox.textContent = officeUntreated;
      if (mDead) mDead.textContent = deadlines;
      if (mTasks) mTasks.textContent = activeProcesses;
      if (mSources) mSources.textContent = `${activeSources}/${sources.length}`;
      if (inBadge) {
        inBadge.textContent = untreatedIntimations;
        inBadge.style.display = untreatedIntimations > 0 ? 'inline-block' : 'none';
      }
      if (notifDot) notifDot.style.display = untreatedIntimations ? '' : 'none';
      renderPublicationsMetrics?.();
      return { untreatedIntimations, officeUntreated, deadlines, activeProcesses, activeSources, sourceCount: sources.length };
    },

    visibleTasks() {
      const tasks = (store.state.tasks || []).filter(task => task && task.active !== false);
      const processes = store.state.processes || [];
      const intimations = store.state.intimations || [];
      const lookup = lookupOf(processes);
      const memo = new Map();
      // Resolve cada tarefa uma única vez: o comparador abaixo roda O(n log n)
      // vezes e cada resolução varria a base de processos.
      const contextOf = task => {
        let context = memo.get(task);
        if (!context) {
          context = resolveTaskContext(task, lookup, intimations);
          memo.set(task, context);
        }
        return context;
      };
      const filtered = tasks.filter(task => {
        if (task.active === false) return false;
        if (isTerminalStatus(task.status)) return false;
        if (dashboardTaskFilter === 'all') return true;
        const lower = `${String(task.title || '').toLowerCase()} ${String(task.type || '').toLowerCase()}`;
        if (dashboardTaskFilter === 'prazo') return lower.includes('prazo') || lower.includes('decisão') || lower.includes('recurso');
        if (dashboardTaskFilter === 'audiencia') return lower.includes('audiência') || lower.includes('audiencia') || lower.includes('julgamento');
        if (dashboardTaskFilter === 'tarefa') return !lower.includes('audiência') && !lower.includes('prazo');
        return true;
      });

      filtered.sort((a, b) => {
        const contextA = contextOf(a);
        const contextB = contextOf(b);
        const clientA = contextA.clientName || a.title || '';
        const clientB = contextB.clientName || b.title || '';
        const pointsA = Number(a.points) || 0;
        const pointsB = Number(b.points) || 0;

        if (dashboardTaskSort === 'date-asc') return (daysUntil(a.deadline) - daysUntil(b.deadline)) || (a.priority === 'urgente' ? -1 : 1);
        if (dashboardTaskSort === 'date-desc') return (daysUntil(b.deadline) - daysUntil(a.deadline)) || (a.priority === 'urgente' ? -1 : 1);
        if (dashboardTaskSort === 'name-asc') return clientA.localeCompare(clientB, 'pt-BR');
        if (dashboardTaskSort === 'difficulty-desc') return (pointsB - pointsA) || (daysUntil(a.deadline) - daysUntil(b.deadline));
        if (dashboardTaskSort === 'difficulty-asc') return (pointsA - pointsB) || (daysUntil(a.deadline) - daysUntil(b.deadline));
        if (dashboardTaskSort === 'priority') {
          const priorityScore = item => (item.priority === 'urgente' ? 3 : item.priority === 'importante' ? 2 : 1);
          return (priorityScore(b) - priorityScore(a)) || (daysUntil(a.deadline) - daysUntil(b.deadline));
        }
        return daysUntil(a.deadline) - daysUntil(b.deadline);
      });
      return filtered;
    },

    renderTasks() {
      const listEl = byId('dashboardTaskList');
      if (!listEl) return;
      const processes = store.state.processes || [];
      const intimations = store.state.intimations || [];
      const lookup = lookupOf(processes);
      const officeKeys = officeOabKeys({ terms: store.state.terms || [], users: getOfficeDirectory().users });
      const filtered = this.visibleTasks();
      if (!officeDirectoryLoaded()) {
        void refreshOfficeDirectory().then(directory => { if (directory.users.length || directory.teams.length) this.renderTasks(); });
      }
      const countEl = byId('dashboardTaskCount');
      if (countEl) countEl.textContent = `${filtered.length} tarefas`;

      if (!filtered.length) {
        listEl.innerHTML = `<div class="empty-column" style="padding:24px;text-align:center;"><p>${iconSvg('check')}Nenhuma tarefa pendente neste filtro.</p></div>`;
        return;
      }

      listEl.innerHTML = filtered.map(task => {
        const { clientName, processNumber, actionType } = resolveTaskContext(task, lookup, intimations);
        const points = Number(task.points) || 0;
        const titleLower = String(task.title || '').toLowerCase();
        let typeBadge = 'tarefa';
        let typeLabel = 'Tarefa';
        if (titleLower.includes('prazo') || titleLower.includes('recurso') || titleLower.includes('decisão')) {
          typeBadge = 'prazo';
          typeLabel = 'Prazo';
        } else if (titleLower.includes('audiência') || titleLower.includes('audiencia') || titleLower.includes('julgamento')) {
          typeBadge = 'audiencia';
          typeLabel = 'Audiência';
        } else if (titleLower.includes('reunião') || titleLower.includes('reuniao') || titleLower.includes('atendimento')) {
          typeBadge = 'reuniao';
          typeLabel = 'Reunião';
        }

        const operationalDeadline = task.deadline || task.fatalDeadline || '';
        const sourceReference = task.sourceReportedDeadlineAt || '';
        const sourceLabel = task.sourceReportedDeadlineSource === 'domicilio'
          ? 'Domicílio Eletrônico'
          : (task.deadlineSource || task.sourceReportedDeadlineSource || 'fonte');
        const displayedDeadline = operationalDeadline || sourceReference;
        const isSourceReported = !operationalDeadline && Boolean(sourceReference);
        const days = daysUntil(operationalDeadline);
        const dateFormatted = operationalDeadline
          ? escapeHtml(formatDate(operationalDeadline))
          : sourceReference ? `${escapeHtml(formatDate(sourceReference))} · referência do ${escapeHtml(sourceLabel)} · conferir` : 'Sem data';
        const dateStateClass = operationalDeadline ? (days < 0 ? 'is-overdue' : days <= 2 ? 'is-due-soon' : '') : '';
        const difficultyText = points >= 50 ? 'Alta Complexidade' : points >= 20 ? 'Média' : points > 0 ? 'Básica' : '';
        const people = taskInvolvedPeople(task, getOfficeDirectory().users, processes, intimations, officeKeys);
        const team = teamForTask(task, getOfficeDirectory().teams, processes) || teamForPeople(getOfficeDirectory().teams, people);
        const involved = renderOfficeInvolved({ people, team, escapeHtml, iconSvg }) || '<span class="office-involved office-involved-empty">Sem responsável</span>';

        return `
          <div class="dashboard-task-item" data-dashboard-task-id="${escapeHtml(task.id)}">
            <input type="checkbox" class="dashboard-task-check" data-complete-task-id="${escapeHtml(task.id)}" title="Concluir tarefa">
            <div class="dashboard-task-body">
              <div class="dashboard-task-title">${escapeHtml(task.title)}</div>
              <div class="dashboard-task-process">
                ${clientName ? `<strong>${iconSvg('contacts')} ${escapeHtml(clientName)}</strong>` : '<span class="dashboard-task-context-empty">Cliente não vinculado</span>'}
                ${processNumber ? `<span class="dashboard-task-process-badge" data-dashboard-process-open="${escapeHtml(processNumber)}" title="Acessar processo" style="cursor:pointer;">${iconSvg('processes')} <b>${escapeHtml(processNumber)}</b></span>` : '<span class="dashboard-task-context-empty">Processo não vinculado</span>'}
                ${actionType ? `<span class="dashboard-task-action-type">${iconSvg('court')} <b>${escapeHtml(actionType)}</b></span>` : '<span class="dashboard-task-context-empty">Tipo da ação não informado</span>'}
              </div>
              <div class="dashboard-task-tags">
                <span class="task-tag ${typeBadge}">${typeLabel}</span>
                ${task.responsible ? `<span class="task-tag user">${iconSvg('contacts')} ${escapeHtml(task.responsible)}</span>` : ''}
                ${points ? `<span class="task-tag points" style="background:rgba(212,175,55,0.15);color:var(--gold);font-weight:600;">${iconSvg('tasks')} ${points} pts${difficultyText ? ` (${difficultyText})` : ''}</span>` : ''}
                ${task.priority === 'urgente' ? '<span class="task-tag" style="background:rgba(239,68,68,0.15);color:var(--danger);font-weight:700;">URGENTE</span>' : ''}
              </div>
            </div>
            ${involved ? `<div class="dashboard-task-involved">${involved}</div>` : ''}
            <div class="dashboard-task-date ${dateStateClass}">${dateFormatted}</div>
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('[data-dashboard-task-id]').forEach(item => {
        item.addEventListener('click', event => {
          if (event.target.closest('[data-complete-task-id]')) return;
          const processClick = event.target.closest('[data-dashboard-process-open]');
          if (processClick && onOpenProcess) {
            const raw = processClick.dataset.dashboardProcessOpen;
            const proc = (store.state.processes || []).find(p => p.number === raw || p.number?.replace(/\D/g, '') === raw?.replace(/\D/g, ''));
            if (proc) {
              event.stopPropagation();
              onOpenProcess(proc);
              return;
            }
          }
          const task = (store.state.tasks || []).find(candidate => candidate.id === item.dataset.dashboardTaskId);
          if (task) onOpenTask?.(task);
        });
      });
      listEl.querySelectorAll('[data-complete-task-id]').forEach(checkbox => {
        checkbox.addEventListener('change', async event => {
          event.stopPropagation();
          if (onToggleTaskDone) {
            const record = (store.state.tasks || []).find(candidate => candidate.id === checkbox.dataset.completeTaskId);
            if (record && await onToggleTaskDone(record, checkbox)) onRenderAll?.();
            return;
          }
          const task = await onCompleteTask?.(checkbox.dataset.completeTaskId);
          if (task) {
            onRenderAll?.();
            showToast?.('Tarefa concluída com sucesso!', 'success');
          }
        });
      });
    },

    /**
     * Audiências e sessões futuras, com cliente resolvido pelo processo.
     * Fonte: state.agenda (eventos oficiais reconciliados pelo eproc). Nunca cria prazo.
     */
    hearingValues() {
      const state = store.state || {};
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const lookup = lookupOf(officeScopeItems(state.processes));
      const items = (state.agenda || [])
        .filter(event => event && event.active !== false && event.sourceStatus !== 'not_present')
        .filter(event => event.hearingType || /audi[êe]ncia|sess[ãa]o de julgamento/i.test(String(event.title || '')))
        .map(event => {
          const at = agendaDateTime(event);
          const endsAt = Date.parse(String(event.sessionEnd || ''));
          return { event, at, endsAt: Number.isFinite(endsAt) ? endsAt : NaN };
        })
        // Sessão assíncrona em curso (começou antes de hoje e termina hoje ou depois) continua visível.
        .filter(({ at, endsAt }) => Number.isFinite(at) && (
          at >= today.getTime() || (Number.isFinite(endsAt) && endsAt >= today.getTime())
        ))
        .sort((left, right) => left.at - right.at)
        .map(({ event }) => {
          const process = lookup.byNumber.get(normalizedProcessNumber(event.process || event.processNumber)) || null;
          return { ...event, clientResolved: event.client || process?.client || '' };
        });
      const coversToday = event => {
        const start = agendaDateTime(event);
        const endRaw = Date.parse(String(event.sessionEnd || ''));
        const end = Number.isFinite(endRaw) ? endRaw : start + 86400000;
        const dayStart = today.getTime();
        return start < dayStart + 86400000 && end >= dayStart;
      };
      return {
        items: items.slice(0, 8),
        today: items.filter(coversToday).length,
        week: items.filter(event => {
          const distance = daysUntil(event.date);
          if (distance >= 0 && distance <= 7) return true;
          const endsAt = Date.parse(String(event.sessionEnd || ''));
          return distance < 0 && Number.isFinite(endsAt) && endsAt >= today.getTime();
        }).length,
        next: items[0] || null
      };
    },

    widgetValues() {
      // "Minhas atividades" é pessoal (mantém o escopo privado do próprio
      // membro); a carteira de processos é do escritório.
      const tasks = (store.state.tasks || []).filter(task => task && task.active !== false);
      const processes = officeScopeItems(store.state.processes);
      const leads = store.state.leads || [];
      const visibleTasks = tasks.filter(task => task.active !== false);
      const completed = visibleTasks.filter(task => isTerminalStatus(task.status)).length;
      const late = visibleTasks.filter(task => !isTerminalStatus(task.status) && daysUntil(task.deadline) < 0).length;
      const pending = visibleTasks.filter(task => !isTerminalStatus(task.status) && daysUntil(task.deadline) >= 0).length;
      const processActive = processes.filter(process => !process.archived).length;
      const activeLeads = leads.filter(lead => lead.status !== 'fechado' && lead.status !== 'declinado').length;

      let feesPending = 0;
      processes.forEach(process => {
        const installments = Array.isArray(process.feeInstallments) ? process.feeInstallments : [];
        if (installments.length) {
          feesPending += installments
            .filter(installment => !['pago', 'paga', 'quitado', 'repassado', 'recebido'].includes(String(installment.status || '').toLowerCase()))
            .reduce((total, installment) => total + Math.max(0, Number(installment.amount) || 0), 0);
          return;
        }
        const isPaid = process.feeStatus === 'pago' || process.feeStatus === 'quitado' || process.feeStatus === 'repassado' || process.requisitionStatus === 'repassado' || process.requisitionStatus === 'pago';
        if (isPaid) return;
        if (process.feeType === 'fixo' && process.feeAmount) {
          feesPending += Number(process.feeAmount);
        } else if (process.feeType === 'mensal' && process.feeMonthly) {
          feesPending += Number(process.feeMonthly);
        } else if (process.feeType === 'misto') {
          if (process.feeAmount) feesPending += Number(process.feeAmount);
          if (process.feeMonthly) feesPending += Number(process.feeMonthly);
        } else if (process.feePercentage) {
          const feePercentage = Number(process.feePercentage);
          const baseValue = Number(process.requisitionAmount ?? process.rpvAmount ?? process.economicValue ?? 0);
          if (baseValue > 0) feesPending += baseValue * feePercentage / 100;
          else if (process.feeAmount) feesPending += Number(process.feeAmount);
        } else if (process.feeAmount) {
          feesPending += Number(process.feeAmount);
        }
      });

      const thirtyDaysAgo = Date.now() - 30 * 86400000;
      let minutes30d = 0;
      tasks.forEach(task => {
        if (!Array.isArray(task.timeLogs)) return;
        task.timeLogs.forEach(log => {
          const logTime = new Date(log.date || log.at || log.createdAt || 0).getTime();
          if (!log.date || logTime >= thirtyDaysAgo) minutes30d += Number(log.minutes || 0);
        });
      });

      const parseAgendaTime = value => {
        const raw = String(value || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
          const [year, month, day] = raw.split('-').map(Number);
          return new Date(year, month - 1, day).getTime();
        }
        const parsed = Date.parse(raw);
        return Number.isFinite(parsed) ? parsed : NaN;
      };
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const upcomingAgenda = (store.state.agenda || [])
        .map(item => ({ item, time: parseAgendaTime(item?.date) }))
        .filter(({ item, time }) => item && Number.isFinite(time) && time >= todayStart.getTime())
        .sort((left, right) => left.time - right.time)
        .slice(0, 4)
        .map(({ item }) => item);

      return {
        completed,
        late,
        pending,
        processActive,
        processInactive: Math.max(0, processes.length - processActive),
        activeLeads,
        feesPending,
        minutes30d,
        documentCount: Array.isArray(store.state.customDocs) ? store.state.customDocs.length : 0,
        hearings: this.hearingValues(),
        nextDeadlineTask: (() => {
          const candidates = visibleTasks
            .filter(task => !isTerminalStatus(task.status) && task.deadline && daysUntil(task.deadline) >= 0)
            .sort((left, right) => String(left.deadline).localeCompare(String(right.deadline)));
          return candidates[0] || null;
        })(),
        reminders: upcomingAgenda
      };
    },

    actionableValues() {
      const state = store.state || {};
      // Contadores do escritório não somam o escopo privado nem registros suprimidos.
      const tasks = officeScopeItems(state.tasks).filter(task => task && task.active !== false);
      const processes = officeScopeItems(state.processes);
      const recentPublications = activeIntimations(publicationsInRecentScope(officeScopeItems(state.intimations)));
      const allPublications = activeIntimations(officeScopeItems(state.intimations));
      const sources = state.sources || [];
      const documents = officeScopeItems(state.documents);
      const openTasks = tasks.filter(task => !isTerminalStatus(task.status));
      const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
      const groupCounts = (items, labelFor) => {
        const counts = new Map();
        items.forEach(item => {
          const label = String(labelFor(item) || '').trim() || 'Não informado';
          counts.set(label, (counts.get(label) || 0) + 1);
        });
        return [...counts.entries()]
          .map(([label, count]) => ({ label, count }))
          .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'pt-BR'));
      };

      const tasksByResponsible = groupCounts(openTasks, task => task.responsible || 'Sem responsável').slice(0, 5);
      const processesByStatus = groupCounts(
        processes.filter(process => !process.archived),
        process => process.stage || process.judicialPhase || process.status || 'Etapa não informada'
      ).slice(0, 5);

      const treatmentDurations = recentPublications.map(publication => {
        const endValue = publication.treatedAt || publication.discardedAt;
        const startValue = publication.treatmentStartedAt;
        const start = Date.parse(startValue || '');
        const end = Date.parse(endValue || '');
        return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.round((end - start) / 60000) : null;
      }).filter(Number.isFinite);
      const averageTreatmentMinutes = treatmentDurations.length
        ? Math.round(treatmentDurations.reduce((total, value) => total + value, 0) / treatmentDurations.length)
        : null;

      const sourceChecks = [
        ...sources.map(source => source.lastCheck),
        ...processes.map(process => process.tjrsCollector?.syncedAt)
      ].filter(value => Number.isFinite(Date.parse(value || '')));
      sourceChecks.sort((left, right) => Date.parse(right) - Date.parse(left));
      const sourceProblems = new Set(['error', 'erro', 'attention', 'atencao', 'unavailable', 'indisponivel', 'stale']);
      const collectorProblems = new Set(['error', 'stale']);
      const pendingSyncs = sources.filter(source => sourceProblems.has(normalized(source.status))).length
        + processes.filter(process => collectorProblems.has(normalized(process.tjrsCollector?.status))).length;
      const unclassifiedDocuments = documents.filter(document => {
        if (!document?.id || document.deletedAt) return false;
        const status = normalized(document.metadata?.classificationStatus || document.classificationStatus || document.reviewStatus);
        return ['pending', 'pendente', 'unclassified', 'nao classificado'].includes(status)
          || !String(document.documentType || '').trim();
      }).length;

      const receipts = processes.flatMap(process => Array.isArray(process.receipts) ? process.receipts : []);
      const validReceipts = receipts.filter(receipt => normalized(receipt.status) !== 'estornado');
      const receiptsTotal = validReceipts.reduce((total, receipt) => total + Math.max(0, Number(receipt.amount) || 0), 0);

      return Object.freeze({
        tasksByResponsible,
        processesByStatus,
        averageTreatmentMinutes,
        treatmentSampleSize: treatmentDurations.length,
        pendingPublications: allPublications.filter(publication => !['treated', 'tratada', 'discarded', 'descartada'].includes(normalized(publication.treatmentStatus))).length,
        recentActivityCount: buildActivityInbox(state).length,
        latestCollectorCheck: sourceChecks[0] || '',
        pendingSyncs,
        unclassifiedDocuments,
        receiptsTotal,
        receiptsCount: validReceipts.length
      });
    },

    /**
     * Bloco "Audiências e sessões" do Foco do dia. Estado vazio honesto: nunca
     * esconde a ausência de pauta nem inventa compromisso.
     */
    renderHearings(hearings = { items: [], today: 0, week: 0 }) {
      const list = byId('dashboardHearingsList');
      if (!list) return;
      const todayEl = byId('dashboardHearingsToday');
      if (todayEl) todayEl.textContent = String(Number(hearings.today) || 0);
      const weekEl = byId('dashboardHearingsWeek');
      if (weekEl) weekEl.textContent = String(Number(hearings.week) || 0);
      if (!Array.isArray(hearings.items) || !hearings.items.length) {
        list.innerHTML = `<div class="v2-hearings-empty">
          <svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.0#atrium-icon-agenda"></use></svg>
          <p>Nenhuma audiência ou sessão designada.</p>
        </div>`;
        return;
      }
      const shortDate = value => {
        const iso = String(value || '').slice(0, 10);
        const [year, month, day] = iso.split('-');
        if (!year || !month || !day) return formatDate(value);
        return year === String(new Date().getFullYear()) ? `${day}/${month}` : `${day}/${month}/${year}`;
      };
      const visible = hearings.items.slice(0, 4);
      const remaining = Math.max(0, hearings.items.length - visible.length);
      list.innerHTML = visible.map(item => {
        const distance = daysUntil(item.date);
        const when = distance <= 0 ? 'Hoje' : distance === 1 ? 'Amanhã' : `Em ${distance} dias`;
        const endRaw = String(item.sessionEnd || '');
        const startDate = shortDate(item.date);
        const startTime = String(item.time || '').slice(0, 5);
        const isPeriod = Boolean(endRaw);
        const endDate = shortDate(endRaw.slice(0, 10));
        const primary = isPeriod && endDate !== startDate ? `${startDate} → ${endDate}` : startDate;
        const secondary = isPeriod ? `${startTime || '00:00'} a ${endRaw.slice(11, 16)}` : startTime;
        const context = [item.process || item.processNumber, item.clientResolved].filter(Boolean).join(' · ');
        const place = String(item.location || '').trim();
        const label = `${item.title || 'Compromisso'} — ${primary}${secondary ? `, ${secondary}` : ''}`;
        return `<button type="button" class="v2-hearing-item ${distance <= 0 ? 'is-today' : ''}" data-view-link="agenda" data-hearing-id="${escapeHtml(item.id || '')}" aria-label="${escapeHtml(label)}" title="Abrir na Agenda">
          <span class="v2-hearing-when"><b>${escapeHtml(primary)}</b>${secondary ? `<span>${escapeHtml(secondary)}</span>` : ''}</span>
          <span class="v2-hearing-copy"><strong>${escapeHtml(item.title || 'Compromisso')}</strong>${context ? `<small>${escapeHtml(context)}</small>` : ''}</span>
          <span class="v2-hearing-place">${escapeHtml(place)}</span>
          <span class="v2-hearings-badge ${distance <= 0 ? 'is-today' : ''}">${when}</span>
        </button>`;
      }).join('');
      if (remaining > 0) list.insertAdjacentHTML('beforeend', `<p class="v2-hearings-more">+${remaining} agendada${remaining === 1 ? '' : 's'} — ver na Agenda</p>`);
    },

    renderWidgets() {
      const values = this.widgetValues();
      const assignments = [
        ['widgetCompletedTasks', values.completed],
        ['widgetLateTasks', values.late],
        ['widgetPendingTasks', values.pending],
        ['widgetProcActive', values.processActive],
        ['widgetProcInactive', values.processInactive],
        ['widgetActiveLeads', values.activeLeads],
        ['widgetHonorariosPending', formatCurrency(values.feesPending)],
        ['widgetTimesheetHours', formatMinutes(values.minutes30d) || '0h 0m'],
        ['widgetDocsCount', values.documentCount]
      ];
      assignments.forEach(([id, value]) => {
        const element = byId(id);
        if (element) element.textContent = value;
      });

      const remindersEl = byId('dashboardRemindersList');
      if (!remindersEl) return values;
      if (!values.reminders.length) {
        remindersEl.innerHTML = '<div class="empty-column" style="padding:8px;"><small style="color:var(--muted);">Nenhum lembrete imediato.</small></div>';
        return values;
      }
      remindersEl.innerHTML = values.reminders.map(item => `
        <div class="dashboard-reminder-item" data-agenda-id="${escapeHtml(item.id)}" style="cursor:pointer;">
          <span class="dashboard-reminder-date">${escapeHtml(formatDate(item.date))}</span>
          <div><strong>${escapeHtml(item.title)}</strong><small style="display:block;color:var(--muted);">${escapeHtml(item.client || item.process || 'Compromisso')}</small></div>
        </div>
      `).join('');
      remindersEl.querySelectorAll('[data-agenda-id]').forEach(element => {
        element.addEventListener('click', () => {
          const event = (store.state.agenda || []).find(item => item.id === element.dataset.agendaId);
          if (event) onOpenAgenda?.(event);
        });
      });
      return values;
    }
  };

  return feature;
}

function activityTypeLabel(type) {
  return ({
    publication: 'Publicação',
    'overdue-task': 'Tarefa atrasada',
    'upcoming-task': 'Tarefa próxima',
    appointment: 'Compromisso',
    'document-review': 'Documento',
    reconciliation: 'Reconciliação',
    'judicial-event': 'Evento judicial',
    'sync-problem': 'Sincronização'
  })[type] || 'Atividade';
}
