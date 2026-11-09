import assert from 'node:assert/strict';
import {
  buildPjeCommunications,
  mergePjeCommunicationsIntoState,
  listPjeCommunications,
  communicationIdFor
} from '../lib/judicial/pje/sync/judicial-communications.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — JUDICIAL COMMUNICATION (EXPEDIENTE CANÔNICO)       ');
console.log('===============================================================\n');

const CNJ = '0020411-63.2026.5.04.0601';

function makeJtInventory(overrides = {}) {
  return {
    portalId: 'pje-trt4-1g',
    portalName: 'TRT4 · PJe 1º grau',
    layoutFamily: 'trabalhista',
    collectedAt: '2026-09-17T20:00:00.000Z',
    routes: { expedientes: 'https://pje.trt4.jus.br/pjekz/painel/usuario-externo/pendentes-manifestacao' },
    expedientes: {
      situations: [],
      groups: [],
      expedientes: [
        {
          expedienteIdentity: 'id:53180112',
          processNumber: CNJ,
          orgaoJulgador: 'Colegiado IJU601',
          createdAt: '11/09/2026',
          cienciaAt: '15/09/2026',
          prazoFinal: '25/09/2026',
          summary: 'Detalhes do Processo ATSum pendente de manifestação'
        },
        {
          expedienteIdentity: 'id:53180115',
          processNumber: CNJ,
          orgaoJulgador: 'Colegiado IJU601',
          createdAt: '12/09/2026',
          cienciaAt: '16/09/2026',
          prazoFinal: '26/09/2026',
          summary: 'Detalhes do Processo ATSum segunda comunicação'
        }
      ],
      processes: [],
      reconciliation: { state: 'loaded' },
      state: 'loaded'
    },
    acervo: { processes: [], state: 'loaded' }
  };
}

console.log('[T1] Dois expedientes do mesmo CNJ coexistem como comunicações distintas...');
const built = buildPjeCommunications(makeJtInventory(), { workspaceId: 'ws-alfa', now: '2026-09-17T20:00:00.000Z' });
assert.equal(built.length, 2);
assert.notEqual(built[0].id, built[1].id);
assert.equal(built[0].sourceCommunicationId, 'id:53180112');
assert.equal(built[0].processNumber, CNJ);
assert.equal(built[0].sourceReportedScienceAt, '2026-09-15');
assert.equal(built[0].sourceReportedDeadlineAt, '2026-09-25');
assert.equal(built[0].status, 'new');
assert.equal(built[0].version, 1);
assert.equal(built[0].deadline, '2026-09-25', 'Prazo da fonte PJe é aplicado automaticamente.');
assert.equal(built[0].deadlineSource, 'pje');
assert.ok(!('fatalDeadline' in built[0]), 'Prazo da fonte nunca vira prazo fatal.');
console.log('  ✓ 2 comunicações para 1 processo; prazo da fonte aplicado e fatal humano.');

console.log('[T2] Merge idempotente sem bump de versão...');
const first = mergePjeCommunicationsIntoState({ processes: [], tasks: [], communications: [] }, makeJtInventory(), { workspaceId: 'ws-alfa', now: '2026-09-17T20:00:00.000Z' });
assert.equal(first.counters.communicationsCreated, 2);
const second = mergePjeCommunicationsIntoState(first.state, makeJtInventory(), { workspaceId: 'ws-alfa', now: '2026-09-17T21:00:00.000Z' });
assert.equal(second.counters.communicationsUnchanged, 2);
assert.equal(second.counters.communicationsUpdated, 0);
const manualMode = mergePjeCommunicationsIntoState(
  { processes: [], tasks: [], communications: [], settings: { deadlineMode: 'manual' } },
  makeJtInventory(),
  { workspaceId: 'ws-alfa', now: '2026-09-17T21:00:00.000Z' }
);
assert.equal(manualMode.state.communications[0].deadline || '', '', 'Modo manual mantém a data da fonte apenas como referência.');
assert.equal(manualMode.state.communications[0].sourceReportedDeadlineAt, '2026-09-25');
assert.equal(second.state.communications[0].version, 1);
assert.equal(second.state.communications[0].lastSeenAt, '2026-09-17T21:00:00.000Z');
assert.equal(second.state.communications[0].firstSeenAt, '2026-09-17T20:00:00.000Z');
console.log('  ✓ Segunda passagem inalterada; firstSeen preservado, lastSeen atualizado.');

console.log('[T3] Mudança real atualiza versão e preserva status humano...');
const humanState = {
  ...second.state,
  communications: second.state.communications.map(item => ({ ...item, status: 'in_review' }))
};
const changed = makeJtInventory();
changed.expedientes.expedientes[0].cienciaAt = '17/09/2026';
const third = mergePjeCommunicationsIntoState(humanState, changed, { workspaceId: 'ws-alfa', now: '2026-09-17T22:00:00.000Z' });
assert.equal(third.counters.communicationsUpdated, 1);
const updated = third.state.communications.find(item => item.sourceCommunicationId === 'id:53180112');
assert.equal(updated.version, 2);
assert.equal(updated.sourceReportedScienceAt, '2026-09-17');
assert.equal(updated.status, 'in_review', 'Status definido por humano não pode ser sobrescrito pela coleta.');
console.log('  ✓ Ciência nova → version 2; status humano preservado.');

console.log('[T4] Expediênte que sai da fonte é soft-deleted em coleta confiável...');
const reduced = makeJtInventory();
reduced.expedientes.expedientes = [reduced.expedientes.expedientes[0]];
const fourth = mergePjeCommunicationsIntoState(third.state, reduced, { workspaceId: 'ws-alfa', now: '2026-09-17T23:00:00.000Z', authoritativeExpedientes: true });
assert.equal(fourth.counters.communicationsRemoved, 1);
const deleted = fourth.state.communications.find(item => item.sourceCommunicationId === 'id:53180115');
assert.equal(deleted.deletedAt, '2026-09-17T23:00:00.000Z');
assert.equal(listPjeCommunications(fourth.state, { workspaceId: 'ws-alfa' }).length, 1);
assert.equal(listPjeCommunications(fourth.state, { workspaceId: 'ws-alfa', includeDeleted: true }).length, 2);
console.log('  ✓ Remoção é associação histórica (deletedAt), nunca exclusão destrutiva.');

console.log('[T5] Coleta não confiável NUNCA remove comunicação existente...');
const unreliablePartial = mergePjeCommunicationsIntoState(first.state, { ...reduced, expedientes: { ...reduced.expedientes, state: 'partial' } }, { workspaceId: 'ws-alfa', now: '2026-09-18T00:00:00.000Z' });
assert.equal(unreliablePartial.counters.communicationsRemoved, 0);
assert.equal(unreliablePartial.state.communications.find(item => item.sourceCommunicationId === 'id:53180115').deletedAt, null);
const unreliableTimeout = mergePjeCommunicationsIntoState(first.state, { ...reduced, expedientes: { ...reduced.expedientes, state: 'load_timeout' } }, { workspaceId: 'ws-alfa', now: '2026-09-18T00:00:00.000Z' });
assert.equal(unreliableTimeout.counters.communicationsRemoved, 0);
const reliableMissing = mergePjeCommunicationsIntoState(first.state, { ...reduced, expedientes: { ...reduced.expedientes, state: 'loaded' } }, { workspaceId: 'ws-alfa', now: '2026-09-18T00:00:00.000Z', authoritativeExpedientes: true });
assert.equal(reliableMissing.counters.communicationsRemoved, 1, 'Somente loaded/empty_confirmed pode marcar ausência.');
console.log('  ✓ partial/load_timeout preservam; apenas loaded autoriza soft-delete.');

console.log('[T6] Isolamento por workspace e identidade estável...');
assert.equal(fourth.state.communications[0].workspaceId, 'ws-alfa');
const otherWorkspace = mergePjeCommunicationsIntoState({ processes: [], tasks: [], communications: [] }, makeJtInventory(), { workspaceId: 'ws-beta', now: '2026-09-17T23:30:00.000Z' });
assert.equal(otherWorkspace.counters.communicationsCreated, 2);
assert.notEqual(otherWorkspace.state.communications[0].id, fourth.state.communications[0].id);
assert.equal(
  communicationIdFor({ workspaceId: 'ws-alfa', portalId: 'pje-trt4-1g', sourceCommunicationId: 'id:53180112' }),
  communicationIdFor({ workspaceId: 'ws-alfa', portalId: 'pje-trt4-1g', sourceCommunicationId: 'id:53180112' })
);
console.log('  ✓ Cofre semântico isolado por workspace; ID determinístico.');

console.log('[T7] Shape standard (identity + situation) também é aceito...');
const standardInventory = {
  portalId: 'pje-tjmt-1g',
  portalName: 'TJMT · PJe 1º grau',
  expedientes: {
    situations: [],
    expedientes: [
      { identity: 'id:53180112', processNumber: CNJ, situation: 'Pendentes de ciência ou de resposta', summary: 'x', dates: ['15/09/2026'] }
    ],
    state: 'loaded'
  },
  acervo: { processes: [], state: 'loaded' }
};
const standardBuilt = buildPjeCommunications(standardInventory, { workspaceId: 'ws-alfa' });
assert.equal(standardBuilt.length, 1);
assert.deepEqual(standardBuilt[0].situationMemberships, ['Pendentes de ciência ou de resposta']);
console.log('  ✓ Famílias standard e pje-jt produzem a mesma entidade.');

function makeDuplicatedInventory(identities, situations, overrides = {}) {
  return {
    portalId: 'pje-tjmt-1g',
    portalName: 'TJMT · PJe 1º grau',
    collectedAt: '2026-09-18T10:00:00.000Z',
    expedientes: {
      situations: [],
      groups: [],
      expedientes: identities.map((identity, index) => ({
        identity,
        processNumber: CNJ,
        orgaoJulgador: 'Vara Única de Diamantino',
        dates: ['15/09/2026'],
        situation: situations[index],
        summary: `linha repetida da tabela ${index + 1} com link volátil`,
        ...overrides
      })),
      state: 'loaded'
    },
    acervo: { processes: [], state: 'loaded' }
  };
}

console.log('[T8] DOM repetido: mesmo expediente lógico com N situações vira 1 comunicação com N memberships...');
const duplicated = mergePjeCommunicationsIntoState(
  { processes: [], tasks: [], communications: [] },
  makeDuplicatedInventory(['fp:instavel-a', 'fp:instavel-b'], ['Pendentes de ciência ou de resposta', 'Apenas pendentes de resposta']),
  { workspaceId: 'ws-alfa', now: '2026-09-18T10:00:00.000Z' }
);
assert.equal(duplicated.counters.communicationsCreated, 1, 'Fingerprints instáveis do mesmo conteúdo não podem criar duplicatas.');
assert.equal(duplicated.state.communications.length, 1);
assert.deepEqual(duplicated.state.communications[0].situationMemberships, [
  'Pendentes de ciência ou de resposta',
  'Apenas pendentes de resposta'
]);
console.log('  ✓ Dedupe por conteúdo lógico e união de memberships; 1 comunicação para o expediente repetido.');

console.log('[T9] Mudança de fingerprint entre syncs acumula vínculos sem duplicar...');
const firstSync = mergePjeCommunicationsIntoState(
  { processes: [], tasks: [], communications: [] },
  makeDuplicatedInventory(['fp:semana-1'], ['Pendentes de ciência ou de resposta']),
  { workspaceId: 'ws-alfa', now: '2026-09-18T10:00:00.000Z' }
);
assert.equal(firstSync.counters.communicationsCreated, 1);
const secondSync = mergePjeCommunicationsIntoState(
  firstSync.state,
  makeDuplicatedInventory(['fp:semana-2'], ['Apenas pendentes de resposta']),
  { workspaceId: 'ws-alfa', now: '2026-09-18T11:00:00.000Z' }
);
assert.equal(secondSync.counters.communicationsCreated, 0, 'Fingerprint novo não pode criar segunda comunicação do mesmo expediente.');
assert.equal(secondSync.counters.communicationsUpdated, 1);
assert.equal(secondSync.state.communications.length, 1);
assert.deepEqual(secondSync.state.communications[0].situationMemberships, [
  'Pendentes de ciência ou de resposta',
  'Apenas pendentes de resposta'
]);
assert.equal(secondSync.state.communications[0].sourceCommunicationId, 'fp:semana-2', 'Proveniência acompanha a coleta atual.');
assert.equal(secondSync.state.communications[0].id, firstSync.state.communications[0].id, 'ID interno permanece estável para preservar tratamento humano.');
const thirdSync = mergePjeCommunicationsIntoState(
  secondSync.state,
  makeDuplicatedInventory(['fp:semana-2'], ['Apenas pendentes de resposta']),
  { workspaceId: 'ws-alfa', now: '2026-09-18T12:00:00.000Z' }
);
assert.equal(thirdSync.counters.communicationsUnchanged, 1, 'Reenvio do mesmo conteúdo é idempotente.');
assert.deepEqual(thirdSync.state.communications[0].situationMemberships, [
  'Pendentes de ciência ou de resposta',
  'Apenas pendentes de resposta'
]);
console.log('  ✓ Mesma comunicação acumula memberships; sem versão nova quando nada muda.');

console.log('[T10] IDs externos estáveis distintos coexistem mesmo com conteúdo idêntico...');
const stableDuplicated = mergePjeCommunicationsIntoState(
  { processes: [], tasks: [], communications: [] },
  makeDuplicatedInventory(['id:53180112', 'id:53180115'], [undefined, undefined]),
  { workspaceId: 'ws-alfa', now: '2026-09-18T10:00:00.000Z' }
);
assert.equal(stableDuplicated.counters.communicationsCreated, 2, 'Dois expedientes distintos do mesmo CNJ não podem ser colapsados.');
assert.equal(stableDuplicated.state.communications.length, 2);
console.log('  ✓ Coexistência preservada quando a fonte fornece IDs externos distintos.');

console.log('\n>>> JUDICIAL COMMUNICATION: PASS <<<\n');
