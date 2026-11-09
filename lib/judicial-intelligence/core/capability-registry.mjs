import { JudicialIntelligenceError, JI_ERROR_CODES } from './errors.mjs';

export const CAPABILITIES = Object.freeze({
  PROCESS_SEARCH: 'PROCESS_SEARCH',
  PROCESS_DETAIL: 'PROCESS_DETAIL',
  PARTIES: 'PARTIES',
  MOVEMENTS: 'MOVEMENTS',
  DOCUMENT_LIST: 'DOCUMENT_LIST',
  DOCUMENT_DOWNLOAD: 'DOCUMENT_DOWNLOAD',
  COMMUNICATIONS: 'COMMUNICATIONS',
  HEARINGS: 'HEARINGS',
  PUBLICATIONS: 'PUBLICATIONS',
  CERTIFICATES: 'CERTIFICATES'
});

export const CAPABILITY_METHODS = Object.freeze({
  PROCESS_SEARCH: ['findProcesses'],
  PROCESS_DETAIL: ['getProcess'],
  PARTIES: ['getProcess'],
  MOVEMENTS: ['listMovements'],
  DOCUMENT_LIST: ['listDocuments'],
  DOCUMENT_DOWNLOAD: ['downloadDocument'],
  COMMUNICATIONS: ['listCommunications'],
  HEARINGS: ['listHearings'],
  PUBLICATIONS: ['listCommunications'],
  CERTIFICATES: ['requestCertificate', 'getCertificateStatus', 'downloadCertificate']
});

export const CAPABILITY_OPTIONAL_METHODS = Object.freeze({
  DOCUMENT_DOWNLOAD: ['downloadCase'],
  CERTIFICATES: ['getStatus', 'downloadCertificate']
});

export const PROVIDER_MATURITIES = Object.freeze(['experimental', 'verified_readonly', 'degraded', 'disabled']);

const PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]{2,31}$/;

export function assertProviderShape(provider) {
  if (!provider || typeof provider !== 'object') {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, 'Provider judicial inválido.');
  }
  if (!PROVIDER_ID_PATTERN.test(String(provider.id || ''))) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, `Id de provider inválido: ${provider.id}`);
  }
  if (typeof provider.capabilities !== 'function' || typeof provider.health !== 'function') {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, `Provider ${provider.id} sem capabilities()/health().`);
  }
  for (const capability of provider.capabilities()) {
    if (!Object.values(CAPABILITIES).includes(capability)) {
      throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, `Capability desconhecida: ${capability}`);
    }
    for (const method of CAPABILITY_METHODS[capability]) {
      const optional = (CAPABILITY_OPTIONAL_METHODS[capability] ?? []).includes(method);
      if (typeof provider[method] !== 'function' && !optional) {
        throw new JudicialIntelligenceError(JI_ERROR_CODES.CAPABILITY_UNSUPPORTED,
          `Provider ${provider.id} declara ${capability} sem implementar ${method}().`);
      }
    }
  }
  if (!PROVIDER_MATURITIES.includes(provider.maturity)) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, `Maturidade inválida: ${provider.maturity}`);
  }
  return provider;
}

export function createProvider({
  id,
  label = id,
  source = null,
  maturity = 'experimental',
  capabilities = [],
  notes = null,
  implementation = {},
  probe = null
} = {}) {
  const uniqueCapabilities = [...new Set(capabilities)];
  const provider = {
    id,
    label,
    source,
    maturity,
    notes,
    capabilities: () => [...uniqueCapabilities],
    has: capability => uniqueCapabilities.includes(capability),
    health: async ({ timeoutMs = 5000 } = {}) => probeProviderHealth(provider, { timeoutMs, probe }),
    ...implementation
  };
  return Object.freeze(assertProviderShape(provider));
}

export async function probeProviderHealth(provider, { timeoutMs = 5000, probe = provider?.probe ?? null } = {}) {
  const startedAt = Date.now();
  const base = { id: provider?.id ?? null, maturity: provider?.maturity ?? 'experimental', checkedAt: new Date().toISOString() };
  if (typeof probe !== 'function') {
    return { ...base, status: provider?.maturity === 'verified_readonly' ? 'ok' : 'experimental', latencyMs: 0, detail: null };
  }
  try {
    const result = await withTimeout(Promise.resolve(probe()), timeoutMs);
    const status = result?.status ?? (result?.ok === false ? 'degraded' : 'ok');
    const allowed = ['ok', 'degraded', 'unavailable', 'human_required', 'experimental'];
    return { ...base, status: allowed.includes(status) ? status : 'experimental', latencyMs: Date.now() - startedAt, detail: sanitizeDetail(result) };
  } catch (error) {
    return {
      ...base,
      status: error?.code === JI_ERROR_CODES.HUMAN_REQUIRED ? 'human_required' : 'unavailable',
      latencyMs: Date.now() - startedAt,
      detail: { code: error?.code ?? JI_ERROR_CODES.INTERNAL, message: 'Probe falhou; estado reportado sem segredo.' }
    };
  }
}

function sanitizeDetail(result) {
  if (!result || typeof result !== 'object') return null;
  const detail = {};
  for (const key of ['detail', 'note', 'version']) {
    if (typeof result[key] === 'string') detail[key] = result[key].slice(0, 160);
  }
  return Object.keys(detail).length > 0 ? detail : null;
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new JudicialIntelligenceError(JI_ERROR_CODES.TIMEOUT, 'Probe excedeu o tempo limite.')), timeoutMs);
    promise.then(value => {
      clearTimeout(timer);
      resolve(value);
    }, error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

export class CapabilityRegistry {
  #providers = new Map();

  register(provider) {
    assertProviderShape(provider);
    if (this.#providers.has(provider.id)) {
      throw new JudicialIntelligenceError(JI_ERROR_CODES.CONFLICT, `Provider já registrado: ${provider.id}`);
    }
    this.#providers.set(provider.id, provider);
    return provider;
  }

  has(id) {
    return this.#providers.has(id);
  }

  get(id) {
    const provider = this.#providers.get(id);
    if (!provider) {
      throw new JudicialIntelligenceError(JI_ERROR_CODES.NOT_FOUND, `Provider não registrado: ${id}`);
    }
    return provider;
  }

  ids() {
    return [...this.#providers.keys()];
  }

  list() {
    return [...this.#providers.values()].map(provider => ({
      id: provider.id,
      label: provider.label,
      source: provider.source,
      maturity: provider.maturity,
      capabilities: provider.capabilities()
    }));
  }

  forCapability(capability) {
    if (!Object.values(CAPABILITIES).includes(capability)) {
      throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, `Capability desconhecida: ${capability}`);
    }
    return [...this.#providers.values()].filter(provider => provider.has(capability));
  }

  require(id, capability) {
    const provider = this.get(id);
    if (!provider.has(capability)) {
      throw new JudicialIntelligenceError(JI_ERROR_CODES.CAPABILITY_UNSUPPORTED,
        `Provider ${id} não oferece ${capability}.`, { provider: id });
    }
    return provider;
  }

  async healthAll({ timeoutMs = 5000 } = {}) {
    const entries = await Promise.all([...this.#providers.values()].map(provider => provider.health({ timeoutMs })));
    return Object.fromEntries(entries.map(entry => [entry.id, entry]));
  }
}
