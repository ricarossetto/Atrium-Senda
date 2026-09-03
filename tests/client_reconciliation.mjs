import assert from 'node:assert/strict';
import { applyClientReconciliation, isKnownClientName, normalizeProcessNumber } from '../js/core/client-reconciliation.js';

console.log('\nATRIUM — RECONCILIAÇÃO GLOBAL DE CLIENTES');

assert.equal(normalizeProcessNumber('5001234-56.2026.8.21.0001'), '50012345620268210001');
assert.equal(isKnownClientName('Cliente ainda não vinculado'), false);
assert.equal(isKnownClientName('Cliente não informado'), false);
assert.equal(isKnownClientName('Maria de Souza'), true);

const state = {
  contacts: [{ id: 'contact-maria', name: 'Maria de Souza', contactRole: 'cliente' }],
  processes: [{ id: 'process-maria', number: '5001234-56.2026.8.21.0001', client: 'Cliente ainda não vinculado' }],
  intimations: [{ id: 'int-maria', process: '50012345620268210001', client: '' }],
  tasks: [{ id: 'task-maria', processId: 'process-maria', client: '' }],
  agenda: [{ id: 'event-maria', process: '5001234-56.2026.8.21.0001', client: '' }],
  documents: [{ id: 'document-maria', process: '5001234-56.2026.8.21.0001' }],
  financial: [{ id: 'fee-maria', process: '5001234-56.2026.8.21.0001' }]
};

const result = applyClientReconciliation(state, [{
  processNumber: '5001234-56.2026.8.21.0001',
  clientName: 'Maria de Souza',
  contactId: 'contact-maria',
  confidence: 0.97,
  evidence: 'Maria de Souza — representada pelo advogado monitorado',
  model: 'gemini-test'
}]);

assert.deepEqual(result, { linkedProcesses: 1, updatedRecords: 6 });
assert.equal(state.processes[0].client, 'Maria de Souza');
assert.equal(state.processes[0].contactId, 'contact-maria');
for (const collection of ['intimations', 'tasks', 'agenda', 'documents', 'financial']) {
  assert.equal(state[collection][0].client, 'Maria de Souza', `${collection} deve receber o cliente canônico.`);
  assert.equal(state[collection][0].contactId, 'contact-maria', `${collection} deve receber o contato canônico.`);
}
assert.equal(state.tasks[0].process, '5001234-56.2026.8.21.0001');

const idempotentSnapshot = JSON.stringify(state);
assert.deepEqual(applyClientReconciliation(state, [{
  processNumber: '5001234-56.2026.8.21.0001',
  clientName: 'Maria de Souza',
  contactId: 'contact-maria',
  confidence: 0.97
}]), { linkedProcesses: 0, updatedRecords: 0 });
assert.equal(JSON.stringify(state), idempotentSnapshot, 'Repetir a reconciliação deve ser byte-equivalente.');

const rejected = applyClientReconciliation(state, [{ processNumber: '123', clientName: 'Pessoa Inventada' }]);
assert.deepEqual(rejected, { linkedProcesses: 0, updatedRecords: 0 });

const guardedState = {
  contacts: [
    { id: 'contact-client', name: 'Cliente Manual', contactRole: 'cliente' },
    { id: 'contact-opponent', name: 'Parte Contrária', contactRole: 'adverso' },
    { id: 'contact-lawyer', name: 'Advogado Monitorado', contactRole: 'correspondente' }
  ],
  processes: [
    { id: 'manual', number: '5000000-00.2026.8.21.0001', client: 'Cliente Manual', contactId: 'contact-client' },
    { id: 'manual-contact-only', number: '5000000-00.2026.8.21.0005', client: 'Cliente ainda não vinculado', contactId: 'contact-client' },
    { id: 'low-confidence', number: '5000000-00.2026.8.21.0002', client: 'Cliente ainda não vinculado' },
    { id: 'opponent', number: '5000000-00.2026.8.21.0003', client: 'Cliente ainda não vinculado' },
    { id: 'lawyer', number: '5000000-00.2026.8.21.0004', client: 'Cliente ainda não vinculado' }
  ]
};

assert.deepEqual(applyClientReconciliation(guardedState, [
  { processNumber: guardedState.processes[0].number, clientName: 'Outro Nome', confidence: 0.99 },
  { processNumber: guardedState.processes[1].number, clientName: 'Outro Nome', confidence: 0.99 },
  { processNumber: guardedState.processes[2].number, clientName: 'Candidata Incerta', confidence: 0.89 },
  { processNumber: guardedState.processes[3].number, clientName: 'Parte Contrária', contactId: 'contact-opponent', confidence: 0.99 },
  { processNumber: guardedState.processes[4].number, clientName: 'Advogado Monitorado', contactId: 'contact-lawyer', confidence: 0.99 }
]), { linkedProcesses: 0, updatedRecords: 0 });
assert.equal(guardedState.processes[0].client, 'Cliente Manual', 'Vínculo manual deve prevalecer.');
assert.equal(guardedState.processes[1].client, 'Cliente ainda não vinculado', 'Contato manual deve prevalecer mesmo sem nome canônico preenchido.');
assert.equal(guardedState.processes[2].client, 'Cliente ainda não vinculado', 'Confiança abaixo de 90% deve ser rejeitada.');
assert.equal(guardedState.processes[3].client, 'Cliente ainda não vinculado', 'Parte contrária não pode virar cliente.');
assert.equal(guardedState.processes[4].client, 'Cliente ainda não vinculado', 'Advogado não pode virar cliente.');

console.log('✓ Cliente confirmado propagado para processo, publicação, Kanban, agenda, documentos e financeiro.');
