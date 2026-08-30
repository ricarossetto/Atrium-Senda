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
