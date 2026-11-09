import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGracefulShutdown } from '../lib/graceful-shutdown.mjs';

const silentLogger = { log: () => {}, warn: () => {} };

function createWorkerStub({ processing = false } = {}) {
  return {
    stopped: false,
    isProcessing: processing,
    stop() { this.stopped = true; this.isProcessing = false; }
  };
}

describe('Graceful Shutdown', () => {
  it('encerra imediatamente quando não há jobs e worker ociosos', async () => {
    const worker = createWorkerStub();
    let exitCode = null;
    let lockReleased = false;
    const shutdown = createGracefulShutdown({
      getActiveJobs: () => new Map(),
      getSweepJobs: () => new Map(),
      notificationWorker: worker,
      isEprocBusy: () => false,
      releaseInstanceLock: () => { lockReleased = true; },
      graceTimeoutMs: 1_000,
      exitFunction: code => { exitCode = code; },
      logger: silentLogger
    });

    await shutdown.shutdown('SIGTERM');

    assert.equal(worker.stopped, true, 'worker deve ser parado antes da saída');
    assert.equal(lockReleased, true, 'lock de instância deve ser liberado');
    assert.equal(exitCode, 0, 'saída deve ser com código 0');
  });

  it('aguarda job eproc RUNNING finalizar antes de sair', async () => {
    let running = true;
    let exitCode = null;
    const shutdown = createGracefulShutdown({
      getActiveJobs: async () => new Map([['ws-1', { state: running ? 'RUNNING' : 'COMPLETED' }]]),
      getSweepJobs: () => new Map(),
      notificationWorker: createWorkerStub(),
      isEprocBusy: () => false,
      releaseInstanceLock: () => {},
      graceTimeoutMs: 5_000,
      exitFunction: code => { exitCode = code; },
      logger: silentLogger
    });

    const pending = shutdown.shutdown('SIGTERM');
    // O job "finaliza" 300ms após o início da espera.
    setTimeout(() => { running = false; }, 300);
    await pending;

    assert.equal(exitCode, 0, 'saída deve ocorrer após o job finalizar');
  });

  it('força a saída após o timeout quando o job não finaliza', async () => {
    const startedAt = Date.now();
    let exitCode = null;
    const shutdown = createGracefulShutdown({
      getActiveJobs: async () => new Map([['ws-1', { state: 'RUNNING' }]]),
      getSweepJobs: () => new Map([['ws-1', { status: 'running' }]]),
      notificationWorker: createWorkerStub(),
      isEprocBusy: () => true,
      releaseInstanceLock: () => {},
      graceTimeoutMs: 300,
      exitFunction: code => { exitCode = code; },
      logger: silentLogger
    });

    await shutdown.shutdown('SIGTERM');

    const elapsed = Date.now() - startedAt;
    assert.ok(elapsed >= 250, `espera deve respeitar o timeout (decorrido ${elapsed}ms)`);
    assert.equal(exitCode, 1, 'saída forçada com jobs ativos deve usar código não-zero');
  });

  it('fecha a admissão e drena persistência antes de sair', async () => {
    let closeServerCalls = 0;
    let persistenceDrains = 0;
    let exitCode = null;
    let shuttingDownDuringDrain = false;
    const shutdown = createGracefulShutdown({
      getActiveJobs: () => new Map(),
      getSweepJobs: () => new Map(),
      notificationWorker: createWorkerStub(),
      isEprocBusy: () => false,
      closeServer: async () => { closeServerCalls += 1; },
      drainPersistence: async () => {
        persistenceDrains += 1;
        shuttingDownDuringDrain = shutdown.isShuttingDown();
        return true;
      },
      releaseInstanceLock: () => {},
      graceTimeoutMs: 1_000,
      exitFunction: code => { exitCode = code; },
      logger: silentLogger
    });

    await shutdown.shutdown('SIGTERM');

    assert.equal(closeServerCalls, 1, 'listener HTTP deve ser fechado uma vez');
    assert.equal(persistenceDrains, 1, 'filas de persistência devem ser drenadas');
    assert.equal(shuttingDownDuringDrain, true, 'admissão deve estar fechada durante o drain');
    assert.equal(exitCode, 0);
  });

  it('não trava quando a consulta de jobs nunca responde e sai com código não-zero', async () => {
    const startedAt = Date.now();
    let exitCode = null;
    const shutdown = createGracefulShutdown({
      getActiveJobs: () => new Promise(() => {}),
      getSweepJobs: () => new Map(),
      notificationWorker: createWorkerStub(),
      isEprocBusy: () => false,
      releaseInstanceLock: () => {},
      graceTimeoutMs: 250,
      exitFunction: code => { exitCode = code; },
      logger: silentLogger
    });

    await shutdown.shutdown('SIGTERM');
    const elapsed = Date.now() - startedAt;
    assert.ok(elapsed < 3_000, `deadline deve ser aplicado mesmo com callback pendente (decorrido ${elapsed}ms)`);
    assert.equal(exitCode, 1, 'deadline não aplicável deve resultar em código não-zero');
  });

  it('aguarda job PJe ativo e força subprocessos do coletor no timeout', async () => {
    let pjeRunning = true;
    const killed = [];
    let exitCode = null;
    const shutdown = createGracefulShutdown({
      getActiveJobs: () => new Map(),
      getSweepJobs: () => new Map(),
      getPjeJobs: () => new Map([['pje-1', { status: pjeRunning ? 'RUNNING' : 'COMPLETED' }]]),
      getCollectorChildren: () => (pjeRunning ? [{ pid: 1 }] : []),
      stopCollectorChildren: ({ force }) => { killed.push(force ? 'SIGKILL' : 'SIGTERM'); },
      notificationWorker: createWorkerStub(),
      isEprocBusy: () => false,
      releaseInstanceLock: () => {},
      graceTimeoutMs: 2_000,
      exitFunction: code => { exitCode = code; },
      logger: silentLogger
    });

    const pending = shutdown.shutdown('SIGTERM');
    setTimeout(() => { pjeRunning = false; }, 300);
    await pending;

    assert.equal(exitCode, 0, 'saída limpa após o job PJe terminar');
    assert.deepEqual(killed, ['SIGTERM'], 'subprocessos devem ser encerrados cooperativamente no drain limpo');
  });

  it('persistência pendente no timeout resulta em código não-zero', async () => {
    let exitCode = null;
    const shutdown = createGracefulShutdown({
      getActiveJobs: () => new Map(),
      getSweepJobs: () => new Map(),
      notificationWorker: createWorkerStub(),
      isEprocBusy: () => false,
      drainPersistence: async () => false,
      releaseInstanceLock: () => {},
      graceTimeoutMs: 500,
      exitFunction: code => { exitCode = code; },
      logger: silentLogger
    });

    await shutdown.shutdown('SIGTERM');
    assert.equal(exitCode, 1, 'fila de persistência pendente deve impedir saída limpa');
  });

  it('segundo sinal escala a saída imediata com código não-zero', async () => {
    let exitCode = null;
    let releaseDrain;
    const drainGate = new Promise(resolve => { releaseDrain = resolve; });
    const shutdown = createGracefulShutdown({
      getActiveJobs: async () => { await drainGate; return new Map(); },
      getSweepJobs: () => new Map(),
      notificationWorker: createWorkerStub(),
      isEprocBusy: () => false,
      releaseInstanceLock: () => {},
      graceTimeoutMs: 5_000,
      exitFunction: code => { exitCode = code; },
      logger: silentLogger
    });

    const pending = shutdown.shutdown('SIGTERM');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(shutdown.isShuttingDown(), true);
    shutdown.forceExit();
    assert.equal(exitCode, 1, 'segundo sinal deve encerrar imediatamente com código não-zero');
    releaseDrain();
    await pending;
  });

  it('aguarda o worker de notificações concluir o ciclo antes de sair', async () => {
    const worker = createWorkerStub({ processing: true });
    let exitCode = null;
    const shutdown = createGracefulShutdown({
      getActiveJobs: () => new Map(),
      getSweepJobs: () => new Map(),
      notificationWorker: worker,
      isEprocBusy: () => false,
      releaseInstanceLock: () => {},
      graceTimeoutMs: 5_000,
      exitFunction: code => { exitCode = code; },
      logger: silentLogger
    });

    const pending = shutdown.shutdown('SIGTERM');
    setTimeout(() => { worker.isProcessing = false; }, 250);
    await pending;

    assert.equal(worker.stopped, true);
    assert.equal(exitCode, 0);
  });

  it('ignora chamadas repetidas (idempotente durante o encerramento)', async () => {
    let exitCalls = 0;
    const shutdown = createGracefulShutdown({
      getActiveJobs: () => new Map(),
      getSweepJobs: () => new Map(),
      notificationWorker: createWorkerStub(),
      isEprocBusy: () => false,
      releaseInstanceLock: () => {},
      graceTimeoutMs: 1_000,
      exitFunction: () => { exitCalls += 1; },
      logger: silentLogger
    });

    await Promise.all([shutdown.shutdown('SIGTERM'), shutdown.shutdown('SIGTERM')]);
    // O segundo shutdown retorna a mesma promise; o exit é agendado uma única vez
    // (setImmediate aguarda o microtask corrente resolver antes de disparar).
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(exitCalls, 1, 'exit deve ser agendado apenas uma vez');
  });
});
