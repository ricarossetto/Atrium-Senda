import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const SESSION_STATUS = {
  NOT_CONFIGURED: 'not_configured',
  CONNECTING: 'connecting',
  AUTHENTICATING: 'authenticating',
  CONNECTED: 'connected',
  EXPIRED: 'expired',
  HUMAN_ACTION_REQUIRED: 'human_action_required',
  ACTION_REQUIRED: 'action_required',
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

  getProfileDir(userId, portalId, identityId = '') {
    const safeUser = String(userId || 'default-user').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safePortal = String(portalId || 'portal').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeIdentity = String(identityId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
    if (safeIdentity) {
      const managed = path.join(this.baseDir, safeUser, safeIdentity, safePortal);
      const legacyPrimary = path.join(this.baseDir, safeUser, safePortal);
      if (safeIdentity === 'office-primary' && existsSync(legacyPrimary) && !existsSync(managed)) return legacyPrimary;
      return managed;
    }
    return path.join(this.baseDir, safeUser, safePortal);
  }

  sessionKey(userId, portalId, identityId = '') {
    return `${userId}:${identityId || 'legacy-primary'}:${portalId}`;
  }

  async acquireLock(userId, portalId, identityId = '') {
    const lockKey = this.sessionKey(userId, portalId, identityId);
    if (this.activeLocks.has(lockKey)) {
      throw new Error(`O perfil do portal ${portalId} já está em uso por outra operação simultânea.`);
    }
    this.activeLocks.add(lockKey);
    return () => this.releaseLock(userId, portalId, identityId);
  }

  releaseLock(userId, portalId, identityId = '') {
    const lockKey = this.sessionKey(userId, portalId, identityId);
    this.activeLocks.delete(lockKey);
  }

  isLocked(userId, portalId, identityId = '') {
    return this.activeLocks.has(this.sessionKey(userId, portalId, identityId));
  }

  async getSessionStatus(userId, portalId, identityId = '') {
    const managedKey = this.sessionKey(userId, portalId, identityId);
    const legacyKey = `${userId}:${portalId}`;
    const key = identityId ? managedKey : legacyKey;
    const profileDir = this.getProfileDir(userId, portalId, identityId);
    const profileExists = existsSync(profileDir);
    const state = this.sessionStates.get(key) || (!identityId ? this.sessionStates.get(managedKey) : null) || {};

    if (!profileExists && !state.status) {
      return {
        status: SESSION_STATUS.NOT_CONFIGURED,
        profileExists: false,
        lastConnectedAt: null,
        lastCheckedAt: null,
        lastAttemptAt: null,
        lastSuccessfulSyncAt: null,
        nextRefreshAt: null,
        failureCount: 0,
        humanAction: null,
        error: null
      };
    }

    return {
      status: state.status || (profileExists ? SESSION_STATUS.CONNECTED : SESSION_STATUS.NOT_CONFIGURED),
      profileExists,
      lastConnectedAt: state.lastConnectedAt || null,
      lastCheckedAt: state.lastCheckedAt || null,
      lastAttemptAt: state.lastAttemptAt || null,
      lastSuccessfulSyncAt: state.lastSuccessfulSyncAt || state.lastConnectedAt || null,
      nextRefreshAt: state.nextRefreshAt || null,
      failureCount: Number(state.failureCount || 0),
      humanAction: state.humanAction || null,
      error: state.error || null
    };
  }

  async updateSessionStatus(userId, portalId, status, details = {}, identityId = '') {
    const key = identityId ? this.sessionKey(userId, portalId, identityId) : `${userId}:${portalId}`;
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

  async clearSession(userId, portalId, identityId = '') {
    return this.clearPortalSession(userId, portalId, identityId);
  }

  async clearPortalSession(userId, portalId, identityId = '') {
    const release = await this.acquireLock(userId, portalId, identityId);
    try {
      const profileDir = this.getProfileDir(userId, portalId, identityId);
      if (existsSync(profileDir)) {
        try {
          await rm(profileDir, { recursive: true, force: true });
        } catch (err) {
          console.warn(`Aviso ao limpar perfil ${profileDir}:`, err.message);
        }
      }
      const key = identityId ? this.sessionKey(userId, portalId, identityId) : `${userId}:${portalId}`;
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
