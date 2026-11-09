import assert from 'node:assert/strict';
import { webkit } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

let browser;
try {
  browser = await webkit.launch({ headless: true });
} catch (error) {
  console.log(`[skip] WebKit indisponível neste ambiente (${String(error.message).split('\n')[0]}). Rode: npx playwright install webkit`);
  process.exit(0);
}

const server = await startTestServer();
const password = 'Senha-WebKit-Safe-2026!';
try {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, { username: `admin_webkit_${Date.now()}`, displayName: 'Advogada WebKit', password });
  const setup = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  const [name, value] = cookie.split('=');

  for (const viewport of [{ width: 390, height: 844 }, { width: 393, height: 852 }, { width: 430, height: 932 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, locale: 'pt-BR', deviceScaleFactor: 1 });
    await context.addCookies([{ name, value, domain: '127.0.0.1', path: '/' }]);
    await context.addInitScript(({ theme }) => {
      localStorage.setItem('atrium:ui:mode', 'v2');
      localStorage.setItem('atrium_theme', theme);
      localStorage.setItem('atrium_tour_seen', 'true');
      localStorage.setItem('jurisflow_tour_seen', 'true');
    }, { theme: 'dark' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
    await page.locator('#appShell:not(.hidden)').waitFor();
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--atrium-safe-top', '47px');
      document.documentElement.style.setProperty('--atrium-safe-bottom', '34px');
    });

    const measure = () => page.evaluate(() => {
      const topbar = document.querySelector('.topbar');
      const nav = document.getElementById('v2MobileNav');
      const cs = getComputedStyle(topbar);
      const navStyle = getComputedStyle(nav);
      const rect = topbar.getBoundingClientRect();
      const navRect = nav.getBoundingClientRect();
      const hit = document.elementFromPoint(Math.round(innerWidth / 2), Math.max(8, rect.top + 4));
      const bottomHit = document.elementFromPoint(Math.round(innerWidth / 2), innerHeight - 4);
      const match = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
      const parts = match ? match[1].split(',').map(Number) : [];
      const navColor = navStyle.backgroundColor.match(/rgba?\(([^)]+)\)/);
      const navParts = navColor ? navColor[1].split(',').map(Number) : [];
      return {
        paddingTop: Math.round(parseFloat(cs.paddingTop)),
        topbarTop: Math.round(rect.top),
        transform: cs.transform,
        opaque: (parts.length === 4 ? parts[3] : 1) >= 0.999,
        hitInsideTopbar: Boolean(hit && topbar.contains(hit)),
        navBottom: Math.round(navRect.bottom),
        chrome: document.documentElement.dataset.v2MobileChrome,
        navInert: nav.inert,
        navVisibility: navStyle.visibility,
        navPaddingBottom: Math.round(parseFloat(navStyle.paddingBottom)),
        navPosition: navStyle.position,
        navOpaque: (navParts.length === 4 ? navParts[3] : 1) >= 0.999,
        hitInsideNav: Boolean(bottomHit && nav.contains(bottomHit)),
        buttonsAboveInset: [...nav.querySelectorAll('button')].every(button => button.getBoundingClientRect().bottom <= innerHeight - 34),
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        scrollY: document.body.scrollTop,
        windowScroll: window.scrollY,
        bodyOverflow: getComputedStyle(document.body).overflowY
      };
    });

    const check = (state, label) => {
      assert.ok(state.paddingTop >= 47, `${viewport.width}px ${label}: topbar reserva a safe-area (${state.paddingTop}px).`);
      assert.equal(state.bodyOverflow, 'auto', `${viewport.width}px ${label}: body mantém o scroll.`);
      assert.equal(state.windowScroll, 0, `${viewport.width}px ${label}: a janela permanece estável.`);
      if (label.startsWith('scroll-')) assert.ok(state.scrollY > 0, `${viewport.width}px ${label}: o body rolou.`);
      assert.ok(state.topbarTop <= 1, `${viewport.width}px ${label}: topbar sticky no topo do WebKit (${state.topbarTop}px).`);
      assert.equal(state.transform, 'none', `${viewport.width}px ${label}: sem transform no topbar (causa de lag no WebKit).`);
      assert.equal(state.opaque, true, `${viewport.width}px ${label}: topbar opaco.`);
      assert.equal(state.hitInsideTopbar, true, `${viewport.width}px ${label}: nenhum conteúdo atrás da status bar.`);
      assert.equal(state.navPosition, 'fixed', `${viewport.width}px ${label}: a navegação inferior mantém sua posição.`);
      if (state.chrome === 'reading') {
        assert.equal(state.navInert, true, `${viewport.width}px ${label}: navegação recolhida não recebe foco.`);
        assert.equal(state.navVisibility, 'hidden', `${viewport.width}px ${label}: navegação recolhida não é visível.`);
        assert.ok(state.navBottom >= viewport.height - 1, `${viewport.width}px ${label}: navegação sai pelo rodapé (${state.navBottom}px).`);
        assert.equal(state.hitInsideNav, false, `${viewport.width}px ${label}: navegação recolhida não intercepta o toque.`);
      } else {
        assert.ok(Math.abs(state.navBottom - viewport.height) <= 1, `${viewport.width}px ${label}: a navegação inferior encosta na borda visível (${state.navBottom}px).`);
        assert.equal(state.hitInsideNav, true, `${viewport.width}px ${label}: nenhum conteúdo aparece atrás da navegação inferior.`);
        assert.equal(state.buttonsAboveInset, true, `${viewport.width}px ${label}: botões ficam acima do indicador inferior.`);
      }
      assert.ok(state.navPaddingBottom >= 34, `${viewport.width}px ${label}: a navegação preserva o inset inferior (${state.navPaddingBottom}px).`);
      assert.equal(state.navOpaque, true, `${viewport.width}px ${label}: a navegação inferior precisa de fundo opaco.`);
      assert.ok(state.overflow <= 1, `${viewport.width}px ${label}: sem overflow horizontal (${state.overflow}px).`);
    };

    for (const [label, y] of [['topo', 0], ['scroll-medio', 500], ['scroll-fundo', 4000]]) {
      await page.evaluate(value => document.body.scrollTo(0, value), y);
      await page.waitForFunction(expected => document.documentElement.dataset.v2MobileChrome === expected, label === 'topo' ? 'expanded' : 'reading');
      await page.waitForFunction(() => getComputedStyle(document.getElementById('v2MobileNav')).visibility !== 'visible' || document.documentElement.dataset.v2MobileChrome === 'expanded');
      check(await measure(), label);
    }
    // scroll rápido (fundo -> topo) seguido de overscroll/bounce para cima.
    await page.evaluate(() => document.body.scrollTo(0, 3500));
    await page.evaluate(() => document.body.scrollTo(0, 0));
    await page.mouse.move(Math.round(viewport.width / 2), Math.round(viewport.height / 2));
    await page.mouse.wheel(0, -600);
    await page.waitForFunction(() => document.documentElement.dataset.v2MobileChrome === 'expanded' && getComputedStyle(document.getElementById('v2MobileNav')).transform === 'none');
    check(await measure(), 'overscroll-bounce');

    assert.deepEqual(errors, [], `WebKit ${viewport.width}px gerou pageerror.`);
    await context.close();
  }
  console.log('WebKit: topbar opaco e sticky em scroll, scroll rápido e overscroll (retrato e paisagem); o navegador físico ainda exige validação.');
} finally {
  await browser.close();
  await server.stop();
}
