/**
 * Test Suite: Eproc National Registry Integrity
 *
 * Verifies that the National Eproc Portal Registry has no duplicate IDs,
 * valid court codes, valid HTTPS URLs, evidence links, and coverage notes.
 */

import assert from 'node:assert/strict';
import {
  EPROC_PORTALS,
  EPROC_STATUS,
  EPROC_BRANCH,
  getEprocPortalById,
  listEprocPortals,
  getCandidateEprocPortalsForCnj
} from '../lib/judicial/eproc/portal-registry.mjs';

console.log('=== TESTE DE INTEGRIDADE DO REGISTRY EPROC NACIONAL ===\n');

// 1. Ausência de IDs duplicados
const seenIds = new Set();
for (const portal of EPROC_PORTALS) {
  assert.ok(portal.id, 'Portal deve possuir id definido');
  assert.ok(!seenIds.has(portal.id), `ID duplicado detectado no registry: ${portal.id}`);
  seenIds.add(portal.id);

  // 2. Validação de Court Code (formato J.TR, ex: 4.04, 8.21, 8.26)
  assert.match(portal.courtCode, /^\d\.\d{2}$/, `Court code inválido em ${portal.id}: ${portal.courtCode}`);

  // 3. Validação de URLs
  assert.ok(portal.baseUrl.startsWith('https://'), `baseUrl deve ser HTTPS em ${portal.id}`);
  assert.ok(portal.controllerPath, `controllerPath obrigatório em ${portal.id}`);
  assert.ok(portal.loginPath, `loginPath obrigatório em ${portal.id}`);

  // 4. Validação de Ramo e Grau
  assert.ok(Object.values(EPROC_BRANCH).includes(portal.branch), `Branch inválido em ${portal.id}`);
  assert.ok([1, 2, 'recursais'].includes(portal.level), `Level inválido em ${portal.id}`);

  // 5. Validação de Status e Evidência
  assert.ok(Object.values(EPROC_STATUS).includes(portal.status), `Status inválido em ${portal.id}`);
  assert.ok(Array.isArray(portal.evidence) && portal.evidence.length > 0, `Evidência obrigatória em ${portal.id}`);

  // 6. Tribunais com implantação parcial ou piloto devem ter cobertura explicada
  if ([EPROC_STATUS.PARTIAL, EPROC_STATUS.PILOT].includes(portal.status)) {
    assert.ok(portal.coverage?.scope, `Portal parcial ${portal.id} deve declarar coverage.scope`);
    assert.ok(portal.coverage?.notes, `Portal parcial ${portal.id} deve declarar coverage.notes`);
  }
}

// 7. Teste de funções de busca e normalização oficial
const canonical6 = [
  'tjrs-eproc-1g',
  'tjrs-eproc-2g',
  'jfrs-eproc-1g',
  'jfsc-eproc-1g',
  'jfpr-eproc-1g',
  'trf4-eproc-2g'
];

for (const id of canonical6) {
  const portal = getEprocPortalById(id);
  assert.ok(portal, `Portal oficial ${id} deve existir no registry`);
  assert.equal(portal.id, id, `ID deve ser oficial: ${id}`);
}

// Validação de aliases e rejeição de typos
assert.equal(getEprocPortalById('eproc-tjrs-1g')?.id, 'tjrs-eproc-1g');
assert.equal(getEprocPortalById('eproc-jfsc-1g')?.id, 'jfsc-eproc-1g');
assert.equal(getEprocPortalById('eproc-jfpr-1g')?.id, 'jfpr-eproc-1g');
assert.equal(getEprocPortalById('eproc-jfrs-1g')?.id, 'jfrs-eproc-1g');
assert.equal(getEprocPortalById('eproc-trf4-2g')?.id, 'trf4-eproc-2g');
assert.equal(getEprocPortalById('typo-arbitrario-1g'), null, 'Typo arbitrário deve retornar null');

const jfrs = getEprocPortalById('jfrs-eproc-1g');
assert.ok(jfrs, 'getEprocPortalById deve localizar jfrs-eproc-1g');
assert.equal(jfrs.court, 'JFRS');

const federalPortals = listEprocPortals({ branch: EPROC_BRANCH.FEDERAL });
assert.ok(federalPortals.length >= 9, 'Deve listar todos os portais federais (TRF4, TRF2, TRF6)');

const candidates4R = getCandidateEprocPortalsForCnj('5001234-56.2024.4.04.7100');
assert.ok(candidates4R.some(p => p.id === 'jfrs-eproc-1g'), 'Candidatos 4.04 devem incluir JFRS');
assert.ok(candidates4R.some(p => p.id === 'trf4-eproc-2g'), 'Candidatos 4.04 devem incluir TRF4');

console.log(`✓ 100% dos ${EPROC_PORTALS.length} portais validados: zero duplicatas, 6 portais oficiais ativos, URLs HTTPS oficiais e evidências documentadas.`);

