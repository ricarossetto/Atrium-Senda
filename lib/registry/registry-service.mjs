import { classifyBrazilianDocument, formatCnpj, normalizeCnpj } from './identifiers.mjs';

const ALLOWED_ORIGINS = new Set(['https://brasilapi.com.br', 'https://viacep.com.br']);
const DEFAULT_TIMEOUT_MS = 6_000;
const CIRCUIT_FAILURE_LIMIT = 3;
const CIRCUIT_OPEN_MS = 60_000;
const CACHE_TTL = Object.freeze({ cnpj: 12 * 60 * 60_000, cep: 7 * 24 * 60 * 60_000, banks: 24 * 60 * 60_000 });

export class RegistryService {
  constructor({ fetchFn = globalThis.fetch, now = () => Date.now(), timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (typeof fetchFn !== 'function') throw new TypeError('Um cliente HTTP é obrigatório para a inteligência cadastral.');
    this.fetchFn = fetchFn;
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.cache = new Map();
    this.circuits = new Map();
    this.providerMetrics = new Map();
  }

  status() {
    return {
      providers: [
        this.providerStatus('brasilapi', 'BrasilAPI', ['CNPJ', 'CEP', 'Bancos'], { priority: 1, cacheTtlMs: CACHE_TTL.cnpj }),
        this.providerStatus('viacep', 'ViaCEP', ['CEP fallback'], { priority: 2, cacheTtlMs: CACHE_TTL.cep }),
        { id: 'cpf-local', name: 'Validação de CPF', capabilities: ['CPF · formato e dígitos verificadores'], enabled: true, configured: true, priority: 'local', cacheTtlMs: null, state: 'available', lastSuccessAt: null, lastLatencyMs: 0 }
      ],
      policy: {
        cpf: 'validation_only',
        applyMode: 'review_required',
        arbitraryOutboundUrls: false
      }
    };
  }

  async testProvider(providerId) {
    const startedAt = this.now();
    if (providerId === 'brasilapi') await this.fetchJson('https://brasilapi.com.br/api/cep/v1/01001000', providerId, { retries: 0 });
    else if (providerId === 'viacep') await this.fetchJson('https://viacep.com.br/ws/01001000/json/', providerId, { retries: 0 });
    else if (providerId === 'cpf-local') return { providerId, state: 'available', testedAt: new Date(this.now()).toISOString(), latencyMs: 0, mode: 'local' };
    else throw registryError(400, 'Provedor cadastral não pode ser testado.');
    const metrics = this.providerMetrics.get(providerId) || {};
    return { providerId, state: 'available', testedAt: new Date(this.now()).toISOString(), latencyMs: metrics.lastLatencyMs ?? Math.max(0, this.now() - startedAt) };
  }

  validateDocument(value) {
    const document = classifyBrazilianDocument(value);
    return {
      ...document,
      externalLookup: document.type === 'cpf' ? 'local_validation' : document.type === 'cnpj' ? 'available' : 'unsupported',
      message: document.type === 'cpf'
        ? document.valid ? 'CPF válido: formato e dígitos verificadores conferidos localmente.' : 'CPF inválido: revise os 11 dígitos informados.'
        : document.valid ? 'Documento válido para consulta cadastral.' : 'Documento inválido.'
    };
  }

  async lookupCnpj(value) {
    const document = classifyBrazilianDocument(value);
    if (document.type !== 'cnpj' || !document.valid) throw registryError(400, 'CNPJ inválido. Revise os 14 caracteres e os dígitos verificadores.');
    const key = `cnpj:${document.normalized}`;
    return this.cached(key, CACHE_TTL.cnpj, async () => {
      const payload = await this.fetchJson(`https://brasilapi.com.br/api/cnpj/v1/${encodeURIComponent(document.normalized)}`, 'brasilapi');
      return normalizeCnpjPayload(payload, document.normalized, this.now());
    });
  }

  async lookupCep(value) {
    const cep = String(value ?? '').replace(/\D/g, '');
    if (!/^\d{8}$/.test(cep)) throw registryError(400, 'CEP inválido. Informe oito dígitos.');
    return this.cached(`cep:${cep}`, CACHE_TTL.cep, async () => {
      try {
        const payload = await this.fetchJson(`https://brasilapi.com.br/api/cep/v2/${cep}`, 'brasilapi', { retries: 0 });
        return normalizeCepPayload(payload, 'BrasilAPI', this.now());
      } catch {
        const fallback = await this.fetchJson(`https://viacep.com.br/ws/${cep}/json/`, 'viacep');
        if (fallback?.erro) throw registryError(404, 'CEP não localizado nas fontes públicas configuradas.');
        return normalizeCepPayload(fallback, 'ViaCEP', this.now());
      }
    });
  }

  async searchBanks(query = '') {
    const directory = await this.cached('banks:directory', CACHE_TTL.banks, async () => {
      const payload = await this.fetchJson('https://brasilapi.com.br/api/banks/v1', 'brasilapi');
      if (!Array.isArray(payload)) throw registryError(502, 'Diretório bancário respondeu em formato inesperado.');
      return {
        records: payload.map(normalizeBank).filter(record => record.name && (record.code !== null || record.ispb)),
        registry: liveMetadata('BrasilAPI · diretório público de bancos', this.now())
      };
    });
    const needle = normalizeSearch(query);
    const records = needle
      ? directory.records.filter(record => normalizeSearch(`${record.code ?? ''} ${record.ispb} ${record.name} ${record.fullName}`).includes(needle))
      : directory.records;
    return { ...directory, records: records.slice(0, 30) };
  }

  async cached(key, ttlMs, loader) {
    const current = this.cache.get(key);
    if (current && current.expiresAt > this.now()) {
      return cloneWithFreshness(current.value, 'cached', current.storedAt);
    }
    const value = await loader();
    const storedAt = this.now();
    this.cache.set(key, { value, storedAt, expiresAt: storedAt + ttlMs });
    return cloneWithFreshness(value, 'live', storedAt);
  }

  async fetchJson(rawUrl, providerId, { retries = 1 } = {}) {
    const url = new URL(rawUrl);
    if (!ALLOWED_ORIGINS.has(url.origin)) throw registryError(400, 'Fonte cadastral não autorizada.');
    this.assertCircuit(providerId);
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const startedAt = this.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await this.fetchFn(url, {
          method: 'GET',
          headers: { Accept: 'application/json', 'User-Agent': 'ATRIUM-Registry/1.0' },
          redirect: 'error',
          signal: controller.signal
        });
        if (response.status === 404) throw registryError(404, 'Cadastro não localizado na fonte pública.');
        if (response.status === 400 || response.status === 422) throw registryError(400, 'A fonte pública recusou o identificador informado.');
        if (!response.ok) throw registryError(response.status >= 500 || response.status === 429 ? 503 : 502, 'Fonte cadastral temporariamente indisponível.');
        const payload = await response.json();
        this.recordSuccess(providerId, Math.max(0, this.now() - startedAt));
        return payload;
      } catch (error) {
        lastError = sanitizeProviderError(error);
        if (lastError.statusCode < 500 || attempt >= retries) break;
      } finally {
        clearTimeout(timer);
      }
    }
    this.recordFailure(providerId);
    throw lastError || registryError(503, 'Fonte cadastral temporariamente indisponível.');
  }

  assertCircuit(providerId) {
    const circuit = this.circuits.get(providerId);
    if (!circuit?.openedAt) return;
    if (this.now() - circuit.openedAt >= CIRCUIT_OPEN_MS) {
      this.circuits.delete(providerId);
      return;
    }
    throw registryError(503, 'Fonte cadastral temporariamente pausada após falhas sucessivas. Tente novamente em instantes.');
  }

  recordFailure(providerId) {
    const previous = this.circuits.get(providerId) || { failures: 0, openedAt: null };
    const failures = previous.failures + 1;
    this.circuits.set(providerId, { failures, openedAt: failures >= CIRCUIT_FAILURE_LIMIT ? this.now() : null });
  }

  recordSuccess(providerId, latencyMs = null) {
    this.circuits.delete(providerId);
    this.providerMetrics.set(providerId, { lastSuccessAt: new Date(this.now()).toISOString(), lastLatencyMs: latencyMs });
  }

  providerStatus(id, name, capabilities, { priority, cacheTtlMs } = {}) {
    const circuit = this.circuits.get(id);
    const metrics = this.providerMetrics.get(id) || {};
    return { id, name, capabilities, enabled: true, configured: true, priority, cacheTtlMs, state: circuit?.openedAt ? 'temporarily_paused' : 'available', lastSuccessAt: metrics.lastSuccessAt || null, lastLatencyMs: metrics.lastLatencyMs ?? null };
  }
}

function normalizeCnpjPayload(payload, requestedDocument, now) {
  const qsa = Array.isArray(payload?.qsa) ? payload.qsa.map(item => ({
    name: clean(item.nome_socio || item.nome),
    role: clean(item.qualificacao_socio || item.qualificacao),
    country: clean(item.pais)
  })).filter(item => item.name) : [];
  return {
    document: formatCnpj(payload?.cnpj || requestedDocument),
    normalizedDocument: normalizeCnpj(payload?.cnpj || requestedDocument),
    legalName: clean(payload?.razao_social),
    tradeName: clean(payload?.nome_fantasia),
    status: clean(payload?.descricao_situacao_cadastral),
    statusDate: clean(payload?.data_situacao_cadastral),
    openedAt: clean(payload?.data_inicio_atividade),
    legalNature: clean(payload?.natureza_juridica),
    size: clean(payload?.porte),
    email: clean(payload?.email).toLowerCase(),
    phone: clean(payload?.ddd_telefone_1 || payload?.ddd_telefone_2),
    address: joinAddress(payload),
    district: clean(payload?.bairro),
    city: clean(payload?.municipio),
    state: clean(payload?.uf).toUpperCase(),
    zip: formatCep(payload?.cep),
    capital: finiteNumber(payload?.capital_social),
    primaryActivity: clean(payload?.cnae_fiscal_descricao),
    primaryActivityCode: clean(payload?.cnae_fiscal),
    secondaryActivities: Array.isArray(payload?.cnaes_secundarios) ? payload.cnaes_secundarios.map(item => ({ code: clean(item?.codigo), description: clean(item?.descricao) })).filter(item => item.code || item.description) : [],
    municipalityIbgeCode: clean(payload?.codigo_municipio_ibge),
    simpleNational: booleanFlag(payload?.opcao_pelo_simples),
    simpleNationalSince: clean(payload?.data_opcao_pelo_simples),
    mei: booleanFlag(payload?.opcao_pelo_mei),
    qsa,
    registry: liveMetadata('BrasilAPI · dados públicos de CNPJ', now)
  };
}

function normalizeCepPayload(payload, source, now) {
  return {
    zip: formatCep(payload?.cep),
    address: clean(payload?.street || payload?.logradouro),
    district: clean(payload?.neighborhood || payload?.bairro),
    city: clean(payload?.city || payload?.localidade),
    state: clean(payload?.state || payload?.uf).toUpperCase(),
    ibgeCode: clean(payload?.city_ibge || payload?.ibge),
    registry: liveMetadata(`${source} · endereço público por CEP`, now)
  };
}

function normalizeBank(item) {
  const numericCode = Number(item?.code);
  return {
    code: Number.isFinite(numericCode) ? String(numericCode).padStart(3, '0') : null,
    ispb: clean(item?.ispb),
    name: clean(item?.name),
    fullName: clean(item?.fullName || item?.full_name)
  };
}

function liveMetadata(source, now) {
  return { source, freshness: 'live', consultedAt: new Date(now).toISOString() };
}

function cloneWithFreshness(value, freshness, storedAt) {
  return {
    ...structuredClone(value),
    registry: { ...(value.registry || {}), freshness, cachedAt: freshness === 'cached' ? new Date(storedAt).toISOString() : null }
  };
}

function joinAddress(payload) {
  const street = clean(payload?.descricao_tipo_de_logradouro || payload?.tipo_logradouro);
  const name = clean(payload?.logradouro);
  const number = clean(payload?.numero);
  const complement = clean(payload?.complemento);
  return [[street, name].filter(Boolean).join(' '), number, complement].filter(Boolean).join(', ');
}

function formatCep(value) {
  const normalized = String(value ?? '').replace(/\D/g, '');
  return normalized.length === 8 ? normalized.replace(/^(\d{5})(\d{3})$/, '$1-$2') : clean(value);
}

function clean(value) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanFlag(value) {
  if (value === true || String(value).toLowerCase() === 'sim') return true;
  if (value === false || String(value).toLowerCase() === 'nao' || String(value).toLowerCase() === 'não') return false;
  return null;
}

function normalizeSearch(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function sanitizeProviderError(error) {
  if (error?.statusCode) return error;
  if (error?.name === 'AbortError') return registryError(504, 'A fonte cadastral excedeu o tempo limite de resposta.');
  return registryError(503, 'Não foi possível consultar a fonte cadastral neste momento.');
}

function registryError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}
