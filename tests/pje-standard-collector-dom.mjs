import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import {
  readExpedienteCandidates,
  selectExpedienteCells,
  expedienteIdentityFor,
  reconcilePjeCollection,
  PJE_COLLECTION_STATES
} from '../lib/judicial/pje/collectors/standard-painel.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — COLLECTOR PJe STANDARD (DOM REAL TJMT 2G)           ');
console.log('===============================================================\n');

// Estrutura fiel à aba "Expedientes Arvore" do relatório real (TJMT 2G):
// TABLE/TBODY/cabeçalhos/paginador + células por expediente com id no próprio id.
const CNJ = '5001234-56.2025.8.12.0001';
const HTML = `<!doctype html><html><body>
<table id="formExpedientes:tbExpedientes" class="rich-table header-fixed"><tbody id="formExpedientes:tbExpedientes:tb">
<tr><th id="formExpedientes:tbExpedientes:j_id565header" class="rich-table-subheadercell"><div id="formExpedientes:tbExpedientes:j_id565header:">Ações</div></th>
<th class="rich-table-subheadercell">Expediente</th></tr>
<tr><td id="formExpedientes:tbExpedientes:66338074:j_id5" class="rich-table-cell">HARIBERTO TESTE Acórdão (66338074) ${CNJ} Diário Eletrônico 19/09/2026<div id="formExpedientes:tbExpedientes:66338074:toolb"><span id="formExpedientes:tbExpedientes:66338074:btnRe">RESPONDER</span></div></td></tr>
<tr><td id="formExpedientes:tbExpedientes:65554026:j_id5" class="rich-table-cell">HARIBERTO TESTE Intimação de pauta (65554026) ${CNJ} Diário Eletrônico 06/09/2026</td></tr>
</tbody></table>
<div id="formExpedientes:tbExpedientes:j_id648" class="col-sm-12">Expedientes 2 resultados encontrados ${CNJ}</div>
<div id="formExpedientes:tbExpedientes:scPendentes" class="rich-datascr pull-left">1 2 3</div>
</body></html>`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(HTML);

  console.log('[D1] Scraper coleta candidatos sem decidir...');
  const read = await readExpedienteCandidates(page);
  assert.ok(read.candidates.length >= 6, `Esperados os nós da listagem; obtidos ${read.candidates.length}.`);
  assert.ok(Array.isArray(read.structure) && read.structure.length > 0, 'Árvore estrutural continua gravada.');
  console.log(`  ✓ ${read.candidates.length} candidatos raspados, decisão delegada à seleção.`);

  console.log('[D2] Seleção produz exatamente 1 linha por expediente real...');
  const selection = selectExpedienteCells(read.candidates);
  assert.equal(selection.rows.length, 2, `2 expedientes reais devem gerar 2 linhas; obtidas ${selection.rows.length}.`);
  const ids = selection.rows.map(row => row.rowIndex).sort();
  assert.deepEqual(ids, ['65554026', '66338074']);
  assert.ok(selection.rows.every(row => row.processNumber === CNJ));
  assert.ok(selection.stats.foraCelula >= 3, 'Tabela, tbody e cabeçalho/paginador ficam fora.');
  assert.ok(!selection.rows.some(row => /resultados encontrados/i.test(row.summary)), 'Cabeçalho jamais vira linha.');
  console.log('  ✓ 2 linhas (66338074, 65554026), sem fantasmas.');

  console.log('[D3] Identidades estáveis e reconciliação fecha com o contador...');
  const identities = selection.rows.map(row => expedienteIdentityFor(row)).sort();
  assert.deepEqual(identities, ['id:65554026', 'id:66338074']);
  const gate = reconcilePjeCollection({ expected: 2, collected: selection.rows.length });
  assert.equal(gate.state, PJE_COLLECTION_STATES.LOADED, 'Contador 2 x coletado 2 deve dar loaded, não partial.');
  assert.equal(gate.missing, 0);
  console.log('  ✓ id: estáveis; gate loaded (era partial 10/6 em produção).');

  console.log('[D4] Nó de ação sem CNJ e texto vazio continuam descartados...');
  const selection2 = selectExpedienteCells([
    { rowId: 'formExpedientes:tbExpedientes:66338074:btnRe', text: 'RESPONDER', externalId: '' },
    { rowId: 'formExpedientes:tbExpedientes:66338074:j_id5', text: '', externalId: '' }
  ]);
  assert.equal(selection2.rows.length, 0);
  assert.equal(selection2.stats.semCnj, 1);
  assert.equal(selection2.stats.semTexto, 1);
  console.log('  ✓ Sem CNJ / sem texto não geram linha.');

  await page.close();
} finally {
  await browser.close();
}

console.log('\n>>> COLLECTOR PJe STANDARD DOM 2G: PASS <<<\n');
