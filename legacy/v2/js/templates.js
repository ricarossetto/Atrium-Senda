/**
 * Templates Module - Templates de Tarefas Jurídicas
 */

const Templates = {
    /**
     * Templates disponíveis para advocacia
     */
    templates: [
        {
            id: 'contestacao',
            name: '📄 Contestação',
            icon: '📄',
            type: 'prazo',
            defaults: {
                title: 'Contestação - [Processo]',
                description: 'Elaborar contestação para o processo.\n\nChecklist:\n☐ Analisar petição inicial\n☐ Reunir documentos\n☐ Pesquisar jurisprudência\n☐ Redigir peça\n☐ Revisar\n☐ Protocolar',
                workGroup: 'contencioso'
            }
        },
        {
            id: 'recurso',
            name: '📑 Recurso',
            icon: '📑',
            type: 'prazo',
            defaults: {
                title: 'Recurso - [Tipo] - [Processo]',
                description: 'Interpor recurso contra decisão.\n\nChecklist:\n☐ Analisar decisão recorrida\n☐ Identificar fundamentos\n☐ Pesquisar jurisprudência\n☐ Redigir razões\n☐ Revisar\n☐ Preparar custas\n☐ Protocolar',
                workGroup: 'contencioso'
            }
        },
        {
            id: 'audiencia',
            name: '⚖️ Audiência',
            icon: '⚖️',
            type: 'audiencia',
            defaults: {
                title: 'Audiência - [Tipo] - [Processo]',
                description: 'Preparação para audiência.\n\nChecklist:\n☐ Revisar processo\n☐ Preparar cliente\n☐ Orientar testemunhas\n☐ Separar documentos\n☐ Preparar sustentação oral',
                workGroup: 'contencioso'
            }
        },
        {
            id: 'reuniao-cliente',
            name: '👥 Reunião com Cliente',
            icon: '👥',
            type: 'reuniao',
            defaults: {
                title: 'Reunião - [Cliente]',
                description: 'Reunião com cliente.\n\nPauta:\n☐ Atualização do processo\n☐ Documentos pendentes\n☐ Próximos passos\n☐ Valores/honorários',
                workGroup: 'consultivo'
            }
        },
        {
            id: 'peticao-inicial',
            name: '📝 Petição Inicial',
            icon: '📝',
            type: 'tarefa',
            defaults: {
                title: 'Petição Inicial - [Cliente]',
                description: 'Elaborar petição inicial.\n\nChecklist:\n☐ Entrevista com cliente\n☐ Reunir documentos\n☐ Analisar caso\n☐ Definir pedidos\n☐ Redigir peça\n☐ Calcular valores\n☐ Revisar\n☐ Protocolar',
                workGroup: 'contencioso'
            }
        },
        {
            id: 'contrato',
            name: '📋 Elaborar Contrato',
            icon: '📋',
            type: 'tarefa',
            defaults: {
                title: 'Contrato - [Tipo] - [Cliente]',
                description: 'Elaborar contrato.\n\nChecklist:\n☐ Definir objeto\n☐ Definir cláusulas\n☐ Redigir minuta\n☐ Revisar com cliente\n☐ Coletar assinaturas\n☐ Registrar se necessário',
                workGroup: 'consultivo'
            }
        },
        {
            id: 'diligencia',
            name: '🏃 Diligência Externa',
            icon: '🏃',
            type: 'tarefa',
            defaults: {
                title: 'Diligência - [Local]',
                description: 'Diligência externa.\n\nDetalhes:\n☐ Local:\n☐ Objetivo:\n☐ Documentos necessários:\n☐ Prazo para resultado:',
                workGroup: 'geral'
            }
        },
        {
            id: 'lembrete-publicacao',
            name: '🔔 Verificar Publicações',
            icon: '🔔',
            type: 'lembrete',
            defaults: {
                title: 'Verificar publicações do dia',
                description: 'Conferir intimações e publicações no Diário Eletrônico.\n\nFontes:\n☐ DJe TJ\n☐ DJe TRF\n☐ DJe TST\n☐ DOU',
                workGroup: 'geral'
            }
        },
        {
            id: 'embargos',
            name: '📄 Embargos de Declaração',
            icon: '📄',
            type: 'prazo',
            defaults: {
                title: 'Embargos de Declaração - [Processo]',
                description: 'Opor embargos de declaração.\n\nFundamentos:\n☐ Omissão\n☐ Contradição\n☐ Obscuridade\n\nChecklist:\n☐ Identificar vícios\n☐ Redigir peça\n☐ Revisar\n☐ Protocolar (prazo: 5 dias)',
                workGroup: 'contencioso'
            }
        },
        {
            id: 'cumprimento-sentenca',
            name: '💰 Cumprimento de Sentença',
            icon: '💰',
            type: 'tarefa',
            defaults: {
                title: 'Cumprimento de Sentença - [Processo]',
                description: 'Iniciar cumprimento de sentença.\n\nChecklist:\n☐ Verificar trânsito em julgado\n☐ Atualizar cálculos\n☐ Preparar memória de cálculo\n☐ Redigir petição\n☐ Protocolar\n☐ Requerer penhora',
                workGroup: 'contencioso'
            }
        }
    ],

    /**
     * Inicializa templates
     */
    init() {
        this.addTemplateButton();
        this.addTemplateModal();
    },

    /**
     * Adiciona botão de templates
     */
    addTemplateButton() {
        const btnNewTask = document.getElementById('btnNewTask');
        if (!btnNewTask) return;

        // Criar dropdown
        const wrapper = document.createElement('div');
        wrapper.className = 'dropdown-wrapper';
        wrapper.innerHTML = `
            <button class="btn btn-success" id="btnNewTaskDropdown">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Novo
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 4px">
                    <polyline points="6 9 12 15 18 9"/>
                </svg>
            </button>
            <div class="dropdown-menu" id="newTaskDropdown">
                <button class="dropdown-item" onclick="Templates.hideDropdown(); Modals.openNewTaskModal();">
                    <span>📝</span> Nova Tarefa em Branco
                </button>
                <div class="dropdown-divider"></div>
                <div class="dropdown-header">Templates</div>
                ${this.templates.map(t => `
                    <button class="dropdown-item" onclick="Templates.useTemplate('${t.id}')">
                        <span>${t.icon}</span> ${t.name}
                    </button>
                `).join('')}
            </div>
        `;

        btnNewTask.replaceWith(wrapper);

        // Adicionar evento de toggle
        document.getElementById('btnNewTaskDropdown').onclick = (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        };

        // Fechar ao clicar fora
        document.addEventListener('click', () => this.hideDropdown());
    },

    /**
     * Toggle dropdown
     */
    toggleDropdown() {
        const dropdown = document.getElementById('newTaskDropdown');
        dropdown.classList.toggle('show');
    },

    /**
     * Esconde dropdown
     */
    hideDropdown() {
        const dropdown = document.getElementById('newTaskDropdown');
        if (dropdown) dropdown.classList.remove('show');
    },

    /**
     * Usa um template
     */
    useTemplate(templateId) {
        this.hideDropdown();

        const template = this.templates.find(t => t.id === templateId);
        if (!template) {
            Modals.openNewTaskModal();
            return;
        }

        // Abrir modal com dados do template
        Modals.openNewTaskModal();

        // Preencher com dados do template após o modal abrir
        setTimeout(() => {
            if (template.defaults.title) {
                document.getElementById('taskTitle').value = template.defaults.title;
            }
            if (template.type) {
                document.getElementById('taskType').value = template.type;
            }
            if (template.defaults.description) {
                document.getElementById('taskDescription').value = template.defaults.description;
            }
            if (template.defaults.workGroup) {
                document.getElementById('taskWorkGroup').value = template.defaults.workGroup;
            }

            // Focar no título para o usuário preencher o placeholder
            document.getElementById('taskTitle').focus();
            document.getElementById('taskTitle').select();
        }, 100);

        Toast.show(`Template "${template.name}" carregado!`, 'success');
    },

    /**
     * Adiciona modal de gerenciamento de templates (futuro)
     */
    addTemplateModal() {
        // Placeholder para futura implementação de templates customizados
    }
};
