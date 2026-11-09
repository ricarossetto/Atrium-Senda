/**
 * Rotas da ligação com o Google Agenda. Cada pessoa conecta e administra só a própria conta.
 * A volta do Google (`/callback`) é a única rota sem sessão; ela não liga nada sozinha.
 */
export const GOOGLE_CALENDAR_ROUTE_MISS = Symbol('google-calendar-route-miss');

const PREFIX = '/api/google-calendar';

export function isGoogleCalendarRoute(url) {
  return url.pathname === PREFIX || url.pathname.startsWith(`${PREFIX}/`);
}

function userIdOf(session) {
  return String(session.id || session.userId || session.username || '');
}

export async function handleGoogleCalendarRoute({ service, assertAuthenticated, json, readJson, appUrl, redirect }, req, res, url) {
  const returnTo = result => redirect(res, `${appUrl}/sistema/integracoes?${new URLSearchParams(result)}`);

  if (req.method === 'GET' && url.pathname === `${PREFIX}/callback`) {
    if (url.searchParams.get('error')) return returnTo({ googleAgenda: 'cancelado' });
    try {
      const conexao = await service.finishAuthorization({ state: url.searchParams.get('state'), code: url.searchParams.get('code') });
      return returnTo({ googleAgenda: 'confirmar', conexao });
    } catch {
      return returnTo({ googleAgenda: 'erro' });
    }
  }

  if (req.method === 'GET' && url.pathname === `${PREFIX}/status`) {
    const session = assertAuthenticated(req);
    return json(res, 200, await service.status(session.workspaceId, userIdOf(session)));
  }

  if (req.method === 'POST' && url.pathname === `${PREFIX}/connect`) {
    const session = assertAuthenticated(req, true);
    return json(res, 200, service.beginConnection({ workspaceId: session.workspaceId, userId: userIdOf(session), req }));
  }

  if (req.method === 'POST' && url.pathname === `${PREFIX}/confirm`) {
    const session = assertAuthenticated(req, true);
    const body = await readJson(req);
    return json(res, 200, await service.confirmConnection({ workspaceId: session.workspaceId, userId: userIdOf(session), connectionId: body?.connectionId }));
  }

  if (req.method === 'POST' && url.pathname === `${PREFIX}/settings`) {
    const session = assertAuthenticated(req, true);
    const body = await readJson(req);
    return json(res, 200, await service.updateSettings(session.workspaceId, userIdOf(session), { privacy: body?.privacy, taskScope: body?.taskScope }));
  }

  if (req.method === 'POST' && url.pathname === `${PREFIX}/sync`) {
    const session = assertAuthenticated(req, true);
    return json(res, 200, await service.syncNow(session.workspaceId, userIdOf(session)));
  }

  if (req.method === 'POST' && url.pathname === `${PREFIX}/disconnect`) {
    const session = assertAuthenticated(req, true);
    return json(res, 200, await service.disconnect(session.workspaceId, userIdOf(session)));
  }

  return GOOGLE_CALENDAR_ROUTE_MISS;
}
