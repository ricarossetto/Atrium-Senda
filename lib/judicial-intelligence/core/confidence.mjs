export const ABSTENTION_CODE = 'INSUFFICIENT_EVIDENCE';

export const CONFIDENCE_BY_SOURCE = Object.freeze({
  STRUCTURED_API: 0.98,
  AUTHENTICATED_PORTAL: 0.95,
  STRUCTURED_DISCOVERY: 0.9,
  PUBLIC_PORTAL: 0.85,
  DERIVED_OCR: 0.75,
  INFERRED: 0.5,
  UNKNOWN: 0.25
});

export function clampConfidence(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return clampConfidence(fallback, 0);
  return Math.min(1, Math.max(0, numeric));
}

export function combineConfidence(values, { mode = 'min' } = {}) {
  const list = (Array.isArray(values) ? values : [values]).map(value => clampConfidence(value));
  if (list.length === 0) return 0;
  if (mode === 'average') return clampConfidence(list.reduce((sum, value) => sum + value, 0) / list.length);
  if (mode === 'max') return clampConfidence(Math.max(...list));
  return clampConfidence(Math.min(...list));
}

export function confidenceFromBasis(basis = []) {
  if (!Array.isArray(basis) || basis.length === 0) return 0;
  const weighted = basis.map(item => ({
    weight: Number.isFinite(Number(item?.weight)) ? Number(item.weight) : 1,
    value: clampConfidence(item?.confidence)
  }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0;
  return clampConfidence(weighted.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight);
}

export function describeConfidence(value) {
  const confidence = clampConfidence(value);
  if (confidence >= 0.9) return 'high';
  if (confidence >= 0.7) return 'medium';
  if (confidence > 0) return 'low';
  return 'none';
}

export function decideAbstention({ confidence, minimum = 0.6, evidenceCount = 0, requiredEvidence = 1 } = {}) {
  const reasons = [];
  if (clampConfidence(confidence) < clampConfidence(minimum)) reasons.push('LOW_CONFIDENCE');
  if (Number(evidenceCount) < Number(requiredEvidence)) reasons.push('MISSING_EVIDENCE');
  if (reasons.length === 0) return { abstain: false, code: null, reasons: [] };
  return { abstain: true, code: ABSTENTION_CODE, reasons };
}
