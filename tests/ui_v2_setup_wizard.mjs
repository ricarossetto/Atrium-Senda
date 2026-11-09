import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startUiV2Session, prepareUiV2Page } from './ui_v2_helpers.mjs';

const OUTPUT = fs.mkdtempSync(path.join(os.tmpdir(), 'atrium-setup-wizard-qa-'));
const PROFILE = { courts: ['tjrs', 'trt4'], teamSize: '2-5', processVolume: '50-200', aiInterest: 'sim' };
const ANSWERS = { courts: ['tjrs', 'trt4'], team: '2-5', volume: '50-200', ai: 'sim' };
const session = await startUiV2Session();
const layoutFailures = [];

async function resetRealSettings(page, { pendingA1 = false } = {}) {
  assert.equal(await page.evaluate(async needsA1 => {
    const { App, Store } = window.Atrium;
    App.closeGuidedTour();
    for (const key of ['atrium_pending_setup_wizard', 'atrium_pending_a1_onboarding']) sessionStorage.removeItem(key);
    Store.state.settings ||= {};
    for (const key of ['workspaceProfile', 'onboardingWizardCompleted', 'hasA1Certificate']) delete Store.state.settings[key];
    if (!needsA1) Store.state.settings.hasA1Certificate = false;
    Store.save();
    const confirmed = await Store.flush();
    App.switchView('dashboard');
    return confirmed;
  }, pendingA1), true, 'Preparação sintética confirmada pelo Store real.');
  await page.locator('#view-dashboard.active').waitFor();
}

async function realState(page) {
  return page.evaluate(async () => {
    const response = await window.KellerAuth.secureFetch('/api/state');
    if (!response.ok) throw new Error(`Leitura do estado sintético: HTTP ${response.status}`);
    const payload = await response.json();
    return {
      memory: structuredClone(window.Atrium.Store.state.settings),
      backend: payload.state.settings,
      revision: payload.revision ?? payload.state.revision,
      pending: sessionStorage.getItem('atrium_pending_setup_wizard')
    };
  });
}

async function chooseRealProfile(page) {
  await page.locator('#setupWizardNext').click();
  await page.locator('#setupWizardCourtsToggle').click();
  await page.locator('#setupWizardSteps [value="tjrs"]').check();
  await page.locator('#setupWizardSteps [value="trt4"]').check();
  for (const value of ['2-5', '50-200', 'sim']) {
    await page.locator('#setupWizardNext').click();
    await page.locator(`#setupWizardSteps [value="${value}"]`).check();
  }
  await page.locator('#setupWizardNext').click();
  await page.locator('#setupWizardSummary').waitFor();
  assert.match(await page.locator('#setupWizardSummary').textContent(), /TRT4/);
  assert.match(await page.locator('#setupWizardSummary').textContent(), /2 a 5 pessoas/);
  assert.match(await page.locator('#setupWizardSummary').textContent(), /50 a 200/);
}

async function assertRealPrefill(page) {
  await page.locator('#setupWizardNext').click();
  for (const value of ['tjrs', 'trt4']) assert.equal(await page.locator(`#setupWizardSteps [value="${value}"]`).isChecked(), true);
  for (const value of ['2-5', '50-200', 'sim']) {
    await page.locator('#setupWizardNext').click();
    assert.equal(await page.locator(`#setupWizardSteps [value="${value}"]`).isChecked(), true);
  }
  await page.locator('#setupWizardNext').click();
  await page.locator('#setupWizardSummary').waitFor();
}

async function exerciseRealApp() {
  for (const [status, theme, width] of [[500, 'light', 1280], [409, 'dark', 1280]]) {
    const context = await session.createContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
      await resetRealSettings(page);
      assert.equal(await page.evaluate(() => window.AtriumAuth.currentUser.role), 'master_admin');
      await page.evaluate(() => {
        const { App, Store } = window.Atrium;
        window.__realWizardToasts = [];
        window.__realWizardFlushes = [];
        window.__realWizardCompletions = [];
        const toast = App.toast.bind(App);
        const flush = Store.flush.bind(Store);
        const complete = App.completeSetupWizard.bind(App);
        App.completeSetupWizard = async (...args) => {
          const result = await complete(...args);
          window.__realWizardCompletions.push(result);
          return result;
        };
        App.toast = (message, type) => { window.__realWizardToasts.push({ message, type }); return toast(message, type); };
        Store.flush = async (...args) => {
          const result = await flush(...args);
          window.__realWizardFlushes.push(result);
          return result;
        };
        sessionStorage.setItem('atrium_pending_setup_wizard', 'true');
        App.checkFirstAccessTour();
        App.checkSetupWizard();
      });
      await page.locator('#setupWizardBackdrop:not(.hidden)').waitFor();
      assert.equal(await page.locator('#guidedTourBackdrop').isVisible(), false);
      await page.screenshot({ path: path.join(OUTPUT, `real-before-${status}-${theme}-${width}.png`) });
      await geometry(page);
      let statePosts = 0;
      const countPost = request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/state') statePosts++; };
      page.on('request', countPost);
      const beforeDismiss = await realState(page);
      const tourFlags = await page.evaluate(() => ['atrium_tour_seen', 'jurisflow_tour_seen', 'jurisflow_tour_completed'].map(key => localStorage.getItem(key)));
      await page.locator('#setupWizardSkip').click();
      await page.locator('#setupWizardBackdrop').waitFor({ state: 'hidden' });
      assert.deepEqual(await realState(page), beforeDismiss, 'Adiamento preserva pending e não conclui em memória/backend.');
      assert.equal(statePosts, 0);
      assert.equal(await page.evaluate(() => window.Atrium.App.openSetupWizard()), true);
      await page.keyboard.press('Escape');
      await page.locator('#setupWizardBackdrop').waitFor({ state: 'hidden' });
      assert.deepEqual(await realState(page), beforeDismiss, 'Escape com tour fechado não altera estado ou marcador.');
      assert.deepEqual(await page.evaluate(() => ['atrium_tour_seen', 'jurisflow_tour_seen', 'jurisflow_tour_completed'].map(key => localStorage.getItem(key))), tourFlags);
      assert.equal(statePosts, 0, 'Adiamento/Escape não escrevem no backend.');
      assert.equal(await page.locator('#guidedTourBackdrop').isVisible(), false);
      assert.equal(await page.evaluate(() => window.Atrium.App.openSetupWizard()), true);
      await chooseRealProfile(page);
      if (status === 409) {
        await page.clock.install();
        await page.clock.pauseAt(new Date());
      }
      await page.route('**/api/state', async route => {
        if (route.request().method() !== 'POST') return route.continue();
        await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ message: 'Falha sintética de persistência' }) });
      });
      const failureResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/state' && response.status() === status);
      await page.locator('#setupWizardNext').click();
      await failureResponse;
      await page.waitForFunction(() => !document.getElementById('setupWizardFeedback').hidden && !document.getElementById('setupWizardNext').disabled, null, { polling: 50 });
      const failed = await realState(page);
      assert.notEqual(failed.memory.onboardingWizardCompleted, true);
      assert.notEqual(failed.backend.onboardingWizardCompleted, true);
      assert.deepEqual(failed, beforeDismiss, `HTTP ${status} não conclui nem persiste preferências.`);
      assert.equal(statePosts, 1);
      assert.deepEqual(await page.evaluate(() => window.__realWizardFlushes), [false]);
      assert.deepEqual(await page.evaluate(() => window.__realWizardCompletions), [false]);
      assert.equal(await page.evaluate(() => window.__realWizardToasts.some(toast => toast.type === 'success')), false);
      assert.equal(await page.locator('#setupWizardFeedback').getAttribute('role'), 'alert');
      const errorText = await page.locator('#setupWizardFeedback').textContent();
      assert.match(errorText, /Suas escolhas foram mantidas/);
      await page.locator('#setupWizardBack').click();
      assert.equal(await page.locator('#setupWizardSteps [value="sim"]').isChecked(), true);
      assert.equal(await page.locator('#setupWizardFeedback').textContent(), errorText, 'Erro durável mesmo ao editar.');
      await page.locator('#setupWizardNext').click();
      assert.equal(await page.locator('#setupWizardFeedback').isVisible(), true);
      await page.screenshot({ path: path.join(OUTPUT, `real-error-${status}-${theme}-${width}.png`) });
      await geometry(page);
      await page.unroute('**/api/state');
      const retryResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/state' && response.ok());
      await page.locator('#setupWizardNext').click();
      await retryResponse;
      await page.locator('#setupWizardBackdrop').waitFor({ state: 'hidden' });
      assert.deepEqual(await page.evaluate(() => window.__realWizardFlushes), [false, true]);
      assert.deepEqual(await page.evaluate(() => window.__realWizardCompletions), [false, true]);
      assert.equal(await page.evaluate(() => window.__realWizardToasts.filter(toast => toast.type === 'success').length), 1);
      const saved = await realState(page);
      assert.deepEqual(saved.memory.workspaceProfile, PROFILE);
      assert.deepEqual(saved.backend.workspaceProfile, PROFILE);
      assert.equal(saved.memory.onboardingWizardCompleted, true);
      assert.equal(saved.backend.onboardingWizardCompleted, true);
      assert.equal(saved.pending, null);
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('#appShell:not(.hidden)').waitFor();
      assert.deepEqual(await page.evaluate(() => window.Atrium.Store.state.settings.workspaceProfile), PROFILE);
      assert.equal(await page.evaluate(() => window.Atrium.Store.state.settings.onboardingWizardCompleted), true);
      const reloaded = await realState(page);
      assert.deepEqual(reloaded.backend, saved.backend);
      assert.equal(reloaded.revision, saved.revision);
      await page.evaluate(() => window.Atrium.App.switchView('configuration'));
      await page.locator('#view-configuration.active').waitFor();
      await page.locator('#btnOpenSetupWizard').click();
      await page.locator('#setupWizardBackdrop:not(.hidden)').waitFor();
      await assertRealPrefill(page);
      await page.screenshot({ path: path.join(OUTPUT, `real-after-prefill-${status}-${theme}-${width}.png`) });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(OUTPUT, `real-after-prefill-${status}-${theme}-390.png`) });
      await page.keyboard.press('Escape');
      assert.deepEqual(await realState(page), reloaded);
      assert.equal(statePosts, 2, 'Reload, reabertura com prefill e Escape não criam gravações adicionais.');
      page.off('request', countPost);
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  }

  const context = await session.createContext({ viewport: { width: 1280, height: 860 }, reducedMotion: 'reduce' });
  try {
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
    for (const panel of ['integrations', 'configuration']) {
      await resetRealSettings(page);
      assert.equal(await page.evaluate(() => window.Atrium.App.openSetupWizard()), true);
      await chooseRealProfile(page);
      let releasePost;
      const gate = new Promise(resolve => { releasePost = resolve; });
      let posts = 0;
      await page.route('**/api/state', async route => {
        if (route.request().method() !== 'POST') return route.continue();
        posts++;
        await gate;
        await route.continue();
      });
      const requested = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/state');
      await page.locator(`[data-wizard-panel="${panel}"]`).click();
      await requested;
      try {
        assert.equal(await page.locator('#view-dashboard.active').isVisible(), true, 'Deep link aguarda confirmação antes de navegar.');
        assert.equal(await page.locator('#setupWizardBackdrop').isVisible(), true);
        assert.equal(await page.locator('#setupWizardBackdrop [role="dialog"]').getAttribute('aria-busy'), 'true');
        assert.notEqual((await realState(page)).backend.onboardingWizardCompleted, true);
      } finally {
        releasePost();
      }
      await page.locator(`#view-${panel}.active`).waitFor();
      await page.locator('#setupWizardBackdrop').waitFor({ state: 'hidden' });
      const saved = await realState(page);
      assert.equal(posts, 1);
      assert.equal(saved.backend.onboardingWizardCompleted, true);
      assert.deepEqual(saved.backend.workspaceProfile, PROFILE);
      assert.deepEqual(saved.memory.workspaceProfile, PROFILE);
      await page.unroute('**/api/state');
    }
    await resetRealSettings(page, { pendingA1: true });
    await page.evaluate(() => {
      sessionStorage.setItem('atrium_pending_a1_onboarding', 'true');
      sessionStorage.setItem('atrium_pending_setup_wizard', 'true');
      window.Atrium.App.checkFirstAccessTour();
      window.Atrium.App.checkA1Onboarding();
      window.Atrium.App.checkSetupWizard();
    });
    await page.locator('#onboardingCertificateBackdrop:not(.hidden)').waitFor();
    assert.equal(await page.locator('#setupWizardBackdrop').isVisible(), false, 'Marcadores simultâneos abrem somente A1.');
    assert.equal(await page.locator('#guidedTourBackdrop').isVisible(), false);
    assert.equal(await page.evaluate(() => window.Atrium.App.openSetupWizard()), false, 'A1 impede abertura manual concorrente.');
    await page.screenshot({ path: path.join(OUTPUT, 'real-a1-before-light-1280.png') });
    await page.locator('#certChoiceNo').check();
    const a1Response = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/state' && response.ok());
    await page.locator('#btnContinueWithoutCert').click();
    await a1Response;
    await page.locator('#onboardingCertificateBackdrop').waitFor({ state: 'hidden' });
    await page.locator('#setupWizardBackdrop:not(.hidden)').waitFor();
    const afterA1 = await realState(page);
    assert.equal(afterA1.memory.hasA1Certificate, false);
    assert.equal(afterA1.backend.hasA1Certificate, false);
    assert.notEqual(afterA1.memory.onboardingWizardCompleted, true);
    assert.notEqual(afterA1.backend.onboardingWizardCompleted, true);
    assert.equal(afterA1.pending, 'true');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('atrium_pending_a1_onboarding')), null);
    assert.equal(await page.locator('#guidedTourBackdrop').isVisible(), false);
    await page.screenshot({ path: path.join(OUTPUT, 'real-a1-after-wizard-light-1280.png') });
    await geometry(page);
    await page.keyboard.press('Escape');
    await resetRealSettings(page);
    assert.deepEqual(pageErrors, []);
  } finally {
    await context.close();
  }
  console.log('[App real] HTTP 500/409, erro durável, retry true, deep links, reload/prefill, adiamento/Escape e sequência A1: PASS');
}

async function exerciseSessionExpiry() {
  for (const [scenario, theme, width] of [
    ['a1-no', 'light', 1280],
    ['a1-upload', 'dark', 390],
    ['a1-settings', 'light', 390],
    ['a1-retry', 'dark', 1280],
    ['wizard', 'light', 1280],
    ['wizard-dismiss', 'dark', 390]
  ]) {
    const context = await session.createContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
      const isA1 = scenario.startsWith('a1-');
      await resetRealSettings(page, { pendingA1: isA1 });
      const before = await realState(page);
      await page.clock.install();
      await page.evaluate(needsA1 => {
        const { App } = window.Atrium;
        App.closeGuidedTour();
        for (const key of ['atrium_tour_seen', 'jurisflow_tour_seen', 'jurisflow_tour_completed']) localStorage.removeItem(key);
        window.__expiryToasts = [];
        const toast = App.toast.bind(App);
        App.toast = (message, type) => { window.__expiryToasts.push({ message, type }); return toast(message, type); };
        window.__expiryOverflow = document.body.style.overflow;
        window.__expiryInert = document.getElementById('appShell').getAttribute('inert');
        sessionStorage.setItem('atrium_pending_setup_wizard', 'true');
        if (needsA1) {
          sessionStorage.setItem('atrium_pending_a1_onboarding', 'true');
          App.checkA1Onboarding();
        } else App.checkSetupWizard();
      }, isA1);
      await page.locator(`${isA1 ? '#onboardingCertificateBackdrop' : '#setupWizardBackdrop'}:not(.hidden)`).waitFor();
      if (!isA1) await chooseRealProfile(page);
      else {
        await page.locator('#certChoiceYes').check();
        await page.locator('#onboardingCertFileInput').setInputFiles({
          name: 'certificado-sintetico-expiracao.pfx', mimeType: 'application/octet-stream', buffer: Buffer.from('ATRIUM FIXTURE SEM CERTIFICADO OU CHAVE PRIVADA')
        });
        await page.locator('#onboardingCertPassword').fill('senha-sintetica-expiracao');
        if (scenario === 'a1-no') await page.locator('#certChoiceNo').check();
      }
      let statePosts = 0;
      let certificatePosts = 0;
      let stateStatus = scenario === 'a1-retry' ? 500 : 401;
      await page.route('**/api/state', async route => {
        if (route.request().method() !== 'POST') return route.continue();
        statePosts++;
        await route.fulfill({ status: stateStatus, contentType: 'application/json', body: JSON.stringify({ message: 'Falha sintética de sessão' }) });
      });
      await page.route('**/api/integrations/judicial/certificate', async route => {
        if (route.request().method() !== 'POST') return route.abort();
        certificatePosts++;
        await route.fulfill({ status: scenario === 'a1-upload' ? 401 : 200, contentType: 'application/json', body: JSON.stringify({ message: 'Resposta sintética do certificado' }) });
      });
      const endpoint = scenario === 'a1-upload' ? '/api/integrations/judicial/certificate' : '/api/state';
      const expiredResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === endpoint && response.status() === 401);
      if (scenario === 'wizard-dismiss') {
        assert.equal(await page.evaluate(async () => (await window.AtriumAuth.secureFetch('/api/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status), 401);
        await page.keyboard.press('Escape');
      } else {
        await page.locator(isA1 ? scenario === 'a1-no' ? '#btnContinueWithoutCert' : '#btnSubmitOnboardingCert' : '#setupWizardNext').click();
        if (scenario === 'a1-retry') {
          await page.waitForFunction(() => document.getElementById('onboardingCertFeedback').classList.contains('error') && !document.getElementById('btnSubmitOnboardingCert').disabled);
          assert.equal(certificatePosts, 1);
          stateStatus = 401;
          await page.locator('#btnSubmitOnboardingCert').click();
        }
      }
      await expiredResponse;
      await page.waitForFunction(() => window.AtriumAuth.authenticated === false && (document.querySelector('#onboardingCertificateBackdrop [role="dialog"]').getAttribute('aria-busy') !== 'true') && !window.Atrium.App.setupWizardSaving);
      await page.locator('#authLoginForm').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#appShell').isVisible(), false);
      for (const selector of ['#onboardingCertificateBackdrop', '#setupWizardBackdrop', '#guidedTourBackdrop']) {
        assert.equal(await page.locator(selector).isVisible(), false, `${scenario}: nenhum overlay cobre o login.`);
      }
      const recovered = await page.evaluate(() => ({
        settings: structuredClone(window.Atrium.Store.state.settings),
        pendingWizard: sessionStorage.getItem('atrium_pending_setup_wizard'),
        pendingA1: sessionStorage.getItem('atrium_pending_a1_onboarding'),
        overflowRestored: document.body.style.overflow === window.__expiryOverflow,
        inertRestored: document.getElementById('appShell').getAttribute('inert') === window.__expiryInert,
        loginFocused: document.getElementById('authLoginForm').contains(document.activeElement),
        files: document.getElementById('onboardingCertFileInput').files.length,
        password: document.getElementById('onboardingCertPassword').value,
        filename: document.getElementById('onboardingCertFileName').textContent,
        success: window.__expiryToasts.some(toast => toast.type === 'success'),
        timer: window.Atrium.App.tourTimer,
        tourFlags: ['atrium_tour_seen', 'jurisflow_tour_seen', 'jurisflow_tour_completed'].map(key => localStorage.getItem(key))
      }));
      assert.deepEqual(recovered.settings, before.memory, `${scenario}: restaura settings sem conclusão tentativa.`);
      assert.equal(recovered.pendingWizard, 'true');
      assert.equal(recovered.pendingA1, isA1 ? 'true' : null);
      assert.equal(recovered.overflowRestored, true);
      assert.equal(recovered.inertRestored, true);
      if (scenario !== 'wizard-dismiss') assert.equal(recovered.loginFocused, true);
      assert.equal(recovered.files, 0);
      assert.equal(recovered.password, '');
      assert.doesNotMatch(recovered.filename, /expiracao|já vinculado/);
      assert.equal(recovered.success, false);
      assert.equal(recovered.timer == null, true, 'Sessão perdida não agenda apresentação pelo onDismiss.');
      assert.deepEqual(recovered.tourFlags, [null, null, null]);
      await page.clock.runFor(1000);
      assert.equal(await page.locator('#guidedTourBackdrop').isVisible(), false);
      assert.deepEqual(await page.evaluate(() => ['atrium_tour_seen', 'jurisflow_tour_seen', 'jurisflow_tour_completed'].map(key => localStorage.getItem(key))), [null, null, null]);
      await page.locator('#authLoginForm input[name="username"]').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.getElementById('authLoginForm').contains(document.activeElement)), true, `${scenario}: Tab alcança login sem trap residual.`);
      const response = await context.request.get(`${session.server.baseUrl}/api/state`);
      assert.equal(response.ok(), true);
      const persisted = await response.json();
      assert.deepEqual(persisted.state.settings, before.backend, `${scenario}: HTTP interceptado não altera backend.`);
      assert.equal(persisted.revision ?? persisted.state.revision, before.revision);
      assert.equal(statePosts, scenario === 'a1-upload' ? 0 : scenario === 'a1-retry' ? 2 : 1);
      assert.equal(certificatePosts, ['a1-upload', 'a1-settings', 'a1-retry'].includes(scenario) ? 1 : 0);
      await page.screenshot({ path: path.join(OUTPUT, `real-expired-${scenario}-${theme}-${width}.png`) });
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  }
  console.log('[Sessão real] HTTP 401 wizard/adiamento, A1 sem certificado/upload/settings/retry: login, limpeza, pending e ausência de sucesso/tour: PASS');
}

async function a1VisualEvidence(page, stage) {
  await page.evaluate(async () => {
    const backdrop = document.getElementById('onboardingCertificateBackdrop');
    await Promise.all(backdrop.getAnimations({ subtree: true })
      .filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {})));
  });
  const evidence = await page.evaluate(() => {
    const rect = element => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const backdrop = document.getElementById('onboardingCertificateBackdrop');
    const dialog = backdrop.querySelector('[role="dialog"]');
    const body = dialog.querySelector('.modal-body');
    const header = dialog.querySelector('header');
    const footer = dialog.querySelector('footer');
    const controls = [...dialog.querySelectorAll('button, input, #certDropzone, #onboardingCertFeedback')]
      .filter(element => element.getClientRects().length && !element.closest('.hidden'))
      .map(element => ({ id: element.id, ...rect(element), fontSize: getComputedStyle(element).fontSize, disabled: element.disabled ?? false }));
    return {
      dialog: rect(dialog), body: rect(body), header: rect(header), footer: rect(footer), controls,
      bodyScroll: { top: body.scrollTop, height: body.clientHeight, total: body.scrollHeight, overflowY: getComputedStyle(body).overflowY },
      dialogScroll: { top: dialog.scrollTop, height: dialog.clientHeight, total: dialog.scrollHeight, overflowY: getComputedStyle(dialog).overflowY },
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      viewport: { width: innerWidth, height: innerHeight }, theme: document.documentElement.dataset.theme || 'dark',
      activeView: document.querySelector('.view.active')?.id, focus: document.activeElement.id,
      busy: dialog.getAttribute('aria-busy'), shellInert: document.getElementById('appShell').hasAttribute('inert'),
      feedback: document.getElementById('onboardingCertFeedback').textContent
    };
  });
  const name = `real-a1-${stage}-${evidence.theme}-${evidence.viewport.width}-${evidence.viewport.height}`;
  await page.screenshot({ path: path.join(OUTPUT, `${name}.png`) });
  fs.writeFileSync(path.join(OUTPUT, `${name}.json`), JSON.stringify(evidence, null, 2));
  const check = (condition, message) => {
    if (!condition) layoutFailures.push({ component: 'A1 real', stage, theme: evidence.theme, viewport: evidence.viewport, error: message });
  };
  check(evidence.activeView === 'view-dashboard', 'A1 inspecionado no dashboard real.');
  check(evidence.shellInert, 'Shell deve permanecer inerte enquanto A1 está aberto.');
  check(evidence.overflow <= 2, `Overflow global: ${evidence.overflow}px.`);
  check(evidence.dialog.x >= -2 && evidence.dialog.right <= evidence.viewport.width + 2, 'Diálogo ultrapassa largura do viewport.');
  check(evidence.dialog.y >= -2 && evidence.dialog.bottom <= evidence.viewport.height + 2, 'Diálogo ultrapassa altura do viewport.');
  check(evidence.header.bottom <= evidence.body.y + 2, 'Cabeçalho sobrepõe corpo.');
  check(evidence.body.bottom <= evidence.footer.y + 2, 'Corpo sobrepõe rodapé.');
  check(evidence.footer.y >= evidence.dialog.y - 2 && evidence.footer.bottom <= evidence.dialog.bottom + 2, 'Rodapé fora da região visível do diálogo.');
  check(evidence.bodyScroll.total <= evidence.bodyScroll.height + 2 || ['auto', 'scroll'].includes(evidence.bodyScroll.overflowY), 'Conteúdo excedente sem scroll local acessível.');
  for (const control of evidence.controls) {
    check(control.x >= evidence.dialog.x - 2 && control.right <= evidence.dialog.right + 2, `${control.id}: corte horizontal.`);
    if (control.id === 'btnContinueWithoutCert') {
      check(control.y >= evidence.footer.y - 2 && control.bottom <= evidence.footer.bottom + 2, 'Ação do rodapé cortada.');
      check(control.height >= (evidence.viewport.width === 390 ? 44 : 40), 'Ação do rodapé abaixo do alvo de toque.');
    }
    if (evidence.viewport.width === 390 && control.id === 'onboardingCertPassword') check(parseFloat(control.fontSize) >= 16, 'Senha abaixo de 16px no mobile: risco de autozoom iOS.');
    if (stage.endsWith('bottom') && control.id === 'onboardingCertFeedback') check(control.y >= evidence.body.y - 2 && control.bottom <= evidence.body.bottom + 2, 'Erro multiline não cabe na região rolável após scroll.');
  }
  return evidence;
}

async function exerciseRealA1VisualMatrix() {
  const syntheticError = 'Falha sintética ao validar o certificado de teste.\nO arquivo não contém uma cadeia válida para esta simulação e nenhuma vinculação foi realizada.\nConfira o arquivo e a senha de teste antes de tentar novamente; as escolhas permanecem disponíveis.';
  console.log(`Matriz A1 real: ${OUTPUT}`);
  for (const theme of ['light', 'dark']) {
    for (const width of [1280, 390]) {
      const context = await session.createContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      try {
        const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
        await resetRealSettings(page, { pendingA1: true });
        await page.evaluate(() => {
          const trigger = [...document.querySelectorAll('#appShell button:not([disabled]), #appShell a[href]')]
            .find(element => element.getClientRects().length && !element.closest('.hidden'));
          trigger.focus();
          window.__a1VisualTrigger = trigger;
          window.__a1VisualOverflow = document.body.style.overflow;
          sessionStorage.setItem('atrium_pending_a1_onboarding', 'true');
          window.Atrium.App.checkA1Onboarding();
        });
        await page.locator('#onboardingCertificateBackdrop:not(.hidden)').waitFor();
        assert.equal(await page.locator('#onboardingCertificateBackdrop [role="dialog"]').getAttribute('aria-modal'), 'true');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'certChoiceNo');
        const initial = await realState(page);
        let statePosts = 0;
        let certificatePosts = 0;
        page.on('request', request => {
          if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/state') statePosts++;
        });
        for (const height of [844, 500]) {
          await page.setViewportSize({ width, height });
          await a1VisualEvidence(page, 'choice');
        }
        await page.setViewportSize({ width, height: 844 });
        await page.locator('#certChoiceYes').check();
        await page.locator('#certUploadFields').waitFor();
        await page.locator('#onboardingCertFileInput').setInputFiles({
          name: 'certificado-sintetico-sem-chave.pfx', mimeType: 'application/octet-stream', buffer: Buffer.from('ATRIUM FIXTURE SEM CERTIFICADO OU CHAVE PRIVADA')
        });
        await page.locator('#onboardingCertPassword').fill('senha-sintetica-sem-certificado');
        assert.equal(await page.locator('#onboardingCertFileName').textContent(), 'certificado-sintetico-sem-chave.pfx');
        for (const height of [844, 500]) {
          await page.setViewportSize({ width, height });
          await page.evaluate(() => { document.querySelector('#onboardingCertificateBackdrop .modal-body').scrollTop = 0; });
          await a1VisualEvidence(page, 'upload-top');
          await page.locator('#onboardingCertPassword').focus();
          await a1VisualEvidence(page, 'upload-password');
          await page.locator('#btnContinueWithoutCert').focus();
          await page.keyboard.press('Tab');
          assert.equal(await page.evaluate(() => document.activeElement.id), 'certChoiceYes', 'Tab final retorna ao primeiro controle A1.');
          await page.keyboard.press('Shift+Tab');
          assert.equal(await page.evaluate(() => document.activeElement.id), 'btnContinueWithoutCert', 'Shift+Tab inicial retorna ao último controle A1.');
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('#onboardingCertificateBackdrop').isVisible(), true, 'Escape não dispensa configuração A1.');
          assert.equal(await page.locator('#guidedTourBackdrop').isVisible(), false);
          assert.equal(await page.evaluate(() => sessionStorage.getItem('atrium_pending_a1_onboarding')), 'true');
        }
        assert.deepEqual(await realState(page), initial);
        assert.equal(statePosts, 0, 'Escolha, upload local, foco e Escape não persistem estado.');
        let releaseCertificate;
        const gate = new Promise(resolve => { releaseCertificate = resolve; });
        await page.route('**/api/integrations/judicial/certificate', async route => {
          if (route.request().method() !== 'POST') return route.abort();
          certificatePosts++;
          await gate;
          await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ message: syntheticError }) });
        });
        const requested = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/integrations/judicial/certificate');
        await page.locator('#btnSubmitOnboardingCert').click();
        await requested;
        try {
          await page.waitForFunction(() => document.querySelector('#onboardingCertificateBackdrop [role="dialog"]').getAttribute('aria-busy') === 'true');
          for (const id of ['certChoiceYes', 'certChoiceNo', 'onboardingCertFileInput', 'onboardingCertPassword', 'btnSubmitOnboardingCert', 'btnContinueWithoutCert']) {
            assert.equal(await page.locator(`#${id}`).isDisabled(), true, `${id} bloqueado durante validação.`);
          }
          await page.keyboard.press('Tab');
          assert.equal(await page.evaluate(() => document.querySelector('#onboardingCertificateBackdrop [role="dialog"]').contains(document.activeElement)), true, 'Foco permanece no diálogo durante busy.');
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('#onboardingCertificateBackdrop').isVisible(), true);
          for (const height of [844, 500]) {
            await page.setViewportSize({ width, height });
            await a1VisualEvidence(page, 'busy');
          }
        } finally {
          releaseCertificate();
        }
        await page.waitForFunction(() => document.getElementById('onboardingCertFeedback').classList.contains('error') && !document.getElementById('btnSubmitOnboardingCert').disabled);
        assert.equal(certificatePosts, 1, 'Somente mock recebeu conteúdo sintético.');
        assert.equal(await page.locator('#onboardingCertFeedback').textContent(), syntheticError);
        assert.equal(await page.locator('#certChoiceYes').isChecked(), true);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'btnSubmitOnboardingCert', 'Falha restaura foco para retry.');
        for (const height of [844, 500]) {
          await page.setViewportSize({ width, height });
          await page.evaluate(() => { document.querySelector('#onboardingCertificateBackdrop .modal-body').scrollTop = 0; });
          await a1VisualEvidence(page, 'error-top');
          await page.locator('#onboardingCertFeedback').scrollIntoViewIfNeeded();
          await a1VisualEvidence(page, 'error-bottom');
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('#onboardingCertificateBackdrop').isVisible(), true);
          assert.equal(await page.locator('#onboardingCertFeedback').textContent(), syntheticError, 'Erro A1 é durável após Escape.');
        }
        assert.deepEqual(await realState(page), initial, 'Erro de certificado não conclui A1 em memória/backend.');
        assert.equal(statePosts, 0);
        await page.unroute('**/api/integrations/judicial/certificate');
        await page.locator('#certChoiceNo').check();
        const confirmed = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/state' && response.ok());
        await page.locator('#btnContinueWithoutCert').click();
        await confirmed;
        await page.locator('#onboardingCertificateBackdrop').waitFor({ state: 'hidden' });
        assert.equal(await page.locator('#appShell').getAttribute('inert'), null);
        assert.equal(await page.evaluate(() => document.body.style.overflow === window.__a1VisualOverflow), true);
        assert.equal(await page.evaluate(() => document.activeElement === window.__a1VisualTrigger), true);
        assert.equal(statePosts, 1);
        assert.equal((await realState(page)).backend.hasA1Certificate, false);
        assert.deepEqual(pageErrors, []);
      } finally {
        await context.close();
      }
    }
  }
  console.log('[A1 real] Matriz 1280/390 light/dark alturas 844/500, upload mock, erro multiline, foco/locks/Escape: cenários executados');
}

async function installFeature(page) {
  await page.evaluate(async () => {
    const { createSetupWizardFeature } = await import('/js/features/setup-wizard.js');
    const original = document.getElementById('setupWizardBackdrop');
    const backdrop = original.cloneNode(true);
    original.replaceWith(backdrop);
    if (!document.getElementById('setupWizardFeedback')) {
      const feedback = document.createElement('p');
      feedback.id = 'setupWizardFeedback';
      feedback.className = 'field-note hidden';
      feedback.hidden = true;
      backdrop.querySelector('.setup-wizard-body').append(feedback);
    }
    window.__wizardCalls = [];
    window.__wizardMode = 'false';
    window.__wizardDismissals = 0;
    const complete = async (profile, panel = null) => {
      window.__wizardCalls.push({ profile: structuredClone(profile), panel });
      if (window.__wizardMode === 'throw') throw new Error('Detalhe privado sintético que não deve aparecer');
      if (window.__wizardMode === 'deferred') return new Promise(resolve => { window.__wizardResolve = resolve; });
      if (window.__wizardMode === 'true') return true;
      if (window.__wizardMode === 'persist') {
        const store = window.Atrium.Store;
        const previous = structuredClone(store.state.settings);
        store.state.settings.workspaceProfile = {
          courts: [...profile.courts], teamSize: profile.team, processVolume: profile.volume, aiInterest: profile.ai
        };
        store.state.settings.onboardingWizardCompleted = true;
        store.save();
        const confirmed = await store.flush();
        if (!confirmed) { store.state.settings = previous; return false; }
        window.__wizard.close();
        return true;
      }
      return false;
    };
    window.__wizard = createSetupWizardFeature({
      iconSvg: name => `<svg class="atrium-icon" aria-hidden="true"><use href="assets/icons/atrium-ui-icons.svg#atrium-icon-${name}"></use></svg>`,
      onComplete: profile => complete(profile),
      onOpenPanel: (panel, profile) => complete(profile, panel),
      onDismiss: () => { window.__wizardDismissals += 1; }
    });
    window.__wizard.init();
    window.__wizard.init();
    window.__wizard.init();
  });
}

async function open(page, profile = PROFILE) {
  assert.equal(await page.evaluate(data => window.__wizard.open(data), profile), true);
  await page.locator('#setupWizardBackdrop:not(.hidden)').waitFor();
}

async function summary(page) {
  for (let step = 0; step < 5; step++) await page.locator('#setupWizardNext').click();
  await page.locator('#setupWizardSummary').waitFor();
}

async function feedback(page) {
  await page.waitForFunction(() => {
    const feedback = document.getElementById('setupWizardFeedback');
    return feedback && !feedback.hidden && feedback.textContent && !document.getElementById('setupWizardNext').disabled;
  });
  assert.equal(await page.evaluate(() => window.__wizard.isOpen()), true);
  assert.deepEqual(await page.evaluate(() => window.__wizard.answers()), ANSWERS);
}

async function geometry(page) {
  const evidence = await page.evaluate(() => {
    const rect = element => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const backdrop = document.getElementById('setupWizardBackdrop');
    const dialog = backdrop.querySelector('[role="dialog"]');
    const body = dialog.querySelector('.setup-wizard-body');
    const footer = dialog.querySelector('footer');
    const header = dialog.querySelector('header');
    const buttons = [...dialog.querySelectorAll('button')].map(button => ({
      id: button.id || button.dataset.wizardPanel,
      ...rect(button)
    }));
    return {
      dialog: rect(dialog), body: rect(body), footer: rect(footer), header: rect(header), buttons,
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      viewport: { width: innerWidth, height: innerHeight },
      theme: document.documentElement.dataset.theme || 'dark',
      activeView: document.querySelector('.view.active')?.id,
      busy: dialog.getAttribute('aria-busy')
    };
  });
  fs.writeFileSync(path.join(OUTPUT, `geometry-${evidence.theme}-${evidence.viewport.width}-${evidence.viewport.height}.json`), JSON.stringify(evidence, null, 2));
  try {
    assert.equal(evidence.activeView, 'view-dashboard');
    assert.equal(evidence.busy, 'false');
    assert.ok(evidence.overflow <= 2, 'Sem overflow horizontal global.');
    assert.ok(evidence.dialog.x >= -2 && evidence.dialog.right <= evidence.viewport.width + 2);
    assert.ok(evidence.dialog.y >= -2 && evidence.dialog.bottom <= evidence.viewport.height + 2);
    assert.ok(evidence.header.bottom <= evidence.body.y + 2);
    assert.ok(evidence.body.bottom <= evidence.footer.y + 2);
    const footerButtons = evidence.buttons.filter(button => ['setupWizardBack', 'setupWizardNext'].includes(button.id));
    assert.ok(footerButtons[0].right <= footerButtons[1].x + 2, 'Ações do rodapé não colidem.');
    for (const button of footerButtons) {
      assert.ok(button.height >= 44, 'Ações preservam alvo de toque.');
      assert.ok(button.bottom <= evidence.footer.bottom + 2);
    }
  } catch (error) {
    layoutFailures.push({ theme: evidence.theme, viewport: evidence.viewport, dialog: evidence.dialog, error: error.message });
  }
}

try {
  await exerciseSessionExpiry();
  await exerciseRealApp();
  await exerciseRealA1VisualMatrix();
  const context = await session.createContext({ viewport: { width: 1280, height: 860 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
  await installFeature(page);
  await page.evaluate(() => {
    sessionStorage.setItem('atrium_pending_setup_wizard', 'true');
    document.body.style.overflow = 'auto';
    const trigger = document.querySelector('#appShell [data-view="dashboard"]');
    trigger.focus();
    window.__wizardTrigger = trigger;
  });
  await open(page);
  assert.equal(await page.locator('#setupWizardBackdrop [role="dialog"]').getAttribute('aria-modal'), 'true');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), '');
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
  assert.equal(await page.locator('#setupWizardBack').isDisabled(), true);
  assert.match(await page.locator('#setupWizardSteps').textContent(), /Quatro perguntas/);
  await page.locator('#setupWizardNext').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'setupWizardSkip');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'setupWizardNext');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__wizard.isOpen()), false);
  assert.equal(await page.evaluate(() => window.__wizardDismissals), 1);
  assert.equal(await page.evaluate(() => window.__wizardCalls.length), 0);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('atrium_pending_setup_wizard')), 'true');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), null);
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'auto');
  assert.equal(await page.evaluate(() => document.activeElement === window.__wizardTrigger), true);
  assert.equal(await page.evaluate(() => window.__wizard.close()), false);
  assert.equal(await page.evaluate(() => window.__wizardDismissals), 1);

  await page.evaluate(() => document.getElementById('appShell').setAttribute('inert', 'preserved'));
  await open(page);
  await page.evaluate(() => window.__wizard.open());
  await page.locator('#setupWizardSkip').click();
  assert.equal(await page.locator('#appShell').getAttribute('inert'), 'preserved');
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'auto');
  assert.equal(await page.evaluate(() => window.__wizardDismissals), 2);
  await page.evaluate(() => document.getElementById('appShell').removeAttribute('inert'));

  await open(page);
  const copied = await page.evaluate(() => {
    const source = { courts: ['tjrs'], teamSize: '1', processVolume: 'ate-50', aiInterest: 'depois' };
    window.__wizard.open(source);
    source.courts.push('trf4');
    window.__wizard.answers().courts.push('tjdft');
    return window.__wizard.answers();
  });
  assert.deepEqual(copied, { courts: ['tjrs'], team: '1', volume: 'ate-50', ai: 'depois' });
  await page.evaluate(() => window.__wizard.open());
  assert.deepEqual(await page.evaluate(() => window.__wizard.answers()), { courts: [], team: '', volume: '', ai: '' });
  await page.locator('#setupWizardNext').click();
  assert.equal(await page.locator('[data-wizard-option]').count(), 107);
  await page.locator('#setupWizardNext').click();
  assert.equal(await page.locator('#setupWizardNext').isDisabled(), true);
  await page.evaluate(() => window.__wizard.close());

  await open(page, { workspaceProfile: PROFILE });
  await page.locator('#setupWizardNext').click();
  assert.equal(await page.locator('[value="tjrs"]').isChecked(), true);
  assert.equal(await page.locator('[value="trt4"]').isChecked(), true);
  await page.locator('#setupWizardNext').click();
  assert.equal(await page.locator('[value="2-5"]').isChecked(), true);
  await page.locator('#setupWizardNext').click();
  assert.equal(await page.locator('[value="50-200"]').isChecked(), true);
  await page.locator('#setupWizardNext').click();
  assert.equal(await page.locator('[value="sim"]').isChecked(), true);
  await page.locator('#setupWizardNext').click();
  assert.match(await page.locator('#setupWizardSummary').textContent(), /TRT4/);
  await page.locator('#setupWizardNext').click();
  await feedback(page);
  assert.equal(await page.evaluate(() => window.__wizardCalls.length), 1, 'init idempotente instala um único listener.');
  await page.locator('#setupWizardBack').click();
  assert.equal(await page.locator('#setupWizardFeedback').isVisible(), true, 'Erro continua visível ao editar.');
  await page.locator('#setupWizardNext').click();

  await page.evaluate(() => { window.__wizardMode = 'throw'; });
  await page.locator('#setupWizardNext').click();
  await feedback(page);
  assert.doesNotMatch(await page.locator('#setupWizardFeedback').textContent(), /privado/);
  await page.evaluate(() => { window.__wizardMode = 'deferred'; window.__wizardCalls = []; });
  await page.locator('#setupWizardNext').click();
  await page.waitForFunction(() => typeof window.__wizardResolve === 'function');
  await page.evaluate(() => {
    for (const id of ['setupWizardNext', 'setupWizardBack', 'setupWizardSkip']) {
      document.getElementById(id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    document.querySelector('[data-wizard-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__wizard.isOpen()), true);
  assert.equal(await page.evaluate(() => window.__wizardCalls.length), 1);
  assert.equal(await page.evaluate(() => window.__wizard.open()), false);
  assert.equal(await page.locator('#setupWizardNext').isDisabled(), true);
  assert.equal(await page.locator('#setupWizardSkip').isDisabled(), true);
  assert.equal(await page.locator('#setupWizardBackdrop [role="dialog"]').getAttribute('aria-busy'), 'true');
  await page.evaluate(() => window.__wizardResolve(false));
  await feedback(page);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'setupWizardNext');

  await page.evaluate(() => { window.__wizardMode = 'true'; });
  await page.locator('#setupWizardNext').click();
  await page.waitForFunction(() => document.getElementById('setupWizardBackdrop').querySelector('[role="dialog"]').getAttribute('aria-busy') === 'false');
  assert.equal(await page.evaluate(() => window.__wizard.isOpen()), true, 'Só o portal fecha explicitamente.');
  assert.equal(await page.locator('#setupWizardFeedback').isVisible(), false);

  for (const panel of ['integrations', 'configuration']) {
    await page.evaluate(() => { window.__wizardMode = 'deferred'; window.__wizardCalls = []; window.__wizardResolve = null; });
    await page.locator(`[data-wizard-panel="${panel}"]`).click();
    await page.waitForFunction(() => typeof window.__wizardResolve === 'function');
    await page.evaluate(() => document.querySelector('[data-wizard-panel]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.equal(await page.evaluate(() => window.__wizardCalls.length), 1);
    assert.deepEqual(await page.evaluate(() => window.__wizardCalls[0]), { profile: ANSWERS, panel });
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.__wizard.isOpen()), true);
    await page.evaluate(() => window.__wizardResolve(false));
    await feedback(page);
    await page.evaluate(() => { window.__wizardMode = 'true'; });
    await page.locator(`[data-wizard-panel="${panel}"]`).click();
    await page.waitForFunction(() => document.getElementById('setupWizardBackdrop').querySelector('[role="dialog"]').getAttribute('aria-busy') === 'false');
    assert.equal(await page.evaluate(() => window.__wizardCalls.length), 2);
  }

  await page.evaluate(() => { window.__wizardMode = 'persist'; window.__wizardFlush = window.Atrium.Store.flush; window.Atrium.Store.flush = async () => false; });
  await page.locator('#setupWizardNext').click();
  await feedback(page);
  await page.evaluate(() => {
    const store = window.Atrium.Store;
    clearTimeout(store.saveTimer);
    store.saveTimer = null;
    store.flush = window.__wizardFlush;
  });
  let failedPosts = 0;
  await page.route('**/api/state', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    failedPosts++;
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Falha sintética de gravação' }) });
  });
  await page.locator('#setupWizardNext').click();
  await feedback(page);
  assert.equal(failedPosts, 1, 'Store real recebe HTTP 500 e não confirma.');
  const persistedBefore = await page.evaluate(async () => (await (await window.KellerAuth.secureFetch('/api/state')).json()).state.settings);
  assert.notEqual(persistedBefore.onboardingWizardCompleted, true);
  await page.unroute('**/api/state');
  await page.locator('#setupWizardNext').click();
  await page.locator('#setupWizardBackdrop').waitFor({ state: 'hidden' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  assert.deepEqual(await page.evaluate(() => window.Atrium.Store.state.settings.workspaceProfile), PROFILE);
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.settings.onboardingWizardCompleted), true);
  assert.deepEqual(pageErrors, []);
  await context.close();
  console.log('[1] Idempotência, prefill/reset, cópias, adiamento, foco/inert, locks, false/exceção e retry: PASS');
  console.log('[2] Store real: flush false, HTTP 500, retry confirmado e perfil persistido após reload: PASS');

  for (const theme of ['light', 'dark']) {
    for (const width of [1280, 390]) {
      const context = await session.createContext({ viewport: { width, height: width === 390 ? 844 : 860 }, reducedMotion: 'reduce' });
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
      await installFeature(page);
      await open(page);
      await page.screenshot({ path: path.join(OUTPUT, `welcome-${theme}-${width}.png`) });
      await geometry(page);
      await page.locator('#setupWizardNext').click();
      await page.locator('#setupWizardCourtsToggle').click();
      await page.locator('.setup-wizard-option').first().hover();
      await page.screenshot({ path: path.join(OUTPUT, `courts-${theme}-${width}.png`) });
      await page.evaluate(() => window.__wizard.close());
      await open(page);
      await summary(page);
      await page.locator('#setupWizardNext').click();
      await feedback(page);
      await page.screenshot({ path: path.join(OUTPUT, `retry-${theme}-${width}.png`) });
      await geometry(page);
      await page.setViewportSize({ width, height: 500 });
      await page.screenshot({ path: path.join(OUTPUT, `short-${theme}-${width}.png`) });
      await geometry(page);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 860 });
      await page.locator('#setupWizardNext').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'setupWizardSkip');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#appShell').getAttribute('inert'), null);
      assert.deepEqual(pageErrors, []);
      await context.close();
    }
  }
  console.log(`Evidências: ${OUTPUT}`);
  fs.writeFileSync(path.join(OUTPUT, 'layout-failures.json'), JSON.stringify(layoutFailures, null, 2));
  assert.deepEqual(layoutFailures, [], 'Falhas de geometria impedem aprovação visual.');
  console.log('[3] Light/dark, 1280/390, altura reduzida, screenshots e geometria: PASS');
} finally {
  await session.stop();
}
