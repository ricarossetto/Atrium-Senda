import { redactForJev, assertNoSecretsInText } from './redaction.mjs';
import { assertNoSecretsInContext, contextToState } from './context.mjs';
import { getJevSchema, assertJevInputSize } from './schemas.mjs';
import { schemaToSystemoneQuestions } from './client.mjs';
import { extractJevDecision, buildNineRouterSystemoneRequest, callJev, callHeadlessCmd } from './client.mjs';
import { normalizeJevSuggestion } from './classifier.mjs';
import { resolveFailure } from './policy.mjs';
import { fingerprintInput, buildAuditRecord } from './telemetry.mjs';
import { JEV_SCHEMA_VERSION } from './schemas.mjs';

export async function decide({
  workflow,
  schemaId,
  context = null,
  rawState = '',
  transport = null,
  critical = false,
  telemetry = null,
  entity = null,
  timeoutMs
} = {}) {
  if (!workflow) throw new TypeError('workflow é obrigatório em decide().');
  const startedAt = Date.now();
  const schema = getJevSchema(schemaId);
  let fingerprint = '';
  const finish = ({ decision, action, confidence = 0, fallbackUsed = false, reason = '', inputTokens = 0, outputTokens = 0, detail = null }) => {
    const latencyMs = Date.now() - startedAt;
    telemetry?.record?.({ workflow, decision, action, latencyMs, fallbackUsed, abstained: action === 'abstain', confidence, inputTokens, outputTokens });
    return {
      workflow,
      schema: schema.id,
      action,
      confidence,
      decision: detail,
      fallbackUsed,
      reason,
      latencyMs,
      inputTokens,
      outputTokens,
      audit: buildAuditRecord({
        workflow,
        entityType: entity?.type || '',
        entityId: entity?.id || '',
        inputFingerprint: fingerprint,
        result: decision,
        confidence,
        fallbackUsed,
        humanOverride: null
      })
    };
  };
  let state;
  try {
    if (context) {
      assertNoSecretsInContext(context);
      state = contextToState(context);
    } else {
      state = String(rawState || '');
      assertNoSecretsInText(state, { context: `decide/${workflow}` });
      assertNoSecretsInContext(state, { context: `decide/${workflow}` });
    }
    const { redacted } = redactForJev(state);
    assertJevInputSize(redacted);
    fingerprint = fingerprintInput({ redactedState: redacted, schemaId: schema.id, schemaVersion: JEV_SCHEMA_VERSION });
    const questions = schemaToSystemoneQuestions(schema.id);
    if (!transport) {
      const resolved = resolveFailure({ kind: 'unavailable', critical });
      return finish({ ...resolved, confidence: 0, detail: null });
    }
    let payload;
    if (transport.kind === 'headless') {
      const parsed = await callHeadlessCmd({
        bin: transport.bin || 'commandcode',
        model: transport.model || 'typesafe/jev',
        state: redacted,
        questions,
        ...(timeoutMs ? { timeoutMs } : {})
      });
      payload = { answers: parsed.answers };
      const usage = parsed.usage || {};
      return completeWithPayload(payload, Number(usage.input_tokens) || 0, Number(usage.output_tokens) || 0);
    }
    if (transport.kind === 'http') {
      const request = buildNineRouterSystemoneRequest({
        model: transport.model,
        state: redacted,
        questions,
        baseUrl: transport.baseUrl,
        allowLocal: transport.allowLocal === true
      });
      payload = await callJev({ request, apiKey: transport.apiKey, ...(timeoutMs ? { timeoutMs } : {}) });
      const usage = payload?.usage || {};
      return completeWithPayload(payload, Number(usage.input_tokens ?? usage.inputTokens) || 0, Number(usage.output_tokens ?? usage.outputTokens) || 0);
    }
    if (transport.kind === 'mock') {
      if (typeof transport.fn !== 'function') throw new TypeError('transport mock exige fn().');
      payload = await transport.fn({ state: redacted, questions, schemaId: schema.id });
      return completeWithPayload(payload, 0, 0);
    }
    const resolved = resolveFailure({ kind: 'unknown', critical });
    return finish({ ...resolved, confidence: 0, detail: null });

    function completeWithPayload(responsePayload, inputTokens, outputTokens) {
      const normalized = extractJevDecision(responsePayload, { schemaId: schema.id });
      const suggestion = normalizeJevSuggestion({ schemaId: schema.id, normalizedDecision: normalized, redactedText: redacted });
      const audit = buildAuditRecord({
        workflow,
        entityType: entity?.type || '',
        entityId: entity?.id || '',
        inputFingerprint: fingerprintInput({ redactedState: redacted, schemaId: schema.id, schemaVersion: JEV_SCHEMA_VERSION }),
        result: suggestion.action,
        confidence: suggestion.confidence,
        fallbackUsed: false,
        humanOverride: null
      });
      const latencyMs = Date.now() - startedAt;
      telemetry?.record?.({ workflow, decision: suggestion.action, action: suggestion.action, latencyMs, fallbackUsed: false, abstained: suggestion.action === 'abstain', confidence: suggestion.confidence, inputTokens, outputTokens });
      return { workflow, schema: schema.id, action: suggestion.action, confidence: suggestion.confidence, decision: suggestion, fallbackUsed: false, reason: suggestion.reason, latencyMs, inputTokens, outputTokens, audit };
    }
  } catch (error) {
    if (error?.code === 'SECRET_DETECTED') throw error;
    const kind = error?.code === 'TIMEOUT' ? 'timeout'
      : error?.code === 'RATE_LIMITED' ? 'rate_limited'
      : error?.code === 'MISSING_KEY' || error?.code === 'UNAUTHORIZED' ? 'auth_invalid'
      : error?.code === 'PARSE_ERROR' ? 'invalid_response'
      : 'unknown';
    const resolved = resolveFailure({ kind, critical });
    return finish({ ...resolved, confidence: 0, detail: null });
  }
}
