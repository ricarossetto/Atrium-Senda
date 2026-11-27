import assert from 'node:assert/strict';
import test from 'node:test';
import { SEARCH_INDEX_VERSION, SearchIndex, normalizeSearchText } from '../lib/search-index.mjs';
import {
  canAccessSearchResult,
  createSearchAccessFilter,
  filterPrivateSearchResults
} from '../lib/office/access-control.mjs';

// Entradas montadas à mão para fixar pontuação e desempate, sem OCR nem servidor.
function entry({ entityType, id, title }) {
  const fields = [{ name: 'title', label: 'Título', value: title, normalized: normalizeSearchText(title), weight: 10 }];
  return {
    key: `${entityType}:${id}`,
    entityType,
    target: entityType,
    id,
    title,
    context: '',
    fields,
    searchable: fields.map(item => item.normalized).join(' ')
  };
}

function indexWith(entries) {
  return new SearchIndex({ snapshot: { version: SEARCH_INDEX_VERSION, sourceRevision: 'sintetico', entries } });
}

test('ordem: relevância, depois tipo de entidade, depois título', () => {
  const relevance = indexWith([
    entry({ entityType: 'task', id: 'tarefa-tardia', title: 'outro termo' }),
    entry({ entityType: 'task', id: 'tarefa-aberta', title: 'termo aberto' }),
    entry({ entityType: 'task', id: 'tarefa-exata', title: 'termo' })
  ]);
  assert.deepEqual(relevance.search('termo').map(item => item.id), ['tarefa-exata', 'tarefa-aberta', 'tarefa-tardia']);

  const entityOrder = indexWith([
    entry({ entityType: 'document', id: 'documento-empate', title: 'termo comum' }),
    entry({ entityType: 'process', id: 'processo-empate', title: 'termo comum' })
  ]);
  assert.deepEqual(entityOrder.search('termo comum').map(item => item.id), ['processo-empate', 'documento-empate']);

  const titleOrder = indexWith([
    entry({ entityType: 'contact', id: 'contato-b', title: 'termo comum b' }),
    entry({ entityType: 'contact', id: 'contato-a', title: 'termo comum a' })
  ]);
  assert.deepEqual(titleOrder.search('termo comum').map(item => item.id), ['contato-a', 'contato-b']);
});

test('limites: padrão, limites, inteiros e fracionários preservam o recorte anterior', () => {
  const entries = Array.from({ length: 32 }, (_, position) => {
    const sequence = String(position + 1).padStart(2, '0');
    return entry({ entityType: 'task', id: `tarefa-${position + 1}`, title: `termo ${sequence}` });
  });
  const index = indexWith(entries);
  assert.equal(index.search('termo').length, 24, 'limite padrão');
  assert.equal(index.search('termo', { limit: 100 }).length, 30, 'teto de trinta');
  assert.equal(index.search('termo', { limit: 0 }).length, 24, 'zero volta ao padrão');
  assert.equal(index.search('termo', { limit: -5 }).length, 1, 'valor negativo vira um');
  assert.equal(index.search('termo', { limit: 'abc' }).length, 24, 'valor inválido volta ao padrão');
  assert.deepEqual(index.search('termo', { limit: 3 }).map(item => item.id), ['tarefa-1', 'tarefa-2', 'tarefa-3']);
  assert.deepEqual(
    index.search('termo', { limit: 2.5 }).map(item => item.id),
    ['tarefa-1', 'tarefa-2'],
    'limite fracionário trunca como o slice anterior, sem arredondar para cima'
  );
  assert.deepEqual(
    index.search('termo', { limit: 7.75 }).map(item => item.id),
    Array.from({ length: 7 }, (_, position) => `tarefa-${position + 1}`)
  );
  assert.deepEqual(
    index.search('termo', { limit: 2.5, canInclude: item => Number(item.id.slice(7)) % 2 === 1 }).map(item => item.id),
    ['tarefa-1', 'tarefa-3'],
    'o predicado de acesso vem antes do limite e o recorte fracionário permanece'
  );
});

const officeProcess = {
  id: 'processo-teste',
  number: '5000000-00.2026.8.21.0001',
  scope: 'office',
  assignmentStatus: 'assigned',
  responsibleUserIds: ['u-teste'],
  assignedTeamIds: [],
  accessGrants: []
};
const privateProcess = {
  id: 'processo-privado-teste',
  number: '5000001-00.2026.8.21.0001',
  scope: 'private',
  privateOwnerUserId: 'u-teste',
  assignmentStatus: 'assigned',
  responsibleUserIds: [],
  assignedTeamIds: [],
  accessGrants: []
};
const state = {
  processes: [officeProcess, privateProcess],
  tasks: [{ id: 'tarefa-teste', process: officeProcess.number, title: 'Conferência sintética' }],
  intimations: [{ id: 'publicacao-teste', process: officeProcess.number, title: 'Publicação sintética' }],
  contacts: [{ id: 'contato-teste', name: 'Cliente Teste', process: officeProcess.number }],
  leads: [{ id: 'lead-teste', client: 'Cliente Teste', process: officeProcess.number }],
  agenda: [{ id: 'compromisso-teste', processId: officeProcess.id, title: 'Pauta sintética' }],
  documents: [{ id: 'documento-teste', ownerType: 'process', ownerId: officeProcess.id, name: 'laudo-teste.pdf' }],
  terms: []
};
const associate = { id: 'u-teste', username: 'advogada-teste', permissions: ['processes.create'] };
const auditor = { id: 'u-auditor', username: 'auditor-teste', permissions: ['audit.read'] };

const visibleResults = [
  { entityType: 'process', id: officeProcess.id },
  { entityType: 'task', id: 'tarefa-teste' },
  { entityType: 'publication', id: 'publicacao-teste' },
  { entityType: 'note', id: 'publicacao-teste' },
  { entityType: 'contact', id: 'contato-teste' },
  { entityType: 'lead', id: 'lead-teste' },
  { entityType: 'appointment', id: 'compromisso-teste' },
  { entityType: 'document', id: 'documento-teste' },
  { entityType: 'movement', id: officeProcess.id },
  { entityType: 'financial', id: officeProcess.id }
];

test('visibilidade positiva por perfil sintético conserva a regra de cada tipo', () => {
  const canInclude = createSearchAccessFilter(associate, state, { teams: [], enforced: true });
  for (const result of visibleResults) {
    assert.equal(canInclude(result), true, `filtro da busca deve incluir ${result.entityType}`);
    assert.equal(canAccessSearchResult(associate, result, state, []), true, `acesso enforced deve incluir ${result.entityType}`);
  }
  assert.equal(filterPrivateSearchResults(associate, visibleResults, state).length, visibleResults.length);

  const auditorFilter = createSearchAccessFilter(auditor, state, { enforced: true });
  for (const entityType of ['prompt', 'audit']) {
    assert.equal(auditorFilter({ entityType, id: 'registro-auditoria' }), true);
  }
});

test('o dono sintético vê o próprio registro privado na busca', () => {
  const result = { entityType: 'process', id: privateProcess.id };
  const canInclude = createSearchAccessFilter(associate, state, { enforced: true });
  assert.equal(canInclude(result), true);
  assert.equal(canAccessSearchResult(associate, result, state, []), true);
  assert.equal(filterPrivateSearchResults(associate, [result], state).length, 1);
});

test('cada perfil sintético decide pelo próprio contexto, sem estado compartilhado', () => {
  const ownerA = { id: 'u-a', username: 'advogada-a', permissions: [] };
  const ownerB = { id: 'u-b', username: 'advogada-b', permissions: [] };
  const sharedState = {
    processes: [
      { id: 'priv-a', scope: 'private', privateOwnerUserId: 'u-a' },
      { id: 'priv-b', scope: 'private', privateOwnerUserId: 'u-b' }
    ]
  };
  const filterA = createSearchAccessFilter(ownerA, sharedState, { enforced: true });
  const filterB = createSearchAccessFilter(ownerB, sharedState, { enforced: true });
  assert.equal(filterA({ entityType: 'process', id: 'priv-a' }), true);
  assert.equal(filterB({ entityType: 'process', id: 'priv-b' }), true);
});
