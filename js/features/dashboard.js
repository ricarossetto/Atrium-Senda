import { Store } from '../core/store.js';
import { buildActivityInbox } from '../core/activity-inbox.js';
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
  onOpenActivity,
  onAcknowledgeActivity,
  showToast
} = {}) {
  let initialized = false;
  let dashboardTaskFilter = 'all';
  let dashboardTaskSort = 'date-asc';
  let activityFilter = 'all';
  let currentActivities = [];
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
      const metrics = this.renderMetrics();
      const activities = this.renderActivityInbox();
      this.renderTasks();
      const widgets = this.renderWidgets();
      const insights = this.actionableValues();
      renderDashboardV2Summary({ documentRef, metrics, widgets, insights, formatDate, formatCurrency, escapeHtml });
      return { metrics, widgets, activities, insights };
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

    actionableValues() {
      const state = store.state || {};
      const tasks = state.tasks || [];
      const processes = state.processes || [];
      const publications = state.intimations || [];
      const sources = state.sources || [];
      const documents = state.documents || [];
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

      const treatmentDurations = publications.map(publication => {
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
        pendingPublications: publications.filter(publication => !['treated', 'tratada', 'discarded', 'descartada'].includes(normalized(publication.treatmentStatus))).length,
        recentActivityCount: buildActivityInbox(state).length,
        latestCollectorCheck: sourceChecks[0] || '',
        pendingSyncs,
        unclassifiedDocuments,
        receiptsTotal,
        receiptsCount: validReceipts.length
      });
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
