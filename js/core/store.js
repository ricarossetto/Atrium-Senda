import { fetchState, importLegacyState, persistState } from './api.js?v=3.0.1';
import { rebaseClientState } from './state-rebase.js?v=3.0.1';

const STORAGE_KEY = 'jurisflow_storage_v1';

export const EXTERNAL_CALENDAR_SOURCE_ID = 'external-calendar';
export const LEGACY_EXTERNAL_CALENDAR_SOURCE_ID = 'advbox-calendar';

const EXTERNAL_CALENDAR_DEFAULT_SOURCE = Object.freeze({
  id: EXTERNAL_CALENDAR_SOURCE_ID,
  name: 'Agenda Externa (Webcal)',
  short: 'CAL',
  method: 'Webcal/iCal',
  status: 'planned',
  lastCheck: null,
  detail: 'Sincronize com Google Agenda, Outlook ou Apple'
});

export const STORE_PERSISTENCE_CONFLICT_EVENT = 'atrium:store-persistence-conflict';
export const ATRIUM_STORE_PERSISTENCE_ERROR_EVENT = 'atrium:store-persistence-error';
export const STORE_PERSISTENCE_ERROR_MESSAGE = 'Não foi possível salvar: o servidor não confirmou a gravação.';

export const isoDate = (offset = 0, baseDate = new Date()) => {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const sampleState = {
  version: 1,
  terms: [{
    id: 'term-principal',
    name: 'Advogado(a) Monitorado(a)',
    registration: 'OAB/UF 000000',
    oabNumber: '',
    oabUf: '',
    active: true,
    primary: true
  }],
  sources: [
    { ...EXTERNAL_CALENDAR_DEFAULT_SOURCE },
    { id: 'djen-cnj', name: 'DJEN / CNJ Oficial', short: 'CNJ', method: 'API pública oficial', status: 'planned', lastCheck: null, detail: 'Conector de diários e publicações' },
    { id: 'datajud-cnj', name: 'DataJud / CNJ', short: 'DJD', method: 'API pública oficial', status: 'planned', lastCheck: null, detail: 'Enriquecimento de andamentos processuais' },
    { id: 'a1', name: 'Portais com certificado A1 / PJe', short: 'A1', method: 'Agente local seguro', status: 'off', lastCheck: null, detail: 'Integração direta com tribunais' },
    { id: 'inpi-rpi', name: 'INPI / RPI Marcas', short: 'INPI', method: 'RPI Semanal (Terças)', status: 'ok', lastCheck: null, detail: 'Monitoramento semanal de marcas, despachos e termos' }
  ],
  intimations: [
    {
      id: 'int-demo-1', source: 'DJEN Oficial', status: 'nova', unread: true,
      title: 'Publicação identificada para conferência', process: '0000000-00.2026.8.21.0000',
      client: 'Cliente Modelo', court: 'Tribunal de Justiça · Vara Cível', publishedAt: isoDate(0),
      text: 'Intimação de demonstração. Quando os coletores estiverem ativos, o texto original da publicação ou da notificação oficial será preservado neste espaço.',
      term: 'Advogado(a) Monitorado(a) · OAB/UF 000000', createdAt: new Date().toISOString()
    },
    {
      id: 'int-demo-2', source: 'Diário Eletrônico', status: 'triagem', unread: false,
      title: 'Movimentação processual aguardando análise', process: '5000000-00.2026.4.04.0000',
      client: 'Processo de demonstração', court: 'Justiça Federal · Vara Federal', publishedAt: isoDate(-1),
      text: 'Conteúdo ilustrativo para testar a triagem, a criação de tarefas e a vinculação ao Kanban.',
      term: 'Advogado(a) Monitorado(a) · OAB/UF 000000', createdAt: new Date(Date.now() - 86400000).toISOString()
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
  documents: [],
  customPrompts: [],
  customLinks: [],
  calculations: [],
  configuration: {
    users: [], monitoredTerms: [], taskDefinitions: [], actionGroups: [], actionTypes: [], stages: [], goals: [], origins: [], partners: [], inboxSections: [], notificationAssignments: [], integrations: [], sourceProducts: []
  },
  agenda: [
    { id: 'agenda-demo-1', title: 'Audiência de conciliação / instrução', date: isoDate(1), time: '09:30', source: 'Interna', client: 'Cliente Modelo', process: '0000000-00.2026.8.21.0000' },
    { id: 'agenda-demo-2', title: 'Prazo fatal para recurso', date: isoDate(4), time: '17:00', source: 'Demonstração', client: 'Processo de demonstração', process: '5000000-00.2026.4.04.0000' }
  ],
  audit: [
    { id: 'audit-initial', at: new Date().toISOString(), action: 'ATRIUM inicializado', detail: 'Ambiente pronto para uso com registros de demonstração.', actor: 'Sistema' }
  ],
  settings: {
    officeName: 'Meu Escritório',
    officeSlogan: 'Sociedade de Advogados',
    lawyerName: 'Advogado(a) Titular',
    lawyerOab: 'OAB/UF 000000',
    lawyerCpfCnpj: '',
    lawyerEmail: '',
    lawyerPhone: '',
    lawyerAddress: '',
    externalCalendarUrl: '',
    demoMode: true,
    calendarConfigured: false,
    collectorConfigured: false,
    documentNamingTemplate: '',
    dismissedBanner: false
  }
};

const deepClone = value => JSON.parse(JSON.stringify(value));

const hasOperationalValue = value => value !== undefined && value !== null && value !== '';

const calendarRecordTime = record => Date.parse(record?.lastCheck || record?.updatedAt || '') || 0;

const latestCalendarRecord = (legacy, canonical) => {
  const legacyTime = calendarRecordTime(legacy);
  const canonicalTime = calendarRecordTime(canonical);
  return legacyTime > canonicalTime ? legacy : canonical;
};

const preferredCalendarStatus = (legacy, canonical) => {
  const legacyTime = calendarRecordTime(legacy);
  const canonicalTime = calendarRecordTime(canonical);
  if (legacyTime !== canonicalTime) {
    const latest = legacyTime > canonicalTime ? legacy : canonical;
    if (hasOperationalValue(latest?.status)) return latest.status;
  }
  if (hasOperationalValue(canonical?.status) && canonical.status !== EXTERNAL_CALENDAR_DEFAULT_SOURCE.status) return canonical.status;
  if (hasOperationalValue(legacy?.status) && legacy.status !== EXTERNAL_CALENDAR_DEFAULT_SOURCE.status) return legacy.status;
  return canonical?.status || legacy?.status || EXTERNAL_CALENDAR_DEFAULT_SOURCE.status;
};

const preferredCalendarText = (legacy, canonical, field) => {
  const canonicalValue = canonical?.[field];
  const legacyValue = legacy?.[field];
  const defaultValue = EXTERNAL_CALENDAR_DEFAULT_SOURCE[field];
  if (hasOperationalValue(canonicalValue) && canonicalValue !== defaultValue) return canonicalValue;
  if (hasOperationalValue(legacyValue)) return legacyValue;
  if (hasOperationalValue(canonicalValue)) return canonicalValue;
  return defaultValue;
};

export const normalizeExternalCalendarSources = sources => {
  if (!Array.isArray(sources)) return [];
  const legacyRecords = sources.filter(source => source?.id === LEGACY_EXTERNAL_CALENDAR_SOURCE_ID);
  if (!legacyRecords.length) return sources;

  const canonicalRecords = sources.filter(source => source?.id === EXTERNAL_CALENDAR_SOURCE_ID);
  const legacy = legacyRecords.reduce((merged, source) => ({ ...merged, ...source }), {});
  const canonical = canonicalRecords.reduce((merged, source) => ({ ...merged, ...source }), {});
  const latest = latestCalendarRecord(legacy, canonical);
  const merged = {
    ...legacy,
    ...canonical,
    id: EXTERNAL_CALENDAR_SOURCE_ID,
    name: preferredCalendarText(legacy, canonical, 'name'),
    short: preferredCalendarText(legacy, canonical, 'short'),
    method: preferredCalendarText(legacy, canonical, 'method'),
    detail: preferredCalendarText(legacy, canonical, 'detail'),
    status: preferredCalendarStatus(legacy, canonical),
    lastCheck: latest?.lastCheck || canonical.lastCheck || legacy.lastCheck || null
  };

  const firstIndex = sources.findIndex(source =>
    source?.id === LEGACY_EXTERNAL_CALENDAR_SOURCE_ID || source?.id === EXTERNAL_CALENDAR_SOURCE_ID
  );
  const normalized = sources.filter(source =>
    source?.id !== LEGACY_EXTERNAL_CALENDAR_SOURCE_ID && source?.id !== EXTERNAL_CALENDAR_SOURCE_ID
  );
  normalized.splice(Math.max(0, firstIndex), 0, merged);
  return normalized;
};

export const Store = {
  state: null,
  revision: null,
  stateStatus: null,
  recoveryDetails: null,
  serverMeta: null,
  saveTimer: null,
  flushPromise: Promise.resolve(),
  lastFlush: null,
  canonicalRefreshPending: false,
  canonicalRefreshSourceRevision: null,
  async load({ expectedFingerprint, expectedRevision, canApply = () => true } = {}) {
    const guarded = expectedFingerprint !== undefined;
    let persisted = null;
    let serverPayload = null;
    try {
      const response = await fetchState();
      if (response.ok) {
        serverPayload = await response.json();
        if (guarded && (!canApply() || this.persistenceFingerprint() !== expectedFingerprint || this.revision !== expectedRevision)) return false;
        if (guarded && (!serverPayload.state || typeof serverPayload.state !== 'object' || Array.isArray(serverPayload.state) || serverPayload.stateStatus !== 'READY' || typeof serverPayload.revision !== 'string' || !serverPayload.revision)) return false;
        if (guarded) this.ensureShape.call({ state: serverPayload.state });
        persisted = serverPayload.state;
        this.revision = serverPayload.revision || null;
        this.stateStatus = serverPayload.stateStatus || 'READY';
        this.serverMeta = {
          appVersion: serverPayload.appVersion,
          gitSha: serverPayload.gitSha || serverPayload.commitSha || null,
          buildId: serverPayload.buildId,
          builtAt: serverPayload.builtAt || null,
          schemaVersion: serverPayload.schemaVersion,
          dataVersion: serverPayload.dataVersion
        };
      }
    } catch { /* servidor indisponível — modo offline seguro */ }

    if (guarded && !persisted) return false;

    if (this.stateStatus === 'RECOVERY_REQUIRED' || this.stateStatus === 'FUTURE_SCHEMA_ERROR') {
      this.recoveryDetails = serverPayload?.recoveryDetails || null;
      this.state = deepClone(sampleState);
      this.state.settings.demoMode = true;
      this.ensureShape({ seedConfigurationDefaults: true });
      return;
    }

    if (!persisted && this.stateStatus === 'NEW_INSTALL' && !globalThis.ATRIUM_CONFIG?.apiBaseUrl) {
      let legacyData = null;
      try { legacyData = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { /* legado corrompido — ignorar */ }
      if (legacyData && typeof legacyData === 'object' && (legacyData.version === 1 || Array.isArray(legacyData.processes))) {
        try {
          const importResp = await importLegacyState(legacyData);
          if (importResp.ok) {
            const importResult = await importResp.json();
            this.revision = importResult.revision || null;
            const freshResp = await fetchState();
            if (freshResp.ok) {
              const fresh = await freshResp.json();
              persisted = fresh.state;
              this.revision = fresh.revision || null;
              this.stateStatus = 'READY';
              localStorage.removeItem(STORAGE_KEY);
            } else {
              this.state = deepClone(legacyData);
              this.stateStatus = 'IMPORT_CONFIRMATION_PENDING';
              this.ensureShape();
              return;
            }
          }
        } catch {
          this.state = deepClone(legacyData);
          this.stateStatus = 'IMPORT_CONFIRMATION_PENDING';
          this.ensureShape();
          return;
        }
      }
    }

    const seedConfigurationDefaults = !persisted;
    if (!persisted) {
      this.state = deepClone(sampleState);
      if (this.stateStatus === 'NEW_INSTALL') {
        for (const key of ['intimations', 'tasks', 'processes', 'agenda', 'audit']) this.state[key] = [];
        this.state.settings.demoMode = false;
        const authenticatedUser = globalThis.KellerAuth?.currentUser;
        if (authenticatedUser?.workspaceName) this.state.settings.officeName = authenticatedUser.workspaceName;
        if (authenticatedUser?.displayName) this.state.settings.lawyerName = authenticatedUser.displayName;
        if (authenticatedUser?.email) this.state.settings.lawyerEmail = authenticatedUser.email;
      }
      const schemaVersion = Number(this.serverMeta?.schemaVersion);
      const dataVersion = Number(this.serverMeta?.dataVersion);
      if (Number.isInteger(schemaVersion) && schemaVersion > 0) {
        this.state.schemaVersion = schemaVersion;
        this.state.dataVersion = Number.isInteger(dataVersion) && dataVersion > 0 ? dataVersion : schemaVersion;
      }
    } else {
      this.state = persisted;
    }
    if (!guarded) this.ensureShape({ seedConfigurationDefaults });
    this.persistedFingerprint = persisted ? this.persistenceFingerprint() : null;
    this.canonicalRefreshPending = false;
    this.canonicalRefreshSourceRevision = null;
    if (!guarded) this.save();
    return true;
  },
  ensureShape({ seedConfigurationDefaults = false } = {}) {
    ['terms', 'sources', 'intimations', 'tasks', 'processes', 'agenda', 'audit', 'contacts', 'documents', 'leads', 'customPrompts', 'customLinks', 'calculations'].forEach(key => {
      if (!Array.isArray(this.state[key])) this.state[key] = [];
    });
    this.state.configuration = { ...(this.state.configuration || {}) };
    const defaultOffice = globalThis.OFFICE_DEFAULT_DATA || {};
    for (const key of ['taskDefinitions', 'actionTypes', 'actionGroups', 'stages', 'origins', 'goals', 'users', 'inboxSections', 'notificationAssignments', 'integrations']) {
      if (!Array.isArray(this.state.configuration[key]) || (seedConfigurationDefaults && this.state.configuration[key].length === 0)) {
        if (Array.isArray(defaultOffice[key]) && defaultOffice[key].length > 0) {
          this.state.configuration[key] = deepClone(defaultOffice[key]);
        } else {
          this.state.configuration[key] = [];
        }
      }
    }
    if (Array.isArray(this.state.configuration?.integrations) && this.state.configuration.integrations.length > 0) {
      const defaultIntegrations = Array.isArray(defaultOffice.integrations) ? defaultOffice.integrations : [];
      defaultIntegrations.forEach(di => {
        if (di && di.name && !this.state.configuration.integrations.some(item => (item?.name || '').toLowerCase() === di.name.toLowerCase())) {
          this.state.configuration.integrations.push(deepClone(di));
        }
      });
    }
    this.state.settings = { ...sampleState.settings, ...(this.state.settings || {}) };
    if (Array.isArray(this.state.sources)) {
      this.state.sources = normalizeExternalCalendarSources(this.state.sources);
      this.state.sources.forEach(s => {
        if (s.id === 'djen') s.id = 'djen-cnj';
        if (s.id === 'datajud') s.id = 'datajud-cnj';
      });
      const defaultSources = [
        { ...EXTERNAL_CALENDAR_DEFAULT_SOURCE },
        { id: 'djen-cnj', name: 'DJEN / CNJ Oficial', short: 'CNJ', method: 'API pública oficial', status: 'planned', lastCheck: null, detail: 'Conector de diários e publicações' },
        { id: 'datajud-cnj', name: 'DataJud / CNJ', short: 'DJD', method: 'API pública oficial', status: 'planned', lastCheck: null, detail: 'Enriquecimento de andamentos processuais' },
        { id: 'a1', name: 'Portais com certificado A1 / PJe', short: 'A1', method: 'Agente local seguro', status: 'off', lastCheck: null, detail: 'Integração direta com tribunais' },
        { id: 'inpi-rpi', name: 'INPI / RPI Marcas', short: 'INPI', method: 'RPI Semanal (Terças)', status: 'ok', lastCheck: null, detail: 'Monitoramento semanal de marcas, despachos e termos' }
      ];
      defaultSources.forEach(ds => {
        if (!this.state.sources.some(s => s.id === ds.id)) {
          this.state.sources.push(deepClone(ds));
        }
      });
      const seen = new Set();
      this.state.sources = this.state.sources.filter(s => {
        if (!s?.id || seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      });
    }
    if (!this.state.terms.length) this.state.terms.unshift(deepClone(sampleState.terms[0]));
    const authUser = globalThis.KellerAuth?.currentUser;
    if (authUser?.displayName) {
      if (!this.state.settings.lawyerName || this.state.settings.lawyerName === 'Dr(a). Advogado(a) Titular') {
        this.state.settings.lawyerName = authUser.displayName;
      }
    }
    const authOabNumber = String(authUser?.oab || '').trim().toUpperCase().replace(/\s+/g, '');
    const authOabUf = String(authUser?.oabUf || '').trim().toUpperCase();
    const primaryTerm = this.state.terms.find(term => term?.primary !== false) || this.state.terms[0];
    const primaryRegistration = String(primaryTerm?.registration || '');
    const primaryIsPlaceholder = primaryTerm && !primaryTerm.oabNumber
      && (!primaryRegistration || /OAB\/UF\s+000000/i.test(primaryRegistration));
    if (authUser?.judicialMonitoringEnabled !== false && authOabNumber && /^[A-Z]{2}$/.test(authOabUf) && primaryIsPlaceholder) {
      primaryTerm.name = authUser.displayName || primaryTerm.name;
      primaryTerm.registration = `OAB/${authOabUf} ${authOabNumber}`;
      primaryTerm.oabNumber = authOabNumber;
      primaryTerm.oabUf = authOabUf;
      primaryTerm.active = true;
      primaryTerm.primary = true;
      if (!this.state.settings.lawyerOab || /OAB\/UF\s+000000/i.test(this.state.settings.lawyerOab)) {
        this.state.settings.lawyerOab = primaryTerm.registration;
      }
      if (!this.state.settings.lawyerEmail && authUser.email) this.state.settings.lawyerEmail = authUser.email;
    }

    // Reconciliação e higienização automática de clientes reais nos processos, tarefas e intimações
    const isGenericClient = (c) => !c || /^(?:cliente\s+)?(?:geral|n[aã]o\s+informado|n[aã]o\s+identificado|modelo|do\s+escrit[oó]rio|sigilo|n\/?i|sem\s+cliente)$/i.test(String(c).trim());
    (this.state.processes || []).forEach(proc => {
      if (isGenericClient(proc.client)) {
        if (proc.author && !isGenericClient(proc.author)) proc.client = proc.author;
        else if (proc.clientName && !isGenericClient(proc.clientName)) proc.client = proc.clientName;
      }
    });
    (this.state.tasks || []).forEach(task => {
      if (isGenericClient(task.client)) {
        const taskCnjNorm = String(task.process || task.processNumber || '').replace(/\D/g, '');
        const proc = (this.state.processes || []).find(p => (task.processId && String(p.id) === String(task.processId)) || (taskCnjNorm && String(p.number || '').replace(/\D/g, '') === taskCnjNorm));
        if (proc && !isGenericClient(proc.client)) {
          task.client = proc.client;
          if (!task.processId && proc.id) task.processId = proc.id;
        }
      }
    });
    (this.state.intimations || []).forEach(item => {
      if (isGenericClient(item.client)) {
        const itemCnjNorm = String(item.process || item.processNumber || '').replace(/\D/g, '');
        const proc = (this.state.processes || []).find(p => (item.processId && String(p.id) === String(item.processId)) || (itemCnjNorm && String(p.number || '').replace(/\D/g, '') === itemCnjNorm));
        if (proc && !isGenericClient(proc.client)) {
          item.client = proc.client;
          if (!item.processId && proc.id) item.processId = proc.id;
        }
      }
    });
  },
  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.enqueueFlush();
    }, 250);
  },
  enqueueFlush() {
    this.flushPromise = this.flushPromise.then(() => this.flushRequest(), () => this.flushRequest());
    return this.flushPromise;
  },
  /**
   * Adota a revisão que o servidor devolveu numa mutação feita por rota própria (fusão de
   * duplicatas, providência de publicação, tratamento). Sem isso o próximo flush mandava a
   * revisão antiga, o servidor respondia 409 e a interface recarregava a página no meio do
   * trabalho — exatamente o que o operador apontou na fusão de duplicatas.
   */
  adoptServerRevision(revision) {
    if (revision === undefined || revision === null || revision === '') return this.revision;
    this.revision = revision;
    this.state && (this.state.revision = revision);
    this.persistedFingerprint = this.persistenceFingerprint();
    return this.revision;
  },
  flush() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    return this.enqueueFlush();
  },
  persistenceFingerprint() {
    if (!this.state || typeof this.state !== 'object') return null;
    const { documents, communications, ...clientState } = this.state;
    return JSON.stringify(clientState);
  },
  async canonicalMutation(operation, { canApply = () => true } = {}) {
    if (this.canonicalRefreshPending || await this.flush() !== true) return { ok: false, reason: 'flush' };
    const execute = async () => {
      if (this.canonicalRefreshPending || this.persistenceFingerprint() !== this.persistedFingerprint) return { ok: false, reason: 'pending' };
      const expectedFingerprint = this.persistenceFingerprint();
      const expectedRevision = this.revision;
      try {
        const result = await operation(expectedRevision);
        this.canonicalRefreshPending = true;
        this.canonicalRefreshSourceRevision = result?.sourceRevision || expectedRevision;
        const refreshed = await this.load({ expectedFingerprint, expectedRevision, canApply });
        return { ok: refreshed === true, reason: refreshed === true ? null : 'refresh', result };
      } catch (error) {
        this.canonicalRefreshPending = true;
        this.canonicalRefreshSourceRevision ||= expectedRevision;
        throw error;
      }
    };
    const operationPromise = this.flushPromise.then(execute, execute);
    this.flushPromise = operationPromise.then(() => true, () => false);
    return operationPromise;
  },
  async refreshCanonicalState({ discardConfirmed = false, expectedFingerprint, expectedRevision, canApply = () => true } = {}) {
    const execute = async () => {
      const fingerprint = this.persistenceFingerprint();
      if (!canApply()) return false;
      if (discardConfirmed) {
        if (!this.canonicalRefreshPending || expectedFingerprint !== fingerprint || expectedRevision !== this.revision) return false;
      } else if (fingerprint !== this.persistedFingerprint) return false;
      const snapshot = { state: deepClone(this.state), revision: this.revision, stateStatus: this.stateStatus, serverMeta: this.serverMeta, persistedFingerprint: this.persistedFingerprint, canonicalRefreshPending: this.canonicalRefreshPending, canonicalRefreshSourceRevision: this.canonicalRefreshSourceRevision };
      try {
        return await this.load({ expectedFingerprint: fingerprint, expectedRevision: this.revision, canApply });
      } catch {
        Object.assign(this, snapshot);
        return false;
      }
    };
    const refreshPromise = this.flushPromise.then(execute, execute);
    this.flushPromise = refreshPromise.then(() => true, () => false);
    return refreshPromise;
  },
  async flushRequest() {
    const result = await this.performFlush();
    this.lastFlush = result;
    return result.ok;
  },
  /**
   * Flush que também devolve o que o servidor descartou. O `flush()` continua booleano
   * porque dezenas de fluxos comparam `=== true`; quem precisa saber se o financeiro foi
   * revertido usa este caminho e não finge sucesso.
   */
  async flushWithResult() {
    // Descarta o resultado de um flush anterior: sem isso, um `flush` interceptado (teste
    // ou wrapper) devolveria o anúncio antigo como se fosse deste pedido.
    this.lastFlush = null;
    const ok = await this.flush();
    if (!ok) return { ok: false, discardedCollections: [] };
    const last = this.lastFlush;
    return {
      ok: true,
      discardedCollections: Array.isArray(last?.discardedCollections) ? [...last.discardedCollections] : []
    };
  },
  async performFlush() {
    if (this.canonicalRefreshPending) {
      globalThis.dispatchEvent(new CustomEvent(STORE_PERSISTENCE_CONFLICT_EVENT, {
        detail: Object.freeze({ message: 'Atualização oficial pendente: alterações locais preservadas. Resolva o conflito antes de salvar.' })
      }));
      return { ok: false, discardedCollections: [], reason: 'conflict' };
    }
    let sent = this.persistenceFingerprint();
    if (this.persistedFingerprint != null && sent != null && sent === this.persistedFingerprint) {
      return { ok: true, discardedCollections: [], revision: this.revision };
    }
    try {
      let response = await persistState(this.state, this.revision);
      for (let attempt = 0; response.status === 409 && attempt < 3; attempt += 1) {
        if (!(await this.rebaseOnServerState())) break;
        sent = this.persistenceFingerprint();
        response = await persistState(this.state, this.revision);
      }
      if (response.status === 409) {
        globalThis.dispatchEvent(new CustomEvent(STORE_PERSISTENCE_CONFLICT_EVENT, {
          detail: Object.freeze({ message: 'Não foi possível salvar: o mesmo dado mudou em outro lugar. Suas alterações continuam nesta tela. Copie o que precisar e recarregue a página.' })
        }));
        return { ok: false, discardedCollections: [], reason: 'conflict' };
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const detail = persistenceFailureDetail(response.status, payload?.message);
        throw Object.assign(new Error(detail.message), { persistenceDetail: detail });
      }
      const payload = await response.json().catch(() => ({}));
      this.revision = payload.revision || this.revision;
      localStorage.removeItem(STORAGE_KEY);
      this.persistedFingerprint = sent;
      // O servidor grava o flush inteiro, mas pode devolver coleções à versão oficial
      // (ex.: financeiro sem `finance.write`). Repassar isso é o que impede a tela de
      // anunciar sucesso de uma gravação que não aconteceu.
      const discardedCollections = Array.isArray(payload.discardedCollections)
        ? payload.discardedCollections.filter(name => typeof name === 'string')
        : [];
      return { ok: true, discardedCollections, revision: this.revision };
    } catch (error) {
      const detail = error?.persistenceDetail || persistenceFailureDetail(null, '');
      if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
        globalThis.dispatchEvent(new CustomEvent(ATRIUM_STORE_PERSISTENCE_ERROR_EVENT, {
          detail: Object.freeze(detail)
        }));
      }
      return { ok: false, discardedCollections: [], reason: 'error' };
    }
  },
  /**
   * Conflito de revisão: busca o estado novo e reaplica nele o que mudou nesta tela.
   * Sem base conhecida ou sem resposta do servidor, nada é trocado e o conflito é informado.
   */
  async rebaseOnServerState() {
    if (!this.persistedFingerprint) return false;
    try {
      const response = await fetchState();
      if (!response.ok) return false;
      const fresh = await response.json();
      // Mesma revisão: não há nada novo para reaplicar, e repetir só daria a mesma recusa.
      if (!fresh?.state || !fresh.revision || fresh.revision === this.revision) return false;
      const localState = this.state;
      const base = JSON.parse(this.persistedFingerprint);
      try {
        this.state = fresh.state;
        this.ensureShape();
        const { documents, communications, ...theirs } = this.state;
        const nextFingerprint = this.persistenceFingerprint();
        const { documents: localDocuments, communications: localCommunications, ...mine } = localState;
        const { state: rebased, conflicts } = rebaseClientState({ base, mine, theirs });
        if (conflicts.length) {
          this.state = localState;
          return false;
        }
        this.state = { ...rebased, documents: documents ?? localDocuments, communications: communications ?? localCommunications };
        this.revision = fresh.revision;
        this.persistedFingerprint = nextFingerprint;
        return true;
      } catch {
        this.state = localState;
        return false;
      }
    } catch {
      return false;
    }
  },
  audit(action, detail, actor = 'Advogado') {
    const author = globalThis.KellerAuth?.currentUser?.displayName || actor;
    const entry = { id: uid('audit'), at: new Date().toISOString(), action, detail, actor: author };
    this.state.audit.unshift(entry);
    this.state.audit = this.state.audit.slice(0, 250);
    this.save();
    return entry;
  },
  upsert(collection, record, externalKey = 'id') {
    const index = this.state[collection].findIndex(item => item[externalKey] === record[externalKey]);
    if (index >= 0) this.state[collection][index] = { ...this.state[collection][index], ...record };
    else this.state[collection].unshift(record);
    this.save();
    return record;
  }
};

function persistenceFailureDetail(status, backendMessage) {
  const safeBackendMessage = String(backendMessage || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 180);
  const numericStatus = Number.isInteger(Number(status)) && Number(status) > 0 ? Number(status) : null;
  let reason;
  if (numericStatus === 400) reason = safeBackendMessage || 'o estado é incompatível com a versão atual.';
  else if (numericStatus === 401) reason = 'a sessão expirou. Entre novamente antes de salvar.';
  else if (numericStatus === 403) reason = 'a sessão atual não tem permissão para gravar.';
  else if (numericStatus === 413) reason = 'os dados excedem o limite seguro de persistência.';
  else if (numericStatus === 423) reason = 'o sistema está em modo de recuperação e bloqueou a gravação.';
  else if (numericStatus && numericStatus >= 500) reason = 'o servidor não conseguiu concluir a gravação.';
  else if (numericStatus) reason = safeBackendMessage || `o servidor recusou a gravação (HTTP ${numericStatus}).`;
  else reason = 'falha de conexão com o servidor.';
  return {
    message: `Não foi possível salvar: ${reason}`,
    status: numericStatus,
    reason
  };
}
