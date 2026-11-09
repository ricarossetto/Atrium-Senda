import assert from 'node:assert/strict';
import {
  PROCEDURAL_DEADLINES,
  ACTION_TYPE_RULES,
  detectActionType,
  compatibleDeadlinesForDays,
  buildProcessContextBlock,
  summarizeProcessKnowledge,
  PROCESS_KNOWLEDGE_VERSION
} from '../lib/jev-beta/process-knowledge.mjs';
import { buildLegalContextBlock } from '../lib/jev-beta/legal-context.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — CONHECIMENTO PROCESSUAL DETERMINÍSTICO (JEV)        ');
console.log('===============================================================\n');

console.log('[P1] Prazos legais têm base normativa e nunca produzem data...');
{
  assert.equal(PROCESS_KNOWLEDGE_VERSION, 'jev-process-knowledge-v1');
  assert.equal(PROCEDURAL_DEADLINES.contestacao.days, 15);
  assert.match(PROCEDURAL_DEADLINES.contestacao.basis, /CPC 335/);
  assert.equal(PROCEDURAL_DEADLINES.embargos_declaracao.days, 5);
  assert.equal(PROCEDURAL_DEADLINES.apelacao_criminal.days, 5);
  assert.equal(PROCEDURAL_DEADLINES.embargos_declaracao_criminal.days, 2);
  assert.equal(PROCEDURAL_DEADLINES.recurso_ordinario_trabalhista.days, 8);
  assert.equal(PROCEDURAL_DEADLINES.defesa_trabalhista.days, null, 'defesa trabalhista não é prazo em dias.');
  for (const item of Object.values(PROCEDURAL_DEADLINES)) {
    assert.ok(item.basis, 'todo prazo precisa de base normativa.');
    assert.ok(item.note, 'todo prazo precisa explicar o termo inicial.');
    assert.ok(!('deadline' in item) && !('fatalDeadline' in item), 'a base não injeta campo de prazo.');
  }
  const compat = compatibleDeadlinesForDays(5);
  assert.ok(compat.some(item => item.key === 'embargos_declaracao'));
  assert.ok(compat.some(item => item.key === 'apelacao_criminal'));
  assert.ok(!compat.some(item => item.key === 'contestacao'));
  assert.deepEqual(compatibleDeadlinesForDays(0), []);
  assert.deepEqual(compatibleDeadlinesForDays(9999), []);
  console.log('  OK: base normativa íntegra; compatibilidade por dias é só referência.');
}

console.log('[P2] Tipos de ação reconhecidos por sinais objetivos...');
{
  const executivo = detectActionType('Execução fiscal, CDA 2026/001 e ICMS.');
  assert.equal(executivo[0].id, 'execucao_fiscal');
  assert.equal(executivo[0].area, 'tributario');

  assert.ok(detectActionType('Cumprimento de sentença, intimação para pagar em 15 dias.').some(item => item.id === 'cumprimento_sentenca'));
  assert.ok(detectActionType('Ação monitória fundada em duplicata.').some(item => item.id === 'monitoria'));
  assert.ok(detectActionType('Busca e apreensão com alienação fiduciária, Decreto-Lei 911.').some(item => item.id === 'busca_apreensao'));
  assert.ok(detectActionType('Impetrante requer mandado de segurança contra ato do impetrado.').some(item => item.id === 'mandado_seguranca'));
  assert.ok(detectActionType('Ação rescisória da sentença que transitou em julgado.').some(item => item.id === 'acao_rescisoria'));
  assert.ok(detectActionType('Habeas corpus em favor do paciente.').some(item => item.id === 'habeas_corpus'));
  assert.ok(detectActionType('Reclamação trabalhista distribuída à vara do trabalho.').some(item => item.id === 'reclamacao_trabalhista'));
  assert.ok(detectActionType('Ação previdenciária de revisão de benefício do INSS.').some(item => item.id === 'acao_previdenciaria'));
  assert.deepEqual(detectActionType('Texto sem sinal processual claro.'), []);
  for (const rule of ACTION_TYPE_RULES) {
    assert.ok(rule.terms.length >= 1 && rule.label && rule.area, 'regra completa');
  }
  console.log('  OK: tipos de ação por sinal objetivo, sem adivinhação.');
}

console.log('[P3] Bloco de apoio: compacto, sem ecoar texto e sem prometer prazo...');
{
  const block = buildProcessContextBlock({
    schemaId: 'publication_triage',
    text: 'Execução fiscal. Prazo de 30 dias. CPF 123.456.789-09 e SEGREDO-SINTETICO.'
  });
  assert.match(block, /execução fiscal/i);
  assert.match(block, /30 dias/);
  assert.match(block, /embargar a execução fiscal \(LEF 16\)/i);
  assert.match(block, /não calcula, não estima e não grava prazo/i);
  assert.ok(!block.includes('123.456.789-09'));
  assert.ok(!block.includes('SEGREDO-SINTETICO'));
  assert.ok(!/deadline/i.test(block));
  assert.ok(block.length <= 1600);

  assert.equal(buildProcessContextBlock({ schemaId: 'intent_routing', text: 'x' }), '', 'schemas fora do escopo não recebem bloco.');

  const legal = buildLegalContextBlock({ schemaId: 'process_triage', text: 'Cumprimento de sentença com intimação para pagar.' });
  assert.match(legal, /APOIO PROCESSUAL DETERMINÍSTICO/);
  assert.match(legal, /cumprimento de sentença/i);
  assert.match(legal, /CPC 523/);

  const summary = summarizeProcessKnowledge('Apelação com prazo de 15 dias.');
  assert.equal(summary.daysMentioned, 15);
  assert.ok(Array.isArray(summary.actionTypes));
  console.log('  OK: bloco limitado, sem PII e integrado ao contexto jurídico.');
}

console.log('\n>>> CONHECIMENTO PROCESSUAL: PASS <<<\n');
