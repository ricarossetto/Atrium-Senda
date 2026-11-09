import assert from 'node:assert/strict';
import { applyPlan, planWorkspace } from '../scripts/dedupe-contacts.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — DEDUPE CONTACTS PLAN');
console.log('===============================================================\n');

function isaadoraLike(id, extra = {}) {
  return { id, name: 'Isadora Cristina Valdemeri da Silva', contactRole: 'cliente', registeredAt: '2026-01-01', ...extra };
}

const state = {
  contacts: [
    ...Array.from({ length: 10 }, (_, i) => isaadoraLike(`isa-${i}`, { relatedProcessNumbers: [`P${i}`] })),
    { id: 'moi-1', name: 'Moises Santos da Silveira', relatedProcessNumbers: ['5000001-11.2026.8.21.0001'] },
    { id: 'moi-2', name: 'Moises  Santos  da Silveira', relatedProcessNumbers: ['5000001-11.2026.8.21.0001'] },
    { id: 'hom-1', name: 'Maria Silva' },
    { id: 'hom-2', name: 'MARIA SILVA' },
    { id: 'doc-1', name: 'Carlos', document: '000.000.001-91' },
    { id: 'doc-2', name: 'Carlos E.', document: '00000000191' }
  ],
  processes: [{ id: 'p1', contactId: 'isa-3' }],
  tasks: [],
  agenda: [],
  events: [],
  documents: [],
  audit: []
};

const plan = planWorkspace(state);
assert.equal(plan.total, 16);
// Isadoras sem documento e sem vínculo compartilhado: revisão (homônimos protegidos).
const isaGroup = plan.reviewGroups.find(group => group.key === 'name:isadora cristina valdemeri da silva');
assert.ok(isaGroup, 'Grupo Isadora deve existir para revisão.');
assert.equal(isaGroup.size, 10);
// Moisés com espaço duplo + mesmo processo: automático por nome+vínculo.
const moiGroup = plan.autoGroups.find(group => group.key === 'name:moises santos da silveira');
assert.ok(moiGroup, 'Grupo Moisés deve fundir por nome+vínculo.');
assert.equal(moiGroup.size, 2);
assert.equal(moiGroup.basis, 'nome+vínculo');
// Mesmo documento: automático.
const docGroup = plan.autoGroups.find(group => group.key === 'doc:00000000191');
assert.ok(docGroup, 'Grupo por documento deve fundir.');
assert.equal(plan.autoRemoveCount, 2);
assert.equal(plan.refsToMove, 0);

const applied = applyPlan(state, plan);
assert.equal(applied.removed, 2);
assert.equal(state.contacts.length, 14);
assert.ok(state.contacts.some(c => c.id === 'moi-1' || c.id === 'moi-2'));
assert.ok(state.contacts.some(c => c.id === 'doc-1' || c.id === 'doc-2'));
assert.equal(state.contacts.filter(c => c.name === 'Maria Silva' || c.name === 'MARIA SILVA').length, 2, 'Homônimos intactos.');

// Religação move referência do removido.
const state2 = {
  contacts: [
    { id: 'k', name: 'Ana', document: '111', registeredAt: '2026-01-01' },
    { id: 'l', name: 'Ana ', document: '111', registeredAt: '2026-02-01' }
  ],
  processes: [{ id: 'p9', contactId: 'l' }],
  tasks: [],
  agenda: [],
  events: [],
  documents: [],
  audit: []
};
const plan2 = planWorkspace(state2);
assert.equal(plan2.autoRemoveCount, 1);
const applied2 = applyPlan(state2, plan2);
assert.equal(applied2.moved, 1);
assert.equal(state2.processes[0].contactId, 'k');
assert.equal(state2.contacts.length, 1);

console.log('✓ Plano classifica, protege homônimos, funde por documento/vínculo e religa referências.');
