export const CITATION_STATUS = Object.freeze({
  VALID: 'VALID',
  UNKNOWN_CHUNK: 'UNKNOWN_CHUNK',
  QUOTE_NOT_FOUND: 'QUOTE_NOT_FOUND',
  EMPTY_CLAIM: 'EMPTY_CLAIM'
});

export const CITATION_MARKER = /\[chunk:([a-z0-9-]{2,64})\]/gi;

export function normalizeForMatch(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateCitation({ claim = '', chunkId, quote = null, chunksById } = {}) {
  if (!claim.trim()) {
    return { status: CITATION_STATUS.EMPTY_CLAIM, chunkId, valid: false };
  }
  const chunk = chunksById?.get(chunkId);
  if (!chunk) {
    return { status: CITATION_STATUS.UNKNOWN_CHUNK, chunkId, valid: false, claim };
  }
  if (quote) {
    const haystack = normalizeForMatch(chunk.text);
    const needle = normalizeForMatch(quote).slice(0, 400);
    if (!needle || !haystack.includes(needle)) {
      return { status: CITATION_STATUS.QUOTE_NOT_FOUND, chunkId, valid: false, claim };
    }
  }
  return { status: CITATION_STATUS.VALID, chunkId, valid: true, claim, page: chunk.page ?? null };
}

export function validateCitations(citations = [], chunksById) {
  const results = citations.map(citation => validateCitation({ ...citation, chunksById }));
  return {
    results,
    valid: results.filter(result => result.valid),
    invalid: results.filter(result => !result.valid),
    allValid: results.length > 0 && results.every(result => result.valid)
  };
}

export function claimsFromAnswer(answerText) {
  const text = String(answerText ?? '').trim();
  if (!text) return [];
  return text
    .split(/\r?\n+/)
    .map(line => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)
    .map(line => ({
      claim: line.replace(CITATION_MARKER, '').trim(),
      citations: [...line.matchAll(CITATION_MARKER)].map(match => match[1])
    }));
}

export function assertFaithfulAnswer(answerText, chunksById) {
  const claims = claimsFromAnswer(answerText);
  const uncited = claims.filter(claim => claim.citations.length === 0);
  const invalid = [];
  for (const claim of claims) {
    for (const chunkId of claim.citations) {
      const validation = validateCitation({ claim: claim.claim, chunkId, chunksById });
      if (!validation.valid) invalid.push({ claim: claim.claim, chunkId, status: validation.status });
    }
  }
  return {
    ok: claims.length > 0 && uncited.length === 0 && invalid.length === 0,
    totalClaims: claims.length,
    uncitedClaims: uncited.map(claim => claim.claim),
    invalidCitations: invalid,
    claims
  };
}

export function buildEvidencePack(chunks = [], { limit = 8, snippetChars = 280 } = {}) {
  return chunks.slice(0, limit).map(chunk => ({
    chunkId: chunk.chunkId,
    cnj: chunk.cnj ?? null,
    documentId: chunk.documentId ?? null,
    documentType: chunk.documentType ?? null,
    source: chunk.source ?? null,
    page: chunk.page ?? null,
    date: chunk.date ?? null,
    snippet: String(chunk.text ?? '').slice(0, snippetChars)
  }));
}
