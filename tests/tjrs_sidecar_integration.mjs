import assert from 'node:assert/strict';
import http from 'node:http';
import {
  TjrsSidecarClient,
  TjrsSidecarError,
  assertTjrsCnj,
  formatCnj,
  reconcileTjrsSnapshot
} from '../lib/judicial/tjrs-sidecar-client.mjs';
import { createTjrsSidecarHttpHandler } from '../lib/http/tjrs-sidecar-routes.mjs';
import { generateTotp } from '../lib/security.mjs';
import { runStateMigrations } from '../lib/state-migrations.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — CONTRATO DO SIDECAR TJRS');
console.log('===============================================================\n');

const CNJ = '50032803220268210404';
const FORMATTED_CNJ = '5003280-32.2026.8.21.0404';
const HASH = 'a'.repeat(64);
const MOVEMENT_HASH = 'b'.repeat(64);

const snapshotPayload = {
  cnj: CNJ,
  metadata: {
    cnj: CNJ,
    rawCnj: FORMATTED_CNJ,
    court: 'TJRS',
    district: 'Bento Gonçalves',
    districtCode: 404,
    judicialUnit: '1ª Vara Federal de Bento Gonçalves',
    system: 'EPROC',
    processClass: 'PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL',
    classCode: 436,
    subject: 'Danos materiais',
    subjectCode: 10433,
    distributionDate: '2026-08-12',
    isSecret: false,
    value: 15000
  },
  parties: [{
    name: 'CLIENTE SINTÉTICA ALFA',
    role: 'AUTOR',
    documentType: 'CPF',
    documentRedacted: '***.123.***-**',
    lawyers: [{ name: 'ADVOGADA SINTÉTICA TESTE', oabNumber: '999999', oabUf: 'RS' }]
  }, {
    name: 'EMPRESA ADVERSA SINTÉTICA',
    role: 'REU',
    lawyers: []
  }],
  movements: [{
    eventNumber: 12,
    sequenceNumber: 1,
    date: '2026-09-03T10:00:00.000Z',
    description: 'Intimação eletrônica expedida',
    cnjCode: 60,
    documentReferences: [],
    fingerprint: MOVEMENT_HASH
  }],
  movementCount: 1,
  provenance: {
    source: 'TJRS_PUBLIC',
    queryTimestamp: '2026-09-03T10:05:00.000Z',
    collectorVersion: '0.1.0',
    queryKind: 'PROCESS_CNJ',
    sha256Payload: HASH
  },
  snapshotsCount: 2
};

const diffPayload = {
  cnj: CNJ,
  diff: {
    cnj: CNJ,
    previousSnapshotTimestamp: '2026-09-02T10:05:00.000Z',
    currentSnapshotTimestamp: '2026-09-03T10:05:00.000Z',
    hasChanges: true,
    newMovements: snapshotPayload.movements,
    unchangedMovements: [],
    changedMovements: [],
    possiblyMissingMovements: []
  }
};

assert.equal(assertTjrsCnj(FORMATTED_CNJ), CNJ);
assert.equal(formatCnj(CNJ), FORMATTED_CNJ);
assert.throws(() => assertTjrsCnj('0000000-00.2026.4.04.0000'), error => error instanceof TjrsSidecarError && error.code === 'INVALID_CNJ');
assert.throws(() => new TjrsSidecarClient({ baseUrl: 'http://example.com:3100' }), /loopback/);

const requests = [];
const client = new TjrsSidecarClient({
  baseUrl: 'http://127.0.0.1:3100',
  fetchImpl: async url => {
    requests.push(String(url));
    if (url.pathname === '/health') return jsonResponse({ status: 'ok', database: 'connected', collectorVersion: '0.1.0', timestamp: '2026-09-03T10:06:00Z' });
    if (url.pathname.endsWith('/diff')) return jsonResponse(diffPayload);
    return jsonResponse(snapshotPayload);
  }
});
assert.deepEqual(await client.health(), { state: 'AVAILABLE', collectorVersion: '0.1.0', timestamp: '2026-09-03T10:06:00.000Z' });
const snapshot = await client.getProcess(FORMATTED_CNJ);
const diff = await client.getDiff(FORMATTED_CNJ);
assert.equal(requests.length, 3);
assert.equal(snapshot.metadata.cnj, CNJ);
assert.equal(snapshot.movements[0].source, 'TJRS_PUBLIC');
assert.equal(diff.newMovements.length, 1);

const manualProcess = {
  id: 'process-1',
  number: FORMATTED_CNJ,
  client: 'CLIENTE DEFINIDO MANUALMENTE',
  contactId: 'contact-manual',
  clientPosition: 'Réu / Ré',
  opposingParty: 'PARTE CONTRÁRIA MANUAL',
  court: 'Órgão definido manualmente',
  actionType: '',
  movements: [{ date: '2026-08-01', description: 'Anotação interna', source: 'Interna' }]
};
const first = reconcileTjrsSnapshot(manualProcess, snapshot, diff);
assert.equal(first.changed, true);
assert.equal(first.process.client, manualProcess.client, 'Cliente manual deve prevalecer.');
assert.equal(first.process.contactId, manualProcess.contactId, 'Vínculo manual deve prevalecer.');
assert.equal(first.process.opposingParty, manualProcess.opposingParty, 'Parte contrária manual deve prevalecer.');
assert.equal(first.process.court, manualProcess.court, 'Campo manual não vazio não pode ser sobrescrito.');
assert.equal(first.process.actionType, snapshot.metadata.processClass, 'Campo local vazio pode receber valor canônico.');
assert.equal(first.process.judicialParties.length, 2);
assert.equal(first.process.movements.length, 2);
assert.equal(first.process.lastMovement, 'Intimação eletrônica expedida');
assert.equal(first.process.tjrsCollector.payloadHash, HASH);
const second = reconcileTjrsSnapshot(first.process, snapshot, diff);
assert.equal(second.changed, false, 'Reimportar o mesmo snapshot deve ser idempotente.');
assert.deepEqual(second.process, first.process);

const offlineClient = new TjrsSidecarClient({ fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
await assert.rejects(() => offlineClient.health(), error => error instanceof TjrsSidecarError && error.code === 'UNAVAILABLE' && error.statusCode === 503);
const missingClient = new TjrsSidecarClient({ fetchImpl: async () => jsonResponse({ error: 'missing' }, 404) });
await assert.rejects(() => missingClient.getProcess(CNJ), error => error instanceof TjrsSidecarError && error.code === 'NOT_FOUND');

const routeState = {
  processes: [structuredClone(manualProcess)],
  audit: []
};
let savedState = null;
const route = createTjrsSidecarHttpHandler({
  client,
  assertAuthenticated: (_req, requireCsrf) => ({ username: 'ricardo', displayName: 'Ricardo', requireCsrf }),
  readJson: async req => req.body,
  readStateEnvelope: async () => ({ state: routeState, revision: 'revision-1' }),
  saveState: async (state, expectedRevision) => {
    assert.equal(expectedRevision, 'revision-1');
    savedState = state;
    return { revision: 'revision-2', updatedAt: '2026-09-03T10:07:00.000Z' };
  },
  json: (res, status, payload) => Object.assign(res, { status, payload })
});
const routeResponse = {};
assert.equal(await route({ method: 'POST', body: { processId: 'process-1', processNumber: FORMATTED_CNJ, revision: 'revision-1' } }, routeResponse, new URL('http://localhost/api/integrations/tjrs-sidecar/processes/sync')), true);
assert.equal(routeResponse.status, 200);
assert.equal(routeResponse.payload.revision, 'revision-2');
assert.equal(savedState.processes[0].client, manualProcess.client);
assert.equal(savedState.audit.length, 1);
assert.equal(savedState.audit[0].action, 'Snapshot TJRS importado');
assert.doesNotMatch(savedState.audit[0].detail, /CLIENTE SINTÉTICA|EMPRESA ADVERSA|ADVOGADA SINTÉTICA/, 'Auditoria deve minimizar PII.');

const mockSidecar = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (pathname === '/health') return sendJson(res, 200, { status: 'ok', database: 'connected', collectorVersion: '0.1.0', timestamp: '2026-09-03T10:06:00.000Z' });
  if (pathname === `/v1/processes/${CNJ}`) return sendJson(res, 200, snapshotPayload);
  if (pathname === `/v1/processes/${CNJ}/diff`) return sendJson(res, 200, diffPayload);
  return sendJson(res, 404, { error: 'not found' });
});
await new Promise((resolve, reject) => {
  mockSidecar.once('error', reject);
  mockSidecar.listen(0, '127.0.0.1', resolve);
});
const sidecarPort = mockSidecar.address().port;
const appServer = await startTestServer({ env: { ATRIUM_TJRS_SIDECAR_URL: `http://127.0.0.1:${sidecarPort}` } });
try {
  const auth = await setupMaster(appServer.baseUrl);
  const state = runStateMigrations({
    schemaVersion: 9,
    dataVersion: 9,
    processes: [structuredClone(manualProcess)],
    contacts: [{ id: 'contact-manual', name: manualProcess.client, contactRole: 'cliente' }],
    tasks: [],
    intimations: [],
    agenda: [],
    documents: [],
    leads: [],
    customPrompts: [],
    audit: [],
    settings: {},
    configuration: {}
  }, 'test').state;
  let response = await postJson(`${appServer.baseUrl}/api/state`, { state, revision: null }, auth.headers);
  assert.equal(response.status, 200);
  let revision = (await response.json()).revision;

  response = await fetch(`${appServer.baseUrl}/api/integrations/tjrs-sidecar/status`, { headers: { Cookie: auth.cookie } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).state, 'AVAILABLE');

  response = await postJson(`${appServer.baseUrl}/api/integrations/tjrs-sidecar/processes/sync`, {
    processId: manualProcess.id,
    processNumber: manualProcess.number,
    revision
  }, auth.headers);
  assert.equal(response.status, 200);
  let syncResult = await response.json();
  assert.equal(syncResult.idempotent, false);
  revision = syncResult.revision;
  assert.equal(syncResult.process.client, manualProcess.client);
  assert.equal(syncResult.process.contactId, manualProcess.contactId);

  response = await postJson(`${appServer.baseUrl}/api/integrations/tjrs-sidecar/processes/sync`, {
    processId: manualProcess.id,
    processNumber: manualProcess.number,
    revision
  }, auth.headers);
  assert.equal(response.status, 200);
  syncResult = await response.json();
  assert.equal(syncResult.idempotent, true);
  assert.equal(syncResult.revision, revision, 'Snapshot idempotente não pode trocar a revisão canônica.');

  response = await fetch(`${appServer.baseUrl}/api/state`, { headers: { Cookie: auth.cookie } });
  const persisted = await response.json();
  assert.equal(persisted.revision, revision);
  assert.equal(persisted.state.processes[0].client, manualProcess.client);
  assert.equal(persisted.state.processes[0].judicialParties.length, 2);
  assert.equal(persisted.state.audit.filter(item => item.action === 'Snapshot TJRS importado').length, 1);

  response = await fetch(`${appServer.baseUrl}/api/search?q=CLIENTE%20SINTÉTICA%20ALFA`, { headers: { Cookie: auth.cookie } });
  const search = await response.json();
  assert.equal(search.results.some(item => item.entityType === 'process' && item.id === manualProcess.id), true, 'Busca existente deve indexar as partes do snapshot.');
} finally {
  await appServer.stop();
  await new Promise(resolve => mockSidecar.close(resolve));
}

console.log('✓ Sidecar restrito ao loopback e contrato canônico validado.');
console.log('✓ Snapshot, diff, indisponibilidade e ausência têm estados explícitos.');
console.log('✓ Reconciliação preserva vínculo manual e é idempotente.');
console.log('✓ Rota persiste com revisão otimista e auditoria minimizada.\n');

function jsonResponse(payload, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    async text() { return JSON.stringify(payload); }
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

async function setupMaster(baseUrl) {
  let response = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'tjrs.master',
    password: 'Senha-Sintetica-TJRS-26!',
    displayName: 'Pessoa Teste TJRS'
  });
  assert.equal(response.status, 200);
  const setup = await response.json();
  response = await postJson(`${baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  assert.equal(response.status, 200);
  const verified = await response.json();
  const cookie = response.headers.get('set-cookie').split(';')[0];
  return {
    cookie,
    headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': verified.csrfToken }
  };
}
