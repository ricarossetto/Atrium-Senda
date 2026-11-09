import { isIP } from 'node:net';
import { JudicialIntelligenceError, JI_ERROR_CODES, isRetryableError } from './errors.mjs';

export const HTTP_POLICY_DEFAULTS = Object.freeze({
  timeoutMs: 15000,
  maxAttempts: 3,
  backoffBaseMs: 1500,
  maxBackoffMs: 45000,
  hostSpacingMs: 1000,
  maxResponseBytes: 8 * 1024 * 1024,
  maxRedirects: 5,
  jitterMs: 250
});

// Bloqueio de destinos locais/privados. O hostname IPv6 chega entre colchetes,
// por isso a normalização antes de classificar com node:net; endereços
// IPv4-mapeados são avaliados pelas regras IPv4 embutidas.
const LOOPBACK_NAME_PATTERN = /^(localhost|localhost\.localdomain)$/i;
const IPV4_FORBIDDEN_PATTERN = /^(?:0\.|10\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|198\.1[89]\.|22[4-9]\.|2[3-5]\d\.)/;

function normalizeHost(host) {
  return String(host || '').trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
}

function mappedIpv4FromHex(highHex, lowHex) {
  const high = parseInt(highHex, 16);
  const low = parseInt(lowHex, 16);
  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
}

function isForbiddenIpv4(value) {
  return IPV4_FORBIDDEN_PATTERN.test(value);
}

function isForbiddenIpv6(value) {
  if (value === '::' || /^(?:0:){7}0$/.test(value)) return true;
  if (value === '::1' || /^(?:0:){7}1$/.test(value)) return true;
  const dottedMapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dottedMapped) return isForbiddenIpv4(dottedMapped[1]);
  const hexMapped = value.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) return isForbiddenIpv4(mappedIpv4FromHex(hexMapped[1], hexMapped[2]));
  if (/^fe[89ab][0-9a-f]?:/.test(value)) return true;
  if (/^f[cd][0-9a-f]{2}:/.test(value)) return true;
  return false;
}

export function isForbiddenHost(host) {
  const normalized = normalizeHost(host);
  if (!normalized) return true;
  if (LOOPBACK_NAME_PATTERN.test(normalized)) return true;
  const version = isIP(normalized);
  if (version === 4) return isForbiddenIpv4(normalized);
  if (version === 6) return isForbiddenIpv6(normalized);
  return false;
}

const CHALLENGE_PATTERNS = [
  { kind: 'cloudflare', pattern: /(__cf_chl|cf-chl-|cf_chl_opt|just a moment|attention required|cloudflare)/i },
  { kind: 'captcha', pattern: /(g-recaptcha|recaptcha|hcaptcha|grecaptcha)/i }
];

export function assertSafeUrl(target, { allowLoopback = false, allowedHosts = null, requireHttps = false } = {}) {
  let url;
  try {
    url = new URL(String(target));
  } catch {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, 'URL inválida para transporte judicial.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.FORBIDDEN, 'Somente http/https são permitidos no transporte judicial.');
  }
  if (requireHttps && url.protocol !== 'https:') {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.FORBIDDEN, 'HTTPS obrigatório para transporte com credencial.');
  }
  if (url.username || url.password) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.FORBIDDEN, 'Credenciais embutidas na URL são proibidas.');
  }
  const host = url.hostname.toLowerCase();
  if (!allowLoopback && isForbiddenHost(host)) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.FORBIDDEN, 'Destino loopback/privado bloqueado por padrão.');
  }
  if (Array.isArray(allowedHosts) && allowedHosts.length > 0 && !allowedHosts.includes(host)) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.FORBIDDEN, `Host ${host} fora da allowlist do provider.`);
  }
  return url;
}

export function detectHumanChallenge({ status = 0, bodyText = '' } = {}) {
  if (status !== 403 && status !== 429 && status !== 503) return { required: false, kind: null };
  for (const entry of CHALLENGE_PATTERNS) {
    if (entry.pattern.test(String(bodyText))) return { required: true, kind: entry.kind };
  }
  return { required: false, kind: null };
}

export function readJson(result) {
  try {
    return JSON.parse(result.body.toString('utf8'));
  } catch (error) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.PARSE_ERROR, 'Resposta não é JSON válido.', {
      status: result?.status ?? null,
      cause: error
    });
  }
}

async function readLimited(response, maxBytes) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new JudicialIntelligenceError(JI_ERROR_CODES.TOO_LARGE, 'Resposta excedeu o limite permitido.');
    }
    return buffer;
  }
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new JudicialIntelligenceError(JI_ERROR_CODES.TOO_LARGE, 'Resposta excedeu o limite permitido.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // reader already released
    }
  }
  return Buffer.concat(chunks);
}

function retryAfterMs(headerValue) {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(headerValue);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

function normalizeTransportError(error) {
  if (error instanceof JudicialIntelligenceError) return error;
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return new JudicialIntelligenceError(JI_ERROR_CODES.TIMEOUT, 'Tempo esgotado na consulta judicial.', { cause: error });
  }
  if (isRetryableError(error)) {
    return new JudicialIntelligenceError(JI_ERROR_CODES.UNAVAILABLE, 'Fonte judicial indisponível no momento.', { cause: error });
  }
  return new JudicialIntelligenceError(JI_ERROR_CODES.INTERNAL, 'Falha de transporte isolada no provider.', { cause: error });
}

export class HttpTransport {
  #fetch;
  #policy;
  #now;
  #sleep;
  #random;
  #allowLoopback;
  #requireHttps;
  #hostTails = new Map();
  #hostLastStart = new Map();

  constructor({
    fetchImpl = globalThis.fetch,
    policy = {},
    now = () => Date.now(),
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    random = Math.random,
    allowLoopback = false,
    requireHttps = false
  } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl obrigatório para o transporte judicial.');
    this.#fetch = fetchImpl;
    this.#policy = { ...HTTP_POLICY_DEFAULTS, ...policy };
    this.#now = now;
    this.#sleep = sleep;
    this.#random = random;
    this.#allowLoopback = allowLoopback;
    this.#requireHttps = requireHttps;
  }

  policy() {
    return { ...this.#policy };
  }

  async request(target, {
    method = 'GET',
    headers = {},
    body = null,
    timeoutMs = this.#policy.timeoutMs,
    maxAttempts = this.#policy.maxAttempts,
    allowedHosts = null,
    allowLoopback = this.#allowLoopback,
    requireHttps = this.#requireHttps
  } = {}) {
    const url = assertSafeUrl(target, { allowLoopback, allowedHosts, requireHttps });
    const host = url.hostname.toLowerCase();
    const previous = this.#hostTails.get(host) ?? Promise.resolve();
    const chained = previous.then(() => this.#attempt(url, { method, headers, body, timeoutMs, maxAttempts, allowLoopback, allowedHosts, requireHttps }));
    this.#hostTails.set(host, chained.then(() => {}, () => {}));
    return chained;
  }

  // Follow manual: cada hop é validado (SSRF/HTTPS/allowlist) antes de ser seguido,
  // o corpo nunca é baixado de um destino não validado e o cross-origin permanece
  // bloqueado como no contrato original.
  async #fetchWithRedirects(url, { method, headers, body, timeoutMs, allowLoopback, allowedHosts, requireHttps }) {
    let currentUrl = url;
    let currentMethod = String(method || 'GET').toUpperCase();
    let currentBody = body ?? null;
    for (let hop = 0; hop <= this.#policy.maxRedirects; hop += 1) {
      const response = await this.#fetch(currentUrl.toString(), {
        method: currentMethod,
        headers,
        body: currentBody ?? undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs)
      });
      const redirectStatus = [301, 302, 303, 307, 308].includes(response.status);
      const location = redirectStatus ? response.headers.get('location') : null;
      if (!redirectStatus || !location) return { response, finalUrl: currentUrl.toString() };
      try {
        await response.body?.cancel?.();
      } catch {
        // corpo do redirect já liberado
      }
      let nextUrl;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        throw new JudicialIntelligenceError(JI_ERROR_CODES.FORBIDDEN, 'Redirecionamento com Location inválido bloqueado.');
      }
      assertSafeUrl(nextUrl, { allowLoopback, allowedHosts, requireHttps });
      if (nextUrl.origin !== url.origin) {
        throw new JudicialIntelligenceError(JI_ERROR_CODES.FORBIDDEN, 'Redirecionamento cross-origin bloqueado.');
      }
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && currentMethod !== 'GET' && currentMethod !== 'HEAD')) {
        currentMethod = 'GET';
        currentBody = null;
      }
      currentUrl = nextUrl;
    }
    throw new JudicialIntelligenceError(JI_ERROR_CODES.FORBIDDEN, 'Redirecionamento excessivo bloqueado.');
  }

  async #attempt(url, { method, headers, body, timeoutMs, maxAttempts, allowLoopback, allowedHosts, requireHttps }) {
    const host = url.hostname.toLowerCase();
    const spacing = this.#policy.hostSpacingMs - (this.#now() - (this.#hostLastStart.get(host) ?? 0));
    if (spacing > 0) await this.#sleep(spacing);
    this.#hostLastStart.set(host, this.#now());

    const attempts = Math.max(1, Number(maxAttempts) || 1);
    const startedAt = this.#now();
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const { response, finalUrl } = await this.#fetchWithRedirects(url, {
          method,
          headers,
          body,
          timeoutMs,
          allowLoopback,
          allowedHosts,
          requireHttps
        });
        const bytes = await readLimited(response, this.#policy.maxResponseBytes);
        const result = {
          status: response.status,
          ok: response.status >= 200 && response.status < 300,
          headers: Object.fromEntries(response.headers.entries()),
          body: bytes,
          finalUrl,
          attempts: attempt,
          durationMs: Math.max(0, this.#now() - startedAt)
        };
        const retryableStatus = response.status === 429 || response.status >= 500;
        if (retryableStatus) {
          lastError = new JudicialIntelligenceError(
            response.status === 429 ? JI_ERROR_CODES.RATE_LIMITED : JI_ERROR_CODES.UNAVAILABLE,
            `Fonte respondeu ${response.status}.`,
            { status: response.status }
          );
          if (attempt < attempts) {
            await this.#sleep(this.#delay(attempt, retryAfterMs(response.headers.get('retry-after'))));
            continue;
          }
          throw lastError;
        }
        return result;
      } catch (error) {
        if (error instanceof JudicialIntelligenceError &&
          (error.code === JI_ERROR_CODES.TOO_LARGE || error.code === JI_ERROR_CODES.FORBIDDEN)) {
          throw error;
        }
        lastError = normalizeTransportError(error);
        if (attempt < attempts && isRetryableError(lastError)) {
          await this.#sleep(this.#delay(attempt, null));
          continue;
        }
        throw lastError;
      }
    }
    throw lastError ?? new JudicialIntelligenceError(JI_ERROR_CODES.UNAVAILABLE, 'Transporte judicial indisponível.');
  }

  #delay(attempt, retryAfter) {
    const backoff = Math.min(this.#policy.backoffBaseMs * 2 ** (attempt - 1), this.#policy.maxBackoffMs);
    const base = retryAfter === null ? backoff : Math.min(retryAfter, this.#policy.maxBackoffMs);
    return base + Math.floor(this.#random() * this.#policy.jitterMs);
  }
}
