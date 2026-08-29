import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startTestServer, postJson } from './helpers.mjs';
import { generateTotp } from '../lib/security.mjs';
import { isoDate } from '../js/core/store.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ARTIFACTS_DIR = path.join(ROOT, 'artifacts', 'light-publications');

console.log('\n===============================================================');
console.log('  ATRIUM — TESTE VISUAL: MÓDULO PUBLICAÇÕES (LIGHT THEME)');
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

  // 2. Popular estado com intimações ricas
  res = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: adminCookie } });
  const stateEnv = await res.json();
  const state = stateEnv.state || {};
  const todayStr = isoDate();

  state.processes = [
    {
      id: 'proc-1',
      number: '0000001-11.2026.4.04.0001',
      client: 'Cliente Alfa Visual',
      opposingParty: 'INSS - Instituto Nacional do Seguro Social',
      court: 'TRF4',
      action: 'Ação Previdenciária',
      status: 'em_andamento'
    },
    {
      id: 'proc-2',
      number: '5014890-12.2023.4.04.7100',
      client: 'Cliente Beta Visual',
      opposingParty: 'União Federal',
      court: 'JFRS',
      action: 'Revisão da Vida Toda',
      status: 'sentenca'
    }
  ];

  state.intimations = [
    {
      id: 'pub-urgent-1',
      title: 'Intimação Urgente: Prazo Peremptório para Contrarrazões',
      process: '0000001-11.2026.4.04.0001',
      client: 'Cliente Alfa Visual',
      court: 'Tribunal Regional Federal da 4ª Região',
      publishedAt: todayStr,
      source: 'DJEN Oficial - Edição 1420',
      text: 'FIXTURE JUDICIAL SINTÉTICA\nTRIBUNAL DE TESTE\n\nProcesso nº 0000001-11.2026.4.04.0001\nPARTE: CLIENTE ALFA VISUAL\n\nCOMUNICAÇÃO PROCESSUAL SINTÉTICA PARA TESTE DE LAYOUT.\n\nSem inferência automática de prazo.',
      status: 'nova',
      urgent: true,
      priority: 'urgente',
      unread: true
    },
    {
      id: 'pub-important-2',
      title: 'Despacho Importante: Designação de Perícia Médica Presencial',
      process: '5014890-12.2023.4.04.7100',
      client: 'Cliente Beta Visual',
      court: 'Justiça Federal de Primeiro Grau - RS',
      publishedAt: todayStr,
      source: 'DJEN Oficial - Edição 1420',
      text: 'JUSTIÇA FEDERAL DA 4ª REGIÃO\nSubseção Judiciária de Porto Alegre - 2ª Vara Federal\n\nProcesso nº 5014890-12.2023.4.04.7100\n\n1. Designo perícia médica presencial para o dia 15/09/2026, às 14:00h, na sala pericial nº 3.\n2. Intimem-se as partes para apresentação de quesitos e indicação de assistente técnico no prazo de 5 (cinco) dias.\n\nIntime-se.',
      status: 'triagem',
      important: true,
      unread: true
    },
    {
      id: 'pub-read-3',
      title: 'Nota de Expediente: Juntada de Laudo Pericial Conclusivo',
      process: '0000001-11.2026.4.04.0001',
      client: 'Cliente Alfa Visual',
      court: 'TRF4',
      publishedAt: '2026-08-25',
      source: 'DJEN Oficial',
      text: 'Ficam as partes intimadas da juntada do laudo pericial contábil aos autos, facultando-se manifestação sucessiva no prazo de 15 dias.',
      status: 'prazo',
      urgent: false,
      important: false,
      unread: false
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

    // Ativar TEMA CLARO e fechar tour
    await page.evaluate(() => {
      localStorage.setItem('jurisflow_tour_completed', 'true');
      localStorage.setItem('jurisflow_tour_seen', 'true');
      const tour = document.getElementById('guidedTourBackdrop');
      if (tour) tour.classList.add('hidden');
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('jurisflow_theme', 'light');
    });
    await page.waitForTimeout(300);

    // Navegar para Publicações (#view-inbox)
    console.log('Navegando para Publicações...');
    await page.evaluate(() => {
      document.querySelector('.nav-item[data-view="inbox"]')?.click();
    });
    await page.locator('#view-inbox.active').waitFor();
    await page.waitForTimeout(400);

    // Função de auditoria visual de superfícies e contrastes
    async function auditSection(sectionSelector, testName) {
      return await page.evaluate(({ sel, tName }) => {
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

        const root = document.querySelector(sel) || document.body;
        const elements = Array.from(root.querySelectorAll('*'));
        for (const el of elements) {
          const rect = el.getBoundingClientRect();
          if (rect.width < 12 || rect.height < 12) continue;
          if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) continue;

          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

          // Checar Background escuro indesejado
          const bg = parseRgb(style.backgroundColor);
          if (bg && isDarkColor(bg)) {
            const className = typeof el.className === 'string' ? el.className : '';
            const isModalBackdrop = className.includes('modal-backdrop');
            const isGoldButton = className.includes('button') && className.includes('gold');
            if (!isModalBackdrop && !isGoldButton) {
              darkIslands.push({
                test: tName,
                tag: el.tagName.toLowerCase(),
                className,
                bg: style.backgroundColor,
                size: `${Math.round(rect.width)}x${Math.round(rect.height)}`
              });
            }
          }

          // Checar Contraste texto claro sobre fundo claro
          const fg = parseRgb(style.color);
          if (fg && el.textContent && el.textContent.trim().length > 0 && el.children.length === 0) {
            const fgLum = getLuminance(fg);
            if (fgLum > 0.78) {
              const className = typeof el.className === 'string' ? el.className : '';
              const isGoldBtn = el.closest('.button.gold');
              if (!isGoldBtn) {
                contrastWarnings.push({
                  test: tName,
                  tag: el.tagName.toLowerCase(),
                  className,
                  text: el.textContent.trim().slice(0, 30),
                  color: style.color,
                  fgLum: Math.round(fgLum * 100) / 100
                });
              }
            }
          }
        }

        return { darkIslands, contrastWarnings };
      }, { sel: sectionSelector, tName: testName });
    }

    const allDarkIslands = [];
    const allContrastWarnings = [];

    // [1] Screenshot 1: Listagem Geral
    console.log('Validando Listagem Geral de Publicações...');
    let audit = await auditSection('#view-inbox', 'Publications List');
    allDarkIslands.push(...audit.darkIslands);
    allContrastWarnings.push(...audit.contrastWarnings);

    let shotPath = path.join(ARTIFACTS_DIR, 'publications-list.png');
    await page.screenshot({ path: shotPath, fullPage: false });

    // [2] Screenshot 2: Publicação Não Lida
    console.log('Validando Publicação Não Lida...');
    shotPath = path.join(ARTIFACTS_DIR, 'publication-unread.png');
    await page.screenshot({ path: shotPath, fullPage: false });

    // [3] Screenshot 3: Publicação Urgente Selecionada
    console.log('Selecionando publicação urgente...');
    await page.locator('.inbox-row[data-intimation-id="pub-urgent-1"]').click();
    await page.locator('#intimationDetail .detail-header').waitFor();
    await page.waitForTimeout(300);

    audit = await auditSection('#intimationDetail', 'Publication Urgent Detail');
    allDarkIslands.push(...audit.darkIslands);
    allContrastWarnings.push(...audit.contrastWarnings);

    shotPath = path.join(ARTIFACTS_DIR, 'publication-urgent.png');
    await page.screenshot({ path: shotPath, fullPage: false });

    // [4] Screenshot 4: Painel de Detalhe Completo (Publicação Importante)
    console.log('Validando Painel de Detalhe e Original Text (Publicação com Destaque)...');
    await page.locator('.inbox-row[data-intimation-id="pub-important-2"]').click();
    await page.locator('#intimationDetail .detail-header').waitFor();
    await page.waitForTimeout(300);

    audit = await auditSection('#intimationDetail', 'Publication Important Detail');
    allDarkIslands.push(...audit.darkIslands);
    allContrastWarnings.push(...audit.contrastWarnings);

    shotPath = path.join(ARTIFACTS_DIR, 'publication-detail.png');
    await page.screenshot({ path: shotPath, fullPage: false });

    // [5] Screenshot 5: Modal de Enviar por E-mail
    console.log('Abrindo Modal de Enviar Publicação por E-mail...');
    const btnSendEmail = page.locator('#btnSendIntimationEmail');
    if (await btnSendEmail.isVisible()) {
      await btnSendEmail.click();
      const emailModal = page.locator('#publicationEmailBackdrop');
      await emailModal.waitFor({ state: 'visible' });
      await page.waitForTimeout(300);

      audit = await auditSection('#publicationEmailBackdrop', 'Publication Email Modal');
      allDarkIslands.push(...audit.darkIslands);
      allContrastWarnings.push(...audit.contrastWarnings);

      shotPath = path.join(ARTIFACTS_DIR, 'publication-email-modal.png');
      await page.screenshot({ path: shotPath, fullPage: false });

      await page.locator('#publicationEmailClose').click();
      await emailModal.waitFor({ state: 'hidden' });
    }

    // [6] Screenshot 6: Visualização Mobile (390x844)
    console.log('Validando Mobile Viewport (390x844)...');
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
      document.querySelector('.nav-item[data-view="inbox"]')?.click();
    });
    await mobilePage.waitForTimeout(400);

    shotPath = path.join(ARTIFACTS_DIR, 'publications-mobile.png');
    await mobilePage.screenshot({ path: shotPath, fullPage: false });
    await mobileContext.close();

    // [7] Regressão Dark Theme
    console.log('Testando Regressão do Módulo Publicações no Tema Escuro...');
    await page.evaluate(() => {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('jurisflow_theme', 'dark');
      document.querySelector('.nav-item[data-view="inbox"]')?.click();
    });
    await page.waitForTimeout(300);

    const darkDetailBg = await page.evaluate(() => {
      const el = document.getElementById('intimationDetail');
      return el ? window.getComputedStyle(el).backgroundColor : '';
    });
    console.log('Dark theme intimation detail bg:', darkDetailBg);

    console.log('\n===============================================================');
    console.log(`  RESULTADOS DA AUDITORIA VISUAL DO MÓDULO PUBLICAÇÕES:`);
    console.log(`  - Ilhas Dark Detectadas: ${allDarkIslands.length}`);
    if (allDarkIslands.length > 0) {
      allDarkIslands.forEach(i => console.log(`    * [${i.test}] <${i.tag} class="${i.className}"> bg=${i.bg} size=${i.size}`));
    }
    console.log(`  - Alertas de Baixo Contraste: ${allContrastWarnings.length}`);
    if (allContrastWarnings.length > 0) {
      allContrastWarnings.forEach(c => console.log(`    * [${c.test}] <${c.tag} class="${c.className}"> color=${c.color} text="${c.text}" (lum=${c.fgLum})`));
    }
    console.log('===============================================================\n');

    assert.equal(allDarkIslands.length, 0, `Foram detectadas ${allDarkIslands.length} superfícies escuras no módulo Publicações!`);
    assert.equal(allContrastWarnings.length, 0, `Foram detectados ${allContrastWarnings.length} textos de baixo contraste no módulo Publicações!`);

  } finally {
    await browser.close();
  }
} finally {
  await server.stop();
}
