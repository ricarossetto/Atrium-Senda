import { randomBytes } from 'node:crypto';
import { payloadHash } from './classifier.mjs';

const TELEMETRY_CAP = 500;

export function buildAuditRecord({ workflow, entityType = '', entityId = '', inputFingerprint = '', result = '', confidence = 0, fallbackUsed = false, humanOverride = null } = {}) {
  if (!workflow) throw new TypeError('workflow é obrigatório no registro de auditoria.');
  return Object.freeze({
    decisionId: `jev-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`,
    workflow: String(workflow),
    entityType: String(entityType || '').slice(0, 60),
    entityId: String(entityId || '').slice(0, 120),
    inputFingerprint: String(inputFingerprint || '').slice(0, 64),
    result: String(result || '').slice(0, 60),
    confidence: Number(confidence) || 0,
    provider: 'jev',
    createdAt: new Date().toISOString(),
    fallbackUsed: fallbackUsed === true,
    humanOverride: humanOverride == null ? null : String(humanOverride).slice(0, 120)
  });
}

export function fingerprintInput({ redactedState = '', schemaId = '', schemaVersion = '' } = {}) {
  return payloadHash(`${schemaId}@${schemaVersion}\n${redactedState}`);
}

export function createTelemetry({ maxEntries = TELEMETRY_CAP } = {}) {
  const entries = [];
  return {
    record({ workflow, decision = '', action = '', latencyMs = 0, fallbackUsed = false, abstained = false, confidence = 0, inputTokens = 0, outputTokens = 0 } = {}) {
      if (!workflow) throw new TypeError('workflow é obrigatório na telemetria.');
      entries.push(Object.freeze({
        workflow: String(workflow),
        decision: String(decision || '').slice(0, 60),
        action: String(action || '').slice(0, 40),
        latencyMs: Number(latencyMs) || 0,
        fallbackUsed: fallbackUsed === true,
        abstained: abstained === true,
        confidence: Number(confidence) || 0,
        inputTokens: Number(inputTokens) || 0,
        outputTokens: Number(outputTokens) || 0,
        at: new Date().toISOString()
      }));
      if (entries.length > maxEntries) entries.splice(0, entries.length - maxEntries);
      return entries.length;
    },
    entries() {
      return [...entries];
    },
    reset() {
      entries.length = 0;
    },
    summary() {
      const byWorkflow = {};
      const byDecision = {};
      let errors = 0;
      let fallbacks = 0;
      let abstentions = 0;
      let verifyMore = 0;
      let incomplete = 0;
      let latencyTotal = 0;
      let inputTokens = 0;
      let outputTokens = 0;
      for (const entry of entries) {
        byWorkflow[entry.workflow] = (byWorkflow[entry.workflow] || 0) + 1;
        byDecision[entry.decision] = (byDecision[entry.decision] || 0) + 1;
        if (entry.decision === 'error') errors += 1;
        if (entry.fallbackUsed) fallbacks += 1;
        if (entry.abstained) abstentions += 1;
        if (entry.decision === 'verify_more') verifyMore += 1;
        if (entry.decision === 'incomplete') incomplete += 1;
        latencyTotal += entry.latencyMs;
        inputTokens += entry.inputTokens;
        outputTokens += entry.outputTokens;
      }
      return {
        total: entries.length,
        byWorkflow,
        byDecision,
        errors,
        fallbacks,
        abstentions,
        verifyMore,
        incomplete,
        avgLatencyMs: entries.length === 0 ? 0 : latencyTotal / entries.length,
        totalInputTokens: inputTokens,
        totalOutputTokens: outputTokens
      };
    }
  };
}
