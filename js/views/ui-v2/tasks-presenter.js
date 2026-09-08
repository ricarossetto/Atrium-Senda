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

  function renderList({ container, summary, tasks, allTasks, columns, activeTaskId, elapsedLabel, sourceLabel }) {
    if (!container) return;
    const openTasks = allTasks.filter(task => task.status !== 'concluida');
    const overdueTasks = openTasks.filter(task => {
      const deadline = task.fatalDeadline || task.deadline;
      return Boolean(deadline) && daysUntil(deadline) < 0;
    });
    const nextSevenDays = openTasks.filter(task => {
      const deadline = task.fatalDeadline || task.deadline;
      if (!deadline) return false;
      const distance = daysUntil(deadline);
      return distance >= 0 && distance <= 7;
    });
    if (summary) summary.innerHTML = [
      ['Abertas', openTasks.length, 'Fila ativa'],
      ['Atrasadas', overdueTasks.length, 'Revisão prioritária'],
      ['Próximos 7 dias', nextSevenDays.length, 'Datas informadas'],
      ['Concluídas', allTasks.length - openTasks.length, 'Histórico preservado']
    ].map(([label, value, detail]) => `<article><span>${escapeHtml(label)}</span><strong>${value}</strong><small>${escapeHtml(detail)}</small></article>`).join('');
    const visibleCount = byId('taskListVisibleCount');
    if (visibleCount) visibleCount.textContent = `${tasks.length} exibida${tasks.length === 1 ? '' : 's'}`;
    container.innerHTML = tasks.length
      ? tasks.map(task => renderTaskListRow({
          task,
          columns,
          activeTaskId,
          elapsedLabel,
          sourceLabel: sourceLabel(task.source),
          escapeHtml,
          formatDate,
          formatMinutes,
          totalTimeMinutes,
          daysUntil
        })).join('')
      : '<div class="task-list-empty"><strong>Nenhuma tarefa encontrada.</strong><span>Ajuste a busca ou os filtros para consultar outra parte da fila.</span></div>';
    updateCount(allTasks.length);
  }

  function announce(message) {
    const live = byId('taskBoardLive');
    if (live) live.textContent = message || '';
  }

  return Object.freeze({ render, renderList, updateCount, announce });
}

function renderTaskListRow({
  task,
  columns,
  activeTaskId,
  elapsedLabel,
  sourceLabel,
  escapeHtml,
  formatDate,
  formatMinutes,
  totalTimeMinutes,
  daysUntil
}) {
  const isDone = task.status === 'concluida';
  const deadline = task.fatalDeadline || task.deadline;
  const overdue = Boolean(deadline) && daysUntil(deadline) < 0 && !isDone;
  const timeMinutes = totalTimeMinutes(task.timeLogs);
  const isTimerRunning = activeTaskId === task.id;
  const priority = ({ urgente: 'Urgente', importante: 'Importante', normal: 'Normal' })[task.priority] || 'Normal';
  const timerButton = isDone
    ? '<span class="task-list-timer-muted">Encerrada</span>'
    : isTimerRunning
      ? `<button type="button" class="timesheet-btn active task-list-timesheet-live" data-task-list-timesheet-stop="${escapeHtml(task.id)}" aria-label="Pausar cronômetro da tarefa ${escapeHtml(task.title)}">⏹ <span>${escapeHtml(elapsedLabel)}</span></button>`
      : `<button type="button" class="timesheet-btn" data-task-list-timesheet-start="${escapeHtml(task.id)}" aria-label="Iniciar cronômetro da tarefa ${escapeHtml(task.title)}">▶ <span>Iniciar</span></button>`;
  return `<article class="task-list-row ${overdue ? 'is-overdue' : ''} ${isDone ? 'is-complete' : ''}" data-task-list-id="${escapeHtml(task.id)}" role="listitem">
    <div class="task-list-primary">
      <span class="task-list-kicker">${escapeHtml(sourceLabel)} · <b class="task-priority priority-${escapeHtml(task.priority || 'normal')}">${escapeHtml(priority)}</b></span>
      <button type="button" data-task-list-open="${escapeHtml(task.id)}" aria-label="Editar tarefa ${escapeHtml(task.title || 'sem título')}"><strong>${escapeHtml(task.title || 'Tarefa sem título')}</strong><span>${escapeHtml(task.description || 'Sem descrição')}</span></button>
    </div>
    <div class="task-list-context"><span>Vínculos</span><strong>${escapeHtml(task.client || 'Cliente não informado')}</strong><small>${escapeHtml(task.process || 'Processo não informado')}</small></div>
    <label class="task-list-stage"><span>Etapa</span><select data-task-list-move="${escapeHtml(task.id)}" aria-label="Mover ${escapeHtml(task.title || 'tarefa')} para outra etapa">${columns.map(column => `<option value="${escapeHtml(column.id)}" ${column.id === task.status ? 'selected' : ''}>${escapeHtml(column.title)}</option>`).join('')}</select></label>
    <div class="task-list-deadline"><span>${task.fatalDeadline ? 'Prazo fatal' : 'Prazo interno'}</span><strong class="${overdue ? 'overdue' : ''}">${deadline ? escapeHtml(formatDate(deadline)) : 'Não informado'}</strong><small>${overdue ? 'Atrasada' : isDone ? 'Concluída' : 'Sob conferência'}</small></div>
    <div class="task-list-owner"><span>Responsável</span><strong>${escapeHtml(task.responsible || 'Não informado')}</strong><small>${Number(task.points) || 0} pontos</small></div>
    <div class="task-list-effort"><span>Tempo</span><strong>${timeMinutes > 0 ? escapeHtml(formatMinutes(timeMinutes)) : 'Sem registro'}</strong>${timerButton}</div>
  </article>`;
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
