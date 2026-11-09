import assert from 'node:assert/strict';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const session = await startUiV2Session({ headless: true });
const context = await session.createContext();
let page;
let pageErrors;

try {
  ({ page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true }));
  const button = page.locator('#quickAddButton');
  await button.waitFor();

  assert.equal(await button.getAttribute('aria-haspopup'), 'menu');
  assert.equal(await button.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#quickAddMenu').getAttribute('hidden'), '');

  const mutationsBefore = await page.evaluate(() => globalThis.__uiV2RuntimeProbe.mutationRequests.length);
  await button.click();
  await page.locator('#quickAddMenu:not([hidden])').waitFor();
  assert.equal(await button.getAttribute('aria-expanded'), 'true');

  const labels = await page.locator('#quickAddMenu [data-quick-add]').allTextContents();
  assert.deepEqual(labels.map(label => label.trim()), [
    'Nova tarefa',
    'Novo compromisso',
    'Novo contato',
    'Novo processo',
    'Novo lançamento',
    'Novo atendimento'
  ]);
  assert.equal(await page.locator('#quickAddMenu [role="menuitem"]').count(), 6);
  const mutationsAfter = await page.evaluate(() => globalThis.__uiV2RuntimeProbe.mutationRequests.length);
  assert.equal(mutationsAfter, mutationsBefore, 'Abrir o menu não pode disparar mutation.');

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('quickAddMenu')?.hidden === true);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'quickAddButton', 'Escape deve devolver o foco ao gatilho.');

  await button.focus();
  await page.keyboard.press('ArrowDown');
  await page.locator('#quickAddMenu:not([hidden])').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.dataset?.quickAdd), 'task');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset?.quickAdd), 'appointment');
  await page.keyboard.press('End');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset?.quickAdd), 'lead');
  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset?.quickAdd), 'task');

  await page.keyboard.press('Enter');
  await page.locator('#modalBackdrop:not(.hidden)').waitFor();
  assert.match(await page.locator('#modalTitle').textContent(), /tarefa/i, 'O item de tarefa deve abrir o modal existente com o título esperado.');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('modalBackdrop')?.classList.contains('hidden'));
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'quickAddButton', 'O modal deve devolver o foco ao gatilho do quick-add.');

  assert.deepEqual(pageErrors, []);
  console.log('✓ Quick-add aprovado: menu, seis destinos, teclado, foco e reuso dos modais existentes.');
} finally {
  await session.stop();
}
