import { LEGAL_CRITICAL_FIELDS, MERGE_DECISIONS, SOURCE_TRUST } from './source-merger.mjs';

export const RESOLUTION_ACTIONS = Object.freeze({
  KEEP_PRIMARY: 'KEEP_PRIMARY',
  NEEDS_HUMAN_REVIEW: 'NEEDS_HUMAN_REVIEW',
  MANUAL_FIELD_ENTRY: 'MANUAL_FIELD_ENTRY'
});

export const TRUST_GAP_THRESHOLD = 0.1;

function trustOf(source, trust) {
  return trust[source] ?? trust[String(source).toUpperCase()] ?? 0.5;
}

export function resolveFieldConflicts(merged, { trust = SOURCE_TRUST } = {}) {
  const resolutions = [];
  for (const conflict of merged?.conflicts ?? []) {
    const ranked = Object.entries(conflict.values)
      .map(([source, value]) => ({ source, value, confidence: trustOf(source, trust) }))
      .sort((left, right) => right.confidence - left.confidence);
    const gap = ranked.length >= 2 ? ranked[0].confidence - ranked[1].confidence : 1;
    const legalCritical = LEGAL_CRITICAL_FIELDS.includes(conflict.field);
    if (legalCritical || gap < TRUST_GAP_THRESHOLD) {
      resolutions.push({
        field: conflict.field,
        action: RESOLUTION_ACTIONS.NEEDS_HUMAN_REVIEW,
        reason: legalCritical ? 'CAMPO_JURIDICO_CRITICO' : 'FONTES_COM_CONFIANCA_PROXIMA',
        chosenSource: null,
        alternatives: ranked.map(entry => entry.source),
        values: conflict.values
      });
      continue;
    }
    resolutions.push({
      field: conflict.field,
      action: RESOLUTION_ACTIONS.KEEP_PRIMARY,
      reason: 'FONTE_MAIS_CONFIAVEL',
      chosenSource: ranked[0].source,
      alternatives: ranked.slice(1).map(entry => entry.source),
      values: conflict.values
    });
  }
  return {
    resolutions,
    requiresHumanReview: resolutions.some(resolution => resolution.action === RESOLUTION_ACTIONS.NEEDS_HUMAN_REVIEW),
    unresolvedManualFields: resolutions
      .filter(resolution => resolution.action === RESOLUTION_ACTIONS.MANUAL_FIELD_ENTRY)
      .map(resolution => resolution.field),
    generatedAt: new Date().toISOString()
  };
}

export function summarizeConflicts(merged) {
  const total = merged?.conflicts?.length ?? 0;
  const legalCritical = (merged?.conflicts ?? []).filter(conflict => LEGAL_CRITICAL_FIELDS.includes(conflict.field));
  return {
    total,
    legalCritical: legalCritical.map(conflict => conflict.field),
    decisions: (merged?.conflicts ?? []).reduce((accumulator, conflict) => {
      accumulator[conflict.decision ?? MERGE_DECISIONS.CONFLICT] = (accumulator[conflict.decision ?? MERGE_DECISIONS.CONFLICT] ?? 0) + 1;
      return accumulator;
    }, {}),
    requiresHumanReview: Boolean(merged?.requiresHumanReview) || legalCritical.length > 0
  };
}
