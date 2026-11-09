import { CanonicalNormalizer } from '../../../judicial/omni/normalizer.mjs';
import { cleanCnj, formatCnj } from '../../../judicial/omni/contracts.mjs';
import { classifyMovements, summarizeMovements } from '../../process-intelligence/movement-classifier.mjs';
import { extractHits, extractTotalHits } from './client.mjs';

const sharedNormalizer = new CanonicalNormalizer();

export function normalizeHit(hit, { collectedAt = new Date().toISOString() } = {}) {
  return sharedNormalizer.normalizeDataJud(hit, { collectedAt });
}

export function applyMovementIntelligence(process, options = {}) {
  const movements = classifyMovements(process?.movements ?? [], options);
  return {
    ...process,
    movements,
    movementSummary: summarizeMovements(movements, options)
  };
}

export async function searchProcessByCnj(client, cnj, { collectedAt } = {}) {
  const digits = cleanCnj(cnj);
  const payload = await client.findByCnj(digits);
  const hit = extractHits(payload).find(candidate => {
    const source = candidate?._source ?? {};
    return cleanCnj(source.numeroProcesso ?? source.numero ?? '') === digits;
  });
  if (!hit) return null;
  return normalizeHit(hit, { collectedAt });
}

export function toCandidate(process) {
  return {
    cnj: process.cnj,
    court: process.metadata?.court ?? null,
    processClass: process.metadata?.processClass ?? null,
    subject: process.metadata?.subject ?? null,
    distributionDate: process.metadata?.distributionDate ?? null,
    isSecret: process.metadata?.isSecret ?? null,
    provenance: process.provenance
  };
}

export { extractHits, extractTotalHits, formatCnj, cleanCnj };
