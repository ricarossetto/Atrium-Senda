/**
 * ATRIUM Sovereign Omni-Collector — Base Adapter
 *
 * Common base class for tribunal adapters with rate limiting,
 * timeouts, and synthetic mock injection support.
 */

let transportTail = Promise.resolve();
let lastRequestAt = 0;

import { cleanCnj, formatCnj, parseCnjSegments, resolveCourtFromCnj, CHALLENGE_STATUS } from '../contracts.mjs';

export class BaseAdapter {
  constructor({ customFetch = null, timeoutMs = 15000 } = {}) {
    this.customFetch = customFetch;
    this.timeoutMs = timeoutMs;
  }

  get courtCode() {
    throw new Error('Adapter must implement courtCode');
  }

  get source() {
    throw new Error('Adapter must implement source');
  }

  /**
   * Health and connectivity check.
   */
  async healthCheck() {
    return { ok: true, status: 'OK', latencyMs: 0, timestamp: new Date().toISOString() };
  }

  /**
   * Hydrates raw process snapshot by CNJ.
   */
  async collectProcess(cnj) {
    throw new Error('Adapter must implement collectProcess');
  }

  /**
   * Supervised OAB discovery.
   */
  async discoverByOab(params) {
    return [];
  }

  /**
   * Resource cleanup.
   */
  async close() {}

  /**
   * Internal HTTP execution with headers and abort signal.
   */
  async fetch(url, options = {}) {
    const execute = async () => {
      const headers = { 'User-Agent': 'ATRIUM-Omni-Collector/2.1', Accept: 'application/json, text/plain, */*', ...(options.headers || {}) };
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const custom = typeof this.customFetch === 'function';
      const hostname = new URL(url).hostname;
      const local = ['127.0.0.1', 'localhost', '[::1]'].includes(hostname);
      const spacing = local || custom ? 0 : /cnj.jus.br$|pje.jus.br$/.test(hostname) ? 400 : 3000;
      for (let attempt = 0; attempt < 3; attempt++) {
        const delay = Math.max(0, lastRequestAt + spacing - Date.now());
        if (delay) await wait(delay);
        const response = await (this.customFetch || globalThis.fetch)(url, {
          ...options, headers, signal: AbortSignal.timeout(options.timeoutMs || this.timeoutMs)
        });
        lastRequestAt = Date.now();
        if (!custom && (response.status === 429 || response.status >= 500) && attempt < 2) {
          await response.body?.cancel?.();
          await wait(Math.min(45000, 3000 * 2 ** attempt));
          continue;
        }
        return response;
      }
    };
    const pending = transportTail.then(execute, execute);
    transportTail = pending.catch(() => {});
    return pending;
  }

  cleanCnj(cnj) {
    return cleanCnj(cnj);
  }

  formatCnj(cnj) {
    return formatCnj(cnj);
  }

  resolveCourtFromCnj(cnj) {
    return resolveCourtFromCnj(cnj);
  }
}
