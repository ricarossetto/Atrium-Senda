/**
 * Test Suite: Eproc Core Contract & Read-Only Safeguards
 *
 * Verifies that the EprocReadOnlyAdapter and all court profiles strictly
 * satisfy ATRIUM's ManagedJudicialConnectivity contracts and forbid all write operations.
 */

import assert from 'node:assert/strict';
import { EprocReadOnlyAdapter, EPROC_PORTALS } from '../lib/judicial/eproc/index.mjs';
import { PORTAL_CAPABILITIES, FORBIDDEN_JUDICIAL_OPERATIONS } from '../lib/judicial/managed-connectivity.mjs';

console.log('=== TESTE DE CONTRATO READ-ONLY EPROC CORE ===\n');

for (const portal of EPROC_PORTALS) {
  const adapter = new EprocReadOnlyAdapter(portal);

  // 1. Deve declarar modo somente leitura
  assert.equal(adapter.readOnly, true, `Portal ${portal.id} deve ter readOnly === true`);
  assert.equal(adapter.isReadOnly, true, `Portal ${portal.id} deve ter isReadOnly === true`);

  // 2. Deve implementar todas as capabilities obrigatórias
  for (const cap of PORTAL_CAPABILITIES) {
    assert.equal(typeof adapter[cap], 'function', `Portal ${portal.id} deve implementar ${cap}()`);
  }

  // 3. Deve implementar métodos de leitura complementares
  assert.equal(typeof adapter.fetchCase, 'function', `Portal ${portal.id} deve implementar fetchCase()`);
  assert.equal(typeof adapter.fetchDeadlines, 'function', `Portal ${portal.id} deve implementar fetchDeadlines()`);
  assert.equal(typeof adapter.fetchDocuments, 'function', `Portal ${portal.id} deve implementar fetchDocuments()`);

  // 4. É EXPRESSAMENTE PROIBIDO expor operações de escrita/peticionamento
  for (const forbidden of FORBIDDEN_JUDICIAL_OPERATIONS) {
    assert.equal(adapter[forbidden], undefined, `Portal ${portal.id} NÃO PODE expor ${forbidden}()`);
  }
}

console.log(`✓ 100% dos ${EPROC_PORTALS.length} portais eproc cumprem o contrato read-only e bloqueiam operações proibidas.`);
