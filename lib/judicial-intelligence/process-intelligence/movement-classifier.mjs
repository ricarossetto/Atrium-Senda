import { MOVEMENT_CATEGORIES, TPU_TABLE_STATUS, lookupTpuMovement } from './tpu-table.mjs';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const LEXICON_RULES = Object.freeze([
  { category: MOVEMENT_CATEGORIES.TRANSITO_JULGADO, pattern: /transito em julgado|transitou em julgado/ },
  { category: MOVEMENT_CATEGORIES.CUMPRIMENTO, pattern: /cumprimento de sentenca|cumprimento provisorio|cumprimento definitivo/ },
  { category: MOVEMENT_CATEGORIES.EXECUCAO, pattern: /\bexecucao\b|executivo fiscal|acao de execucao/ },
  { category: MOVEMENT_CATEGORIES.ARQUIVAMENTO, pattern: /arquivamento|arquivad/ },
  { category: MOVEMENT_CATEGORIES.BAIXA, pattern: /baixa definitiva|baixado|remessa ao arquivo|remetido ao arquivo/ },
  { category: MOVEMENT_CATEGORIES.SUSPENSAO, pattern: /suspensao|sobrestamento|sobrestado|suspenso/ },
  { category: MOVEMENT_CATEGORIES.SENTENCA, pattern: /sentenca/ },
  { category: MOVEMENT_CATEGORIES.INTIMACAO, pattern: /publicacao|publicado/ },
  { category: MOVEMENT_CATEGORIES.DECISAO, pattern: /decisao|despacho|decisorio|liminar|tutela/ },
  { category: MOVEMENT_CATEGORIES.RECURSO, pattern: /recurso|apelacao|agravo|embargos|recurso especial|recurso extraordinario/ },
  { category: MOVEMENT_CATEGORIES.AUDIENCIA, pattern: /audiencia|conciliacao|instrucao e julgamento/ },
  { category: MOVEMENT_CATEGORIES.PERICIA, pattern: /pericia|perito|laudo/ },
  { category: MOVEMENT_CATEGORIES.CITACAO, pattern: /citacao|citado/ },
  { category: MOVEMENT_CATEGORIES.INTIMACAO, pattern: /intimacao|intimado|publicacao|publicado|intimar/ },
  { category: MOVEMENT_CATEGORIES.DISTRIBUICAO, pattern: /distribuicao|distribuido|autuacao|autuado/ }
]);

export function classifyMovement(movement, { table = undefined } = {}) {
  const code = movement?.tpuCode ?? movement?.cnjCode ?? movement?.codigo ?? null;
  const description = movement?.description ?? movement?.nome ?? movement?.descricao ?? '';
  const tpu = code === null || code === undefined ? null : lookupTpuMovement(code, table ? { table } : {});
  if (tpu) {
    return {
      category: tpu.category,
      confidence: tpu.verified === true ? 0.98 : 0.9,
      method: tpu.method || (tpu.verified === true ? 'tpu' : `tpu-${TPU_TABLE_STATUS.toLowerCase()}`),
      basis: [`TPU:${tpu.code}:${tpu.name}`]
    };
  }

  const text = normalizeText(description);
  const basis = [];
  if (code !== null && code !== undefined && code !== '') basis.push(`TPU_CODE_UNKNOWN:${code}`);
  for (const rule of LEXICON_RULES) {
    if (rule.pattern.test(text)) {
      basis.push(`LEXICON:${rule.category}`);
      return {
        category: rule.category,
        confidence: basis.length > 1 ? 0.6 : 0.65,
        method: 'lexicon',
        basis
      };
    }
  }
  basis.push('NO_PATTERN');
  return { category: MOVEMENT_CATEGORIES.OUTRO, confidence: 0.3, method: 'none', basis };
}

export function classifyMovements(movements = [], options = {}) {
  return movements.map(movement => ({
    ...movement,
    classification: classifyMovement(movement, options)
  }));
}

export function summarizeMovements(movements = [], options = {}) {
  const classified = movements.map(movement => movement.classification ?? classifyMovement(movement, options));
  const byCategory = {};
  for (const category of Object.values(MOVEMENT_CATEGORIES)) byCategory[category] = 0;
  for (const entry of classified) byCategory[entry.category] += 1;
  const confidenceAverage = classified.length === 0
    ? 0
    : classified.reduce((sum, entry) => sum + entry.confidence, 0) / classified.length;
  return {
    total: classified.length,
    byCategory,
    confidenceAverage: Number(confidenceAverage.toFixed(4)),
    tpuFirst: classified.filter(entry => entry.method.startsWith('tpu')).length,
    lexiconFallback: classified.filter(entry => entry.method === 'lexicon').length,
    unclassified: classified.filter(entry => entry.method === 'none').length,
    tableStatus: TPU_TABLE_STATUS
  };
}
