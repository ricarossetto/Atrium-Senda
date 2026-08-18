(() => {
  'use strict';

  const STORAGE_KEY = 'jurisflow_storage_v1';
  const TERMINAL_STATUSES = ['concluida'];
  const KANBAN_COLUMNS = [
    { id: 'triagem', title: 'Entrada & triagem', color: '#c9a84c' },
    { id: 'prioridade', title: 'Prioridade', color: '#e5a84b' },
    { id: 'andamento', title: 'Em andamento', color: '#6f9fd8' },
    { id: 'aguardando', title: 'Aguardando', color: '#a887c7' },
    { id: 'revisao', title: 'Revisão', color: '#d68a67' },
    { id: 'concluida', title: 'Concluída', color: '#40b879' }
  ];

  const now = new Date();
  const isoDate = (offset = 0) => {
    const date = new Date(now);
    date.setDate(date.getDate() + offset);
    return date.toISOString().slice(0, 10);
  };

  const sampleState = {
    version: 1,
    terms: [{
      id: 'term-principal',
      name: 'Dr(a). Advogado(a) Titular',
      registration: 'OAB/UF 000000',
      active: true,
      primary: true
    }],
    sources: [
      { id: 'external-calendar', name: 'Agenda Externa (Webcal)', short: 'CAL', method: 'Webcal/iCal', status: 'planned', lastCheck: null, detail: 'Sincronize com Google Agenda, Outlook ou Apple' },
      { id: 'djen', name: 'DJEN / CNJ Oficial', short: 'CNJ', method: 'API pública oficial', status: 'planned', lastCheck: null, detail: 'Conector de diários e publicações' },
      { id: 'datajud', name: 'DataJud / CNJ', short: 'DJ', method: 'API pública oficial', status: 'planned', lastCheck: null, detail: 'Enriquecimento de andamentos processuais' },
      { id: 'a1', name: 'Portais com certificado A1 / PJe', short: 'A1', method: 'Agente local seguro', status: 'off', lastCheck: null, detail: 'Integração direta com tribunais' }
    ],
    intimations: [
      {
        id: 'int-demo-1', source: 'DJEN Oficial', status: 'nova', unread: true,
        title: 'Publicação identificada para conferência', process: '0000000-00.2026.8.21.0000',
        client: 'Cliente Modelo', court: 'Tribunal de Justiça · Vara Cível', publishedAt: isoDate(0),
        text: 'Intimação de demonstração. Quando os coletores estiverem ativos, o texto original da publicação ou da notificação oficial será preservado neste espaço.',
        term: 'Dr(a). Advogado(a) Titular · OAB/UF 000000', createdAt: new Date().toISOString()
      },
      {
        id: 'int-demo-2', source: 'Diário Eletrônico', status: 'triagem', unread: false,
        title: 'Movimentação processual aguardando análise', process: '5000000-00.2026.4.04.0000',
        client: 'Processo de demonstração', court: 'Justiça Federal · Vara Federal', publishedAt: isoDate(-1),
        text: 'Conteúdo ilustrativo para testar a triagem, a criação de tarefas e a vinculação ao Kanban.',
        term: 'Dr(a). Advogado(a) Titular · OAB/UF 000000', createdAt: new Date(Date.now() - 86400000).toISOString()
      }
    ],
    tasks: [
      { id: 'task-demo-1', title: 'Conferir publicação importada', description: 'Validar o conteúdo original antes de definir qualquer prazo.', status: 'triagem', source: 'Demonstração', client: 'Cliente Modelo', process: '0000000-00.2026.8.21.0000', deadline: isoDate(1), priority: 'urgente', responsible: 'Advogado', createdAt: new Date().toISOString() },
      { id: 'task-demo-2', title: 'Revisar minuta processual', description: 'Segunda conferência do documento antes do protocolo.', status: 'revisao', source: 'Interna', client: 'Processo de demonstração', process: '5000000-00.2026.4.04.0000', deadline: isoDate(4), priority: 'normal', responsible: 'Advogado', createdAt: new Date().toISOString() },
      { id: 'task-demo-3', title: 'Confirmar documentos com cliente', description: 'Aguardar o envio dos documentos complementares.', status: 'aguardando', source: 'Interna', client: 'Cliente Modelo', process: '', deadline: isoDate(7), priority: 'importante', responsible: 'Equipe', createdAt: new Date().toISOString() }
    ],
    processes: [
      { id: 'proc-demo-1', number: '0000000-00.2026.8.21.0000', client: 'Cliente Modelo', court: 'TJ · 1ª Vara Cível', secrecy: false, lastMovement: 'Publicação recebida para triagem', lastMovementAt: isoDate(0), monitoring: 'active' },
      { id: 'proc-demo-2', number: '5000000-00.2026.4.04.0000', client: 'Processo de demonstração', court: 'TRF · 2ª Vara Federal', secrecy: true, lastMovement: 'Movimentação capturada pelo conector', lastMovementAt: isoDate(-1), monitoring: 'attention' }
    ],
    contacts: [],
    configuration: {
      users: [], monitoredTerms: [], taskDefinitions: [], actionGroups: [], actionTypes: [], stages: [], goals: [], origins: [], partners: [], inboxSections: [], notificationAssignments: [], integrations: [], sourceProducts: []
    },
    agenda: [
      { id: 'agenda-demo-1', title: 'Audiência de conciliação / instrução', date: isoDate(1), time: '09:30', source: 'Interna', client: 'Cliente Modelo', process: '0000000-00.2026.8.21.0000' },
      { id: 'agenda-demo-2', title: 'Prazo fatal para recurso', date: isoDate(4), time: '17:00', source: 'Demonstração', client: 'Processo de demonstração', process: '5000000-00.2026.4.04.0000' }
    ],
    audit: [
      { id: 'audit-initial', at: new Date().toISOString(), action: 'JurisFlow inicializado', detail: 'Ambiente pronto para uso com registros de demonstração.', actor: 'Sistema' }
    ],
    settings: {
      officeName: 'Escritório de Advocacia',
      lawyerName: 'Dr(a). Advogado(a) Titular',
      lawyerOab: 'OAB/UF 000000',
      lawyerCpfCnpj: '000.000.000-00',
      lawyerEmail: 'contato@advocacia.adv.br',
      lawyerPhone: '(00) 00000-0000',
      lawyerAddress: 'Endereço Profissional, Sala 01 — Cidade/UF',
      externalCalendarUrl: '',
      demoMode: true,
      calendarConfigured: false,
      collectorConfigured: false,
      dismissedBanner: false
    }
  };

  const deepClone = value => JSON.parse(JSON.stringify(value));
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const normalizeText = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const formatDate = value => {
    if (!value) return '—';
    const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return value;
    return new Intl.DateTimeFormat('pt-BR').format(new Date(year, month - 1, day));
  };
  const formatDateTime = value => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Nunca';
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const ACT_RULES = [
    { regex: /\b(apelac|recurs(o|ar)|agravo de instrument|recurso inominad|recurso especial|recurso extraordinari)/i, category: 'Recurso', days: 15, priority: 'importante', label: 'Recurso (15d)', css: 'recurso' },
    { regex: /\b(contestac|contestaç|conteste|defes(a|ar)|apresentar defesa)/i, category: 'Contestação', days: 15, priority: 'importante', label: 'Contestação (15d)', css: 'contestacao' },
    { regex: /\b(cumprimento de sentenc|pague|pagamento.{0,30}volunt|multa.{0,30}10%|execu[cç][aã]o)/i, category: 'Cumprimento de Sentença', days: 15, priority: 'urgente', label: 'Cumprimento (15d)', css: 'cumprimento' },
    { regex: /\b(embargos? de declarac|embargos? declarator)/i, category: 'Embargos de Declaração', days: 5, priority: 'importante', label: 'Embargos (5d)', css: 'embargos' },
    { regex: /\b(audi[eê]nc|sess[aã]o de julgamento|designad.{0,30}audi)/i, category: 'Audiência', days: 7, priority: 'urgente', label: 'Audiência (7d prep)', css: 'audiencia' },
    { regex: /\b(manifest|impugn|r[eé]plic|especifica(r|cao|ção).{0,20}prov|contrarraz)/i, category: 'Manifestação', days: 15, priority: 'normal', label: 'Manifestação (15d)', css: 'manifestacao' },
    { regex: /\b(senten[cç]|decis[aã]o|despacho|ac[oó]rd[aã]o)/i, category: 'Decisão / Despacho', days: 5, priority: 'normal', label: 'Decisão (5d)', css: 'recurso' }
  ];

  function classifyIntimationAct(text = '', title = '', type = '') {
    const combined = `${title} ${type} ${text}`;
    for (const rule of ACT_RULES) {
      if (rule.regex.test(combined)) return rule;
    }
    return { category: 'Intimação', days: 5, priority: 'normal', label: 'Intimação (5d)', css: 'rotina' };
  }

  function addDays(isoString, days) {
    if (!isoString) return '';
    const date = new Date(`${String(isoString).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function totalTimeMinutes(timeLogs = []) {
    return (Array.isArray(timeLogs) ? timeLogs : []).reduce((sum, log) => sum + (Number(log.minutes) || 0), 0);
  }

  function formatMinutes(minutes) {
    if (!minutes || minutes <= 0) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) return `${h}h${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }

  function getOfficeIdentity() {
    const s = Store?.state?.settings || {};
    return {
      officeName: s.officeName || 'Escritório de Advocacia',
      lawyerName: s.lawyerName || 'Dr(a). Advogado(a) Titular',
      lawyerOab: s.lawyerOab || 'OAB/UF 000000',
      lawyerCpf: s.lawyerCpfCnpj || '000.000.000-00',
      lawyerAddress: s.lawyerAddress || 'Sede Profissional',
      city: s.city || 'São Paulo/SP'
    };
  }

  function generateProcuracaoText(contact, process) {
    const id = getOfficeIdentity();
    const name = contact?.name || '[NOME DO OUTORGANTE]';
    const doc = contact?.document || '[CPF/CNPJ]';
    const rg = contact?.rg ? `, RG nº ${contact.rg}` : '';
    const prof = contact?.profession ? `, ${contact.profession}` : '';
    const civil = contact?.maritalStatus ? `, estado civil ${contact.maritalStatus}` : '';
    const address = [contact?.address, contact?.district, contact?.city, contact?.state, contact?.zip].filter(Boolean).join(', ') || '[ENDEREÇO COMPLETO]';
    const procNumber = process?.number ? ` nos autos do processo nº ${process.number}` : '';

    return `PROCURAÇÃO "AD JUDICIA ET EXTRA"

OUTORGANTE:
${name}, brasileiro(a)${civil}${prof}, inscrito(a) no CPF/MF sob o nº ${doc}${rg}, residente e domiciliado(a) em ${address}.

OUTORGADO:
${id.lawyerName.toUpperCase()}, advogado(a) regularmente inscrito(a) nos quadros da Ordem dos Advogados do Brasil sob o nº ${id.lawyerOab}, com escritório profissional em ${id.officeName}, estabelecido em ${id.lawyerAddress}.

PODERES:
Por este instrumento particular de mandato, o(a) OUTORGANTE nomeia e constitui o OUTORGADO seu procurador, conferindo-lhe amplos poderes para o foro em geral, com a cláusula "AD JUDICIA ET EXTRA", em qualquer Juízo, Instância ou Tribunal, bem como perante quaisquer órgãos públicos ou privados, autarquias e cartórios, podendo propor contra quem de direito as ações competentes e defendê-lo(a) nas que lhe forem propostas${procNumber}.

PODERES ESPECIAIS:
Nos termos do Artigo 105 do Código de Processo Civil (Lei nº 13.105/2015), são conferidos poderes especiais para confessar, reconhecer a procedência do pedido, transigir, desistir, renunciar ao direito sobre o qual se funda a ação, firmar compromissos ou acordos judiciais e extrajudiciais, receber valores, passar recibo e dar plena, geral e irrevogável quitação, bem como substabelecer esta a outrem, com ou sem reserva de poderes.

${contact?.city || id.city}, ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date())}.


_________________________________________________________
${name}
CPF: ${doc}`;
  }

  function generateContratoText(contact, process) {
    const id = getOfficeIdentity();
    const name = contact?.name || '[NOME DO CLIENTE/CONTRATANTE]';
    const doc = contact?.document || '[CPF/CNPJ]';
    const address = [contact?.address, contact?.district, contact?.city, contact?.state].filter(Boolean).join(', ') || '[ENDEREÇO DO CONTRATANTE]';
    const feeType = process?.feeType || 'exito';
    const feePct = process?.feePercentage || '30';
    const feeFixed = process?.feeAmount ? `R$ ${process.feeAmount}` : 'a combinar';
    const feeDetails = feeType === 'exito'
      ? `Honorários contratuais de ${feePct}% (quota litis) incidentes sobre o proveito econômico auferido pelo CONTRATANTE ao final da demanda.`
      : feeType === 'fixo'
      ? `Honorários fixos no valor de ${feeFixed}, a serem adimplidos conforme cronograma acordado.`
      : `Honorários mistos no valor fixo de ${feeFixed} acrescidos de ${feePct}% sobre o êxito econômico auferido.`;

    return `CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS E HONORÁRIOS

Pelo presente instrumento particular, de um lado:

CONTRATANTE: ${name}, inscrito(a) no CPF/CNPJ nº ${doc}, com domicílio em ${address}.

CONTRATADO: ${id.officeName.toUpperCase()}, representado(a) por ${id.lawyerName}, inscrito(a) na ${id.lawyerOab}, com sede profissional em ${id.lawyerAddress}.

As partes acima qualificadas celebram o presente Contrato, mediante as seguintes cláusulas:

CLÁUSULA PRIMEIRA - DO OBJETO
O CONTRATADO prestará assistência jurídica e patrocínio dos interesses do CONTRATANTE${process?.number ? ` nos autos do processo nº ${process.number}` : ''}, abrangendo o ajuizamento, acompanhamento e defesas necessárias até a decisão final da instância ordinária.

CLÁUSULA SEGUNDA - DOS HONORÁRIOS
Pelos serviços profissionais prestados, o CONTRATANTE pagará ao CONTRATADO:
${feeDetails}

Parágrafo Único: Os honorários de sucumbência eventualmente arbitrados por juízo pertencem integralmente e com exclusividade ao CONTRATADO, sem qualquer compensação com os honorários contratuais, na forma do Art. 23 da Lei nº 8.906/94 (Estatuto da Advocacia).

CLÁUSULA TERCEIRA - DAS DESPESAS E CUSTAS
Todas as custas processuais, preparos recursais, despesas com certidões, cópias e honorários periciais correrão por conta do CONTRATANTE.

CLÁUSULA QUARTA - DO FORO
Fica eleito o foro da Comarca de ${contact?.city || id.city} para dirimir quaisquer dúvidas oriundas deste contrato.

${contact?.city || id.city}, ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date())}.


_____________________________________        _____________________________________
CONTRATANTE: ${name}                        CONTRATADO: ${id.lawyerName} · ${id.lawyerOab}`;
  }

  function generateDeclaracaoHipoText(contact) {
    const id = getOfficeIdentity();
    const name = contact?.name || '[NOME DO DECLARANTE]';
    const doc = contact?.document || '[CPF/CNPJ]';
    const rg = contact?.rg ? `, RG nº ${contact.rg}` : '';
    const prof = contact?.profession ? `, profissão: ${contact.profession}` : '';
    const address = [contact?.address, contact?.district, contact?.city, contact?.state].filter(Boolean).join(', ') || '[ENDEREÇO DO DECLARANTE]';

    return `DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA (JUSTIÇA GRATUITA)

Eu, ${name}, brasileiro(a)${prof}, inscrito(a) no CPF/MF sob o nº ${doc}${rg}, residente e domiciliado(a) em ${address},

DECLARO, para todos os fins de direito e sob as penas da lei, em especial para atendimento ao disposto no Artigo 98 e seguintes do Código de Processo Civil (Lei nº 13.105/2015) e na Lei nº 1.060/1950, que não disponho de condições financeiras suficientes para arcar com as custas processuais, taxas judiciárias e honorários periciais ou sucumbenciais sem prejuízo do meu sustento próprio e de minha família.

Por ser a expressão fiel da verdade, firmo a presente declaração.

${contact?.city || id.city}, ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date())}.


_________________________________________________________
${name}
CPF: ${doc}`;
  }

  const daysUntil = value => {
    if (!value) return Infinity;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Math.ceil((date - today) / 86400000);
  };

  const Store = {
    state: null,
    revision: null,
    saveTimer: null,
    flushPromise: Promise.resolve(),
    async load() {
      let persisted = null;
      try {
        const response = await window.KellerAuth.secureFetch('/api/state', { headers: { Accept: 'application/json' } });
        if (response.ok) { const payload = await response.json(); persisted = payload.state; this.revision = payload.revision || null; }
      } catch { /* usa migração local ou demonstração */ }
      if (!persisted) {
        try { persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { /* armazenamento antigo inválido */ }
      }
      this.state = persisted?.version === 1 ? persisted : deepClone(sampleState);
      this.ensureShape();
      this.save();
    },
    ensureShape() {
      ['terms', 'sources', 'intimations', 'tasks', 'processes', 'agenda', 'audit', 'contacts'].forEach(key => {
        if (!Array.isArray(this.state[key])) this.state[key] = [];
      });
      this.state.configuration = { ...deepClone(sampleState.configuration), ...(this.state.configuration || {}) };
      Object.keys(sampleState.configuration).forEach(key => { if (!Array.isArray(this.state.configuration[key])) this.state.configuration[key] = []; });
      this.state.settings = { ...sampleState.settings, ...(this.state.settings || {}) };
      if (!this.state.terms.length) this.state.terms.unshift(deepClone(sampleState.terms[0]));
    },
    save() {
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => { this.flushPromise = this.flushPromise.then(() => this.flush()); }, 250);
    },
    async flush() {
      clearTimeout(this.saveTimer); this.saveTimer = null;
      try {
        const response = await window.KellerAuth.secureFetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: this.state, revision: this.revision }), keepalive: true });
        if (response.status === 409) {
          window.KellerCentral?.App.toast('Os dados foram atualizados em outra aba. Recarregando a versão mais recente…', 'error');
          setTimeout(() => window.location.reload(), 700); return false;
        }
        if (!response.ok && response.status !== 401) throw new Error('Estado não persistido.');
        if (response.ok) { this.revision = (await response.json()).revision || this.revision; localStorage.removeItem(STORAGE_KEY); }
        return response.ok;
      } catch { return false; }
    },
    audit(action, detail, actor = 'Advogado') {
      const author = window.KellerAuth?.currentUser?.displayName || actor;
      this.state.audit.unshift({ id: uid('audit'), at: new Date().toISOString(), action, detail, actor: author });
      this.state.audit = this.state.audit.slice(0, 250);
      this.save();
    },
    upsert(collection, record, externalKey = 'id') {
      const index = this.state[collection].findIndex(item => item[externalKey] === record[externalKey]);
      if (index >= 0) this.state[collection][index] = { ...this.state[collection][index], ...record };
      else this.state[collection].unshift(record);
      this.save();
      return record;
    }
  };

  function sortRecords(records, sortConfig) {
    if (!sortConfig || !sortConfig.field) return records;
    const { field, direction } = sortConfig;
    const modifier = direction === 'desc' ? -1 : 1;
    return [...records].sort((a, b) => {
      let valA = a[field];
      let valB = b[field];
      if (field === 'registeredAt') {
        valA = a.registeredAt || a.createdAt || '';
        valB = b.registeredAt || b.createdAt || '';
      }
      if (field === 'lastMovementAt') {
        valA = a.lastMovementAt || '';
        valB = b.lastMovementAt || '';
      }
      if (valA === undefined || valA === null || valA === '') return 1;
      if (valB === undefined || valB === null || valB === '') return -1;
      if (typeof valA === 'string' && typeof valB === 'string') {
        return valA.localeCompare(valB, 'pt-BR', { numeric: true, sensitivity: 'base' }) * modifier;
      }
      if (valA < valB) return -1 * modifier;
      if (valA > valB) return 1 * modifier;
      return 0;
    });
  }

  function updateTableSortHeaders(tableId, currentSort) {
    const table = document.getElementById(tableId);
    if (!table) return;
    table.querySelectorAll('th[data-sort-field]').forEach(th => {
      const field = th.dataset.sortField;
      const indicator = th.querySelector('.sort-indicator');
      th.classList.remove('sorted-asc', 'sorted-desc');
      if (field === currentSort.field) {
        if (currentSort.direction === 'asc') {
          th.classList.add('sorted-asc');
          if (indicator) indicator.textContent = '▲';
        } else {
          th.classList.add('sorted-desc');
          if (indicator) indicator.textContent = '▼';
        }
      } else {
        if (indicator) indicator.textContent = '↕';
      }
    });
  }

  const App = {
    currentView: 'dashboard',
    inboxFilter: 'all',
    selectedIntimation: null,
    configurationSection: 'taskDefinitions',
    modalMode: null,
    judicialStatus: null,
    processSort: { field: 'registeredAt', direction: 'desc' },
    contactSort: { field: 'name', direction: 'asc' },
    agendaSelectedDate: null,
    agendaCalendarMonthOffset: 0,
    agendaTypeFilter: 'all',
    async init() {
      await Store.load();
      this.bindNavigation();
      this.bindActions();
      this.renderAll();
      this.checkServerStatus();
      document.getElementById('todayLabel').textContent = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' }).format(new Date());
      if (Store.state.settings.dismissedBanner) document.getElementById('environmentBanner').classList.add('hidden');
      this.initialSyncTimer = window.setTimeout(() => this.syncWhenIdle(), 60 * 1000);
      this.autoSyncTimer = window.setInterval(() => this.syncWhenIdle(), 5 * 60 * 1000);
    },
    bindNavigation() {
      document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => this.switchView(button.dataset.view)));
      document.addEventListener('click', event => { const link = event.target.closest('[data-view-link]'); if (link) this.switchView(link.dataset.viewLink); });
      document.getElementById('menuToggle').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
      document.addEventListener('keydown', event => {
        if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
          event.preventDefault(); document.getElementById('globalSearch').focus();
        }
        if (event.key === 'Escape') { this.closeModal(); this.closeJudicialSetup(); }
        if (event.key === 'Enter') {
          const interactive = event.target.closest('[data-view-link], [data-process-id], [data-contact-id], [data-agenda-id], [data-source-id], #primaryTermCard');
          if (interactive && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName)) { event.preventDefault(); interactive.click(); }
        }
      });
    },
    bindActions() {
      const byId = id => document.getElementById(id);
      byId('dismissBanner').addEventListener('click', () => { byId('environmentBanner').classList.add('hidden'); Store.state.settings.dismissedBanner = true; Store.save(); });
      byId('syncButton').addEventListener('click', () => this.syncAll());
      byId('agendaSyncButton').addEventListener('click', () => this.syncAll());
      byId('newTaskButton').addEventListener('click', () => this.openTaskModal());
      byId('newContactButton').addEventListener('click', () => this.openContactModal());
      byId('newAgendaButton').addEventListener('click', () => this.openAgendaModal());
      byId('newConfigurationButton').addEventListener('click', () => this.openConfigurationModal());
      byId('newIntimationButton').addEventListener('click', () => this.openIntimationModal());
      byId('newProcessButton').addEventListener('click', () => this.openProcessModal());
      byId('newTermButton').addEventListener('click', () => this.openTermModal());
      byId('primaryTermCard').addEventListener('click', () => {
        const term = Store.state.terms.find(item => item.registration === 'OAB/RS 135294') || Store.state.terms[0]; if (term) this.openTermModal(term);
      });
      byId('modalClose').addEventListener('click', () => this.closeModal());
      byId('modalCancel').addEventListener('click', () => this.closeModal());
      byId('modalBackdrop').addEventListener('click', event => { if (event.target === byId('modalBackdrop')) this.closeModal(); });
      byId('modalForm').addEventListener('submit', event => this.handleModalSubmit(event));
      byId('inboxFilters').addEventListener('click', event => {
        const button = event.target.closest('button[data-filter]'); if (!button) return;
        this.inboxFilter = button.dataset.filter;
        byId('inboxFilters').querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
        this.renderInbox();
      });
      byId('processSearch').addEventListener('input', () => this.renderProcesses(byId('processSearch').value));
      byId('contactSearch').addEventListener('input', () => this.renderContacts(byId('contactSearch').value));
      byId('configurationSearch').addEventListener('input', () => this.renderConfiguration(byId('configurationSearch').value));
      byId('configurationTabs').addEventListener('click', event => {
        const button = event.target.closest('button[data-config-section]'); if (!button) return;
        this.configurationSection = button.dataset.configSection;
        byId('configurationSearch').value = '';
        this.renderConfiguration();
      });
      byId('globalSearch').addEventListener('input', event => this.globalSearch(event.target.value));
      byId('importIntimationButton').addEventListener('click', () => byId('jsonImportInput').click());
      byId('jsonImportInput').addEventListener('change', event => this.importJson(event.target.files[0]));
      byId('exportAuditButton').addEventListener('click', () => this.exportJson(Store.state.audit, `jurisflow-auditoria-${isoDate()}.json`));
      byId('configureCalendarButton').addEventListener('click', () => this.openGuideModal('calendar'));
      byId('certificateGuideButton').addEventListener('click', () => this.openJudicialSetup());
      byId('judicialSetupClose').addEventListener('click', () => this.closeJudicialSetup());
      byId('judicialSetupBackdrop').addEventListener('click', event => { if (event.target === byId('judicialSetupBackdrop')) this.closeJudicialSetup(); });
      byId('certificateFileInput').addEventListener('change', event => { byId('certificateFileName').textContent = event.target.files[0]?.name || 'Selecionar certificado'; });
      byId('certificateSetupForm').addEventListener('submit', event => this.saveCertificate(event));
      byId('portalQrInput').addEventListener('change', event => this.readPortalQr(event.target.files[0]));
      byId('portalTotpForm').addEventListener('submit', event => this.savePortalTotp(event));
      byId('removePortalTotpButton').addEventListener('click', () => this.removePortalTotp());
      byId('resetJudicialConnectionsButton').addEventListener('click', () => this.resetJudicialConnections());
      byId('savePortalCoverageButton').addEventListener('click', () => this.savePortalCoverage());
      byId('launchPortalLoginButton').addEventListener('click', () => this.launchPortalLogin());
      byId('forgetTrustedDeviceButton').addEventListener('click', () => this.forgetTrustedDevice());
      byId('portalCoverageList').addEventListener('click', event => {
        const button = event.target.closest('[data-configure-totp]'); if (!button) return;
        byId('totpPortalSelect').value = button.dataset.configureTotp;
        byId('totpSetupSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
        byId('portalQrInput').focus();
      });
      byId('kanbanFilterButton').addEventListener('click', event => { event.currentTarget.classList.toggle('active'); this.toast('Filtro pessoal aplicado ao quadro.', 'success'); });
      byId('quickDocGenButton')?.addEventListener('click', () => this.openDocumentGenerator());
      byId('btnGenDocProcess')?.addEventListener('click', () => this.openDocumentGenerator({ type: 'contrato_honorarios' }));
      byId('btnGenDocContact')?.addEventListener('click', () => this.openDocumentGenerator({ type: 'procuracao' }));
      byId('docGenClose')?.addEventListener('click', () => this.closeDocumentGenerator());
      byId('docGenCancel')?.addEventListener('click', () => this.closeDocumentGenerator());
      byId('docGeneratorBackdrop')?.addEventListener('click', event => { if (event.target === byId('docGeneratorBackdrop')) this.closeDocumentGenerator(); });
      byId('docGenTypeSelect')?.addEventListener('change', () => this.updateDocPreview());
      byId('docGenContactSelect')?.addEventListener('change', () => this.updateDocPreview());
      byId('docGenProcessSelect')?.addEventListener('change', () => this.updateDocPreview());
      byId('docGenCopyButton')?.addEventListener('click', () => this.copyDocToClipboard());
      byId('docGenDownloadButton')?.addEventListener('click', () => this.downloadDoc());
      document.querySelectorAll('th[data-sort-table]').forEach(th => {
        th.addEventListener('click', () => {
          const table = th.dataset.sortTable;
          const field = th.dataset.sortField;
          if (table === 'process') {
            if (this.processSort.field === field) {
              this.processSort.direction = this.processSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
              this.processSort.field = field;
              this.processSort.direction = field.includes('At') || field.includes('date') ? 'desc' : 'asc';
            }
            this.renderProcesses(byId('processSearch')?.value || '');
          } else if (table === 'contact') {
            if (this.contactSort.field === field) {
              this.contactSort.direction = this.contactSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
              this.contactSort.field = field;
              this.contactSort.direction = field.includes('At') || field.includes('date') ? 'desc' : 'asc';
            }
            this.renderContacts(byId('contactSearch')?.value || '');
          }
        });
      });
      byId('agendaFilterTabs')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-agenda-filter]');
        if (!button) return;
        this.agendaTypeFilter = button.dataset.agendaFilter;
        byId('agendaFilterTabs').querySelectorAll('button').forEach(btn => btn.classList.toggle('active', btn === button));
        this.renderAgenda();
      });
      byId('agendaTodayButton')?.addEventListener('click', () => {
        this.agendaSelectedDate = isoDate();
        this.agendaCalendarMonthOffset = 0;
        this.renderAgenda();
        this.toast('Exibindo atividades de hoje.', 'success');
      });
      byId('agendaAllUpcomingButton')?.addEventListener('click', () => {
        this.agendaSelectedDate = null;
        this.renderAgenda();
        this.toast('Exibindo todas as atividades próximas.', 'success');
      });
    },
    switchView(view) {
      this.currentView = view;
      document.querySelectorAll('.view').forEach(element => element.classList.toggle('active', element.id === `view-${view}`));
      document.querySelectorAll('.nav-item[data-view]').forEach(element => element.classList.toggle('active', element.dataset.view === view));
      const section = document.getElementById(`view-${view}`);
      if (section) {
        document.getElementById('viewTitle').textContent = section.dataset.title;
        document.getElementById('viewEyebrow').textContent = section.dataset.eyebrow;
      }
      document.getElementById('sidebar').classList.remove('open');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    renderAll() {
      ['renderMetrics', 'renderPriorities', 'renderActivity', 'renderSources', 'renderInbox', 'renderKanban', 'renderProcesses', 'renderContacts', 'renderAgenda', 'renderMonitoring', 'renderConfiguration', 'renderAudit'].forEach(method => {
        try { this[method](); } catch (error) { console.error(`Falha em ${method}:`, error); }
      });
    },
    renderMetrics() {
      const newIntimations = Store.state.intimations.filter(item => item.status === 'nova').length;
      const deadlines = Store.state.tasks.filter(task => !TERMINAL_STATUSES.includes(task.status) && daysUntil(task.deadline) >= 0 && daysUntil(task.deadline) <= 7).length;
      const activeTasks = Store.state.tasks.filter(task => !TERMINAL_STATUSES.includes(task.status)).length;
      const activeSources = Store.state.sources.filter(source => source.status === 'ok').length;
      document.getElementById('metricInbox').textContent = newIntimations;
      document.getElementById('metricDeadlines').textContent = deadlines;
      document.getElementById('metricTasks').textContent = activeTasks;
      document.getElementById('metricSources').textContent = `${activeSources}/${Store.state.sources.length}`;
      document.getElementById('inboxBadge').textContent = newIntimations;
      document.getElementById('notificationDot').style.display = newIntimations ? '' : 'none';
      document.getElementById('heroSummary').textContent = newIntimations || deadlines
        ? `${newIntimations} intimação(ões) nova(s) e ${deadlines} prazo(s) nos próximos sete dias precisam de conferência.`
        : 'Nenhuma ocorrência urgente foi identificada nas fontes ativas.';
    },
    renderPriorities() {
      const tasks = Store.state.tasks
        .filter(task => !TERMINAL_STATUSES.includes(task.status))
        .sort((a, b) => (daysUntil(a.deadline) - daysUntil(b.deadline)) || (a.priority === 'urgente' ? -1 : 1))
        .slice(0, 4);
      document.getElementById('priorityList').innerHTML = tasks.length ? tasks.map((task, index) => `
        <button class="priority-item" data-task-id="${escapeHtml(task.id)}">
          <span class="priority-number">${index + 1}</span>
          <div><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.client || task.process || 'Tarefa interna')} · ${formatDate(task.deadline)}</small></div>
          <span class="priority-status" style="background:${task.priority === 'urgente' ? 'var(--danger)' : task.status === 'revisao' ? 'var(--warning)' : 'var(--gold)'}"></span>
        </button>`).join('') : '<div class="empty-column">Nenhuma prioridade para hoje.</div>';
      document.querySelectorAll('#priorityList [data-task-id]').forEach(button => button.addEventListener('click', () => {
        const task = Store.state.tasks.find(item => item.id === button.dataset.taskId); if (task) this.openTaskModal(task);
      }));
    },
    renderActivity() {
      document.getElementById('activityTimeline').innerHTML = Store.state.audit.slice(0, 5).map(item => `
        <div class="timeline-item" data-view-link="audit" tabindex="0"><span class="timeline-marker"></span><div class="timeline-copy"><strong>${escapeHtml(item.action)}</strong><span>${escapeHtml(item.detail)}</span></div><time class="timeline-time">${formatDateTime(item.at)}</time></div>`).join('');
    },
    renderSources() {
      document.getElementById('sourceSummary').innerHTML = Store.state.sources.slice(0, 5).map(source => `
        <div class="source-summary-item" data-view-link="monitoring" tabindex="0"><span class="source-mark">${escapeHtml(source.short)}</span><div><strong>${escapeHtml(source.name)}</strong><small>${escapeHtml(source.detail)}</small></div><span class="health-dot ${source.status === 'ok' ? 'ok' : source.status === 'attention' ? 'attention' : 'off'}"></span></div>`).join('');
    },
    filteredIntimations() {
      const filter = this.inboxFilter;
      return Store.state.intimations.filter(item => filter === 'all' || item.status === filter);
    },
    intimationParties(item) {
      const process = Store.state.processes.find(record => record.number === item.process);
      const direct = String(item.client || '').trim();
      if (direct && !/^(?:cliente|partes?) (?:não|nao) identificad/i.test(direct)) return direct;
      return [process?.client, process?.opposingParty].map(value => String(value || '').trim()).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(' × ');
    },
    renderInbox() {
      const items = this.filteredIntimations();
      document.getElementById('inboxList').innerHTML = items.length ? items.map(item => {
        const act = classifyIntimationAct(item.text, item.title, item.type);
        return `
        <button class="inbox-row ${this.selectedIntimation === item.id ? 'active' : ''}" data-intimation-id="${escapeHtml(item.id)}">
          <span class="inbox-primary"><i class="unread-dot ${item.unread ? '' : 'read'}"></i><span><strong>${escapeHtml(item.title)}</strong><small class="inbox-case-line"><b>${escapeHtml(item.process || 'Sem processo vinculado')}</b>${this.intimationParties(item) ? `<em>· ${escapeHtml(this.intimationParties(item))}</em>` : '<em>· Partes ainda não identificadas</em>'}</small></span></span>
          <span class="source-label"><span class="act-chip ${act.css}">${escapeHtml(act.label)}</span></span><span class="date-label">${formatDate(item.publishedAt)}</span><span>${this.statusChip(item.status)}</span>
        </button>`;
      }).join('') : '<div class="empty-detail"><span>✓</span><h3>Nenhuma ocorrência</h3><p>Não há intimações neste filtro.</p></div>';
      document.querySelectorAll('[data-intimation-id]').forEach(button => button.addEventListener('click', () => this.selectIntimation(button.dataset.intimationId)));
      if (this.selectedIntimation) this.renderIntimationDetail();
    },
    statusChip(status) {
      const labels = { nova: 'Nova', triagem: 'Em triagem', prazo: 'Prazo conferido', tarefa: 'Tarefa criada', arquivada: 'Arquivada' };
      const classes = { nova: 'warning', triagem: 'planned', prazo: 'connected', tarefa: 'connected', arquivada: 'muted' };
      return `<span class="status-chip ${classes[status] || 'muted'}">${labels[status] || escapeHtml(status)}</span>`;
    },
    selectIntimation(id) {
      this.selectedIntimation = id;
      const item = Store.state.intimations.find(record => record.id === id);
      if (item) { item.unread = false; Store.save(); }
      this.renderInbox(); this.renderMetrics();
    },
    renderIntimationDetail() {
      const item = Store.state.intimations.find(record => record.id === this.selectedIntimation);
      const container = document.getElementById('intimationDetail');
      if (!item) return;
      const act = classifyIntimationAct(item.text, item.title, item.type);
      container.innerHTML = `
        <div class="detail-header"><div style="display:flex;gap:8px;align-items:center;">${this.statusChip(item.status)}<span class="act-chip ${act.css}">${escapeHtml(act.label)}</span></div><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.court || 'Origem judicial não informada')}</p></div>
        <div class="detail-meta"><div><small>Processo</small><strong>${escapeHtml(item.process || 'Não identificado')}</strong></div><div><small>Partes</small><strong>${escapeHtml(this.intimationParties(item) || 'Ainda não identificadas')}</strong></div><div><small>Publicação</small><strong>${formatDate(item.publishedAt)}</strong></div><div><small>Ato estimado</small><strong>${escapeHtml(act.category)} (${act.days}d)</strong></div></div>
        <p class="eyebrow">Texto original preservado</p><div class="original-text">${escapeHtml(item.text || 'Sem texto original.')}</div>
        <div class="detail-actions">
          <button class="button ghost" data-detail-action="edit">Editar dados</button>
          <button class="button ghost" data-detail-action="triagem">Marcar em triagem</button>
          <button class="button ghost" data-detail-action="prazo">Confirmar triagem</button>
          <button class="button gold" data-detail-action="task">Criar tarefa (${act.days}d)</button>
        </div>`;
      container.querySelectorAll('[data-detail-action]').forEach(button => button.addEventListener('click', () => this.handleIntimationAction(item, button.dataset.detailAction)));
    },
    handleIntimationAction(item, action) {
      if (action === 'edit') { this.openIntimationModal(item); return; }
      if (action === 'task') {
        const act = classifyIntimationAct(item.text, item.title, item.type);
        const suggestedDeadline = addDays(item.publishedAt || isoDate(), act.days);
        this.openTaskModal({
          title: `Analisar ${act.category}: ${item.title}`,
          description: item.text,
          process: item.process,
          client: item.client,
          source: item.source || 'DJEN',
          intimationId: item.id,
          deadline: suggestedDeadline,
          priority: act.priority || 'normal',
          status: 'triagem'
        });
        return;
      }
      item.status = action;
      Store.audit(action === 'prazo' ? 'Triagem confirmada' : 'Intimação colocada em triagem', `${item.title} · ${item.process || 'sem processo'}`);
      this.renderAll(); this.renderIntimationDetail();
    },
    renderKanban() {
      const board = document.getElementById('kanbanBoard');
      board.innerHTML = KANBAN_COLUMNS.map(column => {
        const tasks = Store.state.tasks.filter(task => task.status === column.id);
        return `<section class="kanban-column" data-column="${column.id}"><header class="column-header"><div class="column-title"><i class="column-dot" style="background:${column.color}"></i>${escapeHtml(column.title)}<span class="column-count">${tasks.length}</span></div><span>···</span></header><div class="column-cards">${tasks.length ? tasks.map(task => this.taskCard(task)).join('') : '<div class="empty-column">Arraste tarefas para cá</div>'}</div></section>`;
      }).join('');
      board.querySelectorAll('.task-card').forEach(card => {
        card.addEventListener('dragstart', () => { card.classList.add('dragging'); card.dataset.dragging = 'true'; });
        card.addEventListener('dragend', () => { card.classList.remove('dragging'); delete card.dataset.dragging; });
        card.addEventListener('click', () => { const task = Store.state.tasks.find(item => item.id === card.dataset.taskId); if (task) this.openTaskModal(task); });
      });
      board.querySelectorAll('.kanban-column').forEach(column => {
        column.addEventListener('dragover', event => { event.preventDefault(); column.classList.add('drag-over'); });
        column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
        column.addEventListener('drop', event => {
          event.preventDefault(); column.classList.remove('drag-over');
          const dragged = board.querySelector('.task-card[data-dragging="true"]');
          if (dragged) this.moveTask(dragged.dataset.taskId, column.dataset.column);
        });
      });
    },
    taskCard(task) {
      const overdue = daysUntil(task.deadline) < 0 && task.status !== 'concluida';
      const timeMins = totalTimeMinutes(task.timeLogs);
      const timeBadge = timeMins > 0 ? `<span class="task-timelog" title="Tempo total registrado na tarefa">⏱ ${formatMinutes(timeMins)}</span>` : '';
      return `<article class="task-card" draggable="true" data-task-id="${escapeHtml(task.id)}"><div class="task-top"><span class="task-source">${escapeHtml(task.source || 'INTERNA')}</span><span>${Number(task.points) ? `<b class="task-points">${Number(task.points)} pts</b>` : ''}${timeBadge}${task.priority === 'urgente' ? '<span class="task-priority" title="Urgente">!</span>' : ''}</span></div><h4>${escapeHtml(task.title)}</h4><p>${escapeHtml(task.description || 'Sem descrição')}</p><div class="task-tags">${task.client ? `<span>${escapeHtml(task.client)}</span>` : ''}${task.process ? `<span>${escapeHtml(task.process)}</span>` : ''}</div>${task.fatalDeadline ? `<div class="fatal-date">Prazo fatal: ${formatDate(task.fatalDeadline)}</div>` : ''}<footer class="task-footer"><span class="task-date ${overdue ? 'overdue' : ''}">${overdue ? 'Atrasada · ' : ''}${formatDate(task.deadline)}</span><span class="task-avatar">${escapeHtml(this.initials(task.responsible || 'Ricardo'))}</span></footer></article>`;
    },
    moveTask(taskId, status) {
      const task = Store.state.tasks.find(item => item.id === taskId); if (!task || task.status === status) return;
      const previous = task.status; task.status = status; task.updatedAt = new Date().toISOString();
      Store.audit('Tarefa movimentada', `${task.title}: ${previous} → ${status}`);
      this.renderAll(); this.toast('Tarefa movimentada com sucesso.', 'success');
    },
    renderProcesses(query = '') {
      const needle = normalizeText(query);
      let records = Store.state.processes.filter(item => !needle || normalizeText(`${item.number} ${item.client} ${item.court} ${item.county || ''} ${item.feeType || ''} ${item.registeredAt || item.createdAt || ''}`).includes(needle));
      records = sortRecords(records, this.processSort);
      updateTableSortHeaders('processTable', this.processSort);
      document.getElementById('processTableBody').innerHTML = records.length ? records.map(item => {
        const regDate = item.registeredAt || item.createdAt;
        const feeLabel = item.feePercentage ? `${item.feePercentage}% êxito` : item.feeAmount ? `R$ ${Number(item.feeAmount).toLocaleString('pt-BR')}` : item.feeType ? item.feeType.toUpperCase() : '';
        const feeStatusClass = item.feeStatus === 'quitado' || item.feeStatus === 'em_dia' ? 'fee-status-paid' : item.feeStatus === 'pendente' ? 'fee-status-pending' : 'fee-status-waiting';
        const feeBadge = item.feeType ? `<span class="fee-chip ${escapeHtml(item.feeType)}">${escapeHtml(feeLabel)}<span class="fee-status-badge ${feeStatusClass}">${escapeHtml(item.feeStatus || 'regular')}</span></span>` : '';
        return `
        <tr data-process-id="${escapeHtml(item.id)}" tabindex="0">
          <td><strong>${escapeHtml(item.number || item.protocol || 'Sem número')}</strong><small>${item.secrecy ? 'Segredo de justiça' : 'Consulta pública'}${item.caseFolder ? ` · ${escapeHtml(item.caseFolder)}` : ''}</small></td>
          <td><strong>${escapeHtml(item.client)}</strong>${feeBadge ? `<br>${feeBadge}` : ''}</td>
          <td><strong>${escapeHtml(item.court || item.county || '—')}</strong><small>${escapeHtml([item.actionType, item.stage].filter(Boolean).join(' · '))}</small></td>
          <td><strong>${formatDate(regDate)}</strong><small>${escapeHtml(item.source || 'ADVBOX')}</small></td>
          <td><strong>${escapeHtml(item.lastMovement || 'Sem movimentação')}</strong><small>${formatDate(item.lastMovementAt)}</small></td>
          <td>${item.monitoring === 'active' ? '<span class="status-chip connected">Monitorando</span>' : '<span class="status-chip warning">Atenção</span>'}</td>
        </tr>`;
      }).join('') : '<tr><td colspan="6">Nenhum processo encontrado.</td></tr>';
      document.querySelectorAll('#processTableBody [data-process-id]').forEach(row => row.addEventListener('click', () => {
        const item = Store.state.processes.find(record => record.id === row.dataset.processId); if (item) this.openProcessModal(item);
      }));
    },
    renderContacts(query = '') {
      const needle = normalizeText(query);
      let records = Store.state.contacts.filter(item => !needle || normalizeText(`${item.name} ${item.document} ${item.mobile} ${item.phone} ${item.email} ${item.origin} ${item.city || ''} ${item.registeredAt || item.createdAt || ''}`).includes(needle));
      records = sortRecords(records, this.contactSort);
      updateTableSortHeaders('contactTable', this.contactSort);
      document.getElementById('contactCount').textContent = `${Store.state.contacts.length} contatos`;
      document.getElementById('contactTableBody').innerHTML = records.length ? records.map(item => {
        const regDate = item.registeredAt || item.createdAt;
        return `
        <tr data-contact-id="${escapeHtml(item.id)}" tabindex="0">
          <td><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.profession || 'Pessoa cadastrada')}</small></td>
          <td><strong>${escapeHtml(item.document || '—')}</strong><small>${escapeHtml(item.rg || '')}</small></td>
          <td><strong>${escapeHtml(item.mobile || item.phone || '—')}</strong><small>${escapeHtml(item.email || '')}</small></td>
          <td><strong>${escapeHtml(item.city || '—')}</strong><small>${escapeHtml([item.state, item.country].filter(Boolean).join(' · '))}</small></td>
          <td><strong>${formatDate(regDate)}</strong><small>${item.externalId ? `ID ${escapeHtml(item.externalId)}` : 'Manual'}</small></td>
          <td>${escapeHtml(item.origin || 'Não informada')}</td>
        </tr>`;
      }).join('') : '<tr><td colspan="6">Nenhum contato encontrado.</td></tr>';
      document.querySelectorAll('#contactTableBody [data-contact-id]').forEach(row => row.addEventListener('click', () => {
        const item = Store.state.contacts.find(record => record.id === row.dataset.contactId); if (item) this.openContactModal(item);
      }));
    },
    renderConfiguration(query = '') {
      const config = Store.state.configuration || {};
      const sections = [
        ['taskDefinitions', 'Tarefas'], ['users', 'Usuários'], ['actionGroups', 'Grupos'], ['actionTypes', 'Tipos de ação'], ['stages', 'Etapas'], ['origins', 'Origens'], ['goals', 'Metas'], ['inboxSections', 'Caixa de entrada'], ['notificationAssignments', 'Notificações'], ['integrations', 'Integrações']
      ];
      document.getElementById('configurationTabs').innerHTML = sections.map(([key, label]) => `<button class="${this.configurationSection === key ? 'active' : ''}" data-config-section="${key}">${label}</button>`).join('');
      document.getElementById('configurationMetrics').innerHTML = [
        ['Definições de tarefa', config.taskDefinitions?.length || 0], ['Tipos de ação', config.actionTypes?.length || 0], ['Etapas', config.stages?.length || 0], ['Usuários', config.users?.length || 0], ['Contatos importados', Store.state.contacts.length]
      ].map(([label, count]) => `<div class="configuration-metric"><strong>${count}</strong><span>${label}</span></div>`).join('');
      const label = sections.find(([key]) => key === this.configurationSection)?.[1] || 'Configuração';
      const raw = Array.isArray(config[this.configurationSection]) ? config[this.configurationSection] : [];
      const needle = normalizeText(query); const records = raw.map((item, index) => ({ item, index })).filter(({ item }) => !needle || normalizeText(typeof item === 'string' ? item : Object.values(item || {}).flat().join(' ')).includes(needle));
      document.getElementById('configurationHeading').textContent = label;
      document.getElementById('configurationCount').textContent = `${records.length} itens`;
      document.getElementById('configurationList').innerHTML = records.length ? records.map(({ item, index }) => this.configurationRow(item, index)).join('') : '<div class="empty-detail"><span>✓</span><h3>Nenhum item</h3><p>Não há registros nesta seção ou neste filtro.</p></div>';
      document.querySelectorAll('#configurationList [data-config-index]').forEach(row => row.addEventListener('click', () => {
        const index = Number(row.dataset.configIndex); const item = raw[index]; if (item !== undefined) this.openConfigurationModal(item, index);
      }));
    },
    configurationRow(item, index) {
      if (typeof item === 'string') return `<button class="configuration-row" data-config-index="${index}"><strong>${escapeHtml(item)}</strong><span>Seção da caixa de entrada</span><small>Ativa · clique para editar</small></button>`;
      if (!item || typeof item !== 'object') return '';
      const primary = item.name || item.event || item.group || 'Configuração';
      const secondary = item.role || item.phase || item.group || item.publicationResponsible || item.method || (item.responsibles || []).join(', ') || item.status || '—';
      const meta = Number.isFinite(item.points) ? `<span class="config-points">${item.points} pontos</span>` : item.monthlyClosings == null && 'monthlyClosings' in item ? '<small>Meta não definida</small>' : `<small>${escapeHtml(item.registeredAt || item.status || 'Ativo')}</small>`;
      return `<button class="configuration-row" data-config-index="${index}"><strong>${escapeHtml(primary)}</strong><span>${escapeHtml(secondary)}</span>${meta}</button>`;
    },
    openIntimationDetailModal(item) {
      if (!item) return;
      const act = classifyIntimationAct(item.text, item.title, item.type);
      const suggestedDeadline = addDays(item.publishedAt || isoDate(), act.days);
      const parties = this.intimationParties(item) || 'Partes ainda não identificadas';
      this.openModal('intimationDetail', 'Detalhes da intimação', 'Análise processual DJEN / Diário', [
        { name: 'title', label: 'Título do ato publicado', value: item.title, full: true },
        { name: 'process', label: 'Número do processo CNJ', value: item.process || 'Não identificado' },
        { name: 'parties', label: 'Partes vinculadas', value: parties },
        { name: 'court', label: 'Tribunal / Unidade judiciária', value: item.court || 'Não informado' },
        { name: 'publishedAt', label: 'Data da publicação', value: formatDate(item.publishedAt) },
        { name: 'actInfo', label: 'Classificação do ato e prazo sugerido', value: `${act.category.toUpperCase()} (${act.label}) — Prazo estimado: ${act.days} dias úteis (Vencimento sugerido: ${formatDate(suggestedDeadline)})`, full: true },
        { name: 'text', label: 'Teor integral da publicação', type: 'textarea', full: true, value: item.text || 'Sem texto original.' }
      ], { ...item, suggestedDeadline, _act: act });
      const submitButton = document.querySelector('#modalForm footer .button.gold');
      if (submitButton) submitButton.textContent = `Criar tarefa no Kanban (${act.days}d)`;
    },
    renderAgenda() {
      const selected = this.agendaSelectedDate;
      const typeFilter = this.agendaTypeFilter || 'all';

      // 1. Coletar eventos da agenda
      let events = Store.state.agenda.map(e => ({
        type: 'event',
        id: e.id,
        date: e.date,
        time: e.time || 'Dia inteiro',
        title: e.title,
        subtitle: `${e.client || e.process || 'Compromisso interno'}${e.location ? ` · ${e.location}` : ''}`,
        source: e.source || 'Interna',
        raw: e
      }));

      // 2. Coletar tarefas e prazos
      let tasks = Store.state.tasks.map(t => {
        const isFatal = Boolean(t.fatalDeadline);
        const targetDate = t.fatalDeadline || t.deadline;
        const timeMins = totalTimeMinutes(t.timeLogs);
        return {
          type: 'task',
          id: t.id,
          date: targetDate,
          time: isFatal ? 'Prazo fatal' : (t.time || 'Prazo interno'),
          title: t.title,
          subtitle: `${t.process ? `${t.process} · ` : ''}${t.client || 'Tarefa interna'}${t.points ? ` · ${t.points} pts` : ''}`,
          isFatal,
          status: t.status,
          timeMins,
          source: isFatal ? 'Fatal' : 'Tarefa',
          raw: t
        };
      });

      // 3. Coletar intimações publicadas
      let intimations = Store.state.intimations.map(i => {
        const act = classifyIntimationAct(i.text, i.title, i.type);
        const targetDate = i.publishedAt || (i.createdAt ? i.createdAt.slice(0, 10) : isoDate());
        return {
          type: 'intimation',
          id: i.id,
          date: targetDate,
          time: `${act.days}d prazo`,
          title: i.title,
          subtitle: `${i.process || 'Sem processo'} · ${this.intimationParties(i) || 'Partes não vinculadas'}`,
          act,
          source: 'Intimação',
          raw: i
        };
      });

      // Filtrar por data
      let allActivities = [];
      if (selected) {
        events = events.filter(e => e.date === selected);
        tasks = tasks.filter(t => t.date === selected);
        intimations = intimations.filter(i => i.date === selected);
      } else {
        const today = isoDate();
        events = events.filter(e => !e.date || e.date >= today);
        tasks = tasks.filter(t => !t.date || t.date >= today);
        intimations = intimations.filter(i => !i.date || i.date >= today);
      }

      // Aplicar filtro de tipo
      if (typeFilter === 'event') allActivities = [...events];
      else if (typeFilter === 'task') allActivities = [...tasks];
      else if (typeFilter === 'intimation') allActivities = [...intimations];
      else allActivities = [...events, ...tasks, ...intimations];

      // Ordenar cronologicamente
      allActivities.sort((a, b) => `${a.date || ''} ${a.time || ''}`.localeCompare(`${b.date || ''} ${b.time || ''}`));

      // Atualizar cabeçalho
      const titleEl = document.getElementById('agendaDayTitle');
      const eyebrowEl = document.getElementById('agendaDayEyebrow');
      const badgesEl = document.getElementById('agendaDayBadges');
      if (titleEl && eyebrowEl) {
        if (selected) {
          eyebrowEl.textContent = selected === isoDate() ? 'Atividades de Hoje' : 'Atividades da Data Selecionada';
          titleEl.textContent = formatDate(selected);
        } else {
          eyebrowEl.textContent = 'Agenda Integrada';
          titleEl.textContent = 'Próximas atividades e prazos';
        }
      }
      if (badgesEl) {
        badgesEl.innerHTML = `
          <span class="status-chip planned">${events.length} evento(s)</span>
          <span class="status-chip connected">${tasks.length} prazo(s)/tarefa(s)</span>
          <span class="status-chip warning">${intimations.length} intimação(ões)</span>
        `;
      }

      // Renderizar lista
      const listEl = document.getElementById('agendaList');
      if (listEl) {
        listEl.innerHTML = allActivities.length ? allActivities.map(item => {
          const date = item.date ? new Date(`${item.date}T12:00:00`) : new Date();
          const validDate = !Number.isNaN(date.getTime());
          const dayNum = validDate ? String(date.getDate()).padStart(2, '0') : '—';
          const monthShort = validDate ? new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '') : '';

          let typeClass = '';
          let chipHtml = '';
          if (item.type === 'event') {
            typeClass = '';
            chipHtml = `<span class="status-chip ${item.source === 'ADVBOX' ? 'planned' : 'muted'}">${escapeHtml(item.source)}</span>`;
          } else if (item.type === 'task') {
            typeClass = item.isFatal ? 'fatal-type' : 'task-type';
            const timeBadge = item.timeMins > 0 ? `<span class="task-timelog">⏱ ${formatMinutes(item.timeMins)}</span>` : '';
            chipHtml = `<div style="display:flex;gap:5px;align-items:center;">${timeBadge}<span class="status-chip ${item.isFatal ? 'danger' : 'connected'}">${item.isFatal ? 'Prazo Fatal' : 'Tarefa'}</span></div>`;
          } else if (item.type === 'intimation') {
            typeClass = 'intimation-type';
            chipHtml = `<span class="act-chip ${item.act.css}">${escapeHtml(item.act.label)}</span>`;
          }

          return `
            <div class="agenda-item" data-agenda-activity-type="${item.type}" data-agenda-activity-id="${escapeHtml(item.id)}" tabindex="0">
              <div class="agenda-date ${typeClass}">
                <strong>${dayNum}</strong>
                <small>${monthShort}</small>
              </div>
              <div class="agenda-copy">
                <strong>${escapeHtml(item.title)}</strong>
                <small>${escapeHtml(item.subtitle)} · ${escapeHtml(item.time)}</small>
              </div>
              ${chipHtml}
            </div>
          `;
        }).join('') : `<div class="empty-detail"><span>□</span><h3>Nenhuma atividade</h3><p>${selected ? 'Não há eventos, tarefas ou intimações para esta data.' : 'Nenhuma atividade próxima encontrada.'}</p></div>`;

        listEl.querySelectorAll('[data-agenda-activity-type]').forEach(row => {
          row.addEventListener('click', () => {
            const type = row.dataset.agendaActivityType;
            const id = row.dataset.agendaActivityId;
            if (type === 'event') {
              const ev = Store.state.agenda.find(r => r.id === id);
              if (ev) this.openAgendaModal(ev);
            } else if (type === 'task') {
              const task = Store.state.tasks.find(r => r.id === id);
              if (task) this.openTaskModal(task);
            } else if (type === 'intimation') {
              const intimation = Store.state.intimations.find(r => r.id === id);
              if (intimation) this.openIntimationDetailModal(intimation);
            }
          });
        });
      }

      this.renderMiniCalendar();
    },
    renderMiniCalendar() {
      const offset = this.agendaCalendarMonthOffset || 0;
      const baseDate = new Date();
      baseDate.setDate(1);
      baseDate.setMonth(baseDate.getMonth() + offset);
      const year = baseDate.getFullYear();
      const month = baseDate.getMonth();
      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);

      const days = [];
      for (let index = 0; index < first.getDay(); index++) {
        days.push('<span class="calendar-day muted"></span>');
      }

      const agendaEvents = Store.state.agenda || [];
      const tasks = Store.state.tasks || [];
      const intimations = Store.state.intimations || [];

      for (let day = 1; day <= last.getDate(); day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const hasEvent = agendaEvents.some(e => e.date === dateStr);
        const hasTask = tasks.some(t => t.deadline === dateStr);
        const hasFatal = tasks.some(t => t.fatalDeadline === dateStr);
        const hasIntimation = intimations.some(i => i.publishedAt === dateStr || (i.createdAt && i.createdAt.slice(0, 10) === dateStr));

        const indicators = [];
        if (hasEvent) indicators.push('<i class="cal-dot event" title="Compromisso"></i>');
        if (hasFatal) indicators.push('<i class="cal-dot fatal" title="Prazo fatal"></i>');
        else if (hasTask) indicators.push('<i class="cal-dot task" title="Tarefa/prazo"></i>');
        if (hasIntimation) indicators.push('<i class="cal-dot intimation" title="Intimação"></i>');

        const isToday = dateStr === isoDate();
        const isSelected = dateStr === this.agendaSelectedDate;

        days.push(`
          <button class="calendar-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-cal-date="${dateStr}">
            <span>${day}</span>
            <span class="cal-indicators">${indicators.join('')}</span>
          </button>
        `);
      }

      const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(baseDate);
      const calEl = document.getElementById('miniCalendar');
      if (calEl) {
        calEl.innerHTML = `
          <header class="calendar-header">
            <h3>${monthName}</h3>
            <div class="calendar-nav">
              <button id="calPrevMonth" title="Mês anterior">◀</button>
              <button id="calNextMonth" title="Próximo mês">▶</button>
            </div>
          </header>
          <div class="calendar-grid">
            ${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => `<span class="calendar-weekday">${d}</span>`).join('')}
            ${days.join('')}
          </div>
        `;

        calEl.querySelector('#calPrevMonth')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.agendaCalendarMonthOffset = (this.agendaCalendarMonthOffset || 0) - 1;
          this.renderMiniCalendar();
        });
        calEl.querySelector('#calNextMonth')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.agendaCalendarMonthOffset = (this.agendaCalendarMonthOffset || 0) + 1;
          this.renderMiniCalendar();
        });
        calEl.querySelectorAll('.calendar-day[data-cal-date]').forEach(btn => {
          btn.addEventListener('click', () => {
            const clickedDate = btn.dataset.calDate;
            if (this.agendaSelectedDate === clickedDate) {
              this.agendaSelectedDate = null;
            } else {
              this.agendaSelectedDate = clickedDate;
            }
            this.renderAgenda();
          });
        });
      }
    },
    renderMonitoring() {
      const issues = Store.state.sources.filter(source => ['attention', 'error'].includes(source.status)).length;
      document.getElementById('termSourceCount').textContent = Store.state.sources.length;
      document.getElementById('termIssueCount').textContent = issues;
      document.getElementById('termNewCount').textContent = Store.state.intimations.filter(item => item.status === 'nova').length;
      document.getElementById('monitorSourceList').innerHTML = Store.state.sources.map(source => `
        <div class="source-row" data-source-id="${escapeHtml(source.id)}" tabindex="0"><div class="source-name"><span class="source-mark">${escapeHtml(source.short)}</span><div><strong>${escapeHtml(source.name)}</strong><small>${escapeHtml(source.detail)}</small></div></div><span class="source-method">${escapeHtml(source.method)}</span><span class="source-check">${source.lastCheck ? formatDateTime(source.lastCheck) : 'Ainda não verificada'}</span><span>${source.status === 'ok' ? '<span class="status-chip connected">Ativo</span>' : source.status === 'attention' ? '<span class="status-chip warning">Atenção</span>' : source.status === 'error' ? '<span class="status-chip danger">Falha</span>' : source.status === 'planned' ? '<span class="status-chip planned">Preparado</span>' : '<span class="status-chip muted">Desativado</span>'}</span><span class="row-menu" aria-hidden="true">···</span></div>`).join('');
      document.querySelectorAll('#monitorSourceList [data-source-id]').forEach(row => row.addEventListener('click', () => {
        const source = Store.state.sources.find(item => item.id === row.dataset.sourceId); if (source) this.openSourceModal(source);
      }));
    },
    renderAudit() {
      document.getElementById('auditList').innerHTML = Store.state.audit.map(item => `<div class="audit-item"><time>${formatDateTime(item.at)}</time><div><strong>${escapeHtml(item.action)}</strong><small>${escapeHtml(item.detail)}</small></div><small>${escapeHtml(item.actor)}</small></div>`).join('');
    },
    initials(value) { return String(value).trim().split(/\s+/).slice(0,2).map(part => part[0]).join('').toUpperCase(); },
    globalSearch(query) {
      if (!query.trim()) return;
      const needle = normalizeText(query);
      const processMatch = Store.state.processes.some(item => normalizeText(`${item.number} ${item.client}`).includes(needle));
      const contactMatch = Store.state.contacts.some(item => normalizeText(`${item.name} ${item.document} ${item.email}`).includes(needle));
      const taskMatch = Store.state.tasks.some(item => normalizeText(`${item.title} ${item.client} ${item.process}`).includes(needle));
      const intimationMatch = Store.state.intimations.some(item => normalizeText(`${item.title} ${item.client} ${item.process}`).includes(needle));
      if (processMatch) { this.switchView('processes'); document.getElementById('processSearch').value = query; this.renderProcesses(query); }
      else if (contactMatch) { this.switchView('contacts'); document.getElementById('contactSearch').value = query; this.renderContacts(query); }
      else if (intimationMatch) this.switchView('inbox');
      else if (taskMatch) this.switchView('kanban');
    },
    openModal(mode, title, eyebrow, fields, defaults = {}) {
      this.modalMode = { mode, defaults };
      document.getElementById('modalTitle').textContent = title;
      document.getElementById('modalEyebrow').textContent = eyebrow;
      document.getElementById('modalFields').innerHTML = `<div class="form-grid">${fields.map(field => {
        const value = defaults[field.name] ?? field.value ?? '';
        if (field.type === 'textarea') return `<div class="field ${field.full ? 'full' : ''}"><label for="field-${field.name}">${field.label}</label><textarea id="field-${field.name}" name="${field.name}" ${field.required ? 'required' : ''}>${escapeHtml(value)}</textarea>${field.note ? `<small class="field-note">${field.note}</small>` : ''}</div>`;
        if (field.type === 'select') return `<div class="field ${field.full ? 'full' : ''}"><label for="field-${field.name}">${field.label}</label><select id="field-${field.name}" name="${field.name}">${field.options.map(option => `<option value="${escapeHtml(option.value)}" ${String(value) === String(option.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></div>`;
        return `<div class="field ${field.full ? 'full' : ''}"><label for="field-${field.name}">${field.label}</label><input id="field-${field.name}" name="${field.name}" type="${field.type || 'text'}" value="${escapeHtml(value)}" ${field.required ? 'required' : ''} ${field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : ''}>${field.note ? `<small class="field-note">${field.note}</small>` : ''}</div>`;
      }).join('')}</div>`;
      document.querySelector('#modalForm footer .button.gold').textContent = /^(Editar|Detalhes)/.test(title) ? 'Salvar alterações' : 'Salvar';
      document.getElementById('modalBackdrop').classList.remove('hidden');
      setTimeout(() => document.querySelector('#modalFields input, #modalFields textarea')?.focus(), 20);
    },
    closeModal() { document.getElementById('modalBackdrop').classList.add('hidden'); this.modalMode = null; document.getElementById('modalForm').reset(); },
    openTaskModal(defaults = {}) {
      const definitions = Store.state.configuration?.taskDefinitions || [];
      const totalTime = totalTimeMinutes(defaults.timeLogs);
      const timeNote = totalTime > 0 ? `Tempo total acumulado nesta tarefa: ${formatMinutes(totalTime)}.` : '';
      this.openModal('task', defaults.id ? 'Editar tarefa' : 'Nova tarefa', 'Fluxo interno', [
        { name: 'taskDefinition', label: 'Definição de tarefa', type: 'select', full: true, options: [{ value: '', label: 'Selecione uma definição ADVBOX' }, ...definitions.map(item => ({ value: item.name, label: `${item.name} (${item.points} pts)` }))] },
        { name: 'title', label: 'Título', required: true, full: true }, { name: 'client', label: 'Cliente' }, { name: 'process', label: 'Número do processo' },
        { name: 'actionType', label: 'Tipo de ação' }, { name: 'protocol', label: 'Protocolo' },
        { name: 'date', label: 'Data da atividade', type: 'date' }, { name: 'time', label: 'Horário', type: 'time' },
        { name: 'deadline', label: 'Prazo interno', type: 'date' }, { name: 'fatalDeadline', label: 'Prazo fatal', type: 'date', note: 'Sempre sujeito à conferência humana.' },
        { name: 'responsible', label: 'Responsável principal', value: 'Ricardo' }, { name: 'responsibles', label: 'Outros responsáveis', placeholder: 'Separe os nomes por vírgula' },
        { name: 'sender', label: 'Remetente / criador' }, { name: 'location', label: 'Local' }, { name: 'points', label: 'Pontuação', type: 'number', value: 0 },
        { name: 'addMinutes', label: 'Apontar tempo (minutos)', type: 'number', placeholder: 'Ex: 45', note: timeNote },
        { name: 'timeDescription', label: 'Atividade no apontamento', placeholder: 'Ex: Elaboração de petição inicial' },
        { name: 'status', label: 'Coluna', type: 'select', options: KANBAN_COLUMNS.map(column => ({ value: column.id, label: column.title })) },
        { name: 'priority', label: 'Prioridade', type: 'select', options: [{value:'normal',label:'Normal'},{value:'importante',label:'Importante'},{value:'urgente',label:'Urgente'}] },
        { name: 'description', label: 'Comentário / instruções', type: 'textarea', full: true, note: 'Nunca registre senha, QR code ou segredo do certificado neste campo.' }
      ], { status: 'triagem', priority: 'normal', source: 'Interna', ...defaults, taskDefinition: defaults.taskDefinition || (definitions.some(item => item.name === defaults.title) ? defaults.title : ''), responsibles: Array.isArray(defaults.responsibles) ? defaults.responsibles.join(', ') : (defaults.responsibles || '') });
      const selector = document.getElementById('field-taskDefinition');
      selector?.addEventListener('change', () => {
        const definition = definitions.find(item => item.name === selector.value); if (!definition) return;
        document.getElementById('field-title').value = definition.name;
        document.getElementById('field-points').value = definition.points;
      });
    },
    openIntimationModal(defaults = {}) {
      this.openModal('intimation', defaults.id ? 'Editar intimação' : 'Nova intimação', 'Registro judicial', [
        { name: 'title', label: 'Título / ato', required: true, full: true }, { name: 'process', label: 'Número do processo' }, { name: 'client', label: 'Cliente' },
        { name: 'court', label: 'Tribunal / órgão' }, { name: 'publishedAt', label: 'Data da publicação', type: 'date' },
        { name: 'source', label: 'Origem', type: 'select', options: [{value:'Manual',label:'Manual'},{value:'ADVBOX',label:'ADVBOX'},{value:'Legal One',label:'Legal One'},{value:'DJEN',label:'DJEN'}] },
        { name: 'text', label: 'Texto original', type: 'textarea', full: true, required: true }
      ], { publishedAt: isoDate(), source: 'Manual', ...defaults });
    },
    openProcessModal(defaults = {}) {
      this.openModal('process', defaults.id ? 'Detalhes do processo' : 'Cadastrar processo', 'Carteira processual', [
        { name: 'number', label: 'Número CNJ', full: true }, { name: 'client', label: 'Cliente', required: true }, { name: 'opposingParty', label: 'Parte contrária' },
        { name: 'actionGroup', label: 'Grupo de ação' }, { name: 'actionType', label: 'Tipo de ação' }, { name: 'judicialPhase', label: 'Fase judicial' }, { name: 'stage', label: 'Etapa' },
        { name: 'protocol', label: 'Protocolo' }, { name: 'originalProcess', label: 'Processo originário' }, { name: 'caseFolder', label: 'Pasta / caso' },
        { name: 'court', label: 'Tribunal / órgão' }, { name: 'county', label: 'Comarca' }, { name: 'courtUnit', label: 'Vara / unidade' },
        { name: 'responsible', label: 'Responsável' },
        { name: 'registeredAt', label: 'Data de cadastro do processo', type: 'date' },
        { name: 'lastMovementAt', label: 'Data do último andamento', type: 'date' },
        { name: 'lastMovement', label: 'Último andamento', type: 'textarea', full: true },
        { name: 'feeType', label: 'Tipo de honorários', type: 'select', options: [{value:'',label:'Não definido'},{value:'exito',label:'Êxito (Quota Litis %)'},{value:'fixo',label:'Fixo (Pró-labore)'},{value:'misto',label:'Misto (Fixo + Êxito)'},{value:'mensal',label:'Mensalidade (Partido)'},{value:'horas',label:'Cobrança por Hora'}] },
        { name: 'feePercentage', label: 'Percentual de êxito (%)', type: 'number', placeholder: 'Ex: 30' },
        { name: 'feeAmount', label: 'Valor fixo / total (R$)', type: 'number', placeholder: 'Ex: 5000' },
        { name: 'feeMonthly', label: 'Valor mensal (R$)', type: 'number', placeholder: 'Ex: 1500' },
        { name: 'feeStatus', label: 'Situação dos honorários', type: 'select', options: [{value:'em_dia',label:'Em dia / Regular'},{value:'aguardando_exito',label:'Aguardando êxito processual'},{value:'pendente',label:'Pendente / Cobrança'},{value:'quitado',label:'Quitado'}] },
        { name: 'feeNotes', label: 'Condições de pagamento e faturamento', type: 'textarea', full: true },
        { name: 'secrecy', label: 'Visibilidade', type: 'select', options: [{value:'false',label:'Consulta pública'},{value:'true',label:'Segredo de justiça'}] },
        { name: 'monitoring', label: 'Monitoramento', type: 'select', options: [{value:'active',label:'Monitorando'},{value:'attention',label:'Precisa de atenção'}] },
        { name: 'notes', label: 'Anotações gerais', type: 'textarea', full: true }
      ], { secrecy: false, monitoring: 'active', feeStatus: 'em_dia', registeredAt: defaults.registeredAt || (defaults.createdAt ? defaults.createdAt.slice(0, 10) : isoDate()), ...defaults, secrecy: String(Boolean(defaults.secrecy)) });
    },
    openContactModal(defaults = {}) {
      this.openModal('contact', defaults.id ? 'Detalhes do contato' : 'Novo contato', 'Cadastro de pessoas', [
        { name: 'name', label: 'Nome completo / razão social', required: true, full: true }, { name: 'document', label: 'CPF / CNPJ' }, { name: 'rg', label: 'RG' },
        { name: 'birthDate', label: 'Data de nascimento', type: 'date' }, { name: 'profession', label: 'Profissão' }, { name: 'maritalStatus', label: 'Estado civil' },
        { name: 'mobile', label: 'Celular' }, { name: 'phone', label: 'Telefone' }, { name: 'email', label: 'E-mail', type: 'email' },
        { name: 'origin', label: 'Origem' }, { name: 'city', label: 'Cidade' }, { name: 'state', label: 'Estado' },
        { name: 'address', label: 'Endereço', full: true }, { name: 'district', label: 'Bairro' }, { name: 'zip', label: 'CEP' },
        { name: 'notes', label: 'Anotações gerais', type: 'textarea', full: true }
      ], { source: 'Interna', ...defaults });
    },
    openAgendaModal(defaults = {}) {
      this.openModal('agenda', defaults.id ? 'Detalhes do compromisso' : 'Novo compromisso', 'Agenda jurídica', [
        { name: 'title', label: 'Compromisso', required: true, full: true }, { name: 'date', label: 'Data', type: 'date', required: true }, { name: 'time', label: 'Horário', type: 'time' },
        { name: 'client', label: 'Cliente / partes' }, { name: 'process', label: 'Processo' }, { name: 'location', label: 'Local' },
        { name: 'source', label: 'Origem', type: 'select', options: [{value:'Interna',label:'Interna'},{value:'ADVBOX',label:'ADVBOX'},{value:'Agenda ADVBOX',label:'Agenda ADVBOX'}] },
        { name: 'description', label: 'Observações', type: 'textarea', full: true }
      ], { date: isoDate(), source: 'Interna', ...defaults });
    },
    openConfigurationModal(defaults = {}, index = null) {
      const section = this.configurationSection;
      const fieldsBySection = {
        taskDefinitions: [{name:'name',label:'Nome da tarefa',required:true,full:true},{name:'points',label:'Pontuação',type:'number'},{name:'phase',label:'Fase'}],
        users: [{name:'name',label:'Nome do usuário',required:true,full:true},{name:'role',label:'Função'},{name:'pointsGoal',label:'Meta de pontos'}],
        actionGroups: [{name:'name',label:'Grupo de ação',required:true,full:true},{name:'publicationResponsible',label:'Responsável pelas publicações',full:true}],
        actionTypes: [{name:'name',label:'Tipo de ação',required:true,full:true},{name:'group',label:'Grupo'}],
        stages: [{name:'name',label:'Etapa',required:true,full:true},{name:'classification',label:'Classificação'},{name:'phase',label:'Fase'}],
        origins: [{name:'name',label:'Origem',required:true,full:true}],
        goals: [{name:'group',label:'Grupo',required:true,full:true},{name:'monthlyClosings',label:'Meta mensal de fechamentos',type:'number'}],
        inboxSections: [{name:'value',label:'Nome da seção',required:true,full:true}],
        notificationAssignments: [{name:'event',label:'Evento',required:true,full:true},{name:'responsibles',label:'Responsáveis',full:true,placeholder:'Separe os nomes por vírgula'}],
        integrations: [{name:'name',label:'Integração',required:true,full:true},{name:'status',label:'Status'},{name:'method',label:'Método'}]
      };
      const fields = fieldsBySection[section] || [{ name: 'name', label: 'Nome', required: true, full: true }];
      const values = typeof defaults === 'string' ? { value: defaults } : { ...defaults };
      if (Array.isArray(values.responsibles)) values.responsibles = values.responsibles.join(', ');
      this.openModal('configuration', index === null ? 'Novo item de configuração' : 'Editar configuração', 'Estrutura do escritório', fields, { ...values, _section: section, _index: index });
    },
    openTermModal(defaults = {}) {
      this.openModal('term', defaults.id ? 'Editar termo monitorado' : 'Adicionar termo', 'Monitoramento', [
        { name: 'name', label: 'Nome completo ou razão social', required: true, full: true }, { name: 'registration', label: 'OAB, CPF ou CNPJ', required: true },
        { name: 'type', label: 'Tipo', type: 'select', options: [{value:'oab',label:'Inscrição OAB'},{value:'name',label:'Nome'},{value:'document',label:'CPF / CNPJ'}] }
      ], { type: 'oab', ...defaults });
    },
    openSourceModal(defaults = {}) {
      this.openModal('source', 'Detalhes da fonte', 'Monitoramento e integração', [
        { name: 'name', label: 'Fonte', required: true, full: true }, { name: 'short', label: 'Sigla' }, { name: 'method', label: 'Método' },
        { name: 'status', label: 'Situação', type: 'select', options: [{value:'ok',label:'Ativa'},{value:'attention',label:'Atenção'},{value:'error',label:'Falha'},{value:'planned',label:'Preparada'},{value:'off',label:'Desativada'}] },
        { name: 'detail', label: 'Detalhes operacionais', type: 'textarea', full: true, note: 'Não insira senhas, tokens ou conteúdo do certificado.' }
      ], defaults);
    },
    async openJudicialSetup() {
      document.getElementById('judicialSetupBackdrop').classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      await this.refreshJudicialStatus(true);
    },
    closeJudicialSetup() {
      const backdrop = document.getElementById('judicialSetupBackdrop');
      if (!backdrop || backdrop.classList.contains('hidden')) return;
      backdrop.classList.add('hidden');
      if (document.getElementById('modalBackdrop').classList.contains('hidden')) document.body.style.overflow = '';
      document.getElementById('portalTotpSecret').value = '';
      document.getElementById('portalTotpCode').value = '';
      document.getElementById('certificatePassphrase').value = '';
    },
    async refreshJudicialStatus(showError = false) {
      try {
        const response = await window.KellerAuth.secureFetch('/api/integrations/judicial', { headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Não foi possível verificar o certificado.');
        this.judicialStatus = data;
        this.renderJudicialSetup();
      } catch (error) {
        if (showError) this.toast(error.message, 'error');
        const chip = document.getElementById('certificateIntegrationStatus');
        chip.textContent = 'Servidor precisa ser reiniciado'; chip.className = 'status-chip warning';
      }
    },
    renderJudicialSetup() {
      const status = this.judicialStatus; if (!status) return;
      const certificate = status.certificate || {};
      const portals = status.portals || [];
      const totpCount = portals.filter(portal => portal.totpConfigured).length;
      const setStatusIcon = (id, ok) => { const element = document.getElementById(id); element.className = `setup-status-icon ${ok ? 'ok' : 'off'}`; element.textContent = ok ? '✓' : '·'; };
      setStatusIcon('setupCertificateIcon', certificate.valid);
      setStatusIcon('setupPjeOfficeIcon', status.pjeOffice?.available);
      setStatusIcon('setupTotpIcon', totpCount > 0);
      document.getElementById('setupCertificateStatus').textContent = certificate.valid ? 'A1 validado pelo Windows' : certificate.accessible ? 'Senha ou contêiner inválido' : 'Selecione o PFX';
      document.getElementById('setupPjeOfficeStatus').textContent = status.pjeOffice?.available ? 'Aplicativo oficial disponível' : 'Abra o PJeOffice Pro';
      document.getElementById('setupTotpStatus').textContent = totpCount ? `${totpCount} portal(is) vinculado(s)` : 'Nenhum QR vinculado';
      const fileBadge = document.getElementById('certificateFileBadge');
      fileBadge.textContent = certificate.valid ? certificate.fileName || 'Certificado ativo' : 'Não configurado';
      fileBadge.className = `status-chip ${certificate.valid ? 'connected' : 'muted'}`;
      const cardChip = document.getElementById('certificateIntegrationStatus');
      cardChip.textContent = certificate.valid ? `A1 ativo · ${totpCount} 2FA` : 'Configuração necessária';
      cardChip.className = `status-chip ${certificate.valid ? 'connected' : 'warning'}`;
      document.getElementById('certificateIntegrationDetail').textContent = certificate.valid
        ? `${certificate.fileName || 'Certificado'} validado localmente. ${portals.filter(portal => portal.enabled).length} portal(is) habilitado(s) e ${totpCount} segundo(s) fator(es) protegido(s).`
        : 'Ative o A1, selecione os tribunais e vincule um QR novo de cada portal em um único assistente protegido.';
      const portalGroups = portals.reduce((groups, portal) => { (groups[portal.group || 'Outros tribunais'] ||= []).push(portal); return groups; }, {});
      document.getElementById('portalCoverageList').innerHTML = portals.length ? Object.entries(portalGroups).map(([group, items]) => `
        <section class="portal-coverage-group">
          <header><strong>${escapeHtml(group)}</strong><span>${items.length} portal(is)</span></header>
          ${items.map(portal => `
            <label class="portal-coverage-row ${portal.automationLevel === 'experimental' ? 'experimental' : ''}">
              <input type="checkbox" data-portal-enabled value="${escapeHtml(portal.id)}" ${portal.enabled ? 'checked' : ''}>
              <span><strong>${escapeHtml(portal.name)}</strong><small>${portal.automationLevel === 'experimental' ? 'Cobertura experimental · primeiro acesso acompanhado' : portal.supportsTotp ? portal.totpConfigured ? '2FA vinculado e verificado' : 'Sem QR/2FA vinculado' : 'Sessão com certificado, sem TOTP local'}</small></span>
              <span class="portal-method">${escapeHtml(portal.system || (portal.certificateMode === 'pjeoffice' ? 'PJeOffice oficial' : 'Certificado do Windows'))}</span>
              ${portal.supportsTotp ? `<button class="button ghost portal-qr-button" type="button" data-configure-totp="${escapeHtml(portal.id)}">${portal.totpConfigured ? 'Trocar QR' : 'Vincular 2FA'}</button>` : '<span></span>'}
            </label>`).join('')}
        </section>`).join('') : '<div class="setup-loading">Nenhum portal com certificado foi configurado.</div>';
      const selectedPortal = document.getElementById('totpPortalSelect').value;
      document.getElementById('totpPortalSelect').innerHTML = `<option value="">Selecione o tribunal</option>${portals.filter(portal => portal.supportsTotp).map(portal => `<option value="${escapeHtml(portal.id)}">${escapeHtml(portal.name)}${portal.totpConfigured ? ' · vinculado' : ''}</option>`).join('')}`;
      if (portals.some(portal => portal.id === selectedPortal && portal.supportsTotp)) document.getElementById('totpPortalSelect').value = selectedPortal;
      document.getElementById('launchPortalLoginButton').disabled = Boolean(status.interactiveCollectorRunning);
      document.getElementById('launchPortalLoginButton').textContent = status.interactiveCollectorRunning ? 'Primeira conexão em andamento…' : 'Abrir primeira conexão';
    },
    async saveCertificate(event) {
      event.preventDefault();
      const form = event.currentTarget; const file = document.getElementById('certificateFileInput').files[0];
      const passphrase = document.getElementById('certificatePassphrase').value;
      if (!file || !passphrase) return this.toast('Selecione o PFX e informe a senha atual.', 'error');
      this.setFormBusy(form, true);
      try {
        if (file.size > 5_000_000) throw new Error('O certificado deve ter no máximo 5 MB.');
        const pfxBase64 = await this.fileToBase64(file);
        await this.judicialRequest('/api/integrations/judicial/certificate', { fileName: file.name, pfxBase64, passphrase });
        form.reset(); document.getElementById('certificateFileName').textContent = 'Selecionar certificado';
        Store.audit('Certificado A1 configurado', 'Contêiner validado pelo Windows e armazenado cifrado no agente local.');
        this.toast('Certificado validado e protegido com sucesso.', 'success');
        await this.refreshJudicialStatus();
      } catch (error) { this.toast(error.message, 'error'); }
      finally { this.setFormBusy(form, false); }
    },
    async readPortalQr(file) {
      const status = document.getElementById('portalQrStatus');
      document.getElementById('portalTotpSecret').value = '';
      if (!file) { status.textContent = 'Selecionar QR code'; return; }
      status.textContent = 'Lendo QR somente neste navegador…';
      try {
        if (!('BarcodeDetector' in window)) throw new Error('Leitura automática indisponível neste navegador. Use a chave manual exibida pelo portal.');
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        const bitmap = await createImageBitmap(file);
        const codes = await detector.detect(bitmap); bitmap.close?.();
        const raw = codes.find(code => code.rawValue)?.rawValue || '';
        if (!/^otpauth:\/\/totp\//i.test(raw)) {
          if (/^otpauth-migration:/i.test(raw)) throw new Error('Esse é um QR de exportação do autenticador. Gere um QR novo no site do tribunal.');
          throw new Error('A imagem não contém um QR TOTP de ativação reconhecido.');
        }
        document.getElementById('portalTotpSecret').value = raw;
        status.textContent = `${file.name} · QR lido com segurança`;
        document.getElementById('portalTotpCode').focus();
      } catch (error) { status.textContent = file.name; this.toast(error.message, 'error'); }
    },
    async savePortalTotp(event) {
      event.preventDefault(); const form = event.currentTarget;
      const portalId = document.getElementById('totpPortalSelect').value;
      const secret = document.getElementById('portalTotpSecret').value;
      const code = document.getElementById('portalTotpCode').value;
      if (!portalId || !secret || !/^\d{6}$/.test(code)) return this.toast('Selecione o portal, o QR/chave e informe o código atual de seis dígitos.', 'error');
      this.setFormBusy(form, true);
      try {
        await this.judicialRequest('/api/integrations/judicial/2fa', { portalId, secret, code });
        document.getElementById('portalTotpSecret').value = ''; document.getElementById('portalTotpCode').value = ''; document.getElementById('portalQrInput').value = '';
        document.getElementById('portalQrStatus').textContent = 'Selecionar QR code';
        Store.audit('Segundo fator judicial ativado', `${this.judicialStatus?.portals?.find(portal => portal.id === portalId)?.name || portalId} · código TOTP validado.`);
        this.toast('QR validado. O segundo fator desse portal está ativo.', 'success');
        await this.refreshJudicialStatus();
      } catch (error) { this.toast(error.message, 'error'); }
      finally { this.setFormBusy(form, false); }
    },
    async removePortalTotp() {
      const portalId = document.getElementById('totpPortalSelect').value;
      if (!portalId) return this.toast('Selecione o portal cujo vínculo local deve ser removido.', 'error');
      try {
        await this.judicialRequest('/api/integrations/judicial/2fa', { portalId, remove: true });
        document.getElementById('portalTotpSecret').value = ''; document.getElementById('portalTotpCode').value = '';
        Store.audit('Segundo fator judicial removido', `${this.judicialStatus?.portals?.find(portal => portal.id === portalId)?.name || portalId} · segredo local removido.`);
        this.toast('Vínculo local removido. Isso não desativa o 2FA no portal.', 'success');
        await this.refreshJudicialStatus();
      } catch (error) { this.toast(error.message, 'error'); }
    },
    async savePortalCoverage() {
      const enabledIds = [...document.querySelectorAll('[data-portal-enabled]:checked')].map(input => input.value);
      try {
        await this.judicialRequest('/api/integrations/judicial/portals', { enabledIds });
        Store.audit('Cobertura judicial atualizada', `${enabledIds.length} portal(is) com certificado habilitado(s).`);
        this.toast('Cobertura dos tribunais salva.', 'success'); await this.refreshJudicialStatus();
      } catch (error) { this.toast(error.message, 'error'); }
    },
    async resetJudicialConnections() {
      const confirmed = window.confirm('Isso removerá todos os QR Codes/2FA, desmarcará os tribunais e apagará as sessões judiciais locais. O certificado A1 será preservado. Continuar?');
      if (!confirmed) return;
      const button = document.getElementById('resetJudicialConnectionsButton'); button.disabled = true;
      try {
        const result = await this.judicialRequest('/api/integrations/judicial/reset', { confirm: 'ZERAR_ACESSOS_JUDICIAIS' });
        document.getElementById('portalTotpSecret').value = ''; document.getElementById('portalTotpCode').value = ''; document.getElementById('portalQrInput').value = '';
        Store.audit('Acessos judiciais zerados', `QR/2FA, cobertura e sessões locais removidos. Certificado A1 ${result.certificatePreserved ? 'preservado' : 'não estava configurado'}.`);
        this.toast(result.certificatePreserved ? 'Acessos zerados. O certificado A1 foi preservado.' : 'Acessos zerados; nenhum certificado estava configurado.', 'success');
        await this.refreshJudicialStatus();
      } catch (error) { this.toast(error.message, 'error'); }
      finally { button.disabled = false; }
    },
    async launchPortalLogin() {
      const portalIds = [...document.querySelectorAll('[data-portal-enabled]:checked')].map(input => input.value);
      if (!portalIds.length) return this.toast('Marque ao menos um tribunal antes da primeira conexão.', 'error');
      if (!this.judicialStatus?.certificate?.valid) return this.toast('Valide o certificado A1 antes de abrir a primeira conexão.', 'error');
      const button = document.getElementById('launchPortalLoginButton'); button.disabled = true;
      try {
        await this.judicialRequest('/api/integrations/judicial/connect', { portalIds });
        this.toast('Janela de primeira conexão iniciada. Conclua apenas os pedidos oficiais dos tribunais.', 'success');
        Store.audit('Primeira conexão judicial iniciada', `${portalIds.length} portal(is) selecionado(s).`);
        await this.refreshJudicialStatus();
      } catch (error) { button.disabled = false; this.toast(error.message, 'error'); }
    },
    async judicialRequest(url, body) {
      const response = await window.KellerAuth.secureFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'A configuração judicial não foi concluída.');
      return data;
    },
    async forgetTrustedDevice() {
      try {
        const response = await window.KellerAuth.secureFetch('/api/auth/trusted-device/revoke', { method: 'POST', headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.message || 'Não foi possível revogar a confiança.');
        document.getElementById('forgetTrustedDeviceButton').classList.add('hidden');
        Store.audit('Navegador removido da confiança', 'O próximo acesso exigirá senha e Authenticator.');
        this.toast('Confiança removida. O próximo acesso exigirá autenticação completa.', 'success');
      } catch (error) { this.toast(error.message, 'error'); }
    },
    setFormBusy(form, busy) { form.querySelectorAll('input, select, button').forEach(element => { element.disabled = busy; }); },
    async fileToBase64(file) {
      const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 32_768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
      return btoa(binary);
    },
    openGuideModal(type) {
      const isCalendar = type === 'calendar';
      this.openModal('guide', isCalendar ? 'Ativar agenda ADVBOX' : 'Ativar certificado A1', 'Configuração protegida', [
        { name: 'instructions', label: isCalendar ? 'Como configurar' : 'Arquitetura do certificado', type: 'textarea', full: true, value: isCalendar
          ? '1. Regenere a URL Webcal que foi exposta no chat.\n2. Copie .env.example para .env.\n3. Insira a URL em ADVBOX_WEBCAL_URL no seu próprio computador.\n4. Reinicie o servidor e clique em Sincronizar.\n\nA URL nunca deve ser salva no GitHub.'
          : '1. Instale o certificado A1 somente no agente local.\n2. Defina A1_PFX_PATH e A1_PFX_PASSPHRASE fora do código.\n3. Cadastre a origem exata de cada portal em collector/portals.json.\n4. Execute primeiro em modo visível para concluir login, QR code ou 2FA.\n5. Agende a execução diária somente após validar cada fonte.\n\nO sistema nunca deve calcular ou confirmar prazo fatal sem revisão humana.' }
      ], {});
      document.querySelector('#modalForm footer .button.gold').textContent = 'Entendi';
    },
    handleModalSubmit(event) {
      event.preventDefault(); if (!this.modalMode) return;
      if (this.modalMode.mode === 'guide') { this.closeModal(); return; }
      if (this.modalMode.mode === 'intimationDetail') {
        const item = this.modalMode.defaults;
        const act = item._act || classifyIntimationAct(item.text, item.title, item.type);
        const suggestedDeadline = addDays(item.publishedAt || isoDate(), act.days);
        this.closeModal();
        this.openTaskModal({
          title: `Cumprir ${act.category}: ${item.title}`,
          description: item.text,
          process: item.process,
          client: item.client,
          source: item.source || 'DJEN',
          intimationId: item.id,
          deadline: suggestedDeadline,
          priority: act.priority || 'normal',
          status: 'triagem'
        });
        return;
      }
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      if (this.modalMode.mode === 'task') {
        const history = Array.isArray(this.modalMode.defaults.history) ? [...this.modalMode.defaults.history] : [];
        history.push({ at: new Date().toISOString(), action: this.modalMode.defaults.id ? 'Tarefa atualizada' : 'Tarefa atribuída', actor: 'Ricardo' });
        const timeLogs = Array.isArray(this.modalMode.defaults.timeLogs) ? [...this.modalMode.defaults.timeLogs] : [];
        const addMinutes = Number(data.addMinutes);
        if (addMinutes > 0) {
          timeLogs.push({ id: uid('time'), date: isoDate(), minutes: addMinutes, description: data.timeDescription || 'Trabalho realizado', actor: 'Ricardo' });
          history.push({ at: new Date().toISOString(), action: `Apontamento de tempo: ${formatMinutes(addMinutes)}`, actor: 'Ricardo' });
        }
        delete data.addMinutes;
        delete data.timeDescription;
        const responsibleList = [data.responsible, ...String(data.responsibles || '').split(/[,;]/)].map(item => item.trim()).filter(Boolean);
        const record = { id: this.modalMode.defaults.id || uid('task'), createdAt: this.modalMode.defaults.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), source: this.modalMode.defaults.source || 'Interna', intimationId: this.modalMode.defaults.intimationId || null, ...data, points: Number(data.points) || 0, responsibles: [...new Set(responsibleList)], history, timeLogs };
        Store.upsert('tasks', record);
        if (record.intimationId) { const intimation = Store.state.intimations.find(item => item.id === record.intimationId); if (intimation) { intimation.status = 'tarefa'; intimation.completedAt = new Date().toISOString(); intimation.taskId = record.id; } }
        Store.audit(this.modalMode.defaults.id ? 'Tarefa atualizada' : 'Tarefa atribuída', `${record.title}${record.process ? ` · ${record.process}` : ''}${record.points ? ` · ${record.points} pontos` : ''}${addMinutes > 0 ? ` · ${formatMinutes(addMinutes)} apontados` : ''}`);
      } else if (this.modalMode.mode === 'intimation') {
        const editing = Boolean(this.modalMode.defaults.id);
        const record = { id: this.modalMode.defaults.id || uid('int'), status: this.modalMode.defaults.status || 'nova', unread: this.modalMode.defaults.unread ?? true, term: this.modalMode.defaults.term || 'Ricardo De Luca Rossetto · OAB/RS 135294', createdAt: this.modalMode.defaults.createdAt || new Date().toISOString(), ...this.modalMode.defaults, ...data, updatedAt: new Date().toISOString() };
        Store.upsert('intimations', record); Store.audit(editing ? 'Intimação atualizada' : 'Intimação registrada', `${record.title}${record.process ? ` · ${record.process}` : ''}`);
      } else if (this.modalMode.mode === 'process') {
        const editing = Boolean(this.modalMode.defaults.id);
        const record = {
          id: this.modalMode.defaults.id || uid('proc'),
          source: this.modalMode.defaults.source || 'Interna',
          lastMovement: 'Cadastro manual',
          lastMovementAt: isoDate(),
          ...this.modalMode.defaults,
          ...data,
          feePercentage: data.feePercentage ? Number(data.feePercentage) : null,
          feeAmount: data.feeAmount ? Number(data.feeAmount) : null,
          feeMonthly: data.feeMonthly ? Number(data.feeMonthly) : null,
          secrecy: data.secrecy === 'true',
          updatedAt: new Date().toISOString()
        };
        Store.upsert('processes', record);
        Store.audit(editing ? 'Processo atualizado' : 'Processo cadastrado', `${record.number || record.protocol || 'sem número'} · ${record.client}${record.feeType ? ` · ${record.feeType}` : ''}`);
      } else if (this.modalMode.mode === 'contact') {
        const editing = Boolean(this.modalMode.defaults.id);
        const record = { id: this.modalMode.defaults.id || uid('contact'), externalId: this.modalMode.defaults.externalId || null, registeredAt: this.modalMode.defaults.registeredAt || isoDate(), ...this.modalMode.defaults, ...data, updatedAt: new Date().toISOString() };
        Store.upsert('contacts', record); Store.audit(editing ? 'Contato atualizado' : 'Contato cadastrado', record.name);
      } else if (this.modalMode.mode === 'agenda') {
        const editing = Boolean(this.modalMode.defaults.id);
        const record = { id: this.modalMode.defaults.id || uid('agenda'), externalId: this.modalMode.defaults.externalId || null, ...this.modalMode.defaults, ...data, updatedAt: new Date().toISOString() };
        Store.upsert('agenda', record); Store.audit(editing ? 'Compromisso atualizado' : 'Compromisso cadastrado', `${record.title} · ${formatDate(record.date)}`);
      } else if (this.modalMode.mode === 'configuration') {
        const section = this.modalMode.defaults._section; const index = this.modalMode.defaults._index;
        const list = Store.state.configuration[section];
        let record = { ...this.modalMode.defaults, ...data }; delete record._section; delete record._index;
        if (section === 'inboxSections') record = data.value;
        if (section === 'notificationAssignments') record.responsibles = String(data.responsibles || '').split(/[,;]/).map(item => item.trim()).filter(Boolean);
        if (section === 'taskDefinitions') record.points = Number(data.points) || 0;
        if (section === 'goals') record.monthlyClosings = data.monthlyClosings === '' ? null : Number(data.monthlyClosings);
        if (index === null || index === undefined || index === '') list.push(record); else list[Number(index)] = record;
        Store.audit(index === null || index === undefined || index === '' ? 'Configuração adicionada' : 'Configuração atualizada', `${section} · ${typeof record === 'string' ? record : record.name || record.event || record.group || 'item'}`);
      } else if (this.modalMode.mode === 'term') {
        const editing = Boolean(this.modalMode.defaults.id);
        const record = { id: this.modalMode.defaults.id || uid('term'), active: true, ...this.modalMode.defaults, ...data, updatedAt: new Date().toISOString() }; Store.upsert('terms', record); Store.audit(editing ? 'Termo atualizado' : 'Termo adicionado', `${record.name} · ${record.registration}`);
      } else if (this.modalMode.mode === 'source') {
        const record = { ...this.modalMode.defaults, ...data, updatedAt: new Date().toISOString() }; Store.upsert('sources', record); Store.audit('Fonte atualizada', `${record.name} · ${record.status}`);
      }
      Store.save(); this.closeModal(); this.renderAll(); this.toast('Registro salvo com sucesso.', 'success');
    },
    openDocumentGenerator({ contactId = null, processId = null, type = 'procuracao' } = {}) {
      const contacts = Store.state.contacts || [];
      const processes = Store.state.processes || [];
      const contactSelect = document.getElementById('docGenContactSelect');
      const processSelect = document.getElementById('docGenProcessSelect');
      const typeSelect = document.getElementById('docGenTypeSelect');

      if (contactSelect) {
        contactSelect.innerHTML = `<option value="">Selecione o contato</option>${contacts.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)} (${escapeHtml(c.document || 'sem doc')})</option>`).join('')}`;
        if (contactId && contacts.some(c => c.id === contactId)) contactSelect.value = contactId;
        else if (contacts.length) contactSelect.value = contacts[0].id;
      }

      if (processSelect) {
        processSelect.innerHTML = `<option value="">Geral / Sem processo</option>${processes.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.number || p.protocol || 'Processo')} · ${escapeHtml(p.client)}</option>`).join('')}`;
        if (processId && processes.some(p => p.id === processId)) processSelect.value = processId;
      }

      if (typeSelect && type) typeSelect.value = type;

      this.updateDocPreview();
      document.getElementById('docGeneratorBackdrop').classList.remove('hidden');
    },
    closeDocumentGenerator() {
      document.getElementById('docGeneratorBackdrop').classList.add('hidden');
    },
    updateDocPreview() {
      const type = document.getElementById('docGenTypeSelect')?.value || 'procuracao';
      const contactId = document.getElementById('docGenContactSelect')?.value;
      const processId = document.getElementById('docGenProcessSelect')?.value;
      const contact = Store.state.contacts.find(c => c.id === contactId);
      const process = Store.state.processes.find(p => p.id === processId);

      let text = '';
      if (type === 'procuracao') text = generateProcuracaoText(contact, process);
      else if (type === 'contrato_honorarios') text = generateContratoText(contact, process);
      else if (type === 'declaracao_hipo') text = generateDeclaracaoHipoText(contact);

      const previewArea = document.getElementById('docGenPreviewText');
      if (previewArea) previewArea.value = text;
    },
    async copyDocToClipboard() {
      const text = document.getElementById('docGenPreviewText').value;
      try {
        await navigator.clipboard.writeText(text);
        this.toast('Minuta copiada para a área de transferência!', 'success');
      } catch {
        const area = document.getElementById('docGenPreviewText');
        area.select();
        document.execCommand('copy');
        this.toast('Minuta copiada!', 'success');
      }
    },
    downloadDoc() {
      const type = document.getElementById('docGenTypeSelect').value;
      const text = document.getElementById('docGenPreviewText').value;
      const filename = `${type}-${isoDate()}.md`;
      const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      this.toast(`Arquivo ${filename} baixado com sucesso.`, 'success');
    },
    async checkServerStatus() {
      try {
        const response = await window.KellerAuth.secureFetch('/api/status', { headers: { Accept: 'application/json' } });
        if (!response.ok) return;
        const data = await response.json();
        Store.state.settings.calendarConfigured = Boolean(data.calendarConfigured);
        Store.state.settings.collectorConfigured = Boolean(data.collectorConfigured);
        const calendar = Store.state.sources.find(item => item.id === 'advbox-calendar');
        if (calendar) { calendar.status = data.calendarConfigured ? 'ok' : 'attention'; calendar.detail = data.calendarConfigured ? 'Webcal protegido no servidor' : calendar.detail; }
        Store.save(); this.renderSources(); this.renderMonitoring(); this.renderMetrics();
        document.getElementById('forgetTrustedDeviceButton').classList.toggle('hidden', !window.KellerAuth.trustedDevice);
        await this.refreshJudicialStatus(false);
      } catch { /* O modo estático continua disponível. */ }
    },
    async syncWhenIdle() {
      const modalOpen = !document.getElementById('modalBackdrop').classList.contains('hidden');
      const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if (modalOpen || editing) {
        clearTimeout(this.syncRetryTimer);
        this.syncRetryTimer = window.setTimeout(() => this.syncWhenIdle(), 15 * 1000);
        return;
      }
      await this.syncAll({ silent: true });
    },
    async syncAll({ silent = false } = {}) {
      const buttons = [document.getElementById('syncButton'), document.getElementById('agendaSyncButton')];
      buttons.forEach(button => { if (button) button.disabled = true; });
      if (!silent) this.toast('Iniciando sincronização protegida…');
      try {
        const response = await window.KellerAuth.secureFetch('/api/sync', { method: 'POST', headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Servidor de integração indisponível.');
        if (Store.state.settings.demoMode && Number(data.imported) > 0) {
          ['agenda', 'tasks', 'intimations', 'processes'].forEach(collection => {
            Store.state[collection] = Store.state[collection].filter(item => !String(item.id || '').includes('demo'));
          });
        }
        (data.events || []).forEach(event => Store.upsert('agenda', event, 'externalId'));
        (data.tasks || []).forEach(task => Store.upsert('tasks', task, 'externalId'));
        (data.intimations || []).forEach(item => Store.upsert('intimations', item, 'externalId'));
        (data.processes || []).forEach(item => Store.upsert('processes', item, 'number'));
        (data.sources || []).forEach(source => Store.upsert('sources', source));
        if (Number(data.imported) > 0) Store.state.settings.demoMode = false;
        Store.audit('Sincronização concluída', `${data.imported || 0} registro(s) processado(s).`, 'Sistema');
        this.renderAll();
        if (!silent) this.toast('Sincronização concluída.', 'success');
      } catch (error) {
        if (!silent) this.toast(error.message || 'Não foi possível sincronizar.', 'error');
      } finally {
        buttons.forEach(button => { if (button) button.disabled = false; });
      }
    },
    async importJson(file) {
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        let imported = 0;
        const defaultTerm = Store.state.terms[0] ? `${Store.state.terms[0].name} · ${Store.state.terms[0].registration}` : 'Advogado(a) Titular';
        if (Array.isArray(payload)) {
          payload.forEach(record => {
            if (!record?.title && !record?.text) return;
            Store.upsert('intimations', { id: record.id || uid('int'), source: record.source || 'Arquivo JSON', status: record.status || 'nova', unread: true, title: record.title || 'Intimação importada', process: record.process || '', client: record.client || '', court: record.court || '', publishedAt: record.publishedAt || isoDate(), text: record.text || record.description || '', term: record.term || defaultTerm, createdAt: new Date().toISOString() });
            imported++;
          });
        } else if (payload && typeof payload === 'object') {
          const hasCollections = ['intimations', 'tasks', 'processes', 'agenda'].some(key => Array.isArray(payload[key]));
          if (hasCollections) {
            if (Store.state.settings.demoMode) {
              ['agenda', 'tasks', 'intimations', 'processes'].forEach(collection => {
                Store.state[collection] = Store.state[collection].filter(item => !String(item.id || '').includes('demo'));
              });
            }
            (payload.intimations || []).forEach(record => {
              Store.upsert('intimations', { id: record.id || uid('int'), source: record.source || 'Arquivo JSON', status: record.status || 'nova', unread: true, title: record.title || 'Intimação importada', process: record.process || '', client: record.client || '', court: record.court || '', publishedAt: record.publishedAt || isoDate(), text: record.text || record.description || '', term: record.term || defaultTerm, createdAt: new Date().toISOString(), ...record });
              imported++;
            });
            (payload.tasks || []).forEach(record => {
              Store.upsert('tasks', { id: record.id || uid('task'), title: record.title || 'Tarefa importada', status: record.status || 'triagem', source: record.source || 'Arquivo JSON', priority: record.priority || 'normal', responsible: record.responsible || 'Advogado', createdAt: new Date().toISOString(), ...record });
              imported++;
            });
            (payload.processes || []).forEach(record => {
              Store.upsert('processes', { id: record.id || uid('proc'), number: record.number || '', client: record.client || 'Cliente não informado', secrecy: Boolean(record.secrecy), monitoring: record.monitoring || 'active', source: record.source || 'Arquivo JSON', lastMovement: record.lastMovement || 'Importado via JSON', lastMovementAt: record.lastMovementAt || isoDate(), createdAt: new Date().toISOString(), ...record }, 'number');
              imported++;
            });
            (payload.agenda || []).forEach(record => {
              Store.upsert('agenda', { id: record.id || uid('agenda'), title: record.title || 'Compromisso importado', date: record.date || isoDate(), source: record.source || 'Arquivo JSON', createdAt: new Date().toISOString(), ...record });
              imported++;
            });
            if (imported > 0) Store.state.settings.demoMode = false;
          } else if (payload.title || payload.text) {
            Store.upsert('intimations', { id: payload.id || uid('int'), source: payload.source || 'Arquivo JSON', status: payload.status || 'nova', unread: true, title: payload.title || 'Intimação importada', process: payload.process || '', client: payload.client || '', court: payload.court || '', publishedAt: payload.publishedAt || isoDate(), text: payload.text || payload.description || '', term: payload.term || defaultTerm, createdAt: new Date().toISOString(), ...payload });
            imported++;
          }
        }
        Store.audit('Arquivo importado', `${imported} registro(s) adicionado(s).`); this.renderAll(); this.toast(`${imported} registro(s) importado(s).`, 'success');
      } catch { this.toast('O arquivo não contém um JSON válido.', 'error'); }
      document.getElementById('jsonImportInput').value = '';
    },
    exportJson(data, filename) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
    },
    toast(message, type = '') {
      const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message;
      document.getElementById('toastRegion').appendChild(toast); setTimeout(() => toast.remove(), 4300);
    }
  };

  let initialized = false;
  const boot = () => {
    if (initialized) return;
    initialized = true;
    App.init().catch(() => window.KellerAuth.logout());
  };
  window.JurisFlow = { App, Store };
  window.KellerCentral = { App, Store };
  window.addEventListener('keller:authenticated', boot);
  if (window.KellerAuth?.authenticated) boot();
})();
