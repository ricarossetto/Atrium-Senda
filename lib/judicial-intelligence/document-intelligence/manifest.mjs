import { findMissingSequences } from './dedup.mjs';
import { sortDocuments } from './metadata.mjs';

export const MANIFEST_VERSION = 1;

export const MANIFEST_STATUS = Object.freeze({
  COMPLETE: 'COMPLETE',
  PARTIAL: 'PARTIAL',
  EMPTY: 'EMPTY'
});

export function buildManifest({
  cnj,
  expected = [],
  downloaded = [],
  failed = [],
  skipped = [],
  duplicates = [],
  provider = null,
  generatedAt = new Date().toISOString()
} = {}) {
  const records = sortDocuments([...downloaded]);
  const manifest = {
    version: MANIFEST_VERSION,
    cnj,
    provider,
    expectedDocuments: expected.length,
    downloaded: records.length,
    failed: failed.length,
    skipped: skipped.length,
    duplicates: duplicates.length,
    missingSequences: findMissingSequences(expected),
    status: MANIFEST_STATUS.EMPTY,
    generatedAt,
    failedEntries: failed.map(entry => ({
      sourceId: entry.sourceId ?? null,
      errorClass: entry.errorClass ?? 'UNKNOWN',
      attempts: entry.attempts ?? 0
    })),
    duplicateEntries: duplicates.map(entry => ({ sourceId: entry.sourceId, duplicateOf: entry.duplicateOf })),
    skippedEntries: skipped.map(entry => ({ sourceId: entry.sourceId ?? null, reason: entry.reason ?? null })),
    totalBytes: records.reduce((sum, record) => sum + (Number(record.size) || 0), 0)
  };
  if (manifest.expectedDocuments === 0) manifest.status = MANIFEST_STATUS.EMPTY;
  else if (manifest.downloaded === manifest.expectedDocuments && manifest.failed === 0) manifest.status = MANIFEST_STATUS.COMPLETE;
  else manifest.status = MANIFEST_STATUS.PARTIAL;
  return manifest;
}

export function reconcileManifest(manifest, { expected = [], downloaded = [] } = {}) {
  const revalidated = buildManifest({
    cnj: manifest?.cnj ?? null,
    expected,
    downloaded,
    failed: manifest?.failedEntries ?? [],
    duplicates: (manifest?.duplicateEntries ?? []).map(entry => ({
      sourceId: entry.sourceId,
      duplicateOf: entry.duplicateOf,
      checksum: null
    })),
    provider: manifest?.provider ?? null,
    generatedAt: new Date().toISOString()
  });
  return {
    ...revalidated,
    previousStatus: manifest?.status ?? null,
    reconciledAt: revalidated.generatedAt
  };
}

export function renderManifestSummary(manifest) {
  return [
    `CNJ ${manifest?.cnj ?? '—'}: ${manifest?.downloaded ?? 0}/${manifest?.expectedDocuments ?? 0} baixados, ` +
    `${manifest?.failed ?? 0} falhas, ${manifest?.duplicates ?? 0} duplicados, ` +
    `${(manifest?.missingSequences ?? []).length} sequências ausentes — ${manifest?.status ?? 'UNKNOWN'}`
  ].join('');
}

export function manifestIsReprocessable(manifest) {
  return Boolean(manifest) && typeof manifest === 'object' &&
    Array.isArray(manifest.failedEntries) &&
    Array.isArray(manifest.missingSequences) &&
    manifest.version === MANIFEST_VERSION;
}
