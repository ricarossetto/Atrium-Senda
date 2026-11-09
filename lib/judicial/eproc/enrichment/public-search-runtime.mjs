/**
 * ATRIUM Sovereign Judicial Connectivity — Eproc public-search runtime wiring
 *
 * Instantiates the public process-key search client (`lib/judicial/eproc/public-search`)
 * only when `EPROC_PUBLIC_KEY_ENABLED` is explicitly on. Default is OFF: nothing is
 * imported, no HTTP transport is created and the authenticated A1 session path remains
 * exactly as it was.
 *
 * Honesty rules:
 * - A flag turned on never fakes readiness. If the client module is missing, the factory
 *   throws or returns an invalid contract, the runtime reports `unavailable`/`failed`
 *   and the pipeline keeps using only the authenticated session.
 * - No access key is read, logged or persisted here. The client receives the vault key
 *   per call from the strategy, never from this module.
 * - Failures are logged without secrets and only when the flag is on; flag off is silent.
 */

export const EPROC_PUBLIC_KEY_ENABLED_ENV = 'EPROC_PUBLIC_KEY_ENABLED';
export const EPROC_PUBLIC_KEY_INTERACTIVE_ENV = 'EPROC_PUBLIC_KEY_INTERACTIVE';
export const EPROC_PUBLIC_SEARCH_MODULE = '../public-search/index.mjs';
export const EPROC_ASSISTED_TRANSPORT_MODULE = '../public-search/assisted-browser-transport.mjs';

export function isEprocPublicKeyEnabled(env = process.env) {
  const raw = String(env?.[EPROC_PUBLIC_KEY_ENABLED_ENV] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

/**
 * Liga o degrau assistido (navegador real + humano conclui o CAPTCHA). Exige a flag
 * principal ligada; o padrão é OFF para não abrir navegador em automação de nuvem.
 */
export function isEprocPublicKeyInteractive(env = process.env) {
  const raw = String(env?.[EPROC_PUBLIC_KEY_INTERACTIVE_ENV] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

function runtimeSnapshot({ enabled, state, client = null, reason = null, error = null }) {
  return Object.freeze({ enabled, state, client, reason, error });
}

function safeErrorMessage(error) {
  return String(error?.message || error || 'Falha desconhecida ao inicializar o cliente público eproc.').slice(0, 300);
}

/**
 * Native HTTP transport used by the public-search client. Deliberately minimal:
 * `fetch` exposes the native Response and `request` returns a small envelope for
 * clients that prefer plain values. Timeout is enforced with AbortSignal.
 */
export function createEprocPublicSearchHttpTransport({ fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch indisponível: não é possível criar o transporte público eproc.');
  }
  const normalizedTimeout = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0 ? Number(timeoutMs) : 20000;
  const request = async (url, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), normalizedTimeout);
    try {
      const response = await fetchImpl(url, { ...options, signal: options.signal || controller.signal });
      const body = await response.text();
      return { status: response.status, ok: response.ok, headers: response.headers, body };
    } finally {
      clearTimeout(timer);
    }
  };
  return Object.freeze({
    kind: 'fetch',
    fetch: (url, options = {}) => fetchImpl(url, options),
    request
  });
}

/**
 * Resolves the public-search client according to the environment flag.
 *
 * @param {Object} [params]
 * @param {NodeJS.ProcessEnv} [params.env]
 * @param {Console} [params.logger]
 * @param {Object|Function} [params.transport] Transport passed to the client; when
 *   omitted and the flag is on, a fetch-based transport is created.
 * @param {Object} [params.registry] Registry handed to the client factory.
 * @param {Function} [params.clientFactory] Test seam replacing the dynamic import.
 * @returns {Promise<Readonly<{enabled:boolean,state:string,client:Object|null,reason:string|null,error:string|null}>>}
 */
export async function createEprocPublicSearchRuntime({
  env = process.env,
  logger = console,
  transport,
  registry = null,
  clientFactory = null
} = {}) {
  if (!isEprocPublicKeyEnabled(env)) {
    return runtimeSnapshot({ enabled: false, state: 'disabled' });
  }

  let factory = clientFactory;
  if (factory === null) {
    try {
      const module = await import(EPROC_PUBLIC_SEARCH_MODULE);
      factory = module?.createEprocPublicSearchClient || null;
    } catch (error) {
      logger?.warn?.('[eproc public-search] flag ligada, mas o módulo do cliente ainda não está disponível; consulta pública não será usada.');
      return runtimeSnapshot({ enabled: true, state: 'unavailable', reason: 'CLIENT_MODULE_UNAVAILABLE', error: safeErrorMessage(error) });
    }
  }

  if (typeof factory !== 'function') {
    return runtimeSnapshot({ enabled: true, state: 'unavailable', reason: 'CLIENT_FACTORY_MISSING' });
  }

  let effectiveTransport = transport;
  if (effectiveTransport === undefined) {
    if (isEprocPublicKeyInteractive(env)) {
      try {
        const module = await import(EPROC_ASSISTED_TRANSPORT_MODULE);
        effectiveTransport = module.createAssistedBrowserTransport({
          onHumanRequired: () => logger?.warn?.('[eproc public-search] CAPTCHA exigido: conclua a verificação na janela do navegador para prosseguir com a consulta assistida.'),
          logger
        });
      } catch (error) {
        logger?.warn?.('[eproc public-search] transporte assistido indisponível; consulta pública assistida não será usada.');
        return runtimeSnapshot({ enabled: true, state: 'failed', reason: 'ASSISTED_TRANSPORT_UNAVAILABLE', error: safeErrorMessage(error) });
      }
    } else {
      try {
        effectiveTransport = createEprocPublicSearchHttpTransport();
      } catch (error) {
        logger?.warn?.('[eproc public-search] transporte HTTP indisponível; mantendo apenas a sessão autenticada.');
        return runtimeSnapshot({ enabled: true, state: 'failed', reason: 'TRANSPORT_UNAVAILABLE', error: safeErrorMessage(error) });
      }
    }
  }

  try {
    const client = await factory({ transport: effectiveTransport, registry, logger });
    if (!client || typeof client.searchByProcessKey !== 'function') {
      logger?.warn?.('[eproc public-search] cliente retornado sem contrato searchByProcessKey; consulta pública não será usada.');
      return runtimeSnapshot({ enabled: true, state: 'invalid', reason: 'CLIENT_CONTRACT_INVALID' });
    }
    return runtimeSnapshot({ enabled: true, state: 'ready', client });
  } catch (error) {
    logger?.warn?.('[eproc public-search] falha ao inicializar o cliente de consulta pública; mantendo apenas a sessão autenticada.');
    return runtimeSnapshot({ enabled: true, state: 'failed', reason: 'CLIENT_INIT_FAILED', error: safeErrorMessage(error) });
  }
}
