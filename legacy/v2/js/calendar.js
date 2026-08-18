/**
 * Calendar Module - Calendário Integrado
 */

const Calendar = {
    currentDate: new Date(),
    view: 'month', // month, week

    /**
     * Inicializa o calendário
     */
    init() {
        // Abas já existem no HTML, não precisa adicionar
    },

    /**
     * Renderiza o calendário
     */
    render() {
        const container = document.getElementById('calendarView');
        if (!container) return;

        container.innerHTML = `
            <div class="calendar-container">
                <div class="calendar-header">
                    <button class="btn btn-icon" onclick="Calendar.prevMonth()">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="15 18 9 12 15 6"/>
                        </svg>
                    </button>
                    <h2 class="calendar-title">${this.getMonthYear()}</h2>
                    <button class="btn btn-icon" onclick="Calendar.nextMonth()">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"/>
                        </svg>
                    </button>
                    <button class="btn btn-secondary" onclick="Calendar.goToToday()">Hoje</button>
                    <button class="btn btn-primary-outline" onclick="Calendar.exportToICS()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Exportar .ics
                    </button>
                </div>
                <div class="calendar-grid">
                    <div class="calendar-weekdays">
                        <span>Dom</span>
                        <span>Seg</span>
                        <span>Ter</span>
                        <span>Qua</span>
                        <span>Qui</span>
                        <span>Sex</span>
                        <span>Sáb</span>
                    </div>
                    <div class="calendar-days" id="calendarDays">
                        ${this.renderDays()}
                    </div>
                </div>
                <div class="calendar-legend">
                    <span><span class="legend-dot audiencia"></span> Audiência</span>
                    <span><span class="legend-dot prazo"></span> Prazo</span>
                    <span><span class="legend-dot reuniao"></span> Reunião</span>
                    <span><span class="legend-dot tarefa"></span> Tarefa</span>
                </div>
            </div>
        `;
    },

    /**
     * Obtém mês e ano formatados
     */
    getMonthYear() {
        return this.currentDate.toLocaleDateString('pt-BR', {
            month: 'long',
            year: 'numeric'
        }).replace(/^\w/, c => c.toUpperCase());
    },

    /**
     * Renderiza os dias do mês
     */
    renderDays() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startingDay = firstDay.getDay();
        const totalDays = lastDay.getDate();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tasks = Storage.getTasks();
        const tasksByDate = this.groupTasksByDate(tasks);

        let html = '';

        // Dias vazios no início
        for (let i = 0; i < startingDay; i++) {
            html += '<div class="calendar-day empty"></div>';
        }

        // Dias do mês
        for (let day = 1; day <= totalDays; day++) {
            const date = new Date(year, month, day);
            const dateKey = date.toISOString().split('T')[0];
            const dayTasks = tasksByDate[dateKey] || [];

            const isToday = date.getTime() === today.getTime();
            const isPast = date < today;

            html += `
                <div class="calendar-day ${isToday ? 'today' : ''} ${isPast ? 'past' : ''} ${dayTasks.length > 0 ? 'has-tasks' : ''}" 
                     onclick="Calendar.showDayTasks('${dateKey}')">
                    <span class="day-number">${day}</span>
                    <div class="day-tasks">
                        ${dayTasks.slice(0, 3).map(task => `
                            <div class="day-task-dot ${task.type || 'tarefa'}" title="${task.title}"></div>
                        `).join('')}
                        ${dayTasks.length > 3 ? `<span class="more-tasks">+${dayTasks.length - 3}</span>` : ''}
                    </div>
                </div>
            `;
        }

        return html;
    },

    /**
     * Agrupa tarefas por data
     */
    groupTasksByDate(tasks) {
        const grouped = {};

        tasks.forEach(task => {
            if (!task.deadline) return;
            if (['concluida-sucesso', 'concluida-sem-sucesso', 'cancelado'].includes(task.status)) return;

            const dateKey = task.deadline;
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push(task);
        });

        return grouped;
    },

    /**
     * Mostra tarefas do dia ou abre modal para nova tarefa
     */
    showDayTasks(dateKey) {
        const tasks = Storage.getTasks().filter(t =>
            t.deadline === dateKey &&
            !['concluida-sucesso', 'concluida-sem-sucesso', 'cancelado'].includes(t.status)
        );

        const date = new Date(dateKey + 'T00:00:00');
        const dateFormatted = date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

        if (tasks.length === 0) {
            // Sem tarefas - perguntar se quer criar
            if (confirm(`📅 ${dateFormatted}\n\nNenhuma tarefa neste dia.\n\nDeseja criar uma nova tarefa?`)) {
                this.openNewTaskWithDate(dateKey);
            }
            return;
        }

        // Com tarefas - mostrar lista e opção de criar nova
        let message = `📅 ${dateFormatted}:\n\n`;

        tasks.forEach((task, i) => {
            const typeEmoji = { audiencia: '⚖️', prazo: '📅', reuniao: '👥', tarefa: '📝', lembrete: '🔔' };
            message += `${typeEmoji[task.type] || '📋'} ${task.title}\n`;
            if (task.time) message += `   ⏰ ${task.time}\n`;
            if (task.client) message += `   👤 ${task.client}\n`;
            message += '\n';
        });

        message += '─────────────────────\nClique OK para adicionar nova tarefa neste dia.';

        if (confirm(message)) {
            this.openNewTaskWithDate(dateKey);
        }
    },

    /**
     * Abre modal de nova tarefa com data preenchida
     */
    openNewTaskWithDate(dateKey) {
        // Abrir modal de nova tarefa
        Modals.openNewTaskModal();

        // Preencher a data fatal com a data clicada
        setTimeout(() => {
            const deadlineInput = document.getElementById('taskDeadline');
            if (deadlineInput) {
                deadlineInput.value = dateKey;
            }
            // Também preencher data prevista
            const dueDateInput = document.getElementById('taskDueDate');
            if (dueDateInput) {
                dueDateInput.value = dateKey;
            }
        }, 100);
    },

    /**
     * Mês anterior
     */
    prevMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        this.render();
    },

    /**
     * Próximo mês
     */
    nextMonth() {
        this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        this.render();
    },

    /**
     * Ir para hoje
     */
    goToToday() {
        this.currentDate = new Date();
        this.render();
    },

    /**
     * Exporta para formato .ics (iCalendar)
     */
    exportToICS() {
        const tasks = Storage.getTasks().filter(t =>
            t.deadline && !['concluida-sucesso', 'concluida-sem-sucesso', 'cancelado'].includes(t.status)
        );

        if (tasks.length === 0) {
            Toast.show('Nenhuma tarefa para exportar', 'warning');
            return;
        }

        let ics = 'BEGIN:VCALENDAR\r\n';
        ics += 'VERSION:2.0\r\n';
        ics += 'PRODID:-//Kanban Escritorio//PT\r\n';
        ics += 'CALSCALE:GREGORIAN\r\n';
        ics += 'METHOD:PUBLISH\r\n';

        tasks.forEach(task => {
            const deadline = task.deadline.replace(/-/g, '');
            const time = task.time ? task.time.replace(':', '') + '00' : '090000';
            const dtstart = `${deadline}T${time}`;

            ics += 'BEGIN:VEVENT\r\n';
            ics += `UID:${task.id}@kanban-escritorio\r\n`;
            ics += `DTSTART:${dtstart}\r\n`;
            ics += `SUMMARY:${task.title}\r\n`;
            if (task.description) ics += `DESCRIPTION:${task.description.replace(/\n/g, '\\n')}\r\n`;
            if (task.location) ics += `LOCATION:${task.location}\r\n`;
            if (task.client) ics += `DESCRIPTION:Cliente: ${task.client}\r\n`;
            ics += 'END:VEVENT\r\n';
        });

        ics += 'END:VCALENDAR';

        // Download
        const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kanban-calendario-${new Date().toISOString().split('T')[0]}.ics`;
        a.click();
        URL.revokeObjectURL(url);

        Toast.show('Calendário exportado!', 'success');
    }
};
