/** Record completion only after a fresh, complete cover/key read without errors. */
export function recordEprocEnrichmentCompletion(process, details, { portalId, collectedAt, hasErrors = false } = {}) {
  const client = String(details?.clientName || '').trim();
  const placeholder = /^(?:cliente\s+)?(?:geral|n[aã]o\s+informado|n[aã]o\s+identificado|modelo|do\s+escrit[oó]rio|sigilo|n\/?i|sem\s+cliente)$/i;
  if (hasErrors || !client || placeholder.test(client)
    || !details?.judge || !details?.court || !details?.actionClass || !details?.accessKey) return false;
  process.enrichmentStatus = 'COMPLETE';
  process.eprocEnrichmentCompletedAt = collectedAt;
  process.eprocEnrichmentEvidence = { source: 'eproc', portalId, collectedAt, fields: ['cover', 'accessKey'] };
  return true;
}
