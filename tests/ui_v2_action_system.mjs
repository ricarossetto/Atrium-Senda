import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 THEME-AWARE ACTION SYSTEM & LAYOUT CONTROL');
console.log('===============================================================\n');

const CTA_IDS = ['btnDashboardNewTask', 'newTaskButton', 'newTermButton', 'certificateGuideButton', 'newProcessButton', 'newContactButton', 'newLeadButton', 'newFinancialEntryButton', 'btnOpenDocGenModal', 'newIntimationButton', 'btnNewPrompt'];
const actionCss = readFileSync(new URL('../css/views/ui-v2/action-system.css', import.meta.url), 'utf8');
const tokenCss = readFileSync(new URL('../css/views/ui-v2/tokens.css', import.meta.url), 'utf8');
assert.doesNotMatch(actionCss, /linear-gradient|translateY|\binset\b/i, 'O sistema de ações deve permanecer matte, sem acabamento glossy/3D.');
for (const line of actionCss.split(/\r?\n/).filter(value => value.includes('text-shadow:'))) {
  assert.match(line, /text-shadow:\s*none\s*;/i, 'O sistema matte não pode reintroduzir brilho tipográfico.');
}
for (const line of tokenCss.split(/\r?\n/).filter(value => value.includes('--v2-action-primary-'))) {
  assert.doesNotMatch(line, /linear-gradient|\binset\b/i, 'Tokens de ação não podem reintroduzir volume glossy/3D.');
}
const session = await startUiV2Session();
try {
  for (const theme of ['light', 'dark']) {
    const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
    const styles = await page.evaluate(ids => ids.map(id => {
      const element = document.getElementById(id);
      const style = getComputedStyle(element);
      return { id, backgroundImage: style.backgroundImage, backgroundColor: style.backgroundColor, color: style.color, borderColor: style.borderColor, boxShadow: style.boxShadow, backdropFilter: style.backdropFilter || style.webkitBackdropFilter, transform: style.transform, textShadow: style.textShadow };
    }), CTA_IDS);
    assert.equal(styles.length, CTA_IDS.length);
    for (const style of styles) {
      assert.equal(style.backgroundImage, 'none');
      assert.notEqual(style.backgroundColor, 'rgba(0, 0, 0, 0)');
      assert.notEqual(style.boxShadow, 'none');
      assert.doesNotMatch(style.boxShadow, /inset/i);
      assert.notEqual(style.borderColor, 'rgba(0, 0, 0, 0)');
      assert.match(style.backdropFilter, /blur\(8px\)/);
      assert.equal(style.transform, 'none');
      assert.equal(style.textShadow, 'none');
    }
    const expectedColor = theme === 'light' ? 'rgb(42, 69, 84)' : 'rgb(243, 233, 208)';
    for (const style of styles) assert.equal(style.color, expectedColor, `${theme}/${style.id}: contraste textual do material primário.`);
    assert.deepEqual(pageErrors, []);
    await context.close();
  }

  const context = await session.createContext({ viewport: { width: 1280, height: 800 } });
  const { page } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });
  assert.equal(await page.locator('#uiModeControl').count(), 1);
  assert.equal(await page.locator('.topbar #uiModeControl').count(), 0);
  assert.equal(await page.locator('#view-configuration #uiModeControl').count(), 1);
  assert.deepEqual(await page.locator('#uiModeControl [data-ui-mode]').allTextContents(), ['Interface V2', 'Layout clássico']);
  await page.evaluate(() => window.Atrium.App.switchView('configuration'));
  await page.locator('#view-configuration.active').waitFor();
  const baseline = await page.evaluate(() => ({ state: JSON.stringify(window.Atrium.Store.state), revision: window.Atrium.Store.revision, requests: window.__uiV2RuntimeProbe.mutationRequests.length }));
  await page.getByRole('button', { name: 'Layout clássico' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.ui), 'classic');
  assert.equal(await page.evaluate(() => localStorage.getItem('atrium:ui:mode')), 'classic');
  await page.getByRole('button', { name: 'Interface V2' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.ui), 'v2');
  const after = await page.evaluate(() => ({ state: JSON.stringify(window.Atrium.Store.state), revision: window.Atrium.Store.revision, requests: window.__uiV2RuntimeProbe.mutationRequests.length }));
  assert.deepEqual(after, baseline);
  const authButton = await page.locator('#authGate .button.gold').first().evaluate(element => ({ inlineScope: element.closest('#appShell') !== null, background: getComputedStyle(element).backgroundImage }));
  assert.equal(authButton.inlineScope, false);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ Action system Light/Dark, Auth/Classic firewalls e toggle único PASS.');
