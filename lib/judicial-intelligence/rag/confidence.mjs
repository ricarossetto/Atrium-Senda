import { ABSTENTION_CODE, clampConfidence, describeConfidence } from '../core/confidence.mjs';

export const DEFAULT_RAG_MIN_CONFIDENCE = 0.55;

export const RAG_ANSWER_STATUS = Object.freeze({
  OK: 'OK',
  INSUFFICIENT_EVIDENCE: ABSTENTION_CODE
});

export const RAG_ABSTENTION_MESSAGES = Object.freeze({
  [ABSTENTION_CODE]: 'Não há evidência suficiente nos documentos indexados para responder com segurança.'
});

export function retrievalConfidence(scores = []) {
  if (!Array.isArray(scores) || scores.length === 0) return 0;
  const normalized = scores.map(score => clampConfidence(Number(score) || 0));
  const best = Math.max(...normalized);
  const depth = Math.min(1, normalized.length / 5);
  const average = normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
  return clampConfidence(best * 0.6 + average * 0.2 + depth * 0.2);
}

export function answerConfidence({ scores = [], citationCoverage = 0 } = {}) {
  const retrieval = retrievalConfidence(scores);
  return clampConfidence(retrieval * 0.7 + clampConfidence(citationCoverage) * 0.3);
}

export function decideRagAbstention({ confidence, minConfidence = DEFAULT_RAG_MIN_CONFIDENCE, evidenceCount = 0, citationCount = 0 } = {}) {
  const reasons = [];
  if (evidenceCount === 0) reasons.push('NO_EVIDENCE');
  if (citationCount === 0) reasons.push('NO_CITATIONS');
  if (clampConfidence(confidence) < clampConfidence(minConfidence)) reasons.push('LOW_CONFIDENCE');
  if (reasons.length === 0) return { abstain: false, status: RAG_ANSWER_STATUS.OK, reasons: [] };
  return { abstain: true, status: RAG_ANSWER_STATUS.INSUFFICIENT_EVIDENCE, code: ABSTENTION_CODE, reasons };
}

export function confidenceLabel(value) {
  return describeConfidence(value);
}
