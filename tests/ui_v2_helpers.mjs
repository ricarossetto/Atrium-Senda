import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

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
      deviceScaleFactor: 1
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
      if (target && ['document', 'window', 'uiModeControl', 'sidebarScrim', 'menuToggle'].includes(target)) {
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

export async function prepareUiV2ProcessesFixture(page) {
  const fixture = {
    processes: [
      {
        id: 'ui-v2-process-tjrs',
        number: '5004321-12.2026.8.21.0001',
        oldNumber: '029/1.26.0001234-5',
        nb: '123.456.789-0',
        client: 'Cliente Sintética Processos',
        clientPosition: 'Autor(a)',
        opposingParty: 'Empresa Adversa Sintética',
        actionGroup: 'Cível',
        actionType: 'Obrigação de fazer',
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
    tasks: [
      { id: 'ui-v2-task-open', title: 'Tarefa vinculada sintética', process: '5004321-12.2026.8.21.0001', status: 'fazendo', deadline: '2026-09-05', fatalDeadline: '2026-09-03', timeLogs: [{ minutes: 75 }] },
      { id: 'ui-v2-task-text-only', title: 'Prazo textual não inferível em 15 dias', process: '5004321-12.2026.8.21.0001', status: 'triagem', timeLogs: [] },
      { id: 'ui-v2-task-done', title: 'Tarefa terminal sintética', process: '5004321-12.2026.8.21.0001', status: 'concluida', deadline: '2026-09-01', timeLogs: [] }
    ],
    intimations: [
      { id: 'ui-v2-intimation', process: '5004321-12.2026.8.21.0001', title: 'Intimação vinculada sintética', status: 'nova', text: 'Texto sintético menciona cinco dias sem criar deadline.' }
    ]
  };

  await page.evaluate(data => {
    const { App, Store } = window.Atrium;
    Store.state.processes = data.processes;
    Store.state.tasks = data.tasks;
    Store.state.intimations = data.intimations;
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
