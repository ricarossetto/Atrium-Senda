import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { recordEprocEnrichmentCompletion } from '../lib/judicial/eproc/enrichment/completion-evidence.mjs';
import { isProcessEnrichmentCandidate } from '../js/views/ui-v2/processes-presenter.js';

const options = { portalId: 'tjrs-eproc-1g', collectedAt: '2026-09-16T12:00:00.000Z' };
const original = { number: '5000000-00.2026.8.21.0000', secrecy: true, client: 'SIGILO', tags: ['varredura-a1'] };
const cover = { clientName: 'Cliente Sintético', judge: 'Magistrado Sintético', court: 'Vara Sintética', actionClass: 'Classe Sintética', accessKey: 'synthetic-access-key' };
const completed = structuredClone(original);
assert.equal(recordEprocEnrichmentCompletion(completed, cover, options), true);
assert.equal(completed.enrichmentStatus, 'COMPLETE');
assert.equal(completed.eprocEnrichmentCompletedAt, options.collectedAt);
assert.equal(completed.eprocEnrichmentEvidence.portalId, options.portalId);
assert.equal(isProcessEnrichmentCandidate(completed), false, 'Writer real deve retirar marcador mesmo com segredo persistente.');
for (const field of Object.keys(cover)) {
  const partial = structuredClone(original);
  const details = { ...cover, [field]: '' };
  assert.equal(recordEprocEnrichmentCompletion(partial, details, options), false);
  assert.equal(isProcessEnrichmentCandidate(partial), true, `Coleta incompleta de ${field} mantém marcador.`);
}
for (const clientName of ['SIGILO', 'Cliente Geral', 'não identificado', 'não informado']) {
  const partial = structuredClone(original);
  assert.equal(recordEprocEnrichmentCompletion(partial, { ...cover, clientName }, options), false);
}
const errored = structuredClone(original);
assert.equal(recordEprocEnrichmentCompletion(errored, cover, { ...options, hasErrors: true }), false);
assert.equal(isProcessEnrichmentCandidate(errored), true);
const stale = { ...completed, enrichmentStatus: 'RETRYABLE_ERROR' };
assert.equal(isProcessEnrichmentCandidate(stale), true);
const writer = await readFile(new URL('../lib/judicial/eproc-a1-downloader.mjs', import.meta.url), 'utf8');
assert.match(writer, /recordEprocEnrichmentCompletion\(proc, details,\s*\{\s*portalId, collectedAt: nowIso, hasErrors: collectionErrors.length !== processErrorStart/);
assert.match(writer, /saveState\(state, envelopeRevision\)/);
console.log('EPROC ENRICHMENT COMPLETION: PASS');
