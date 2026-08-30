import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

try {
  const session = await setupMaster(server.baseUrl);
  const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1280, height: 800 } });
  const separator = session.cookie.indexOf('=');
  await context.addCookies([{
    name: session.cookie.slice(0, separator),
    value: session.cookie.slice(separator + 1),
    url: server.baseUrl
  }]);
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('atrium_tour_seen', 'true');
  });
  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  await page.evaluate(() => window.Atrium.Store.flush());

  const scenarios = await page.evaluate(async () => {
    const app = window.portalApp;
    const store = window.Atrium.Store;
    const auth = window.KellerAuth;
    const original = {
      flush: store.flush,
      save: store.save,
      audit: store.audit,
      secureFetch: auth.secureFetch,
      toast: app.toast,
      renderAll: app.renderAll,
      syncAll: app.syncAll
    };

    const run = async ({ flushResults, apiOk = true, silent = false }) => {
      const toasts = [];
      let apiCalls = 0;
      let flushCalls = 0;
      const before = JSON.stringify(store.state);
      store.flush = async () => flushResults[flushCalls++] ?? false;
      store.save = () => {};
      store.audit = () => {};
      auth.secureFetch = async path => {
        if (path === '/api/sync') apiCalls += 1;
        return new Response(JSON.stringify(apiOk ? {
          events: [], tasks: [], intimations: [], processes: [], contacts: [], sources: [], imported: 0
        } : { message: 'Falha sintética segura da sincronização.' }), {
          status: apiOk ? 200 : 503,
          headers: { 'Content-Type': 'application/json' }
        });
      };
      app.toast = (message, type = '') => toasts.push({ message, type });
      app.renderAll = () => {};
      const result = await app.syncAll({ silent });
      return {
        result,
        apiCalls,
        flushCalls,
        successToasts: toasts.filter(item => item.type === 'success').length,
        errorToasts: toasts.filter(item => item.type === 'error').length,
        stateUnchanged: JSON.stringify(store.state) === before
      };
    };

    try {
      const preflushFailure = await run({ flushResults: [false] });
      const apiFailure = await run({ flushResults: [true], apiOk: false });
      const finalFlushFailure = await run({ flushResults: [true, false] });
      const success = await run({ flushResults: [true, true] });
      const silentSuccess = await run({ flushResults: [true, true], silent: true });

      const judicialToasts = [];
      app.toast = (message, type = '') => judicialToasts.push({ message, type });
      store.audit = () => {};
      app.syncAll = async () => false;
      const judicialFailure = await app.syncJudicialNow();
      const judicialFailureSuccessToasts = judicialToasts.filter(item => item.type === 'success').length;
      judicialToasts.length = 0;
      app.syncAll = async () => true;
      const judicialSuccess = await app.syncJudicialNow();
      const judicialSuccessToasts = judicialToasts.filter(item => item.type === 'success').length;

      return {
        preflushFailure,
        apiFailure,
        finalFlushFailure,
        success,
        silentSuccess,
        judicialFailure,
        judicialFailureSuccessToasts,
        judicialSuccess,
        judicialSuccessToasts
      };
    } finally {
      store.flush = original.flush;
      store.save = original.save;
      store.audit = original.audit;
      auth.secureFetch = original.secureFetch;
      app.toast = original.toast;
      app.renderAll = original.renderAll;
      app.syncAll = original.syncAll;
    }
  });

  assert.equal(scenarios.preflushFailure.result, false);
  assert.equal(scenarios.preflushFailure.apiCalls, 0, 'Pre-flush false não pode chamar /api/sync.');
  assert.equal(scenarios.preflushFailure.successToasts, 0);
  assert.equal(scenarios.preflushFailure.stateUnchanged, true, 'Cancelamento pré-sync não pode alterar o estado.');

  assert.equal(scenarios.apiFailure.result, false);
  assert.equal(scenarios.apiFailure.apiCalls, 1);
  assert.equal(scenarios.apiFailure.successToasts, 0, 'Falha HTTP não pode emitir sucesso.');

  assert.equal(scenarios.finalFlushFailure.result, false);
  assert.equal(scenarios.finalFlushFailure.apiCalls, 1);
  assert.equal(scenarios.finalFlushFailure.successToasts, 0, 'Falha do flush final não pode emitir sucesso.');

  assert.equal(scenarios.success.result, true);
  assert.equal(scenarios.success.apiCalls, 1);
  assert.equal(scenarios.success.successToasts, 1, 'Sync interativo bem-sucedido deve emitir exatamente um sucesso.');

  assert.equal(scenarios.silentSuccess.result, true);
  assert.equal(scenarios.silentSuccess.successToasts, 0, 'Sync silencioso não deve emitir toast de sucesso.');
  assert.equal(scenarios.silentSuccess.errorToasts, 0, 'Sync silencioso bem-sucedido não deve emitir erro.');

  assert.equal(scenarios.judicialFailure, false, 'syncNow judicial deve propagar cancelamento/falha.');
  assert.equal(scenarios.judicialFailureSuccessToasts, 0, 'syncNow judicial não pode fingir sucesso após false.');
  assert.equal(scenarios.judicialSuccess, true);
  assert.equal(scenarios.judicialSuccessToasts, 1, 'syncNow judicial deve emitir um único sucesso quando onSyncAll retorna true.');

  console.log('✓ Contrato de sincronização aprovado: preflush, HTTP, flush final, sucesso único e modo silencioso.');
  await context.close();
} finally {
  await browser.close();
  await server.stop();
}

async function setupMaster(baseUrl) {
  let response = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'admin.sync.contract',
    displayName: 'Administradora Sync Sintética',
    password: 'Senha-Sync-Contrato-Sintetica-2026!'
  });
  const setup = await response.json();
  assert.equal(response.status, 200);
  response = await postJson(`${baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie').split(';')[0] };
}
