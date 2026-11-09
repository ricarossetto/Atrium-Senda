import { redactForJev } from './redaction.mjs';
import { schemaToSystemoneQuestions, extractJevDecision, callHeadlessCmd } from './client.mjs';
import { normalizeJevSuggestion } from './classifier.mjs';
import { baselineAreaOf, scoreRow, baselineTaskRoute, baselineResearchVerdict, baselineCompletion } from './eval.mjs';
import { detectArea } from '../legal-intelligence/router.mjs';
import { routeTask } from './task-router.mjs';
import { checkResearchEvidence } from './research-guard.mjs';
import { reviewCompletion } from './completion-review.mjs';

export const TRIAGE_SCHEMA_ID = 'publication_triage';

function errorCode(error) {
  const allowed = ['DISABLED', 'UNAVAILABLE', 'TIMEOUT', 'RATE_LIMITED', 'HUMAN_REQUIRED', 'PARSE_ERROR', 'SECRET_DETECTED'];
  return allowed.includes(error?.code) ? error.code : 'UNAVAILABLE';
}

export function headlessTransport(env = process.env) {
  return {
    kind: 'headless',
    bin: env?.JEV_CMD_BIN || 'commandcode',
    model: 'typesafe/jev'
  };
}

export async function runLiveTriage(cases = [], { transport = null, telemetry = null } = {}) {
  const questions = schemaToSystemoneQuestions(TRIAGE_SCHEMA_ID);
  const rows = [];
  for (const item of cases) {
    const t0 = Date.now();
    const baselineArea = baselineAreaOf(detectArea(item.text));
    const baselineMs = Date.now() - t0;
    if (!transport) {
      rows.push(scoreRow({ id: item.id, expected: item.expectedArea, baselineArea, baselineMs }));
      continue;
    }
    const { redacted } = redactForJev(item.text);
    const start = Date.now();
    try {
      const parsed = await callHeadlessCmd({
        bin: transport.bin || 'commandcode',
        model: transport.model || 'typesafe/jev',
        state: redacted,
        questions
      });
      const normalized = extractJevDecision({ answers: parsed.answers }, { schemaId: TRIAGE_SCHEMA_ID });
      const suggestion = normalizeJevSuggestion({ schemaId: TRIAGE_SCHEMA_ID, normalizedDecision: normalized, redactedText: redacted });
      rows.push(scoreRow({
        id: item.id, expected: item.expectedArea, baselineArea, baselineMs,
        jevLabel: normalized.area?.label || null, jevConfidence: normalized.area?.confidence || 0,
        jevAction: suggestion.action, jevMs: Date.now() - start,
        suggestion: suggestion.suggestion,
        reason: suggestion.reason,
        inputTokens: parsed.usage?.input_tokens || 0, outputTokens: parsed.usage?.output_tokens || 0
      }));
    } catch (error) {
      rows.push(scoreRow({ id: item.id, expected: item.expectedArea, baselineArea, baselineMs, jevMs: Date.now() - start, liveError: errorCode(error) }));
    }
  }
  return rows;
}

export async function runLiveTaskRouting(cases = [], { transport = null, telemetry = null, routeTaskImpl = routeTask } = {}) {
  const rows = [];
  for (const item of cases) {
    const baseline = baselineTaskRoute(item);
    if (!transport) {
      rows.push({ id: item.id, expected: item.expectedRoute, predicted: null, highRisk: item.highRisk === true, confidence: 0, action: 'baseline-proxy', baseline, baselineHit: baseline === item.expectedRoute, hit: false, latencyMs: 0, liveError: null });
      continue;
    }
    let predicted = null;
    let confidence = 0;
    let action = 'abstain';
    let liveError = null;
    let fallbackUsed = false;
    const start = Date.now();
    try {
      const result = await routeTaskImpl({
        taskType: item.taskType, objective: item.objective, stakes: item.stakes,
        entity: { type: 'eval-case', id: item.id }, transport, telemetry
      });
      fallbackUsed = result.fallbackUsed === true || result.fallbackRoute === true;
      if (!fallbackUsed && result.action !== 'abstain' && result.decision) {
        predicted = result.route;
        confidence = result.confidence;
        action = result.uncertain ? 'review' : 'suggest';
      }
    } catch (error) {
      liveError = errorCode(error);
    }
    const latencyMs = Date.now() - start;
    rows.push({ id: item.id, expected: item.expectedRoute, predicted, highRisk: item.highRisk === true, confidence, action, baseline, baselineHit: baseline === item.expectedRoute, hit: predicted === item.expectedRoute, latencyMs, liveError, fallbackUsed, jevAbstained: predicted == null });
  }
  return rows;
}

export async function runLiveResearch(cases = [], { transport = null, telemetry = null, checkResearchImpl = checkResearchEvidence } = {}) {
  const rows = [];
  for (const item of cases) {
    const baseline = baselineResearchVerdict(item);
    if (!transport) {
      rows.push({ id: item.id, expected: item.expectedVerdict, predicted: null, shouldReject: item.shouldReject === true, confidence: 0, baseline, baselineHit: baseline === item.expectedVerdict, hit: false, liveError: null });
      continue;
    }
    let predicted = null;
    let confidence = 0;
    let liveError = null;
    let fallbackUsed = false;
    const startResearch = Date.now();
    try {
      const result = await checkResearchImpl({
        claim: item.claim, evidence: item.evidence,
        entity: { type: 'eval-case', id: item.id }, transport, telemetry
      });
      fallbackUsed = result.fallbackUsed === true;
      if (!result.fallbackUsed && result.action !== 'abstain' && !result.noCall && result.decision) {
        predicted = result.verdict;
        confidence = result.confidence ?? 0;
      }
    } catch (error) {
      liveError = errorCode(error);
    }
    const latencyMs = Date.now() - startResearch;
    rows.push({ id: item.id, expected: item.expectedVerdict, predicted, shouldReject: item.shouldReject === true, confidence, baseline, baselineHit: baseline === item.expectedVerdict, hit: predicted === item.expectedVerdict, latencyMs, liveError, fallbackUsed, jevAbstained: predicted == null });
  }
  return rows;
}

export async function runLiveCompletion(cases = [], { transport = null, telemetry = null, reviewCompletionImpl = reviewCompletion } = {}) {
  const rows = [];
  for (const item of cases) {
    const baseline = baselineCompletion(item);
    if (!transport) {
      rows.push({ id: item.id, expected: item.expectedConclusion, predicted: null, hasGaps: item.hasGaps === true, confidence: 0, baseline, baselineHit: baseline === item.expectedConclusion, hit: false, liveError: null });
      continue;
    }
    let predicted = null;
    let confidence = 0;
    let liveError = null;
    let fallbackUsed = false;
    const startCompletion = Date.now();
    try {
      const result = await reviewCompletionImpl({
        objective: item.objective, completedWork: item.completedWork, verification: item.verification,
        knownGaps: item.knownGaps, entity: { type: 'eval-case', id: item.id }, transport, telemetry
      });
      fallbackUsed = result.fallbackUsed === true;
      if (!result.fallbackUsed && result.action !== 'abstain' && !result.forced && result.decision) {
        predicted = result.conclusion;
        confidence = result.confidence ?? 0;
      }
    } catch (error) {
      liveError = errorCode(error);
    }
    const latencyMs = Date.now() - startCompletion;
    rows.push({ id: item.id, expected: item.expectedConclusion, predicted, hasGaps: item.hasGaps === true, confidence, baseline, baselineHit: baseline === item.expectedConclusion, hit: predicted === item.expectedConclusion, latencyMs, liveError, fallbackUsed, jevAbstained: predicted == null });
  }
  return rows;
}
