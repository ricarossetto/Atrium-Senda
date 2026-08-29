import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startTestServer, postJson } from './helpers.mjs';
import { generateTotp } from '../lib/security.mjs';
import { isoDate } from '../js/core/store.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ARTIFACTS_DIR = path.join(ROOT, 'artifacts', 'light-foundation');

console.log('\n===============================================================');
console.log('  ATRIUM — TESTE VISUAL: FUNDAÇÃO LIGHT, ILHAS DARK E CONTRASTE');
console.log('===============================================================\n');

await mkdir(ARTIFACTS_DIR, { recursive: true });

const server = await startTestServer();

try {
  // 1. Setup do Administrador
  const adminPassword = 'Senha-Segura-Admin-12345!';
  let res = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin',
    displayName: 'Advogada Visual Teste',
    email: 'advogada.visual@example.test',
    password: adminPassword
  });
  const setupData = await res.json();
  res = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setupData.setupToken,
    code: generateTotp(setupData.manualSecret)
  });
  const verified = await res.json();
  const adminCookie = res.headers.get('set-cookie').split(';')[0];
  const adminCsrf = verified.csrfToken;

  // 2. Popular estado de teste rico com processos, contatos, agenda, etc.
  res = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: adminCookie } });
  const stateEnv = await res.json();
  const state = stateEnv.state || {};
  const todayStr = isoDate();

  state.processes = [
    {
      id: 'proc-1',
      number: '0000001-11.2026.4.04.0001',
      client: 'Cliente Alfa Visual',
      court: 'TRF4',
      action: 'Ação Previdenciária',
      status: 'em_andamento',
      phase: 'Perícia Médica',
      value: 'R$ 84.500,00',
      distributionDate: '2022-04-10',
      responsible: 'Advogada Visual Teste'
    },
    {
      id: 'proc-2',
      number: '5014890-12.2023.4.04.7100',
      client: 'Cliente Beta Visual',
      court: 'JFRS',
      action: 'Revisão da Vida Toda',
      status: 'sentenca',
      phase: 'Julgamento',
      value: 'R$ 120.000,00',
      distributionDate: '2023-01-15',
      responsible: 'Advogada Visual Teste'
    }
  ];

  state.contacts = [
    {
      id: 'cont-1',
      name: 'Cliente Alfa Visual',
      type: 'cliente',
      email: 'cliente.alfa@example.test',
      phone: '(51) 99887-6655',
      document: '123.456.789-00',
      city: 'Novo Hamburgo / RS',
      status: 'ativo'
    },
    {
      id: 'cont-2',
      name: 'Cliente Beta Visual',
      type: 'cliente',
      email: 'cliente.beta@example.test',
      phone: '(51) 98765-4321',
      document: '987.654.321-99',
      city: 'Porto Alegre / RS',
      status: 'ativo'
    }
  ];

  state.agenda = [
    {
      id: 'ag-1',
      title: 'Audiência de Instrução e Julgamento',
      process: '0000001-11.2026.4.04.0001',
      date: todayStr,
      time: '14:30',
      type: 'audiencia',
      responsible: 'Advogada Visual Teste',
      location: 'Sala Virtual TRF4'
    },
    {
      id: 'ag-2',
      title: 'Prazo Fatal: Manifestação sobre Laudo',
      process: '5014890-12.2023.4.04.7100',
      date: todayStr,
      time: '18:00',
      type: 'prazo',
      responsible: 'Advogada Visual Teste',
      location: 'PJe / TRF4'
    }
  ];

  state.intimations = [
    {
      id: 'int-1',
      title: 'Intimação para Manifestação sobre Laudo',
      process: '0000001-11.2026.4.04.0001',
      client: 'Cliente Alfa Visual',
      court: 'TRF4',
      publishedAt: todayStr,
      source: 'DJEN Oficial',
      text: 'Fica a parte autora intimada para manifestação sobre o laudo.',
      status: 'nova',
      unread: true
    }
  ];

  await postJson(`${server.baseUrl}/api/state`, { state }, {
    Cookie: adminCookie,
    'X-CSRF-Token': adminCsrf
  });

  // 3. Inicializar Playwright
  const browser = await chromium.launch({ headless: true });
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktopContext.newPage();

  try {
    // Login inicial
    await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
    await page.locator('#authLoginForm.active').waitFor();
    await page.locator('#authLoginForm [name="username"]').fill('admin');
    await page.locator('#authLoginForm [name="password"]').fill(adminPassword);
    await page.locator('#authLoginForm [name="code"]').fill(generateTotp(setupData.manualSecret));
    await page.locator('#authLoginForm button[type="submit"]').click();
    await page.locator('#appShell:not(.hidden)').waitFor();

    // Desativar tour guiado permanentemente e ativar TEMA CLARO
    await page.evaluate(() => {
      localStorage.setItem('jurisflow_tour_completed', 'true');
      localStorage.setItem('jurisflow_tour_seen', 'true');
      const tour = document.getElementById('guidedTourBackdrop');
      if (tour) tour.classList.add('hidden');
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('jurisflow_theme', 'light');
      if (window.Store && window.Store.state && window.Store.state.settings) {
        window.Store.state.settings.theme = 'light';
      }
    });
    await page.waitForTimeout(300);

    // Função auxiliar para auditoria de elementos visíveis
    async function auditCurrentView(viewName) {
      return await page.evaluate((vName) => {
        const darkIslands = [];
        const contrastWarnings = [];

        function parseRgb(colorStr) {
          if (!colorStr || colorStr === 'transparent' || colorStr.startsWith('rgba(0, 0, 0, 0)')) return null;
          const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (!match) return null;
          return { r: parseInt(match[1]), g: parseInt(match[2]), b: parseInt(match[3]) };
        }

        function isDarkColor(rgb) {
          if (!rgb) return false;
          // RGB dark threshold (escuro indesejado em superfícies do light theme)
          return rgb.r <= 35 && rgb.g <= 35 && rgb.b <= 35;
        }

        function getLuminance(rgb) {
          if (!rgb) return 1;
          const a = [rgb.r, rgb.g, rgb.b].map(v => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
          });
          return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
        }

        const elements = Array.from(document.querySelectorAll('*'));
        for (const el of elements) {
          const rect = el.getBoundingClientRect();
          if (rect.width < 15 || rect.height < 15) continue;
          if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) continue;

          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

          // Checar Background (Dark Islands)
          const bg = parseRgb(style.backgroundColor);
          if (bg && isDarkColor(bg)) {
            const id = el.id || '';
            const className = typeof el.className === 'string' ? el.className : '';
            const isModalBackdrop = className.includes('modal-backdrop') || id.includes('Backdrop');
            const isGoldButton = className.includes('button') && className.includes('gold');
            const isBrandBadge = className.includes('brand-emblem') || className.includes('brand-title');
            
            if (!isModalBackdrop && !isGoldButton && !isBrandBadge) {
              darkIslands.push({
                view: vName,
                tag: el.tagName.toLowerCase(),
                id,
                className,
                background: style.backgroundColor,
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              });
            }
          }

          // Checar Contraste Texto Claro em Fundo Claro
          const fg = parseRgb(style.color);
          if (fg && el.textContent && el.textContent.trim().length > 0 && el.children.length === 0) {
            const fgLum = getLuminance(fg);
            if (fgLum > 0.75) {
              const id = el.id || '';
              const className = typeof el.className === 'string' ? el.className : '';
              const isGoldBadge = className.includes('badge-urgent') || className.includes('badge-gold') || (el.closest('.button.gold'));
              if (!isGoldBadge) {
                contrastWarnings.push({
                  view: vName,
                  tag: el.tagName.toLowerCase(),
                  id,
                  className,
                  text: el.textContent.trim().slice(0, 35),
                  color: style.color,
                  fgLum: Math.round(fgLum * 100) / 100
                });
              }
            }
          }
        }

        return { darkIslands, contrastWarnings };
      }, viewName);
    }

    const allDarkIslands = [];
    const allContrastWarnings = [];

    // 4. Testar as 6 VIEWS PRINCIPAIS
    const viewsToTest = [
      { id: 'dashboard', file: 'dashboard.png', name: 'Dashboard' },
      { id: 'agenda', file: 'agenda.png', name: 'Agenda' },
      { id: 'processes', file: 'processos.png', name: 'Processos' },
      { id: 'contacts', file: 'contatos.png', name: 'Contatos' },
      { id: 'integrations', file: 'integracoes.png', name: 'Integrações' },
      { id: 'configuration', file: 'configuracoes.png', name: 'Configurações' }
    ];

    for (const v of viewsToTest) {
      console.log(`Auditing view: ${v.name}...`);
      await page.evaluate(viewId => {
        const item = document.querySelector(`.nav-item[data-view="${viewId}"]`);
        if (item) item.click();
      }, v.id);
      await page.locator(`#view-${v.id}.active`).waitFor();
      await page.waitForTimeout(400);

      const audit = await auditCurrentView(v.name);
      allDarkIslands.push(...audit.darkIslands);
      allContrastWarnings.push(...audit.contrastWarnings);

      const shotPath = path.join(ARTIFACTS_DIR, v.file);
      await page.screenshot({ path: shotPath, fullPage: false });
    }

    // 5. Testar 1 MODAL & FORMULÁRIO
    console.log('Auditing Modal & Form...');
    await page.evaluate(() => {
      document.querySelector('.nav-item[data-view="contacts"]')?.click();
    });
    await page.locator('#view-contacts.active').waitFor();
    const btnNewContact = page.locator('#newContactButton');
    if (await btnNewContact.isVisible()) {
      await btnNewContact.click();
      const modal = page.locator('#modalBackdrop');
      await modal.waitFor({ state: 'visible' });
      await page.waitForTimeout(400);

      const modalAudit = await auditCurrentView('Modal Contato');
      allDarkIslands.push(...modalAudit.darkIslands);
      allContrastWarnings.push(...modalAudit.contrastWarnings);

      const shotPath = path.join(ARTIFACTS_DIR, 'modal.png');
      await page.screenshot({ path: shotPath, fullPage: false });

      await page.locator('#modalClose').click();
      await modal.waitFor({ state: 'hidden' });
    }

    // 6. Testar MOBILE VIEWPORT (390x844)
    console.log('Auditing Mobile Viewport (390x844)...');
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(server.baseUrl, { waitUntil: 'networkidle' });
    await mobilePage.locator('#authLoginForm.active').waitFor();
    await mobilePage.locator('#authLoginForm [name="username"]').fill('admin');
    await mobilePage.locator('#authLoginForm [name="password"]').fill(adminPassword);
    await mobilePage.locator('#authLoginForm [name="code"]').fill(generateTotp(setupData.manualSecret));
    await mobilePage.locator('#authLoginForm button[type="submit"]').click();
    await mobilePage.locator('#appShell:not(.hidden)').waitFor();

    await mobilePage.evaluate(() => {
      localStorage.setItem('jurisflow_tour_completed', 'true');
      localStorage.setItem('jurisflow_tour_seen', 'true');
      const tour = document.getElementById('guidedTourBackdrop');
      if (tour) tour.classList.add('hidden');
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await mobilePage.waitForTimeout(400);

    const mobileShotPath = path.join(ARTIFACTS_DIR, 'mobile-dashboard.png');
    await mobilePage.screenshot({ path: mobileShotPath, fullPage: false });
    await mobileContext.close();

    // 7. Testar REGRESSÃO NO TEMA DARK
    console.log('Testing Dark Theme Regression...');
    await page.evaluate(() => {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('jurisflow_theme', 'dark');
      document.querySelector('.nav-item[data-view="dashboard"]')?.click();
    });
    await page.waitForTimeout(300);
    await page.locator('#view-dashboard.active').waitFor();

    const darkBg = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    console.log('Dark theme body bg:', darkBg);
    assert(darkBg.includes('rgb(12, 12, 11)') || darkBg.includes('rgba(0, 0, 0') || darkBg.includes('rgb(18, 18, 18)') || darkBg.includes('rgb(22, 21, 19)'), 'Dark theme background is not dark!');

    console.log('\n===============================================================');
    console.log(`  RESULTADOS DA AUDITORIA VISUAL LIGHT FOUNDATION:`);
    console.log(`  - Ilhas Dark Detectadas: ${allDarkIslands.length}`);
    if (allDarkIslands.length > 0) {
      allDarkIslands.forEach(i => console.log(`    * [${i.view}] <${i.tag} id="${i.id}" class="${i.className}"> bg=${i.background} (${i.width}x${i.height})`));
    }
    console.log(`  - Alertas de Baixo Contraste: ${allContrastWarnings.length}`);
    if (allContrastWarnings.length > 0) {
      allContrastWarnings.slice(0, 15).forEach(c => console.log(`    * [${c.view}] <${c.tag} class="${c.className}"> color=${c.color} text="${c.text}"`));
    }
    console.log('===============================================================\n');

  } finally {
    await browser.close();
  }
} finally {
  await server.stop();
}
