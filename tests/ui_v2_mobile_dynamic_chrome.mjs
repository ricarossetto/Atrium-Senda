import assert from 'node:assert/strict';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const session = await startUiV2Session();
const results = [];
const check = (condition, message) => { assert.ok(condition, message); results.push(message); };

try {
  for (const { width, height, theme, reducedMotion } of [
    { width: 375, height: 812, theme: 'light', reducedMotion: 'no-preference' },
    { width: 430, height: 932, theme: 'dark', reducedMotion: 'reduce' }
  ]) {
    const context = await session.createContext({ viewport: { width, height }, reducedMotion });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
      const state = () => page.evaluate(() => {
        const header = document.querySelector('.topbar');
        const actions = document.querySelector('.topbar-actions');
        const nav = document.getElementById('v2MobileNav');
        const box = element => element.getBoundingClientRect();
        return {
          chrome: document.documentElement.dataset.v2MobileChrome,
          scrollTop: document.body.scrollTop,
          windowScroll: window.scrollY,
          headerHeight: box(header).height,
          headerTop: box(header).top,
          structuralVisible: ['#menuToggle', '#viewTitle', '.v2-topbar-brand'].every(selector => {
            const element = document.querySelector(selector);
            return box(element).height > 0 && getComputedStyle(element).visibility === 'visible';
          }),
          actionsHeight: box(actions).height,
          searchVisible: box(document.getElementById('globalSearch')).height > 0 && getComputedStyle(actions).visibility === 'visible',
          utilitiesVisible: box(document.getElementById('notificationButton')).height > 0 && getComputedStyle(actions).visibility === 'visible',
          actionsInert: actions.inert,
          navVisible: box(nav).height > 0 && getComputedStyle(nav).visibility === 'visible',
          navTop: box(nav).top,
          navInert: nav.inert,
          overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
          transition: getComputedStyle(actions).transitionDuration,
          activeView: document.querySelector('.view.active')?.id
        };
      });
      const scroll = async top => {
        await page.evaluate(value => document.body.scrollTo({ top: value, behavior: 'instant' }), top);
        await page.waitForFunction(value => Math.abs(document.body.scrollTop - value) < 2, Math.min(top, await page.evaluate(() => document.body.scrollHeight - document.body.clientHeight)));
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      };
      const chrome = expected => page.waitForFunction(value => document.documentElement.dataset.v2MobileChrome === value, expected);
      const initial = await state();
      check(initial.chrome === 'expanded' && initial.navVisible && initial.searchVisible && initial.utilitiesVisible, `${width}: inicia expandido`);
      check(initial.windowScroll === 0 && await page.evaluate(() => getComputedStyle(document.body).overflowY === 'auto'), `${width}: body é o scroll root`);
      check(initial.structuralVisible && initial.overflow <= 1, `${width}: estrutura legível sem overflow`);
      await page.screenshot({ path: `artifacts/mobile-review/chrome-${width}-${theme}-expanded.png` });
      await scroll(15);
      check((await state()).chrome === 'expanded', `${width}: topo mantém expanded`);
      await scroll(110);
      await chrome('reading');
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.topbar-actions')).visibility === 'hidden' && getComputedStyle(document.getElementById('v2MobileNav')).visibility === 'hidden');
      const reading = await state();
      check(reading.headerHeight + 55 < initial.headerHeight && reading.actionsHeight < 2, `${width}: busca e utilidades colapsam altura`);
      check(reading.actionsInert && reading.navInert && !reading.searchVisible && !reading.utilitiesVisible, `${width}: controles recolhidos não recebem interações`);
      check(reading.structuralVisible && reading.headerTop <= 1, `${width}: contexto estrutural sticky permanece`);
      check(!reading.navVisible && reading.navTop >= height - 2, `${width}: bottom nav oculta`);
      await page.screenshot({ path: `artifacts/mobile-review/chrome-${width}-${theme}-reading.png` });
      await scroll(105);
      check((await state()).chrome === 'reading', `${width}: jitter não alterna`);
      await scroll(85);
      await chrome('expanded');
      check((await state()).navVisible, `${width}: subir revela imediatamente`);
      await page.waitForFunction(() => getComputedStyle(document.getElementById('v2MobileNav')).transform === 'none');
      await page.screenshot({ path: `artifacts/mobile-review/chrome-${width}-${theme}-return.png` });
      await scroll(110);
      await chrome('reading');
      await page.locator('#menuToggle').click();
      await chrome('expanded');
      check(await page.locator('#sidebar.open').count() === 1, `${width}: sidebar aberta força expanded`);
      await page.keyboard.press('Escape');
      await page.locator('#notificationButton').click();
      check((await state()).chrome === 'expanded', `${width}: notificações abertas forçam expanded`);
      await scroll(190);
      check((await state()).chrome === 'expanded', `${width}: notificações permanecem acessíveis no scroll`);
      await page.locator('#notificationPanelClose').click();
      await page.locator('#v2UtilitiesMenu summary').click();
      check((await state()).chrome === 'expanded', `${width}: menu de utilidades força expanded`);
      await scroll(260);
      check((await state()).chrome === 'expanded', `${width}: utilidades abertas não recolhem`);
      await page.locator('#v2UtilitiesMenu summary').click();
      await page.locator('#globalSearch').focus();
      await scroll(330);
      check((await state()).chrome === 'expanded', `${width}: busca focada impede hide`);
      await page.locator('#globalSearch').blur();
      await page.locator('#v2MobileNav [data-view-link="dashboard"]').focus();
      await scroll(400);
      check((await state()).chrome === 'expanded', `${width}: bottom nav focada impede hide`);
      await page.locator('#v2MobileNav [data-view-link="dashboard"]').blur();
      await scroll(470);
      await chrome('reading');
      await page.keyboard.press('Tab');
      await chrome('expanded');
      check((await state()).chrome === 'expanded', `${width}: teclado restaura chrome antes de navegar`);
      await page.evaluate(() => document.activeElement.blur());
      await scroll(490);
      await chrome('reading');
      await page.evaluate(() => document.getElementById('modalBackdrop').classList.remove('hidden'));
      await chrome('expanded');
      await scroll(550);
      check((await state()).chrome === 'expanded', `${width}: modal aberto mantém chrome acessível`);
      await page.evaluate(() => document.getElementById('modalBackdrop').classList.add('hidden'));
      await page.evaluate(() => window.Atrium.App.switchView('kanban'));
      await chrome('expanded');
      check((await state()).activeView === 'view-kanban', `${width}: rota restaura expanded`);
      await page.setViewportSize({ width: 920, height });
      await page.waitForFunction(() => !document.documentElement.hasAttribute('data-v2-mobile-chrome'));
      check((await state()).chrome !== 'reading' && !(await state()).navVisible, `${width}: desktop não retém reading`);
      await page.setViewportSize({ width: 800, height: width });
      await chrome('expanded');
      check((await state()).chrome === 'expanded', `${width}: orientação recalcula estado`);
      check((await state()).overflow <= 1, `${width}: sem overflow após orientação`);
      check(reducedMotion === 'reduce' ? parseFloat((await state()).transition) < .01 : parseFloat((await state()).transition) >= .16, `${width}: preferência de movimento respeitada`);
      // Regressão ATR-20260929-14E9EA6C: keydown sem `key` (Event sintético, IME ou extensão)
      // não pode derrubar a view com o relatório de erro global.
      await page.evaluate(() => {
        document.dispatchEvent(new Event('keydown'));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: undefined }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
      check((await state()).activeView === 'view-kanban', `${width}: keydown sem key não quebra a view`);
      check(pageErrors.length === 0, `${width}: sem pageerror`);
    } finally {
      await context.close();
    }
  }
} finally {
  await session.stop();
}
console.log(`Mobile dynamic chrome: ${results.length} cenários aprovados.`);
