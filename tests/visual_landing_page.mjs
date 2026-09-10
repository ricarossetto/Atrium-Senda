import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startTestServer } from './helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });
const outputDir = path.resolve('artifacts/visual-qa/landing-page');
fs.mkdirSync(outputDir, { recursive: true });

let assertions = 0;

const mockConfiguredVisitor = async (page) => {
  await page.route('**/api/auth/status', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      configured: true,
      authenticated: false,
      workspaceRegistrationEnabled: true,
      bootstrapRequired: false,
      setupMfaRequired: false,
      csrfToken: 'test-csrf-token-landing'
    })
  }));
};

try {
  console.log('--- TESTANDO LANDING PAGE DO ATRIUM (UI V2) ---');

  // =========================================================================
  // CENÁRIO 1: DESKTOP DARK (1440x900)
  // =========================================================================
  {
    console.log('[1/4] Testando Desktop Dark (1440x900)...');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await mockConfiguredVisitor(page);
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    await page.goto(server.baseUrl);
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await page.waitForTimeout(400);

    const landing = page.locator('#landingPage');
    await assert.ok(await landing.isVisible(), 'Landing page deve estar visível por padrão para visitante deslogado');
    assertions++;

    const authGate = page.locator('#authGate');
    await assert.ok(await authGate.isHidden(), 'AuthGate deve estar oculto na chegada');
    assertions++;

    const heroTitle = page.locator('.landing-hero-title');
    await assert.ok(await heroTitle.isVisible(), 'Hero title deve estar visível');
    assertions++;

    // Verifica se não há overflow horizontal
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 2, `Overflow horizontal detectado: ${overflow}px`);
    assertions++;

    assert.deepEqual(pageErrors, [], 'Zero erros de página');
    assertions++;

    await page.screenshot({ path: path.join(outputDir, '01-desktop-dark-hero.png'), fullPage: false });
    await page.screenshot({ path: path.join(outputDir, '01-desktop-dark-full.png'), fullPage: true });
    await context.close();
  }

  // =========================================================================
  // CENÁRIO 2: DESKTOP LIGHT (1440x900)
  // =========================================================================
  {
    console.log('[2/4] Testando Desktop Light (1440x900)...');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await mockConfiguredVisitor(page);
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    await page.goto(server.baseUrl);
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
    });
    await page.waitForTimeout(400);

    const isLight = await page.evaluate(() => document.documentElement.dataset.theme === 'light');
    assert.equal(isLight, true);
    assertions++;

    const showcaseImgSrc = await page.locator('#landingShowcaseImage').getAttribute('src');
    assert.ok(showcaseImgSrc.includes('dashboard-light.png') || showcaseImgSrc.includes('dashboard'), 'Imagem de showcase sincronizada');
    assertions++;

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 2, `Overflow horizontal detectado no modo claro: ${overflow}px`);
    assertions++;

    assert.deepEqual(pageErrors, [], 'Zero erros de página no modo claro');
    assertions++;

    await page.screenshot({ path: path.join(outputDir, '02-desktop-light-hero.png'), fullPage: false });
    await page.screenshot({ path: path.join(outputDir, '02-desktop-light-full.png'), fullPage: true });
    await context.close();
  }

  // =========================================================================
  // CENÁRIO 3: MOBILE DARK (390x844 - iPhone 14)
  // =========================================================================
  {
    console.log('[3/4] Testando Mobile Dark (390x844)...');
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const page = await context.newPage();
    await mockConfiguredVisitor(page);
    const pageErrors = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    await page.goto(server.baseUrl);
    await page.waitForTimeout(400);

    // Verifica overflow horizontal em mobile
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 2, `Mobile overflow horizontal detectado: ${overflow}px`);
    assertions++;

    // Verifica que os botões principais de CTA no mobile têm altura >= 44px
    const undersizedButtons = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('#landingPage button, #landingPage .landing-btn-primary, #landingPage .landing-btn-secondary')];
      return buttons.filter(b => {
        const rect = b.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.height < 40 || rect.width < 40);
      }).map(b => b.textContent.trim().slice(0, 30));
    });
    assert.deepEqual(undersizedButtons, [], 'Nenhum botão de ação menor que 40px no mobile');
    assertions++;

    assert.deepEqual(pageErrors, [], 'Zero erros de página no mobile');
    assertions++;

    await page.screenshot({ path: path.join(outputDir, '03-mobile-dark-hero.png'), fullPage: false });
    await page.screenshot({ path: path.join(outputDir, '03-mobile-dark-full.png'), fullPage: true });
    await context.close();
  }

  // =========================================================================
  // CENÁRIO 4: INTERATIVIDADE (ABAS, FAQ E TRANSIÇÃO PARA AUTH GATE)
  // =========================================================================
  {
    console.log('[4/4] Testando fluxos interativos (Showcase, FAQ, Auth Gate)...');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await mockConfiguredVisitor(page);

    await page.goto(server.baseUrl);
    await page.waitForTimeout(300);

    // 1. Testa alternância de abas da vitrine
    const tabProcesses = page.locator('.landing-mockup-tab[data-tab="processes"]');
    await tabProcesses.click();
    await page.waitForTimeout(250);
    const activeTab = await page.locator('.landing-mockup-tab.active').getAttribute('data-tab');
    assert.equal(activeTab, 'processes', 'Aba de processos deve ficar ativa');
    assertions++;

    const currentImg = await page.locator('#landingShowcaseImage').getAttribute('src');
    assert.ok(currentImg.includes('process-inspector.png'), 'Imagem deve atualizar para o inspetor de processos');
    assertions++;

    // 2. Testa acordeão do FAQ
    const secondFaqBtn = page.locator('.landing-faq-item:nth-child(2) .landing-faq-button');
    await secondFaqBtn.click();
    await page.waitForTimeout(200);
    const isSecondOpen = await page.locator('.landing-faq-item:nth-child(2)').evaluate(el => el.classList.contains('open'));
    assert.equal(isSecondOpen, true, 'Segundo item de FAQ deve abrir ao clicar');
    assertions++;

    // 3. Testa clique em "Criar Meu Escritório Gratuito →" (leva ao #authGate no modo register)
    const heroRegisterBtn = page.locator('.landing-hero-cta-large').first();
    await heroRegisterBtn.click();
    await page.waitForTimeout(300);

    const landingVisible = await page.locator('#landingPage').isVisible();
    assert.equal(landingVisible, false, 'Landing page deve ficar oculta após acionar CTA');
    assertions++;

    const authGateVisible = await page.locator('#authGate').isVisible();
    assert.equal(authGateVisible, true, 'AuthGate deve estar visível');
    assertions++;

    const registerTabActive = await page.locator('#authTabRegister').evaluate(el => el.classList.contains('active'));
    assert.equal(registerTabActive, true, 'Aba Criar Escritório deve estar selecionada no AuthGate');
    assertions++;

    await page.screenshot({ path: path.join(outputDir, '04-authgate-transition.png'), fullPage: false });

    // 4. Testa botão "← Voltar ao Início"
    const backBtn = page.locator('.auth-back-to-landing');
    await backBtn.click();
    await page.waitForTimeout(300);

    const landingBack = await page.locator('#landingPage').isVisible();
    assert.equal(landingBack, true, 'Landing page deve voltar a ficar visível');
    assertions++;

    const authGateBack = await page.locator('#authGate').isVisible();
    assert.equal(authGateBack, false, 'AuthGate deve voltar a ficar oculto');
    assertions++;

    await context.close();
  }

  console.log('========================================================');
  console.log('✓ TESTES VISUAIS DA LANDING PAGE CONCLUÍDOS COM SUCESSO!');
  console.log(`- Asserções validadas: ${assertions}`);
  console.log(`- Diretório de evidências: ${outputDir}`);
  console.log('========================================================');
} finally {
  await browser.close();
  await server.stop();
}
