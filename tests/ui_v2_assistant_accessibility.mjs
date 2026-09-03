import assert from 'node:assert/strict';
import { prepareUiV2AssistantFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 ASSISTANT ACCESSIBILITY & RESPONSIVE');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const desktopResult = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'light' });
  const page = desktopResult.page;
  await prepareUiV2AssistantFixture(page, { configured: true, withContext: true });

  assert.equal(await page.locator('#aiChatMessages').getAttribute('role'), 'log');
  assert.match(await page.locator('#aiChatMessages').getAttribute('aria-label'), /Assistente jurídico/);
  assert.equal(await page.locator('label[for="aiChatInput"]').count(), 1);
  assert.equal(await page.locator('label[for="codexSkillSelect"]').count(), 1);
  assert.equal(await page.locator('label[for="assistantContextSelect"]').count(), 1);
  assert.equal(await page.locator('#assistantContextSelect').getAttribute('aria-describedby'), 'assistantV2ContextMeta assistantV2ContextHint');
  assert.equal(await page.locator('#btnSendAiMessage').getAttribute('aria-label'), 'Enviar mensagem ao Assistente jurídico');
  assert.match(await page.locator('#btnClearAiConversation').getAttribute('aria-label'), /Limpar conversa/);

  const duplicateIds = await page.locator('[id]').evaluateAll(nodes => {
    const ids = nodes.map(node => node.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  assert.deepEqual(duplicateIds, []);

  const trigger = page.locator('#btnOpenGeminiKeyModal');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#geminiKeyBackdrop .gemini-key-modal')?.contains(document.activeElement));
  assert.equal(await page.locator('#geminiKeyBackdrop .gemini-key-modal').getAttribute('role'), 'dialog');
  assert.equal(await page.locator('#geminiKeyBackdrop .gemini-key-modal').getAttribute('aria-modal'), 'true');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), '');

  await page.locator('#geminiKeyClose').focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.querySelector('#geminiKeyBackdrop .gemini-key-modal')?.contains(document.activeElement)), true);
  await page.locator('#geminiKeySubmit').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.querySelector('#geminiKeyBackdrop .gemini-key-modal')?.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  await page.locator('#geminiKeyBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'btnOpenGeminiKeyModal');
  assert.equal(await page.locator('#appShell').getAttribute('inert'), null);
  assert.deepEqual(desktopResult.pageErrors, []);
  await desktop.close();

  const mobile = await session.createContext({ viewport: { width: 390, height: 844 } });
  const mobileResult = await prepareUiV2Page(mobile, session.server.baseUrl, { theme: 'dark' });
  const mobilePage = mobileResult.page;
  await prepareUiV2AssistantFixture(mobilePage, { configured: false });
  const layout = await mobilePage.evaluate(() => {
    const buttons = [...document.querySelectorAll('#view-assistant button')].filter(button => button.getClientRects().length);
    const records = [...document.querySelectorAll('#view-assistant .assistant-context-rail > *, #view-assistant .ai-chat-card')];
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

  await mobilePage.locator('#btnOpenGeminiKeyModal').click();
  await mobilePage.waitForFunction(() => document.querySelector('#geminiKeyBackdrop .gemini-key-modal')?.contains(document.activeElement));
  const sheet = await mobilePage.locator('#geminiKeyBackdrop .gemini-key-modal').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const buttons = [...element.querySelectorAll('button')].filter(button => button.getClientRects().length);
    return {
      left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      width: innerWidth, height: innerHeight,
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
  await mobilePage.keyboard.press('Escape');
  assert.equal(await mobilePage.evaluate(() => document.activeElement?.id), 'btnOpenGeminiKeyModal');
  assert.deepEqual(mobileResult.pageErrors, []);
  await mobile.close();

  const reduced = await session.createContext({ viewport: { width: 1280, height: 800 } });
  const reducedResult = await prepareUiV2Page(reduced, session.server.baseUrl);
  await reducedResult.page.emulateMedia({ reducedMotion: 'reduce' });
  await prepareUiV2AssistantFixture(reducedResult.page);
  assert.ok(await reducedResult.page.locator('#view-assistant .quick-prompt-btn').first().evaluate(element => parseFloat(getComputedStyle(element).transitionDuration) <= 0.001));
  await reduced.close();
} finally {
  await session.stop();
}

console.log('✓ Assistente V2 acessível: landmarks, teclado, foco, Escape, retorno, mobile e reduced motion aprovados.');
