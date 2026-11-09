import assert from 'node:assert/strict';
import { prepareUiV2Page, prepareUiV2PublicationsFixture, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

console.log('--- Iniciando Teste: selo de monitoramento na tabela de processos ---');
const session = await startUiV2Session();
try {
  for (const width of [1440, 1100, 390]) {
    const context = await session.createContext({ viewport: { width, height: 900 } });
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
    await prepareUiV2PublicationsFixture(page);
    await switchUiV2View(page, 'processes');
    await page.locator('.process-cell-monitoring .v2-status-badge').first().waitFor();
    const badge = await page.locator('.process-cell-monitoring .v2-status-badge').first().evaluate(element => {
      const [icon, label] = element.children;
      const box = element.getBoundingClientRect();
      const text = label.getBoundingClientRect();
      return {
        display: getComputedStyle(element).display,
        space: text.left - icon.getBoundingClientRect().right,
        inside: text.left >= box.left && text.right <= box.right + 1
      };
    });
    const label = JSON.stringify({ width, ...badge });
    assert.equal(badge.display, 'flex', label);
    assert.ok(badge.space >= 3, `ícone separado do texto: ${label}`);
    assert.equal(badge.inside, true, `texto dentro do selo: ${label}`);
    assert.deepEqual(pageErrors, []);
    await context.close();
  }
} finally {
  await session.stop();
}
console.log('[PASS] Selo de monitoramento.');
process.exit(0);
