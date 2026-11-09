/**
 * ATRIUM — Eproc public search direct HTTP transport
 *
 * Transporte HTTP único e endurecido para a consulta pública por chave de acesso
 * do eproc. Não depende de sessão autenticada, não usa browser e não contorna
 * desafios anti-bot: apenas realiza o POST declarado pelo registry do portal,
 * com HTTPS obrigatório, allowlist de hosts, redirects controlados hop-a-hop,
 * cookie jar em memória, timeout e limite de resposta.
 *
 * Invariantes (specs/eproc-public-key.md):
 * - a chave nunca aparece em mensagem de erro, log ou URL;
 * - hosts fora da allowlist (inclusive após redirect) são bloqueados;
 * - erros são sanitizados com os segredos informados na chamada.
 */

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_USER_AGENT = 'ATRIUM/2.5 (consulta-publica-eproc; +https://atrium.adv.br)';
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class EprocTransportError extends Error {
  constructor(code, message, { status = 0, url = '', cause } = {}) {
    super(String(message || 'Falha de transporte na consulta pública do eproc.'), cause ? { cause } : undefined);
    this.name = 'EprocTransportError';
    this.code = code;
    this.status = status;
    this.url = url;
  }
}

export function redactSecretsInText(value, secrets = []) {
  let text = String(value ?? '');
  for (const secret of Array.isArray(secrets) ? secrets : [secrets]) {
    const candidate = String(secret || '');
    if (candidate.length < 4) continue;
    text = text.split(candidate).join('[segredo oculto]');
  }
  return text;
}

export function normalizeTransportAllowlist(allowlist = []) {
  const entries = (Array.isArray(allowlist) ? allowlist : [allowlist]).filter(Boolean);
  const hosts = new Set();
  for (const entry of entries) {
    const raw = String(entry).trim().toLowerCase();
    if (!raw) continue;
    try {
      hosts.add(new URL(raw.includes('://') ? raw : `https://${raw}`).hostname);
    } catch {
      const fallback = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').split('/')[0].split(':')[0];
      if (fallback) hosts.add(fallback);
    }
  }
  return hosts;
}

function assertHttps(url) {
  if (url.protocol !== 'https:') {
    throw new EprocTransportError(
      'INSECURE_TRANSPORT',
      'A consulta pública por chave exige HTTPS; transporte inseguro bloqueado.',
      { url: url.origin }
    );
  }
}

function isHostAllowed(hostname, hosts) {
  if (hosts.size === 0) return true;
  const host = String(hostname || '').toLowerCase();
  for (const allowed of hosts) {
    if (host === allowed || host.endsWith(`.${allowed}`)) return true;
  }
  return false;
}

function assertAllowedHost(url, hosts) {
  if (isHostAllowed(url.hostname, hosts)) return;
  throw new EprocTransportError(
    'HOST_NOT_ALLOWED',
    `Host ${url.hostname} não pertence à allowlist do portal e foi bloqueado.`,
    { url: url.origin }
  );
}

function readSetCookie(headers) {
  if (!headers) return [];
  if (typeof headers.getSetCookie === 'function') {
    try {
      return headers.getSetCookie() || [];
    } catch {
      return [];
    }
  }
  const single = typeof headers.get === 'function' ? headers.get('set-cookie') : '';
  return single ? [single] : [];
}

function storeCookies(jar, hostname, headers) {
  const jarKey = String(hostname || '').toLowerCase();
  const cookies = jar.get(jarKey) || new Map();
  for (const rawCookie of readSetCookie(headers)) {
    const pair = String(rawCookie).split(';')[0] || '';
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!name) continue;
    if (/max-age=0|expires=thu,\s*01\s*jan\s*1970/i.test(String(rawCookie))) cookies.delete(name);
    else cookies.set(name, value);
  }
  if (cookies.size > 0) jar.set(jarKey, cookies);
}

function cookieHeaderFor(jar, hostname) {
  const cookies = jar.get(String(hostname || '').toLowerCase());
  if (!cookies || cookies.size === 0) return '';
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function readLimitedText(response, maxBytes) {
  const declared = Number(response?.headers?.get?.('content-length') || 0);
  if (declared > 0 && declared > maxBytes) {
    throw new EprocTransportError(
      'RESPONSE_TOO_LARGE',
      `Resposta excede o limite de ${maxBytes} bytes.`,
      {}
    );
  }
  if (response?.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
      total += chunk.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new EprocTransportError('RESPONSE_TOO_LARGE', `Resposta excede o limite de ${maxBytes} bytes.`, {});
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8');
  }
  const text = await response.text();
  if (Buffer.byteLength(String(text), 'utf8') > maxBytes) {
    throw new EprocTransportError('RESPONSE_TOO_LARGE', `Resposta excede o limite de ${maxBytes} bytes.`, {});
  }
  return String(text);
}

/**
 * Cria o transporte HTTP direto da consulta pública por chave.
 *
 * @param {Object} [options]
 * @param {Function} [options.fetchImpl] fetch compatível (padrão: global fetch)
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxBytes]
 * @param {string} [options.userAgent]
 * @param {Array<string>} [options.allowlist] hosts do portal (ex.: 'eproc1g.tjrs.jus.br')
 * @param {number} [options.maxRedirects]
 */
export function createDirectHttpTransport({
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  userAgent = DEFAULT_USER_AGENT,
  allowlist = [],
  maxRedirects = DEFAULT_MAX_REDIRECTS
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetchImpl indisponível para o transporte HTTP da consulta pública.');
  }
  const hosts = normalizeTransportAllowlist(allowlist);
  const cookieJar = new Map();

  return Object.freeze({
    allowlist: Object.freeze([...hosts]),
    async request({ url, method = 'GET', form = null, headers = {}, secrets = [] } = {}) {
      let currentUrl;
      try {
        currentUrl = new URL(String(url));
      } catch {
        throw new EprocTransportError('INVALID_URL', 'URL de consulta pública inválida.', {});
      }
      let hopMethod = String(method || 'GET').toUpperCase();
      let hopForm = form;
      let hops = 0;

      while (true) {
        assertHttps(currentUrl);
        assertAllowedHost(currentUrl, hosts);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const requestHeaders = {
            accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
            'user-agent': userAgent,
            ...headers
          };
          const cookie = cookieHeaderFor(cookieJar, currentUrl.hostname);
          if (cookie) requestHeaders.cookie = cookie;

          let body;
          if (hopForm && hopMethod !== 'GET' && hopMethod !== 'HEAD') {
            const params = new URLSearchParams();
            for (const [name, value] of Object.entries(hopForm)) {
              if (value === undefined || value === null) continue;
              params.append(name, String(value));
            }
            body = params.toString();
            requestHeaders['content-type'] = 'application/x-www-form-urlencoded';
          }

          let response;
          try {
            response = await fetchImpl(currentUrl.toString(), {
              method: hopMethod,
              headers: requestHeaders,
              body,
              redirect: 'manual',
              signal: controller.signal
            });
          } catch (fetchError) {
            if (controller.signal.aborted || fetchError?.name === 'AbortError' || fetchError?.name === 'TimeoutError') {
              throw new EprocTransportError(
                'TIMEOUT',
                `Tempo limite de ${timeoutMs}ms excedido na consulta pública.`,
                { url: currentUrl.origin, cause: fetchError }
              );
            }
            throw new EprocTransportError(
              'NETWORK_ERROR',
              redactSecretsInText(fetchError?.message || fetchError || 'Falha de rede na consulta pública.', secrets),
              { url: currentUrl.origin, cause: fetchError }
            );
          }

          storeCookies(cookieJar, currentUrl.hostname, response?.headers);
          const status = Number(response?.status || 0);
          const location = REDIRECT_STATUSES.has(status) ? response?.headers?.get?.('location') : '';

          if (location) {
            hops += 1;
            if (hops > maxRedirects) {
              throw new EprocTransportError(
                'TOO_MANY_REDIRECTS',
                `Redirecionamentos excessivos (limite ${maxRedirects}) na consulta pública.`,
                { status, url: currentUrl.origin }
              );
            }
            let nextUrl;
            try {
              nextUrl = new URL(location, currentUrl);
            } catch {
              throw new EprocTransportError('REDIRECT_INVALID', 'Redirecionamento inválido na consulta pública.', { status, url: currentUrl.origin });
            }
            if (nextUrl.protocol !== 'https:' || !isHostAllowed(nextUrl.hostname, hosts)) {
              throw new EprocTransportError(
                'REDIRECT_BLOCKED',
                'Redirecionamento para destino fora da allowlist HTTPS do portal foi bloqueado.',
                { status, url: currentUrl.origin }
              );
            }
            if (status === 303 || ((status === 301 || status === 302) && hopMethod === 'POST')) {
              hopMethod = 'GET';
              hopForm = null;
            }
            currentUrl = nextUrl;
            continue;
          }

          const responseBody = await readLimitedText(response, maxBytes);
          return {
            status,
            ok: status >= 200 && status < 300,
            headers: response?.headers || null,
            body: responseBody,
            finalUrl: currentUrl.toString(),
            hops
          };
        } catch (error) {
          if (error instanceof EprocTransportError) throw error;
          throw new EprocTransportError(
            'TRANSPORT_ERROR',
            redactSecretsInText(error?.message || error || 'Falha de transporte na consulta pública.', secrets),
            { url: currentUrl.origin, cause: error }
          );
        } finally {
          clearTimeout(timer);
        }
      }
    }
  });
}
