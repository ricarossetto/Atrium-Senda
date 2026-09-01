import assert from 'node:assert/strict';
import {
  collectUiV2LayoutEvidence,
  prepareUiV2Page,
  startUiV2Session,
  switchUiV2View,
  UI_V2_CANONICAL_VIEWS
} from './ui_v2_helpers.mjs';

const session = await startUiV2Session();
let states = 0;
try {
  const matrices = [
    { name: 'mobile-light', theme: 'light', viewport: { width: 390, height: 844 } },
    { name: 'mobile-dark', theme: 'dark', viewport: { width: 390, height: 844 } },
    { name: 'compact-light', theme: 'light', viewport: { width: 320, height: 700 } },
    { name: 'reflow-dark', theme: 'dark', viewport: { width: 640, height: 800 } }
  ];

  for (const matrix of matrices) {
    const context = await session.createContext({ viewport: matrix.viewport, reducedMotion: 'reduce' });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: matrix.theme });
      for (const view of UI_V2_CANONICAL_VIEWS) {
        await switchUiV2View(page, view);
        const evidence = await collectUiV2LayoutEvidence(page);
        const accessibility = await page.locator(`#view-${view}.active`).evaluate(element => {
          const heading = element.querySelector('h1, h2');
          const controls = [...element.querySelectorAll('button, input, select, textarea')]
            .filter(control => {
              const rect = control.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && getComputedStyle(control).visibility !== 'hidden';
            });
          return {
            headingText: heading?.textContent?.trim() || '',
            undersized: controls
              .map(control => {
                const rect = control.getBoundingClientRect();
                return { tag: control.tagName, id: control.id, text: control.getAttribute('aria-label') || control.textContent?.trim().slice(0, 40), width: rect.width, height: rect.height };
              })
              .filter(control => control.height < 43.5),
            unlabeledButtons: controls
              .filter(control => control.tagName === 'BUTTON')
              .filter(control => !(control.getAttribute('aria-label') || control.getAttribute('title') || control.textContent?.trim()))
              .map(control => control.id || control.outerHTML.slice(0, 80)),
            maxTransition: controls.reduce((max, control) => {
              const durations = getComputedStyle(control).transitionDuration.split(',').map(value => parseFloat(value) || 0);
              return Math.max(max, ...durations);
            }, 0)
          };
        });
        assert.ok(accessibility.headingText, `${matrix.name}/${view}: heading acessível.`);
        assert.ok(evidence.globalOverflow <= 2, `${matrix.name}/${view}: overflow ${evidence.globalOverflow}px.`);
        assert.deepEqual(evidence.duplicateIds, [], `${matrix.name}/${view}: IDs duplicados.`);
        assert.deepEqual(evidence.visibleOverlays, [], `${matrix.name}/${view}: overlay residual.`);
        assert.deepEqual(accessibility.unlabeledButtons, [], `${matrix.name}/${view}: botões sem nome.`);
        assert.deepEqual(accessibility.undersized, [], `${matrix.name}/${view}: targets abaixo de 44px.`);
        assert.ok(accessibility.maxTransition <= 0.02, `${matrix.name}/${view}: reduced motion respeitado.`);
        states++;
      }
      assert.deepEqual(pageErrors, [], `${matrix.name}: sem erros de página.`);
    } finally {
      await context.close();
    }
  }

  const keyboardContext = await session.createContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  try {
    const { page, pageErrors } = await prepareUiV2Page(keyboardContext, session.server.baseUrl, { theme: 'dark' });
    await switchUiV2View(page, 'dashboard');
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const active = document.activeElement;
      const style = active ? getComputedStyle(active) : null;
      return { tag: active?.tagName, outline: style?.outlineStyle, width: style?.outlineWidth };
    });
    assert.ok(focus.tag && focus.tag !== 'BODY', 'Teclado move foco para controle real.');
    assert.notEqual(focus.outline, 'none', 'Foco visível preservado.');
    assert.notEqual(focus.width, '0px', 'Foco possui espessura visível.');
    assert.deepEqual(pageErrors, [], 'Navegação por teclado sem erros de página.');
  } finally {
    await keyboardContext.close();
  }
} finally {
  await session.stop();
}

assert.equal(states, 68, '17 views devem ser certificadas em 4 matrizes responsivas.');
console.log('✓ UI V2 Global Polish Accessibility: 68 estados, targets, foco, reflow e reduced motion PASS.');
