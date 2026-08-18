/**
 * App Module - Inicialização e orquestração da aplicação
 */

const App = {
    currentView: 'kanban',

    /**
     * Inicializa a aplicação
     */
    init() {
        // Inicializar módulos base
        Toast.init();
        Modals.init();
        Kanban.init();

        // Inicializar novos módulos v2
        Alerts.init();
        Dashboard.init();
        Calendar.init();
        Notifications.init();
        Templates.init();
        Clientes.init();

        // Vincular eventos globais
        this.bindEvents();

        // Verificar e criar dados de demonstração se necessário
        this.checkDemoData();

        console.log('✅ Kanban de Tarefas v2 inicializado!');
    },

    /**
     * Vincula eventos globais
     */
    bindEvents() {
        // Alternância de visões
        document.getElementById('tabKanban')?.addEventListener('click', () => this.switchView('kanban'));
        document.getElementById('tabPainel')?.addEventListener('click', () => this.switchView('painel'));
        document.getElementById('tabDashboard')?.addEventListener('click', () => this.switchView('dashboard'));
        document.getElementById('tabCalendario')?.addEventListener('click', () => this.switchView('calendar'));
        document.getElementById('tabClientes')?.addEventListener('click', () => this.switchView('clientes'));

        // Seletor de quadro
        document.getElementById('boardSelector')?.addEventListener('change', (e) => this.switchBoard(e.target.value));

        // Novo quadro
        document.getElementById('btnNewBoard')?.addEventListener('click', () => this.createNewBoard());

        // Atalhos de teclado
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    },

    /**
     * Alterna entre visões
     */
    switchView(view) {
        this.currentView = view;

        // Atualizar tabs
        document.querySelectorAll('.view-tab').forEach(tab => tab.classList.remove('active'));
        document.getElementById(`tab${view.charAt(0).toUpperCase() + view.slice(1)}`)?.classList.add('active');

        // Esconder todas as views
        document.getElementById('kanbanView').classList.add('hidden');
        document.getElementById('painelView').classList.add('hidden');
        document.getElementById('dashboardView').classList.add('hidden');
        document.getElementById('calendarView').classList.add('hidden');
        document.getElementById('clientesView')?.classList.add('hidden');

        // Mostrar view selecionada
        const viewElement = document.getElementById(`${view}View`);
        if (viewElement) viewElement.classList.remove('hidden');

        // Renderizar conteúdo específico
        switch (view) {
            case 'painel':
                this.renderPainel();
                break;
            case 'dashboard':
                Dashboard.render();
                break;
            case 'calendar':
                Calendar.render();
                break;
            case 'clientes':
                Clientes.render();
                break;
        }
    },

    /**
     * Renderiza a visão de painel
     */
    renderPainel() {
        const tasks = Storage.getTasks();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const weekFromNow = new Date(today);
        weekFromNow.setDate(weekFromNow.getDate() + 7);

        // Minhas tarefas (responsável = ricardo)
        const myTasks = tasks.filter(t => t.responsible === 'ricardo' && !['concluida-sucesso', 'concluida-sem-sucesso', 'cancelado'].includes(t.status));

        // Tarefas que criei e deleguei
        const delegatedTasks = tasks.filter(t => t.responsible !== 'ricardo' && t.responsible);

        // Tarefas da semana
        const weekTasks = tasks.filter(t => {
            if (!t.deadline) return false;
            const deadline = new Date(t.deadline);
            return deadline >= today && deadline <= weekFromNow;
        });

        // Renderizar seções
        this.renderPainelSection('myTasks', myTasks);
        this.renderPainelSection('delegatedTasks', delegatedTasks);
        this.renderPainelSection('weekTasks', weekTasks);
    },

    /**
     * Renderiza uma seção do painel
     */
    renderPainelSection(containerId, tasks) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (tasks.length === 0) {
            container.innerHTML = '<p class="empty-message">Nenhuma tarefa encontrada</p>';
            return;
        }

        container.innerHTML = tasks.map(task => `
            <div class="painel-task-item" onclick="Modals.openEditTaskModal('${task.id}')">
                <div style="flex: 1;">
                    <div style="font-weight: 500; color: #212121; margin-bottom: 4px;">${this.escapeHtml(task.title)}</div>
                    <div style="font-size: 12px; color: #757575;">
                        ${task.deadline ? `📅 ${new Date(task.deadline).toLocaleDateString('pt-BR')}` : ''}
                        ${task.client ? ` • 👤 ${this.escapeHtml(task.client)}` : ''}
                    </div>
                </div>
                <span style="font-size: 12px; padding: 4px 8px; background: ${this.getStatusColor(task.status)}20; color: ${this.getStatusColor(task.status)}; border-radius: 12px;">
                    ${this.getStatusLabel(task.status)}
                </span>
            </div>
        `).join('');
    },

    /**
     * Alterna entre quadros
     */
    switchBoard(boardId) {
        // Para uma implementação futura com múltiplos quadros
        Toast.show(`Quadro alterado para: ${boardId === 'escritorio' ? 'Quadro do Escritório' : 'Quadro de Atividades'}`, 'info');
        Kanban.render();
    },

    /**
     * Cria novo quadro
     */
    createNewBoard() {
        const name = prompt('Nome do novo quadro:');
        if (name && name.trim()) {
            const boards = Storage.getBoards();
            boards.push({
                id: 'board_' + Date.now(),
                name: name.trim()
            });
            Storage.saveBoards(boards);

            // Atualizar seletor
            const select = document.getElementById('boardSelector');
            const option = document.createElement('option');
            option.value = 'board_' + Date.now();
            option.textContent = name.trim();
            select.appendChild(option);

            Toast.show('Quadro criado com sucesso!', 'success');
        }
    },

    /**
     * Atalhos de teclado
     */
    handleKeyboard(e) {
        // Ctrl/Cmd + N = Nova tarefa
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            Modals.openNewTaskModal();
        }

        // Ctrl/Cmd + F = Focar na pesquisa
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            document.getElementById('searchInput')?.focus();
        }

        // Ctrl/Cmd + E = Exportar dados
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
            e.preventDefault();
            this.exportData();
        }
    },

    /**
     * Exporta dados para JSON
     */
    exportData() {
        const data = Storage.exportData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `kanban-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();

        URL.revokeObjectURL(url);
        Toast.show('Dados exportados com sucesso!', 'success');
    },

    /**
     * Verifica e cria dados de demonstração
     */
    checkDemoData() {
        const tasks = Storage.getTasks();
        if (tasks.length === 0) {
            this.createDemoData();
        }
    },

    /**
     * Cria dados de demonstração
     */
    createDemoData() {
        const demoTasks = [
            {
                type: 'prazo',
                title: 'Contestação - Processo 0001234-00.2024.8.21.0001',
                description: 'Elaborar contestação referente à ação de cobrança',
                deadline: this.getFutureDate(5),
                dueDate: this.getFutureDate(3),
                responsible: 'ricardo',
                client: 'Empresa ABC Ltda',
                process: '0001234-00.2024.8.21.0001',
                status: 'pendente',
                markers: ['Urgente', 'Contencioso'],
                workGroup: 'contencioso'
            },
            {
                type: 'audiencia',
                title: 'Audiência de Instrução e Julgamento',
                description: 'Preparar cliente e testemunhas para a audiência',
                deadline: this.getFutureDate(7),
                time: '14:00',
                location: 'Foro Central - Porto Alegre',
                responsible: 'ricardo',
                client: 'João da Silva',
                process: '0005678-00.2024.8.21.0001',
                status: 'em-execucao',
                markers: ['Trabalhista'],
                workGroup: 'contencioso'
            },
            {
                type: 'reuniao',
                title: 'Reunião com cliente - Novo contrato',
                description: 'Discutir termos do novo contrato de prestação de serviços',
                deadline: this.getFutureDate(2),
                time: '10:00',
                location: 'Escritório',
                responsible: 'ricardo',
                client: 'Tech Solutions SA',
                status: 'pendente',
                markers: ['Consultivo'],
                workGroup: 'consultivo'
            },
            {
                type: 'tarefa',
                title: 'Revisar petição inicial',
                description: 'Revisar e aprovar a petição inicial antes do protocolo',
                deadline: this.getFutureDate(1),
                responsible: 'equipe',
                client: 'Maria Oliveira',
                process: '0009999-00.2024.8.21.0001',
                status: 'revisao',
                markers: ['Revisão'],
                workGroup: 'contencioso'
            },
            {
                type: 'lembrete',
                title: 'Verificar publicações do dia',
                description: 'Conferir intimações e publicações no diário eletrônico',
                deadline: this.getFutureDate(0),
                responsible: 'ricardo',
                status: 'pendente',
                markers: ['Rotina'],
                workGroup: 'geral'
            }
        ];

        demoTasks.forEach(task => Storage.addTask(task));
        Kanban.render();
    },

    /**
     * Obtém data futura
     */
    getFutureDate(days) {
        const date = new Date();
        date.setDate(date.getDate() + days);
        return date.toISOString().split('T')[0];
    },

    /**
     * Obtém cor do status
     */
    getStatusColor(status) {
        const colors = {
            'pendente': '#9e9e9e',
            'em-execucao': '#2196f3',
            'revisao': '#ff9800',
            'concluida-sucesso': '#4caf50',
            'concluida-sem-sucesso': '#9c27b0',
            'cancelado': '#f44336'
        };
        return colors[status] || '#9e9e9e';
    },

    /**
     * Obtém label do status
     */
    getStatusLabel(status) {
        const labels = {
            'pendente': 'Pendente',
            'em-execucao': 'Em execução',
            'revisao': 'Revisão',
            'concluida-sucesso': 'Concluída',
            'concluida-sem-sucesso': 'Sem sucesso',
            'cancelado': 'Cancelado'
        };
        return labels[status] || status;
    },

    /**
     * Escapa HTML
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => App.init());
