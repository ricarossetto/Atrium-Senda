import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SNAPSHOT_VERSION = 1;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((accumulator, key) => {
      accumulator[key] = stableValue(value[key]);
      return accumulator;
    }, {});
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

export function fingerprintPjeRecord(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

export function buildPjeSnapshot(inventory) {
  const records = {};
  for (const situation of inventory.expedientes?.situations || []) {
    const key = `exp:${situation.label}`;
    records[key] = {
      kind: 'expediente_situacao',
      label: situation.label,
      count: situation.count,
      fingerprint: fingerprintPjeRecord({ label: situation.label, count: situation.count })
    };
  }
  const seen = new Set();
  for (const section of ['expedientes', 'acervo']) {
    for (const process of inventory[section]?.processes || []) {
      const key = `proc:${process.processNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);
      records[key] = {
        kind: 'processo',
        processNumber: process.processNumber,
        summary: process.summary,
        lastDate: process.lastDate,
        fingerprint: fingerprintPjeRecord({ processNumber: process.processNumber, summary: process.summary })
      };
    }
  }
  return {
    version: SNAPSHOT_VERSION,
    portalId: inventory.portalId,
    collectedAt: inventory.collectedAt,
    records
  };
}

export function diffPjeSnapshots(previous, next) {
  const previousRecords = previous?.records || {};
  const nextRecords = next?.records || {};
  const added = [];
  const updated = [];
  const unchanged = [];
  const removed = [];
  for (const [key, record] of Object.entries(nextRecords)) {
    const before = previousRecords[key];
    if (!before) added.push(key);
    else if (before.fingerprint !== record.fingerprint) updated.push(key);
    else unchanged.push(key);
  }
  for (const key of Object.keys(previousRecords)) {
    if (!nextRecords[key]) removed.push(key);
  }
  return {
    added,
    updated,
    unchanged,
    removed,
    status: added.length || updated.length || removed.length ? 'CHANGED' : 'UNCHANGED',
    totals: {
      added: added.length,
      updated: updated.length,
      unchanged: unchanged.length,
      removed: removed.length
    }
  };
}

export class PjeSnapshotStore {
  constructor({ rootDir } = {}) {
    if (!rootDir) throw new Error('PjeSnapshotStore exige rootDir do workspace.');
    this.rootDir = rootDir;
  }

  filePath(portalId) {
    return path.join(this.rootDir, 'pje', String(portalId || 'unknown'), 'snapshot.json');
  }

  async read(portalId) {
    try {
      const { readFile } = await import('node:fs/promises');
      const parsed = JSON.parse(await readFile(this.filePath(portalId), 'utf8'));
      if (parsed?.version !== SNAPSHOT_VERSION || typeof parsed.records !== 'object') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async save(portalId, snapshot) {
    const target = this.filePath(portalId);
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
    await rename(temp, target);
    return target;
  }
}
