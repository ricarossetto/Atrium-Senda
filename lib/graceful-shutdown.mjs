/**
 * Coordena o encerramento gracioso do servidor durante deploy/restart.
 *
 * Garante que:
 * - a admissão de novas requisições é fechada antes do drain (sem trabalho novo);
 * - nenhuma sweep eproc/PJe/coletor ativa seja interrompida abruptamente;
 * - filas de persistência oficial (app-state/runtime) sejam drenadas;
 * - o worker de notificações termine o ciclo atual;
 * - locks de instância sejam liberados;
 * - timeout de segurança seja aplicável mesmo se um callback não responder;
 * - saída forçada (timeout ou segundo sinal) use código não-zero.
 *
 * @param {object} options
 * @param {Function} options.getActiveJobs - Map de jobs eproc ativos (workspaceId -> job)
 * @param {Function} options.getSweepJobs - Map de sweep jobs (workspaceId -> job)
 * @param {Function} options.getPjeJobs - Map de jobs PJe ativos (jobId -> job)
 * @param {Function} options.getCollectorChildren - Lista de subprocessos do coletor
 * @param {Function} options.stopCollectorChildren - Sinaliza término dos subprocessos ({ force })
 * @param {Function} options.drainPersistence - Drena filas de persistência (resolve false se pendente)
 * @param {Function} options.closeServer - Fecha o listener HTTP (para de admitir conexões)
 * @param {object} options.notificationWorker - Instância de NotificationWorker
 * @param {Function} options.isEprocBusy - Verifica se há lease eproc ativo
 * @param {Function} options.releaseInstanceLock - Libera o lock de instância única
 * @param {number} options.graceTimeoutMs - Tempo máximo de espera dos jobs (default: 60s)
 * @param {number} options.persistenceDrainTimeoutMs - Tempo máximo do drain de persistência (default: 20s)
 * @param {number} options.workerDrainTimeoutMs - Tempo máximo do worker de notificações (default: 15s)
 * @param {Function} options.exitFunction - Saída do processo (injetável para testes; default: process.exit)
 * @param {object} options.logger - Logger (default: console)
 */
const DEADLINE = Symbol('graceful-shutdown-deadline');

export function createGracefulShutdown({
  getActiveJobs = () => new Map(),
  getSweepJobs = () => new Map(),
  getPjeJobs = () => new Map(),
  getCollectorChildren = () => [],
  stopCollectorChildren = () => {},
  drainPersistence = async () => true,
  closeServer = async () => {},
  notificationWorker = null,
  isEprocBusy = () => false,
  persistSessions = null,
  releaseInstanceLock = () => {},
  graceTimeoutMs = 60_000,
  persistenceDrainTimeoutMs = 20_000,
  workerDrainTimeoutMs = 15_000,
  exitFunction = code => process.exit(code),
  logger = console
} = {}) {
  let shuttingDown = false;
  let shutdownPromise = null;
  let forcedExit = false;

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  // Enforça o deadline mesmo quando o callback não responde (promise pendente).
  const withDeadline = async (promise, ms) => {
    let timer;
    const deadline = new Promise(resolve => {
      timer = setTimeout(() => resolve(DEADLINE), Math.max(1, ms));
      timer.unref?.();
    });
    try {
      return await Promise.race([Promise.resolve(promise), deadline]);
    } finally {
      clearTimeout(timer);
    }
  };

  async function waitForActiveJobs() {
    const deadlineAt = Date.now() + graceTimeoutMs;

    while (Date.now() < deadlineAt) {
      const remaining = Math.max(1, deadlineAt - Date.now());
      const snapshot = await withDeadline((async () => ({
        eproc: await Promise.resolve(getActiveJobs()),
        sweep: await Promise.resolve(getSweepJobs()),
        pje: await Promise.resolve(getPjeJobs()),
        children: await Promise.resolve(getCollectorChildren())
      }))(), remaining);

      if (snapshot === DEADLINE) {
        logger.warn(`[GracefulShutdown] Consulta de jobs não respondeu dentro de ${graceTimeoutMs}ms. Forçando encerramento.`);
        return false;
      }

      const hasActiveEprocJob = Array.from(snapshot.eproc.values()).some(job => job?.state === 'RUNNING');
      const hasRunningSweep = Array.from(snapshot.sweep.values()).some(job => job?.status === 'running');
      const hasActivePjeJob = Array.from(snapshot.pje.values()).some(job => ['QUEUED', 'RUNNING'].includes(job?.status));
      const hasCollectorChildren = Array.from(snapshot.children || []).length > 0;
      const hasEprocLease = isEprocBusy();

      if (!hasActiveEprocJob && !hasRunningSweep && !hasActivePjeJob && !hasCollectorChildren && !hasEprocLease) {
        logger.log('[GracefulShutdown] Nenhum job eproc/PJe/coletor ativo. Prosseguindo com encerramento.');
        return true;
      }

      logger.log(`[GracefulShutdown] Aguardando jobs ativos: eproc=${hasActiveEprocJob}, sweep=${hasRunningSweep}, pje=${hasActivePjeJob}, coletor=${hasCollectorChildren}, lease=${hasEprocLease}...`);
      const sleepLeft = deadlineAt - Date.now();
      if (sleepLeft <= 0) break;
      await wait(Math.min(250, sleepLeft));
    }

    logger.warn(`[GracefulShutdown] Timeout de ${graceTimeoutMs}ms atingido. Forçando encerramento com jobs ativos.`);
    return false;
  }

  async function waitForNotificationWorker() {
    if (!notificationWorker) return true;

    const deadlineAt = Date.now() + workerDrainTimeoutMs;
    while (notificationWorker.isProcessing && Date.now() < deadlineAt) {
      logger.log('[GracefulShutdown] Aguardando worker de notificações...');
      await wait(100);
    }

    if (notificationWorker.isProcessing) {
      logger.warn(`[GracefulShutdown] Worker de notificações não finalizou em ${workerDrainTimeoutMs}ms. Forçando encerramento.`);
      return false;
    }
    return true;
  }

  async function drainPersistenceQueues() {
    const outcome = await withDeadline(Promise.resolve().then(() => drainPersistence()), persistenceDrainTimeoutMs);
    if (outcome === DEADLINE) {
      logger.warn(`[GracefulShutdown] Fila de persistência não drenou em ${persistenceDrainTimeoutMs}ms.`);
      return false;
    }
    if (outcome === false) {
      logger.warn('[GracefulShutdown] Persistência reportou operações oficiais pendentes.');
      return false;
    }
    return true;
  }

  function forceExit() {
    if (forcedExit) return;
    forcedExit = true;
    logger.warn('[GracefulShutdown] Segundo sinal recebido. Encerrando imediatamente com código não-zero.');
    try { releaseInstanceLock(); } catch {}
    exitFunction(1);
  }

  async function shutdown(signal = 'SIGTERM') {
    if (shuttingDown) return shutdownPromise;
    shuttingDown = true;

    shutdownPromise = (async () => {
      logger.log(`[GracefulShutdown] Sinal ${signal} recebido. Iniciando encerramento gracioso...`);

      // 1. Para o worker de notificações (não aceita novos itens)
      if (notificationWorker) {
        logger.log('[GracefulShutdown] Parando worker de notificações...');
        notificationWorker.stop();
      }

      // 2. Fecha a admissão: para de aceitar novas conexões/requisições; as em
      // andamento terminam normalmente.
      try {
        const closed = await withDeadline(Promise.resolve().then(() => closeServer()), 5_000);
        if (closed === DEADLINE) logger.warn('[GracefulShutdown] Listener HTTP não fechou em 5s; seguindo com o drain.');
      } catch (error) {
        logger.warn(`[GracefulShutdown] Falha ao fechar o listener HTTP: ${error?.message || error}`);
      }

      // 3. Aguarda jobs eproc/PJe/coletor ativos
      const jobsDrained = await waitForActiveJobs();

      // 4. Subprocessos do coletor: término cooperativo; força se o drain falhou
      try {
        stopCollectorChildren({ force: !jobsDrained });
      } catch (error) {
        logger.warn(`[GracefulShutdown] Falha ao sinalizar subprocessos do coletor: ${error?.message || error}`);
      }

      // 5. Aguarda worker de notificações finalizar ciclo atual
      const workerDrained = await waitForNotificationWorker();

      // 6. Drena filas de persistência oficial (app-state/runtime)
      const persistenceDrained = await drainPersistenceQueues();

      // 7. Libera o lock de instância
      try {
        await persistSessions?.();
      } catch (error) {
        logger.warn?.('[GracefulShutdown] Sessões não foram guardadas:', error?.message || error);
      }

      logger.log('[GracefulShutdown] Liberando lock de instância...');
      releaseInstanceLock();

      const clean = jobsDrained && workerDrained && persistenceDrained && !forcedExit;
      logger.log(clean
        ? '[GracefulShutdown] Encerramento gracioso concluído.'
        : '[GracefulShutdown] Encerramento com pendências; saindo com código não-zero.');
      // Sair fora do contexto imediato do handler de sinal evita a assertiva
      // do libuv no Windows (src\win\async.c) quando handles ainda estão fechando.
      // A promise só resolve depois que a saída foi efetivamente agendada/executada.
      await new Promise(resolve => setImmediate(resolve));
      exitFunction(clean ? 0 : 1);
    })();

    return shutdownPromise;
  }

  return {
    shutdown,
    isShuttingDown: () => shuttingDown,
    forceExit
  };
}
