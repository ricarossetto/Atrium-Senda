/**
 * ATRIUM — Calibração assistiva do JEV (aprendizado com correções humanas).
 *
 * Regras do contrato:
 * - quem decide jurídico é gente: um rótulo corrigido por pessoa **vence** a sugestão do
 *   modelo no painel, sempre (`origin: 'humano'`), e o modelo nunca reescreve essa escolha;
 * - a correção vira **exemplo de calibração** para as próximas classificações do mesmo
 *   esquema/pergunta: o bloco de exemplos entra no texto enviado ao modelo, nunca como
 *   instrução solta e nunca como verdade jurídica nova;
 * - nada de PII: o trecho é sempre o texto **já redigido** (`redactForJev`), truncado, com
 *   guarda extra contra CPF/CNPJ/OAB/e-mail; nada é copiado do cliente;
 * - o store é derivado (não é estado oficial): pode ser reconstruído, e apagar o arquivo
 *   apenas devolve o classificador ao comportamento sem exemplos;
 * - o JEV continua proibido de calcular prazo: aqui só circulam rótulos de área/categoria.
 *
 * Módulo puro: sem I/O, sem HTTP, sem relógio implícito.
 */

export const CALIBRATION_VERSION = 1;
export const CALIBRATION_MAX_EXAMPLES = 120;
export const CALIBRATION_EXAMPLES_PER_QUESTION = 6;
export const CALIBRATION_EXCERPT_CHARS = 200;
// Áreas nomeadas pelo escritório (além do vocabulário fixo): texto humano curto, reutilizável no
// painel. Não entram no vocabulário do modelo — a sugestão automática continua limitada ao schema.
export const CALIBRATION_MAX_CUSTOM_AREAS = 24;
export const CALIBRATION_CUSTOM_AREA_CHARS = 48;
export const CALIBRATION_CUSTOM_AREA_MIN_CHARS = 3;

const SENSITIVE_PATTERNS = [
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/,
  /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/,
  /\b\d{1,6}\s?\/\s?[A-Z]{2}\b/,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  /\b\d{11,}\b/
];

const SCHEMA_ID_PATTERN = /^[a-z][a-z0-9_]{2,40}$/;
const QUESTION_KEY_PATTERN = /^[a-z][a-z0-9_]{1,40}$/;

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function sanitizeCalibrationExcerpt(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, CALIBRATION_EXCERPT_CHARS);
  if (!text) return '';
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(text)) return '';
  }
  return text;
}

export function calibrationExampleKey(example) {
  return [example.schemaId, example.questionKey, example.label, example.excerpt].join('|');
}

const customAreaKey = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

/** Área nomeada por pessoa: espaços normalizados, tamanho limitado e sem caracteres de controle. */
export function sanitizeCustomArea(value) {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CALIBRATION_CUSTOM_AREA_CHARS);
  return text.length >= CALIBRATION_CUSTOM_AREA_MIN_CHARS ? text : '';
}

export function customAreasOf(store) {
  return normalizeCalibrationStore(store).customAreas;
}

/** Acha a área registrada pelo nome (sem caixa/acento); devolve o rótulo oficial ou ''. */
export function findCustomArea(store, label) {
  const key = customAreaKey(label);
  if (!key) return '';
  return customAreasOf(store).find(item => customAreaKey(item) === key) || '';
}

/** Registra uma área nomeada (deduplicada sem caixa/acento, com teto) e devolve o store novo. */
export function registerCustomArea(store, label) {
  const current = normalizeCalibrationStore(store);
  const area = sanitizeCustomArea(label);
  if (!area) return { store: current, area: '', added: false };
  const key = customAreaKey(area);
  const existing = current.customAreas.find(item => customAreaKey(item) === key);
  if (existing) return { store: current, area: existing, added: false };
  return {
    store: { ...current, customAreas: [...current.customAreas, area].slice(-CALIBRATION_MAX_CUSTOM_AREAS) },
    area,
    added: true
  };
}

function sanitizeExample(raw) {
  const source = asObject(raw);
  const schemaId = String(source.schemaId || '').trim();
  const questionKey = String(source.questionKey || '').trim();
  const label = String(source.label || '').trim();
  const excerpt = sanitizeCalibrationExcerpt(source.excerpt);
  if (!SCHEMA_ID_PATTERN.test(schemaId)) return null;
  if (!QUESTION_KEY_PATTERN.test(questionKey)) return null;
  if (!label || label.length > 60) return null;
  if (!excerpt) return null;
  return {
    schemaId,
    questionKey,
    label,
    modelLabel: String(source.modelLabel || '').slice(0, 60),
    excerpt,
    at: String(source.at || ''),
    actor: String(source.actor || '').slice(0, 80)
  };
}

export function normalizeCalibrationStore(value) {
  const source = asObject(value);
  const seen = new Set();
  const examples = [];
  for (const item of Array.isArray(source.examples) ? source.examples : []) {
    const example = sanitizeExample(item);
    if (!example) continue;
    const key = calibrationExampleKey(example);
    if (seen.has(key)) continue;
    seen.add(key);
    examples.push(example);
  }
  examples.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const overrides = {};
  const rawOverrides = asObject(source.overrides);
  for (const [schemaId, byTarget] of Object.entries(rawOverrides)) {
    if (!SCHEMA_ID_PATTERN.test(schemaId)) continue;
    const targets = {};
    for (const [targetKey, entry] of Object.entries(asObject(byTarget))) {
      const clean = String(targetKey || '').trim().slice(0, 160);
      if (!clean) continue;
      const questions = {};
      for (const [questionKey, label] of Object.entries(asObject(asObject(entry).questions))) {
        if (!QUESTION_KEY_PATTERN.test(questionKey)) continue;
        const value = String(label || '').trim().slice(0, 60);
        if (value) questions[questionKey] = value;
      }
      if (Object.keys(questions).length === 0) continue;
      targets[clean] = {
        questions,
        at: String(asObject(entry).at || ''),
        actor: String(asObject(entry).actor || '').slice(0, 80)
      };
    }
    if (Object.keys(targets).length > 0) overrides[schemaId] = targets;
  }
  const customAreas = [];
  const seenAreas = new Set();
  for (const item of Array.isArray(source.customAreas) ? source.customAreas : []) {
    const area = sanitizeCustomArea(item);
    if (!area) continue;
    const key = customAreaKey(area);
    if (seenAreas.has(key)) continue;
    seenAreas.add(key);
    customAreas.push(area);
  }
  return {
    version: CALIBRATION_VERSION,
    updatedAt: String(source.updatedAt || ''),
    examples: examples.slice(-CALIBRATION_MAX_EXAMPLES),
    overrides,
    customAreas: customAreas.slice(-CALIBRATION_MAX_CUSTOM_AREAS)
  };
}

/**
 * Registra uma correção humana: cria/atualiza o override do alvo e acrescenta o exemplo de
 * calibração (deduplicado, com poda FIFO). Devolve o store novo e o exemplo aceito (ou null
 * quando o trecho foi descartado por conter dado sensível).
 */
export function recordHumanCorrection(store, { schemaId, questionKey, label, modelLabel = '', excerpt = '', targetKey = '', actor = '', now = new Date().toISOString() } = {}) {
  const current = normalizeCalibrationStore(store);
  const cleanSchema = String(schemaId || '').trim();
  const cleanQuestion = String(questionKey || '').trim();
  const cleanLabel = String(label || '').trim();
  const cleanTarget = String(targetKey || '').trim().slice(0, 160);
  if (!SCHEMA_ID_PATTERN.test(cleanSchema) || !QUESTION_KEY_PATTERN.test(cleanQuestion) || !cleanLabel) {
    return { store: current, example: null, changed: false, reason: 'entrada-invalida' };
  }
  const overrides = { ...current.overrides };
  const byTarget = { ...(overrides[cleanSchema] || {}) };
  if (cleanTarget) {
    const previous = byTarget[cleanTarget] || { questions: {} };
    byTarget[cleanTarget] = {
      questions: { ...previous.questions, [cleanQuestion]: cleanLabel },
      at: now,
      actor: String(actor || '').slice(0, 80)
    };
    overrides[cleanSchema] = byTarget;
  }
  const example = sanitizeExample({
    schemaId: cleanSchema,
    questionKey: cleanQuestion,
    label: cleanLabel,
    modelLabel,
    excerpt,
    at: now,
    actor
  });
  let examples = current.examples;
  if (example) {
    const key = calibrationExampleKey(example);
    examples = [...examples.filter(item => calibrationExampleKey(item) !== key), example].slice(-CALIBRATION_MAX_EXAMPLES);
  }
  return {
    store: { version: CALIBRATION_VERSION, updatedAt: now, examples, overrides, customAreas: current.customAreas },
    example,
    changed: Boolean(cleanTarget) || Boolean(example),
    reason: example ? '' : 'trecho-descartado'
  };
}

export function suggestionOverrideFor(store, schemaId, targetKey) {
  const normalized = normalizeCalibrationStore(store);
  const byTarget = normalized.overrides[String(schemaId || '')];
  if (!byTarget) return null;
  return byTarget[String(targetKey || '')] || null;
}

/** Aplica a correção humana sobre a sugestão pública (o humano vence o modelo). */
export function applyOverridesToPublicSuggestion(publicSuggestion, override) {
  if (!publicSuggestion || typeof publicSuggestion !== 'object' || !override) return publicSuggestion;
  const questions = asObject(override.questions);
  if (Object.keys(questions).length === 0) return publicSuggestion;
  const suggestion = { ...asObject(publicSuggestion.suggestion) };
  for (const [questionKey, label] of Object.entries(questions)) {
    suggestion[questionKey] = { label, confidence: 1, origin: 'humano' };
  }
  return {
    ...publicSuggestion,
    suggestion,
    origin: 'humano',
    humanRequired: false,
    reason: `Rótulo corrigido por pessoa${override.actor ? ` (${override.actor})` : ''}; a sugestão do modelo fica registrada apenas como histórico.`
  };
}

/** Aplica a correção humana sobre a entrada do painel de triagem (lista). */
export function applyOverridesToTriageEntry(entry, override) {
  if (!entry || typeof entry !== 'object' || !override) return entry;
  const questions = asObject(override.questions);
  const next = { ...entry, origin: 'humano', humanAt: override.at || '', humanBy: override.actor || '' };
  if (questions.area) {
    next.area = questions.area;
    next.areaConfidence = 1;
    next.areaOrigin = 'humano';
  }
  if (questions.priority) {
    next.priority = questions.priority;
    next.priorityConfidence = 1;
    next.priorityOrigin = 'humano';
  }
  if (questions.category) {
    next.category = questions.category;
    next.categoryConfidence = 1;
    next.categoryOrigin = 'humano';
  }
  return next;
}

/**
 * Bloco de exemplos enviado ao modelo no próprio `state` (texto a classificar). Só inclui
 * exemplos do esquema pedido, mais recentes primeiro, limitados por pergunta.
 */
export function calibrationBlockFor(store, schemaId, { perQuestion = CALIBRATION_EXAMPLES_PER_QUESTION } = {}) {
  const normalized = normalizeCalibrationStore(store);
  const wanted = normalized.examples.filter(example => example.schemaId === String(schemaId || ''));
  if (wanted.length === 0) return '';
  const byQuestion = new Map();
  for (const example of wanted) {
    const list = byQuestion.get(example.questionKey) || [];
    list.push(example);
    byQuestion.set(example.questionKey, list);
  }
  const lines = [];
  for (const [questionKey, list] of byQuestion) {
    for (const example of list.slice(-Math.max(1, Number(perQuestion) || 1)).reverse()) {
      const correction = example.modelLabel && example.modelLabel !== example.label
        ? ` (modelo havia sugerido "${example.modelLabel}")`
        : '';
      lines.push(`- [${questionKey}] "${example.excerpt}" => ${example.label}${correction}`);
    }
  }
  if (lines.length === 0) return '';
  return [
    '',
    'CALIBRAÇÃO DO ESCRITÓRIO (correções feitas por pessoas do escritório; use como padrão,',
    'elas vencem a sua impressão):',
    ...lines
  ].join('\n');
}

export function calibrationStats(store) {
  const normalized = normalizeCalibrationStore(store);
  const overrides = Object.values(normalized.overrides).reduce((total, byTarget) => total + Object.keys(byTarget).length, 0);
  return { examples: normalized.examples.length, overrides, updatedAt: normalized.updatedAt };
}
