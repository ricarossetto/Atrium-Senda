import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const SESSION_STATUS = {
  NOT_CONFIGURED: 'not_configured',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  EXPIRED: 'expired',
  HUMAN_ACTION_REQUIRED: 'human_action_required',
  ERROR: 'error'
};

export class JudicialSessionManager {
  constructor({ dataDirectory }) {
    this.baseDir = path.join(dataDirectory, 'browser-profiles');
    this.stateFile = path.join(dataDirectory, 'judicial-sessions.json');
    this.activeLocks = new Set();
    this.sessionStates = new Map();
  }

  async init() {
    await mkdir(this.baseDir, { recursive: true });
    try {
      if (existsSync(this.stateFile)) {
        const raw = JSON.parse(await readFile(this.stateFile, 'utf8'));
        for (const [key, value] of Object.entries(raw)) {
          this.sessionStates.set(key, value);
        }
      }
    } catch {}
  }

  getProfileDir(userId, portalId) {
    const safeUser = String(userId || 'default-user').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safePortal = String(portalId || 'portal').replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.baseDir, safeUser, safePortal);
  }

  async acquireLock(userId, portalId) {
    const lockKey = `${userId}:${portalId}`;
    if (this.activeLocks.has(lockKey)) {
      throw new Error(`O perfil do portal ${portalId} já está em uso por outra operação simultânea.`);
    }
    this.activeLocks.add(lockKey);
    return () => this.releaseLock(userId, portalId);
  }

  releaseLock(userId, portalId) {
    const lockKey = `${userId}:${portalId}`;
    this.activeLocks.delete(lockKey);
  }

  isLocked(userId, portalId) {
    return this.activeLocks.has(`${userId}:${portalId}`);
  }

  async getSessionStatus(userId, portalId) {
    const key = `${userId}:${portalId}`;
    const profileDir = this.getProfileDir(userId, portalId);
    const profileExists = existsSync(profileDir);
    const state = this.sessionStates.get(key) || {};

    if (!profileExists && !state.status) {
      return {
        status: SESSION_STATUS.NOT_CONFIGURED,
        profileExists: false,
        lastConnectedAt: null,
        lastCheckedAt: null
      };
    }

    return {
      status: state.status || (profileExists ? SESSION_STATUS.CONNECTED : SESSION_STATUS.NOT_CONFIGURED),
      profileExists,
      lastConnectedAt: state.lastConnectedAt || null,
      lastCheckedAt: state.lastCheckedAt || null,
      error: state.error || null
    };
  }

  async updateSessionStatus(userId, portalId, status, details = {}) {
    const key = `${userId}:${portalId}`;
    const current = this.sessionStates.get(key) || {};
    const updated = {
      ...current,
      status,
      lastCheckedAt: new Date().toISOString(),
      ...(status === SESSION_STATUS.CONNECTED ? { lastConnectedAt: new Date().toISOString(), error: null } : {}),
      ...details
    };
    this.sessionStates.set(key, updated);
    await this.persist();
    return updated;
  }

  async clearSession(userId, portalId) {
    return this.clearPortalSession(userId, portalId);
  }

  async clearPortalSession(userId, portalId) {
    const release = await this.acquireLock(userId, portalId);
    try {
      const profileDir = this.getProfileDir(userId, portalId);
      if (existsSync(profileDir)) {
        try {
          await rm(profileDir, { recursive: true, force: true });
        } catch (err) {
          console.warn(`Aviso ao limpar perfil ${profileDir}:`, err.message);
        }
      }
      const key = `${userId}:${portalId}`;
      this.sessionStates.delete(key);
      await this.persist();
      return { ok: true, cleared: true, portalId };
    } finally {
      release();
    }
  }

  async countProfiles() {
    try {
      if (!existsSync(this.baseDir)) return 0;
      const { readdir } = await import('node:fs/promises');
      const users = await readdir(this.baseDir, { withFileTypes: true });
      let count = 0;
      for (const u of users) {
        if (u.isDirectory()) {
          const portals = await readdir(path.join(this.baseDir, u.name), { withFileTypes: true });
          count += portals.filter(p => p.isDirectory()).length;
        }
      }
      return count;
    } catch {
      return 0;
    }
  }

  async listProfiles() {
    try {
      if (!existsSync(this.baseDir)) return [];
      const { readdir } = await import('node:fs/promises');
      const users = await readdir(this.baseDir, { withFileTypes: true });
      const list = [];
      for (const u of users) {
        if (u.isDirectory()) {
          const portals = await readdir(path.join(this.baseDir, u.name), { withFileTypes: true });
          for (const p of portals) {
            if (p.isDirectory()) {
              list.push({ userId: u.name, portalId: p.name, path: path.join(this.baseDir, u.name, p.name) });
            }
          }
        }
      }
      return list;
    } catch {
      return [];
    }
  }

  async persist() {
    const obj = {};
    for (const [key, value] of this.sessionStates.entries()) {
      obj[key] = value;
    }
    try {
      await writeFile(this.stateFile, JSON.stringify(obj, null, 2), 'utf8');
    } catch {}
  }
}
