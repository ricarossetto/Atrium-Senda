import assert from 'node:assert/strict';
import {
  collectUiV2LayoutEvidence,
  prepareUiV2Page,
  startUiV2Session,
  switchUiV2View
} from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 ICONOGRAPHY ACCESSIBILITY');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  try {
    const { page, pageErrors } = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'light' });

    const iconEvidence = await page.evaluate(() => {
      const icons = [...document.querySelectorAll('svg.atrium-icon')];
      const iconOnlyControls = [...document.querySelectorAll('button, summary')].filter(control =>
        control.querySelector('svg.atrium-icon') && !control.textContent.trim()
      );
      return {
        total: icons.length,
        decorativeWithoutHidden: icons.filter(icon => !icon.hasAttribute('role') && icon.getAttribute('aria-hidden') !== 'true').length,
        focusable: icons.filter(icon => icon.getAttribute('tabindex') === '0' || icon.getAttribute('focusable') !== 'false').length,
        unnamedControls: iconOnlyControls.filter(control => !control.getAttribute('aria-label') && !control.getAttribute('title')).map(control => control.id || control.outerHTML.slice(0, 80)),
        duplicateIds: [...document.querySelectorAll('[id]')].map(element => element.id).filter((id, index, ids) => ids.indexOf(id) !== index),
        spriteRequests: performance.getEntriesByType('resource')
          .filter(entry => entry.name.includes('assets/icons/atrium-ui-icons.svg'))
          .map(entry => ({ name: entry.name.split('#')[0], transferSize: entry.transferSize }))
      };
    });
    assert.ok(iconEvidence.total >= 50, `A UI deve renderizar o sistema local; encontrados ${iconEvidence.total} ícones.`);
    assert.equal(iconEvidence.decorativeWithoutHidden, 0, 'Todo SVG decorativo deve ter aria-hidden=true.');
    assert.equal(iconEvidence.focusable, 0, 'Nenhum SVG decorativo pode receber foco.');
    assert.deepEqual(iconEvidence.unnamedControls, [], 'Todo controle icon-only deve possuir nome acessível.');
    assert.deepEqual(iconEvidence.duplicateIds, []);
    assert.equal(new Set(iconEvidence.spriteRequests.map(entry => entry.name)).size, 1, 'Todos os usos devem apontar para o mesmo recurso local canônico.');
    assert.ok(iconEvidence.spriteRequests.length < iconEvidence.total / 10, `O sprite não pode gerar um request por ícone; ${iconEvidence.spriteRequests.length} entradas para ${iconEvidence.total} ícones.`);

    for (const [selector, name] of [
      ['#menuToggle', 'Abrir menu'], ['#sidebarToggleBtn', 'Recolher Menu'],
      ['.notification-button', 'Abrir central de notificações'], ['#dismissBanner', 'Fechar aviso'],
      ['#modalClose', 'Fechar'], ['#processInspectorClose', 'Fechar detalhes do processo']
    ]) {
      const control = page.locator(selector).first();
      assert.ok((await control.getAttribute('aria-label'))?.includes(name), `${selector} deve preservar nome acessível (${name}).`);
    }

    const search = page.locator('#globalSearch');
    assert.ok((await search.getAttribute('aria-label')) || (await search.getAttribute('placeholder')), 'Busca Global deve continuar nomeada.');
    await switchUiV2View(page, 'processes');
    const processNav = page.locator('.nav-item[data-view="processes"]');
    await processNav.focus();
    await page.keyboard.press('Enter');
    assert.equal(await processNav.evaluate(element => element.classList.contains('active')), true, 'O SVG não pode interferir na ativação por teclado.');

    await page.locator('#sidebarToggleBtn').click();
    await page.locator('#sidebar.collapsed').waitFor();
    const collapsed = await page.evaluate(() => [...document.querySelectorAll('.nav-item[data-view]')].every(item => {
      const itemRect = item.getBoundingClientRect();
      const iconRect = item.querySelector('.nav-icon')?.getBoundingClientRect();
      if (!iconRect) return false;
      return Math.abs((itemRect.left + itemRect.width / 2) - (iconRect.left + iconRect.width / 2)) <= 2;
    }));
    assert.equal(collapsed, true, 'Ícones da navegação recolhida devem permanecer centralizados.');
    assert.deepEqual(pageErrors, [], `Desktop page errors: ${pageErrors.join(' | ')}`);
  } finally {
    await desktop.close();
  }

  for (const theme of ['light', 'dark']) {
    const mobile = await session.createContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    try {
      const { page, pageErrors } = await prepareUiV2Page(mobile, session.server.baseUrl, { theme });
      const menu = page.locator('#menuToggle');
      const menuBox = await menu.boundingBox();
      assert.ok(menuBox && menuBox.width >= 43.5 && menuBox.height >= 43.5, `${theme}: menu deve preservar 44px.`);
      const requiredTargets = ['#themeToggleButton', '#syncButton', '.notification-button'];
      for (const selector of requiredTargets) {
        const box = await page.locator(selector).first().boundingBox();
        assert.ok(box && box.width >= 43.5 && box.height >= 43.5, `${theme}: ${selector} deve preservar target 44px.`);
      }

      await menu.focus();
      await page.keyboard.press('Enter');
      await page.locator('#sidebar.open').waitFor();
      assert.equal(await menu.getAttribute('aria-expanded'), 'true');
      const mobileIcons = await page.evaluate(() => [...document.querySelectorAll('.nav-item[data-view]')].map(item => {
        const icon = item.querySelector('svg.atrium-icon');
        const use = icon?.querySelector('use');
        const itemRect = item.getBoundingClientRect();
        const iconRect = icon?.getBoundingClientRect();
        let glyph = { width: 0, height: 0 };
        try {
          const box = use?.getBBox();
          if (box) glyph = { width: box.width, height: box.height };
        } catch {}
        return {
          href: use?.getAttribute('href'),
          width: iconRect?.width || 0,
          height: iconRect?.height || 0,
          glyphWidth: glyph.width,
          glyphHeight: glyph.height,
          verticallyCentered: iconRect ? Math.abs((itemRect.top + itemRect.height / 2) - (iconRect.top + iconRect.height / 2)) <= 2 : false
        };
      }));
      assert.equal(mobileIcons.length, 17);
      assert.ok(mobileIcons.every(icon => icon.href?.startsWith('assets/icons/atrium-ui-icons.svg#atrium-icon-')));
      assert.ok(mobileIcons.every(icon => icon.width >= 18 && icon.width <= 20 && icon.height >= 18 && icon.height <= 20), 'Containers óticos devem permanecer entre 18 e 20px.');
      assert.ok(mobileIcons.every(icon => icon.glyphWidth > 0 && icon.glyphHeight > 0), 'Os 17 símbolos externos devem renderizar geometria visível.');
      assert.ok(mobileIcons.every(icon => icon.verticallyCentered), 'Ícones mobile devem permanecer centralizados verticalmente.');

      const layout = await collectUiV2LayoutEvidence(page);
      assert.ok(layout.globalOverflow <= 2, `${theme}: overflow global ${layout.globalOverflow}px.`);
      assert.deepEqual(layout.duplicateIds, []);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.getElementById('menuToggle')?.getAttribute('aria-expanded') === 'false');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'menuToggle', 'Escape deve devolver foco ao menu.');
      assert.deepEqual(pageErrors, [], `${theme} mobile page errors: ${pageErrors.join(' | ')}`);
    } finally {
      await mobile.close();
    }
  }

  console.log('✓ SVG decorativo oculto, não focável e controles icon-only nomeados.');
  console.log('✓ Teclado, foco, 44px, sidebar recolhida e navegação mobile preservados.');
} finally {
  await session.stop();
}
