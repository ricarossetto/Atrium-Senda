/**
 * ATRIUM Sovereign Omni-Collector — TJRS Adapter
 *
 * Interacts with TJRS Consulta Processual and local TJRS sidecar.
 * Handles Altcha PoW simulation, direct JSON interception, and detection
 * of verification barriers (HUMAN_ACTION_REQUIRED).
 */

import { BaseAdapter } from './base-adapter.mjs';
import { SOURCE_TYPE, CHALLENGE_STATUS } from '../contracts.mjs';

export class TjrsAdapter extends BaseAdapter {
  constructor(options = {}) {
    super(options);
    this.allowSidecar = options.allowSidecar !== false;
    this.sidecarUrl = options.sidecarUrl || process.env.ATRIUM_TJRS_SIDECAR_URL || 'http://127.0.0.1:3100';
    this.serviceBaseUrl = options.serviceBaseUrl || 'https://consulta-processual-service.tjrs.jus.br';
  }

  get courtCode() {
    return 'TJRS';
  }

  get tribunal() {
    return 'TJRS';
  }

  get source() {
    return SOURCE_TYPE.TJRS_PUBLIC;
  }

  async healthCheck() {
    const start = Date.now();
    // 1. Check local sidecar if available
    if (this.allowSidecar) try {
      const res = await this.fetch(`${this.sidecarUrl}/health`, { timeoutMs: 3000 });
      if (res.status >= 200 && res.status < 300) {
        const data = typeof res.json === 'function' ? await res.json() : res;
        return {
          ok: true,
          status: 'OK',
          latencyMs: Date.now() - start,
          message: `TJRS Sidecar conectado (${data.collectorVersion || 'v0.1'})`,
          timestamp: new Date().toISOString()
        };
      }
    } catch {}

    // 2. Fallback check TJRS public service
    try {
      const res = await this.fetch(`${this.serviceBaseUrl}/api/consulta-service/public/auth/token`);
      const ok = res.status >= 200 && res.status < 400;
      return {
        ok,
        status: ok ? 'OK' : 'DEGRADED',
        latencyMs: Date.now() - start,
        message: `TJRS Oficial online (HTTP ${res.status})`,
        timestamp: new Date().toISOString()
      };
    } catch (err) {
      return {
        ok: false,
        status: 'DOWN',
        latencyMs: Date.now() - start,
        error: err.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async collectProcess(cnj) {
    const clean = this.cleanCnj(cnj);
    const start = Date.now();

    // 1. Try local sidecar first
    if (this.allowSidecar) try {
      const res = await this.fetch(`${this.sidecarUrl}/v1/processes/${clean}`, { timeoutMs: 4000 });
      if (res.status === 200) {
        const payload = typeof res.json === 'function' ? await res.json() : res;
        return {
          success: true,
          source: this.source,
          tribunal: this.courtCode,
          courtCode: this.courtCode,
          cnj: clean,
          queryCnj: clean,
          rawPayload: payload,
          httpStatus: 200,
          challengeStatus: CHALLENGE_STATUS.NONE,
          executionTimeMs: Date.now() - start,
          collectedAt: new Date().toISOString()
        };
      }
      if (res.status === 404) {
        // Not in local sidecar; proceed to official inquiry or fallback
      }
    } catch {}

    // 2. Query official TJRS public consultation endpoint
    try {
      const res = await this.fetch(`${this.serviceBaseUrl}/api/consulta-service/public/processos/${clean}`);
      if (res.status === 200) {
        const payload = typeof res.json === 'function' ? await res.json() : res;
        return {
          success: true,
          source: this.source,
          tribunal: this.courtCode,
          courtCode: this.courtCode,
          cnj: clean,
          queryCnj: clean,
          rawPayload: payload,
          httpStatus: 200,
          challengeStatus: CHALLENGE_STATUS.NONE,
          executionTimeMs: Date.now() - start,
          collectedAt: new Date().toISOString()
        };
      }

      if (res.status === 403 || res.status === 429) {
        return {
          success: false,
          source: this.source,
          tribunal: this.courtCode,
          courtCode: this.courtCode,
          queryCnj: clean,
          rawPayload: null,
          httpStatus: res.status,
          challengeStatus: CHALLENGE_STATUS.HUMAN_ACTION_REQUIRED,
          executionTimeMs: Date.now() - start,
          error: 'TJRS solicitou verificação humana (CAPTCHA / PoW rate limit)'
        };
      }
    } catch (err) {
      return {
        success: false,
        source: this.source,
        tribunal: this.courtCode,
        courtCode: this.courtCode,
        queryCnj: clean,
        rawPayload: null,
        httpStatus: 500,
        challengeStatus: CHALLENGE_STATUS.NONE,
        executionTimeMs: Date.now() - start,
        error: err.message
      };
    }

    return {
      success: false,
      source: this.source,
      tribunal: this.courtCode,
      courtCode: this.courtCode,
      queryCnj: clean,
      rawPayload: null,
      httpStatus: 404,
      challengeStatus: CHALLENGE_STATUS.NONE,
      executionTimeMs: Date.now() - start,
      error: `Processo ${clean} não encontrado no TJRS`
    };
  }

  async discoverByOab({ oab, uf = 'RS' } = {}) {
    const cleanOab = String(oab || '').replace(/\D/g, '');
    try {
      const res = await this.fetch(`${this.serviceBaseUrl}/api/consulta-service/public/advogado/${cleanOab}`);
      if (!res.ok) return [];
      const data = typeof res.json === 'function' ? await res.json() : res;
      const list = Array.isArray(data) ? data : (data?.processos || []);
      return list.map(p => this.cleanCnj(p.numeroProcesso || p.cnj || '')).filter(c => c.length === 20);
    } catch {
      return [];
    }
  }
}
