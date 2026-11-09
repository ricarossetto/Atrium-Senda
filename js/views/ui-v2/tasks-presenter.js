import { iconSvg } from './icons.js?v=3.0.1';
import { memberAvatarHtml } from '../../core/member-avatar.js?v=3.0.1';

export const KANBAN_COLUMN_LIMIT = 200;

// Índice por render para resolver vínculos sem varredura por cartão.
// Mesma semântica dos finds originais (first-match; String() em ids de
// processo/contato, === estrito em intimação). Reconstruído a cada render:
// as coleções são mutadas in place, então cache entre renders é proibido.
export function buildTaskLinkLookup(processes = [], contacts = [], intimations = []) {
  const procById = new Map();
  const procByNumber = new Map();
  for (const process of processes || []) {
    if (!process) continue;
    const id = String(process.id || '');
    if (id && !procById.has(id)) procById.set(id, process);
    const externalId = String(process.externalId || '');
    if (externalId && !procById.has(externalId)) procById.set(externalId, process);
    const number = String(process.number || '').replace(/\D/g, '');
    if (number && !procByNumber.has(number)) procByNumber.set(number, process);
  }
  const contactById = new Map();
  for (const contact of contacts || []) {
    if (!contact) continue;
    const id = String(contact.id || '');
    if (id && !contactById.has(id)) contactById.set(id, contact);
  }
  const intimationById = new Map();
  for (const intimation of intimations || []) {
    if (intimation?.id === undefined || intimation?.id === null || intimation?.id === '') continue;
    if (!intimationById.has(intimation.id)) intimationById.set(intimation.id, intimation);
  }
  return { procById, procByNumber, contactById, intimationById };
}

export function resolveTaskClient(task, processes = [], contacts = [], intimations = [], lookup = null) {
  const isGeneric = (c) => !c || /^(?:cliente\s+)?(?:geral|n[aã]o\s+informado|n[aã]o\s+identificado|modelo|do\s+escrit[oó]rio|sigilo|n\/?i|sem\s+cliente)$/i.test(String(c).trim());

  if (task.client && !isGeneric(task.client)) return String(task.client).trim();

  const taskCnjNorm = String(task.process || task.processNumber || '').replace(/\D/g, '');
  const taskProcId = String(task.processId || '').trim();

  const findProcessById = id => lookup ? lookup.procById.get(id) || null
    : (processes || []).find(p => String(p.id) === id || String(p.externalId) === id) || null;
  const findProcessByNumber = digits => lookup ? lookup.procByNumber.get(digits) || null
    : (processes || []).find(p => String(p.number || '').replace(/\D/g, '') === digits) || null;
  const findContactById = id => lookup ? lookup.contactById.get(String(id)) || null
    : (contacts || []).find(c => String(c.id) === String(id)) || null;
  const findIntimationById = id => lookup ? lookup.intimationById.get(id) || null
    : (Array.isArray(intimations) && intimations.length ? intimations.find(i => i.id === id) || null : null);

  let proc = null;
  if (taskProcId) {
    proc = findProcessById(taskProcId);
  }
  if (!proc && taskCnjNorm) {
    proc = findProcessByNumber(taskCnjNorm);
  }

  if (proc) {
    if (proc.client && !isGeneric(proc.client)) return String(proc.client).trim();
    if (proc.author && !isGeneric(proc.author)) return String(proc.author).trim();
    if (proc.clientName && !isGeneric(proc.clientName)) return String(proc.clientName).trim();
    if (proc.contactId) {
      const contact = findContactById(proc.contactId);
      if (contact?.name && !isGeneric(contact.name)) return String(contact.name).trim();
    }
  }

  if (task.intimationId && Array.isArray(intimations) && intimations.length > 0) {
    const int = findIntimationById(task.intimationId);
    if (int?.client && !isGeneric(int.client)) return String(int.client).trim();
  }

  return '';
}

export function createTasksV2Presenter({
  documentRef = globalThis.document,
  escapeHtml,
  formatDate,
  formatMinutes,
  totalTimeMinutes,
  daysUntil,
  initials,
  memberFor = () => null
} = {}) {
  const byId = id => documentRef?.getElementById(id);

  function render({ board, tasks, columns, activeTaskId, elapsedLabel, sourceLabel, processes = [], contacts = [], intimations = [], triageLookup = null, riskLookup = null, involvedLookup = null }) {
    if (!board) return;
    const lookup = buildTaskLinkLookup(processes, contacts, intimations);
    board.innerHTML = columns.map(column => {
      const columnTasks = tasks.filter(task => task.status === column.id);
      const shownTasks = columnTasks.slice(0, KANBAN_COLUMN_LIMIT);
      const hiddenCount = columnTasks.length - shownTasks.length;
      return `<section class="kanban-column" data-column="${escapeHtml(column.id)}" aria-labelledby="task-column-${escapeHtml(column.id)}">
        <header class="column-header">
          <div class="column-title" id="task-column-${escapeHtml(column.id)}"><i class="column-dot" style="--task-column-color:${escapeHtml(column.color)}" aria-hidden="true"></i><span>${escapeHtml(column.title)}</span><span class="column-count">${columnTasks.length}</span></div>
        </header>
        <div class="column-cards" role="list">${shownTasks.length
          ? shownTasks.map(task => renderTaskCard({
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
              initials,
              memberFor,
              processes,
              contacts,
              lookup,
              triage: typeof triageLookup === 'function' ? triageLookup(task) : null,
              risk: typeof riskLookup === 'function' ? riskLookup(task) : null,
              involved: typeof involvedLookup === 'function' ? involvedLookup(task) : ''
            })).join('')
          : '<div class="kanban-column-empty">Nenhuma tarefa nesta etapa.</div>'}${hiddenCount > 0 ? `<div class="kanban-column-more" role="note">Mostrando ${shownTasks.length} de ${columnTasks.length} — refine na lista</div>` : ''}</div>
      </section>`;
    }).join('');
    updateCount(tasks.length);
  }

  function updateCount(total) {
    const target = byId('taskResultCount');
    if (target) target.textContent = `${total} tarefa${total === 1 ? '' : 's'}`;
  }

  function renderList({ container, summary, tasks, allTasks, columns, activeTaskId, elapsedLabel, sourceLabel, processes = [], contacts = [], intimations = [], activeFilter = 'active', triageLookup = null, riskLookup = null, involvedLookup = null }) {
    if (!container) return;
    const lookup = buildTaskLinkLookup(processes, contacts, intimations);
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
      ['Abertas', openTasks.length, 'Fila ativa', 'active'],
      ['Atrasadas', overdueTasks.length, 'Revisão prioritária', 'overdue'],
      ['Próximos 7 dias', nextSevenDays.length, 'Datas informadas', 'week'],
      ['Concluídas', allTasks.length - openTasks.length, 'Histórico preservado', 'completed']
    ].map(([label, value, detail, filterKey]) => `
      <article class="task-summary-card ${activeFilter === filterKey ? 'active' : ''}" data-task-summary-filter="${filterKey}" role="button" tabindex="0" title="Filtrar por ${escapeHtml(label)}">
        <span>${escapeHtml(label)}</span>
        <strong>${value}</strong>
        <small>${escapeHtml(detail)}</small>
      </article>
    `).join('');
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
          daysUntil,
          memberFor,
          processes,
          contacts,
          lookup,
          triage: typeof triageLookup === 'function' ? triageLookup(task) : null,
          risk: typeof riskLookup === 'function' ? riskLookup(task) : null,
          involved: typeof involvedLookup === 'function' ? involvedLookup(task) : ''
        })).join('')
      : (openTasks.length ? '<div class="task-list-empty"><strong>Nenhuma tarefa neste filtro.</strong><span>Ajuste a busca ou o filtro de situação.</span></div>' : '<div class="task-list-empty"><strong>Nenhuma tarefa aberta.</strong><span>Use Nova tarefa para criar a primeira.</span></div>');
    updateCount(allTasks.length);
  }

  function announce(message) {
    const live = byId('taskBoardLive');
    if (live) live.textContent = message || '';
  }

  function renderTaskPagination({ pagination, escapeHtml: escape }) {
    const page = Math.max(1, Number(pagination?.page) || 1);
    const pageSize = Number(pagination?.pageSize) || 100;
    const total = Math.max(0, Number(pagination?.total) || 0);
    const totalPages = Math.max(1, Number(pagination?.totalPages) || 1);
    const totalLabel = total.toLocaleString('pt-BR');
    const firstDisabled = page <= 1 ? ' disabled' : '';
    const lastDisabled = page >= totalPages ? ' disabled' : '';
    const sizes = [25, 100, 500, 1000];
    return `<nav class="task-pagination" aria-label="Paginação de tarefas">`
      + `<p class="task-pagination-status" aria-live="polite">Página ${page} de ${totalPages} · ${escape(totalLabel)} no filtro</p>`
      + `<div class="task-pagination-nav" role="group" aria-label="Navegar páginas">`
      + `<button type="button" class="v2-button is-secondary task-pagination-button" data-task-page="first"${firstDisabled} aria-label="Primeira página">Primeira</button>`
      + `<button type="button" class="v2-button is-secondary task-pagination-button" data-task-page="prev"${firstDisabled} aria-label="Página anterior">Anterior</button>`
      + `<button type="button" class="v2-button is-secondary task-pagination-button" data-task-page="next"${lastDisabled} aria-label="Próxima página">Próxima</button>`
      + `<button type="button" class="v2-button is-secondary task-pagination-button" data-task-page="last"${lastDisabled} aria-label="Última página">Última</button>`
      + `</div>`
      + `<div class="task-page-size" role="group" aria-label="Tarefas por página"><span>Por página</span>`
      + sizes.map(size => `<button type="button" class="task-page-size-option${size === pageSize ? ' is-active' : ''}" data-task-page-size="${size}" aria-pressed="${size === pageSize}">${size}</button>`).join('')
      + `</div></nav>`;
  }

  return Object.freeze({ render, renderList, renderTaskPagination, updateCount, announce });
}

/**
 * Divergência entre o prazo da tarefa e o prazo declarado pela fonte oficial, **explicada em
 * linguagem**: mostra as duas datas, diz qual prevalece e afirma que nada foi alterado. O aviso
 * só existe enquanto a divergência existir de fato, e a data da tarefa nunca é tocada aqui.
 */
function deadlineSourceHint(task) {
  const source = String(task?.deadlineSource || task?.sourceReportedDeadlineSource || '').trim().toLowerCase();
  if (source === 'pje') return 'Data limite prevista para manifestação, declarada pelo PJe';
  if (source === 'eproc') return 'Prazo declarado pelo eproc (fonte oficial)';
  if (source === 'domicilio') return 'Data informada pelo Domicílio Eletrônico: é referência, o prazo oficial vem do eproc';
  if (source === 'fonte') return 'Prazo declarado pela fonte oficial';
  return 'Data definida por pessoa nesta tarefa';
}

function deadlineSourceKicker(task, { fatal = true } = {}) {
  if (fatal && task?.fatalDeadline) return 'Prazo fatal';
  const source = String(task?.deadlineSource || task?.sourceReportedDeadlineSource || '').trim().toLowerCase();
  if (source === 'pje') return 'Data limite PJe';
  if (source === 'eproc') return 'Prazo eproc';
  if (source === 'domicilio') return 'Referência do Domicílio';
  if (source === 'fonte') return 'Prazo da fonte';
  return 'Prazo da tarefa';
}

function deadlineConflictNotice(task) {
  const conflict = task?.deadlineConflict;
  if (!conflict || typeof conflict !== 'object') return null;
  const sourceValue = String(conflict.sourceValue || '').trim();
  const current = String(task.deadline || '').trim();
  if (!sourceValue || !current || sourceValue === current) return null;
  return {
    sourceValue,
    currentValue: current,
    source: String(conflict.source || '').trim() || 'A fonte oficial'
  };
}

/** Frase humana do aviso (usada na linha e no cartão) — sempre as duas datas e o que prevalece. */
function deadlineConflictSentence(notice, formatDate) {
  const fonte = notice.source;
  const daFonte = formatDate(notice.sourceValue);
  const daTarefa = formatDate(notice.currentValue);
  return {
    short: `${fonte} declarou ${daFonte} · a tarefa está com ${daTarefa} — data digitada por pessoa, não alterada`,
    long: `${fonte} declarou ${daFonte} e esta tarefa está com ${daTarefa}. A data da tarefa foi digitada por pessoa e prevalece sobre a coleta automática: nada foi sobrescrito. Confira a contagem antes de ajustar — a fonte oficial continua sendo a referência do prazo.`
  };
}

/**
 * Selo de atraso provável (leitura assistiva do prazo que a tarefa JÁ tem): sempre sugestão —
 * o contorno tracejado e o tooltip dizem o motivo, e nada muda no prazo.
 */
const TASK_RISK_LABELS = Object.freeze({
  alto: 'Atraso provável: alto',
  medio: 'Atraso provável: médio',
  baixo: 'Atraso provável: baixo'
});

function taskRiskChip({ risk, escapeHtml }) {
  if (!risk || typeof risk !== 'object') return '';
  const key = String(risk.risk || '').trim();
  const label = TASK_RISK_LABELS[key];
  if (!label) return '';
  const confidence = Number(risk.riskConfidence) || 0;
  const motivo = String(risk.reasonLabel || risk.reason || '').trim();
  const nota = `${label}${confidence ? ` (confiança ${confidence.toFixed(2).replace('.', ',')})` : ''}${motivo ? ` — ${motivo}` : ''}. Sugestão do Atrium IA: o prazo não foi alterado.`;
  return `<span class="task-risk-chip risk-${escapeHtml(key)}" title="${escapeHtml(nota)}">${escapeHtml(label)}</span>`;
}

/**
 * Selos da triagem assistiva (categoria/urgência) — sempre sugestão, nunca dado:
 * o contorno tracejado e o tooltip deixam claro que nada foi alterado na tarefa.
 */
const TASK_TRIAGE_CATEGORY_LABELS = Object.freeze({
  prazo: 'Prazo',
  audiencia: 'Audiência',
  peticao: 'Petição',
  administrativo: 'Administrativo',
  outro: 'Outro'
});
const TASK_TRIAGE_URGENCY_LABELS = Object.freeze({
  alta: 'Urgente',
  normal: 'Normal',
  baixa: 'Baixa'
});

function taskTriageChips({ triage, escapeHtml, shown = [] }) {
  if (!triage || typeof triage !== 'object') return [];
  const chips = [];
  const categoryKey = String(triage.category || '').trim();
  // A etiqueta só repete o que a linha já mostra quando diz outra coisa.
  const already = new Set(shown.map(label => String(label || '').toLowerCase()));
  const category = already.has(String(TASK_TRIAGE_CATEGORY_LABELS[categoryKey] || '').toLowerCase()) ? '' : TASK_TRIAGE_CATEGORY_LABELS[categoryKey];
  const urgencyKey = String(triage.urgency || '').trim();
  const urgency = already.has(String(TASK_TRIAGE_URGENCY_LABELS[urgencyKey] || '').toLowerCase()) ? '' : TASK_TRIAGE_URGENCY_LABELS[urgencyKey];
  const confidence = Number(triage.confidence) || 0;
  const note = confidence > 0
    ? `Sugestão automática para conferência (confiança ${Math.round(confidence * 100)}%). Nada foi alterado.`
    : 'Sugestão automática para conferência. Nada foi alterado.';
  if (category) chips.push(`<span class="task-triage-chip category" data-triage-action="${escapeHtml(String(triage.action || 'review'))}" title="${escapeHtml(note)}">${escapeHtml(category)}</span>`);
  if (urgency) chips.push(`<span class="task-triage-chip urgency-${escapeHtml(urgencyKey)}" data-triage-action="${escapeHtml(String(triage.action || 'review'))}" title="${escapeHtml(note)}">${escapeHtml(urgency)}</span>`);
  return chips;
}

export function renderTaskListRow({
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
  memberFor = () => null,
  processes = [],
  contacts = [],
  lookup = null,
  triage = null,
  risk = null,
  involved = ''
}) {
  const isDone = task.status === 'concluida';
  const deadline = task.fatalDeadline || task.deadline;
  const overdue = Boolean(deadline) && daysUntil(deadline) < 0 && !isDone;
  const timeMinutes = totalTimeMinutes(task.timeLogs);
  const isTimerRunning = activeTaskId === task.id;
  const points = Number(task.points) || (task.priority === 'urgente' ? 25 : 10);
  const priority = ({ urgente: 'Urgente', importante: 'Importante', normal: 'Normal' })[task.priority] || 'Normal';
  const timerButton = isDone
    ? '<span class="task-list-timer-muted">Encerrada</span>'
    : isTimerRunning
      ? `<button type="button" class="timesheet-btn active task-list-timesheet-live" data-task-list-timesheet-stop="${escapeHtml(task.id)}" aria-label="Pausar cronômetro da tarefa ${escapeHtml(task.title)}">⏹ <span>${escapeHtml(elapsedLabel)}</span></button>`
      : `<button type="button" class="timesheet-btn" data-task-list-timesheet-start="${escapeHtml(task.id)}">▶ <span>Iniciar</span></button>`;

  const clientResolved = resolveTaskClient(task, processes, contacts, [], lookup);
  const stageColumn = columns.find(c => c.id === task.status) || columns[0];

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

  const days = deadline ? daysUntil(deadline) : null;
  const daysText = isDone
    ? 'Concluída'
    : overdue
      ? `${Math.abs(days)}d em atraso`
      : days === 0
        ? 'Vence hoje'
        : days === 1
          ? 'Vence amanhã'
          : days !== null
            ? `${days} dias restantes`
            : 'Sem prazo';

  const conflictNotice = deadlineConflictNotice(task);
  const triageChips = taskTriageChips({ triage, escapeHtml, shown: [typeLabel, priority] });
  const riskChip = taskRiskChip({ risk, escapeHtml });

  return `<article class="task-list-row ${overdue ? 'is-overdue' : ''} ${isDone ? 'is-complete' : ''}" data-task-list-id="${escapeHtml(task.id)}" role="listitem">
    <div class="task-list-check-col">
      <label class="task-row-checkbox-label" title="${isDone ? 'Reabrir tarefa' : 'Concluir tarefa'}">
        <input type="checkbox" class="task-row-checkbox" data-task-complete="${escapeHtml(task.id)}" ${isDone ? 'checked' : ''} aria-label="Marcar tarefa ${escapeHtml(task.title || '')} como concluída">
        <span class="task-checkbox-custom" aria-hidden="true"></span>
        <span class="task-check-text">${isDone ? 'Reabrir' : 'Concluir'}</span>
      </label>
    </div>

    ${involved ? `<div class="task-list-involved-col">${involved}</div>` : ''}

    <div class="task-list-main">
      <div class="task-list-title-line">
        <button type="button" class="task-list-open-btn" data-task-list-open="${escapeHtml(task.id)}">
          <strong class="task-title-text">${escapeHtml(task.title || 'Tarefa sem título')}</strong>
          ${task.description ? `<span class="task-desc-text">${escapeHtml(task.description)}</span>` : ''}
        </button>
      </div>

      <div class="task-list-context-line">
        <span class="task-context-badge client ${clientResolved ? '' : 'is-unlinked'}">
          ${iconSvg('contacts')}
          <strong>${escapeHtml(clientResolved || 'Cliente não vinculado')}</strong>
        </span>
        ${task.process ? `
          <span class="task-context-badge process" data-dashboard-process-open="${escapeHtml(task.process)}" title="Acessar processo">
            ${iconSvg('processes')}
            <b>${escapeHtml(task.process)}</b>
          </span>
        ` : ''}
        ${task.actionType ? `
          <span class="task-context-badge action-type">
            ${iconSvg('court')}
            <span>${escapeHtml(task.actionType)}</span>
          </span>
        ` : ''}
      </div>

      <div class="task-list-tags-line">
        <span class="task-tag stage-tag" style="--stage-color:${escapeHtml(stageColumn?.color || '#DFBE6A')}">${escapeHtml(stageColumn?.title || 'Triagem')}</span>
        <span class="task-tag type-tag ${typeBadge}">${typeLabel}</span>
        <span class="task-tag priority-tag priority-${escapeHtml(task.priority || 'normal')}">${escapeHtml(priority)}</span>
        ${task.responsible ? `<span class="task-tag owner-tag" data-task-owner-tag="${escapeHtml(task.id)}">${memberAvatarHtml(memberFor(task) || { displayName: task.responsible }, escapeHtml)} ${escapeHtml(task.responsible)}</span>` : ''}
        ${points > 0 ? `<span class="task-tag points-tag">${iconSvg('tasks')} ${points} pts</span>` : ''}
        ${triageChips.join('')}${riskChip}
      </div>
    </div>

    <div class="task-list-meta-col">
      <div class="task-list-deadline-box ${overdue ? 'is-overdue' : ''}">
        <span class="task-deadline-kicker" title="${escapeHtml(deadlineSourceHint(task))}">${deadlineSourceKicker(task)}</span>
        <strong class="task-deadline-val ${overdue ? 'overdue' : ''}" title="${escapeHtml(deadlineSourceHint(task))}">${deadline ? escapeHtml(formatDate(deadline)) : 'Não informado'}</strong>
        <small class="task-deadline-status ${overdue ? 'is-overdue' : ''}">${escapeHtml(daysText)}</small>
        ${conflictNotice ? `<small class="task-deadline-conflict" title="${escapeHtml(deadlineConflictSentence(conflictNotice, formatDate).long)}">${escapeHtml(deadlineConflictSentence(conflictNotice, formatDate).short)}</small>` : ''}
      </div>

      <div class="task-list-controls-group">
        <label class="task-list-stage-label" title="Alterar etapa">
          <select data-task-list-move="${escapeHtml(task.id)}" aria-label="Mover ${escapeHtml(task.title || 'tarefa')} para outra etapa">
            ${columns.map(column => `<option value="${escapeHtml(column.id)}" ${column.id === task.status ? 'selected' : ''}>${escapeHtml(column.title)}</option>`).join('')}
          </select>
        </label>
        <div class="task-list-timer-cell">
          ${timerButton}
        </div>
      </div>
    </div>
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
  initials,
  memberFor = () => null,
  processes = [],
  contacts = [],
  lookup = null,
  triage = null,
  risk = null,
  involved = ''
}) {
  const isDone = task.status === 'concluida';
  const overdue = Boolean(task.deadline) && daysUntil(task.deadline) < 0 && !isDone;
  const timeMinutes = totalTimeMinutes(task.timeLogs);
  const isTimerRunning = activeTaskId === task.id;
  const points = Number(task.points) || (task.priority === 'urgente' ? 25 : 10);
  const priority = ({ urgente: 'Urgente', importante: 'Importante', normal: 'Normal' })[task.priority] || 'Normal';
  const deadlineLabel = task.deadline ? `${overdue ? 'Atrasada · ' : `${deadlineSourceKicker(task, { fatal: false })} · `}${formatDate(task.deadline)}` : 'Sem prazo informado';
  const timerButton = isTimerRunning
    ? `<button type="button" class="timesheet-btn active timesheet-live" data-timesheet-stop="${escapeHtml(task.id)}" aria-label="Pausar cronômetro da tarefa ${escapeHtml(task.title)}">⏹ <span>${escapeHtml(elapsedLabel)}</span></button>`
      : `<button type="button" class="timesheet-btn" data-timesheet-start="${escapeHtml(task.id)}">▶ <span>Iniciar tempo</span></button>`;

  const clientResolved = resolveTaskClient(task, processes, contacts, [], lookup);
  const conflictNotice = deadlineConflictNotice(task);
  const triageChips = taskTriageChips({ triage, escapeHtml, shown: [priority] });
  const riskChip = taskRiskChip({ risk, escapeHtml });

  return `<article class="task-card ${isTimerRunning ? 'timer-active' : ''} ${overdue ? 'is-overdue' : ''} ${isDone ? 'is-complete' : ''}" draggable="true" data-task-id="${escapeHtml(task.id)}" role="listitem">
    <div class="task-top">
      <div class="task-top-left">
        <label class="task-card-checkbox-label" title="${isDone ? 'Reabrir tarefa' : 'Concluir tarefa'}">
          <input type="checkbox" class="task-card-checkbox" data-task-complete="${escapeHtml(task.id)}" ${isDone ? 'checked' : ''} aria-label="Concluir tarefa">
          <span class="task-checkbox-custom" aria-hidden="true"></span>
          <span class="task-check-text">${isDone ? 'Reabrir' : 'Concluir'}</span>
        </label>
        <span class="task-source">${escapeHtml(sourceLabel)}</span>
      </div>
      <span class="task-badges">
        <span class="task-priority priority-${escapeHtml(task.priority || 'normal')}">${escapeHtml(priority)}</span>
        <b class="task-points" title="Pontuação informada">${points} pts</b>
      </span>
    </div>
    <button type="button" class="task-card-open" data-task-open="${escapeHtml(task.id)}">
      <strong>${escapeHtml(task.title || 'Tarefa sem título')}</strong>
      <span>${escapeHtml(task.description || 'Sem descrição')}</span>
      <span class="task-card-action">Editar tarefa <svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.1#atrium-icon-chevron-right"></use></svg></span>
    </button>
    <div class="task-context">
      <span class="task-client ${clientResolved ? '' : 'task-client-unlinked'}">${escapeHtml(clientResolved || 'Cliente não vinculado')}</span>
      ${task.process ? `<span class="task-process">${escapeHtml(task.process)}</span>` : ''}
    </div>
    ${involved ? `<div class="task-card-involved">${involved}</div>` : ''}
    ${(triageChips.length || riskChip) ? `<div class="task-triage-line">${triageChips.join('')}${riskChip}</div>` : ''}
    <div class="task-deadlines">
      <span class="task-date ${overdue ? 'overdue' : ''}">${escapeHtml(deadlineLabel)}</span>
      ${task.fatalDeadline ? `<span class="fatal-date"><strong>Prazo fatal</strong> ${escapeHtml(formatDate(task.fatalDeadline))}</span>` : ''}
      ${conflictNotice ? `<span class="task-date task-date-source-conflict" title="${escapeHtml(deadlineConflictSentence(conflictNotice, formatDate).long)}">${escapeHtml(deadlineConflictSentence(conflictNotice, formatDate).short)}</span>` : ''}
    </div>
    <div class="task-effort">
      ${timeMinutes > 0 ? `<span class="task-timelog" title="Tempo total registrado">${escapeHtml(formatMinutes(timeMinutes))} apontados</span>` : '<span class="task-timelog is-empty">Sem tempo apontado</span>'}
      ${timerButton}
    </div>
    <footer class="task-footer">
      <label class="task-move-control"><span>Mover para</span><select data-task-move="${escapeHtml(task.id)}" aria-label="Mover ${escapeHtml(task.title)} para outra etapa">${columns.map(column => `<option value="${escapeHtml(column.id)}" ${column.id === task.status ? 'selected' : ''}>${escapeHtml(column.title)}</option>`).join('')}</select></label>
      <span class="task-owner" data-task-owner="${escapeHtml(task.id)}">${memberAvatarHtml(memberFor(task) || { displayName: task.responsible }, escapeHtml)}<span>${escapeHtml(task.responsible || 'Responsável não informado')}</span></span>
    </footer>
  </article>`;
}
