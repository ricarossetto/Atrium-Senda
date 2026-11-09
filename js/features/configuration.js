import { memberAvatarHtml } from '../core/member-avatar.js?v=3.0.2';

const CONFIGURATION_ICON_NAMES = new Set(['check', 'delete']);
const iconSvg = name => {
  const safeName = CONFIGURATION_ICON_NAMES.has(name) ? name : 'check';
  return `<svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.2#atrium-icon-${safeName}"></use></svg>`;
};

const CONFIGURATION_SECTIONS = [
  ['office', 'Escritório'],
  ['taskDefinitions', 'Tipos de tarefa'],
  ['users', 'Usuários'],
  ['actionGroups', 'Grupos'],
  ['actionTypes', 'Tipos de ação'],
  ['stages', 'Etapas'],
  ['origins', 'Origens'],
  ['goals', 'Metas'],
  ['inboxSections', 'Caixa de entrada'],
  ['notificationAssignments', 'Notificações'],
  ['integrations', 'Integrações'],
  ['registry', 'Consulta de cadastros'],
  ['diagnostic', 'Diagnóstico e Saúde'],
  ['backups', 'Cópias de segurança'],
  ['experimental', 'Preferências deste navegador']
];

const FIELDS_BY_SECTION = {
  taskDefinitions: [
    { name: 'name', label: 'Nome da tarefa', required: true, full: true },
    { name: 'points', label: 'Pontuação de produtividade', type: 'number' },
    { name: 'phase', label: 'Fase processual', suggestions: ['Judicial', 'Recursal', 'Execução/cobrança', 'Administrativo', 'Negociação', 'Consultoria', 'Marketing', 'Rh/financeiro', 'Todas'] },
    { name: 'area', label: 'Área da tarefa', suggestions: [], placeholder: 'Ex.: Cível, Previdenciário, Administrativo' },
    { name: 'slaDays', label: 'Prazo padrão (dias úteis)', type: 'number', note: 'Prazo preenchido automaticamente ao criar tarefas deste tipo' },
    { name: 'priority', label: 'Prioridade sugerida', type: 'select', options: [{ value: 'normal', label: 'Normal' }, { value: 'alta', label: 'Alta prioridade' }, { value: 'urgente', label: 'Urgente / Prazo fatal' }, { value: 'baixa', label: 'Baixa prioridade' }] },
    { name: 'defaultRole', label: 'Responsável sugerido', type: 'select', options: [{ value: '', label: 'A definir no processo' }, { value: 'Advogado Titular', label: 'Advogado Titular' }, { value: 'Controladoria & Prazos', label: 'Controladoria e Prazos' }, { value: 'Assistente Jurídico', label: 'Assistente Jurídico' }, { value: 'Secretaria', label: 'Secretaria / Administrativo' }] },
    { name: 'requireDocument', label: 'Exigência documental', type: 'select', options: [{ value: 'nao', label: 'Não obrigatório' }, { value: 'sim', label: 'Sim — exige anexo de minuta ou petição' }] },
    { name: 'status', label: 'Status no catálogo', type: 'select', options: [{ value: 'ativo', label: 'Ativo (disponível para criação)' }, { value: 'inativo', label: 'Inativo (ocultar novos registros)' }] },
    { name: 'instructions', label: 'Instruções e checklist de execução', type: 'textarea', full: true, placeholder: 'Orientações práticas para o executor da tarefa…' }
  ],
  users: [
    { name: 'name', label: 'Nome do usuário', required: true, full: true },
    { name: 'role', label: 'Função no escritório', suggestions: ['Administrador', 'Advogado Sócio', 'Advogado Titular', 'Advogado Associado', 'Assistente Jurídico', 'Controladoria e Prazos', 'Secretária'] },
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
    { name: 'method', label: 'Método', suggestions: ['API pública oficial', 'Coleta no servidor', 'REST API', 'Sincronização iCal', 'Conexão IMAP / SMTP'] },
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

const officeTaskArea = definition => {
  const resolver = globalThis.OFFICE_DEFAULT_DATA?.resolveTaskArea;
  if (typeof resolver === 'function') return resolver(definition);
  return String(definition?.area || definition?.phase || '').trim();
};

const taskAreaSuggestions = () => {
  const areas = globalThis.OFFICE_DEFAULT_DATA?.taskAreas;
  return Array.isArray(areas) ? [...areas] : [];
};

const configurationFields = section => {
  const fields = FIELDS_BY_SECTION[section] || [{ name: 'name', label: 'Nome', required: true, full: true }];
  if (section !== 'taskDefinitions') return fields;
  return fields.map(field => field.name === 'area' ? { ...field, suggestions: taskAreaSuggestions() } : field);
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
      badge: 'Assistente de IA',
      description: 'Configure a chave do provedor de IA (Google Gemini, OpenCode Zen/Go, OpenAI ou Anthropic) e ative a assistência jurídica inteligente do ATRIUM.',
      actionLabel: 'Configurar Chave da IA'
    };
  }
  if (/webcal|agenda|calendar/.test(normalized)) {
    return {
      type: 'calendar',
      badge: 'Agenda Externa iCal',
      description: 'Traga compromissos de outra agenda por um link iCal. Para sincronizar nos dois sentidos, conecte o Google Agenda.',
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
  if (/inpi|rpi|marcas|propriedade industrial/.test(normalized)) {
    return {
      type: 'inpi',
      badge: 'INPI / RPI Marcas',
      description: 'Monitoramento semanal de marcas e publicações na Revista da Propriedade Industrial (RPI) para advogados do escritório.',
      actionLabel: 'Abrir Painel RPI'
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
  requestAuthUsers = null,
  escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])),
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
  onOpenInpiModal = () => {},
  withReauth = exec => exec({}),
  dashboardWidgets = null,
  onDashboardWidgetsChanged = () => {},
  presentation = null,
  warn = () => {}
} = {}) {
  let configurationSection = 'taskDefinitions';
  let authUsers = [];
  let currentAuthRole = 'collaborator';
  let officeTeams = [];
  let officeRoleCatalog = { permissions: [], factoryRoleIds: [] };
  let officePortfolio = null;
  let officeAccessAudit = null;
  let officeHygiene = null;
  let officeProfile = { roles: [], memberKinds: [], permissions: [], accessMode: 'shadow', privateMonitoring: 'allowed' };
  let currentPermissions = [];
  let officeLoaded = false;
  let initialized = false;
  const byId = id => documentRef.getElementById(id);
  const windowRef = documentRef.defaultView || globalThis.window;

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
        const experimentalReset = event.target.closest('[data-experimental-reset]');
        if (experimentalReset) {
          event.preventDefault();
          event.stopPropagation();
          feature.resetDashboardWidgets();
          return;
        }
        const transferButton = event.target.closest('[data-auth-transfer-principal]');
        if (transferButton) {
          event.preventDefault();
          event.stopPropagation();
          const row = transferButton.closest('[data-auth-user-id]');
          if (row) feature.transferPrincipal(row.dataset.authUserId);
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
      byId('configurationList')?.addEventListener('change', event => {
        const densityToggle = event.target.closest?.('[data-density-toggle]');
        if (densityToggle) {
          feature.setDensityPreference(densityToggle.checked ? 'basic' : 'pro');
          return;
        }
        const enableToggle = event.target.closest?.('[data-experimental-toggle]');
        if (enableToggle) {
          feature.setDashboardWidgetsEnabled(enableToggle.checked);
          return;
        }
        const widgetToggle = event.target.closest?.('[data-experimental-widget]');
        if (widgetToggle) feature.setDashboardWidget(widgetToggle.dataset.experimentalWidget, widgetToggle.checked);
      });
      presentation?.init?.();
      return true;
    },

    async loadAuthUsers({ shared = true } = {}) {
      try {
        const response = requestAuthUsers
          ? await requestAuthUsers(secureFetch, { force: !shared })
          : await secureFetch('/api/auth/users', { headers: { Accept: 'application/json' } });
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

    async loadOfficeData(force = false) {
      if (officeLoaded && !force) return { users: authUsers, teams: officeTeams, profile: officeProfile };
      const [officeResult, rolesResult] = await Promise.allSettled([
        secureFetch('/api/office', { headers: { Accept: 'application/json' } }),
        secureFetch('/api/office/roles', { headers: { Accept: 'application/json' } })
      ]);
      if (officeResult.status === 'fulfilled' && officeResult.value?.ok) {
        const payload = await officeResult.value.json().catch(() => ({}));
        authUsers = Array.isArray(payload.members) ? payload.members : [];
        officeTeams = Array.isArray(payload.teams) ? payload.teams : [];
        officeProfile = payload.profile || officeProfile;
        currentPermissions = Array.isArray(payload.permissions) ? payload.permissions : [];
        currentAuthRole = payload.currentRole || currentAuthRole;
      }
      if (rolesResult.status === 'fulfilled' && rolesResult.value?.ok) {
        const payload = await rolesResult.value.json().catch(() => ({}));
        officeRoleCatalog = {
          permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
          factoryRoleIds: Array.isArray(payload.factoryRoleIds) ? payload.factoryRoleIds : []
        };
      }
      // A carteira só existe para quem lê o financeiro; o servidor continua sendo quem decide.
      officePortfolio = null;
      if (currentPermissions.includes('office.manage') || currentPermissions.includes('finance.read')) {
        const portfolioResponse = await secureFetch('/api/office/finance/portfolio', { headers: { Accept: 'application/json' } }).catch(() => null);
        if (portfolioResponse?.ok) officePortfolio = await portfolioResponse.json().catch(() => null);
      }
      officeAccessAudit = null;
      if (currentPermissions.includes('office.manage') || currentPermissions.includes('audit.read')) {
        await feature.loadOfficeAccessAudit(1);
      }
      officeHygiene = null;
      if (currentPermissions.includes('office.manage') || currentPermissions.includes('teams.manage')) {
        const hygieneResponse = await secureFetch('/api/office/hygiene', { headers: { Accept: 'application/json' } }).catch(() => null);
        if (hygieneResponse?.ok) officeHygiene = await hygieneResponse.json().catch(() => null);
      }
      officeLoaded = true;
      return { users: authUsers, teams: officeTeams, profile: officeProfile };
    },

    async loadOfficeAccessAudit(page) {
      const response = await secureFetch(`/api/office/access-audit?page=${encodeURIComponent(page)}&pageSize=20`, { headers: { Accept: 'application/json' } }).catch(() => null);
      if (!response?.ok) return false;
      const payload = await response.json().catch(() => null);
      if (!payload) return false;
      const previous = page > 1 && Array.isArray(officeAccessAudit?.events) ? officeAccessAudit.events : [];
      officeAccessAudit = { ...payload, events: [...previous, ...(Array.isArray(payload.events) ? payload.events : [])] };
      return true;
    },

    officeShell() {
      const roles = Array.isArray(officeProfile.roles) && officeProfile.roles.length ? officeProfile.roles : [];
      const kinds = Array.isArray(officeProfile.memberKinds) && officeProfile.memberKinds.length
        ? officeProfile.memberKinds
        : [{ id: 'lawyer', name: 'Advogado(a)' }, { id: 'staff', name: 'Funcionário(a)' }];
      const roleName = id => roles.find(role => role.id === id)?.name || 'Colaborador';
      const kindName = id => kinds.find(kind => kind.id === id)?.name || 'Advogado(a)';
      const canManageMembers = currentPermissions.includes('office.manage') || currentPermissions.includes('members.manage');
      const canManageTeams = currentPermissions.includes('office.manage') || currentPermissions.includes('teams.manage');
      const roleOptions = (selected = 'associate') => roles.map(role => `<option value="${escapeHtml(role.id)}" data-office-role-kinds="${escapeHtml((role.memberKinds || []).join(','))}" ${role.id === selected ? 'selected' : ''}>${escapeHtml(role.name)}</option>`).join('');
      const kindOptions = (selected = 'lawyer') => kinds.map(kind => `<option value="${escapeHtml(kind.id)}" ${kind.id === selected ? 'selected' : ''}>${escapeHtml(kind.name)}</option>`).join('');
      const openTasks = (store.state.tasks || []).filter(task => task && task.active !== false && !['concluida', 'cancelada'].includes(task.status));
      const processes = store.state.processes || [];
      const members = authUsers.map(user => {
        const id = String(user.id || user.username || '');
        const tasks = openTasks.filter(task => String(task.assigneeUserId || '') === id).length;
        const matterCount = processes.filter(process => (Array.isArray(process.responsibleUserIds) ? process.responsibleUserIds : []).some(value => String(value) === id)).length;
        const teamNames = (user.teamIds || []).map(teamId => officeTeams.find(team => team.id === teamId)?.name).filter(Boolean);
        const replacementOptions = authUsers
          .filter(other => String(other.id || other.username) !== id && other.status === 'active')
          .map(other => `<option value="${escapeHtml(other.id || other.username)}">${escapeHtml(other.displayName || other.username)}</option>`)
          .join('');
        const controls = canManageMembers
          ? `<div class="office-member-controls"><label class="office-inline-field">Tipo<select data-office-member-kind="${escapeHtml(id)}">${kindOptions(user.memberKind || 'lawyer')}</select></label><label class="office-inline-field">Papel<select data-office-member-role="${escapeHtml(id)}">${roleOptions(user.officeRoleId || 'associate')}</select></label><button type="button" class="button ghost" data-office-member-save="${escapeHtml(id)}">Salvar</button></div>${!user.isPrincipal && replacementOptions ? `<div class="office-offboard"><label class="office-inline-field">Desligar e transferir para<select data-office-member-transfer="${escapeHtml(id)}">${replacementOptions}</select></label><button type="button" class="button ghost danger-text" data-office-member-offboard="${escapeHtml(id)}">Desligar</button></div>` : ''}`
          : `<span class="configuration-user-status status-${escapeHtml(user.status || 'active')}">${escapeHtml(user.status === 'inactive' ? 'Suspenso' : user.status === 'pending_approval' ? 'Pendente' : 'Ativo')}</span>`;
        return `<div class="office-member" data-office-member-id="${escapeHtml(id)}">
          <div class="config-row-info config-row-info-with-avatar">${memberAvatarHtml(user, escapeHtml)}<div class="config-row-text"><strong>${escapeHtml(user.displayName || user.username)}</strong><span>${escapeHtml(user.email || user.username)}</span><small>${escapeHtml(kindName(user.memberKind))} · ${escapeHtml(roleName(user.officeRoleId))} · ${tasks} tarefa(s) aberta(s) · ${matterCount} processo(s)${teamNames.length ? ` · ${escapeHtml(teamNames.join(', '))}` : ''}</small></div></div>
          ${controls}
        </div>`;
      }).join('');
      const memberOptions = authUsers.map(user => `<label class="office-check"><input type="checkbox" data-office-team-member value="${escapeHtml(user.id || user.username)}"> <span>${escapeHtml(user.displayName || user.username)}</span></label>`).join('');
      const teams = officeTeams.length ? officeTeams.map(team => {
        const names = (team.memberIds || []).map(id => authUsers.find(user => String(user.id || user.username) === String(id))?.displayName || id).filter(Boolean);
        return `<div class="configuration-row office-team-row" data-office-team-id="${escapeHtml(team.id)}"><div class="config-row-text"><strong>${escapeHtml(team.name)}</strong><span>${escapeHtml(team.description || 'Sem descrição')}</span><small>${names.length ? escapeHtml(names.join(', ')) : 'Sem integrantes'}</small></div>${canManageTeams ? `<button type="button" class="button ghost danger-text" data-office-team-delete="${escapeHtml(team.id)}" aria-label="Excluir equipe ${escapeHtml(team.name)}">Excluir</button>` : ''}</div>`;
      }).join('') : '<div class="empty-detail"><h3>Nenhuma equipe ainda</h3><p>Crie a primeira equipe e defina quem trabalha em cada área.</p></div>';
      const teamForm = canManageTeams
        ? `<form id="officeTeamForm" class="office-form office-form-grid"><label>Nome da equipe<input id="officeTeamName" name="name" required minlength="2" maxlength="60" autocomplete="off" placeholder="Ex.: Previdenciário"></label><label>Descrição<input id="officeTeamDescription" name="description" maxlength="280" autocomplete="off" placeholder="Opcional"></label><fieldset class="office-members-fieldset"><legend>Integrantes</legend><div class="office-check-grid">${memberOptions || '<span class="office-muted">Nenhum membro disponível.</span>'}</div></fieldset><button class="button gold" type="submit">Criar equipe</button></form>`
        : '';
      const newMemberForm = canManageMembers
        ? `<form id="officeNewMemberForm" class="office-form"><label>Usuário de acesso<input id="officeNewMemberUsername" name="username" required pattern="[a-zA-Z0-9._\\-]{3,64}" maxlength="64" autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="nome.sobrenome"></label><label>Nome completo<input id="officeNewMemberName" name="displayName" required minlength="3" maxlength="100" autocomplete="off" placeholder="Ex.: Dra. Marina Alves"></label><label>E-mail<input id="officeNewMemberEmail" name="email" type="email" required autocomplete="off" placeholder="nome@escritorio.adv.br"></label><label>Senha inicial<input id="officeNewMemberPassword" name="password" type="password" required minlength="10" maxlength="128" autocomplete="new-password" placeholder="Será definida por você; peça para a pessoa trocar"></label><div class="office-form-grid"><label>Tipo<select id="officeNewMemberKind">${kindOptions('lawyer')}</select></label><label>Papel<select id="officeNewMemberRole">${roleOptions('associate')}</select></label></div><fieldset class="office-members-fieldset"><legend>Equipes iniciais</legend><div class="office-check-grid">${officeTeams.map(team => `<label class="office-check"><input type="checkbox" data-office-new-member-team value="${escapeHtml(team.id)}"> <span>${escapeHtml(team.name)}</span></label>`).join('') || '<span class="office-muted">Nenhuma equipe criada.</span>'}</div></fieldset><button class="button gold" type="submit">Criar membro</button></form>`
        : '<p class="office-note">Seu perfil pode consultar o escritório, mas não adicionar integrantes. Peça a um gestor ou administrador.</p>';
      const newMemberResult = result => `${result.qrCode ? `<img class="office-new-member-qr" src="${escapeHtml(result.qrCode)}" alt="QR Code para configurar o autenticador do membro" width="160" height="160">` : ''}<p class="office-note">Código de configuração (válido por 10 minutos): <strong class="office-new-member-token">${escapeHtml(result.setupToken || '')}</strong></p><p class="office-note">Segredo para o aplicativo autenticador: <strong>${escapeHtml(result.manualSecret || '')}</strong></p><p class="office-note">Entregue ao membro o usuário, a senha inicial, o código de configuração e o QR/segredo. Ele insere os dados na tela de login (Ativar conta), conclui a ativar o autenticador e o acesso libera após a sua aprovação nesta lista.</p>`;
      const canManageRoles = currentPermissions.includes('office.manage') || currentPermissions.includes('roles.manage');
      const riskGroups = [['critico', 'Risco crítico'], ['alto', 'Risco alto'], ['medio', 'Risco médio'], ['baixo', 'Risco baixo']];
      const permissionChecks = (selected = [], { disabled = false } = {}) => riskGroups.map(([risk, title]) => {
        const items = officeRoleCatalog.permissions.filter(permission => permission.risk === risk);
        if (!items.length) return '';
        return `<fieldset class="office-members-fieldset office-permission-group" data-permission-risk="${risk}"><legend>${title}</legend><p class="office-muted">${escapeHtml(items[0].riskNote || '')}</p><div class="office-check-grid">${items.map(permission => `<label class="office-check"><input type="checkbox" data-office-role-permission value="${escapeHtml(permission.id)}" ${selected.includes(permission.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''}> <span>${escapeHtml(permission.label)}</span></label>`).join('')}</div></fieldset>`;
      }).join('');
      const roleCards = roles.map(role => {
        const factory = officeRoleCatalog.factoryRoleIds.includes(role.id);
        const editable = canManageRoles && !factory && officeRoleCatalog.permissions.length > 0;
        const actions = editable
          ? `<div class="configuration-row-actions"><button type="button" class="button ghost" data-office-role-save="${escapeHtml(role.id)}">Salvar papel</button><button type="button" class="button ghost danger-text" data-office-role-deactivate="${escapeHtml(role.id)}" data-office-role-name="${escapeHtml(role.name)}">Desativar papel</button></div>`
          : factory ? '<p class="office-muted">Papel padrão do sistema. Para mudar as permissões, crie um papel próprio.</p>' : '';
        return `<details class="office-role" data-office-role-id="${escapeHtml(role.id)}"><summary><strong>${escapeHtml(role.name)}</strong><span>${escapeHtml(role.description)}</span><small>${role.permissions.length === 1 ? '1 permissão' : `${role.permissions.length} permissões`}${factory ? ' · Padrão do sistema' : ' · Próprio do escritório'}</small></summary><div class="office-role-body">${permissionChecks(role.permissions, { disabled: !editable })}${actions}</div></details>`;
      }).join('');
      const roleForm = canManageRoles && officeRoleCatalog.permissions.length
        ? `<details class="office-role office-role-new"><summary><strong>Criar papel próprio</strong><span>Escolha exatamente o que esse papel pode fazer.</span></summary><form id="officeRoleForm" class="office-form office-role-body"><div class="office-form-grid"><label>Nome do papel<input id="officeRoleName" required minlength="2" maxlength="60" autocomplete="off" placeholder="Ex.: Controladoria"></label><label>Descrição<input id="officeRoleDescription" maxlength="280" autocomplete="off" placeholder="Opcional"></label></div>${permissionChecks([])}<button class="button gold" type="submit">Criar papel</button></form></details>`
        : '';
      const moneyBr = value => (Number(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const portfolioRows = Array.isArray(officePortfolio?.rows) ? officePortfolio.rows : [];
      const portfolioCard = officePortfolio
        ? `<article class="card office-card office-card-wide" data-office-portfolio><header class="office-card-header"><div><p class="eyebrow">Financeiro</p><h3>Carteira por responsável</h3></div><span class="status-chip">${Number(officePortfolio.totals?.processes) === 1 ? '1 processo' : `${Number(officePortfolio.totals?.processes) || 0} processos`}</span></header>${portfolioRows.length
          ? `<div class="office-portfolio-scroll"><table class="office-portfolio"><thead><tr><th scope="col">Responsável</th><th scope="col">Processos</th><th scope="col">Honorários</th><th scope="col">Requisições</th></tr></thead><tbody>${portfolioRows.map(row => `<tr><th scope="row">${escapeHtml(row.responsible)}</th><td>${Number(row.processes) || 0}</td><td>${moneyBr(row.fees)}</td><td>${moneyBr(row.requisitions)}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">Total</th><td>${Number(officePortfolio.totals?.processes) || 0}</td><td>${moneyBr(officePortfolio.totals?.fees)}</td><td>${moneyBr(officePortfolio.totals?.requisitions)}</td></tr></tfoot></table></div><p class="office-note">Soma só o que está cadastrado em cada processo. Não é previsão de recebimento.</p>`
          : '<div class="empty-detail"><h3>Nenhum valor cadastrado</h3><p>Informe honorários ou requisição em "Editar processo" para a carteira aparecer aqui.</p></div>'}</article>`
        : '';
      const unassignedProcesses = processes.filter(process => !(Array.isArray(process.responsibleUserIds) && process.responsibleUserIds.length) && !(Array.isArray(process.assignedTeamIds) && process.assignedTeamIds.length)).length;
      const canManageOffice = currentPermissions.includes('office.manage');
      const privateMonitoringControl = canManageOffice
        ? `<div class="office-access-mode"><div><strong>${officeProfile.privateMonitoring === 'disabled' ? 'Monitoramento privado desativado' : 'Monitoramento privado permitido'}</strong><span>${officeProfile.privateMonitoring === 'disabled' ? 'Nenhuma nova captura privada será executada. Dados privados existentes são preservados.' : 'Cada advogado pode manter a própria OAB privada, visível apenas para ele.'}</span></div><button type="button" class="button ghost" data-office-private-monitoring="${officeProfile.privateMonitoring === 'disabled' ? 'allowed' : 'disabled'}">${officeProfile.privateMonitoring === 'disabled' ? 'Permitir monitoramento privado' : 'Desativar monitoramento privado'}</button></div>`
        : '';
      const accessModeControl = canManageOffice
        ? `<div class="office-access-mode"><div><strong>${officeProfile.accessMode === 'enforced' ? 'Acesso por processo ativo' : 'Modo preparação'}</strong><span>${officeProfile.accessMode === 'enforced' ? 'O servidor filtra o acervo pelos processos atribuídos.' : `${unassignedProcesses} processo(s) sem equipe ou responsável. O acervo ainda não está filtrado.`}</span></div><button type="button" class="button ghost" data-office-access-mode="${officeProfile.accessMode === 'enforced' ? 'shadow' : 'enforced'}">${officeProfile.accessMode === 'enforced' ? 'Voltar para preparação' : 'Ativar acesso por processo'}</button></div>`
        : '';
      const dateTimeBr = value => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      };
      const auditEvents = Array.isArray(officeAccessAudit?.events) ? officeAccessAudit.events : [];
      const auditCard = officeAccessAudit
        ? `<article class="card office-card office-card-wide" data-office-access-audit><header class="office-card-header"><div><p class="eyebrow">Auditoria</p><h3>Quem mudou acessos</h3></div><span class="status-chip">${Number(officeAccessAudit.total) === 1 ? '1 registro' : `${Number(officeAccessAudit.total) || 0} registros`}</span></header>${auditEvents.length
          ? `<div class="office-list">${auditEvents.map(event => `<div class="office-audit-row"><strong>${escapeHtml(event.action || 'Alteração')}</strong><span>${escapeHtml(event.detail || '')}</span><small>${escapeHtml([event.actor, dateTimeBr(event.at)].filter(Boolean).join(' · '))}</small></div>`).join('')}</div>${Number(officeAccessAudit.page) < Number(officeAccessAudit.totalPages) ? '<button type="button" class="button ghost" data-office-audit-more>Ver registros anteriores</button>' : ''}`
          : '<p class="office-note">Nenhuma mudança de acesso registrada. Convites, papéis e equipes aparecem aqui quando forem alterados.</p>'}</article>`
        : '';
      const orphans = Array.isArray(officeHygiene?.orphanTeamAssignments) ? officeHygiene.orphanTeamAssignments : [];
      const processLabel = id => {
        const process = processes.find(item => String(item.id) === String(id));
        return process?.number || 'Processo sem número';
      };
      const hygieneCard = officeHygiene
        ? `<article class="card office-card office-card-wide" data-office-hygiene><header class="office-card-header"><div><p class="eyebrow">Revisão</p><h3>Processos com equipe excluída</h3></div><span class="status-chip">${orphans.length === 1 ? '1 processo' : `${orphans.length} processos`}</span></header>${orphans.length
          ? `<ul class="office-orphan-list">${orphans.map(item => `<li>${escapeHtml(processLabel(item.processId))}</li>`).join('')}</ul><p class="office-note">Esses processos ainda apontam para uma equipe que não existe mais. Abra cada um em "Editar processo" e escolha outra equipe.</p>`
          : '<p class="office-note">Nenhum processo aponta para equipe excluída.</p>'}</article>`
        : '';
      return `<div class="office-panel">
        <section class="card office-intro"><p class="eyebrow">Gestão do escritório</p><h3>Pessoas, papéis e equipes em um só lugar</h3><p>O escritório é compartilhado. Defina o tipo e o papel de cada membro e organize as equipes por área. A atribuição de processos e o bloqueio de acesso por processo são aplicados pelo servidor.</p></section>
        <div class="office-grid">
          <article class="card office-card"><header class="office-card-header"><div><p class="eyebrow">Membros</p><h3>Quem está no escritório</h3></div><span class="status-chip connected">${authUsers.length} pessoas</span></header><div class="office-list">${members || '<div class="empty-detail"><h3>Nenhum membro</h3><p>Adicione a primeira pessoa pelo formulário ao lado.</p></div>'}</div><h4 class="office-subtitle">Novo membro</h4>${newMemberForm}<p id="officeNewMemberFeedback" class="office-feedback" role="status" aria-live="polite"></p></article>
          <article class="card office-card office-card-wide"><header class="office-card-header"><div><p class="eyebrow">Equipes</p><h3>Equipes por área</h3></div><span class="status-chip">${officeTeams.length} equipes</span></header>${teamForm}<div class="office-list">${teams}</div></article>
          <article class="card office-card office-card-wide"><header class="office-card-header"><div><p class="eyebrow">Papéis</p><h3>Catálogo do escritório</h3></div><span class="status-chip">${officeProfile.accessMode === 'enforced' ? 'Acesso aplicado' : 'Modo preparação'}</span></header><div class="office-role-list">${roleCards}${roleForm}</div><p id="officeRoleFeedback" class="office-feedback" role="status" aria-live="polite"></p>${accessModeControl}${privateMonitoringControl}<p class="office-note">O catálogo orienta ficha e filtro por processo. O escopo privado de OAB é aplicado no monitoramento; desativá-lo impede novas capturas, sem apagar dados existentes.</p></article>
          ${portfolioCard}
          ${hygieneCard}
          ${auditCard}
        </div>
      </div>`;
    },

    bindOfficeEvents() {
      const filterRolesForKind = (kindSelect, roleSelect) => {
        if (!kindSelect || !roleSelect) return;
        const kind = kindSelect.value;
        const options = [...roleSelect.options];
        for (const option of options) option.hidden = !String(option.dataset.officeRoleKinds || '').split(',').includes(kind);
        if (roleSelect.selectedOptions[0]?.hidden) {
          const first = options.find(option => !option.hidden);
          if (first) roleSelect.value = first.value;
        }
      };
      documentRef.addEventListener('change', event => {
        if (!event.target.matches?.('[data-office-member-kind]')) return;
        filterRolesForKind(event.target, documentRef.querySelector(`[data-office-member-role="${CSS.escape(event.target.dataset.officeMemberKind)}"]`));
      });
      byId('officeNewMemberKind')?.addEventListener('change', event => filterRolesForKind(event.currentTarget, byId('officeNewMemberRole')));
      byId('officeNewMemberForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const feedback = byId('officeNewMemberFeedback');
        if (feedback) feedback.textContent = 'Criando membro...';
        try {
          const response = await secureFetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              username: byId('officeNewMemberUsername')?.value.trim() || '',
              displayName: byId('officeNewMemberName')?.value.trim() || '',
              email: byId('officeNewMemberEmail')?.value.trim() || '',
              password: byId('officeNewMemberPassword')?.value || '',
              memberKind: byId('officeNewMemberKind')?.value || 'lawyer',
              officeRoleId: byId('officeNewMemberRole')?.value || 'associate',
              teamIds: [...documentRef.querySelectorAll('[data-office-new-member-team]:checked')].map(input => input.value)
            })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.message || 'Não foi possível criar o membro.');
          await feature.loadOfficeData(true);
          feature.render();
          const updatedFeedback = byId('officeNewMemberFeedback');
          if (updatedFeedback) updatedFeedback.innerHTML = `A conta foi criada e aguarda ativação pelo membro. ${newMemberResult(payload)}`;
        } catch (error) {
          if (feedback) feedback.textContent = error.message;
        }
      });
      documentRef.querySelectorAll('[data-office-team-delete]').forEach(button => button.addEventListener('click', async () => {
        if (!windowRef.confirm('Excluir esta equipe? Os membros continuam no escritório.')) return;
        const response = await secureFetch(`/api/office/teams/${encodeURIComponent(button.dataset.officeTeamDelete)}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) { warn(payload.message || 'Não foi possível excluir a equipe.'); return; }
        await feature.loadOfficeData(true);
        feature.render();
      }));
      documentRef.querySelectorAll('[data-office-access-mode]').forEach(button => button.addEventListener('click', async () => {
        const nextMode = button.dataset.officeAccessMode;
        const unassigned = (store.state.processes || []).filter(process => !(Array.isArray(process.responsibleUserIds) && process.responsibleUserIds.length) && !(Array.isArray(process.assignedTeamIds) && process.assignedTeamIds.length)).length;
        if (nextMode === 'enforced' && !windowRef.confirm(`Ativar o acesso por processo?\n\n${unassigned} processo(s) sem equipe ou responsável ficarão visíveis apenas para gestores até a atribuição. Esta ação pode ser revertida.`)) return;
        const response = await secureFetch('/api/office', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ accessMode: nextMode })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) { warn(payload.message || 'Não foi possível alterar o modo de acesso.'); return; }
        officeProfile = { ...officeProfile, accessMode: payload.accessMode };
        await feature.loadOfficeData(true);
        feature.render();
      }));
      documentRef.querySelectorAll('[data-office-private-monitoring]').forEach(button => button.addEventListener('click', async () => {
        const nextMode = button.dataset.officePrivateMonitoring;
        if (nextMode === 'disabled' && !windowRef.confirm('Desativar o monitoramento privado?\n\nAs capturas privadas param, mas os dados privados existentes são preservados.')) return;
        const response = await secureFetch('/api/office', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ privateMonitoring: nextMode })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) { warn(payload.message || 'Não foi possível alterar o monitoramento privado.'); return; }
        officeProfile = { ...officeProfile, privateMonitoring: payload.privateMonitoring };
        await feature.loadOfficeData(true);
        feature.render();
      }));
      documentRef.querySelectorAll('[data-office-member-offboard]').forEach(button => button.addEventListener('click', async () => {
        const memberId = button.dataset.officeMemberOffboard;
        const transferToUserId = documentRef.querySelector(`[data-office-member-transfer="${CSS.escape(memberId)}"]`)?.value || '';
        if (!windowRef.confirm('Desligar este membro? Processos e tarefas atribuídas serão transferidos para o substituto escolhido.')) return;
        const response = await secureFetch(`/api/office/members/${encodeURIComponent(memberId)}/offboard`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ transferToUserId, expectedRevision: store.revision })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) { warn(payload.message || 'Não foi possível desligar o membro.'); return; }
        store.adoptServerRevision(payload.revision);
        await feature.loadOfficeData(true);
        feature.render();
      }));
      documentRef.querySelectorAll('[data-office-member-save]').forEach(button => button.addEventListener('click', async () => {
        const memberId = button.dataset.officeMemberSave;
        const kind = documentRef.querySelector(`[data-office-member-kind="${CSS.escape(memberId)}"]`)?.value;
        const roleId = documentRef.querySelector(`[data-office-member-role="${CSS.escape(memberId)}"]`)?.value;
        const response = await secureFetch(`/api/office/members/${encodeURIComponent(memberId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ memberKind: kind, officeRoleId: roleId })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) { warn(payload.message || 'Não foi possível atualizar o membro.'); return; }
        await feature.loadOfficeData(true);
        feature.render();
      }));
      const selectedPermissions = container => [...container.querySelectorAll('[data-office-role-permission]:checked')].map(input => input.value);
      const criticalSelected = permissions => permissions.some(id => officeRoleCatalog.permissions.find(permission => permission.id === id)?.risk === 'critico');
      const confirmCritical = permissions => !criticalSelected(permissions)
        || windowRef.confirm('Este papel dá controle administrativo do escritório. Conceda apenas a quem responde pela operação. Continuar?');
      const showRoleError = message => {
        const feedback = byId('officeRoleFeedback');
        if (feedback) feedback.textContent = message;
      };
      documentRef.querySelector('[data-office-audit-more]')?.addEventListener('click', async () => {
        const loaded = await feature.loadOfficeAccessAudit(Number(officeAccessAudit?.page || 1) + 1);
        if (!loaded) { warn('Não foi possível carregar os registros anteriores. Tente de novo em instantes.'); return; }
        feature.render();
      });
      byId('officeRoleForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const permissions = selectedPermissions(event.currentTarget);
        if (!confirmCritical(permissions)) return;
        const response = await secureFetch('/api/office/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            name: byId('officeRoleName')?.value.trim() || '',
            description: byId('officeRoleDescription')?.value.trim() || '',
            permissions
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) { showRoleError(payload.message || 'Não foi possível criar o papel.'); return; }
        await feature.loadOfficeData(true);
        feature.render();
      });
      documentRef.querySelectorAll('[data-office-role-save]').forEach(button => button.addEventListener('click', async () => {
        const roleId = button.dataset.officeRoleSave;
        const permissions = selectedPermissions(button.closest('[data-office-role-id]'));
        if (!confirmCritical(permissions)) return;
        const response = await secureFetch(`/api/office/roles/${encodeURIComponent(roleId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ permissions })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) { showRoleError(payload.message || 'Não foi possível salvar o papel.'); return; }
        await feature.loadOfficeData(true);
        feature.render();
      }));
      documentRef.querySelectorAll('[data-office-role-deactivate]').forEach(button => button.addEventListener('click', async () => {
        if (!windowRef.confirm(`Desativar o papel "${button.dataset.officeRoleName}"? Quem usa esse papel precisa receber outro.`)) return;
        const response = await secureFetch(`/api/office/roles/${encodeURIComponent(button.dataset.officeRoleDeactivate)}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) { showRoleError(payload.message || 'Não foi possível desativar o papel.'); return; }
        await feature.loadOfficeData(true);
        feature.render();
      }));
      byId('officeTeamForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const memberIds = [...documentRef.querySelectorAll('[data-office-team-member]:checked')].map(input => input.value);
        const response = await secureFetch('/api/office/teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ name: byId('officeTeamName')?.value.trim(), description: byId('officeTeamDescription')?.value.trim(), memberIds })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) { warn(payload.message || 'Não foi possível criar a equipe.'); return; }
        await feature.loadOfficeData(true);
        feature.render();
      });
    },

    async transferPrincipal(userId) {
      try {
        const response = await withReauth(stepUp => secureFetch('/api/office/principal/transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ toUserId: userId, ...stepUp })
        }));
        if (response.reauthCancelled) {
          showToast('Transferência cancelada. Nada mudou.', 'warning');
          return;
        }
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível transferir a titularidade.');
        showToast('Titularidade transferida. Entre novamente para continuar.', 'success');
        globalThis.location?.reload?.();
      } catch (error) {
        showToast(error.message || 'Não foi possível transferir a titularidade.', 'error');
      }
    },

    async manageAuthUser(userId, status) {
      try {
        const response = await withReauth(stepUp => secureFetch('/api/auth/users/manage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ userId, status, ...stepUp })
        }));
        if (response.reauthCancelled) {
          await feature.loadAuthUsers({ shared: false });
          feature.render();
          showToast('Alteração cancelada. Nenhuma mudança foi aplicada.', 'warning');
          return false;
        }
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível atualizar o usuário.');
        await feature.loadAuthUsers({ shared: false });
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
        const response = await withReauth(stepUp => secureFetch('/api/auth/users/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ userId, ...stepUp })
        }));
        if (response.reauthCancelled) {
          await feature.loadAuthUsers({ shared: false });
          feature.render();
          showToast('Exclusão cancelada. Nenhuma mudança foi aplicada.', 'warning');
          return false;
        }
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Não foi possível excluir o usuário.');
        await feature.loadAuthUsers({ shared: false });
        feature.render();
        showToast('Usuário excluído com sucesso.', 'success');
        return true;
      } catch (error) {
        showToast(error.message, 'error');
        return false;
      }
    },

    authUserRow(user, workload = null) {
      const labels = { active: 'Ativo', inactive: 'Suspenso', pending_approval: 'Aguardando aprovação' };
      const canManage = currentAuthRole === 'master_admin' && user.role !== 'master_admin';
      const nextStatus = user.status === 'active' ? 'inactive' : 'active';
      const actionLabel = user.status === 'pending_approval' ? 'Aprovar' : user.status === 'active' ? 'Suspender' : 'Reativar';
      const workloadLabel = workload
        ? `${workload.tasks} tarefa${workload.tasks === 1 ? '' : 's'} aberta${workload.tasks === 1 ? '' : 's'} · ${workload.processes} processo${workload.processes === 1 ? '' : 's'}`
        : '';
      if (documentRef.documentElement?.dataset?.ui === 'v2') {
        const roleLabel = user.role === 'master_admin' ? 'Administrador principal' : 'Colaborador';
        const statusLabel = labels[user.status] || user.status || 'Ativo';
        return `<article class="configuration-row configuration-user-row" role="listitem" data-auth-user-id="${escapeHtml(user.id)}" data-auth-user-state="${escapeHtml(user.status || 'active')}">
          <div class="config-row-info config-row-info-with-avatar">${memberAvatarHtml(user, escapeHtml)}<div class="config-row-text"><strong>${escapeHtml(user.displayName || user.username)}</strong><span>${escapeHtml(user.email || user.username)}</span><small>${escapeHtml(roleLabel)}</small>${workloadLabel ? `<small class="config-user-workload" title="Vínculos contados por id oficial do integrante">${escapeHtml(workloadLabel)}</small>` : ''}</div></div>
          <span class="configuration-user-status status-${escapeHtml(user.status || 'active')}">${escapeHtml(statusLabel)}</span>
          <div class="configuration-row-actions">${canManage && user.status === 'active' ? `<button type="button" class="button ghost" data-auth-transfer-principal>Tornar titular</button>` : ''}${canManage ? `<button type="button" class="button ghost" data-auth-user-status="${nextStatus}" aria-label="${actionLabel} acesso de ${escapeHtml(user.displayName || user.username)}">${actionLabel}</button><button type="button" class="button ghost danger-text" data-auth-user-delete="${escapeHtml(user.id)}" aria-label="Excluir usuário ${escapeHtml(user.displayName || user.username)}">Excluir</button>` : '<button type="button" class="button ghost" data-open-my-profile="true" title="Abrir configurações, redefinir ou apagar meu perfil">Meu perfil</button>'}</div>
        </article>`;
      }
      return `<div class="configuration-row" data-auth-user-id="${escapeHtml(user.id)}">
        <div class="config-row-info config-row-info-with-avatar">${memberAvatarHtml(user, escapeHtml)}<div class="config-row-text"><strong>${escapeHtml(user.displayName || user.username)}</strong><span>${escapeHtml(user.email || user.username)} · ${user.role === 'master_admin' ? 'Administrador' : 'Colaborador'}</span><small>${escapeHtml(labels[user.status] || user.status || 'Ativo')}</small>${workloadLabel ? `<small class="config-user-workload">${escapeHtml(workloadLabel)}</small>` : ''}</div></div>
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
          ['Tipos de tarefa', config.taskDefinitions?.length || 0],
          ['Tipos de ação', config.actionTypes?.length || 0],
          ['Etapas', config.stages?.length || 0],
          ['Membros', authUsers.length],
          ['Contatos importados', store.state.contacts.length]
        ].map(([label, count]) => `<div class="configuration-metric"><strong>${count}</strong><span>${label}</span></div>`).join('');
      }
      const label = CONFIGURATION_SECTIONS.find(([key]) => key === configurationSection)?.[1] || 'Configuração';
      const isAuthUsers = configurationSection === 'users';
      const isSpecialSection = ['office', 'registry', 'diagnostic', 'backups', 'experimental'].includes(configurationSection);
      byId('newConfigurationButton')?.classList.toggle('hidden', isAuthUsers || isSpecialSection);
      byId('configurationSearch')?.closest('.table-search')?.classList.toggle('hidden', isSpecialSection);

      if (configurationSection === 'office') {
        if (byId('configurationHeading')) byId('configurationHeading').textContent = 'Escritório';
        if (byId('configurationCount')) byId('configurationCount').textContent = `${authUsers.length} ${authUsers.length === 1 ? 'membro' : 'membros'}`;
        if (byId('configurationList')) byId('configurationList').innerHTML = feature.officeShell();
        feature.bindOfficeEvents();
        presentation?.sync?.({ section: configurationSection, special: true });
        if (!officeLoaded) {
          feature.loadOfficeData().then(() => {
            if (configurationSection === 'office') feature.render();
          });
        }
        return;
      }

      if (configurationSection === 'experimental') {
        if (byId('configurationHeading')) byId('configurationHeading').textContent = 'Preferências deste navegador';
        if (byId('configurationCount')) byId('configurationCount').textContent = 'Preferência local';
        if (byId('configurationList')) byId('configurationList').innerHTML = feature.experimentalShell();
        presentation?.sync?.({ section: configurationSection, special: true });
        return;
      }

      if (configurationSection === 'diagnostic') {
        if (byId('configurationHeading')) byId('configurationHeading').textContent = 'Diagnóstico e Saúde do Sistema';
        if (byId('configurationCount')) byId('configurationCount').textContent = 'Atrium v2.0';
        onRenderDiagnostic();
        presentation?.sync?.({ section: configurationSection, special: true });
        return;
      }
      if (configurationSection === 'backups') {
        if (byId('configurationHeading')) byId('configurationHeading').textContent = 'Cópias de Segurança e Restauração';
        if (byId('configurationCount')) byId('configurationCount').textContent = 'Protegidas';
        onRenderBackups();
        presentation?.sync?.({ section: configurationSection, special: true });
        return;
      }
      if (configurationSection === 'registry') {
        if (byId('configurationHeading')) byId('configurationHeading').textContent = 'Consulta de cadastros';
        if (byId('configurationCount')) byId('configurationCount').textContent = 'Fontes públicas';
        if (byId('configurationList')) byId('configurationList').innerHTML = registryConfigurationShell();
        presentation?.sync?.({ section: configurationSection, special: true });
        feature.loadRegistryStatus();
        return;
      }

      if (configurationSection === 'integrations') {
        const defaultIntegrations = Array.isArray(globalThis.OFFICE_DEFAULT_DATA?.integrations) ? globalThis.OFFICE_DEFAULT_DATA.integrations : [];
        if (!Array.isArray(config.integrations)) config.integrations = [];
        let added = false;
        defaultIntegrations.forEach(di => {
          if (di && di.name && !config.integrations.some(item => (item?.name || '').toLowerCase() === di.name.toLowerCase())) {
            config.integrations.push(JSON.parse(JSON.stringify(di)));
            added = true;
          }
        });
        if (added) store.save?.();
      }

      const raw = isAuthUsers ? authUsers : (Array.isArray(config[configurationSection]) ? config[configurationSection] : []);
      const needle = normalizeText(query);
      const records = raw.map((item, index) => ({ item, index })).filter(({ item }) => !needle || normalizeText(typeof item === 'string' ? item : Object.values(item || {}).flat().join(' ')).includes(needle));
      if (byId('configurationHeading')) byId('configurationHeading').textContent = label;
      if (byId('configurationCount')) byId('configurationCount').textContent = `${records.length} ${records.length === 1 ? 'item' : 'itens'}`;
      const list = byId('configurationList');
      const emptyIcon = iconSvg('check');
      // Carga por integrante: leitura local do Store, contada por id oficial (sem rota nova).
      const workload = new Map();
      if (isAuthUsers) {
        const openTasks = (store.state.tasks || []).filter(task => task && task.active !== false && !['concluida', 'cancelada'].includes(task.status));
        const processes = store.state.processes || [];
        authUsers.forEach(user => {
          const id = String(user.id || user.username || '');
          if (!id) return;
          workload.set(id, {
            tasks: openTasks.filter(task => String(task.assigneeUserId || '') === id).length,
            processes: processes.filter(process => (Array.isArray(process.responsibleUserIds) ? process.responsibleUserIds : []).some(value => String(value) === id)).length
          });
        });
      }
      if (list) list.innerHTML = records.length ? records.map(({ item, index }) => isAuthUsers ? feature.authUserRow(item, workload.get(String(item.id || item.username || '')) || null) : feature.row(item, index)).join('') : `<div class="empty-detail"><span>${emptyIcon}</span><h3>Nenhum item</h3><p>Não há registros nesta seção ou neste filtro.</p></div>`;
      presentation?.sync?.({ section: configurationSection, authUsers: isAuthUsers });
    },

    experimentalPreferences() {
      try {
        return dashboardWidgets?.read?.() || { enabled: false, hidden: [] };
      } catch {
        return { enabled: false, hidden: [] };
      }
    },

    densityPreference() {
      try {
        const value = dashboardWidgets?.density?.read?.();
        return value === 'basic' || value === 'pro' ? value : null;
      } catch {
        return null;
      }
    },

    appliedDensity() {
      return documentRef?.documentElement?.dataset?.uiDensity === 'basic' ? 'basic' : 'pro';
    },

    densityStatusText() {
      const applied = feature.appliedDensity();
      const stored = feature.densityPreference();
      const labelFor = value => (value === 'basic' ? 'Basic' : 'PRO');
      return stored && stored !== applied
        ? `Em uso agora: <strong>${labelFor(applied)}</strong>. Preferência gravada: <strong>${labelFor(stored)}</strong> — recarregue a página para aplicar.`
        : `Em uso agora: <strong>${labelFor(applied)}</strong>.`;
    },

    setDensityPreference(value) {
      const next = value === 'basic' ? 'basic' : 'pro';
      let persisted = false;
      try {
        persisted = dashboardWidgets?.density?.write?.(next)?.persisted === true;
      } catch {
        persisted = false;
      }
      // Atualização em linha preserva o checkbox focado e mantém a live region viva.
      const list = byId('configurationList');
      const status = list?.querySelector?.('.experimental-density-status');
      if (status) status.innerHTML = feature.densityStatusText();
      else if (list) list.innerHTML = feature.experimentalShell();
      showToast?.(
        persisted
          ? `Preferência gravada: ${next === 'basic' ? 'Basic' : 'PRO'}. Recarregue a página para aplicar.`
          : 'Não foi possível gravar a preferência de densidade neste navegador.',
        persisted ? 'success' : 'error'
      );
    },

    /**
     * Superfície experimental de personalização do painel: desligada por
     * padrão, preferência apenas deste navegador (sem Store, sem servidor).
     */
    experimentalShell() {
      const catalog = Array.isArray(dashboardWidgets?.catalog) ? dashboardWidgets.catalog : [];
      const preferences = feature.experimentalPreferences();
      const rows = catalog.map(widget => {
        const checked = preferences.enabled ? !preferences.hidden.includes(widget.id) : true;
        return `<li class="experimental-widget-row">
          <label>
            <input type="checkbox" data-experimental-widget="${escapeHtml(widget.id)}" ${checked ? 'checked' : ''} ${preferences.enabled ? '' : 'disabled'}>
            <span><strong>${escapeHtml(widget.label)}</strong><small>${escapeHtml(widget.description)}</small></span>
          </label>
        </li>`;
      }).join('');
      const applied = feature.appliedDensity();
      const stored = feature.densityPreference();
      const selected = stored || applied;
      return `<div class="configuration-experimental" data-experimental-panel>
        <section class="configuration-experimental-block is-density-block" aria-labelledby="experimentalDensityHeading">
          <header>
            <div>
              <p>Preferência deste navegador</p>
              <h3 id="experimentalDensityHeading">Densidade da interface</h3>
              <span>Basic mantém o essencial à vista e recolhe a navegação secundária. PRO mostra todas as áreas. Mesma conta, mesmos dados e mesmas permissões.</span>
            </div>
            <label class="experimental-master-toggle">
              <input type="checkbox" data-density-toggle ${selected === 'basic' ? 'checked' : ''}>
              <span>Usar Basic neste navegador</span>
            </label>
          </header>
          <footer>
            <small class="experimental-density-status" role="status">${feature.densityStatusText()}</small>
          </footer>
        </section>
        <section class="configuration-experimental-block" aria-labelledby="experimentalDashboardHeading">
          <header>
            <div>
              <p>Preferência deste navegador</p>
              <h3 id="experimentalDashboardHeading">Personalização do painel</h3>
              <span>Desligada por padrão: o painel permanece como está até você ativar. Não altera dados, prazos, permissões nem o servidor.</span>
            </div>
            <label class="experimental-master-toggle">
              <input type="checkbox" data-experimental-toggle ${preferences.enabled ? 'checked' : ''}>
              <span>Ativar personalização</span>
            </label>
          </header>
          <ul class="experimental-widget-list">${rows}</ul>
          <footer>
            <button type="button" class="button ghost" data-experimental-reset ${preferences.enabled ? '' : 'disabled'}>Restaurar padrão</button>
            <small>Com a personalização ativa, escolha quais blocos do painel aparecem. A preferência vale somente neste navegador.</small>
          </footer>
        </section>
      </div>`;
    },

    setDashboardWidgetsEnabled(enabled) {
      const preferences = { ...feature.experimentalPreferences(), enabled: enabled === true };
      dashboardWidgets?.write?.(preferences);
      if (byId('configurationList')) byId('configurationList').innerHTML = feature.experimentalShell();
      onDashboardWidgetsChanged?.();
      showToast?.(
        enabled ? 'Personalização do painel ativada.' : 'Personalização desativada; layout original restaurado.',
        'success'
      );
    },

    setDashboardWidget(widgetId, enabled) {
      const preferences = feature.experimentalPreferences();
      if (!preferences.enabled) return;
      const hidden = new Set(preferences.hidden);
      if (enabled) hidden.delete(widgetId);
      else hidden.add(widgetId);
      dashboardWidgets?.write?.({ enabled: true, hidden: [...hidden] });
      if (byId('configurationList')) byId('configurationList').innerHTML = feature.experimentalShell();
      onDashboardWidgetsChanged?.();
    },

    resetDashboardWidgets() {
      dashboardWidgets?.reset?.();
      if (byId('configurationList')) byId('configurationList').innerHTML = feature.experimentalShell();
      onDashboardWidgetsChanged?.();
      showToast?.('Preferência do painel restaurada ao padrão.', 'success');
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
      if (/inpi|rpi|marcas|propriedade industrial/.test(normalized)) {
        onOpenInpiModal();
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
              <span class="configuration-edit-affordance" aria-hidden="true">Editar <svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.2#atrium-icon-chevron-right"></use></svg></span>
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
        const area = officeTaskArea(item);
        if (area && area !== item.phase) parts.push(area);
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
        const directTarget = getDirectSetupTarget(primary);
        const actionLabel = directTarget.type === 'inpi' ? 'Abrir Painel RPI' : (directTarget.type !== 'general' ? directTarget.actionLabel : 'Configurar Conexão');
        extraActions = `<button type="button" class="button ghost configuration-action-btn" data-direct-integration="${escapeHtml(primary)}" title="${escapeHtml(actionLabel)} de ${escapeHtml(primary)}">${escapeHtml(actionLabel)}</button>`;
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
            <span class="configuration-edit-affordance" aria-hidden="true">Editar <svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.2#atrium-icon-chevron-right"></use></svg></span>
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
      const fields = configurationFields(configurationSection);
      const values = typeof defaults === 'string' ? { value: defaults } : { ...defaults };
      if ('responsibles' in values) values.responsibles = formatResponsibles(values.responsibles);
      if (configurationSection === 'taskDefinitions' && index !== null && index !== undefined && !String(values.area || '').trim()) {
        values.area = officeTaskArea(values);
      }
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
            ${escapeHtml(target.actionLabel)} <svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.2#atrium-icon-chevron-right"></use></svg>
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
        if ('area' in data) {
          const area = String(data.area ?? '').trim().slice(0, 48);
          if (area) record.area = area;
          else delete record.area;
        }
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
    <header><div><span>CONSULTA DE CADASTROS</span><h3 id="registryConfigHeading">Fontes e política de uso</h3><p>Consultas públicas passam pelo backend do ATRIUM e exigem revisão antes de alterar um contato.</p></div><button type="button" class="v2-button is-secondary" data-registry-config-action="status">Atualizar estado</button></header>
    <div class="registry-provider-grid" id="registryProviderStatus" aria-live="polite"></div>
    <section class="registry-cpf-validation"><div><span>VALIDAÇÃO DOCUMENTAL</span><h4>Validar CPF</h4><p>Confere localmente o formato e os dígitos verificadores, sem transmitir o documento.</p></div><form data-registry-cpf-form><label for="registryCpfQuery">CPF</label><div><input id="registryCpfQuery" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00"><button type="submit" class="v2-button is-primary">Validar CPF</button></div></form><div id="registryCpfResult" aria-live="polite"></div></section>
    <section class="registry-bank-directory"><div><span>DIRETÓRIO BANCÁRIO</span><h4>Normalizar instituição</h4><p>Busca por código, ISPB ou nome em diretório público cacheado.</p></div><form data-registry-bank-form><label for="registryBankQuery">Banco</label><div><input id="registryBankQuery" type="text" inputmode="search" role="searchbox" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Ex.: 001, ISPB ou nome"><button type="submit" class="v2-button is-primary" data-registry-config-action="banks">Buscar banco</button></div></form><div class="registry-bank-results" id="registryBankResults" aria-live="polite"></div></section>
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
