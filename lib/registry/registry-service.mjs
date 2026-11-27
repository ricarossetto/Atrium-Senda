import { classifyBrazilianDocument, formatCnpj, normalizeCnpj } from './identifiers.mjs';

const ALLOWED_ORIGINS = new Set(['https://open.cnpja.com', 'https://brasilapi.com.br', 'https://viacep.com.br']);
const DEFAULT_TIMEOUT_MS = 6_000;
const CIRCUIT_FAILURE_LIMIT = 3;
const CIRCUIT_OPEN_MS = 60_000;
const CNPJA_OPEN_WINDOW_MS = 60_000;
const CNPJA_OPEN_MAX_PER_WINDOW = 5;
const MAX_CACHE_ENTRIES = 1_000;
const CNPJA_HEALTH_SAMPLE_CNPJ = '37335118000180';
const CACHE_TTL = Object.freeze({ cnpj: 12 * 60 * 60_000, cep: 7 * 24 * 60 * 60_000, banks: 24 * 60 * 60_000 });

export class RegistryService {
  constructor({ fetchFn = globalThis.fetch, now = () => Date.now(), timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (typeof fetchFn !== 'function') throw new TypeError('Um cliente HTTP é obrigatório para a inteligência cadastral.');
    this.fetchFn = fetchFn;
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.cache = new Map();
    this.inFlight = new Map();
    this.circuits = new Map();
    this.providerMetrics = new Map();
    this.providerWindows = new Map();
  }

  status() {
    return {
      providers: [
        this.providerStatus('cnpja-open', 'CNPJá Open', ['CNPJ primário (5 req/min)', 'Simples / MEI', 'QSA', 'CNAEs', 'Matriz/Filial'], { priority: 1, cacheTtlMs: CACHE_TTL.cnpj, rateLimitPerMinute: CNPJA_OPEN_MAX_PER_WINDOW }),
        this.providerStatus('brasilapi', 'BrasilAPI', ['CNPJ fallback / alfanumérico', 'CEP', 'Bancos'], { priority: 2, cacheTtlMs: CACHE_TTL.cnpj }),
        this.providerStatus('viacep', 'ViaCEP', ['CEP fallback'], { priority: 3, cacheTtlMs: CACHE_TTL.cep }),
        { id: 'cpf-local', name: 'Validação de CPF', capabilities: ['CPF · formato e dígitos verificadores'], enabled: true, configured: true, priority: 'local', cacheTtlMs: null, rateLimitPerMinute: null, state: 'available', lastSuccessAt: null, lastLatencyMs: 0 }
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
    if (providerId === 'cnpja-open') {
      if (!this.hasProviderBudget('cnpja-open', CNPJA_OPEN_MAX_PER_WINDOW, CNPJA_OPEN_WINDOW_MS)) {
        throw registryError(429, 'Limite público da CNPJá Open (5 consultas/min) atingido. Aguarde instantes.');
      }
      this.consumeProviderBudget('cnpja-open', CNPJA_OPEN_WINDOW_MS);
      await this.fetchJson(`https://open.cnpja.com/office/${CNPJA_HEALTH_SAMPLE_CNPJ}`, 'cnpja-open', { retries: 0, ignoreCircuitOn429: true });
    }
    else if (providerId === 'brasilapi') await this.fetchJson('https://brasilapi.com.br/api/cep/v1/01001000', providerId, { retries: 0 });
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
    const isNumeric = /^\d{14}$/.test(document.normalized);
    return this.cached(key, CACHE_TTL.cnpj, async () => {
      if (!isNumeric) {
        const payload = await this.fetchJson(`https://brasilapi.com.br/api/cnpj/v1/${encodeURIComponent(document.normalized)}`, 'brasilapi');
        return normalizeCnpjPayload(payload, document.normalized, this.now());
      }
      let cnpjaError = null;
      if (!this.isCircuitOpen('cnpja-open') && this.hasProviderBudget('cnpja-open', CNPJA_OPEN_MAX_PER_WINDOW, CNPJA_OPEN_WINDOW_MS)) {
        this.consumeProviderBudget('cnpja-open', CNPJA_OPEN_WINDOW_MS);
        try {
          const payload = await this.fetchJson(`https://open.cnpja.com/office/${document.normalized}`, 'cnpja-open', { retries: 0, ignoreCircuitOn429: true });
          return normalizeCnpjaOpenPayload(payload, document.normalized, this.now());
        } catch (error) {
          cnpjaError = error;
        }
      }
      try {
        const payload = await this.fetchJson(`https://brasilapi.com.br/api/cnpj/v1/${encodeURIComponent(document.normalized)}`, 'brasilapi');
        return normalizeCnpjPayload(payload, document.normalized, this.now(), { fallbackFrom: 'cnpja-open' });
      } catch (brasilError) {
        if (cnpjaError?.statusCode === 404 && brasilError?.statusCode === 404) throw brasilError;
        throw brasilError || cnpjaError;
      }
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
    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = Promise.resolve()
        .then(() => loader())
        .then(value => {
          const storedAt = this.now();
          if (this.cache.size >= MAX_CACHE_ENTRIES) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey !== undefined) this.cache.delete(oldestKey);
          }
          this.cache.set(key, { value, storedAt, expiresAt: storedAt + ttlMs });
          return { value, storedAt };
        })
        .finally(() => {
          if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
        });
      this.inFlight.set(key, pending);
    }
    const { value, storedAt } = await pending;
    return cloneWithFreshness(value, 'live', storedAt);
  }

  async fetchJson(rawUrl, providerId, { retries = 1, ignoreCircuitOn429 = false } = {}) {
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
        if (response.status === 429) {
          if (providerId === 'cnpja-open') this.saturateProviderBudget(providerId, CNPJA_OPEN_MAX_PER_WINDOW);
          throw registryError(429, 'Limite temporário de consultas na fonte cadastral atingido. Aguarde instantes.');
        }
        if (!response.ok) throw registryError(response.status >= 500 ? 503 : 502, 'Fonte cadastral temporariamente indisponível.');
        const payload = await response.json();
        this.recordSuccess(providerId, Math.max(0, this.now() - startedAt));
        return payload;
      } catch (error) {
        lastError = sanitizeProviderError(error);
        if (lastError.statusCode === 429 && ignoreCircuitOn429) throw lastError;
        if (lastError.statusCode < 500) throw lastError;
        if (attempt >= retries) break;
      } finally {
        clearTimeout(timer);
      }
    }
    this.recordFailure(providerId);
    throw lastError || registryError(503, 'Fonte cadastral temporariamente indisponível.');
  }

  pruneProviderWindow(providerId, windowMs) {
    const cutoff = this.now() - windowMs;
    const entries = (this.providerWindows.get(providerId) || []).filter(ts => ts > cutoff);
    if (entries.length) this.providerWindows.set(providerId, entries);
    else this.providerWindows.delete(providerId);
    return entries;
  }

  hasProviderBudget(providerId, limit, windowMs) {
    return this.pruneProviderWindow(providerId, windowMs).length < limit;
  }

  consumeProviderBudget(providerId, windowMs) {
    const entries = this.pruneProviderWindow(providerId, windowMs);
    entries.push(this.now());
    this.providerWindows.set(providerId, entries);
  }

  saturateProviderBudget(providerId, limit) {
    const now = this.now();
    this.providerWindows.set(providerId, Array.from({ length: limit }, () => now));
  }

  isCircuitOpen(providerId) {
    const circuit = this.circuits.get(providerId);
    if (!circuit?.openedAt) return false;
    if (this.now() - circuit.openedAt >= CIRCUIT_OPEN_MS) {
      this.circuits.delete(providerId);
      return false;
    }
    return true;
  }

  assertCircuit(providerId) {
    if (this.isCircuitOpen(providerId)) {
      throw registryError(503, 'Fonte cadastral temporariamente pausada após falhas sucessivas. Tente novamente em instantes.');
    }
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

  providerStatus(id, name, capabilities, { priority, cacheTtlMs, rateLimitPerMinute = null } = {}) {
    const circuit = this.circuits.get(id);
    const metrics = this.providerMetrics.get(id) || {};
    return { id, name, capabilities, enabled: true, configured: true, priority, cacheTtlMs, rateLimitPerMinute, state: circuit?.openedAt ? 'temporarily_paused' : 'available', lastSuccessAt: metrics.lastSuccessAt || null, lastLatencyMs: metrics.lastLatencyMs ?? null };
  }
}

function normalizeCnpjaOpenPayload(payload, requestedDocument, now) {
  const company = payload?.company && typeof payload.company === 'object' ? payload.company : {};
  const address = payload?.address && typeof payload.address === 'object' ? payload.address : {};
  const rawPhones = Array.isArray(payload?.phones)
    ? payload.phones
    : Array.isArray(payload?.contacts?.phones)
      ? payload.contacts.phones
      : [];
  const normalizedPhones = rawPhones.map(item => {
    const formatted = formatBrazilianPhone(item?.area, item?.number);
    if (!formatted) return null;
    const rawType = clean(item?.type).toUpperCase();
    const digits = formatted.replace(/\D/g, '');
    const type = rawType || (digits.length === 11 ? 'MOBILE' : 'LANDLINE');
    return { type, formatted };
  }).filter(Boolean);
  const mobileEntry = normalizedPhones.find(item => item.type === 'MOBILE' || item.formatted.replace(/\D/g, '').length === 11) || null;
  const landlineEntry = normalizedPhones.find(item => item !== mobileEntry) || null;

  const rawEmails = Array.isArray(payload?.emails)
    ? payload.emails
    : Array.isArray(payload?.contacts?.emails)
      ? payload.contacts.emails
      : [];
  const emailCandidates = rawEmails.filter(item => clean(item?.address));
  const chosenEmail = emailCandidates.find(item => clean(item?.ownership).toUpperCase() === 'CORPORATE') || emailCandidates[0] || null;

  const members = Array.isArray(company?.members) ? company.members : [];
  const qsa = members.map(item => {
    const personTypeRaw = clean(item?.person?.type).toUpperCase();
    return {
      name: clean(item?.person?.name || item?.name),
      role: clean(item?.role?.text || item?.role),
      since: clean(item?.since),
      personType: personTypeRaw === 'NATURAL' ? 'PF' : personTypeRaw === 'LEGAL' ? 'PJ' : personTypeRaw,
      country: clean(item?.person?.country?.name)
    };
  }).filter(item => item.name);

  const mainActivity = payload?.mainActivity && typeof payload.mainActivity === 'object'
    ? payload.mainActivity
    : payload?.activity && typeof payload.activity === 'object'
      ? payload.activity
      : {};
  const sideActivities = Array.isArray(payload?.sideActivities) ? payload.sideActivities : [];
  const taxEvents = Array.isArray(company?.simples?.events)
    ? company.simples.events.slice(0, 6).map(ev => ({
      regime: clean(ev?.regime),
      from: clean(ev?.from),
      text: clean(ev?.text)
    })).filter(ev => ev.regime || ev.from || ev.text)
    : [];

  const streetAddress = [clean(address?.street), clean(address?.number), clean(address?.details)].filter(Boolean).join(', ');
  const docValue = payload?.taxId || requestedDocument;
  const sourceUpdatedAt = clean(payload?.updated);

  return {
    document: formatCnpj(docValue),
    normalizedDocument: normalizeCnpj(docValue),
    legalName: clean(company?.name),
    tradeName: clean(payload?.alias),
    establishmentType: payload?.head === true ? 'Matriz' : payload?.head === false ? 'Filial' : '',
    status: clean(payload?.status?.text),
    statusDate: clean(payload?.statusDate || payload?.status?.date),
    statusReason: clean(payload?.status?.reason?.text),
    openedAt: clean(payload?.founded),
    legalNature: clean(company?.nature?.text),
    legalNatureCode: clean(company?.nature?.id),
    size: clean(company?.size?.text),
    sizeAcronym: clean(company?.size?.acronym),
    email: clean(chosenEmail?.address).toLowerCase(),
    emailDomain: clean(chosenEmail?.domain).toLowerCase(),
    emailOwnership: clean(chosenEmail?.ownership).toUpperCase(),
    mobile: mobileEntry?.formatted || '',
    phone: landlineEntry?.formatted || (normalizedPhones.length === 1 ? normalizedPhones[0].formatted : ''),
    phones: normalizedPhones,
    address: streetAddress,
    district: clean(address?.district),
    city: clean(address?.city),
    state: clean(address?.state).toUpperCase(),
    zip: formatCep(address?.zip || address?.zipCode),
    capital: finiteNumber(company?.equity),
    primaryActivity: clean(mainActivity?.text),
    primaryActivityCode: formatCnaeCode(mainActivity?.id),
    secondaryActivities: sideActivities.map(item => ({ code: formatCnaeCode(item?.id), description: clean(item?.text) })).filter(item => item.code || item.description),
    municipalityIbgeCode: clean(address?.municipality),
    simpleNational: typeof company?.simples?.optant === 'boolean' ? company.simples.optant : booleanFlag(company?.simples?.optant),
    simpleNationalSince: clean(company?.simples?.since),
    taxEvents,
    mei: typeof company?.simei?.optant === 'boolean' ? company.simei.optant : booleanFlag(company?.simei?.optant),
    meiSince: clean(company?.simei?.since),
    suframaCount: Array.isArray(payload?.suframa) ? payload.suframa.length : (payload?.suframa?.status ? 1 : 0),
    qsa,
    sourceUpdatedAt,
    registry: liveMetadata('CNPJá Open · dados públicos de CNPJ', now, { providerId: 'cnpja-open', sourceUpdatedAt })
  };
}

function normalizeCnpjPayload(payload, requestedDocument, now, { fallbackFrom = '' } = {}) {
  const qsa = Array.isArray(payload?.qsa) ? payload.qsa.map(item => ({
    name: clean(item.nome_socio || item.nome),
    role: clean(item.qualificacao_socio || item.qualificacao),
    since: clean(item.data_entrada_sociedade),
    country: clean(item.pais)
  })).filter(item => item.name) : [];
  const headCode = Number(payload?.identificador_matriz_filial);
  return {
    document: formatCnpj(payload?.cnpj || requestedDocument),
    normalizedDocument: normalizeCnpj(payload?.cnpj || requestedDocument),
    legalName: clean(payload?.razao_social),
    tradeName: clean(payload?.nome_fantasia),
    establishmentType: headCode === 1 ? 'Matriz' : headCode === 2 ? 'Filial' : '',
    status: clean(payload?.descricao_situacao_cadastral),
    statusDate: clean(payload?.data_situacao_cadastral),
    statusReason: clean(payload?.descricao_motivo_situacao_cadastral),
    openedAt: clean(payload?.data_inicio_atividade),
    legalNature: clean(payload?.natureza_juridica),
    legalNatureCode: clean(payload?.codigo_natureza_juridica),
    size: clean(payload?.porte),
    sizeAcronym: '',
    email: clean(payload?.email).toLowerCase(),
    emailDomain: '',
    emailOwnership: '',
    mobile: '',
    phone: clean(payload?.ddd_telefone_1 || payload?.ddd_telefone_2),
    phones: [],
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
    taxEvents: [],
    mei: booleanFlag(payload?.opcao_pelo_mei),
    meiSince: clean(payload?.data_opcao_pelo_mei),
    suframaCount: 0,
    qsa,
    sourceUpdatedAt: '',
    registry: liveMetadata('BrasilAPI · dados públicos de CNPJ', now, { providerId: 'brasilapi', ...(fallbackFrom ? { fallbackFrom } : {}) })
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

function liveMetadata(source, now, extra = {}) {
  return { source, freshness: 'live', consultedAt: new Date(now).toISOString(), ...extra };
}

function formatCnaeCode(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return clean(value);
  return digits.padStart(7, '0');
}

function formatBrazilianPhone(area, number) {
  const areaDigits = clean(area).replace(/\D/g, '');
  const phoneDigits = clean(number).replace(/\D/g, '');
  if (!phoneDigits) return '';
  if (areaDigits && phoneDigits.length === 9) return `(${areaDigits}) ${phoneDigits.slice(0, 5)}-${phoneDigits.slice(5)}`;
  if (areaDigits && phoneDigits.length === 8) return `(${areaDigits}) ${phoneDigits.slice(0, 4)}-${phoneDigits.slice(4)}`;
  return areaDigits ? `(${areaDigits}) ${phoneDigits}` : phoneDigits;
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
