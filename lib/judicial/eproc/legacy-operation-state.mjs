import { randomBytes } from 'node:crypto';

/**
 * Estado da operação eproc legada (sweep/enrich/download em server.mjs).
 *
 * Separação explícita de conceitos:
 * - busy global: existe operação eproc ativa no processo (serialização de browsers/OpenSSL);
 * - owner: workspace ao qual a operação ativa pertence.
 *
 * Regras de segurança:
 * - acquire() gera um token/lease único; release(token) só libera o dono corrente;
 * - passagem de tempo NUNCA libera uma operação ativa: o limiar de longa duração é
 *   apenas telemetria (warning único). Operação genuinely hung exige cancelamento real
 *   ou restart administrativo;
 * - um workspace que encontra operação ativa de outro recebe apenas mensagem sanitizada
 *   e nunca pode liberar ou resetar a trava alheia.
 */

export const EPROC_LOCK_WARN_AFTER_MS = 120_000;

export function emptyEprocSweepJob(workspaceId = null) {
  return {
    workspaceId,
    id: null,
    status: 'idle',
    determinate: false,
    progress: null,
    completed: null,
    total: null,
    phase: '',
    step: 1,
    action: '',
    logs: [],
    error: null,
    result: null,
    startedAt: 0,
    updatedAt: 0
  };
}

/**
 * Composição do guard de reset de fábrica para operações eproc do workspace alvo.
 * Deve cobrir: job oficial do scheduler, acompanhamento do sweep legado e lease legado
 * (enrich-single/download-autos não criam job e só são visíveis pelo lease).
 */
export function isEprocWorkspaceBusy({ schedulerJobActive = false, sweepJobRunning = false, leaseHeldByWorkspace = false } = {}) {
  return Boolean(schedulerJobActive || sweepJobRunning || leaseHeldByWorkspace);
}

/** O acompanhamento de um job só pode ser limpo quando a varredura não está em execução. */
export function canClearEprocJob(job) {
  return String(job?.status || 'idle') !== 'running';
}

export function createEprocLockRegistry({ warnAfterMs = EPROC_LOCK_WARN_AFTER_MS, now = () => Date.now(), logger = console } = {}) {
  let lock = null;

  const warnIfLongRunning = () => {
    if (!lock || lock.warned) return;
    const elapsed = now() - lock.startedAt;
    if (elapsed >= warnAfterMs) {
      lock.warned = true;
      logger.warn?.(`[eproc lock] Operação "${lock.op}" ativa há ${Math.round(elapsed / 1000)}s. Nenhuma liberação automática: a trava permanece até a conclusão real ou restart administrativo.`);
    }
  };

  return {
    isBusy() {
      warnIfLongRunning();
      return Boolean(lock);
    },
    isBusyFor(workspaceId) {
      warnIfLongRunning();
      return Boolean(lock && workspaceId && lock.workspaceId === workspaceId);
    },
    acquire(op, cnj = null, workspaceId = null) {
      warnIfLongRunning();
      if (lock) {
        const elapsedSec = Math.round((now() - lock.startedAt) / 1000);
        // Mensagem sanitizada: nunca expõe op/CNJ/metadados do dono da operação.
        return {
          acquired: false,
          code: 'EPROC_BUSY',
          message: `Já existe uma operação eproc em andamento neste servidor, iniciada há ${elapsedSec}s. Aguarde a conclusão anterior.`
        };
      }
      const token = randomBytes(16).toString('base64url');
      lock = {
        token,
        op: String(op || 'operação'),
        cnj: cnj ? String(cnj).trim() : null,
        startedAt: now(),
        workspaceId: workspaceId || null,
        warned: false
      };
      return { acquired: true, token };
    },
    release(token) {
      if (!lock || !token || lock.token !== token) return false;
      lock = null;
      return true;
    }
  };
}
