import assert from 'node:assert/strict';
import { collectPjeJtRowPages, readPjeJtCardCounters } from '../lib/judicial/pje/collectors/pje-jt.mjs';

console.log('--- Iniciando Testes: PJe trabalhista lê todas as páginas ---');

function fakePage(pages) {
  let index = 0;
  const next = {
    first: () => next,
    count: async () => 1,
    isDisabled: async () => index >= pages.length - 1,
    click: async () => { index += 1; }
  };
  return {
    evaluate: async () => pages[index],
    locator: () => next,
    waitForTimeout: async () => {},
    clicks: () => index
  };
}

const row = text => ({ id: '', externalId: '', text, links: [] });

{
  const page = fakePage([[row('A'), row('B')], [row('C'), row('D')], [row('E')]]);
  const rows = await collectPjeJtRowPages(page);
  assert.deepEqual(rows.map(item => item.text), ['A', 'B', 'C', 'D', 'E'], 'Reúne as linhas de todas as páginas.');
  assert.equal(page.clicks(), 2, 'Para quando o botão de próxima fica desabilitado.');
}

{
  const single = fakePage([[row('A')]]);
  assert.equal((await collectPjeJtRowPages(single)).length, 1);
  assert.equal(single.clicks(), 0);
}

{
  // Página que não muda depois do clique não vira laço infinito.
  let clicks = 0;
  const stuck = {
    evaluate: async () => [row('A')],
    locator: () => ({ first() { return this; }, count: async () => 1, isDisabled: async () => false, click: async () => { clicks += 1; } }),
    waitForTimeout: async () => {}
  };
  const rows = await collectPjeJtRowPages(stuck, { waitMs: 5, stepMs: 1 });
  assert.equal(rows.length, 1);
  assert.equal(clicks, 1);
}

{
  // Sem paginador, lê a página atual.
  const plain = { evaluate: async () => [row('A')] };
  assert.equal((await collectPjeJtRowPages(plain)).length, 1);
}

{
  // Diagnóstico diz quantas páginas foram lidas e por que parou.
  const diagnostics = {};
  const page = fakePage([[row('A')], [row('B')]]);
  await collectPjeJtRowPages(page, { diagnostics });
  assert.equal(diagnostics.pages, 2);
  assert.equal(diagnostics.stopReason, 'ultima_pagina');
  assert.equal(diagnostics.rows, 2);
}

{
  // Botão não encontrado encerra sem clicar e guarda os candidatos para diagnóstico.
  const diagnostics = {};
  let clicks = 0;
  const responses = [[row('A')], { found: false, matchedBy: '', disabled: false, ranges: ['1 - 10 de 38'], candidates: [{ label: 'x' }] }];
  const page = {
    evaluate: async () => responses.shift(),
    locator: () => ({ first() { return this; }, count: async () => 1, isDisabled: async () => false, click: async () => { clicks += 1; } }),
    waitForTimeout: async () => {}
  };
  const rows = await collectPjeJtRowPages(page, { diagnostics, waitMs: 5, stepMs: 1 });
  assert.equal(rows.length, 1);
  assert.equal(clicks, 0);
  assert.equal(diagnostics.stopReason, 'botao_nao_encontrado');
  assert.deepEqual(diagnostics.ranges, ['1 - 10 de 38']);
}

{
  // Botão marcado como desabilitado pelo portal é última página.
  const diagnostics = {};
  let clicks = 0;
  const responses = [[row('A')], { found: true, matchedBy: 'icon', disabled: true, ranges: [], candidates: [] }];
  const page = {
    evaluate: async () => responses.shift(),
    locator: () => ({ first() { return this; }, count: async () => 1, isDisabled: async () => false, click: async () => { clicks += 1; } }),
    waitForTimeout: async () => {}
  };
  await collectPjeJtRowPages(page, { diagnostics });
  assert.equal(clicks, 0);
  assert.equal(diagnostics.stopReason, 'ultima_pagina');
  assert.equal(diagnostics.matchedBy, 'icon');
}

{
  // Cartão com o número antes ou depois do rótulo.
  globalThis.document = {
    querySelectorAll: () => [{ innerText: '18 Acervo Geral' }, { innerText: 'Meus Expedientes 3' }, { innerText: 'Menu sem numero' }]
  };
  const page = { evaluate: fn => Promise.resolve(fn()) };
  assert.deepEqual(await readPjeJtCardCounters(page), { acervo: 18, expedientes: 3 });
  delete globalThis.document;
}

console.log('[PASS] PJe trabalhista lê todas as páginas.');
