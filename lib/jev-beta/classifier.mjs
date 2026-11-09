import { createHash } from 'node:crypto';
import { getJevSchema } from './schemas.mjs';
import { JEV_VERIFICATION_STATES } from './verification-state.mjs';

export function payloadHash(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, 32);
}

export function normalizeJevSuggestion({ schemaId, normalizedDecision, redactedText } = {}) {
  const schema = getJevSchema(schemaId);
  const basis = [];
  const suggestion = {};
  let minConfidence = 1;
  let answered = 0;

  const primaryKeys = new Set(Array.isArray(schema.primary) && schema.primary.length ? schema.primary : schema.questions.map(question => question.key));
  for (const question of schema.questions) {
    const entry = normalizedDecision?.[question.key];
    if (!entry) {
      basis.push({ key: question.key, outcome: 'abstain', reason: 'missing' });
      if (primaryKeys.has(question.key)) minConfidence = 0;
      continue;
    }
    answered += 1;
    if (primaryKeys.has(question.key)) minConfidence = Math.min(minConfidence, entry.confidence);
    suggestion[question.key] = { ...entry };
    basis.push({ key: question.key, outcome: 'suggest', label: entry.label, confidence: entry.confidence });
  }

  if (answered === 0) {
    return {
      schema: schema.id,
      schemaVersion: schema.version,
      suggestion: {},
      confidence: 0,
      action: 'abstain',
      verificationState: JEV_VERIFICATION_STATES.UNVERIFIED,
      authority: 'non-authoritative',
      isolation: 'beta-namespace',
      reason: 'INSUFFICIENT_EVIDENCE',
      basis,
      payloadHash: payloadHash(redactedText)
    };
  }

  const threshold = schema.threshold;
  const action = minConfidence >= threshold ? 'suggest' : minConfidence >= threshold * 0.7 ? 'review' : 'abstain';

  return {
    schema: schema.id,
    schemaVersion: schema.version,
    suggestion,
    confidence: Number(minConfidence.toFixed(4)),
    action,
    verificationState: JEV_VERIFICATION_STATES.FIXTURE_VALIDATED,
    authority: 'non-authoritative',
    isolation: 'beta-namespace',
    reason: action === 'abstain' ? 'INSUFFICIENT_EVIDENCE' : action === 'review' ? 'LOW_CONFIDENCE_REVIEW' : 'SUGGEST_ONLY',
    humanRequired: true,
    notes: 'Sugestão assistiva; nunca prazo, nunca tratamento/vínculo automático.',
    basis,
    collectedAt: new Date().toISOString(),
    source: 'jev-beta',
    payloadHash: payloadHash(redactedText)
  };
}

const FORBIDDEN_SUGGESTION_KEYS = Object.freeze(new Set(['deadline', 'fatalDeadline', 'fatal_deadline', 'vencimento', 'due_date', 'prazo_fatal']));

function assertNoDeadlineKeys(value, path = '') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_SUGGESTION_KEYS.has(key)) {
      throw new Error(`Sugestão não pode conter prazo operativo (${path}${key}).`);
    }
    assertNoDeadlineKeys(child, `${path}${key}.`);
  }
}

export function assertSuggestionIsAssistive(result) {
  if (!result || typeof result !== 'object') throw new TypeError('Sugestão inválida.');
  if (result.authority !== 'non-authoritative') throw new Error('Sugestão deve ser non-authoritative.');
  if (!['suggest', 'review', 'abstain'].includes(result.action)) throw new Error('Ação inválida; só suggest/review/abstain.');
  // Checagem estrutural: chaves operativas de prazo são proibidas em qualquer nível.
  // O sinal assistivo (deadline_signal/deadline_days) é permitido e nunca vira data.
  assertNoDeadlineKeys(result);
  return true;
}
