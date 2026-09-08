/**
 * ATRIUM Sovereign Omni-Collector — Comprehensive Multi-Tier Test Suite
 *
 * Verifies:
 * - Tier 1: Contracts, CNJ validation & court resolution
 * - Tier 2: Deterministic SHA-256 fingerprinting & 4-way diff engine
 * - Tier 3: Universal Process Normalizer (TJRS, TJDFT, TJSP, DataJud, DJEN)
 * - Tier 4: Adapters with mock injection & challenge detection
 * - Tier 5: Priority queue & backoff
 * - Tier 6: SQLite storage (snapshots, diffs, watchlist, runs)
 * - Tier 7: Hub cascading fallback & DJEN enrichment
 * - Tier 8: HTTP handlers & backward compatibility
 */

import assert from 'node:assert/strict';
import { rm, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { SecurityManager } from '../lib/security.mjs';
import { syntheticCnj, CNJ, snapshot } from './fixtures/omni-network.mjs';
import {
  cleanCnj,
  formatCnj,
  assertCnj,
  parseCnjSegments,
  resolveCourtFromCnj,
  FACT_TYPE,
  SOURCE_TYPE,
  CHALLENGE_STATUS,
  QUEUE_PRIORITY
} from '../lib/judicial/omni/contracts.mjs';
import {
  canonicalJson,
  computeSha256,
  computeMovementFingerprint
} from '../lib/judicial/omni/fingerprint.mjs';
import {
  computeMovementDiff,
  computeProcessDiff
} from '../lib/judicial/omni/diff-engine.mjs';
import { CanonicalNormalizer } from '../lib/judicial/omni/normalizer.mjs';
import { BaseAdapter } from '../lib/judicial/omni/adapters/base-adapter.mjs';
import { TjdftAdapter } from '../lib/judicial/omni/adapters/tjdft-adapter.mjs';
import { TjrsAdapter } from '../lib/judicial/omni/adapters/tjrs-adapter.mjs';
import { TjspAdapter } from '../lib/judicial/omni/adapters/tjsp-adapter.mjs';
import { DataJudAdapter } from '../lib/judicial/omni/adapters/datajud-adapter.mjs';
import { DjenAdapter } from '../lib/judicial/omni/adapters/djen-adapter.mjs';
import { PriorityQueueManager } from '../lib/judicial/omni/queue.mjs';
import { OmniStorage } from '../lib/judicial/omni/storage.mjs';
import { OmniCollectorHub } from '../lib/judicial/omni/hub.mjs';
import { createOmniHttpHandler } from '../lib/judicial/omni/http-routes.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM × SOVEREIGN OMNI-COLLECTOR — TEST HARNESS');
console.log('===============================================================\n');

// -------------------------------------------------------------
// TIER 1: Contracts & CNJ Resolution
// -------------------------------------------------------------
console.log('[Tier 1] Verificando contratos, sanitização CNJ e resolução de tribunais...');
const VALID_CNJ = '00000015820998210000';
const FORMATTED_CNJ = '0000001-58.2099.8.21.0000';

assert.equal(cleanCnj(FORMATTED_CNJ), VALID_CNJ);
assert.equal(formatCnj(VALID_CNJ), FORMATTED_CNJ);
assert.equal(assertCnj(FORMATTED_CNJ), VALID_CNJ);
assert.throws(() => assertCnj('123'), /inválido/);
assert.throws(() => assertCnj('0'.repeat(20)), /inválido/);
assert.throws(() => assertCnj(VALID_CNJ.slice(0,7) + '00' + VALID_CNJ.slice(9)), /inválido/);
assert.equal(assertCnj(syntheticCnj(25, '404')), syntheticCnj(25, '404'));

const segments = parseCnjSegments(VALID_CNJ);
assert.equal(segments.sequential, '0000001');
assert.equal(segments.digit, CNJ.slice(7,9));
assert.equal(segments.year, '2099');
assert.equal(segments.justice, '8');
assert.equal(segments.tribunal, '21');
assert.equal(segments.origin, '0000');
assert.equal(segments.segment, '8.21');

assert.equal(resolveCourtFromCnj('00000015820998210000'), 'TJRS'); // 8.21
assert.equal(resolveCourtFromCnj('00000023320998070000'), 'TJDFT'); // 8.07
assert.equal(resolveCourtFromCnj('00000038720998260000'), 'TJSP'); // 8.26
assert.equal(resolveCourtFromCnj('00000042020994040000'), 'TRF4'); // 4.04
console.log('  ✓ CNJ resolution e segmentação PASS');

// -------------------------------------------------------------
// TIER 2: Fingerprint & 4-Way Diff
// -------------------------------------------------------------
console.log('[Tier 2] Verificando fingerprints determinísticos SHA-256 e motor de diff 4-vias...');
const jsonA = canonicalJson({ b: 2, a: 1 });
const jsonB = canonicalJson({ a: 1, b: 2 });
assert.equal(jsonA, jsonB);
assert.equal(computeSha256({ b: 2, a: 1 }), computeSha256({ a: 1, b: 2 }));

const mov1 = { eventNumber: 1, date: '2026-09-01T10:00:00Z', description: 'Petição inicial juntada', cnjCode: 1 };
const mov2 = { eventNumber: 2, date: '2026-09-02T10:00:00Z', description: 'Despacho proferido', cnjCode: 10 };
const fp1 = computeMovementFingerprint(mov1);
const fp2 = computeMovementFingerprint(mov2);
assert.notEqual(fp1, fp2);
assert.equal(fp1, computeMovementFingerprint({ ...mov1 }));

// Test 4-way diff
const mov1Modified = { eventNumber: 1, date: '2026-09-01T10:00:00Z', description: 'Petição inicial retificada', cnjCode: 1 };
const mov3New = { eventNumber: 3, date: '2026-09-03T10:00:00Z', description: 'Sentença publicada', cnjCode: 20 };

const diff = computeMovementDiff([mov1, mov2], [mov1Modified, mov3New]);
assert.equal(diff.hasChanges, true);
assert.equal(diff.newMovements.length, 1);
assert.equal(diff.newMovements[0].eventNumber, 3);
assert.equal(diff.changedMovements.length, 1);
assert.equal(diff.changedMovements[0].previous.description, 'Petição inicial juntada');
assert.equal(diff.changedMovements[0].current.description, 'Petição inicial retificada');
assert.equal(diff.possiblyMissingMovements.length, 1);
assert.equal(diff.possiblyMissingMovements[0].eventNumber, 2);
console.log('  ✓ Deterministic fingerprint e 4-way diff PASS');

// -------------------------------------------------------------
// TIER 3: Canonical Normalizer
// -------------------------------------------------------------
console.log('[Tier 3] Verificando normalizador canônico multi-tribunal...');
const normalizer = new CanonicalNormalizer();

// Test TJRS normalization
const tjrsRaw = {
  metadata: {
    rawCnj: FORMATTED_CNJ,
    court: 'TJRS',
    district: 'Bento Gonçalves',
    judicialUnit: '1ª Vara Cível',
    system: 'EPROC',
    processClass: 'Procedimento Comum',
    subject: 'Danos Morais',
    distributionDate: '2026-08-01'
  },
  parties: [{
    name: 'AUTOR SINTÉTICO',
    role: 'AUTOR',
    lawyers: [{ name: 'ADVOGADO SINTÉTICO', oabNumber: '123456', oabUf: 'RS' }]
  }],
  movements: [mov1, mov2]
};

const tjrsCanonical = normalizer.normalizeTjrs(tjrsRaw);
assert.equal(tjrsCanonical.cnj, VALID_CNJ);
assert.equal(tjrsCanonical.metadata.court, 'TJRS');
assert.equal(tjrsCanonical.parties.length, 1);
assert.equal(tjrsCanonical.movements.length, 2);
assert.equal(tjrsCanonical.provenance.factType, FACT_TYPE.FACT);
assert.equal(tjrsCanonical.provenance.source, SOURCE_TYPE.TJRS_PUBLIC);

// Test DJEN enrichment
const djenPubs = [{
  id: 'pub-101',
  dataDisponibilizacao: '2026-09-04',
  tipoComunicacao: 'Intimação Eletrônica',
  texto: 'Fica intimada a parte autora a se manifestar.'
}];
const enriched = normalizer.enrichWithDjen(tjrsCanonical, djenPubs);
assert.equal(enriched.movements.length, 3);
assert.equal(enriched.publications.length, 1);
assert.equal(enriched.publications[0].factType, FACT_TYPE.FACT);
console.log('  ✓ Canonical normalizer & DJEN enrichment PASS');

// -------------------------------------------------------------
// TIER 4: Adapters with Mock Injection
// -------------------------------------------------------------
console.log('[Tier 4] Verificando adaptadores com simulação offline e detecção de desafios...');

// TJDFT Adapter Mock
const tjdftAdapter = new TjdftAdapter({
  customFetch: async (url) => {
    if (url.includes('/actuator/health')) {
      return { status: 200, text: async () => JSON.stringify({ status: 'UP' }) };
    }
    if (url.includes('/v1/processos?numeroProcesso=')) {
      return {
        status: 200,
        json: async () => [{
          numeroProcesso: '0000002-33.2099.8.07.0000',
          idProcesso: 555,
          dadosBasicos: {
            comarca: 'Brasília',
            classeProcessual: { nome: 'Cumprimento de Sentença' }
          }
        }]
      };
    }
    if (url.includes('/movimentacoes')) {
      return {
        status: 200,
        json: async () => [{
          dataHora: '2026-08-10T14:00:00Z',
          movimentoNacional: { nome: 'Conclusos para Despacho', codigo: 51 }
        }]
      };
    }
    return { status: 404, ok: false };
  }
});

const tjdftHealth = await tjdftAdapter.healthCheck();
assert.equal(tjdftHealth.ok, true);
assert.equal(tjdftHealth.status, 'OK');

const tjdftResult = await tjdftAdapter.collectProcess('00000023320998070000');
assert.equal(tjdftResult.success, true);
assert.equal(tjdftResult.courtCode, 'TJDFT');
assert.equal(tjdftResult.rawPayload.movimentacoes.length, 1);

// Challenge Detection Test in TJSP
const tjspBlocked = new TjspAdapter({
  customFetch: async () => ({
    status: 429,
    text: async () => '<html><body><div id="captcha">Human Verification Required</div></body></html>'
  })
});
const tjspResult = await tjspBlocked.collectProcess('00000038720998260000');
assert.equal(tjspResult.success, false);
assert.equal(tjspResult.challengeStatus, CHALLENGE_STATUS.HUMAN_ACTION_REQUIRED);
console.log('  ✓ Adapters & challenge detection PASS');

// -------------------------------------------------------------
// TIER 5: Priority Queue
// -------------------------------------------------------------
console.log('[Tier 5] Verificando fila de prioridade e espaçamento educado...');
const queue = new PriorityQueueManager({ minDelayMs: 20 });
const order = [];

const p4 = queue.enqueue(async () => { order.push('P4'); return 'P4'; }, { priority: QUEUE_PRIORITY.P4 });
const p0 = queue.enqueue(async () => { order.push('P0'); return 'P0'; }, { priority: QUEUE_PRIORITY.P0 });
const p1 = queue.enqueue(async () => { order.push('P1'); return 'P1'; }, { priority: QUEUE_PRIORITY.P1 });

await Promise.all([p4, p0, p1]);
assert.deepEqual(order, ['P0', 'P1', 'P4']);
console.log('  ✓ Priority queue order PASS');

// -------------------------------------------------------------
// TIER 6: SQLite Storage Engine
// -------------------------------------------------------------
console.log('[Tier 6] Verificando motor de persistência SQLite...');
const testStorageDir = await mkdtemp(path.join(tmpdir(), 'atrium-omni-unit-'));

const storage = new OmniStorage({ dataDirectory: testStorageDir, securityManager: new SecurityManager({ dataDirectory: testStorageDir, sessionSecret: randomBytes(48).toString('base64url'), encryptionKey: randomBytes(32).toString('base64') }) });
await storage.init();

const snapId = storage.saveSnapshot(tjrsCanonical);
assert.equal(snapId, 1);

const loadedSnap = storage.getLatestSnapshot(VALID_CNJ);
assert.equal(loadedSnap.cnj, VALID_CNJ);
assert.equal(loadedSnap.metadata.court, 'TJRS');
assert.equal(loadedSnap.movements.length, 2);

const diffId = storage.saveDiff(VALID_CNJ, diff, 1, 2);
assert.equal(diffId, 1);

const loadedDiff = storage.getLatestDiff(VALID_CNJ);
assert.equal(loadedDiff.hasChanges, true);

storage.addToWatchlist({ cnj: VALID_CNJ, court: 'TJRS', clientName: 'Cliente Teste' });
const watchlist = storage.getWatchlist();
assert.equal(watchlist.length, 1);
assert.equal(watchlist[0].cnj, VALID_CNJ);

const cacheBytes = Buffer.concat(await Promise.all([storage.dbPath, storage.dbPath + '-wal'].map(file => readFile(file))));
assert.equal(cacheBytes.includes(Buffer.from(VALID_CNJ)), false);
assert.equal(cacheBytes.includes(Buffer.from('Cliente Teste')), false);
storage.close();
await storage.init();
assert.equal(storage.getLatestSnapshot(VALID_CNJ).cnj, VALID_CNJ);
storage.close();
await rm(testStorageDir, { recursive: true, force: true }).catch(() => {});
console.log('  ✓ SQLite storage engine PASS');

// -------------------------------------------------------------
// TIER 7: Hub Cascading Fallback & OAB Discovery
// -------------------------------------------------------------
console.log('[Tier 7] Verificando Hub com cascading fallback e busca por OAB...');
const mockDataJud = new DataJudAdapter({
  customFetch: async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      hits: {
        hits: [{
          _source: {
            numeroProcesso: '00000042020994040000',
            tribunal: 'TRF4',
            dadosBasicos: {
              classeProcessual: { nome: 'Ação Previdenciária' }
            },
            movimentos: [{ dataHora: '2026-09-01T00:00:00Z', nome: 'Distribuição' }]
          }
        }]
      }
    })
  })
});

const mockDjen = new DjenAdapter({
  customFetch: async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      items: [
        { numero_processo: '0000001-58.2099.8.21.0000' },
        { numero_processo: '0000004-20.2099.4.04.0000' }
      ]
    })
  })
});

const hub = new OmniCollectorHub({
  adapters: {
    tjrs: tjrsAdapterStub(),
    tjdft: tjdftAdapter,
    tjsp: tjspBlocked,
    datajud: mockDataJud,
    djen: mockDjen
  },
  minDelayMs: 10
});

// Fallback test: TRF4 process is not in local adapters, falls back to DataJud
const fallbackResult = await hub.syncProcess('00000042020994040000');
assert.equal(fallbackResult.source, SOURCE_TYPE.DATAJUD);
assert.equal(fallbackResult.court, 'TRF4');

// OAB discovery test
const oabResult = await hub.discoverByOab({ oab: '123456', uf: 'RS' });
assert.equal(oabResult.success, true);
assert.equal(oabResult.cnjCandidates.length, 2);
console.log('  ✓ Hub cascading fallback & OAB discovery PASS');

// -------------------------------------------------------------
// TIER 8: HTTP Handlers & Backward Compatibility
// -------------------------------------------------------------
console.log('[Tier 8] Verificando rotas HTTP e retrocompatibilidade com TJRS sidecar...');
const dummyState = {
  revision: 'rev-1',
  state: {
    processes: [{
      id: 'proc-1',
      number: FORMATTED_CNJ,
      court: 'TJRS'
    }]
  }
};

const handler = createOmniHttpHandler({
  hub,
  assertAuthenticated: () => ({ user: 'test' }),
  readJson: async () => ({ processId: 'proc-1', processNumber: FORMATTED_CNJ, revision: 'rev-1' }),
  readStateEnvelope: async () => dummyState,
  saveState: async (newState) => ({ ok: true, revision: 'rev-2' }),
  json: (res, code, data) => { res.statusCode = code; res.body = data; }
});

// 1. Backward compat: /api/integrations/tjrs-sidecar/status
const mockResStatus = {};
const handledStatus = await handler({ method: 'GET' }, mockResStatus, new URL('http://127.0.0.1/api/integrations/tjrs-sidecar/status'));
assert.equal(handledStatus, true);
assert.equal(mockResStatus.statusCode, 200);
assert.equal(mockResStatus.body.state, 'AVAILABLE');

// 2. Backward compat: /api/integrations/tjrs-sidecar/processes/sync
const mockResSync = {};
const handledSync = await handler({ method: 'POST' }, mockResSync, new URL('http://127.0.0.1/api/integrations/tjrs-sidecar/processes/sync'));
assert.equal(handledSync, true);
assert.equal(mockResSync.statusCode, 200);
assert.equal(mockResSync.body.ok, true);
assert.equal(mockResSync.body.revision, 'rev-2');

// 3. New multi-court: /api/integrations/omni/status
const mockResOmni = {};
const handledOmni = await handler({ method: 'GET' }, mockResOmni, new URL('http://127.0.0.1/api/integrations/omni/status'));
assert.equal(handledOmni, true);
assert.equal(mockResOmni.statusCode, 200);
assert.equal(mockResOmni.body.ok, true);

console.log('  ✓ HTTP handler & retrocompatibilidade TJRS PASS\n');

console.log('===============================================================');
console.log('  TODOS OS TESTES DO HARNESS OMNI-COLLECTOR PASSARAM COM SUCESSO!');
console.log('===============================================================\n');

function tjrsAdapterStub() {
  return new TjrsAdapter({
    customFetch: async () => ({
      status: 200,
      json: async () => tjrsRaw
    })
  });
}
