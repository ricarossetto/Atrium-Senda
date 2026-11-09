import assert from 'node:assert/strict';
import { applyPjeInventoryToState } from '../lib/judicial/pje/sync/pje-sync-service.mjs';

let assertions = 0;
const ok = (condition, message) => { assert.ok(condition, message); assertions += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };

console.log('--- Iniciando Testes: ingestão da pauta do PJe ---');

const session = {
  cnj: '50000000020268210002',
  processNumber: '5000000-00.2026.8.21.0002',
  sessionStart: '2026-10-28T00:00:00',
  sessionEnd: '2026-10-30T17:00:00',
  sessionMode: 'VIRTUAL_ASSINCRONA',
  panel: '15ª Câmara Cível',
  sequential: '341',
  status: 'DESIGNADA',
  event: 'Sessão Virtual Assíncrona'
};

const envelope = {
  revision: 7,
  state: { processes: [], tasks: [], agenda: [], intimations: [], communications: [], audit: [] }
};

let saved = null;
const result = await applyPjeInventoryToState({
  readAppStateEnvelope: async () => envelope,
  saveState: async (state, revision, workspaceId) => { saved = { state, revision, workspaceId }; },
  workspaceId: 'ws-teste',
  inventory: {
    portalId: 'pje-tjmt-2g',
    portalName: 'PJe TJMT',
    collectedAt: '2026-10-30T06:00:00.000Z',
    acervo: { state: 'loaded', processes: [] },
    expedientes: { state: 'loaded', processes: [] },
    pauta: {
      portalId: 'pje-tjmt-2g',
      portalLabel: 'TJMT 2G',
      sessions: [session],
      collectionStatus: { discovered: true, collected: true },
      errors: []
    }
  }
});

ok(saved, 'estado salvo');
eq(saved.revision, 7, 'revisão preservada');
eq(saved.workspaceId, 'ws-teste', 'workspace preservado');
eq(result.sessionCounters?.created, 1, 'uma sessão criada');
const event = saved.state.agenda.find(item => item.processNumber === session.processNumber);
ok(event, 'sessão na agenda salva');
eq(event.source, 'pje TJMT 2G', 'origem pje');
eq(event.sessionEnd, '2026-10-30T17:00:00', 'período preservado');
ok(!event.deadline && !event.taskId, 'sem prazo e sem tarefa');

// Sem coleta concluída, nada é reconciliado nem salvo em agenda.
const second = await applyPjeInventoryToState({
  readAppStateEnvelope: async () => ({ revision: 8, state: { processes: [], tasks: [], agenda: [], intimations: [], communications: [], audit: [] } }),
  saveState: async () => {},
  workspaceId: 'ws-teste',
  inventory: {
    portalId: 'pje-tjmt-2g',
    portalName: 'PJe TJMT',
    collectedAt: '2026-10-30T07:00:00.000Z',
    acervo: { state: 'loaded', processes: [] },
    expedientes: { state: 'loaded', processes: [] },
    pauta: { portalId: 'pje-tjmt-2g', portalLabel: 'TJMT 2G', sessions: [], collectionStatus: { discovered: true, collected: false }, errors: [] }
  }
});
eq(second.sessionCounters, null, 'coleta incompleta não reconcilia');

console.log(`✓ ${assertions} verificações aprovadas.`);
console.log('PASS: ingestão da pauta do PJe validada.');
