/**
 * Notifications Module - Painel de Notificações no Site
 */

const Notifications = {
    notifications: [],
    isOpen: false,

    /**
     * Inicializa notificações
     */
    init() {
        this.loadNotifications();
        this.addNotificationButton();
        this.createNotificationPanel();
        this.checkDeadlines();

        // Verificar prazos a cada 5 minutos
        setInterval(() => this.checkDeadlines(), 5 * 60 * 1000);
    },

    /**
     * Carrega notificações do localStorage
     */
    loadNotifications() {
        try {
            this.notifications = JSON.parse(localStorage.getItem('kanban_notifications') || '[]');
        } catch {
            this.notifications = [];
        }
    },

    /**
     * Salva notificações no localStorage
     */
    saveNotifications() {
        localStorage.setItem('kanban_notifications', JSON.stringify(this.notifications));
        this.updateBadge();
    },

    /**
     * Adiciona botão de notificações na toolbar
     */
    addNotificationButton() {
        const toolbar = document.querySelector('.toolbar-right');
        if (!toolbar) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'notification-wrapper';
        wrapper.innerHTML = `
            <button id="notificationBtn" class="btn btn-icon notification-btn" title="Notificações">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                <span class="notification-badge" id="notificationBadge" style="display: none;">0</span>
            </button>
        `;

        toolbar.insertBefore(wrapper, toolbar.firstChild);

        // Evento de clique
        document.getElementById('notificationBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePanel();
        });

        // Fechar ao clicar fora
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('notificationPanel');
            const btn = document.getElementById('notificationBtn');
            if (panel && !panel.contains(e.target) && !btn.contains(e.target)) {
                this.closePanel();
            }
        });

        this.updateBadge();
    },

    /**
     * Cria o painel de notificações
     */
    createNotificationPanel() {
        const panel = document.createElement('div');
        panel.id = 'notificationPanel';
        panel.className = 'notification-panel';
        panel.innerHTML = `
            <div class="notification-panel-header">
                <h3>🔔 Notificações</h3>
                <button class="btn-clear-all" id="clearAllNotifications" title="Limpar todas">
                    Limpar tudo
                </button>
            </div>
            <div class="notification-panel-body" id="notificationList">
                <!-- Notificações serão renderizadas aqui -->
            </div>
        `;

        document.body.appendChild(panel);

        // Evento para limpar todas
        document.getElementById('clearAllNotifications').addEventListener('click', () => {
            this.clearAll();
        });
    },

    /**
     * Alterna visibilidade do painel
     */
    togglePanel() {
        if (this.isOpen) {
            this.closePanel();
        } else {
            this.openPanel();
        }
    },

    /**
     * Abre o painel
     */
    openPanel() {
        const panel = document.getElementById('notificationPanel');
        const btn = document.getElementById('notificationBtn');

        if (!panel || !btn) return;

        // Posicionar o painel
        const rect = btn.getBoundingClientRect();
        panel.style.top = (rect.bottom + 8) + 'px';
        panel.style.right = (window.innerWidth - rect.right) + 'px';

        panel.classList.add('show');
        this.isOpen = true;
        this.renderNotifications();
    },

    /**
     * Fecha o painel
     */
    closePanel() {
        const panel = document.getElementById('notificationPanel');
        if (panel) {
            panel.classList.remove('show');
        }
        this.isOpen = false;
    },

    /**
     * Renderiza lista de notificações
     */
    renderNotifications() {
        const list = document.getElementById('notificationList');
        if (!list) return;

        if (this.notifications.length === 0) {
            list.innerHTML = `
                <div class="notification-empty">
                    <span style="font-size: 48px;">🎉</span>
                    <p>Nenhuma notificação!</p>
                    <small>Você está em dia com seus prazos.</small>
                </div>
            `;
            return;
        }

        list.innerHTML = this.notifications.map((notif, index) => `
            <div class="notification-item ${notif.type}" data-index="${index}">
                <div class="notification-icon">${this.getIcon(notif.type)}</div>
                <div class="notification-content">
                    <div class="notification-title">${notif.title}</div>
                    <div class="notification-message">${notif.message}</div>
                    <div class="notification-time">${this.formatTime(notif.createdAt)}</div>
                </div>
                <button class="notification-dismiss" onclick="Notifications.dismiss(${index})" title="Dispensar">
                    ×
                </button>
            </div>
        `).join('');

        // Adicionar clique para ver tarefa
        list.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('notification-dismiss')) {
                    const index = parseInt(item.dataset.index);
                    const notif = this.notifications[index];
                    if (notif.taskId) {
                        this.closePanel();
                        Modals.openEditTaskModal(notif.taskId);
                    }
                }
            });
        });
    },

    /**
     * Obtém ícone por tipo
     */
    getIcon(type) {
        const icons = {
            'overdue': '🚨',
            'today': '⚠️',
            'warning': '⏰',
            'info': 'ℹ️'
        };
        return icons[type] || '🔔';
    },

    /**
     * Formata tempo relativo
     */
    formatTime(timestamp) {
        const now = new Date();
        const date = new Date(timestamp);
        const diff = now - date;

        if (diff < 60000) return 'Agora';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}min atrás`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h atrás`;
        return date.toLocaleDateString('pt-BR');
    },

    /**
     * Dispensa uma notificação
     */
    dismiss(index) {
        this.notifications.splice(index, 1);
        this.saveNotifications();
        this.renderNotifications();
        Toast.show('Notificação removida', 'success');
    },

    /**
     * Limpa todas as notificações
     */
    clearAll() {
        this.notifications = [];
        this.saveNotifications();
        this.renderNotifications();
        Toast.show('Todas as notificações removidas', 'success');
    },

    /**
     * Atualiza badge de contagem
     */
    updateBadge() {
        const badge = document.getElementById('notificationBadge');
        if (!badge) return;

        const count = this.notifications.length;
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = count > 0 ? 'flex' : 'none';

        // Adicionar classe de animação se houver notificações
        const btn = document.getElementById('notificationBtn');
        if (btn) {
            btn.classList.toggle('has-notifications', count > 0);
        }
    },

    /**
     * Adiciona uma notificação
     */
    add(title, message, type = 'info', taskId = null) {
        // Evitar duplicatas recentes
        const recent = this.notifications.find(n =>
            n.title === title &&
            n.taskId === taskId &&
            (Date.now() - new Date(n.createdAt).getTime()) < 60000
        );
        if (recent) return;

        this.notifications.unshift({
            id: Date.now(),
            title,
            message,
            type,
            taskId,
            createdAt: new Date().toISOString()
        });

        // Manter máximo de 50 notificações
        if (this.notifications.length > 50) {
            this.notifications = this.notifications.slice(0, 50);
        }

        this.saveNotifications();

        // Atualizar painel se estiver aberto
        if (this.isOpen) {
            this.renderNotifications();
        }
    },

    /**
     * Verifica prazos e gera notificações
     */
    checkDeadlines() {
        const tasks = Storage.getTasks();
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);

        tasks.forEach(task => {
            if (!task.deadline) return;
            if (['concluida-sucesso', 'concluida-sem-sucesso', 'cancelado'].includes(task.status)) return;

            const deadline = new Date(task.deadline);
            deadline.setHours(0, 0, 0, 0);

            // Prazo vencido
            if (deadline < now) {
                this.add(
                    '🚨 Prazo Vencido!',
                    task.title,
                    'overdue',
                    task.id
                );
            }
            // Prazo para hoje
            else if (deadline.getTime() === now.getTime()) {
                this.add(
                    '⚠️ Prazo para Hoje!',
                    task.title,
                    'today',
                    task.id
                );
            }
            // Prazo para amanhã
            else if (deadline.getTime() === tomorrow.getTime()) {
                this.add(
                    '⏰ Prazo Amanhã',
                    task.title,
                    'warning',
                    task.id
                );
            }
        });
    }
};
