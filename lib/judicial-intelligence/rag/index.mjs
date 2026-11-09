import { assertBetaFlagEnabled } from '../beta/feature-flags.mjs';
import { JudicialIntelligenceError, JI_ERROR_CODES } from '../core/errors.mjs';
import { chunkDocument } from './chunker.mjs';
import { createRetrievalIndex, hybridRetrieve } from './retrieval.mjs';
import { buildGroundedAnswer } from './abstention.mjs';
import { evaluateRag } from './evaluate.mjs';
import { createGeminiEmbedder } from './embeddings.mjs';
import { DEFAULT_RAG_MIN_CONFIDENCE } from './confidence.mjs';

export const RAG_KINDS = Object.freeze({ CHUNK: 'rag_chunk' });

export function createLegalRagService({
  env = process.env,
  store,
  embedder = undefined,
  generator = null,
  minConfidence = DEFAULT_RAG_MIN_CONFIDENCE,
  allowDisabled = false
} = {}) {
  if (!allowDisabled) assertBetaFlagEnabled('BETA_LEGAL_RAG', env);
  if (!store?.put || !store?.list) {
    throw new TypeError('BetaStore obrigatório para o serviço de Legal RAG beta.');
  }
  const resolvedEmbedder = embedder === undefined
    ? createGeminiEmbedder({ apiKey: env?.GEMINI_API_KEY ?? null })
    : embedder;

  async function ingest({ documentId, cnj = null, documentType = null, source = null, sourcePortal = null, date = null, party = null, pages = [] } = {}) {
    if (!documentId || !Array.isArray(pages) || pages.length === 0) {
      throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, 'Ingestão RAG exige documentId e páginas com texto.');
    }
    const chunks = chunkDocument({ documentId, cnj, documentType, source, sourcePortal, date, party, pages });
    for (const chunk of chunks) {
      store.put(RAG_KINDS.CHUNK, chunk.chunkId, chunk, { lookup: cnj ?? documentId });
    }
    return { documentId, cnj, chunks: chunks.length };
  }

  function listChunks({ cnj, limit = 500 } = {}) {
    return store.list(RAG_KINDS.CHUNK, { lookup: cnj, limit });
  }

  async function buildIndex({ cnj = null, limit = 500 } = {}) {
    const chunks = listChunks({ cnj, limit });
    return createRetrievalIndex({ chunks, embedder: resolvedEmbedder });
  }

  async function ask({ question, cnj = null, topK = 8, limit = 500, minimumConfidence = minConfidence } = {}) {
    if (!question || String(question).trim().length < 3) {
      throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, 'Pergunta RAG ausente ou muito curta.');
    }
    if (!cnj) {
      throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT,
        'O beta exige escopo explícito (cnj) para responder; perguntas sem processo ficam fora do escopo desta camada.');
    }
    const index = await buildIndex({ cnj, limit });
    const retrieval = await hybridRetrieve({ index, question, topK });
    const evidence = retrieval.results.map(entry => ({ ...entry.chunk, score: entry.rerankScore }));
    const answer = buildGroundedAnswer({
      question,
      evidence,
      minConfidence: minimumConfidence,
      generator
    });
    return { ...answer, diagnostics: retrieval.diagnostics };
  }

  async function evaluate({ dataset = [], k = 5 } = {}) {
    return evaluateRag({ dataset, k, ask: options => ask(options) });
  }

  return {
    embedder: resolvedEmbedder?.id ?? null,
    verificationState: 'FIXTURE_VALIDATED',
    verificationNote: 'Contrato e pipeline validados deterministicamente; qualidade semântica real pendente de avaliação com embedder de produção.',
    ingest,
    listChunks,
    buildIndex,
    ask,
    evaluate
  };
}
