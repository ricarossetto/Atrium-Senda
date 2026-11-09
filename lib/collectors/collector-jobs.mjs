import { randomUUID } from 'node:crypto';

/**
 * H3 — registry de jobs de coletor por workspace + lock global de recurso.
 *
 * Separação de conceitos (mesmo princípio do lease eproc, H2):
 * - o recurso físico do coletor (Chromium/processo) é único por servidor: lock global
 *   com token de ownership;
 * - o estado do job (status, meta, erro) é estritamente por workspace: nenhum workspace
 *   lê, sobrescreve, cancela ou herda o job de outro.
 */

export function emptyCollectorJob(workspaceId) {
  return {
    workspaceId,
    jobId: null,
    kind: null,
    status: 'idle',
    portalIds: [],
    startedAt: 0,
    completedAt: null,
    exitCode: null,
    lastMessage: '',
    lastError: ''
  };
}

export function createCollectorRegistry({ now = () => Date.now() } = {}) {
  const jobs = new Map();
  const completions = new Map();
  let lock = null;

  return {
    acquire({ workspaceId, kind = 'collector', jobId = null } = {}) {
      if (!workspaceId) throw new Error('workspaceId é obrigatório para adquirir o recurso do coletor.');
      if (lock) {
        return {
          ok: false,
          busy: true,
          heldByRequestingWorkspace: lock.workspaceId === workspaceId,
          heldByWorkspace: lock.workspaceId,
          kind: lock.kind
        };
      }
      const token = randomUUID();
      lock = { token, workspaceId, kind, jobId, startedAt: now() };
      return { ok: true, token };
    },
    release(token) {
      if (!lock || !token || lock.token !== token) return false;
      lock = null;
      return true;
    },
    isLocked() {
      return Boolean(lock);
    },
    isLockedBy(workspaceId) {
      return Boolean(lock && workspaceId && lock.workspaceId === workspaceId);
    },
    getLockSnapshot() {
      return lock ? { workspaceId: lock.workspaceId, kind: lock.kind, startedAt: lock.startedAt } : null;
    },
    startJob({ workspaceId, kind = 'collector', portalIds = [] } = {}) {
      const job = {
        ...emptyCollectorJob(workspaceId),
        jobId: `col-${now()}-${randomUUID().slice(0, 8)}`,
        kind,
        status: 'running',
        portalIds: [...portalIds],
        startedAt: now()
      };
      jobs.set(workspaceId, job);
      return { ...job, portalIds: [...job.portalIds] };
    },
    updateJob(workspaceId, patch = {}) {
      const job = jobs.get(workspaceId);
      if (!job) return null;
      const { workspaceId: _ignored, ...safePatch } = patch;
      Object.assign(job, safePatch);
      return { ...job, portalIds: [...job.portalIds] };
    },
    finishJob(workspaceId, { status, exitCode = null, error = null } = {}) {
      const job = jobs.get(workspaceId);
      if (!job) return null;
      job.status = status || (exitCode === 0 ? 'completed' : 'failed');
      job.completedAt = now();
      job.exitCode = exitCode;
      if (error) job.lastError = String(error).slice(0, 500);
      return { ...job, portalIds: [...job.portalIds] };
    },
    getJob(workspaceId) {
      const job = jobs.get(workspaceId);
      if (!job) return emptyCollectorJob(workspaceId);
      return { ...job, portalIds: [...job.portalIds] };
    },
    isJobRunning(workspaceId) {
      return jobs.get(workspaceId)?.status === 'running';
    },
    removeJob(workspaceId) {
      jobs.delete(workspaceId);
      completions.delete(workspaceId);
    },
    setCompletion(workspaceId, promise) {
      completions.set(workspaceId, promise);
    },
    getCompletion(workspaceId) {
      return completions.get(workspaceId) || null;
    },
    clearCompletion(workspaceId) {
      completions.delete(workspaceId);
    }
  };
}
