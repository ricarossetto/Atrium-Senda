import assert from 'node:assert/strict';
import test from 'node:test';
import { isOfficeScopeItem, officeScopeItems, officeScopeState } from '../js/core/office-scope.js';

const items = [
  { id: 'office', scope: 'office' },
  { id: 'legacy' },
  { id: 'private', scope: 'private', privateOwnerUserId: 'u-owner' },
  { id: 'suppressed', scope: 'private', captureSuppressed: true, canonicalPublicationId: 'office' }
];

test('registro privado ou suprimido não entra na projeção do escritório', () => {
  assert.equal(isOfficeScopeItem({ id: 'a' }), true);
  assert.equal(isOfficeScopeItem({ id: 'a', scope: 'office' }), true);
  assert.equal(isOfficeScopeItem({ id: 'a', scope: 'private' }), false);
  assert.equal(isOfficeScopeItem({ id: 'a', scope: 'office', captureSuppressed: true }), false);
  assert.deepEqual(officeScopeItems(items).map(item => item.id), ['office', 'legacy']);
});

test('projeção do estado remove o escopo privado das coleções', () => {
  const scoped = officeScopeState({
    processes: items,
    tasks: items,
    intimations: items,
    documents: items,
    contacts: items,
    settings: { lawyerName: 'Sintética' }
  });
  assert.deepEqual(scoped.processes.map(item => item.id), ['office', 'legacy']);
  assert.deepEqual(scoped.tasks.map(item => item.id), ['office', 'legacy']);
  assert.deepEqual(scoped.intimations.map(item => item.id), ['office', 'legacy']);
  assert.deepEqual(scoped.documents.map(item => item.id), ['office', 'legacy']);
  assert.deepEqual(scoped.contacts.map(item => item.id), ['office', 'legacy']);
  assert.equal(scoped.settings.lawyerName, 'Sintética');
});
