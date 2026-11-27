import { Store, isoDate, uid } from '../core/store.js?v=3.4.0';
import {
  RECURRENCE_FREQUENCIES,
  applyRecurrenceEdit,
  describeRecurrence,
  materializeCollection,
  parseOccurrenceId
} from '../core/recurrence.js?v=3.4.0';
import { createAgendaPresenter } from '../views/ui-v2/agenda-presenter.js?v=3.4.0';
import { iconSvg } from '../views/ui-v2/icons.js?v=3.4.0';
import { activeIntimations } from '../core/publication-scope.js?v=3.4.0';
const plural = (count, singular, pluralForm) => `${count} ${Number(count) === 1 ? singular : pluralForm}`;

function addDaysIso(dateOnly, days) {
  const date = new Date(`${dateOnly}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function deadlineKickerHint(task) {
  const source = String(task?.deadlineSource || task?.sourceReportedDeadlineSource || '').trim().toLowerCase();
  if (source === 'pje') return 'Data limite prevista para manifestação, declarada pelo PJe';
  if (source === 'eproc') return 'Prazo declarado pelo eproc (fonte oficial)';
  if (source === 'domicilio') return 'Data informada pelo Domicílio Eletrônico: é referência, o prazo oficial vem do eproc';
  return 'Data definida por pessoa nesta tarefa';
}

function deadlineKicker(task) {
  const source = String(task?.deadlineSource || task?.sourceReportedDeadlineSource || '').trim().toLowerCase();
  if (source === 'pje') return 'Data limite PJe';
  if (source === 'eproc') return 'Prazo eproc';
  if (source === 'domicilio') return 'Referência do Domicílio';
  return 'Prazo da tarefa';
}

export function collectAgendaActivities({
  agenda = [],
  tasks = [],
  intimations = [],
  selectedDate = null,
  typeFilter = 'all',
  today = isoDate(),
  classifyIntimation,
  getIntimationParties,
  getTeamMember = () => null,
  totalTimeMinutes
} = {}) {
  const matchesDate = date => (selectedDate ? date === selectedDate : (!date || date >= today));
  // "00:00" sozinho não é horário confiável: a agenda externa (Webcal) grava compromisso sem
  // hora como T000000, e a sessão virtual do eproc começa às 00:00 e vai até `sessionEnd`.
  // Só a apresentação muda; o registro gravado fica intacto.
  const agendaTimeLabel = event => {
    const time = String(event.time || '').trim();
    if (!time) return 'Dia inteiro';
    if (time !== '00:00') return time;
    const end = String(event.sessionEnd || '').trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(end)) return `Sessão virtual · até ${end.slice(8, 10)}/${end.slice(5, 7)} ${end.slice(11, 16)}`;
    const text = `${event.title || ''} ${event.description || ''}`;
    if (event.source === 'Agenda externa' && !/\b0?0[:h]00\b|meia-noite/i.test(text)) return 'Dia inteiro';
    return time;
  };

  const events = [];
  for (const event of agenda) {
    if (!matchesDate(event.date)) continue;
    events.push({
      type: 'event',
      id: event.id,
      date: event.date,
      time: agendaTimeLabel(event),
      sortTime: String(event.time || '').trim(),
      title: event.title,
      subtitle: `${event.client || event.process || (event.source === 'Agenda pessoal' ? 'Agenda pessoal' : 'Compromisso interno')}${event.location ? ` · ${event.location}` : ''}${event.seriesId || event.recurrence?.exceptionOf ? ' · Série recorrente' : ''}`,
      source: event.source || 'Interna',
      recurring: Boolean(event.seriesId || event.recurrence?.seriesId),
      raw: event
    });
  }

  const taskActivities = [];
  for (const task of tasks) {
    if (!task.fatalDeadline && !task.deadline) continue;
    const isFatal = Boolean(task.fatalDeadline);
    const targetDate = task.fatalDeadline || task.deadline;
    if (!matchesDate(targetDate)) continue;
    const timeMins = totalTimeMinutes(task.timeLogs);
    const rawTime = String(task.time || '').trim();
    const shortTime = /^\d{1,2}:\d{2}/.test(rawTime) ? rawTime.slice(0, 5) : '';
    taskActivities.push({
      type: 'task',
      id: task.id,
      date: targetDate,
      time: isFatal ? 'Prazo fatal' : (shortTime || deadlineKicker(task)),
      timeHint: isFatal ? 'Prazo fatal definido por pessoa nesta tarefa' : deadlineKickerHint(task),
      title: task.title,
      subtitle: `${task.process ? `${task.process} · ` : ''}${task.client || 'Tarefa interna'}${task.points ? ` · ${task.points} pts` : ''}`,
      isFatal,
      status: task.status,
      timeMins,
      source: isFatal ? 'Fatal' : 'Tarefa',
      member: getTeamMember(task) || null,
      raw: task
    });
  }

  const intimationActivities = [];
  for (const intimation of intimations) {
    const targetDate = intimation.publishedAt || (intimation.createdAt ? intimation.createdAt.slice(0, 10) : today);
    if (!matchesDate(targetDate)) continue;
    const act = classifyIntimation(intimation);
    intimationActivities.push({
      type: 'intimation',
      id: intimation.id,
      date: targetDate,
      time: 'Publicação',
      title: intimation.title,
      subtitle: `${intimation.process || 'Sem processo'} · ${getIntimationParties(intimation) || 'Partes não vinculadas'}`,
      act,
      source: 'Intimação',
      raw: intimation
    });
  }

  let activities;
  if (typeFilter === 'event') activities = [...events];
  else if (typeFilter === 'task') activities = [...taskActivities];
  else if (typeFilter === 'intimation') activities = [...intimationActivities];
  else activities = [...events, ...taskActivities, ...intimationActivities];

  // Ordena pelo horário gravado, não pelo rótulo ("Dia inteiro" e "Sessão virtual" ficam no começo do dia, como antes).
  activities.sort((a, b) => `${a.date || ''} ${a.sortTime ?? a.time ?? ''}`.localeCompare(`${b.date || ''} ${b.sortTime ?? b.time ?? ''}`));
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
  getTeamMember = () => null,
  openModal,
  showToast,
  onOpenTask,
  onOpenIntimation
} = {}) {
  let initialized = false;
  let selectedDate = null;
  let calendarMonthOffset = 0;
  let typeFilter = 'all';
  let lastMaterializedAgenda = [];
  const boundAgendaLists = new WeakSet();
  const boundCalendars = new WeakSet();
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
      const occurrence = parseOccurrenceId(defaults.id || '');
      const isMaster = Boolean(defaults.recurrence?.seriesId && !defaults.recurrence?.exceptionOf);
      const fields = [
        { name: 'title', label: 'Compromisso', required: true, full: true }, { name: 'date', label: 'Data', type: 'date', required: true }, { name: 'time', label: 'Horário', type: 'time' },
        { name: 'client', label: 'Cliente / partes', type: 'combobox', identityName: 'contactId', suggestions: (store.state.contacts || []).map(contact => ({ id: contact.id, value: contact.name, label: 'Contato / cliente' })) },
        { name: 'process', label: 'Processo', type: 'combobox', identityName: 'processId', suggestions: (store.state.processes || []).map(process => ({ id: process.id, value: process.number || process.client || 'Processo sem número', label: process.client || 'Processo' })) }, { name: 'location', label: 'Local' },
        { name: 'source', label: 'Origem', type: 'select', options: [{value:'Interna',label:'Interna'},{value:'Agenda externa',label:'Agenda externa'},{value:'Importação',label:'Importação'},...(defaults.source === 'Agenda pessoal' ? [{value:'Agenda pessoal',label:'Agenda pessoal'}] : [])] },
        { name: 'description', label: 'Observações', type: 'textarea', full: true }
      ];
      if (occurrence) {
        fields.push({
          name: 'recurrenceScope',
          label: 'Aplicar alteração a',
          type: 'select',
          full: true,
          options: [
            { value: 'single', label: 'Somente esta ocorrência' },
            { value: 'following', label: 'Esta e as seguintes' },
            { value: 'series', label: 'Toda a série' }
          ],
          note: `Ocorrência de série recorrente (${describeRecurrence(defaults.recurrence?.rule)}).`
        });
      } else if (!defaults.id || isMaster) {
        fields.push({
          name: 'recurrenceFrequency',
          label: 'Repetição',
          type: 'select',
          full: true,
          options: [
            { value: '', label: 'Não repetir' },
            { value: 'daily', label: 'Diária' },
            { value: 'weekly', label: 'Semanal' },
            { value: 'monthly', label: 'Mensal' },
            { value: 'yearly', label: 'Anual' }
          ],
          note: 'Séries podem ser editadas por ocorrência, pelas seguintes ou inteiras.'
        });
      }
      openModal?.('agenda', defaults.id ? 'Detalhes do compromisso' : 'Novo compromisso', 'Agenda jurídica', fields, {
        date: isoDate(),
        source: 'Interna',
        recurrenceFrequency: defaults.recurrence?.rule?.frequency || '',
        recurrenceScope: 'series',
        ...defaults
      });
    },

    saveRecord(data, defaults = {}) {
      const editing = Boolean(defaults.id);
      const occurrence = parseOccurrenceId(defaults.id || '');
      const { recurrenceFrequency = '', recurrenceScope = 'series', ...fields } = data;
      if (occurrence) {
        const scope = ['single', 'following', 'series'].includes(recurrenceScope) ? recurrenceScope : 'series';
        const result = applyRecurrenceEdit({
          items: store.state.agenda || [],
          masterId: occurrence.seriesId,
          occurrenceDate: occurrence.date,
          scope,
          patch: fields,
          createId: prefix => uid(prefix)
        });
        if (!result.ok) return null;
        for (const id of result.changedIds || []) {
          const record = result.items.find(item => item.id === id);
          if (record) store.upsert('agenda', record);
        }
        const labels = {
          single: 'Compromisso atualizado (ocorrência da série)',
          following: 'Série de compromissos dividida',
          series: 'Série de compromissos atualizada'
        };
        store.audit(labels[scope], `${fields.title || defaults.title || 'Compromisso'} · ${formatDate(occurrence.date)} · ${describeRecurrence(defaults.recurrence?.rule)}`);
        return result.items.find(item => item.id === (result.exceptionId || result.newSeriesId || result.seriesId)) || null;
      }
      const record = {
        id: defaults.id || uid('agenda'),
        externalId: defaults.externalId || null,
        ...defaults,
        ...fields,
        updatedAt: new Date().toISOString()
      };
      const frequency = RECURRENCE_FREQUENCIES.includes(recurrenceFrequency) ? recurrenceFrequency : null;
      if (frequency) {
        record.recurrence = {
          rule: { ...(defaults.recurrence?.rule || {}), frequency, interval: defaults.recurrence?.rule?.interval || 1 },
          seriesId: defaults.recurrence?.seriesId || record.id,
          startDate: defaults.recurrence?.startDate || record.date
        };
      } else if (defaults.recurrence && !defaults.recurrence.exceptionOf) {
        delete record.recurrence;
      }
      store.upsert('agenda', record);
      store.audit(
        editing
          ? (frequency ? 'Série de compromissos atualizada' : 'Compromisso atualizado')
          : (frequency ? 'Compromisso recorrente cadastrado' : 'Compromisso cadastrado'),
        `${record.title} · ${formatDate(record.date)}${frequency ? ` · ${describeRecurrence(record.recurrence?.rule)}` : ''}`
      );
      return record;
    },

    render() {
      const today = isoDate();
      const agendaWindow = selectedDate
        ? { from: selectedDate, to: selectedDate }
        : { from: today, to: addDaysIso(today, 120) };
      const materializedAgenda = materializeCollection(store.state.agenda || [], agendaWindow);
      lastMaterializedAgenda = materializedAgenda;
      const result = collectAgendaActivities({
        agenda: materializedAgenda,
        tasks: (store.state.tasks || []).filter(task => task && task.active !== false && !task.absorbedInto),
        intimations: activeIntimations(store.state.intimations || []),
        selectedDate,
        typeFilter,
        today,
        classifyIntimation,
        getIntimationParties,
        getTeamMember,
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
          <span class="status-chip planned">${plural(events.length, 'evento', 'eventos')}</span>
          <span class="status-chip connected">${plural(tasks.length, 'prazo ou tarefa', 'prazos ou tarefas')}</span>
          <span class="status-chip warning">${plural(intimations.length, 'intimação', 'intimações')}</span>
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
            const timeBadge = item.timeMins > 0 ? `<span class="task-timelog">${iconSvg('deadline')} ${formatMinutes(item.timeMins)}</span>` : '';
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
        }).join('') : `<div class="empty-detail"><span>□</span><h3>Nenhuma atividade</h3><p>${selectedDate ? 'Não há eventos, tarefas ou intimações para esta data.' : 'Crie um compromisso ou uma tarefa com data para vê-los aqui.'}</p></div>`;

        if (!boundAgendaLists.has(listEl)) {
          boundAgendaLists.add(listEl);
          const openActivity = row => {
            const activityType = row.dataset.agendaActivityType;
            const id = row.dataset.agendaActivityId;
            if (activityType === 'event') {
              const event = lastMaterializedAgenda.find(record => record.id === id) || store.state.agenda.find(record => record.id === id);
              if (event) this.openModal(event);
            } else if (activityType === 'task') {
              const task = store.state.tasks.find(record => record.id === id);
              if (task) onOpenTask?.(task);
            } else if (activityType === 'intimation') {
              const intimation = store.state.intimations.find(record => record.id === id);
              if (intimation) onOpenIntimation?.(intimation);
            }
          };
          listEl.addEventListener('click', event => {
            const row = event.target.closest?.('[data-agenda-activity-type]');
            if (row && listEl.contains(row)) openActivity(row);
          });
          listEl.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const row = event.target.closest?.('[data-agenda-activity-type]');
            if (!row || row.tagName === 'BUTTON' || !listEl.contains(row)) return;
            event.preventDefault();
            openActivity(row);
          });
        }
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

      const monthPad = value => String(value).padStart(2, '0');
      const monthPrefix = `${year}-${monthPad(month + 1)}`;
      const todayStr = isoDate();
      const agendaEvents = materializeCollection(store.state.agenda || [], {
        from: `${monthPrefix}-01`,
        to: `${monthPrefix}-${monthPad(last.getDate())}`
      });
      const tasks = (store.state.tasks || []).filter(task => task && task.active !== false && !task.absorbedInto);
      const intimations = activeIntimations(store.state.intimations || []);

      const calEl = byId('miniCalendar');
      if (calEl) {
        if (isV2()) {
          calEl.innerHTML = presenter.renderCalendar({
            year,
            month,
            selectedDate,
            today: todayStr,
            agenda: agendaEvents,
            tasks,
            intimations,
            direction
          });
        } else {
          const days = [];
          for (let index = 0; index < first.getDay(); index++) {
            days.push('<span class="calendar-day muted"></span>');
          }
          for (let day = 1; day <= last.getDate(); day++) {
            const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
            const hasEvent = agendaEvents.some(event => event.date === dateStr);
            const hasTask = tasks.some(task => task.deadline === dateStr);
            const hasFatal = tasks.some(task => task.fatalDeadline === dateStr);
            const hasIntimation = intimations.some(intimation => (intimation.publishedAt || intimation.createdAt?.slice(0, 10)) === dateStr);

            const indicators = [];
            if (hasEvent) indicators.push('<i class="cal-dot event" title="Compromisso"></i>');
            if (hasFatal) indicators.push('<i class="cal-dot fatal" title="Prazo fatal"></i>');
            else if (hasTask) indicators.push('<i class="cal-dot task" title="Tarefa/prazo"></i>');
            if (hasIntimation) indicators.push('<i class="cal-dot intimation" title="Intimação"></i>');

            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;

            days.push(`
              <button class="calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-cal-date="${dateStr}">
                <span>${day}</span>
                <span class="cal-indicators">${indicators.join('')}</span>
              </button>
            `);
          }
          const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(baseDate);
          calEl.innerHTML = `
            <header class="calendar-header">
              <h3>${monthName}</h3>
              <div class="calendar-nav">
                <button id="calPrevMonth" title="Mês anterior">${iconSvg('chevron-left')}</button>
                <button id="calNextMonth" title="Próximo mês">${iconSvg('chevron-right')}</button>
              </div>
            </header>
            <div class="calendar-grid">
              ${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(day => `<span class="calendar-weekday">${day}</span>`).join('')}
              ${days.join('')}
            </div>
          `;
        }

        if (!boundCalendars.has(calEl)) {
          boundCalendars.add(calEl);
          calEl.addEventListener('click', event => {
            if (event.target.closest?.('#calPrevMonth')) {
              event.stopPropagation();
              calendarMonthOffset = (calendarMonthOffset || 0) - 1;
              this.renderMiniCalendar('previous');
              return;
            }
            if (event.target.closest?.('#calNextMonth')) {
              event.stopPropagation();
              calendarMonthOffset = (calendarMonthOffset || 0) + 1;
              this.renderMiniCalendar('next');
              return;
            }
            const dayButton = event.target.closest?.('.calendar-day[data-cal-date]');
            if (!dayButton || !calEl.contains(dayButton)) return;
            const clickedDate = dayButton.dataset.calDate;
            selectedDate = selectedDate === clickedDate ? null : clickedDate;
            this.render();
          });
        }
      }
    }
  };

  return feature;
}
