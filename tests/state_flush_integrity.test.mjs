import assert from 'node:assert/strict';
import { canAccessProcess, filterPrivateScopeState, mergePrivateScopeState, restoreRecordsUnseenByClient } from '../lib/office/access-control.mjs';
import { applyMonitoringScopes, ownerMatchesUser } from '../lib/office/monitoring-scope.mjs';
import { collapseDuplicateProcessRows } from '../lib/office/process-rows.mjs';

console.log('--- Iniciando Testes: salvamento não apaga nem esconde registros ---');

const owner = { id: 'usr-teste-1', username: 'advogada.teste@example.test', permissions: ['office.manage'] };
const member = { id: 'usr-teste-2', username: 'membro.teste@example.test', permissions: [] };

// Dono gravado pelo nome de usuário ou pelo id identifica a mesma pessoa.
assert.equal(ownerMatchesUser('usr-teste-1', owner), true);
assert.equal(ownerMatchesUser('advogada.teste@example.test', owner), true);
assert.equal(ownerMatchesUser('usr-teste-2', owner), false);
assert.equal(ownerMatchesUser('', owner), false, 'Dono vazio não pertence a ninguém.');
assert.equal(ownerMatchesUser('', { id: '', username: '' }), false);

const legacyPrivate = {
  terms: [{ id: 'term-priv', scope: 'private', privateOwnerUserId: owner.username, name: 'Advogada Teste', registration: 'OAB/RS 000000', active: true }],
  processes: [{ id: 'p-priv', number: '0000000-00.2026.8.21.0001', scope: 'private', privateOwnerUserId: owner.username, source: 'DJEN / CNJ Oficial' }],
  intimations: [{ id: 'i-priv', process: '0000000-00.2026.8.21.0001', scope: 'private', privateOwnerUserId: owner.username, treatmentStatus: 'untreated' }],
  tasks: [],
  contacts: [],
  agenda: [],
  leads: [],
  documents: [],
  communications: []
};

{
  // O dono vê os próprios registros antigos; outro membro continua sem ver.
  const mine = filterPrivateScopeState(legacyPrivate, owner);
  assert.equal(mine.processes.length, 1, 'Processo privado antigo deve aparecer para o dono.');
  assert.equal(mine.intimations.length, 1, 'Publicação privada antiga deve aparecer para o dono.');
  assert.equal(mine.terms.length, 1, 'Termo privado antigo deve aparecer para o dono.');
  const theirs = filterPrivateScopeState(legacyPrivate, member);
  assert.equal(theirs.processes.length, 0, 'Isolamento entre membros não pode ser enfraquecido.');
  assert.equal(theirs.intimations.length, 0);
  assert.equal(theirs.terms.length, 0);
  assert.equal(canAccessProcess(owner, legacyPrivate.processes[0]), true);
  assert.equal(canAccessProcess(member, legacyPrivate.processes[0]), false);
}

{
  // Salvamento de outro membro preserva o registro privado que ele não recebeu.
  const incoming = filterPrivateScopeState(legacyPrivate, member);
  const merged = mergePrivateScopeState(legacyPrivate, incoming, member);
  assert.equal(merged.intimations.length, 1);
  assert.equal(merged.processes.length, 1);
}

{
  // Registro fora da leitura deste navegador volta; remoção real é relatada, não bloqueada.
  const current = {
    processes: [{ id: 'p1' }, { id: 'p2' }],
    intimations: [{ id: 'i1' }, { id: 'i-absorvida', mergedInto: 'i1' }, { id: 'i2' }],
    contacts: [{ id: 'c-visivel' }, { id: 'c-oculto' }],
    tasks: [],
    agenda: [],
    leads: [],
    terms: []
  };
  const readView = {
    processes: [{ id: 'p1' }, { id: 'p2' }],
    intimations: [{ id: 'i1' }, { id: 'i2' }],
    contacts: [{ id: 'c-visivel' }],
    tasks: [],
    agenda: [],
    leads: [],
    terms: []
  };
  const next = { processes: [{ id: 'p1' }], intimations: [{ id: 'i1' }], contacts: [], tasks: [], agenda: [], leads: [], terms: [] };
  const outcome = restoreRecordsUnseenByClient(current, next, readView);
  assert.ok(next.intimations.some(item => item.id === 'i2'), 'Publicação visível também não some pelo flush.');
  assert.ok(!next.intimations.some(item => item.id === 'i-absorvida'), 'Alias de fusão segue pelo fluxo próprio.');
  assert.ok(next.contacts.some(item => item.id === 'c-oculto'), 'Contato que o navegador não recebeu deve voltar.');
  assert.ok(!next.contacts.some(item => item.id === 'c-visivel'), 'Contato visível removido pelo usuário continua removido.');
  assert.ok(!next.processes.some(item => item.id === 'p2'), 'Processo visível removido pelo usuário continua removido.');
  assert.deepEqual(outcome.removed, [{ collection: 'processes', count: 1 }, { collection: 'contacts', count: 1 }]);
}

{
  // Linhas repetidas do mesmo processo viram uma, sem perder dado.
  const rows = [
    { id: 'p-a', number: '1', updatedAt: '2026-10-01T10:00:00Z', client: 'Cliente Teste', notes: 'manual', scope: 'office', source: 'DJEN / CNJ Oficial + DataJud / CNJ' },
    { id: 'p-b', number: '2', scope: 'office' },
    { id: 'p-a', number: '1', updatedAt: '2026-10-05T10:00:00Z', client: '', stage: 'recurso', scope: 'private', privateOwnerUserId: owner.username, source: 'DJEN' }
  ];
  const collapsed = collapseDuplicateProcessRows(rows);
  assert.equal(collapsed.length, 2);
  assert.equal(collapsed[0].id, 'p-a', 'Mantém a posição da primeira linha.');
  assert.equal(collapsed[0].client, 'Cliente Teste', 'Campo vazio não apaga campo preenchido.');
  assert.equal(collapsed[0].notes, 'manual');
  assert.equal(collapsed[0].stage, 'recurso', 'Valor mais recente entra.');
  assert.equal(collapsed[0].scope, 'office', 'Escritório vence privado.');
  assert.equal(collapsed[0].privateOwnerUserId, undefined);
  assert.deepEqual(collapsed[0].responsibleUserIds, [owner.username], 'O dono antigo não perde o processo.');
  assert.equal(collapsed[0].source, 'DJEN / CNJ Oficial + DataJud / CNJ');
  const unique = [{ id: 'x' }, { id: 'y' }];
  assert.equal(collapseDuplicateProcessRows(unique), unique, 'Sem repetição, a lista não muda.');
  const onlyPrivate = collapseDuplicateProcessRows([
    { id: 'p', scope: 'private', privateOwnerUserId: owner.id },
    { id: 'p', scope: 'private', privateOwnerUserId: owner.id }
  ]);
  assert.equal(onlyPrivate[0].scope, 'private', 'Sem linha de escritório, segue privado.');
  assert.equal(onlyPrivate[0].privateOwnerUserId, owner.id);
}

{
  // Depois de fundir, publicação de processo privado do dono continua visível para ele.
  const scoped = applyMonitoringScopes(legacyPrivate);
  assert.equal(filterPrivateScopeState(scoped, owner).intimations.length, 1);
}

console.log('[PASS] Salvamento não apaga nem esconde registros do dono.');
