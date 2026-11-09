import { normalizeDocumentRecord, sortDocuments } from '../../document-intelligence/metadata.mjs';
import { deduplicateDocuments } from '../../document-intelligence/dedup.mjs';
import { buildManifest } from '../../document-intelligence/manifest.mjs';
import { verifyChecksum, isChecksum, sha256Hex } from '../../document-intelligence/checksum.mjs';
import { JOURNAL_STATUS, withRetry } from '../../document-intelligence/journal.mjs';
import { assertAcquisitionProvider } from './acquisition-provider.mjs';
import { assertBetaFlagEnabled } from '../../beta/feature-flags.mjs';
import { assertAutomationsEnabled } from '../../beta/automation-guard.mjs';
import { JudicialIntelligenceError, JI_ERROR_CODES } from '../../core/errors.mjs';

function defaultSink() {
  return async () => {};
}

export async function runCaseAcquisition({
  provider,
  cnj,
  journal = null,
  index = null,
  sink = defaultSink(),
  batchSize = 25,
  attempts = 3,
  recorder = null,
  resume = true,
  onProgress = null,
  maxDocuments = null,
  env = process.env,
  collectedAt = new Date().toISOString()
} = {}) {
  assertAcquisitionProvider(provider);
  // Defesa em profundidade: o executor direto recusa execução com a flag desligada,
  // sem depender de quem o chamou.
  assertBetaFlagEnabled('BETA_DOCUMENT_ACQUISITION', env);
  assertAutomationsEnabled(env, { operation: 'mass-download', provider: provider.id });
  if (!cnj) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, 'Aquisição exige CNJ.');
  }
  if (journal && resume) await journal.load();

  const listed = await provider.listDocuments(cnj, { collectedAt });
  const expected = sortDocuments(listed).slice(0, maxDocuments === null ? undefined : Math.max(1, Number(maxDocuments)));
  const completed = journal ? journal.completedSourceIds() : new Set();

  const downloaded = [];
  const failed = [];
  const skipped = [];
  const attempted = [];
  const batch = Math.max(1, Number(batchSize) || 25);

  for (const document of expected) {
    const sourceId = String(document.sourceId);
    if (completed.has(sourceId)) {
      const last = journal.lastAttempt(sourceId);
      downloaded.push({
        ...document,
        sha256: last?.checksum ?? document.sha256 ?? null,
        size: last?.size ?? document.size ?? null,
        downloadStatus: 'DOWNLOADED'
      });
      continue;
    }

    const operation = recorder?.start?.(provider.id, 'downloadDocument');
    try {
      const { value: artifact, attempts: usedAttempts } = await withRetry(
        () => provider.downloadDocument(sourceId, { cnj, record: document }),
        { attempts }
      );
      if (!artifact?.bytes) {
        throw new JudicialIntelligenceError(JI_ERROR_CODES.PARSE_ERROR, 'Documento retornado sem conteúdo binário.');
      }
      let checksum = artifact.sha256 ?? null;
      if (isChecksum(checksum)) verifyChecksum(artifact.bytes, checksum);
      checksum = sha256Hex(artifact.bytes);
      await sink({
        sourceId,
        cnj,
        sequence: document.sequence,
        bytes: artifact.bytes,
        sha256: checksum,
        mimeType: artifact.mimeType ?? document.mimeType ?? 'application/octet-stream'
      });
      const record = {
        ...document,
        sha256: checksum,
        size: artifact.bytes.length,
        mimeType: artifact.mimeType ?? document.mimeType ?? 'application/octet-stream',
        downloadStatus: 'DOWNLOADED'
      };
      downloaded.push(record);
      attempted.push({ sourceId, status: JOURNAL_STATUS.DOWNLOADED, attempts: usedAttempts });
      if (journal) await journal.record({
        sourceId, status: JOURNAL_STATUS.DOWNLOADED, checksum, size: artifact.bytes.length, attempts: usedAttempts
      });
      index?.indexDocument?.(record);
      operation?.finish?.({ status: 'ok', items: 1 });
    } catch (error) {
      const errorClass = error?.code ?? 'INTERNAL';
      failed.push({ sourceId, errorClass, attempts: error?.attempts ?? attempts });
      attempted.push({ sourceId, status: JOURNAL_STATUS.FAILED, errorClass });
      if (journal) await journal.record({ sourceId, status: JOURNAL_STATUS.FAILED, errorClass, attempts: error?.attempts ?? attempts });
      operation?.finish?.({ status: 'failed', errorClass });
    }

    if (attempted.length % batch === 0 && onProgress) {
      await onProgress({ processed: attempted.length, expected: expected.length, downloaded: downloaded.length, failed: failed.length });
    }
  }

  const { unique, duplicates } = deduplicateDocuments(downloaded);
  const manifest = buildManifest({
    cnj,
    expected,
    downloaded,
    failed,
    skipped,
    duplicates,
    provider: provider.id,
    generatedAt: collectedAt
  });
  index?.indexManifest?.(manifest);
  if (onProgress) await onProgress({ processed: attempted.length, expected: expected.length, downloaded: downloaded.length, failed: failed.length, done: true });

  return {
    cnj,
    provider: provider.id,
    expected,
    downloaded,
    unique,
    duplicates,
    failed,
    skipped,
    manifest
  };
}
