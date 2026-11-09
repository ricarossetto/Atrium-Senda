/**
 * Normalização, deduplicação e ranqueamento de resultados de pesquisa jurídica.
 *
 * Resultados de provedores externos chegam em formatos heterogêneos e são
 * apenas discovery: este módulo extrai itens oficiais (tipo, identidade,
 * tribunal, título, resumo, data, link), deduplica por identidade estável e
 * ordena por aderência ao claim e aos tribunais preferidos. Nada é inventado:
 * item sem identidade textual utilizável é descartado.
 */

const KIND_PATTERNS = Object.freeze([
  { kind: 'sumula-vinculante', re: /\bs[úu]mula\s+vinculante\s*(?:n[ºo°.]?\s*)?(\d{1,4}(?:\.\d{3})*)/i },
  { kind: 'sumula', re: /\bs[úu]mula\s*(?:n[ºo°.]?\s*)?(\d{1,4}(?:\.\d{3})*)/i },
  { kind: 'tema', re: /\btema\s*(?:n[ºo°.]?\s*)?(\d{1,5}(?:\.\d{3})*)/i },
  { kind: 'repetitivo', re: /\b(?:recurso|repercuss[ãa]o)\s+(?:especial\s+)?repetitiv[oa]s?\b|\brepetitivo\s*(?:n[ºo°.]?\s*)?(\d{1,5})/i },
  { kind: 'rg', re: /\bRG\s*(?:n[ºo°.]?\s*)?(\d{1,5})/i },
  { kind: 'iac', re: /\bIAC\s*(?:n[ºo°.]?\s*)?(\d{1,5})/i },
  { kind: 'puil', re: /\bPUIL\s*(?:n[ºo°.]?\s*)?(\d{1,5})/i },
  { kind: 'natjus', re: /\bNATJUS\b(?:\s*(?:n[ºo°.]?\s*)?(\d{1,6}))?/i },
  { kind: 'legislacao', re: /\b(?:art\.?|artigo)\s*(\d{1,4}(?:[º°])?(?:\s*,\s*§\s*\d+[º°]?)?)/i },
  { kind: 'acordao', re: /\b(?:ac[óo]rd[ãa]o|decis[ãa]o|senten[çc]a)\b/i }
]);

const COURT_RE = /\b(STF|STJ|TST|TSE|STM|TRF\s*[1-6]|TJ[A-Z]{2}|TNU|CARJ?F)\b/i;

const IDENTIFIER_KEYS = ['numero', 'n', 'identificador', 'id', 'numeroProcesso', 'numero_processo', 'registro'];
const TITLE_KEYS = ['titulo', 'title', 'ementa', 'tese', 'assunto', 'nome', 'descricao', 'descrição', 'summary'];
const SUMMARY_KEYS = ['resumo', 'summary', 'ementa', 'texto', 'descricao', 'descrição', 'conteudo', 'conteúdo', 'tese'];
const DATE_KEYS = ['data', 'dataPublicacao', 'data_publicacao', 'dataJulgamento', 'data_julgamento', 'dataPublicacaoDJe', 'dataAprovacao'];
const URL_KEYS = ['link', 'url', 'href', 'permalink', 'fonte'];

function cleanText(value, max = 600) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeDigits(value) {
  return String(value || '').replace(/[\s.]/g, '');
}

function normalizeCourt(value) {
  const match = cleanText(value, 40).toUpperCase().match(COURT_RE);
  return match ? match[1].replace(/\s+/g, '') : '';
}

function pick(object, keys) {
  for (const key of keys) {
    if (object[key] !== undefined && object[key] !== null && String(object[key]).trim() !== '') return object[key];
  }
  return '';
}

export function detectResearchKind(text) {
  const source = cleanText(text, 4000);
  if (!source) return 'desconhecido';
  for (const pattern of KIND_PATTERNS) {
    if (pattern.re.test(source)) return pattern.kind;
  }
  return 'desconhecido';
}

export function extractResearchItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['items', 'resultados', 'results', 'data', 'docs', 'hits', 'registros']) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = extractResearchItems(value);
      if (nested.length) return nested;
    }
  }
  return [];
}

function identifierFromText(text) {
  for (const pattern of KIND_PATTERNS) {
    const match = cleanText(text, 4000).match(pattern.re);
    if (match) {
      return { kind: pattern.kind, identifier: normalizeDigits(match[1] || '') };
    }
  }
  return { kind: detectResearchKind(text), identifier: '' };
}

export function normalizeResearchItem(raw, { sourceId = '', tool = '', courtHint = '' } = {}) {
  const object = raw && typeof raw === 'object' ? raw : { ementa: String(raw || '') };
  const title = cleanText(pick(object, TITLE_KEYS), 300);
  const summary = cleanText(pick(object, SUMMARY_KEYS), 800);
  const rawIdentifier = cleanText(pick(object, IDENTIFIER_KEYS), 60);
  const haystack = cleanText([title, summary, rawIdentifier, object.tipo, object.type].filter(Boolean).join(' · '), 4000);
  if (!haystack) return null;
  const detected = identifierFromText(haystack);
  const identifier = normalizeDigits(rawIdentifier) || detected.identifier;
  const court = normalizeCourt(pick(object, ['tribunal', 'court', 'siglaTribunal', 'sigla_tribunal', 'orgao', 'órgão'])) || normalizeCourt(haystack) || normalizeCourt(courtHint);
  if (!identifier && !title && !summary) return null;
  return {
    kind: detected.kind,
    identifier,
    court,
    title: title || summary.slice(0, 300),
    summary,
    date: cleanText(pick(object, DATE_KEYS), 40) || null,
    url: cleanText(pick(object, URL_KEYS), 500) || null,
    sourceId: cleanText(sourceId, 40) || null,
    tool: cleanText(tool, 60) || null
  };
}

export function researchItemKey(item) {
  if (item.identifier) return `${item.kind}:${item.identifier}:${item.court || ''}`;
  return `${item.kind}:${cleanText(item.title, 160).toLowerCase()}`;
}

export function dedupeResearchItems(items = []) {
  const byKey = new Map();
  let duplicates = 0;
  for (const item of Array.isArray(items) ? items : []) {
    if (!item) continue;
    const key = researchItemKey(item);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }
    duplicates += 1;
    byKey.set(key, {
      ...existing,
      summary: existing.summary.length >= item.summary.length ? existing.summary : item.summary,
      date: existing.date || item.date,
      url: existing.url || item.url,
      sourceId: existing.sourceId || item.sourceId,
      sources: [...new Set([...(existing.sources || [existing.sourceId]).filter(Boolean), item.sourceId].filter(Boolean))]
    });
  }
  return { items: [...byKey.values()], duplicates };
}

function claimTerms(claim) {
  return [...new Set(
    cleanText(claim, 400).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/)
      .filter(term => term.length >= 4)
  )].slice(0, 20);
}

export function rankResearchItems(items = [], { claim = '', preferredCourts = [] } = {}) {
  const terms = claimTerms(claim);
  const courts = new Set((Array.isArray(preferredCourts) ? preferredCourts : []).map(court => normalizeCourt(court)).filter(Boolean));
  return [...(Array.isArray(items) ? items : [])]
    .map(item => {
      const haystack = cleanText([item.title, item.summary].join(' '), 2000)
        .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const overlap = terms.filter(term => haystack.includes(term)).length;
      let score = 0;
      if (item.identifier) score += 30;
      if (item.court && courts.has(item.court)) score += 20;
      if (item.kind.startsWith('sumula')) score += 8;
      if (item.kind === 'repetitivo' || ['rg', 'iac', 'puil', 'tema'].includes(item.kind)) score += 6;
      score += Math.min(overlap, 10) * 2;
      if (item.date) score += 1;
      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score || String(a.kind).localeCompare(String(b.kind)) || String(a.identifier).localeCompare(String(b.identifier)));
}

export function buildResearchCoverage(sources = []) {
  return sources.map(source => ({
    id: source.id,
    label: source.label,
    status: source.status || 'unknown',
    calls: Number(source.calls) || 0,
    items: Number(source.items) || 0,
    error: source.error || null,
    ...(source.partial ? { partial: true } : {}),
    ...(Number(source.skippedTools) ? { skippedTools: Number(source.skippedTools) } : {})
  }));
}
