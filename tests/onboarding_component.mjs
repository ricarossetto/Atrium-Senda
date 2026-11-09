import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const server = await startTestServer({ env: { JEV_CMD_BIN: 'node' } });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];

page.on('pageerror', error => pageErrors.push(error.message));
await context.addInitScript(() => {
  const probe = { autoTimers: 0, listeners: {} };
  globalThis.__onboardingProbe = probe;

  const nativeSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = function (handler, timeout, ...args) {
    if (timeout === 600) probe.autoTimers += 1;
    return nativeSetTimeout.call(this, handler, timeout, ...args);
  };

  const nativeAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    const target = this === document ? 'document' : this?.id;
    if (target && [
      'document',
      'tourButton',
      'btnOpenTourFromConfig',
      'tourCloseButton',
      'tourSkipButton',
      'tourPrevButton',
      'tourNextButton',
      'guidedTourBackdrop',
      'tourDots',
      'certChoiceYes',
      'certChoiceNo',
      'certChoiceYesBox',
      'certChoiceNoBox',
      'certDropzone',
      'onboardingCertFileInput',
      'btnContinueWithoutCert',
      'btnSubmitOnboardingCert'
    ].includes(target)) {
      const key = `${target}:${type}`;
      probe.listeners[key] = (probe.listeners[key] || 0) + 1;
    }
    return nativeAddEventListener.call(this, type, listener, options);
  };
});

try {
  await configureAuthenticatedSession();
  const response = await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  assert.ok(response?.ok(), 'O portal deve carregar para o teste do onboarding.');
  await page.locator('#appShell:not(.hidden)').waitFor();

  await page.locator('#productTour .product-tour-card').waitFor({ timeout: 2500 });
  await page.locator('[data-tour-skip]').click();
  await page.locator('#productTour').waitFor({ state: 'detached' });
  await page.evaluate(() => window.Atrium.App.openGuidedTour(true));

  const initialProbe = await readProbe();
  assertSingleListeners(initialProbe.listeners);

  await page.locator('#guidedTourBackdrop:not(.hidden)').waitFor({ timeout: 2500 });
  await assertSlide(0, 'Primeiro acesso deve abrir o slide inicial.');
  assert.equal(await page.locator('.guided-tour-modal').count(), 1, 'Deve existir somente um tour no DOM.');
  assert.equal(await page.locator('#tourPrevButton').evaluate(element => element.style.display), 'none', 'Anterior deve começar oculto.');
  assert.equal(await page.locator('#tourNextButton').textContent(), 'Próximo ', 'O primeiro passo deve exibir a ação Próximo.');
  assert.equal(await page.evaluate(() => window.Atrium.App.currentTourSlide), 0, 'O estado público legado deve iniciar no slide zero.');

  await page.locator('#tourNextButton').click();
  await assertSlide(1, 'Próximo deve avançar um slide.');
  await page.keyboard.press('ArrowRight');
  await assertSlide(2, 'Seta para a direita deve avançar um slide.');

  const beforeSecondAuth = await readProbe();
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('keller:authenticated', { detail: window.KellerAuth.currentUser }));
  });
  await page.waitForTimeout(250);
  const afterSecondAuth = await readProbe();
  assert.deepEqual(afterSecondAuth, beforeSecondAuth, 'Segundo evento de autenticação não pode duplicar timer ou listeners.');
  await assertSlide(2, 'Segundo evento de autenticação não pode alterar o passo atual.');

  await page.keyboard.press('ArrowLeft');
  await assertSlide(1, 'Seta para a esquerda deve voltar um slide.');
  await page.locator('#tourNextButton').click();
  await assertSlide(2, 'Próximo deve continuar avançando.');
  await page.locator('#tourPrevButton').click();
  await assertSlide(1, 'Anterior deve voltar um slide.');
  await page.locator('#tourDots [data-slide-target="5"]').click();
  await assertSlide(5, 'Indicador deve navegar diretamente ao slide escolhido.');
  assert.equal(await page.locator('#tourNextButton').textContent(), 'Começar a usar o Atrium', 'Último passo deve preservar o texto de conclusão sem emoji decorativo.');

  const finishSave = waitForStateSave();
  await page.locator('#tourNextButton').click();
  await finishSave;
  await assertTourClosed('Concluir deve fechar o tour.');
  await page.locator('#toastRegion .toast.success', { hasText: 'Apresentação concluída! Bom trabalho.' }).waitFor();
  await assertSeenState('Concluir deve marcar o tour como visto.');

  await page.evaluate(() => {
    localStorage.removeItem('atrium_tour_seen');
    localStorage.removeItem('jurisflow_tour_seen');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  await page.waitForTimeout(750);
  await assertTourClosed('O estado persistido no backend deve impedir autoabertura após reload sem chaves locais.');
  assert.equal((await readProbe()).autoTimers, 0, 'Tour visto no Store não deve agendar timer de autoabertura no reload.');
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.settings.guidedTourSeen), true, 'Reload deve recuperar guidedTourSeen do backend.');
  assertSingleListeners((await readProbe()).listeners);

  await page.locator('#v2UtilitiesMenu > summary').click();
  assert.equal(await page.locator('#v2UtilitiesConfiguration').isVisible(), true, 'O menu de utilidades deve oferecer acesso às Configurações.');
  await page.locator('#v2UtilitiesConfiguration').click();
  await page.locator('#view-configuration.active').waitFor();
  assert.equal(await page.locator('#v2UtilitiesMenu').getAttribute('open'), null, 'O menu deve fechar depois da navegação.');
  await page.locator('button[data-view="dashboard"]').click();
  await page.locator('#v2UtilitiesMenu > summary').click();
  // O botão do menu abre o tour novo. A apresentação antiga só abre por chamada direta.
  await page.locator('#tourButton').click();
  await page.locator('#productTour .product-tour-card').waitFor();
  await page.locator('[data-tour-skip]').click();
  await page.locator('#productTour').waitFor({ state: 'detached' });
  await page.evaluate(() => window.Atrium.App.openGuidedTour(true));
  await page.locator('#guidedTourBackdrop:not(.hidden)').waitFor();
  await assertSlide(0, 'Abertura manual pelo cabeçalho deve ignorar a flag de visto.');
  await page.locator('#tourCloseButton').click();
  await assertTourClosed('Fechar deve encerrar o tour.');
  await assertSeenState('Fechar deve marcar o tour como visto.');

  await page.locator('button[data-view="configuration"]').click();
  await page.locator('#view-configuration.active').waitFor();
  await page.locator('#btnOpenTourFromConfig').click();
  await page.locator('#productTour .product-tour-card').waitFor();
  await page.locator('[data-tour-skip]').click();
  await page.locator('#productTour').waitFor({ state: 'detached' });
  await page.evaluate(() => window.Atrium.App.openGuidedTour(true));
  await page.locator('#guidedTourBackdrop:not(.hidden)').waitFor();
  await assertSlide(0, 'A apresentação antiga deve continuar abrindo por chamada direta.');
  const openEscapeConsumed = await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    return event.defaultPrevented;
  });
  assert.equal(openEscapeConsumed, true, 'Escape do tour aberto deve consumir o evento.');
  await assertTourClosed('Escape deve fechar o tour aberto.');

  await resetSeenInMemory();
  await page.evaluate(() => window.Atrium.App.openGuidedTour(true));
  await page.locator('#guidedTourBackdrop:not(.hidden)').waitFor();
  await page.locator('#tourSkipButton').click();
  await assertTourClosed('Pular deve fechar o tour.');
  await assertSeenState('Pular deve marcar o tour como visto.');

  await resetSeenInMemory();
  await page.evaluate(() => window.Atrium.App.openGuidedTour(true));
  await page.locator('#guidedTourBackdrop:not(.hidden)').waitFor();
  await page.evaluate(() => document.getElementById('guidedTourBackdrop')
    .dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await assertTourClosed('Clique no backdrop deve fechar o tour.');
  await assertSeenState('Clique no backdrop deve marcar o tour como visto.');

  await resetSeenInMemory();
  await assertTourClosed('O tour deve estar fechado antes de caracterizar Escape global.');
  const closedWrites = await page.evaluate(() => {
    const store = window.Atrium.Store;
    const originalSave = store.save;
    let writes = 0;
    store.save = () => { writes += 1; };
    try {
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      window.Atrium.App.closeGuidedTour();
      return {
        writes,
        consumed: event.defaultPrevented,
        atrium: localStorage.getItem('atrium_tour_seen'),
        legacy: localStorage.getItem('jurisflow_tour_seen'),
        seen: store.state.settings.guidedTourSeen
      };
    } finally {
      store.save = originalSave;
    }
  });
  assert.deepEqual(closedWrites, { writes: 0, consumed: false, atrium: null, legacy: null, seen: false }, 'Escape e close com tour fechado não consomem evento nem gravam estado.');

  const beforeRepeatedOpen = await readProbe();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.evaluate(() => window.Atrium.App.openGuidedTour(true));
    await page.locator('#guidedTourBackdrop:not(.hidden)').waitFor();
    await page.evaluate(() => window.Atrium.App.closeGuidedTour());
    await assertTourClosed('Abertura e fechamento repetidos devem permanecer estáveis.');
  }
  assert.deepEqual(await readProbe(), beforeRepeatedOpen, 'Aberturas repetidas não podem registrar novos listeners ou timers.');
  assert.equal(await page.locator('.guided-tour-modal').count(), 1, 'Aberturas repetidas não podem duplicar o markup do tour.');
  // A abertura automática passou para o tour novo: ver tests/ui_v2_product_tour.mjs.
  await assertOnboardingRecovery();
  assert.deepEqual(pageErrors, [], `Onboarding gerou pageerror: ${pageErrors.join(' | ')}`);

  console.log('✓ Onboarding caracterizado: primeiro acesso, timer único, navegação, conclusão, persistência, reload e reabertura manual.');
} finally {
  await context.close();
  await browser.close();
  await server.stop();
}

async function configureAuthenticatedSession() {
  const password = 'Senha-Onboarding-2026!';
  const setupResponse = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_onboarding',
    displayName: 'Advogada Onboarding',
    password
  });
  assert.equal(setupResponse.status, 200, 'Setup administrativo deve ser aceito.');
  const setup = await setupResponse.json();
  const verifyResponse = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  assert.equal(verifyResponse.status, 200, 'TOTP do setup deve ser aceito.');
  const cookie = verifyResponse.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie, 'Setup deve criar cookie de sessão.');
  const separator = cookie.indexOf('=');
  await context.addCookies([{
    name: cookie.slice(0, separator),
    value: cookie.slice(separator + 1),
    domain: '127.0.0.1',
    path: '/'
  }]);
}

function assertSingleListeners(listeners) {
  for (const key of [
    'tourButton:click',
    'btnOpenTourFromConfig:click',
    'tourCloseButton:click',
    'tourSkipButton:click',
    'tourPrevButton:click',
    'tourNextButton:click',
    'guidedTourBackdrop:click',
    'tourDots:click'
  ]) {
    assert.equal(listeners[key], 1, `${key} deve ser registrado uma única vez por documento.`);
  }
}

async function assertSlide(index, message) {
  assert.equal(await page.evaluate(() => Number(document.querySelector('.tour-slide.active')?.dataset.slide)), index, message);
  assert.equal(await page.locator(`.tour-dot[data-slide-target="${index}"]`).getAttribute('aria-selected'), 'true', 'Dot ativo deve refletir o slide atual.');
  assert.equal(await page.evaluate(() => window.Atrium.App.currentTourSlide), index, 'Estado legado currentTourSlide deve acompanhar o componente.');
}

async function assertTourClosed(message) {
  await page.locator('#guidedTourBackdrop.hidden').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#guidedTourBackdrop').evaluate(element => element.classList.contains('hidden')), true, message);
}

async function assertSeenState(message) {
  const state = await page.evaluate(() => ({
    atrium: localStorage.getItem('atrium_tour_seen'),
    legacy: localStorage.getItem('jurisflow_tour_seen'),
    store: window.Atrium.Store.state.settings.guidedTourSeen
  }));
  assert.deepEqual(state, { atrium: 'true', legacy: 'true', store: true }, message);
}

async function resetSeenInMemory() {
  await page.evaluate(() => {
    localStorage.removeItem('atrium_tour_seen');
    localStorage.removeItem('jurisflow_tour_seen');
    window.Atrium.Store.state.settings.guidedTourSeen = false;
  });
}

function waitForStateSave() {
  return page.waitForResponse(response => response.url().endsWith('/api/state')
    && response.request().method() === 'POST'
    && response.status() === 200);
}

async function assertTourTimerRecovery() {
  await resetSeenInMemory();
  await page.evaluate(() => {
    const { App, Store } = window.Atrium;
    const nativeTimeout = window.setTimeout;
    const nativeClear = window.clearTimeout;
    window.__tourRecovery = { nativeTimeout, nativeClear, callbacks: new Map(), cancelled: [], next: 900000 };
    window.setTimeout = (callback, delay, ...args) => {
      if (delay !== 600) return nativeTimeout(callback, delay, ...args);
      const id = ++window.__tourRecovery.next;
      window.__tourRecovery.callbacks.set(id, callback);
      return id;
    };
    window.clearTimeout = id => {
      if (window.__tourRecovery.callbacks.has(id)) window.__tourRecovery.cancelled.push(id);
      else nativeClear(id);
    };
    sessionStorage.removeItem('atrium_pending_setup_wizard');
    sessionStorage.removeItem('atrium_pending_a1_onboarding');
    Store.state.settings.guidedTourSeen = false;
    App.checkFirstAccessTour();
    const timer = App.tourTimer;
    const overlay = document.getElementById('modalBackdrop');
    overlay.classList.remove('hidden');
    window.__tourRecovery.callbacks.get(timer)();
    overlay.classList.add('hidden');
  });
  try {
    await assertTourClosed('Callback tardio não abre tour sobre outro modal.');
    assert.equal(await page.evaluate(() => window.Atrium.App.tourTimer), null, 'Callback concluído limpa referência pública do timer.');
    const cancelled = await page.evaluate(() => {
      const app = window.Atrium.App;
      app.checkFirstAccessTour();
      const pending = app.tourTimer;
      const opened = app.openSetupWizard();
      return { opened, cancelled: window.__tourRecovery.cancelled.includes(pending), timer: app.tourTimer };
    });
    assert.deepEqual(cancelled, { opened: true, cancelled: true, timer: null }, 'Abrir wizard cancela timer do componente e callback atualiza App.');
    await page.keyboard.press('Escape');
    const reopened = await page.evaluate(() => {
      const app = window.Atrium.App;
      const timer = app.tourTimer;
      const opened = app.openSetupWizard();
      window.__tourRecovery.callbacks.get(timer)();
      return { opened, cancelled: window.__tourRecovery.cancelled.includes(timer) };
    });
    assert.deepEqual(reopened, { opened: true, cancelled: true }, 'Reabrir wizard após dismissal cancela tour pendente.');
    await assertTourClosed('Mesmo callback já enfileirado não abre overlay concorrente com wizard reaberto.');
    await page.evaluate(() => {
      window.Atrium.Store.state.settings.guidedTourSeen = true;
    });
    await page.keyboard.press('Escape');
  } finally {
    await page.evaluate(() => {
      window.setTimeout = window.__tourRecovery.nativeTimeout;
      window.clearTimeout = window.__tourRecovery.nativeClear;
    });
  }
}

async function assertOnboardingRecovery() {
  const beforeRecovery = await readProbe();
  await page.evaluate(() => {
    const { App, Store } = window.Atrium;
    window.__recovery = {
      originalSave: Store.save, originalFlush: Store.flush, originalFetch: window.AtriumAuth.secureFetch,
      originalToast: App.toast, originalRender: App.renderAll, originalReader: window.FileReader,
      saves: 0, flushes: 0, uploads: 0, toasts: [], mode: 'false'
    };
    const probe = window.__recovery;
    Store.save = () => { probe.saves += 1; };
    Store.flush = async () => {
      probe.flushes += 1;
      if (probe.mode === 'throw') throw new Error('Falha sintética');
      if (probe.mode === 'deferred') return new Promise(resolve => { probe.resolve = resolve; });
      return probe.mode === 'true';
    };
    window.AtriumAuth.secureFetch = async (url, options) => {
      if (url !== '/api/integrations/judicial/certificate') throw new Error('Rota inesperada');
      probe.uploads += 1;
      const body = JSON.parse(options.body);
      if (options.method !== 'POST' || !body.pfxBase64 || body.passphrase !== 'senha-sintetica') throw new Error('Payload inesperado');
      return { ok: true, json: async () => ({}) };
    };
    App.toast = (message, type) => probe.toasts.push({ message, type });
    App.renderAll = () => {};
    delete Store.state.settings.hasA1Certificate;
    Store.state.settings.onboardingWizardCompleted = false;
    Store.state.settings.workspaceProfile = { courts: ['tjrs'], teamSize: '1', processVolume: 'ate-50', aiInterest: 'depois' };
    Store.state.settings.guidedTourSeen = false;
    localStorage.removeItem('atrium_tour_seen');
    localStorage.removeItem('jurisflow_tour_seen');
    sessionStorage.setItem('atrium_pending_setup_wizard', 'true');
    sessionStorage.setItem('atrium_pending_a1_onboarding', 'true');
    document.body.style.overflow = 'auto';
    const trigger = document.querySelector('#sidebar button[data-view="dashboard"]');
    trigger.focus();
    window.__recovery.trigger = trigger;
    App.checkFirstAccessTour();
    App.checkA1Onboarding();
    App.checkSetupWizard();
  });
  try {
    await page.locator('#onboardingCertificateBackdrop:not(.hidden)').waitFor();
    assert.equal(await page.locator('#appShell').getAttribute('inert'), '');
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'certChoiceNo');
    await page.locator('#btnContinueWithoutCert').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'certChoiceYes', 'Tab permanece no A1.');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'btnContinueWithoutCert', 'Shift+Tab permanece no A1.');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#onboardingCertificateBackdrop').isVisible(), true, 'Escape não descarta configuração A1 pendente.');
    assert.equal(await page.locator('#setupWizardBackdrop').evaluate(el => el.classList.contains('hidden')), true, 'A1 precede wizard.');
    await assertTourClosed('Flags pendentes impedem tour automático.');
    const initialized = await readProbe();
    assert.equal(initialized.autoTimers, beforeRecovery.autoTimers, 'Checks pendentes não agendam timers de tour ou A1.');
    await page.evaluate(() => {
      window.Atrium.App.checkA1Onboarding();
      window.Atrium.App.openA1OnboardingModal();
    });
    assert.deepEqual(await readProbe(), initialized, 'Reabrir A1 não cria timer nem handlers duplicados.');
    for (const key of ['certChoiceYes:change', 'certChoiceNo:change', 'certChoiceYesBox:click', 'certChoiceNoBox:click', 'certDropzone:click', 'onboardingCertFileInput:change', 'btnContinueWithoutCert:click', 'btnSubmitOnboardingCert:click']) {
      assert.equal(initialized.listeners[key], 1, `${key} deve ser único.`);
    }
    for (const mode of ['false', 'throw']) {
      await page.evaluate(value => { window.__recovery.mode = value; }, mode);
      await page.locator('#btnContinueWithoutCert').click();
      await page.locator('#onboardingCertFeedback.error').waitFor();
      await page.waitForFunction(() => !document.getElementById('btnContinueWithoutCert').disabled);
      assert.deepEqual(await page.evaluate(() => ({
        pending: sessionStorage.getItem('atrium_pending_a1_onboarding'),
        hasA1: window.Atrium.Store.state.settings.hasA1Certificate ?? null,
        toasts: window.__recovery.toasts.filter(item => item.type === 'success').length
      })), { pending: 'true', hasA1: null, toasts: 0 }, 'Flush recusado mantém marker e não declara sucesso.');
      assert.equal(await page.locator('#onboardingCertificateBackdrop').isVisible(), true);
    }
    await page.locator('#certChoiceYesBox').click();
    await page.locator('#onboardingCertPassword').fill('senha-sintetica');
    await page.locator('#onboardingCertFileInput').setInputFiles({ name: 'grande.pfx', mimeType: 'application/octet-stream', buffer: Buffer.alloc(5_000_001) });
    await page.locator('#btnSubmitOnboardingCert').click();
    assert.match(await page.locator('#onboardingCertFeedback').textContent(), /5 MB/);
    assert.equal(await page.evaluate(() => window.__recovery.uploads), 0);
    await page.locator('#onboardingCertFileInput').setInputFiles({ name: 'certificado-sintetico.pfx', mimeType: 'application/octet-stream', buffer: Buffer.from('fixture-nao-certificado') });
    for (const outcome of ['error', 'abort']) {
      await page.evaluate(value => {
        window.FileReader = class {
          readAsDataURL() { queueMicrotask(() => this[`on${value}`]?.()); }
        };
      }, outcome);
      await page.locator('#btnSubmitOnboardingCert').click();
      await page.waitForFunction(() => !document.getElementById('btnSubmitOnboardingCert').disabled);
      assert.match(await page.locator('#onboardingCertFeedback').textContent(), /ler o certificado|cancelada/);
      assert.equal(await page.locator('#btnContinueWithoutCert').isEnabled(), true);
    }
    await page.evaluate(() => { window.FileReader = window.__recovery.originalReader; window.__recovery.mode = 'false'; });
    await page.locator('#btnSubmitOnboardingCert').click();
    await page.waitForFunction(() => !document.getElementById('btnSubmitOnboardingCert').disabled);
    assert.equal(await page.evaluate(() => window.__recovery.uploads), 1);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('atrium_pending_a1_onboarding')), 'true');
    assert.equal(await page.locator('#onboardingCertificateBackdrop').isVisible(), true);
    assert.equal(await page.evaluate(() => window.__recovery.toasts.filter(item => item.type === 'success').length), 0);
    assert.equal(await page.locator('#onboardingCertPassword').inputValue(), '', 'POST confirmado limpa senha mesmo com flush recusado.');
    assert.equal(await page.locator('#onboardingCertFileInput').inputValue(), '', 'POST confirmado limpa arquivo mesmo com flush recusado.');
    for (const id of ['btnContinueWithoutCert', 'certChoiceYes', 'certChoiceNo', 'onboardingCertFileInput', 'onboardingCertPassword']) {
      assert.equal(await page.locator(`#${id}`).isDisabled(), true, `${id} permanece bloqueado após upload confirmado.`);
    }
    const beforeFalseChoice = await page.evaluate(() => ({ saves: window.__recovery.saves, flushes: window.__recovery.flushes }));
    await page.evaluate(() => {
      document.getElementById('btnContinueWithoutCert').dispatchEvent(new MouseEvent('click'));
      document.getElementById('certChoiceNoBox').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      window.Atrium.App.openA1OnboardingModal();
    });
    assert.deepEqual(await page.evaluate(() => ({ saves: window.__recovery.saves, flushes: window.__recovery.flushes })), beforeFalseChoice, 'Certificado confirmado não pode virar escolha sem A1.');
    await page.evaluate(() => { window.__recovery.mode = 'throw'; });
    await page.locator('#btnSubmitOnboardingCert').click();
    await page.waitForFunction(() => !document.getElementById('btnSubmitOnboardingCert').disabled);
    assert.equal(await page.evaluate(() => window.__recovery.uploads), 1, 'Retry de flush que lança não reenvia certificado.');
    assert.equal(await page.locator('#btnContinueWithoutCert').isDisabled(), true);
    await page.evaluate(() => { window.__recovery.mode = 'deferred'; });
    await page.locator('#btnSubmitOnboardingCert').click();
    await page.waitForFunction(() => typeof window.__recovery.resolve === 'function');
    const busyCounts = await page.evaluate(() => {
      document.getElementById('btnSubmitOnboardingCert').dispatchEvent(new MouseEvent('click'));
      document.getElementById('btnContinueWithoutCert').dispatchEvent(new MouseEvent('click'));
      return { uploads: window.__recovery.uploads, flushes: window.__recovery.flushes };
    });
    assert.deepEqual(busyCounts, { uploads: 1, flushes: 5 }, 'Busy comum bloqueia submissões concorrentes e retry só persiste, sem reenvio ao cofre.');
    assert.equal(await page.locator('#btnContinueWithoutCert').isDisabled(), true);
    await page.evaluate(() => window.__recovery.resolve(true));
    await page.locator('#onboardingCertificateBackdrop.hidden').waitFor({ state: 'attached' });
    await page.locator('#setupWizardBackdrop:not(.hidden)').waitFor();
    await page.locator('#setupWizardNext').click();
    assert.equal(await page.locator('#setupWizardSteps input[value="tjrs"]').isChecked(), true, 'Wizard recebe workspaceProfile.');
    assert.equal(await page.locator('#onboardingCertPassword').inputValue(), '');
    assert.equal(await page.locator('#onboardingCertFileInput').inputValue(), '');
    assert.deepEqual(await page.evaluate(() => ({
      marker: sessionStorage.getItem('atrium_pending_a1_onboarding'),
      hasA1: window.Atrium.Store.state.settings.hasA1Certificate,
      secrets: /senha-sintetica|fixture-nao-certificado/.test(JSON.stringify(window.Atrium.Store.state)),
      successes: window.__recovery.toasts.filter(item => item.type === 'success').length
    })), { marker: null, hasA1: true, secrets: false, successes: 1 });
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement === window.__recovery.trigger), true, 'Fechar wizard após A1 restaura controle visível do shell.');
    assert.equal(await page.locator('#appShell').getAttribute('inert'), null);
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'auto');
    await page.evaluate(() => {
      window.Atrium.Store.state.settings.onboardingWizardCompleted = true;
      window.Atrium.App.checkSetupWizard();
    });
    assert.equal(await page.evaluate(() => sessionStorage.getItem('atrium_pending_setup_wizard')), null, 'Completed limpa marker obsoleto.');
    await page.evaluate(() => {
      window.__recovery.mode = 'true';
      sessionStorage.setItem('atrium_pending_a1_onboarding', 'true');
      document.getElementById('appShell').setAttribute('inert', 'preserved');
      window.Atrium.App.openA1OnboardingModal();
    });
    await page.locator('#btnContinueWithoutCert').click();
    await page.locator('#onboardingCertificateBackdrop.hidden').waitFor({ state: 'attached' });
    assert.equal(await page.evaluate(() => window.Atrium.Store.state.settings.hasA1Certificate), false, 'Sem A1 conclui somente após flush confirmado.');
    assert.equal(await page.locator('#appShell').getAttribute('inert'), 'preserved', 'A1 restaura inert preexistente.');
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'auto');
    await page.evaluate(() => document.getElementById('appShell').removeAttribute('inert'));
  } finally {
    await page.evaluate(() => {
      const { App, Store } = window.Atrium;
      const probe = window.__recovery;
      Store.save = probe.originalSave;
      Store.flush = probe.originalFlush;
      window.AtriumAuth.secureFetch = probe.originalFetch;
      App.toast = probe.originalToast;
      App.renderAll = probe.originalRender;
      window.FileReader = probe.originalReader;
    });
  }
}

function readProbe() {
  return page.evaluate(() => structuredClone(globalThis.__onboardingProbe));
}
