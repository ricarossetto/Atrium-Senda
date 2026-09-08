/**
 * ATRIUM Sovereign Omni-Collector — DJEN Adapter
 *
 * Official DJEN / ComunicaAPI client (CNJ Plataforma de Comunicações Processuais).
 * Queries official court publications and performs OAB-to-CNJ discovery.
 */

import { BaseAdapter } from './base-adapter.mjs';
import { SOURCE_TYPE, CHALLENGE_STATUS } from '../contracts.mjs';

export class DjenAdapter extends BaseAdapter {
  constructor(options = {}) {
    super(options);
    this.baseUrl = options.baseUrl || 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';
  }

  get courtCode() {
    return 'DJEN';
  }

  get tribunal() {
    return 'CNJ';
  }

  get source() {
    return SOURCE_TYPE.DJEN;
  }

  async healthCheck() {
    const start = Date.now();
    try {
      const res = await this.fetch(`${this.baseUrl}?itensPorPagina=1`);
      const ok = res.status >= 200 && res.status < 400;
      return {
        ok,
        status: ok ? 'OK' : 'DEGRADED',
        latencyMs: Date.now() - start,
        message: `DJEN ComunicaAPI online (HTTP ${res.status})`,
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

  async queryPublications({ cnj, oab, uf, dataInicio, dataFim, limit = 50 } = {}) {
    const params = new URLSearchParams();
    if (cnj) params.set('numeroProcesso', this.cleanCnj(cnj));
    if (oab) params.set('numeroOab', String(oab).replace(/\D/g, ''));
    if (uf) params.set('ufOab', String(uf).toUpperCase());
    if (dataInicio) params.set('dataDisponibilizacaoInicio', dataInicio);
    if (dataFim) params.set('dataDisponibilizacaoFim', dataFim);
    params.set('itensPorPagina', String(limit));

    try {
      const res = await this.fetch(`${this.baseUrl}?${params.toString()}`);
      if (!res.ok) throw Object.assign(new Error('DJEN indisponível.'), { statusCode: res.status, challengeStatus: res.status === 403 ? 'HUMAN_ACTION_REQUIRED' : 'NONE' });
      const data = typeof res.json === 'function' ? await res.json() : res;
      return Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
    } catch (error) {
      throw error;
    }
  }

  async discoverByOab({ oab, uf } = {}) {
    const cleanOab = String(oab || '').replace(/\D/g, '');
    const cleanUf = String(uf || '').toUpperCase();
    if (!cleanOab || !cleanUf) return [];

    try {
      const items = await this.queryPublications({ oab: cleanOab, uf: cleanUf, limit: 100 });
      const cnjs = items
        .map(i => this.cleanCnj(i.numero_processo || i.numeroProcesso || ''))
        .filter(c => c.length === 20);
      return Array.from(new Set(cnjs));
    } catch (error) {
      throw error;
    }
  }

  async collectProcess(cnj) {
    const clean = this.cleanCnj(cnj);
    const start = Date.now();

    try {
      const items = await this.queryPublications({ cnj: clean, limit: 50 });
      return {
        success: items.length > 0,
        source: this.source,
        tribunal: this.courtCode,
        courtCode: this.courtCode,
        cnj: clean,
        queryCnj: clean,
        rawPayload: { items },
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
}
