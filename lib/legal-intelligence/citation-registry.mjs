/**
 * Registro de citações do Gerador de Minutas (grounding).
 *
 * Cada referência específica do rascunho (tema, súmula, precedente superior)
 * vira uma entrada com identidade estável, política e status:
 * - `verified`: a referência existe nas fontes fornecidas (documentos/mensagem);
 * - `conflict`: a mesma referência aparece nas fontes com tribunal diferente do
 *   declarado no rascunho (bloqueante — não harmonizar silenciosamente);
 * - `pending`: o rascunho marcou a referência para conferência oficial;
 * - `unverified`: não há confirmação nas fontes; resultado de pesquisa externa é
 *   apenas discovery (nunca autoridade).
 *
 * O módulo é puro: não lê disco, rede nem estado oficial, e nunca inventa
 * verificação. A revisão final (`evaluateCitationReview`) lista bloqueios e
 * aceita override explícito com justificativa para auditoria.
 */

export const CITATION_POLICY_BY_KIND = Object.freeze({
  tema: 'required',
  sumula: 'required',
  'precedente-superior': 'required'
});

const CITATION_PATTERNS = Object.freeze([
  { kind: 'tema', re: /\bTema\s+(?:n[ºo°.]?\s*)?(\d{1,5}(?:\.\d{3})*)\b/gi },
  { kind: 'sumula', re: /\bS[úu]mula\s+(?:Vinculante\s+)?(?:n[ºo°.]?\s*)?(\d{1,4}(?:\.\d{3})*)\b/gi },
  { kind: 'precedente-superior', re: /\b(?:REsp|AREsp|AgInt|AgRg|EDcl|EREsp|RMS|HC|MS|RE|ARE|ADI|ADC|ADPF|IRDR|IAC)\s*(?:n[ºo°.]?\s*)?([\d.]{4,})\b/gi }
]);

const PENDING_MARKER_RE = /(?:CONFERIR|A CONFIRMAR|PENDENTE DE VERIFICA|FONTE OFICIAL|N[ÃA]O VERIFICAD|LOCALIZAD[OA], PENDENTE)/i;
const COURT_RE = /\b(STF|STJ|TST|TSE|STM|TRF\s*[1-6]|TJ[A-Z]{2}|TNU|CARF)\b/i;
const COURT_AFTER_RE = /^\s*(?:d[aeo]s?\s+|n[ao]\s+)?\b(STF|STJ|TST|TSE|STM|TRF\s*[1-6]|TJ[A-Z]{2}|TNU|CARF)\b/i;

const CITATION_LIMIT = 120;
const OVERRIDE_JUSTIFICATION_MIN = 10;
const OVERRIDE_JUSTIFICATION_MAX = 500;

function cleanText(value, max = 200) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeDigits(value) {
  return String(value || '').replace(/[\s.]/g, '');
}

function normalizeCourt(value) {
  return cleanText(value, 12).toUpperCase().replace(/\s+/g, '');
}

export function citationKey(kind, digits) {
  return `${kind}:${normalizeDigits(digits)}`;
}

function citationContext(source, index, length) {
  const start = Math.max(0, index - 70);
  const end = Math.min(source.length, index + length + 90);
  return cleanText(source.slice(start, end), 220);
}

function citationLine(source, index, length) {
  const lineStart = source.lastIndexOf('\n', index) + 1;
  const nextBreak = source.indexOf('\n', index + length);
  const lineEnd = nextBreak === -1 ? source.length : nextBreak;
  return source.slice(lineStart, lineEnd);
}

function extractFromSource(source, { withContext = false } = {}) {
  const text = String(source || '');
  const entries = [];
  for (const pattern of CITATION_PATTERNS) {
    const regex = new RegExp(pattern.re.source, pattern.re.flags);
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (entries.length >= CITATION_LIMIT) break;
      const after = text.slice(match.index + match[0].length, match.index + match[0].length + 60);
      const courtMatch = after.match(COURT_AFTER_RE);
      entries.push({
        kind: pattern.kind,
        digits: normalizeDigits(match[1]),
        raw: cleanText(match[0], 80),
        index: match.index,
        court: courtMatch ? normalizeCourt(courtMatch[1]) : '',
        pending: PENDING_MARKER_RE.test(citationLine(text, match.index, match[0].length)),
        ...(withContext ? { context: citationContext(text, match.index, match[0].length) } : {})
      });
    }
  }
  entries.sort((a, b) => a.index - b.index || a.kind.localeCompare(b.kind));
  return entries;
}

export function extractCitationEntries(draft) {
  return extractFromSource(draft, { withContext: true });
}

function buildSourceIndex(documents = [], message = '') {
  const index = new Map();
  const sources = [
    ...(Array.isArray(documents) ? documents : []).map(document => ({
      type: 'documento',
      ref: cleanText(document?.id, 40) || cleanText(document?.name, 80) || 'documento',
      label: cleanText(document?.name, 120),
      text: String(document?.text || '')
    })),
    { type: 'mensagem', ref: 'mensagem', label: 'Mensagem do usuário', text: String(message || '') }
  ];
  for (const source of sources) {
    if (!source.text) continue;
    for (const found of extractFromSource(source.text)) {
      const key = citationKey(found.kind, found.digits);
      const current = index.get(key) || { sources: [], courts: new Set() };
      if (!current.sources.some(item => item.type === source.type && item.ref === source.ref)) {
        current.sources.push({ type: source.type, ref: source.ref, label: source.label || null });
      }
      if (found.court) current.courts.add(found.court);
      index.set(key, current);
    }
  }
  return index;
}

function buildResearchIndex(research = {}) {
  const index = new Map();
  const results = Array.isArray(research?.results) ? research.results : [];
  for (const result of results) {
    if (!result?.ok) continue;
    const haystack = JSON.stringify(result);
    for (const pattern of CITATION_PATTERNS) {
      const regex = new RegExp(pattern.re.source, pattern.re.flags);
      let match;
      while ((match = regex.exec(haystack)) !== null) {
        const key = citationKey(pattern.kind, match[1]);
        if (!index.has(key)) index.set(key, { query: cleanText(result.query, 160) });
      }
    }
  }
  return index;
}

export function buildCitationRegistry({ draft = '', documents = [], message = '', research = {}, now = null } = {}) {
  const extracted = extractCitationEntries(draft);
  const sourceIndex = buildSourceIndex(documents, message);
  const researchIndex = buildResearchIndex(research);
  const entries = extracted.map((citation, position) => {
    const key = citationKey(citation.kind, citation.digits);
    const sourceHit = sourceIndex.get(key) || null;
    const researchHit = researchIndex.get(key) || null;
    const policy = CITATION_POLICY_BY_KIND[citation.kind] || 'advisory';
    let status = 'unverified';
    let note = 'Sem confirmação nas fontes fornecidas; conferir em fonte oficial antes de exportar.';
    if (sourceHit) {
      const sourceCourts = [...sourceHit.courts];
      if (citation.court && sourceCourts.length && !sourceCourts.includes(citation.court)) {
        status = 'conflict';
        note = `O rascunho indica ${citation.court}, mas a fonte associa a referência a ${sourceCourts.join('/')}. Divergência não é harmonizada automaticamente.`;
      } else {
        status = 'verified';
        note = 'Referência confirmada nas fontes fornecidas.';
      }
    } else if (citation.pending) {
      status = 'pending';
      note = 'Referência marcada para conferência em fonte oficial.';
    } else if (researchHit) {
      note = `Encontrada apenas em discovery de pesquisa externa${researchHit.query ? ` ("${researchHit.query}")` : ''}; discovery não é autoridade.`;
    }
    const groundedIn = sourceHit ? sourceHit.sources : researchHit ? [{ type: 'pesquisa', ref: researchHit.query || 'pesquisa' }] : [];
    return {
      id: `C${position + 1}`,
      kind: citation.kind,
      raw: citation.raw,
      digits: citation.digits,
      court: citation.court || null,
      index: citation.index,
      context: citation.context,
      pending: citation.pending,
      policy,
      status,
      groundedIn,
      note
    };
  });
  return {
    entries,
    checkedAt: now ? String(now).slice(0, 40) : null,
    counts: {
      total: entries.length,
      verified: entries.filter(entry => entry.status === 'verified').length,
      conflict: entries.filter(entry => entry.status === 'conflict').length,
      pending: entries.filter(entry => entry.status === 'pending').length,
      unverified: entries.filter(entry => entry.status === 'unverified').length
    }
  };
}

export function evaluateCitationReview(registry = {}, { override = null } = {}) {
  const entries = Array.isArray(registry.entries) ? registry.entries : [];
  const blockers = entries
    .filter(entry => entry.policy === 'required' && (entry.status === 'unverified' || entry.status === 'conflict'))
    .map(entry => ({
      id: entry.id,
      kind: entry.kind,
      raw: entry.raw,
      status: entry.status,
      message: entry.status === 'conflict'
        ? `Conflito de fonte: ${entry.raw}. ${entry.note}`
        : `Referência específica sem verificação nem marcador de conferência: ${entry.raw}.`
    }));
  const warnings = entries
    .filter(entry => entry.status === 'pending' || (entry.status === 'unverified' && entry.policy !== 'required'))
    .map(entry => ({ id: entry.id, kind: entry.kind, raw: entry.raw, status: entry.status, message: entry.note }));
  const justification = cleanText(override?.justification, OVERRIDE_JUSTIFICATION_MAX);
  const overrideApplied = blockers.length > 0 && justification.length >= OVERRIDE_JUSTIFICATION_MIN;
  const overrideRecord = overrideApplied
    ? {
        justification,
        actor: cleanText(override?.actor, 100) || null,
        at: cleanText(override?.at, 40) || null
      }
    : null;
  const counts = registry.counts || {
    total: entries.length,
    verified: entries.filter(entry => entry.status === 'verified').length,
    conflict: entries.filter(entry => entry.status === 'conflict').length,
    pending: entries.filter(entry => entry.status === 'pending').length,
    unverified: entries.filter(entry => entry.status === 'unverified').length
  };
  const status = blockers.length && !overrideApplied ? 'FAIL' : warnings.length || overrideApplied ? 'PASS_WITH_WARNINGS' : 'PASS';
  return {
    status,
    ready: blockers.length === 0 || overrideApplied,
    counts,
    blockers,
    warnings,
    overrideApplied,
    override: overrideRecord,
    reviewRequired: true
  };
}
