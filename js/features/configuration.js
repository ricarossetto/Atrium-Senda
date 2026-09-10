const CONFIGURATION_ICON_NAMES = new Set(['check', 'delete']);
const iconSvg = name => {
  const safeName = CONFIGURATION_ICON_NAMES.has(name) ? name : 'check';
  return `<svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg#atrium-icon-${safeName}"></use></svg>`;
};

const CONFIGURATION_SECTIONS = [
  ['taskDefinitions', 'Tarefas'],
  ['users', 'Usuários'],
  ['actionGroups', 'Grupos'],
  ['actionTypes', 'Tipos de ação'],
  ['stages', 'Etapas'],
  ['origins', 'Origens'],
  ['goals', 'Metas'],
  ['inboxSections', 'Caixa de entrada'],
  ['notificationAssignments', 'Notificações'],
  ['integrations', 'Integrações'],
  ['registry', 'Inteligência Cadastral'],
  ['diagnostic', 'Diagnóstico & Saúde'],
  ['backups', 'Backups & Restauração']
];

const FIELDS_BY_SECTION = {
  taskDefinitions: [
    { name: 'name', label: 'Nome da tarefa', required: true, full: true },
    { name: 'points', label: 'Pontuação de produtividade', type: 'number' },
    { name: 'phase', label: 'Fase processual', suggestions: ['Judicial', 'Recursal', 'Execução/cobrança', 'Administrativo', 'Negociação', 'Consultoria', 'Marketing', 'Rh/financeiro', 'Todas'] },
    { name: 'slaDays', label: 'Prazo padrão (dias úteis)', type: 'number', note: 'Prazo preenchido automaticamente ao criar tarefas deste tipo' },
    { name: 'priority', label: 'Prioridade sugerida', type: 'select', options: [{ value: 'normal', label: 'Normal' }, { value: 'alta', label: 'Alta prioridade' }, { value: 'urgente', label: 'Urgente / Prazo fatal' }, { value: 'baixa', label: 'Baixa prioridade' }] },
    { name: 'defaultRole', label: 'Responsável sugerido', type: 'select', options: [{ value: '', label: 'A definir no processo' }, { value: 'Advogado Titular', label: 'Advogado Titular' }, { value: 'Controladoria & Prazos', label: 'Controladoria & Prazos' }, { value: 'Assistente Jurídico', label: 'Assistente Jurídico' }, { value: 'Secretaria', label: 'Secretaria / Administrativo' }] },
    { name: 'requireDocument', label: 'Exigência documental', type: 'select', options: [{ value: 'nao', label: 'Não obrigatório' }, { value: 'sim', label: 'Sim — exige anexo de minuta ou petição' }] },
    { name: 'status', label: 'Status no catálogo', type: 'select', options: [{ value: 'ativo', label: 'Ativo (disponível para criação)' }, { value: 'inativo', label: 'Inativo (ocultar novos registros)' }] },
    { name: 'instructions', label: 'Instruções e checklist de execução', type: 'textarea', full: true, placeholder: 'Orientações práticas para o executor da tarefa…' }
  ],
  users: [
    { name: 'name', label: 'Nome do usuário', required: true, full: true },
    { name: 'role', label: 'Função no escritório', suggestions: ['Administrador', 'Advogado Sócio', 'Advogado Titular', 'Advogado Associado', 'Assistente Jurídico', 'Controladoria & Prazos', 'Secretária'] },
    { name: 'pointsGoal', label: 'Meta mensal de pontos', type: 'number' },
    { name: 'oab', label: 'Inscrição OAB', placeholder: 'Ex.: OAB/RS 000000' },
    { name: 'email', label: 'E-mail profissional', type: 'email', placeholder: 'nome@escritorio.adv.br' },
    { name: 'status', label: 'Status da conta', type: 'select', options: [{ value: 'ativo', label: 'Ativo' }, { value: 'inativo', label: 'Suspenso' }] }
  ],
  actionGroups: [
    { name: 'name', label: 'Grupo de ação / Área', required: true, full: true },
    { name: 'publicationResponsible', label: 'Responsável pelas publicações', full: true },
    { name: 'leaderLawyer', label: 'Advogado coordenador da área', type: 'select', options: [{ value: '', label: 'A definir' }, { value: 'Advogado Titular', label: 'Advogado Titular' }, { value: 'Sócio Responsável', label: 'Sócio Responsável' }, { value: 'Controladoria Jurídica', label: 'Controladoria Jurídica' }] },
    { name: 'autoAssign', label: 'Distribuição automática de publicações', type: 'select', options: [{ value: 'sim', label: 'Sim — vincular publicações da área ao responsável' }, { value: 'nao', label: 'Não — passar por triagem manual' }] },
    { name: 'color', label: 'Cor identificadora da área', type: 'select', options: [{ value: 'gold', label: 'Dourado ATRIUM' }, { value: 'blue', label: 'Azul Petróleo' }, { value: 'emerald', label: 'Verde Esmeralda' }, { value: 'burgundy', label: 'Bordô / Vinho' }, { value: 'indigo', label: 'Índigo Profundo' }] },
    { name: 'description', label: 'Diretrizes e escopo da área', type: 'textarea', full: true, placeholder: 'Descreva a abrangência jurídica e regras desta especialidade…' }
  ],
  actionTypes: [
    { name: 'name', label: 'Tipo de ação', required: true, full: true },
    { name: 'group', label: 'Grupo de especialidade', suggestions: ['Cível', 'Trabalhista', 'Previdenciário', 'Família', 'Consumidor', 'Tributário', 'Criminal', 'Precatório', 'Administrativo', 'Serviços'] },
    { name: 'procedure', label: 'Rito processual sugerido', type: 'select', options: [{ value: 'comum', label: 'Comum / Ordinário' }, { value: 'sumarissimo', label: 'Sumaríssimo / Juizado Especial (JEC/JEF)' }, { value: 'execucao', label: 'Execução de Título' }, { value: 'especial', label: 'Procedimento Especial' }, { value: 'administrativo', label: 'Processo Administrativo' }] },
    { name: 'defaultCourt', label: 'Tribunal padrão sugerido', type: 'select', options: [{ value: 'TJRS', label: 'TJRS — Justiça Estadual' }, { value: 'TRF4', label: 'TRF4 / JEF — Justiça Federal' }, { value: 'TRT4', label: 'TRT4 — Justiça do Trabalho' }, { value: 'STJ', label: 'STJ — Superior Tribunal de Justiça' }, { value: 'STF', label: 'STF — Supremo Tribunal Federal' }, { value: 'outro', label: 'Outro / Variável' }] },
    { name: 'estimatedDuration', label: 'Duração média estimada (meses)', type: 'number', placeholder: 'ex: 24' },
    { name: 'status', label: 'Status do tipo de ação', type: 'select', options: [{ value: 'ativo', label: 'Ativo (disponível no cadastro de processos)' }, { value: 'inativo', label: 'Inativo / Em desuso' }] }
  ],
  stages: [
    { name: 'name', label: 'Etapa', required: true, full: true },
    { name: 'classification', label: 'Classificação / Macro-fase', suggestions: ['Inicial', 'Acordo', 'Audiência', 'Julgamento', 'Recurso', 'Execução', 'Pagamento', 'Diligência', 'Triagem', 'Encerrado'] },
    { name: 'phase', label: 'Fase processual', suggestions: ['Judicial', 'Recursal', 'Execução/cobrança', 'Administrativo', 'Negociação', 'Consultoria', 'Arquivamento'] },
    { name: 'slaMaxDays', label: 'Alerta de estagnação (dias)', type: 'number', note: 'Gera aviso se o processo ficar nesta etapa por mais de X dias sem andamento' },
    { name: 'nextSuggestedStage', label: 'Próxima etapa recomendada no fluxo', suggestions: ['AÇÃO PROTOCOLADA/INICIADA', 'AGUARDA AUDIÊNCIA', 'AGUARDA SENTENÇA', 'APRESENTADO RECURSO', 'CUMPRIMENTO DE SENTENÇA', 'RPV EMITIDO', 'TRÂNSITO EM JULGADO / PROCESSO FINALIZADO'] },
    { name: 'status', label: 'Status da etapa', type: 'select', options: [{ value: 'ativo', label: 'Ativa no pipeline' }, { value: 'inativo', label: 'Oculta' }] }
  ],
  origins: [
    { name: 'name', label: 'Origem', required: true, full: true },
    { name: 'channelType', label: 'Canal de captação', type: 'select', options: [{ value: 'indicacao', label: 'Indicação de Cliente / Terceiro' }, { value: 'marketing_digital', label: 'Marketing Digital / Google Ads' }, { value: 'redes_sociais', label: 'Redes Sociais / WhatsApp' }, { value: 'balcao', label: 'Atendimento Balcão / Presencial' }, { value: 'parceria', label: 'Parceria Profissional / Correspondente' }, { value: 'convenio', label: 'Convênio / Entidade Sindical' }, { value: 'outro', label: 'Outro canal' }] },
    { name: 'partnerCommission', label: 'Comissão / Parceria padrão (%)', type: 'number', placeholder: 'ex: 10', note: 'Percentual padrão de honorários do parceiro para esta origem' },
    { name: 'defaultAttendant', label: 'Responsável padrão pelo primeiro atendimento', placeholder: 'Ex.: Advogado Titular, Equipe Comercial' },
    { name: 'status', label: 'Status do canal', type: 'select', options: [{ value: 'ativo', label: 'Ativo para novos clientes' }, { value: 'inativo', label: 'Inativo / Encerrado' }] }
  ],
  goals: [
    { name: 'group', label: 'Grupo / Área', required: true, full: true },
    { name: 'monthlyClosings', label: 'Meta mensal de fechamentos', type: 'number' },
    { name: 'financialGoal', label: 'Meta mensal de faturamento (R$)', type: 'number', placeholder: 'ex: 50000', note: 'Faturamento bruto esperado em novos fechamentos' },
    { name: 'pointsGoal', label: 'Meta de pontos da equipe', type: 'number', placeholder: 'ex: 1500' },
    { name: 'period', label: 'Período de apuração', type: 'select', options: [{ value: 'mensal', label: 'Mensal' }, { value: 'trimestral', label: 'Trimestral' }, { value: 'semestral', label: 'Semestral' }, { value: 'anual', label: 'Anual' }] },
    { name: 'responsible', label: 'Gestor responsável pela meta', placeholder: 'Ex.: Advogado Titular' }
  ],
  inboxSections: [
    { name: 'value', label: 'Nome da seção', required: true, full: true },
    { name: 'filterRule', label: 'Regra de agrupamento de publicações', type: 'select', options: [{ value: 'todas', label: 'Todas as publicações recentes' }, { value: 'urgentes', label: 'Apenas publicações urgentes e prazos fatais' }, { value: 'nao_tratadas', label: 'Somente publicações pendentes de triagem' }, { value: 'datajud', label: 'Andamentos capturados no DataJud' }, { value: 'tarefas', label: 'Tarefas urgentes com prazo no dia' }] },
    { name: 'displayLimit', label: 'Limite de exibição de itens', type: 'select', options: [{ value: '10', label: '10 itens' }, { value: '20', label: '20 itens (recomendado)' }, { value: '50', label: '50 itens' }, { value: '100', label: '100 itens' }] },
    { name: 'highlightUrgent', label: 'Destacar itens urgentes no topo', type: 'select', options: [{ value: 'sim', label: 'Sim — destacar com badge de urgência' }, { value: 'nao', label: 'Não — ordenação cronológica padrão' }] },
    { name: 'status', label: 'Visibilidade da seção', type: 'select', options: [{ value: 'ativo', label: 'Ativa no painel de entrada' }, { value: 'oculta', label: 'Oculta temporariamente' }] }
  ],
  notificationAssignments: [
    { name: 'event', label: 'Evento disparador', required: true, full: true, suggestions: ['Publicação capturada do DJEN', 'Prazo fatal a vencer em 48h', 'Prazo fatal a vencer em 24h', 'Andamento capturado nos tribunais', 'Nova tarefa atribuída', 'Intimação urgente pendente', 'Novo lead / atendimento cadastrado'] },
    { name: 'responsibles', label: 'Responsáveis destinatários', full: true, placeholder: 'Separe os nomes ou cargos por vírgula (ex: Advogado Titular, Apoio Jurídico)', note: 'Membros da equipe que receberão o aviso' },
    { name: 'channels', label: 'Canais de entrega', full: true, type: 'select', options: [{ value: 'inapp_email', label: 'Painel In-App + Notificação por E-mail' }, { value: 'inapp_only', label: 'Apenas Painel In-App' }, { value: 'inapp_email_alert', label: 'Painel + E-mail + Alerta Sonoro no Navegador' }, { value: 'critical_banner', label: 'Alerta Visual Crítico em Tela' }] },
    { name: 'timing', label: 'Momento do envio', type: 'select', options: [{ value: 'imediato', label: 'Imediato ao detectar o evento' }, { value: '24h', label: '24 horas antes do prazo' }, { value: '48h', label: '48 horas antes do prazo' }, { value: '08h_dia', label: 'No início do dia do evento (08:00)' }] },
    { name: 'urgency', label: 'Nível de gravidade', type: 'select', options: [{ value: 'normal', label: 'Normal' }, { value: 'alta', label: 'Alta relevância' }, { value: 'urgente', label: 'Urgente / Prazo fatal' }] },
    { name: 'autoTask', label: 'Criar tarefa automática no kanban', type: 'select', options: [{ value: 'nao', label: 'Não — apenas notificar' }, { value: 'sim', label: 'Sim — abrir tarefa de análise na triagem' }] },
    { name: 'status', label: 'Estado da notificação', type: 'select', options: [{ value: 'ativo', label: 'Ativa (enviar alertas)' }, { value: 'pausada', label: 'Pausada temporariamente' }] }
  ],
  integrations: [
    { name: 'name', label: 'Integração', required: true, full: true },
    { name: 'status', label: 'Status da conexão', type: 'select', options: [{ value: 'Ativo', label: 'Ativo (operacional)' }, { value: 'Preparado', label: 'Preparado (aguarda credencial)' }, { value: 'Pausado', label: 'Pausado temporariamente' }, { value: 'Desativado', label: 'Desativado' }] },
    { name: 'method', label: 'Método / Tipo de agente', suggestions: ['API Oficial Pública', 'Agente Local Seguro', 'REST API', 'Sincronização iCal', 'Conexão IMAP / SMTP'] },
    { name: 'syncFrequency', label: 'Frequência de sincronização', type: 'select', options: [{ value: 'auto', label: 'Automática a cada 30 minutos' }, { value: 'hourly', label: 'A cada 1 hora' }, { value: 'daily', label: 'Diária (08:00 e 18:00)' }, { value: 'manual', label: 'Somente sob demanda (manual)' }] },
    { name: 'autoNotifyErrors', label: 'Notificar falhas de conexão', type: 'select', options: [{ value: 'sim', label: 'Sim — alertar administradores em caso de falha' }, { value: 'nao', label: 'Não — apenas registrar na auditoria' }] },
    { name: 'notes', label: 'Notas técnicas e parâmetros do escritório', type: 'textarea', full: true, placeholder: 'Endpoints, observações sobre credenciais ou regras internas…' }
  ]
};

const formatResponsibles = value => {
  if (Array.isArray(value)) return value.map(item => String(item ?? '').trim()).filter(Boolean).join(', ');
  if (typeof value === 'string') return value.trim();
  return '';
};

function getDirectSetupTarget(name) {
  const normalized = String(name || '').toLowerCase();
  if (/eproc|pje|a1|certificado|portais/.test(normalized)) {
    return {
      type: 'judicial',
      badge: 'Certificado Digital A1 + TOTP',
      description: 'Gerencie o arquivo PFX, senha protegida e o 2FA QR Code para varredura segura nos portais judiciais.',
      actionLabel: 'Abrir Painel de Certificado A1'
    };
  }
  if (/datajud|cnj|djen|diário/.test(normalized)) {
    return {
      type: 'datajud',
      badge: 'DataJud / CNJ Metadados',
      description: 'Configure a chave pública da API DataJud/CNJ e o tribunal padrão para captura de andamentos.',
      actionLabel: 'Configurar Chave DataJud'
    };
  }
  if (/gemini|ia|inteligência/.test(normalized)) {
    return {
      type: 'gemini',
      badge: 'Google Gemini Flash IA',
      description: 'Configure sua Gemini API Key gratuita e ative a assistência jurídica inteligente do ATRIUM.',
      actionLabel: 'Configurar Chave da IA'
    };
  }
  if (/webcal|agenda|calendar/.test(normalized)) {
    return {
      type: 'calendar',
      badge: 'Agenda Externa iCal',
      description: 'Exporte o feed seguro iCal com prazos e compromissos para sincronizar com Google Agenda ou Outlook.',
      actionLabel: 'Configurar Feed de Agenda'
    };
  }
  if (/email|e-mail|imap|smtp/.test(normalized)) {
    return {
      type: 'email',
      badge: 'E-mail Corporativo',
      description: 'Configure servidores IMAP/SMTP, destinatários e regras de captura automática de publicações por e-mail.',
      actionLabel: 'Configurar Contas de E-mail'
    };
  }
  return {
    type: 'general',
    badge: 'Integração de Sistema',
    description: 'Parametrize a frequência de sincronização, regras de alerta e notas técnicas desta integração.',
    actionLabel: 'Ajustar Parâmetros'
  };
}

export function createConfigurationFeature({
  store,
  documentRef = globalThis.document,
  secureFetch,
  escapeHtml = value => String(value ?? ''),
  normalizeText = value => String(value ?? '').toLowerCase(),
  openModal = () => {},
  showToast = () => {},
  onRenderDiagnostic = () => {},
  onRenderBackups = () => {},
  onOpenJudicialSetup = () => {},
  onOpenDataJudModal = () => {},
  onOpenGeminiKeyModal = () => {},
  onOpenCalendarSetup = () => {},
  onOpenEmailConfigModal = () => {},
  presentation = null,
  warn = () => {}
} = {}) {
  let configurationSection = 'taskDefinitions';
  let authUsers = [];
  let currentAuthRole = 'collaborator';
  let initialized = false;
  const byId = id => documentRef.getElementById(id);

  const feature = {
    get section() { return configurationSection; },
    set section(value) { configurationSection = value || 'taskDefinitions'; },
    get users() { return authUsers; },
    set users(value) { authUsers = Array.isArray(value) ? value : []; },
    get role() { return currentAuthRole; },
    set role(value) { currentAuthRole = value || 'collaborator'; },
    get initialized() { return initialized; },

    init() {
      if (initialized) return false;
      initialized = true;
      byId('configurationSearch')?.addEventListener('input', () => feature.render(byId('configurationSearch')?.value || ''));
      byId('configurationTabs')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-config-section]');
        if (!button) return;
        configurationSection = button.dataset.configSection;
        if (byId('configurationSearch')) byId('configurationSearch').value = '';
        if (configurationSection === 'users') feature.loadAuthUsers().then(() => feature.render());
        else feature.render();
      });
      byId('newConfigurationButton')?.addEventListener('click', () => feature.openModal());
      byId('btnConfigMyProfile')?.addEventListener('click', () => {
        if (window.KellerAuth?.openProfile) window.KellerAuth.openProfile();
        else byId('profileButton')?.click();
      });
      byId('configurationList')?.addEventListener('click', event => {
        const registryAction = event.target.closest('[data-registry-config-action]')?.dataset.registryConfigAction;
        if (registryAction) {
          event.preventDefault();
          if (registryAction === 'status') feature.loadRegistryStatus();
          if (registryAction === 'banks') feature.searchRegistryBanks();
          if (registryAction === 'test-provider') feature.testRegistryProvider(event.target.closest('[data-registry-provider]')?.dataset.registryProvider, event.target.closest('button'));
          return;
        }
        const directBtn = event.target.closest('[data-direct-integration]');
        if (directBtn) {
          event.preventDefault();
          event.stopPropagation();
          feature.triggerDirectIntegration(directBtn.dataset.directIntegration);
          return;
        }
        const toggleIntegrationBtn = event.target.closest('[data-toggle-integration]');
        if (toggleIntegrationBtn) {
          event.preventDefault();
          event.stopPropagation();
          feature.toggleRecordStatus(Number(toggleIntegrationBtn.dataset.toggleIntegration));
          return;
        }
        const toggleStatusBtn = event.target.closest('[data-toggle-status]');
        if (toggleStatusBtn) {
          event.preventDefault();
          event.stopPropagation();
          feature.toggleRecordStatus(Number(toggleStatusBtn.dataset.toggleStatus));
          return;
        }
        const deleteButton = event.target.closest('[data-delete-config]');
        if (deleteButton) {
          event.preventDefault();
          event.stopPropagation();
          feature.deleteRecord(Number(deleteButton.dataset.deleteConfig));
          return;
        }
        const authDeleteButton = event.target.closest('[data-auth-user-delete]');
        if (authDeleteButton) {
          event.preventDefault();
          event.stopPropagation();
          const userId = authDeleteButton.dataset.authUserDelete;
          if (userId) feature.deleteAuthUser(userId);
          return;
        }
        const openProfileBtn = event.target.closest('[data-open-my-profile]');
        if (openProfileBtn) {
          event.preventDefault();
          event.stopPropagation();
          if (window.KellerAuth?.openProfile) window.KellerAuth.openProfile();
          else byId('profileButton')?.click();
          return;
        }
        const authStatusButton = event.target.closest('[data-auth-user-status]');
        if (authStatusButton) {
          event.preventDefault();
          event.stopPropagation();
          const row = authStatusButton.closest('[data-auth-user-id]');
          if (row) feature.manageAuthUser(row.dataset.authUserId, authStatusButton.dataset.authUserStatus);
          return;
        }
        const row = event.target.closest('[data-config-index]');
        if (!row) return;
        const index = Number(row.dataset.configIndex);
        const records = Array.isArray(store.state.configuration?.[configurationSection]) ? store.state.configuration[configurationSection] : [];
        if (records[index] !== undefined) feature.openModal(records[index], index);
      });
      byId('modalForm')?.addEventListener('click', event => {
        const modalIntegrationBtn = event.target.closest('[data-modal-open-dedicated-integration]');
        if (modalIntegrationBtn) {
          event.preventDefault();
          const targetName = modalIntegrationBtn.dataset.modalOpenDedicatedIntegration;
          byId('modalClose')?.click?.() || byId('modalCancel')?.click?.();
          setTimeout(() => feature.triggerDirectIntegration(targetName), 80);
        }
      });
      byId('configurationList')?.addEventListener('submit', event => {
        if (event.target.matches('[data-registry-bank-form]')) {
          event.preventDefault();
          feature.searchRegistryBanks();
        } else if (event.target.matches('[data-registry-cpf-form]')) {
          event.preventDefault();
          feature.validateRegistryCpf();
        }
      });
      presentation?.init?.();
      return true;
    },

    async loadAuthUsers() {
      try {
        const response = await secureFetch('/api/auth/users', { headers: { Accept: 'application/json' } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível carregar os usuários de acesso.');
        authUsers = Array.isArray(payload.users) ? payload.users : [];
        currentAuthRole = payload.currentRole || 'collaborator';
        return authUsers;
      } catch (error) {
        authUsers = [];
        currentAuthRole = 'collaborator';
        warn('Falha ao carregar usuários de autenticação.');
        return [];
      }
    },

    async manageAuthUser(userId, status) {
      try {
        const response = await secureFetch('/api/auth/users/manage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ userId, status })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível atualizar o usuário.');
        await feature.loadAuthUsers();
        feature.render();
        showToast('Acesso do usuário atualizado.', 'success');
        return true;
      } catch (error) {
        showToast(error.message, 'error');
        return false;
      }
    },

    async deleteAuthUser(userId) {
      if (!window.confirm('Deseja realmente excluir permanentemente este usuário do escritório?')) return false;
      try {
        const response = await secureFetch('/api/auth/users/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ userId })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível excluir o usuário.');
        await feature.loadAuthUsers();
        feature.render();
        showToast('Usuário excluído com sucesso.', 'success');
        return true;
      } catch (error) {
        showToast(error.message, 'error');
        return false;
      }
    },

    authUserRow(user) {
      const labels = { active: 'Ativo', inactive: 'Suspenso', pending_approval: 'Aguardando aprovação' };
      const canManage = currentAuthRole === 'master_admin' && user.role !== 'master_admin';
      const nextStatus = user.status === 'active' ? 'inactive' : 'active';
      const actionLabel = user.status === 'pending_approval' ? 'Aprovar' : user.status === 'active' ? 'Suspender' : 'Reativar';
      if (documentRef.documentElement?.dataset?.ui === 'v2') {
        const roleLabel = user.role === 'master_admin' ? 'Administrador mestre' : 'Colaborador';
        const statusLabel = labels[user.status] || user.status || 'Ativo';
        return `<article class="configuration-row configuration-user-row" role="listitem" data-auth-user-id="${escapeHtml(user.id)}" data-auth-user-state="${escapeHtml(user.status || 'active')}">
          <div class="config-row-info"><strong>${escapeHtml(user.displayName || user.username)}</strong><span>${escapeHtml(user.email || user.username)}</span><small>${escapeHtml(roleLabel)}</small></div>
          <span class="configuration-user-status status-${escapeHtml(user.status || 'active')}">${escapeHtml(statusLabel)}</span>
          <div class="configuration-row-actions">${canManage ? `<button type="button" class="button ghost" data-auth-user-status="${nextStatus}" aria-label="${actionLabel} acesso de ${escapeHtml(user.displayName || user.username)}">${actionLabel}</button><button type="button" class="button ghost danger-text" data-auth-user-delete="${escapeHtml(user.id)}" aria-label="Excluir usuário ${escapeHtml(user.displayName || user.username)}">Excluir</button>` : '<button type="button" class="button ghost" data-open-my-profile="true" title="Abrir configurações, redefinir ou apagar meu perfil">Meu perfil</button>'}</div>
        </article>`;
      }
      return `<div class="configuration-row" data-auth-user-id="${escapeHtml(user.id)}">
        <div class="config-row-info"><strong>${escapeHtml(user.displayName || user.username)}</strong><span>${escapeHtml(user.email || user.username)} · ${user.role === 'master_admin' ? 'Administrador' : 'Colaborador'}</span><small>${escapeHtml(labels[user.status] || user.status || 'Ativo')}</small></div>
        ${canManage ? `<button type="button" class="button ghost" data-auth-user-status="${nextStatus}">${actionLabel}</button><button type="button" class="button ghost danger-text" data-auth-user-delete="${escapeHtml(user.id)}">Excluir</button>` : '<button type="button" class="button ghost" data-open-my-profile="true">Meu perfil</button>'}
      </div>`;
    },

    render(query = '') {
      const config = store.state.configuration || {};
      const tabs = byId('configurationTabs');
      if (tabs) tabs.innerHTML = CONFIGURATION_SECTIONS.map(([key, label]) => `<button type="button" class="${configurationSection === key ? 'active' : ''}" data-config-section="${key}">${label}</button>`).join('');
      const metrics = byId('configurationMetrics');
      if (metrics) {
        metrics.innerHTML = [
          ['Definições de tarefa', config.taskDefinitions?.length || 0],
          ['Tipos de ação', config.actionTypes?.length || 0],
          ['Etapas', config.stages?.length || 0],
          ['Usuários de acesso', authUsers.length],
          ['Contatos importados', store.state.contacts.length]
        ].map(([label, count]) => `<div class="configuration-metric"><strong>${count}</strong><span>${label}</span></div>`).join('');
      }
      const label = CONFIGURATION_SECTIONS.find(([key]) => key === configurationSection)?.[1] || 'Configuração';
      const isAuthUsers = configurationSection === 'users';
      const isSpecialSection = ['registry', 'diagnostic', 'backups'].includes(configurationSection);
      byId('newConfigurationButton')?.classList.toggle('hidden', isAuthUsers || isSpecialSection);
      byId('configurationSearch')?.closest('.table-search')?.classList.toggle('hidden', isSpecialSection);

      if (configurationSection === 'diagnostic') {
        if (byId('configurationHeading')) byId('configurationHeading').textContent = 'Diagnóstico & Saúde do Sistema';
        if (byId('configurationCount')) byId('configurationCount').textContent = 'Atrium v2.0';
        onRenderDiagnostic();
        presentation?.sync?.({ section: configurationSection, special: true });
        return;
      }
      if (configurationSection === 'backups') {
        if (byId('configurationHeading')) byId('configurationHeading').textContent = 'Cópias de Segurança & Restauração';
        if (byId('configurationCount')) byId('configurationCount').textContent = 'Zero Trust';
        onRenderBackups();
        presentation?.sync?.({ section: configurationSection, special: true });
        return;
      }
      if (configurationSection === 'registry') {
        if (byId('configurationHeading')) byId('configurationHeading').textContent = 'Inteligência Cadastral Brasileira';
        if (byId('configurationCount')) byId('configurationCount').textContent = 'Fontes públicas supervisionadas';
        if (byId('configurationList')) byId('configurationList').innerHTML = registryConfigurationShell();
        presentation?.sync?.({ section: configurationSection, special: true });
        feature.loadRegistryStatus();
        return;
      }

      const raw = isAuthUsers ? authUsers : (Array.isArray(config[configurationSection]) ? config[configurationSection] : []);
      const needle = normalizeText(query);
      const records = raw.map((item, index) => ({ item, index })).filter(({ item }) => !needle || normalizeText(typeof item === 'string' ? item : Object.values(item || {}).flat().join(' ')).includes(needle));
      if (byId('configurationHeading')) byId('configurationHeading').textContent = label;
      if (byId('configurationCount')) byId('configurationCount').textContent = `${records.length} itens`;
      const list = byId('configurationList');
      const emptyIcon = documentRef.documentElement?.dataset?.ui === 'v2' ? iconSvg('check') : '✓';
      if (list) list.innerHTML = records.length ? records.map(({ item, index }) => isAuthUsers ? feature.authUserRow(item) : feature.row(item, index)).join('') : `<div class="empty-detail"><span>${emptyIcon}</span><h3>Nenhum item</h3><p>Não há registros nesta seção ou neste filtro.</p></div>`;
      presentation?.sync?.({ section: configurationSection, authUsers: isAuthUsers });
    },

    async loadRegistryStatus() {
      const target = byId('registryProviderStatus');
      if (!target) return null;
      target.innerHTML = '<p class="registry-config-loading" role="status">Verificando configuração local…</p>';
      try {
        const response = await secureFetch('/api/registry/status', { headers: { Accept: 'application/json' } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível verificar as fontes cadastrais.');
        target.innerHTML = (payload.providers || []).map(provider => registryProviderCard(provider, escapeHtml)).join('');
        return payload;
      } catch (error) {
        target.innerHTML = `<p class="registry-config-error" role="alert">${escapeHtml(error.message)}</p>`;
        return null;
      }
    },

    async searchRegistryBanks() {
      const query = byId('registryBankQuery')?.value || '';
      const target = byId('registryBankResults');
      if (!target) return [];
      target.innerHTML = '<p class="registry-config-loading" role="status">Consultando o diretório bancário…</p>';
      try {
        const response = await secureFetch(`/api/registry/banks?query=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível consultar o diretório bancário.');
        const records = Array.isArray(payload.records) ? payload.records : [];
        target.innerHTML = records.length ? records.map(bank => `<article><strong>${escapeHtml(bank.code || '—')} · ${escapeHtml(bank.name)}</strong><span>ISPB ${escapeHtml(bank.ispb || 'não informado')}</span><small>${escapeHtml(bank.fullName || bank.name)}</small></article>`).join('') : '<p>Nenhuma instituição localizada.</p>';
        return records;
      } catch (error) {
        target.innerHTML = `<p class="registry-config-error" role="alert">${escapeHtml(error.message)}</p>`;
        return [];
      }
    },

    async validateRegistryCpf() {
      const value = byId('registryCpfQuery')?.value || '';
      const target = byId('registryCpfResult');
      if (!target) return null;
      target.innerHTML = '<p class="registry-config-loading" role="status">Validando CPF…</p>';
      try {
        const response = await secureFetch(`/api/registry/document/validate?value=${encodeURIComponent(value)}`, { headers: { Accept: 'application/json' } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível validar o CPF.');
        if (payload.type !== 'cpf') throw new Error('Informe um CPF com 11 dígitos.');
        target.innerHTML = `<p class="registry-cpf-result ${payload.valid ? 'is-valid' : 'is-invalid'}" role="status"><strong>${escapeHtml(payload.formatted || value)}</strong><span>${escapeHtml(payload.message || (payload.valid ? 'CPF válido.' : 'CPF inválido.'))}</span></p>`;
        return payload;
      } catch (error) {
        target.innerHTML = `<p class="registry-config-error" role="alert">${escapeHtml(error.message)}</p>`;
        return null;
      }
    },

    async testRegistryProvider(providerId, button) {
      if (!providerId || !button) return null;
      const original = button.textContent;
      button.disabled = true;
      button.textContent = 'Testando…';
      try {
        const response = await secureFetch(`/api/registry/providers/${encodeURIComponent(providerId)}/test`, { headers: { Accept: 'application/json' } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível testar esta fonte.');
        showToast?.(`Conexão com ${providerId} confirmada em ${payload.latencyMs ?? '—'} ms.`, 'success');
        await feature.loadRegistryStatus();
        return payload;
      } catch (error) {
        showToast?.(error.message, 'error');
        button.disabled = false;
        button.textContent = original;
        return null;
      }
    },

    triggerDirectIntegration(name) {
      const normalized = String(name || '').toLowerCase();
      if (/eproc|pje|a1|certificado|portais/.test(normalized)) {
        onOpenJudicialSetup();
        return true;
      }
      if (/datajud|cnj|djen|diário/.test(normalized)) {
        onOpenDataJudModal();
        return true;
      }
      if (/gemini|ia|inteligência/.test(normalized)) {
        onOpenGeminiKeyModal();
        return true;
      }
      if (/webcal|agenda|calendar/.test(normalized)) {
        onOpenCalendarSetup();
        return true;
      }
      if (/email|e-mail|imap|smtp/.test(normalized)) {
        onOpenEmailConfigModal();
        return true;
      }
      showToast('Abra a edição deste item para configurar seus parâmetros.', 'info');
      return false;
    },

    async toggleRecordStatus(index) {
      const section = configurationSection;
      const list = store.state.configuration?.[section];
      if (!Array.isArray(list) || index < 0 || index >= list.length) return false;
      const record = list[index];
      if (!record || typeof record === 'string') return false;
      if (section === 'integrations') {
        record.status = (record.status === 'Ativo' || record.status === 'ativo') ? 'Pausado' : 'Ativo';
      } else if (section === 'notificationAssignments') {
        record.status = record.status === 'pausada' ? 'ativo' : 'pausada';
      } else if (section === 'taskDefinitions') {
        record.status = record.status === 'inativo' ? 'ativo' : 'inativo';
      } else {
        record.status = (record.status === 'inativo' || record.status === 'oculta') ? 'ativo' : 'inativo';
      }
      store.save();
      store.audit('Status de configuração alterado', `${section} · ${record.name || record.event || record.group || 'item'} → ${record.status}`);
      try {
        await store.flush();
        feature.render();
        showToast(`Status atualizado para ${record.status}.`, 'success');
        return true;
      } catch (error) {
        feature.render();
        showToast('Não foi possível salvar a alteração de status.', 'error');
        return false;
      }
    },

    row(item, index) {
      const v2 = documentRef.documentElement?.dataset?.ui === 'v2';
      if (typeof item === 'string') {
        if (v2) return `
          <article class="configuration-row" role="listitem" data-config-index="${index}">
            <button type="button" class="config-row-open" aria-label="Editar ${escapeHtml(item)}">
              <span class="config-row-info"><strong>${escapeHtml(item)}</strong><span>Seção da caixa de entrada</span><small>Ativa</small></span>
              <span class="configuration-edit-affordance" aria-hidden="true">Editar →</span>
            </button>
            <button type="button" class="btn-delete-config-row" data-delete-config="${index}" aria-label="Excluir ${escapeHtml(item)}">${iconSvg('delete')} Excluir</button>
          </article>`;
        return `
          <div class="configuration-row" data-config-index="${index}">
            <div class="config-row-info">
              <strong>${escapeHtml(item)}</strong>
              <span>Seção da caixa de entrada</span>
              <small>Ativa · clique para editar</small>
            </div>
            <button type="button" class="btn-delete-config-row" data-delete-config="${index}" title="Excluir este item">×</button>
          </div>`;
      }
      if (!item || typeof item !== 'object') return '';
      const primary = item.name || item.event || item.group || item.value || 'Configuração';
      let secondary = '';
      let meta = '';
      let extraActions = '';

      let effectiveSection = configurationSection;
      if ('monthlyClosings' in item || 'financialGoal' in item) {
        effectiveSection = 'goals';
      } else if ('event' in item || ('responsibles' in item && !('points' in item))) {
        effectiveSection = 'notificationAssignments';
      } else if ('syncFrequency' in item) {
        effectiveSection = 'integrations';
      } else if ('procedure' in item || 'defaultCourt' in item) {
        effectiveSection = 'actionTypes';
      } else if ('classification' in item || 'nextSuggestedStage' in item) {
        effectiveSection = 'stages';
      } else if ('channelType' in item || 'partnerCommission' in item) {
        effectiveSection = 'origins';
      } else if ('leaderLawyer' in item || 'autoAssign' in item) {
        effectiveSection = 'actionGroups';
      }

      if (effectiveSection === 'taskDefinitions') {
        const parts = [];
        if (item.phase) parts.push(item.phase);
        if (item.slaDays) parts.push(`SLA ${item.slaDays} dias úteis`);
        if (item.priority) parts.push(String(item.priority).toUpperCase());
        secondary = parts.length ? parts.join(' · ') : 'Judicial · SLA 5 dias úteis · NORMAL';
        const statusClass = item.status === 'inativo' ? 'warning' : 'success';
        const statusLabel = item.status === 'inativo' ? 'Inativa' : 'Ativa';
        meta = `${Number.isFinite(item.points) ? `<span class="config-points">${item.points} pontos</span>` : ''}<button type="button" class="configuration-status-pill ${statusClass}" data-toggle-status="${index}" title="Alternar status">${statusLabel}</button>`;
      } else if (effectiveSection === 'notificationAssignments') {
        const channels = item.channels === 'inapp_only' ? 'In-App' : item.channels === 'critical_banner' ? 'Banner' : item.channels ? 'In-App + E-mail' : '';
        const timing = item.timing === '24h' ? '24h antes' : item.timing === '48h' ? '48h antes' : item.timing === '08h_dia' ? '08h' : item.timing ? 'Imediato' : '';
        const responsiblesStr = formatResponsibles(item.responsibles);
        const parts = [responsiblesStr, channels, timing].filter(Boolean);
        secondary = parts.length ? parts.join(' · ') : '—';
        const statusClass = item.status === 'pausada' ? 'warning' : 'success';
        const statusLabel = item.status === 'pausada' ? 'Pausada' : 'Ativa';
        meta = `<button type="button" class="configuration-status-pill ${statusClass}" data-toggle-status="${index}" title="Alternar notificação">${statusLabel}</button>`;
      } else if (effectiveSection === 'integrations') {
        const freq = item.syncFrequency === 'hourly' ? '1 hora' : item.syncFrequency === 'daily' ? 'Diária' : item.syncFrequency === 'manual' ? 'Manual' : item.syncFrequency ? 'Automática' : '';
        secondary = `${item.method || 'API Oficial'}${freq ? ' · Frequência: ' + freq : ''}`;
        const statusClass = (item.status === 'Ativo' || item.status === 'ativo') ? 'success' : item.status === 'Preparado' ? 'neutral' : 'warning';
        const statusLabel = item.status || 'Ativo';
        meta = `<button type="button" class="configuration-status-pill ${statusClass}" data-toggle-integration="${index}" title="Alternar status da integração">${escapeHtml(statusLabel)}</button>`;
        extraActions = `<button type="button" class="button ghost configuration-action-btn" data-direct-integration="${escapeHtml(primary)}" title="Configurar conexão de ${escapeHtml(primary)}">Configurar Conexão</button>`;
      } else if (effectiveSection === 'goals') {
        secondary = item.period ? `Período: ${item.period}` : (item.group || 'Geral');
        if (item.monthlyClosings == null && 'monthlyClosings' in item) {
          meta = '<small>Meta não definida</small>';
        } else {
          const closings = item.monthlyClosings != null ? `${item.monthlyClosings} fechamentos` : '';
          const fin = item.financialGoal ? ` · R$ ${Number(item.financialGoal).toLocaleString('pt-BR')}` : '';
          meta = `<span class="config-points">${closings}${fin}</span>`;
        }
      } else if (effectiveSection === 'actionTypes') {
        const procedure = item.procedure === 'sumarissimo' ? 'Sumaríssimo' : item.procedure === 'execucao' ? 'Execução' : item.procedure === 'especial' ? 'Especial' : item.procedure ? 'Comum' : '';
        const parts = [item.group || 'Geral', procedure ? `Rito ${procedure}` : '', item.defaultCourt || 'TJRS'].filter(Boolean);
        secondary = parts.join(' · ');
        meta = `<small>${item.estimatedDuration ? item.estimatedDuration + ' meses' : escapeHtml(item.registeredAt || item.status || 'Ativo')}</small>`;
      } else if (effectiveSection === 'stages') {
        secondary = `${item.phase || 'Judicial'} · ${item.classification || 'Geral'}`;
        meta = `<small>${item.slaMaxDays ? 'Alerta: ' + item.slaMaxDays + 'd' : escapeHtml(item.registeredAt || item.status || 'Ativo')}</small>`;
      } else if (effectiveSection === 'origins') {
        const commission = item.partnerCommission ? ` · ${item.partnerCommission}%` : '';
        secondary = `${item.channelType || 'Geral'}${commission}`;
        meta = `<small>${escapeHtml(item.defaultAttendant ? 'Resp: ' + item.defaultAttendant : item.registeredAt || 'Ativo')}</small>`;
      } else if (effectiveSection === 'actionGroups') {
        secondary = item.publicationResponsible || 'Advogado Responsável';
        meta = `<small>${escapeHtml(item.leaderLawyer ? 'Líder: ' + item.leaderLawyer : item.registeredAt || 'Ativo')}</small>`;
      } else {
        secondary = item.role || item.phase || item.group || item.publicationResponsible || item.method || formatResponsibles(item.responsibles) || item.status || '—';
        meta = Number.isFinite(item.points) ? `<span class="config-points">${item.points} pontos</span>` : item.monthlyClosings == null && 'monthlyClosings' in item ? '<small>Meta não definida</small>' : `<small>${escapeHtml(item.registeredAt || item.status || 'Ativo')}</small>`;
      }

      if (v2) return `
        <article class="configuration-row" role="listitem" data-config-index="${index}">
          <button type="button" class="config-row-open" aria-label="Editar ${escapeHtml(primary)}">
            <span class="config-row-info"><strong>${escapeHtml(primary)}</strong><span>${escapeHtml(secondary)}</span>${meta}</span>
            <span class="configuration-edit-affordance" aria-hidden="true">Editar →</span>
          </button>
          ${extraActions}
          <button type="button" class="btn-delete-config-row" data-delete-config="${index}" aria-label="Excluir ${escapeHtml(primary)}">${iconSvg('delete')} Excluir</button>
        </article>`;
      return `
        <div class="configuration-row" data-config-index="${index}">
          <div class="config-row-info">
            <strong>${escapeHtml(primary)}</strong>
            <span>${escapeHtml(secondary)}</span>
            ${meta}
          </div>
          ${extraActions}
          <button type="button" class="btn-delete-config-row" data-delete-config="${index}" title="Excluir este item">×</button>
        </div>`;
    },

    openModal(defaults = {}, index = null) {
      const fields = FIELDS_BY_SECTION[configurationSection] || [{ name: 'name', label: 'Nome', required: true, full: true }];
      const values = typeof defaults === 'string' ? { value: defaults } : { ...defaults };
      if ('responsibles' in values) values.responsibles = formatResponsibles(values.responsibles);
      let topHtml = '';
      if (configurationSection === 'integrations' && values.name) {
        const target = getDirectSetupTarget(values.name);
        topHtml = `<div class="configuration-modal-callout">
          <div class="configuration-callout-info">
            <span class="configuration-callout-badge">${escapeHtml(target.badge)}</span>
            <strong>${escapeHtml(values.name)}</strong>
            <p>${escapeHtml(target.description)}</p>
          </div>
          <button type="button" class="button ghost" data-modal-open-dedicated-integration="${escapeHtml(values.name)}">
            ${escapeHtml(target.actionLabel)} →
          </button>
        </div>`;
      }
      openModal('configuration', index === null ? 'Novo item de configuração' : 'Editar configuração', 'Estrutura do escritório', fields, { ...values, _section: configurationSection, _index: index }, topHtml);
    },

    saveRecord(data, defaults = {}) {
      const section = defaults._section;
      const index = defaults._index;
      const list = store.state.configuration[section];
      let record = { ...defaults, ...data };
      delete record._section;
      delete record._index;
      if (section === 'inboxSections') {
        const hasExtra = data.filterRule || data.displayLimit || data.highlightUrgent || data.status;
        record = hasExtra ? { ...defaults, ...data, value: data.value } : data.value;
      }
      if (section === 'notificationAssignments') record.responsibles = String(data.responsibles || '').split(/[,;]/).map(item => item.trim()).filter(Boolean);
      if (section === 'taskDefinitions') {
        record.points = Number(data.points) || 0;
        if ('slaDays' in data && data.slaDays !== '') record.slaDays = Number(data.slaDays) || 5;
      }
      if (section === 'goals') {
        record.monthlyClosings = (data.monthlyClosings === '' || data.monthlyClosings === undefined) ? null : Number(data.monthlyClosings);
        if ('financialGoal' in data) record.financialGoal = (data.financialGoal === '' || data.financialGoal === undefined) ? null : Number(data.financialGoal);
        if ('pointsGoal' in data) record.pointsGoal = (data.pointsGoal === '' || data.pointsGoal === undefined) ? null : Number(data.pointsGoal);
      }
      if (section === 'origins' && 'partnerCommission' in data) {
        record.partnerCommission = data.partnerCommission === '' ? 0 : Number(data.partnerCommission) || 0;
      }
      if (section === 'stages' && 'slaMaxDays' in data) {
        record.slaMaxDays = data.slaMaxDays === '' ? null : Number(data.slaMaxDays);
      }
      if (section === 'actionTypes' && 'estimatedDuration' in data) {
        record.estimatedDuration = data.estimatedDuration === '' ? null : Number(data.estimatedDuration);
      }
      const creating = index === null || index === undefined || index === '';
      if (creating) list.push(record);
      else list[Number(index)] = record;
      store.save();
      store.audit(creating ? 'Configuração adicionada' : 'Configuração atualizada', `${section} · ${typeof record === 'string' ? record : record.name || record.event || record.group || record.value || 'item'}`);
      return record;
    },

    async deleteRecord(index) {
      const section = configurationSection;
      const list = store.state.configuration?.[section];
      if (!Array.isArray(list) || index < 0 || index >= list.length) return false;
      const snapshot = [...list];
      const removed = list.splice(index, 1)[0];
      store.audit('Configuração removida', `${section} · ${typeof removed === 'string' ? removed : (removed?.name || 'item')}`);
      store.save();
      try {
        if (!await store.flush()) throw new Error('Não foi possível persistir a exclusão. Tente novamente.');
        feature.render();
        showToast('Item removido com sucesso.', 'success');
        return true;
      } catch (error) {
        store.state.configuration[section] = snapshot;
        feature.render();
        showToast(error.message || 'Não foi possível excluir o item.', 'error');
        return false;
      }
    }
  };

  return feature;
}

function registryConfigurationShell() {
  return `<section class="registry-config-workspace" aria-labelledby="registryConfigHeading">
    <header><div><span>INTELIGÊNCIA CADASTRAL</span><h3 id="registryConfigHeading">Fontes e política de uso</h3><p>Consultas públicas passam pelo backend do ATRIUM e exigem revisão antes de alterar um contato.</p></div><button type="button" class="v2-button is-secondary" data-registry-config-action="status">Atualizar estado</button></header>
    <div class="registry-provider-grid" id="registryProviderStatus" aria-live="polite"></div>
    <section class="registry-cpf-validation"><div><span>VALIDAÇÃO DOCUMENTAL</span><h4>Validar CPF</h4><p>Confere localmente o formato e os dígitos verificadores, sem transmitir o documento.</p></div><form data-registry-cpf-form><label for="registryCpfQuery">CPF</label><div><input id="registryCpfQuery" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00"><button type="submit" class="v2-button is-primary">Validar CPF</button></div></form><div id="registryCpfResult" aria-live="polite"></div></section>
    <section class="registry-bank-directory"><div><span>DIRETÓRIO BANCÁRIO</span><h4>Normalizar instituição</h4><p>Busca por código, ISPB ou nome em diretório público cacheado.</p></div><form data-registry-bank-form><label for="registryBankQuery">Banco</label><div><input id="registryBankQuery" type="search" placeholder="Ex.: 001, ISPB ou nome"><button type="submit" class="v2-button is-primary" data-registry-config-action="banks">Buscar banco</button></div></form><div class="registry-bank-results" id="registryBankResults" aria-live="polite"></div></section>
  </section>`;
}

function registryProviderCard(provider, escapeHtml) {
  const stateLabels = { available: 'Disponível', temporarily_paused: 'Temporariamente pausada', not_configured: 'Não configurada' };
  const state = provider.state || (provider.configured ? 'available' : 'not_configured');
  const lastSuccess = provider.lastSuccessAt ? new Date(provider.lastSuccessAt).toLocaleString('pt-BR') : 'ainda não testada nesta execução';
  const details = provider.id === 'cpf-local'
    ? 'Execução local · nenhum dado transmitido · disponível imediatamente'
    : provider.configured ? `Prioridade ${provider.priority || '—'} · cache até ${provider.cacheTtlMs ? Math.round(provider.cacheTtlMs / 3_600_000) + 'h' : '—'} · última resposta ${lastSuccess}${provider.lastLatencyMs !== null && provider.lastLatencyMs !== undefined ? ` · ${provider.lastLatencyMs} ms` : ''}` : 'Integração não configurada.';
  return `<article class="registry-provider-card is-${escapeHtml(state)}"><span>${escapeHtml(stateLabels[state] || state)}</span><strong>${escapeHtml(provider.name)}</strong><p>${escapeHtml((provider.capabilities || []).join(' · '))}</p><small>${escapeHtml(details)}</small>${provider.configured ? `<button type="button" class="v2-button is-secondary" data-registry-config-action="test-provider" data-registry-provider="${escapeHtml(provider.id)}">Testar conexão</button>` : ''}</article>`;
}
