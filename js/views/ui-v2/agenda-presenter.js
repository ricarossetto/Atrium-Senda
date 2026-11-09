import { memberAvatarHtml } from '../../core/member-avatar.js?v=3.0.0';

const DATE_LOCALE = 'pt-BR';

function dateAtNoon(value) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function longDate(value) {
  const date = dateAtNoon(value);
  return date ? new Intl.DateTimeFormat(DATE_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date) : 'Data não informada';
}

function shortDate(value) {
  const date = dateAtNoon(value);
  return date ? new Intl.DateTimeFormat(DATE_LOCALE, {
    day: '2-digit',
    month: 'short'
  }).format(date).replace('.', '').toLocaleUpperCase(DATE_LOCALE) : 'SEM DATA';
}

function nextDate(value) {
  const date = dateAtNoon(value);
  if (!date) return '';
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function groupLabel(value, today) {
  if (value === today) return 'Hoje';
  if (value === nextDate(today)) return 'Amanhã';
  return shortDate(value);
}

function activityMeta(item) {
  if (item.type === 'event') return {
    label: 'Compromisso',
    dateLabel: item.time || 'Dia inteiro',
    className: 'event',
    context: item.source || 'Interna'
  };
  if (item.type === 'task') return {
    label: item.isFatal ? 'Prazo fatal' : 'Tarefa com data registrada',
    dateLabel: item.isFatal ? 'Prazo fatal' : (item.time || 'Data registrada'),
    className: item.isFatal ? 'fatal' : 'task',
    context: item.status || 'Tarefa'
  };
  return {
    label: 'Publicação',
    dateLabel: 'Publicação',
    className: 'intimation',
    context: item.act?.label || item.source || 'Publicação'
  };
}

const STATUS_LABELS = new Map([
  ['concluida', 'Concluída'],
  ['concluída', 'Concluída'],
  ['pendente', 'Pendente'],
  ['em andamento', 'Em andamento'],
  ['em_analise', 'Em análise'],
  ['em análise', 'Em análise'],
  ['cancelada', 'Cancelada'],
  ['arquivada', 'Arquivada']
]);

function statusLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return STATUS_LABELS.get(raw.toLowerCase()) || raw.charAt(0).toLocaleUpperCase('pt-BR') + raw.slice(1);
}

function activityRow(item, { escapeHtml, formatMinutes }) {
  const meta = activityMeta(item);
  const date = dateAtNoon(item.date);
  const day = date ? String(date.getDate()).padStart(2, '0') : '—';
  const month = date ? new Intl.DateTimeFormat(DATE_LOCALE, { month: 'short' }).format(date).replace('.', '') : '';
  const time = item.type === 'intimation' ? 'Data da publicação' : meta.dateLabel;
  const trackedTime = item.type === 'task' && item.timeMins > 0
    ? `<span class="agenda-activity-time">${escapeHtml(formatMinutes(item.timeMins))} apontados</span>`
    : '';
  const statusText = item.type === 'task' && item.status ? statusLabel(item.status) : '';
  const subtitleText = [item.subtitle, statusText].filter(Boolean).join(' · ');
  const accessibleName = `${meta.label}: ${item.title}. ${longDate(item.date)}. ${item.subtitle || ''}`;

  return `
    <button type="button" class="agenda-item agenda-activity-row is-${meta.className}" data-agenda-activity-type="${item.type}" data-agenda-activity-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(accessibleName)}">
      <span class="agenda-date ${meta.className === 'fatal' ? 'fatal-type' : `${meta.className}-type`}">
        <strong>${day}</strong>
        <small>${month}</small>
      </span>
      <span class="agenda-copy">
        <span class="agenda-activity-kicker"${item.timeHint ? ` title="${escapeHtml(item.timeHint)}"` : ''}>${escapeHtml(time)}</span>
        <strong>${escapeHtml(item.title)}</strong>
        <small class="agenda-activity-subtitle">${item.member ? memberAvatarHtml(item.member, escapeHtml) : ''}<span>${escapeHtml(subtitleText)}</span></small>
        ${trackedTime ? `<span class="agenda-activity-meta">${trackedTime}</span>` : ''}
      </span>
      <span class="agenda-activity-open" aria-hidden="true">›</span>
    </button>`;
}

function calendarDaySummary({ events, tasks, intimations, date }) {
  const eventCount = events.filter(item => item.date === date).length;
  const dayTasks = tasks.filter(item => (item.fatalDeadline || item.deadline) === date);
  const fatalCount = dayTasks.filter(item => Boolean(item.fatalDeadline)).length;
  const taskCount = dayTasks.length - fatalCount;
  const intimationCount = intimations.filter(item => item.publishedAt === date || item.createdAt?.slice(0, 10) === date).length;
  return { eventCount, taskCount, fatalCount, intimationCount, total: eventCount + taskCount + fatalCount + intimationCount };
}

function indicatorMarkup(summary) {
  const indicators = [];
  if (summary.eventCount) indicators.push('<i class="cal-dot event" aria-hidden="true"></i>');
  if (summary.taskCount) indicators.push('<i class="cal-dot task" aria-hidden="true"></i>');
  if (summary.fatalCount) indicators.push('<i class="cal-dot fatal" aria-hidden="true"></i>');
  if (summary.intimationCount) indicators.push('<i class="cal-dot intimation" aria-hidden="true"></i>');
  return indicators.join('');
}

function dayAccessibleName(date, summary, { today, selected }) {
  const parts = [longDate(date)];
  if (date === today) parts.push('hoje');
  if (selected) parts.push('selecionado');
  parts.push(`${summary.total} ${summary.total === 1 ? 'atividade' : 'atividades'}`);
  if (summary.eventCount) parts.push(`${summary.eventCount} ${summary.eventCount === 1 ? 'compromisso' : 'compromissos'}`);
  if (summary.taskCount) parts.push(`${summary.taskCount} ${summary.taskCount === 1 ? 'tarefa' : 'tarefas'} com data registrada`);
  if (summary.fatalCount) parts.push(`${summary.fatalCount} ${summary.fatalCount === 1 ? 'prazo fatal registrado' : 'prazos fatais registrados'}`);
  if (summary.intimationCount) parts.push(`${summary.intimationCount} ${summary.intimationCount === 1 ? 'publicação' : 'publicações'}`);
  return parts.join(', ');
}

export function createAgendaPresenter({ escapeHtml, formatMinutes } = {}) {
  function renderActivities({ activities = [], selectedDate = null, today }) {
    if (!activities.length) return `<div class="empty-detail agenda-empty-state"><span aria-hidden="true">◇</span><h3>Nenhuma atividade</h3><p>${selectedDate ? 'Não há compromissos, tarefas datadas ou publicações para esta data.' : 'Nenhuma atividade próxima encontrada.'}</p></div>`;

    const groups = new Map();
    for (const item of activities) {
      const key = selectedDate ? selectedDate : (item.date || '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }

    return `<div class="agenda-activity-groups">${[...groups.entries()].map(([date, items]) => `
      <section class="agenda-activity-group" aria-labelledby="agenda-group-${escapeHtml(date || 'undated')}">
        <header>
          <span id="agenda-group-${escapeHtml(date || 'undated')}">${escapeHtml(groupLabel(date, today))}</span>
          <small>${escapeHtml(longDate(date))}</small>
          <em>${items.length}</em>
        </header>
        <div class="agenda-activity-list">${items.map(item => activityRow(item, { escapeHtml, formatMinutes })).join('')}</div>
      </section>`).join('')}</div>`;
  }

  function renderCalendar({ year, month, selectedDate, today, agenda = [], tasks = [], intimations = [], direction = '' }) {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const days = [];
    for (let index = 0; index < first.getDay(); index++) days.push('<span class="calendar-day muted" aria-hidden="true"></span>');

    for (let day = 1; day <= last.getDate(); day++) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const summary = calendarDaySummary({ events: agenda, tasks, intimations, date });
      const isToday = date === today;
      const selected = date === selectedDate;
      days.push(`
        <button type="button" class="calendar-day ${isToday ? 'today' : ''} ${selected ? 'selected' : ''} ${summary.total > 2 ? 'busy' : ''}" data-cal-date="${date}" aria-label="${escapeHtml(dayAccessibleName(date, summary, { today, selected }))}" aria-pressed="${selected ? 'true' : 'false'}" ${isToday ? 'aria-current="date"' : ''}>
          <span class="calendar-day-number">${day}</span>
          <span class="cal-indicators" aria-hidden="true">${indicatorMarkup(summary)}</span>
          ${summary.total > 3 ? `<span class="calendar-activity-count" aria-hidden="true">${summary.total}</span>` : ''}
        </button>`);
    }

    const localizedMonth = new Intl.DateTimeFormat(DATE_LOCALE, { month: 'long', year: 'numeric' }).format(first);
    const monthName = localizedMonth.charAt(0).toLocaleUpperCase(DATE_LOCALE) + localizedMonth.slice(1);
    return `
      <header class="calendar-header">
        <div><p>Calendário mensal</p><h3 id="agendaCalendarMonth">${escapeHtml(monthName)}</h3></div>
        <div class="calendar-nav">
          <button type="button" id="calPrevMonth" aria-label="Mostrar mês anterior" title="Mês anterior"><svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.0#atrium-icon-chevron-left"></use></svg></button>
          <button type="button" id="calNextMonth" aria-label="Mostrar próximo mês" title="Próximo mês"><svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.0#atrium-icon-chevron-right"></use></svg></button>
        </div>
      </header>
      <div class="calendar-grid ${direction ? `month-enter is-${direction}` : ''}" role="group" aria-labelledby="agendaCalendarMonth">
        ${['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'].map(day => `<span class="calendar-weekday" aria-hidden="true">${day.slice(0, 3)}</span>`).join('')}
        ${days.join('')}
      </div>`;
  }

  function renderSummary({ events = [], tasks = [], intimations = [] }) {
    const plural = (count, one, many) => (count === 1 ? one : many);
    return `
      <span class="agenda-summary-item"><b>${events.length}</b> ${plural(events.length, 'compromisso', 'compromissos')}</span>
      <span class="agenda-summary-sep" aria-hidden="true">·</span>
      <span class="agenda-summary-item"><b>${tasks.length}</b> ${plural(tasks.length, 'tarefa com data', 'tarefas com data')}</span>
      <span class="agenda-summary-sep" aria-hidden="true">·</span>
      <span class="agenda-summary-item"><b>${intimations.length}</b> ${plural(intimations.length, 'publicação', 'publicações')}</span>`;
  }

  return Object.freeze({ renderActivities, renderCalendar, renderSummary });
}
