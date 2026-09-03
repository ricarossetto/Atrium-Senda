import assert from 'node:assert/strict';
import { prepareUiV2Page, prepareUiV2PromptsFixture, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 PROMPTS ACCESSIBILITY & RESPONSIVE');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const desktopResult = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'light' });
  const page = desktopResult.page;
  await prepareUiV2PromptsFixture(page);

  assert.equal(await page.locator('label[for="promptsSearchInput"]').count(), 1);
  assert.equal(await page.locator('label[for="promptCategorySelect"]').count(), 1);
  assert.equal(await page.locator('label[for="promptTypeSelect"]').count(), 1);
  assert.match(await page.locator('#btnClearPromptsSearch').getAttribute('aria-label'), /Limpar busca/);
  assert.equal(await page.locator('#promptsCategoryChips').getAttribute('role'), 'group');
  assert.equal(await page.locator('#promptsCategoryChips .prompt-chip[aria-pressed="true"]').count(), 1);
  assert.equal(await page.locator('#promptsGrid [data-prompt-id] h3').count(), 4);
  assert.match(await page.locator('[data-use-prompt="prompt-v2-redacao"]').getAttribute('aria-label'), /Usar prompt Redação Cível Sintética no Assistente/);
  assert.match(await page.locator('[data-copy-prompt="prompt-v2-redacao"]').getAttribute('aria-label'), /Copiar texto integral/);
  assert.equal(await page.locator('[data-prompt-id="prompt-v2-redacao"] [data-edit-prompt], [data-prompt-id="prompt-v2-redacao"] [data-delete-prompt]').count(), 0);
  assert.equal(await page.locator('[data-prompt-id="prompt-v2-custom"] [data-edit-prompt], [data-prompt-id="prompt-v2-custom"] [data-delete-prompt]').count(), 2);

  const compactCard = await page.locator('[data-prompt-id="prompt-v2-redacao"]').evaluate(card => {
    const footer = card.querySelector('.prompt-card-actions');
    const text = card.querySelector('.prompt-box');
    return {
      height: card.getBoundingClientRect().height,
      footerHeight: footer.getBoundingClientRect().height,
      textHeight: text.getBoundingClientRect().height,
      reservedSpace: card.getBoundingClientRect().bottom - footer.getBoundingClientRect().bottom
    };
  });
  assert.ok(compactCard.height < 390, `O card deve ficar abaixo da antiga altura fixa: ${compactCard.height}px.`);
  assert.ok(compactCard.footerHeight <= 48, `O rodapé deve permanecer compacto: ${compactCard.footerHeight}px.`);
  assert.ok(compactCard.textHeight < 150, `O resumo não deve reservar os antigos 150px: ${compactCard.textHeight}px.`);
  assert.ok(compactCard.reservedSpace <= 24, `Não deve sobrar uma área vazia depois dos botões: ${compactCard.reservedSpace}px.`);

  await page.locator('[data-prompt-id="prompt-v2-redacao"] .prompt-box').click();
  await page.locator('#promptPreviewBackdrop:not(.hidden)').waitFor();
  const previewPrimary = await page.evaluate(() => {
    const read = element => {
      const style = getComputedStyle(element);
      return { color: style.color, background: style.backgroundColor, border: style.borderColor };
    };
    return { preview: read(document.getElementById('promptPreviewUse')), canonical: read(document.getElementById('btnNewPrompt')) };
  });
  assert.deepEqual(previewPrimary.preview, previewPrimary.canonical, 'Usar no Assistente deve adotar o botão primário azul atual.');
  await page.locator('#promptPreviewClose').click();

  const duplicateIds = await page.locator('[id]').evaluateAll(nodes => {
    const ids = nodes.map(node => node.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  assert.deepEqual(duplicateIds, []);

  const trigger = page.locator('#btnNewPrompt');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
  assert.equal(await page.locator('#modalBackdrop .modal').getAttribute('role'), 'dialog');
  assert.equal(await page.locator('#modalBackdrop .modal').getAttribute('aria-modal'), 'true');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), '');
  assert.deepEqual(await page.locator('#modalFields fieldset legend').allTextContents(), ['Identidade', 'Descobribilidade', 'Instrução']);
  assert.deepEqual(await page.locator('#modalForm [name]').evaluateAll(elements => elements.map(element => element.name)),
    ['title', 'category', 'type', 'tags', 'description', 'prompt']);
  assert.equal(await page.locator('#modalForm label').count(), 6);

  await page.locator('#modalClose').focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement)), true);
  await page.locator('#modalForm button[type="submit"]').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'btnNewPrompt');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), null);
  assert.deepEqual(desktopResult.pageErrors, []);
  await desktop.close();

  const mobile = await session.createContext({ viewport: { width: 390, height: 844 } });
  const mobileResult = await prepareUiV2Page(mobile, session.server.baseUrl, { theme: 'dark' });
  const mobilePage = mobileResult.page;
  await prepareUiV2PromptsFixture(mobilePage);
  const layout = await mobilePage.evaluate(() => {
    const buttons = [...document.querySelectorAll('#view-prompts button')].filter(button => button.getClientRects().length);
    const records = [...document.querySelectorAll('#promptsGrid .prompt-library-card')];
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      recordOverflow: records.filter(record => record.scrollWidth - record.clientWidth > 2).length,
      undersized: buttons.filter(button => {
        const rect = button.getBoundingClientRect();
        return rect.width < 43.5 || rect.height < 43.5;
      }).map(button => button.getAttribute('aria-label') || button.textContent.trim())
    };
  });
  assert.ok(layout.overflow <= 2);
  assert.equal(layout.recordOverflow, 0);
  assert.deepEqual(layout.undersized, []);

  await mobilePage.locator('[data-edit-prompt="prompt-v2-custom"]').click();
  await mobilePage.waitForFunction(() => document.querySelector('#modalBackdrop .modal')?.contains(document.activeElement));
  await mobilePage.waitForFunction(() => [...document.querySelectorAll('#modalBackdrop .modal')]
    .flatMap(element => element.getAnimations({ subtree: true })).every(animation => animation.playState === 'finished'));
  const sheet = await mobilePage.locator('#modalBackdrop .modal').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const buttons = [...element.querySelectorAll('button')].filter(button => button.getClientRects().length);
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: innerWidth,
      height: innerHeight,
      overflow: element.scrollWidth - element.clientWidth,
      undersized: buttons.filter(button => {
        const target = button.getBoundingClientRect();
        return target.width < 43.5 || target.height < 43.5;
      }).map(button => button.getAttribute('aria-label') || button.textContent.trim())
    };
  });
  assert.ok(sheet.left >= -2 && sheet.right <= sheet.width + 2);
  assert.ok(sheet.top >= -2 && sheet.bottom <= sheet.height + 2);
  assert.ok(sheet.overflow <= 2);
  assert.deepEqual(sheet.undersized, []);
  assert.equal(await mobilePage.locator('#modalForm label').count(), 6);
  await mobilePage.keyboard.press('Escape');
  assert.equal(await mobilePage.evaluate(() => document.activeElement?.getAttribute('data-edit-prompt')), 'prompt-v2-custom');
  assert.deepEqual(mobileResult.pageErrors, []);
  await mobile.close();

  const reduced = await session.createContext({ viewport: { width: 1280, height: 800 } });
  const reducedResult = await prepareUiV2Page(reduced, session.server.baseUrl);
  await reducedResult.page.emulateMedia({ reducedMotion: 'reduce' });
  await prepareUiV2PromptsFixture(reducedResult.page);
  assert.ok(await reducedResult.page.locator('#promptsGrid .prompt-library-card').first()
    .evaluate(element => parseFloat(getComputedStyle(element).transitionDuration) <= 0.001));
  await reduced.close();
} finally {
  await session.stop();
}

console.log('✓ Prompts V2 acessível: labels, teclado, foco, Escape, retorno, mobile e reduced motion aprovados.');
