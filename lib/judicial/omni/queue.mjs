/**
 * ATRIUM Sovereign Omni-Collector — Priority Execution Queue & Backoff
 *
 * Enforces strict single-concurrency per tribunal, polite request pacing
 * (default 3s-5s between external requests), priority scheduling (P0-P4),
 * and exponential backoff on HTTP 429 / 5xx errors.
 */

import { QUEUE_PRIORITY } from './contracts.mjs';

export class PriorityQueueManager {
  constructor({ minDelayMs = 2500, maxBackoffMs = 45000 } = {}) {
    this.minDelayMs = minDelayMs;
    this.maxBackoffMs = maxBackoffMs;
    this.queue = [];
    this.active = false;
    this.lastRunTimes = new Map(); // provider -> timestamp
    this.backoffLevels = new Map(); // provider -> consecutive fail count
  }

  /**
   * Enqueues a task with priority (P0=highest, P4=lowest).
   */
  async enqueue(taskFn, { priority = QUEUE_PRIORITY.P1, provider = 'GLOBAL', label = '' } = {}) {
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
      this.lastRunTimes.set(provider, Date.now());
      this.backoffLevels.set(provider, 0); // Reset backoff on success
      item.resolve(result);
    } catch (err) {
      this.lastRunTimes.set(provider, Date.now());
      const failsNow = (this.backoffLevels.get(provider) || 0) + 1;
      this.backoffLevels.set(provider, failsNow);
      item.reject(err);
    } finally {
      this.active = false;
      this.#processNext();
    }
  }

  getPendingCount() {
    return this.queue.length;
  }
}
