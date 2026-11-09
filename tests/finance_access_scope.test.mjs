import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProcessIndex,
  canAccessFinancialEntry,
  canManageFinance,
  canWriteFinancial,
  filterOfficeState,
  mergeVisibleClientState
} from '../lib/office/access-control.mjs';
import { normalizeFinanceEntries } from '../lib/office/finance-entry-scope.mjs';

// Fixtures sintéticas. Nenhum dado real de cliente, OAB ou processo.
const finance = { id: 'u-finance', username: 'finance', permissions: ['finance.read'] };
const associate = { id: 'u-assoc', username: 'assoc', permissions: ['processes.create'] };
const other = { id: 'u-other', username: 'other', permissions: [] };

const ownProcess = {
  id: 'proc-own',
  number: '5000000-00.2026.8.21.0001',
  client: 'Cliente Teste',
  scope: 'office',
  assignmentStatus: 'assigned',
  responsibleUserIds: ['u-assoc'],
  assignedTeamIds: [],
  accessGrants: []
};
const foreignProcess = {
  id: 'proc-foreign',
  number: '5000001-00.2026.8.21.0001',
  client: 'Cliente Teste',
  scope: 'office',
  assignmentStatus: 'assigned',
  responsibleUserIds: ['u-other'],
  assignedTeamIds: [],
  accessGrants: []
};
const privateProcessOther = {
  id: 'proc-private-other',
  number: '5000002-00.2026.8.21.0001',
  client: 'Cliente Teste',
  scope: 'private',
  privateOwnerUserId: 'u-other',
  assignmentStatus: 'assigned',
  responsibleUserIds: ['u-assoc'],
  assignedTeamIds: [],
  accessGrants: []
};

const processes = [ownProcess, foreignProcess, privateProcessOther];
const index = buildProcessIndex(processes);
const teams = [];

const entries = [
  { id: 'fin-own-process', description: 'Honorários sintéticos', amount: 1000, processId: 'proc-own', createdByUserId: 'u-other' },
  { id: 'fin-foreign-process', description: 'Custas sintéticas', amount: 200, processId: 'proc-foreign', createdByUserId: 'u-assoc' },
  { id: 'fin-own-unlinked', description: 'Despesa sintética própria', amount: 50, processId: null, createdByUserId: 'u-assoc' },
  { id: 'fin-other-unlinked', description: 'Despesa sintética alheia', amount: 70, processId: null, createdByUserId: 'u-other' },
  { id: 'fin-private-other', description: 'Despesa de escopo privado', amount: 90, processId: 'proc-private-other', createdByUserId: 'u-other' }
];
const idsOf = list => (Array.isArray(list) ? list.map(entry => entry.id).sort() : list);

function stateFor(collection) {
  return {
    processes,
    tasks: [],
    intimations: [],
    communications: [],
    contacts: [],
    agenda: [],
    documents: [],
    leads: [],
    terms: [],
    audit: [],
    [collection]: structuredClone(entries)
  };
}

for (const collection of ['officeExpenses', 'financialEntries']) {
  test(`${collection}: associado vê lançamento de processo atribuído a ele sem ter finance.read`, () => {
    assert.equal(canManageFinance(associate), false);
    assert.equal(canAccessFinancialEntry(associate, entries[0], index, teams), true);
  });

  test(`${collection}: associado não vê lançamento de processo de outro membro`, () => {
    assert.equal(canAccessFinancialEntry(associate, entries[1], index, teams), false);
  });

  test(`${collection}: lançamento sem vínculo aparece só para o autor`, () => {
    assert.equal(canAccessFinancialEntry(associate, entries[2], index, teams), true);
    assert.equal(canAccessFinancialEntry(other, entries[2], index, teams), false);
    assert.equal(canAccessFinancialEntry(associate, entries[3], index, teams), false);
  });

  test(`${collection}: quem tem finance.read vê tudo`, () => {
    for (const entry of entries) {
      assert.equal(canAccessFinancialEntry(finance, entry, index, teams), true, entry.id);
    }
  });

  test(`${collection}: processo de escopo privado de outro membro não vaza`, () => {
    assert.equal(canAccessFinancialEntry(associate, entries[4], index, teams), false);
    assert.equal(canAccessFinancialEntry(other, entries[4], index, teams), true);
  });

  test(`${collection}: filtro e merge concordam no mesmo recorte`, () => {
    const state = stateFor(collection);
    const filtered = filterOfficeState(state, associate, { teams });
    assert.deepEqual(idsOf(filtered[collection]), ['fin-own-process', 'fin-own-unlinked']);

    // Cliente devolve o que enxerga; o merge preserva o oculto do estado oficial e
    // recusa a versão forjada de um registro que o usuário não pode ver.
    const incoming = {
      ...state,
      [collection]: [
        ...entries.filter(entry => idsOf(filtered[collection]).includes(entry.id)),
        entries[1],
        { ...entries[3], amount: 999 }
      ]
    };
    const merged = mergeVisibleClientState(state, incoming, associate, { teams });
    const visibleForUser = merged[collection]
      .filter(entry => canAccessFinancialEntry(associate, entry, buildProcessIndex(state.processes), teams));
    assert.deepEqual(idsOf(visibleForUser), idsOf(filtered[collection]), 'mesmo recorte nos dois caminhos');
    assert.equal(
      merged[collection].find(entry => entry.id === 'fin-other-unlinked').amount,
      70,
      'registro oculto do estado oficial é preservado, não a versão do cliente'
    );
    assert.equal(
      merged[collection].find(entry => entry.id === 'fin-private-other').amount,
      90,
      'lançamento de processo privado alheio não é reintroduzido pelo cliente'
    );
  });
}

for (const collection of ['officeExpenses', 'financialEntries']) {
  test(`colisão de id (${collection}): lançamento oculto do estado oficial prevalece e não ganha autor forjado`, () => {
    const officialEntry = {
      id: 'fin-hidden-other-author',
      description: 'Lançamento oficial alheio',
      amount: 200,
      processId: 'proc-foreign',
      createdByUserId: 'u-other'
    };
    const state = { ...stateFor(collection), [collection]: [officialEntry] };
    // Ataque: mesmo id do registro oculto, vínculo trocado para processo do próprio
    // usuário e conteúdo forjado. O predicado aprova por causa do vínculo novo.
    const forged = {
      id: 'fin-hidden-other-author',
      description: 'Lançamento forjado',
      amount: 5000,
      processId: 'proc-own',
      createdByUserId: 'u-assoc'
    };
    assert.equal(canAccessFinancialEntry(associate, forged, index, teams), true, 'o vínculo trocado passa no predicado — é isso que abria o furo');
    assert.equal(canAccessFinancialEntry(associate, officialEntry, index, teams), false, 'o registro oficial está oculto para esse usuário');

    const filtered = filterOfficeState(state, associate, { teams });
    assert.deepEqual(idsOf(filtered[collection]), [], 'filtro não expõe nem repassa o registro oculto');

    const merged = mergeVisibleClientState(state, { ...state, [collection]: [forged] }, associate, { teams });
    const mergedCopies = merged[collection].filter(entry => entry.id === officialEntry.id);
    assert.equal(mergedCopies.length, 1, 'o estado mesclado fica com um único registro por id');
    assert.equal(mergedCopies[0].amount, 200, 'conteúdo oficial é preservado, não regravado');
    assert.equal(mergedCopies[0].description, 'Lançamento oficial alheio');
    assert.equal(mergedCopies[0].processId, 'proc-foreign', 'vínculo oficial é preservado');

    // O que o flush faria com o resultado: normalizeFinanceEntries carimba o autor
    // a partir do registro oficial. Com o id duplicado, a cópia plantada herdaria
    // `createdByUserId` de outra pessoa.
    const persisted = normalizeFinanceEntries({
      entries: merged[collection],
      previousEntries: state[collection],
      actorUserId: 'u-assoc',
      processIndex: index
    });
    const persistedCopies = persisted.filter(entry => entry.id === officialEntry.id);
    assert.equal(persistedCopies.length, 1, 'sem duplicata no estado persistido');
    assert.equal(persistedCopies[0].createdByUserId, 'u-other', 'autoria oficial não muda');
    assert.equal(persistedCopies[0].amount, 200);
  });
}

test('registro suprimido nunca é acessível, nem por quem tem finance.read', () => {
  const suppressed = { id: 'fin-suppressed', captureSuppressed: true, processId: 'proc-own', createdByUserId: 'u-assoc' };
  assert.equal(canAccessFinancialEntry(associate, suppressed, index, teams), false);
  assert.equal(canAccessFinancialEntry(finance, suppressed, index, teams), false);
  assert.equal(canAccessFinancialEntry(associate, null, index, teams), false);
});

test('autor do lançamento vem do servidor e vínculo órfão vira sem vínculo', () => {
  const previous = [{ id: 'fin-own-process', description: 'Honorários sintéticos', amount: 1000, processId: 'proc-own', createdByUserId: 'u-other' }];
  const normalized = normalizeFinanceEntries({
    entries: [
      { ...previous[0], createdByUserId: 'u-assoc' },
      { id: 'fin-new', description: 'Despesa sintética', amount: 10, processId: 'proc-own', createdByUserId: 'u-other' },
      { id: 'fin-orphan', description: 'Despesa sintética órfã', amount: 20, processId: 'proc-inexistente' }
    ],
    previousEntries: previous,
    actorUserId: 'u-assoc',
    processIndex: index
  });
  assert.equal(normalized[0].createdByUserId, 'u-other', 'autor oficial do registro existente não é reescrito pelo cliente');
  assert.equal(normalized[1].createdByUserId, 'u-assoc', 'registro novo recebe o ator autenticado');
  assert.equal(normalized[2].processId, null, 'vínculo órfão não concede acesso a processo inexistente');
});

// Gravação: `finance.write` (ou `office.manage`) é o direito próprio de alterar
// lançamento. Quem apenas lê continua lendo, mas o flush não muda nada.
const writer = { id: 'u-writer', username: 'writer', permissions: ['finance.write'] };
const officeManager = { id: 'u-manager', username: 'manager', permissions: ['office.manage'] };

test('canWriteFinancial exige finance.write ou office.manage', () => {
  assert.equal(canWriteFinancial(writer), true);
  assert.equal(canWriteFinancial(officeManager), true);
  assert.equal(canWriteFinancial(finance), false, 'finance.read sozinho não grava');
  assert.equal(canWriteFinancial(associate), false);
  assert.equal(canWriteFinancial(other), false);
  assert.equal(canWriteFinancial(null), false);
  assert.equal(canWriteFinancial({}), false);
});

for (const collection of ['officeExpenses', 'financialEntries']) {
  test(`${collection}: quem não grava mantém a versão oficial no flush, inclusive de lançamento que vê`, () => {
    const state = stateFor(collection);
    // `finance.read` vê tudo, mas não grava.
    const incoming = {
      ...state,
      [collection]: [
        { ...entries[0], amount: 4444, description: 'Editado pelo leitor' },
        { id: 'fin-planted', description: 'Lançamento plantado', amount: 1, processId: 'proc-foreign' }
      ]
    };
    const merged = mergeVisibleClientState(state, incoming, finance, { teams });
    assert.deepEqual(idsOf(merged[collection]), idsOf(entries), 'nenhum lançamento é criado ou removido');
    assert.equal(
      merged[collection].find(entry => entry.id === 'fin-own-process').amount,
      1000,
      'a edição do leitor é descartada; a versão oficial prevalece'
    );
    assert.equal(
      merged[collection].find(entry => entry.id === 'fin-own-process').description,
      'Honorários sintéticos'
    );
    assert.equal(
      merged[collection].some(entry => entry.id === 'fin-planted'),
      false,
      'leitor não planta lançamento pelo flush'
    );
    // O cliente que envia lista vazia também não apaga o acervo.
    const emptied = mergeVisibleClientState(state, { ...state, [collection]: [] }, associate, { teams });
    assert.deepEqual(idsOf(emptied[collection]), idsOf(entries), 'leitor não apaga lançamento');
  });

  test(`${collection}: quem grava edita e cria lançamento pelo flush`, () => {
    const state = stateFor(collection);
    const incoming = {
      ...state,
      [collection]: [
        ...entries.map(entry => (entry.id === 'fin-own-process' ? { ...entry, amount: 1500 } : entry)),
        { id: 'fin-new-writer', description: 'Despesa nova do escritor', amount: 15, processId: null }
      ]
    };
    const merged = mergeVisibleClientState(state, incoming, writer, { teams });
    assert.equal(merged[collection].find(entry => entry.id === 'fin-own-process').amount, 1500, 'writer edita');
    assert.equal(
      merged[collection].some(entry => entry.id === 'fin-new-writer'),
      true,
      'writer cria lançamento'
    );
    const managed = mergeVisibleClientState(state, incoming, officeManager, { teams });
    assert.equal(
      managed[collection].find(entry => entry.id === 'fin-own-process').amount,
      1500,
      'office.manage sem finance.write também grava'
    );
  });

  test(`${collection}: gravação não regride a visibilidade do leitor`, () => {
    const state = stateFor(collection);
    const filtered = filterOfficeState(state, associate, { teams });
    assert.deepEqual(
      idsOf(filtered[collection]),
      ['fin-own-process', 'fin-own-unlinked'],
      'associado sem finance.read continua vendo o que via, mesmo sem gravar'
    );
    const financeView = filterOfficeState(state, finance, { teams });
    assert.deepEqual(idsOf(financeView[collection]), idsOf(entries), 'finance.read continua vendo tudo');

    // Os dois caminhos de projeção concordam para quem não grava.
    const merged = mergeVisibleClientState(state, { ...state, [collection]: structuredClone(entries) }, associate, { teams });
    const visibleForUser = merged[collection]
      .filter(entry => canAccessFinancialEntry(associate, entry, buildProcessIndex(state.processes), teams));
    assert.deepEqual(idsOf(visibleForUser), idsOf(filtered[collection]), 'filtro e merge concordam no mesmo recorte');
  });
}
