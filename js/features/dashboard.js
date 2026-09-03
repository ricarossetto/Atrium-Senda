import { Store } from '../core/store.js';
import { renderDashboardV2Summary } from '../views/ui-v2/dashboard.js';
import { iconSvg } from '../views/ui-v2/icons.js';

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
  onCompleteTask,
  onRenderAll,
  onOpenAgenda,
  showToast
} = {}) {
  let initialized = false;
  let dashboardTaskFilter = 'all';
  let dashboardTaskSort = 'date-asc';
  const byId = id => documentRef?.getElementById(id);
  const normalizedProcessNumber = value => String(value || '').replace(/\D/g, '');
  const normalizedName = value => String(value || '').trim().toLocaleLowerCase('pt-BR');

  const taskContext = (task, processes = store.state.processes || [], intimations = store.state.intimations || []) => {
    const intimation = intimations.find(item => [task.intimationId, task.sourceIntimationId]
      .filter(Boolean)
      .includes(item.id));
    const processId = task.processId || intimation?.processId || '';
    const processNumber = task.process || intimation?.process || '';
    const normalizedNumber = normalizedProcessNumber(processNumber);
    let process = processId
      ? processes.find(item => item.id === processId || item.externalId === processId)
      : null;

    if (!process && normalizedNumber) {
      process = processes.find(item => normalizedProcessNumber(item.number) === normalizedNumber) || null;
    }

    if (!process && task.client) {
      const clientMatches = processes.filter(item => normalizedName(item.client) === normalizedName(task.client));
      if (clientMatches.length === 1) process = clientMatches[0];
    }

    return {
      process,
      clientName: task.client || intimation?.client || process?.client || '',
      processNumber: processNumber || process?.number || '',
      actionType: task.actionType || process?.actionType || process?.subject || intimation?.actionType || ''
    };
  };

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
      return true;
    },

    render() {
      renderOfficeIdentity?.();
      const metrics = this.renderMetrics();
      this.renderTasks();
      const widgets = this.renderWidgets();
      renderDashboardV2Summary({ documentRef, metrics, widgets, formatDate });
      return { metrics, widgets };
    },

    renderMetrics() {
      const untreatedIntimations = getUntreatedCount?.() || 0;
      const deadlines = (store.state.tasks || []).filter(task => !isTerminalStatus(task.status) && daysUntil(task.deadline) >= 0 && daysUntil(task.deadline) <= 7).length;
      const activeProcesses = (store.state.processes || []).filter(process => process.monitoring !== 'inactive').length;
      const sources = store.state.sources || [];
      const activeSources = sources.filter(source => source.status === 'ok').length;
      const mInbox = byId('metricInbox');
      const mDead = byId('metricDeadlines');
      const mTasks = byId('metricTasks');
      const mSources = byId('metricSources');
      const inBadge = byId('inboxBadge');
      const notifDot = byId('notificationDot');
      if (mInbox) mInbox.textContent = untreatedIntimations;
      if (mDead) mDead.textContent = deadlines;
      if (mTasks) mTasks.textContent = activeProcesses;
      if (mSources) mSources.textContent = `${activeSources}/${sources.length}`;
      if (inBadge) {
        inBadge.textContent = untreatedIntimations;
        inBadge.style.display = untreatedIntimations > 0 ? 'inline-block' : 'none';
      }
      if (notifDot) notifDot.style.display = untreatedIntimations ? '' : 'none';
      renderPublicationsMetrics?.();
      return { untreatedIntimations, deadlines, activeProcesses, activeSources, sourceCount: sources.length };
    },

    visibleTasks() {
      const tasks = store.state.tasks || [];
      const processes = store.state.processes || [];
      const filtered = tasks.filter(task => {
        if (isTerminalStatus(task.status)) return false;
        if (dashboardTaskFilter === 'all') return true;
        const lower = `${String(task.title || '').toLowerCase()} ${String(task.type || '').toLowerCase()}`;
        if (dashboardTaskFilter === 'prazo') return lower.includes('prazo') || lower.includes('decisão') || lower.includes('recurso');
        if (dashboardTaskFilter === 'audiencia') return lower.includes('audiência') || lower.includes('audiencia') || lower.includes('julgamento');
        if (dashboardTaskFilter === 'tarefa') return !lower.includes('audiência') && !lower.includes('prazo');
        return true;
      });

      filtered.sort((a, b) => {
        const contextA = taskContext(a, processes);
        const contextB = taskContext(b, processes);
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
      const filtered = this.visibleTasks();
      const countEl = byId('dashboardTaskCount');
      if (countEl) countEl.textContent = `${filtered.length} tarefas`;

      if (!filtered.length) {
        listEl.innerHTML = `<div class="empty-column" style="padding:24px;text-align:center;"><p>${iconSvg('check')}Nenhuma tarefa pendente neste filtro.</p></div>`;
        return;
      }

      listEl.innerHTML = filtered.map(task => {
        const { clientName, processNumber, actionType } = taskContext(task, processes);
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

        const days = daysUntil(task.deadline);
        const dateFormatted = task.deadline ? formatDate(task.deadline) : 'Sem data';
        const dateClass = days < 0 ? 'style="color:var(--danger);font-weight:700;"' : days <= 2 ? 'style="color:var(--warning);font-weight:700;"' : '';
        const difficultyText = points >= 50 ? 'Alta Complexidade' : points >= 20 ? 'Média' : points > 0 ? 'Básica' : '';

        return `
          <div class="dashboard-task-item" data-dashboard-task-id="${escapeHtml(task.id)}">
            <input type="checkbox" class="dashboard-task-check" data-complete-task-id="${escapeHtml(task.id)}" title="Concluir tarefa">
            <div class="dashboard-task-body">
              <div class="dashboard-task-title">${escapeHtml(task.title)}</div>
              <div class="dashboard-task-process">
                ${clientName ? `<strong>${iconSvg('contacts')} ${escapeHtml(clientName)}</strong>` : '<span class="dashboard-task-context-empty">Cliente não vinculado</span>'}
                ${processNumber ? `<span>${iconSvg('processes')} <b>${escapeHtml(processNumber)}</b></span>` : '<span class="dashboard-task-context-empty">Processo não vinculado</span>'}
                ${actionType ? `<span class="dashboard-task-action-type">${iconSvg('court')} <b>${escapeHtml(actionType)}</b></span>` : '<span class="dashboard-task-context-empty">Tipo da ação não informado</span>'}
              </div>
              <div class="dashboard-task-tags">
                <span class="task-tag ${typeBadge}">${typeLabel}</span>
                ${task.responsible ? `<span class="task-tag user">${iconSvg('contacts')} ${escapeHtml(task.responsible)}</span>` : ''}
                ${points ? `<span class="task-tag points" style="background:rgba(212,175,55,0.15);color:var(--gold);font-weight:600;">${iconSvg('tasks')} ${points} pts${difficultyText ? ` (${difficultyText})` : ''}</span>` : ''}
                ${task.priority === 'urgente' ? '<span class="task-tag" style="background:rgba(239,68,68,0.15);color:var(--danger);font-weight:700;">URGENTE</span>' : ''}
              </div>
            </div>
            <div class="dashboard-task-date" ${dateClass}>${dateFormatted}</div>
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('[data-dashboard-task-id]').forEach(item => {
        item.addEventListener('click', event => {
          if (event.target.closest('[data-complete-task-id]')) return;
          const task = (store.state.tasks || []).find(candidate => candidate.id === item.dataset.dashboardTaskId);
          if (task) onOpenTask?.(task);
        });
      });
      listEl.querySelectorAll('[data-complete-task-id]').forEach(checkbox => {
        checkbox.addEventListener('change', async event => {
          event.stopPropagation();
          const task = await onCompleteTask?.(checkbox.dataset.completeTaskId);
          if (task) {
            onRenderAll?.();
            showToast?.('Tarefa concluída com sucesso!', 'success');
          }
        });
      });
    },

    widgetValues() {
      const tasks = store.state.tasks || [];
      const processes = store.state.processes || [];
      const leads = store.state.leads || [];
      const completed = tasks.filter(task => isTerminalStatus(task.status)).length;
      const late = tasks.filter(task => !isTerminalStatus(task.status) && daysUntil(task.deadline) < 0).length;
      const pending = tasks.filter(task => !isTerminalStatus(task.status) && daysUntil(task.deadline) >= 0).length;
      const processActive = processes.filter(process => !process.archived).length;
      const activeLeads = leads.filter(lead => lead.status !== 'fechado' && lead.status !== 'declinado').length;

      let feesPending = 0;
      processes.forEach(process => {
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
        reminders: (store.state.agenda || []).slice(0, 4)
      };
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
          <span class="dashboard-reminder-date">${formatDate(item.date)}</span>
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
