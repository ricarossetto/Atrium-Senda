/**
 * ATRIUM Sovereign Omni-Collector — TJDFT Adapter
 *
 * Unauthenticated REST client for Tribunal de Justiça do Distrito Federal e dos Territórios.
 */

import { BaseAdapter } from './base-adapter.mjs';
import { SOURCE_TYPE, CHALLENGE_STATUS } from '../contracts.mjs';

export class TjdftAdapter extends BaseAdapter {
  constructor(options = {}) {
    super(options);
    this.baseUrl = options.baseUrl || 'https://pje-consultapublica-api.tjdft.jus.br';
  }

  get courtCode() {
    return 'TJDFT';
  }

  get tribunal() {
    return 'TJDFT';
  }

  get source() {
    return SOURCE_TYPE.TJDFT_REST_API;
  }

  async healthCheck() {
    const start = Date.now();
    try {
      const res = await this.fetch(`${this.baseUrl}/actuator/health`);
      const latencyMs = Date.now() - start;
      let ok = res.status >= 200 && res.status < 400;
      let data = {};
      try {
        const text = typeof res.text === 'function' ? await res.text() : JSON.stringify(res);
        data = JSON.parse(text);
        if (data.status === 'UP') ok = true;
      } catch {}

      return {
        ok,
        status: ok ? 'OK' : 'DEGRADED',
        latencyMs,
        message: data.status ? `TJDFT Actuator status: ${data.status}` : `HTTP ${res.status}`,
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

    try {
      // 1. Search process by CNJ
      const searchUrl = `${this.baseUrl}/v1/processos?numeroProcesso=${clean}`;
      const searchRes = await this.fetch(searchUrl);

      if (searchRes.status === 404) {
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
          error: `Processo ${clean} não encontrado no TJDFT`
        };
      }

      let searchData = typeof searchRes.json === 'function' ? await searchRes.json() : searchRes;
      let proc = Array.isArray(searchData) ? searchData[0] : (searchData?.content ? searchData.content[0] : searchData);

      if (!proc) {
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
          error: `Processo ${clean} sem dados no TJDFT`
        };
      }

      // 2. Hydrate movements if process has internal ID
      const procId = proc.id || proc.idProcesso;
      if (procId && !proc.movimentacoes) {
        try {
          const movRes = await this.fetch(`${this.baseUrl}/v1/processos/${procId}/movimentacoes`);
          if (movRes.status >= 200 && movRes.status < 300) {
            proc.movimentacoes = typeof movRes.json === 'function' ? await movRes.json() : movRes;
          }
        } catch {}
      }

      return {
        success: true,
        source: this.source,
        tribunal: this.courtCode,
        courtCode: this.courtCode,
        cnj: clean,
        queryCnj: clean,
        rawPayload: proc,
        httpStatus: 200,
        challengeStatus: CHALLENGE_STATUS.NONE,
        executionTimeMs: Date.now() - start,
        collectedAt: new Date().toISOString()
      };
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
  }

  async discoverByOab({ oab, uf = 'DF' } = {}) {
    const cleanOab = String(oab || '').replace(/\D/g, '');
    const cleanUf = String(uf || 'DF').toUpperCase();

    try {
      const url = `${this.baseUrl}/v1/processos?OAB=${cleanOab}&estadoOAB=${cleanUf}`;
      const res = await this.fetch(url);
      if (!res.ok) return [];

      const data = typeof res.json === 'function' ? await res.json() : res;
      const list = Array.isArray(data) ? data : (data?.content || []);
      const cnjs = list.map(item => this.cleanCnj(item.numeroProcesso || item.numero || '')).filter(c => c.length === 20);
      return Array.from(new Set(cnjs));
    } catch {
      return [];
    }
  }
}
