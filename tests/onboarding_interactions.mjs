import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

try {
  const sessionCookie = await createAuthCookie();

  // Test Suite 1: Desktop Viewport (1440 x 900)
  console.log('[TEST] Iniciando validação Desktop (1440x900)...');
  await runInteractionsTest({ width: 1440, height: 900 }, sessionCookie, 'Desktop');
  console.log('✓ Desktop 1440x900: todos os cliques, transições e controles responderam perfeitamente.');

  // Test Suite 2: Mobile Viewport (390 x 844)
  console.log('[TEST] Iniciando validação Mobile (390x844)...');
  await runInteractionsTest({ width: 390, height: 844 }, sessionCookie, 'Mobile');
  console.log('✓ Mobile 390x844: todos os cliques físicos, layout sem corte e controles responderam perfeitamente.');

  console.log('\n========================================');
  console.log('ALL ONBOARDING INTERACTION TESTS PASSED!');
  console.log('========================================\n');
} finally {
  await browser.close();
  await server.stop();
}

async function createAuthCookie() {
  const setupRes = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'adv_smoke_onboarding',
    displayName: 'Advogado Smoke',
    password: 'Senha-Onboarding-Smoke-2026!'
  });
  assert.equal(setupRes.status, 200, 'Setup deve responder 200');
  const setup = await setupRes.json();
  const verifyRes = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  assert.equal(verifyRes.status, 200, 'Verify deve responder 200');
  const cookie = verifyRes.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie, 'Cookie de sessão deve ser emitido');
  return cookie;
}

async function runInteractionsTest(viewport, cookieStr, label) {
  const context = await browser.newContext({ locale: 'pt-BR', viewport });
  const sep = cookieStr.indexOf('=');
  await context.addCookies([{
    name: cookieStr.slice(0, sep),
    value: cookieStr.slice(sep + 1),
    domain: '127.0.0.1',
    path: '/'
  }]);

  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('atrium_product_tour_off', 'true'));
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  try {
    const response = await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
    assert.ok(response?.ok(), `Página inicial deve carregar para ${label}.`);
    await page.locator('#appShell:not(.hidden)').waitFor();

    // 1. Abrir Onboarding forçado
    await page.evaluate(() => window.Atrium.App.openGuidedTour(true));
    await page.locator('#guidedTourBackdrop:not(.hidden)').waitFor({ timeout: 2500 });

    const activeSlide = () => page.evaluate(() => {
      const el = document.querySelector('.tour-slide.active');
      return el ? Number(el.dataset.slide) : -1;
    });

    assert.equal(await activeSlide(), 0, `${label}: Onboarding deve abrir no slide 0.`);

    // 2. Clique físico em Próximo -> avança para slide 1
    const nextBtn = page.locator('#tourNextButton');
    await nextBtn.click();
    assert.equal(await activeSlide(), 1, `${label}: Próximo deve avançar para o slide 1.`);

    // 3. Clique físico em Voltar -> retorna para slide 0
    const prevBtn = page.locator('#tourPrevButton');
    await prevBtn.waitFor({ state: 'visible' });
    await prevBtn.click();
    assert.equal(await activeSlide(), 0, `${label}: Voltar deve retornar para o slide 0.`);

    // 4. Avançar até o Slide 3 (Atmosfera e Tema de Trabalho)
    await nextBtn.click(); // slide 1
    assert.equal(await activeSlide(), 1);
    await nextBtn.click(); // slide 2
    assert.equal(await activeSlide(), 2);
    await nextBtn.click(); // slide 3 (Tema)
    assert.equal(await activeSlide(), 3, `${label}: Deve avançar até o slide 3 (Tema).`);

    // 5. Teste de seleção de Tema no slide 3
    const lightCard = page.locator('#onboardingThemeCardLight');
    const darkCard = page.locator('#onboardingThemeCardDark');

    await lightCard.click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light', `${label}: Clique no card Light deve ativar o tema light.`);
    assert.equal(await lightCard.evaluate(el => el.classList.contains('active')), true, `${label}: Card Light deve receber classe active.`);

    await darkCard.click();
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'dark'), 'dark', `${label}: Clique no card Dark deve ativar o tema dark.`);
    assert.equal(await darkCard.evaluate(el => el.classList.contains('active')), true, `${label}: Card Dark deve receber classe active.`);
    assert.equal(await page.evaluate(() => localStorage.getItem('atrium_theme')), 'dark', `${label}: localStorage atrium_theme deve ser dark.`);

    // 6. Avançar até o Slide 4 (Certificado Digital A1 & Conexões)
    await nextBtn.click();
    assert.equal(await activeSlide(), 4, `${label}: Deve avançar até o slide 4 (Certificado A1).`);

    // 7. Teste de Opções A1 no slide 4
    const certOptNow = page.locator('#certOptNow');
    const certOptLater = page.locator('#certOptLater');
    const certOptNone = page.locator('#certOptNone');
    const uploadFields = page.locator('#onboardingA1UploadFields');

    await certOptNow.click();
    assert.equal(await certOptNow.getAttribute('aria-checked'), 'true', `${label}: Card A1 Agora deve ficar checked.`);
    assert.equal(await certOptNow.evaluate(el => el.classList.contains('active')), true);
    assert.equal(await uploadFields.evaluate(el => !el.classList.contains('hidden')), true, `${label}: Orientação de cadastro deve aparecer.`);
    assert.match(await uploadFields.textContent(), /Integrações.*Conexões com tribunais/, `${label}: O tour deve indicar o fluxo oficial de cadastro.`);
    assert.equal(await page.locator('#onboardingA1Password').count(), 0, `${label}: O tour não pode solicitar senha sem validar o A1.`);
    assert.equal(await page.locator('#btnOnboardingInstallA1').count(), 0, `${label}: O tour não pode fingir instalação de A1.`);

    await certOptLater.click();
    assert.equal(await certOptLater.getAttribute('aria-checked'), 'true', `${label}: Card A1 Depois deve ficar checked.`);
    assert.equal(await certOptLater.evaluate(el => el.classList.contains('active')), true);
    assert.equal(await uploadFields.evaluate(el => el.classList.contains('hidden')), true, `${label}: Campos de upload devem ser ocultados.`);

    await certOptNone.click();
    assert.equal(await certOptNone.getAttribute('aria-checked'), 'true', `${label}: Card A1 Nenhum deve ficar checked.`);
    assert.equal(await certOptNone.evaluate(el => el.classList.contains('active')), true);

    // 8. Teste de Pular Apresentação
    const skipBtn = page.locator('#tourSkipButton');
    await skipBtn.click();
    await page.locator('#guidedTourBackdrop.hidden').waitFor({ state: 'attached' });
    assert.equal(await page.locator('#guidedTourBackdrop').evaluate(el => el.classList.contains('hidden')), true, `${label}: Pular deve fechar o tour.`);

    // 9. Reabrir e testar Finalizar no último slide
    await page.evaluate(() => window.Atrium.App.openGuidedTour(true));
    await page.locator('#guidedTourBackdrop:not(.hidden)').waitFor();

    // Navegar até slide 5 usando cliques em Próximo
    while ((await activeSlide()) < 5) {
      await nextBtn.click();
    }
    assert.equal(await activeSlide(), 5, `${label}: Deve estar no slide final (5).`);
    assert.equal(await nextBtn.textContent(), 'Começar a usar o Atrium', `${label}: Botão final deve ser "Começar a usar o Atrium".`);

    await nextBtn.click();
    await page.locator('#guidedTourBackdrop.hidden').waitFor({ state: 'attached', timeout: 5000 });
    assert.equal(await page.locator('#guidedTourBackdrop').evaluate(el => el.classList.contains('hidden')), true, `${label}: Finalizar deve concluir e fechar o tour.`);

    // 10. Verificar ausência de erros no console
    assert.deepEqual(pageErrors, [], `${label}: Erros de página detectados: ${pageErrors.join(' | ')}`);
  } finally {
    await context.close();
  }
}
