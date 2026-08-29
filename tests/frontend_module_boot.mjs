import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { startTestServer } from './helpers.mjs';

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: 'pt-BR', viewport: { width: 1440, height: 900 } });

const pageErrors = [];
let scriptRequests = [];
let stateReads = 0;
let syncRequests = 0;

page.on('pageerror', error => pageErrors.push(error.message));
page.on('request', request => {
  const pathname = new URL(request.url()).pathname;
  if (request.resourceType() === 'script') scriptRequests.push(pathname);
  if (pathname === '/api/state' && request.method() === 'GET') stateReads += 1;
  if (pathname === '/api/sync' && request.method() === 'POST') syncRequests += 1;
});

await page.addInitScript(() => {
  const probe = {
    authenticatedListeners: 0,
    foundationEvents: 0,
    navigationListeners: 0,
    fiveMinuteIntervals: 0,
    dependencySnapshots: []
  };
  globalThis.__atriumModuleBootProbe = probe;

  const nativeAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (this === globalThis && type === 'keller:authenticated') probe.authenticatedListeners += 1;
    if (type === 'click' && this instanceof Element && this.matches('[data-view]')) probe.navigationListeners += 1;
    return nativeAddEventListener.call(this, type, listener, options);
  };

  const nativeSetInterval = globalThis.setInterval;
  globalThis.setInterval = function (handler, timeout, ...args) {
    if (timeout === 5 * 60 * 1000) probe.fiveMinuteIntervals += 1;
    return nativeSetInterval.call(this, handler, timeout, ...args);
  };

  const nativeFetch = globalThis.fetch;
  globalThis.fetch = function (input, init) {
    const requestUrl = typeof input === 'string' ? input : input.url;
    const method = String(init?.method || (typeof input === 'string' ? 'GET' : input.method) || 'GET').toUpperCase();
    if (new URL(requestUrl, location.href).pathname === '/api/state' && method === 'GET') {
      probe.dependencySnapshots.push({
        auth: Boolean(globalThis.KellerAuth),
        prompts: Array.isArray(globalThis.PROMPTS_DATA),
        skills: Array.isArray(globalThis.CODEX_LEGAL_SKILLS),
        office: Boolean(globalThis.OFFICE_DEFAULT_DATA),
        qr: typeof globalThis.jsQR === 'function',
        atrium: Boolean(globalThis.Atrium),
        app: Boolean(globalThis.portalApp),
        dom: Boolean(document.getElementById('appShell'))
      });
    }
    return nativeFetch.call(this, input, init);
  };

  document.addEventListener('atrium:module-foundation-ready', () => {
    probe.foundationEvents += 1;
  });
});

try {
  const bootstrapResponse = await fetch(`${server.baseUrl}/js/app/bootstrap.js`);
  assert.equal(bootstrapResponse.status, 200, 'bootstrap.js deve responder com HTTP 200.');
  assert.match(await bootstrapResponse.text(), /import ['"]\.\.\/portal\.js['"]/, 'bootstrap.js deve controlar o carregamento de portal.js pelo grafo ES module.');

  await navigateAndAssertSingleModuleGraph();
  await page.locator('#authSetupForm.active').waitFor();
  await page.evaluate(() => {
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('atrium_tour_seen', 'true');
  });

  await page.locator('#authSetupForm [name="displayName"]').fill('Advogada Teste');
  await page.locator('#authSetupForm [name="username"]').fill('admin_modulo');
  await page.locator('#authSetupForm [name="password"]').fill('Senha-Teste-Modulo-2026!');
  await page.locator('#authSetupForm [name="confirmPassword"]').fill('Senha-Teste-Modulo-2026!');
  await page.locator('#authSetupForm button[type="submit"]').click();

  await page.locator('#authTotpSetupForm.active').waitFor();
  const secret = (await page.locator('#authManualSecret').textContent()).trim();
  await page.locator('#authTotpSetupForm [name="code"]').fill(generateTotp(secret));
  await page.locator('#authTotpSetupForm button[type="submit"]').click();
  await page.locator('#authRecoveryStep.active').waitFor();
  await page.locator('#finishRecovery').click();

  await assertApplicationReady();
  assert.equal(stateReads, 1, 'Store.load deve fazer uma única leitura inicial de estado.');
  assert.equal(syncRequests, 1, 'O sync inicial deve disparar uma única vez.');

  const firstBootProbe = await readProbe();
  assert.equal(firstBootProbe.authenticatedListeners, 1, 'portal.js deve registrar um único listener de autenticação.');
  assert.equal(firstBootProbe.foundationEvents, 1, 'A fundação modular deve ser anunciada uma única vez.');
  assert.equal(firstBootProbe.fiveMinuteIntervals, 1, 'App.init deve registrar um único timer de sincronização automática.');
  assert.ok(firstBootProbe.navigationListeners >= 2, 'A navegação principal não foi vinculada.');
  assert.deepEqual(firstBootProbe.dependencySnapshots, [{
    auth: true,
    prompts: true,
    skills: true,
    office: true,
    qr: true,
    atrium: true,
    app: true,
    dom: true
  }], 'As dependências clássicas devem existir antes de Store.load e App.init.');

  await page.locator('button[data-view="contacts"]').click();
  await page.locator('#view-contacts.active').waitFor();
  await page.locator('button[data-view="configuration"]').click();
  await page.locator('#view-configuration.active').waitFor();
  await page.locator('button[data-view="dashboard"]').click();
  await page.locator('#view-dashboard.active').waitFor();

  const beforeRepeatedAuth = { stateReads, syncRequests, probe: await readProbe() };
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('keller:authenticated', { detail: window.KellerAuth.currentUser }));
  });
  await page.waitForTimeout(250);
  const afterRepeatedAuth = { stateReads, syncRequests, probe: await readProbe() };
  assert.deepEqual(afterRepeatedAuth, beforeRepeatedAuth, 'Um segundo evento de autenticação não pode repetir App.init, Store.load, listeners, timers ou sync.');

  scriptRequests = [];
  stateReads = 0;
  syncRequests = 0;
  await page.reload({ waitUntil: 'networkidle' });
  await assertSingleScriptGraph();
  await assertApplicationReady();
  assert.equal(stateReads, 1, 'Reload deve inicializar um único Store.');
  assert.equal(syncRequests, 1, 'Reload deve disparar um único sync inicial.');

  const reloadProbe = await readProbe();
  assert.equal(reloadProbe.authenticatedListeners, 1, 'Reload deve registrar uma única fronteira de autenticação.');
  assert.equal(reloadProbe.foundationEvents, 1, 'Reload deve anunciar a fundação uma única vez.');
  assert.equal(reloadProbe.fiveMinuteIntervals, 1, 'Reload deve registrar somente um timer de sync.');
  assert.deepEqual(pageErrors, [], `O boot modular gerou pageerror: ${pageErrors.join(' | ')}`);

  console.log('✓ Boot modular aprovado: portal único, ordem determinística, auth, Store, App, navegação, globals e reload.');
} finally {
  await browser.close();
  await server.stop();
}

async function navigateAndAssertSingleModuleGraph() {
  const response = await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  assert.ok(response?.ok(), 'A aplicação deve responder durante o boot modular.');
  await page.locator('html').waitFor();
  await assertSingleScriptGraph();
}

async function assertSingleScriptGraph() {
  const portalRequests = scriptRequests.filter(pathname => pathname === '/js/portal.js');
  assert.equal(portalRequests.length, 1, 'portal.js deve ser requisitado exatamente uma vez pelo grafo ES module.');
  assert.equal(await page.locator('script[src*="js/portal.js"]').count(), 0, 'portal.js não pode permanecer como script clássico.');
  assert.equal(await page.locator('script[type="module"][src*="js/app/bootstrap.js"]').count(), 1, 'bootstrap.js deve ser o único entrypoint modular declarado no HTML.');

  const counts = new Map();
  for (const pathname of scriptRequests) counts.set(pathname, (counts.get(pathname) || 0) + 1);
  const duplicates = [...counts].filter(([, count]) => count !== 1);
  assert.deepEqual(duplicates, [], `Scripts duplicados no mesmo carregamento: ${JSON.stringify(duplicates)}`);
}

async function assertApplicationReady() {
  await page.locator('#appShell:not(.hidden)').waitFor();
  await page.locator('#view-dashboard.active').waitFor();
  await page.locator('#view-dashboard .metric-grid, #view-dashboard .dashboard-workspace-wrap').first().waitFor();
  const contracts = await page.evaluate(() => ({
    store: Boolean(window.Atrium?.Store?.state),
    app: Boolean(window.Atrium?.App),
    atrium: window.Atrium === window.AtriumSenda && window.Atrium === window.JurisFlow,
    keller: window.KellerCentral === window.Atrium,
    portal: window.portalApp === window.Atrium?.App,
    authenticated: Boolean(window.KellerAuth?.authenticated)
  }));
  assert.deepEqual(contracts, {
    store: true,
    app: true,
    atrium: true,
    keller: true,
    portal: true,
    authenticated: true
  }, 'Auth, App, Store e globals legados devem permanecer disponíveis.');
}

function readProbe() {
  return page.evaluate(() => structuredClone(globalThis.__atriumModuleBootProbe));
}
