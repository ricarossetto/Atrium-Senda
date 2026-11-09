import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SecurityManager } from '../lib/security.mjs';
import { BetaStore } from '../lib/judicial-intelligence/core/beta-storage.mjs';
import { HttpTransport } from '../lib/judicial-intelligence/core/http.mjs';
import { createPdpjProvider } from '../lib/judicial-intelligence/providers/pdpj/index.mjs';
import { createFixtureAcquisitionProvider } from '../lib/judicial-intelligence/providers/documents/fixture-provider.mjs';
import { createEprocStagingProvider } from '../lib/judicial-intelligence/providers/documents/eproc-provider.mjs';
import { createPdpjAcquisitionProvider } from '../lib/judicial-intelligence/providers/documents/pdpj-provider.mjs';
import { runCaseAcquisition } from '../lib/judicial-intelligence/providers/documents/acquisition-runner.mjs';
import { AcquisitionJournal, JOURNAL_STATUS } from '../lib/judicial-intelligence/document-intelligence/journal.mjs';
import { buildManifest, reconcileManifest, renderManifestSummary, MANIFEST_STATUS } from '../lib/judicial-intelligence/document-intelligence/manifest.mjs';
import { deduplicateDocuments, findMissingSequences } from '../lib/judicial-intelligence/document-intelligence/dedup.mjs';
import { DocumentIndex } from '../lib/judicial-intelligence/document-intelligence/document-index.mjs';
import { sha256Hex, isChecksum, verifyChecksum } from '../lib/judicial-intelligence/document-intelligence/checksum.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — AQUISIÇÃO RESILIENTE DE AUTOS (LOTE, RESUME, MANIFESTO)');
console.log('===============================================================\n');

const CNJ = '5001234-56.2023.8.21.0001';
const ACQUISITION_FLAG_ON = { BETA_DOCUMENT_ACQUISITION: 'true' };
const AUTOMATIONS_OFF = { BETA_DOCUMENT_ACQUISITION: 'true', BETA_DISABLE_AUTOMATIONS: 'false' };
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'atrium-ji-acquisition-'));

function jsonResponse(payload, { status = 200 } = {}) {
  const buffer = Buffer.from(JSON.stringify(payload), 'utf8');
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(),
    body: null,
    url: '',
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
}

function binaryResponse(buffer, { headers = {} } = {}) {
  return {
    status: 200,
    ok: true,
    headers: new Headers(headers),
    body: null,
    url: '',
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  };
}

try {
  console.log('[A1] Checksum, deduplicação, sequências ausentes e kill-switch de automação...');
  {
    const blockedByFlag = await runCaseAcquisition({
      provider: createFixtureAcquisitionProvider({ documents: 1 }),
      cnj: CNJ,
      sink: async () => {}
    }).then(() => null, error => error);
    assert.equal(blockedByFlag?.code, 'DISABLED', 'Executor direto deve recusar com a flag desligada.');
    assert.match(blockedByFlag.humanAction, /BETA_DOCUMENT_ACQUISITION/);
    const blockedByKillSwitch = await runCaseAcquisition({
      provider: createFixtureAcquisitionProvider({ documents: 1 }),
      cnj: CNJ,
      env: ACQUISITION_FLAG_ON,
      sink: async () => {}
    }).then(() => null, error => error);
    assert.equal(blockedByKillSwitch?.code, 'DISABLED', 'Automação deve estar bloqueada por padrão.');
    assert.match(blockedByKillSwitch.humanAction, /BETA_DISABLE_AUTOMATIONS/);
    const hash = sha256Hex(Buffer.from('conteudo'));
    assert.equal(isChecksum(hash), true);
    assert.equal(verifyChecksum(Buffer.from('conteudo'), hash), hash);
    assert.throws(() => verifyChecksum(Buffer.from('outro'), hash), error => error.code === 'CONFLICT');
    const deduped = deduplicateDocuments([
      { sourceId: 'a', sequence: 1, sha256: hash },
      { sourceId: 'b', sequence: 2, sha256: hash },
      { sourceId: 'c', sequence: 3, sha256: sha256Hex(Buffer.from('terceiro')) }
    ]);
    assert.equal(deduped.unique.length, 2);
    assert.equal(deduped.duplicateCount, 1);
    assert.equal(deduped.duplicates[0].duplicateOf, 'a');
    assert.deepEqual(findMissingSequences([{ sequence: 1 }, { sequence: 3 }, { sequence: 5 }]), [2, 4]);
    assert.deepEqual(findMissingSequences([]), []);
  }

  console.log('[A2] Cenário de aceitação: 4830 esperados, 1 falha permanente, 0 abortos...');
  {
    const provider = createFixtureAcquisitionProvider({ documents: 4830, failingIds: ['fx-4100'] });
    const journal = new AcquisitionJournal({ filePath: path.join(tempRoot, 'ws-a', 'journal.jsonl') });
    let sinkBytes = 0;
    const result = await runCaseAcquisition({
      provider,
      cnj: CNJ,
      journal,
      sink: async artifact => { sinkBytes += artifact.bytes.length; },
      batchSize: 500,
      env: AUTOMATIONS_OFF
    });
    assert.equal(result.manifest.expectedDocuments, 4830);
    assert.equal(result.manifest.downloaded, 4829);
    assert.equal(result.manifest.failed, 1);
    assert.equal(result.manifest.duplicates, 0);
    assert.deepEqual(result.manifest.missingSequences, []);
    assert.equal(result.manifest.status, MANIFEST_STATUS.PARTIAL);
    assert.equal(result.failed[0].sourceId, 'fx-4100');
    assert.equal(result.failed[0].errorClass, 'UNAVAILABLE');
    assert.equal(sinkBytes > 0, true);
    assert.match(renderManifestSummary(result.manifest), /4829\/4830/);
    assert.equal(journal.entries.length, 4830);
    assert.equal(journal.lastAttempt('fx-4100').status, JOURNAL_STATUS.FAILED);
    assert.equal(journal.lastAttempt('fx-1').status, JOURNAL_STATUS.DOWNLOADED);

    console.log('[A3] Retomada idempotente: nada é rebaixado, falha é reprocessada...');
    const resumed = await runCaseAcquisition({
      provider: createFixtureAcquisitionProvider({ documents: 4830, failingIds: [] }),
      cnj: CNJ,
      journal,
      sink: async () => {},
      batchSize: 900,
      env: AUTOMATIONS_OFF
    });
    assert.equal(resumed.manifest.downloaded, 4830);
    assert.equal(resumed.manifest.failed, 0);
    assert.equal(resumed.manifest.status, MANIFEST_STATUS.COMPLETE);
    const journalAgain = new AcquisitionJournal({ filePath: path.join(tempRoot, 'ws-a', 'journal.jsonl') });
    await journalAgain.load();
    assert.equal(journalAgain.completedSourceIds().size, 4830);
  }

  console.log('[A4] Falha transitória com retry, duplicados por checksum e isolamento por documento...');
  {
    const provider = createFixtureAcquisitionProvider({
      documents: 12,
      transientIds: ['fx-3', 'fx-7'],
      duplicateIds: ['fx-9'],
      failingIds: ['fx-11']
    });
    const result = await runCaseAcquisition({ provider, cnj: CNJ, batchSize: 4, attempts: 2, env: AUTOMATIONS_OFF });
    assert.equal(result.manifest.expectedDocuments, 12);
    assert.equal(result.manifest.downloaded, 11);
    assert.equal(result.manifest.failed, 1);
    assert.equal(result.manifest.duplicates, 1);
    assert.equal(result.unique.length, 10);
    assert.equal(result.downloaded.find(record => record.sourceId === 'fx-3').downloadStatus, 'DOWNLOADED');
    assert.equal(result.manifest.status, MANIFEST_STATUS.PARTIAL);
    const reconciled = reconcileManifest(result.manifest, { expected: result.expected, downloaded: result.downloaded });
    assert.equal(reconciled.status, MANIFEST_STATUS.PARTIAL);
    assert.equal(reconciled.previousStatus, MANIFEST_STATUS.PARTIAL);
    assert.equal(reconciled.failed, 1);
    assert.equal(buildManifest({ cnj: CNJ }).status, MANIFEST_STATUS.EMPTY);
  }

  console.log('[A5] Adapter real eproc: staging oficial, traversal bloqueado e read-only...');
  {
    assert.throws(
      () => createEprocStagingProvider({ env: {} }),
      error => error.code === 'DISABLED' && error.humanAction.includes('BETA_DOCUMENT_ACQUISITION')
    );
    const unconfigured = createEprocStagingProvider({ env: { BETA_DOCUMENT_ACQUISITION: 'true' } });
    const readiness = await unconfigured.describeReadiness();
    assert.equal(readiness.ready, false);
    assert.match(readiness.humanAction, /JI_EPROC_STAGING_DIR/);
    await assert.rejects(() => unconfigured.listDocuments(CNJ), error => error.code === 'HUMAN_REQUIRED');

    const stagingRoot = path.join(tempRoot, 'eproc-staging');
    const folder = path.join(stagingRoot, 'Cliente Teste', '5001234-56.2023.8.21.0001');
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, '01_peticao_inicial.pdf'), Buffer.from('PDF SINTETICO 01'));
    await writeFile(path.join(folder, '02_sentenca.pdf'), Buffer.from('PDF SINTETICO 02'));
    await writeFile(path.join(folder, 'leiame.txt'), 'ignorar');
    const provider = createEprocStagingProvider({
      stagingRoot,
      env: { BETA_DOCUMENT_ACQUISITION: 'true' }
    });
    assert.equal((await provider.describeReadiness()).ready, true);
    const listed = await provider.listDocuments(CNJ);
    assert.equal(listed.length, 2);
    assert.equal(listed[0].source, 'EPROC');
    assert.equal(listed[0].downloadStatus, 'PENDING');
    const artifact = await provider.downloadDocument('02_sentenca.pdf', { cnj: CNJ });
    assert.equal(sha256Hex(artifact.bytes), sha256Hex(Buffer.from('PDF SINTETICO 02')));
    assert.equal(artifact.provenance.source, 'EPROC');
    await assert.rejects(() => provider.downloadDocument('../segredo.pdf', { cnj: CNJ }), error => error.code === 'FORBIDDEN');
    await assert.rejects(() => provider.downloadDocument(path.join('..', '..', 'segredo.pdf'), { cnj: CNJ }), error => error.code === 'FORBIDDEN');

    const anotherProvider = createEprocStagingProvider({ stagingRoot, env: { BETA_DOCUMENT_ACQUISITION: 'true' } });
    assert.deepEqual(await anotherProvider.listDocuments('0000777-11.2024.8.16.0080'), []);
  }

  console.log('[A6] Adapter PDPJ para documentos + índice beta com lookup por CNJ...');
  {
    const pdfBytes = Buffer.from('PDF PDPJ SINTETICO');
    const transport = new HttpTransport({
      policy: { hostSpacingMs: 0, maxAttempts: 1 },
      fetchImpl: async url => {
        if (String(url).includes('/binario')) return binaryResponse(pdfBytes, { headers: { 'content-type': 'application/pdf' } });
        return jsonResponse({ content: [{ id: 'doc-1', sequencia: 1, tipo: 'Sentença', mimeType: 'application/pdf' }] });
      }
    });
    const pdpj = createPdpjProvider({
      env: { BETA_PDPJ_PROVIDER: 'true' },
      token: 'x.y.z',
      transport,
      baseUrl: 'https://pdpj.example.test'
    });
    assert.throws(
      () => createPdpjAcquisitionProvider({ pdpjProvider: pdpj, env: {} }),
      error => error.code === 'DISABLED'
    );
    const acquisition = createPdpjAcquisitionProvider({
      pdpjProvider: pdpj,
      env: { BETA_DOCUMENT_ACQUISITION: 'true' }
    });
    const security = new SecurityManager({
      dataDirectory: path.join(tempRoot, 'ws-b'),
      sessionSecret: randomBytes(32).toString('base64url'),
      encryptionKey: randomBytes(32).toString('base64'),
      secureCookies: false
    });
    await security.init();
    const store = new BetaStore({ dataDirectory: path.join(tempRoot, 'ws-b'), securityManager: security });
    await store.init();
    try {
      const index = new DocumentIndex({ store });
      const result = await runCaseAcquisition({ provider: acquisition, cnj: CNJ, index, attempts: 1, env: AUTOMATIONS_OFF });
      assert.equal(result.manifest.downloaded, 1);
      assert.equal(result.manifest.status, MANIFEST_STATUS.COMPLETE);
      assert.equal(isChecksum(result.downloaded[0].sha256), true);
      const indexed = index.getDocument(CNJ, 'doc-1');
      assert.equal(indexed.source, 'PDPJ');
      assert.equal(indexed.downloadStatus, 'DOWNLOADED');
      assert.equal(index.listDocuments(CNJ).length, 1);
      assert.equal(index.listDocuments('0000777-11.2024.8.16.0080').length, 0, 'Índice beta isola por CNJ.');
      const manifestRecord = index.getManifest(CNJ, 'pdpj-documents');
      assert.equal(manifestRecord.status, MANIFEST_STATUS.COMPLETE);
      assert.equal(renderManifestSummary(manifestRecord).includes('1/1'), true);
    } finally {
      store.close();
    }

    const journal = new AcquisitionJournal({ filePath: path.join(tempRoot, 'ws-b', 'pdpj-journal.jsonl') });
    const resumed = await runCaseAcquisition({ provider: acquisition, cnj: CNJ, journal, attempts: 1, env: AUTOMATIONS_OFF });
    assert.equal(resumed.manifest.downloaded, 1, 'Retomada não rebaixa o documento já concluído.');
    assert.equal(resumed.manifest.status, MANIFEST_STATUS.COMPLETE);
  }

  console.log('✓ Aquisição: lote, resume, manifesto, checksum, dedup, traversal e adapters aprovados.');
} finally {
  const resolved = path.resolve(tempRoot);
  const safePrefix = path.resolve(os.tmpdir()) + path.sep;
  if (!resolved.startsWith(safePrefix) || !path.basename(resolved).startsWith('atrium-ji-acquisition-')) {
    throw new Error('Diretório temporário inesperado; limpeza cancelada.');
  }
  await rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
}
