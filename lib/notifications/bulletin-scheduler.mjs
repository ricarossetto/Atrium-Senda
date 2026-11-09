export class EmailBulletinScheduler {
  constructor({ listWorkspaces, getUsers, getState, getService, withWorkspace = (_id, operation) => operation(), isWorkspaceActive = () => true, now = () => new Date(), limit = 100, logger = console, setIntervalFn = setInterval, clearIntervalFn = clearInterval }) {
    for (const dependency of [listWorkspaces, getUsers, getState, getService, withWorkspace, isWorkspaceActive, now]) {
      if (typeof dependency !== 'function') throw new TypeError('INVALID_BULLETIN_SCHEDULER_DEPENDENCY');
    }
    Object.assign(this, { listWorkspaces, getUsers, getState, getService, withWorkspace, isWorkspaceActive, now, logger, setIntervalFn, clearIntervalFn });
    this.limit = Math.max(1, Math.min(100, Number.isInteger(limit) ? limit : 100));
    this.timer = null;
    this.isRunning = false;
    this.isProcessing = false;
    this.stopped = false;
    this.cycle = null;
    this.workspaceJobs = new Map();
  }

  start() {
    if (this.isRunning) return;
    this.stopped = false;
    this.isRunning = true;
    this.timer = this.setIntervalFn(() => this.processCycle(), 30_000);
    this.timer.unref?.();
    return this.processCycle();
  }

  async stop() {
    this.stopped = true;
    this.isRunning = false;
    if (this.timer !== null) {
      this.clearIntervalFn(this.timer);
      this.timer = null;
    }
    await Promise.allSettled([this.cycle, ...this.workspaceJobs.values()]);
  }

  processCycle() {
    if (this.stopped) return Promise.resolve({ skipped: true, reason: 'STOPPED' });
    if (this.isProcessing) return Promise.resolve({ skipped: true, reason: 'ALREADY_PROCESSING' });
    this.isProcessing = true;
    this.cycle = Promise.resolve().then(async () => {
      const result = { processed: 0, enqueued: 0, failed: 0 };
      try {
        const workspaces = await this.listWorkspaces();
        const seen = new Set();
        for (const workspace of workspaces) {
          if (this.stopped) break;
          if (!workspace?.id || workspace.status !== 'active' || seen.has(workspace.id)) continue;
          seen.add(workspace.id);
          const outcome = await this.processWorkspace(workspace.id);
          if (outcome.skipped) continue;
          result.processed += outcome.processed || 0;
          result.enqueued += outcome.enqueued || 0;
          result.failed += outcome.failed || 0;
        }
      } catch {
        result.failed++;
        this.logger.warn?.('[EmailBulletinScheduler] Ciclo indisponível.', { reason: 'CYCLE_FAILED' });
      } finally {
        this.isProcessing = false;
      }
      return { ...result, reason: result.failed ? 'PARTIAL_FAILURE' : 'COMPLETED' };
    });
    return this.cycle;
  }

  processWorkspace(workspaceId) {
    if (this.stopped) return Promise.resolve({ skipped: true, reason: 'STOPPED' });
    if (this.workspaceJobs.has(workspaceId)) return Promise.resolve({ skipped: true, reason: 'ALREADY_PROCESSING' });
    const job = Promise.resolve().then(async () => {
      try {
        if (!this.isWorkspaceActive(workspaceId)) return { skipped: true, reason: 'WORKSPACE_UNAVAILABLE' };
        return await this.withWorkspace(workspaceId, async () => {
          const state = await this.getState(workspaceId);
          const users = await this.getUsers(workspaceId);
          if (this.stopped || !this.isWorkspaceActive(workspaceId)) return { skipped: true, reason: 'WORKSPACE_UNAVAILABLE' };
          const service = await this.getService(workspaceId);
          const now = this.now();
          const outcome = await service.dispatchScheduledBulletins(workspaceId, users, state, { now, limit: this.limit });
          const completionDigest = typeof service.dispatchTaskCompletionDigest === 'function'
            ? await service.dispatchTaskCompletionDigest(workspaceId, users, state, { now })
            : null;
          return {
            processed: 1,
            enqueued: (outcome.enqueued || 0) + (completionDigest?.enqueued || 0),
            failed: (outcome.failed || 0) + (completionDigest?.failed || 0)
          };
        });
      } catch {
        this.logger.warn?.('[EmailBulletinScheduler] Escritório não processado; próximo ciclo poderá tentar novamente.', { reason: 'WORKSPACE_FAILED' });
        return { processed: 0, enqueued: 0, failed: 1 };
      } finally {
        this.workspaceJobs.delete(workspaceId);
      }
    });
    this.workspaceJobs.set(workspaceId, job);
    return job;
  }
}
