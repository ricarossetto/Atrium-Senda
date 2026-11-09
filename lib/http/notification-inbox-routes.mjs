export const NOTIFICATION_INBOX_ROUTE_MISS = Symbol('notification-inbox-route-miss');

export function isNotificationInboxRoute(url) {
  return url.pathname === '/api/notifications/inbox'
    || url.pathname === '/api/notifications/inbox/read';
}

export async function handleNotificationInboxRoute(ctx, req, res, url) {
  const { json, readJson, security, assertAuthenticated, getService } = ctx;
  if (req.method === 'GET' && url.pathname === '/api/notifications/inbox') {
    const session = assertAuthenticated(req);
    const workspaceId = session.workspaceId;
    const users = typeof security?.listUsers === 'function' ? security.listUsers(workspaceId) : [];
    const current = users.find(user => user.username === session.username);
    const service = getService(workspaceId);
    const notifications = typeof service?.listTaskCompletionInbox === 'function'
      ? service.listTaskCompletionInbox(workspaceId, { userId: current?.id || '', username: session.username, limit: 20 })
      : [];
    return json(res, 200, { notifications });
  }
  if (req.method === 'POST' && url.pathname === '/api/notifications/inbox/read') {
    const session = assertAuthenticated(req, true);
    const workspaceId = session.workspaceId;
    const users = typeof security?.listUsers === 'function' ? security.listUsers(workspaceId) : [];
    const current = users.find(user => user.username === session.username);
    const body = await readJson(req);
    const service = getService(workspaceId);
    const marked = typeof service?.markTaskCompletionInboxRead === 'function'
      ? service.markTaskCompletionInboxRead(workspaceId, current?.id || '', body?.eventIds)
      : 0;
    return json(res, 200, { ok: true, marked });
  }
  return NOTIFICATION_INBOX_ROUTE_MISS;
}
