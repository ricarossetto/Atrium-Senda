import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Store } from '../js/core/store.js';

console.log('\n=== CONFIGURAÇÃO VAZIA PERSISTENTE ===\n');

const configurationKeys = [
  'taskDefinitions', 'actionTypes', 'actionGroups', 'stages', 'origins', 'goals',
  'users', 'inboxSections', 'notificationAssignments', 'integrations'
];

globalThis.OFFICE_DEFAULT_DATA = Object.fromEntries(configurationKeys.map(key => [key, [
  { id: `${key}-default`, name: `${key} default sintético` }
]]));

function baseState(configuration = {}) {
  return {
    terms: [], sources: [], intimations: [], tasks: [], processes: [], agenda: [], audit: [],
    contacts: [], leads: [], customPrompts: [], customLinks: [], settings: {}, configuration
  };
}

// Instalação nova: as coleções vazias do sample recebem os defaults iniciais.
Store.state = baseState(Object.fromEntries(configurationKeys.map(key => [key, []])));
Store.ensureShape({ seedConfigurationDefaults: true });
for (const key of configurationKeys) {
  assert.equal(Store.state.configuration[key][0].id, `${key}-default`, `New install deve semear ${key}.`);
}

// Estado persistido: um array vazio explícito é decisão do usuário e permanece vazio.
Store.state = baseState({
  taskDefinitions: [],
  actionTypes: [{ id: 'action-kept', name: 'Ação preservada' }]
});
Store.ensureShape();
assert.deepEqual(Store.state.configuration.taskDefinitions, []);
assert.deepEqual(Store.state.configuration.actionTypes, [{ id: 'action-kept', name: 'Ação preservada' }]);
assert.equal(Store.state.configuration.stages[0].id, 'stages-default', 'Coleção ausente deve receber default de compatibilidade.');

// Exclusão do último item sobrevive ao equivalente de flush/reload serializado.
Store.state = baseState({
  taskDefinitions: [{ id: 'last-item', name: 'Último item sintético' }],
  actionTypes: [{ id: 'untouched', name: 'Coleção não alterada' }]
});
Store.ensureShape();
Store.state.configuration.taskDefinitions.splice(0, 1);
const persistedRoundTrip = JSON.parse(JSON.stringify(Store.state));
Store.state = persistedRoundTrip;
Store.ensureShape();
assert.deepEqual(Store.state.configuration.taskDefinitions, [], 'Coleção esvaziada deve continuar vazia após reload.');
assert.deepEqual(Store.state.configuration.actionTypes, [{ id: 'untouched', name: 'Coleção não alterada' }]);

const source = await readFile(new URL('../js/core/store.js', import.meta.url), 'utf8');
assert.match(source, /seedConfigurationDefaults/);
assert.doesNotMatch(
  source,
  /!Array\.isArray\(this\.state\.configuration\[key\]\)\s*\|\|\s*this\.state\.configuration\[key\]\.length\s*===\s*0/,
  'A regra antiga não pode reaparecer sem distinguir instalação nova de estado persistido.'
);

delete globalThis.OFFICE_DEFAULT_DATA;
console.log('✓ Defaults de instalação, compatibilidade legada e vazio explícito persistente aprovados.');
