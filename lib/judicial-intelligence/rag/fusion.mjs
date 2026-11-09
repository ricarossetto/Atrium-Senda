export const RRF_K = 60;

export function reciprocalRankFusion(rankings = [], { k = RRF_K, weights = [] } = {}) {
  const scores = new Map();
  rankings.forEach((ranking, listIndex) => {
    const weight = weights[listIndex] ?? 1;
    ranking.forEach((entry, position) => {
      const chunkId = entry.chunkId;
      const contribution = weight * (1 / (k + position + 1));
      scores.set(chunkId, (scores.get(chunkId) ?? 0) + contribution);
    });
  });
  return [...scores.entries()]
    .map(([chunkId, score]) => ({ chunkId, score }))
    .sort((left, right) => right.score - left.score);
}

export function cosineSimilarity(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || left.length === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function denseSearch(entries = [], queryEmbedding, { topK = 10 } = {}) {
  if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) return [];
  return entries
    .map(entry => ({ chunkId: entry.chunkId, score: cosineSimilarity(entry.embedding, queryEmbedding) }))
    .filter(entry => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, topK));
}
