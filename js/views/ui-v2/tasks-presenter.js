export function createTasksV2Presenter({
  documentRef = globalThis.document,
  escapeHtml,
  formatDate,
  formatMinutes,
  totalTimeMinutes,
  daysUntil,
  initials
} = {}) {
  const byId = id => documentRef?.getElementById(id);

  function render({ board, tasks, columns, activeTaskId, elapsedLabel, sourceLabel }) {
    if (!board) return;
    board.innerHTML = columns.map(column => {
      const columnTasks = tasks.filter(task => task.status === column.id);
      return `<section class="kanban-column" data-column="${escapeHtml(column.id)}" aria-labelledby="task-column-${escapeHtml(column.id)}">
        <header class="column-header">
          <div class="column-title" id="task-column-${escapeHtml(column.id)}"><i class="column-dot" style="--task-column-color:${escapeHtml(column.color)}" aria-hidden="true"></i><span>${escapeHtml(column.title)}</span><span class="column-count" aria-label="${columnTasks.length} tarefa${columnTasks.length === 1 ? '' : 's'}">${columnTasks.length}</span></div>
        </header>
        <div class="column-cards" role="list">${columnTasks.length
          ? columnTasks.map(task => renderTaskCard({
              task,
              columns,
              activeTaskId,
              elapsedLabel,
              sourceLabel: sourceLabel(task.source),
              escapeHtml,
              formatDate,
              formatMinutes,
              totalTimeMinutes,
              daysUntil,
              initials
            })).join('')
          : '<div class="empty-column"><strong>Nenhuma tarefa nesta etapa.</strong><span>Use “Mover para” ou arraste uma tarefa para cá.</span></div>'}</div>
      </section>`;
    }).join('');
    updateCount(tasks.length);
  }

  function updateCount(total) {
    const count = byId('taskResultCount');
    if (count) count.textContent = `${total} tarefa${total === 1 ? '' : 's'}`;
  }

  function announce(message) {
    const live = byId('taskBoardLive');
    if (live) live.textContent = message || '';
  }

  return Object.freeze({ render, updateCount, announce });
}

export function renderTaskCard({
  task,
  columns,
  activeTaskId,
  elapsedLabel,
  sourceLabel,
  escapeHtml,
  formatDate,
  formatMinutes,
  totalTimeMinutes,
  daysUntil,
  initials
}) {
  const isDone = task.status === 'concluida';
  const overdue = Boolean(task.deadline) && daysUntil(task.deadline) < 0 && !isDone;
  const timeMinutes = totalTimeMinutes(task.timeLogs);
  const isTimerRunning = activeTaskId === task.id;
  const points = Number(task.points) || (task.priority === 'urgente' ? 25 : 10);
  const priority = ({ urgente: 'Urgente', importante: 'Importante', normal: 'Normal' })[task.priority] || 'Normal';
  const deadlineLabel = task.deadline ? `${overdue ? 'Atrasada · ' : 'Prazo interno · '}${formatDate(task.deadline)}` : 'Sem prazo interno informado';
  const timerButton = isTimerRunning
    ? `<button type="button" class="timesheet-btn active timesheet-live" data-timesheet-stop="${escapeHtml(task.id)}" aria-label="Pausar cronômetro da tarefa ${escapeHtml(task.title)}">⏹ <span>${escapeHtml(elapsedLabel)}</span></button>`
    : `<button type="button" class="timesheet-btn" data-timesheet-start="${escapeHtml(task.id)}" aria-label="Iniciar cronômetro da tarefa ${escapeHtml(task.title)}">▶ <span>Iniciar tempo</span></button>`;

  return `<article class="task-card ${isTimerRunning ? 'timer-active' : ''} ${overdue ? 'is-overdue' : ''} ${isDone ? 'is-complete' : ''}" draggable="true" data-task-id="${escapeHtml(task.id)}" role="listitem">
    <div class="task-top">
      <span class="task-source">${escapeHtml(sourceLabel)}</span>
      <span class="task-badges">
        <span class="task-priority priority-${escapeHtml(task.priority || 'normal')}">${escapeHtml(priority)}</span>
        <b class="task-points" title="Pontuação informada">${points} pts</b>
      </span>
    </div>
    <button type="button" class="task-card-open" data-task-open="${escapeHtml(task.id)}" aria-label="Editar tarefa ${escapeHtml(task.title)}">
      <strong>${escapeHtml(task.title || 'Tarefa sem título')}</strong>
      <span>${escapeHtml(task.description || 'Sem descrição')}</span>
      <span class="task-card-action">Editar tarefa <b aria-hidden="true">→</b></span>
    </button>
    <div class="task-context">
      ${task.client ? `<span class="task-client">${escapeHtml(task.client)}</span>` : ''}
      ${task.process ? `<span class="task-process">${escapeHtml(task.process)}</span>` : ''}
    </div>
    <div class="task-deadlines">
      <span class="task-date ${overdue ? 'overdue' : ''}">${escapeHtml(deadlineLabel)}</span>
      ${task.fatalDeadline ? `<span class="fatal-date"><strong>Prazo fatal</strong> ${escapeHtml(formatDate(task.fatalDeadline))}</span>` : ''}
    </div>
    <div class="task-effort">
      ${timeMinutes > 0 ? `<span class="task-timelog" title="Tempo total registrado">${escapeHtml(formatMinutes(timeMinutes))} apontados</span>` : '<span class="task-timelog is-empty">Sem tempo apontado</span>'}
      ${timerButton}
    </div>
    <footer class="task-footer">
      <label class="task-move-control"><span>Mover para</span><select data-task-move="${escapeHtml(task.id)}" aria-label="Mover ${escapeHtml(task.title)} para outra etapa">${columns.map(column => `<option value="${escapeHtml(column.id)}" ${column.id === task.status ? 'selected' : ''}>${escapeHtml(column.title)}</option>`).join('')}</select></label>
      <span class="task-owner"><span class="task-avatar" aria-hidden="true">${escapeHtml(initials(task.responsible || 'Advogado(a)'))}</span><span>${escapeHtml(task.responsible || 'Responsável não informado')}</span></span>
    </footer>
  </article>`;
}
