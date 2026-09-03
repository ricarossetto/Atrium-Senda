import assert from 'node:assert/strict';
import { buildLegalTimeline } from '../js/core/legal-timeline.js';

const process = {
  id: 'process-timeline', number: '5000000-00.2026.8.21.0001', registeredAt: '2026-08-01',
  source: 'Cadastro sintético', feeStatus: 'em_dia', updatedAt: '2026-08-31T09:00:00.000Z',
  movements: [{ id: 'movement-one', date: '2026-08-30T10:00:00.000Z', description: 'Movimentação sintética', source: 'TJRS_PUBLIC' }],
  expenses: [{ id: 'expense-one', date: '2026-08-29', description: 'Despesa sintética', amount: 125.5 }]
};
const state = {
  processes: [process],
  intimations: [{ id: 'publication-one', processId: process.id, publishedAt: '2026-09-01', title: 'Publicação sintética', treatmentStatus: 'in_review' }],
  tasks: [{ id: 'task-one', process: process.number, createdAt: '2026-08-28', deadline: '2026-09-05', title: 'Tarefa sintética', status: 'triagem' }],
  agenda: [{ id: 'agenda-one', processNumber: process.number, date: '2026-09-04', time: '15:00', title: 'Compromisso sintético' }],
  documents: [{ id: 'document-one', ownerType: 'process', ownerId: process.id, createdAt: '2026-08-27', name: 'documento-sintetico.pdf', documentType: 'Petição' }],
  audit: [
    { id: 'audit-one', processId: process.id, at: '2026-08-26', action: 'Revisão sintética', actor: 'Pessoa Teste' },
    { id: 'audit-unrelated', at: '2026-09-03', action: 'Evento de outro processo', detail: '5009999-00.2026.8.21.0001' }
  ]
};

const timeline = buildLegalTimeline(state, process);
assert.deepEqual(new Set(timeline.map(event => event.type)), new Set(['process', 'movement', 'publication', 'task', 'deadline', 'appointment', 'document', 'financial', 'audit']));
assert.equal(timeline[0].id, 'deadline:task-one', 'Eventos devem ser ordenados pela data mais recente.');
assert.equal(timeline.find(event => event.id === 'publication:publication-one').target, 'publication');
assert.equal(timeline.find(event => event.id === 'task:task-one:created').target, 'task');
assert.equal(timeline.find(event => event.id === 'appointment:agenda-one').target, 'agenda');
assert.equal(timeline.find(event => event.id === 'document:document-one').target, 'document');
assert.equal(timeline.find(event => event.id === 'financial:process-timeline:expense:expense-one').detail, 'R$ 125,50');
assert.equal(timeline.some(event => event.id === 'audit:audit-unrelated'), false, 'Auditoria de outro processo não pode contaminar a linha do tempo.');
assert.equal(buildLegalTimeline(state, process, { limit: 3 }).length, 3);
assert.deepEqual(buildLegalTimeline(null, process), []);
assert.equal(buildLegalTimeline({ tasks: [{ id: 'unlinked', title: 'Sem vínculo' }], audit: [{ id: 'unlinked-audit', action: 'Sem vínculo' }] }, { number: '5001111-00.2026.8.21.0001' }).some(event => /unlinked/.test(event.id)), false, 'Processo sem ID não pode capturar registros também sem vínculo.');

console.log('Linha do tempo jurídica aprovada: derivação canônica, ordenação, escopo e destinos navegáveis.');
