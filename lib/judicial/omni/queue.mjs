/**
 * ATRIUM Sovereign Omni-Collector — Priority Execution Queue & Backoff
 *
 * Enforces strict single-concurrency per tribunal, polite request pacing
 * (default 3s-5s between external requests), priority scheduling (P0-P4),
 * and exponential backoff on HTTP 429 / 5xx errors.
 */

import { QUEUE_PRIORITY } from './contracts.mjs';

export class PriorityQueueManager {
  constructor({ minDelayMs = 2500, maxBackoffMs = 45000, maxPending = 200, maxProviderHistory = 200 } = {}) {
    this.minDelayMs = minDelayMs;
    this.maxBackoffMs = maxBackoffMs;
    this.maxPending = Math.max(1, Number(maxPending) || 200);
    this.maxProviderHistory = Math.max(1, Number(maxProviderHistory) || 200);
    this.queue = [];
    this.active = false;
    this.lastRunTimes = new Map(); // provider -> timestamp (bounded, FIFO)
    this.backoffLevels = new Map(); // provider -> consecutive fail count (bounded, FIFO)
  }

  /**
   * Enqueues a task with priority (P0=highest, P4=lowest).
   */
  async enqueue(taskFn, { priority = QUEUE_PRIORITY.P1, provider = 'GLOBAL', label = '' } = {}) {
    if (this.queue.length >= this.maxPending) {
      return Promise.reject(Object.assign(
        new Error('A fila do coletor atingiu o limite de operações pendentes. Aguarde a conclusão das consultas em andamento.'),
        { code: 'OMNI_QUEUE_OVERLOADED', statusCode: 503 }
      ));
    }
    return new Promise((resolve, reject) => {
      this.queue.push({
        taskFn,
        priority,
        provider,
        label,
        enqueuedAt: Date.now(),
        resolve,
        reject
      });

      // Sort by priority ascending (P0 first, then P1, etc.), then by enqueued time
      this.queue.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.enqueuedAt - b.enqueuedAt;
      });

      queueMicrotask(() => this.#processNext());
    });
  }

  async #processNext() {
    if (this.active || this.queue.length === 0) return;
    this.active = true;

    const item = this.queue.shift();
    const provider = item.provider;

    // Respect polite delay
    const lastRun = this.lastRunTimes.get(provider) || 0;
    const fails = this.backoffLevels.get(provider) || 0;
    let delay = this.minDelayMs;

    if (fails > 0) {
      delay = Math.min(this.minDelayMs * Math.pow(2, fails), this.maxBackoffMs);
    }

    const elapsed = Date.now() - lastRun;
    if (elapsed < delay) {
      await new Promise(r => setTimeout(r, delay - elapsed));
    }

    try {
      const result = await item.taskFn();
      this.#rememberProvider(provider);
      this.backoffLevels.set(provider, 0); // Reset backoff on success
      item.resolve(result);
    } catch (err) {
      this.#rememberProvider(provider);
      const failsNow = (this.backoffLevels.get(provider) || 0) + 1;
      this.backoffLevels.set(provider, failsNow);
      item.reject(err);
    } finally {
      this.active = false;
      this.#processNext();
    }
  }

  /**
   * Records a provider touch while keeping both provider maps bounded. The Maps
   * are insertion-ordered, so evicting the first key is FIFO and guarantees the
   * bookkeeping cannot grow without limit under a stream of arbitrary keys.
   */
  #rememberProvider(provider) {
    if (!this.lastRunTimes.has(provider) && this.lastRunTimes.size >= this.maxProviderHistory) {
      const oldest = this.lastRunTimes.keys().next().value;
      if (oldest !== undefined) {
        this.lastRunTimes.delete(oldest);
        this.backoffLevels.delete(oldest);
      }
    }
    this.lastRunTimes.set(provider, Date.now());
  }

  getPendingCount() {
    return this.queue.length;
  }

  getProviderHistorySize() {
    return this.lastRunTimes.size;
  }
}
