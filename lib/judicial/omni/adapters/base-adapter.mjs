/**
 * ATRIUM Sovereign Omni-Collector — Base Adapter
 *
 * Common base class for tribunal adapters with rate limiting,
 * timeouts, and synthetic mock injection support.
 */

import { cleanCnj, formatCnj, parseCnjSegments, resolveCourtFromCnj, CHALLENGE_STATUS } from '../contracts.mjs';

export class BaseAdapter {
  constructor({ customFetch = null, timeoutMs = 15000 } = {}) {
    this.customFetch = customFetch;
    this.timeoutMs = timeoutMs;
    // H3: o pacing de transporte é serializado por host, mas o estado pertence à
    // instância do adaptador — um workspace não herda nem bloqueia o de outro.
    this.transportTails = new Map();
    this.lastRequestAtByHost = new Map();
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
  async collectProcess(cnj, options = {}) {
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
    const hostname = new URL(url).hostname;
    const execute = async () => {
      const headers = { 'User-Agent': 'ATRIUM-Omni-Collector/2.1', Accept: 'application/json, text/plain, */*', ...(options.headers || {}) };
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
      const custom = typeof this.customFetch === 'function';
      const local = ['127.0.0.1', 'localhost', '[::1]'].includes(hostname);
      const spacing = local || custom ? 0 : /cnj.jus.br$|pje.jus.br$/.test(hostname) ? 400 : 3000;
      for (let attempt = 0; attempt < 3; attempt++) {
        const delay = Math.max(0, (this.lastRequestAtByHost.get(hostname) || 0) + spacing - Date.now());
        if (delay) await wait(delay);
        const response = await (this.customFetch || globalThis.fetch)(url, {
          ...options, headers, signal: AbortSignal.timeout(options.timeoutMs || this.timeoutMs)
        });
        this.lastRequestAtByHost.set(hostname, Date.now());
        if (!custom && (response.status === 429 || response.status >= 500) && attempt < 2) {
          await response.body?.cancel?.();
          await wait(Math.min(45000, 3000 * 2 ** attempt));
          continue;
        }
        return response;
      }
    };
    const tail = this.transportTails.get(hostname) || Promise.resolve();
    const pending = tail.then(execute, execute);
    this.transportTails.set(hostname, pending.catch(() => {}));
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
