/**
 * Encrypted collector cache, never the authority for the ATRIUM workspace.
 * New filename isolates the unencrypted laboratory schema; no destructive migration.
 */
import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

export class OmniStorage {
  constructor({ dataDirectory, securityManager, dbFilename = 'omni-cache-v1.sqlite' } = {}) {
    if (!securityManager?.encrypt || !securityManager?.decrypt || !securityManager?.encryptionKey) {
      throw new TypeError('SecurityManager obrigatório para o cache judicial cifrado.');
    }
    this.security = securityManager;
    this.dbPath = path.join(dataDirectory || path.resolve('data'), dbFilename);
    this.db = null;
  }
  async init() {
    await mkdir(path.dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS omni_cache (
        kind TEXT NOT NULL, id INTEGER NOT NULL, lookup TEXT NOT NULL, encrypted TEXT NOT NULL,
        PRIMARY KEY(kind,id)
      );
      CREATE INDEX IF NOT EXISTS omni_cache_lookup ON omni_cache(kind,lookup,id);
    `);
    // Fail closed on a wrong key, even if the requested CNJ has not been cached.
    const row = this.db.prepare('SELECT encrypted FROM omni_cache LIMIT 1').get();
    if (row) this.decode(row);
  }
  key(cnj) {
    return createHmac('sha256', this.security.encryptionKey).update('omni:' + cnj).digest('hex');
  }
  decode(row) {
    return row ? JSON.parse(this.security.decrypt(JSON.parse(row.encrypted))) : null;
  }
  append(kind, cnj, value) {
    const id = Number(this.db.prepare('SELECT COALESCE(MAX(id),0)+1 AS id FROM omni_cache WHERE kind=?').get(kind).id);
    const encrypted = JSON.stringify(this.security.encrypt(JSON.stringify({ ...value, id })));
    this.db.prepare('INSERT INTO omni_cache(kind,id,lookup,encrypted) VALUES(?,?,?,?)')
      .run(kind, id, this.key(cnj), encrypted);
    return id;
  }
  latest(kind, cnj) {
    return this.decode(this.db.prepare('SELECT encrypted FROM omni_cache WHERE kind=? AND lookup=? ORDER BY id DESC LIMIT 1')
      .get(kind, this.key(cnj)));
  }
  saveSnapshot(canonical) { return this.append('snapshot', canonical.cnj, canonical); }
  getLatestSnapshot(cnj) { return this.latest('snapshot', cnj); }
  saveDiff(cnj, diff, previousSnapshotId, newSnapshotId) {
    return this.append('diff', cnj, { cnj, diff, hasChanges: diff.hasChanges,
      previousSnapshotId, newSnapshotId, createdAt: new Date().toISOString() });
  }
  getLatestDiff(cnj) { return this.latest('diff', cnj); }
  saveObservation(canonical, diff, previousSnapshotId) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const snapshotId = this.saveSnapshot(canonical);
      const diffId = this.saveDiff(canonical.cnj, diff, previousSnapshotId, snapshotId);
      this.db.exec('COMMIT');
      return { snapshotId, diffId };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  addToWatchlist({ cnj, court, clientName = '' }) {
    const old = this.latest('watch', cnj);
    const value = { cnj, court, client_name: clientName, monitoring_status: 'active',
      created_at: old?.created_at || new Date().toISOString(), last_checked_at: old?.last_checked_at || null };
    if (old) {
      this.db.prepare('UPDATE omni_cache SET encrypted=? WHERE kind=? AND id=?')
        .run(JSON.stringify(this.security.encrypt(JSON.stringify({ ...value, id: old.id }))), 'watch', old.id);
    } else this.append('watch', cnj, value);
  }
  getWatchlist() {
    return this.db.prepare("SELECT encrypted FROM omni_cache WHERE kind='watch' ORDER BY id").all().map(row => this.decode(row));
  }
  updateWatchlistChecked(cnj) {
    const value = this.latest('watch', cnj);
    if (value) this.db.prepare("UPDATE omni_cache SET encrypted=? WHERE kind='watch' AND id=?")
      .run(JSON.stringify(this.security.encrypt(JSON.stringify({ ...value, last_checked_at: new Date().toISOString() }))), value.id);
  }
  recordRun(run) { return this.append('run', '', run); }
  close() { if (this.db) { this.db.close(); this.db = null; } }
}
