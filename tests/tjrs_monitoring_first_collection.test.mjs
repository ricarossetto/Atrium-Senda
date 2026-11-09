import assert from 'node:assert/strict';
import { refreshMonitoredTjrsProcesses } from '../lib/judicial/tjrs-monitoring.mjs';

console.log('--- Iniciando Testes: monitor TJRS faz a primeira consulta aos poucos ---');

const cnj = index => `${String(5000000 + index).padStart(7, '0')}-00.2026.8.21.0001`;
const notFound = () => Object.assign(new Error('Sem cópia guardada.'), { code: 'NOT_FOUND' });
const snapshotFor = number => ({
  metadata: { cnj: number.replace(/\D/g, ''), title: 'Processo de Teste' },
  parties: [],
  movements: [],
  provenance: {}
});
const credentialManager = { getProcessAccessKey: async () => 'chave-de-teste' };
const processes = count => Array.from({ length: count }, (_, index) => ({ number: cnj(index), court: 'TJRS' }));

function fakeClient({ collected = new Set(), collectError = null } = {}) {
  const calls = { collect: 0 };
  return {
    calls,
    health: async () => ({ state: 'AVAILABLE' }),
    getProcess: async number => {
      if (!collected.has(number)) throw notFound();
      return snapshotFor(number);
    },
    getDiff: async () => { throw notFound(); },
    collectProcess: async number => {
      calls.collect += 1;
      if (collectError) throw collectError;
      collected.add(number);
      return snapshotFor(number);
    }
  };
}

// Sem cópia guardada não é serviço fora do ar: faz o lote, deixa o resto e não interrompe.
{
  const client = fakeClient();
  const result = await refreshMonitoredTjrsProcesses({ processes: processes(25), credentialManager, client, maxFirstCollections: 10 });
  assert.equal(client.calls.collect, 10);
  assert.equal(result.firstCollections, 10);
  assert.equal(result.pendingFirstCollection, 15);
  assert.equal(result.checked, 10);
  assert.equal(result.failed, 0);
  assert.equal(result.aborted, false);
}

// Próximos ciclos continuam de onde parou, até cobrir todos.
{
  const collected = new Set();
  const client = fakeClient({ collected });
  for (let ciclo = 0; ciclo < 3; ciclo += 1) {
    await refreshMonitoredTjrsProcesses({ processes: processes(25), credentialManager, client, maxFirstCollections: 10 });
  }
  assert.equal(collected.size, 25);
  const final = await refreshMonitoredTjrsProcesses({ processes: processes(25), credentialManager, client, maxFirstCollections: 10 });
  assert.equal(final.checked, 25);
  assert.equal(final.pendingFirstCollection, 0);
  assert.equal(final.firstCollections, 0);
}

// Portal fora do ar na primeira consulta continua interrompendo e dizendo o motivo.
{
  const client = fakeClient({ collectError: Object.assign(new Error('Fora do ar.'), { code: 'UNAVAILABLE' }) });
  const result = await refreshMonitoredTjrsProcesses({ processes: processes(25), credentialManager, client, maxFirstCollections: 50 });
  assert.equal(result.aborted, true);
  assert.deepEqual(result.failureCodes, { UNAVAILABLE: 10 });
}

// Chave recusada não interrompe a fila, fica registrada e só volta depois do prazo ou de chave nova.
{
  const rejected = Object.assign(new Error('Chave recusada.'), { code: 'ACCESS_KEY_REJECTED' });
  const client = fakeClient({ collectError: rejected });
  const lista = processes(25);
  const agora = Date.parse('2026-11-02T12:00:00Z');
  const primeiro = await refreshMonitoredTjrsProcesses({ processes: lista, credentialManager, client, maxFirstCollections: 10, now: agora });
  assert.equal(primeiro.aborted, false, 'chave recusada não é serviço fora do ar');
  assert.equal(primeiro.failed, 0);
  assert.equal(primeiro.keyRejected, 10);
  assert.equal(primeiro.pendingFirstCollection, 15);
  assert.equal(client.calls.collect, 10);

  const segundo = await refreshMonitoredTjrsProcesses({ processes: primeiro.processes, credentialManager, client, maxFirstCollections: 10, now: agora + 60_000 });
  assert.equal(client.calls.collect, 20, 'o ciclo seguinte passa para outras chaves');
  assert.equal(segundo.keyRejected, 20);
  assert.equal(segundo.pendingFirstCollection, 5);

  const trintaDias = agora + 31 * 24 * 60 * 60 * 1000;
  const depois = await refreshMonitoredTjrsProcesses({ processes: [primeiro.processes[0]], credentialManager, client, now: trintaDias });
  assert.equal(depois.firstCollections, 1, 'depois do prazo tenta de novo');

  const chaveNova = { ...primeiro.processes[0], accessKeyUpdatedAt: new Date(agora + 120_000).toISOString() };
  const trocada = await refreshMonitoredTjrsProcesses({ processes: [chaveNova], credentialManager, client, now: agora + 180_000 });
  assert.equal(trocada.firstCollections, 1, 'chave trocada tenta de novo');
}

console.log('[PASS] Monitor TJRS faz a primeira consulta aos poucos.');
