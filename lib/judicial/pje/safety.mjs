import { getAllowedPjeOrigins } from './portal-registry.mjs';

export class PjeReadOnlyViolationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PjeReadOnlyViolationError';
    this.errorCode = 'PJE-READ-ONLY-BLOCKED';
    Object.assign(this, details);
  }
}

export const PJE_MUTATION_TOKENS = Object.freeze([
  'ciencia',
  'ciencias',
  'dar ciencia',
  'tomar ciencia',
  'registrar ciencia',
  'manifestar',
  'manifestacao',
  'manifestacoes',
  'responder',
  'resposta',
  'recurso',
  'recorrer',
  'contestar',
  'contrarrazoes',
  'interpor',
  'impugnar',
  'peticionar',
  'peticao',
  'peticionamento',
  'protocolar',
  'protocolo',
  'assinar',
  'assinatura',
  'juntar',
  'juntada',
  'anexar',
  'excluir',
  'deletar',
  'remover',
  'apagar',
  'salvar',
  'gravar',
  'confirmar',
  'transmitir',
  'habilitar',
  'desabilitar',
  'cancelar',
  'alterar',
  'editar',
  'arquivar',
  'desistir',
  'cumprir',
  'upload',
  'solicitar'
]);

export const PJE_READ_ONLY_TOKENS = Object.freeze([
  'listar',
  'pesquisar',
  'consultar',
  'filtrar',
  'paginar',
  'visualizar',
  'detalhar',
  'selecionar',
  'abrir',
  'carregar',
  'expandir',
  'ordenar',
  'atualizar',
  'datatable',
  'sort',
  'page',
  'first',
  'rows',
  'scroll',
  'ajax',
  'partial',
  'refresh'
]);

const PJE_AUTH_PATH_RE = Object.freeze([
  /\/auth\/realms\//i,
  /login-actions\/authenticate/i,
  /protocol\/openid-connect/i,
  /j_security_check/i,
  /(?:^|\/)login(?:\.seam|\.do|\/|\?|$)/i,
  /certificado/i,
  /openid-connect/i,
  /broker\//i,
  /saml/i,
  /oauth/i,
  /\/sso\//i
]);

const JSF_READ_ONLY_MARKERS = Object.freeze([
  /javax\.faces\.partial\.ajax\s*=\s*true/i,
  /javax\.faces\.source\s*=/i,
  /javax\.faces\.behavior\.event\s*=/i,
  /AJAX_SOURCE\s*=/i,
  /jakarta\.faces\./i
]);

export function normalizePjeActionText(value) {
  return String(value || '')
    .replace(/([a-zà-ÿ0-9])([A-ZÀ-Ý])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findTokens(normalizedText, tokens) {
  const matches = [];
  for (const token of tokens) {
    const pattern = new RegExp(`(?:^| )${token.replace(/ /g, ' +')}(?: |$)`);
    if (pattern.test(normalizedText)) matches.push(token);
  }
  return matches;
}

export function findPjeMutationTokens(value) {
  return findTokens(normalizePjeActionText(value), PJE_MUTATION_TOKENS);
}

export function findPjeReadOnlyTokens(value) {
  return findTokens(normalizePjeActionText(value), PJE_READ_ONLY_TOKENS);
}

export function sanitizePjeUrlForTelemetry(value) {
  try {
    const parsed = new URL(String(value));
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return 'invalid-url';
  }
}

export function assertTrustedPjeTarget({ url, portal, baseUrl } = {}) {
  let parsed;
  try {
    parsed = new URL(String(url), baseUrl || undefined);
  } catch {
    throw new PjeReadOnlyViolationError('Destino PJe bloqueado por default-deny: URL inválida.');
  }
  const allowed = new Set(getAllowedPjeOrigins(portal));
  const isJusBr = /(^|\.)jus\.br$/i.test(parsed.hostname);
  if (parsed.protocol !== 'https:' || !isJusBr || !allowed.has(parsed.origin)) {
    throw new PjeReadOnlyViolationError(
      `Destino PJe bloqueado por default-deny: origem ${parsed.origin} não permitida.`,
      { origin: parsed.origin }
    );
  }
  return true;
}

function isPjeAuthPost(parsed, portal) {
  if (PJE_AUTH_PATH_RE.some(pattern => pattern.test(parsed.pathname))) return true;
  const loginRoutes = [portal?.confirmedRoutes?.login, ...(portal?.trustedAuthOrigins || [])];
  for (const route of loginRoutes) {
    if (!route) continue;
    try {
      const origin = new URL(route).origin;
      if (origin === parsed.origin && route !== origin) return true;
    } catch {
      // rota inválida é ignorada; a classificação segue por padrões de caminho
    }
  }
  return false;
}

const PJE_LOCAL_HELPER_ORIGINS = Object.freeze(new Set([
  'http://localhost:8800',
  'http://127.0.0.1:8800',
  'ws://localhost:8800',
  'ws://127.0.0.1:8800',
  'wss://localhost:8800',
  'wss://127.0.0.1:8800'
]));
const PJE_LOCAL_HELPER_PATH_RE = /^\/pjeOffice(\/|$)/i;

const PJE_PASSIVE_RESOURCE_TYPES = Object.freeze(new Set([
  'image',
  'stylesheet',
  'font',
  'media',
  'script',
  'manifest'
]));

// Pathnames de leitura confirmadas do proprio portal (confirmedRoutes, observadas em
// live e registradas no registry). O token no PATH nao indica ato -- mas query e corpo
// continuam classificados, sem excecao. Comparacao exata de pathname, so GET/HEAD.
// Cache por identidade do portal (entradas do registry sao estaveis).
const confirmedPjeReadPathsCache = new WeakMap();
export function confirmedPjeReadPaths(portal) {
  const key = portal && typeof portal === 'object' ? portal : null;
  if (key && confirmedPjeReadPathsCache.has(key)) return confirmedPjeReadPathsCache.get(key);
  const paths = new Set();
  const routes = portal?.confirmedRoutes;
  if (routes && typeof routes === 'object') {
    for (const value of Object.values(routes)) {
      try {
        const routeUrl = new URL(String(value), portal?.url || undefined);
        if (routeUrl.pathname && routeUrl.pathname !== '/') paths.add(routeUrl.pathname);
      } catch {
        // rota invalida: ignorada, a classificacao segue pelo caminho completo
      }
    }
  }
  if (key) confirmedPjeReadPathsCache.set(key, paths);
  return paths;
}

export function classifyPjeRequest({ method = 'GET', url = '', body = '', portal, resourceType = '' } = {}) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'POST'].includes(normalizedMethod)) {
    return Object.freeze({
      allowed: false,
      reason: 'blocked_method',
      matched: [normalizedMethod]
    });
  }

  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return Object.freeze({ allowed: false, reason: 'blocked_invalid_url', matched: [] });
  }

  if (PJE_LOCAL_HELPER_ORIGINS.has(parsed.origin) && PJE_LOCAL_HELPER_PATH_RE.test(parsed.pathname)) {
    return Object.freeze({ allowed: true, reason: 'local_helper', matched: [] });
  }

  const allowedOrigins = new Set(getAllowedPjeOrigins(portal));
  const trusted = parsed.protocol === 'https:'
    && /(^|\.)jus\.br$/i.test(parsed.hostname)
    && allowedOrigins.has(parsed.origin);
  if (!trusted) {
    if (
      (normalizedMethod === 'GET' || normalizedMethod === 'HEAD')
      && PJE_PASSIVE_RESOURCE_TYPES.has(String(resourceType || '').toLowerCase())
    ) {
      return Object.freeze({ allowed: true, reason: 'passive_subresource', matched: [] });
    }
    return Object.freeze({ allowed: false, reason: 'blocked_untrusted_origin', matched: [], origin: parsed.origin });
  }

  // Rota de leitura confirmada do proprio portal: o pathname e nosso (observado em
  // live), entao o token nele nao indica ato. Query e corpo continuam classificados
  // abaixo; POST nunca entra aqui e segue pelo caminho completo e conservador.
  const isConfirmedReadPath = (normalizedMethod === 'GET' || normalizedMethod === 'HEAD')
    && confirmedPjeReadPaths(portal).has(parsed.pathname);
  const rawHaystack = isConfirmedReadPath
    ? `${parsed.search} ${body}`
    : `${parsed.pathname}${parsed.search} ${body}`;
  // O corpo/query chega percent-encoded; decodificar evita que um token mutante
  // codificado (ex.: manifesta%C3%A7%C3%A3o) escape da classificação.
  let decodedHaystack = rawHaystack;
  try {
    decodedHaystack = decodeURIComponent(rawHaystack.replace(/\+/g, ' '));
  } catch {
    decodedHaystack = rawHaystack;
  }
  const haystack = decodedHaystack === rawHaystack ? rawHaystack : `${rawHaystack} ${decodedHaystack}`;
  const mutationMatches = findPjeMutationTokens(haystack);
  if (mutationMatches.length) {
    return Object.freeze({
      allowed: false,
      reason: 'blocked_mutation',
      matched: mutationMatches,
      origin: parsed.origin,
      path: parsed.pathname
    });
  }

  if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD') {
    return Object.freeze({ allowed: true, reason: 'read_only', matched: [] });
  }

  if (isPjeAuthPost(parsed, portal)) {
    return Object.freeze({ allowed: true, reason: 'authentication', matched: [] });
  }

  if (JSF_READ_ONLY_MARKERS.some(pattern => pattern.test(body))) {
    return Object.freeze({ allowed: true, reason: 'jsf_read_only', matched: [] });
  }

  if (findPjeReadOnlyTokens(haystack).length) {
    return Object.freeze({ allowed: true, reason: 'read_only_action', matched: [] });
  }

  return Object.freeze({
    allowed: false,
    reason: 'blocked_unknown_mutation_risk',
    matched: [],
    origin: parsed.origin,
    path: parsed.pathname
  });
}

export function assertSafePjeControl({ text, href, action, portal } = {}) {
  const value = `${text || ''} ${href || ''} ${action || ''}`;
  const matched = findPjeMutationTokens(value);
  if (matched.length) {
    throw new PjeReadOnlyViolationError(
      `Controle PJe bloqueado pelo modo somente leitura: ${matched.join(', ')}.`,
      { matched }
    );
  }
  if (href) assertTrustedPjeTarget({ url: href, portal });
  return true;
}

export async function installPjeReadOnlyGuard(page, portal, { onBlocked } = {}) {
  const blocked = [];
  const handler = async route => {
    const request = typeof route.request === 'function' ? route.request() : {
      method: () => route?.method?.() || 'GET',
      url: () => route?.url?.() || '',
      postData: () => route?.postData?.() || '',
      resourceType: () => route?.resourceType?.() || ''
    };
    let body = '';
    try {
      if (String(request.method()).toUpperCase() === 'POST') body = request.postData() || '';
    } catch {
      body = '';
    }
    const verdict = classifyPjeRequest({
      method: request.method(),
      url: request.url(),
      body,
      portal,
      resourceType: typeof request.resourceType === 'function' ? request.resourceType() : ''
    });
    if (verdict.allowed) {
      await route.continue();
      return;
    }
    const record = Object.freeze({
      url: sanitizePjeUrlForTelemetry(request.url()),
      reason: verdict.reason,
      matched: verdict.matched,
      at: new Date().toISOString()
    });
    blocked.push(record);
    if (typeof onBlocked === 'function') onBlocked(record);
    try {
      await route.abort('blockedbyclient');
    } catch {
      // rota já finalizada
    }
  };
  await page.route('**/*', handler);
  return {
    blocked,
    uninstall: async () => {
      if (typeof page.unroute === 'function') {
        await page.unroute('**/*', handler).catch(() => {});
      }
    }
  };
}
