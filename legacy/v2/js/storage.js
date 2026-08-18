/**
 * Storage Module - Gerenciamento de persistência localStorage
 */

const Storage = {
    KEYS: {
        TASKS: 'kanban_tasks',
        COLUMNS: 'kanban_columns',
        BOARDS: 'kanban_boards',
        SETTINGS: 'kanban_settings'
    },

    /**
     * Colunas padrão do Kanban
     */
    defaultColumns: [
        { id: 'pendente', title: 'Pendente', status: 'pendente', order: 0 },
        { id: 'em-execucao', title: 'Em execução', status: 'em-execucao', order: 1 },
        { id: 'revisao', title: 'Revisão', status: 'revisao', order: 2 },
        { id: 'concluida-sucesso', title: 'Concluída com sucesso', status: 'concluida-sucesso', order: 3 },
        { id: 'concluida-sem-sucesso', title: 'Concluída sem sucesso', status: 'concluida-sem-sucesso', order: 4 },
        { id: 'cancelado', title: 'Cancelado', status: 'cancelado', order: 5 }
    ],

    /**
     * Quadros padrão
     */
    defaultBoards: [
        { id: 'escritorio', name: 'Quadro do Escritório' },
        { id: 'atividades', name: 'Quadro de Atividades' }
    ],

    /**
     * Inicializa o storage com dados padrão se necessário
     */
    init() {
        if (!this.getColumns().length) {
            this.saveColumns(this.defaultColumns);
        }
        if (!this.getBoards().length) {
            this.saveBoards(this.defaultBoards);
        }
        if (!this.getTasks()) {
            this.saveTasks([]);
        }
    },

    /**
     * Gera um ID único
     */
    generateId() {
        return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    },

    // ==================== TASKS ====================

    /**
     * Obtém todas as tarefas
     */
    getTasks() {
        try {
            const data = localStorage.getItem(this.KEYS.TASKS);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Erro ao carregar tarefas:', e);
            return [];
        }
    },

    /**
     * Salva todas as tarefas
     */
    saveTasks(tasks) {
        try {
            localStorage.setItem(this.KEYS.TASKS, JSON.stringify(tasks));
            return true;
        } catch (e) {
            console.error('Erro ao salvar tarefas:', e);
            return false;
        }
    },

    /**
     * Obtém uma tarefa por ID
     */
    getTaskById(id) {
        const tasks = this.getTasks();
        return tasks.find(task => task.id === id);
    },

    /**
     * Adiciona uma nova tarefa
     */
    addTask(taskData) {
        const tasks = this.getTasks();
        const newTask = {
            id: this.generateId(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            showInKanban: true,
            ...taskData
        };
        tasks.push(newTask);
        this.saveTasks(tasks);

        // Sincronizar com Supabase em background
        if (window.Supabase) {
            Supabase.saveTask(newTask).catch(e => console.log('Sync error:', e));
        }

        return newTask;
    },

    /**
     * Atualiza uma tarefa existente
     */
    updateTask(id, updates) {
        const tasks = this.getTasks();
        const index = tasks.findIndex(task => task.id === id);
        if (index !== -1) {
            tasks[index] = {
                ...tasks[index],
                ...updates,
                updatedAt: new Date().toISOString()
            };
            this.saveTasks(tasks);

            // Sincronizar com Supabase em background
            if (window.Supabase) {
                Supabase.saveTask(tasks[index]).catch(e => console.log('Sync error:', e));
            }

            return tasks[index];
        }
        return null;
    },

    /**
     * Remove uma tarefa
     */
    deleteTask(id) {
        const tasks = this.getTasks();
        const filtered = tasks.filter(task => task.id !== id);
        this.saveTasks(filtered);

        // Sincronizar com Supabase em background
        if (window.Supabase) {
            Supabase.deleteTask(id).catch(e => console.log('Sync error:', e));
        }

        return filtered.length < tasks.length;
    },

    /**
     * Obtém tarefas por status
     */
    getTasksByStatus(status) {
        const tasks = this.getTasks();
        return tasks.filter(task => task.status === status && task.showInKanban !== false);
    },

    /**
     * Move uma tarefa para um novo status
     */
    moveTask(taskId, newStatus) {
        return this.updateTask(taskId, { status: newStatus });
    },

    // ==================== COLUMNS ====================

    /**
     * Obtém todas as colunas
     */
    getColumns() {
        try {
            const data = localStorage.getItem(this.KEYS.COLUMNS);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Erro ao carregar colunas:', e);
            return [];
        }
    },

    /**
     * Salva todas as colunas
     */
    saveColumns(columns) {
        try {
            localStorage.setItem(this.KEYS.COLUMNS, JSON.stringify(columns));
            return true;
        } catch (e) {
            console.error('Erro ao salvar colunas:', e);
            return false;
        }
    },

    /**
     * Adiciona uma nova coluna
     */
    addColumn(columnData) {
        const columns = this.getColumns();
        const newColumn = {
            id: 'col_' + Date.now(),
            order: columns.length,
            ...columnData
        };
        columns.push(newColumn);
        this.saveColumns(columns);
        return newColumn;
    },

    /**
     * Atualiza uma coluna
     */
    updateColumn(id, updates) {
        const columns = this.getColumns();
        const index = columns.findIndex(col => col.id === id);
        if (index !== -1) {
            columns[index] = { ...columns[index], ...updates };
            this.saveColumns(columns);
            return columns[index];
        }
        return null;
    },

    /**
     * Remove uma coluna
     */
    deleteColumn(id) {
        const columns = this.getColumns();
        const filtered = columns.filter(col => col.id !== id);
        // Reordenar
        filtered.forEach((col, index) => col.order = index);
        this.saveColumns(filtered);
        return filtered.length < columns.length;
    },

    // ==================== BOARDS ====================

    /**
     * Obtém todos os quadros
     */
    getBoards() {
        try {
            const data = localStorage.getItem(this.KEYS.BOARDS);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Erro ao carregar quadros:', e);
            return [];
        }
    },

    /**
     * Salva todos os quadros
     */
    saveBoards(boards) {
        try {
            localStorage.setItem(this.KEYS.BOARDS, JSON.stringify(boards));
            return true;
        } catch (e) {
            console.error('Erro ao salvar quadros:', e);
            return false;
        }
    },

    // ==================== EXPORT/IMPORT ====================

    /**
     * Exporta todos os dados
     */
    exportData() {
        return {
            tasks: this.getTasks(),
            columns: this.getColumns(),
            boards: this.getBoards(),
            exportedAt: new Date().toISOString()
        };
    },

    /**
     * Importa dados
     */
    importData(data) {
        try {
            if (data.tasks) this.saveTasks(data.tasks);
            if (data.columns) this.saveColumns(data.columns);
            if (data.boards) this.saveBoards(data.boards);
            return true;
        } catch (e) {
            console.error('Erro ao importar dados:', e);
            return false;
        }
    },

    /**
     * Limpa todos os dados
     */
    clearAll() {
        localStorage.removeItem(this.KEYS.TASKS);
        localStorage.removeItem(this.KEYS.COLUMNS);
        localStorage.removeItem(this.KEYS.BOARDS);
        localStorage.removeItem(this.KEYS.SETTINGS);
    }
};

// Inicializar storage
Storage.init();
