import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

export const UI_V2_CANONICAL_VIEWS = Object.freeze([
  'dashboard', 'processes', 'inbox', 'kanban', 'agenda', 'contacts', 'leads',
  'financial', 'documents', 'assistant', 'prompts', 'monitoring', 'integrations',
  'configuration', 'importer', 'audit', 'links'
]);

export const UI_V2_PRIMARY_NAV_VIEWS = Object.freeze(
  UI_V2_CANONICAL_VIEWS.filter(view => view !== 'audit')
);

export const UI_V2_OVERLAY_SELECTORS = Object.freeze([
  '#modalBackdrop:not(.hidden)', '#processInspectorBackdrop:not(.hidden)',
  '#publicationInspectorBackdrop:not(.hidden)', '#taskInspectorBackdrop:not(.hidden)',
  '#agendaInspectorBackdrop:not(.hidden)', '#contactInspectorBackdrop:not(.hidden)',
  '#financialInspectorBackdrop:not(.hidden)', '#geminiKeyBackdrop:not(.hidden)'
]);

export async function switchUiV2View(page, view) {
  await page.evaluate(selectedView => window.Atrium.App.switchView(selectedView), view);
  await page.locator(`#view-${view}.active`).waitFor();
  await page.waitForFunction(selectedView => {
    const active = [...document.querySelectorAll('.view.active')];
    return active.length === 1 && active[0]?.id === `view-${selectedView}`;
  }, view);
}

export async function collectUiV2LayoutEvidence(page) {
  return page.evaluate(overlaySelectors => {
    const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
    const visibleOverlays = overlaySelectors.filter(selector => document.querySelector(selector)?.getClientRects().length);
    return {
      activeViews: [...document.querySelectorAll('.view.active')].map(element => element.id),
      navItems: document.querySelectorAll('.nav-item[data-view]').length,
      navGroups: document.querySelectorAll('nav[data-v2-nav-group]').length,
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      globalOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      visibleOverlays
    };
  }, UI_V2_OVERLAY_SELECTORS);
}

export async function startUiV2Session({ viewport = { width: 1440, height: 900 } } = {}) {
  const server = await startTestServer();
  const browser = await chromium.launch({ headless: true });
  const password = 'Senha-UI-V2-2026!';
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_ui_v2',
    displayName: 'Advogada Teste UI V2',
    password
  });
  const setup = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  const sessionCookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!sessionCookie) throw new Error('A sessão sintética da UI V2 não foi criada.');
  const [name, value] = sessionCookie.split('=');

  async function createContext(options = {}) {
    const context = await browser.newContext({
      viewport: options.viewport || viewport,
      locale: 'pt-BR',
      deviceScaleFactor: 1,
      reducedMotion: options.reducedMotion
    });
    await context.addCookies([{ name, value, domain: '127.0.0.1', path: '/' }]);
    return context;
  }

  async function stop() {
    await browser.close();
    await server.stop();
  }

  return Object.freeze({ server, browser, createContext, stop });
}

export async function prepareUiV2Page(context, baseUrl, { theme = 'light', probe = false } = {}) {
  await context.addInitScript(({ selectedTheme, installProbe }) => {
    localStorage.setItem('atrium:ui:mode', 'v2');
    localStorage.setItem('atrium_theme', selectedTheme);
    localStorage.setItem('atrium_tour_seen', 'true');
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('jurisflow_tour_completed', 'true');
    if (!installProbe) return;
    const runtimeProbe = { mutationRequests: [], intervals: 0, listeners: {} };
    globalThis.__uiV2RuntimeProbe = runtimeProbe;
    const nativeFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = async (input, init = {}) => {
      const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        runtimeProbe.mutationRequests.push({ method, url: String(input?.url || input) });
      }
      return nativeFetch(input, init);
    };
    const nativeSetInterval = globalThis.setInterval.bind(globalThis);
    globalThis.setInterval = (...args) => {
      runtimeProbe.intervals++;
      return nativeSetInterval(...args);
    };
    const nativeAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      const target = this === document ? 'document' : this === globalThis ? 'window' : this?.id;
      if (target && ['document', 'window', 'uiModeControl', 'sidebarScrim', 'menuToggle', 'btnNewLink', 'customLinksGrid'].includes(target)) {
        const key = `${target}:${type}`;
        runtimeProbe.listeners[key] = (runtimeProbe.listeners[key] || 0) + 1;
      }
      return nativeAddEventListener.call(this, type, listener, options);
    };
  }, { selectedTheme: theme, installProbe: probe });

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const response = await page.goto(baseUrl, { waitUntil: 'networkidle' });
  if (!response?.ok()) throw new Error(`O portal UI V2 não carregou: HTTP ${response?.status()}.`);
  await page.locator('#appShell:not(.hidden)').waitFor();
  await page.locator('#view-dashboard.active').waitFor();
  return { page, pageErrors };
}

export const UI_V2_IMPORTER_FIXTURE = Object.freeze({
  filename: 'lote-supervisionado-sintetico.csv',
  totalRows: 4,
  preview: Object.freeze([
    Object.freeze({ 'Número CNJ': '5000000-00.2026.8.21.0001', Cliente: 'Cliente Mineral Sintético', Tribunal: 'TJ Sintético', Observação: '<script>não executar</script>' }),
    Object.freeze({ 'Número CNJ': '5000000-00.2026.8.21.0002', Cliente: 'Pessoa Teste de Nome Extenso para Contenção', Tribunal: 'TRF Sintético', Observação: '<img src=x onerror=alert(1)>' }),
    Object.freeze({ 'Número CNJ': '—', Cliente: 'Contato Sintético', Tribunal: '—', Observação: 'Revisão profissional obrigatória' }),
    Object.freeze({ 'Número CNJ': '5000000-00.2026.8.21.0004', Cliente: 'Cliente Teste', Tribunal: 'TJ Sintético', Observação: 'Dado informado sem inferência de prazo fatal' })
  ]),
  processes: Object.freeze([{ externalId: 'import-process-v2', number: '5000000-00.2026.8.21.0001', client: 'Cliente Mineral Sintético', court: 'TJ Sintético', source: 'Importação' }]),
  contacts: Object.freeze([{ externalId: 'import-contact-v2', name: 'Contato Mineral Sintético', document: 'DOCUMENTO-SINTETICO-IMPORT-001', source: 'Importação' }]),
  tasks: Object.freeze([{ externalId: 'import-task-v2', title: 'Revisar lote sintético', deadline: '2026-09-10', fatalDeadline: '', source: 'Importação' }])
});

export async function prepareUiV2ImporterFixture(page, { preview = false, data = UI_V2_IMPORTER_FIXTURE } = {}) {
  await page.evaluate(({ fixture, shouldPreview }) => {
    const { App, Store } = window.Atrium;
    const clone = value => structuredClone(value);
    const originalSecureFetch = window.KellerAuth.secureFetch.bind(window.KellerAuth);
    const originalToast = App.toast.bind(App);
    const originalRenderAll = App.renderAll.bind(App);
    const originalSwitchView = App.switchView.bind(App);

    window.__uiV2ImporterRequests = [];
    window.__uiV2ImporterOps = [];
    window.__uiV2ImporterToasts = [];
    window.__uiV2ImporterFlushResult = true;
    window.__uiV2ImporterFixture = clone(fixture);

    window.KellerAuth.secureFetch = async (url, options = {}) => {
      if (url !== '/api/import/spreadsheet') return originalSecureFetch(url, options);
      const request = {
        url: String(url),
        method: options.method || 'GET',
        headers: clone(options.headers || {}),
        body: options.body ? JSON.parse(options.body) : undefined
      };
      window.__uiV2ImporterRequests.push(request);
      return { ok: true, async json() { return clone(window.__uiV2ImporterFixture); } };
    };

    Store.state.processes = [];
    Store.state.contacts = [];
    Store.state.tasks = [];
    Store.state.audit = [];
    Store.audit = (action, detail) => {
      window.__uiV2ImporterOps.push({ type: 'audit', action, detail });
      Store.state.audit.unshift({ id: `audit-${window.__uiV2ImporterOps.length}`, action, detail });
    };
    Store.save = () => { window.__uiV2ImporterOps.push({ type: 'save' }); };
    Store.flush = async () => {
      window.__uiV2ImporterOps.push({ type: 'flush' });
      return window.__uiV2ImporterFlushResult;
    };
    App.toast = (message, type) => {
      window.__uiV2ImporterToasts.push({ message, type });
      window.__uiV2ImporterOps.push({ type: 'toast', message, toastType: type });
      return originalToast(message, type);
    };

    App.importedSpreadsheetData = null;
    App.switchView('importer');
    App.renderAll = (...args) => {
      window.__uiV2ImporterOps.push({ type: 'render' });
      return originalRenderAll(...args);
    };
    App.switchView = (view, ...args) => {
      window.__uiV2ImporterOps.push({ type: 'switch', view });
      return originalSwitchView(view, ...args);
    };

    if (shouldPreview) {
      App.importedSpreadsheetData = clone(fixture);
      App.renderSpreadsheetPreview(clone(fixture));
    }
  }, { fixture: data, shouldPreview: preview });

  await page.locator('#view-importer.active').waitFor();
  if (preview) await page.locator('#importerPreviewCard:not(.hidden)').waitFor();
  return structuredClone(data);
}

export const UI_V2_AUDIT_FIXTURE = Object.freeze([
  Object.freeze({ id: 'audit-security-v2', at: '2026-08-31T08:00:00.000Z', actor: 'Administradora Sintética', action: 'Login autorizado', detail: 'Sessão local validada com autenticação reforçada.' }),
  Object.freeze({ id: 'audit-sync-v2', at: '2026-08-31T08:35:00.000Z', actor: 'Agente Coletor', action: 'Sincronização DJEN concluída', detail: 'Consulta oficial sob demanda concluída sem ciência automática.' }),
  Object.freeze({ id: 'audit-import-v2', at: '2026-08-31T09:10:00.000Z', actor: 'Equipe de Dados', action: 'Importação de planilha concluída', detail: 'Lote sintético revisado e confirmado por pessoa responsável.' }),
  Object.freeze({ id: 'audit-task-v2', at: '2026-08-31T10:20:00.000Z', actor: 'Advogada Teste', action: 'Tarefa criada', detail: 'Revisar publicação sintética; prazo informado manualmente.' }),
  Object.freeze({ id: 'audit-process-v2', at: '2026-08-31T11:45:00.000Z', actor: 'Sistema', action: 'Processo atualizado', detail: 'Metadados do caso sintético preservados sem inferência de prazo.' }),
  Object.freeze({ id: 'audit-config-v2', at: '2026-08-31T13:05:00.000Z', actor: 'Responsável com nome extenso para teste de contenção visual', action: 'Configuração institucional atualizada com descrição extensa', detail: '<script>não executar</script> <img src=x onerror=alert(1)> Conteúdo sintético longo para validar quebra, contraste e contenção sem transformar o registro em alerta ou prova externa.' })
]);

export async function prepareUiV2AuditFixture(page, { events = UI_V2_AUDIT_FIXTURE } = {}) {
  await page.evaluate(fixture => {
    const { App, Store } = window.Atrium;
    const clone = value => structuredClone(value);
    const originalToast = App.toast.bind(App);
    const originalExportJson = App.exportJson.bind(App);
    const originalSave = Store.save.bind(Store);
    const originalFlush = Store.flush.bind(Store);
    const originalAudit = Store.audit.bind(Store);

    Store.state.audit = clone(fixture);
    window.__uiV2AuditInitialState = clone(Store.state);
    window.__uiV2AuditOps = [];
    window.__uiV2AuditExports = [];
    window.__uiV2AuditToasts = [];

    Store.save = (...args) => {
      window.__uiV2AuditOps.push({ type: 'save' });
      return originalSave(...args);
    };
    Store.flush = (...args) => {
      window.__uiV2AuditOps.push({ type: 'flush' });
      return originalFlush(...args);
    };
    Store.audit = (...args) => {
      window.__uiV2AuditOps.push({ type: 'audit', args: clone(args) });
      return originalAudit(...args);
    };
    App.toast = (message, type) => {
      window.__uiV2AuditToasts.push({ message, type });
      return originalToast(message, type);
    };
    App.exportJson = (data, filename) => {
      window.__uiV2AuditExports.push({ data: clone(data), filename });
      return true;
    };
    window.__uiV2AuditRestore = () => {
      Store.save = originalSave;
      Store.flush = originalFlush;
      Store.audit = originalAudit;
      App.exportJson = originalExportJson;
    };

    App.auditFilter = 'all';
    const search = document.getElementById('auditSearch');
    if (search) search.value = '';
    App.switchView('audit');
    App.renderAudit('all', '');
  }, structuredClone(events));

  await page.locator('#view-audit.active').waitFor();
  await page.waitForFunction(expected => document.querySelectorAll('#auditList tbody tr').length === expected, events.length);
  return structuredClone(events);
}

export const UI_V2_LINKS_FIXTURE = Object.freeze([
  Object.freeze({
    id: 'link-synthetic-office',
    title: 'Pesquisa interna de legislação sintética',
    url: 'https://www.example.test/referencias/legislacao',
    category: 'Legislação',
    description: 'Referência sintética adicionada pela equipe para consultas recorrentes.',
    createdAt: '2026-08-31T08:00:00.000Z',
    updatedAt: '2026-08-31T08:00:00.000Z'
  }),
  Object.freeze({
    id: 'link-synthetic-long',
    title: 'Repositório sintético com título deliberadamente extenso para validar contenção editorial e leitura responsiva',
    url: 'https://www.reference-library.example.test/caminho/muito-longo/para/consulta',
    category: 'Ferramentas IA & Pesquisa',
    description: 'Descrição longa e inteiramente sintética para validar quebra de linha, domínio extenso e hierarquia sem ocultar conteúdo crítico do cartão personalizado.',
    createdAt: '2026-08-31T09:00:00.000Z',
    updatedAt: '2026-08-31T09:00:00.000Z'
  }),
  Object.freeze({
    id: 'link-synthetic-invalid',
    title: '<script>alert(1)</script>',
    url: 'data:text/html,<img src=x onerror=alert(1)>',
    category: 'Outros & <teste>',
    description: '<img src=x onerror=alert(1)>',
    createdAt: '2026-08-31T10:00:00.000Z',
    updatedAt: '2026-08-31T10:00:00.000Z'
  })
]);

export async function prepareUiV2LinksFixture(page, { links = UI_V2_LINKS_FIXTURE } = {}) {
  await page.evaluate(fixture => {
    const { App, Store } = window.Atrium;
    const clone = value => structuredClone(value);
    const originalToast = App.toast.bind(App);
    const originalSave = Store.save.bind(Store);
    const originalFlush = Store.flush.bind(Store);
    const originalAudit = Store.audit.bind(Store);

    Store.state.customLinks = clone(fixture);
    Store.state.audit = [];
    window.__uiV2LinksInitialState = clone(Store.state);
    window.__uiV2LinksOps = [];
    window.__uiV2LinksToasts = [];
    window.__uiV2LinksFlushResult = true;

    Store.save = () => { window.__uiV2LinksOps.push({ type: 'save' }); };
    Store.flush = async () => {
      window.__uiV2LinksOps.push({ type: 'flush' });
      return window.__uiV2LinksFlushResult;
    };
    Store.audit = (action, detail, actor = 'Advogado') => {
      const entry = { id: `audit-links-${Store.state.audit.length + 1}`, at: new Date().toISOString(), actor, action, detail };
      Store.state.audit.unshift(entry);
      window.__uiV2LinksOps.push({ type: 'audit', action, detail });
      return entry;
    };
    App.toast = (message, type) => {
      window.__uiV2LinksToasts.push({ message, type });
      return originalToast(message, type);
    };
    window.__uiV2LinksRestore = () => {
      Store.save = originalSave;
      Store.flush = originalFlush;
      Store.audit = originalAudit;
    };

    App.switchView('links');
    App.renderLinks();
  }, structuredClone(links));

  await page.locator('#view-links.active').waitFor();
  await page.waitForFunction(expected => document.querySelectorAll('#customLinksGrid .custom-link-card').length === expected, links.length);
  return structuredClone(links);
}

export const UI_V2_CONFIGURATION_ADMIN_DIAGNOSTIC = Object.freeze({
  app: Object.freeze({ name: 'ATRIUM Sintético', version: '2.0.0', uptimeSeconds: 1260, nodeVersion: '24.0.0', platform: 'synthetic', arch: 'x64', cloudMode: false }),
  storage: Object.freeze({ type: 'Estado cifrado local', records: Object.freeze({ contacts: 12, processes: 8, tasks: 19, intimations: 31 }), sizeBytes: 16384 }),
  security: Object.freeze({ encryption: 'AES-256-GCM', twoFactor: 'TOTP RFC 6238', totalUsers: 4 }),
  integrations: Object.freeze({
    djen: Object.freeze({ status: 'conectado', description: 'Consulta oficial sob demanda' }),
    datajud: Object.freeze({ status: 'configurado' }),
    gemini: Object.freeze({ status: 'configurado' }),
    collector: Object.freeze({ lastRun: '2026-08-31T14:30:00.000Z' })
  }),
  runtime: Object.freeze({ status: 'READY', recoveryDetails: null, fileExists: true, lastRuntimeUpdate: '2026-08-31T14:30:00.000Z' })
});

export async function prepareUiV2ConfigurationAdminFixture(page, {
  role = 'master_admin',
  runtimeStatus = 'READY',
  withLogo = false
} = {}) {
  await page.evaluate(({ currentRole, currentRuntimeStatus, includeLogo, diagnosticFixture }) => {
    const store = window.Atrium.Store;
    const app = window.Atrium.App;
    const clone = value => structuredClone(value);
    const response = (payload = {}, ok = true) => ({ ok, async json() { return clone(payload); } });
    const authUsers = [
      { id: 'master-admin-synthetic', username: 'master.synthetic', displayName: 'Administradora Mestre Sintética', email: 'master@synthetic.example.test', role: 'master_admin', status: 'active' },
      { id: 'pending-user-synthetic', username: 'pending.synthetic', displayName: 'Usuária Pendente Sintética', email: 'pending@synthetic.example.test', role: 'collaborator', status: 'pending_approval' },
      { id: 'active-user-synthetic', username: 'active.synthetic', displayName: 'Usuária Ativa Sintética', email: 'active@synthetic.example.test', role: 'collaborator', status: 'active' },
      { id: 'inactive-user-synthetic', username: 'inactive.synthetic', displayName: 'Usuária Suspensa Sintética', email: 'inactive@synthetic.example.test', role: 'collaborator', status: 'inactive' }
    ];
    const configuration = {
      taskDefinitions: [
        { name: 'Revisar publicação sintética', points: 12, phase: 'Triagem' },
        { name: 'Preparar minuta sintética', points: 28, phase: 'Redação' }
      ],
      users: [{ name: 'Usuária Estrutural Sintética', role: 'Colaboradora', pointsGoal: '120' }],
      actionGroups: [
        { name: 'Previdenciário sintético', publicationResponsible: 'Equipe Previdenciária' },
        { name: 'Cível sintético', publicationResponsible: 'Equipe Cível' }
      ],
      actionTypes: [{ name: 'Ação de conhecimento sintética', group: 'Cível sintético' }],
      stages: [{ name: 'Instrução sintética', classification: 'Ativa', phase: 'Conhecimento' }],
      origins: [{ name: 'Indicação sintética' }],
      goals: [{ group: 'Equipe Previdenciária', monthlyClosings: 8 }],
      inboxSections: ['Prioridade sintética', 'Acompanhamento sintético'],
      notificationAssignments: [{ event: 'Nova publicação sintética', responsibles: ['Advogada Teste', 'Equipe Sintética'] }],
      integrations: [{ name: 'Integração sintética', status: 'Ativa', method: 'API' }]
    };

    window.__uiV2ConfigurationAdminRequests = [];
    window.__uiV2ConfigurationAdminToasts = [];
    window.__uiV2ConfigurationAdminOps = [];
    window.__uiV2ConfigurationAdminAuthUsers = authUsers;
    const originalSecureFetch = window.KellerAuth.secureFetch.bind(window.KellerAuth);
    const originalFetch = window.fetch.bind(window);
    const originalToast = app.toast.bind(app);
    const safeRequest = (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : undefined;
      const record = { url: String(url), method: options.method || 'GET', body };
      window.__uiV2ConfigurationAdminRequests.push(record);
      return record;
    };
    window.KellerAuth.secureFetch = async (url, options = {}) => {
      const request = safeRequest(url, options);
      if (url === '/api/auth/users') return response({ currentRole, users: authUsers });
      if (url === '/api/auth/users/manage') return response({ ok: true });
      if (url === '/api/system/rebuild-runtime') return response({ ok: true, message: 'Runtime sintético reconstruído.' });
      if (url === '/api/system/backup/create') return response({
        ok: true,
        fileName: 'atrium-synthetic.atrium-backup',
        backupData: { format: 'atrium-encrypted-backup-v1', encryptedState: { iv: 'synthetic', tag: 'synthetic', ciphertext: 'synthetic' }, checksum: '0'.repeat(64) }
      });
      if (url === '/api/system/backup/restore') return response({ ok: true });
      if (url === '/api/system/feedback') return response({ ok: true, received: request.body });
      return originalSecureFetch(url, options);
    };
    window.fetch = async (input, options = {}) => {
      const url = String(input?.url || input);
      if (url === '/api/system/diagnostic') {
        safeRequest(url, options);
        const diagnostic = clone(diagnosticFixture);
        diagnostic.runtime.status = currentRuntimeStatus;
        return response({ ok: true, diagnostic });
      }
      return originalFetch(input, options);
    };
    app.toast = (message, type) => {
      window.__uiV2ConfigurationAdminToasts.push({ message, type });
      return originalToast(message, type);
    };
    store.state.configuration = configuration;
    store.state.contacts = Array.from({ length: 12 }, (_, index) => ({ id: `contact-admin-${index}` }));
    store.state.settings ||= {};
    Object.assign(store.state.settings, {
      officeName: 'Escritório Mineral Sintético',
      officeSlogan: 'Precisão jurídica, presença humana',
      lawyerName: 'Advogada Teste',
      lawyerOab: 'OAB/RS 000000',
      lawyerAddress: 'Rua Mineral Sintética, 100',
      city: 'Ijuí / RS',
      officeLogo: includeLogo ? 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22%3E%3Crect width=%22120%22 height=%22120%22 fill=%22%23596c7a%22/%3E%3Ctext x=%2260%22 y=%2272%22 text-anchor=%22middle%22 fill=%22white%22 font-size=%2240%22%3EAM%3C/text%3E%3C/svg%3E' : null
    });
    store.state.terms ||= [{ id: 'term-office-synthetic', name: 'Advogada Teste', registration: 'OAB/RS 000000' }];
    store.serverMeta = { appVersion: '2.0.0-synthetic', buildId: 'build-gate-18', schemaVersion: 9 };
    store.stateStatus = currentRuntimeStatus === 'READY' ? 'READY' : 'ATTENTION';
    store.save = () => { window.__uiV2ConfigurationAdminOps.push({ type: 'save' }); };
    store.audit = (action, detail) => { window.__uiV2ConfigurationAdminOps.push({ type: 'audit', action, detail }); };
    store.flush = async () => { window.__uiV2ConfigurationAdminOps.push({ type: 'flush' }); return true; };
    app.authUsers = clone(authUsers);
    app.currentAuthRole = currentRole;
    app.configurationSection = 'taskDefinitions';
    app.renderOfficeIdentity();
    app.switchView('configuration');
  }, {
    currentRole: role,
    currentRuntimeStatus: runtimeStatus,
    includeLogo: withLogo,
    diagnosticFixture: UI_V2_CONFIGURATION_ADMIN_DIAGNOSTIC
  });
  await page.locator('#view-configuration.active').waitFor();
  await page.locator('#configurationTabs [data-config-section="taskDefinitions"][aria-current="page"]').waitFor();
  return { role, runtimeStatus, withLogo };
}

export const UI_V2_JUDICIAL_STATUS = Object.freeze({
  certificate: {
    valid: true,
    accessible: true,
    status: 'operational',
    fileName: 'certificado-sintetico.pfx',
    summary: {
      holder: 'Titular Judicial Sintética',
      documentMasked: '***.123.***-**',
      issuer: 'AC Sintética, ICP-Brasil',
      notAfter: '2027-08-29T00:00:00.000Z'
    }
  },
  pjeOffice: { available: true },
  interactiveCollectorRunning: false,
  portals: [
    { id: 'tj-sintetico', name: 'Tribunal de Justiça Sintético', group: 'Justiça Estadual', enabled: true, supportsTotp: true, totpConfigured: true, system: 'PJe', automationLevel: 'stable', managed: { connectivityState: 'connected', verification: 'verified' } },
    { id: 'trf-sintetico', name: 'Tribunal Regional Sintético', group: 'Justiça Federal', enabled: true, supportsTotp: true, totpConfigured: false, system: 'eproc', automationLevel: 'experimental', managed: { connectivityState: 'action_required', verification: 'experimental' } },
    { id: 'tst-sintetico', name: 'Tribunal Superior Sintético', group: 'Tribunais superiores', enabled: false, supportsTotp: false, certificateMode: 'windows', automationLevel: 'stable', managed: { connectivityState: 'not_configured', verification: 'not_verified' } }
  ],
  managedCoverage: [
    { id: 'djen-cnj', name: 'DJEN / Comunica PJe', system: 'Comunica PJe', authStrategy: 'public', verification: 'verified', configured: true, connectivityState: 'connected', lastSuccessfulSyncAt: '2026-09-01T09:45:00.000Z', lastAttemptAt: '2026-09-01T09:45:00.000Z', nextRefreshAt: '2026-09-01T10:15:00.000Z', publicDetail: '7 publicação(ões) lida(s) para 1 OAB monitorada', lastError: null, humanAction: null, readOnly: true },
    { id: 'datajud-cnj', name: 'DataJud / CNJ', system: 'API pública', authStrategy: 'public', verification: 'verified', configured: true, connectivityState: 'connected', lastSuccessfulSyncAt: '2026-09-01T09:46:00.000Z', lastAttemptAt: '2026-09-01T09:46:00.000Z', nextRefreshAt: '2026-09-01T10:16:00.000Z', publicDetail: '3/3 processo(s) localizado(s); 3 atualizado(s)', lastError: null, humanAction: null, readOnly: true },
    { id: 'tj-sintetico', name: 'Tribunal de Justiça Sintético', system: 'PJe', authStrategy: 'pjeoffice-local', verification: 'verified', configured: true, connectivityState: 'connected', lastSuccessfulSyncAt: '2026-09-01T09:42:00.000Z', lastAttemptAt: '2026-09-01T09:42:00.000Z', nextRefreshAt: '2026-09-01T10:12:00.000Z', lastError: null, humanAction: null, readOnly: true },
    { id: 'trf-sintetico', name: 'Tribunal Regional Sintético', system: 'eproc', authStrategy: 'username-password-plus-totp', verification: 'experimental', configured: true, connectivityState: 'action_required', lastSuccessfulSyncAt: '2026-08-31T18:10:00.000Z', lastAttemptAt: '2026-09-01T09:30:00.000Z', nextRefreshAt: null, lastError: null, humanAction: 'Conclua o segundo fator no portal sintético.', readOnly: true },
    { id: 'tst-sintetico', name: 'Tribunal Superior Sintético', system: 'Portal judicial', authStrategy: 'windows-store', verification: 'not_verified', configured: false, connectivityState: 'not_configured', lastSuccessfulSyncAt: null, lastAttemptAt: null, nextRefreshAt: null, lastError: null, humanAction: null, readOnly: true }
  ],
  managedPolicy: { readOnly: true, cadence: 'conservative-with-backoff', humanSupervision: true, forbiddenAutomaticActions: ['science', 'signature', 'petition', 'protocol', 'acknowledgment', 'deadline-confirmation'] }
});

export async function prepareUiV2JudicialFixture(page, status = UI_V2_JUDICIAL_STATUS) {
  await page.evaluate(statusFixture => {
    window.__uiV2JudicialRequests = [];
    const originalSecureFetch = window.KellerAuth.secureFetch.bind(window.KellerAuth);
    const response = payload => ({ ok: true, async json() { return payload; } });
    window.KellerAuth.secureFetch = async (url, options = {}) => {
      if (!String(url).startsWith('/api/integrations/judicial')) return originalSecureFetch(url, options);
      window.__uiV2JudicialRequests.push({
        url,
        method: options.method || 'GET',
        body: options.body ? JSON.parse(options.body) : undefined
      });
      if (url === '/api/integrations/judicial') return response(statusFixture);
      if (url.endsWith('/reset')) return response({ certificatePreserved: true });
      if (url.endsWith('/a1/sandbox')) return response({ sandbox: { operational: true, steps: [{ id: 'pfxFile', name: 'Arquivo PFX', status: 'OK' }] } });
      return response({ ...statusFixture, ok: true });
    };
    window.Atrium.App.switchView('integrations');
  }, status);
  await page.locator('#view-integrations.active').waitFor();
  const hasManagedAction = status.managedCoverage?.some(item => item.connectivityState === 'action_required');
  const expectedStatus = hasManagedAction
    ? /ação/
    : status.certificate.valid ? /A1 Operacional|fonte/ : 'Configuração necessária';
  await page.locator('#certificateIntegrationStatus').filter({ hasText: expectedStatus }).waitFor();
  return status;
}

export const UI_V2_EMAIL_STATUS = Object.freeze({
  configured: true,
  host: 'smtp.synthetic.example.test',
  port: 465,
  secure: true,
  userMasked: 'co***@synthetic.example.test',
  fromName: 'Escritório Sintético',
  fromAddress: 'comunicacoes@synthetic.example.test',
  lastTestAt: '2026-08-30T12:00:00.000Z',
  lastTestStatus: 'success'
});

export const UI_V2_EMAIL_RECEIVERS = Object.freeze([
  Object.freeze({ id: 'receiver-internal', type: 'internal', userId: 'user-active', name: 'Advogada Interna Sintética', email: 'interna@synthetic.example.test', enabled: true, userStatus: 'active' }),
  Object.freeze({ id: 'receiver-external', type: 'external', name: 'Contabilidade Sintética', email: 'contabilidade@synthetic.example.test', enabled: false }),
  Object.freeze({ id: 'receiver-inactive', type: 'internal', userId: 'user-inactive', name: 'Usuário Inativo Sintético', email: 'inativo@synthetic.example.test', enabled: true, userStatus: 'inactive' })
]);

export async function prepareUiV2EmailCalendarFixture(page, {
  emailStatus = UI_V2_EMAIL_STATUS,
  receivers = UI_V2_EMAIL_RECEIVERS,
  role = 'master_admin',
  statusFailure = false
} = {}) {
  await page.evaluate(({ statusFixture, receiverFixtures, currentRole, failStatus }) => {
    window.__uiV2EmailCalendarRequests = [];
    window.__uiV2EmailCalendarToasts = [];
    window.__uiV2SmtpPasswordObserved = false;
    const originalSecureFetch = window.KellerAuth.secureFetch.bind(window.KellerAuth);
    const originalToast = window.Atrium.App.toast.bind(window.Atrium.App);
    const response = (payload = {}, ok = true) => ({ ok, async json() { return structuredClone(payload); } });
    const record = (url, options, body) => {
      const safeBody = url === '/api/integrations/email/configure' && body
        ? { ...body, password: body.password ? '[REDACTED]' : '' }
        : body;
      window.__uiV2EmailCalendarRequests.push({ url, method: options.method || 'GET', body: safeBody });
    };
    if (window.KellerAuth.currentUser) window.KellerAuth.currentUser.role = currentRole;
    window.Atrium.App.toast = (message, type) => {
      window.__uiV2EmailCalendarToasts.push({ message, type });
      return originalToast(message, type);
    };
    window.KellerAuth.secureFetch = async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : undefined;
      if (url === '/api/integrations/email/status') {
        record(url, options, body);
        if (failStatus) throw new Error('Falha sintética de status SMTP');
        return response({ status: statusFixture });
      }
      if (url === '/api/integrations/email/configure') {
        window.__uiV2SmtpPasswordObserved = Boolean(body?.password);
        record(url, options, body);
        return response({ ok: true });
      }
      if (url === '/api/integrations/email/test') {
        record(url, options, body);
        return response({ ok: true, message: 'E-mail sintético enviado.' });
      }
      if (url === '/api/integrations/email/receivers' && (options.method || 'GET') === 'GET') {
        record(url, options, body);
        return response({ receivers: receiverFixtures });
      }
      if (String(url).startsWith('/api/integrations/email/receivers')) {
        record(url, options, body);
        return response({ ok: true });
      }
      if (url === '/api/auth/users') {
        record(url, options, body);
        return response({ users: [
          { id: 'user-active', displayName: 'Usuária Ativa Sintética', email: 'ativa@synthetic.example.test', status: 'active' },
          { id: 'user-inactive', displayName: 'Usuária Inativa Sintética', email: 'inativa@synthetic.example.test', status: 'inactive' }
        ] });
      }
      if (url === '/api/calendar/configure') {
        record(url, options, body);
        return response({ imported: 4, message: 'Agenda externa sintética sincronizada.' });
      }
      return originalSecureFetch(url, options);
    };
    window.Atrium.App.switchView('integrations');
  }, { statusFixture: emailStatus, receiverFixtures: receivers, currentRole: role, failStatus: statusFailure });
  await page.locator('#view-integrations.active').waitFor();
  const expected = statusFailure ? 'Erro ao verificar' : emailStatus.configured ? 'SMTP conectado' : 'Não configurado';
  await page.locator('#emailIntegrationStatus').filter({ hasText: expected }).waitFor();
  return { emailStatus, receivers, role, statusFailure };
}

export async function prepareUiV2ProcessesFixture(page) {
  const fixture = {
    processes: [
      {
        id: 'ui-v2-process-tjrs',
        number: '5004321-12.2026.8.21.0001',
        oldNumber: '029/1.26.0001234-5',
        nb: '123.456.789-0',
        contactId: 'ui-v2-process-client',
        client: 'Cliente Sintética Processos',
        clientPosition: 'Autor(a)',
        opposingParty: 'Empresa Adversa Sintética',
        actionGroup: 'Cível',
        actionType: 'Obrigação de fazer',
        subject: 'Responsabilidade contratual sintética',
        judicialPhase: 'Conhecimento',
        risk: 'possivel',
        stage: 'Instrução',
        protocol: 'PROTOCOLO-SINTÉTICO-01',
        caseFolder: 'PASTA-SINTÉTICA-01',
        court: 'TJRS',
        county: 'Comarca Sintética',
        courtUnit: '1ª Vara Cível Sintética',
        responsible: 'Advogada Teste UI V2',
        registeredAt: '2026-08-20',
        lastMovementAt: '2026-08-29',
        lastMovement: 'Despacho sintético integral para validar leitura rápida e conteúdo completo no inspector.',
        movements: [
          { date: '2026-08-29', text: 'Despacho sintético integral para validar leitura rápida e conteúdo completo no inspector.' },
          { date: '2026-08-25', text: 'Juntada sintética de documento para demonstração do histórico processual.' },
          { date: '2026-08-20', text: 'Distribuição sintética registrada no órgão de teste.' }
        ],
        feeType: 'misto',
        feePercentage: 25,
        feeAmount: 1250,
        feeMonthly: 300,
        feeStatus: 'em_dia',
        requisitionType: 'rpv_federal',
        requisitionStatus: 'aguardando_deposito',
        secrecy: true,
        monitoring: 'active',
        source: 'Cadastro sintético',
        updatedAt: '2026-08-30T09:00:00.000Z',
        expenses: [{ id: 'ui-v2-process-expense', date: '2026-08-27', description: 'Custas sintéticas', amount: 120 }],
        unknownField: 'preservar'
      },
      {
        id: 'ui-v2-process-inactive',
        number: '5012345-67.2025.4.04.7100',
        client: 'Cliente Secundária Sintética',
        clientPosition: 'Réu / Ré',
        opposingParty: 'Parte Contrária Sintética',
        actionType: 'Ação previdenciária',
        judicialPhase: 'Recursal',
        stage: 'Apelação',
        court: 'TRF4',
        county: 'Seção Judiciária Sintética',
        courtUnit: '2ª Vara Federal Sintética',
        registeredAt: '2025-03-10',
        lastMovementAt: '2026-08-25',
        lastMovement: 'Recurso sintético recebido sem inferência automática de prazo.',
        risk: 'remoto',
        monitoring: 'inactive',
        secrecy: false,
        source: 'DataJud sintético'
      }
    ],
    contacts: [
      { id: 'ui-v2-process-client', name: 'Cliente Sintética Processos', contactRole: 'cliente', mobile: '(00) 90000-0000', city: 'Cidade Sintética', state: 'RS' }
    ],
    tasks: [
      { id: 'ui-v2-task-open', title: 'Tarefa vinculada sintética', process: '5004321-12.2026.8.21.0001', status: 'fazendo', deadline: '2026-09-05', fatalDeadline: '2026-09-03', timeLogs: [{ minutes: 75 }] },
      { id: 'ui-v2-task-text-only', title: 'Prazo textual não inferível em 15 dias', process: '5004321-12.2026.8.21.0001', status: 'triagem', timeLogs: [] },
      { id: 'ui-v2-task-done', title: 'Tarefa terminal sintética', process: '5004321-12.2026.8.21.0001', status: 'concluida', deadline: '2026-09-01', timeLogs: [] }
    ],
    intimations: [
      { id: 'ui-v2-intimation', process: '5004321-12.2026.8.21.0001', title: 'Intimação vinculada sintética', status: 'nova', text: 'Texto sintético menciona cinco dias sem criar deadline.' }
    ],
    agenda: [{ id: 'ui-v2-process-agenda', processId: 'ui-v2-process-tjrs', title: 'Audiência sintética vinculada', date: '2026-09-08', time: '14:00' }],
    documents: [{ id: 'ui-v2-process-document', ownerType: 'process', ownerId: 'ui-v2-process-tjrs', name: 'peticao-sintetica.pdf', documentType: 'Petição', createdAt: '2026-08-28' }],
    audit: [{ id: 'ui-v2-process-audit', processId: 'ui-v2-process-tjrs', at: '2026-08-26', action: 'Conferência sintética', actor: 'Pessoa Teste' }]
  };

  await page.evaluate(data => {
    const { App, Store } = window.Atrium;
    Store.state.processes = data.processes;
    Store.state.contacts = data.contacts;
    Store.state.documents = data.documents;
    Store.state.tasks = data.tasks;
    Store.state.intimations = data.intimations;
    Store.state.agenda = data.agenda;
    Store.state.audit = data.audit;
    App.renderAll();
    App.switchView('processes');
  }, fixture);
  await page.locator('#view-processes.active').waitFor();
  await page.locator('#processTableBody [data-process-id="ui-v2-process-tjrs"]').waitFor();
  return fixture;
}

export async function prepareUiV2PublicationsFixture(page) {
  const fixture = {
    processes: [
      {
        id: 'ui-v2-publication-process',
        number: '5004321-12.2026.8.21.0001',
        client: 'Cliente Sintética Publicações',
        opposingParty: 'Parte Adversa Sintética'
      }
    ],
    tasks: [
      {
        id: 'ui-v2-publication-task',
        title: 'Providência vinculada sintética',
        intimationId: 'ui-v2-publication-treated',
        sourceIntimationId: 'ui-v2-publication-treated',
        responsible: 'Advogada Teste UI V2',
        deadline: '2026-09-12',
        status: 'triagem'
      }
    ],
    intimations: [
      {
        id: 'ui-v2-publication-urgent',
        externalId: 'djen:ui-v2-urgent',
        title: 'Intimação sintética para manifestação supervisionada',
        process: '5004321-12.2026.8.21.0001',
        client: 'Cliente Sintética Publicações',
        court: 'TJRS · 1ª Vara Cível Sintética',
        source: 'DJEN sintético',
        publishedAt: '2026-08-30',
        text: 'TEXTO OFICIAL SINTÉTICO\nA parte deverá se manifestar em 15 dias.\nA data é apenas conteúdo da publicação e não constitui prazo cadastrado.',
        status: 'nova',
        treatmentStatus: 'untreated',
        unread: true,
        urgent: true,
        priority: 'urgente',
        responsible: 'Advogada Teste UI V2',
        unknownField: 'preservar'
      },
      {
        id: 'ui-v2-publication-review',
        title: 'Decisão sintética em análise humana',
        process: '5004321-12.2026.8.21.0001',
        client: 'Cliente Sintética Publicações',
        court: 'TJRS · 1ª Vara Cível Sintética',
        source: 'DJEN sintético',
        publishedAt: '2026-08-29',
        text: 'Conteúdo sintético integral da decisão em análise.',
        status: 'triagem',
        treatmentStatus: 'in_review',
        treatmentStartedAt: '2026-08-30T12:00:00.000Z',
        treatmentStartedBy: 'Advogada Revisora Sintética',
        unread: false,
        important: true
      },
      {
        id: 'ui-v2-publication-treated',
        title: 'Publicação sintética tratada com providência',
        process: '5004321-12.2026.8.21.0001',
        client: 'Cliente Sintética Publicações',
        court: 'TJRS · 1ª Vara Cível Sintética',
        source: 'DJEN sintético',
        publishedAt: '2026-08-28',
        text: 'Conteúdo sintético integral da publicação tratada.',
        status: 'prazo',
        treatmentStatus: 'treated',
        treatedAt: '2026-08-30T14:00:00.000Z',
        treatedBy: 'Advogada Tratadora Sintética',
        treatmentNote: 'Providência conferida manualmente.',
        linkedTaskIds: ['ui-v2-publication-task'],
        taskId: 'ui-v2-publication-task',
        unread: false
      },
      {
        id: 'ui-v2-publication-discarded',
        title: 'Publicação sintética descartada',
        process: '5004321-12.2026.8.21.0001',
        client: 'Cliente Sintética Publicações',
        court: 'TJRS · 1ª Vara Cível Sintética',
        source: 'DJEN sintético',
        publishedAt: '2026-08-27',
        text: 'Conteúdo sintético integral descartado após revisão humana.',
        status: 'arquivada',
        treatmentStatus: 'discarded',
        discardedAt: '2026-08-30T15:00:00.000Z',
        discardedBy: 'Advogada Tratadora Sintética',
        treatmentNote: 'Duplicidade sintética confirmada.',
        unread: false
      }
    ]
  };

  await page.evaluate(data => {
    const { App, Store } = window.Atrium;
    Store.state.processes = data.processes;
    Store.state.tasks = data.tasks;
    Store.state.intimations = data.intimations;
    App.inboxFilter = 'all';
    App.inboxSort = 'date-desc';
    App.inboxCutoff = 'all';
    App.renderAll();
    App.switchView('inbox');
  }, fixture);
  await page.locator('#view-inbox.active').waitFor();
  await page.locator('#inboxList [data-intimation-id="ui-v2-publication-urgent"]').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('#view-inbox').length > 0
    && Array.from(document.querySelectorAll('#view-inbox'))
      .flatMap(element => element.getAnimations({ subtree: true }))
      .every(animation => animation.playState === 'finished'));
  return fixture;
}

export async function prepareUiV2TasksFixture(page) {
  const fixture = {
    tasks: [
      {
        id: 'ui-v2-task-overdue', externalId: 'task:synthetic:overdue', title: 'Revisar contestação sintética',
        description: 'Conferir fundamentos e documentos antes do protocolo supervisionado.', source: 'Interna',
        client: 'Cliente Sintética Tarefas', process: '5004321-12.2026.8.21.0001', responsible: 'Advogada Teste UI V2',
        status: 'triagem', priority: 'urgente', points: 25, deadline: '2026-08-20', timeLogs: [], history: [], unknownField: 'preservar'
      },
      {
        id: 'ui-v2-task-fatal', title: 'Preparar recurso com prazo confirmado', description: 'Prazo cadastrado manualmente para a fixture.',
        source: 'Sistema jurídico', client: 'Cliente Recursal Sintético', process: '5012345-67.2026.4.04.7100',
        responsible: 'Advogada Recursal Sintética', status: 'prioridade', priority: 'importante', points: 18,
        deadline: '2026-09-02', fatalDeadline: '2026-09-03', timeLogs: [{ id: 'time-synthetic', minutes: 75 }], history: []
      },
      {
        id: 'ui-v2-task-active', title: 'Elaborar minuta de manifestação', description: 'Atividade sintética em execução.',
        source: 'Manual', client: 'Cliente Operacional Sintético', process: '5022222-22.2026.8.21.0001',
        responsible: 'Advogada Cronômetro Sintética', status: 'andamento', priority: 'normal', points: 10,
        deadline: '2026-09-05', timeLogs: [{ id: 'time-active', minutes: 20 }], history: []
      },
      {
        id: 'ui-v2-task-waiting', title: 'Aguardar documento do cliente', description: 'Pendência externa sintética e explícita.',
        source: 'Interna', client: 'Cliente Aguardando Sintético', responsible: 'Assistente Sintética', status: 'aguardando',
        priority: 'normal', points: 8, deadline: '', timeLogs: [], history: []
      },
      {
        id: 'ui-v2-task-publication', intimationId: 'ui-v2-task-publication-source', sourceIntimationId: 'ui-v2-task-publication-source',
        title: 'Analisar publicação vinculada', description: 'TEXTO OFICIAL SINTÉTICO\nMenção textual a 15 dias sem inferência de prazo.',
        source: 'DJEN', client: 'Cliente Publicação Sintético', process: '5033333-33.2026.8.21.0001',
        responsible: 'Advogada Revisora Sintética', status: 'revisao', priority: 'importante', points: 16,
        deadline: '', fatalDeadline: '', timeLogs: [], history: []
      },
      {
        id: 'ui-v2-task-complete', title: 'Providência sintética concluída', description: 'Tarefa concluída preservada no fluxo.',
        source: 'Interna', client: 'Cliente Concluído Sintético', responsible: 'Advogada Teste UI V2', status: 'concluida',
        priority: 'normal', points: 12, deadline: '2026-08-28', completedAt: '2026-08-29T18:00:00.000Z', timeLogs: [{ minutes: 30 }], history: []
      }
    ],
    intimations: [
      {
        id: 'ui-v2-task-publication-source', title: 'Publicação sintética vinculada', process: '5033333-33.2026.8.21.0001',
        client: 'Cliente Publicação Sintético', text: 'TEXTO OFICIAL SINTÉTICO\nMenção textual a 15 dias sem inferência de prazo.',
        source: 'DJEN', treatmentStatus: 'in_review', linkedTaskIds: ['ui-v2-task-publication']
      }
    ]
  };

  await page.evaluate(data => {
    const { App, Store } = window.Atrium;
    Store.state.tasks = data.tasks;
    Store.state.intimations = data.intimations;
    Store.state.audit = [];
    App.renderAll();
    App.switchView('kanban');
  }, fixture);
  await page.locator('#view-kanban.active').waitFor();
  await page.locator('#kanbanBoard [data-task-id="ui-v2-task-overdue"]').waitFor();
  return fixture;
}

export async function prepareUiV2AgendaFixture(page) {
  const fixture = await page.evaluate(() => {
    const localDate = offset => {
      const value = new Date();
      value.setHours(12, 0, 0, 0);
      value.setDate(value.getDate() + offset);
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    };
    const today = localDate(0);
    const tomorrow = localDate(1);
    const afterTomorrow = localDate(2);
    const future = localDate(5);
    const data = {
      today,
      tomorrow,
      afterTomorrow,
      future,
      agenda: [
        {
          id: 'ui-v2-agenda-hearing', externalId: 'agenda:synthetic:hearing', title: 'Audiência de conciliação sintética',
          date: today, time: '09:30', client: 'Cliente Agenda Sintética', process: '5004321-12.2026.8.21.0001',
          location: 'Sala de audiências sintética', source: 'Agenda externa', description: 'Compromisso sintético para validação visual.',
          unknownField: 'preservar'
        },
        {
          id: 'ui-v2-agenda-meeting', title: 'Reunião de estratégia processual', date: today, time: '14:00',
          client: 'Cliente Estratégia Sintética', process: '5012345-67.2026.4.04.7100', location: 'Sala mineral', source: 'Interna'
        },
        {
          id: 'ui-v2-agenda-future', title: 'Atendimento futuro sintético', date: future, time: '11:00',
          client: 'Cliente Futuro Sintético', location: 'Videoconferência', source: 'Importação'
        }
      ],
      tasks: [
        {
          id: 'ui-v2-agenda-task', title: 'Conferir documentos para audiência', client: 'Cliente Agenda Sintética',
          process: '5004321-12.2026.8.21.0001', deadline: today, status: 'andamento', timeLogs: [{ minutes: 45 }]
        },
        {
          id: 'ui-v2-agenda-fatal', title: 'Interpor recurso com data confirmada', client: 'Cliente Recursal Sintético',
          process: '5012345-67.2026.4.04.7100', deadline: afterTomorrow, fatalDeadline: tomorrow, status: 'prioridade',
          timeLogs: [{ minutes: 75 }]
        },
        {
          id: 'ui-v2-agenda-text-only', title: 'Manifestar em 15 dias conforme texto da publicação',
          client: 'Cliente Sem Data Sintético', status: 'triagem', timeLogs: []
        }
      ],
      intimations: [
        {
          id: 'ui-v2-agenda-publication', title: 'Publicação sintética para manifestação supervisionada',
          publishedAt: today, createdAt: `${today}T08:00:00.000Z`, process: '5004321-12.2026.8.21.0001',
          client: 'Cliente Agenda Sintética', text: 'Intime-se para manifestação em 15 dias. Texto sintético sem prazo cadastrado.',
          type: 'intimacao', unread: true, treatmentStatus: 'untreated'
        },
        {
          id: 'ui-v2-agenda-created-fallback', title: 'Publicação sintética com data de registro',
          createdAt: `${tomorrow}T10:00:00.000Z`, process: '5012345-67.2026.4.04.7100',
          client: 'Cliente Registro Sintético', text: 'Registro sintético sem inferência de vencimento.', treatmentStatus: 'in_review'
        }
      ]
    };
    const { App, Store } = window.Atrium;
    Store.state.agenda = data.agenda;
    Store.state.tasks = data.tasks;
    Store.state.intimations = data.intimations;
    Store.state.audit = [];
    App.agendaSelectedDate = null;
    App.agendaCalendarMonthOffset = 0;
    App.agendaTypeFilter = 'all';
    App.renderAll();
    App.switchView('agenda');
    return data;
  });
  await page.locator('#view-agenda.active').waitFor();
  await page.locator('#agendaList [data-agenda-activity-id="ui-v2-agenda-hearing"]').waitFor();
  return fixture;
}

export async function prepareUiV2ContactsFixture(page) {
  const fixture = {
    contacts: [
      {
        id: 'ui-v2-contact-client', externalId: 'contact:synthetic:client', name: 'Marina Duarte Sintética',
        contactRole: 'cliente', leadOrigin: 'indicacao', document: '000.000.001-91', rg: 'RG-SINT-001',
        birthDate: '1986-04-12', profession: 'Arquiteta', maritalStatus: 'casada', mobile: '(51) 90000-0001',
        phone: '(51) 3000-0001', email: 'marina.duarte@example.test', origin: 'Texto livre não prioritário',
        city: 'Porto Alegre', state: 'RS', address: 'Rua Mineral, 101', district: 'Centro Sintético',
        zip: '90000-001', notes: 'Prefere contato no período da tarde.', registeredAt: '2026-08-10',
        source: 'Planilha sintética', relatedProcessNumbers: ['5000001-11.2026.8.21.0001'],
        monitoredTermIds: ['termo-sintetico-1'], unknownField: 'preservar'
      },
      { id: 'ui-v2-contact-witness', name: 'Bruno Testemunha Sintético', contactRole: 'testemunha', leadOrigin: 'parceria', mobile: '(51) 90000-0002', city: 'Canoas', state: 'RS', registeredAt: '2026-08-11', source: 'Interna' },
      { id: 'ui-v2-contact-expert', name: 'Carla Perita Sintética', contactRole: 'perito', leadOrigin: 'convenio', phone: '(51) 3000-0003', city: 'Ijuí', state: 'RS', registeredAt: '2026-08-12', source: 'Interna' },
      { id: 'ui-v2-contact-adverse', name: 'Daniel Adverso Sintético', contactRole: 'adverso', leadOrigin: 'balcao', mobile: '(51) 90000-0004', city: 'Santa Maria', state: 'RS', registeredAt: '2026-08-13', source: 'Interna' },
      { id: 'ui-v2-contact-correspondent', name: 'Elisa Correspondente Sintética', contactRole: 'correspondente', leadOrigin: 'redes_sociais', mobile: '(51) 90000-0005', city: 'Pelotas', state: 'RS', registeredAt: '2026-08-14', source: 'Interna' },
      { id: 'ui-v2-contact-representative', name: 'Fábio Preposto Sintético', contactRole: 'preposto', leadOrigin: 'google_site', mobile: '(51) 90000-0006', city: 'Novo Hamburgo', state: 'RS', registeredAt: '2026-08-15', source: 'Interna' },
      { id: 'ui-v2-contact-other', name: 'Gabriela Outro Papel Sintética', contactRole: 'outro', leadOrigin: 'outro', mobile: '(51) 90000-0007', city: 'Passo Fundo', state: 'RS', registeredAt: '2026-08-16', source: 'Importação sintética' },
      { id: 'ui-v2-contact-historical', name: 'Helena Histórica Sem Papel', origin: 'Arquivo histórico sintético', mobile: '(51) 90000-0008', city: 'Caxias do Sul', state: 'RS', createdAt: '2026-08-17', source: 'Legado sintético' },
      { id: 'ui-v2-contact-long', name: 'Instituto Sintético de Estudos Jurídicos e Relações Profissionais de Nome Extenso', contactRole: 'cliente', leadOrigin: 'indicacao', mobile: '(51) 90000-0009', email: 'contato.longo@example.test', city: 'Porto Alegre', state: 'RS', registeredAt: '2026-08-18', source: 'Interna' }
    ],
    leads: [{ id: 'ui-v2-lead-isolated', name: 'Lead Sintético Isolado', status: 'novo' }],
    processes: [
      {
        id: 'ui-v2-contact-process', number: '5000000-00.2026.8.21.0001', client: 'Marina Duarte Sintética',
        contactId: 'ui-v2-contact-client', actionType: 'Procedimento sintético de vínculo canônico', court: 'TJRS sintético',
        stage: 'Em andamento', registeredAt: '2026-08-01', feeType: 'fixo', feeAmount: 1200,
        movements: [{ id: 'ui-v2-contact-movement', date: '2026-08-18', description: 'Movimentação sintética do processo vinculado' }]
      },
      {
        id: 'ui-v2-contact-related-process', number: '5000001-11.2026.8.21.0001', client: 'Cliente ainda não vinculado',
        actionType: 'Relação processual sintética registrada', court: 'TJRS sintético', registeredAt: '2026-08-02'
      },
      {
        id: 'ui-v2-contact-name-only-process', number: '5000002-22.2026.8.21.0001', client: 'Marina Duarte Sintética',
        actionType: 'Processo sem vínculo explícito', registeredAt: '2026-08-03'
      }
    ],
    tasks: [{
      id: 'ui-v2-contact-task', processId: 'ui-v2-contact-process', process: '5000000-00.2026.8.21.0001',
      title: 'Providência sintética do cliente', status: 'andamento', deadline: '2026-09-12', createdAt: '2026-08-19'
    }],
    intimations: [{
      id: 'ui-v2-contact-publication', processId: 'ui-v2-contact-process', process: '5000000-00.2026.8.21.0001',
      title: 'Publicação sintética vinculada', text: 'Conteúdo exclusivamente sintético.', publishedAt: '2026-08-17', treatmentStatus: 'untreated'
    }],
    agenda: [{
      id: 'ui-v2-contact-appointment', processId: 'ui-v2-contact-process', process: '5000000-00.2026.8.21.0001',
      title: 'Audiência sintética vinculada', type: 'audiencia', date: '2026-09-20', time: '14:00'
    }],
    documents: [{
      id: 'ui-v2-contact-document', ownerType: 'process', ownerId: 'ui-v2-contact-process', processId: 'ui-v2-contact-process',
      name: 'Documento sintético vinculado.pdf', documentType: 'Petição sintética', createdAt: '2026-08-16', status: 'active'
    }],
    financial: [{ id: 'ui-v2-contact-financial', processId: 'ui-v2-contact-related-process', title: 'Lançamento sintético relacionado' }]
  };

  await page.evaluate(data => {
    const { App, Store } = window.Atrium;
    Store.state.contacts = data.contacts;
    Store.state.leads = data.leads;
    Store.state.processes = data.processes;
    Store.state.tasks = data.tasks;
    Store.state.intimations = data.intimations;
    Store.state.agenda = data.agenda;
    Store.state.documents = data.documents;
    Store.state.financial = data.financial;
    Store.state.audit = [];
    App.renderAll();
    App.switchView('contacts');
  }, fixture);
  await page.locator('#view-contacts.active').waitFor();
  await page.locator('#contactsV2Workspace [data-contact-id="ui-v2-contact-client"]').waitFor();
  return fixture;
}

export async function prepareUiV2FinancialFixture(page) {
  const fixture = {
    processes: [
      { id: 'fin-rpv-zero', number: '5000000-00.2026.8.21.0001', client: 'Cliente Zero Sintética', requisitionAmount: 0, rpvAmount: 9999, economicValue: 8888, feePercentage: 30, feeAmount: 0, requisitionStatus: 'requisitado', source: 'Fixture sintética' },
      { id: 'fin-rpv-fallback', number: '5000001-11.2026.8.21.0001', client: 'Cliente RPV Sintética', rpvAmount: 10000, feePercentage: 20, requisitionStatus: 'aguardando_deposito', source: 'Fixture sintética' },
      { id: 'fin-economic', number: '5000002-22.2026.8.21.0001', client: 'Cliente Econômica Sintética', economicValue: 20000, feePercentage: 25, feeAmount: 6000, requisitionStatus: 'disponivel_saque', source: 'Fixture sintética' },
      { id: 'fin-final', number: '5000003-33.2026.8.21.0001', client: 'Cliente Quitada Sintética', requisitionAmount: 5000, feePercentage: 10, requisitionStatus: 'repassado', source: 'Fixture sintética' },
      { id: 'fin-unknown', number: '5000004-44.2026.8.21.0001', client: 'Cliente Status Sintético', requisitionAmount: 7000, feePercentage: 15, requisitionStatus: 'em_conferencia_sintetica', source: 'Fixture sintética' },
      { id: 'fin-fee-zero', number: '5000005-55.2026.8.21.0001', client: 'Cliente Honorário Zero', feeType: 'fixo', feeAmount: 0, feeStatus: 'a_faturar', source: 'Fixture sintética' },
      { id: 'fin-fee-fixed', number: '5000006-66.2026.8.21.0001', client: 'Cliente Honorário Fixo', feeType: 'fixo', feeAmount: 2500, feeStatus: 'a_faturar', source: 'Fixture sintética' },
      { id: 'fin-fee-monthly', number: '5000007-77.2026.8.21.0001', client: 'Cliente Mensal Sintética', feeType: 'mensal', feeMonthly: 800, feeStatus: 'pago', source: 'Fixture sintética' },
      { id: 'fin-target-rpv', number: 'FIN-TARGET-RPV', client: 'Cliente Lançamento RPV', court: 'TJRS', customField: 'preservar-rpv' },
      { id: 'fin-target-exito', number: 'FIN-TARGET-EXITO', client: 'Cliente Lançamento Êxito', court: 'TJRS', customField: 'preservar-exito' },
      { id: 'fin-target-fixo', number: 'FIN-TARGET-FIXO', client: 'Cliente Lançamento Fixo', court: 'TJRS', customField: 'preservar-fixo' },
      { id: 'fin-target-mensal', number: 'FIN-TARGET-MENSAL', client: 'Cliente Lançamento Mensal', court: 'TJRS', customField: 'preservar-mensal' },
      { id: 'fin-target-custas', number: 'FIN-TARGET-CUSTAS', client: 'Cliente Custas Rejeitadas', court: 'TJRS', customField: 'preservar-custas' },
      { id: 'fin-target-rollback', number: 'FIN-TARGET-ROLLBACK', client: 'Cliente Rollback', court: 'TJRS', customField: 'preservar-rollback' },
      { id: 'fin-target-double', number: 'FIN-TARGET-DOUBLE', client: 'Cliente Double Submit', court: 'TJRS', customField: 'preservar-double' }
    ],
    tasks: [{ id: 'fin-time', title: 'Atividade financeira sintética', status: 'andamento', timeLogs: [{ minutes: 95 }] }]
  };

  await page.evaluate(data => {
    const { App, Store } = window.Atrium;
    Store.state.processes = data.processes;
    Store.state.tasks = data.tasks;
    Store.state.audit = [];
    App.renderAll();
    App.switchView('financial');
  }, fixture);
  await page.locator('#view-financial.active').waitFor();
  await page.locator('#financialV2Workspace [data-financial-record="fin-rpv-zero"]').first().waitFor({ state: 'attached' });
  return fixture;
}

export async function prepareUiV2DocumentsFixture(page) {
  const fixture = {
    contacts: [{
      id: 'doc-contact',
      name: 'Cliente Documental Sintética',
      document: '000.000.000-00',
      rg: 'RG-SINTETICO',
      profession: 'Profissão Sintética',
      maritalStatus: 'solteiro',
      address: 'Rua Sintética, 100',
      district: 'Centro Sintético',
      city: 'Cidade Sintética',
      state: 'RS',
      zip: '00000-000'
    }],
    processes: [
      { id: 'doc-process', number: '0000000-00.0000.0.00.0000', client: 'Cliente Documental Sintética', court: 'Vara Sintética', nb: 'NB-SINTETICO', feeType: 'exito', feePercentage: 12.5, feeAmount: 0, requisitionAmount: 10000 },
      { id: 'doc-zero-percent', number: '0000001-11.0000.0.00.0000', client: 'Cliente Percentual Zero', feeType: 'exito', feePercentage: 0, feeAmount: 0, requisitionAmount: 10000 },
      { id: 'doc-zero-fixed', number: '0000002-22.0000.0.00.0000', client: 'Cliente Valor Zero', feeType: 'fixo', feePercentage: 0, feeAmount: 0, requisitionAmount: 10000 },
      { id: 'doc-invalid-fee', number: '0000003-33.0000.0.00.0000', client: 'Cliente Tipo Inválido', feeType: 'tipo-financeiro-invalido', feePercentage: 10, feeAmount: 999, requisitionAmount: 10000 },
      { id: 'doc-rpv', number: '0000004-44.0000.0.00.0000', client: 'Cliente RPV Sintética', feeType: 'exito', feePercentage: 10, feeAmount: 999, requisitionAmount: 10000 }
    ]
  };

  await page.evaluate(data => {
    const { App, Store } = window.Atrium;
    Store.state.contacts = data.contacts;
    Store.state.processes = data.processes;
    Store.state.settings = {
      ...Store.state.settings,
      officeName: 'Escritório Sintético',
      officeSlogan: 'Slogan Sintético',
      officeLogo: '',
      lawyerName: 'Advogada Sintética',
      lawyerOab: 'OAB/RS 000000',
      lawyerCpfCnpj: '000.000.000-00',
      lawyerAddress: 'Avenida Sintética, 200',
      city: 'Cidade do Escritório/RS',
      documentNamingTemplate: ''
    };
    Store.state.terms = [{ id: 'doc-term', name: 'Nome Alternativo Sintético', registration: 'OAB/RS 999999' }];
    Store.state.audit = [];
    App.renderAll();
    App.switchView('documents');
  }, fixture);
  await page.locator('#view-documents.active').waitFor();
  await page.locator('#documentsTemplateGrid [data-generate-doc-type="procuracao"]').waitFor();
  return fixture;
}

export async function prepareUiV2LeadsFixture(page) {
  const fixture = {
    leads: [
      { id: 'lead-v2-new', client: 'Ana Interessada Sintética', serviceType: 'Aposentadoria especial', status: 'novo', origin: 'Indicação de Cliente', estimatedFee: 5000, responsible: 'Advogada Teste UI V2', notes: 'Relato sigiloso sintético', registeredAt: '2026-08-20' },
      { id: 'lead-v2-analysis', client: 'Bruno Análise Sintético', serviceType: 'Revisão documental previdenciária', status: 'em_analise', origin: 'Google / Site', estimatedFee: null, responsible: 'Advogada Beta', registeredAt: '2026-08-21' },
      { id: 'lead-v2-proposal', client: 'Carla Proposta Sintética', serviceType: 'Planejamento sucessório', status: 'proposta', origin: 'Instagram / Redes Sociais', estimatedFee: 7500, responsible: 'Advogada Gama', registeredAt: '2026-08-22' },
      { id: 'lead-v2-closed', client: 'Daniel Fechado Sintético', serviceType: 'Ação indenizatória', status: 'fechado', origin: 'Parceiro / Correspondente', estimatedFee: 9000, responsible: 'Advogada Delta', registeredAt: '2026-08-23' },
      { id: 'lead-v2-declined', client: 'Elisa Declinada Sintética', serviceType: 'Consulta sem viabilidade', status: 'declinado', origin: 'Sindicato / Associação', estimatedFee: null, responsible: 'Advogada Épsilon', registeredAt: '2026-08-24' },
      { id: 'lead-v2-long', client: 'Fundação Sintética de Assistência Jurídica e Relacionamento Institucional de Nome Extenso', serviceType: 'Análise jurídica multidisciplinar de alta complexidade com descrição extensa', status: 'novo', origin: 'Passante / Balcão', estimatedFee: 12000, responsible: 'Advogada Responsável de Nome Extenso', registeredAt: '2026-08-25' },
      { id: 'lead-v2-unknown', client: '', serviceType: '', status: 'status_historico', origin: '', estimatedFee: 0, responsible: '', registeredAt: '2026-08-26' }
    ],
    contacts: [{ id: 'lead-contact-isolation', name: 'Contato Sintético Intacto', contactRole: 'cliente', mobile: '(00) 90000-0000', email: 'contato@synthetic.example.test', city: 'Cidade Sintética', source: 'Fixture sintética' }],
    processes: [{ id: 'lead-process-isolation', number: '0000000-00.2026.8.21.0000', client: 'Processo Sintético Intacto' }]
  };

  await page.evaluate(data => {
    const { App, Store } = window.Atrium;
    Store.state.leads = data.leads;
    Store.state.contacts = data.contacts;
    Store.state.processes = data.processes;
    Store.state.audit = [];
    App.renderAll();
    App.switchView('leads');
  }, fixture);
  await page.locator('#view-leads.active').waitFor();
  await page.locator('#leadsV2Workspace [data-lead-id="lead-v2-new"]').waitFor();
  return fixture;
}

export async function prepareUiV2AssistantFixture(page, { configured = true, withContext = false } = {}) {
  const fixture = {
    intimation: {
      id: 'assistant-intimation-v2',
      title: 'Publicação sintética selecionada para revisão',
      process: '0000000-00.2026.8.21.0000',
      source: 'DJEN sintético',
      text: 'Conteúdo oficial inteiramente sintético, sem inferência de prazo.'
    }
  };

  await page.evaluate(({ data, isConfigured, hasContext }) => {
    const { App, Store } = window.Atrium;
    Store.state.intimations = [data.intimation];
    App.selectedIntimation = hasContext ? data.intimation.id : null;
    App.aiConfigured = isConfigured;
    App.aiChatHistory = [];
    const chip = document.getElementById('aiKeyStatusChip');
    chip.textContent = isConfigured ? 'Chave Ativa' : 'Chave não configurada';
    chip.className = isConfigured ? 'status-chip connected' : 'status-chip warning';
    document.getElementById('aiOnboardingBanner').style.display = isConfigured ? 'none' : 'block';
    App.switchView('assistant');
    App.renderAssistant();
  }, { data: fixture, isConfigured: configured, hasContext: withContext });

  await page.locator('#view-assistant.active').waitFor();
  await page.locator('#aiChatMessages[role="log"]').waitFor();
  return fixture;
}

export async function prepareUiV2PromptsFixture(page) {
  const fixture = {
    custom: {
      id: 'prompt-v2-custom', isCustom: true, title: 'Pesquisa Custom Sintética', category: 'Cível', type: 'Pesquisa',
      description: 'Roteiro customizado para localizar precedentes sintéticos.', tags: ['custom', 'pesquisa', 'precedentes'],
      prompt: 'PESQUISE PRECEDENTES SINTÉTICOS E ORGANIZE OS FUNDAMENTOS SEM INVENTAR FONTES.',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z'
    },
    defaults: [
      {
        id: 'prompt-v2-redacao', title: 'Redação Cível Sintética', category: 'Cível', type: 'Redação',
        description: 'Estrutura de redação para peça cível supervisionada.', tags: ['petição', 'cpc', 'redação', 'revisão', 'síntese', 'sexta-tag'],
        prompt: 'REDIJA UMA PEÇA CÍVEL SINTÉTICA COM BASE EXCLUSIVA NOS FATOS FORNECIDOS.'
      },
      {
        id: 'prompt-v2-previdenciario', title: 'Análise Previdenciária Sintética', category: 'Previdenciário', type: 'Análise',
        description: 'Análise de riscos e fatos de benefício previdenciário.', tags: ['benefício', 'risco'],
        prompt: 'ANALISE O BENEFÍCIO PREVIDENCIÁRIO SINTÉTICO E SEPARE FATOS PROVADOS DE PENDÊNCIAS.'
      },
      {
        id: 'prompt-v2-long', title: 'Instrução Jurídica Sintética de Extensão Controlada', category: 'Trabalhista', type: 'Geral',
        description: 'Prompt longo usado para validar leitura, scroll interno e preservação integral.', tags: ['longo', 'leitura'],
        prompt: Array.from({ length: 18 }, (_, index) => `ETAPA ${index + 1}: revise o fato sintético, indique a fonte e preserve a supervisão profissional.`).join('\n')
      }
    ]
  };

  await page.evaluate(data => {
    const { App, Store } = window.Atrium;
    window.PROMPTS_DATA = data.defaults;
    Store.state.customPrompts = [data.custom];
    Store.state.audit = [];
    App.promptsFilter = { search: '', category: 'all', type: 'all' };
    App.renderAll();
    App.switchView('prompts');
  }, fixture);

  await page.locator('#view-prompts.active').waitFor();
  await page.locator('#promptsGrid [data-prompt-id="prompt-v2-custom"]').waitFor();
  return fixture;
}

export async function prepareUiV2MonitoringFixture(page) {
  const fixture = {
    terms: [
      { id: 'monitor-term-primary', name: 'Advogada Mineral Sintética', registration: 'OAB/RS 000123', type: 'oab', active: true, unknownField: 'preservar-primary' },
      { id: 'monitor-term-secondary', name: 'Advogado Secundário Sintético', registration: 'OAB/SC 000456', type: 'oab', active: true, unknownField: 'preservar-secondary' }
    ],
    sources: [
      { id: 'a1', short: 'A1', name: 'Certificado A1 Sintético', detail: 'Autenticação local supervisionada sem exposição de certificado.', method: 'mTLS local', status: 'ok', lastCheck: '2026-08-30T15:00:00.000Z' },
      { id: 'external-calendar', short: 'CAL', name: 'Calendário Externo Sintético', detail: 'Agenda externa requer revisão da configuração.', method: 'iCal protegido', status: 'attention' },
      { id: 'djen-cnj', short: 'DJEN', name: 'Diário de Justiça Eletrônico Sintético', detail: 'Fonte oficial com falha sintética para validação visual.', method: 'API oficial', status: 'error', lastCheck: '2026-08-30T14:30:00.000Z' },
      { id: 'datajud-cnj', short: 'DJ', name: 'DataJud CNJ Sintético', detail: 'Integração preparada para enriquecimento sob demanda.', method: 'API pública', status: 'planned' },
      { id: 'generic-source', short: 'GEN', name: 'Fonte Manual Sintética', detail: 'Fonte operacional desativada com configuração manual.', method: 'Manual', status: 'off' }
    ],
    rawIntimations: [
      { id: 'monitor-raw-1', status: 'nova' },
      { id: 'monitor-raw-2', status: 'nova' },
      { id: 'monitor-raw-3', status: 'nova' },
      { id: 'monitor-raw-4', status: 'nova' },
      { id: 'monitor-raw-read', status: 'lida' }
    ],
    filteredIntimations: [
      { id: 'monitor-cutoff-1', status: 'nova' },
      { id: 'monitor-cutoff-2', status: 'nova' },
      { id: 'monitor-cutoff-read', status: 'lida' }
    ]
  };

  await page.evaluate(data => {
    const { App, Store } = window.Atrium;
    Store.state.terms = data.terms;
    Store.state.sources = data.sources;
    Store.state.intimations = data.rawIntimations;
    Store.state.settings = {
      ...Store.state.settings,
      datajudApiKey: 'SYNTHETIC_DATAJUD_PUBLIC_KEY',
      monitoringFixtureMarker: 'preservar-settings'
    };
    Store.state.audit = [];
    App.filteredIntimations = () => data.filteredIntimations;
    App.renderAll();
    App.switchView('monitoring');
  }, fixture);

  await page.locator('#view-monitoring.active').waitFor();
  await page.locator('#monitorSourceList [data-source-id="a1"]').waitFor();
  return fixture;
}
