import { buildProcessContextBlock } from './process-knowledge.mjs';

export const LEGAL_CONTEXT_VERSION = 'jev-legal-context-v1';


export const CIVIL_LAW_TOPICS = Object.freeze({
  familia: Object.freeze({
    label: 'família',
    summary: 'divórcio, guarda, alimentos, união estável, curatela (CC, arts. 1.511 e ss.)'
  }),
  sucessoes: Object.freeze({
    label: 'sucessões',
    summary: 'inventário, arrolamento, testamento, herança, partilha (CC, arts. 1.784 e ss.)'
  }),
  consumidor: Object.freeze({
    label: 'consumidor',
    summary: 'CDC, vício do produto, cobrança indevida, negativação, plano de saúde'
  }),
  imobiliario: Object.freeze({
    label: 'imobiliário',
    summary: 'locação, despejo, compra e venda, condomínio, incorporação (Lei 8.245/91; CC)'
  }),
  contratos: Object.freeze({
    label: 'contratos e obrigações',
    summary: 'inadimplemento, revisão, rescisão, prestação de serviço, empreitada (CC, arts. 233 e 421)'
  }),
  responsabilidade: Object.freeze({
    label: 'responsabilidade civil',
    summary: 'dano material ou moral, nexo causal, acidente, erro médico (CC, arts. 186 e 927)'
  }),
  direitos_reais: Object.freeze({
    label: 'direitos reais',
    summary: 'propriedade, posse, usucapião, hipoteca, alienação fiduciária, penhora (CC, arts. 1.196 e ss.)'
  }),
  empresarial: Object.freeze({
    label: 'empresarial',
    summary: 'sociedade, títulos de crédito, recuperação judicial, falência (CC, arts. 966 e ss.; Lei 11.101/2005)'
  })
});

export const PROCEDURE_ACTS = Object.freeze({
  despacho: Object.freeze({
    label: 'despacho',
    summary: 'ato ordinatório sem conteúdo decisório (CPC, art. 203, §3º)'
  }),
  decisao: Object.freeze({
    label: 'decisão',
    summary: 'decisão interlocutória que resolve questão incidente, inclusive tutela provisória (CPC, art. 203, §2º)'
  }),
  sentenca: Object.freeze({
    label: 'sentença',
    summary: 'resolve o mérito ou extingue a execução (CPC, art. 203, §1º)'
  }),
  audiencia: Object.freeze({
    label: 'audiência',
    summary: 'conciliação, instrução, custódia ou audiência una'
  }),
  cumprimento: Object.freeze({
    label: 'cumprimento',
    summary: 'fase de satisfação da sentença (CPC, arts. 513 e ss.)'
  }),
  recurso: Object.freeze({
    label: 'recurso',
    summary: 'apelação, agravo, embargos de declaração, recurso especial ou extraordinário (CPC, arts. 994 e ss.)'
  }),
  peticao: Object.freeze({
    label: 'petição',
    summary: 'manifestação escrita da parte (inicial, contestação, réplica, requerimento)'
  }),
  expediente: Object.freeze({
    label: 'expediente',
    summary: 'ato administrativo ou cartorário, sem conteúdo decisório'
  })
});

const AREA_SIGNAL_RULES = Object.freeze([
  Object.freeze({
    area: 'tributario',
    topic: 'tributario',
    label: 'tributário',
    terms: Object.freeze([
      'execucao fiscal', 'certidao de divida ativa', 'cda', 'icms', 'iss', 'iptu',
      'irpf', 'cofins', 'auto de infracao', 'repeticao de indebito', 'ctn',
      'fazenda estadual', 'fazenda municipal', 'tributo'
    ])
  }),
  Object.freeze({
    area: 'previdenciario',
    topic: 'previdenciario',
    label: 'previdenciário',
    terms: Object.freeze([
      'inss', 'aposentadoria', 'auxilio-doenca', 'auxilio doenca', 'pensao por morte',
      'bpc', 'loas', 'tempo de contribuicao', 'lei 8.213', 'beneficio previdenciario',
      'incapacidade laborativa', 'segurado especial', 'salario maternidade', 'auxilio reclusao', 'auxilio-reclusao', 'dib', 'dip'
    ])
  }),
  Object.freeze({
    area: 'trabalhista',
    topic: 'trabalhista',
    label: 'trabalhista',
    terms: Object.freeze([
      'reclamacao trabalhista', 'reclamante', 'reclamada', 'clt', 'verbas rescisorias',
      'horas extras', 'fgts', 'aviso previo', 'vara do trabalho', 'trt',
      'acidente de trabalho', 'intervalo intrajornada', 'rescisao indireta', 'vinculo empregaticio'
    ])
  }),
  Object.freeze({
    area: 'criminal',
    topic: 'criminal',
    label: 'criminal',
    terms: Object.freeze([
      'habeas corpus', 'inquerito policial', 'denuncia', 'denunciado', 'reu',
      'flagrante', 'audiencia de custodia', 'medida protetiva', 'maria da penha',
      'execucao penal', 'tribunal do juri', 'lei 11.343', 'lei 11.340', 'codigo penal'
    ])
  }),
  Object.freeze({
    area: 'marcas',
    topic: 'marcas',
    label: 'marcas e propriedade industrial',
    terms: Object.freeze([
      'inpi', 'registro de marca', 'processo de marca', 'marca registrada',
      'patente', 'desenho industrial', 'propriedade industrial', 'propriedade intelectual', 'lpi', 'lei 9.279'
    ])
  }),
  Object.freeze({
    area: 'fazenda',
    topic: 'fazenda',
    label: 'fazenda pública',
    terms: Object.freeze([
      'fazenda publica', 'fazenda nacional', 'uniao federal',
      'autarquia', 'servidor publico', 'improbidade', 'licitacao', 'rpv',
      'precatorio', 'concurso publico', 'ente publico', 'administracao publica'
    ])
  }),
  Object.freeze({
    area: 'civil',
    topic: 'familia',
    label: 'família',
    terms: Object.freeze([
      'divorcio', 'guarda', 'alimentos', 'uniao estavel', 'curatela', 'interdicao',
      'pensao alimenticia', 'alienacao parental', 'regulamentacao de visitas'
    ])
  }),
  Object.freeze({
    area: 'civil',
    topic: 'sucessoes',
    label: 'sucessões',
    terms: Object.freeze([
      'inventario', 'arrolamento', 'testamento', 'heranca', 'espolio', 'partilha',
      'sucessao', 'legitima'
    ])
  }),
  Object.freeze({
    area: 'civil',
    topic: 'consumidor',
    label: 'consumidor',
    terms: Object.freeze([
      'consumidor', 'cdc', 'codigo de defesa do consumidor', 'vicio do produto',
      'cobranca indevida', 'negativacao indevida', 'plano de saude'
    ])
  }),
  Object.freeze({
    area: 'civil',
    topic: 'imobiliario',
    label: 'imobiliário',
    terms: Object.freeze([
      'locacao', 'despejo', 'usucapiao', 'condominio', 'compra e venda',
      'alienacao fiduciaria', 'hipoteca', 'incorporacao', 'atraso de obra'
    ])
  }),
  Object.freeze({
    area: 'civil',
    topic: 'contratos',
    label: 'contratos e obrigações',
    terms: Object.freeze([
      'contrato', 'inadimplemento', 'rescisao contratual', 'revisao contratual',
      'prestacao de servico', 'empreitada', 'obrigacao'
    ])
  }),
  Object.freeze({
    area: 'civil',
    topic: 'responsabilidade',
    label: 'responsabilidade civil',
    terms: Object.freeze([
      'indenizacao', 'responsabilidade civil', 'dano moral', 'dano material',
      'acidente de transito', 'erro medico'
    ])
  }),
  Object.freeze({
    area: 'civil',
    topic: 'direitos_reais',
    label: 'direitos reais',
    terms: Object.freeze([
      'propriedade', 'posse', 'servidao', 'usufruto', 'penhora'
    ])
  }),
  Object.freeze({
    area: 'civil',
    topic: 'empresarial',
    label: 'empresarial',
    terms: Object.freeze([
      'sociedade empresaria', 'recuperacao judicial', 'falencia', 'titulo de credito',
      'duplicata', 'cheque', 'nota promissoria'
    ])
  })
]);

const ACT_SIGNAL_RULES = Object.freeze([
  Object.freeze({ act: 'despacho', terms: Object.freeze(['despacho', 'ato ordinatorio']) }),
  Object.freeze({ act: 'sentenca', terms: Object.freeze(['sentenca', 'julgo procedente', 'julgo improcedente']) }),
  Object.freeze({ act: 'decisao', terms: Object.freeze(['decisao interlocutoria', 'decisao', 'acordao', 'liminar', 'tutela provisoria', 'julgamento antecipado parcial', 'saneamento e organizacao do processo']) }),
  Object.freeze({ act: 'audiencia', terms: Object.freeze(['audiencia', 'conciliacao', 'instrucao', 'custodia']) }),
  Object.freeze({ act: 'cumprimento', terms: Object.freeze(['cumprimento de sentenca', 'cumprimento de decisao', 'penhora', 'hasta publica', 'leilao']) }),
  Object.freeze({ act: 'recurso', terms: Object.freeze(['apelacao', 'agravo', 'embargos de declaracao', 'recurso especial', 'recurso extraordinario', 'recurso inominado', 'recurso ordinario', 'contrarrazoes']) }),
  Object.freeze({ act: 'peticao', terms: Object.freeze(['peticao', 'contestacao', 'replica', 'manifestacao', 'requerimento', 'impugnacao', 'inicial']) }),
  Object.freeze({ act: 'expediente', terms: Object.freeze(['expediente', 'juntada']) })
]);

const ACTION_SIGNAL_RULES = Object.freeze([
  Object.freeze({ action: 'cumprimento_sentenca', terms: Object.freeze(['cumprimento de sentenca', 'satisfacao de sentenca', 'execucao de sentenca']) }),
  Object.freeze({ action: 'contestar', terms: Object.freeze(['contestacao', 'contestar', 'apresentar defesa', 'prazo para defesa']) }),
  Object.freeze({ action: 'recorrer', terms: Object.freeze(['recurso', 'apelacao', 'agravo', 'embargos de declaracao', 'recurso especial', 'recurso extraordinario', 'recurso inominado', 'contrarrazoes']) }),
  Object.freeze({ action: 'pagar_guia', terms: Object.freeze(['custas', 'preparo', 'taxa judiciaria', 'guia de recolhimento', 'dare', 'grerj']) }),
  Object.freeze({ action: 'juntar_documento', terms: Object.freeze(['juntar documento', 'juntada de documento', 'procuracao', 'substabelecimento', 'comprovante']) }),
  Object.freeze({ action: 'preparar_audiencia', terms: Object.freeze(['audiencia', 'conciliacao', 'instrucao', 'custodia']) }),
  Object.freeze({ action: 'peticao_intermediaria', terms: Object.freeze(['peticao', 'requerimento', 'habilitacao', 'desistencia']) }),
  Object.freeze({ action: 'cumprir', terms: Object.freeze(['cumprir', 'cumprimento de determinacao', 'determinacao judicial']) }),
  Object.freeze({ action: 'manifestar', terms: Object.freeze(['manifestacao', 'ciencia', 'prestar informacao', 'prestar informacoes', 'esclarecimento']) })
]);

const AREA_DISAMBIGUATION_RULES = Object.freeze([
  'Execução fiscal, CDA, ICMS, ISS, IPTU e auto de infração → tributário, ainda que haja ente público no polo.',
  'INSS, aposentadoria, auxílio-doença, pensão por morte, BPC/LOAS → previdenciário; pensão alimentícia é civil/família.',
  'Reclamação trabalhista, CLT, verbas rescisórias, horas extras e FGTS → trabalhista; empresa no polo, sozinha, não define a área.',
  'Inquérito, denúncia, habeas corpus, medida protetiva e execução penal → criminal.',
  'INPI, registro de marca, patente e desenho industrial → marcas.',
  'Fazenda Pública em matéria não fiscal, servidor público, improbidade, licitação, RPV e precatório → fazenda.',
  'Inventário, arrolamento, alimentos, guarda, divórcio, locação, despejo, consumidor, contrato, indenização e usucapião → civil.',
  'Use "outro" apenas quando nenhuma área descrever a matéria; não use "outro" havendo sinal claro.'
]);

function normalizeLegalText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function containsTerm(haystack, term) {
  let index = haystack.indexOf(term);
  while (index !== -1) {
    const before = index === 0 ? ' ' : haystack[index - 1];
    const afterIndex = index + term.length;
    const after = afterIndex >= haystack.length ? ' ' : haystack[afterIndex];
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    index = haystack.indexOf(term, index + 1);
  }
  return false;
}

function collectSignals(rules, text, limit) {
  const normalized = normalizeLegalText(text);
  const found = [];
  for (const rule of rules) {
    for (const term of rule.terms) {
      if (!containsTerm(normalized, term)) continue;
      found.push({ ...rule, term });
      break;
    }
    if (found.length >= limit) break;
  }
  return found;
}

export function detectLegalSignals(text) {
  return collectSignals(AREA_SIGNAL_RULES, text, 8)
    .map(({ area, topic, label, term }) => ({ area, topic, label, term }));
}

export function detectActSignals(text) {
  return collectSignals(ACT_SIGNAL_RULES, text, 6)
    .map(({ act, term }) => ({ act, label: PROCEDURE_ACTS[act]?.label || act, term }));
}

export function detectActionSignals(text) {
  return collectSignals(ACTION_SIGNAL_RULES, text, 6)
    .map(({ action, term }) => ({ action, label: action, term }));
}

export function buildLegalContextBlock({ schemaId, text, maxChars = 2400 } = {}) {
  const schema = String(schemaId || '');
  const lines = [];
  if (schema === 'publication_triage') {
    const signals = detectLegalSignals(text);
    lines.push('APOIO JURÍDICO DETERMINÍSTICO (referência de classificação; não é decisão judicial, não calcula prazo e não substitui revisão humana):');
    if (signals.length) {
      lines.push(`Sinais objetivos no texto: ${signals.map(signal => `${signal.term} → ${signal.area}`).join('; ')}.`);
    }
    lines.push('Ordem de leitura da área: 1) vara, tribunal ou lei citada; 2) ato e pedido; 3) vocabulário da matéria; 4) nome da parte apenas como indício.');
    lines.push('Citação chama a parte a integrar o processo (CPC 238); intimação comunica ato processual (CPC 269). Uma referência à comunicação não comprova ciência.');
    lines.push(...AREA_DISAMBIGUATION_RULES);
    const topics = [...new Set(signals.filter(signal => signal.area === 'civil').map(signal => signal.topic))];
    if (topics.length) {
      lines.push(`Matéria civil provável: ${topics.map(topic => CIVIL_LAW_TOPICS[topic]?.label || topic).join(', ')}.`);
    }
  } else if (schema === 'process_triage') {
    const acts = detectActSignals(text);
    lines.push('APOIO JURÍDICO DETERMINÍSTICO (referência de classificação; não é decisão judicial, não calcula prazo e não substitui revisão humana):');
    if (acts.length) {
      lines.push(`Atos no texto: ${acts.map(act => `${act.term} → ${act.act}`).join('; ')}.`);
    }
    lines.push('Definições: despacho = ato ordinatório sem conteúdo decisório (CPC 203, §3º); decisão = resolve questão incidente, inclusive tutela provisória (CPC 203, §2º); sentença = resolve o mérito ou extingue a execução (CPC 203, §1º); acórdão = decisão colegiada (CPC 204); cumprimento = fase de satisfação (CPC 513); recurso = apelação, agravo, embargos, RE/REsp (CPC 994).');
    lines.push('Não confunda despacho com decisão; sentença resolve mérito; cumprimento não é novo processo; recurso é ato contra decisão.');
  } else if (schema === 'publication_action') {
    const actions = detectActionSignals(text);
    lines.push('APOIO JURÍDICO DETERMINÍSTICO (referência de classificação; não é decisão judicial, não calcula prazo e não substitui revisão humana):');
    if (actions.length) {
      lines.push(`Providências no texto: ${actions.map(action => `${action.term} → ${action.action}`).join('; ')}.`);
    }
    lines.push('Definições: contestar = defesa contra pretensão; recorrer = recurso; manifestar = ciência ou resposta simples; cumprir = determinação; pagar_guia = custas ou preparo; juntar_documento = anexar; peticao_intermediaria = petição avulsa; preparar_audiencia = audiência; cumprimento_sentenca = satisfação; outro = não se encaixa.');
    lines.push('Não use contestar para simples manifestação; não use recorrer para cumprimento; não use cumprir para satisfação de sentença.');
  } else if (schema === 'task_triage') {
    lines.push('APOIO À TRIAGEM: identifique a atividade principal da tarefa, não apenas as palavras isoladas.');
    lines.push('Preparar ou comparecer a audiência é diferente de redigir uma petição; uma tarefa pode mencionar prazo e peça ao mesmo tempo.');
    lines.push('Prioridade depende do contexto e das datas já informadas; o classificador não cria prazo, não atribui responsável e não decide a providência.');
  } else if (schema === 'task_duplicate_check') {
    lines.push('APOIO À CONFERÊNCIA DE TAREFAS: compare a providência concreta e a situação de cada tarefa.');
    lines.push('O mesmo processo, a mesma publicação ou o mesmo vencimento não provam que duas tarefas exigem a mesma providência.');
    lines.push('Uma audiência e uma petição, ou uma providência e seu recurso, podem ser trabalhos diferentes no mesmo processo.');
    lines.push('Se faltar informação para distinguir os atos, escolha incerto; não invente fatos nem prazos.');
  } else {
    return '';
  }
  lines.push('Se o texto não confirmar o sinal, reduza a confiança em vez de adivinhar.');
  const processBlock = buildProcessContextBlock({ schemaId: schema, text });
  if (processBlock) lines.push('', processBlock);
  const block = lines.join('\n');
  return block.length > maxChars ? block.slice(0, maxChars) : block;
}
