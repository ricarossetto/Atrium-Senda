import assert from 'node:assert/strict';
import { buildActRemedies, classifyAct, detectBranch } from '../lib/tasks/act-remedies.mjs';
import { buildPublicationPlaybook } from '../lib/tasks/task-playbook.mjs';

console.log('--- Iniciando Testes: providências cabíveis por tipo de ato ---');

const CATALOGO = [
  'AGRAVO DE INSTRUMENTO', 'AGRAVO INTERNO', 'BUSCAR INFORMAÇÕES EM ÓRGÃO PÚBLICO', 'CONTESTAÇÃO COM MODELO',
  'CUMPRIMENTO DE EXIGÊNCIAS', 'ELABORAR CONTRARRAZÕES', 'EMBARGOS DE DECLARAÇÃO', 'PETIÇÃO INTERMEDIÁRIA',
  'RECURSO DE APELAÇÃO/INOMINADO', 'RECURSO ESPECIAL', 'RECURSO ESPECIAL E EXTRAORDINÁRIO', 'RECURSO EXTRAORDINÁRIO',
  'RÉPLICA/IMPUGNAÇÃO À CONTESTAÇÃO', 'AUDIÊNCIA DE CONCILIAÇÃO'
].map(name => ({ name, points: 30, area: '' }));

const labels = items => items.map(item => item.label);
const CIVEL = '5000000-00.2026.8.21.0001';
const TRABALHO = '0000000-00.2026.5.04.0001';

// Tipo do ato
assert.equal(classifyAct({ label: 'Intimação · Sentença' }).kind, 'sentenca');
assert.equal(classifyAct({ label: 'Intimação · Acórdão' }).kind, 'acordao');
assert.equal(classifyAct({ label: 'Intimação · Decisão' }).kind, 'decisao_interlocutoria');
assert.equal(classifyAct({ label: 'Intimação · DESPACHO/DECISÃO', text: 'Ante o exposto, julgo parcialmente procedente o pedido.' }).kind, 'sentenca', 'o texto desfaz o rótulo ambíguo');
assert.equal(classifyAct({ label: 'Intimação · DESPACHO/DECISÃO', text: 'Indefiro o pedido de tutela.' }).kind, 'decisao_interlocutoria');
assert.equal(classifyAct({ label: 'Intimação · DESPACHO/DECISÃO', text: 'Intime-se a parte autora.' }).kind, 'despacho');
assert.equal(classifyAct({ label: 'Intimação · DESPACHO/DECISÃO', text: '' }).kind, 'decisao_ou_despacho');
assert.equal(classifyAct({ label: 'Cumprimento de sentença', text: '' }).kind, 'desconhecido', 'classe do processo não é sentença');
assert.equal(classifyAct({ label: 'Intimação · Notificação', text: 'Notificação de movimentação.' }).kind, 'desconhecido');

// Ramo
assert.equal(detectBranch({ processNumber: TRABALHO }), 'trabalhista');
assert.equal(detectBranch({ processNumber: CIVEL, text: 'Juizado Especial Cível da comarca' }), 'juizado');
assert.equal(detectBranch({ processNumber: CIVEL, text: 'Recebo a denúncia oferecida.' }), 'criminal');
assert.equal(detectBranch({ processNumber: CIVEL, text: 'Ação de cobrança.' }), 'civel');

// O pedido: sentença abre apelação; interlocutória abre agravo; embargos nos dois casos.
assert.deepEqual(labels(buildActRemedies({ label: 'Intimação · Sentença', processNumber: CIVEL }).items), ['Apelação', 'Embargos de declaração']);
assert.deepEqual(labels(buildActRemedies({ label: 'Intimação · Decisão', processNumber: CIVEL }).items), ['Agravo de instrumento', 'Embargos de declaração']);
assert.deepEqual(labels(buildActRemedies({ label: 'Intimação · Acórdão', processNumber: CIVEL }).items), ['Embargos de declaração', 'Recurso especial', 'Recurso extraordinário']);
assert.deepEqual(labels(buildActRemedies({ label: 'Decisão monocrática', processNumber: CIVEL }).items), ['Agravo interno', 'Embargos de declaração']);

// Trabalhista, juizado e criminal têm recurso próprio.
assert.deepEqual(labels(buildActRemedies({ label: 'Intimação · Sentença', processNumber: TRABALHO }).items), ['Recurso ordinário', 'Embargos de declaração']);
assert.deepEqual(labels(buildActRemedies({ label: 'Intimação · Acórdão', processNumber: TRABALHO }).items), ['Embargos de declaração', 'Recurso de revista']);
assert.deepEqual(labels(buildActRemedies({ label: 'Intimação · Sentença', processNumber: CIVEL, text: 'Juizado Especial Cível' }).items), ['Recurso inominado', 'Embargos de declaração']);
assert.deepEqual(labels(buildActRemedies({ label: 'Intimação · Decisão', processNumber: CIVEL, text: 'Recebo a denúncia.' }).items), ['Recurso em sentido estrito', 'Embargos de declaração']);
assert.match(buildActRemedies({ label: 'Intimação · Decisão', processNumber: TRABALHO }).note, /893/);

// O que o juízo mandou fazer vem antes, e despacho não abre recurso.
{
  const despacho = buildActRemedies({ label: 'Intimação · DESPACHO/DECISÃO', text: 'Intime-se a parte para contrarrazões.', processNumber: CIVEL });
  assert.equal(despacho.kind, 'despacho');
  assert.deepEqual(labels(despacho.items), ['Contrarrazões']);
  assert.match(despacho.note, /1\.001/);
  const puro = buildActRemedies({ label: 'Despacho', text: 'Aguarde-se.', processNumber: CIVEL });
  assert.deepEqual(puro.items, [], 'sem determinação, nada de providência genérica');
  const replica = buildActRemedies({ label: 'Intimação', text: 'Manifeste-se a parte autora sobre a contestação.', processNumber: CIVEL });
  assert.equal(replica.items[0].label, 'Réplica');
}

// Toda providência recursal aponta dispositivo, e a base jurídica é encontrada.
for (const [label, processNumber, text] of [
  ['Sentença', CIVEL, ''], ['Decisão', CIVEL, ''], ['Acórdão', CIVEL, ''], ['Decisão monocrática', CIVEL, ''],
  ['Sentença', TRABALHO, ''], ['Acórdão', TRABALHO, ''], ['Sentença', CIVEL, 'Juizado Especial Cível'], ['Sentença', CIVEL, 'Recebo a denúncia.']
]) {
  for (const item of buildActRemedies({ label, processNumber, text }).items) {
    assert.ok(item.legal, `${item.label} tem dispositivo`);
  }
}

// Playbook: o caso relatado deixa de sugerir as mesmas duas tarefas.
{
  const decisao = buildPublicationPlaybook({
    publication: { event: 'Intimação · DESPACHO/DECISÃO', text: 'Indefiro o pedido de tutela de urgência.', process: CIVEL },
    taskDefinitions: CATALOGO
  });
  const nomes = decisao.items.map(item => item.definition?.name);
  assert.deepEqual(nomes, ['AGRAVO DE INSTRUMENTO', 'EMBARGOS DE DECLARAÇÃO']);
  assert.ok(!nomes.includes('BUSCAR INFORMAÇÕES EM ÓRGÃO PÚBLICO'));
  assert.ok(!nomes.includes('CUMPRIMENTO DE EXIGÊNCIAS'));
  assert.equal(decisao.actLabel, 'Decisão interlocutória');
  assert.match(decisao.reason, /indefiro/);
  assert.ok(decisao.items.every(item => item.draft.deadline === ''), 'nenhum item traz prazo');

  const sentenca = buildPublicationPlaybook({
    publication: { event: 'Intimação · Sentença', process: CIVEL },
    taskDefinitions: CATALOGO
  });
  assert.equal(sentenca.items[0].definition.name, 'RECURSO DE APELAÇÃO/INOMINADO');

  const generica = buildPublicationPlaybook({
    publication: { event: 'Intimação · Notificação', text: 'Notificação de movimentação no processo.', process: CIVEL },
    taskDefinitions: CATALOGO
  });
  assert.deepEqual(generica.items, [], 'sem ato identificado não inventa providência');

  const semModelo = buildPublicationPlaybook({
    publication: { event: 'Intimação · Sentença', process: TRABALHO },
    taskDefinitions: CATALOGO
  });
  assert.equal(semModelo.items[0].label, 'Recurso ordinário');
  assert.equal(semModelo.items[0].definition, null, 'sem modelo no catálogo não troca por outro recurso');

  const dataNoEvento = buildPublicationPlaybook({
    publication: { event: '06/10/2026 23:59:59', title: 'Intimação · Sentença', process: CIVEL },
    taskDefinitions: CATALOGO
  });
  assert.equal(dataNoEvento.act, 'Intimação · Sentença', 'data da fonte no evento não é ato');
  assert.equal(dataNoEvento.actLabel, 'Sentença');
}

// Aviso curto do eproc diz o ato; texto longo que só menciona sentença não é sentença.
assert.equal(classifyAct({ label: '', text: 'Intimação Eletrônica - Expedida/Certificada - Sentença' }).kind, 'sentenca');
assert.equal(classifyAct({ label: '', text: 'Intimação Eletrônica - Expedida/Certificada - Despacho/Decisão' }).kind, 'decisao_ou_despacho');
assert.equal(classifyAct({ label: '', text: `${'Relatório do processo. '.repeat(40)} Conforme a sentença anterior, aguarde-se.` }).kind, 'desconhecido');
assert.equal(classifyAct({ label: 'Evento', text: 'Intimação em cumprimento de sentença.' }).kind, 'desconhecido');

// Sentença e acórdão narram fatos antigos: isso não vira ordem do juízo.
{
  const historia = buildActRemedies({ label: 'Acórdão', processNumber: CIVEL, text: 'Houve laudo, contrarrazões, alegações finais e penhora. Por unanimidade, negaram provimento.' });
  assert.deepEqual(labels(historia.items), ['Embargos de declaração', 'Recurso especial', 'Recurso extraordinário']);
  const narrada = buildActRemedies({ label: 'Decisão', processNumber: CIVEL, text: 'O laudo foi juntado e houve penhora. Indefiro o pedido.' });
  assert.deepEqual(labels(narrada.items), ['Agravo de instrumento', 'Embargos de declaração'], 'menção não é determinação');
  const ordem = buildActRemedies({ label: 'Despacho', processNumber: CIVEL, text: 'Intime-se a parte para se manifestar sobre o laudo.' });
  assert.ok(labels(ordem.items).includes('Manifestação sobre o laudo'));
}

// Vista à parte recorrida é para responder ao recurso, não para buscar informação.
{
  const vista = buildActRemedies({ label: 'Intimação · VISTA à(s) parte(s) agravada(s) para impugnação do Agravo Interno (AgInt)', processNumber: CIVEL });
  assert.deepEqual(labels(vista.items), ['Contrarrazões']);
  const playbook = buildPublicationPlaybook({
    publication: { title: 'Intimação · VISTA à(s) parte(s) agravada(s) para impugnação do Agravo Interno (AgInt)', process: CIVEL },
    taskDefinitions: CATALOGO
  });
  assert.equal(playbook.items[0].definition.name, 'ELABORAR CONTRARRAZÕES');
}

// Prazo nunca é inferido (§16): nenhum texto cita quantidade de dias.
{
  const tudo = JSON.stringify(['Sentença', 'Decisão', 'Acórdão', 'Despacho'].map(label => buildActRemedies({ label, processNumber: CIVEL })));
  assert.ok(!/\b\d+\s*dias\b/i.test(tudo), 'sem contagem de prazo');
}

console.log('[PASS] Providências cabíveis por tipo de ato.');
