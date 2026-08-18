/**
 * Dashboard Module - Métricas e Estatísticas
 */

const Dashboard = {
    /**
     * Inicializa o dashboard
     */
    init() {
        // Abas já existem no HTML, não precisa adicionar
    },

    /**
     * Renderiza o dashboard
     */
    render() {
        const container = document.getElementById('dashboardView');
        if (!container) return;

        const stats = this.calculateStats();

        container.innerHTML = `
            <div class="dashboard-container">
                <!-- Cards de Resumo -->
                <div class="dashboard-cards">
                    <div class="stat-card stat-total">
                        <div class="stat-icon">📋</div>
                        <div class="stat-info">
                            <span class="stat-value">${stats.total}</span>
                            <span class="stat-label">Total de Tarefas</span>
                        </div>
                    </div>
                    <div class="stat-card stat-pending">
                        <div class="stat-icon">⏳</div>
                        <div class="stat-info">
                            <span class="stat-value">${stats.pending}</span>
                            <span class="stat-label">Pendentes</span>
                        </div>
                    </div>
                    <div class="stat-card stat-progress">
                        <div class="stat-icon">🔄</div>
                        <div class="stat-info">
                            <span class="stat-value">${stats.inProgress}</span>
                            <span class="stat-label">Em Execução</span>
                        </div>
                    </div>
                    <div class="stat-card stat-completed">
                        <div class="stat-icon">✅</div>
                        <div class="stat-info">
                            <span class="stat-value">${stats.completed}</span>
                            <span class="stat-label">Concluídas</span>
                        </div>
                    </div>
                    <div class="stat-card stat-overdue">
                        <div class="stat-icon">🚨</div>
                        <div class="stat-info">
                            <span class="stat-value">${stats.overdue}</span>
                            <span class="stat-label">Vencidas</span>
                        </div>
                    </div>
                </div>

                <!-- Gráficos -->
                <div class="dashboard-charts">
                    <div class="chart-card">
                        <h3>📊 Tarefas por Status</h3>
                        <div class="chart-container">
                            ${this.renderStatusChart(stats)}
                        </div>
                    </div>
                    <div class="chart-card">
                        <h3>📅 Prazos desta Semana</h3>
                        <div class="week-deadlines">
                            ${this.renderWeekDeadlines()}
                        </div>
                    </div>
                </div>

                <!-- Tarefas por Tipo -->
                <div class="dashboard-section">
                    <h3>📋 Tarefas por Tipo</h3>
                    <div class="type-stats">
                        ${this.renderTypeStats(stats)}
                    </div>
                </div>

                <!-- Taxa de Conclusão -->
                <div class="dashboard-section">
                    <h3>📈 Taxa de Conclusão</h3>
                    <div class="completion-rate">
                        <div class="rate-bar">
                            <div class="rate-fill" style="width: ${stats.completionRate}%"></div>
                        </div>
                        <span class="rate-value">${stats.completionRate}%</span>
                    </div>
                </div>

                <!-- Atividade Recente -->
                <div class="dashboard-section">
                    <h3>🕐 Atividade Recente</h3>
                    <div class="recent-activity">
                        ${this.renderRecentActivity()}
                    </div>
                </div>
            </div>
        `;
    },

    /**
     * Calcula estatísticas
     */
    calculateStats() {
        const tasks = Storage.getTasks();
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const stats = {
            total: tasks.length,
            pending: 0,
            inProgress: 0,
            review: 0,
            completed: 0,
            cancelled: 0,
            overdue: 0,
            byType: {},
            completionRate: 0
        };

        tasks.forEach(task => {
            // Por status
            switch (task.status) {
                case 'pendente': stats.pending++; break;
                case 'em-execucao': stats.inProgress++; break;
                case 'revisao': stats.review++; break;
                case 'concluida-sucesso':
                case 'concluida-sem-sucesso':
                    stats.completed++; break;
                case 'cancelado': stats.cancelled++; break;
            }

            // Vencidas
            if (task.deadline && !['concluida-sucesso', 'concluida-sem-sucesso', 'cancelado'].includes(task.status)) {
                const deadline = new Date(task.deadline);
                deadline.setHours(0, 0, 0, 0);
                if (deadline < now) stats.overdue++;
            }

            // Por tipo
            const type = task.type || 'outros';
            stats.byType[type] = (stats.byType[type] || 0) + 1;
        });

        // Taxa de conclusão
        const completable = stats.total - stats.cancelled;
        stats.completionRate = completable > 0
            ? Math.round((stats.completed / completable) * 100)
            : 0;

        return stats;
    },

    /**
     * Renderiza gráfico de status
     */
    renderStatusChart(stats) {
        const data = [
            { label: 'Pendente', value: stats.pending, color: '#9e9e9e' },
            { label: 'Em Execução', value: stats.inProgress, color: '#2196f3' },
            { label: 'Revisão', value: stats.review, color: '#ff9800' },
            { label: 'Concluídas', value: stats.completed, color: '#4caf50' },
            { label: 'Canceladas', value: stats.cancelled, color: '#f44336' }
        ];

        const total = data.reduce((acc, d) => acc + d.value, 0);
        if (total === 0) return '<p class="empty-message">Nenhuma tarefa</p>';

        return data.map(d => {
            const percentage = Math.round((d.value / total) * 100);
            return `
                <div class="chart-bar-item">
                    <div class="bar-label">${d.label}</div>
                    <div class="bar-track">
                        <div class="bar-fill" style="width: ${percentage}%; background: ${d.color}"></div>
                    </div>
                    <div class="bar-value">${d.value} (${percentage}%)</div>
                </div>
            `;
        }).join('');
    },

    /**
     * Renderiza prazos da semana
     */
    renderWeekDeadlines() {
        const tasks = Storage.getTasks();
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const weekTasks = tasks.filter(task => {
            if (!task.deadline) return false;
            if (['concluida-sucesso', 'concluida-sem-sucesso', 'cancelado'].includes(task.status)) return false;

            const deadline = new Date(task.deadline);
            return deadline >= now && deadline <= weekEnd;
        }).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

        if (weekTasks.length === 0) {
            return '<p class="empty-message">Nenhum prazo esta semana 🎉</p>';
        }

        return weekTasks.slice(0, 5).map(task => {
            const deadline = new Date(task.deadline);
            const isToday = deadline.toDateString() === now.toDateString();

            return `
                <div class="week-item ${isToday ? 'today' : ''}" onclick="Modals.openEditTaskModal('${task.id}')">
                    <div class="week-date">
                        <span class="day">${deadline.getDate()}</span>
                        <span class="month">${deadline.toLocaleDateString('pt-BR', { weekday: 'short' })}</span>
                    </div>
                    <div class="week-info">
                        <div class="week-title">${task.title}</div>
                        <div class="week-meta">${task.client || task.type || ''}</div>
                    </div>
                    ${isToday ? '<span class="today-badge">HOJE</span>' : ''}
                </div>
            `;
        }).join('');
    },

    /**
     * Renderiza estatísticas por tipo
     */
    renderTypeStats(stats) {
        const typeLabels = {
            audiencia: { icon: '⚖️', label: 'Audiências' },
            prazo: { icon: '📅', label: 'Prazos' },
            reuniao: { icon: '👥', label: 'Reuniões' },
            tarefa: { icon: '📝', label: 'Tarefas' },
            lembrete: { icon: '🔔', label: 'Lembretes' },
            outros: { icon: '📋', label: 'Outros' }
        };

        return Object.entries(stats.byType).map(([type, count]) => {
            const info = typeLabels[type] || { icon: '📋', label: type };
            return `
                <div class="type-stat-item">
                    <span class="type-icon">${info.icon}</span>
                    <span class="type-label">${info.label}</span>
                    <span class="type-count">${count}</span>
                </div>
            `;
        }).join('') || '<p class="empty-message">Nenhuma tarefa</p>';
    },

    /**
     * Renderiza atividade recente
     */
    renderRecentActivity() {
        const tasks = Storage.getTasks()
            .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
            .slice(0, 5);

        if (tasks.length === 0) {
            return '<p class="empty-message">Nenhuma atividade</p>';
        }

        return tasks.map(task => {
            const date = new Date(task.updatedAt || task.createdAt);
            return `
                <div class="activity-item" onclick="Modals.openEditTaskModal('${task.id}')">
                    <div class="activity-icon">${this.getStatusIcon(task.status)}</div>
                    <div class="activity-info">
                        <div class="activity-title">${task.title}</div>
                        <div class="activity-meta">${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Obtém ícone do status
     */
    getStatusIcon(status) {
        const icons = {
            'pendente': '⏳',
            'em-execucao': '🔄',
            'revisao': '👀',
            'concluida-sucesso': '✅',
            'concluida-sem-sucesso': '❌',
            'cancelado': '🚫'
        };
        return icons[status] || '📋';
    }
};
