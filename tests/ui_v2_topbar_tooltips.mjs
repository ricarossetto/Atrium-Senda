import assert from 'node:assert/strict';
import { prepareUiV2Page, prepareUiV2PublicationsFixture, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('--- Iniciando Teste: balões do topo e do menu lateral ---');
const session = await startUiV2Session();
try {
  for (const [width, theme] of [[1440, 'dark'], [1280, 'light']]) {
    const context = await session.createContext({ viewport: { width, height: 900 } });
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
    for (const [triggerId, tipId] of [['themeToggleButton', 'appThemeToggleTip'], ['notificationButton', 'notificationButtonTip']]) {
      await page.locator(`#${triggerId}`).hover();
      await page.locator(`#${tipId}[data-open="true"]`).waitFor({ state: 'attached' });
      await page.waitForFunction(id => getComputedStyle(document.getElementById(id)).opacity === '1', tipId);
      const geometry = await page.evaluate(([trigger, tip]) => {
        const a = document.getElementById(trigger).getBoundingClientRect();
        const b = document.getElementById(tip).getBoundingClientRect();
        return { overlap: a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom, left: b.left, right: b.right, gap: b.top - a.bottom, width: innerWidth };
      }, [triggerId, tipId]);
      assert.equal(geometry.overlap, false, `${tipId} não cobre o botão: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.gap >= 4 && geometry.gap <= 8, `${tipId} fica logo abaixo do botão: ${geometry.gap}`);
      assert.ok(geometry.left >= 0 && geometry.right <= geometry.width, `${tipId} fica dentro da tela`);
      await page.mouse.move(width / 2, 600);
    }
    assert.equal(await page.locator('#themeToggleButton').getAttribute('title'), null, 'sem segunda dica do navegador');
    assert.deepEqual(pageErrors, []);
    await context.close();
  }
  // Larguras intermediárias com a sidebar aberta: nada coberto, cortado ou sozinho em outra linha.
  for (const width of [862, 1000, 1041, 1199, 1200, 1279, 1280]) {
    const context = await session.createContext({ viewport: { width, height: 800 } });
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'dark' });
    await prepareUiV2PublicationsFixture(page);
    await page.evaluate(() => {
      for (const id of ['aiClassifierToggle', 'aiAutoOrganizeToggle', 'aiClassifierBacklogButton']) document.getElementById(id).hidden = false;
    });
    const layout = await page.evaluate(() => {
      const rect = element => element.getBoundingClientRect();
      const visible = selector => [...document.querySelectorAll(selector)].filter(element => element.getClientRects().length);
      const title = rect(document.querySelector('.topbar-left'));
      const topbar = visible('.topbar-actions > *').filter(element => !element.classList.contains('ui-tooltip'));
      const buttons = visible('.publication-primary-actions > .button, .publication-primary-actions > .publication-mine-only');
      const rows = new Map();
      for (const button of buttons) {
        const box = rect(button);
        const key = Math.round((box.top + box.bottom) / 2 / 8);
        rows.set(key, (rows.get(key) || 0) + 1);
      }
      const filters = visible('#inboxFilters button').map(button => Math.round(rect(button).top));
      return {
        pageOverflow: document.documentElement.scrollWidth - innerWidth,
        titleCovered: topbar.filter(element => { const box = rect(element); return box.left < title.right && title.left < box.right && box.top < title.bottom && title.top < box.bottom; }).length,
        squeezed: topbar.filter(element => rect(element).width < 30).length,
        rows: [...rows.values()],
        filterRows: new Set(filters).size,
        clipped: visible('.publication-primary-actions > .button, .publication-primary-actions > .publication-mine-only, #publicationsMetrics .pub-metric-card, #inboxFilters').filter(element => element.scrollWidth > element.clientWidth + 1).length
      };
    });
    const label = JSON.stringify({ width, ...layout });
    assert.ok(layout.pageOverflow <= 2, label);
    assert.equal(layout.titleCovered, 0, `título sem cobertura: ${label}`);
    assert.equal(layout.squeezed, 0, `botões do topo sem aperto: ${label}`);
    assert.ok(layout.rows.length <= 2, `no máximo duas linhas de ações: ${label}`);
    assert.ok(layout.rows.every(count => count >= 2), `nenhum botão sozinho: ${label}`);
    assert.equal(layout.filterRows, 1, `filtros em uma linha: ${label}`);
    assert.equal(layout.clipped, 0, `nada cortado: ${label}`);
    assert.deepEqual(pageErrors, []);
    await context.close();
  }
} finally {
  await session.close?.();
}
console.log('[PASS] Balões do topo e do menu lateral.');
process.exit(0);
