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
    { id: 'tj-sintetico', name: 'Tribunal de Justiça Sintético', group: 'Justiça Estadual', enabled: true, supportsTotp: true, totpConfigured: true, system: 'PJe', automationLevel: 'stable' },
    { id: 'trf-sintetico', name: 'Tribunal Regional Sintético', group: 'Justiça Federal', enabled: true, supportsTotp: true, totpConfigured: false, system: 'eproc', automationLevel: 'experimental' },
    { id: 'tst-sintetico', name: 'Tribunal Superior Sintético', group: 'Tribunais superiores', enabled: false, supportsTotp: false, certificateMode: 'windows', automationLevel: 'stable' }
  ]
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
  await page.locator('#certificateIntegrationStatus').filter({ hasText: status.certificate.valid ? 'A1 Operacional' : 'Configuração necessária' }).waitFor();
  return status;
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
    leads: [{ id: 'ui-v2-lead-isolated', name: 'Lead Sintético Isolado', status: 'novo' }]
  };

  await page.evaluate(data => {
    const { App, Store } = window.Atrium;
    Store.state.contacts = data.contacts;
    Store.state.leads = data.leads;
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
      city: 'Cidade do Escritório/RS'
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
    contacts: [{ id: 'lead-contact-isolation', name: 'Contato Sintético Intacto', source: 'Fixture sintética' }],
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
