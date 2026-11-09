export const BM25_K1 = 1.5;
export const BM25_B = 0.75;

const STOPWORDS = new Set([
  'a', 'o', 'e', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'para', 'por', 'com', 'sem',
  'que', 'se', 'ao', 'aos', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'the', 'of', 'and', 'to', 'in', 'is', 'it'
]);

export function normalizeToken(token) {
  return String(token ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function tokenize(text, { keepStopwords = false } = {}) {
  return String(text ?? '')
    .split(/[\s,.;:!?()[\]{}"'`/\\|<>]+/)
    .map(normalizeToken)
    .filter(token => token.length >= 2 && (keepStopwords || !STOPWORDS.has(token)));
}

export function buildBm25Index(chunks = []) {
  const documents = chunks.map(chunk => ({
    chunkId: chunk.chunkId,
    tokens: tokenize(chunk.text),
    length: 0
  }));
  const df = new Map();
  for (const document of documents) {
    document.length = document.tokens.length;
    for (const token of new Set(document.tokens)) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }
  const totalLength = documents.reduce((sum, document) => sum + document.length, 0);
  return {
    version: 1,
    chunkIds: documents.map(document => document.chunkId),
    df,
    N: documents.length,
    avgdl: documents.length > 0 ? totalLength / documents.length : 0,
    documents
  };
}

export function bm25Search(index, query, { topK = 10 } = {}) {
  if (!index || index.N === 0) return [];
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const scores = new Map();
  for (const document of index.documents) {
    const frequencies = new Map();
    for (const token of document.tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    let score = 0;
    for (const term of terms) {
      const tf = frequencies.get(term) ?? 0;
      if (tf === 0) continue;
      const df = index.df.get(term) ?? 0;
      const idf = Math.log(1 + (index.N - df + 0.5) / (df + 0.5));
      const denominator = tf + BM25_K1 * (1 - BM25_B + BM25_B * (document.length / (index.avgdl || 1)));
      score += idf * ((tf * (BM25_K1 + 1)) / (denominator || 1));
    }
    if (score > 0) scores.set(document.chunkId, score);
  }
  return [...scores.entries()]
    .map(([chunkId, score]) => ({ chunkId, score }))
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, topK));
}
