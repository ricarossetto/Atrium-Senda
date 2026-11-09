import { SUPERVISED_TRANSACTIONAL_EVENTS } from './notification-service.mjs';

export class NotificationWorker {
  constructor({
    getDatabases, // Function returning array or map of NotificationDatabase instances
    provider,
    pollIntervalMs = 5000,
    claimBatchSize = 10,
    claimTimeoutMinutes = 5,
    now = () => Date.now(),
    logger = console
  }) {
    this.getDatabases = getDatabases;
    this.provider = provider;
    this.pollIntervalMs = pollIntervalMs;
    this.claimBatchSize = claimBatchSize;
    this.claimTimeoutMinutes = claimTimeoutMinutes;
    this.logger = logger;
    this.now = now;
    this.timer = null;
    this.isRunning = false;
    this.isProcessing = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.timer = setInterval(() => this.processCycle().catch(err => {
      this.logger.warn?.('[NotificationWorker] Erro no ciclo de envio:', err.message);
    }), this.pollIntervalMs);
    this.timer.unref?.();
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async processCycle() {
    if (this.isProcessing) return { skipped: true, reason: 'ALREADY_PROCESSING' };
    this.isProcessing = true;

    let processedCount = 0;
    try {
      const databases = typeof this.getDatabases === 'function' ? await this.getDatabases() : [];
      const dbList = Array.isArray(databases) ? databases : Object.values(databases);

      for (const db of dbList) {
        if (!db) continue;
        const count = await this.processDatabase(db);
        processedCount += count;
      }
    } finally {
      this.isProcessing = false;
    }

    return { processedCount };
  }

  async processDatabase(db) {
    if (db.isGlobalPaused()) {
      return 0;
    }

    const workspaceEnabled = db.isWorkspaceEnabled();
    // A disabled workspace may only drain the explicit supervised transactional items.
    // All product-generated notifications remain queued until the workspace is
    // enabled; the global pause still takes precedence above.
    const claimOptions = workspaceEnabled ? null : { eventTypes: SUPERVISED_TRANSACTIONAL_EVENTS };

    const budget = this.provider.checkBudget(db);
    if (!budget.allowed) {
      this.logger.warn?.(`[NotificationWorker] Envio suspenso por orçamento: ${budget.message}`);
      return 0;
    }

    const claimed = db.claimNextOutboxBatch(this.claimBatchSize, this.claimTimeoutMinutes, claimOptions);
    if (!claimed || claimed.length === 0) return 0;

    let sent = 0;
    for (const item of claimed) {
      // Re-verify budget per item
      const itemBudget = this.provider.checkBudget(db);
      if (!itemBudget.allowed) {
        db.markOutboxRetryable(item.id, new Error(itemBudget.message), 300);
        continue;
      }

      // Check recipient suppression
      if (db.isSuppressed(item.recipient)) {
        db.markOutboxCancelled(item.id, 'Destinatário suprimido por histórico de bounce/reclamação.');
        continue;
      }

      try {
        const permission = db.beginProviderAttempt(item.id, item, this.now());
        if (!permission.allowed) {
          if (permission.reason === 'GLOBAL_PAUSED') db.markOutboxRetryable(item.id, 'GLOBAL_PAUSED', 300);
          continue;
        }
        const payload = permission.item.payload || {};
        const sendResult = await this.provider.sendEmail({
          from: payload.from,
          to: item.recipient,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
          idempotencyKey: item.idempotency_key,
          tags: payload.tags || [],
          headers: payload.headers || {}
        });

        db.markOutboxSent(item.id, {
          providerMessageId: sendResult.providerMessageId
        });
        sent++;
      } catch (sendErr) {
        const isRetryable = sendErr.retryable !== false;
        if (isRetryable) {
          // Exponential backoff with jitter
          const baseDelay = Math.min(3600, Math.pow(2, item.attempts) * 15);
          const jitter = Math.floor(Math.random() * 10);
          const delaySeconds = sendErr.retryAfterSeconds || (baseDelay + jitter);

          const reason = sendErr.cause ? 'DELIVERY_UNCONFIRMED' : 'DELIVERY_RETRYABLE_REJECTION';
          db.markOutboxRetryable(item.id, reason, delaySeconds);
          this.logger.warn?.(`[NotificationWorker] ${reason}; tentativa ${item.attempts}, retry em ${delaySeconds}s.`);
        } else {
          db.markOutboxFailed(item.id, 'DELIVERY_REJECTED');
          this.logger.error?.('[NotificationWorker] DELIVERY_REJECTED');
        }
      }
    }

    return sent;
  }
}
