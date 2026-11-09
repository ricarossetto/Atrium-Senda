/**
 * ATRIUM — Conhecimento processual determinístico para o classificador (JEV).
 *
 * Base PRÓPRIA, escrita a partir da lei (CPC/2015, CLT, CPP, leis dos juizados e
 * legislação extravagante). Não contém texto de terceiros nem cita outros produtos.
 *
 * Contrato:
 * - Este módulo NUNCA calcula, estima ou grava prazo. Os prazos abaixo são
 *   referência normativa para o modelo distinguir os atos e para a conferência
 *   humana; `deadline` e `fatalDeadline` continuam exclusivamente humanos ou
 *   declarados pela fonte oficial (specs/human-deadline-policy.md).
 * - Os rótulos de saída são internos do ATRIUM; a classificação final continua
 *   sendo sugestão para conferência.
 * - Nenhuma inferência a partir do nome das partes: só sinais objetivos do texto
 *   (ato, dispositivo, classe, providência pedida).
 */

export const PROCESS_KNOWLEDGE_VERSION = 'jev-process-knowledge-v1';

/**
 * Atos processuais com prazo legal. `days` é o prazo em dias (úteis quando a regra
 * geral do ramo assim determina). `basis` identifica o dispositivo. `note` explica
 * o termo inicial em uma linha, para o modelo não confundir o marco.
 */
export const PROCEDURAL_DEADLINES = Object.freeze({
  contestacao: Object.freeze({
    label: 'contestar',
    days: 15,
    counting: 'uteis',
    basis: 'CPC 335 e 219',
    note: 'conta da audiência de conciliação frustrada, do protocolo do pedido de cancelamento ou da juntada do comprovante de citação.'
  }),
  replica: Object.freeze({
    label: 'replicar',
    days: 15,
    counting: 'uteis',
    basis: 'CPC 350 e 351',
    note: 'conta da intimação da contestação, quando o réu alegar fato impeditivo, modificativo ou extintivo.'
  }),
  especificacao_provas: Object.freeze({
    label: 'especificar provas',
    days: 15,
    counting: 'uteis',
    basis: 'CPC 357',
    note: 'prazo fixado na decisão de saneamento; o juiz pode modular.'
  }),
  alegacoes_finais: Object.freeze({
    label: 'alegações finais',
    days: 15,
    counting: 'uteis',
    basis: 'CPC 364',
    note: 'memoriais após a instrução, quando o juiz determinar.'
  }),
  embargos_declaracao: Object.freeze({
    label: 'embargos de declaração',
    days: 5,
    counting: 'uteis',
    basis: 'CPC 1.023',
    note: 'conta da intimação da decisão embargada.'
  }),
  apelacao: Object.freeze({
    label: 'apelar',
    days: 15,
    counting: 'uteis',
    basis: 'CPC 1.003 e 219',
    note: 'conta da intimação da sentença.'
  }),
  contrarrazoes: Object.freeze({
    label: 'apresentar contrarrazões',
    days: 15,
    counting: 'uteis',
    basis: 'CPC 1.010',
    note: 'conta da intimação do recurso da parte contrária.'
  }),
  agravo_instrumento: Object.freeze({
    label: 'agravar',
    days: 15,
    counting: 'uteis',
    basis: 'CPC 1.003 e 1.015',
    note: 'conta da intimação da decisão interlocutória.'
  }),
  agravo_interno: Object.freeze({
    label: 'agravo interno',
    days: 15,
    counting: 'uteis',
    basis: 'CPC 1.021',
    note: 'conta da intimação da decisão monocrática.'
  }),
  recurso_especial_extraordinario: Object.freeze({
    label: 'recurso aos tribunais superiores',
    days: 15,
    counting: 'uteis',
    basis: 'CPC 1.003 e 1.029',
    note: 'conta da intimação do acórdão.'
  }),
  impugnacao_cumprimento: Object.freeze({
    label: 'impugnar o cumprimento',
    days: 15,
    counting: 'uteis',
    basis: 'CPC 525',
    note: 'conta da intimação para pagar ou da penhora, conforme o caso.'
  }),
  embargos_execucao: Object.freeze({
    label: 'embargar a execução',
    days: 15,
    counting: 'uteis',
    basis: 'CPC 915',
    note: 'conta da juntada do mandado de citação cumprido ou da penhora.'
  }),
  impugnacao_fazenda: Object.freeze({
    label: 'impugnar cumprimento contra a Fazenda',
    days: 30,
    counting: 'uteis',
    basis: 'CPC 535',
    note: 'conta da intimação do início do cumprimento.'
  }),
  embargos_execucao_fiscal: Object.freeze({
    label: 'embargar a execução fiscal',
    days: 30,
    counting: 'uteis',
    basis: 'LEF 16',
    note: 'conta da intimação da penhora.'
  }),
  embargos_monitoria: Object.freeze({
    label: 'embargar a monitória',
    days: 15,
    counting: 'uteis',
    basis: 'CPC 702',
    note: 'conta da citação.'
  }),
  prestacao_contas: Object.freeze({
    label: 'prestar contas',
    days: 15,
    counting: 'uteis',
    basis: 'CPC 550',
    note: 'prazo para o réu prestar contas na ação de exigir contas.'
  }),
  mandado_seguranca: Object.freeze({
    label: 'impetrar mandado de segurança',
    days: 120,
    counting: 'corridos',
    basis: 'Lei 12.016/2009, art. 23',
    note: 'prazo decadencial contado do ato coator.'
  }),
  acao_rescisoria: Object.freeze({
    label: 'ação rescisória',
    days: 730,
    counting: 'corridos',
    basis: 'CPC 975',
    note: 'prazo de dois anos contado do trânsito em julgado.'
  }),
  defesa_trabalhista: Object.freeze({
    label: 'defesa trabalhista',
    days: null,
    counting: 'audiencia',
    basis: 'CLT 847',
    note: 'a resposta do reclamado é apresentada em audiência; não é prazo em dias.'
  }),
  recurso_ordinario_trabalhista: Object.freeze({
    label: 'recurso ordinário',
    days: 8,
    counting: 'uteis',
    basis: 'CLT 895',
    note: 'conta da intimação da sentença.'
  }),
  embargos_declaracao_trabalhista: Object.freeze({
    label: 'embargos de declaração',
    days: 5,
    counting: 'uteis',
    basis: 'CLT 897-A',
    note: 'conta da intimação da decisão.'
  }),
  agravo_peticao_trabalhista: Object.freeze({
    label: 'agravo de petição',
    days: 8,
    counting: 'uteis',
    basis: 'CLT 897',
    note: 'conta da intimação da decisão na execução.'
  }),
  recurso_inominado: Object.freeze({
    label: 'recurso inominado',
    days: 10,
    counting: 'uteis',
    basis: 'Lei 9.099/95, art. 42',
    note: 'conta da intimação da sentença; aplicável no JEC e, no que couber, no JEFP.'
  }),
  embargos_declaracao_juizado: Object.freeze({
    label: 'embargos de declaração',
    days: 5,
    counting: 'uteis',
    basis: 'Lei 9.099/95, art. 50',
    note: 'conta da intimação da decisão.'
  }),
  resposta_acusacao: Object.freeze({
    label: 'resposta à acusação',
    days: 10,
    counting: 'uteis',
    basis: 'CPP 396',
    note: 'conta da citação.'
  }),
  apelacao_criminal: Object.freeze({
    label: 'apelar',
    days: 5,
    counting: 'uteis',
    basis: 'CPP 593',
    note: 'conta da intimação da sentença.'
  }),
  razoes_apelacao_criminal: Object.freeze({
    label: 'razões de apelação',
    days: 8,
    counting: 'uteis',
    basis: 'CPP 600',
    note: 'conta da intimação do recebimento da apelação.'
  }),
  recurso_sentido_estrito: Object.freeze({
    label: 'recurso em sentido estrito',
    days: 5,
    counting: 'uteis',
    basis: 'CPP 586',
    note: 'conta da intimação da decisão.'
  }),
  embargos_declaracao_criminal: Object.freeze({
    label: 'embargos de declaração',
    days: 2,
    counting: 'uteis',
    basis: 'CPP 619',
    note: 'conta da intimação da decisão.'
  })
});

/**
 * Tipos de ação/procedimento reconhecidos por sinais do texto. `area` e `act`
 * orientam o modelo; `terms` são normalizados (sem acento, minúsculos).
 */
export const ACTION_TYPE_RULES = Object.freeze([
  Object.freeze({ id: 'execucao_fiscal', label: 'execução fiscal', area: 'tributario', terms: Object.freeze(['execucao fiscal', 'certidao de divida ativa', 'cda', 'lei 6.830', 'lei 6830']) }),
  Object.freeze({ id: 'cumprimento_sentenca', label: 'cumprimento de sentença', area: 'civil', terms: Object.freeze(['cumprimento de sentenca', 'cumprimento de decisao', 'satisfacao de sentenca', 'intimacao para pagar']) }),
  Object.freeze({ id: 'execucao_titulo', label: 'execução de título extrajudicial', area: 'civil', terms: Object.freeze(['execucao de titulo extrajudicial', 'titulo executivo extrajudicial', 'duplicata', 'nota promissoria', 'cheque sem fundo']) }),
  Object.freeze({ id: 'monitoria', label: 'ação monitória', area: 'civil', terms: Object.freeze(['acao monitoria', 'monitoria']) }),
  Object.freeze({ id: 'busca_apreensao', label: 'busca e apreensão', area: 'civil', terms: Object.freeze(['busca e apreensao', 'alienacao fiduciaria', 'decreto-lei 911', 'decreto lei 911']) }),
  Object.freeze({ id: 'mandado_seguranca', label: 'mandado de segurança', area: 'fazenda', terms: Object.freeze(['mandado de seguranca', 'lei 12.016', 'impetrante', 'impetrado', 'autoridade coatora']) }),
  Object.freeze({ id: 'acao_rescisoria', label: 'ação rescisória', area: 'civil', terms: Object.freeze(['acao rescisoria', 'rescindenda', 'rescindendo']) }),
  Object.freeze({ id: 'acao_penal', label: 'ação penal', area: 'criminal', terms: Object.freeze(['acao penal', 'denuncia', 'inquerito policial', 'pronuncia', 'absolvicao sumaria']) }),
  Object.freeze({ id: 'habeas_corpus', label: 'habeas corpus', area: 'criminal', terms: Object.freeze(['habeas corpus', 'paciente', 'coator', 'constrangimento ilegal']) }),
  Object.freeze({ id: 'reclamacao_trabalhista', label: 'reclamação trabalhista', area: 'trabalhista', terms: Object.freeze(['reclamacao trabalhista', 'reclamante', 'reclamada', 'audiencia una', 'vara do trabalho']) }),
  Object.freeze({ id: 'acao_previdenciaria', label: 'ação previdenciária', area: 'previdenciario', terms: Object.freeze(['acao previdenciaria', 'beneficio previdenciario', 'concessao de beneficio', 'revisao de beneficio', 'inss']) }),
  Object.freeze({ id: 'familia', label: 'ação de família', area: 'civil', terms: Object.freeze(['divorcio', 'guarda', 'alimentos', 'uniao estavel', 'regulamentacao de visitas', 'alienacao parental']) }),
  Object.freeze({ id: 'sucessoes', label: 'inventário/sucessões', area: 'civil', terms: Object.freeze(['inventario', 'arrolamento', 'partilha', 'testamento', 'espólio', 'espolio']) }),
  Object.freeze({ id: 'imobiliaria', label: 'ação imobiliária', area: 'civil', terms: Object.freeze(['despejo', 'locacao', 'usucapiao', 'reintegracao de posse', 'condominio', 'atraso de obra']) }),
  Object.freeze({ id: 'consumidor', label: 'ação de consumidor', area: 'civil', terms: Object.freeze(['relacao de consumo', 'codigo de defesa do consumidor', 'cdc', 'negativacao indevida', 'cobranca indevida', 'vicio do produto']) }),
  Object.freeze({ id: 'improbidade', label: 'ação de improbidade', area: 'fazenda', terms: Object.freeze(['improbidade administrativa', 'lei 8.429', 'lei 8429', 'enriquecimento ilicito']) }),
  Object.freeze({ id: 'licitacao', label: 'licitação/contrato administrativo', area: 'fazenda', terms: Object.freeze(['licitacao', 'pregao', 'contrato administrativo', 'edital de licitacao']) }),
  Object.freeze({ id: 'marcas', label: 'marcas e patentes', area: 'marcas', terms: Object.freeze(['inpi', 'registro de marca', 'patente', 'desenho industrial', 'propriedade industrial']) })
]);

/** Regras de desambiguação processual — fatos objetivos, não opinião. */
export const PROCEDURAL_DISAMBIGUATION = Object.freeze([
  'Citação chama a parte a integrar o processo (CPC 238); intimação comunica ato processual (CPC 269). Ciência declarada pela parte não se presume pela leitura do diário.',
  'Cumprimento de sentença é fase do mesmo processo (CPC 523), não novo processo nem nova ação.',
  'Execução fiscal é matéria tributária (LEF) mesmo com ente público no polo; não confundir com cumprimento de sentença comum.',
  'Impugnação ao cumprimento (CPC 525) é diferente de embargos à execução (CPC 915) e de embargos à execução fiscal (LEF 16): o prazo e o cabimento mudam.',
  'Embargos de declaração têm prazo curto (5 dias no CPC, 2 dias no CPP e 5 na CLT) e não substituem recurso.',
  'Agravo de instrumento ataca decisão interlocutória (CPC 1.015); apelação ataca sentença (CPC 1.009).',
  'Contestação, reconvenção e preliminares convivem na mesma peça (CPC 335 a 343); reconvenção não é ação separada.',
  'No JEC e no JEFP o recurso é o inominado (10 dias) e não há custas para recorrer na primeira instância; o prazo não é o da apelação.',
  'Na Justiça do Trabalho a defesa é apresentada em audiência (CLT 847); os recursos em regra têm 8 dias, salvo os embargos de declaração (5 dias).',
  'Prazo em dobro por litisconsortes com procuradores distintos (CPC 229) não se aplica a autos eletrônicos.',
  'A contagem em dias úteis do CPC 219 vale para prazos processuais; prazos materiais (prescrição, decadência) correm em dias corridos.',
  'Recesso forense suspende os prazos de 20 de dezembro a 20 de janeiro (CPC 220), com restituição do tempo que faltava.',
  'A data de publicação no diário eletrônico é o primeiro dia útil seguinte à disponibilização (CPC 224, §2º); a contagem começa no dia útil seguinte a ela.'
]);

const DAYS_MENTION = /\b(\d{1,3})\s*(?:dias?|dia)\b/i;

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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

/** Tipo de ação provável, por sinais objetivos. Nunca inventa: sem sinal, vazio. */
export function detectActionType(text) {
  const normalized = normalize(text);
  const found = [];
  for (const rule of ACTION_TYPE_RULES) {
    const term = rule.terms.find(candidate => containsTerm(normalized, candidate));
    if (!term) continue;
    found.push({ id: rule.id, label: rule.label, area: rule.area, term });
  }
  return found;
}

/** Prazos legais compatíveis com a quantidade de dias citada no texto. */
export function compatibleDeadlinesForDays(days) {
  const target = Number(days);
  if (!Number.isFinite(target) || target < 1 || target > 730) return [];
  return Object.entries(PROCEDURAL_DEADLINES)
    .filter(([, item]) => item.days === target)
    .map(([key, item]) => ({ key, ...item }));
}

/**
 * Bloco de apoio processual para o modelo. Compacto, sem ecoar o texto e sem
 * prometer prazo: a lista só ajuda a distinguir o ato e a conferir o sinal.
 */
export function buildProcessContextBlock({ schemaId, text, maxChars = 1600 } = {}) {
  const schema = String(schemaId || '');
  const supported = new Set(['publication_triage', 'process_triage', 'task_triage', 'task_risk', 'publication_action', 'task_duplicate_check']);
  if (!supported.has(schema)) return '';
  const lines = [];
  lines.push('APOIO PROCESSUAL DETERMINÍSTICO (referência normativa; não calcula, não estima e não grava prazo):');
  const types = detectActionType(text);
  if (types.length) {
    lines.push(`Tipo de ação/ato provável: ${types.map(item => `${item.term} → ${item.label}`).join('; ')}.`);
  }
  const mention = String(text || '').match(DAYS_MENTION);
  if (mention) {
    const compatibles = compatibleDeadlinesForDays(Number(mention[1]));
    if (compatibles.length) {
      lines.push(`O texto menciona ${mention[1]} dias; prazos legais com essa duração: ${compatibles.map(item => `${item.label} (${item.basis})`).join('; ')}. Confirme o ato e o termo inicial antes de qualquer conclusão.`);
    }
  }
  if (schema === 'process_triage' || schema === 'publication_triage') {
    lines.push('Sequência para identificar o ato: vara/tribunal e classe; dispositivo citado; providência pedida; só então o nome das partes.');
  }
  if (schema === 'task_risk' || schema === 'task_triage') {
    lines.push('Risco e urgência consideram o prazo e a situação que a tarefa já registra; nada é recalculado a partir do texto.');
  }
  lines.push(...PROCEDURAL_DISAMBIGUATION.slice(0, 6));
  const block = lines.join('\n');
  return block.length > maxChars ? block.slice(0, maxChars) : block;
}

export function summarizeProcessKnowledge(text) {
  return {
    actionTypes: detectActionType(text).map(item => item.id),
    daysMentioned: (() => {
      const match = String(text || '').match(DAYS_MENTION);
      return match ? Number(match[1]) : null;
    })()
  };
}
