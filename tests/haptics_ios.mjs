import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';
import {
  HAPTICS_PREF_KEY,
  haptic,
  hapticError,
  hapticMedium,
  hapticSelect,
  hapticSuccess,
  isHapticsEnabled,
  isHapticsPrefEnabled,
  isIosTouchDevice,
  resetHapticsForTest,
  setHapticsEnabled
} from '../js/core/haptics.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

console.log('\n===============================================================');
console.log('  ATRIUM — RETORNO TÁTIL (iOS TAPTIC ENGINE + ANDROID)');
console.log('===============================================================\n');

// Contrato estático: sem áudio sintetizado (só Taptic Engine / vibrate).
const source = await readFile(path.join(ROOT, 'js/core/haptics.js'), 'utf8');
assert.doesNotMatch(source, /AudioContext|webkitAudioContext|tick-sound/i, 'Retorno tátil puro: sem áudio sintetizado.');

// ---------------------------------------------------------------------------
// 1. Testes unitários: preferência, reduced-motion, detecção iOS e pulsos.
// ---------------------------------------------------------------------------
function mockWindow({ pref = null, reduced = false } = {}) {
  const store = new Map();
  if (pref !== null) store.set(HAPTICS_PREF_KEY, pref);
  return {
    localStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, val) => store.set(key, String(val)),
      removeItem: key => store.delete(key)
    },
    matchMedia: () => ({ matches: reduced })
  };
}

assert.equal(isHapticsEnabled(undefined), false, 'Sem window, retorno tátil não dispara.');
assert.equal(isHapticsEnabled(mockWindow()), true, 'Ligado por padrão quando preferência não foi alterada.');
assert.equal(isHapticsEnabled(mockWindow({ pref: '0' })), false, 'Desligado quando atrium:haptics=0.');
assert.equal(isHapticsEnabled(mockWindow({ pref: '1', reduced: true })), false, 'Respeita prefers-reduced-motion.');
assert.equal(isHapticsPrefEnabled(mockWindow({ pref: '1', reduced: true })), true);

assert.equal(isIosTouchDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 }), true);
assert.equal(isIosTouchDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 }), true, 'iPadOS reportado como MacIntel com touch.');
assert.equal(isIosTouchDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8)', platform: 'Linux armv8l', maxTouchPoints: 5 }), false);
assert.equal(isIosTouchDevice({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 0 }), false);

const vibrated = [];
const navAndroid = { userAgent: 'Android', vibrate: pattern => vibrated.push(pattern) };
const winOn = mockWindow({ pref: '1' });
resetHapticsForTest();
assert.equal(haptic(8, { win: winOn, nav: navAndroid, force: true }), true);
assert.equal(hapticSelect({ win: winOn, nav: navAndroid, force: true }), true);
assert.equal(hapticMedium({ win: winOn, nav: navAndroid, force: true }), true);
assert.equal(hapticSuccess({ win: winOn, nav: navAndroid }), true);
assert.equal(hapticError({ win: winOn, nav: navAndroid }), true);
assert.deepEqual(vibrated, [8, 6, 12, [10, 55, 14], [18, 45, 18, 45, 22]]);

vibrated.length = 0;
setHapticsEnabled(false, winOn);
assert.equal(isHapticsEnabled(winOn), false);
assert.equal(hapticSuccess({ win: winOn, nav: navAndroid }), false);
assert.deepEqual(vibrated, []);

// Desktop sem navigator.vibrate não dispara fallback iOS nem injeta elementos ocultos.
resetHapticsForTest();
const winDesktop = mockWindow({ pref: '1' });
const navDesktop = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 0 };
assert.equal(haptic(8, { win: winDesktop, nav: navDesktop, force: true }), false);

// iPhone sem navigator.vibrate dispara o switch nativo oculto.
let iosSwitchClicks = 0;
const fakeIosDoc = {
  body: {
    children: [],
    contains(el) { return this.children.includes(el); },
    appendChild(el) { this.children.push(el); return el; }
  },
  getElementById: () => null,
  createElement(tag) {
    const el = {
      tag,
      style: {},
      children: [],
      attrs: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      appendChild(child) { this.children.push(child); return child; },
      click() { iosSwitchClicks += 1; }
    };
    return el;
  }
};
const navIphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 };
resetHapticsForTest();
assert.equal(haptic(8, { win: winDesktop, doc: fakeIosDoc, nav: navIphone, force: true }), true);
assert.equal(iosSwitchClicks, 1, 'iPhone dispara clique no switch oculto do Taptic Engine.');
resetHapticsForTest();

// ---------------------------------------------------------------------------
// 2. Navegador: desktop (zero nós extras + controle discreto em Configurações)
//    e iPhone simulado (overlay de toque direto Safari 26.5+ e desativação limpa).
// ---------------------------------------------------------------------------
const qaDir = path.join(ROOT, 'artifacts', 'haptics-qa');
await mkdir(qaDir, { recursive: true });

const session = await startUiV2Session({ headless: true });
try {
  // Desktop: zero overlays iOS, controle fechado por padrão em Configurações, persistência em localStorage.
  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'light' });

  assert.equal(await page.evaluate(() => document.documentElement.dataset.iosHaptics || ''), '', 'Desktop não ativa modo iOS direto.');
  assert.equal(await page.locator('.ios-haptic-wrap, .ios-haptic-hit').count(), 0, 'Desktop não recebe nós extras de overlay tátil.');

  await switchUiV2View(page, 'configuration');
  const fold = page.locator('#configDevicePrefs');
  assert.equal(await fold.evaluate(el => el.open), false, 'Preferências do aparelho começam recolhidas e discretas.');
  await fold.locator('summary').click();
  assert.equal(await fold.evaluate(el => el.open), true);
  assert.equal(await page.locator('#configHapticsToggle').getAttribute('aria-checked'), 'true', 'Retorno tátil ligado por padrão.');
  assert.equal(await page.locator('#configHapticsTest').isVisible(), true);
  const desktopPlacement = await page.evaluate(() => {
    const foldRect = document.getElementById('configDevicePrefs').getBoundingClientRect();
    const catRect = document.querySelector('#view-configuration .config-catalog').getBoundingClientRect();
    return {
      belowCatalog: foldRect.top >= catRect.bottom - 1,
      alignedWithCatalog: Math.abs(foldRect.left - catRect.left) <= 2,
      width: Math.round(foldRect.width)
    };
  });
  assert.equal(desktopPlacement.belowCatalog, true, 'Desktop: Preferências deste aparelho fica abaixo do catálogo.');
  assert.equal(desktopPlacement.alignedWithCatalog, true, 'Desktop: Preferências deste aparelho alinha com a coluna principal.');
  assert.ok(desktopPlacement.width >= 500, `Desktop: largura adequada (${desktopPlacement.width}px).`);
  await fold.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(qaDir, 'config-device-prefs-desktop-1440-light.png'), fullPage: false });

  await page.locator('#configHapticsTest').click();
  await page.evaluate(() => window.Atrium?.App?.toast?.('Teste tátil confirmado', 'success'));

  await page.locator('#configHapticsToggle').click();
  assert.equal(await page.locator('#configHapticsToggle').getAttribute('aria-checked'), 'false');
  assert.equal(await page.locator('#configHapticsTest').isVisible(), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('atrium:haptics')), '0');

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  await switchUiV2View(page, 'configuration');
  await page.locator('#configDevicePrefs summary').click();
  assert.equal(await page.locator('#configHapticsToggle').getAttribute('aria-checked'), 'false', 'Desligar persiste após recarregar.');
  await page.locator('#configHapticsToggle').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('atrium:haptics')), '1');
  assert.deepEqual(pageErrors, []);
  await desktop.close();

  // iPhone simulado (390x844): overlay de toque direto no dock inferior, switch nos vencimentos e limpeza ao desligar.
  const iphone = await session.createContext({ viewport: { width: 390, height: 844 } });
  await iphone.addInitScript(() => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1';
    Object.defineProperty(navigator, 'userAgent', { get: () => ua, configurable: true });
    Object.defineProperty(navigator, 'platform', { get: () => 'iPhone', configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5, configurable: true });
  });
  const iosRes = await prepareUiV2Page(iphone, session.server.baseUrl, { theme: 'dark' });
  const iosPage = iosRes.page;

  assert.equal(await iosPage.evaluate(() => document.documentElement.dataset.iosHaptics), '1', 'iPhone ativa modo tátil direto.');
  assert.ok(await iosPage.locator('#v2MobileNav .ios-haptic-wrap > input.ios-haptic-hit[type="checkbox"][switch]').count() >= 4, 'Dock inferior recebe overlay switch nativo para Safari 26.5+.');

  const dockGeom = await iosPage.locator('#v2MobileNav').evaluate(nav => {
    const buttons = [...nav.querySelectorAll('button')].filter(b => b.getClientRects().length);
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      undersized: buttons.filter(b => { const r = b.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; }).map(b => b.textContent.trim())
    };
  });
  assert.ok(dockGeom.overflow <= 2, `Overflow dock iPhone: ${dockGeom.overflow}px`);
  assert.deepEqual(dockGeom.undersized, [], `Botões da dock abaixo de 44px: ${dockGeom.undersized.join(', ')}`);

  // Toque no overlay do botão Agenda da dock inferior navega normalmente para Agenda.
  const agendaHit = iosPage.locator('#v2MobileNav .ios-haptic-wrap:has(button[data-view-link="agenda"]) > .ios-haptic-hit');
  await agendaHit.click({ force: true });
  await iosPage.locator('#view-agenda.active').waitFor();

  // Financeiro: checkbox de vencimentos ganha atributo `switch` nativo no iOS.
  await switchUiV2View(iosPage, 'financial');
  await iosPage.evaluate(() => {
    const view = document.getElementById('view-financial');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'financial-upcoming-in';
    cb.id = 'iosHapCheckbox';
    view.appendChild(cb);
  });
  await iosPage.locator('#iosHapCheckbox[switch]').waitFor();
  await iosPage.evaluate(() => document.getElementById('iosHapCheckbox')?.remove());

  // Configurações mobile: posicionado no rodapé abaixo do catálogo, targets >= 44px e desligar/religar limpos.
  await switchUiV2View(iosPage, 'configuration');
  await iosPage.locator('#configurationList > *').first().waitFor();
  await iosPage.locator('#configDevicePrefs summary').click();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await iosPage.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await iosPage.waitForTimeout(150);
  }
  const mobilePlacement = await iosPage.evaluate(() => {
    const foldRect = document.getElementById('configDevicePrefs').getBoundingClientRect();
    const catRect = document.querySelector('#view-configuration .config-catalog').getBoundingClientRect();
    const navEl = document.getElementById('v2MobileNav');
    const navRect = navEl?.getBoundingClientRect();
    const dockReserve = navRect ? navRect.height : 72;
    return {
      belowCatalog: foldRect.top >= catRect.bottom - 1,
      clearOfDock: foldRect.bottom <= window.innerHeight - dockReserve + 1,
      foldTop: Math.round(foldRect.top),
      foldBottom: Math.round(foldRect.bottom),
      dockReserve: Math.round(dockReserve),
      innerHeight: window.innerHeight
    };
  });
  assert.equal(mobilePlacement.belowCatalog, true, `Mobile: Preferências deste aparelho fica no rodapé abaixo do catálogo (${JSON.stringify(mobilePlacement)}).`);
  assert.equal(mobilePlacement.clearOfDock, true, `Mobile: Preferências deste aparelho mantém folga acima da dock inferior (${JSON.stringify(mobilePlacement)}).`);
  await iosPage.screenshot({ path: path.join(qaDir, 'config-device-prefs-mobile-390-dark.png'), fullPage: false });

  const cfgGeom = await iosPage.locator('#configDevicePrefs').evaluate(el => {
    const controls = [...el.querySelectorAll('button')].filter(b => b.getClientRects().length);
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      undersized: controls.filter(b => { const r = b.getBoundingClientRect(); return r.width < 43.5 || r.height < 43.5; }).map(b => b.id || b.textContent.trim())
    };
  });
  assert.ok(cfgGeom.overflow <= 2, `Overflow mobile: ${cfgGeom.overflow}px`);
  assert.deepEqual(cfgGeom.undersized, [], `Botões abaixo de 44px: ${cfgGeom.undersized.join(', ')}`);

  await iosPage.locator('#configDevicePrefs .ios-haptic-wrap:has(#configHapticsToggle) > .ios-haptic-hit').click({ force: true });
  assert.equal(await iosPage.locator('#configHapticsToggle').getAttribute('aria-checked'), 'false');
  assert.equal(await iosPage.evaluate(() => document.documentElement.dataset.iosHaptics || ''), '', 'Desligar desativa data-ios-haptics.');
  assert.equal(await iosPage.locator('.ios-haptic-wrap, .ios-haptic-hit').count(), 0, 'Desligar remove todos os overlays do DOM.');

  // Religar no iPhone reinstala os overlays de toque direto.
  await iosPage.locator('#configHapticsToggle').click();
  assert.equal(await iosPage.locator('#configHapticsToggle').getAttribute('aria-checked'), 'true');
  assert.equal(await iosPage.evaluate(() => document.documentElement.dataset.iosHaptics), '1', 'Religar reativa data-ios-haptics.');
  assert.ok(await iosPage.locator('#v2MobileNav .ios-haptic-hit').count() >= 4, 'Religar reinstala overlays na dock.');
  assert.deepEqual(iosRes.pageErrors, []);
  await iphone.close();

  // iPhone com prefers-reduced-motion: reduce desativa overlays e exibe aviso em Configurações.
  const reducedCtx = await session.createContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await reducedCtx.addInitScript(() => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1';
    Object.defineProperty(navigator, 'userAgent', { get: () => ua, configurable: true });
    Object.defineProperty(navigator, 'platform', { get: () => 'iPhone', configurable: true });
    Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5, configurable: true });
  });
  const reducedRes = await prepareUiV2Page(reducedCtx, session.server.baseUrl, { theme: 'light' });
  assert.equal(await reducedRes.page.evaluate(() => document.documentElement.dataset.iosHaptics || ''), '', 'Reduced motion mantém modo iOS direto desativado.');
  assert.equal(await reducedRes.page.locator('.ios-haptic-wrap, .ios-haptic-hit').count(), 0, 'Reduced motion não instala overlays.');
  await switchUiV2View(reducedRes.page, 'configuration');
  await reducedRes.page.locator('#configDevicePrefs summary').click();
  assert.equal(await reducedRes.page.locator('#configHapticsReducedNote').isVisible(), true, 'Aviso de movimento reduzido fica visível.');
  assert.deepEqual(reducedRes.pageErrors, []);
  await reducedCtx.close();

  console.log('✓ Retorno tátil iOS/Android aprovado: Taptic Engine, overlay Safari 26.5+, controle discreto em Configurações, reduced-motion e limpeza ao desativar.');
} finally {
  await session.stop();
}
