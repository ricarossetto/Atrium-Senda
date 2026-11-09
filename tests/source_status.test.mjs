import assert from 'node:assert/strict';
import { keepNewestSourceChecks, mergeSourceChecks } from '../lib/office/source-status.mjs';

console.log('--- Iniciando Testes: situação das fontes no estado oficial ---');

const antiga = { id: 'djen-cnj', name: 'DJEN', status: 'attention', detail: 'antes', lastCheck: '2026-10-30T10:00:00Z' };
const nova = { id: 'djen-cnj', status: 'ok', detail: 'agora', lastCheck: '2026-11-02T10:00:00Z' };

{
  const { sources, changed } = mergeSourceChecks([antiga], [nova]);
  assert.equal(changed, true);
  assert.equal(sources[0].status, 'ok');
  assert.equal(sources[0].name, 'DJEN', 'campos que a coleta não envia ficam');
}
{
  const { sources, changed } = mergeSourceChecks([nova], [antiga]);
  assert.equal(changed, false, 'verificação antiga não recua');
  assert.equal(sources[0].status, 'ok');
}
{
  const { sources, changed } = mergeSourceChecks([], [nova]);
  assert.equal(changed, true);
  assert.equal(sources.length, 1, 'fonte nova entra');
}
{
  const saved = keepNewestSourceChecks([nova], [{ ...antiga, name: 'Nome editado' }]);
  assert.equal(saved[0].lastCheck, nova.lastCheck, 'aba antiga não devolve verificação velha');
  assert.equal(saved[0].name, 'Nome editado', 'mantém o que a pessoa editou');
  assert.deepEqual(keepNewestSourceChecks([nova], []), [], 'mantém a lista enviada');
  assert.equal(keepNewestSourceChecks(undefined, [nova])[0], nova);
}

console.log('[PASS] Situação das fontes no estado oficial.');
