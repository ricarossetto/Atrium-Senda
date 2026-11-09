import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { normalizeCadence, CADENCES } from './event-types.mjs';

export function hashRecipient(email) {
  if (!email || typeof email !== 'string') return '';
  return createHash('sha256')
    .update(email.trim().toLowerCase())
    .digest('hex')
    .slice(0, 16);
}

export function maskEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const trimmed = email.trim();
  const atIdx = trimmed.indexOf('@');
  if (atIdx <= 0) return trimmed;
  const user = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx);
  if (user.length <= 2) return `${user[0]}***${domain}`;
  return `${user.slice(0, 2)}***${domain}`;
}

export class NotificationDatabase {
  constructor({ dbPath = null, tenantDir = null, inMemory = false, securityManager = null } = {}) {
    this.inMemory = inMemory;
    this.dbPath = dbPath || (tenantDir ? path.join(tenantDir, 'notifications.sqlite') : null);
    this.securityManager = securityManager;
    this.db = null;
    this._init();
  }

  static forWorkspace(workspaceId, workspaceDataDir, securityManager = null) {
    const dbPath = path.join(workspaceDataDir, 'notifications.sqlite');
    return new NotificationDatabase({ dbPath, securityManager });
  }

  encryptField(val) {
    if (val == null) return val;
    const str = typeof val === 'string' ? val : JSON.stringify(val);
    if (this.securityManager && typeof this.securityManager.encrypt === 'function') {
      try {
        const enc = this.securityManager.encrypt(str);
        return `enc:v1:${enc.iv}:${enc.tag}:${enc.ciphertext}`;
      } catch (err) {
        throw new Error(`Falha ao cifrar campo sensível: ${err.message}`);
      }
    }
    return str;
  }

  decryptField(val) {
    if (val == null) return val;
    if (typeof val === 'string' && val.startsWith('enc:v1:') && this.securityManager && typeof this.securityManager.decrypt === 'function') {
      const parts = val.slice(7).split(':');
      if (parts.length === 3) {
        const [iv, tag, ciphertext] = parts;
        try {
          return this.securityManager.decrypt({ iv, tag, ciphertext });
        } catch (err) {
          throw new Error(`Falha ao decifrar campo sensível: ${err.message}`);
        }
      }
    }
    return val;
  }

  _init() {
    if (this.inMemory) {
      this.db = new DatabaseSync(':memory:');
    } else {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(this.dbPath)) fs.closeSync(fs.openSync(this.dbPath, 'wx', 0o600));
      fs.chmodSync(this.dbPath, 0o600);
      this.db = new DatabaseSync(this.dbPath);
      try {
        this.db.exec('PRAGMA journal_mode=WAL;');
        this.db.exec('PRAGMA synchronous=NORMAL;');
      } catch {
        // Fallback if environment doesn't allow WAL
      }
    }

    this._createTables();
    this._ensureBulletinTables();
    this.ensureDefaultWorkspaceState();
    this.bindWorkspace(this.getSetting('bulletin_workspace_id', null));
  }

  bindWorkspace(workspaceId) {
    if (!workspaceId) return;
    const owner = this.getSetting('bulletin_workspace_id', null);
    if (owner && owner !== workspaceId) throw new Error('NOTIFICATION_WORKSPACE_MISMATCH');
    if (!owner) this.setSetting('bulletin_workspace_id', workspaceId);
  }

  _ensureBulletinTables() {
    const exists = this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notification_bulletins'").get();
    const hasWindow = this.db.prepare('PRAGMA table_info(notification_outbox)').all().some(column => column.name === 'first_provider_attempt_at');
    const hasHolds = this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notification_legacy_coverage_holds'").get();
    if ((!exists || !hasWindow || !hasHolds) && !this.inMemory) {
      const hasEvents = this.db.prepare('SELECT 1 FROM notification_events LIMIT 1').get();
      const hasSettings = this.db.prepare('SELECT 1 FROM notification_settings LIMIT 1').get();
      const hasOutbox = this.db.prepare('SELECT 1 FROM notification_outbox LIMIT 1').get();
      if (hasEvents || hasSettings || hasOutbox) {
        const backupPath = `${this.dbPath}.pre-bulletins-${Date.now()}-${randomBytes(4).toString('hex')}.sqlite`;
        fs.closeSync(fs.openSync(backupPath, 'wx', 0o600));
        this.db.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
        fs.chmodSync(backupPath, 0o600);
        this.migrationBackupPath = backupPath;
      }
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (!hasWindow) {
        this.db.exec('ALTER TABLE notification_outbox ADD COLUMN first_provider_attempt_at TEXT');
        this.db.prepare(`UPDATE notification_outbox SET status = 'FAILED', claim_expires_at = NULL, last_error = ?
          WHERE attempts > 0 AND status IN ('QUEUED', 'RETRYABLE_ERROR', 'SENDING')`).run(this.encryptField('DELIVERY_UNCONFIRMED'));
      }
      this.db.exec(`
      CREATE TABLE IF NOT EXISTS notification_legacy_coverage_holds (
        workspace_id TEXT NOT NULL,
        recipient_hash TEXT NOT NULL,
        source_outbox_id TEXT NOT NULL,
        through_at TEXT NOT NULL,
        event_type TEXT NOT NULL,
        reason TEXT NOT NULL,
        PRIMARY KEY (workspace_id, recipient_hash, source_outbox_id, event_type)
      );
      CREATE TABLE IF NOT EXISTS notification_bulletins (
        workspace_id TEXT NOT NULL,
        recipient_hash TEXT NOT NULL,
        day TEXT NOT NULL,
        slot INTEGER NOT NULL CHECK (slot IN (8, 14, 20)),
        outbox_id TEXT NOT NULL UNIQUE,
        context TEXT NOT NULL,
        policies TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, recipient_hash, day, slot)
      );
      CREATE TABLE IF NOT EXISTS notification_event_coverage (
        workspace_id TEXT NOT NULL,
        recipient_hash TEXT NOT NULL,
        event_id TEXT NOT NULL,
        outbox_id TEXT,
        PRIMARY KEY (workspace_id, recipient_hash, event_id)
      );
      CREATE INDEX IF NOT EXISTS idx_bulletin_pending ON notification_events (workspace_id, created_at, id);
      CREATE TABLE IF NOT EXISTS notification_preference_cutoffs (
        workspace_id TEXT NOT NULL,
        principal TEXT NOT NULL,
        event_type TEXT NOT NULL,
        since_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, principal, event_type)
      );
      `);
      if (!exists || !hasHolds) {
        const legacy = this.db.prepare(`SELECT * FROM notification_outbox WHERE event_type != 'OPERATIONAL_BULLETIN'
          AND status IN ('SENT', 'SENDING', 'FAILED')`).all();
        let unknownCoverage = 0;
        let ambiguous = 0;
        const find = this.db.prepare('SELECT id, workspace_id FROM notification_events WHERE workspace_id = ? AND (id = ? OR fingerprint = ?)');
        const cover = this.db.prepare('INSERT OR IGNORE INTO notification_event_coverage VALUES (?, ?, ?, ?)');
        for (const outbox of legacy) {
          if (['PASSWORD_RESET', 'SYSTEM_TEST'].includes(outbox.event_type)) continue;
          const ambiguousDelivery = outbox.status === 'SENDING' || (outbox.status === 'FAILED'
            && ['LEGACY_DELIVERY_AMBIGUOUS', 'DELIVERY_UNCONFIRMED'].includes(this.decryptField(outbox.last_error)));
          if (outbox.status === 'FAILED' && !ambiguousDelivery) continue;
          let matched = 0;
          let payload = null;
          try { payload = JSON.parse(this.decryptField(outbox.payload)); } catch {}
          const identities = new Set(String(outbox.idempotency_key || '').split('/'));
          for (const event of Array.isArray(payload?.events) ? payload.events : []) {
            if (event?.workspace_id === outbox.workspace_id || event?.workspaceId === outbox.workspace_id) {
              if (event.id) identities.add(event.id);
              if (event.fingerprint) identities.add(event.fingerprint);
            }
          }
          for (const token of identities) {
            if (!token.startsWith('evt-') && !/^[a-f0-9]{64}$/.test(token)) continue;
            for (const event of find.all(outbox.workspace_id, token, token)) {
              cover.run(event.workspace_id, outbox.recipient_hash, event.id, outbox.id);
              matched++;
            }
          }
          if (!matched) {
            unknownCoverage++;
            const recipient = this.decryptField(outbox.recipient);
            const recipientHash = typeof recipient === 'string' && recipient.includes('@') && !recipient.startsWith('enc:')
              ? hashRecipient(recipient) : '*';
            const parsedCutoff = new Date(outbox.created_at);
            const cutoff = typeof outbox.created_at === 'string' && Number.isFinite(parsedCutoff.getTime())
              && parsedCutoff.toISOString() === outbox.created_at ? outbox.created_at : '9999-12-31T23:59:59.999Z';
            const operationalTypes = ['PUBLICATION_NEW', 'HEARING_NEW', 'MOVEMENT_NEW', 'DEADLINE_CRITICAL', 'SYNC_FAILED', 'A1_CERT_EXPIRING'];
            const scope = operationalTypes.includes(outbox.event_type) ? [outbox.event_type] : ['*'];
            const hold = this.db.prepare('INSERT OR IGNORE INTO notification_legacy_coverage_holds VALUES (?, ?, ?, ?, ?, ?)');
            for (const type of scope) hold.run(outbox.workspace_id, recipientHash, outbox.id, cutoff, type, 'UNRESOLVED_LEGACY_COVERAGE');
          }
          if (ambiguousDelivery) {
            ambiguous++;
            this.markOutboxFailed(outbox.id, 'LEGACY_DELIVERY_AMBIGUOUS');
          }
        }
        this.setSetting('bulletin_migration_unknown_coverage_count', unknownCoverage);
        this.setSetting('bulletin_migration_ambiguous_count', ambiguous);
        this.db.prepare(`UPDATE notification_outbox SET status = 'CANCELLED', claim_expires_at = NULL, updated_at = ?
          WHERE event_type IN ('PUBLICATION_NEW', 'HEARING_NEW', 'MOVEMENT_NEW', 'DEADLINE_CRITICAL', 'SYNC_FAILED', 'A1_CERT_EXPIRING', 'PUBLICATION_DIGEST', 'DAILY_DIGEST')
            AND status IN ('QUEUED', 'RETRYABLE_ERROR', 'SENDING')`).run(new Date().toISOString());
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  _createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notification_events (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (workspace_id, event_type, fingerprint)
      );
      CREATE INDEX IF NOT EXISTS idx_notif_events_ws_type ON notification_events (workspace_id, event_type);

  CREATE TABLE IF NOT EXISTS notification_reads (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id, event_id)
  );
  CREATE INDEX IF NOT EXISTS idx_notif_reads_user ON notification_reads (workspace_id, user_id);

      CREATE TABLE IF NOT EXISTS notification_preferences (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        cadence TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (workspace_id, user_id, event_type)
      );
      CREATE INDEX IF NOT EXISTS idx_notif_prefs_ws_user ON notification_preferences (workspace_id, user_id);

      CREATE TABLE IF NOT EXISTS notification_recipients (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (workspace_id, email)
      );
      CREATE INDEX IF NOT EXISTS idx_notif_recipients_ws ON notification_recipients (workspace_id);

      CREATE TABLE IF NOT EXISTS notification_recipient_preferences (
        id TEXT PRIMARY KEY,
        recipient_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        cadence TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (recipient_id, event_type)
      );
      CREATE INDEX IF NOT EXISTS idx_notif_recip_prefs ON notification_recipient_preferences (recipient_id);

      CREATE TABLE IF NOT EXISTS notification_outbox (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        recipient TEXT NOT NULL,
        recipient_hash TEXT NOT NULL,
        payload TEXT NOT NULL,
        idempotency_key TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'QUEUED',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        next_attempt_at TEXT NOT NULL,
        claim_expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sent_at TEXT,
        last_error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_notif_outbox_poll ON notification_outbox (status, next_attempt_at);
      CREATE INDEX IF NOT EXISTS idx_notif_outbox_ws ON notification_outbox (workspace_id, status);

      CREATE TABLE IF NOT EXISTS notification_deliveries (
        id TEXT PRIMARY KEY,
        outbox_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        recipient TEXT NOT NULL,
        recipient_hash TEXT NOT NULL,
        provider TEXT NOT NULL DEFAULT 'resend',
        provider_message_id TEXT,
        status TEXT NOT NULL DEFAULT 'SENT',
        sent_at TEXT NOT NULL,
        delivered_at TEXT,
        bounced_at TEXT,
        complained_at TEXT,
        failed_at TEXT,
        last_error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_notif_deliveries_ws ON notification_deliveries (workspace_id);
      CREATE INDEX IF NOT EXISTS idx_notif_deliveries_msg_id ON notification_deliveries (provider_message_id);

      CREATE TABLE IF NOT EXISTS notification_webhook_events (
        id TEXT PRIMARY KEY,
        event_id TEXT UNIQUE NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        processed_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notification_suppressions (
        email TEXT PRIMARY KEY,
        reason TEXT NOT NULL,
        source TEXT NOT NULL,
        suppressed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notification_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  // --- SETTINGS & MASTER SWITCHES & WATERMARK ---
  getSetting(key, defaultValue = null) {
    const row = this.db.prepare('SELECT value FROM notification_settings WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
  }

  setSetting(key, value) {
    this.db.prepare(`
      INSERT INTO notification_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, String(value));
  }

  ensureDefaultWorkspaceState() {
    if (this.getSetting('notifications_enabled', null) !== null) return false;
    this.setSetting('notifications_enabled', 'true');
    this.setSetting('notifications_enabled_at', new Date().toISOString());
    return true;
  }

  isWorkspaceEnabled(_workspaceId = null) {
    return this.getSetting('notifications_enabled', 'true') === 'true';
  }

  setWorkspaceEnabled(enabledOrWorkspaceId, maybeEnabled) {
    const enabled = typeof maybeEnabled === 'boolean'
      ? maybeEnabled
      : Boolean(enabledOrWorkspaceId);
    const isCurrentlyEnabled = this.isWorkspaceEnabled();
    const now = new Date().toISOString();
    if (!enabled) {
      this.db.prepare("UPDATE notification_outbox SET status = 'CANCELLED', claim_expires_at = NULL, updated_at = ? WHERE event_type NOT IN ('PASSWORD_RESET', 'SYSTEM_TEST') AND status IN ('QUEUED', 'RETRYABLE_ERROR')").run(now);
    }
    this.setSetting('notifications_enabled', enabled ? 'true' : 'false');
    if (enabled && (!isCurrentlyEnabled || !this.getSetting('notifications_enabled_at'))) {
      // Record activation watermark to avoid retroactive backlog blast
      this.setSetting('notifications_enabled_at', now);
    }
  }

  getActivationWatermark() {
    return this.getSetting('notifications_enabled_at', null);
  }

  isGlobalPaused() {
    return this.getSetting('global_paused', 'false') === 'true';
  }

  setGlobalPaused(paused) {
    this.setSetting('global_paused', paused ? 'true' : 'false');
  }

  // --- EVENTS ---
  recordEvent({ workspaceId, eventType, fingerprint, payload }) {
    const id = `evt-${Date.now()}-${randomBytes(4).toString('hex')}`;
    let now = new Date().toISOString();
    const watermark = this.getActivationWatermark();
    if (this.isWorkspaceEnabled() && watermark && now <= watermark) {
      const nextMs = new Date(watermark).getTime() + 1;
      now = new Date(nextMs).toISOString();
    }
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const storedPayload = this.encryptField(payloadStr);

    try {
      this.db.prepare(`
        INSERT INTO notification_events (id, workspace_id, event_type, fingerprint, payload, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, workspaceId, eventType, fingerprint, storedPayload, now);

      return {
        id,
        workspaceId,
        eventType,
        fingerprint,
        payload,
        createdAt: now,
        isNew: true
      };
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        return { isNew: false, duplicate: true };
      }
      throw err;
    }
  }

  getEventsByFingerprint(workspaceId, eventType, fingerprint) {
    const row = this.db.prepare(`
      SELECT * FROM notification_events
      WHERE workspace_id = ? AND event_type = ? AND fingerprint = ?
    `).get(workspaceId, eventType, fingerprint);
    if (!row) return null;
    const dec = this.decryptField(row.payload);
    return {
      ...row,
      payload: typeof dec === 'string' ? JSON.parse(dec) : dec
    };
  }

  getPendingEventsForDigest(workspaceId, eventTypes = ['PUBLICATION_NEW', 'HEARING_NEW'], sinceWatermark = null, recipientHash = null, limit = 100) {
    if (recipientHash) return this.getPendingBulletinEvents(workspaceId, recipientHash, eventTypes, sinceWatermark, '9999-12-31T23:59:59.999Z', limit);
    if (!eventTypes.length) return [];
    return this.db.prepare(`
      SELECT e.* FROM notification_events e
      WHERE e.workspace_id = ? AND e.event_type IN (${eventTypes.map(() => '?').join(',')})
        AND e.created_at > ? ORDER BY e.created_at, e.id LIMIT ?
    `).all(workspaceId, ...eventTypes, sinceWatermark || '', limit).map(row => ({
      ...row, payload: JSON.parse(this.decryptField(row.payload))
    }));
  }

  getPendingBulletinEvents(workspaceId, recipientHash, eventTypes, since, until, limit = 100) {
    if (!eventTypes.length) return [];
    return this.db.prepare(`
      SELECT e.* FROM notification_events e
      WHERE e.workspace_id = ? AND e.event_type IN (${eventTypes.map(() => '?').join(',')})
        AND e.created_at > ? AND e.created_at <= ?
        AND NOT EXISTS (SELECT 1 FROM notification_event_coverage c
          WHERE c.workspace_id = e.workspace_id AND c.recipient_hash = ? AND c.event_id = e.id)
        AND NOT EXISTS (SELECT 1 FROM notification_legacy_coverage_holds h
          WHERE h.workspace_id = e.workspace_id AND h.recipient_hash IN (?, '*')
            AND h.event_type IN (e.event_type, '*') AND e.created_at <= h.through_at)
      ORDER BY e.created_at, e.id LIMIT ?
    `).all(workspaceId, ...eventTypes, since || '', until, recipientHash, recipientHash, limit).map(row => ({
      ...row, payload: JSON.parse(this.decryptField(row.payload))
    }));
  }

  getTaskCompletionEvents(workspaceId, { since = '', until = '9999-12-31T23:59:59.999Z', limit = 500 } = {}) {
    return this.db.prepare(`
      SELECT e.* FROM notification_events e
      WHERE e.workspace_id = ? AND e.event_type = 'TASK_COMPLETED'
        AND e.created_at > ? AND e.created_at <= ?
      ORDER BY e.created_at DESC, e.id DESC LIMIT ?
    `).all(workspaceId, since || '', until, Math.max(1, Math.min(1000, Number(limit) || 500))).map(row => ({
      ...row, payload: JSON.parse(this.decryptField(row.payload))
    }));
  }

  listTaskCompletionInbox(workspaceId, { userId = '', username = '', limit = 20 } = {}) {
    const rows = this.getTaskCompletionEvents(workspaceId, { limit: 200 });
    const readIds = new Set(this.db.prepare('SELECT event_id FROM notification_reads WHERE workspace_id = ? AND user_id = ?')
      .all(workspaceId, String(userId || '')).map(row => row.event_id));
    return rows
      .filter(row => {
        const ids = Array.isArray(row.payload?.audienceUserIds) ? row.payload.audienceUserIds.map(String) : [];
        const usernames = Array.isArray(row.payload?.audienceUsernames) ? row.payload.audienceUsernames.map(String) : [];
        return (userId && ids.includes(String(userId))) || (username && usernames.includes(String(username)));
      })
      .slice(0, Math.max(1, Math.min(50, Number(limit) || 20)))
      .map(row => ({
        id: row.id,
        taskId: String(row.payload?.taskId || row.payload?.id || ''),
        title: String(row.payload?.title || 'Tarefa concluída'),
        detail: [row.payload?.actor ? `Concluída por ${row.payload.actor}` : '', row.payload?.process || row.payload?.client || ''].filter(Boolean).join(' · '),
        process: String(row.payload?.process || ''),
        createdAt: row.created_at,
        read: readIds.has(row.id)
      }));
  }

  markTaskCompletionInboxRead(workspaceId, userId, eventIds = []) {
    const ids = [...new Set((Array.isArray(eventIds) ? eventIds : []).map(value => String(value || '').trim()).filter(Boolean))].slice(0, 100);
    if (!ids.length || !userId) return 0;
    const insert = this.db.prepare('INSERT OR IGNORE INTO notification_reads (workspace_id, user_id, event_id, read_at) VALUES (?, ?, ?, ?)');
    const now = new Date().toISOString();
    let marked = 0;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const eventId of ids) marked += Number(insert.run(workspaceId, String(userId), eventId, now).changes || 0);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return marked;
  }

  getLegacyCoverageDiagnostics(workspaceId, recipientHash) {
    const holds = this.db.prepare(`SELECT count(DISTINCT source_outbox_id) AS n FROM notification_legacy_coverage_holds
      WHERE workspace_id = ? AND recipient_hash IN (?, '*')`).get(workspaceId, recipientHash).n;
    const blockedEvents = this.db.prepare(`SELECT count(*) AS n FROM notification_events e
      WHERE e.workspace_id = ? AND EXISTS (SELECT 1 FROM notification_legacy_coverage_holds h
        WHERE h.workspace_id = e.workspace_id AND h.recipient_hash IN (?, '*')
          AND h.event_type IN (e.event_type, '*') AND e.created_at <= h.through_at)`).get(workspaceId, recipientHash).n;
    return { holds, blockedEvents, reason: holds ? 'UNRESOLVED_LEGACY_COVERAGE' : null };
  }

  skipBulletinEvents(workspaceId, recipientHash, eventTypes, until) {
    if (!eventTypes.length) return;
    this.db.prepare(`
      INSERT OR IGNORE INTO notification_event_coverage (workspace_id, recipient_hash, event_id)
      SELECT workspace_id, ?, id FROM notification_events
      WHERE workspace_id = ? AND event_type IN (${eventTypes.map(() => '?').join(',')}) AND created_at <= ?
    `).run(recipientHash, workspaceId, ...eventTypes, until);
  }

  getPreferenceCutoff(workspaceId, principal, eventType) {
    return this.db.prepare('SELECT since_at FROM notification_preference_cutoffs WHERE workspace_id = ? AND principal = ? AND event_type = ?')
      .get(workspaceId, principal, eventType)?.since_at || '';
  }

  setPreferenceCutoff(workspaceId, principal, eventType, now = new Date().toISOString()) {
    this.db.prepare(`INSERT INTO notification_preference_cutoffs VALUES (?, ?, ?, ?)
      ON CONFLICT(workspace_id, principal, event_type) DO UPDATE SET since_at = excluded.since_at`)
      .run(workspaceId, principal, eventType, now);
    const rows = this.db.prepare(`SELECT b.outbox_id, b.policies FROM notification_bulletins b
      JOIN notification_outbox o ON o.id = b.outbox_id AND o.workspace_id = b.workspace_id
      WHERE b.workspace_id = ? AND o.status IN ('QUEUED', 'RETRYABLE_ERROR')`).all(workspaceId);
    for (const row of rows) {
      const policies = JSON.parse(this.decryptField(row.policies));
      if (policies.principals.includes(principal) && policies.eventTypes[eventType]) {
        this.markOutboxCancelled(row.outbox_id, 'Preferência operacional alterada.');
      }
    }
  }

  reserveBulletin({ workspaceId, recipientHash, principals = [], day, slot, now, build }) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (!this.isWorkspaceEnabled() || this.isGlobalPaused()) {
        this.db.exec('COMMIT');
        return { enqueued: false, reason: 'WORKSPACE_PAUSED' };
      }
      const existing = this.db.prepare('SELECT outbox_id FROM notification_bulletins WHERE workspace_id = ? AND recipient_hash = ? AND day = ? AND slot = ?')
        .get(workspaceId, recipientHash, day, slot)
        || this.db.prepare('SELECT outbox_id, policies FROM notification_bulletins WHERE workspace_id = ? AND day = ? AND slot = ?')
          .all(workspaceId, day, slot).find(row => JSON.parse(this.decryptField(row.policies)).principals.some(principal => principals.includes(principal)));
      if (existing) {
        this.db.exec('COMMIT');
        return { enqueued: false, reason: 'SLOT_RESERVED', id: existing.outbox_id };
      }
      const previous = this.db.prepare(`SELECT b.context FROM notification_bulletins b
        JOIN notification_outbox o ON o.id = b.outbox_id AND o.workspace_id = b.workspace_id
        WHERE b.workspace_id = ? AND b.recipient_hash = ? AND b.day = ? AND o.status = 'SENT'
        ORDER BY o.sent_at DESC, b.slot DESC LIMIT 1`)
        .get(workspaceId, recipientHash, day);
      const context = previous ? JSON.parse(this.decryptField(previous.context)) : null;
      const message = build(context);
      if (!message) {
        this.db.exec('COMMIT');
        return { enqueued: false, reason: 'NO_USEFUL_CHANGES' };
      }
      const queued = this.enqueueOutbox(message.outbox);
      if (!queued.enqueued) throw new Error('BULLETIN_OUTBOX_COLLISION');
      this.db.prepare('INSERT INTO notification_bulletins VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(workspaceId, recipientHash, day, slot, queued.id, this.encryptField(message.context), this.encryptField(message.policies), now);
      const cover = this.db.prepare('INSERT INTO notification_event_coverage VALUES (?, ?, ?, ?)');
      for (const event of message.events) cover.run(workspaceId, recipientHash, event.id, queued.id);
      this.db.exec('COMMIT');
      return queued;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  // --- PREFERENCES (INTERNAL USERS) ---
  getUserPreferences(workspaceId, userId) {
    const uid = String(userId || '').trim();
    if (!uid) return [];
    return this.db.prepare(`
      SELECT * FROM notification_preferences
      WHERE workspace_id = ? AND user_id = ?
    `).all(workspaceId, uid).map(row => ({
      ...row,
      enabled: Boolean(row.enabled)
    }));
  }

  getAllPreferencesForWorkspace(workspaceId) {
    return this.db.prepare(`
      SELECT * FROM notification_preferences
      WHERE workspace_id = ?
    `).all(workspaceId).map(row => ({
      ...row,
      enabled: Boolean(row.enabled)
    }));
  }

  upsertPreference({ workspaceId, userId, eventType, cadence, enabled = true }) {
    const id = `pref-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    const enabledNum = enabled ? 1 : 0;
    const old = this.getUserPreferences(workspaceId, userId).find(pref => pref.event_type === eventType);
    if (normalizeCadence(cadence, enabled) === CADENCES.DISABLED || (old && normalizeCadence(old.cadence, old.enabled) === CADENCES.DISABLED)) {
      this.setPreferenceCutoff(workspaceId, `user:${userId}`, eventType, now);
    }

    this.db.prepare(`
      INSERT INTO notification_preferences (id, workspace_id, user_id, event_type, cadence, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(workspace_id, user_id, event_type) DO UPDATE SET
        cadence = excluded.cadence,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at
    `).run(id, workspaceId, userId, eventType, cadence, enabledNum, now, now);

    return {
      workspaceId,
      userId,
      eventType,
      cadence,
      enabled: Boolean(enabled),
      updatedAt: now
    };
  }

  // --- RECIPIENTS (EXTERNAL) & EXTERNAL PREFERENCES MATRIX ---
  listRecipients(workspaceId) {
    const recipients = this.db.prepare(`
      SELECT * FROM notification_recipients
      WHERE workspace_id = ?
      ORDER BY created_at ASC
    `).all(workspaceId).map(row => ({
      ...row,
      enabled: Boolean(row.enabled)
    }));

    const prefStmt = this.db.prepare('SELECT * FROM notification_recipient_preferences WHERE recipient_id = ?');
    return recipients.map(r => {
      const prefs = prefStmt.all(r.id).map(p => ({
        eventType: p.event_type,
        cadence: p.cadence,
        enabled: Boolean(p.enabled)
      }));
      return { ...r, preferences: prefs };
    });
  }

  getRecipientById(workspaceId, id) {
    const r = this.db.prepare(`
      SELECT * FROM notification_recipients
      WHERE workspace_id = ? AND id = ?
    `).get(workspaceId, id);
    if (!r) return null;

    const prefs = this.db.prepare('SELECT * FROM notification_recipient_preferences WHERE recipient_id = ?').all(r.id).map(p => ({
      eventType: p.event_type,
      cadence: p.cadence,
      enabled: Boolean(p.enabled)
    }));

    return { ...r, enabled: Boolean(r.enabled), preferences: prefs };
  }

  addRecipient({ workspaceId, name, email, enabled = true, preferences = [] }) {
    const id = `rcp-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    const cleanEmail = email.trim().toLowerCase();
    const enabledNum = enabled ? 1 : 0;

    this.db.prepare(`
      INSERT INTO notification_recipients (id, workspace_id, name, email, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, workspaceId, name.trim(), cleanEmail, enabledNum, now, now);

    // Set initial preferences matrix
    const prefStmt = this.db.prepare(`
      INSERT INTO notification_recipient_preferences (id, recipient_id, event_type, cadence, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Canonical default for external recipients:
    // PUBLICATION_NEW -> SYNC_DIGEST
    // HEARING_NEW -> SYNC_DIGEST
    // DEADLINE_CRITICAL -> DISABLED
    // SYNC_FAILED -> DISABLED
    // A1_CERT_EXPIRING -> DISABLED
const initialPrefs = [
  { eventType: 'PUBLICATION_NEW', cadence: 'SYNC_DIGEST', enabled: true },
  { eventType: 'HEARING_NEW', cadence: 'SYNC_DIGEST', enabled: true },
  { eventType: 'MOVEMENT_NEW', cadence: 'SYNC_DIGEST', enabled: true },
  { eventType: 'DEADLINE_CRITICAL', cadence: 'DISABLED', enabled: false },
  { eventType: 'SYNC_FAILED', cadence: 'BULLETINS', enabled: true },
  { eventType: 'A1_CERT_EXPIRING', cadence: 'BULLETINS', enabled: true }
];

    const effectivePrefs = Array.isArray(preferences) && preferences.length > 0
      ? initialPrefs.map(ip => {
          const custom = preferences.find(p => p.eventType === ip.eventType);
          return custom ? { ...ip, ...custom } : ip;
        })
      : initialPrefs;

    for (const p of effectivePrefs) {
      const prefId = `rcpp-${Date.now()}-${randomBytes(3).toString('hex')}`;
      prefStmt.run(prefId, id, p.eventType, p.cadence, p.enabled ? 1 : 0, now, now);
    }

    return this.getRecipientById(workspaceId, id);
  }

  updateRecipient(workspaceId, id, { name, email, enabled, preferences }) {
    const existing = this.db.prepare(`
      SELECT * FROM notification_recipients
      WHERE workspace_id = ? AND id = ?
    `).get(workspaceId, id);

    if (!existing) return null;
    if (enabled === false || (enabled === true && !existing.enabled)) {
      for (const type of ['PUBLICATION_NEW', 'HEARING_NEW', 'MOVEMENT_NEW', 'DEADLINE_CRITICAL', 'SYNC_FAILED', 'A1_CERT_EXPIRING']) {
        this.setPreferenceCutoff(workspaceId, `external:${id}`, type);
      }
    }

    const nextName = name !== undefined ? name.trim() : existing.name;
    const nextEmail = email !== undefined ? email.trim().toLowerCase() : existing.email;
    const nextEnabled = enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled;
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE notification_recipients
      SET name = ?, email = ?, enabled = ?, updated_at = ?
      WHERE workspace_id = ? AND id = ?
    `).run(nextName, nextEmail, nextEnabled, now, workspaceId, id);

    if (Array.isArray(preferences)) {
      const upsertStmt = this.db.prepare(`
        INSERT INTO notification_recipient_preferences (id, recipient_id, event_type, cadence, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(recipient_id, event_type) DO UPDATE SET
          cadence = excluded.cadence,
          enabled = excluded.enabled,
          updated_at = excluded.updated_at
      `);
      for (const p of preferences) {
        if (!p || !p.eventType) continue;
        const old = this.getRecipientPreference(id, p.eventType);
        if (normalizeCadence(p.cadence, p.enabled) === CADENCES.DISABLED || normalizeCadence(old.cadence, old.enabled) === CADENCES.DISABLED) {
          this.setPreferenceCutoff(workspaceId, `external:${id}`, p.eventType, now);
        }
        const pId = `rcpp-${Date.now()}-${randomBytes(3).toString('hex')}`;
        upsertStmt.run(pId, id, p.eventType, p.cadence || 'DISABLED', p.enabled ? 1 : 0, now, now);
      }
    }

    return this.getRecipientById(workspaceId, id);
  }

  deleteRecipient(workspaceId, id) {
    const existing = this.getRecipientById(workspaceId, id);
    if (!existing) return null;

    this.db.prepare('DELETE FROM notification_recipient_preferences WHERE recipient_id = ?').run(id);
    this.db.prepare('DELETE FROM notification_recipients WHERE workspace_id = ? AND id = ?').run(workspaceId, id);

    return existing;
  }

  getRecipientPreference(recipientId, eventType) {
    const row = this.db.prepare(`
      SELECT * FROM notification_recipient_preferences
      WHERE recipient_id = ? AND event_type = ?
    `).get(recipientId, eventType);

    if (!row) {
      // Default: operational events disabled, publicações/audiências enabled
      if (['SYNC_FAILED', 'A1_CERT_EXPIRING', 'DEADLINE_CRITICAL'].includes(eventType)) {
        return { enabled: false, cadence: 'DISABLED' };
      }
      return { enabled: true, cadence: 'SYNC_DIGEST' };
    }

    return {
      enabled: Boolean(row.enabled),
      cadence: row.cadence
    };
  }

  // --- SUPPRESSIONS ---
  isSuppressed(email) {
    if (!email) return false;
    const cleanEmail = email.trim().toLowerCase();
    const row = this.db.prepare('SELECT email FROM notification_suppressions WHERE email = ?').get(cleanEmail);
    return Boolean(row);
  }

  addSuppression(email, reason, source = 'webhook') {
    if (!email) return;
    const cleanEmail = email.trim().toLowerCase();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO notification_suppressions (email, reason, source, suppressed_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        reason = excluded.reason,
        source = excluded.source,
        suppressed_at = excluded.suppressed_at
    `).run(cleanEmail, reason, source, now);
  }

  removeSuppression(email) {
    if (!email) return;
    const cleanEmail = email.trim().toLowerCase();
    this.db.prepare('DELETE FROM notification_suppressions WHERE email = ?').run(cleanEmail);
  }

  listSuppressions() {
    return this.db.prepare('SELECT * FROM notification_suppressions ORDER BY suppressed_at DESC').all();
  }

  // --- OUTBOX ---
  enqueueOutbox({
    id = null,
    workspaceId,
    eventType,
    recipient,
    payload,
    idempotencyKey,
    nextAttemptAt = null
  }) {
    const outboxId = id || `obx-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const cleanRecipient = recipient.trim().toLowerCase();
    const recipientHash = hashRecipient(cleanRecipient);
    const now = new Date().toISOString();
    const nextAt = nextAttemptAt || now;
    // Materialize payload once. Retries reuse this exact string!
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);

    const storedRecipient = this.encryptField(cleanRecipient);
    const storedPayload = this.encryptField(payloadStr);

    try {
      this.db.prepare(`
        INSERT INTO notification_outbox (
          id, workspace_id, event_type, recipient, recipient_hash,
          payload, idempotency_key, status, attempts, max_attempts,
          next_attempt_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'QUEUED', 0, 5, ?, ?, ?)
      `).run(
        outboxId, workspaceId, eventType, storedRecipient, recipientHash,
        storedPayload, idempotencyKey, nextAt, now, now
      );

      return {
        id: outboxId,
        workspaceId,
        eventType,
        recipient: cleanRecipient,
        recipientHash,
        idempotencyKey,
        status: 'QUEUED',
        enqueued: true
      };
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        return { enqueued: false, duplicate: true, idempotencyKey };
      }
      throw err;
    }
  }

  cancelIneligibleBulletins(workspaceId, recipientHash, allowed) {
    const rows = this.db.prepare(`SELECT b.outbox_id, b.policies FROM notification_bulletins b
      JOIN notification_outbox o ON o.id = b.outbox_id AND o.workspace_id = b.workspace_id
      WHERE b.workspace_id = ? AND b.recipient_hash = ? AND o.status IN ('QUEUED', 'RETRYABLE_ERROR')`)
      .all(workspaceId, recipientHash);
    for (const row of rows) {
      const policies = JSON.parse(this.decryptField(row.policies)).eventTypes;
      if (Object.keys(policies).some(type => policies[type] && !allowed.includes(type))) {
        this.markOutboxCancelled(row.outbox_id, 'Preferência operacional desabilitada.');
      }
    }
  }

  isBulletinRecipientEligible(item) {
    const row = this.db.prepare('SELECT policies FROM notification_bulletins WHERE workspace_id = ? AND outbox_id = ? AND recipient_hash = ?')
      .get(item.workspace_id, item.id, hashRecipient(item.recipient));
    if (!row) return false;
    const policy = JSON.parse(this.decryptField(row.policies));
    const required = Object.entries(policy.eventTypes || {}).filter(([, enabled]) => enabled).map(([type]) => type);
    if (!required.length) return false;
    const principals = new Set(policy.principals || []);
    const adminOnly = new Set(['SYNC_FAILED', 'A1_CERT_EXPIRING']);
    const matchesEmail = user => hashRecipient(String(user.email || '')) === item.recipient_hash;
    const users = typeof this.securityManager?.listUsers === 'function'
      ? this.securityManager.listUsers(item.workspace_id)
      : typeof this.getCurrentUsers === 'function' ? this.getCurrentUsers(item.workspace_id) : [];
    const candidates = (Array.isArray(users) ? users : []).filter(user =>
      user.status === 'active' && (!user.workspaceId || user.workspaceId === item.workspace_id)
      && matchesEmail(user) && (principals.has(`user:${user.id}`) || principals.has(`user:${user.username}`)));
    return required.every(type => {
      if (candidates.some(user => {
        if (adminOnly.has(type) && !['admin', 'master_admin'].includes(user.role)) return false;
        const pref = this.getUserPreferences(item.workspace_id, user.id).find(value => value.event_type === type)
          || this.getUserPreferences(item.workspace_id, user.username).find(value => value.event_type === type);
        return normalizeCadence(pref?.cadence || 'BULLETINS', pref ? pref.enabled : true) === CADENCES.BULLETINS;
      })) return true;
      if (adminOnly.has(type)) return false;
      return [...principals].filter(principal => principal.startsWith('external:')).some(principal => {
        const external = this.getRecipientById(item.workspace_id, principal.slice(9));
        if (!external?.enabled || !matchesEmail(external)) return false;
        const pref = this.getRecipientPreference(external.id, type);
        return normalizeCadence(pref.cadence, pref.enabled) === CADENCES.BULLETINS;
      });
    });
  }

  validateOutboxForDelivery(id, expectedClaim = null) {
    const item = this.getOutboxItemById(id);
    if (!item || !['QUEUED', 'RETRYABLE_ERROR', 'SENDING'].includes(item.status)) return { allowed: false, reason: 'OUTBOX_NOT_PENDING' };
    if (expectedClaim && (item.status !== 'SENDING' || item.attempts !== expectedClaim.attempts || item.claim_expires_at !== expectedClaim.claim_expires_at)) {
      return { allowed: false, reason: 'CLAIM_CHANGED' };
    }
    const transactional = ['PASSWORD_RESET', 'SYSTEM_TEST'].includes(item.event_type);
    let reason = null;
    if (this.isSuppressed(item.recipient)) reason = 'RECIPIENT_SUPPRESSED';
    else if (!transactional && !this.isWorkspaceEnabled()) reason = 'WORKSPACE_DISABLED';
    else if (!transactional && item.event_type === 'OPERATIONAL_BULLETIN' && !this.isBulletinRecipientEligible(item)) reason = 'RECIPIENT_POLICY_CHANGED';
    if (reason) {
      this.markOutboxCancelled(id, reason);
      return { allowed: false, reason };
    }
    if (this.isGlobalPaused()) return { allowed: false, reason: 'GLOBAL_PAUSED' };
    return { allowed: true, item };
  }

  _cancelOptedOutBulletins() {
    const rows = this.db.prepare(`SELECT o.id FROM notification_bulletins b
      JOIN notification_outbox o ON o.id = b.outbox_id AND o.workspace_id = b.workspace_id
      WHERE o.status IN ('QUEUED', 'RETRYABLE_ERROR') OR (o.status = 'SENDING' AND o.claim_expires_at <= ?)`)
      .all(new Date().toISOString());
    for (const row of rows) this.validateOutboxForDelivery(row.id);
  }

  beginProviderAttempt(id, claim, clock = Date.now()) {
    const now = new Date(clock);
    if (!Number.isFinite(now.getTime())) throw new Error('INVALID_DELIVERY_CLOCK');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const permission = this.validateOutboxForDelivery(id, claim);
      if (!permission.allowed) {
        this.db.exec('COMMIT');
        return permission;
      }
      const item = permission.item;
      const first = item.first_provider_attempt_at;
      let reason = null;
      if (!first && item.attempts > 1) reason = 'DELIVERY_UNCONFIRMED';
      else if (first && (!Number.isFinite(Date.parse(first)) || now.getTime() < Date.parse(first))) reason = 'DELIVERY_UNCONFIRMED';
      else if (first && now.getTime() - Date.parse(first) >= 86400000) reason = 'DELIVERY_WINDOW_EXPIRED';
      if (reason) {
        this.markOutboxFailed(id, reason);
        this.db.exec('COMMIT');
        return { allowed: false, reason };
      }
      if (!first) this.db.prepare('UPDATE notification_outbox SET first_provider_attempt_at = ? WHERE id = ?').run(now.toISOString(), id);
      this.db.exec('COMMIT');
      return permission;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  claimNextOutboxBatch(limit = 10, claimTimeoutMinutes = 5, options = null) {
    this._cancelOptedOutBulletins();
    this.db.prepare(`UPDATE notification_outbox SET status = 'FAILED', claim_expires_at = NULL, last_error = ?
      WHERE first_provider_attempt_at IS NULL AND attempts > 0
        AND (status IN ('QUEUED', 'RETRYABLE_ERROR') OR (status = 'SENDING' AND claim_expires_at <= ?))`)
      .run(this.encryptField('DELIVERY_UNCONFIRMED'), new Date().toISOString());
    const now = new Date();
    const nowIso = now.toISOString();
    const claimExpiresAt = new Date(now.getTime() + claimTimeoutMinutes * 60 * 1000).toISOString();

    // Optional filtering lets the worker process explicitly permitted system
    // items while a workspace is disabled without claiming its normal queue.
    const requestedEventTypes = Array.isArray(options)
      ? options
      : options && Array.isArray(options.eventTypes) ? options.eventTypes : null;
    const hasEventTypeFilter = Array.isArray(requestedEventTypes);
    const eventTypes = requestedEventTypes
      ? [...new Set(requestedEventTypes.filter(eventType => typeof eventType === 'string' && eventType.trim()))]
      : null;
    const eventTypeFilter = hasEventTypeFilter
      ? (eventTypes.length
          ? ` AND event_type IN (${eventTypes.map(() => '?').join(', ')})`
          : ' AND 1 = 0')
      : '';

    const candidates = this.db.prepare(`
      SELECT id FROM notification_outbox
      WHERE (
        (status IN ('QUEUED', 'RETRYABLE_ERROR') AND next_attempt_at <= ?)
        OR (status = 'SENDING' AND claim_expires_at <= ?)
      )
      ${eventTypeFilter}
      ORDER BY next_attempt_at ASC
      LIMIT ?
    `).all(...(eventTypes?.length ? [nowIso, nowIso, ...eventTypes, limit] : [nowIso, nowIso, limit]));

    if (candidates.length === 0) return [];

    const claimed = [];
    const updateStmt = this.db.prepare(`
      UPDATE notification_outbox
      SET status = 'SENDING',
          claim_expires_at = ?,
          attempts = attempts + 1,
          updated_at = ?
      WHERE id = ? AND (
        status IN ('QUEUED', 'RETRYABLE_ERROR')
        OR (status = 'SENDING' AND claim_expires_at <= ?)
      )
      ${eventTypeFilter}
    `);

    const selectStmt = this.db.prepare('SELECT * FROM notification_outbox WHERE id = ?');

    for (const { id } of candidates) {
      const updateParams = eventTypes?.length
        ? [claimExpiresAt, nowIso, id, nowIso, ...eventTypes]
        : [claimExpiresAt, nowIso, id, nowIso];
      const res = updateStmt.run(...updateParams);
      if (res.changes > 0) {
        const row = selectStmt.get(id);
        if (row) {
          const decPayload = this.decryptField(row.payload);
          claimed.push({
            ...row,
            recipient: this.decryptField(row.recipient),
            payload: typeof decPayload === 'string' ? JSON.parse(decPayload) : decPayload,
            last_error: row.last_error ? this.decryptField(row.last_error) : null
          });
        }
      }
    }

    return claimed;
  }

  getOutboxItemById(id) {
    const row = this.db.prepare('SELECT * FROM notification_outbox WHERE id = ?').get(id);
    if (!row) return null;
    const decPayload = this.decryptField(row.payload);
    return {
      ...row,
      recipient: this.decryptField(row.recipient),
      payload: typeof decPayload === 'string' ? JSON.parse(decPayload) : decPayload,
      last_error: row.last_error ? this.decryptField(row.last_error) : null
    };
  }

  markOutboxSent(id, { providerMessageId, sentAt = null }) {
    const now = sentAt || new Date().toISOString();
    this.db.prepare(`
      UPDATE notification_outbox
      SET status = 'SENT',
          sent_at = ?,
          claim_expires_at = NULL,
          updated_at = ?,
          last_error = NULL
      WHERE id = ?
    `).run(now, now, id);

    const outbox = this.db.prepare('SELECT * FROM notification_outbox WHERE id = ?').get(id);
    if (outbox) {
      const deliveryId = `dlv-${Date.now()}-${randomBytes(4).toString('hex')}`;
      this.db.prepare(`
        INSERT INTO notification_deliveries (
          id, outbox_id, workspace_id, recipient, recipient_hash,
          provider, provider_message_id, status, sent_at
        ) VALUES (?, ?, ?, ?, ?, 'resend', ?, 'SENT', ?)
      `).run(
        deliveryId, outbox.id, outbox.workspace_id, outbox.recipient, outbox.recipient_hash,
        providerMessageId || null, now
      );
    }
  }

  markOutboxRetryable(id, error, delaySeconds = 30) {
    const now = new Date();
    const nextAt = new Date(now.getTime() + delaySeconds * 1000).toISOString();
    const errMessage = String(error?.message || error || 'Unknown error').slice(0, 500);
    const storedError = this.encryptField(errMessage);

    this.db.prepare(`
      UPDATE notification_outbox
      SET status = CASE WHEN attempts >= max_attempts THEN 'FAILED' ELSE 'RETRYABLE_ERROR' END,
          next_attempt_at = ?,
          claim_expires_at = NULL,
          last_error = ?,
          updated_at = ?
      WHERE id = ?
    `).run(nextAt, storedError, now.toISOString(), id);
  }

  markOutboxFailed(id, error) {
    const now = new Date().toISOString();
    const errMessage = String(error?.message || error || 'Terminal error').slice(0, 500);
    const storedError = this.encryptField(errMessage);

    this.db.prepare(`
      UPDATE notification_outbox
      SET status = 'FAILED',
          claim_expires_at = NULL,
          last_error = ?,
          updated_at = ?
      WHERE id = ?
    `).run(storedError, now, id);
  }

  markOutboxCancelled(id, reason = 'Cancelled by administrator') {
    const now = new Date().toISOString();
    const storedReason = this.encryptField(reason);
    this.db.prepare(`
      UPDATE notification_outbox
      SET status = 'CANCELLED',
          claim_expires_at = NULL,
          last_error = ?,
          updated_at = ?
      WHERE id = ?
    `).run(storedReason, now, id);
  }

  // --- DELIVERIES & WEBHOOKS ---
  recordWebhookEvent({ eventId, eventType, payload }) {
    const id = `wbk-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    // Webhook retention discipline: keep minimal sanitized diagnostic payload
    const sanitizedPayload = typeof payload === 'object' && payload !== null
      ? JSON.stringify({
          email_id: payload.data?.email_id || payload.data?.id,
          type: payload.type,
          created_at: payload.created_at,
          bounce_type: payload.data?.bounce?.type || null
        })
      : String(payload).slice(0, 200);

    try {
      this.db.prepare(`
        INSERT INTO notification_webhook_events (id, event_id, event_type, payload, processed_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, eventId, eventType, sanitizedPayload, now, now);
      return { isNew: true, id };
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        return { isNew: false, duplicate: true };
      }
      throw err;
    }
  }

  updateDeliveryFromWebhook({ providerMessageId, status, timestamp, error, bounce = null }) {
    const now = timestamp || new Date().toISOString();
    const normalizedStatus = status.toUpperCase();

    const delivery = this.db.prepare(`
      SELECT * FROM notification_deliveries
      WHERE provider_message_id = ?
    `).get(providerMessageId);

    if (!delivery) return null;

    let updateField = '';
    if (normalizedStatus === 'DELIVERED') updateField = 'delivered_at = ?';
    else if (normalizedStatus === 'BOUNCED') updateField = 'bounced_at = ?';
    else if (normalizedStatus === 'COMPLAINED') updateField = 'complained_at = ?';
    else if (normalizedStatus === 'FAILED') updateField = 'failed_at = ?';

    const storedError = error ? this.encryptField(error) : null;

    if (updateField) {
      this.db.prepare(`
        UPDATE notification_deliveries
        SET status = ?, ${updateField}, last_error = ?
        WHERE id = ?
      `).run(normalizedStatus, now, storedError, delivery.id);
    }

    const plainRecipient = this.decryptField(delivery.recipient);

    // Suppression logic: ONLY permanent bounce, complaint, or suppressed
    if (normalizedStatus === 'BOUNCED') {
      const isPermanent = bounce?.type === 'Permanent' || !bounce?.type;
      if (isPermanent) {
        this.addSuppression(plainRecipient, 'permanent_bounce', 'webhook');
      }
      // If bounce.type === 'Transient', do NOT suppress permanently!
    } else if (normalizedStatus === 'COMPLAINED') {
      this.addSuppression(plainRecipient, 'spam_complaint', 'webhook');
    } else if (normalizedStatus === 'SUPPRESSED') {
      this.addSuppression(plainRecipient, 'email.suppressed', 'webhook');
    }

    return {
      ...delivery,
      recipient: plainRecipient
    };
  }

  // --- STATS & TELEMETRY ---
  countOutboxByEventTypeSince(workspaceId, eventType, sinceIso) {
    const row = this.db.prepare(`
      SELECT COUNT(*) as count FROM notification_outbox
      WHERE workspace_id = ? AND event_type = ? AND created_at >= ?
    `).get(workspaceId, eventType, sinceIso);
    return row?.count || 0;
  }

  getStats() {
    const now = new Date();
    const spFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const spTodayStr = spFormatter.format(now);
    const startOfTodayIso = `${spTodayStr}T00:00:00.000Z`;
    const startOfMonthIso = `${spTodayStr.slice(0, 7)}-01T00:00:00.000Z`;

    const sentTodayRow = this.db.prepare(`
      SELECT COUNT(*) as count FROM notification_deliveries
      WHERE sent_at >= ?
    `).get(startOfTodayIso);

    const sentMonthRow = this.db.prepare(`
      SELECT COUNT(*) as count FROM notification_deliveries
      WHERE sent_at >= ?
    `).get(startOfMonthIso);

    const queueCounts = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM notification_outbox
      GROUP BY status
    `).all();

    const queueMap = { QUEUED: 0, SENDING: 0, SENT: 0, RETRYABLE_ERROR: 0, FAILED: 0, CANCELLED: 0 };
    for (const r of queueCounts) {
      if (queueMap[r.status] !== undefined) queueMap[r.status] = r.count;
    }

    const deliveryCounts = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM notification_deliveries
      GROUP BY status
    `).all();

    const deliveryMap = { SENT: 0, DELIVERED: 0, BOUNCED: 0, COMPLAINED: 0, FAILED: 0, SUPPRESSED: 0 };
    for (const r of deliveryCounts) {
      if (deliveryMap[r.status] !== undefined) deliveryMap[r.status] = r.count;
    }

    const lastSendRow = this.db.prepare(`
      SELECT sent_at, recipient_hash, provider_message_id
      FROM notification_deliveries
      ORDER BY sent_at DESC
      LIMIT 1
    `).get();

    return {
      enabled: this.isWorkspaceEnabled(),
      enabledAt: this.getActivationWatermark(),
      paused: this.isGlobalPaused(),
      sentToday: sentTodayRow?.count || 0,
      sentMonth: sentMonthRow?.count || 0,
      queue: queueMap,
      delivery: deliveryMap,
      unresolvedLegacyCoverage: this.db.prepare('SELECT count(DISTINCT source_outbox_id) AS n FROM notification_legacy_coverage_holds').get().n,
      lastSend: lastSendRow || null
    };
  }

  getRecentHistory(limit = 20) {
    return this.db.prepare(`
      SELECT o.id, o.workspace_id, o.event_type, o.recipient_hash, o.status,
             o.attempts, o.sent_at, o.created_at, o.last_error,
             d.status as delivery_status, d.provider_message_id, d.delivered_at, d.bounced_at
      FROM notification_outbox o
      LEFT JOIN notification_deliveries d ON d.outbox_id = o.id
      ORDER BY o.created_at DESC
      LIMIT ?
    `).all(limit);
  }

  close() {
    if (this.db) {
      try { this.db.close(); } catch {}
      this.db = null;
    }
  }
}
