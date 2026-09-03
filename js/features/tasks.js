import { Store, isoDate, uid } from '../core/store.js';
import { createTasksV2Presenter } from '../views/ui-v2/tasks-presenter.js';
import { iconSvg } from '../views/ui-v2/icons.js';

export const TASK_COLUMNS = Object.freeze([
  { id: 'triagem', title: 'Entrada & triagem', color: '#c9a84c' },
  { id: 'prioridade', title: 'Prioridade', color: '#e5a84b' },
  { id: 'andamento', title: 'Em andamento', color: '#6f9fd8' },
  { id: 'aguardando', title: 'Aguardando', color: '#a887c7' },
  { id: 'revisao', title: 'Revisão', color: '#d68a67' },
  { id: 'concluida', title: 'Concluída', color: '#40b879' }
]);

const NEUTRAL_TASK_SOURCE_LABELS = new Map([
  ['interna', 'INTERNA'],
  ['manual', 'MANUAL'],
  ['demonstração', 'DEMONSTRAÇÃO'],
  ['demonstracao', 'DEMONSTRAÇÃO'],
  ['djen', 'DJEN'],
  ['datajud', 'DATAJUD'],
  ['publicação', 'PUBLICAÇÃO'],
  ['publicacao', 'PUBLICAÇÃO'],
  ['sistema jurídico', 'SISTEMA JURÍDICO']
]);

const taskSourceLabel = source => {
  const normalized = String(source || 'Interna').trim().toLocaleLowerCase('pt-BR');
  return NEUTRAL_TASK_SOURCE_LABELS.get(normalized) || 'SISTEMA JURÍDICO';
};

export function createTasksFeature({
  store = Store,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  navigatorRef = globalThis.navigator,
  escapeHtml,
  formatDate,
  formatMinutes,
  totalTimeMinutes,
  daysUntil,
  decodeHtmlEntities,
  initials,
  isTerminalStatus,
  getCurrentUserName,
  openModal,
  closeModal,
  showToast,
  onRenderAll,
  onAnalyzeWithAi,
  now = () => Date.now()
} = {}) {
  let initialized = false;
  let activeTimeSheetTaskId = null;
  let timeSheetStartedAt = null;
  let timeSheetInterval = null;
  let tasksPresenter;
  let kanbanColumnsDraft = [];

  const byId = id => documentRef?.getElementById(id);
  const isV2 = () => documentRef?.documentElement?.dataset?.ui === 'v2';
  const getColumns = () => {
    const saved = store.state.settings?.kanbanColumns;
    if (!Array.isArray(saved) || saved.length < 2) return TASK_COLUMNS.map(column => ({ ...column }));
    const normalized = saved.filter(column => column && column.id && String(column.title || '').trim()).map((column, index) => ({
      id: String(column.id),
      title: String(column.title).trim().slice(0, 48),
      color: String(column.color || TASK_COLUMNS[index % TASK_COLUMNS.length].color)
    }));
    return normalized.some(column => column.id === 'triagem') && normalized.some(column => column.id === 'concluida')
      ? normalized
      : TASK_COLUMNS.map(column => ({ ...column }));
  };
  const getPresenter = () => {
    tasksPresenter ||= createTasksV2Presenter({
      documentRef,
      escapeHtml,
      formatDate,
      formatMinutes,
      totalTimeMinutes,
      daysUntil,
      initials
    });
    return tasksPresenter;
  };

  const feature = {
    get initialized() { return initialized; },
    get activeTimeSheetTaskId() { return activeTimeSheetTaskId; },
    get timeSheetStartedAt() { return timeSheetStartedAt; },
    get timeSheetInterval() { return timeSheetInterval; },

    init() {
      if (initialized) return false;
      initialized = true;
      byId('newTaskButton')?.addEventListener('click', () => this.openTaskModal());
      byId('editKanbanColumnsButton')?.addEventListener('click', () => this.openColumnsEditor());
      byId('kanbanColumnsClose')?.addEventListener('click', () => this.closeColumnsEditor());
      byId('kanbanColumnsCancel')?.addEventListener('click', () => this.closeColumnsEditor());
      byId('kanbanColumnAdd')?.addEventListener('click', () => {
        const index = kanbanColumnsDraft.length;
        kanbanColumnsDraft.push({ id: uid('kanban'), title: `Nova etapa ${index + 1}`, color: TASK_COLUMNS[index % TASK_COLUMNS.length].color });
        this.renderColumnsEditor();
      });
      byId('kanbanColumnsList')?.addEventListener('click', event => {
        const removeButton = event.target.closest('[data-remove-kanban-column]');
        if (!removeButton || removeButton.disabled) return;
        kanbanColumnsDraft = kanbanColumnsDraft.filter(column => column.id !== removeButton.dataset.removeKanbanColumn);
        this.renderColumnsEditor();
      });
      byId('kanbanColumnsList')?.addEventListener('input', event => {
        const input = event.target.closest('[data-kanban-column-title]');
        const column = input && kanbanColumnsDraft.find(item => item.id === input.dataset.kanbanColumnTitle);
        if (column) column.title = input.value;
      });
      byId('kanbanColumnsForm')?.addEventListener('submit', event => this.saveColumns(event));
      return true;
    },

    openColumnsEditor() {
      kanbanColumnsDraft = getColumns().map(column => ({ ...column }));
      this.renderColumnsEditor();
      byId('kanbanColumnsBackdrop')?.classList.remove('hidden');
      documentRef.body?.classList.add('kanban-columns-open');
      queueMicrotask(() => byId('kanbanColumnsList')?.querySelector('input')?.focus());
    },

    closeColumnsEditor() {
      byId('kanbanColumnsBackdrop')?.classList.add('hidden');
      documentRef.body?.classList.remove('kanban-columns-open');
      byId('editKanbanColumnsButton')?.focus();
    },

    renderColumnsEditor() {
      const list = byId('kanbanColumnsList');
      if (!list) return;
      list.innerHTML = kanbanColumnsDraft.map((column, index) => {
        const taskCount = store.state.tasks.filter(task => task.status === column.id).length;
        const structural = column.id === 'triagem' || column.id === 'concluida';
        const removable = !structural && taskCount === 0 && kanbanColumnsDraft.length > 2;
        const reason = structural ? 'Etapa estrutural' : taskCount ? `${taskCount} tarefa${taskCount === 1 ? '' : 's'} nesta coluna` : 'Remover coluna';
        return `<div class="kanban-column-editor-row" data-column-editor-id="${escapeHtml(column.id)}"><span class="kanban-column-editor-index">${index + 1}</span><i style="--column-editor-color:${escapeHtml(column.color)}"></i><label><span>Nome da coluna</span><input data-kanban-column-title="${escapeHtml(column.id)}" maxlength="48" required value="${escapeHtml(column.title)}"></label><span class="kanban-column-editor-count">${taskCount} tarefa${taskCount === 1 ? '' : 's'}</span><button class="icon-button" type="button" data-remove-kanban-column="${escapeHtml(column.id)}" aria-label="${escapeHtml(reason)}" title="${escapeHtml(reason)}" ${removable ? '' : 'disabled'}>${iconSvg('close')}</button></div>`;
      }).join('');
    },

    async saveColumns(event) {
      event.preventDefault();
      const columns = kanbanColumnsDraft.map(column => ({ ...column, title: String(column.title || '').trim() }));
      const normalizedTitles = columns.map(column => column.title.toLocaleLowerCase('pt-BR'));
      if (columns.some(column => !column.title) || new Set(normalizedTitles).size !== normalizedTitles.length) {
        showToast?.('Use nomes preenchidos e diferentes para cada coluna.', 'warning');
        return false;
      }
      const previousState = JSON.parse(JSON.stringify(store.state));
      store.state.settings ||= {};
      store.state.settings.kanbanColumns = columns;
      store.audit('Colunas do Kanban atualizadas', `${columns.length} etapas configuradas.`);
      if (!await store.flush()) {
        store.state = previousState;
        showToast?.('Não foi possível salvar as colunas do Kanban.', 'error');
        return false;
      }
      this.closeColumnsEditor();
      this.renderKanban();
      showToast?.('Colunas do Kanban atualizadas.', 'success');
      return true;
    },

    renderKanban() {
      const board = byId('kanbanBoard');
      if (!board) return;
      if (isV2()) {
        getPresenter().render({
          board,
          tasks: store.state.tasks,
          columns: getColumns(),
          activeTaskId: activeTimeSheetTaskId,
          elapsedLabel: this.formatElapsedTimer(),
          sourceLabel: taskSourceLabel
        });
      } else board.innerHTML = getColumns().map(column => {
        const tasks = store.state.tasks.filter(task => task.status === column.id);
        return `<section class="kanban-column" data-column="${column.id}"><header class="column-header"><div class="column-title"><i class="column-dot" style="background:${column.color}"></i>${escapeHtml(column.title)}<span class="column-count">${tasks.length}</span></div><span>···</span></header><div class="column-cards">${tasks.length ? tasks.map(task => this.renderCard(task)).join('') : '<div class="empty-column">Arraste tarefas para cá</div>'}</div></section>`;
      }).join('');
      board.querySelectorAll('.task-card').forEach(card => {
        card.addEventListener('dragstart', () => { card.classList.add('dragging'); card.dataset.dragging = 'true'; });
        card.addEventListener('dragend', () => { card.classList.remove('dragging'); delete card.dataset.dragging; });
        card.addEventListener('click', event => {
          if (event.target.closest('.timesheet-btn, [data-task-move]')) return;
          const task = store.state.tasks.find(item => item.id === card.dataset.taskId);
          if (task) this.openTaskModal(task);
        });
      });
      board.querySelectorAll('[data-task-open]').forEach(button => {
        button.addEventListener('click', event => {
          event.stopPropagation();
          const task = store.state.tasks.find(item => item.id === button.dataset.taskOpen);
          if (task) this.openTaskModal(task);
        });
      });
      board.querySelectorAll('[data-task-move]').forEach(select => {
        select.addEventListener('click', event => event.stopPropagation());
        select.addEventListener('change', async event => {
          event.stopPropagation();
          const task = store.state.tasks.find(item => item.id === select.dataset.taskMove);
          const previous = task?.status;
          if (!task || previous === select.value) return;
          select.disabled = true;
          const moved = await this.moveTask(task.id, select.value);
          if (!moved && select.isConnected) {
            select.disabled = false;
            select.value = previous;
          }
        });
      });
      board.querySelectorAll('[data-timesheet-start]').forEach(button => {
        button.addEventListener('click', event => {
          event.stopPropagation();
          this.startTimeSheet(button.dataset.timesheetStart);
        });
      });
      board.querySelectorAll('[data-timesheet-stop]').forEach(button => {
        button.addEventListener('click', event => {
          event.stopPropagation();
          this.stopTimeSheet();
        });
      });
      board.querySelectorAll('.kanban-column').forEach(column => {
        column.addEventListener('dragover', event => { event.preventDefault(); column.classList.add('drag-over'); });
        column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
        column.addEventListener('drop', event => {
          event.preventDefault();
          column.classList.remove('drag-over');
          const dragged = board.querySelector('.task-card[data-dragging="true"]');
          if (dragged) void this.moveTask(dragged.dataset.taskId, column.dataset.column);
        });
      });
    },

    renderCard(task) {
      const overdue = daysUntil(task.deadline) < 0 && task.status !== 'concluida';
      const timeMins = totalTimeMinutes(task.timeLogs);
      const timeBadge = timeMins > 0 ? `<span class="task-timelog" title="Tempo total registrado no TimeSheet">${iconSvg('deadline')} ${formatMinutes(timeMins)}</span>` : '';
      const isTimerRunning = activeTimeSheetTaskId === task.id;
      const timerButton = isTimerRunning
        ? `<button type="button" class="timesheet-btn active timesheet-live" data-timesheet-stop="${escapeHtml(task.id)}" title="Clique para pausar e salvar apontamento no TimeSheet">${iconSvg('check')} ${this.formatElapsedTimer()}</button>`
        : `<button type="button" class="timesheet-btn" data-timesheet-start="${escapeHtml(task.id)}" title="Iniciar cronômetro de TimeSheet">${iconSvg('deadline')} Iniciar</button>`;

      const points = Number(task.points) || (task.priority === 'urgente' ? 25 : 10);
      return `<article class="task-card ${isTimerRunning ? 'timer-active' : ''}" draggable="true" data-task-id="${escapeHtml(task.id)}">
        <div class="task-top">
          <span class="task-source">${escapeHtml(taskSourceLabel(task.source))}</span>
          <span class="task-badges">
            <b class="task-points" title="Pontuação da tarefa">${iconSvg('tasks')} ${points} pts</b>
            ${timeBadge}
            ${task.priority === 'urgente' ? '<span class="task-priority" title="Urgente">!</span>' : ''}
          </span>
        </div>
        <h4>${escapeHtml(task.title)}</h4>
        <p>${escapeHtml(task.description || 'Sem descrição')}</p>
        <div class="task-tags">
          ${task.client ? `<span>${escapeHtml(task.client)}</span>` : ''}
          ${task.process ? `<span>${escapeHtml(task.process)}</span>` : ''}
        </div>
        ${task.fatalDeadline ? `<div class="fatal-date">Prazo fatal: ${formatDate(task.fatalDeadline)}</div>` : ''}
        <footer class="task-footer">
          <div class="task-footer-left">
            <span class="task-date ${overdue ? 'overdue' : ''}">${overdue ? 'Atrasada · ' : ''}${formatDate(task.deadline)}</span>
            ${timerButton}
          </div>
          <span class="task-avatar">${escapeHtml(initials(task.responsible || 'Advogado(a)'))}</span>
        </footer>
      </article>`;
    },

    startTimeSheet(taskId) {
      if (activeTimeSheetTaskId === taskId) return;
      this.stopTimeSheet();
      activeTimeSheetTaskId = taskId;
      timeSheetStartedAt = now();
      windowRef.clearInterval(timeSheetInterval);
      timeSheetInterval = windowRef.setInterval(() => {
        const liveButton = documentRef.querySelector(`.timesheet-live[data-timesheet-stop="${activeTimeSheetTaskId}"]`);
        if (liveButton) liveButton.innerHTML = `${iconSvg('check')} ${this.formatElapsedTimer()}`;
      }, 1000);
      this.renderKanban();
      showToast?.('Cronômetro TimeSheet iniciado na tarefa!', 'success');
    },

    stopTimeSheet() {
      if (!activeTimeSheetTaskId) return;
      const elapsedMs = now() - timeSheetStartedAt;
      const minutes = Math.max(1, Math.round(elapsedMs / 60000));
      const task = store.state.tasks.find(item => item.id === activeTimeSheetTaskId);
      if (task) {
        if (!Array.isArray(task.timeLogs)) task.timeLogs = [];
        task.timeLogs.push({
          id: uid('tlog'),
          minutes,
          date: isoDate(),
          author: getCurrentUserName?.() || 'Advogado',
          description: 'Apontamento via Cronômetro TimeSheet'
        });
        task.timeSpentMinutes = (task.timeSpentMinutes || 0) + minutes;
        store.audit('TimeSheet registrado', `${task.title}: +${minutes} min`);
        store.save();
      }
      windowRef.clearInterval(timeSheetInterval);
      activeTimeSheetTaskId = null;
      timeSheetStartedAt = null;
      timeSheetInterval = null;
      this.renderKanban();
      showToast?.(`TimeSheet: ${minutes} min adicionados à tarefa.`, 'success');
    },

    formatElapsedTimer() {
      if (!timeSheetStartedAt) return '00:00:00';
      const seconds = Math.floor((now() - timeSheetStartedAt) / 1000);
      const hours = String(Math.floor(seconds / 3600)).padStart(2, '0');
      const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
      const remainingSeconds = String(seconds % 60).padStart(2, '0');
      return `${hours}:${minutes}:${remainingSeconds}`;
    },

    async moveTask(taskId, status) {
      const task = store.state.tasks.find(item => item.id === taskId);
      if (!task || task.status === status) return null;
      const previous = task.status;
      const previousCompletedAt = task.completedAt;
      task.status = status;
      if (status === 'concluida') task.completedAt = new Date().toISOString();
      else delete task.completedAt;
      task.updatedAt = new Date().toISOString();
      const audit = store.audit('Tarefa movimentada', `${task.title}: ${previous} → ${status}`);
      if (!await store.flush()) {
        task.status = previous;
        if (previousCompletedAt) task.completedAt = previousCompletedAt; else delete task.completedAt;
        store.state.audit = store.state.audit.filter(entry => entry.id !== audit?.id);
        onRenderAll?.();
        showToast?.('Não foi possível salvar a movimentação. Tente novamente.', 'error');
        if (isV2()) getPresenter().announce('A movimentação não foi salva. A tarefa voltou para a etapa anterior.');
        return null;
      }
      onRenderAll?.();
      showToast?.('Tarefa movimentada com sucesso.', 'success');
      if (isV2()) getPresenter().announce(`${task.title} movida para ${getColumns().find(column => column.id === status)?.title || status}.`);
      return task;
    },

    async completeTask(taskId) {
      const task = store.state.tasks.find(item => item.id === taskId);
      if (!task) return null;
      const previousStatus = task.status;
      const previousCompletedAt = task.completedAt;
      task.status = 'concluida';
      task.completedAt = new Date().toISOString();
      const audit = store.audit('Tarefa concluída', task.title);
      if (!await store.flush()) {
        task.status = previousStatus;
        if (previousCompletedAt) task.completedAt = previousCompletedAt; else delete task.completedAt;
        store.state.audit = store.state.audit.filter(entry => entry.id !== audit?.id);
        showToast?.('Não foi possível concluir a tarefa. Tente novamente.', 'error');
        return null;
      }
      return task;
    },

    async reopenTask(taskId) {
      const task = store.state.tasks.find(item => item.id === taskId);
      if (!task) return null;
      const previousStatus = task.status;
      const previousCompletedAt = task.completedAt;
      task.status = 'triagem';
      delete task.completedAt;
      const audit = store.audit('Tarefa reaberta', task.title);
      if (!await store.flush()) {
        task.status = previousStatus;
        if (previousCompletedAt) task.completedAt = previousCompletedAt;
        store.state.audit = store.state.audit.filter(entry => entry.id !== audit?.id);
        showToast?.('Não foi possível reabrir a tarefa. Tente novamente.', 'error');
        return null;
      }
      return task;
    },

    openTaskModal(defaults = {}) {
      const definitions = store.state.configuration?.taskDefinitions || [];
      const totalTime = totalTimeMinutes(defaults.timeLogs);
      const timeNote = totalTime > 0 ? `Tempo total acumulado nesta tarefa: ${formatMinutes(totalTime)}.` : '';
      const cleanDescription = decodeHtmlEntities(defaults.description || defaults.text || '');
      const cleanTitle = decodeHtmlEntities(defaults.title || '');
      const hasPublicationContext = Boolean(defaults.intimationId || defaults.sourceIntimationId || /djen|datajud|publica/i.test(String(defaults.source || '')));

      let completionBarHtml = '';
      if (defaults.id) {
        const isDone = isTerminalStatus(defaults.status);
        completionBarHtml = isV2() ? `
        <div class="task-completion-bar">
          <div><span>Situação da tarefa</span><strong class="task-completion-state ${isDone ? 'is-complete' : 'is-active'}">${isDone ? 'Concluída' : 'Em andamento'}</strong></div>
          ${!isDone ? `<button type="button" class="button gold" id="btnDirectCompleteTask">${iconSvg('check')}Marcar como concluída</button>` : `<button type="button" class="button ghost" id="btnDirectReopenTask">${iconSvg('reopen')}Reabrir tarefa</button>`}
        </div>` : `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding:10px 14px; background:var(--panel-soft); border-radius:10px; border:1px solid var(--line);">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:12px; color:var(--muted); font-weight:600;">Situação da Tarefa:</span>
            <span class="status-chip ${isDone ? 'connected' : 'warning'}">${isDone ? 'Concluída' : 'Em andamento'}</span>
          </div>
          ${!isDone ? `<button type="button" class="button gold" id="btnDirectCompleteTask" style="padding:6px 14px; font-size:12px; font-weight:600;">${iconSvg('check')}Marcar como Concluída</button>` : `<button type="button" class="button ghost" id="btnDirectReopenTask" style="padding:6px 14px; font-size:12px;">${iconSvg('reopen')}Reabrir Tarefa</button>`}
        </div>`;
      }

      let topHtml = completionBarHtml;
      if (cleanDescription && (!isV2() || hasPublicationContext)) {
        topHtml += `
          <div class="task-intimation-card ${isV2() ? 'is-v2' : ''}">
          <div class="task-intimation-header">
            <div class="task-intimation-title">
              ${iconSvg('publications')}
              <span>Publicação / Texto da Intimação</span>
            </div>
            <div class="task-intimation-actions">
              <button type="button" class="task-btn-action" id="btnCopyTaskIntimation">Copiar texto</button>
              <button type="button" class="task-btn-action" id="btnAiAnalyzeTask">${iconSvg('assistant')}Analisar com IA</button>
            </div>
          </div>
          <div class="task-intimation-body" id="taskIntimationBody">${escapeHtml(cleanDescription)}</div>
        </div>`;
      }

      openModal?.('task', defaults.id ? 'Editar tarefa' : 'Nova tarefa', 'Fluxo interno', [
        { name: 'title', label: 'Título da tarefa', required: true, full: true, placeholder: 'Ex: Manifestação sobre despacho do DJEN' },
        { name: 'taskDefinition', label: 'Definição de modelo', type: 'select', options: [{ value: '', label: 'Selecione um modelo de tarefa' }, ...definitions.map(item => ({ value: item.name, label: `${item.name} (${item.points} pts)` }))] },
        { name: 'process', label: 'Número do processo', placeholder: 'Ex: 5002086-73.2022.4.04.7133' },
        { name: 'client', label: 'Cliente', placeholder: 'Ex: Roberto Roque Junges' },
        { name: 'fatalDeadline', label: 'Prazo fatal', type: 'date', note: 'Prazo peremptório (sujeito à conferência humana).' },
        { name: 'deadline', label: 'Prazo interno', type: 'date' },
        { name: 'date', label: 'Data da atividade', type: 'date' },
        { name: 'time', label: 'Horário', type: 'time' },
        { name: 'responsible', label: 'Responsável principal', value: defaults.responsible || getCurrentUserName?.() || 'Advogado(a)' },
        { name: 'responsibles', label: 'Outros responsáveis', placeholder: 'Separe os nomes por vírgula' },
        { name: 'status', label: 'Coluna (Quadro Kanban)', type: 'select', options: getColumns().map(column => ({ value: column.id, label: column.title })) },
        { name: 'priority', label: 'Prioridade', type: 'select', options: [{value:'normal',label:'Normal'},{value:'importante',label:'Importante'},{value:'urgente',label:'Urgente'}] },
        { name: 'points', label: 'Pontuação', type: 'number', value: defaults.points || 0 },
        { name: 'addMinutes', label: 'Apontar tempo (minutos)', type: 'number', placeholder: 'Ex: 45', note: timeNote },
        { name: 'timeDescription', label: 'Atividade no apontamento', placeholder: 'Ex: Elaboração de minuta recursal' },
        { name: 'description', label: 'Comentário interno / orientações', type: 'textarea', full: true, note: 'Nunca registre senha, QR code ou segredo do certificado neste campo.' },
        { name: 'actionType', label: 'Tipo de ação' },
        { name: 'protocol', label: 'Protocolo / Local' }
      ], {
        status: 'triagem',
        priority: 'normal',
        source: 'Interna',
        ...defaults,
        title: cleanTitle,
        description: cleanDescription,
        taskDefinition: defaults.taskDefinition || (definitions.some(item => item.name === cleanTitle) ? cleanTitle : ''),
        responsibles: Array.isArray(defaults.responsibles) ? defaults.responsibles.join(', ') : (defaults.responsibles || '')
      }, topHtml);

      byId('btnDirectCompleteTask')?.addEventListener('click', async () => {
        const task = await this.completeTask(defaults.id);
        if (!task) return;
        closeModal?.();
        onRenderAll?.();
        showToast?.('Tarefa concluída e removida do painel ativo!', 'success');
      });

      byId('btnDirectReopenTask')?.addEventListener('click', async () => {
        const task = await this.reopenTask(defaults.id);
        if (!task) return;
        closeModal?.();
        onRenderAll?.();
        showToast?.('Tarefa reaberta no fluxo!', 'success');
      });

      const selector = byId('field-taskDefinition');
      selector?.addEventListener('change', () => {
        const definition = definitions.find(item => item.name === selector.value);
        if (!definition) return;
        if (byId('field-title')) byId('field-title').value = definition.name;
        if (byId('field-points')) byId('field-points').value = definition.points;
      });

      const descriptionField = byId('field-description');
      const resizeDescriptionField = () => {
        if (!descriptionField) return;
        descriptionField.style.height = 'auto';
        descriptionField.style.height = `${Math.max(148, descriptionField.scrollHeight + 2)}px`;
      };
      resizeDescriptionField();
      descriptionField?.addEventListener('input', resizeDescriptionField);

      byId('btnCopyTaskIntimation')?.addEventListener('click', async () => {
        try {
          await navigatorRef.clipboard.writeText(cleanDescription);
          showToast?.('Texto da intimação copiado com sucesso!', 'success');
        } catch {
          showToast?.('Não foi possível copiar o texto.', 'error');
        }
      });

      byId('btnAiAnalyzeTask')?.addEventListener('click', () => {
        closeModal?.();
        onAnalyzeWithAi?.(cleanDescription);
      });
    },

    buildTask(data, defaults = {}) {
      const taskData = { ...data };
      const history = Array.isArray(defaults.history) ? [...defaults.history] : [];
      const currentActor = getCurrentUserName?.() || 'Advogado(a)';
      history.push({ at: new Date().toISOString(), action: defaults.id ? 'Tarefa atualizada' : 'Tarefa atribuída', actor: currentActor });
      const timeLogs = Array.isArray(defaults.timeLogs) ? [...defaults.timeLogs] : [];
      const addMinutes = Number(taskData.addMinutes);
      if (addMinutes > 0) {
        timeLogs.push({ id: uid('time'), date: isoDate(), minutes: addMinutes, description: taskData.timeDescription || 'Trabalho realizado', actor: currentActor });
        history.push({ at: new Date().toISOString(), action: `Apontamento de tempo: ${formatMinutes(addMinutes)}`, actor: currentActor });
      }
      delete taskData.addMinutes;
      delete taskData.timeDescription;
      const responsibleList = [taskData.responsible, ...String(taskData.responsibles || '').split(/[,;]/)].map(item => item.trim()).filter(Boolean);
      return {
        id: defaults.id || defaults._transactionTaskId || uid('task'),
        createdAt: defaults.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: defaults.source || 'Interna',
        intimationId: defaults.intimationId || null,
        sourceIntimationId: defaults.intimationId || defaults.sourceIntimationId || null,
        ...taskData,
        points: Number(taskData.points) || 0,
        completedAt: taskData.status === 'concluida' ? (defaults.completedAt || new Date().toISOString()) : undefined,
        responsibles: [...new Set(responsibleList)],
        history,
        timeLogs
      };
    },

    saveTask(data, defaults = {}) {
      const addMinutes = Number(data.addMinutes);
      const record = this.buildTask(data, defaults);
      store.upsert('tasks', record);
      store.audit(defaults.id ? 'Tarefa atualizada' : 'Tarefa atribuída', `${record.title}${record.process ? ` · ${record.process}` : ''}${record.points ? ` · ${record.points} pontos` : ''}${addMinutes > 0 ? ` · ${formatMinutes(addMinutes)} apontados` : ''}`);
      return record;
    },

    upsertExternalTask(record, externalKey = 'id') {
      const identity = record?.externalId || record?.[externalKey] || record?.id;
      const existing = store.state.tasks.find(item => (item.externalId || item[externalKey] || item.id) === identity);
      if (!existing) return store.upsert('tasks', record, externalKey);
      const protectedFields = new Set(['id', 'status', 'deadline', 'fatalDeadline', 'priority', 'responsible', 'responsibles', 'completedAt', 'timeLogs', 'timeSpentMinutes', 'history', 'notes']);
      const merged = { ...existing };
      for (const [field, value] of Object.entries(record || {})) {
        if (protectedFields.has(field)) continue;
        if (value !== '' && value !== null && value !== undefined) merged[field] = value;
      }
      store.upsert('tasks', merged, 'id');
      return merged;
    },

    removeTasksWhere(predicate) {
      store.state.tasks = store.state.tasks.filter(task => !predicate(task));
    }
  };

  return feature;
}
