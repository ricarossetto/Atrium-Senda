import assert from 'node:assert/strict';
import { buildSearchEntries, SEARCH_INDEX_VERSION } from '../lib/search-index.mjs';
import { resolveIntimationId, findIntimationRecord, isMergedIntimation } from '../js/core/publication-scope.js';

console.log('--- Iniciando Testes: Consumidores de alias da fusão (busca global e resolução) ---');

const CNJ = '5045678-90.2026.8.21.0005';

// 1. Busca global não indexa alias (publicação e notas internas do perdedor).
{
  const keeper = {
    id: 'eproc:search-keeper',
    externalId: 'eproc:search-keeper',
    process: CNJ,
    title: 'Publicação keeper',
    text: 'Texto oficial indexável.',
    workNotes: [{ id: 'note-keeper', text: 'Nota oficial indexável.' }]
  };
  const alias = {
    id: 'djen:search-alias',
    externalId: 'djen:search-alias',
    mergedInto: 'eproc:search-keeper',
    process: CNJ,
    title: 'Publicação absorvida',
    text: 'Texto do alias absorvido.',
    workNotes: [{ id: 'note-alias', text: 'Nota do alias absorvido.' }]
  };
  const entries = await buildSearchEntries({ intimations: [keeper, alias], documents: [], processes: [], contacts: [] });
  const publicationEntries = entries.filter(entry => entry.entityType === 'publication');
  assert.deepEqual(publicationEntries.map(entry => entry.id), ['eproc:search-keeper'], 'alias não entra no índice');
  const noteEntries = entries.filter(entry => entry.entityType === 'note');
  assert.deepEqual(noteEntries.map(entry => entry.key), ['note:eproc:search-keeper:note-keeper'], 'notas do alias não entram no índice');
  assert.equal(SEARCH_INDEX_VERSION >= 6, true, 'versão do índice invalida snapshot anterior aos filtros de alias');
  console.log('✓ Resultado de busca nunca aponta para registro absorvido');
}

// 2. Resolução de id no cliente segue a cadeia de aliases até o keeper vivo.
{
  const records = [
    { id: 'eproc:final', externalId: 'eproc:final', title: 'Keeper final' },
    { id: 'eproc:middle', externalId: 'eproc:middle', mergedInto: 'eproc:final', title: 'Alias intermediário' },
    { id: 'djen:oldest', externalId: 'djen:oldest', mergedInto: 'eproc:middle', title: 'Alias antigo' }
  ];
  assert.equal(resolveIntimationId(records, 'djen:oldest'), 'eproc:final', 'cadeia A→B→C resolve para o keeper final');
  assert.equal(resolveIntimationId(records, 'eproc:middle'), 'eproc:final');
  assert.equal(resolveIntimationId(records, 'eproc:final'), 'eproc:final');
  assert.equal(resolveIntimationId(records, 'id-inexistente'), 'id-inexistente', 'id desconhecido não é reescrito');
  assert.equal(findIntimationRecord(records, 'djen:oldest').id, 'eproc:final');
  assert.equal(findIntimationRecord(records, 'id-inexistente'), null);
  assert.equal(isMergedIntimation(records[2]), true);
  assert.equal(isMergedIntimation(records[0]), false);
  console.log('✓ Id absorvido resolve para o keeper e alias nunca é aberto');
}

// 3. Ciclo de aliases não trava nem devolve alias como se fosse keeper.
{
  const cycle = [
    { id: 'cycle-a', mergedInto: 'cycle-b' },
    { id: 'cycle-b', mergedInto: 'cycle-a' }
  ];
  assert.equal(resolveIntimationId(cycle, 'cycle-a'), '', 'ciclo resolve para vazio');
  assert.equal(findIntimationRecord(cycle, 'cycle-a'), null);
  assert.equal(resolveIntimationId([], 'x'), 'x');
  assert.equal(resolveIntimationId(null, 'x'), 'x');
  console.log('✓ Ciclo de aliases é tratado sem loop');
}

console.log('\n[PASS] Consumidores de alias validados.');
