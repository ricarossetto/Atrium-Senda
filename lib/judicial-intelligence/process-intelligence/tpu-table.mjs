import fs from 'node:fs';

export const MOVEMENT_CATEGORIES = Object.freeze({
  DISTRIBUICAO: 'DISTRIBUICAO',
  CITACAO: 'CITACAO',
  INTIMACAO: 'INTIMACAO',
  DECISAO: 'DECISAO',
  SENTENCA: 'SENTENCA',
  RECURSO: 'RECURSO',
  TRANSITO_JULGADO: 'TRANSITO_JULGADO',
  CUMPRIMENTO: 'CUMPRIMENTO',
  EXECUCAO: 'EXECUCAO',
  SUSPENSAO: 'SUSPENSAO',
  ARQUIVAMENTO: 'ARQUIVAMENTO',
  BAIXA: 'BAIXA',
  AUDIENCIA: 'AUDIENCIA',
  PERICIA: 'PERICIA',
  OUTRO: 'OUTRO'
});

// Tabela oficial do CNJ (SGT) versionada em `tpu-official.json`, gerada por
// `scripts/cnj-tpu-import.mjs` a partir do dump MySQL oficial. A curadoria local
// permanece como fallback para códigos ausentes.
export const TPU_TABLE_STATUS = 'OFFICIAL_SGT';

export const TPU_MOVEMENTS = Object.freeze({
  26: { code: 26, name: 'Distribuição', category: MOVEMENT_CATEGORIES.DISTRIBUICAO, verified: false }
});

export const TPU_VALIDATION_NOTE =
  'Nomes, hierarquia e situação vêm da tabela oficial do CNJ (SGT) versionada no repositório. ' +
  'A categoria é taxonomia do produto derivada do nome oficial por palavras-chave, não um campo do CNJ.';

let officialCache = null;
let officialLoaded = false;

function loadOfficial() {
  if (officialLoaded) return officialCache;
  officialLoaded = true;
  try {
    const file = new URL('./tpu-official.json', import.meta.url);
    officialCache = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    officialCache = null;
  }
  return officialCache;
}

export function tpuTableInfo() {
  const data = loadOfficial();
  if (!data) {
    return { status: 'PROVISIONAL', tableVersion: null, sourceHash: null, generatedAt: null, counts: { movements: 1, classes: 0, subjects: 0, documents: 0 } };
  }
  return {
    status: TPU_TABLE_STATUS,
    tableVersion: data.tableVersion,
    sourceHash: data.sourceHash,
    generatedAt: data.generatedAt,
    sourceUrl: data.sourceUrl,
    counts: data.counts
  };
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const CATEGORY_RULES = Object.freeze([
  { category: MOVEMENT_CATEGORIES.TRANSITO_JULGADO, pattern: /transito em julgado|transitou em julgado/ },
  { category: MOVEMENT_CATEGORIES.CUMPRIMENTO, pattern: /cumprimento de sentenca|cumprimento provisorio|cumprimento definitivo/ },
  { category: MOVEMENT_CATEGORIES.EXECUCAO, pattern: /execucao|executivo fiscal/ },
  { category: MOVEMENT_CATEGORIES.ARQUIVAMENTO, pattern: /arquivamento|arquivad/ },
  { category: MOVEMENT_CATEGORIES.BAIXA, pattern: /baixa definitiva|baixado|remessa ao arquivo|remetido ao arquivo/ },
  { category: MOVEMENT_CATEGORIES.SUSPENSAO, pattern: /suspens|sobrestad|sobrestamento/ },
  { category: MOVEMENT_CATEGORIES.SENTENCA, pattern: /sentenca/ },
  { category: MOVEMENT_CATEGORIES.DECISAO, pattern: /decisao|despacho|decisorio|liminar|tutela/ },
  { category: MOVEMENT_CATEGORIES.RECURSO, pattern: /recurso|apelacao|agravo|embargos/ },
  { category: MOVEMENT_CATEGORIES.AUDIENCIA, pattern: /audiencia|conciliacao/ },
  { category: MOVEMENT_CATEGORIES.PERICIA, pattern: /pericia|perito|laudo/ },
  { category: MOVEMENT_CATEGORIES.CITACAO, pattern: /citacao|citado|cite-se/ },
  { category: MOVEMENT_CATEGORIES.INTIMACAO, pattern: /intimacao|intimad|intimar|publicacao|publicad|ciencia/ },
  { category: MOVEMENT_CATEGORIES.DISTRIBUICAO, pattern: /distribuicao|distribuid|autuacao|autuad|sorteio/ }
]);

export function categorizeMovementName(name) {
  const text = normalizeText(name);
  for (const rule of CATEGORY_RULES) if (rule.pattern.test(text)) return rule.category;
  return MOVEMENT_CATEGORIES.OUTRO;
}

function findItem(collection, code) {
  const data = loadOfficial();
  if (!data || !collection) return null;
  const key = String(code ?? '').trim();
  if (!key) return null;
  const entry = data[collection]?.[key] ?? data[collection]?.[String(Number(key))];
  if (!entry) return null;
  const [name, parent, active] = entry;
  return { code: Number(key), name, parent: parent === null ? null : Number(parent), active: active === 'A' };
}

export function lookupTpuClass(code) { return findItem('classes', code); }
export function lookupTpuSubject(code) { return findItem('subjects', code); }
export function lookupTpuDocument(code) { return findItem('documents', code); }

export function lookupTpuMovement(code, { table = undefined } = {}) {
  if (table) {
    const numeric = Number(code);
    if (!Number.isFinite(numeric)) return null;
    return table[numeric] ?? null;
  }
  const item = findItem('movements', code);
  if (item) {
    return {
      ...item,
      category: categorizeMovementName(item.name),
      verified: true,
      method: 'tpu',
      source: 'sgt'
    };
  }
  const curated = TPU_MOVEMENTS[Number(code)];
  return curated ? { ...curated, method: 'tpu-provisional', source: 'curadoria' } : null;
}

export function listTpuMovements({ table = undefined, category = null, activeOnly = false } = {}) {
  if (table) {
    const entries = Object.values(table);
    const filtered = category ? entries.filter(entry => entry.category === category) : entries;
    return filtered.map(entry => ({ ...entry }));
  }
  const data = loadOfficial();
  if (!data) return listTpuMovements({ table: TPU_MOVEMENTS, category, activeOnly });
  const entries = Object.entries(data.movements || {}).map(([code, value]) => {
    const [name, parent, active] = value;
    return {
      code: Number(code),
      name,
      parent: parent === null ? null : Number(parent),
      active: active === 'A',
      category: categorizeMovementName(name),
      verified: true,
      method: 'tpu',
      source: 'sgt'
    };
  });
  const filtered = activeOnly ? entries.filter(entry => entry.active) : entries;
  return category ? filtered.filter(entry => entry.category === category) : filtered;
}
