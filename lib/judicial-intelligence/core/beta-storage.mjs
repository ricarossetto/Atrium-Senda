import { createHmac } from 'node:crypto';
import { JudicialIntelligenceError, JI_ERROR_CODES } from './errors.mjs';

export const BETA_SCHEMA_VERSION = 1;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,159}$/;
const VALID_KINDS = /^[a-z][a-z0-9_]{1,31}$/;

export function assertBetaId(value, label = 'id') {
  if (!ID_PATTERN.test(String(value || ''))) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, `${label} inválido para o armazenamento beta.`);
  }
  return String(value);
}

export function assertBetaKind(kind) {
  if (!VALID_KINDS.test(String(kind || ''))) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, `Tipo de registro beta inválido: ${kind}`);
  }
  return String(kind);
}

export class BetaStore {
  #db = null;

  constructor({ dataDirectory, securityManager, dbFilename = 'ji-beta-v1.sqlite', namespace = 'ji-beta' } = {}) {
    if (!securityManager?.encrypt || !securityManager?.decrypt || !securityManager?.encryptionKey) {
      throw new TypeError('SecurityManager obrigatório para o armazenamento beta cifrado.');
    }
    this.security = securityManager;
    this.namespace = namespace;
    this.dbPath = dataDirectory
      ? `${String(dataDirectory).replace(/[\\/]+$/, '')}/beta/${dbFilename}`
      : `data/beta/${dbFilename}`;
  }

  async init() {
    const { DatabaseSync } = await import('node:sqlite');
    const { mkdir } = await import('node:fs/promises');
    const path = await import('node:path');
    await mkdir(path.dirname(this.dbPath), { recursive: true });
    this.#db = new DatabaseSync(this.dbPath);
    this.#db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS ji_records (
        kind TEXT NOT NULL, id TEXT NOT NULL, lookup TEXT,
        encrypted TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(kind,id)
      );
      CREATE INDEX IF NOT EXISTS ji_records_lookup ON ji_records(kind,lookup,updated_at);
      CREATE TABLE IF NOT EXISTS ji_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL, operation TEXT NOT NULL, status TEXT NOT NULL,
        duration_ms INTEGER NOT NULL, items INTEGER NOT NULL,
        cache_hit INTEGER NOT NULL, error_class TEXT, created_at TEXT NOT NULL
      );
    `);
    const row = this.#db.prepare('SELECT encrypted FROM ji_records LIMIT 1').get();
    if (row) this.#decode(row);
    return this;
  }

  #requireDb() {
    if (!this.#db) throw new JudicialIntelligenceError(JI_ERROR_CODES.INTERNAL, 'Armazenamento beta não inicializado.');
    return this.#db;
  }

  #decode(row) {
    if (!row) return null;
    return JSON.parse(this.security.decrypt(JSON.parse(row.encrypted)));
  }

  lookupKey(kind, lookup) {
    return createHmac('sha256', this.security.encryptionKey)
      .update(`${this.namespace}:${kind}:${lookup}`)
      .digest('hex');
  }

  put(kind, id, value, { lookup = null } = {}) {
    const db = this.#requireDb();
    assertBetaKind(kind);
    assertBetaId(id);
    const now = new Date().toISOString();
    const existing = db.prepare('SELECT created_at, lookup FROM ji_records WHERE kind=? AND id=?').get(kind, id);
    const effectiveLookup = lookup === null ? (existing?.lookup ?? null) : this.lookupKey(kind, lookup);
    const encrypted = JSON.stringify(this.security.encrypt(JSON.stringify(value)));
    if (existing) {
      db.prepare('UPDATE ji_records SET lookup=?, encrypted=?, updated_at=? WHERE kind=? AND id=?')
        .run(effectiveLookup, encrypted, now, kind, id);
      return { kind, id, created: false, updatedAt: now };
    }
    db.prepare('INSERT INTO ji_records(kind,id,lookup,encrypted,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .run(kind, id, effectiveLookup, encrypted, now, now);
    return { kind, id, created: true, updatedAt: now };
  }

  get(kind, id) {
    const row = this.#requireDb()
      .prepare('SELECT encrypted FROM ji_records WHERE kind=? AND id=?').get(kind, assertBetaId(id));
    return this.#decode(row);
  }

  list(kind, { limit = 50, lookup = null } = {}) {
    assertBetaKind(kind);
    const db = this.#requireDb();
    const capped = Math.min(Math.max(1, Number(limit) || 50), 500);
    const rows = lookup === null
      ? db.prepare('SELECT encrypted FROM ji_records WHERE kind=? ORDER BY updated_at DESC LIMIT ?').all(kind, capped)
      : db.prepare('SELECT encrypted FROM ji_records WHERE kind=? AND lookup=? ORDER BY updated_at DESC LIMIT ?')
        .all(kind, this.lookupKey(kind, lookup), capped);
    return rows.map(row => this.#decode(row));
  }

  remove(kind, id) {
    const result = this.#requireDb().prepare('DELETE FROM ji_records WHERE kind=? AND id=?').run(kind, assertBetaId(id));
    return result.changes > 0;
  }

  count(kind) {
    return Number(this.#requireDb().prepare('SELECT COUNT(*) AS total FROM ji_records WHERE kind=?').get(assertBetaKind(kind)).total);
  }

  recordRun(record = {}) {
    const db = this.#requireDb();
    db.prepare(`INSERT INTO ji_runs(provider,operation,status,duration_ms,items,cache_hit,error_class,created_at)
      VALUES(?,?,?,?,?,?,?,?)`)
      .run(
        String(record.provider || 'unknown').slice(0, 64),
        String(record.operation || 'unknown').slice(0, 64),
        String(record.status || 'ok').slice(0, 32),
        Math.max(0, Number(record.durationMs) || 0),
        Math.max(0, Number(record.items) || 0),
        record.cacheHit === true ? 1 : 0,
        record.errorClass ? String(record.errorClass).slice(0, 64) : null,
        new Date().toISOString()
      );
    return true;
  }

  runs({ limit = 50, provider = null } = {}) {
    const capped = Math.min(Math.max(1, Number(limit) || 50), 500);
    const rows = provider
      ? this.#requireDb().prepare('SELECT * FROM ji_runs WHERE provider=? ORDER BY id DESC LIMIT ?').all(String(provider), capped)
      : this.#requireDb().prepare('SELECT * FROM ji_runs ORDER BY id DESC LIMIT ?').all(capped);
    return rows.map(row => ({
      id: Number(row.id),
      provider: row.provider,
      operation: row.operation,
      status: row.status,
      durationMs: Number(row.duration_ms),
      items: Number(row.items),
      cacheHit: Number(row.cache_hit) === 1,
      errorClass: row.error_class,
      createdAt: row.created_at
    }));
  }

  close() {
    if (this.#db) {
      this.#db.close();
      this.#db = null;
    }
  }
}
