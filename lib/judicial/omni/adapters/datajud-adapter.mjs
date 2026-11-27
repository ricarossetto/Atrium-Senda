/**
 * ATRIUM Sovereign Omni-Collector — DataJud Adapter
 *
 * Official DataJud Elasticsearch Public API client (Resolução CNJ nº 331/2020).
 * Provides standardized metadata and national movement taxonomy fallback.
 */

import { OFFICIAL_DEFAULT_KEY, aliasForProcess, normalizeDatajudAlias } from '../../../../collector/adapters/datajud.mjs';
import { BaseAdapter } from './base-adapter.mjs';
import { SOURCE_TYPE, CHALLENGE_STATUS } from '../contracts.mjs';

function cleanDatajudKey(value) {
  return String(value || '').replace(/^\s*(?:Authorization\s*:\s*)?APIKey\s+/i, '').trim();
}

export class DataJudAdapter extends BaseAdapter {
  constructor(options = {}) {
    super(options);
    this.baseUrl = String(options.baseUrl || 'https://api-publica.datajud.cnj.jus.br').replace(/\/+$/, '');
    this.apiKey = cleanDatajudKey(options.apiKey || process.env.DATAJUD_API_KEY || OFFICIAL_DEFAULT_KEY);
  }

  get courtCode() {
    return 'DATAJUD';
  }

  get tribunal() {
    return 'CNJ';
  }

  get source() {
    return SOURCE_TYPE.DATAJUD;
  }

  async healthCheck() {
    const start = Date.now();
    try {
      const res = await this.fetch(`${this.baseUrl}/api_publica_tjrs/_search`, {
        method: 'POST',
        headers: {
          'Authorization': `APIKey ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: { match: { numeroProcesso: '00000000000000000000' } }, size: 1 })
      });

      const ok = res.status >= 200 && res.status < 400;
      return {
        ok,
        status: ok ? 'OK' : 'DEGRADED',
        latencyMs: Date.now() - start,
        message: `DataJud API pública online (HTTP ${res.status})`,
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

  async collectProcess(cnj, explicitTribunal) {
    const clean = this.cleanCnj(cnj);
    if (!this.apiKey && !this.customFetch) return { success: false, source: this.source, queryCnj: clean, httpStatus: 503, error: 'Configure a chave pública DataJud.' };
    const start = Date.now();
    const tribunal = normalizeDatajudAlias(explicitTribunal)
      || aliasForProcess(clean)
      || normalizeDatajudAlias(this.resolveCourtFromCnj(clean))
      || 'tjrs';

    try {
      const query = {
        query: {
          match: {
            numeroProcesso: clean
          }
        },
        size: 10
      };

      const res = await this.fetch(`${this.baseUrl}/api_publica_${tribunal}/_search`, {
        method: 'POST',
        headers: {
          'Authorization': `APIKey ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(query)
      });

      if (!res.ok) {
        return {
          success: false,
          source: this.source,
          tribunal,
          courtCode: tribunal.toUpperCase(),
          queryCnj: clean,
          rawPayload: null,
          httpStatus: res.status,
          challengeStatus: res.status === 429 ? CHALLENGE_STATUS.RATE_LIMITED : CHALLENGE_STATUS.NONE,
          executionTimeMs: Date.now() - start,
          error: `Erro HTTP ${res.status} ao consultar DataJud`
        };
      }

      const data = typeof res.json === 'function' ? await res.json() : res;
      const matchingHits = (Array.isArray(data?.hits?.hits) ? data.hits.hits : [])
        .map(entry => entry?._source)
        .filter(item => item && this.cleanCnj(item.numeroProcesso) === clean && Number(item.nivelSigilo ?? 0) === 0)
        .sort((a, b) => (Date.parse(b.dataHoraUltimaAtualizacao || b['@timestamp'] || '') || 0) - (Date.parse(a.dataHoraUltimaAtualizacao || a['@timestamp'] || '') || 0));
      const hit = matchingHits[0];

      if (!hit) {
        return {
          success: false,
          source: this.source,
          tribunal,
          courtCode: tribunal.toUpperCase(),
          queryCnj: clean,
          rawPayload: null,
          httpStatus: 404,
          challengeStatus: CHALLENGE_STATUS.NONE,
          executionTimeMs: Date.now() - start,
          error: `Processo ${clean} não localizado no DataJud para ${tribunal}`
        };
      }

      return {
        success: true,
        source: this.source,
        tribunal: tribunal.toUpperCase(),
        courtCode: tribunal.toUpperCase(),
        cnj: clean,
        queryCnj: clean,
        rawPayload: hit,
        httpStatus: 200,
        challengeStatus: CHALLENGE_STATUS.NONE,
        executionTimeMs: Date.now() - start,
        collectedAt: new Date().toISOString()
      };
    } catch (err) {
      return {
        success: false,
        source: this.source,
        tribunal: tribunal.toUpperCase(),
        courtCode: tribunal.toUpperCase(),
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
