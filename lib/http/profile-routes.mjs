// ATRIUM — Rotas de perfil (extração strangler de server.mjs).
// Preserva gates de autenticação, CSRF, RBAC e cookies.

export const PROFILE_ROUTE_MISS = Symbol('profile-route-miss');

export function isProfileRoute(url) {
  return url.pathname === '/api/auth/profile'
    || url.pathname === '/api/auth/profile/reset'
    || url.pathname === '/api/auth/profile/delete';
}

export async function handleProfileRoute(ctx, req, res, url) {
  const { json, readJson, security, assertAuthenticated } = ctx;

  if (req.method === 'POST' && url.pathname === '/api/auth/profile') {
    const session = assertAuthenticated(req, true);
    const user = await security.updateCurrentUserProfile(session.username, await readJson(req));
    return json(res, 200, { ok: true, user });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/profile/reset') {
    const session = assertAuthenticated(req, true);
    const user = await security.resetCurrentUserProfile(session.username);
    return json(res, 200, { ok: true, user, message: 'Perfil redefinido para as configurações padrão com sucesso.' });
  }

  if ((req.method === 'POST' || req.method === 'DELETE') && (url.pathname === '/api/auth/profile/delete' || url.pathname === '/api/auth/profile')) {
    const session = assertAuthenticated(req, true);
    const result = await security.deleteCurrentUserAccount(session.username, session);
    return json(res, 200, result, { 'Set-Cookie': [security.clearCookie(), security.clearTrustedDeviceCookie()] });
  }

  return PROFILE_ROUTE_MISS;
}
