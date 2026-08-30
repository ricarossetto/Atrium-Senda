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
