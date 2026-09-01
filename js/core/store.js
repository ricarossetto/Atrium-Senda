import { fetchState, importLegacyState, persistState } from './api.js';

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

const sampleState = {
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
    { id: 'a1', name: 'Portais com certificado A1 / PJe', short: 'A1', method: 'Agente local seguro', status: 'off', lastCheck: null, detail: 'Integração direta com tribunais' }
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
  configuration: {
    users: [], monitoredTerms: [], taskDefinitions: [], actionGroups: [], actionTypes: [], stages: [], goals: [], origins: [], partners: [], inboxSections: [], notificationAssignments: [], integrations: [], sourceProducts: []
  },
  agenda: [
    { id: 'agenda-demo-1', title: 'Audiência de conciliação / instrução', date: isoDate(1), time: '09:30', source: 'Interna', client: 'Cliente Modelo', process: '0000000-00.2026.8.21.0000' },
    { id: 'agenda-demo-2', title: 'Prazo fatal para recurso', date: isoDate(4), time: '17:00', source: 'Demonstração', client: 'Processo de demonstração', process: '5000000-00.2026.4.04.0000' }
  ],
  audit: [
    { id: 'audit-initial', at: new Date().toISOString(), action: 'Atrium Senda inicializado', detail: 'Ambiente pronto para uso com registros de demonstração.', actor: 'Sistema' }
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
  async load() {
    let persisted = null;
    let serverPayload = null;
    try {
      const response = await fetchState();
      if (response.ok) {
        serverPayload = await response.json();
        persisted = serverPayload.state;
        this.revision = serverPayload.revision || null;
        this.stateStatus = serverPayload.stateStatus || 'READY';
        this.serverMeta = {
          appVersion: serverPayload.appVersion,
          buildId: serverPayload.buildId,
          schemaVersion: serverPayload.schemaVersion,
          dataVersion: serverPayload.dataVersion
        };
      }
    } catch { /* servidor indisponível — modo offline seguro */ }

    if (this.stateStatus === 'RECOVERY_REQUIRED' || this.stateStatus === 'FUTURE_SCHEMA_ERROR') {
      this.recoveryDetails = serverPayload?.recoveryDetails || null;
      this.state = deepClone(sampleState);
      this.state.settings.demoMode = true;
      this.ensureShape({ seedConfigurationDefaults: true });
      return;
    }

    if (!persisted && this.stateStatus === 'NEW_INSTALL') {
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
      const schemaVersion = Number(this.serverMeta?.schemaVersion);
      const dataVersion = Number(this.serverMeta?.dataVersion);
      if (Number.isInteger(schemaVersion) && schemaVersion > 0) {
        this.state.schemaVersion = schemaVersion;
        this.state.dataVersion = Number.isInteger(dataVersion) && dataVersion > 0 ? dataVersion : schemaVersion;
      }
    } else {
      this.state = persisted;
    }
    this.ensureShape({ seedConfigurationDefaults });
    this.save();
  },
  ensureShape({ seedConfigurationDefaults = false } = {}) {
    ['terms', 'sources', 'intimations', 'tasks', 'processes', 'agenda', 'audit', 'contacts', 'documents', 'leads', 'customPrompts', 'customLinks'].forEach(key => {
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
        { id: 'a1', name: 'Portais com certificado A1 / PJe', short: 'A1', method: 'Agente local seguro', status: 'off', lastCheck: null, detail: 'Integração direta com tribunais' }
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
  flush() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    return this.enqueueFlush();
  },
  async flushRequest() {
    try {
      const response = await persistState(this.state, this.revision);
      if (response.status === 409) {
        globalThis.dispatchEvent(new CustomEvent(STORE_PERSISTENCE_CONFLICT_EVENT, {
          detail: Object.freeze({ message: 'Os dados foram atualizados em outra aba. Recarregando a versão mais recente…' })
        }));
        setTimeout(() => globalThis.location.reload(), 700);
        return false;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const detail = persistenceFailureDetail(response.status, payload?.message);
        throw Object.assign(new Error(detail.message), { persistenceDetail: detail });
      }
      this.revision = (await response.json()).revision || this.revision;
      localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (error) {
      const detail = error?.persistenceDetail || persistenceFailureDetail(null, '');
      if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
        globalThis.dispatchEvent(new CustomEvent(ATRIUM_STORE_PERSISTENCE_ERROR_EVENT, {
          detail: Object.freeze(detail)
        }));
      }
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
