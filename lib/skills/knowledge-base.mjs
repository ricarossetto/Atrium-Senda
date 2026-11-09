/**
 * ATRIUM — base de habilidades jurídicas do Atrium IA.
 *
 * O acervo tem 2.069 habilidades: 1.767 de matéria e 302 de forma documental.
 * O classificador (JEV) e o assistente não recebem o acervo inteiro: o módulo
 * seleciona as habilidades relevantes para o texto por sinais objetivos
 * (gatilhos, título, tipo documental e ato processual) e monta um bloco curto.
 *
 * Contrato:
 * - A base é referência de método e de dispositivo. Ela NUNCA calcula prazo,
 *   declara ciência, abre tarefa ou pratica ato; a decisão continua humana.
 * - Nenhum conteúdo de cliente sai deste módulo; ele só lê o texto já redigido
 *   que o chamador entregou.
 * - O carregamento é preguiçoso: o catálogo é lido uma vez e o conteúdo é
 *   descompactado na primeira seleção, ficando em memória.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const BASE_DIRECTORY = path.join(MODULE_DIRECTORY, 'base');
const CATALOG_FILE = path.join(BASE_DIRECTORY, 'catalog.json');
const CONTENT_FILE = path.join(BASE_DIRECTORY, 'content.json.gz');
const MANIFEST_FILE = path.join(BASE_DIRECTORY, 'manifest.json');

const STOPWORDS = new Set([
  'a', 'à', 'às', 'ao', 'aos', 'as', 'com', 'como', 'da', 'das', 'de', 'do', 'dos', 'e', 'em',
  'entre', 'era', 'essa', 'esse', 'esta', 'este', 'foi', 'há', 'isso', 'já', 'mais', 'mas',
  'mesmo', 'na', 'nas', 'não', 'no', 'nos', 'o', 'os', 'ou', 'para', 'pela', 'pelo', 'por',
  'qual', 'que', 'se', 'sem', 'ser', 'seu', 'sua', 'suas', 'seus', 'são', 'também', 'tem',
  'ter', 'um', 'uma', 'após', 'antes', 'sobre', 'quando', 'onde', 'caso', 'forma', 'parte',
  'partes', 'processo', 'autos', 'artigo', 'art', 'fls', 'página', 'doc', 'documento'
]);

const MATERIA_SIGNALS = Object.freeze([
  { materia: 'tributario', patterns: ['tribut', 'fazenda nacional', 'receita federal', 'icms', 'iss', 'irpf', 'irpj', 'ctn', 'execução fiscal', 'cda', 'certidão de dívida ativa'] },
  { materia: 'previdenciario', patterns: ['inss', 'benefício', 'aposentadoria', 'auxílio-doença', 'auxilio-doenca', 'previdenci', 'rgps', 'crps', 'tempo de contribuição', 'tempo de contribuicao'] },
  { materia: 'trabalho', patterns: ['reclamante', 'reclamada', 'clt', 'fgts', 'horas extras', 'verbas rescisórias', 'verbas rescisorias', 'sindicato', 'justiça do trabalho', 'justica do trabalho', 'trt'] },
  { materia: 'consumidor', patterns: ['consumidor', 'fornecedor', 'cdc', 'produto', 'serviço', 'servico', 'plano de saúde', 'plano de saude', 'negativação', 'negativacao'] },
  { materia: 'penal', patterns: ['pena', 'crime', 'delito', 'denúncia', 'denuncia', 'inquérito', 'inquerito', 'réu', 'reu', 'habeas corpus', 'lep', 'regime prisional'] },
  { materia: 'processo-penal', patterns: ['ação penal', 'acao penal', 'resposta à acusação', 'resposta a acusacao', 'audiência de custódia', 'audiencia de custodia', 'pronúncia', 'pronuncia', 'júri', 'juri'] },
  { materia: 'familia-sucessoes', patterns: ['guarda', 'alimentos', 'divórcio', 'divorcio', 'união estável', 'uniao estavel', 'inventário', 'inventario', 'herança', 'heranca', 'curatela', 'partilha'] },
  { materia: 'administrativo', patterns: ['licitação', 'licitacao', 'servidor público', 'servidor publico', 'improbidade', 'administração pública', 'administracao publica', 'concurso público', 'concurso publico', 'tcu', 'tribunal de contas'] },
  { materia: 'civil', patterns: ['contrato', 'locação', 'locacao', 'despejo', 'imóvel', 'imovel', 'usucapião', 'usucapiao', 'condomínio', 'condominio', 'responsabilidade civil'] },
  { materia: 'imobiliario', patterns: ['imóvel', 'imovel', 'locação', 'locacao', 'despejo', 'incorporação', 'incorporacao', 'condomínio', 'condominio', 'usucapião', 'usucapiao'] },
  { materia: 'empresarial', patterns: ['sociedade', 'falência', 'falencia', 'recuperação judicial', 'recuperacao judicial', 'título de crédito', 'titulo de credito', 'contrato social'] },
  { materia: 'eleitoral', patterns: ['eleição', 'eleicao', 'eleitoral', 'tse', 'candidato', 'urna'] },
  { materia: 'ambiental', patterns: ['ambiental', 'licenciamento', 'ibama', 'resíduos', 'residuos', 'unidade de conservação', 'unidade de conservacao'] },
  { materia: 'constitucional', patterns: ['inconstitucional', 'constitucional', 'adi', 'adpf', 'repercussão geral', 'repercussao geral', 'súmula vinculante', 'sumula vinculante'] }
]);

const GENERIC_VARIANTS = new Set(['civel', 'geral', 'comum', 'outro', 'outros']);

const ACTS = Object.freeze([
  { act: 'sentenca', patterns: ['sentença', 'sentenca'], documentTypes: ['sentenca'], boost: 9 },
  { act: 'acordao', patterns: ['acórdão', 'acordao'], documentTypes: ['acordao'], boost: 9 },
  { act: 'decisao', patterns: ['decisão', 'decisao'], documentTypes: ['decisao'], boost: 8 },
  { act: 'despacho', patterns: ['despacho'], documentTypes: ['despacho'], boost: 6 },
  { act: 'contestacao', patterns: ['contestação', 'contestacao', 'contestar'], documentTypes: ['contestacao'], boost: 9 },
  { act: 'replica', patterns: ['réplica', 'replica'], documentTypes: ['replica'], boost: 9 },
  { act: 'cumprimento', patterns: ['cumprimento de sentença', 'cumprimento de sentenca', 'cumprimento'], documentTypes: ['cumprimento'], boost: 7 },
  { act: 'execucao', patterns: ['execução', 'execucao'], documentTypes: ['execucao', 'embargos'], boost: 6 },
  { act: 'peticao-inicial', patterns: ['petição inicial', 'peticao inicial'], documentTypes: ['peticao-inicial'], boost: 9 },
  { act: 'mandado-seguranca', patterns: ['mandado de segurança', 'mandado de seguranca'], documentTypes: ['mandado-seguranca'], boost: 9 },
  { act: 'habeas-corpus', patterns: ['habeas corpus'], documentTypes: ['habeas-corpus'], boost: 9 },
  { act: 'recurso', patterns: ['recurso', 'apelação', 'apelacao', 'agravo', 'embargos', 'recurso especial', 'recurso extraordinário', 'recurso extraordinario'], documentTypes: ['recurso', 'agravo', 'embargos', 'contrarrazoes'], boost: 6 }
]);

let catalogCache = null;
let contentCache = null;
let manifestCache = null;
let preparedCache = null;
let loadFailure = null;

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenize(value) {
  return normalize(value)
    .split(/\s+/)
    .filter(token => token.length >= 3 && !STOPWORDS.has(token));
}

function tokenPrefixes(token) {
  const prefixes = new Set([token]);
  if (token.length >= 5) prefixes.add(token.slice(0, 5));
  if (token.length >= 7) prefixes.add(token.slice(0, 7));
  return prefixes;
}

function buildPrefixIndex(words) {
  const index = new Set();
  for (const word of words) {
    for (const prefix of tokenPrefixes(word)) index.add(prefix);
  }
  return index;
}

function tokenMatches(token, prefixIndex) {
  for (const prefix of tokenPrefixes(token)) {
    if (prefixIndex.has(prefix)) return true;
  }
  return false;
}

function collapseWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function clip(value, maxChars) {
  const text = collapseWhitespace(value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

export function loadSkillsCatalog() {
  if (catalogCache) return catalogCache;
  if (loadFailure) return [];
  try {
    if (!existsSync(CATALOG_FILE)) {
      loadFailure = 'catalog_missing';
      return [];
    }
    const parsed = JSON.parse(readFileSync(CATALOG_FILE, 'utf8'));
    catalogCache = Array.isArray(parsed) ? parsed : [];
    return catalogCache;
  } catch (error) {
    loadFailure = `catalog_unreadable:${String(error?.message || '').slice(0, 80)}`;
    return [];
  }
}

function loadSkillsManifest() {
  if (manifestCache) return manifestCache;
  try {
    manifestCache = existsSync(MANIFEST_FILE) ? JSON.parse(readFileSync(MANIFEST_FILE, 'utf8')) : null;
  } catch {
    manifestCache = null;
  }
  return manifestCache;
}

function loadSkillContents() {
  if (contentCache) return contentCache;
  if (loadFailure) return Object.create(null);
  try {
    if (!existsSync(CONTENT_FILE)) {
      contentCache = Object.create(null);
      return contentCache;
    }
    const parsed = JSON.parse(gunzipSync(readFileSync(CONTENT_FILE)).toString('utf8'));
    contentCache = parsed && typeof parsed === 'object' ? parsed : Object.create(null);
    return contentCache;
  } catch (error) {
    loadFailure = `content_unreadable:${String(error?.message || '').slice(0, 80)}`;
    contentCache = Object.create(null);
    return contentCache;
  }
}

function prepareCatalog() {
  if (preparedCache) return preparedCache;
  const catalog = loadSkillsCatalog();
  preparedCache = catalog.map(skill => {
    const titleTokens = new Set(tokenize(skill.title));
    const documentTokens = new Set(tokenize(String(skill.documentType || '').replace(/-/g, ' ')));
    const materiaTokens = new Set(tokenize(String(skill.materia || '').replace(/-/g, ' ')));
    const documentTypeParts = String(skill.documentType || '').split('-').filter(Boolean);
    const variantTokens = documentTypeParts.slice(1).flatMap(part => tokenize(part));
    return {
      ...skill,
      normalizedTitle: normalize(skill.title),
      normalizedDocumentType: normalize(String(skill.documentType || '').replace(/-/g, ' ')),
      normalizedTriggers: (Array.isArray(skill.triggers) ? skill.triggers : []).map(trigger => ({
        raw: trigger,
        normalized: normalize(trigger)
      })).filter(trigger => trigger.normalized.length >= 4),
      normalizedDescription: normalize(skill.description),
      descriptionTokens: [...new Set(tokenize(skill.description))],
      titleTokens,
      documentTokens,
      materiaTokens,
      variantTokens,
      documentFamily: documentTypeParts[0] || String(skill.id).split('-')[0]
    };
  });
  return preparedCache;
}

function detectMaterias(normalizedText) {
  const found = new Set();
  for (const signal of MATERIA_SIGNALS) {
    if (signal.patterns.some(pattern => normalizedText.includes(normalize(pattern)))) found.add(signal.materia);
  }
  return found;
}

function detectActs(normalizedText) {
  const found = new Set();
  for (const act of ACTS) {
    if (act.patterns.some(pattern => normalizedText.includes(normalize(pattern)))) found.add(act.act);
  }
  return found;
}

function actBoost(skill, acts) {
  if (acts.size === 0) return 0;
  let boost = 0;
  for (const act of ACTS) {
    if (!acts.has(act.act)) continue;
    if (act.documentTypes.some(prefix => skill.normalizedDocumentType.startsWith(prefix))) boost = Math.max(boost, act.boost);
  }
  return boost;
}

export function searchSkills(text, { limit = 4, minScore = 9 } = {}) {
  const catalog = prepareCatalog();
  if (!catalog.length) return [];
  const normalizedText = normalize(text);
  if (normalizedText.length < 12) return [];
  const words = new Set(tokenize(normalizedText));
  const prefixIndex = buildPrefixIndex(words);
  const materias = detectMaterias(normalizedText);
  const acts = detectActs(normalizedText);
  const processualWords = ['prazo', 'intimacao', 'citacao', 'recurso', 'sentenca', 'decisao', 'despacho', 'audiencia', 'contestacao', 'revelia', 'nulidade', 'peticao', 'manifestacao'];
  const processualHits = processualWords.filter(word => normalizedText.includes(word)).length;
  const results = [];

  for (const skill of catalog) {
    let score = 0;

    for (const trigger of skill.normalizedTriggers) {
      if (!normalizedText.includes(trigger.normalized)) continue;
      const wordsInTrigger = trigger.normalized.split(' ').length;
      score += 5 + Math.min(5, wordsInTrigger * 1.5);
    }

    let titleHits = 0;
    for (const token of skill.titleTokens) {
      if (!tokenMatches(token, prefixIndex)) continue;
      titleHits += 1;
      if (titleHits >= 6) break;
    }
    score += titleHits * 2.2;
    if (titleHits >= 2) score += 3;
    if (titleHits >= 3) score += 2;

    let documentHits = 0;
    for (const token of skill.documentTokens) {
      if (!tokenMatches(token, prefixIndex)) continue;
      documentHits += 1;
      if (documentHits >= 5) break;
    }
    score += documentHits * 2.2;

    if (skill.materia && materias.has(skill.materia)) score += 3.2;
    if (skill.category === 'forma') score += acts.size ? 1.6 : -1.2;
    score += actBoost(skill, acts);

    if (skill.variantTokens.length) {
      const matchedVariants = skill.variantTokens.filter(token => tokenMatches(token, prefixIndex)).length;
      if (matchedVariants === skill.variantTokens.length) score += 2.5;
      else if (matchedVariants === 0 && !skill.variantTokens.every(token => GENERIC_VARIANTS.has(token))) score -= 3.5;
    }
    if (processualHits >= 2 && (skill.materia === 'processo-civil' || skill.materia === 'processo-penal')) score += 2.4;

    let descriptionHits = 0;
    for (const token of skill.descriptionTokens) {
      if (token.length < 5) continue;
      if (!tokenMatches(token, prefixIndex)) continue;
      descriptionHits += 1;
      if (descriptionHits >= 4) break;
    }
    score += descriptionHits * 0.35;

    if (score < minScore) continue;
    results.push({ skill, score });
  }

  results.sort((left, right) => right.score - left.score || left.skill.title.length - right.skill.title.length);

  const selected = [];
  const usedFamilies = new Set();
  for (const entry of results) {
    if (entry.skill.category === 'forma' && usedFamilies.has(entry.skill.documentFamily)) continue;
    if (entry.skill.category === 'forma') usedFamilies.add(entry.skill.documentFamily);
    selected.push(entry);
    if (selected.length >= Math.max(1, limit)) break;
  }
  return selected.map(entry => ({ ...entry.skill, score: Number(entry.score.toFixed(2)) }));
}

function extractSkillCore(content, maxChars, { skipDeadlineSections = false } = {}) {
  const lines = String(content || '').split(/\r?\n/);
  const picked = [];
  let bulletsInSection = 0;
  let skippingSection = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('# ')) continue;
    if (line.startsWith('## ')) {
      const heading = line.replace(/^##\s*/, '');
      skippingSection = skipDeadlineSections && /prazo|contagem/i.test(heading);
      if (skippingSection) continue;
      if (picked.length >= 16) break;
      picked.push(`### ${clip(heading, 90)}`);
      bulletsInSection = 0;
      continue;
    }
    if (skippingSection) continue;
    if (line.startsWith('|')) {
      if (/^\|[\s:|-]+\|$/.test(line)) continue;
      if (bulletsInSection >= 3) continue;
      picked.push(clip(line, 190));
      bulletsInSection += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      if (bulletsInSection >= 4) continue;
      picked.push(clip(line, 220));
      bulletsInSection += 1;
      continue;
    }
    if (bulletsInSection < 2 && line.length <= 240) {
      picked.push(clip(line, 220));
      bulletsInSection += 1;
      continue;
    }
    if (picked.length >= 18) break;
  }
  let text = picked.join('\n');
  if (text.length > maxChars) text = `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
  return text;
}

function describeSkillForBlock(skill, { descriptionChars, coreChars, includeCore, skipDeadlineSections = false }) {
  const descriptor = skill.category === 'forma'
    ? `forma:${skill.documentType || skill.id}`
    : `matéria:${skill.materia || 'geral'}`;
  const lines = [`- ${skill.title} [${descriptor}]`];
  const description = clip(skill.description, descriptionChars);
  if (description) lines.push(`  Resumo: ${description}`);
  if (includeCore) {
    const contents = loadSkillContents();
    const core = extractSkillCore(contents[skill.id] || '', coreChars, { skipDeadlineSections });
    if (core) lines.push(`  Pontos de referência:\n${core.split('\n').map(line => `    ${line}`).join('\n')}`);
  }
  return lines.join('\n');
}

/**
 * Bloco curto para a triagem (JEV ou provedor degradado). Cabe no orçamento de
 * 12.000 caracteres do classificador sem deslocar o texto da publicação.
 */
export function buildClassifierSkillsBlock({ text, schemaId = 'publication_triage', maxChars = 2400, limit = 3 } = {}) {
  const selected = searchSkills(text, { limit, minScore: 10 });
  if (!selected.length) return '';
  const header = [
    'BASE DE CONHECIMENTO JURÍDICA (habilidades oficiais; referência de método e de dispositivo):',
    'Use para reconhecer o ato, a área e a providência cabível. Não calcule prazo, não declare ciência e não substitua a revisão humana.'
  ];
  const skills = [];
  let budget = maxChars - header.join('\n').length - 40;
  for (const skill of selected) {
    const block = describeSkillForBlock(skill, {
      descriptionChars: Math.min(260, Math.max(120, Math.floor(budget * 0.3))),
      coreChars: Math.min(520, Math.max(180, Math.floor(budget * 0.62))),
      includeCore: true,
      skipDeadlineSections: true
    });
    if (block.length > budget) continue;
    skills.push(block);
    budget -= block.length + 1;
  }
  if (!skills.length) return '';
  return [...header, ...skills].join('\n');
}

/**
 * Bloco maior para o assistente (chat/minuta). Entrega o método da habilidade
 * selecionada, sem transcrever o acervo inteiro.
 */
export function buildAssistantSkillsBlock({ text, maxChars = 5600, limit = 4 } = {}) {
  const selected = searchSkills(text, { limit, minScore: 9 });
  if (!selected.length) return '';
  const header = [
    'METODOLOGIA JURÍDICA DE REFERÊNCIA (habilidades oficiais do acervo do escritório):',
    'Aplique a estrutura e os dispositivos abaixo. Não cite o nome do acervo como fonte; referências específicas exigem conferência em fonte oficial. Não calcule prazo, não declare ciência e não invente fato.'
  ];
  const skills = [];
  let budget = maxChars - header.join('\n').length - 40;
  for (const skill of selected) {
    const block = describeSkillForBlock(skill, {
      descriptionChars: Math.min(420, Math.max(160, Math.floor(budget * 0.22))),
      coreChars: Math.min(1500, Math.max(400, Math.floor(budget * 0.72))),
      includeCore: true
    });
    if (block.length > budget) continue;
    skills.push(block);
    budget -= block.length + 1;
  }
  if (!skills.length) return '';
  return [...header, ...skills].join('\n');
}

export function skillsBaseInfo() {
  const manifest = loadSkillsManifest();
  const catalog = loadSkillsCatalog();
  return {
    ok: Boolean(catalog.length) && !loadFailure,
    skills: catalog.length,
    generatedAt: manifest?.generatedAt || null,
    source: manifest?.sourceDirectory ? 'acervo oficial importado' : null,
    byCategory: manifest?.byCategory || null,
    byMateria: manifest?.byMateria || null,
    contentBytes: manifest?.contentBytes || null,
    contentGzipBytes: manifest?.contentGzipBytes || null,
    catalogSha256: manifest?.catalogSha256 || null,
    failure: loadFailure
  };
}

/** Usado pelos testes: limpa caches para reler os arquivos. */
export function resetSkillsKnowledgeCache() {
  catalogCache = null;
  contentCache = null;
  manifestCache = null;
  preparedCache = null;
  loadFailure = null;
}
