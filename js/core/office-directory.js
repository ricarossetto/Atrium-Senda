import { requestAuthUsers } from './auth-users-request.js?v=3.0.0';
let directory = { users: [], teams: [] };
let loadedAt = 0;
let pending = null;

export function getOfficeDirectory() {
  return directory;
}

export function officeDirectoryLoaded() {
  return loadedAt > 0;
}

export async function refreshOfficeDirectory(secureFetch, { force = false, maxAge = 60000 } = {}) {
  if (!force && loadedAt && Date.now() - loadedAt < maxAge) return directory;
  if (pending) return pending;
  const request = secureFetch || globalThis.KellerAuth?.secureFetch;
  if (typeof request !== 'function') return directory;
  pending = (async () => {
    const [usersResult, teamsResult] = await Promise.allSettled([
      requestAuthUsers(request),
      request('/api/office/teams', { headers: { Accept: 'application/json' } })
    ]);
    if (usersResult.status === 'fulfilled' && usersResult.value?.ok) {
      const payload = await usersResult.value.json().catch(() => ({}));
      if (Array.isArray(payload.users)) directory = { ...directory, users: payload.users.filter(user => user && user.status !== 'inactive') };
    }
    if (teamsResult.status === 'fulfilled' && teamsResult.value?.ok) {
      const payload = await teamsResult.value.json().catch(() => ({}));
      if (Array.isArray(payload.teams)) directory = { ...directory, teams: payload.teams };
    }
    loadedAt = Date.now();
    return directory;
  })().finally(() => { pending = null; });
  return pending;
}
