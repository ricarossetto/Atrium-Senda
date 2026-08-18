/**
 * Kanban Module - Componente principal do Kanban Board
 */

const Kanban = {
    currentFilters: null,
    draggedTask: null,

    /**
     * Inicializa o Kanban
     */
    init() {
        this.bindEvents();
        this.render();
    },

    /**
     * Vincula eventos do Kanban
     */
    bindEvents() {
        // Adicionar tarefa rápida
        document.getElementById('btnAddTask')?.addEventListener('click', () => Modals.openNewTaskModal());
        document.getElementById('btnNewTask')?.addEventListener('click', () => Modals.openNewTaskModal());

        // Filtros
        document.getElementById('btnFilters')?.addEventListener('click', () => Modals.openFiltersModal());

        // Configurações
        document.getElementById('btnEditKanban')?.addEventListener('click', () => Modals.openSettingsModal());

        // Pesquisa
        document.getElementById('searchInput')?.addEventListener('input', (e) => this.handleSearch(e.target.value));

        // Chips de filtro rápido
        document.getElementById('btnMyTasks')?.addEventListener('click', () => this.filterMyTasks());
        document.getElementById('btnDelegated')?.addEventListener('click', () => this.filterDelegated());
        document.getElementById('btnViewAll')?.addEventListener('click', () => this.clearFilters());

        // Adicionar nova coluna
        document.querySelector('.add-column-btn')?.addEventListener('click', () => this.addNewColumn());
    },

    /**
     * Renderiza o Kanban completo
     */
    render() {
        const board = document.getElementById('kanbanBoard');
        const columns = Storage.getColumns().sort((a, b) => a.order - b.order);
        let tasks = Storage.getTasks();

        // Aplicar filtros se existirem
        if (this.currentFilters) {
            tasks = this.filterTasks(tasks, this.currentFilters);
        }

        board.innerHTML = '';

        columns.forEach(column => {
            const columnTasks = tasks.filter(
                task => task.status === column.status && task.showInKanban !== false
            );
            const columnEl = this.createColumnElement(column, columnTasks);
            board.appendChild(columnEl);
        });

        // Botão adicionar coluna
        const addBtn = document.createElement('button');
        addBtn.className = 'add-column-btn';
        addBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nova coluna
        `;
        addBtn.addEventListener('click', () => this.addNewColumn());
        board.appendChild(addBtn);
    },

    /**
     * Cria elemento de coluna
     */
    createColumnElement(column, tasks) {
        const div = document.createElement('div');
        div.className = 'kanban-column';
        div.dataset.status = column.status;
        div.dataset.id = column.id;

        div.innerHTML = `
            <div class="column-header">
                <div class="column-title">
                    <span>${column.title}</span>
                    <span class="column-count">${tasks.length}</span>
                </div>
                <button class="column-menu" title="Opções">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="1"/>
                        <circle cx="19" cy="12" r="1"/>
                        <circle cx="5" cy="12" r="1"/>
                    </svg>
                </button>
            </div>
            <div class="column-body" data-status="${column.status}">
                ${tasks.length === 0 ? this.getEmptyStateHTML() : ''}
            </div>
        `;

        const body = div.querySelector('.column-body');

        // Adicionar cards de tarefas
        tasks.forEach(task => {
            const card = this.createTaskCard(task);
            body.appendChild(card);
        });

        // Configurar drag and drop
        this.setupDropZone(body);

        // Adicionar evento de clique no menu da coluna
        const menuBtn = div.querySelector('.column-menu');
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showColumnMenu(column, e);
        });

        return div;
    },

    /**
     * Cria card de tarefa
     */
    createTaskCard(task) {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.draggable = true;
        card.dataset.id = task.id;
        card.dataset.type = task.type || '';

        const typeLabel = this.getTypeLabel(task.type);
        const deadlineInfo = this.getDeadlineInfo(task);
        const responsibleInitials = this.getInitials(task.responsible);

        card.innerHTML = `
            <div class="task-header">
                <span class="task-type">${typeLabel}</span>
                <button class="task-menu" title="Opções" onclick="event.stopPropagation(); Kanban.showTaskMenu('${task.id}', event)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="1"/>
                        <circle cx="12" cy="5" r="1"/>
                        <circle cx="12" cy="19" r="1"/>
                    </svg>
                </button>
            </div>
            <div class="task-title">${this.escapeHtml(task.title)}</div>
            ${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ''}
            <div class="task-meta">
                ${task.deadline ? `
                    <span class="task-meta-item ${deadlineInfo.isOverdue ? 'overdue' : ''}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/>
                            <line x1="8" y1="2" x2="8" y2="6"/>
                            <line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        ${deadlineInfo.formatted}
                    </span>
                ` : ''}
                ${task.client ? `
                    <span class="task-meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                            <circle cx="12" cy="7" r="4"/>
                        </svg>
                        ${this.escapeHtml(task.client)}
                    </span>
                ` : ''}
            </div>
            <div class="task-footer">
                <div class="task-markers">
                    ${(task.markers || []).slice(0, 3).map(marker =>
            `<span class="task-marker">${this.escapeHtml(marker)}</span>`
        ).join('')}
                </div>
                ${task.responsible ? `
                    <div class="task-avatar" title="${this.getResponsibleName(task.responsible)}">
                        ${responsibleInitials}
                    </div>
                ` : ''}
            </div>
        `;

        // Eventos de drag
        card.addEventListener('dragstart', (e) => this.handleDragStart(e, task.id));
        card.addEventListener('dragend', (e) => this.handleDragEnd(e));

        // Clique para editar
        card.addEventListener('click', () => Modals.openEditTaskModal(task.id));

        return card;
    },

    /**
     * HTML do estado vazio
     */
    getEmptyStateHTML() {
        return `
            <div class="column-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="9" y1="21" x2="9" y2="9"/>
                </svg>
                <p>Nenhuma tarefa</p>
            </div>
        `;
    },

    // ==================== DRAG AND DROP ====================

    /**
     * Configura zona de drop
     */
    setupDropZone(element) {
        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            element.classList.add('drag-over');
        });

        element.addEventListener('dragleave', (e) => {
            element.classList.remove('drag-over');
        });

        element.addEventListener('drop', (e) => {
            e.preventDefault();
            element.classList.remove('drag-over');

            const taskId = e.dataTransfer.getData('text/plain');
            const newStatus = element.dataset.status;

            if (taskId && newStatus) {
                Storage.moveTask(taskId, newStatus);
                this.render();
                Toast.show('Tarefa movida!', 'success');
            }
        });
    },

    /**
     * Início do drag
     */
    handleDragStart(e, taskId) {
        this.draggedTask = taskId;
        e.dataTransfer.setData('text/plain', taskId);
        e.target.classList.add('dragging');
    },

    /**
     * Fim do drag
     */
    handleDragEnd(e) {
        e.target.classList.remove('dragging');
        this.draggedTask = null;
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    },

    // ==================== FILTERS ====================

    /**
     * Aplica filtros
     */
    applyFilters(filters) {
        this.currentFilters = filters;
        this.render();
        this.updateFilterChips();
    },

    /**
     * Limpa filtros
     */
    clearFilters() {
        this.currentFilters = null;
        this.render();
        this.updateFilterChips();
    },

    /**
     * Filtra tarefas
     */
    filterTasks(tasks, filters) {
        return tasks.filter(task => {
            // Filtro por tipo de atividade
            if (filters.activityType && filters.activityType.length > 0) {
                if (!filters.activityType.includes(task.type)) return false;
            }

            // Filtro por responsável
            if (filters.responsible && task.responsible !== filters.responsible) return false;

            // Filtro por grupo de trabalho
            if (filters.workGroup && task.workGroup !== filters.workGroup) return false;

            // Filtro por cliente
            if (filters.client && !task.client?.toLowerCase().includes(filters.client.toLowerCase())) return false;

            // Filtro por processo
            if (filters.process && !task.process?.includes(filters.process)) return false;

            // Filtro por data
            if (filters.dateFrom && task.deadline) {
                if (new Date(task.deadline) < new Date(filters.dateFrom)) return false;
            }
            if (filters.dateTo && task.deadline) {
                if (new Date(task.deadline) > new Date(filters.dateTo)) return false;
            }

            return true;
        });
    },

    /**
     * Filtro rápido: minhas tarefas
     */
    filterMyTasks() {
        this.applyFilters({ responsible: 'ricardo' });
        this.setActiveChip('btnMyTasks');
    },

    /**
     * Filtro rápido: delegadas
     */
    filterDelegated() {
        this.applyFilters({ involvement: ['delegated'] });
        this.setActiveChip('btnDelegated');
    },

    /**
     * Atualiza chips de filtro
     */
    updateFilterChips() {
        document.querySelectorAll('.filter-chips .chip').forEach(chip => {
            chip.classList.remove('active');
        });
        if (!this.currentFilters) {
            document.getElementById('btnViewAll')?.classList.add('active');
        }
    },

    /**
     * Define chip ativo
     */
    setActiveChip(chipId) {
        document.querySelectorAll('.filter-chips .chip').forEach(chip => {
            chip.classList.remove('active');
        });
        document.getElementById(chipId)?.classList.add('active');
    },

    // ==================== SEARCH ====================

    /**
     * Pesquisa de tarefas
     */
    handleSearch(query) {
        if (!query.trim()) {
            this.clearFilters();
            return;
        }

        const searchLower = query.toLowerCase();
        const allTasks = Storage.getTasks();

        const filteredTasks = allTasks.filter(task => {
            return (
                task.title?.toLowerCase().includes(searchLower) ||
                task.description?.toLowerCase().includes(searchLower) ||
                task.client?.toLowerCase().includes(searchLower) ||
                task.process?.includes(query) ||
                (task.markers || []).some(m => m.toLowerCase().includes(searchLower))
            );
        });

        // Renderizar apenas tarefas filtradas
        this.renderFilteredTasks(filteredTasks);
    },

    /**
     * Renderiza tarefas filtradas
     */
    renderFilteredTasks(filteredTasks) {
        const board = document.getElementById('kanbanBoard');
        const columns = Storage.getColumns().sort((a, b) => a.order - b.order);

        board.innerHTML = '';

        columns.forEach(column => {
            const columnTasks = filteredTasks.filter(
                task => task.status === column.status && task.showInKanban !== false
            );
            const columnEl = this.createColumnElement(column, columnTasks);
            board.appendChild(columnEl);
        });

        // Botão adicionar coluna
        const addBtn = document.createElement('button');
        addBtn.className = 'add-column-btn';
        addBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Nova coluna
        `;
        addBtn.addEventListener('click', () => this.addNewColumn());
        board.appendChild(addBtn);
    },

    // ==================== COLUMNS ====================

    /**
     * Adiciona nova coluna
     */
    addNewColumn() {
        const title = prompt('Nome da nova coluna:');
        if (title && title.trim()) {
            Storage.addColumn({
                title: title.trim(),
                status: 'col_' + Date.now()
            });
            this.render();
            Toast.show('Coluna adicionada!', 'success');
        }
    },

    /**
     * Mostra menu de contexto da coluna
     */
    showColumnMenu(column, event) {
        // Remover menu existente
        const existingMenu = document.querySelector('.column-context-menu');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.className = 'column-context-menu';
        menu.style.cssText = `
            position: fixed;
            top: ${event.clientY}px;
            left: ${event.clientX}px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            padding: 8px 0;
            z-index: 1000;
            min-width: 180px;
        `;

        // Verificar se é uma coluna padrão (não pode excluir)
        const defaultStatuses = ['pendente', 'em-execucao', 'revisao', 'concluida-sucesso', 'concluida-sem-sucesso', 'cancelado'];
        const isDefaultColumn = defaultStatuses.includes(column.status);

        menu.innerHTML = `
            <button class="menu-item" id="renameColumnBtn">
                ✏️ Renomear coluna
            </button>
            ${!isDefaultColumn ? `
                <button class="menu-item delete-item" id="deleteColumnBtn">
                    🗑️ Excluir coluna
                </button>
            ` : `
                <div style="padding: 8px 16px; font-size: 12px; color: #9e9e9e;">
                    ⚠️ Coluna padrão (não pode excluir)
                </div>
            `}
        `;

        // Estilizar botões
        menu.querySelectorAll('.menu-item').forEach(btn => {
            btn.style.cssText = `
                display: block;
                width: 100%;
                padding: 10px 16px;
                border: none;
                background: none;
                text-align: left;
                cursor: pointer;
                font-size: 14px;
            `;
            btn.addEventListener('mouseover', () => {
                btn.style.background = btn.classList.contains('delete-item') ? '#fff5f5' : '#f5f5f5';
            });
            btn.addEventListener('mouseout', () => {
                btn.style.background = 'none';
            });
        });

        const deleteBtn = menu.querySelector('.delete-item');
        if (deleteBtn) {
            deleteBtn.style.color = '#f44336';
        }

        document.body.appendChild(menu);

        // Eventos dos botões
        menu.querySelector('#renameColumnBtn')?.addEventListener('click', () => {
            menu.remove();
            this.renameColumn(column);
        });

        menu.querySelector('#deleteColumnBtn')?.addEventListener('click', () => {
            menu.remove();
            this.deleteColumn(column);
        });

        // Fechar ao clicar fora
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 100);
    },

    /**
     * Renomeia uma coluna
     */
    renameColumn(column) {
        const newTitle = prompt('Novo nome da coluna:', column.title);
        if (newTitle && newTitle.trim() && newTitle.trim() !== column.title) {
            const columns = Storage.getColumns();
            const colIndex = columns.findIndex(c => c.id === column.id);
            if (colIndex !== -1) {
                columns[colIndex].title = newTitle.trim();
                Storage.saveColumns(columns);
                this.render();
                Toast.show('Coluna renomeada!', 'success');
            }
        }
    },

    /**
     * Exclui uma coluna
     */
    deleteColumn(column) {
        const tasks = Storage.getTasks().filter(t => t.status === column.status);

        let message = `Deseja excluir a coluna "${column.title}"?`;
        if (tasks.length > 0) {
            message += `\n\n⚠️ ATENÇÃO: ${tasks.length} tarefa(s) serão movidas para "Pendente".`;
        }

        if (confirm(message)) {
            // Mover tarefas para Pendente
            tasks.forEach(task => {
                Storage.moveTask(task.id, 'pendente');
            });

            // Remover coluna
            const columns = Storage.getColumns().filter(c => c.id !== column.id);
            Storage.saveColumns(columns);

            this.render();
            Toast.show('Coluna excluída!', 'success');
        }
    },

    // ==================== TASK MENU ====================

    /**
     * Mostra menu de contexto da tarefa
     */
    showTaskMenu(taskId, event) {
        const existingMenu = document.querySelector('.task-context-menu');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.className = 'task-context-menu';
        menu.style.cssText = `
            position: fixed;
            top: ${event.clientY}px;
            left: ${event.clientX}px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            padding: 8px 0;
            z-index: 1000;
            min-width: 150px;
        `;

        menu.innerHTML = `
            <button style="display: block; width: 100%; padding: 8px 16px; border: none; background: none; text-align: left; cursor: pointer; font-size: 14px;" 
                    onmouseover="this.style.background='#f5f5f5'" 
                    onmouseout="this.style.background='none'"
                    onclick="Modals.openEditTaskModal('${taskId}'); document.querySelector('.task-context-menu')?.remove();">
                ✏️ Editar
            </button>
            <button style="display: block; width: 100%; padding: 8px 16px; border: none; background: none; text-align: left; cursor: pointer; font-size: 14px; color: #f44336;" 
                    onmouseover="this.style.background='#fff5f5'" 
                    onmouseout="this.style.background='none'"
                    onclick="Modals.confirmDeleteTask('${taskId}'); document.querySelector('.task-context-menu')?.remove();">
                🗑️ Excluir
            </button>
        `;

        document.body.appendChild(menu);

        // Fechar ao clicar fora
        setTimeout(() => {
            document.addEventListener('click', function closeMenu() {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            });
        }, 100);
    },

    // ==================== HELPERS ====================

    /**
     * Obtém label do tipo
     */
    getTypeLabel(type) {
        const labels = {
            'audiencia': 'Audiência',
            'prazo': 'Prazo',
            'reuniao': 'Reunião',
            'tarefa': 'Tarefa',
            'lembrete': 'Lembrete',
            'outros': 'Outros'
        };
        return labels[type] || 'Tarefa';
    },

    /**
     * Obtém informações do prazo
     */
    getDeadlineInfo(task) {
        if (!task.deadline) return { formatted: '', isOverdue: false };

        const deadline = new Date(task.deadline);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        deadline.setHours(0, 0, 0, 0);

        const isOverdue = deadline < today;
        const formatted = deadline.toLocaleDateString('pt-BR');

        return { formatted, isOverdue };
    },

    /**
     * Obtém iniciais do responsável
     */
    getInitials(responsible) {
        if (!responsible) return '?';
        const names = {
            'ricardo': 'RR',
            'equipe': 'EQ'
        };
        return names[responsible] || responsible.substring(0, 2).toUpperCase();
    },

    /**
     * Obtém nome do responsável
     */
    getResponsibleName(responsible) {
        const names = {
            'ricardo': 'Ricardo Rossetto',
            'equipe': 'Equipe'
        };
        return names[responsible] || responsible;
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
