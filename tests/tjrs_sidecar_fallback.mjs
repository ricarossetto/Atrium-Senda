import assert from 'node:assert/strict';
import { createTjrsSidecarHttpHandler } from '../lib/http/tjrs-sidecar-routes.mjs';
import { TjrsSidecarError } from '../lib/judicial/tjrs-sidecar-client.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — TESTE DE FALLBACK DO SIDECAR TJRS & CADERNO PDF');
console.log('===============================================================\n');

const CNJ = '50012345620268210001';
const FORMATTED_CNJ = '5001234-56.2026.8.21.0001';

// Mock client that returns NOT_FOUND (simulates sidecar having no snapshot cached)
const notFoundClient = {
  async health() { return { state: 'AVAILABLE' }; },
  async getProcess() {
    throw new TjrsSidecarError('Ainda não há snapshot local para este processo no coletor TJRS.', {
      code: 'NOT_FOUND',
      statusCode: 404
    });
  },
  async getDiff() {
    throw new TjrsSidecarError('Diff não encontrado.', { code: 'NOT_FOUND', statusCode: 404 });
  }
};

const processWithJudicialMovements = {
  id: 'proc-1',
  number: FORMATTED_CNJ,
  client: 'CLIENTE TESTE',
  court: 'TJRS',
  judicialMovements: [
    { date: '2026-09-01', description: 'Distribuição do processo' },
    { date: '2026-09-04', description: 'Conclusão para despacho' }
  ]
};

const processEmpty = {
  id: 'proc-2',
  number: '5009999-99.2026.8.21.0001',
  client: 'CLIENTE VAZIO',
  court: 'TJRS'
};

const state = {
  processes: [processWithJudicialMovements, processEmpty],
  documents: [],
  audit: []
};

let savedState = null;
const storedBlobs = new Map();

const handler = createTjrsSidecarHttpHandler({
  client: notFoundClient,
  assertAuthenticated: () => ({ username: 'adv_teste' }),
  readJson: async req => req.body,
  readStateEnvelope: async () => ({ state, revision: 'rev-1' }),
  saveState: async (newState) => { savedState = newState; return { revision: 'rev-2', updatedAt: new Date().toISOString() }; },
  documentStorage: {
    async put(binary) {
      const checksum = 'mock-hash-' + Math.random();
      storedBlobs.set(checksum, binary);
      return { checksum };
    }
  },
  credentialManager: null,
  json: (res, status, payload) => Object.assign(res, { status, payload })
});

// Test 1: preview with NOT_FOUND returns false (falls back to Omni)
const resPreview = {};
const handledPreview = await handler(
  { method: 'POST', body: { processNumber: FORMATTED_CNJ } },
  resPreview,
  new URL('http://localhost/api/integrations/tjrs-sidecar/processes/preview')
);
assert.equal(handledPreview, false, 'Preview deve retornar false em NOT_FOUND para acionar fallback Omni');
console.log('✓ Teste 1: preview com NOT_FOUND retorna false para delegar ao Omni.');

// Test 2: sync with NOT_FOUND returns false (falls back to Omni)
const resSync = {};
const handledSync = await handler(
  { method: 'POST', body: { processId: 'proc-1', processNumber: FORMATTED_CNJ, revision: 'rev-1' } },
  resSync,
  new URL('http://localhost/api/integrations/tjrs-sidecar/processes/sync')
);
assert.equal(handledSync, false, 'Sync deve retornar false em NOT_FOUND para acionar fallback Omni');
console.log('✓ Teste 2: sync com NOT_FOUND retorna false para delegar ao Omni.');

// Test 3: download-autos succeeds even if sidecar has no snapshot, using local judicialMovements
const resAutos = {};
const handledAutos = await handler(
  { method: 'POST', body: { processId: 'proc-1', processNumber: FORMATTED_CNJ, revision: 'rev-1' } },
  resAutos,
  new URL('http://localhost/api/integrations/tjrs-sidecar/processes/download-autos')
);
assert.equal(handledAutos, true);
assert.equal(resAutos.status, 200, 'download-autos deve responder 200 usando dados locais');
assert.equal(resAutos.payload.ok, true);
assert.equal(resAutos.payload.totalPieces, 2);
console.log('✓ Teste 3: download-autos compila PDFs derivados com sucesso a partir de judicialMovements locais.');

// Test 4: download-autos for empty process returns 422 with clear guidance
try {
  const resEmptyAutos = {};
  await handler(
    { method: 'POST', body: { processId: 'proc-2', processNumber: '5009999-99.2026.8.21.0001', revision: 'rev-1' } },
    resEmptyAutos,
    new URL('http://localhost/api/integrations/tjrs-sidecar/processes/download-autos')
  );
  assert.fail('Deveria ter lançado erro 422');
} catch (error) {
  assert.equal(error.statusCode, 422);
  assert.match(error.message, /Atualizar TJRS/);
  console.log('✓ Teste 4: download-autos sem andamentos orienta o usuário a usar "Atualizar TJRS".');
}

console.log('\n===============================================================');
console.log('  TODOS OS TESTES DE FALLBACK E CADERNO PDF PASSARAM COM SUCESSO!');
console.log('===============================================================\n');
