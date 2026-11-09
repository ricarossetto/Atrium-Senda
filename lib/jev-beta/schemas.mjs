export const JEV_SCHEMA_VERSION = 'jev-beta-v1';

import { LEGAL_AREA } from './taxonomy.mjs';

function choice(key, labels, instructions, criteria) {
  return Object.freeze({ key, kind: 'choice', labels: Object.freeze(labels), cardinality: labels.length, instructions, criteria: Object.freeze({ ...criteria }) });
}

function noul(key, instructions) {
  return Object.freeze({ key, kind: 'noul', labels: Object.freeze(['sim', 'nao']), cardinality: 2, instructions });
}

export const JEV_SCHEMAS = Object.freeze({
  publication_triage: Object.freeze({
    id: 'publication_triage',
    version: JEV_SCHEMA_VERSION,
    description: 'Sugestão assistiva de triagem de publicação; nunca prazo, nunca tratamento automático.',
    primary: Object.freeze(['area', 'priority']),
    threshold: 0.65,
    questions: Object.freeze([
      choice('priority', ['alta', 'normal', 'baixa'], 'How urgent does this legal publication look?', {
        alta: 'Needs same-day attention',
        normal: 'Routine handling',
        baixa: 'FYI only'
      }),
      choice('area', [...LEGAL_AREA], 'Which legal area does this publication belong to?', {
        // Critérios com vocabulário brasileiro: a área é decidida por sinais do próprio
        // texto/ato (matéria, vara, lei citada), nunca por suposição.
        civil: 'Cível: obrigações e contratos, família, sucessões, consumidor, imobiliário, direitos reais, responsabilidade civil, empresarial e execução civil; varas cíveis e de família; "indenização", "contrato", "inventário", "arrolamento", "alimentos", "guarda", "divórcio", "locação", "despejo", "usucapião", "consumidor", "CDC", "CC/2002". Não use "outro" quando a matéria for claramente civil.',
        trabalhista: 'Trabalhista: relação de emprego; CLT, verbas rescisórias, horas extras, FGTS, aviso prévio, reconhecimento de vínculo, acidente de trabalho em vara do trabalho; "reclamante", "reclamada", "Vara do Trabalho", "TRT", "art. 477 da CLT". A presença de empresa no polo, sozinha, não define a área.',
        previdenciario: 'Previdenciário: benefícios do INSS/RGPS; aposentadoria, auxílio-doença, incapacidade, pensão por morte, BPC/LOAS, revisão de benefício, tempo de contribuição, aposentadoria rural; "INSS", "NB", "DIB", "DIP", "Lei 8.213/91", "JEF previdenciário". Pensão alimentícia é civil/família, não previdenciário.',
        criminal: 'Criminal: ação penal, inquérito policial, denúncia, pronúncia, execução penal, medidas protetivas (Maria da Penha), habeas corpus, audiência de custódia, crimes do CP/Lei de Drogas/Lei de Armas; "réu", "denunciado", "vítima", "flagrante", "Vara Criminal", "Tribunal do Júri", "art. 33 da Lei 11.343/2006", "art. 121/155/180 do CP".',
        tributario: 'Tributário: tributos e obrigações fiscais; ICMS, ISS, IPTU, IR, PIS/COFINS, execução fiscal municipal/estadual, CDA, auto de infração, impugnação, repetição de indébito; "fisco", "Fazenda Estadual/Municipal", "certidão negativa". Execução fiscal e CDA são tributárias mesmo com ente público no polo.',
        fazenda: 'Fazenda pública: litígio contra ente público (União, Estado, Município, autarquia, fundação) em matéria administrativa ou de servidor público; "Fazenda Pública", "Município de", "Estado do", "União", "servidor público", "improbidade", "licitação", "RPV/precatório". Matéria fiscal (execução fiscal, CDA, tributo) é tributário, não fazenda.',
        marcas: 'Marcas e propriedade industrial: INPI, registro de marca, marca registrada, patente, desenho industrial, oposição, nulidade de registro, concorrência desleal; "INPI", "LPI", "processo de marca", "patente".',
        outro: 'Outra área: só use quando nenhuma das anteriores descrever a matéria; se houver sinal claro de matéria penal (denúncia, réu, inquérito, execução penal, medida protetiva), NÃO use "outro".'
      }),
      noul('needs_human_review', 'Does this publication require a specific human action (providência, prazo or filing) rather than routine registration?'),
      noul('deadline_signal', 'Does the text state a deadline, a hearing date or an act with a date?'),
      choice('deadline_days', ['d5', 'd10', 'd15', 'd20', 'd30', 'sem_contagem'], 'If the text states a deadline in days, how many?', {
        d5: 'Five days',
        d10: 'Ten days',
        d15: 'Fifteen days',
        d20: 'Twenty days',
        d30: 'Thirty days',
        sem_contagem: 'No day count stated'
      })
    ])
  }),
  task_triage: Object.freeze({
    id: 'task_triage',
    version: JEV_SCHEMA_VERSION,
    description: 'Sugestão assistiva de categoria/urgência de tarefa; nunca cria tarefa nem deadline.',
    threshold: 0.65,
    questions: Object.freeze([
      choice('category', ['prazo', 'audiencia', 'peticao', 'administrativo', 'outro'], 'What kind of legal office task is this?', {
        prazo: 'Deadline-related',
        audiencia: 'Hearing-related',
        peticao: 'Filing or drafting',
        administrativo: 'Administrative',
        outro: 'Other'
      }),
      choice('urgency', ['alta', 'normal', 'baixa'], 'How urgent is this task?', {
        alta: 'Needs same-day attention',
        normal: 'Routine handling',
        baixa: 'Low priority'
      })
    ])
  }),
  process_triage: Object.freeze({
    id: 'process_triage',
    version: JEV_SCHEMA_VERSION,
    description: 'Sugestão assistiva do tipo de andamento do processo; nunca cria prazo, tarefa ou alteração de cadastro.',
    threshold: 0.65,
    questions: Object.freeze([
      choice('movement_type', ['peticao', 'decisao', 'despacho', 'sentenca', 'audiencia', 'cumprimento', 'recurso', 'expediente', 'outro'], 'What kind of court movement is this?', {
        peticao: 'Petição: manifestação escrita da parte (inicial, contestação, réplica, requerimento).',
        decisao: 'Decisão interlocutória: resolve questão incidente, inclusive tutela provisória; acórdão também é decisão.',
        despacho: 'Despacho: ato ordinatório sem conteúdo decisório; não resolve questão.',
        sentenca: 'Sentença: resolve o mérito ou extingue a execução.',
        audiencia: 'Audiência: conciliação, instrução, custódia ou audiência una.',
        cumprimento: 'Cumprimento de sentença: fase de satisfação; não é novo processo.',
        recurso: 'Recurso: apelação, agravo, embargos de declaração, recurso especial/extraordinário ou inominado.',
        expediente: 'Expediente: ato administrativo ou cartorário, sem conteúdo decisório.',
        outro: 'Outro: só quando nenhum dos anteriores descrever o movimento.'
      }),
      noul('needs_attention', 'Does this movement look like it requires a specific action from the office (deadline, filing or hearing)?')
    ])
  }),
  duplicate_check: Object.freeze({
    id: 'duplicate_check',
    version: JEV_SCHEMA_VERSION,
    description: 'Veredito assistivo sobre duas leituras da mesma publicação; nunca funde nem trata.',
    threshold: 0.65,
    questions: Object.freeze([
      choice('verdict', ['mesma', 'diferente', 'incerto'], 'Do these two records describe the same judicial publication?', {
        mesma: 'Same publication: same act, same process and same date',
        diferente: 'Different publications',
        incerto: 'Not enough information to decide'
      })
    ])
  }),
  task_duplicate_check: Object.freeze({
    id: 'task_duplicate_check',
    version: JEV_SCHEMA_VERSION,
    description: 'Veredito assistivo sobre duas tarefas do mesmo processo que a chave determinística não agrupou; nunca cria, conclui, move ou absorve tarefa. Com veredito "mesma" e confiança ≥ 0.90 a absorção pode ser autônoma, e somente quando a tarefa absorvida é projeção intocada da fonte (sem prazo humano, curadoria ou responsável) — ver lib/tasks/task-duplicate-review.mjs.',
    threshold: 0.65,
    questions: Object.freeze([
      choice('verdict', ['mesma', 'diferente', 'incerto'], 'Do these two tasks describe the same office action for this process?', {
        mesma: 'Same act: both records describe one single office action the office must perform for this process; matching process, source document or deadline alone is not sufficient',
        diferente: 'Different acts: the office has two different things to do (for example, a deadline and a hearing, or a decision and an appeal)',
        incerto: 'Not enough information to decide'
      })
    ])
  }),
  publication_action: Object.freeze({
    id: 'publication_action',
    version: JEV_SCHEMA_VERSION,
    description: 'Sugestão assistiva da providência que a publicação pede. Vocabulário fixo (rótulos estáveis preservam a calibração); o item do catálogo de tarefas é escolhido pelo servidor por regra determinística e pode ser trocado por pessoa. Nunca cria prazo, tarefa, tratamento ou ciência.',
    threshold: 0.6,
    questions: Object.freeze([
      choice('action', ['contestar', 'recorrer', 'manifestar', 'cumprir', 'pagar_guia', 'juntar_documento', 'peticao_intermediaria', 'preparar_audiencia', 'cumprimento_sentenca', 'outro'], 'Which providência does this publication require from the office?', {
        contestar: 'Contestar: apresentar defesa, contestação ou impugnação contra a pretensão da parte contrária; não use para simples manifestação.',
        recorrer: 'Recorrer: interpor ou responder recurso (apelação, agravo, embargos, recurso inominado, recurso ordinário); não use para cumprimento.',
        manifestar: 'Manifestar: prestar informação, manifestação, ciência ou resposta simples pedida pelo juízo; não é defesa nem recurso.',
        cumprir: 'Cumprir: cumprir determinação do juízo (providência ordenada, comparecimento, regularização).',
        pagar_guia: 'Pagar guia: pagar custas, preparo, taxa judiciária ou emitir/recolher guia (DARE, GRERJ).',
        juntar_documento: 'Juntar documento: anexar documento aos autos (procuração, certidão, comprovante, substabelecimento).',
        peticao_intermediaria: 'Petição intermediária: protocolar petição avulsa no curso do processo (requerimento, habilitação, desistência).',
        preparar_audiencia: 'Preparar audiência: preparar ou comparecer a audiência (conciliação, instrução, custódia, una).',
        cumprimento_sentenca: 'Cumprimento de sentença: requerer ou acompanhar a satisfação de sentença/execução; não confundir com cumprir determinação.',
        outro: 'Outro: a providência não se encaixa nas anteriores; descreva no campo de observação.'
      })
    ])
  }),
  task_risk: Object.freeze({
    id: 'task_risk',
    version: JEV_SCHEMA_VERSION,
    description: 'Sugestão assistiva de risco de estouro do prazo que a tarefa já tem; priorização, nunca prazo. Nunca cria, altera ou infere deadline.',
    threshold: 0.6,
    questions: Object.freeze([
      choice('risk', ['alto', 'medio', 'baixo'], 'How likely is this task to miss the deadline it already has?', {
        alto: 'The work is complex, blocked or broad relative to the stated deadline; needs attention now',
        medio: 'Needs attention, but the work looks compatible with the stated deadline',
        baixo: 'Simple, well understood, or no deadline pressure at all'
      }),
      noul('blocked', 'Does the task depend on something external (third party, document, court) that is not in the office hands?')
    ])
  }),
  contact_link: Object.freeze({
    id: 'contact_link',
    version: JEV_SCHEMA_VERSION,
    description: 'Sugestão assistiva de vínculo contato-cliente; nunca cria vínculo automaticamente.',
    threshold: 0.9,
    questions: Object.freeze([
      choice('link_decision', ['vincular', 'revisar', 'nao_vincular'], 'Should this contact be linked as the matter client?', {
        vincular: 'Clear single matching client',
        revisar: 'Ambiguous, needs human review',
        nao_vincular: 'Do not link'
      })
    ])
  }),
  intent_routing: Object.freeze({
    id: 'intent_routing',
    version: JEV_SCHEMA_VERSION,
    description: 'Roteamento assistivo de intenção e lane; o pipeline continua código ATRIUM, nunca despacho automático.',
    threshold: 0.65,
    questions: Object.freeze([
      choice('intent', ['lookup', 'triage', 'legal_analysis', 'draft', 'outro'], 'What does the user want?', {
        lookup: 'Simple information lookup',
        triage: 'Triage or classification',
        legal_analysis: 'Legal analysis, possibly with research',
        draft: 'Drafting a document',
        outro: 'Anything else'
      }),
      choice('complexity', ['trivial', 'media', 'alta'], 'How complex is this request?', {
        trivial: 'Trivial, answerable directly',
        media: 'Medium, needs some work',
        alta: 'High, needs full pipeline and review'
      }),
      choice('lane', ['resposta_direta', 'classificador', 'pipeline_completo'], 'Which handling lane fits best?', {
        resposta_direta: 'Answer directly without models',
        classificador: 'Classifier suggestion only',
        pipeline_completo: 'Full pipeline with human review'
      })
    ])
  }),
  task_routing: Object.freeze({
    id: 'task_routing',
    version: JEV_SCHEMA_VERSION,
    description: 'Decide assistivamente como uma tarefa deve prosseguir; nunca executa a tarefa.',
    threshold: 0.65,
    questions: Object.freeze([
      choice('route', ['proceed_fast', 'deep_review', 'split_task', 'block'], 'How should this task proceed?', {
        proceed_fast: 'Simple, low-risk, determined work; follow the normal flow',
        deep_review: 'Needs broader context, deeper reasoning, more research, or human review',
        split_task: 'Should be decomposed into smaller tasks first',
        block: 'Halt this path; do not seek an automatic workaround'
      }),
      noul('risky', 'Could this task cause irreversible harm, legal exposure, or data loss?')
    ])
  }),
  research_check: Object.freeze({
    id: 'research_check',
    version: JEV_SCHEMA_VERSION,
    description: 'Avalia se a evidência fornecida sustenta a afirmação; nunca pesquisa e nunca julga mérito jurídico.',
    threshold: 0.7,
    questions: Object.freeze([
      choice('verdict', ['accept', 'verify_more', 'reject'], 'Does the provided evidence support the claim?', {
        accept: 'Evidence directly supports the claim; it may proceed with its citations',
        verify_more: 'Evidence is partially related or insufficient; more research is needed',
        reject: 'Evidence contradicts the claim or does not support it; never treat as established fact'
      }),
      noul('sources_agree', 'Do the provided sources agree with each other?')
    ])
  }),
  completion_review: Object.freeze({
    id: 'completion_review',
    version: JEV_SCHEMA_VERSION,
    description: 'Revisa se um trabalho pode ser declarado concluído; nunca fabrica conclusão.',
    threshold: 0.7,
    questions: Object.freeze([
      choice('conclusion', ['complete', 'verify_more', 'incomplete'], 'Can this work be declared complete?', {
        complete: 'Objective met, verified, no material gaps',
        verify_more: 'Almost there or verification missing; needs an additional check',
        incomplete: 'Material gaps remain; must not be reported as complete'
      }),
      noul('gaps_material', 'Are there material gaps remaining in this work?')
    ])
  }),
  tool_check: Object.freeze({
    id: 'tool_check',
    version: JEV_SCHEMA_VERSION,
    description: 'Portão consultivo antes de ações consequenciais; nunca amplia a política local.',
    threshold: 0.7,
    questions: Object.freeze([
      choice('decision', ['allow', 'confirm', 'review', 'deny'], 'Should this consequential action proceed?', {
        allow: 'Safe to proceed',
        confirm: 'Proceed only with explicit human confirmation',
        review: 'Needs human review before proceeding',
        deny: 'Do not proceed'
      }),
      noul('irreversible', 'Is this action irreversible or externally visible (send, delete, publish)?')
    ])
  }),
  financial_triage: Object.freeze({
    id: 'financial_triage',
    version: JEV_SCHEMA_VERSION,
    description: 'Sugestão assistiva de bucket financeiro para conferência; nunca cria, edita, paga ou reembolsa lançamento nem cria categoria obrigatória.',
    threshold: 0.65,
    questions: Object.freeze([
      choice('bucket', ['honorarios', 'custas', 'reembolso', 'rpv_alvara', 'despesa_operacional', 'outros'], 'Which financial bucket does this entry description belong to?', {
        honorarios: 'Honorários: contratuais, sucumbenciais, ad exitum, êxito, mensais, parcelas de honorários; "honorário", "contrato de honorários", "sucumbência", "% do proveito".',
        custas: 'Custas e despesas processuais: taxa judiciária, custas de distribuição, preparo de recurso, diligência de oficial, cópias, autenticação, custas de execução; "custas", "preparo", "taxa judiciária", "DARE", "GRERJ".',
        reembolso: 'Reembolso: devolução de valor adiantado pelo escritório ou ao cliente, reembolso de despesa paga por terceiro; "reembolso", "devolução", "estorno" (quando não for erro de lançamento).',
        rpv_alvara: 'RPV ou alvará: requisição de pequeno valor, alvará judicial, precatório, levantamento de valor depositado em conta judicial; "RPV", "alvará", "precatório", "levantamento".',
        despesa_operacional: 'Despesa operacional do escritório: aluguel, energia, internet, software, assinatura, material, limpeza, salário/folha quando lançado como despesa do escritório; "despesa fixa", "mensalidade", "assinatura".',
        outros: 'Outros: só quando nenhum dos anteriores descrever o lançamento (ex.: movimento sem descrição suficiente).'
      })
    ])
  })
});

export const JEV_SCHEMA_IDS = Object.freeze(Object.keys(JEV_SCHEMAS));

const FORBIDDEN_KEYS = new Set(['deadline', 'fatalDeadline', 'fatal_deadline', 'vencimento', 'due_date']);

export function getJevSchema(schemaId) {
  const schema = JEV_SCHEMAS[String(schemaId || '')];
  if (!schema) {
    const error = new Error(`Schema Jev desconhecido: ${schemaId}`);
    error.code = 'UNKNOWN_SCHEMA';
    throw error;
  }
  for (const question of schema.questions) {
    if (FORBIDDEN_KEYS.has(String(question.key))) {
      const error = new Error(`Schema proibido: ${question.key} implicaria prazo jurídico.`);
      error.code = 'FORBIDDEN_SCHEMA';
      throw error;
    }
    if (!Array.isArray(question.labels) || question.labels.length < 2 || question.labels.length > 255) {
      const error = new Error(`Cardinalidade inválida em ${question.key}: 2..255.`);
      error.code = 'INVALID_CARDINALITY';
      throw error;
    }
    if (question.kind !== 'choice' && question.kind !== 'noul') {
      const error = new Error(`Tipo inválido em ${question.key}: só choice|noul.`);
      error.code = 'INVALID_QUESTION_KIND';
      throw error;
    }
    if (typeof question.instructions !== 'string' || question.instructions.trim() === '') {
      const error = new Error(`Instructions ausentes em ${question.key}.`);
      error.code = 'INVALID_QUESTION_SHAPE';
      throw error;
    }
    if (question.kind === 'choice') {
      const keys = Object.keys(question.criteria || {});
      const missing = question.labels.filter(label => !keys.includes(label));
      const extra = keys.filter(key => !question.labels.includes(key));
      if (missing.length > 0 || extra.length > 0) {
        const error = new Error(`Criteria de ${question.key} deve cobrir exatamente os labels.`);
        error.code = 'INVALID_QUESTION_SHAPE';
        throw error;
      }
    } else if (question.criteria !== undefined) {
      const error = new Error(`Questão noul ${question.key} não leva criteria.`);
      error.code = 'INVALID_QUESTION_SHAPE';
      throw error;
    }
  }
  return schema;
}

export function assertJevInputSize(redactedText, { maxInputChars = 12000 } = {}) {
  const length = String(redactedText ?? '').length;
  if (length === 0) {
    const error = new Error('Texto vazio após redação; nada a classificar.');
    error.code = 'EMPTY_INPUT';
    throw error;
  }
  if (length > maxInputChars) {
    const error = new Error(`Entrada excede o teto do beta (${length} > ${maxInputChars} caracteres).`);
    error.code = 'TOO_LARGE';
    error.details = { length, maxInputChars };
    throw error;
  }
  return true;
}
