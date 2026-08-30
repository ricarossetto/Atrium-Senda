import { Store, isoDate, uid } from '../core/store.js';
import { createAgendaPresenter } from '../views/ui-v2/agenda-presenter.js';

export function collectAgendaActivities({
  agenda = [],
  tasks = [],
  intimations = [],
  selectedDate = null,
  typeFilter = 'all',
  today = isoDate(),
  classifyIntimation,
  getIntimationParties,
  totalTimeMinutes
} = {}) {
  let events = agenda.map(event => ({
    type: 'event',
    id: event.id,
    date: event.date,
    time: event.time || 'Dia inteiro',
    title: event.title,
    subtitle: `${event.client || event.process || 'Compromisso interno'}${event.location ? ` · ${event.location}` : ''}`,
    source: event.source || 'Interna',
    raw: event
  }));

  let taskActivities = tasks.filter(task => task.fatalDeadline || task.deadline).map(task => {
    const isFatal = Boolean(task.fatalDeadline);
    const targetDate = task.fatalDeadline || task.deadline;
    const timeMins = totalTimeMinutes(task.timeLogs);
    return {
      type: 'task',
      id: task.id,
      date: targetDate,
      time: isFatal ? 'Prazo fatal' : (task.time || 'Prazo interno'),
      title: task.title,
      subtitle: `${task.process ? `${task.process} · ` : ''}${task.client || 'Tarefa interna'}${task.points ? ` · ${task.points} pts` : ''}`,
      isFatal,
      status: task.status,
      timeMins,
      source: isFatal ? 'Fatal' : 'Tarefa',
      raw: task
    };
  });

  let intimationActivities = intimations.map(intimation => {
    const act = classifyIntimation(intimation);
    const targetDate = intimation.publishedAt || (intimation.createdAt ? intimation.createdAt.slice(0, 10) : today);
    return {
      type: 'intimation',
      id: intimation.id,
      date: targetDate,
      time: 'Publicação',
      title: intimation.title,
      subtitle: `${intimation.process || 'Sem processo'} · ${getIntimationParties(intimation) || 'Partes não vinculadas'}`,
      act,
      source: 'Intimação',
      raw: intimation
    };
  });

  if (selectedDate) {
    events = events.filter(event => event.date === selectedDate);
    taskActivities = taskActivities.filter(task => task.date === selectedDate);
    intimationActivities = intimationActivities.filter(intimation => intimation.date === selectedDate);
  } else {
    events = events.filter(event => !event.date || event.date >= today);
    taskActivities = taskActivities.filter(task => !task.date || task.date >= today);
    intimationActivities = intimationActivities.filter(intimation => !intimation.date || intimation.date >= today);
  }

  let activities;
  if (typeFilter === 'event') activities = [...events];
  else if (typeFilter === 'task') activities = [...taskActivities];
  else if (typeFilter === 'intimation') activities = [...intimationActivities];
  else activities = [...events, ...taskActivities, ...intimationActivities];

  activities.sort((a, b) => `${a.date || ''} ${a.time || ''}`.localeCompare(`${b.date || ''} ${b.time || ''}`));
  return { events, tasks: taskActivities, intimations: intimationActivities, activities };
}

export function createAgendaFeature({
  store = Store,
  documentRef = globalThis.document,
  escapeHtml,
  formatDate,
  formatMinutes,
  totalTimeMinutes,
  classifyIntimation,
  getIntimationParties,
  openModal,
  showToast,
  onOpenTask,
  onOpenIntimation
} = {}) {
  let initialized = false;
  let selectedDate = null;
  let calendarMonthOffset = 0;
  let typeFilter = 'all';
  const presenter = createAgendaPresenter({ escapeHtml, formatMinutes });

  const byId = id => documentRef?.getElementById(id);
  const isV2 = () => documentRef?.documentElement?.dataset?.ui === 'v2';

  const feature = {
    get initialized() { return initialized; },
    get selectedDate() { return selectedDate; },
    set selectedDate(value) { selectedDate = value; },
    get calendarMonthOffset() { return calendarMonthOffset; },
    set calendarMonthOffset(value) { calendarMonthOffset = Number(value) || 0; },
    get typeFilter() { return typeFilter; },
    set typeFilter(value) { typeFilter = value || 'all'; },

    init() {
      if (initialized) return false;
      initialized = true;
      this.bindListeners();
      return true;
    },

    bindListeners() {
      byId('newAgendaButton')?.addEventListener('click', () => this.openModal());
      byId('agendaFilterTabs')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-agenda-filter]');
        if (!button) return;
        typeFilter = button.dataset.agendaFilter;
        this.render();
      });
      byId('agendaTodayButton')?.addEventListener('click', () => {
        selectedDate = isoDate();
        calendarMonthOffset = 0;
        this.render();
        showToast?.('Exibindo atividades de hoje.', 'success');
      });
      byId('agendaAllUpcomingButton')?.addEventListener('click', () => {
        selectedDate = null;
        this.render();
        showToast?.('Exibindo todas as atividades próximas.', 'success');
      });
    },

    openModal(defaults = {}) {
      openModal?.('agenda', defaults.id ? 'Detalhes do compromisso' : 'Novo compromisso', 'Agenda jurídica', [
        { name: 'title', label: 'Compromisso', required: true, full: true }, { name: 'date', label: 'Data', type: 'date', required: true }, { name: 'time', label: 'Horário', type: 'time' },
        { name: 'client', label: 'Cliente / partes' }, { name: 'process', label: 'Processo' }, { name: 'location', label: 'Local' },
        { name: 'source', label: 'Origem', type: 'select', options: [{value:'Interna',label:'Interna'},{value:'Agenda externa',label:'Agenda externa'},{value:'Importação',label:'Importação'}] },
        { name: 'description', label: 'Observações', type: 'textarea', full: true }
      ], { date: isoDate(), source: 'Interna', ...defaults });
    },

    saveRecord(data, defaults = {}) {
      const editing = Boolean(defaults.id);
      const record = {
        id: defaults.id || uid('agenda'),
        externalId: defaults.externalId || null,
        ...defaults,
        ...data,
        updatedAt: new Date().toISOString()
      };
      store.upsert('agenda', record);
      store.audit(editing ? 'Compromisso atualizado' : 'Compromisso cadastrado', `${record.title} · ${formatDate(record.date)}`);
      return record;
    },

    render() {
      const result = collectAgendaActivities({
        agenda: store.state.agenda,
        tasks: store.state.tasks,
        intimations: store.state.intimations,
        selectedDate,
        typeFilter,
        today: isoDate(),
        classifyIntimation,
        getIntimationParties,
        totalTimeMinutes
      });
      const { events, tasks, intimations, activities } = result;

      const titleEl = byId('agendaDayTitle');
      const eyebrowEl = byId('agendaDayEyebrow');
      const badgesEl = byId('agendaDayBadges');
      const filterTabs = byId('agendaFilterTabs');
      filterTabs?.querySelectorAll('button[data-agenda-filter]').forEach(button => {
        const active = button.dataset.agendaFilter === typeFilter;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      if (titleEl && eyebrowEl) {
        if (selectedDate) {
          eyebrowEl.textContent = isV2()
            ? (selectedDate === isoDate() ? 'Hoje' : 'Dia selecionado')
            : (selectedDate === isoDate() ? 'Atividades de Hoje' : 'Atividades da Data Selecionada');
          titleEl.textContent = formatDate(selectedDate);
        } else {
          eyebrowEl.textContent = isV2() ? 'Linha temporal integrada' : 'Agenda Integrada';
          titleEl.textContent = isV2() ? 'Próximas atividades' : 'Próximas atividades e prazos';
        }
      }
      if (badgesEl) {
        badgesEl.innerHTML = isV2() ? presenter.renderSummary({ events, tasks, intimations }) : `
          <span class="status-chip planned">${events.length} evento(s)</span>
          <span class="status-chip connected">${tasks.length} prazo(s)/tarefa(s)</span>
          <span class="status-chip warning">${intimations.length} intimação(ões)</span>
        `;
      }

      const listEl = byId('agendaList');
      if (listEl) {
        listEl.innerHTML = isV2() ? presenter.renderActivities({
          activities,
          selectedDate,
          today: isoDate()
        }) : activities.length ? activities.map(item => {
          const date = item.date ? new Date(`${item.date}T12:00:00`) : new Date();
          const validDate = !Number.isNaN(date.getTime());
          const dayNum = validDate ? String(date.getDate()).padStart(2, '0') : '—';
          const monthShort = validDate ? new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '') : '';

          let typeClass = '';
          let chipHtml = '';
          if (item.type === 'event') {
            const internalSource = String(item.source || '').trim().toLocaleLowerCase('pt-BR') === 'interna';
            chipHtml = `<span class="status-chip ${internalSource ? 'muted' : 'planned'}">${internalSource ? 'Interna' : 'Agenda externa'}</span>`;
          } else if (item.type === 'task') {
            typeClass = item.isFatal ? 'fatal-type' : 'task-type';
            const timeBadge = item.timeMins > 0 ? `<span class="task-timelog">⏱ ${formatMinutes(item.timeMins)}</span>` : '';
            chipHtml = `<div style="display:flex;gap:5px;align-items:center;">${timeBadge}<span class="status-chip ${item.isFatal ? 'danger' : 'connected'}">${item.isFatal ? 'Prazo Fatal' : 'Tarefa'}</span></div>`;
          } else if (item.type === 'intimation') {
            typeClass = 'intimation-type';
            chipHtml = `<span class="act-chip ${item.act.css}">${escapeHtml(item.act.label)}</span>`;
          }

          return `
            <div class="agenda-item" data-agenda-activity-type="${item.type}" data-agenda-activity-id="${escapeHtml(item.id)}" tabindex="0">
              <div class="agenda-date ${typeClass}">
                <strong>${dayNum}</strong>
                <small>${monthShort}</small>
              </div>
              <div class="agenda-copy">
                <strong>${escapeHtml(item.title)}</strong>
                <small>${escapeHtml(item.subtitle)} · ${escapeHtml(item.time)}</small>
              </div>
              ${chipHtml}
            </div>
          `;
        }).join('') : `<div class="empty-detail"><span>□</span><h3>Nenhuma atividade</h3><p>${selectedDate ? 'Não há eventos, tarefas ou intimações para esta data.' : 'Nenhuma atividade próxima encontrada.'}</p></div>`;

        const openActivity = row => {
            const activityType = row.dataset.agendaActivityType;
            const id = row.dataset.agendaActivityId;
            if (activityType === 'event') {
              const event = store.state.agenda.find(record => record.id === id);
              if (event) this.openModal(event);
            } else if (activityType === 'task') {
              const task = store.state.tasks.find(record => record.id === id);
              if (task) onOpenTask?.(task);
            } else if (activityType === 'intimation') {
              const intimation = store.state.intimations.find(record => record.id === id);
              if (intimation) onOpenIntimation?.(intimation);
            }
        };
        listEl.querySelectorAll('[data-agenda-activity-type]').forEach(row => {
          row.addEventListener('click', () => openActivity(row));
          if (row.tagName !== 'BUTTON') row.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            openActivity(row);
          });
        });
      }

      this.renderMiniCalendar();
      return result;
    },

    renderMiniCalendar(direction = '') {
      const offset = calendarMonthOffset || 0;
      const baseDate = new Date();
      baseDate.setDate(1);
      baseDate.setMonth(baseDate.getMonth() + offset);
      const year = baseDate.getFullYear();
      const month = baseDate.getMonth();
      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);

      const days = [];
      for (let index = 0; index < first.getDay(); index++) {
        days.push('<span class="calendar-day muted"></span>');
      }

      const agendaEvents = store.state.agenda || [];
      const tasks = store.state.tasks || [];
      const intimations = store.state.intimations || [];

      for (let day = 1; day <= last.getDate(); day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const hasEvent = agendaEvents.some(event => event.date === dateStr);
        const hasTask = tasks.some(task => task.deadline === dateStr);
        const hasFatal = tasks.some(task => task.fatalDeadline === dateStr);
        const hasIntimation = intimations.some(intimation => intimation.publishedAt === dateStr || (intimation.createdAt && intimation.createdAt.slice(0, 10) === dateStr));

        const indicators = [];
        if (hasEvent) indicators.push('<i class="cal-dot event" title="Compromisso"></i>');
        if (hasFatal) indicators.push('<i class="cal-dot fatal" title="Prazo fatal"></i>');
        else if (hasTask) indicators.push('<i class="cal-dot task" title="Tarefa/prazo"></i>');
        if (hasIntimation) indicators.push('<i class="cal-dot intimation" title="Intimação"></i>');

        const isToday = dateStr === isoDate();
        const isSelected = dateStr === selectedDate;

        days.push(`
          <button class="calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-cal-date="${dateStr}">
            <span>${day}</span>
            <span class="cal-indicators">${indicators.join('')}</span>
          </button>
        `);
      }

      const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(baseDate);
      const calEl = byId('miniCalendar');
      if (calEl) {
        calEl.innerHTML = isV2() ? presenter.renderCalendar({
          year,
          month,
          selectedDate,
          today: isoDate(),
          agenda: agendaEvents,
          tasks,
          intimations,
          direction
        }) : `
          <header class="calendar-header">
            <h3>${monthName}</h3>
            <div class="calendar-nav">
              <button id="calPrevMonth" title="Mês anterior">◀</button>
              <button id="calNextMonth" title="Próximo mês">▶</button>
            </div>
          </header>
          <div class="calendar-grid">
            ${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(day => `<span class="calendar-weekday">${day}</span>`).join('')}
            ${days.join('')}
          </div>
        `;

        calEl.querySelector('#calPrevMonth')?.addEventListener('click', event => {
          event.stopPropagation();
          calendarMonthOffset = (calendarMonthOffset || 0) - 1;
          this.renderMiniCalendar('previous');
        });
        calEl.querySelector('#calNextMonth')?.addEventListener('click', event => {
          event.stopPropagation();
          calendarMonthOffset = (calendarMonthOffset || 0) + 1;
          this.renderMiniCalendar('next');
        });
        calEl.querySelectorAll('.calendar-day[data-cal-date]').forEach(button => {
          button.addEventListener('click', () => {
            const clickedDate = button.dataset.calDate;
            selectedDate = selectedDate === clickedDate ? null : clickedDate;
            this.render();
          });
        });
      }
    }
  };

  return feature;
}
