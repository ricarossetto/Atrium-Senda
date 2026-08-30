import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { Store as NodeStore } from '../js/core/store.js';
import { startTestServer } from './helpers.mjs';

const isolatedCoalescing = await assertDeterministicCoalescing();
assert.equal(isolatedCoalescing.flushRequestCount, 1, 'Uma rajada coalescida deve executar exatamente um flushRequest.');

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: 'pt-BR', viewport: { width: 1280, height: 720 } });
const pageErrors = [];
let stateReads = 0;

page.on('pageerror', error => pageErrors.push(error.message));
page.on('request', request => {
  if (new URL(request.url()).pathname !== '/api/state') return;
  if (request.method() === 'GET') stateReads += 1;
});

await page.addInitScript(() => {
  const nativeSetTimeout = globalThis.setTimeout;
  globalThis.__storeCharacterization = { conflictReloads: 0 };
  globalThis.setTimeout = function (handler, timeout, ...args) {
    if (timeout === 700) {
      globalThis.__storeCharacterization.conflictReloads += 1;
      return 0;
    }
    return nativeSetTimeout.call(this, handler, timeout, ...args);
  };
});

try {
  const storeResponse = await fetch(`${server.baseUrl}/js/core/store.js`);
  assert.equal(storeResponse.status, 200, 'store.js deve ser servido por allowlist explícita.');
  assert.match(storeResponse.headers.get('content-type') || '', /^(text|application)\/javascript\b/i, 'store.js deve usar MIME JavaScript válido.');
  const apiResponse = await fetch(`${server.baseUrl}/js/core/api.js`);
  assert.equal(apiResponse.status, 200, 'api.js deve ser servido por allowlist explícita.');
  assert.match(apiResponse.headers.get('content-type') || '', /^(text|application)\/javascript\b/i, 'api.js deve usar MIME JavaScript válido.');

  const storeSource = await readFile(new URL('../js/core/store.js', import.meta.url), 'utf8');
  const apiSource = await readFile(new URL('../js/core/api.js', import.meta.url), 'utf8');
  assert.doesNotMatch(storeSource, /(?:from|import\s*\()\s*['"][^'"]*(?:portal|views|components)/, 'Store não pode importar portal ou UI.');
  assert.doesNotMatch(apiSource, /(?:from|import\s*\()\s*['"][^'"]*(?:portal|views|components)/, 'API não pode importar portal ou UI.');
  assert.doesNotMatch(storeSource, /\bApp\b|querySelector|document\./, 'Store não pode conhecer App ou DOM.');
  assert.doesNotMatch(apiSource, /\bApp\b|querySelector|document\./, 'API não pode conhecer App ou DOM.');

  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#authSetupForm.active').waitFor();
  await page.evaluate(() => {
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('atrium_tour_seen', 'true');
  });

  await page.locator('#authSetupForm [name="displayName"]').fill('Advogada Teste');
  await page.locator('#authSetupForm [name="username"]').fill('admin_store');
  await page.locator('#authSetupForm [name="password"]').fill('Senha-Teste-Store-2026!');
  await page.locator('#authSetupForm [name="confirmPassword"]').fill('Senha-Teste-Store-2026!');
  await page.locator('#authSetupForm button[type="submit"]').click();
  await page.locator('#authTotpSetupForm.active').waitFor();
  const secret = (await page.locator('#authManualSecret').textContent()).trim();
  await page.locator('#authTotpSetupForm [name="code"]').fill(generateTotp(secret));
  await page.locator('#authTotpSetupForm button[type="submit"]').click();
  await page.locator('#authRecoveryStep.active').waitFor();
  await page.locator('#finishRecovery').click();
  await page.locator('#appShell:not(.hidden)').waitFor();
  await page.waitForLoadState('networkidle');

  await page.evaluate(() => window.Atrium.Store.flush());
  assert.equal(stateReads, 1, 'Store.load deve executar uma única vez no boot inicial.');

  const initialContracts = await page.evaluate(async () => {
    const module = await import('/js/core/store.js');
    return {
      exported: Boolean(module.Store),
      atriumIdentity: module.Store === window.Atrium.Store,
      kellerIdentity: module.Store === window.KellerCentral.Store,
      stateStatus: module.Store.stateStatus
    };
  });
  assert.deepEqual(initialContracts, {
    exported: true,
    atriumIdentity: true,
    kellerIdentity: true,
    stateStatus: 'NEW_INSTALL'
  }, 'Store exportado deve ser o objeto canônico e preservar NEW_INSTALL no primeiro boot.');

  const persistedProbe = await page.evaluate(async () => {
    const store = window.Atrium.Store;
    const id = 'store-module-coalescing';
    store.upsert('tasks', {
      id,
      title: 'Persistência sintética do Store',
      status: 'triagem',
      points: 90,
      createdAt: new Date().toISOString()
    });
    const record = store.state.tasks.find(item => item.id === id);
    record.points = 92;
    store.save();
    record.points = 95;
    store.save();
    store.audit('Auditoria sintética do Store', 'Coalescing 90 → 92 → 95');
    const saved = await store.flush();
    return { saved, revision: store.revision, auditId: store.state.audit[0].id };
  });
  assert.equal(persistedProbe.saved, true, 'Save/flush deve persistir com sucesso.');
  assert.ok(persistedProbe.revision, 'Save deve atualizar revision.');

  const backendProbe = await page.evaluate(async () => {
    const response = await window.KellerAuth.secureFetch('/api/state', { headers: { Accept: 'application/json' } });
    const payload = await response.json();
    const task = payload.state.tasks.find(item => item.id === 'store-module-coalescing');
    const audit = payload.state.audit.find(item => item.id === window.Atrium.Store.state.audit[0].id);
    return { points: task?.points, audit, revision: payload.revision };
  });
  assert.equal(backendProbe.points, 95, 'Coalescing deve preservar o último valor conhecido.');
  assert.equal(backendProbe.revision, persistedProbe.revision, 'Revision do Store deve corresponder ao backend.');
  assert.equal(backendProbe.audit?.action, 'Auditoria sintética do Store', 'Audit deve ser persistido sem alterar formato.');
  assert.equal(backendProbe.audit?.actor, 'Advogada Teste', 'Audit deve preservar actor autenticado.');
  assert.ok(Number.isFinite(Date.parse(backendProbe.audit?.at)), 'Audit deve preservar timestamp ISO.');

  stateReads = 0;
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  assert.equal(stateReads, 1, 'Reload deve executar Store.load uma única vez.');
  const reloadProbe = await page.evaluate(async () => {
    const module = await import('/js/core/store.js');
    return {
      points: module.Store.state.tasks.find(item => item.id === 'store-module-coalescing')?.points,
      audit: module.Store.state.audit.find(item => item.action === 'Auditoria sintética do Store'),
      status: module.Store.stateStatus,
      atriumIdentity: module.Store === window.Atrium.Store,
      kellerIdentity: module.Store === window.KellerCentral.Store
    };
  });
  assert.equal(reloadProbe.points, 95, 'Reload deve recuperar o último estado persistido.');
  assert.equal(reloadProbe.audit?.actor, 'Advogada Teste', 'Reload deve recuperar auditoria persistida.');
  assert.equal(reloadProbe.status, 'READY', 'Estado persistido deve recarregar como READY.');
  assert.equal(reloadProbe.atriumIdentity, true, 'Identidade estrita do Store deve sobreviver ao reload.');
  assert.equal(reloadProbe.kellerIdentity, true, 'Alias KellerCentral deve preservar identidade do Store.');

  await page.evaluate(() => window.Atrium.Store.flush());
  let failNextPersistence = true;
  await page.route('**/api/state', async route => {
    if (route.request().method() === 'POST' && failNextPersistence) {
      failNextPersistence = false;
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'falha sintética' }) });
      return;
    }
    await route.continue();
  });
  const visibleFailure = await page.evaluate(async () => {
    const eventDetails = [];
    window.addEventListener('atrium:store-persistence-error', event => eventDetails.push(event.detail));
    localStorage.setItem('jurisflow_storage_v1', JSON.stringify({ marker: 'legado-pendente' }));
    window.Atrium.Store.state.settings.persistenceFailureProbe = 'Cliente Teste CPF 000.000.000-00';
    const reloadsBefore = globalThis.__storeCharacterization.conflictReloads;
    const failed = await window.Atrium.Store.flush();
    const afterFailure = {
      eventCount: eventDetails.length,
      eventDetail: JSON.stringify(eventDetails[0] || {}),
      legacyPresent: localStorage.getItem('jurisflow_storage_v1') !== null,
      reloads: globalThis.__storeCharacterization.conflictReloads,
      toast: [...document.querySelectorAll('#toastRegion .toast')].map(item => item.textContent).find(text => text.includes('Não foi possível salvar:')) || ''
    };
    const recovered = await window.Atrium.Store.flush();
    return {
      failed,
      recovered,
      reloadsBefore,
      afterFailure,
      finalEventCount: eventDetails.length,
      legacyRemovedAfterSuccess: localStorage.getItem('jurisflow_storage_v1') === null
    };
  });
  await page.unroute('**/api/state');
  assert.equal(visibleFailure.failed, false, 'HTTP 500 deve retornar false ao chamador.');
  assert.equal(visibleFailure.afterFailure.eventCount, 1, 'Uma requisição de persistência falha deve emitir exatamente um evento.');
  assert.match(visibleFailure.afterFailure.toast, /Não foi possível salvar: o servidor não conseguiu concluir a gravação\./, 'Falha HTTP deve ficar visível com motivo sanitizado.');
  assert.match(visibleFailure.afterFailure.eventDetail, /"status":500/, 'Evento deve expor apenas o status HTTP seguro.');
  assert.match(visibleFailure.afterFailure.eventDetail, /"reason":"o servidor não conseguiu concluir a gravação\."/, 'Evento deve expor motivo sanitizado.');
  assert.doesNotMatch(visibleFailure.afterFailure.eventDetail, /Cliente Teste|000\.000\.000-00|persistenceFailureProbe/, 'Detail do evento não pode incluir state ou PII.');
  assert.equal(visibleFailure.afterFailure.legacyPresent, true, 'localStorage legado não pode ser removido após falha.');
  assert.equal(visibleFailure.afterFailure.reloads, visibleFailure.reloadsBefore, 'Falha genérica não pode agendar reload.');
  assert.equal(visibleFailure.recovered, true, 'Novo flush posterior deve recuperar após a falha.');
  assert.equal(visibleFailure.finalEventCount, 1, 'Recuperação bem-sucedida não deve emitir novo evento de falha.');
  assert.equal(visibleFailure.legacyRemovedAfterSuccess, true, 'localStorage legado deve ser removido somente após sucesso.');

  const beforeConflict = await page.evaluate(() => ({
    revision: window.Atrium.Store.revision,
    slogan: window.Atrium.Store.state.settings.officeSlogan
  }));
  assert.ok(beforeConflict.revision, 'Store deve possuir revision antes do teste de conflito.');

  const advancedRevision = await page.evaluate(async () => {
    const store = window.Atrium.Store;
    const state = structuredClone(store.state);
    state.settings.officeSlogan = 'Versão persistida por outra aba';
    const response = await window.KellerAuth.secureFetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, revision: store.revision })
    });
    return (await response.json()).revision;
  });
  assert.notEqual(advancedRevision, beforeConflict.revision, 'Backend deve avançar revision para produzir 409 real.');

  const flushResult = await page.evaluate(async () => {
    window.Atrium.Store.state.settings.officeSlogan = 'Write local conflitante';
    return window.Atrium.Store.flush();
  });
  assert.equal(flushResult, false, 'Store atual deve retornar false em revision 409.');

  const afterConflict = await page.evaluate(() => ({
    revision: window.Atrium.Store.revision,
    reloads: globalThis.__storeCharacterization.conflictReloads,
    toast: [...document.querySelectorAll('#toastRegion .toast')].map(item => item.textContent).find(text => text.includes('outra aba')) || ''
  }));
  assert.equal(afterConflict.revision, beforeConflict.revision, 'Store não deve aceitar silenciosamente a revision concorrente.');
  assert.equal(afterConflict.reloads, 1, 'Conflito deve agendar um único reload.');
  assert.match(afterConflict.toast, /outra aba/, 'Conflito deve preservar feedback visível ao usuário.');

  const persistedSlogan = await page.evaluate(async () => {
    const response = await window.KellerAuth.secureFetch('/api/state', { headers: { Accept: 'application/json' } });
    return (await response.json()).state.settings.officeSlogan;
  });
  assert.equal(persistedSlogan, 'Versão persistida por outra aba', 'Write conflitante não pode sobrescrever o backend.');

  await assertStatusScenarios();
  await assertLegacyImport();
  await assertControlledFailures();
  await assertSafeHttpReasons();
  await assertSerializedWrites();
  assert.deepEqual(pageErrors, [], `Store modular gerou pageerror: ${pageErrors.join(' | ')}`);

  console.log('✓ Store modular aprovado: identidade, status, legado, save/reload, revision, 409, coalescing, audit e falhas controladas.');
} finally {
  await browser.close();
  await server.stop();
}

async function assertDeterministicCoalescing() {
  const original = {
    flushRequest: NodeStore.flushRequest,
    flushPromise: NodeStore.flushPromise,
    saveTimer: NodeStore.saveTimer,
    state: NodeStore.state,
    revision: NodeStore.revision
  };
  let flushRequestCount = 0;
  const observedFlushes = [];

  try {
    clearTimeout(NodeStore.saveTimer);
    NodeStore.saveTimer = null;
    NodeStore.flushPromise = Promise.resolve();
    NodeStore.state = { tasks: [], audit: [] };
    NodeStore.revision = 'coalescing-r0';
    NodeStore.flushRequest = async function () {
      flushRequestCount += 1;
      observedFlushes.push({
        points: this.state.tasks.find(item => item.id === 'store-module-coalescing')?.points,
        auditAction: this.state.audit[0]?.action,
        revision: this.revision
      });
      return true;
    };

    NodeStore.upsert('tasks', {
      id: 'store-module-coalescing',
      title: 'Persistência sintética do Store',
      status: 'triagem',
      points: 90,
      createdAt: new Date().toISOString()
    });
    const record = NodeStore.state.tasks.find(item => item.id === 'store-module-coalescing');
    record.points = 92;
    NodeStore.save();
    record.points = 95;
    NodeStore.save();
    NodeStore.audit('Auditoria sintética do Store', 'Coalescing 90 → 92 → 95', 'Advogada Teste');

    const saved = await NodeStore.flush();
    assert.equal(saved, true, 'O flush coalescido isolado deve concluir com sucesso.');
    assert.deepEqual(observedFlushes, [{
      points: 95,
      auditAction: 'Auditoria sintética do Store',
      revision: 'coalescing-r0'
    }], 'O único flushRequest deve observar o último estado e a auditoria da rajada.');
    return { flushRequestCount };
  } finally {
    clearTimeout(NodeStore.saveTimer);
    NodeStore.flushRequest = original.flushRequest;
    NodeStore.flushPromise = original.flushPromise;
    NodeStore.saveTimer = original.saveTimer;
    NodeStore.state = original.state;
    NodeStore.revision = original.revision;
  }
}

async function assertStatusScenarios() {
  for (const status of ['RECOVERY_REQUIRED', 'FUTURE_SCHEMA_ERROR']) {
    const isolated = await isolatedPage();
    try {
      const result = await isolated.evaluate(async currentStatus => {
        window.OFFICE_DEFAULT_DATA = {};
        window.KellerAuth = {
          currentUser: { displayName: 'Advogada Teste' },
          secureFetch: async () => new Response(JSON.stringify({
            state: null,
            revision: null,
            stateStatus: currentStatus,
            recoveryDetails: { reason: `TEST_${currentStatus}` }
          }), { status: 200, headers: { 'Content-Type': 'application/json' } })
        };
        const { Store } = await import(`/js/core/store.js?status=${currentStatus}`);
        await Store.load();
        return {
          stateStatus: Store.stateStatus,
          recoveryDetails: Store.recoveryDetails,
          demoMode: Store.state.settings.demoMode,
          hasTerms: Store.state.terms.length > 0
        };
      }, status);
      assert.equal(result.stateStatus, status, `${status} deve ser preservado.`);
      assert.equal(result.recoveryDetails.reason, `TEST_${status}`, `${status} deve preservar recoveryDetails.`);
      assert.equal(result.demoMode, true, `${status} deve usar sample state seguro.`);
      assert.equal(result.hasTerms, true, `${status} deve entregar shape utilizável.`);
    } finally {
      await isolated.close();
    }
  }
}

async function assertLegacyImport() {
  const isolated = await isolatedPage();
  try {
    const result = await isolated.evaluate(async () => {
      const legacyState = {
        version: 1,
        terms: [{ id: 'legacy-term', name: 'Advogada Legada', registration: 'OAB/RS 000000' }],
        processes: [{ id: 'legacy-process', number: '0000000-00.2026.8.21.0000', client: 'Cliente Teste' }],
        tasks: [], intimations: [], agenda: [], audit: [], contacts: [], sources: [], settings: { officeName: 'Escritório Legado' }
      };
      localStorage.setItem('jurisflow_storage_v1', JSON.stringify(legacyState));
      window.OFFICE_DEFAULT_DATA = {};
      let stateReads = 0;
      let imported = null;
      window.KellerAuth = {
        currentUser: { displayName: 'Advogada Teste' },
        secureFetch: async (path, options = {}) => {
          if (path === '/api/state/import-legacy') {
            imported = JSON.parse(options.body).legacyState;
            return new Response(JSON.stringify({ revision: 'legacy-r1' }), { status: 200 });
          }
          if (path === '/api/state' && !options.method) {
            stateReads += 1;
            if (stateReads === 1) return new Response(JSON.stringify({ state: null, revision: null, stateStatus: 'NEW_INSTALL' }), { status: 200 });
            return new Response(JSON.stringify({ state: imported, revision: 'legacy-r2', stateStatus: 'READY' }), { status: 200 });
          }
          return new Response(JSON.stringify({ revision: 'legacy-r3' }), { status: 200 });
        }
      };
      const { Store } = await import('/js/core/store.js?case=legacy');
      await Store.load();
      clearTimeout(Store.saveTimer);
      Store.saveTimer = null;
      return {
        status: Store.stateStatus,
        revision: Store.revision,
        processId: Store.state.processes[0]?.id,
        storageRemoved: localStorage.getItem('jurisflow_storage_v1') === null,
        stateReads
      };
    });
    assert.deepEqual(result, {
      status: 'READY',
      revision: 'legacy-r2',
      processId: 'legacy-process',
      storageRemoved: true,
      stateReads: 2
    }, 'Import legado jurisflow_storage_v1 deve permanecer funcional.');
  } finally {
    await isolated.close();
  }
}

async function assertControlledFailures() {
  const networkPage = await isolatedPage();
  try {
    const networkResult = await networkPage.evaluate(async () => {
      window.OFFICE_DEFAULT_DATA = {};
      window.KellerAuth = {
        currentUser: { displayName: 'Advogada Teste' },
        secureFetch: async () => { throw new TypeError('Falha de rede simulada'); }
      };
      const events = [];
      let reloads = 0;
      const nativeSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = (handler, timeout, ...args) => {
        if (timeout === 700) reloads += 1;
        return nativeSetTimeout(handler, timeout, ...args);
      };
      window.addEventListener('atrium:store-persistence-error', event => events.push(event.detail));
      const { Store } = await import('/js/core/store.js?case=network');
      await Store.load();
      clearTimeout(Store.saveTimer);
      Store.saveTimer = null;
      Store.state.settings.clientMarker = 'Cliente Teste Sigiloso';
      const saved = await Store.flush();
      return { loadedFallback: Boolean(Store.state?.settings), saved, events, reloads };
    });
    assert.equal(networkResult.loadedFallback, true, 'Falha de rede deve manter fallback utilizável.');
    assert.equal(networkResult.saved, false, 'Falha de rede deve retornar false sem timeout.');
    assert.equal(networkResult.events.length, 1, 'Falha de rede deve emitir um único evento.');
    assert.equal(networkResult.events[0].status, null);
    assert.match(networkResult.events[0].reason, /falha de conexão/);
    assert.equal(networkResult.reloads, 0, 'Falha de rede não deve reutilizar o reload do conflito 409.');
    assert.doesNotMatch(JSON.stringify(networkResult.events[0]), /Cliente Teste Sigiloso|clientMarker/, 'Evento de rede não pode vazar state ou PII.');
  } finally {
    await networkPage.close();
  }

  const httpPage = await isolatedPage();
  try {
    const httpResult = await httpPage.evaluate(async () => {
      let attempts = 0;
      const events = [];
      window.KellerAuth = {
        secureFetch: async () => {
          attempts += 1;
          if (attempts === 1) return new Response('indisponível', { status: 500 });
          return new Response(JSON.stringify({ revision: 'http-r1' }), { status: 200 });
        }
      };
      window.addEventListener('atrium:store-persistence-error', event => events.push(event.detail));
      const { Store } = await import('/js/core/store.js?case=http-error');
      Store.state = { audit: [], client: 'Cliente Teste Protegido' };
      Store.revision = 'http-r0';
      const failed = await Store.flush();
      const recovered = await Store.flush();
      return { failed, recovered, attempts, events, revision: Store.revision };
    });
    assert.equal(httpResult.failed, false, 'Erro HTTP 500 deve retornar false sem fingir persistência.');
    assert.equal(httpResult.recovered, true, 'Fila deve aceitar novo save bem-sucedido após HTTP 500.');
    assert.equal(httpResult.attempts, 2, 'Retry posterior deve executar uma nova requisição.');
    assert.equal(httpResult.events.length, 1, 'HTTP 500 deve emitir exatamente um evento de falha.');
    assert.equal(httpResult.events[0].status, 500);
    assert.equal(httpResult.events[0].reason, 'o servidor não conseguiu concluir a gravação.');
    assert.equal(httpResult.revision, 'http-r1', 'Retry deve atualizar revision normalmente.');
    assert.doesNotMatch(JSON.stringify(httpResult.events[0]), /Cliente Teste Protegido/, 'Evento HTTP não pode incluir conteúdo do estado.');
  } finally {
    await httpPage.close();
  }
}

async function assertSafeHttpReasons() {
  const scenarios = [
    { status: 400, backendMessage: 'Estado incompatível com a versão atual.', expected: /Estado incompatível/ },
    { status: 401, backendMessage: 'MARCADOR_SIGILOSO', expected: /sessão expirou/ },
    { status: 403, backendMessage: 'MARCADOR_SIGILOSO', expected: /não tem permissão/ },
    { status: 413, backendMessage: 'MARCADOR_SIGILOSO', expected: /excedem o limite/ },
    { status: 423, backendMessage: 'MARCADOR_SIGILOSO', expected: /modo de recuperação/ },
    { status: 500, backendMessage: 'C:\\dados\\Cliente Teste\\MARCADOR_SIGILOSO', expected: /não conseguiu concluir/ }
  ];
  for (const scenario of scenarios) {
    const isolated = await isolatedPage();
    try {
      const result = await isolated.evaluate(async current => {
        const events = [];
        window.KellerAuth = {
          secureFetch: async () => new Response(JSON.stringify({ message: current.backendMessage }), {
            status: current.status,
            headers: { 'Content-Type': 'application/json' }
          })
        };
        window.addEventListener('atrium:store-persistence-error', event => events.push(event.detail));
        const { Store } = await import(`/js/core/store.js?case=http-${current.status}`);
        Store.state = { audit: [], settings: { marker: 'Cliente Teste Protegido' } };
        Store.revision = 'safe-http-r0';
        const saved = await Store.flush();
        return { saved, detail: events[0] };
      }, scenario);
      assert.equal(result.saved, false);
      assert.equal(result.detail.status, scenario.status);
      assert.match(result.detail.reason, scenario.expected);
      assert.match(result.detail.message, /^Não foi possível salvar:/);
      assert.doesNotMatch(JSON.stringify(result.detail), /Cliente Teste Protegido|MARCADOR_SIGILOSO|C:\\dados/, 'Erro sanitizado não pode incluir state, PII ou detalhe interno.');
    } finally {
      await isolated.close();
    }
  }
}

async function assertSerializedWrites() {
  const isolated = await isolatedPage();
  try {
    const result = await isolated.evaluate(async () => {
      const payloads = [];
      let releaseFirst;
      let requestCount = 0;
      window.KellerAuth = {
        secureFetch: async (_path, options) => {
          requestCount += 1;
          payloads.push(JSON.parse(options.body));
          if (requestCount === 1) {
            return new Promise(resolve => {
              releaseFirst = () => resolve(new Response(JSON.stringify({ revision: 'queue-r1' }), { status: 200 }));
            });
          }
          return new Response(JSON.stringify({ revision: 'queue-r2' }), { status: 200 });
        }
      };
      const { Store } = await import('/js/core/store.js?case=queue');
      Store.state = { audit: [], settings: { marker: 'first' } };
      Store.revision = 'queue-r0';
      const first = Store.enqueueFlush();
      while (!releaseFirst) await Promise.resolve();
      Store.state.settings.marker = 'last';
      const second = Store.enqueueFlush();
      releaseFirst();
      const outcomes = await Promise.all([first, second]);
      return { payloads, outcomes, revision: Store.revision };
    });
    assert.deepEqual(result.outcomes, [true, true], 'Fila serializada deve concluir ambos os writes.');
    assert.equal(result.payloads[0].state.settings.marker, 'first', 'Primeiro write deve capturar o primeiro estado.');
    assert.equal(result.payloads[0].revision, 'queue-r0', 'Primeiro write deve usar revision inicial.');
    assert.equal(result.payloads[1].state.settings.marker, 'last', 'Segundo write deve preservar o último estado conhecido.');
    assert.equal(result.payloads[1].revision, 'queue-r1', 'Segundo write deve usar revision recebida do primeiro.');
    assert.equal(result.revision, 'queue-r2', 'Store deve terminar com a revision mais recente.');
  } finally {
    await isolated.close();
  }
}

async function isolatedPage() {
  const isolated = await browser.newPage({ locale: 'pt-BR' });
  await isolated.goto(`${server.baseUrl}/store-module-isolated`, { waitUntil: 'domcontentloaded' });
  return isolated;
}
