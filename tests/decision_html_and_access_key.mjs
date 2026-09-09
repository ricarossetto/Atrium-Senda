import assert from 'node:assert/strict';
import { appendDjenItem } from '../collector/adapters/djen.mjs';
import { generateDecisionHtmlDocument, sanitizeDecisionHtml } from '../js/features/publications.js';
import { createProcessAutosArtifacts } from '../lib/judicial/tjrs-autos-service.mjs';
import { TjrsSidecarClient } from '../lib/judicial/tjrs-sidecar-client.mjs';
import { refreshMonitoredTjrsProcesses } from '../lib/judicial/tjrs-monitoring.mjs';
import { createTjrsSidecarHttpHandler } from '../lib/http/tjrs-sidecar-routes.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — HTML JUDICIAL, CHAVE DE ACESSO E CADERNO EM PDF');
console.log('===============================================================\n');

const CNJ = '50012345620268210001';
const FORMATTED_CNJ = '5001234-56.2026.8.21.0001';
const RAW_HTML = '<div class="externa" onclick="alert(1)"><h2>Decisão <strong>integral</strong></h2><script>alert(2)</script><table><tr><td colspan="2">Teor sintético</td></tr></table><img src="https://example.test/x" onerror="alert(3)"></div>';

const target = { intimations: [], contacts: [], processes: [] };
appendDjenItem({
  id: 'synthetic-publication-1',
  numeroProcesso: CNJ,
  texto: RAW_HTML,
  dataDisponibilizacao: '2026-09-05',
  tipoComunicacao: 'Decisão',
  siglaTribunal: 'TJRS',
  destinatarios: [{ nome: 'CLIENTE TESTE', polo: 'A' }]
}, { name: 'DJEN/CNJ' }, { monitoredTerm: { id: 'term-test', name: 'Advogada Teste', registration: 'OAB/RS 000000' } }, target);
assert.equal(target.intimations.length, 1);
assert.equal(target.intimations[0].hasHtml, true);
assert.equal(target.intimations[0].rawHtml, RAW_HTML);
assert.doesNotMatch(target.intimations[0].text, /<strong>|<script>/i);

const sanitized = sanitizeDecisionHtml(RAW_HTML);
assert.match(sanitized, /<strong>integral<\/strong>/);
assert.match(sanitized, /<table>/);
assert.match(sanitized, /colspan="2"/);
assert.doesNotMatch(sanitized, /script|onclick|onerror|<img|https:\/\//i);
const documentHtml = generateDecisionHtmlDocument({
  title: 'Decisão sintética', court: 'TJRS', process: FORMATTED_CNJ,
  client: 'CLIENTE TESTE', publishedAt: '2026-09-05', hasHtml: true, rawHtml: RAW_HTML
});
assert.match(documentHtml, /^<!doctype html>/i);
assert.match(documentHtml, /Content-Security-Policy/);
assert.match(documentHtml, /Decisão sintética/);
assert.match(documentHtml, /id="atriumPrintButton"/);
assert.match(documentHtml, /script-src 'sha256-/);
assert.doesNotMatch(documentHtml, /alert\(|onclick|onerror|https:\/\/example\.test/i);

const snapshot = {
  metadata: { cnj: CNJ, rawCnj: FORMATTED_CNJ, court: 'TJRS' },
  movements: [{
    date: '2026-09-04T10:00:00.000Z', description: 'Decisão interlocutória sintética',
    documentReferences: [{ id: 'doc-test', name: 'Decisão referenciada' }], fingerprint: 'a'.repeat(64)
  }],
  provenance: { queryTimestamp: '2026-09-05T10:00:00.000Z' }
};
const processItem = { id: 'process-test', number: FORMATTED_CNJ, client: 'CLIENTE TESTE', court: 'TJRS' };
const artifacts = createProcessAutosArtifacts({ processItem, snapshot });
assert.equal(artifacts.pieces.length, 1);
assert.equal(artifacts.all.length, 2);
for (const artifact of artifacts.all) {
  assert.equal(artifact.binary.subarray(0, 8).toString('latin1'), '%PDF-1.4');
  assert.match(artifact.checksum, /^[a-f\d]{64}$/);
}
assert.match(artifacts.pieces[0].binary.toString('latin1'), /N.o substitui a pe.a original|N.o substitui a pe.a original/i);

const clientRequests = [];
const client = new TjrsSidecarClient({
  fetchImpl: async (url, options = {}) => {
    clientRequests.push({ url: new URL(String(url)), options });
    if (options.method === 'POST') return responseJson({ status: 'success', data: snapshotPayload() });
    return responseJson(url.pathname === '/health'
      ? { status: 'ok', database: 'connected', collectorVersion: 'test', timestamp: '2026-09-05T10:00:00.000Z' }
      : snapshotPayload());
  }
});
await client.getProcess(FORMATTED_CNJ, { accessKey: 'CHAVE SINTÉTICA / 123' });
assert.equal(clientRequests[0].url.searchParams.get('chaveAcesso'), 'CHAVE SINTÉTICA / 123');
await client.collectProcess(FORMATTED_CNJ, { accessKey: 'CHAVE SINTÉTICA / 123', forceLive: true });
const collectionBody = JSON.parse(clientRequests[1].options.body);
assert.equal(clientRequests[1].url.pathname, '/v1/processes/collect');
assert.equal(collectionBody.forceLive, true);
assert.equal(collectionBody.accessKey, 'CHAVE SINTÉTICA / 123');

const storedKeys = new Map();
const storedBlobs = new Map();
let savedState = null;
const routeClientCalls = [];
const routeClient = {
  async health() { return { state: 'AVAILABLE' }; },
  async collectProcess(_cnj, options) { routeClientCalls.push({ kind: 'collect', ...(options || {}) }); return snapshotPayload(); },
  async getProcess(_cnj, options) { routeClientCalls.push(options || {}); return snapshotPayload(); },
  async getDiff() { return { cnj: CNJ, previousSnapshotTimestamp: '', currentSnapshotTimestamp: '', hasChanges: false, newMovements: [], unchangedMovements: [], changedMovements: [], possiblyMissingMovements: [] }; }
};
const routeState = { processes: [processItem], contacts: [], documents: [], audit: [] };
const route = createTjrsSidecarHttpHandler({
  client: routeClient,
  assertAuthenticated: (_req, csrf) => ({ username: 'advogada_teste', displayName: 'Advogada Teste', csrf }),
  readJson: async req => req.body,
  readStateEnvelope: async () => ({ state: routeState, revision: 'revision-1' }),
  saveState: async (state, revision) => { assert.equal(revision, 'revision-1'); savedState = state; return { revision: 'revision-2', updatedAt: '2026-09-05T10:01:00.000Z' }; },
  documentStorage: { async put(binary) { const checksum = artifacts.all.find(item => item.binary.equals(binary))?.checksum; storedBlobs.set(checksum, binary); return { checksum }; } },
  credentialManager: {
    async saveProcessAccessKey(cnj, { accessKey, userId }) { storedKeys.set(`${userId}:${cnj}`, accessKey); return { ok: true }; },
    async getProcessAccessKey(cnj, userId) { return storedKeys.get(`${userId}:${cnj}`) || null; }
  },
  json: (res, status, payload) => Object.assign(res, { status, payload })
});

const keyResponse = {};
await route({ method: 'POST', body: { processNumber: FORMATTED_CNJ, accessKey: 'CHAVE-PERSISTIDA-TESTE' } }, keyResponse, new URL('http://localhost/api/integrations/tjrs-sidecar/processes/access-key'));
assert.equal(keyResponse.status, 200);
assert.equal(keyResponse.payload.collected, true);
assert.equal(storedKeys.get(`advogada_teste:${CNJ}`), 'CHAVE-PERSISTIDA-TESTE');
assert.deepEqual(routeClientCalls[0], { kind: 'collect', accessKey: 'CHAVE-PERSISTIDA-TESTE', forceLive: true });
assert.equal(JSON.stringify(keyResponse.payload).includes('CHAVE-PERSISTIDA-TESTE'), false, 'Resposta de cadastro não pode devolver a chave.');

const keyStatusResponse = {};
await route({ method: 'GET' }, keyStatusResponse, new URL(`http://localhost/api/integrations/tjrs-sidecar/processes/access-key/status?processNumber=${encodeURIComponent(FORMATTED_CNJ)}`));
assert.equal(keyStatusResponse.status, 200);
assert.deepEqual(keyStatusResponse.payload, { ok: true, configured: true });
assert.equal(JSON.stringify(keyStatusResponse.payload).includes('CHAVE-PERSISTIDA-TESTE'), false, 'Status não pode devolver a chave.');

const downloadResponse = {};
await route({ method: 'POST', body: { processId: processItem.id, processNumber: FORMATTED_CNJ, revision: 'revision-1' } }, downloadResponse, new URL('http://localhost/api/integrations/tjrs-sidecar/processes/download-autos'));
assert.equal(downloadResponse.status, 200);
assert.equal(downloadResponse.payload.registeredDocumentsCount, 2);
assert.equal(savedState.documents.length, 2);
assert.equal(storedBlobs.size, 2);
assert.equal(savedState.documents.every(item => item.ownerType === 'process' && item.ownerId === processItem.id), true);
assert.equal(savedState.documents.every(item => !('accessKey' in item) && !('contentBase64' in item)), true);
assert.equal(routeClientCalls.at(-1).accessKey, 'CHAVE-PERSISTIDA-TESTE', 'Download deve reutilizar a chave guardada no cofre.');

const monitoringCalls = [];
const monitoring = await refreshMonitoredTjrsProcesses({
  processes: [processItem, { id: 'without-key', number: '5009999-99.2026.8.21.0001', court: 'TJRS', monitoring: 'active' }],
  userId: 'advogada_teste',
  credentialManager: {
    async getProcessAccessKey(cnj, userId) {
      assert.equal(userId, 'advogada_teste');
      return cnj === CNJ ? 'CHAVE-PERSISTIDA-TESTE' : null;
    }
  },
  client: {
    async health() { return { state: 'AVAILABLE' }; },
    async getProcess(cnj, options) { monitoringCalls.push({ kind: 'snapshot', cnj, options }); return snapshotPayload(); },
    async getDiff(cnj, options) {
      monitoringCalls.push({ kind: 'diff', cnj, options });
      return { cnj: CNJ, previousSnapshotTimestamp: '', currentSnapshotTimestamp: '2026-09-05T10:00:00.000Z', hasChanges: true, newMovements: snapshot.movements, unchangedMovements: [], changedMovements: [], possiblyMissingMovements: [] };
    }
  }
});
assert.equal(monitoring.configured, 1);
assert.equal(monitoring.checked, 1);
assert.equal(monitoring.updated, 1);
assert.equal(monitoring.newMovements, 1);
assert.equal(monitoringCalls.length, 2);
assert.equal(monitoringCalls.every(call => call.options.accessKey === 'CHAVE-PERSISTIDA-TESTE'), true);
assert.equal(JSON.stringify(monitoring).includes('CHAVE-PERSISTIDA-TESTE'), false, 'Resumo do monitoramento não pode expor a chave.');

console.log('PASS HTML sanitizado, chave cifrável reutilizada no monitoramento e PDFs registrados no acervo canônico.');

function snapshotPayload() {
  return {
    cnj: CNJ,
    metadata: {
      cnj: CNJ, rawCnj: FORMATTED_CNJ, court: 'TJRS', district: 'Comarca Teste', judicialUnit: 'Vara Teste',
      system: 'EPROC', processClass: 'Procedimento Teste', distributionDate: '2026-09-01', isSecret: true
    },
    parties: [], movements: snapshot.movements,
    provenance: { source: 'TJRS_PUBLIC', queryTimestamp: '2026-09-05T10:00:00.000Z', collectorVersion: 'test', queryKind: 'PROCESS_CNJ', sha256Payload: 'b'.repeat(64) },
    snapshotsCount: 1
  };
}

function responseJson(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, text: async () => JSON.stringify(payload) };
}
