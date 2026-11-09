import { buildBm25Index, bm25Search } from './bm25.mjs';
import { reciprocalRankFusion, denseSearch } from './fusion.mjs';
import { rerankChunks } from './ranker.mjs';

export async function createRetrievalIndex({ chunks = [], embedder = null } = {}) {
  const chunksById = new Map(chunks.map(chunk => [chunk.chunkId, chunk]));
  const bm25 = buildBm25Index(chunks);
  let embeddings = [];
  if (embedder && chunks.length > 0) {
    const vectors = await embedder.embed(chunks.map(chunk => chunk.text));
    embeddings = chunks.map((chunk, index) => ({ chunkId: chunk.chunkId, embedding: vectors[index] ?? [] }));
  }
  return {
    chunks,
    chunksById,
    bm25,
    embeddings,
    embedderId: embedder?.id ?? null,
    embedderInstance: embedder ?? null
  };
}

export async function hybridRetrieve({ index, question, topK = 8, preK = 20 } = {}) {
  if (!index) return { results: [], diagnostics: { bm25: 0, dense: 0, fused: 0, sources: [] } };
  const bm25Ranking = bm25Search(index.bm25, question, { topK: preK });
  let denseRanking = [];
  if (index.embedderInstance && index.embeddings.length > 0) {
    const [queryEmbedding] = await index.embedderInstance.embed([question]);
    denseRanking = denseSearch(index.embeddings, queryEmbedding, { topK: preK });
  }
  const rankings = [bm25Ranking, denseRanking].filter(ranking => ranking.length > 0);
  const fused = rankings.length > 1 ? reciprocalRankFusion(rankings) : rankings[0] ?? [];
  const candidates = fused
    .map(entry => ({ ...entry, chunk: index.chunksById.get(entry.chunkId) }))
    .filter(entry => entry.chunk);
  const reranked = rerankChunks(question, candidates, { limit: topK });
  return {
    results: reranked.map((entry, position) => ({ ...entry, rank: position + 1 })),
    diagnostics: {
      bm25: bm25Ranking.length,
      dense: denseRanking.length,
      fused: fused.length,
      sources: index.embedderInstance ? ['bm25', 'dense'] : ['bm25'],
      embedder: index.embedderId
    }
  };
}
