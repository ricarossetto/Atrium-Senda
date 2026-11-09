// Cliente mínimo da API do Google Agenda. Só fala com o Google: não conhece Store nem cofre.
// Tokens nunca entram em mensagem de erro nem em log.

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const DEFAULT_ENDPOINTS = Object.freeze({
  auth: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  revoke: 'https://oauth2.googleapis.com/revoke',
  api: 'https://www.googleapis.com/calendar/v3'
});

export class GoogleCalendarError extends Error {
  constructor(message, { status = 0, reason = '' } = {}) {
    super(message);
    this.name = 'GoogleCalendarError';
    this.status = status;
    this.reason = reason;
  }

  /** A autorização acabou: só uma nova conexão resolve. */
  get needsReconnect() {
    return this.reason === 'invalid_grant' || this.reason === 'unauthorized_client';
  }

  get isRateLimit() {
    return this.status === 429 || (this.status === 403 && /rateLimit|quota/i.test(this.reason));
  }
}

function endpointsFromTestBase(base) {
  const root = String(base).replace(/\/+$/, '');
  return { auth: `${root}/auth`, token: `${root}/token`, revoke: `${root}/revoke`, api: `${root}/calendar/v3` };
}

export function createGoogleCalendarApi({ clientId, clientSecret, testBase = '', fetchFn = globalThis.fetch, timeoutMs = 20_000 } = {}) {
  if (!clientId || !clientSecret) return null;
  const endpoints = testBase ? endpointsFromTestBase(testBase) : DEFAULT_ENDPOINTS;

  async function send(url, options, label) {
    let response;
    try {
      response = await fetchFn(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new GoogleCalendarError(`Sem resposta do Google ao ${label}.`);
    }
    if (response.status === 204) return null;
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = typeof body?.error === 'string'
        ? body.error
        : String(body?.error?.errors?.[0]?.reason || body?.error?.status || '');
      throw new GoogleCalendarError(`O Google recusou ao ${label} (código ${response.status}).`, { status: response.status, reason });
    }
    return body;
  }

  const tokenRequest = (params, label) => send(endpoints.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params })
  }, label);

  const calendarRequest = (accessToken, method, suffix, body, label) => send(`${endpoints.api}/calendars/primary/events${suffix}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  }, label);

  return Object.freeze({
    scope: SCOPE,

    authorizationUrl({ state, redirectUri }) {
      const url = new URL(endpoints.auth);
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline',
        // Sem isso, quem já autorizou antes não recebe a chave de acesso duradoura.
        prompt: 'consent',
        state
      }).toString();
      return url.toString();
    },

    exchangeCode: ({ code, redirectUri }) => tokenRequest({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' }, 'autorizar a conexão'),

    refreshAccessToken: refreshToken => tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' }, 'renovar a autorização'),

    async revoke(token) {
      await send(`${endpoints.revoke}?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }, 'encerrar a autorização').catch(() => {});
    },

    listEvents(accessToken, { syncToken = '', timeMin = '', timeMax = '', pageToken = '' } = {}) {
      const params = new URLSearchParams({ singleEvents: 'true', maxResults: '250' });
      if (syncToken) params.set('syncToken', syncToken);
      else {
        if (timeMin) params.set('timeMin', timeMin);
        if (timeMax) params.set('timeMax', timeMax);
      }
      if (pageToken) params.set('pageToken', pageToken);
      return calendarRequest(accessToken, 'GET', `?${params}`, null, 'ler a agenda');
    },

    insertEvent: (accessToken, body) => calendarRequest(accessToken, 'POST', '', body, 'criar o evento'),

    patchEvent: (accessToken, eventId, body) => calendarRequest(accessToken, 'PATCH', `/${encodeURIComponent(eventId)}`, body, 'atualizar o evento'),

    deleteEvent: (accessToken, eventId) => calendarRequest(accessToken, 'DELETE', `/${encodeURIComponent(eventId)}`, null, 'apagar o evento')
  });
}
