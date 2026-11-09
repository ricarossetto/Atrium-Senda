// Google Agenda simulado para os testes: mesma forma de resposta da API real, em memória.
import http from 'node:http';

export async function startFakeGoogleCalendar() {
  const events = new Map();
  const state = { sequence: 0, version: 0, revoked: [], failRefresh: false, rejectAccess: false, expireSyncToken: false, writes: [], accessTokens: 0 };
  const stamp = () => new Date(Date.now() + (state.sequence += 1)).toISOString();

  function put(id, fields) {
    state.version += 1;
    const event = { kind: 'calendar#event', id, status: 'confirmed', ...fields, updated: stamp(), _version: state.version };
    events.set(id, event);
    return event;
  }
  const publicEvent = ({ _version, ...event }) => event;
  const reply = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const readBody = req => new Promise(resolve => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => resolve(raw));
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fake');
    const raw = await readBody(req);
    if (url.pathname === '/auth') {
      const target = new URL(url.searchParams.get('redirect_uri'));
      if (url.searchParams.get('login_hint') === 'negar') target.searchParams.set('error', 'access_denied');
      else {
        target.searchParams.set('code', 'codigo-de-teste');
        target.searchParams.set('state', url.searchParams.get('state'));
      }
      res.writeHead(302, { Location: target.toString() });
      return res.end();
    }
    if (url.pathname === '/token') {
      const params = new URLSearchParams(raw);
      if (params.get('grant_type') === 'refresh_token' && state.failRefresh) return reply(res, 400, { error: 'invalid_grant' });
      state.accessTokens += 1;
      return reply(res, 200, {
        access_token: `acesso-${state.accessTokens}`,
        expires_in: params.get('grant_type') === 'authorization_code' ? 1 : 3600,
        ...(params.get('grant_type') === 'authorization_code' ? { refresh_token: 'chave-duradoura-secreta' } : {})
      });
    }
    if (url.pathname === '/revoke') {
      state.revoked.push(url.searchParams.get('token'));
      return reply(res, 200, {});
    }
    const base = '/calendar/v3/calendars/primary/events';
    if (!url.pathname.startsWith(base)) return reply(res, 404, { error: { errors: [{ reason: 'notFound' }] } });
    if (state.rejectAccess || !/^Bearer acesso-/.test(req.headers.authorization || '')) return reply(res, 401, { error: { errors: [{ reason: 'authError' }] } });
    const id = decodeURIComponent(url.pathname.slice(base.length + 1));
    if (req.method === 'GET') {
      const syncToken = url.searchParams.get('syncToken');
      if (syncToken && state.expireSyncToken) {
        state.expireSyncToken = false;
        return reply(res, 410, { error: { errors: [{ reason: 'fullSyncRequired' }] } });
      }
      const since = syncToken ? Number(syncToken) : 0;
      const items = [...events.values()].filter(event => (syncToken ? event._version > since : event.status !== 'cancelled'));
      return reply(res, 200, { summary: 'pessoa.teste@example.test', items: items.map(publicEvent), nextSyncToken: String(state.version) });
    }
    const body = raw ? JSON.parse(raw) : {};
    state.writes.push({ method: req.method, id: id || body.id });
    if (req.method === 'POST') {
      if (events.has(body.id)) return reply(res, 409, { error: { errors: [{ reason: 'duplicate' }] } });
      return reply(res, 200, publicEvent(put(body.id, body)));
    }
    const current = events.get(id);
    if (!current) return reply(res, 404, { error: { errors: [{ reason: 'notFound' }] } });
    if (req.method === 'PATCH') return reply(res, 200, publicEvent(put(id, { ...current, ...body })));
    if (req.method === 'DELETE') {
      put(id, { ...current, status: 'cancelled' });
      return reply(res, 204);
    }
    return reply(res, 405, {});
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    state,
    events,
    live: () => [...events.values()].filter(event => event.status !== 'cancelled'),
    bySummary: text => [...events.values()].find(event => event.status !== 'cancelled' && String(event.summary).includes(text)),
    // O que a pessoa faz direto na agenda dela.
    personalEdit: (id, changes) => put(id, { ...events.get(id), ...changes }),
    personalCreate: (id, fields) => put(id, fields),
    personalDelete: id => put(id, { ...events.get(id), status: 'cancelled' }),
    stop: () => new Promise(resolve => server.close(resolve))
  };
}
