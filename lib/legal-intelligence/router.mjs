export const PIECE_TYPES = Object.freeze([
  'embargos_infringentes',
  'embargos_declaracao',
  'embargos_execucao',
  'impugnacao_cumprimento',
  'cumprimento_sentenca',
  'recurso_especial',
  'recurso_extraordinario',
  'recurso_ordinario_trabalhista',
  'recurso_ordinario',
  'apelacao',
  'agravo',
  'replica',
  'contestacao',
  'peticao_inicial',
  'execucao',
  'contrato',
  'reclamacao_trabalhista',
  'notificacao_extrajudicial',
  'analise_processual',
  'revisao_peca'
]);

const PIECE_RULES = Object.freeze([
  { pieceType: 'embargos_infringentes', patterns: [/embargos (?:de )?infringentes/, /voto vencido/] },
  { pieceType: 'embargos_declaracao', patterns: [/embargos de declara/, /omiss[aã]o.*(?:decis[aã]o|senten[cç]a|ac[oó]rd[aã]o)/, /contradi[cç][aã]o.*(?:decis[aã]o|senten[cç]a|ac[oó]rd[aã]o)/, /obscuridade/, /erro material/] },
  { pieceType: 'embargos_execucao', patterns: [/embargos (?:do devedor|à execu|a execu|de execu)/, /embargos.*execu/] },
  { pieceType: 'impugnacao_cumprimento', patterns: [/impugna[cç][aã]o (?:ao )?(?:cumprimento|execu[cç][aã]o de senten)/, /art\.?\s*525/] },
  { pieceType: 'cumprimento_sentenca', patterns: [/cumprimento (?:de|da) senten/, /execu[cç][aã]o de senten/, /art\.?\s*(?:523|524)/] },
  { pieceType: 'recurso_especial', patterns: [/recurso especial/, /\bresp\b/] },
  { pieceType: 'recurso_extraordinario', patterns: [/recurso extraordin[aá]rio/, /repercuss[aã]o geral/] },
  { pieceType: 'recurso_ordinario_trabalhista', patterns: [/recurso ordin[aá]rio/], requiresArea: 'trabalhista' },
  { pieceType: 'recurso_ordinario', patterns: [/recurso ordin[aá]rio/] },
  { pieceType: 'apelacao', patterns: [/apela[cç][aã]o/, /recorrer d[ao] senten/, /reformar a senten/, /art\.?\s*1\.?00[9]|art\.?\s*1010/] },
  { pieceType: 'agravo', patterns: [/agravo (?:de )?instrumento/, /agravo interno/, /agravo regimental/, /decis[aã]o interlocut[oó]ria/, /art\.?\s*1\.?01[567]/] },
  { pieceType: 'replica', patterns: [/r[eé]plica/, /manifesta[cç][aã]o.*contesta/, /impugna[cç][aã]o.*contesta/, /art\.?\s*35[01]/] },
  { pieceType: 'contestacao', patterns: [/contesta[cç][aã]o/, /defesa do r[eé]u/, /art\.?\s*33[567]|art\.?\s*34[12]/] },
  { pieceType: 'peticao_inicial', patterns: [/peti[cç][aã]o inicial/, /\bajuizar\b/, /propor a[cç][aã]o/, /art\.?\s*319/] },
  { pieceType: 'execucao', patterns: [/execu[cç][aã]o (?:de t[ií]tulo|extrajudicial|fiscal)/, /t[ií]tulo executivo extrajudicial/, /art\.?\s*(?:784|914)/] },
  { pieceType: 'contrato', patterns: [/contrato/, /cl[aá]usula/, /distrato/, /termo de (?:acordo|quita)/] },
  { pieceType: 'reclamacao_trabalhista', patterns: [/reclama[cç][aã]o trabalhista/, /art\.?\s*840/] },
  { pieceType: 'notificacao_extrajudicial', patterns: [/notifica[cç][aã]o extrajudicial/] },
  { pieceType: 'analise_processual', patterns: [/analis(?:e|ar).*(?:processo|autos|pe[cç]a|decis[aã]o|minuta)/, /\bparecer\b/, /resum(?:o|ir).*(?:processo|autos)/] },
  { pieceType: 'revisao_peca', patterns: [/revis(?:ar|ão).*(?:pe[cç]a|peti[cç][aã]o|minuta|contrato)/, /corrigir.*(?:pe[cç]a|minuta)/, /auditar.*(?:pe[cç]a|minuta)/] }
]);

const AREA_RULES = Object.freeze([
  { area: 'trabalhista', patterns: [/trabalhista/, /\bCLT\b/, /reclamat/, /empregad/, /verbas rescis[oó]rias/, /\bFGTS\b/, /horas extras/] },
  { area: 'previdenciario', patterns: [/\bINSS\b/, /previdenci/, /benef[ií]cio/, /aposentadoria/, /aux[ií]lio[- ]doen[cç]a/, /incapacidade/, /segurad[oa]/] },
  { area: 'criminal', patterns: [/criminal/, /\bpenal\b/, /\bCPP\b/, /\br[eé]u\b/, /den[uú]ncia/, /acusa[cç][aã]o/, /\bcrime\b/, /pris[aã]o/, /habeas/] },
  { area: 'tributario', patterns: [/tribut[aá]ri/, /\bfiscal\b/, /\bICMS\b/, /\bISS\b/, /\btributo\b/, /execu[cç][aã]o fiscal/] },
  { area: 'civil', patterns: [/\bc[ií]vel\b/, /fam[ií]lia/, /indeniza/, /consumidor/, /im[oó]vel/, /loca[cç][aã]o/, /div[oó]rcio/, /alimentos/] }
]);

export const CRITICAL_DOCUMENTS = Object.freeze({
  apelacao: [{ kind: 'decisao', label: 'sentença ou decisão recorrida' }],
  agravo: [{ kind: 'decisao', label: 'decisão agravada' }],
  embargos_declaracao: [{ kind: 'decisao', label: 'decisão embargada' }],
  embargos_infringentes: [{ kind: 'acordao', label: 'acórdão com voto vencido' }],
  embargos_execucao: [{ kind: 'titulo', label: 'título e cálculo' }],
  recurso_especial: [{ kind: 'acordao', label: 'acórdão recorrido' }],
  recurso_extraordinario: [{ kind: 'acordao', label: 'acórdão recorrido' }],
  recurso_ordinario_trabalhista: [{ kind: 'decisao', label: 'sentença recorrida' }],
  cumprimento_sentenca: [{ kind: 'titulo', label: 'título judicial e cálculo' }],
  impugnacao_cumprimento: [{ kind: 'titulo', label: 'título e planilha de cálculo' }],
  execucao: [{ kind: 'titulo', label: 'título executivo' }],
  contestacao: [{ kind: 'peticao_inicial', label: 'petição inicial' }],
  replica: [{ kind: 'contestacao', label: 'contestação' }]
});

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function collectMatches(patterns, text) {
  const found = [];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) found.push(match[0]);
  }
  return found;
}

export function detectArea(message, documents = []) {
  const text = normalize([message, ...documents.map(document => `${document.name || ''} ${document.kind || ''}`)].join(' '));
  for (const rule of AREA_RULES) {
    const matches = collectMatches(rule.patterns, text);
    if (matches.length) return { area: rule.area, matches };
  }
  return { area: null, matches: [] };
}

export function detectPieceIntent(message, { documents = [] } = {}) {
  const text = normalize([message, ...documents.map(document => document.name || '')].join(' '));
  const areaDetection = detectArea(message, documents);
  let winner = null;
  for (const rule of PIECE_RULES) {
    if (rule.requiresArea && areaDetection.area !== rule.requiresArea) continue;
    const matches = collectMatches(rule.patterns, text);
    if (!matches.length) continue;
    const score = matches.length;
    if (!winner || score > winner.score) winner = { pieceType: rule.pieceType, score, matches };
  }
  const pieceType = winner?.pieceType || null;
  const confidence = winner ? Math.min(0.5 + winner.score * 0.15, 0.95) : 0;
  const needs = {
    documents: documents.length > 0 || /autos|documento anexo|anexo|pdf/.test(text),
    analysis: /analis|revis|parecer|auditoria/.test(text) || ['analise_processual', 'revisao_peca'].includes(pieceType),
    research: /jurisprudenc|precedent|s[uú]mula|sumula|tema\s+\d+|repetitiv|repercuss[aã]o geral|\bSTF\b|\bSTJ\b|\bTST\b/.test(text)
      && !/(?:sem|nenhum[a]?|dispens[ae]|nao|não)\s+(?:pedir|pesquisar|buscar|consultar|citar|precisar|precisa|necessita|usar)\s+(?:de\s+|por\s+)?(?:jurisprudenc|precedent|s[uú]mula|sumula)/.test(text),
    calculation: /c[aá]lculo|calcular|atualiza|corre[cç][aã]o monet[aá]ria|juros|selic|rpv|precat[oó]rio|honor[aá]rios/.test(text),
    contract: pieceType === 'contrato' || /cl[aá]usula|contrat/.test(text),
    evidence: /prova|documento|laudo|testemunha|per[ií]cia|depoimento/.test(text),
    sentenceAnalysis: ['apelacao', 'embargos_declaracao', 'embargos_infringentes', 'recurso_especial', 'recurso_extraordinario', 'recurso_ordinario_trabalhista', 'recurso_ordinario'].includes(pieceType) || /senten[cç]a|ac[oó]rd[aã]o|decis[aã]o recorrida/.test(text),
    publications: /publica[cç][aã]o|intima[cç][aã]o|\bDJe\b|\bDJEN\b|prazo/.test(text),
    prescription: /prescri[cç][aã]o/.test(text),
    publicEntity: /fazenda p[uú]blica|ente p[uú]blico|precat[oó]rio|\bRPV\b/.test(text),
    disability: /incapacidade|aux[ií]lio[- ]doen[cç]a|aposentadoria por invalidez|benef[ií]cio.*INSS/.test(text),
    criticalDocuments: CRITICAL_DOCUMENTS[pieceType] || []
  };
  return {
    pieceType,
    area: areaDetection.area,
    areaMatches: areaDetection.matches,
    confidence,
    matched: winner?.matches || [],
    needs,
    requiresConfirmation: Boolean(pieceType) && confidence < 0.65
  };
}

export function routeLegalIntelligence({ registry, intent = {}, options = {} } = {}) {
  if (!registry) throw new TypeError('registry é obrigatório para o roteamento.');
  const { pieceType, area, needs = {} } = intent;
  const warnings = [];
  if (!pieceType) return { active: false, pieceType: null, area: area || null, modules: [], recipe: null, warnings };
  const modules = [];
  const add = (id, priority, reason) => {
    if (!id || modules.some(module => module.id === id)) return;
    modules.push({ id, priority, reason });
  };
  const selection = registry.selectRecipes({ pieceType, area });
  const recipe = selection.recipe;
  if (!recipe) warnings.push(`Nenhuma recipe ROM disponível para "${pieceType}"${area ? ` (${area})` : ''}.`);
  add('rom.master-core', 0, 'núcleo anti-alucinação e fidelidade documental');
  if (recipe) add(recipe.id, 5, `recipe ROM para ${pieceType}`);
  else if (selection.methods.length) add(selection.methods[0].id, 5, 'método ROM disponível');
  add('legal-agent', 4, 'orquestração jurídica nativa do ATRIUM');
  if (needs.documents) add('legal-ingest', 6, 'ingestão documental rastreável');
  if (needs.analysis) add('peticao-analyzer', 12, 'análise estruturada CAPPD');
  if (needs.contract) add('contrato-analyzer-br', 12, 'análise contratual BR');
  if (needs.prescription) add('prescricao-intercorrente', 13, 'prescrição intercorrente');
  if (needs.publicEntity) add('fazenda-publica-cumprimento', 13, 'regime da Fazenda Pública');
  if (needs.disability) add('previdenciario-incapacidade', 13, 'benefícios por incapacidade');
  if (needs.calculation) add('calculadora-processual', 13, 'cálculo processual determinístico');
  if (needs.research) {
    add('jurisprudencia-miner', 14, 'mineração de precedentes com anti-alucinação');
    add('legal-research-br', 15, 'pesquisa jurídica orientada por claim');
  }
  if (needs.sentenceAnalysis) add('sentenca-judicial-br', 16, 'decomposição da decisão recorrida');
  if (needs.publications) add('dje-monitor', 17, 'publicações, prazos e DJE');
  for (const [index, method] of selection.methods.slice(0, 2).entries()) add(method.id, 30 + index, 'método complementar ROM');
  add('legal-planner', 20, 'planejamento vinculado a fatos, provas e pedidos');
  add('tese-juridica-validator', 25, 'validação da tese em cinco dimensões');
  add('legal-draft-br', 35, 'redação jurídica brasileira');
  add('legal-audit', 40, 'revisão adversarial final');
  if (!options.includeAudit) {
    const index = modules.findIndex(module => module.id === 'legal-audit');
    if (index >= 0) modules.splice(index, 1);
  }
  return { active: true, pieceType, area: area || null, modules, recipe, warnings };
}
