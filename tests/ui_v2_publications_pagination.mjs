import assert from 'node:assert/strict';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — PAGINAÇÃO INCREMENTAL DA LISTA DE PUBLICAÇÕES       ');
console.log('===============================================================\n');

const TOTAL = 130;
const PAGE = 80;

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });

  await page.evaluate(total => {
    const { Store, App } = window.Atrium;
    const now = new Date().toISOString();
    Store.state.intimations = Array.from({ length: total }, (_, index) => ({
      id: `pub-paginacao-${index}`,
      externalId: `djen:pub-paginacao-${index}`,
      title: `Publicação sintética ${index}`,
      process: '5000000-00.2026.8.21.0001',
      court: 'TJ Sintético',
      publishedAt: now.slice(0, 10),
      disponibilizadoEm: now.slice(0, 10),
      treatmentStatus: 'untreated',
      unread: true,
      text: `Conteúdo sintético da publicação ${index}.`
    }));
    App.switchView('inbox');
    App.renderInbox();
  }, TOTAL);

  await page.locator('#view-inbox.active').waitFor();
  const firstPage = await page.evaluate(() => ({
    rows: document.querySelectorAll('#inboxList [data-intimation-id]').length,
    loadMore: document.querySelector('[data-inbox-load-more]')?.textContent || '',
    summary: document.querySelector('.inbox-load-more small')?.textContent || '',
    overflow: document.documentElement.scrollWidth - innerWidth
  }));
  assert.equal(firstPage.rows, PAGE, 'A primeira página deve renderizar apenas o limite incremental.');
  assert.match(firstPage.loadMore, new RegExp(`Mostrar mais ${TOTAL - PAGE}`), 'O botão deve declarar quantas publicações restam.');
  assert.match(firstPage.summary, new RegExp(`${PAGE} de ${TOTAL}`), 'O resumo deve mostrar o progresso do recorte.');
  assert.ok(firstPage.overflow <= 2, `Overflow global de ${firstPage.overflow}px.`);
  console.log(`✓ Primeira página: ${firstPage.rows} linhas, restante declarado e sem overflow.`);

  await page.locator('[data-inbox-load-more]').click();
  await page.waitForFunction(total => document.querySelectorAll('#inboxList [data-intimation-id]').length === total, TOTAL);
  const complete = await page.evaluate(() => ({
    rows: document.querySelectorAll('#inboxList [data-intimation-id]').length,
    loadMore: Boolean(document.querySelector('[data-inbox-load-more]'))
  }));
  assert.equal(complete.rows, TOTAL);
  assert.equal(complete.loadMore, false, 'Sem restantes o controle de carregar mais desaparece.');
  console.log('✓ Carregar mais completa a lista e remove o controle.');

  await page.locator('#inboxFilters [data-filter="untreated"]').click();
  await page.waitForFunction(limit => document.querySelectorAll('#inboxList [data-intimation-id]').length === limit, PAGE);
  const reset = await page.evaluate(() => ({
    rows: document.querySelectorAll('#inboxList [data-intimation-id]').length,
    loadMore: Boolean(document.querySelector('[data-inbox-load-more]'))
  }));
  assert.equal(reset.rows, PAGE, 'Mudar o recorte reinicia o limite incremental.');
  assert.equal(reset.loadMore, true);
  console.log('✓ Mudança de recorte reinicia a paginação incremental.');

  assert.deepEqual(pageErrors, [], 'Erros de página no console.');
  console.log('\n>>> PAGINAÇÃO INCREMENTAL: PASS <<<\n');
  await context.close();
} finally {
  await session.stop();
}
