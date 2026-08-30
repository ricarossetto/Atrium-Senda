import { chromium } from 'playwright';
import { startTestServer, postJson } from './helpers.mjs';
import { generateTotp } from '../lib/security.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS_DIR = path.resolve(__dirname, '../artifacts/visual-qa');
const ONBOARDING_DIR = path.join(ARTIFACTS_DIR, 'onboarding');

const VIEWPORTS = [
  { width: 1920, height: 1080, name: '1920x1080' },
  { width: 1440, height: 900,  name: '1440x900'  },
  { width: 1366, height: 768,  name: '1366x768'  },
  { width: 1280, height: 720,  name: '1280x720'  },
  { width: 1024, height: 768,  name: '1024x768'  },
  { width: 861,  height: 900,  name: '861x900'   },
  { width: 768,  height: 1024, name: '768x1024'  },
  { width: 430,  height: 932,  name: '430x932'   },
  { width: 390,  height: 844,  name: '390x844'   },
  { width: 360,  height: 800,  name: '360x800'   },
  { width: 320,  height: 700,  name: '320x700'   }
];

const VIEWS = [
  { id: 'dashboard', name: 'dashboard', selector: '#view-dashboard.active', uniqueSelector: '.dashboard-workspace-wrap, #dashboardTaskList, .metric-grid' },
  { id: 'inbox', name: 'inbox', selector: '#view-inbox.active', uniqueSelector: '#publicationsMetrics, #inboxFilters, #inboxList' },
  { id: 'kanban', name: 'kanban', selector: '#view-kanban.active', uniqueSelector: '#kanbanBoard, #newTaskButton' },
  { id: 'processes', name: 'processes', selector: '#view-processes.active', uniqueSelector: '#processSearch, #processTable' },
  { id: 'financial', name: 'financial', selector: '#view-financial.active', uniqueSelector: '#financialTable, #financialFilters, #newFinancialEntryButton' },
  { id: 'documents', name: 'documents', selector: '#view-documents.active', uniqueSelector: '#documentsTemplateGrid, #btnOpenDocGenModal' },
  { id: 'agenda', name: 'agenda', selector: '#view-agenda.active', uniqueSelector: '#agendaList, #agendaFilterTabs, #agendaSyncButton' },
  { id: 'contacts', name: 'contacts', selector: '#view-contacts.active', uniqueSelector: '#contactSearch, #contactTable, #newContactButton' },
  { id: 'integrations', name: 'sources', selector: '#view-integrations.active', uniqueSelector: '#configureCalendarButton, #certificateGuideButton, .integration-grid' },
  { id: 'assistant', name: 'ai-assistant', selector: '#view-assistant.active', uniqueSelector: '#aiOnboardingBanner, #aiQuickKeyInput, .ai-assistant-container' },
  { id: 'audit', name: 'audit', selector: '#view-audit.active', uniqueSelector: '#auditFilters, #auditList, #auditCountBadge' }
];

function getFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

async function assertNoUnexpectedOverlays(page, allowed = []) {
  const overlays = [
    { id: 'guidedTourBackdrop', name: 'Apresentação Guiada' },
    { id: 'authGate', name: 'Auth Gate' },
    { id: 'modalBackdrop', name: 'Modal Principal' },
    { id: 'financialEntryBackdrop', name: 'Modal Financeiro' },
    { id: 'judicialSetupBackdrop', name: 'Setup Judicial' },
    { id: 'officeSetupBackdrop', name: 'Setup do Escritório' },
    { id: 'treatPublicationBackdrop', name: 'Modal de Tratamento' },
    { id: 'discardPublicationBackdrop', name: 'Modal de Descarte' }
  ];

  for (const o of overlays) {
    if (allowed.includes(o.id)) continue;
    const isVisible = await page.evaluate((id) => {
      const el = document.getElementById(id);
      if (!el) return false;
      if (el.classList.contains('hidden')) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }, o.id);

    if (isVisible) {
      throw new Error(`Unexpected overlay visible: ${o.id} (${o.name})`);
    }
  }
}

console.log('===============================================================');
console.log('  ATRIUM — VISUAL QA & MULTI-VIEWPORT HARDENING MATRIX');
console.log('===============================================================\n');

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

try {
  const password = 'Senha-Segura-2026!';
  let res = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin',
    displayName: 'Dr. Roberto Keller',
    password
  });
  let setupData = await res.json();
  const totpCode = generateTotp(setupData.manualSecret);
  res = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setupData.setupToken,
    code: totpCode
  });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const sessionToken = cookie.split('=')[1];

  let totalScreenshots = 0;
  let totalAssertions = 0;
  let passedAssertions = 0;
  const generatedHashes = new Set();
  const onboardingScreenshotsList = [];

  fs.mkdirSync(ONBOARDING_DIR, { recursive: true });

  // ─────────────────────────────────────────────────────────────
  // PARTE 1 — TESTE DEDICADO DO ONBOARDING / APRESENTAÇÃO GUIADA
  // ─────────────────────────────────────────────────────────────
  console.log('\n[1/2] Executando Suíte de Testes do Onboarding (Apresentação Guiada)...');

  const ONBOARDING_TEST_CONFIGS = [
    { name: '1440x900', width: 1440, height: 900, theme: 'light', prefix: 'light' },
    { name: '1440x900', width: 1440, height: 900, theme: 'dark', prefix: 'dark' },
    { name: '390x844',  width: 390,  height: 844, theme: 'light', prefix: 'mobile-light' }
  ];

  for (const cfg of ONBOARDING_TEST_CONFIGS) {
    console.log(`  -> Testando Onboarding em ${cfg.width}x${cfg.height} [Tema: ${cfg.theme.toUpperCase()}]...`);

    const context = await browser.newContext({
      viewport: { width: cfg.width, height: cfg.height },
      deviceScaleFactor: 1
    });

    await context.addCookies([{
      name: 'keller_session',
      value: sessionToken,
      domain: '127.0.0.1',
      path: '/'
    }]);

    const page = await context.newPage();
    await page.goto(`${server.baseUrl}/`);
    await page.waitForLoadState('networkidle');

    // Configurar tema
    await page.evaluate((t) => {
      if (t === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('atrium_theme', 'light');
      } else {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('atrium_theme', 'dark');
      }
    }, cfg.theme);

    // Abrir o Tour explicitamente via botão ou API
    await page.evaluate(() => {
      const app = window.Atrium?.App || window.JurisFlow?.App || window.portalApp;
      if (app && typeof app.openGuidedTour === 'function') {
        app.openGuidedTour(true);
      }
    });
    await page.waitForTimeout(150);

    // Assert: Backdrop visível
    const isTourVisible = await page.evaluate(() => {
      const el = document.getElementById('guidedTourBackdrop');
      return el && !el.classList.contains('hidden');
    });
    assert.ok(isTourVisible, 'O modal de apresentação guiada deve estar visível após acionamento.');

    // Assert de Textos e Ausência de Branding Obsoleto
    const tourTextContent = await page.textContent('#guidedTourBackdrop');
    assert.ok(!tourTextContent.includes('Atrium Senda'), 'Não deve existir "Atrium Senda" no tour.');
    assert.ok(!tourTextContent.includes('ATRIUM SENDA'), 'Não deve existir "ATRIUM SENDA" no tour.');
    assert.ok(!tourTextContent.includes('Senda (o fluxo'), 'Não deve existir explicação etimológica Senda no tour.');
    assert.ok(tourTextContent.includes('Bem-vindo ao Atrium'), 'Tour deve conter "Bem-vindo ao Atrium".');
    assert.ok(tourTextContent.includes('ATRIUM') || tourTextContent.includes('Atrium'), 'Tour deve conter a marca Atrium.');
    assert.ok(tourTextContent.includes('ciência judicial'), 'Tour deve conter ressalva sobre ciência judicial.');

    // Capturar cada um dos 6 slides
    for (let slideIdx = 0; slideIdx < 6; slideIdx++) {
      await page.evaluate((idx) => {
        const app = window.Atrium?.App || window.JurisFlow?.App || window.portalApp;
        if (app && typeof app.showTourSlide === 'function') {
          app.showTourSlide(idx);
        }
      }, slideIdx);
      await page.waitForTimeout(80);

      // Validar que slide atual está ativo
      const activeSlideIdx = await page.evaluate(() => {
        const active = document.querySelector('.tour-slide.active');
        return active ? Number(active.dataset.slide) : -1;
      });
      assert.equal(activeSlideIdx, slideIdx, `Slide ${slideIdx + 1} deve estar com a classe active.`);

      // Validar responsividade / overflow
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(scrollW <= cfg.width + 2, `Overflow detectado no onboarding (${cfg.name} slide ${slideIdx + 1}): ${scrollW} > ${cfg.width}`);

      const screenshotFile = `${cfg.prefix}-slide-${slideIdx + 1}.png`;
      const screenshotPath = path.join(ONBOARDING_DIR, screenshotFile);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      totalScreenshots++;
      onboardingScreenshotsList.push(`artifacts/visual-qa/onboarding/${screenshotFile}`);
    }

    // Validar navegação interativa (botão Próximo e Anterior)
    await page.click('#tourPrevButton');
    await page.waitForTimeout(60);
    const prevSlideIdx = await page.evaluate(() => Number(document.querySelector('.tour-slide.active')?.dataset.slide));
    assert.equal(prevSlideIdx, 4, 'Botão anterior deve voltar para o slide anterior.');

    await page.click('#tourNextButton');
    await page.waitForTimeout(60);
    const nextSlideIdx = await page.evaluate(() => Number(document.querySelector('.tour-slide.active')?.dataset.slide));
    assert.equal(nextSlideIdx, 5, 'Botão próximo deve avançar para o próximo slide.');

    // Validar navegação por indicadores (Dots)
    await page.click('#tourDots .tour-dot[data-slide-target="1"]');
    await page.waitForTimeout(60);
    const dotSlideIdx = await page.evaluate(() => Number(document.querySelector('.tour-slide.active')?.dataset.slide));
    assert.equal(dotSlideIdx, 1, 'Clique no indicador (dot) deve navegar para o slide correspondente.');

    // Validar Fechar apresentação
    await page.click('#tourCloseButton');
    await page.waitForTimeout(100);
    const isHiddenAfterClose = await page.evaluate(() => document.getElementById('guidedTourBackdrop')?.classList.contains('hidden'));
    assert.ok(isHiddenAfterClose, 'Tour deve ser fechado após clicar no botão fechar.');

    // Validar Reabertura
    await page.evaluate(() => {
      const app = window.Atrium?.App || window.JurisFlow?.App || window.portalApp;
      app.openGuidedTour(true);
    });
    await page.waitForTimeout(80);
    const isReopened = await page.evaluate(() => !document.getElementById('guidedTourBackdrop')?.classList.contains('hidden'));
    assert.ok(isReopened, 'Tour deve reabrir quando acionado manualmente.');

    // Validar Pular Apresentação
    await page.click('#tourSkipButton');
    await page.waitForTimeout(100);
    const isSkipped = await page.evaluate(() => document.getElementById('guidedTourBackdrop')?.classList.contains('hidden'));
    assert.ok(isSkipped, 'Tour deve fechar ao clicar em Pular Apresentação.');

    await context.close();
    console.log(`  ✓ Onboarding em ${cfg.width}x${cfg.height} [${cfg.theme}] aprovado com sucesso.`);
  }

  // ─────────────────────────────────────────────────────────────
  // PARTE 2 — TESTE DAS VIEWS DA APLICAÇÃO (SEM OVERLAYS)
  // ─────────────────────────────────────────────────────────────
  console.log('\n[2/2] Executando Suíte Visual Multi-Viewport das Telas da Aplicação...');

  for (const theme of ['dark', 'light']) {
    console.log(`\n--- Testando Tema: ${theme.toUpperCase()} ---`);

    for (const vp of VIEWPORTS) {
      const outputDir = path.join(ARTIFACTS_DIR, theme, vp.name);
      fs.mkdirSync(outputDir, { recursive: true });

      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1
      });

      // GARANTIA: Tour NÃO abre automaticamente durante o teste das views
      await context.addInitScript(() => {
        localStorage.setItem('atrium_tour_seen', 'true');
        localStorage.setItem('jurisflow_tour_seen', 'true');
        localStorage.setItem('jurisflow_tour_completed', 'true');
      });

      await context.addCookies([{
        name: 'keller_session',
        value: sessionToken,
        domain: '127.0.0.1',
        path: '/'
      }]);

      const page = await context.newPage();
      await page.goto(`${server.baseUrl}/`);
      await page.waitForLoadState('networkidle');

      // Configurar tema
      await page.evaluate((t) => {
        if (t === 'light') {
          document.documentElement.setAttribute('data-theme', 'light');
          localStorage.setItem('atrium_theme', 'light');
        } else {
          document.documentElement.removeAttribute('data-theme');
          localStorage.setItem('atrium_theme', 'dark');
        }
      }, theme);

      await page.waitForTimeout(100);

      // ASSERT OBRIGATÓRIO: Tour deve estar oculto
      const tourIsHidden = await page.evaluate(() => {
        const el = document.getElementById('guidedTourBackdrop');
        return !el || el.classList.contains('hidden') || window.getComputedStyle(el).display === 'none';
      });
      if (!tourIsHidden) {
        throw new Error(`[FALHA CRÍTICA] #guidedTourBackdrop está visível durante teste de views em ${vp.name} (${theme})!`);
      }

      const viewportScreenshotHashes = new Map();

      for (const view of VIEWS) {
        // Garantir que nenhum overlay cobre a tela antes de navegar
        await assertNoUnexpectedOverlays(page);

        // Trocar de View com fallback robusto
        await page.evaluate((viewId) => {
          const navBtn = document.querySelector(`.nav-item[data-view="${viewId}"]`);
          if (navBtn) {
            navBtn.click();
          } else {
            const app = window.Atrium?.App || window.JurisFlow?.App || window.portalApp;
            if (app && typeof app.switchView === 'function') {
              app.switchView(viewId);
            }
          }
        }, view.id);

        await page.waitForTimeout(100);

        // ASSERT: Validar que a view correta realmente ficou ativa no DOM
        const isViewActive = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          return Boolean(el && el.classList.contains('active'));
        }, view.selector);

        if (!isViewActive) {
          throw new Error(`[FALHA DE NAVEGAÇÃO] A view "${view.id}" não ficou ativa no DOM (${view.selector})!`);
        }

        // ASSERT: Validar elemento único da view
        const uniqueElementExists = await page.evaluate((uSel) => {
          const el = document.querySelector(uSel);
          return Boolean(el);
        }, view.uniqueSelector);

        if (!uniqueElementExists) {
          throw new Error(`[FALHA DE CONTEÚDO] Elemento único da view "${view.id}" (${view.uniqueSelector}) não foi encontrado!`);
        }

        // ASSERT: Validar ausência de overlays cobrindo a tela
        await assertNoUnexpectedOverlays(page);

        // Validar overflow horizontal
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        totalAssertions++;
        assert.ok(scrollWidth <= vp.width + 2, `Overflow horizontal na view ${view.id} em ${vp.name}: scrollWidth=${scrollWidth}, viewport=${vp.width}`);
        passedAssertions++;

        const screenshotPath = path.join(outputDir, `${view.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        totalScreenshots++;

        // DETECTOR DE SCREENSHOTS DUPLICADOS
        const hash = getFileHash(screenshotPath);
        for (const [otherView, otherHash] of viewportScreenshotHashes.entries()) {
          if (otherHash === hash) {
            throw new Error(`Visual QA captured identical images for different views (${view.name} === ${otherView}) in ${theme} ${vp.name}. Possible overlay or navigation failure.`);
          }
        }
        viewportScreenshotHashes.set(view.name, hash);
        generatedHashes.add(hash);
      }

      // ── SCREENSHOT: MODAL DE ENTRADA FINANCEIRA / TAREFA ──
      await page.evaluate(() => {
        const app = window.Atrium?.App || window.JurisFlow?.App || window.portalApp;
        if (app && typeof app.openFinancialEntryModal === 'function') {
          app.openFinancialEntryModal();
        } else if (app && typeof app.openTaskModal === 'function') {
          app.openTaskModal();
        }
      });
      await page.waitForTimeout(100);

      // Assert: modal está visível
      const modalVisible = await page.evaluate(() => {
        const finBackdrop = document.getElementById('financialEntryBackdrop');
        const genBackdrop = document.getElementById('modalBackdrop');
        return (finBackdrop && !finBackdrop.classList.contains('hidden')) || (genBackdrop && !genBackdrop.classList.contains('hidden'));
      });
      assert.ok(modalVisible, 'Modal deve estar visível para captura do screenshot modal_financial_entry.png');
      const modalBounds = await page.evaluate(() => {
        const modal = [...document.querySelectorAll('.modal-backdrop:not(.hidden) .modal')].find(element => {
          const style = getComputedStyle(element);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });
        if (!modal) return null;
        const rect = modal.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, viewport: innerWidth };
      });
      assert.ok(modalBounds && modalBounds.left >= -2 && modalBounds.right <= modalBounds.viewport + 2,
        `Modal financeiro excede o viewport ${vp.name}: ${JSON.stringify(modalBounds)}`);

      const modalScreenshot = path.join(outputDir, 'modal_financial_entry.png');
      await page.screenshot({ path: modalScreenshot });
      totalScreenshots++;
      generatedHashes.add(getFileHash(modalScreenshot));

      await page.evaluate(() => {
        const app = window.Atrium?.App || window.JurisFlow?.App || window.portalApp;
        if (app && typeof app.closeFinancialEntryModal === 'function') {
          app.closeFinancialEntryModal();
        } else if (app && typeof app.closeModal === 'function') {
          app.closeModal();
        }
      });
      await page.waitForTimeout(80);

      // ── SCREENSHOT: PALETA DE BUSCA GLOBAL ──
      if (vp.width > 860) {
        await page.evaluate(() => {
          const input = document.getElementById('globalSearch');
          const app = window.Atrium?.App || window.JurisFlow?.App || window.portalApp;
          if (input && app) {
            input.value = 'Direito';
            app.performGlobalSearch('Direito');
          }
        });
        await page.waitForTimeout(100);

        const paletteVisible = await page.evaluate(() => !document.getElementById('globalSearchPalette')?.classList.contains('hidden'));
        assert.ok(paletteVisible, 'Paleta de busca global deve estar visível para captura do screenshot global_search_palette.png');

        const paletteScreenshot = path.join(outputDir, 'global_search_palette.png');
        await page.screenshot({ path: paletteScreenshot });
        totalScreenshots++;
        generatedHashes.add(getFileHash(paletteScreenshot));

        await page.evaluate(() => {
          const app = window.Atrium?.App || window.JurisFlow?.App || window.portalApp;
          if (app && typeof app.closeGlobalSearchPalette === 'function') {
            app.closeGlobalSearchPalette();
          }
        });
      }

      await context.close();
      console.log(`  ✓ Viewport ${vp.name} validado com sucesso (${VIEWS.length + (vp.width > 860 ? 2 : 1)} capturas únicas).`);
    }
  }

  console.log('\n======================================================');
  console.log('✓ VISUAL QA CONCLUÍDO COM SUCESSO!');
  console.log(`- Total de screenshots gerados: ${totalScreenshots}`);
  console.log(`- Total de hashes de imagem únicos: ${generatedHashes.size}`);
  console.log(`- Asserções de layout verificadas: ${passedAssertions}/${totalAssertions} (${((passedAssertions/totalAssertions)*100).toFixed(1)}%)`);
  console.log(`- Artefatos salvos em: ${ARTIFACTS_DIR}`);
  console.log('======================================================\n');

} finally {
  await browser.close();
  await server.stop();
}

await import('./visual_ui_v2_dashboard.mjs');
