import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startTestServer, postJson } from './helpers.mjs';
import { generateTotp } from '../lib/security.mjs';

const args = process.argv.slice(2);
const shotsIdx = args.indexOf('--shots');
const shotsDir = shotsIdx !== -1 ? path.resolve(args[shotsIdx + 1] || 'artifacts/ios-qa') : null;
const themeIdx = args.indexOf('--theme');
const theme = themeIdx !== -1 && args[themeIdx + 1] === 'dark' ? 'dark' : 'light';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1';

console.log('\n===============================================================');
console.log(`  ATRIUM — SIMULAÇÃO COMPLETA DE IPHONE SAFARI 26.5+ (${theme})  `);
console.log('===============================================================\n');

if (shotsDir) await fs.mkdir(shotsDir, { recursive: true });

const server = await startTestServer({ env: { JEV_CMD_BIN: process.execPath, ATRIUM_SENDA_UNLOCK_PRO_DEV: '1' } });
const browser = await chromium.launch({ headless: true });

try {
  const r1 = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'iphone.sim',
    displayName: 'Dra. Camila iOS',
    password: 'Iphone-Sim-Atrium-2026!'
  });
  const d1 = await r1.json();
  const r2 = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: d1.setupToken,
    code: generateTotp(d1.manualSecret)
  });
  const cookie = r2.headers.get('set-cookie').split(';')[0];
  const verifyData = await r2.json();
  const headers = { Cookie: cookie, 'X-CSRF-Token': verifyData.csrfToken };

  const stRes = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookie } });
  const stData = await stRes.json();
  const state = stData.state || {};
  const today = new Date().toISOString().slice(0, 10);
  state.settings = { ...(state.settings || {}), officeName: 'Keller & Associados Sintético', aiClassifier: { enabled: true } };
  state.contacts = [
    { id: 'c-1', name: 'Carlos Sintético', contactRole: 'cliente', document: '123.456.789-00', phone: '(51) 99999-1111', email: 'carlos@exemplo.test' },
    { id: 'c-2', name: 'Maria Lead Sintética', contactRole: 'lead', phone: '(51) 98888-2222', email: 'maria@exemplo.test' }
  ];
  state.processes = [
    { id: 'p-1', number: '5009876-54.2026.8.21.0001', client: 'Carlos Sintético', contactId: 'c-1', opposingParty: 'Banco Exemplo S/A', court: '3ª Vara Cível', actionType: 'Ação Revisional', judicialPhase: 'Instrução', status: 'Ativo', lastMovement: 'Intimação para réplica' }
  ];
  state.leads = [
    { id: 'l-1', client: 'Maria Lead Sintética', contactId: 'c-2', area: 'Cível', stage: 'novo', origin: 'Indicação', estimatedValue: 8500, notes: 'Consulta inicial sobre contrato bancário.' }
  ];
  state.intimations = [
    { id: 'pub-1', title: 'Despacho — Vista para réplica', process: '5009876-54.2026.8.21.0001', client: 'Carlos Sintético', court: 'TJRS · 3ª Vara Cível', source: 'eproc', publishedAt: today, treatmentStatus: 'untreated', unread: true, urgent: true, text: 'Intime-se a parte autora para réplica em 15 dias.' },
    { id: 'pub-2', title: 'Certidão cartorária — Remessa', process: '5009876-54.2026.8.21.0001', client: 'Carlos Sintético', court: 'TJRS', source: 'DJEN', publishedAt: today, treatmentStatus: 'in_review', unread: false, text: 'Remessa ao contador.' },
    ...Array.from({ length: 10 }, (_, idx) => ({
      id: `pub-scroll-${idx + 1}`,
      title: `Intimação sintética de rolagem #${idx + 1}`,
      process: '5009876-54.2026.8.21.0001',
      client: 'Carlos Sintético',
      court: 'TJRS · 3ª Vara Cível',
      source: 'DJEN',
      publishedAt: today,
      treatmentStatus: 'untreated',
      unread: true,
      text: 'Intimação sintética para validar rolagem da página e recolhimento da dock inferior no iPhone.'
    }))
  ];
  state.tasks = [
    { id: 't-1', title: 'Manifestação nos Autos: 5009876-54.2026.8.21.0001', process: '5009876-54.2026.8.21.0001', processId: 'p-1', client: 'Carlos Sintético', status: 'triagem', priority: 'urgente', points: 15, responsible: 'Dra. Camila iOS', deadline: today, description: 'Conferir preliminares e especificar provas.' },
    { id: 't-2', title: 'Revisar cálculos iniciais', process: '5009876-54.2026.8.21.0001', processId: 'p-1', client: 'Carlos Sintético', status: 'andamento', priority: 'normal', points: 10, responsible: 'Dra. Camila iOS', deadline: today, description: 'Validar memória de cálculo.' }
  ];
  state.appointments = [
    { id: 'a-1', title: 'Audiência de Conciliação', date: today, time: '14:30', type: 'audiencia', process: '5009876-54.2026.8.21.0001', client: 'Carlos Sintético', location: 'Foro Central' }
  ];
  state.financial = [
    { id: 'f-1', type: 'receita', kind: 'honorarios', description: 'Honorários iniciais — Carlos Sintético', amount: 4500, status: 'pago', date: today, dueDate: today, client: 'Carlos Sintético', process: '5009876-54.2026.8.21.0001' },
    { id: 'f-2', type: 'despesa', kind: 'custas', description: 'Custas processuais TJRS', amount: 420, status: 'pendente', date: today, dueDate: today, client: 'Carlos Sintético' }
  ];
  state.officeExpenses = [
    { id: 'oe-1', description: 'Aluguel do escritório', amount: 3200, status: 'pendente', date: today, category: 'Estrutura' }
  ];
  await postJson(`${server.baseUrl}/api/state`, { state, revision: stData.revision }, headers);

  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    userAgent: IPHONE_UA
  });
  const sep = cookie.indexOf('=');
  await ctx.addCookies([{ name: cookie.slice(0, sep), value: cookie.slice(sep + 1), url: server.baseUrl }]);
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await page.addInitScript(({ ua, selectedTheme }) => {
    Object.defineProperty(navigator, 'userAgent', { get: () => ua, configurable: true });
    Object.defineProperty(navigator, 'platform', { get: () => 'iPhone', configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5, configurable: true });
    localStorage.setItem('jurisflow_tour_completed', 'true');
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('atrium_tour_seen', 'true');
    localStorage.setItem('atrium-theme', selectedTheme);
    localStorage.setItem('theme', selectedTheme);
  }, { ua: IPHONE_UA, selectedTheme: theme });

  await page.route('**/api/ai-classifier/status', r => r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, enabled: true, planIncluded: true, available: true, reason: 'operacional' })
  }));

  await page.goto(`${server.baseUrl}/index.html`, { waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor({ timeout: 15000 });
  await page.evaluate(selectedTheme => {
    document.documentElement.setAttribute('data-theme', selectedTheme);
    document.documentElement.classList.toggle('dark', selectedTheme === 'dark');
  }, theme);

  assert.equal(await page.evaluate(() => document.documentElement.dataset.iosHaptics), '1', 'Modo tátil iOS deve estar ativo na simulação de iPhone.');

  async function verifyScreen(label) {
    await page.waitForTimeout(320);
    const result = await page.evaluate(() => {
      const vw = window.innerWidth;
      const issues = [];
      const docOverflow = document.documentElement.scrollWidth - vw;
      if (docOverflow > 1) issues.push(`overflow horizontal do documento (${docOverflow}px)`);

      const topSels = ['#notificationButton', '#themeToggleButton', '#syncButton', '.v2-utilities-menu > summary', '#quickAddButton'];
      const topRects = topSels.map(s => document.querySelector(s)?.getBoundingClientRect()).filter(r => r && r.height > 0);
      if (topRects.length === 5) {
        const ws = topRects.map(r => Math.round(r.width));
        if (Math.max(...ws) - Math.min(...ws) > 4 || Math.min(...ws) < 54) {
          issues.push(`topbar linha 2 desigual (${ws.join(',')})`);
        }
        if (new Set(topRects.map(r => Math.round(r.top))).size > 1) {
          issues.push('topbar linha 2 quebrou em múltiplas linhas');
        }
      }

      const navBtns = [...document.querySelectorAll('#v2MobileNav button')].filter(b => b.getClientRects().length);
      if (navBtns.length >= 5) {
        const tops = new Set(navBtns.map(b => Math.round(b.getBoundingClientRect().top)));
        if (tops.size > 1) issues.push(`#v2MobileNav quebrou em ${tops.size} linhas`);
        const navWs = navBtns.map(b => Math.round(b.getBoundingClientRect().width));
        if (Math.max(...navWs) - Math.min(...navWs) > 4) issues.push(`#v2MobileNav larguras desiguais (${navWs.join(',')})`);
        const dockTh = document.querySelector('#v2MobileNav > .u416-th');
        if (dockTh && getComputedStyle(dockTh).position !== 'absolute') {
          issues.push(`#v2MobileNav .u416-th fora de position:absolute (${getComputedStyle(dockTh).position})`);
        }
      }

      const activeView = document.querySelector('#appMain > .view.active');
      if (activeView) {
        for (const th of activeView.querySelectorAll('.u416-th')) {
          const cs = getComputedStyle(th);
          if (cs.display !== 'none' && cs.position !== 'absolute') {
            issues.push(`.u416-th estático em ${th.parentElement?.id || th.parentElement?.className}`);
          }
        }
        for (const wrap of activeView.querySelectorAll('.ios-haptic-wrap')) {
          const wr = wrap.getBoundingClientRect();
          if (wr.width === 0 || wr.height === 0) continue;
          const btn = wrap.querySelector(':scope > button, :scope > a');
          const br = btn?.getBoundingClientRect();
          if (br && (br.width < 32 || br.height < 32)) {
            issues.push(`.ios-haptic-wrap comprimiu botão (${Math.round(br.width)}x${Math.round(br.height)})`);
          }
          if (br && Math.abs(wr.width - br.width) > 4) {
            issues.push(`.ios-haptic-wrap divergente do botão (wrap=${Math.round(wr.width)}, btn=${Math.round(br.width)})`);
          }
          if (wr.right > vw + 2) {
            issues.push(`.ios-haptic-wrap cortado à direita (${Math.round(wr.right)}>${vw})`);
          }
        }
        for (const sel of activeView.querySelectorAll('select')) {
          const sr = sel.getBoundingClientRect();
          if (sr.width === 0 || sr.height === 0) continue;
          const cs = getComputedStyle(sel);
          if (sr.height < 42) issues.push(`select abaixo de 44px (${sel.id || sel.className}: ${Math.round(sr.height)}px)`);
          if (parseFloat(cs.paddingTop) === 0 && parseFloat(cs.paddingBottom) === 0) {
            issues.push(`select sem padding vertical simétrico (${sel.id || sel.className})`);
          }
        }
      }
      return issues;
    });

    if (shotsDir) {
      await page.screenshot({ path: path.join(shotsDir, `${label}-${theme}.png`), fullPage: false });
    }
    assert.deepEqual(result, [], `Falha na simulação iPhone (${label}): ${result.join('; ')}`);
    console.log(`  [PASS] ${label}`);
  }

  const views = [
    'dashboard', 'inbox', 'kanban', 'processes', 'contacts', 'leads', 'agenda',
    'financial', 'calculations', 'documents', 'assistant', 'prompts',
    'integrations', 'monitoring', 'importer', 'reports', 'configuration', 'audit', 'links'
  ];

  for (const v of views) {
    await page.evaluate(view => { window.scrollTo(0, 0); window.portalApp?.switchView?.(view); }, v);
    await verifyScreen(`view-${v}`);
    if (v === 'inbox') {
      const toggle = page.locator('#inboxFiltersToggle');
      if (await toggle.isVisible().catch(() => false)) {
        await toggle.click({ force: true });
        await verifyScreen('view-inbox-expanded');
        await toggle.click({ force: true });
      }
    }
    if (v === 'financial') {
      const tabs = page.locator('#view-financial .financial-view-switch button');
      const count = await tabs.count();
      if (count >= 2) {
        await tabs.nth(1).click({ force: true });
        await verifyScreen('view-financial-tab2');
      }
      if (count >= 3) {
        await tabs.nth(2).click({ force: true });
        await verifyScreen('view-financial-tab3');
      }
    }
  }

  // Regressão iPhone: tocar em Publicações via overlay tátil (.ios-haptic-hit) na dock e rolar para baixo
  // deve recolher #v2MobileNav (data-v2-mobile-chrome="reading") sem ficar preso por foco no <input switch>.
  await page.evaluate(() => { window.scrollTo(0, 0); window.portalApp?.switchView?.('dashboard'); });
  await page.waitForTimeout(200);
  await page.locator('#v2MobileNav .ios-haptic-wrap:has(button[data-view-link="inbox"]) > .ios-haptic-hit').click({ force: true });
  await page.locator('#view-inbox.active').waitFor();
  await page.waitForTimeout(250);
  await page.evaluate(() => window.scrollTo({ top: 380, behavior: 'instant' }));
  await page.waitForFunction(() => document.documentElement.dataset.v2MobileChrome === 'reading'
    && document.getElementById('v2MobileNav')?.classList.contains('is-hidden'), null, { timeout: 3000 });
  if (shotsDir) {
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(shotsDir, `view-inbox-scrolled-reading-${theme}.png`), fullPage: false });
  }
  // Regressão iPhone Safari: resize apenas de altura (pílula do Safari encolhendo) + micro-recuo (-16px)
  // durante a descida NÃO podem reabrir as barras por 1 frame.
  const noFlicker = await page.evaluate(async () => {
    window.dispatchEvent(new Event('resize'));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const afterResize = document.documentElement.dataset.v2MobileChrome;
    window.scrollTo({ top: Math.max(40, window.scrollY - 16), behavior: 'instant' });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      afterResize,
      afterMicroRecoil: document.documentElement.dataset.v2MobileChrome,
      navHidden: document.getElementById('v2MobileNav')?.classList.contains('is-hidden')
    };
  });
  assert.equal(noFlicker.afterResize, 'reading', `Resize só de altura no iOS reabriu chrome: ${JSON.stringify(noFlicker)}`);
  assert.equal(noFlicker.afterMicroRecoil, 'reading', `Micro-recuo de -16px no iOS reabriu chrome: ${JSON.stringify(noFlicker)}`);
  assert.equal(noFlicker.navHidden, true, `Dock reapareceu após resize/micro-recuo: ${JSON.stringify(noFlicker)}`);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForFunction(() => document.documentElement.dataset.v2MobileChrome === 'expanded'
    && getComputedStyle(document.getElementById('v2MobileNav')).transform === 'none', null, { timeout: 3000 });
  console.log('  [PASS] view-inbox-scroll-collapse-ios');

  // Regressão iPhone Safari 26+: com safe-area inferior ativa (34px), os botões da dock
  // ficam compactos próximos à pílula de endereço (20..26px da borda) e ainda acima do indicador.
  const dockSafeClearance = await page.evaluate(() => {
    document.documentElement.style.setProperty('--atrium-safe-bottom', '34px');
    const buttons = [...document.querySelectorAll('#v2MobileNav button')].filter(b => b.getClientRects().length);
    const clearances = buttons.map(b => Math.round(innerHeight - b.getBoundingClientRect().bottom));
    document.documentElement.style.removeProperty('--atrium-safe-bottom');
    return { min: Math.min(...clearances), max: Math.max(...clearances) };
  });
  assert.ok(dockSafeClearance.min >= 20 && dockSafeClearance.max <= 26, `Folga inferior da dock iOS fora da faixa compacta: ${JSON.stringify(dockSafeClearance)}`);
  console.log(`  [PASS] dock-bottom-proximity-ios (${dockSafeClearance.min}px)`);

  await page.evaluate(() => { window.scrollTo(0, 0); window.portalApp?.switchView?.('dashboard'); });
  await page.waitForTimeout(200);
  await page.locator('#menuToggle').click({ force: true });
  await verifyScreen('overlay-sidebar');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.locator('#quickAddButton').click({ force: true });
  await verifyScreen('overlay-quickadd');
  await page.keyboard.press('Escape');

  assert.deepEqual(pageErrors, [], `Erros JS na simulação iPhone: ${pageErrors.join('; ')}`);
  await ctx.close();
  console.log('\n✓ Simulação completa de iPhone Safari 26.5+ aprovada em todas as 19 telas + overlays.\n');
} finally {
  await browser.close();
  await server.stop();
}
process.exit(0);
