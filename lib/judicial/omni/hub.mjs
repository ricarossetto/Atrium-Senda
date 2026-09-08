/**
 * ATRIUM Sovereign Omni-Collector — Provider Router & Hub
 *
 * Central hub coordinating court resolution, cascading fallback,
 * canonical normalization, 4-way diff generation, and local persistence.
 */

import { cleanCnj, assertCnj, formatCnj, resolveCourtFromCnj, QUEUE_PRIORITY } from './contracts.mjs';
import { CanonicalNormalizer } from './normalizer.mjs';
import { computeProcessDiff } from './diff-engine.mjs';
import { PriorityQueueManager } from './queue.mjs';
import { OmniStorage } from './storage.mjs';
import { TjrsAdapter } from './adapters/tjrs-adapter.mjs';
import { TjdftAdapter } from './adapters/tjdft-adapter.mjs';
import { TjspAdapter } from './adapters/tjsp-adapter.mjs';
import { DataJudAdapter } from './adapters/datajud-adapter.mjs';
import { DjenAdapter } from './adapters/djen-adapter.mjs';

export class OmniCollectorHub {
  constructor({
    storage,
    queueManager,
    normalizer,
    adapters = {},
    customFetch = null,
    minDelayMs = 3000
  } = {}) {
    this.storage = storage || null;
    this.queue = queueManager || new PriorityQueueManager({ minDelayMs });
    this.normalizer = normalizer || new CanonicalNormalizer('2.0.0');

    this.adapters = new Map();
    // Default adapters
    this.registerAdapter('TJRS', adapters.tjrs || new TjrsAdapter({ customFetch }));
    this.registerAdapter('TJDFT', adapters.tjdft || new TjdftAdapter({ customFetch }));
    this.registerAdapter('TJSP', adapters.tjsp || new TjspAdapter({ customFetch }));
    this.registerAdapter('DATAJUD', adapters.datajud || new DataJudAdapter({ customFetch }));
    this.registerAdapter('DJEN', adapters.djen || new DjenAdapter({ customFetch }));

    this.datajud = this.adapters.get('DATAJUD');
    this.djen = this.adapters.get('DJEN');
  }

  registerAdapter(courtCode, adapter) {
    this.adapters.set(courtCode.toUpperCase(), adapter);
  }

  getAdapter(courtCode) {
    return this.adapters.get(courtCode.toUpperCase());
  }

  async health() {
    // Status is local capability, not a live tribunal probe or proof of authentication.
    return { status: 'ready', timestamp: new Date().toISOString(),
      providers: Object.fromEntries([...this.adapters.keys()].map(code => [code, { status: 'NOT_VERIFIED', configured: true }])) };
  }

  /**
   * Discovers CNJs by OAB via specific court or DJEN fallback.
   */
  async discoverByOab({ oab, uf, comarca, court } = {}) {
    const cleanOab = String(oab || '').replace(/\D/g, '');
    const cleanUf = String(uf || '').toUpperCase();
    let courtCode = (court || '').toUpperCase();

    if (!courtCode) {
      if (cleanUf === 'RS') courtCode = 'TJRS';
      else if (cleanUf === 'DF') courtCode = 'TJDFT';
      else if (cleanUf === 'SP') courtCode = 'TJSP';
    }

    const adapter = courtCode ? this.adapters.get(courtCode) : null;

    return this.queue.enqueue(async () => {
      // 1. Try specific court
      if (adapter && typeof adapter.discoverByOab === 'function') {
        try {
          const candidates = await adapter.discoverByOab({ oab: cleanOab, uf: cleanUf, comarca });
          const cnjs = validCandidates(candidates);
          if (cnjs.length > 0) {
            return {
              success: true,
              court: courtCode,
              oab: cleanOab,
              uf: cleanUf,
              cnjCandidates: cnjs,
              count: cnjs.length
            };
          }
        } catch (error) {
          if (error.challengeStatus === 'HUMAN_ACTION_REQUIRED') throw error;
        }
      }

      // 2. Fallback to DJEN
      if (this.djen) {
        try {
          const cnjs = validCandidates(await this.djen.discoverByOab({ oab: cleanOab, uf: cleanUf }));
          return {
            success: true,
            court: 'DJEN',
            oab: cleanOab,
            uf: cleanUf,
            cnjCandidates: cnjs,
            count: cnjs.length
          };
        } catch (err) {
          return {
            success: false,
            court: courtCode || 'DJEN',
            oab: cleanOab,
            uf: cleanUf,
            cnjCandidates: [],
            count: 0,
            error: err.message
          };
        }
      }

      return {
        success: false,
        court: courtCode || 'UNKNOWN',
        oab: cleanOab,
        uf: cleanUf,
        cnjCandidates: [],
        count: 0,
        error: 'Nenhum adaptador disponível para busca por OAB'
      };
    }, { priority: QUEUE_PRIORITY.P2, provider: courtCode || 'GLOBAL', label: `OAB ${cleanOab}/${cleanUf}` });
  }

  /**
   * Collects raw process snapshot by routing through tribunal adapter or cascading fallback.
   */
  async collectRaw(cnj, explicitCourt) {
    const clean = assertCnj(cnj);
    const courtCode = (explicitCourt || resolveCourtFromCnj(clean) || '').toUpperCase();
    const adapter = courtCode ? this.adapters.get(courtCode) : null;

    // 1. Primary: Local court adapter
    if (adapter) {
      try {
        const res = await adapter.collectProcess(clean);
        if (res.success || res.challengeStatus === 'HUMAN_ACTION_REQUIRED') {
          return res;
        }
      } catch (err) {
        // Fall through to DataJud
      }
    }

    // 2. Cascading Fallback: DataJud Elasticsearch API
    if (this.datajud) {
      try {
        const hitRes = await this.datajud.collectProcess(clean, courtCode.toLowerCase());
        if (hitRes.success) {
          return hitRes;
        }
      } catch {}
    }

    return {
      success: false,
      source: adapter ? adapter.source : 'HYBRID',
      tribunal: courtCode || 'DESCONHECIDO',
      courtCode: courtCode || 'DESCONHECIDO',
      queryCnj: clean,
      rawPayload: null,
      challengeStatus: 'NONE',
      error: `Coleta não retornou dados para o CNJ ${clean} (tribunal: ${courtCode || 'desconhecido'})`
    };
  }

  /**
   * Unified collection, normalization, diff calculation, and persistence pipeline.
   */
  async syncProcess(cnj, { explicitCourt, enrichDjen = false, priority = QUEUE_PRIORITY.P0, persist = true } = {}) {
    const clean = assertCnj(cnj);
    const court = explicitCourt || resolveCourtFromCnj(clean) || 'GENERIC';

    return this.queue.enqueue(async () => {
      // 1. Collect Raw
      const raw = await this.collectRaw(clean, court);
      if (raw.challengeStatus === 'HUMAN_ACTION_REQUIRED' || !raw.success || !raw.rawPayload) {
        throw Object.assign(new Error(raw.error || `Processo ${clean} não encontrado nas fontes oficiais`), {
          statusCode: raw.httpStatus === 404 ? 404 : 502,
          challengeStatus: raw.challengeStatus
        });
      }

      // 2. Normalize to Canonical Model
      let canonical = this.normalizer.normalizeRaw(raw);
      if (assertCnj(canonical.cnj) !== clean) throw Object.assign(new Error('O provedor retornou outro processo.'), { statusCode: 409 });

      // 3. Optional DJEN Enrichment
      if (enrichDjen && this.djen) {
        try {
          const pubs = await this.djen.queryPublications({ cnj: clean, limit: 50 });
          if (pubs.length > 0) {
            canonical = this.normalizer.enrichWithDjen(canonical, pubs);
          }
        } catch {}
      }

      // 4. Load Previous Snapshot from Storage & Compute 4-Way Diff
      let prevSnapshot = null;
      if (this.storage) {
        prevSnapshot = this.storage.getLatestSnapshot(clean);
      }

      const diff = computeProcessDiff(prevSnapshot, canonical);

      // 5. Persist to Storage
      let newSnapshotId = null;
      let diffId = null;
      if (this.storage && persist && (!prevSnapshot || diff.hasChanges)) {
        ({ snapshotId: newSnapshotId, diffId } = this.storage.saveObservation(canonical, diff, prevSnapshot?.id));
      }

      return {
        cnj: clean,
        canonical,
        diff,
        snapshotId: newSnapshotId,
        diffId,
        hasChanges: diff.hasChanges,
        source: raw.source,
        court: canonical.metadata.court
      };
    }, { priority, provider: court, label: `SYNC ${clean}` });
  }

  /**
   * Daily monitoring run iterating watchlist targets.
   */
  async runDailyMonitoring() {
    if (!this.storage) throw new Error('OmniStorage necessário para monitoramento diário');

    const watchlist = this.storage.getWatchlist();
    const startedAt = new Date().toISOString();
    let totalChecked = 0;
    let totalChanges = 0;
    let errorsCount = 0;
    const summaries = [];

    for (const item of watchlist) {
      try {
        const syncResult = await this.syncProcess(item.cnj, {
          explicitCourt: item.court,
          priority: QUEUE_PRIORITY.P3
        });
        totalChecked++;
        if (syncResult.hasChanges) totalChanges++;
        this.storage.updateWatchlistChecked(item.cnj);
        summaries.push({ cnj: item.cnj, court: item.court, changes: syncResult.hasChanges });
      } catch (err) {
        errorsCount++;
        summaries.push({ cnj: item.cnj, court: item.court, error: err.message });
      }
    }

    const finishedAt = new Date().toISOString();
    const runId = this.storage.recordRun({
      runType: 'DAILY_WATCHLIST',
      startedAt,
      finishedAt,
      totalChecked,
      totalChanges,
      errorsCount,
      summary: { items: summaries }
    });

    return {
      runId,
      startedAt,
      finishedAt,
      totalChecked,
      totalChanges,
      errorsCount
    };
  }
}

function validCandidates(list) {
  return [...new Set((Array.isArray(list) ? list : []).flatMap(value => { try { return [assertCnj(value)]; } catch { return []; } }))];
}
