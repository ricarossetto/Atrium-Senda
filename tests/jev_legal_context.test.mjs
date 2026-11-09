import assert from 'node:assert/strict';
import {
  buildLegalContextBlock,
  detectActionSignals,
  detectActSignals,
  detectLegalSignals,
  LEGAL_CONTEXT_VERSION
} from '../lib/jev-beta/legal-context.mjs';
import { buildProviderDecisionPrompt } from '../lib/jev-beta/provider-transport.mjs';
import { getJevSchema } from '../lib/jev-beta/schemas.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — CONTEXTO JURÍDICO DETERMINÍSTICO DO CLASSIFICADOR');
console.log('===============================================================\n');

console.log('[T1] Sinais de área reconhecem matérias civis e áreas específicas...');
{
  assert.equal(LEGAL_CONTEXT_VERSION, 'jev-legal-context-v1');
  const succession = detectLegalSignals('Inventário e arrolamento para partilha de herança.');
  assert.ok(succession.some(signal => signal.area === 'civil' && signal.topic === 'sucessoes'));

  const family = detectLegalSignals('Ação de divórcio com guarda e alimentos; pensão alimentícia.');
  assert.ok(family.some(signal => signal.area === 'civil' && signal.topic === 'familia'));
  assert.ok(!family.some(signal => signal.area === 'previdenciario'));

  const tax = detectLegalSignals('Execução fiscal contra o Município de Teste; CDA e ICMS.');
  assert.ok(tax.some(signal => signal.area === 'tributario'));

  const socialSecurity = detectLegalSignals('Aposentadoria por incapacidade no INSS; auxílio-doença.');
  assert.ok(socialSecurity.some(signal => signal.area === 'previdenciario'));
  assert.ok(detectLegalSignals('Segurado especial rural requer salário-maternidade.').some(signal => signal.area === 'previdenciario'));
  assert.ok(detectLegalSignals('Pedido de auxílio-reclusão.').some(signal => signal.area === 'previdenciario'));

  const labor = detectLegalSignals('Reclamação trabalhista; verbas rescisórias e horas extras na CLT.');
  assert.ok(labor.some(signal => signal.area === 'trabalhista'));
  assert.ok(detectLegalSignals('Reconhecimento de vínculo empregatício e rescisão indireta.').some(signal => signal.area === 'trabalhista'));

  const criminal = detectLegalSignals('Habeas corpus e medida protetiva da Lei Maria da Penha.');
  assert.ok(criminal.some(signal => signal.area === 'criminal'));

  const trademarks = detectLegalSignals('Registro de marca no INPI com oposição de patente.');
  assert.ok(trademarks.some(signal => signal.area === 'marcas'));

  const publicEntity = detectLegalSignals('Ação de improbidade contra servidor público; licitação.');
  assert.ok(publicEntity.some(signal => signal.area === 'fazenda'));

  const civil = detectLegalSignals('Contrato de locação e ação de despejo; cobrança de aluguel.');
  assert.ok(civil.some(signal => signal.area === 'civil'));

  assert.deepEqual(detectLegalSignals('Texto genérico sem matéria identificável.'), []);
}

console.log('[T2] Sinais de ato e de providência usam o vocabulário do CPC...');
{
  assert.ok(detectActSignals('Despacho de mero expediente.').some(signal => signal.act === 'despacho'));
  assert.ok(detectActSignals('Sentença que julgo procedente o pedido.').some(signal => signal.act === 'sentenca'));
  assert.ok(detectActSignals('Acórdão da turma.').some(signal => signal.act === 'decisao'));
  assert.ok(detectActSignals('Cumprimento de sentença e penhora.').some(signal => signal.act === 'cumprimento'));
  assert.ok(detectActSignals('Saneamento e organização do processo.').some(signal => signal.act === 'decisao'));
  assert.ok(detectActSignals('Julgamento antecipado parcial do mérito.').some(signal => signal.act === 'decisao'));
  assert.ok(!detectActSignals('Licitação para saneamento básico.').some(signal => signal.act === 'decisao'));
  assert.ok(detectActSignals('Apelação e contrarrazões.').some(signal => signal.act === 'recurso'));

  assert.ok(detectActionSignals('Apresentar contrarrazões de apelação.').some(signal => signal.action === 'recorrer'));
  assert.ok(detectActionSignals('Pagar custas e preparo.').some(signal => signal.action === 'pagar_guia'));
  assert.ok(detectActionSignals('Juntar procuração e substabelecimento.').some(signal => signal.action === 'juntar_documento'));
  assert.ok(detectActionSignals('Cumprimento de sentença.').some(signal => signal.action === 'cumprimento_sentenca'));
  assert.ok(detectActionSignals('Prazo para apresentação de defesa e contestação.').some(signal => signal.action === 'contestar'));
}

console.log('[T3] Bloco de apoio é limitado, não ecoa o texto e não contém prazo fatal...');
{
  const block = buildLegalContextBlock({
    schemaId: 'publication_triage',
    text: 'Inventário e arrolamento. SEGREDO-SINTETICO-123. CPF 123.456.789-09.'
  });
  assert.match(block, /APOIO JURÍDICO DETERMINÍSTICO/);
  assert.match(block, /sucessões/);
  assert.ok(!block.includes('SEGREDO-SINTETICO-123'));
  assert.ok(!block.includes('123.456.789-09'));
  assert.ok(!block.includes('deadline'));
  assert.ok(!block.includes('fatalDeadline'));
  assert.ok(block.length <= 2400);

  const processBlock = buildLegalContextBlock({ schemaId: 'process_triage', text: 'Sentença e apelação.' });
  assert.match(processBlock, /CPC 203/);
  assert.match(processBlock, /sentença/);

  const actionBlock = buildLegalContextBlock({ schemaId: 'publication_action', text: 'Pagar custas e juntar procuração.' });
  assert.match(actionBlock, /pagar_guia/);
  assert.match(actionBlock, /juntar_documento/);

  const taskBlock = buildLegalContextBlock({ schemaId: 'task_triage', text: 'Tarefa sintética privada.' });
  assert.match(taskBlock, /atividade principal/i);
  assert.match(taskBlock, /não cria prazo/i);
  assert.doesNotMatch(taskBlock, /Tarefa sintética privada/);
  const duplicateBlock = buildLegalContextBlock({ schemaId: 'task_duplicate_check', text: 'Texto sintético privado' });
  assert.match(duplicateBlock, /mesma publicação.*não.*mesma providência/i);
  assert.match(duplicateBlock, /incerto/i);
  assert.doesNotMatch(duplicateBlock, /Texto sintético privado/);
}

console.log('[T4] Prompt do provedor usa o texto original, não o bloco de calibração...');
{
  const prompt = buildProviderDecisionPrompt({
    schemaId: 'publication_triage',
    state: 'Exemplo de calibração sintética: inventário e arrolamento.\n\n<texto>\nCobrança de contrato.\n</texto>',
    legalText: 'Cobrança de contrato.'
  });
  const text = prompt.contents[0].parts[0].text;
  assert.match(prompt.systemInstruction, /não calcula prazo/);
  assert.match(text, /APOIO JURÍDICO DETERMINÍSTICO/);
  assert.match(text, /Sinais objetivos no texto: contrato/);
  assert.ok(!text.includes('Sinais objetivos no texto: inventário'));
}

console.log('[T5] Critérios dos schemas carregam a distinção jurídica sem mudar rótulos...');
{
  const publication = getJevSchema('publication_triage');
  const area = publication.questions.find(question => question.key === 'area');
  assert.match(area.criteria.civil, /sucessões/);
  assert.match(area.criteria.civil, /locação/);
  assert.match(area.criteria.tributario, /Execução fiscal/);
  assert.match(area.criteria.fazenda, /tributário/);
  assert.deepEqual([...area.labels], ['civil', 'trabalhista', 'previdenciario', 'criminal', 'tributario', 'fazenda', 'marcas', 'outro']);

  const process = getJevSchema('process_triage');
  const movement = process.questions.find(question => question.key === 'movement_type');
  assert.match(movement.criteria.despacho, /sem conteúdo decisório/);
  assert.match(movement.criteria.sentenca, /mérito/);
  assert.match(movement.criteria.cumprimento, /satisfação/);
  assert.deepEqual([...movement.labels], ['peticao', 'decisao', 'despacho', 'sentenca', 'audiencia', 'cumprimento', 'recurso', 'expediente', 'outro']);

  const action = getJevSchema('publication_action');
  const providence = action.questions.find(question => question.key === 'action');
  assert.match(providence.criteria.contestar, /defesa/);
  assert.match(providence.criteria.cumprimento_sentenca, /satisfação/);
  assert.equal(providence.labels.length, 10);
}

console.log('\n[PASS] Contexto jurídico determinístico validado.\n');
