import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(indexSource, /<meta name="viewport" content="[^"]*viewport-fit=auto[^"]*">/, 'O viewport deve deixar o Safari reservar automaticamente as áreas do notch e do indicador inferior.');

const session = await startUiV2Session();
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 393, height: 873 }, { width: 430, height: 932 }]) {
    const context = await session.createContext({ viewport });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'dark' });
      const barOpacity = await page.evaluate(() => {
        const bar = document.getElementById('systemStatusBar');
        if (!bar || bar.classList.contains('is-transient-hidden')) return null;
        return getComputedStyle(bar).opacity;
      });
      if (barOpacity !== null) assert.equal(barOpacity, '1', `${viewport.width}px: a barra de status visível deve ser opaca.`);
      await page.evaluate(() => {
        document.documentElement.style.setProperty('--atrium-safe-top', '47px');
        document.documentElement.style.setProperty('--atrium-safe-bottom', '34px');
      });
      await page.evaluate(() => document.body.scrollTo(0, 700));
      await page.waitForTimeout(200);
      const state = await page.evaluate(() => {
        const topbar = document.querySelector('.topbar');
        const cs = getComputedStyle(topbar);
        const rect = topbar.getBoundingClientRect();
        const hit = document.elementFromPoint(Math.round(innerWidth / 2), 18);
        const match = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
        const parts = match ? match[1].split(',').map(value => parseFloat(value)) : [];
        const alpha = parts.length === 4 ? parts[3] : 1;
        return {
          paddingTop: Math.round(parseFloat(cs.paddingTop)),
          top: Math.round(rect.top),
          opaque: alpha >= 0.999,
          backdrop: cs.backdropFilter || cs.webkitBackdropFilter || 'none',
          hitInsideTopbar: Boolean(hit && topbar.contains(hit)),
          overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
          scrolled: document.body.scrollTop,
          windowScroll: window.scrollY,
          scrollportHeight: Math.round(document.body.clientHeight),
          scrollableHeight: document.body.scrollHeight,
          bodyOverflow: getComputedStyle(document.body).overflowY,
          rootOverflow: getComputedStyle(document.documentElement).overflowY,
          rootHeight: Math.round(document.documentElement.getBoundingClientRect().height)
        };
      });
      assert.ok(state.scrolled > 0, `${viewport.width}px: o body precisa rolar para o teste ser válido.`);
      assert.equal(state.windowScroll, 0, `${viewport.width}px: o window não deve rolar (${state.windowScroll}px).`);
      assert.equal(state.bodyOverflow, 'auto', `${viewport.width}px: o body é o scroll container.`);
      assert.equal(state.rootOverflow, 'hidden', `${viewport.width}px: o viewport do app não deve rolar.`);
      assert.equal(state.rootHeight, viewport.height, `${viewport.width}px: a altura do root acompanha a viewport.`);
      assert.ok(state.scrollableHeight > state.scrollportHeight, `${viewport.width}px: o body precisa alcançar o conteúdo.`);
      assert.ok(state.paddingTop >= 47, `${viewport.width}px: o topbar deve reservar a safe-area (padding ${state.paddingTop}px).`);
      assert.ok(state.top <= 1, `${viewport.width}px: o topbar sticky deve encostar no topo (${state.top}px).`);
      assert.equal(state.opaque, true, `${viewport.width}px: o topbar mobile deve ter fundo opaco.`);
      assert.equal(state.backdrop, 'none', `${viewport.width}px: sem backdrop-filter no topbar mobile (${state.backdrop}).`);
      assert.equal(state.hitInsideTopbar, true, `${viewport.width}px: nenhum conteúdo pode aparecer atrás da status bar.`);
      assert.ok(state.overflow <= 1, `${viewport.width}px: sem overflow horizontal (${state.overflow}).`);
      const utilities = await page.evaluate(() => {
        const box = selector => document.querySelector(selector).getBoundingClientRect();
        /* A linha de utilitários mobile tem CINCO controles: sino, tema, sync,
         * utilitários e "Novo". O contrato anterior media quatro e comparava a
         * soma deles com a largura inteira de `.topbar-actions` — que inclui
         * também o campo de busca (`global-search-container`, full width) e o
         * perfil. A soma dos quatro nunca alcançaria essa largura, então a
         * assertion ficava vermelha na `main` por medir a caixa errada.
         * Passa a medir os cinco controles da barra e a comparar com a largura
         * ÚTIL da própria barra (descontando padding/borda da ilha). */
        const seletores = [
          '.notification-center',
          '#themeToggleButton',
          '#syncButton',
          '#v2UtilitiesMenu',
          '#quickAddButton'
        ];
        const widths = seletores.map(selector => box(selector).width);
        const acoes = document.querySelector('.topbar-actions');
        const row = acoes.getBoundingClientRect();
        const estilo = getComputedStyle(acoes);
        const recuo = (parseFloat(estilo.paddingLeft) || 0) + (parseFloat(estilo.paddingRight) || 0)
          + (parseFloat(estilo.borderLeftWidth) || 0) + (parseFloat(estilo.borderRightWidth) || 0);
        const gap = parseFloat(estilo.columnGap) || 0;
        const soma = widths.reduce((total, width) => total + width, 0);
        const espacos = gap * Math.max(0, seletores.length - 1);
        return {
          widths,
          rowWidth: row.width,
          larguraUtil: row.width - recuo,
          ocupado: soma + espacos,
          gap,
          recuo
        };
      });
      assert.ok(utilities.widths.every(width => Math.abs(width - utilities.widths[0]) <= 1), `${viewport.width}px: ícones do topo precisam de largura igual (${utilities.widths.join(', ')}).`);
      /* Os controles formam a ilha de utilitários: precisam preencher a largura
       * ÚTIL dela (tolerância de 1px por arredondamento sub-pixel). Isso valida
       * alinhamento real sem exigir que os ícones estiquem até a borda da
       * viewport, o que não é o desenho da barra. */
      assert.ok(
        Math.abs(utilities.ocupado - utilities.larguraUtil) <= 1,
        `${viewport.width}px: a linha de ícones deve ocupar a largura útil da barra (ocupado ${utilities.ocupado.toFixed(1)}px, útil ${utilities.larguraUtil.toFixed(1)}px, gaps ${utilities.gap}px).`
      );
      const brand = await page.evaluate(() => {
        const wrapper = document.querySelector('.v2-topbar-brand');
        const dark = wrapper?.querySelector('.v2-topbar-brand-dark');
        const light = wrapper?.querySelector('.v2-topbar-brand-light');
        const title = document.getElementById('viewTitle').getBoundingClientRect();
        const rect = wrapper?.getBoundingClientRect();
        const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        return {
          visible: Boolean(rect && wrapper.getClientRects().length && rect.width > 40),
          height: Math.round(rect?.height || 0),
          darkShown: dark ? getComputedStyle(dark).display !== 'none' : false,
          lightShown: light ? getComputedStyle(light).display !== 'none' : false,
          overlapsTitle: rect ? overlaps(rect, title) : false,
          sameRow: rect ? Math.abs((rect.top + rect.bottom) / 2 - (title.top + title.bottom) / 2) <= 16 : false
        };
      });
      assert.equal(brand.visible, true, `${viewport.width}px: a marca ATRIUM deve permanecer visível no topo.`);
      assert.ok(brand.height <= 30, `${viewport.width}px: a marca deve respeitar a altura do topo (${brand.height}px).`);
      assert.equal(brand.darkShown, true, `${viewport.width}px: no tema escuro a marca escura deve ser a exibida.`);
      assert.equal(brand.lightShown, false, `${viewport.width}px: no tema escuro a marca clara precisa ficar oculta.`);
      assert.equal(brand.overlapsTitle, false, `${viewport.width}px: a marca não pode sobrepor o título da view.`);
      assert.equal(brand.sameRow, true, `${viewport.width}px: marca e título devem compartilhar a mesma linha.`);
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  }

  // Sheets full-bleed precisam recuar do notch (cabeçalho) e do home indicator (rodapé).
  const modalContext = await session.createContext({ viewport: { width: 393, height: 873 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(modalContext, session.server.baseUrl, { theme: 'dark' });
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--atrium-safe-top', '47px');
      document.documentElement.style.setProperty('--atrium-safe-bottom', '34px');
    });
    await page.locator('#btnDashboardNewTask').click();
    await page.locator('#modalBackdrop:not(.hidden)').waitFor();
    const sheet = await page.evaluate(() => {
      const modal = document.querySelector('#modalBackdrop .modal');
      const header = modal.querySelector('header');
      const footer = modal.querySelector('#modalForm > footer, footer');
      const headerTop = header.getBoundingClientRect().top + parseFloat(getComputedStyle(header).paddingTop);
      const footerBottom = footer.getBoundingClientRect().bottom - parseFloat(getComputedStyle(footer).paddingBottom);
      return { headerTop: Math.round(headerTop), footerBottom: Math.round(footerBottom), innerH: innerHeight };
    });
    assert.ok(sheet.headerTop >= 47, `O conteúdo do cabeçalho do sheet deve ficar abaixo do notch (${sheet.headerTop}px).`);
    assert.ok(sheet.footerBottom <= sheet.innerH - 34, `O conteúdo do rodapé do sheet deve ficar acima do home indicator (${sheet.footerBottom}px).`);
    assert.deepEqual(pageErrors, []);
  } finally {
    await modalContext.close();
  }

  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'light' });
    const layout = await page.evaluate(() => {
      const topbar = document.querySelector('.topbar');
      const cs = getComputedStyle(topbar);
      return {
        position: cs.position,
        backdrop: cs.backdropFilter || cs.webkitBackdropFilter || 'none',
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth
      };
    });
    assert.equal(layout.position, 'sticky', 'O topbar desktop continua sticky.');
    assert.notEqual(layout.backdrop, 'none', 'O desktop preserva o acabamento translúcido do topo.');
    assert.ok(layout.overflow <= 1, 'Desktop sem overflow horizontal.');
    assert.deepEqual(pageErrors, []);
  } finally {
    await desktop.close();
  }

  console.log('Safe area simulada: topbar opaco e sem overflow em mobile, sem regressão desktop; Safari físico pendente.');
} finally {
  await session.stop();
}
