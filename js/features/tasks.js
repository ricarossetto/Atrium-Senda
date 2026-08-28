import { Store, isoDate, uid } from '../core/store.js';

export const TASK_COLUMNS = Object.freeze([
  { id: 'triagem', title: 'Entrada & triagem', color: '#c9a84c' },
  { id: 'prioridade', title: 'Prioridade', color: '#e5a84b' },
  { id: 'andamento', title: 'Em andamento', color: '#6f9fd8' },
  { id: 'aguardando', title: 'Aguardando', color: '#a887c7' },
  { id: 'revisao', title: 'Revisão', color: '#d68a67' },
  { id: 'concluida', title: 'Concluída', color: '#40b879' }
]);

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
  onTaskSaved,
  now = () => Date.now()
} = {}) {
  let initialized = false;
  let activeTimeSheetTaskId = null;
  let timeSheetStartedAt = null;
  let timeSheetInterval = null;

  const byId = id => documentRef?.getElementById(id);

  const feature = {
    get initialized() { return initialized; },
    get activeTimeSheetTaskId() { return activeTimeSheetTaskId; },
    get timeSheetStartedAt() { return timeSheetStartedAt; },
    get timeSheetInterval() { return timeSheetInterval; },

    init() {
      if (initialized) return false;
      initialized = true;
      byId('newTaskButton')?.addEventListener('click', () => this.openTaskModal());
      return true;
    },

    renderKanban() {
      const board = byId('kanbanBoard');
      board.innerHTML = TASK_COLUMNS.map(column => {
        const tasks = store.state.tasks.filter(task => task.status === column.id);
        return `<section class="kanban-column" data-column="${column.id}"><header class="column-header"><div class="column-title"><i class="column-dot" style="background:${column.color}"></i>${escapeHtml(column.title)}<span class="column-count">${tasks.length}</span></div><span>···</span></header><div class="column-cards">${tasks.length ? tasks.map(task => this.renderCard(task)).join('') : '<div class="empty-column">Arraste tarefas para cá</div>'}</div></section>`;
      }).join('');
      board.querySelectorAll('.task-card').forEach(card => {
        card.addEventListener('dragstart', () => { card.classList.add('dragging'); card.dataset.dragging = 'true'; });
        card.addEventListener('dragend', () => { card.classList.remove('dragging'); delete card.dataset.dragging; });
        card.addEventListener('click', event => {
          if (event.target.closest('.timesheet-btn')) return;
          const task = store.state.tasks.find(item => item.id === card.dataset.taskId);
          if (task) this.openTaskModal(task);
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
          if (dragged) this.moveTask(dragged.dataset.taskId, column.dataset.column);
        });
      });
    },

    renderCard(task) {
      const overdue = daysUntil(task.deadline) < 0 && task.status !== 'concluida';
      const timeMins = totalTimeMinutes(task.timeLogs);
      const timeBadge = timeMins > 0 ? `<span class="task-timelog" title="Tempo total registrado no TimeSheet">⏱ ${formatMinutes(timeMins)}</span>` : '';
      const isTimerRunning = activeTimeSheetTaskId === task.id;
      const timerButton = isTimerRunning
        ? `<button type="button" class="timesheet-btn active timesheet-live" data-timesheet-stop="${escapeHtml(task.id)}" title="Clique para pausar e salvar apontamento no TimeSheet">⏹ ${this.formatElapsedTimer()}</button>`
        : `<button type="button" class="timesheet-btn" data-timesheet-start="${escapeHtml(task.id)}" title="Iniciar cronômetro de TimeSheet">▶ Iniciar</button>`;

      const points = Number(task.points) || (task.priority === 'urgente' ? 25 : 10);
      return `<article class="task-card ${isTimerRunning ? 'timer-active' : ''}" draggable="true" data-task-id="${escapeHtml(task.id)}">
        <div class="task-top">
          <span class="task-source">${escapeHtml(task.source || 'INTERNA')}</span>
          <span class="task-badges">
            <b class="task-points" title="Pontuação TaskScore ADVBOX">✦ ${points} pts</b>
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
        if (liveButton) liveButton.textContent = `⏹ ${this.formatElapsedTimer()}`;
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

    moveTask(taskId, status) {
      const task = store.state.tasks.find(item => item.id === taskId);
      if (!task || task.status === status) return null;
      const previous = task.status;
      task.status = status;
      task.updatedAt = new Date().toISOString();
      store.audit('Tarefa movimentada', `${task.title}: ${previous} → ${status}`);
      onRenderAll?.();
      showToast?.('Tarefa movimentada com sucesso.', 'success');
      return task;
    },

    completeTask(taskId) {
      const task = store.state.tasks.find(item => item.id === taskId);
      if (!task) return null;
      task.status = 'concluida';
      task.completedAt = new Date().toISOString();
      store.audit('Tarefa concluída', task.title);
      store.save();
      return task;
    },

    reopenTask(taskId) {
      const task = store.state.tasks.find(item => item.id === taskId);
      if (!task) return null;
      task.status = 'triagem';
      delete task.completedAt;
      store.audit('Tarefa reaberta', task.title);
      store.save();
      return task;
    },

    openTaskModal(defaults = {}) {
      const definitions = store.state.configuration?.taskDefinitions || [];
      const totalTime = totalTimeMinutes(defaults.timeLogs);
      const timeNote = totalTime > 0 ? `Tempo total acumulado nesta tarefa: ${formatMinutes(totalTime)}.` : '';
      const cleanDescription = decodeHtmlEntities(defaults.description || defaults.text || '');
      const cleanTitle = decodeHtmlEntities(defaults.title || '');

      let completionBarHtml = '';
      if (defaults.id) {
        const isDone = isTerminalStatus(defaults.status);
        completionBarHtml = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding:10px 14px; background:var(--panel-soft); border-radius:10px; border:1px solid var(--line);">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:12px; color:var(--muted); font-weight:600;">Situação da Tarefa:</span>
            <span class="status-chip ${isDone ? 'connected' : 'warning'}">${isDone ? 'Concluída' : 'Em andamento'}</span>
          </div>
          ${!isDone ? `<button type="button" class="button gold" id="btnDirectCompleteTask" style="padding:6px 14px; font-size:12px; font-weight:600;">✓ Marcar como Concluída</button>` : `<button type="button" class="button ghost" id="btnDirectReopenTask" style="padding:6px 14px; font-size:12px;">↩ Reabrir Tarefa</button>`}
        </div>`;
      }

      let topHtml = completionBarHtml;
      if (cleanDescription) {
        topHtml += `
        <div class="task-intimation-card">
          <div class="task-intimation-header">
            <div class="task-intimation-title">
              <svg class="nav-svg" style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span>Publicação / Texto da Intimação</span>
            </div>
            <div class="task-intimation-actions">
              <button type="button" class="task-btn-action" id="btnCopyTaskIntimation">Copiar texto</button>
              <button type="button" class="task-btn-action" id="btnAiAnalyzeTask">✦ Analisar com IA</button>
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
        { name: 'status', label: 'Coluna (Quadro Kanban)', type: 'select', options: TASK_COLUMNS.map(column => ({ value: column.id, label: column.title })) },
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

      byId('btnDirectCompleteTask')?.addEventListener('click', () => {
        const task = this.completeTask(defaults.id);
        if (!task) return;
        closeModal?.();
        onRenderAll?.();
        showToast?.('Tarefa concluída e removida do painel ativo!', 'success');
      });

      byId('btnDirectReopenTask')?.addEventListener('click', () => {
        const task = this.reopenTask(defaults.id);
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

    saveTask(data, defaults = {}) {
      const history = Array.isArray(defaults.history) ? [...defaults.history] : [];
      const currentActor = getCurrentUserName?.() || 'Advogado(a)';
      history.push({ at: new Date().toISOString(), action: defaults.id ? 'Tarefa atualizada' : 'Tarefa atribuída', actor: currentActor });
      const timeLogs = Array.isArray(defaults.timeLogs) ? [...defaults.timeLogs] : [];
      const addMinutes = Number(data.addMinutes);
      if (addMinutes > 0) {
        timeLogs.push({ id: uid('time'), date: isoDate(), minutes: addMinutes, description: data.timeDescription || 'Trabalho realizado', actor: currentActor });
        history.push({ at: new Date().toISOString(), action: `Apontamento de tempo: ${formatMinutes(addMinutes)}`, actor: currentActor });
      }
      delete data.addMinutes;
      delete data.timeDescription;
      const responsibleList = [data.responsible, ...String(data.responsibles || '').split(/[,;]/)].map(item => item.trim()).filter(Boolean);
      const record = {
        id: defaults.id || uid('task'),
        createdAt: defaults.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: defaults.source || 'Interna',
        intimationId: defaults.intimationId || null,
        sourceIntimationId: defaults.intimationId || defaults.sourceIntimationId || null,
        ...data,
        points: Number(data.points) || 0,
        responsibles: [...new Set(responsibleList)],
        history,
        timeLogs
      };
      store.upsert('tasks', record);
      onTaskSaved?.({ record, currentActor, defaults, addMinutes });
      store.audit(defaults.id ? 'Tarefa atualizada' : 'Tarefa atribuída', `${record.title}${record.process ? ` · ${record.process}` : ''}${record.points ? ` · ${record.points} pontos` : ''}${addMinutes > 0 ? ` · ${formatMinutes(addMinutes)} apontados` : ''}`);
      return record;
    },

    upsertExternalTask(record, externalKey = 'id') {
      return store.upsert('tasks', record, externalKey);
    },

    removeTasksWhere(predicate) {
      store.state.tasks = store.state.tasks.filter(task => !predicate(task));
    }
  };

  return feature;
}
