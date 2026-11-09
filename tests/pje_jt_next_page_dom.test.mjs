import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { collectPjeJtRowPages, markPjeJtNextPage } from '../lib/judicial/pje/collectors/pje-jt.mjs';

console.log('--- Iniciando Testes: PJe trabalhista encontra o botão de próxima página ---');

const CNJ = index => `000000${index}-00.2026.5.04.0001`;
const table = pageNumber => `<table><tr><th>Processo</th></tr><tr><td>${CNJ(pageNumber)} <button aria-label="Próxima audiência"><i class="fa fa-chevron-right"></i></button></td></tr></table>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();

  // Dica só em aria-describedby: o caso em que o seletor por atributo não achava nada.
  await page.setContent(`
    <button id="menu"><i class="fa fa-chevron-right"></i></button>
    <div id="area">${table(1)}</div>
    <div class="rodape"><span>1 - 10 de 20</span>
      <button id="last" aria-describedby="t2"><i class="fa fa-angle-double-right"></i></button>
      <button id="go" aria-describedby="t1"><i class="fa fa-angle-right"></i></button>
    </div>
    <div style="display:none"><div id="t1">Próxima página</div><div id="t2">Última página</div></div>`);
  let marked = await markPjeJtNextPage(page);
  assert.equal(marked.found, true);
  assert.equal(marked.matchedBy, 'label');
  assert.equal(await page.locator('[data-atrium-next-page]').getAttribute('id'), 'go');
  assert.deepEqual(marked.ranges, ['1 - 10 de 20']);

  // Sem rótulo: vale o ícone perto da paginação, nunca o ícone do menu nem o de última página.
  await page.setContent(`
    <button id="menu"><i class="fa fa-chevron-right"></i></button>
    <div class="rodape"><span>Página 1 de 2</span>
      <button id="go"><i class="fa fa-angle-right"></i></button>
      <button id="last"><i class="fa fa-angle-double-right"></i></button>
    </div>`);
  marked = await markPjeJtNextPage(page);
  assert.equal(marked.matchedBy, 'icon');
  assert.equal(await page.locator('[data-atrium-next-page]').getAttribute('id'), 'go');

  // Sem paginador: nada é marcado e os botões das linhas não são candidatos.
  await page.setContent(`<button id="menu"><i class="fa fa-chevron-right"></i></button>${table(1)}`);
  marked = await markPjeJtNextPage(page);
  assert.equal(marked.found, false);
  assert.equal(await page.locator('[data-atrium-next-page]').count(), 0);
  assert.equal(marked.candidates.length, 1);

  // Fluxo completo: percorre as páginas e para no botão desabilitado pela classe.
  await page.setContent(`
    <div id="area">${table(1)}</div>
    <div class="rodape"><span id="faixa">1 - 10 de 30</span><button id="go" aria-label="Próxima página"></button></div>`);
  await page.evaluate(table2 => {
    let current = 1;
    document.getElementById('go').addEventListener('click', () => {
      current += 1;
      document.getElementById('area').innerHTML = table2.replace('0000001', `000000${current}`);
      if (current === 3) document.getElementById('go').classList.add('mat-button-disabled');
    });
  }, table(1));
  const diagnostics = {};
  const rows = await collectPjeJtRowPages(page, { diagnostics, waitMs: 2000, stepMs: 20 });
  assert.equal(rows.length, 3);
  assert.equal(diagnostics.pages, 3);
  assert.equal(diagnostics.stopReason, 'ultima_pagina');
} finally {
  await browser.close();
}

console.log('[PASS] PJe trabalhista encontra o botão de próxima página.');
