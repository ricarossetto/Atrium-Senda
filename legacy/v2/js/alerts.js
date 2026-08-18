/**
 * Alerts Module - Alertas de Prazo Fatal
 */

const Alerts = {
    alertSound: null,
    checkInterval: null,

    /**
     * Inicializa o sistema de alertas
     */
    init() {
        // Criar elemento de áudio para alertas
        this.alertSound = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleBoAHIveli4AAAB+kL21mHVUU32mr6SNbkxGaJ6wq5JpQTZij6qnlXVOSWmgsaqUdE9JaJ+wqpRzT0lpn7CqlHNPSWmfsKqUc09JaJ+wqpVzT0longAAAA==');

        // Verificar prazos a cada minuto
        this.checkInterval = setInterval(() => this.checkDeadlines(), 60000);

        // Verificar imediatamente
        this.checkDeadlines();

        // Não adicionar indicador no header (removido a pedido do usuário)
    },

    /**
     * Verifica prazos próximos
     */
    checkDeadlines() {
        const tasks = Storage.getTasks();
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const alerts = {
            overdue: [],      // Vencidos
            critical: [],     // Vence hoje
            warning: [],      // Vence em 24h
            attention: []     // Vence em 48h
        };

        tasks.forEach(task => {
            if (!task.deadline || ['concluida-sucesso', 'concluida-sem-sucesso', 'cancelado'].includes(task.status)) {
                return;
            }

            const deadline = new Date(task.deadline);
            deadline.setHours(0, 0, 0, 0);

            const diffDays = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                alerts.overdue.push(task);
            } else if (diffDays === 0) {
                alerts.critical.push(task);
            } else if (diffDays === 1) {
                alerts.warning.push(task);
            } else if (diffDays === 2) {
                alerts.attention.push(task);
            }
        });

        this.updateAlertBanner(alerts);
        this.updateTaskCardAlerts();

        // Tocar som se houver alertas críticos
        if (alerts.critical.length > 0 || alerts.overdue.length > 0) {
            this.playAlertSound();
        }

        return alerts;
    },

    /**
     * Atualiza o banner de alertas
     */
    updateAlertBanner(alerts) {
        let banner = document.getElementById('alertBanner');

        const totalAlerts = alerts.overdue.length + alerts.critical.length + alerts.warning.length;

        if (totalAlerts === 0) {
            if (banner) banner.remove();
            return;
        }

        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'alertBanner';
            banner.className = 'alert-banner';
            document.querySelector('.toolbar').insertAdjacentElement('afterend', banner);
        }

        let html = '';

        if (alerts.overdue.length > 0) {
            html += `
                <div class="alert-item alert-overdue">
                    <span class="alert-icon">🚨</span>
                    <span><strong>${alerts.overdue.length}</strong> prazo(s) VENCIDO(S)!</span>
                    <button onclick="Alerts.showAlertDetails('overdue')">Ver</button>
                </div>
            `;
        }

        if (alerts.critical.length > 0) {
            html += `
                <div class="alert-item alert-critical">
                    <span class="alert-icon">⚠️</span>
                    <span><strong>${alerts.critical.length}</strong> prazo(s) vence(m) HOJE!</span>
                    <button onclick="Alerts.showAlertDetails('critical')">Ver</button>
                </div>
            `;
        }

        if (alerts.warning.length > 0) {
            html += `
                <div class="alert-item alert-warning">
                    <span class="alert-icon">⏰</span>
                    <span><strong>${alerts.warning.length}</strong> prazo(s) vence(m) em 24h</span>
                    <button onclick="Alerts.showAlertDetails('warning')">Ver</button>
                </div>
            `;
        }

        banner.innerHTML = html;
    },

    /**
     * Atualiza cards com alertas visuais
     */
    updateTaskCardAlerts() {
        const tasks = Storage.getTasks();
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        document.querySelectorAll('.task-card').forEach(card => {
            const taskId = card.dataset.id;
            const task = tasks.find(t => t.id === taskId);

            if (!task || !task.deadline) return;

            const deadline = new Date(task.deadline);
            deadline.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));

            // Remover classes anteriores
            card.classList.remove('card-overdue', 'card-critical', 'card-warning');

            if (diffDays < 0) {
                card.classList.add('card-overdue');
            } else if (diffDays === 0) {
                card.classList.add('card-critical');
            } else if (diffDays <= 2) {
                card.classList.add('card-warning');
            }
        });
    },

    /**
     * Mostra detalhes dos alertas
     */
    showAlertDetails(type) {
        const alerts = this.checkDeadlines();
        const tasks = alerts[type];

        if (!tasks || tasks.length === 0) return;

        const typeLabels = {
            overdue: 'Prazos Vencidos',
            critical: 'Vence Hoje',
            warning: 'Vence em 24h',
            attention: 'Vence em 48h'
        };

        let message = `📋 ${typeLabels[type]}:\n\n`;
        tasks.forEach((task, i) => {
            message += `${i + 1}. ${task.title}\n`;
            message += `   📅 ${new Date(task.deadline).toLocaleDateString('pt-BR')}\n`;
            if (task.client) message += `   👤 ${task.client}\n`;
            message += '\n';
        });

        alert(message);
    },

    /**
     * Toca som de alerta
     */
    playAlertSound() {
        if (this.alertSound && document.hasFocus()) {
            this.alertSound.play().catch(() => { });
        }
    },

    /**
     * Renderiza indicador de alertas no header
     */
    renderAlertIndicator() {
        const headerRight = document.querySelector('.header-right');
        if (!headerRight) return;

        const indicator = document.createElement('button');
        indicator.id = 'alertIndicator';
        indicator.className = 'alert-indicator';
        indicator.title = 'Alertas de Prazo';
        indicator.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span class="alert-badge" id="alertBadge">0</span>
        `;
        indicator.onclick = () => this.showAllAlerts();

        headerRight.insertBefore(indicator, headerRight.firstChild);
        this.updateAlertBadge();
    },

    /**
     * Atualiza badge de alertas
     */
    updateAlertBadge() {
        const alerts = this.checkDeadlines();
        const total = alerts.overdue.length + alerts.critical.length + alerts.warning.length;

        const badge = document.getElementById('alertBadge');
        if (badge) {
            badge.textContent = total;
            badge.style.display = total > 0 ? 'flex' : 'none';
        }

        const indicator = document.getElementById('alertIndicator');
        if (indicator) {
            indicator.classList.toggle('has-alerts', total > 0);
        }
    },

    /**
     * Mostra todos os alertas
     */
    showAllAlerts() {
        const alerts = this.checkDeadlines();
        const total = alerts.overdue.length + alerts.critical.length + alerts.warning.length + alerts.attention.length;

        if (total === 0) {
            Toast.show('✅ Nenhum prazo próximo!', 'success');
            return;
        }

        // Mostrar primeiro prazo crítico
        if (alerts.overdue.length > 0) {
            this.showAlertDetails('overdue');
        } else if (alerts.critical.length > 0) {
            this.showAlertDetails('critical');
        } else if (alerts.warning.length > 0) {
            this.showAlertDetails('warning');
        }
    }
};
