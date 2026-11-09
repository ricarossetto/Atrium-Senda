import assert from 'node:assert/strict';
import { layoutPublicationText } from '../js/core/publication-text-layout.js';

console.log('--- Iniciando Testes: organização do texto da publicação ---');

const compact = value => value.replace(/\s+/g, '');
const flatten = layout => layout.blocks.map(block => block.type === 'field' ? block.label + block.value : block.text).join('');
const kinds = layout => layout.blocks.map(block => block.type);

// Texto curto ou com quebras próprias fica como veio.
const short = layoutPublicationText('Texto oficial\ncom 15 dias sem prazo cadastrado.');
assert.equal(short.structured, false);
assert.equal(short.text, 'Texto oficial\ncom 15 dias sem prazo cadastrado.');
assert.equal(layoutPublicationText('').structured, false);
assert.equal(layoutPublicationText(null).text, '');

const withBreaks = 'Primeira linha oficial. '.repeat(12) + '\n' + 'ADVOGADO(A): TESTE (OAB RS000000) '.repeat(4);
assert.equal(layoutPublicationText(withBreaks).structured, false, 'quebra vinda da fonte é respeitada');

// Identificação, advogados e decisão colados em uma linha.
const glued = 'Tribunal Teste - Intimação no processo 0000000-00.2026.8.21.0000/RS Classe: Procedimento Comum '
  + 'ADVOGADO(A): ADVOGADA TESTE UM (OAB RS000000) ADVOGADO(A): ADVOGADO TESTE DOIS (OAB RS000001) '
  + 'AUTOR: CLIENTE TESTE RÉU: EMPRESA TESTE LTDA DECISÃO Vistos. Trata-se de ação de cobrança proposta por Cliente Teste. '
  + 'O art. 5 do Código e o n. 12 do ato seguem citados. Intime-se a parte autora para se manifestar. Ante o exposto, defiro o pedido. Cumpra-se.';
const layout = layoutPublicationText(glued);
assert.equal(layout.structured, true);
assert.equal(compact(flatten(layout)), compact(glued), 'nenhuma palavra muda');
const fields = layout.blocks.filter(block => block.type === 'field').map(block => block.label.trim());
assert.deepEqual(fields, ['Classe:', 'ADVOGADO(A):', 'ADVOGADO(A):', 'AUTOR:', 'RÉU:']);
assert.equal(layout.blocks.find(block => block.label === 'ADVOGADO(A):').value, 'ADVOGADA TESTE UM (OAB RS000000)');
assert.ok(layout.blocks.some(block => block.type === 'heading' && block.text === 'DECISÃO'));
for (const start of ['Vistos.', 'Trata-se', 'Intime-se', 'Ante o exposto', 'Cumpra-se']) {
  assert.ok(layout.blocks.some(block => block.type === 'paragraph' && block.text.startsWith(start)), start);
}
assert.ok(!layout.blocks.some(block => block.text?.startsWith('5 do Código')), 'abreviação não quebra parágrafo');

// Título composto e sinal solto não viram linha própria.
const composed = layoutPublicationText('Ação sintética RÉU : CLIENTE TESTE DESPACHO/DECISÃO Trata-se de ação sintética com texto suficiente para organizar. '.repeat(3));
assert.ok(composed.blocks.some(block => block.type === 'heading' && block.text === 'DESPACHO/DECISÃO'));
assert.ok(!composed.blocks.some(block => /^[^\p{L}\d]+$/u.test(block.text || '')), 'nenhuma linha só de sinais');
assert.equal(compact(flatten(composed)), compact('Ação sintética RÉU : CLIENTE TESTE DESPACHO/DECISÃO Trata-se de ação sintética com texto suficiente para organizar. '.repeat(3)));

// Rótulo em minúsculas no meio da frase não vira campo.
const inline = 'A parte foi intimada e o advogado: compareceu ao ato. '.repeat(6);
assert.ok(!kinds(layoutPublicationText(inline)).includes('field'));

// Acórdão com seções e parágrafo longo.
const sentence = 'O recurso apresenta fundamentos que foram examinados pelo colegiado nesta sessão. ';
const judgment = 'EMENTA ' + 'DIREITO CIVIL. RECURSO. '.repeat(2) + 'CASO EM EXAME 1. Apelação. QUESTÃO EM DISCUSSÃO 2. A questão. RAZÕES DE DECIDIR ' + sentence.repeat(20) + 'DISPOSITIVO 4. Recurso desprovido. Tese de julgamento: teste sintético.';
const judgmentLayout = layoutPublicationText(judgment);
assert.equal(compact(flatten(judgmentLayout)), compact(judgment));
assert.deepEqual(judgmentLayout.blocks.filter(block => block.type === 'heading').map(block => block.text), ['EMENTA', 'CASO EM EXAME', 'QUESTÃO EM DISCUSSÃO', 'RAZÕES DE DECIDIR', 'DISPOSITIVO']);
for (const block of judgmentLayout.blocks) assert.ok((block.text || block.value).length < 700, 'parágrafo longo é dividido');

// Propriedade: qualquer mistura preserva o conteúdo.
const pieces = ['ADVOGADO(A): TESTE (OAB RS000000)', 'RELATOR: TESTE', 'Prazo: 15 dias', 'DECISÃO', 'Vistos.', 'I - Item.', '1. Outro item.', 'art. 5.', 'Fim da frase.', 'Juízo: 1ª Vara', 'texto (com parênteses)', 'R$ 1.234,56.'];
let seed = 7;
const next = limit => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % limit; };
for (let round = 0; round < 500; round++) {
  const text = Array.from({ length: 10 + next(30) }, () => pieces[next(pieces.length)]).join(' ');
  const result = layoutPublicationText(text);
  if (result.structured) assert.equal(compact(flatten(result)), compact(text));
  else assert.equal(result.text, text);
}

console.log('[PASS] Organização do texto da publicação.');
