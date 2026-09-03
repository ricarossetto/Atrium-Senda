import assert from 'node:assert/strict';
import { acknowledgeActivity, buildActivityInbox } from '../js/core/activity-inbox.js';

console.log('\n===============================================================');
console.log('  ATRIUM — ACTIVITY INBOX DERIVADA');
console.log('===============================================================\n');

const state = {
  settings: {},
  processes: [{
    id: 'process-synthetic',
    number: '5000000-00.2026.8.21.0001',
    client: 'Cliente Sintética',
    lastMovement: 'Movimentação meramente informativa',
    tjrsCollector: {
      status: 'AVAILABLE',
      syncedAt: '2026-09-03T12:00:00.000Z',
      payloadHash: 'c'.repeat(64),
      diff: { hasChanges: true, newMovements: 1, changedMovements: 0, possiblyMissingMovements: 0 }
    }
  }],
  intimations: [
    { id: 'publication-new', title: 'Publicação sintética', process: '5000000-00.2026.8.21.0001', unread: true, treatmentStatus: 'untreated', publishedAt: '2026-09-03', source: 'DJEN Sintético' },
    { id: 'publication-done', title: 'Publicação tratada', treatmentStatus: 'treated', publishedAt: '2026-09-03' }
  ],
  tasks: [
    { id: 'task-overdue', title: 'Revisão vencida', processId: 'process-synthetic', status: 'andamento', deadline: '2026-09-01' },
    { id: 'task-upcoming', title: 'Conferência próxima', process: '5000000-00.2026.8.21.0001', status: 'triagem', fatalDeadline: '2026-09-05', intimationId: 'publication-new' },
    { id: 'task-later', title: 'Atividade futura', status: 'triagem', deadline: '2026-10-10' },
    { id: 'task-done', title: 'Atividade concluída', status: 'concluida', deadline: '2026-09-01' }
  ],
  agenda: [{ id: 'agenda-near', title: 'Audiência sintética', date: '2026-09-06', processId: 'process-synthetic' }],
  documents: [
    { id: 'doc-review', originalName: 'documento-sintetico.pdf', ownerType: 'process', ownerId: 'process-synthetic', documentType: '', createdAt: '2026-09-02' },
    { id: 'doc-metadata-review', originalName: 'metadata-pendente.pdf', documentType: 'Contrato', metadata: { classificationStatus: 'unclassified' }, createdAt: '2026-09-02' },
    { id: 'doc-ready', originalName: 'classificado.pdf', documentType: 'Petição', createdAt: '2026-09-02' }
  ],
  clientReconciliationSuggestions: [{ id: 'suggestion-1', processId: 'process-synthetic', clientName: 'Contato sintético', confidence: 0.93, status: 'pending', source: 'Regra sintética', createdAt: '2026-09-02' }],
  sources: [
    { id: 'source-error', name: 'Fonte sintética', method: 'Sidecar local', status: 'error', detail: 'Sem resposta', lastCheck: '2026-09-03T11:00:00.000Z' },
    { id: 'source-ok', name: 'Fonte saudável', status: 'ok', lastCheck: '2026-09-03T11:00:00.000Z' }
  ]
};

const items = buildActivityInbox(state, { now: new Date(2026, 8, 3, 14, 0, 0) });
assert.equal(items.filter(item => item.key === 'publication:publication-new').length, 1, 'Publicação nova/não tratada não pode duplicar.');
assert.equal(items.some(item => item.key === 'publication:publication-done'), false);
assert.equal(items.some(item => item.key === 'task:task-later'), false);
assert.equal(items.some(item => item.key === 'task:task-done'), false);
assert.equal(items.find(item => item.key === 'task:task-overdue').priority, 3);
assert.equal(items.find(item => item.key === 'task:task-upcoming').origin, 'Publicação vinculada');
assert.equal(items.some(item => item.key === 'agenda:agenda-near'), true);
assert.equal(items.some(item => item.key === 'document:doc-review'), true);
assert.equal(items.some(item => item.key === 'document:doc-metadata-review'), true, 'Classificação canônica aninhada deve alimentar a mesma caixa de atividades.');
assert.equal(items.some(item => item.key === 'document:doc-ready'), false);
assert.equal(items.some(item => item.key === 'reconciliation:suggestion-1'), true);
assert.equal(items.some(item => item.key === 'collector:process-synthetic'), true);
assert.equal(items.some(item => item.key === 'source:source-error'), true);
assert.equal(items.some(item => item.key === 'source:source-ok'), false);
assert.equal(items.every(item => item.origin && item.type && item.context && item.entityType && item.actionLabel), true);
assert.equal(items.some(item => item.type === 'judicial-event' && /prazo/i.test(item.title)), false, 'Movimentação não pode virar prazo por inferência.');

const collectorItem = items.find(item => item.key === 'collector:process-synthetic');
assert.equal(acknowledgeActivity(state, collectorItem), true);
assert.equal(acknowledgeActivity(state, collectorItem), false, 'Reconhecer a mesma versão deve ser idempotente.');
const afterAcknowledge = buildActivityInbox(state, { now: new Date(2026, 8, 3, 14, 0, 0) });
assert.equal(afterAcknowledge.some(item => item.key === collectorItem.key), false);
state.processes[0].tjrsCollector.payloadHash = 'd'.repeat(64);
const afterNewSnapshot = buildActivityInbox(state, { now: new Date(2026, 8, 3, 14, 0, 0) });
assert.equal(afterNewSnapshot.some(item => item.key === collectorItem.key), true, 'Nova evidência deve reaparecer na caixa.');

console.log('✓ Caixa agrega fatos reais sem duplicar estruturas canônicas.');
console.log('✓ Prioridade decorre de datas/status objetivos, sem score jurídico por IA.');
console.log('✓ Eventos judiciais e falhas podem ser reconhecidos por versão.\n');
