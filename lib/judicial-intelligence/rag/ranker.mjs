import { tokenize } from './bm25.mjs';

export const RERANK_VERSION = 'ji-rag-rerank-v1';

export function coverageScore(query, text) {
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0) return 0;
  const textTokens = new Set(tokenize(text));
  const covered = queryTerms.filter(term => textTokens.has(term)).length;
  return covered / queryTerms.length;
}

export function rerankChunks(query, candidates = [], { limit = 8, now = () => Date.now() } = {}) {
  const queryNormalized = String(query ?? '').toLowerCase();
  return candidates
    .map(candidate => {
      const chunk = candidate.chunk ?? candidate;
      const base = Number(candidate.score) || 0;
      const coverage = coverageScore(query, chunk.text ?? '');
      let bonus = 0;
      const reasons = [];
      if (coverage > 0) {
        bonus += coverage * 0.6;
        reasons.push(`coverage:${coverage.toFixed(2)}`);
      }
      if (chunk.cnj && queryNormalized.includes(String(chunk.cnj).slice(0, 7))) {
        bonus += 0.5;
        reasons.push('cnj-match');
      }
      if (chunk.documentType && queryNormalized.includes(String(chunk.documentType).toLowerCase())) {
        bonus += 0.2;
        reasons.push('document-type-match');
      }
      if (chunk.date) {
        const timestamp = Date.parse(chunk.date);
        if (Number.isFinite(timestamp) && now() - timestamp < 1000 * 60 * 60 * 24 * 365) {
          bonus += 0.05;
          reasons.push('recent');
        }
      }
      return { ...candidate, chunk, rerankScore: Number((base + bonus).toFixed(6)), rerankReasons: reasons };
    })
    .sort((left, right) => right.rerankScore - left.rerankScore)
    .slice(0, Math.max(1, limit));
}
