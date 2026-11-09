import {
  RAG_ANSWER_STATUS,
  RAG_ABSTENTION_MESSAGES,
  DEFAULT_RAG_MIN_CONFIDENCE,
  answerConfidence,
  decideRagAbstention,
  confidenceLabel
} from './confidence.mjs';
import { assertFaithfulAnswer, buildEvidencePack } from './citation-validator.mjs';

export function composeExtractiveAnswer(question, evidence = []) {
  if (evidence.length === 0) return '';
  return evidence
    .slice(0, 3)
    .map(chunk => `- ${String(chunk.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 320)} [chunk:${chunk.chunkId}]`)
    .join('\n');
}

export function buildGroundedAnswer({
  question,
  evidence = [],
  minConfidence = DEFAULT_RAG_MIN_CONFIDENCE,
  generator = null
} = {}) {
  const pieces = (evidence ?? []).filter(entry => entry && entry.chunkId && entry.text);
  const answerText = generator
    ? String(generator({ question, evidence: pieces }) ?? '')
    : composeExtractiveAnswer(question, pieces);
  const chunksById = new Map(pieces.map(chunk => [chunk.chunkId, chunk]));
  const faithfulness = assertFaithfulAnswer(answerText, chunksById);
  const citationCount = faithfulness.claims.reduce((sum, claim) => sum + claim.citations.length, 0);
  const coverage = faithfulness.totalClaims === 0 ? 0 : (faithfulness.totalClaims - faithfulness.uncitedClaims.length) / faithfulness.totalClaims;
  const confidence = answerConfidence({ scores: pieces.map(chunk => chunk.score ?? 0), citationCoverage: coverage });
  const abstention = decideRagAbstention({
    confidence,
    minConfidence,
    evidenceCount: pieces.length,
    citationCount
  });

  if (abstention.abstain || !faithfulness.ok) {
    return {
      status: RAG_ANSWER_STATUS.INSUFFICIENT_EVIDENCE,
      code: RAG_ANSWER_STATUS.INSUFFICIENT_EVIDENCE,
      message: RAG_ABSTENTION_MESSAGES[RAG_ANSWER_STATUS.INSUFFICIENT_EVIDENCE],
      reasons: [...abstention.reasons, ...(faithfulness.ok ? [] : ['UNVERIFIED_CITATION'])],
      question,
      confidence: Number(confidence.toFixed(4)),
      confidenceLabel: confidenceLabel(confidence),
      evidence: buildEvidencePack(pieces)
    };
  }

  return {
    status: RAG_ANSWER_STATUS.OK,
    question,
    answer: answerText,
    confidence: Number(confidence.toFixed(4)),
    confidenceLabel: confidenceLabel(confidence),
    citations: faithfulness.claims.flatMap(claim => claim.citations.map(chunkId => ({ chunkId, claim: claim.claim }))),
    claims: faithfulness.claims,
    evidence: buildEvidencePack(pieces)
  };
}
