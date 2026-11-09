/**
 * ATRIUM Sovereign Judicial Connectivity — Eproc Scheduled & Manual Sync Pipeline
 *
 * Implements the Report-First scheduled sync engine:
 * - Schedule: 07:00 and 19:00 BRT (America/Sao_Paulo). Zero heavy sweeps on login.
 * - Concurrency: Strict single-flight locking per workspace.
 * - Isolation: Sequential execution across portals whose registry capability is live verified,
 *   with independent browser sessions, timeouts, and error containment.
 * - Telemetry: Granular per-portal phases, determinate/indeterminate progress, and audit metrics.
 */

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { canonicalPortalId, getCredentialScopeForPortal, listLiveSyncVerifiedEprocPortals } from '../portal-registry.mjs';
import { sanitizeTelemetryPayload } from '../telemetry.mjs';
import { sanitizeJudicialError } from '../../managed-connectivity.mjs';

const PORTAL_ERROR_URL_RE = /https?:\/\/[^\s"'<>]+/gi;
const PORTAL_ERROR_PATH_RE = /(?:[A-Za-z]:\\[^\s"'<>]+|\/(?:home|Users|root|tmp|var|opt|etc)[^\s"'<>]*)/g;

export function sanitizePortalError(value) {
  return sanitizeJudicialError(value)
    .replace(PORTAL_ERROR_URL_RE, '[url omitida]')
    .replace(PORTAL_ERROR_PATH_RE, '[caminho omitido]');
}

// Ciclos silenciosos do servidor: 07h, 12h e 19h (America/Sao_Paulo).
export const SYNC_SCHEDULE_HOURS_BRT = Object.freeze([7, 12, 19]);
export const SYNC_TIMEZONE = 'America/Sao_Paulo';

export const VERIFIED_PORTALS_SEQUENCE = Object.freeze(
  listLiveSyncVerifiedEprocPortals().map(portal => portal.id)
);

export class EprocSyncScheduler {
  constructor({ orchestrator, dataDirectory = null, logger = console } = {}) {
    this.orchestrator = orchestrator;
    this.dataDirectory = dataDirectory;
    this.logger = logger;
    this.activeJobs = new Map(); // workspaceId -> activeJob
    this.lastJobResults = new Map(); // workspaceId -> lastJob
    this.executedSlots = new Set();
    this.slotsFilePath = dataDirectory ? path.join(dataDirectory, 'eproc-scheduled-slots.json') : null;
    this.sqlitePath = dataDirectory ? path.join(dataDirectory, 'eproc-sync-slots.sqlite') : null;
    this.sqliteDb = null;

    this._initSqlite();
    this._loadPersistedSlots();
    this._migrateJsonSlotsToSqlite();
  }

  _initSqlite() {
    if (!this.sqlitePath) return;
    try {
      const dir = path.dirname(this.sqlitePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      this.sqliteDb = new DatabaseSync(this.sqlitePath);
      this.sqliteDb.exec(`
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;
        CREATE TABLE IF NOT EXISTS eproc_sync_slots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_id TEXT NOT NULL,
          slot_key TEXT NOT NULL UNIQUE,
          portal_id TEXT,
          scheduled_for TEXT,
          executed_at TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'COMPLETED',
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_eproc_sync_slots_ws ON eproc_sync_slots(workspace_id, scheduled_for);
      `);
    } catch (err) {
      this.logger.warn?.('[EprocSyncScheduler] Aviso ao inicializar SQLite para slots:', err.message);
      this.sqliteDb = null;
    }
  }

  _migrateJsonSlotsToSqlite() {
    if (!this.sqliteDb || this.executedSlots.size === 0) return;
    try {
      const stmt = this.sqliteDb.prepare(`
        INSERT OR IGNORE INTO eproc_sync_slots (workspace_id, slot_key, executed_at, created_at)
        VALUES (?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      for (const slotKey of this.executedSlots) {
        const parts = slotKey.split(':');
        const wsId = parts[0] || 'default';
        stmt.run(wsId, slotKey, now, now);
      }
    } catch (err) {
      this.logger.warn?.('[EprocSyncScheduler] Aviso na migração JSON -> SQLite de slots:', err.message);
    }
  }

  _loadPersistedSlots() {
    // 1. Carrega do SQLite se disponível
    if (this.sqliteDb) {
      try {
        const rows = this.sqliteDb.prepare('SELECT slot_key FROM eproc_sync_slots').all();
        for (const r of rows) this.executedSlots.add(r.slot_key);
      } catch (err) {
        this.logger.warn?.('[EprocSyncScheduler] Aviso ao carregar slots do SQLite:', err.message);
      }
    }

    // 2. Carrega do arquivo JSON legado se existir
    if (this.slotsFilePath && fs.existsSync(this.slotsFilePath)) {
      try {
        const raw = fs.readFileSync(this.slotsFilePath, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const s of list) this.executedSlots.add(s);
        }
      } catch (err) {
        this.logger.warn?.('[EprocSyncScheduler] Aviso ao carregar slots JSON persistidos:', err.message);
      }
    }
  }

  _persistSlots() {
    if (!this.slotsFilePath) return;
    try {
      const dir = path.dirname(this.slotsFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const list = [...this.executedSlots].slice(-100); // Mantém os últimos 100 slots (política FIFO)
      const tempPath = `${this.slotsFilePath}.${Date.now()}.${Math.random().toString(36).substring(2, 6)}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(list, null, 2), 'utf8');
      fs.renameSync(tempPath, this.slotsFilePath);
    } catch (err) {
      this.logger.warn?.('[EprocSyncScheduler] Aviso ao persistir slots JSON:', err.message);
    }
  }

  /**
   * Generates a persistent, canonical slot key for a workspace and datetime.
   * Format: workspaceId:YYYY-MM-DD:HH:00:America/Sao_Paulo
   *
   * @param {string} [workspaceId]
   * @param {Date} [date]
   * @returns {string}
   */
  getScheduledSlotKey(workspaceId = 'default', date = new Date()) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: SYNC_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    const hour = parts.find(p => p.type === 'hour')?.value;
    return `${workspaceId}:${year}-${month}-${day}:${hour}:00:${SYNC_TIMEZONE}`;
  }

  _scopeKey(portalIds = [], target = null) {
    const portals = [...new Set((portalIds || [])
      .map(portalId => canonicalPortalId(portalId) || String(portalId || '').trim())
      .filter(Boolean))].sort();
    const normalizedTarget = target ? String(target).replace(/\D/g, '') : '';
    return `${portals.join(',')}|${normalizedTarget}`;
  }

  hasSlotExecuted(slotKey) {
    if (this.executedSlots.has(slotKey)) return true;
    if (this.sqliteDb) {
      try {
        const row = this.sqliteDb.prepare('SELECT 1 FROM eproc_sync_slots WHERE slot_key = ? LIMIT 1').get(slotKey);
        if (row) {
          this.executedSlots.add(slotKey);
          return true;
        }
      } catch (err) {
        this.logger.warn?.('[EprocSyncScheduler] Falha ao consultar slot no SQLite:', err.message);
      }
    }
    return false;
  }

  markSlotExecuted(slotKey, { workspaceId = 'default', portalId = null, scheduledFor = null, status = 'COMPLETED' } = {}) {
    this.executedSlots.add(slotKey);
    const now = new Date().toISOString();

    if (this.sqliteDb) {
      try {
        this.sqliteDb.prepare(`
          INSERT OR IGNORE INTO eproc_sync_slots (workspace_id, slot_key, portal_id, scheduled_for, executed_at, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(workspaceId, slotKey, portalId, scheduledFor, now, status, now);

        // Retention prune: manter últimos 200 slots por workspace
        this.sqliteDb.prepare(`
          DELETE FROM eproc_sync_slots
          WHERE workspace_id = ? AND id NOT IN (
            SELECT id FROM eproc_sync_slots WHERE workspace_id = ? ORDER BY id DESC LIMIT 200
          )
        `).run(workspaceId, workspaceId);
      } catch (err) {
        this.logger.warn?.('[EprocSyncScheduler] Falha ao gravar slot no SQLite:', err.message);
      }
    }

    this._persistSlots();
  }

  /**
   * Evaluates if the scheduled window is open AND hasn't been executed yet for this slot.
   *
   * @param {string} [workspaceId]
   * @param {Date} [date]
   * @returns {boolean}
   */
  shouldRunScheduledSync(workspaceId = 'default', date = new Date()) {
    if (!this.isScheduledSyncTime(date)) return false;
    const slotKey = this.getScheduledSlotKey(workspaceId, date);
    return !this.hasSlotExecuted(slotKey);
  }

  /**
   * Checks whether a given Date matches the scheduled sync window (07:00 or 19:00 BRT).
   *
   * @param {Date} [date]
   * @returns {boolean}
   */
  isScheduledSyncTime(date = new Date()) {
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: SYNC_TIMEZONE,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);

    return SYNC_SCHEDULE_HOURS_BRT.includes(hour) && minute === 0;
  }

  /**
   * Triggers a sync pipeline for a workspace. Enforces single-flight locking and slot idempotency.
   *
   * @param {Object} params
   * @param {string} [params.workspaceId]
   * @param {'scheduled'|'manual'} [params.trigger]
   * @param {Array<string>} [params.portals]
   * @param {boolean} [params.forceFullRescan]
   * @returns {Promise<Object>} Job descriptor
   */
  async requestSync({ workspaceId = 'default', trigger = 'manual', portals = VERIFIED_PORTALS_SEQUENCE, forceFullRescan = false, includeWorkspaceVerified = false, targetProcessNumber = null, maxProcesses = null, waitForCompletion = false } = {}) {
    // A scheduled run is registry-driven. A manual run may explicitly ask for
    // configured/unverified candidates so the first real read can establish
    // durable workspace evidence; it must never silently broaden its scope.
    const requestedPortals = Array.isArray(portals) ? portals : [];
    const resolvedPortals = [...new Set(requestedPortals.map(portalId => canonicalPortalId(portalId)).filter(Boolean))];
    const executionPortals = trigger === 'scheduled'
      ? (includeWorkspaceVerified
        ? [...resolvedPortals]
        : [...VERIFIED_PORTALS_SEQUENCE])
      : (resolvedPortals.length ? resolvedPortals : [...VERIFIED_PORTALS_SEQUENCE]);
    if (!executionPortals.length) throw new Error('Nenhum portal eproc elegível para sincronização.');
    const requestedTarget = targetProcessNumber ? String(targetProcessNumber).trim() : null;

    const requestedScopeKey = this._scopeKey(executionPortals, requestedTarget);
    const jobCoversRequest = currentJob => this._scopeKey(
      (currentJob?.portals || []).map(portal => portal.portalId),
      currentJob?.targetProcessNumber || null
    ) === requestedScopeKey;

    // Scheduled Slot Idempotency: Never re-run the same scheduled slot twice.
    // O slot só é consumido quando um job agendado realmente inicia; ingressar em um
    // job existente ou aguardar término não marca o slot como executado.
    let scheduledSlotKey = null;
    if (trigger === 'scheduled') {
      scheduledSlotKey = this.getScheduledSlotKey(workspaceId, new Date());
      if (this.hasSlotExecuted(scheduledSlotKey)) {
        return {
          ok: true,
          skipped: true,
          reason: 'SLOT_ALREADY_EXECUTED',
          slotKey: scheduledSlotKey,
          message: `O slot agendado "${scheduledSlotKey}" já foi executado e não será re-executado.`
        };
      }
    }

    // Single Flight Lock: If already running, join existing job (NO 409!)
    if (this.activeJobs.has(workspaceId)) {
      const current = this.activeJobs.get(workspaceId);
      const scopeMatches = jobCoversRequest(current);
      if (waitForCompletion && current.completionPromise) {
        await current.completionPromise.catch(() => {});
        return {
          ok: scopeMatches && (current.state === 'COMPLETED' || current.state === 'COMPLETED_WITH_WARNINGS'),
          alreadyRunning: true,
          joinedExisting: true,
          ...(scopeMatches ? {} : { joinedScopeMismatch: true }),
          completed: true,
          jobId: current.id,
          status: current.state,
          job: sanitizeTelemetryPayload(current)
        };
      }
      return {
        ok: true,
        alreadyRunning: true,
        joinedExisting: true,
        ...(scopeMatches ? {} : { joinedScopeMismatch: true }),
        jobId: current.id,
        status: (current.state || 'RUNNING').toLowerCase(),
        job: current
      };
    }

    if (scheduledSlotKey) this.markSlotExecuted(scheduledSlotKey);

    const jobId = `sync-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const job = {
      id: jobId,
      workspaceId,
      trigger,
      forceFullRescan: Boolean(forceFullRescan),
      targetProcessNumber: requestedTarget,
      maxProcesses: maxProcesses === null || maxProcesses === undefined || String(maxProcesses).trim() === ''
        ? null
        : (Number.isFinite(Number(maxProcesses)) ? Math.max(0, Number(maxProcesses)) : null),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      state: 'RUNNING',
      overall: {
        percent: null,
        completedPortals: 0,
        totalPortals: executionPortals.length,
        currentPortal: executionPortals[0] || null
      },
      portals: executionPortals.map(portalId => ({
        portalId,
        credentialScope: getCredentialScopeForPortal(portalId),
        state: 'PENDING',
        phase: 'queued',
        action: 'Aguardando na fila...',
        determinate: false,
        completed: null,
        total: null,
        percent: null,
        startedAt: null,
        finishedAt: null,
        durationMs: null,
        counts: null,
        error: null
      }))
    };

    this.activeJobs.set(workspaceId, job);

    // Run execution asynchronously or synchronously as per design
    const executionPromise = this._runPipeline(job);
    job.completionPromise = executionPromise;

    if (trigger === 'scheduled') {
      // In scheduled background mode, do not block the caller
      executionPromise.catch(err => {
        this.logger.error?.('[EprocSyncScheduler] Background job error:', err);
      });
      if (waitForCompletion) {
        await executionPromise.catch(() => {});
        return { ok: true, scheduled: true, completed: true, jobId, job: sanitizeTelemetryPayload(job), status: job.state };
      }
      return { ok: true, scheduled: true, jobId, job: sanitizeTelemetryPayload(job) };
    }

    if (waitForCompletion) {
      await executionPromise.catch(() => {});
      return { ok: job.state === 'COMPLETED' || job.state === 'COMPLETED_WITH_WARNINGS', manual: true, completed: true, jobId, job: sanitizeTelemetryPayload(job), status: job.state };
    }

    // Manual sync returns job immediately so UI can poll / stream progress
    return { ok: true, manual: true, jobId, job: sanitizeTelemetryPayload(job) };
  }

  /**
   * Retrieves active or last completed job status for a workspace.
   *
   * @param {string} [workspaceId]
   * @returns {Object|null}
   */
  getJobStatus(workspaceId = 'default') {
    if (this.activeJobs.has(workspaceId)) {
      return sanitizeTelemetryPayload({ active: true, job: this.activeJobs.get(workspaceId) });
    }
    if (this.lastJobResults.has(workspaceId)) {
      return sanitizeTelemetryPayload({ active: false, job: this.lastJobResults.get(workspaceId) });
    }
    return null;
  }

  async _runPipeline(job) {
    const { workspaceId, portals } = job;
    const totalPortals = portals.length;

    try {
      for (let i = 0; i < portals.length; i++) {
        const portalMeta = portals[i];
        const portalId = portalMeta.portalId;

        job.overall.currentPortal = portalId;
        portalMeta.state = 'RUNNING';
        portalMeta.startedAt = new Date().toISOString();
        portalMeta.phase = 'auth';
        portalMeta.action = 'Autenticando sessão com certificado digital e segundo fator...';

        try {
          if (!this.orchestrator || typeof this.orchestrator.syncPortal !== 'function') {
            throw new Error('Executor eproc real não configurado.');
          }
          const result = await this.orchestrator.syncPortal(portalId, {
              workspaceId,
              allowManualVerification: job.trigger === 'manual',
              targetProcessNumber: job.targetProcessNumber || null,
              maxProcesses: job.maxProcesses,
              onProgress: (telemetry) => {
                Object.assign(portalMeta, telemetry);
              }
          });
          portalMeta.counts = result?.counts || null;
          portalMeta.reportCounts = result?.reportCounts || null;
          portalMeta.agendaCounts = result?.agendaCounts || null;
          portalMeta.authTimeline = Array.isArray(result?.authTimeline) ? result.authTimeline.slice(-32) : (portalMeta.authTimeline || []);
          portalMeta.partialResults = result?.partialResults || null;
          portalMeta.errors = Array.isArray(result?.errors)
            ? result.errors.map(error => (error && typeof error === 'object'
              ? { ...error, ...(error.error ? { error: sanitizePortalError(error.error) } : {}) }
              : sanitizePortalError(error)))
            : [];
          portalMeta.warnings = Array.isArray(result?.warnings) ? result.warnings.map(sanitizePortalError) : [];
          portalMeta.discoverySource = result?.discoverySource || null;
          portalMeta.reportStatus = result?.reportStatus || null;
          if (!result?.ok) {
            // "Concluída com ressalvas": o portal teve erro, mas a coleta produziu itens
            // confirmados/persistidos. Só falha sem nenhum dado coletado vira ERROR —
            // recusa de pré-voo (portal não verificado, credencial ausente) é ERROR.
            const counts = result?.counts && typeof result.counts === 'object' ? result.counts : null;
            const collectedItems = counts ? Object.values(counts).some(value => Number(value) > 0) : false;
            const partialEvidence = Boolean(result?.partialResults) || collectedItems;
            if (!partialEvidence) throw new Error(result?.error || 'A sincronização eproc não confirmou sucesso.');
            portalMeta.state = 'PARTIAL';
            portalMeta.error = sanitizePortalError(result?.error || 'A coleta terminou com ressalvas.');
            portalMeta.warnings = [...portalMeta.warnings, 'Coleta concluída com ressalvas: parte dos itens foi confirmada e persistida.'];
          } else {
            portalMeta.state = 'COMPLETED';
          }
          portalMeta.finishedAt = new Date().toISOString();
          if (portalMeta.startedAt) {
            portalMeta.durationMs = Math.max(0, new Date(portalMeta.finishedAt).getTime() - new Date(portalMeta.startedAt).getTime());
          }
        } catch (portalErr) {
          // Failure Isolation: An error in one portal does NOT abort the remaining portals!
          portalMeta.state = 'ERROR';
          portalMeta.error = sanitizePortalError(portalErr.message || 'Erro durante a coleta do portal');
          portalMeta.errorCode = typeof portalErr.code === 'string' ? portalErr.code : null;
          portalMeta.errorStatus = Number.isInteger(portalErr.statusCode) ? portalErr.statusCode : null;
          portalMeta.finishedAt = new Date().toISOString();
          if (portalMeta.startedAt) {
            portalMeta.durationMs = Math.max(0, new Date(portalMeta.finishedAt).getTime() - new Date(portalMeta.startedAt).getTime());
          }
          // Portal sem credencial ou sem conexão verificada é configuração, não falha de coleta:
          // não polui o registro em todo ciclo de todo escritório.
          if (/Credencial do tribunal não configurada|não possui conexão live verificada/.test(String(portalErr.message || ''))) {
            this.logger.info?.(`[EprocSyncScheduler] Portal ${portalId} sem credencial configurada.`);
          } else {
            this.logger.warn?.(`[EprocSyncScheduler] Portal ${portalId} falhou, isolando erro e continuando próximos:`, portalErr.message);
          }
        }

        job.overall.completedPortals = i + 1;
        job.overall.percent = Math.round(((i + 1) / totalPortals) * 100);
      }

      const portalStates = job.portals.map(portal => portal.state);
      job.state = portalStates.some(state => state === 'ERROR')
        ? 'ERROR'
        : portalStates.some(state => state === 'PARTIAL') ? 'COMPLETED_WITH_WARNINGS' : 'COMPLETED';
      job.finishedAt = new Date().toISOString();
      job.overall.currentPortal = null;
    } finally {
      this.activeJobs.delete(workspaceId);
      this.lastJobResults.set(workspaceId, job);
    }
  }
}
