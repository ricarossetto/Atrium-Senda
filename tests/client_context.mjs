import assert from 'node:assert/strict';
import { buildClientContext } from '../js/core/client-context.js';

console.log('\nATRIUM — CONTEXTO JURÍDICO DERIVADO DO CONTATO');

const state = {
  contacts: [
    { id: 'contact-client', name: 'Cliente Sintética', contactRole: 'cliente', relatedProcessNumbers: ['5000000-00.2026.8.21.0002'] },
    { id: 'contact-adverse', name: 'Parte Adversa Sintética', contactRole: 'adverso' }
  ],
  processes: [
    { id: 'process-canonical', number: '5000000-00.2026.8.21.0001', client: 'Cliente Sintética', contactId: 'contact-client', actionType: 'Ação sintética', createdAt: '2026-08-01', feeType: 'fixo', feeAmount: 1000 },
    { id: 'process-registered', number: '5000000-00.2026.8.21.0002', client: 'Cliente ainda não vinculado', createdAt: '2026-08-02' },
    { id: 'process-name-only', number: '5000000-00.2026.8.21.0003', client: 'Cliente Sintética', createdAt: '2026-08-03' },
    { id: 'process-adverse', number: '5000000-00.2026.8.21.0004', client: 'Outra Pessoa', contactId: 'contact-adverse', createdAt: '2026-08-04' }
  ],
  tasks: [
    { id: 'task-linked', processId: 'process-canonical', title: 'Providência sintética', status: 'andamento', deadline: '2026-09-10', createdAt: '2026-08-10' },
    { id: 'task-direct', contactId: 'contact-client', title: 'Contato direto sintético', status: 'concluida', createdAt: '2026-08-09' },
    { id: 'task-name-only', client: 'Cliente Sintética', title: 'Não vincular por nome', status: 'andamento' }
  ],
  intimations: [{ id: 'pub-linked', process: '50000000020268210001', title: 'Publicação sintética', publishedAt: '2026-08-08' }],
  agenda: [{ id: 'agenda-linked', processId: 'process-registered', title: 'Audiência sintética', date: '2026-09-20' }],
  documents: [
    { id: 'doc-contact', ownerType: 'contact', ownerId: 'contact-client', name: 'Documento do contato', createdAt: '2026-08-07' },
    { id: 'doc-process', ownerType: 'process', ownerId: 'process-canonical', name: 'Documento do processo', createdAt: '2026-08-06' }
  ],
  financial: [{ id: 'financial-linked', processId: 'process-registered', title: 'Lançamento sintético' }],
  audit: []
};

const before = JSON.stringify(state);
const context = buildClientContext(state, state.contacts[0]);
assert.equal(JSON.stringify(state), before, 'A projeção de CRM deve ser estritamente derivada e não mutar o estado.');
assert.deepEqual(context.processes.map(item => item.id), ['process-canonical', 'process-registered']);
assert.equal(context.processes[0].contextRelationship, 'canonical-client');
assert.equal(context.processes[1].contextRelationship, 'registered-contact');
assert.equal(context.processes.some(item => item.id === 'process-name-only'), false, 'Coincidência de nome não pode criar vínculo.');
assert.deepEqual(context.tasks.map(item => item.id), ['task-linked', 'task-direct']);
assert.deepEqual(context.publications.map(item => item.id), ['pub-linked']);
assert.deepEqual(context.appointments.map(item => item.id), ['agenda-linked']);
assert.deepEqual(context.documents.map(item => item.id), ['doc-contact', 'doc-process']);
assert.deepEqual(context.financialRecords.map(item => item.id), ['financial-linked']);
assert.deepEqual(context.financialProcesses.map(item => item.id), ['process-canonical']);
assert.deepEqual(context.metrics, { processes: 2, openTasks: 1, publications: 1, appointments: 1, documents: 2, financial: 2 });
assert.equal(context.nextDeadline, '2026-09-10');
assert.ok(context.timeline.some(item => item.type === 'publication' && item.entityId === 'pub-linked'));
assert.ok(context.timeline.some(item => item.type === 'financial' && item.processId === 'process-canonical'));

const adverse = buildClientContext(state, state.contacts[1]);
assert.deepEqual(adverse.processes.map(item => item.id), ['process-adverse']);
assert.equal(adverse.processes[0].contextRelationship, 'registered-contact', 'Parte adversa deve preservar seu papel e jamais ser apresentada como cliente.');
assert.equal(adverse.role, 'adverso');

const missing = buildClientContext(state, null);
assert.equal(missing.metrics.processes, 0);

console.log('✓ CRM deriva processos, providências, publicações, agenda, documentos e financeiro sem inferência por nome.');
