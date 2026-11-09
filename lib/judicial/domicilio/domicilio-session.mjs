/**
 * ATRIUM — Sessão do Domicílio Eletrônico a partir do navegador autenticado.
 *
 * O portal do Domicílio Eletrônico (PDPJ/Jus.br) usa SSO Keycloak; a API oficial
 * exige `Authorization: Bearer <JWT>` e o header `tenantId` do escritório. Este
 * módulo lê esses valores da própria sessão do usuário já autenticada no
 * navegador automatizado — nunca de credencial hardcoded e nunca os registrando.
 *
 * Regras:
 * - somente leitura do armazenamento da página (localStorage/sessionStorage);
 * - `page.evaluate` recebe **um único argumento** (objeto) e a função avaliada é
 *   autossuficiente (sem closures), conforme o runtime Playwright do projeto;
 * - nada de token/tenantId é logado, persistido ou devolvido em mensagens de erro.
 */

export const DOMICILIO_SESSION_STORAGE_KEYS = Object.freeze([
  'domicilio.accessToken',
  'domicilio.access_token',
  'access_token',
  'accessToken',
  'token',
  'jwt',
  'keycloak.token'
]);

export const DOMICILIO_TENANT_STORAGE_KEYS = Object.freeze([
  'domicilio.tenantId',
  'domicilio.tenant_id',
  'tenantId',
  'tenant_id',
  'tenant'
]);

export const DOMICILIO_SESSION_ENDPOINTS = Object.freeze([
  '/api/v1/usuarios/me',
  '/api/v1/representantes/me',
  '/api/v1/tenant'
]);

/**
 * Lê a sessão do Domicílio da página autenticada.
 * @returns {Promise<{accessToken: string, tenantId: string, origem: string}|null>}
 */
export async function readDomicilioSession(page, { deps = {} } = {}) {
  if (!page || typeof page.evaluate !== 'function') return null;
  const read = deps.evaluate || (async (fn, arg) => page.evaluate(fn, arg));
  const stored = await read(function readDomicilioStorage(candidates) {
    const findIn = storage => {
      try {
        for (const key of candidates.tokenKeys) {
          const value = storage.getItem(key);
          if (value && value.trim()) return { value: value.trim(), key };
        }
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (!key || !/token|jwt|auth|oidc|credential|sess/i.test(key)) continue;
          const raw = storage.getItem(key);
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            const nested = parsed?.access_token || parsed?.accessToken || parsed?.token;
            if (nested && String(nested).trim()) return { value: String(nested).trim(), key };
          } catch {
            if (raw.trim().length > 40) return { value: raw.trim(), key };
          }
        }
      } catch {
        return null;
      }
      return null;
    };
    const token = findIn(window.localStorage) || findIn(window.sessionStorage);
    if (!token) return null;
    const tenant = (() => {
      for (const storage of [window.localStorage, window.sessionStorage]) {
        try {
          for (const key of candidates.tenantKeys) {
            const value = storage.getItem(key);
            if (value && value.trim()) return value.trim();
          }
        } catch {
          continue;
        }
      }
      return null;
    })();
    return { accessToken: token.value, tokenKey: token.key, tenantId: tenant };
  }, {
    tokenKeys: DOMICILIO_SESSION_STORAGE_KEYS,
    tenantKeys: DOMICILIO_TENANT_STORAGE_KEYS
  }).catch(() => null);

  if (!stored?.accessToken) return null;
  return {
    accessToken: stored.accessToken,
    tenantId: stored.tenantId || '',
    origem: stored.tokenKey || 'storage'
  };
}

/**
 * Complementa o tenantId consultando endpoints leves do próprio portal, quando o
 * armazenamento não o expõe. Falha fechada: sem tenant confirmado não há captura.
 */
export async function resolveDomicilioSession(page, { client = null, deps = {} } = {}) {
  const session = await readDomicilioSession(page, { deps });
  if (!session) return null;
  if (session.tenantId) return session;
  const getJson = deps.getJson || (typeof client?.getJson === 'function' ? client.getJson.bind(client) : null);
  if (typeof getJson !== 'function') return null;
  for (const pathname of DOMICILIO_SESSION_ENDPOINTS) {
    try {
      const payload = await getJson(session, pathname);
      const tenantId = String(payload?.tenantId || payload?.tenant?.id || payload?.id || '').trim();
      if (tenantId) return { ...session, tenantId, origem: `${session.origem}+${pathname}` };
    } catch {
      continue;
    }
  }
  return null;
}
