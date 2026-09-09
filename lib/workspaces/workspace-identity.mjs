import { randomUUID } from 'node:crypto';

export const DEFAULT_WORKSPACE_ID = 'ws-default';
export const DEFAULT_WORKSPACE_NAME = 'Meu escritório';

export function normalizeWorkspaceName(value, fallback = DEFAULT_WORKSPACE_NAME) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  const result = normalized || fallback;
  if (result.length < 2 || result.length > 120) {
    throw Object.assign(new Error('O nome do escritório deve ter entre 2 e 120 caracteres.'), { statusCode: 400 });
  }
  return result;
}

export function createWorkspaceId() {
  return `ws-${randomUUID()}`;
}

export function migrateWorkspaceIdentity(state = {}) {
  const next = state && typeof state === 'object' && !Array.isArray(state) ? state : {};
  const before = JSON.stringify(next);
  const now = new Date().toISOString();
  const existing = Array.isArray(next.workspaces) ? next.workspaces : [];
  let primary = existing.find(item => item?.id === next.defaultWorkspaceId)
    || existing.find(item => item?.id)
    || null;

  if (!primary) {
    primary = {
      id: DEFAULT_WORKSPACE_ID,
      name: normalizeWorkspaceName(next.workspaceName || next.officeName, DEFAULT_WORKSPACE_NAME),
      status: 'active',
      createdAt: next.createdAt || now,
      updatedAt: next.updatedAt || now
    };
    existing.push(primary);
  }

  primary.name = normalizeWorkspaceName(primary.name, DEFAULT_WORKSPACE_NAME);
  primary.status = primary.status === 'inactive' ? 'inactive' : 'active';
  primary.updatedAt ||= next.updatedAt || now;
  next.workspaces = existing;
  next.defaultWorkspaceId = primary.id;

  if (Array.isArray(next.users)) {
    for (const user of next.users) {
      if (user && !user.workspaceId) user.workspaceId = primary.id;
    }
  }
  if (Array.isArray(next.pendingRegistrations)) {
    for (const registration of next.pendingRegistrations) {
      if (registration && !registration.workspaceId) registration.workspaceId = primary.id;
    }
  }
  if (Array.isArray(next.trustedDevices)) {
    for (const device of next.trustedDevices) {
      if (device && !device.workspaceId) device.workspaceId = primary.id;
    }
  }
  return { state: next, changed: JSON.stringify(next) !== before };
}

export function resolveWorkspace(state, workspaceId) {
  const id = String(workspaceId || '').trim();
  return (state?.workspaces || []).find(item => item?.id === id) || null;
}

export function publicWorkspace(workspace) {
  if (!workspace) return null;
  return {
    id: workspace.id,
    name: workspace.name,
    status: workspace.status === 'inactive' ? 'inactive' : 'active'
  };
}
