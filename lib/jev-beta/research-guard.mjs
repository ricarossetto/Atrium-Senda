import { decide } from './decision.mjs';
import { buildDecisionContext } from './context.mjs';

export const RESEARCH_VERDICTS = Object.freeze(['accept', 'verify_more', 'reject']);

export function toEvidenceItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      sourceId: String(item.sourceId || '').slice(0, 40),
      citation: String(item.citation || (item.identifier ? `${item.identifier}${item.court ? ` (${item.court})` : ''}` : item.title || '') || '').slice(0, 200),
      excerptOrSummary: String(item.excerptOrSummary || item.summary || item.title || '').slice(0, 800),
      sourceType: String(item.sourceType || item.tool || item.kind || '').slice(0, 60)
    }))
    .filter(item => item.citation || item.excerptOrSummary)
    .slice(0, 8);
}

function evidenceDigest(evidence) {
  return evidence
    .map((item, index) => `[${index + 1}] ${item.citation} — ${item.excerptOrSummary}`.slice(0, 600))
    .join('\n');
}

export async function checkResearchEvidence({
  claim = '',
  evidence = [],
  sourceQuality = '',
  stakes = 'low',
  entity = null,
  transport = null,
  telemetry = null,
  timeoutMs
} = {}, { decideImpl = decide } = {}) {
  const cleanClaim = String(claim || '').trim().slice(0, 1000);
  const items = toEvidenceItems(evidence);
  const sourceIds = [...new Set(items.map(item => item.sourceId).filter(Boolean))];
  const base = { evidenceSourceIds: sourceIds, evidenceCount: items.length };
  if (!cleanClaim) {
    return { workflow: 'research-check', verdict: 'reject', reason: 'empty-claim', noCall: true, ...base, confidence: 1, action: 'reject', fallbackUsed: false };
  }
  if (items.length === 0) {
    return { workflow: 'research-check', verdict: 'reject', reason: 'no-evidence', noCall: true, ...base, confidence: 1, action: 'reject', fallbackUsed: false };
  }
  const context = buildDecisionContext({
    taskType: 'research-check',
    source: 'rag',
    legalArea: 'outro',
    objective: `Avaliar APENAS se a evidência sustenta esta afirmação (sem julgar mérito jurídico): ${cleanClaim}`,
    evidenceSummary: `Fontes (${sourceQuality || 'qualidade não informada'}):\n${evidenceDigest(items)}`,
    stakes,
    requiresHumanReview: true
  });
  const out = await decideImpl({ workflow: 'research-check', schemaId: 'research_check', context, transport, telemetry, entity, timeoutMs });
  if (out.fallbackUsed || out.action === 'abstain' || !out.decision) {
    return { ...out, verdict: 'verify_more', reason: out.reason || 'Sem veredito: pesquisar mais antes de estabelecer o fato.', ...base };
  }
  const raw = out.decision?.suggestion?.verdict?.label || '';
  const verdict = RESEARCH_VERDICTS.includes(raw) ? raw : 'verify_more';
  return { ...out, verdict, ...base };
}
