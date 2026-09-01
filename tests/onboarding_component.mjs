import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const server = await startTestServer();
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
      'tourDots'
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

  const initialProbe = await readProbe();
  assert.equal(initialProbe.autoTimers, 1, 'Primeiro acesso deve agendar exatamente um timer de 600 ms.');
  assertSingleListeners(initialProbe.listeners);

  await page.locator('#guidedTourBackdrop:not(.hidden)').waitFor({ timeout: 2500 });
  await assertSlide(0, 'Primeiro acesso deve abrir o slide inicial.');
  assert.equal(await page.locator('.guided-tour-modal').count(), 1, 'Deve existir somente um tour no DOM.');
  assert.equal(await page.locator('#tourPrevButton').evaluate(element => element.style.display), 'none', 'Anterior deve começar oculto.');
  assert.equal(await page.locator('#tourNextButton').textContent(), 'Próximo →', 'O primeiro passo deve exibir a ação Próximo.');
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
  await page.locator('#tourButton').click();
  await page.locator('#guidedTourBackdrop:not(.hidden)').waitFor();
  await assertSlide(0, 'Abertura manual pelo cabeçalho deve ignorar a flag de visto.');
  await page.locator('#tourCloseButton').click();
  await assertTourClosed('Fechar deve encerrar o tour.');
  await assertSeenState('Fechar deve marcar o tour como visto.');

  await page.locator('button[data-view="configuration"]').click();
  await page.locator('#view-configuration.active').waitFor();
  await page.locator('#btnOpenTourFromConfig').click();
  await page.locator('#guidedTourBackdrop:not(.hidden)').waitFor();
  await assertSlide(0, 'Abertura manual por Configurações deve continuar disponível.');
  await page.keyboard.press('Escape');
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
  await page.keyboard.press('Escape');
  await assertSeenState('Escape global preserva a semântica vigente de marcar o tour como visto mesmo fechado.');

  const beforeRepeatedOpen = await readProbe();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.evaluate(() => window.Atrium.App.openGuidedTour(true));
    await page.locator('#guidedTourBackdrop:not(.hidden)').waitFor();
    await page.evaluate(() => window.Atrium.App.closeGuidedTour());
    await assertTourClosed('Abertura e fechamento repetidos devem permanecer estáveis.');
  }
  assert.deepEqual(await readProbe(), beforeRepeatedOpen, 'Aberturas repetidas não podem registrar novos listeners ou timers.');
  assert.equal(await page.locator('.guided-tour-modal').count(), 1, 'Aberturas repetidas não podem duplicar o markup do tour.');
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

function readProbe() {
  return page.evaluate(() => structuredClone(globalThis.__onboardingProbe));
}
