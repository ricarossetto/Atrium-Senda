/**
 * Modals Module - Gerenciamento de modais
 */

const Modals = {
    // Referências aos elementos dos modais
    elements: {
        taskModal: null,
        filtersModal: null,
        settingsModal: null
    },

    /**
     * Inicializa os modais
     */
    init() {
        this.elements.taskModal = document.getElementById('taskModal');
        this.elements.filtersModal = document.getElementById('filtersModal');
        this.elements.settingsModal = document.getElementById('settingsModal');

        this.bindEvents();
    },

    /**
     * Vincula eventos
     */
    bindEvents() {
        // Fechar modais
        document.getElementById('closeTaskModal')?.addEventListener('click', () => this.closeTaskModal());
        document.getElementById('cancelTaskBtn')?.addEventListener('click', () => this.closeTaskModal());
        document.getElementById('closeFiltersModal')?.addEventListener('click', () => this.closeFiltersModal());
        document.getElementById('closeSettingsModal')?.addEventListener('click', () => this.closeSettingsModal());
        document.getElementById('cancelSettingsBtn')?.addEventListener('click', () => this.closeSettingsModal());

        // Salvar tarefa
        document.getElementById('saveTaskBtn')?.addEventListener('click', () => this.saveTask());

        // Filtros
        document.getElementById('applyFiltersBtn')?.addEventListener('click', () => this.applyFilters());
        document.getElementById('clearFiltersBtn')?.addEventListener('click', () => this.clearFilters());

        // Configurações
        document.getElementById('saveSettingsBtn')?.addEventListener('click', () => this.saveSettings());
        document.getElementById('addColumnBtn')?.addEventListener('click', () => this.addColumnConfig());

        // Fechar modal ao clicar no overlay
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    this.closeAllModals();
                }
            });
        });

        // Fechar com ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
    },

    // ==================== TASK MODAL ====================

    /**
     * Abre o modal de tarefa para criar
     */
    openNewTaskModal() {
        this.resetTaskForm();
        document.getElementById('modalTitle').textContent = 'Nova Tarefa';
        this.elements.taskModal.classList.remove('hidden');
        document.getElementById('taskTitle').focus();
    },

    /**
     * Abre o modal de tarefa para editar
     */
    openEditTaskModal(taskId) {
        const task = Storage.getTaskById(taskId);
        if (!task) return;

        document.getElementById('modalTitle').textContent = 'Editar Tarefa';
        document.getElementById('taskId').value = task.id;
        document.getElementById('taskType').value = task.type || '';
        document.getElementById('taskTitle').value = task.title || '';
        document.getElementById('taskBaseDate').value = task.baseDate || '';
        document.getElementById('taskDueDate').value = task.dueDate || '';
        document.getElementById('taskDeadline').value = task.deadline || '';
        document.getElementById('taskTime').value = task.time || '';
        document.getElementById('taskLocation').value = task.location || '';
        document.getElementById('taskDescription').value = task.description || '';
        document.getElementById('taskResponsible').value = task.responsible || '';
        document.getElementById('taskWorkGroup').value = task.workGroup || '';
        document.getElementById('taskClient').value = task.client || '';
        document.getElementById('taskProcess').value = task.process || '';
        document.getElementById('taskStatus').value = task.status || 'pendente';
        document.getElementById('taskShowKanban').checked = task.showInKanban !== false;
        document.getElementById('taskMarkers').value = (task.markers || []).join(', ');

        this.elements.taskModal.classList.remove('hidden');
    },

    /**
     * Fecha o modal de tarefa
     */
    closeTaskModal() {
        this.elements.taskModal.classList.add('hidden');
        this.resetTaskForm();
    },

    /**
     * Reseta o formulário de tarefa
     */
    resetTaskForm() {
        document.getElementById('taskForm').reset();
        document.getElementById('taskId').value = '';
        document.getElementById('taskShowKanban').checked = true;
    },

    /**
     * Salva a tarefa
     */
    saveTask() {
        const taskId = document.getElementById('taskId').value;
        const title = document.getElementById('taskTitle').value.trim();

        if (!title) {
            Toast.show('Por favor, informe o título da tarefa', 'error');
            document.getElementById('taskTitle').focus();
            return;
        }

        const markersInput = document.getElementById('taskMarkers').value;
        const markers = markersInput ? markersInput.split(',').map(m => m.trim()).filter(m => m) : [];

        const taskData = {
            type: document.getElementById('taskType').value,
            title: title,
            baseDate: document.getElementById('taskBaseDate').value,
            dueDate: document.getElementById('taskDueDate').value,
            deadline: document.getElementById('taskDeadline').value,
            time: document.getElementById('taskTime').value,
            location: document.getElementById('taskLocation').value,
            description: document.getElementById('taskDescription').value,
            responsible: document.getElementById('taskResponsible').value,
            workGroup: document.getElementById('taskWorkGroup').value,
            client: document.getElementById('taskClient').value,
            process: document.getElementById('taskProcess').value,
            status: document.getElementById('taskStatus').value,
            showInKanban: document.getElementById('taskShowKanban').checked,
            markers: markers
        };

        if (taskId) {
            // Editar tarefa existente
            Storage.updateTask(taskId, taskData);
            Toast.show('Tarefa atualizada com sucesso!', 'success');
        } else {
            // Criar nova tarefa
            Storage.addTask(taskData);
            Toast.show('Tarefa criada com sucesso!', 'success');
        }

        this.closeTaskModal();
        Kanban.render();
    },

    /**
     * Confirma exclusão de tarefa
     */
    confirmDeleteTask(taskId) {
        const task = Storage.getTaskById(taskId);
        if (!task) return;

        if (confirm(`Tem certeza que deseja excluir a tarefa "${task.title}"?`)) {
            Storage.deleteTask(taskId);
            Toast.show('Tarefa excluída!', 'success');
            Kanban.render();
        }
    },

    // ==================== FILTERS MODAL ====================

    /**
     * Abre o modal de filtros
     */
    openFiltersModal() {
        this.elements.filtersModal.classList.remove('hidden');
    },

    /**
     * Fecha o modal de filtros
     */
    closeFiltersModal() {
        this.elements.filtersModal.classList.add('hidden');
    },

    /**
     * Aplica os filtros
     */
    applyFilters() {
        const filters = {
            involvement: [],
            activityType: [],
            responsible: document.getElementById('filterResponsible').value,
            workGroup: document.getElementById('filterWorkGroup').value,
            dateFrom: document.getElementById('filterDateFrom').value,
            dateTo: document.getElementById('filterDateTo').value,
            client: document.getElementById('filterClient').value,
            process: document.getElementById('filterProcess').value
        };

        // Coletar checkboxes de envolvimento
        document.querySelectorAll('input[name="involvement"]:checked').forEach(cb => {
            filters.involvement.push(cb.value);
        });

        // Coletar checkboxes de tipo de atividade
        document.querySelectorAll('input[name="activityType"]:checked').forEach(cb => {
            filters.activityType.push(cb.value);
        });

        Kanban.applyFilters(filters);
        this.closeFiltersModal();
        Toast.show('Filtros aplicados!', 'success');
    },

    /**
     * Limpa os filtros
     */
    clearFilters() {
        document.querySelectorAll('#filtersModal input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
        document.querySelectorAll('#filtersModal input[type="text"], #filtersModal input[type="date"]').forEach(input => {
            input.value = '';
        });
        document.querySelectorAll('#filtersModal select').forEach(select => {
            select.value = '';
        });

        // Marcar "Sou responsável" por padrão
        const responsibleCb = document.querySelector('input[name="involvement"][value="responsible"]');
        if (responsibleCb) responsibleCb.checked = true;

        Kanban.clearFilters();
        Toast.show('Filtros limpos!', 'success');
    },

    // ==================== SETTINGS MODAL ====================

    /**
     * Abre o modal de configurações
     */
    openSettingsModal() {
        this.renderColumnsConfig();
        this.elements.settingsModal.classList.remove('hidden');
    },

    /**
     * Fecha o modal de configurações
     */
    closeSettingsModal() {
        this.elements.settingsModal.classList.add('hidden');
    },

    /**
     * Renderiza a configuração de colunas
     */
    renderColumnsConfig() {
        const container = document.getElementById('columnsConfig');
        const columns = Storage.getColumns().sort((a, b) => a.order - b.order);

        container.innerHTML = columns.map(column => `
            <div class="column-config-item" data-id="${column.id}">
                <span class="drag-handle">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="8" y1="6" x2="21" y2="6"/>
                        <line x1="8" y1="12" x2="21" y2="12"/>
                        <line x1="8" y1="18" x2="21" y2="18"/>
                        <line x1="3" y1="6" x2="3.01" y2="6"/>
                        <line x1="3" y1="12" x2="3.01" y2="12"/>
                        <line x1="3" y1="18" x2="3.01" y2="18"/>
                    </svg>
                </span>
                <input type="text" value="${column.title}" data-id="${column.id}">
                <button class="delete-btn" onclick="Modals.deleteColumnConfig('${column.id}')" title="Excluir coluna">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                </button>
            </div>
        `).join('');
    },

    /**
     * Adiciona uma nova configuração de coluna
     */
    addColumnConfig() {
        const columns = Storage.getColumns();
        const newColumn = {
            id: 'col_' + Date.now(),
            title: 'Nova coluna',
            status: 'col_' + Date.now(),
            order: columns.length
        };
        columns.push(newColumn);
        Storage.saveColumns(columns);
        this.renderColumnsConfig();
    },

    /**
     * Remove uma configuração de coluna
     */
    deleteColumnConfig(columnId) {
        const columns = Storage.getColumns();
        if (columns.length <= 1) {
            Toast.show('Não é possível remover todas as colunas!', 'error');
            return;
        }

        if (confirm('Tem certeza que deseja remover esta coluna? As tarefas desta coluna serão movidas para "Pendente".')) {
            // Mover tarefas para pendente
            const tasks = Storage.getTasks();
            tasks.forEach(task => {
                if (task.status === columnId) {
                    task.status = 'pendente';
                }
            });
            Storage.saveTasks(tasks);

            // Remover coluna
            Storage.deleteColumn(columnId);
            this.renderColumnsConfig();
        }
    },

    /**
     * Salva as configurações
     */
    saveSettings() {
        const columns = Storage.getColumns();
        const inputs = document.querySelectorAll('#columnsConfig input[type="text"]');

        inputs.forEach((input, index) => {
            const columnId = input.dataset.id;
            const column = columns.find(c => c.id === columnId);
            if (column) {
                column.title = input.value.trim() || 'Sem título';
                column.order = index;
            }
        });

        Storage.saveColumns(columns);
        this.closeSettingsModal();
        Kanban.render();
        Toast.show('Configurações salvas!', 'success');
    },

    /**
     * Fecha todos os modais
     */
    closeAllModals() {
        this.closeTaskModal();
        this.closeFiltersModal();
        this.closeSettingsModal();
    }
};

/**
 * Toast Notifications
 */
const Toast = {
    container: null,

    init() {
        this.container = document.getElementById('toastContainer');
    },

    show(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span>${message}</span>
            <button class="toast-close" onclick="this.parentElement.remove()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;

        this.container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
};
