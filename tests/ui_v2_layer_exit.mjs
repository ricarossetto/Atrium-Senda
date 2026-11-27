import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2Page, startUiV2Session, switchUiV2View } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2: SAÍDA DE CAMADAS, MENUS E AVISOS');
console.log('===============================================================\n');

// Contrato estático: a saída mora no motion.css, usa os tokens e não muda o estado na hora errada.
const [motion, modalSource, toastSource] = await Promise.all([
  readFile(path.join(ROOT, 'css/views/ui-v2/motion.css'), 'utf8'),
  readFile(path.join(ROOT, 'js/components/modal.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/components/toast.js'), 'utf8')
]);
assert.match(motion, /\.modal-backdrop[^{]*\)\.hidden \{[\s\S]*?transition-behavior: allow-discrete;[\s\S]*?animation: v2-layer-exit var\(--v2-duration-fast\) var\(--v2-ease-exit\) both;/);
assert.match(motion, /\.modal-combobox-listbox\)\.hidden \{[\s\S]*?animation: v2-popover-exit var\(--v2-duration-fast\)/);
assert.match(motion, /\.toast\.is-leaving \{[\s\S]*?animation: v2-feedback-exit/);
assert.match(modalSource, /backdrop\?\.classList\.add\('hidden'\);/, 'A classe .hidden continua entrando na hora.');
assert.match(toastSource, /setTimeout\(\(\) => toast\.remove\(\), lifetime\);/, 'O aviso sai do DOM no mesmo momento de antes.');

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl);
  const layer = selector => page.evaluate(sel => {
    const element = document.querySelector(sel);
    const style = getComputedStyle(element);
    return { hidden: element.classList.contains('hidden'), display: style.display, animation: style.animationName, pointer: style.pointerEvents };
  }, selector);

  // Gaveta do Financeiro: fecha com Escape.
  await switchUiV2View(page, 'financial');
  await page.locator('#newFinancialEntryButton').click();
  await page.locator('#financialEntryBackdrop:not(.hidden)').waitFor();
  await page.locator('#financialEntryBackdrop .financial-entry-modal').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  await page.keyboard.press('Escape');
  const exiting = await layer('#financialEntryBackdrop');
  assert.equal(exiting.hidden, true, 'A classe .hidden entra na hora.');
  assert.notEqual(exiting.display, 'none', 'Durante a saída a camada ainda aparece.');
  assert.equal(exiting.animation, 'v2-layer-exit');
  assert.equal(exiting.pointer, 'none', 'A camada que sai não recebe clique.');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'newFinancialEntryButton', 'O foco volta ao botão na hora, sem esperar a saída.');
  assert.equal(await page.evaluate(() => document.getElementById('appShell').hasAttribute('inert')), false, 'A página volta a responder na hora.');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('financialEntryBackdrop')).display === 'none', null, { timeout: 1000 });

  // Clique que atravessa a camada saindo: reabre no meio da saída e a entrada recomeça.
  await page.locator('#newFinancialEntryButton').click();
  await page.locator('#financialEntryBackdrop:not(.hidden)').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('#newFinancialEntryButton').click();
  const reopened = await layer('#financialEntryBackdrop');
  assert.equal(reopened.hidden, false);
  assert.notEqual(reopened.animation, 'v2-layer-exit', 'Reabrir no meio da saída troca para a entrada.');
  await page.waitForTimeout(250);
  assert.notEqual((await layer('#financialEntryBackdrop')).display, 'none', 'Reaberta, a camada não some ao fim da saída anterior.');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('financialEntryBackdrop')).display === 'none', null, { timeout: 1000 });

  // Modal genérico (Contatos): o formato de gaveta só sai depois do fade.
  await page.evaluate(() => {
    window.Atrium.Store.state.contacts = [{ id: 'exit-contact', name: 'Contato Saída Teste', type: 'cliente', role: 'cliente', document: '', email: 'saida@example.test' }];
  });
  await switchUiV2View(page, 'contacts');
  await page.locator('[data-contact-id="exit-contact"]').first().click();
  await page.locator('[data-contact-edit]').click();
  await page.locator('#modalBackdrop[data-modal-mode="contact"]:not(.hidden)').waitFor();
  await page.locator('#modalBackdrop .modal').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  const sheetBox = await page.locator('#modalBackdrop .modal').boundingBox();
  await page.keyboard.press('Escape');
  const discard = page.locator('[data-discard-changes]');
  if (await discard.count()) await discard.click();
  assert.equal(await page.locator('#modalBackdrop').getAttribute('data-modal-mode'), 'contact', 'O modo continua durante a saída.');
  const fadingBox = await page.locator('#modalBackdrop .modal').boundingBox();
  assert.ok(fadingBox && Math.abs(fadingBox.x - sheetBox.x) <= 2 && Math.abs(fadingBox.width - sheetBox.width) <= 2, 'A gaveta não troca de formato enquanto some.');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('modalBackdrop')).display === 'none', null, { timeout: 1000 });
  assert.equal(await page.locator('#modalBackdrop').evaluate(element => getComputedStyle(element).display), 'none');

  // Menu "Novo" (quick-add): some com a saída de menu.
  await switchUiV2View(page, 'dashboard');
  await page.locator('#quickAddButton').click();
  await page.locator('#quickAddMenu:not(.hidden)').waitFor();
  await page.keyboard.press('Escape');
  const menu = await layer('#quickAddMenu');
  assert.equal(menu.hidden, true);
  assert.equal(menu.animation, 'v2-popover-exit');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('quickAddMenu')).display === 'none', null, { timeout: 1000 });

  // Aviso: recebe .is-leaving antes de sair, e sai do DOM no mesmo tempo de antes.
  await page.evaluate(() => window.Atrium.App.toast('Aviso sintético de saída', 'success'));
  const toast = page.locator('#toastRegion .toast').filter({ hasText: 'Aviso sintético de saída' });
  await toast.waitFor();
  const timing = await page.evaluate(() => new Promise(resolve => {
    const element = [...document.querySelectorAll('#toastRegion .toast')].find(item => item.textContent.includes('Aviso sintético de saída'));
    const start = performance.now();
    let leavingAt = null;
    const tick = () => {
      if (leavingAt === null && element.classList.contains('is-leaving')) leavingAt = performance.now() - start;
      if (!element.isConnected) { resolve({ leavingAt, removedAt: performance.now() - start }); return; }
      requestAnimationFrame(tick);
    };
    tick();
  }));
  assert.ok(timing.leavingAt !== null && timing.removedAt - timing.leavingAt >= 100, `A saída começa antes da remoção (${JSON.stringify(timing)}).`);
  assert.ok(timing.removedAt < 4600, 'O tempo total do aviso continua o mesmo.');
  assert.deepEqual(pageErrors, []);

  // Movimento reduzido: fecha de uma vez.
  const reducedContext = await session.createContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const reduced = await prepareUiV2Page(reducedContext, session.server.baseUrl);
  await switchUiV2View(reduced.page, 'financial');
  await reduced.page.locator('#newFinancialEntryButton').click();
  await reduced.page.locator('#financialEntryBackdrop:not(.hidden)').waitFor();
  await reduced.page.keyboard.press('Escape');
  // Mede a intenção (saída sem movimento), não o relógio: um teto de 120 ms falhava por carga da
  // máquina mesmo com a saída instantânea.
  const saidaReduzida = await reduced.page.evaluate(() => {
    const style = getComputedStyle(document.getElementById('financialEntryBackdrop'));
    const segundos = value => Math.max(...String(value).split(',').map(part => (part.trim().endsWith('ms') ? parseFloat(part) / 1000 : parseFloat(part)) || 0));
    return { animation: segundos(style.animationDuration), transition: segundos(style.transitionDuration) };
  });
  assert.ok(saidaReduzida.animation <= 0.001 && saidaReduzida.transition <= 0.001, `com movimento reduzido a saída não anima (${JSON.stringify(saidaReduzida)})`);
  await reduced.page.waitForFunction(() => getComputedStyle(document.getElementById('financialEntryBackdrop')).display === 'none', null, { timeout: 1000 });
  assert.deepEqual(reduced.pageErrors, []);
  await reducedContext.close();
} finally {
  await session.stop();
}

console.log('✓ Saída: camadas, gaveta do modal genérico, reabertura, menu, aviso e movimento reduzido aprovados.');
