import assert from 'node:assert/strict';
import {
  contactGroupKey,
  findStrongDuplicateIndexes,
  mergeDuplicateGroup,
  normalizeContactDocument,
  normalizeContactName,
  pickKeeperIndex,
  rewireContactReferences
} from '../js/core/contact-identity.js';

console.log('\n===============================================================');
console.log('  ATRIUM — CONTACT IDENTITY CANONICAL MODULE');
console.log('===============================================================\n');

// Normalização: caixa, acentos e espaços internos (incluindo NBSP e tabs).
assert.equal(normalizeContactName('  ISADORA  CRISTINA\tValdemeri\u00a0da SILVA  '), 'isadora cristina valdemeri da silva');
assert.equal(normalizeContactName('João'), 'joao');
assert.equal(normalizeContactName('D’Ávila').includes('’'), true, 'Apóstrofo U+2019 é preservado como no comportamento atual.');
assert.equal(normalizeContactName(null), '');
assert.equal(normalizeContactDocument('000.000.001-91'), '00000000191');
assert.equal(normalizeContactDocument(' 12.345.678/0001-90 '), '12345678000190');
assert.equal(normalizeContactDocument(null), '');

// Chave de grupo: documento vence; sem documento, nome; vazio sem nome.
assert.equal(contactGroupKey({ document: '000.000.001-91' }), 'doc:00000000191');
assert.equal(contactGroupKey({ cpf: '000.000.001-91', name: 'Outro Nome' }), 'doc:00000000191');
assert.equal(contactGroupKey({ externalId: 'datajud:party:9', name: 'X' }), 'ext:datajud:party:9');
assert.equal(contactGroupKey({ name: 'Maria  Silva' }), 'name:maria silva');
assert.equal(contactGroupKey({}), '');

// Duplicados fortes: 2+ com mesmo documento ou externalId.
const dupes = [
  { id: 'a', name: 'Isadora', document: '111', registeredAt: '2026-01-02' },
  { id: 'b', name: 'ISADORA ', document: '111', registeredAt: '2026-01-01' },
  { id: 'c', name: 'Outra Pessoa', document: '222', registeredAt: '2026-01-03' }
];
assert.deepEqual(findStrongDuplicateIndexes(dupes, { document: '111' }), [0, 1]);
assert.deepEqual(findStrongDuplicateIndexes(dupes, { document: '222' }), []);
assert.deepEqual(findStrongDuplicateIndexes(dupes, { document: '999' }), []);
assert.deepEqual(findStrongDuplicateIndexes([{ id: 'x', externalId: 'e:1' }, { id: 'y', externalId: 'e:1' }], { externalId: 'e:1' }), [0, 1]);
// Nome igual sem documento NÃO é forte (homônimos protegidos).
assert.deepEqual(findStrongDuplicateIndexes([{ id: 'x', name: 'Maria' }, { id: 'y', name: 'Maria' }], { name: 'Maria' }), []);

// Guardião: mais antigo; sem data perde; determinístico.
assert.equal(pickKeeperIndex(dupes, [0, 1]), 1);
assert.equal(pickKeeperIndex([{ id: 'x' }, { id: 'y', registeredAt: '2026-01-01' }], [0, 1]), 1);

// Mesclagem: preenche lacunas, une vínculos, preserva id/data do guardião.
const merged = mergeDuplicateGroup(
  [
    { id: 'old', name: 'Isadora', document: '111', mobile: '', relatedProcessNumbers: ['P1'], source: 'Planilha', registeredAt: '2026-01-01' },
    { id: 'new', name: 'ISADORA  CRISTINA', mobile: '(51) 90000-0001', relatedProcessNumbers: ['P2'], source: 'eproc TJRS', registeredAt: '2026-02-01' }
  ],
  [0, 1]
);
assert.equal(merged.keeper.id, 'old');
assert.equal(merged.keeper.mobile, '(51) 90000-0001');
assert.deepEqual(merged.keeper.relatedProcessNumbers.sort(), ['P1', 'P2']);
assert.ok(merged.keeper.source.includes('Planilha') && merged.keeper.source.includes('eproc TJRS'));
assert.deepEqual(merged.removedIds, ['new']);
assert.ok(Date.parse(merged.keeper.updatedAt));

// Religação move todas as referências conhecidas e conta.
const state = {
  processes: [{ id: 'p1', contactId: 'new' }, { id: 'p2', contactId: 'old' }],
  tasks: [{ id: 't1', contactId: 'new', clientContactId: 'new' }],
  agenda: [{ id: 'a1', contactId: 'new' }],
  events: [],
  documents: [{ id: 'd1', ownerType: 'contact', ownerId: 'new' }, { id: 'd2', contactId: 'new' }]
};
assert.equal(rewireContactReferences(state, 'old', ['new']), 6);
assert.equal(state.processes[0].contactId, 'old');
assert.equal(state.tasks[0].clientContactId, 'old');
assert.equal(state.documents[0].ownerId, 'old');
assert.equal(rewireContactReferences(state, 'old', ['ghost']), 0);

console.log('✓ Identidade oficial: normalização, chaves, fortes, guardião, mesclagem e religação.');
