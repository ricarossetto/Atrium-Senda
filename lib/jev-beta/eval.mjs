import { LEGAL_AREA } from './taxonomy.mjs';

export const EVAL_AREAS = LEGAL_AREA;

export function baselineAreaOf(detectAreaResult) {
  const area = detectAreaResult?.area || 'outro';
  return EVAL_AREAS.includes(area) ? area : 'outro';
}

export function scoreRow({ id, expected, baselineArea, jevLabel = null, jevConfidence = 0, jevAction = 'abstain', baselineMs = 0, jevMs = 0, inputTokens = 0, outputTokens = 0, liveError = null, suggestion = null, reason = null } = {}) {
  const jevAnswered = typeof jevLabel === 'string' && jevLabel !== '';
  return {
    id,
    expected,
    baselineArea,
    baselineHit: baselineArea === expected,
    jevLabel,
    jevConfidence: Number(jevConfidence) || 0,
    jevAction,
    jevHit: !liveError && jevAnswered && jevAction === 'suggest' && jevLabel === expected,
    jevAbstained: Boolean(liveError) || !jevAnswered || jevAction !== 'suggest',
    baselineMs,
    jevMs,
    inputTokens,
    outputTokens,
    liveError,
    suggestion,
    reason
  };
}

export function summarizeEval(rows = []) {
  const metrics = summarizeDecisions(rows, { mode: 'triage' });
  const total = metrics.total;
  const jevRuns = rows.filter(row => outcomeOf(row, { mode: 'triage' }).answered);
  const confCorrect = jevRuns.filter(row => outcomeOf(row, { mode: 'triage' }).hit).map(row => row.jevConfidence);
  const confWrong = jevRuns.filter(row => !outcomeOf(row, { mode: 'triage' }).hit).map(row => row.jevConfidence);
  const avg = list => (list.length === 0 ? 0 : list.reduce((a, b) => a + b, 0) / list.length);
  return {
    total,
    baselineAccuracy: metrics.baselineAccuracy,
    jevAccuracy: metrics.jevAccuracy,
    jevCoverage: metrics.jevCoverage,
    jevAbstentionRate: metrics.jevAbstentionRate,
    avgConfidenceWhenCorrect: avg(confCorrect),
    avgConfidenceWhenWrong: avg(confWrong),
    avgBaselineMs: avg(rows.map(row => row.baselineMs)),
    avgJevMs: avg(rows.map(row => row.jevMs)),
    totalInputTokens: rows.reduce((a, row) => a + (row.inputTokens || 0), 0),
    totalOutputTokens: rows.reduce((a, row) => a + (row.outputTokens || 0), 0),
    liveErrors: rows.filter(row => row.liveError).length
  };
}

export function confusionMatrix(rows = [], { actualKey = 'expected', predictedKey = 'predicted', labels = [] } = {}) {
  const matrix = {};
  for (const actual of labels) {
    matrix[actual] = {};
    for (const predicted of labels) matrix[actual][predicted] = 0;
  }
  let unknown = 0;
  for (const row of rows) {
    const actual = row[actualKey];
    const predicted = row[predictedKey];
    if (matrix[actual] && Object.prototype.hasOwnProperty.call(matrix[actual], predicted)) {
      matrix[actual][predicted] += 1;
    } else {
      unknown += 1;
    }
  }
  return { matrix, unknown, total: rows.length };
}

export function outcomeOf(row, { mode = 'decision' } = {}) {
  const predicted = mode === 'triage' ? row.jevLabel : row.predicted;
  const answered = !row.liveError && !row.fallbackUsed && !row.jevAbstained && predicted != null && predicted !== '' && (mode === 'triage' ? row.jevAction === 'suggest' : row.action !== 'abstain');
  return { predicted: answered ? predicted : null, hit: answered && predicted === row.expected, answered };
}

export function summarizeDecisions(rows = [], { mode = 'decision' } = {}) {
  const outcomes = rows.map(row => outcomeOf(row, { mode }));
  const total = rows.length;
  return {
    total,
    baselineAccuracy: total ? rows.filter(row => row.baselineHit).length / total : 0,
    jevAccuracy: total ? outcomes.filter(row => row.hit).length / total : 0,
    jevCoverage: total ? outcomes.filter(row => row.answered).length / total : 0,
    jevAbstentionRate: total ? outcomes.filter(row => !row.answered).length / total : 0,
    liveErrors: rows.filter(row => row.liveError).length
  };
}

function riskRate(rows, riskKey, unsafeLabel) {
  const risky = rows.filter(row => row[riskKey] === true);
  const predicted = risky.filter(row => outcomeOf(row).answered);
  return { rate: predicted.length ? predicted.filter(row => row.predicted === unsafeLabel).length / predicted.length : null, eligible: risky.length, predicted: predicted.length, unavailable: risky.length - predicted.length };
}

export function unsafeProceedFastRate(rows = []) {
  return riskRate(rows, 'highRisk', 'proceed_fast');
}

export function unsafeAcceptRate(rows = []) {
  return riskRate(rows, 'shouldReject', 'accept');
}

export function falseCompleteRate(rows = []) {
  return riskRate(rows, 'hasGaps', 'complete');
}

export function baselineTaskRoute(item) {
  const text = `${item.taskType || ''} ${item.objective || ''}`.toLowerCase();
  if (/excluir|deletar|permanente|irrevers/i.test(text)) return 'block';
  if (/\d{2,}\s+documentos|lote|due diligence/i.test(text)) return 'split_task';
  if (item.stakes === 'high') return 'deep_review';
  return 'proceed_fast';
}

function claimTerms(text) {
  return [...new Set(
    String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z0-9]+/).filter(term => term.length >= 4)
  )].slice(0, 20);
}

export function baselineResearchVerdict(item) {
  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  if (evidence.length === 0) return 'reject';
  const haystack = evidence.map(entry => `${entry.citation || ''} ${entry.excerptOrSummary || ''}`.toLowerCase()).join(' ');
  const overlap = claimTerms(item.claim).filter(term => haystack.includes(term)).length;
  if (overlap >= 3) return 'accept';
  if (overlap >= 1) return 'verify_more';
  return 'reject';
}

export function baselineCompletion(item) {
  if (Array.isArray(item.knownGaps) && item.knownGaps.length > 0) return 'verify_more';
  if (/não executada|pendente|sem conferência|nenhuma verificação/i.test(String(item.verification || ''))) return 'verify_more';
  return 'complete';
}

export function percentile(values = [], fraction = 0.5) {
  const sorted = [...values].map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[rank];
}

export function decisionDistribution(rows = [], { key = 'predicted' } = {}) {
  const distribution = {};
  for (const row of rows) {
    const decision = String(row[key] ?? 'unknown');
    distribution[decision] = (distribution[decision] || 0) + 1;
  }
  return distribution;
}

export function calibrationBuckets(rows = [], { confidenceKey = 'confidence', hitKey = 'hit', unsafeKey = 'unsafe' } = {}) {
  const buckets = [
    { id: '<0.60', min: 0, max: 0.6 },
    { id: '0.60-0.74', min: 0.6, max: 0.75 },
    { id: '0.75-0.89', min: 0.75, max: 0.9 },
    { id: '>=0.90', min: 0.9, max: 1.01 }
  ].map(bucket => ({ ...bucket, n: 0, hits: 0, unsafe: 0 }));
  for (const row of rows) {
    const confidence = Number(row[confidenceKey]);
    if (!Number.isFinite(confidence)) continue;
    const bucket = buckets.find(candidate => confidence >= candidate.min && confidence < candidate.max) || buckets[buckets.length - 1];
    bucket.n += 1;
    if (row[hitKey] === true) bucket.hits += 1;
    if (row[unsafeKey] === true) bucket.unsafe += 1;
  }
  return buckets.map(bucket => ({ id: bucket.id, n: bucket.n, accuracy: bucket.n === 0 ? 0 : bucket.hits / bucket.n, unsafe: bucket.unsafe }));
}
