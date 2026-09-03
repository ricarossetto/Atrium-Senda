const DEFAULT_BASE_URL = 'http://127.0.0.1:3100';
const DEFAULT_TIMEOUT_MS = 4_000;
const MAX_RESPONSE_BYTES = 12_000_000;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]']);

export class TjrsSidecarError extends Error {
  constructor(message, { code = 'ERROR', statusCode = 502, cause } = {}) {
    super(message, { cause });
    this.name = 'TjrsSidecarError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class TjrsSidecarClient {
  constructor({
    baseUrl = process.env.ATRIUM_TJRS_SIDECAR_URL || DEFAULT_BASE_URL,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS
  } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('Cliente HTTP do sidecar TJRS indisponível.');
    this.baseUrl = normalizeLoopbackBaseUrl(baseUrl);
    this.fetchImpl = fetchImpl;
    this.timeoutMs = Math.max(250, Math.min(Number(timeoutMs) || DEFAULT_TIMEOUT_MS, 15_000));
  }

  async health() {
    const payload = await this.#get('/health');
    if (payload?.status !== 'ok' || payload?.database !== 'connected') {
      throw new TjrsSidecarError('O coletor TJRS local não está pronto para leitura.', { code: 'STALE', statusCode: 503 });
    }
    return {
      state: 'AVAILABLE',
      collectorVersion: safeText(payload.collectorVersion, 40),
      timestamp: safeIso(payload.timestamp)
    };
  }

  async getProcess(cnj) {
    const digits = assertTjrsCnj(cnj);
    const payload = await this.#get(`/v1/processes/${digits}`, { notFoundCode: 'NOT_FOUND' });
    if (!payload?.metadata || normalizeDigits(payload.metadata.cnj) !== digits) {
      throw new TjrsSidecarError('O coletor TJRS devolveu um snapshot incompatível.', { code: 'INVALID_RESPONSE' });
    }
    return normalizeSnapshot(payload, digits);
  }

  async getDiff(cnj) {
    const digits = assertTjrsCnj(cnj);
    const payload = await this.#get(`/v1/processes/${digits}/diff`, { notFoundCode: 'NOT_FOUND' });
    if (!payload?.diff || normalizeDigits(payload.cnj || payload.diff.cnj) !== digits) {
      throw new TjrsSidecarError('O coletor TJRS devolveu um diff incompatível.', { code: 'INVALID_RESPONSE' });
    }
    return normalizeDiff(payload.diff, digits);
  }

  async #get(pathname, { notFoundCode = 'UNAVAILABLE' } = {}) {
    let response;
    try {
      response = await this.fetchImpl(new URL(pathname, this.baseUrl), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      throw new TjrsSidecarError('O coletor TJRS local está indisponível.', {
        code: 'UNAVAILABLE',
        statusCode: 503,
        cause: error
      });
    }

    if (response.status === 404) {
      throw new TjrsSidecarError('Ainda não há snapshot local para este processo no coletor TJRS.', {
        code: notFoundCode,
        statusCode: 404
      });
    }
    if (!response.ok) {
      throw new TjrsSidecarError('O coletor TJRS local não conseguiu concluir a leitura.', {
        code: response.status >= 500 ? 'ERROR' : 'INVALID_RESPONSE',
        statusCode: 502
      });
    }
    try {
      const declaredLength = Number(response.headers?.get?.('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) throw new Error('payload too large');
      const raw = await response.text();
      if (Buffer.byteLength(raw, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('payload too large');
      return JSON.parse(raw);
    } catch (error) {
      throw new TjrsSidecarError('O coletor TJRS devolveu uma resposta inválida.', {
        code: 'INVALID_RESPONSE',
        cause: error
      });
    }
  }
}

export function assertTjrsCnj(value) {
  const digits = normalizeDigits(value);
  if (digits.length !== 20 || digits[13] !== '8' || digits.slice(14, 16) !== '21') {
    throw new TjrsSidecarError('Informe um número CNJ válido do TJRS.', { code: 'INVALID_CNJ', statusCode: 400 });
  }
  return digits;
}

export function formatCnj(value) {
  const digits = normalizeDigits(value);
  if (digits.length !== 20) return safeText(value, 80);
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits[13]}.${digits.slice(14, 16)}.${digits.slice(16)}`;
}

export function reconcileTjrsSnapshot(existingProcess, snapshot, diff = null) {
  if (!existingProcess || typeof existingProcess !== 'object') {
    throw new TypeError('Processo local obrigatório para reconciliação TJRS.');
  }
  const current = structuredClone(existingProcess);
  const normalized = normalizeSnapshot(snapshot, assertTjrsCnj(snapshot?.metadata?.cnj || existingProcess.number));
  const normalizedDiff = diff ? normalizeDiff(diff, normalized.metadata.cnj) : null;
  const metadata = normalized.metadata;
  if (normalized.provenance.sha256Payload && current.tjrsCollector?.payloadHash === normalized.provenance.sha256Payload) {
    return {
      process: current,
      changed: false,
      summary: {
        parties: normalized.parties.length,
        movements: normalized.movements.length,
        newMovements: normalizedDiff?.newMovements.length || 0,
        changedMovements: normalizedDiff?.changedMovements.length || 0,
        possiblyMissingMovements: normalizedDiff?.possiblyMissingMovements.length || 0
      }
    };
  }

  fillEmpty(current, 'number', metadata.rawCnj || formatCnj(metadata.cnj));
  fillEmpty(current, 'court', metadata.court);
  fillEmpty(current, 'county', metadata.district);
  fillEmpty(current, 'courtUnit', metadata.judicialUnit);
  fillEmpty(current, 'actionType', metadata.processClass);
  fillEmpty(current, 'subject', metadata.subject);
  fillEmpty(current, 'registeredAt', metadata.distributionDate);
  if (current.secrecy === undefined || current.secrecy === null) current.secrecy = metadata.isSecret;
  if ((current.economicValue === undefined || current.economicValue === null || current.economicValue === '') && metadata.value !== null) {
    current.economicValue = metadata.value;
  }

  current.judicialParties = normalized.parties;
  current.movements = mergeMovements(current.movements, normalized.movements, normalizedDiff);
  const latest = current.movements
    .filter(item => item?.description || item?.text || item?.name)
    .slice()
    .sort((a, b) => String(b.date || b.occurredAt || b.at || '').localeCompare(String(a.date || a.occurredAt || a.at || '')))[0];
  if (latest) {
    current.lastMovement = latest.description || latest.text || latest.name;
    current.lastMovementAt = latest.date || latest.occurredAt || latest.at || current.lastMovementAt;
  }

  current.tjrsCollector = {
    status: 'AVAILABLE',
    cnj: metadata.cnj,
    system: metadata.system,
    classCode: metadata.classCode,
    subjectCode: metadata.subjectCode,
    districtCode: metadata.districtCode,
    syncedAt: normalized.provenance.queryTimestamp,
    source: normalized.provenance.source,
    queryKind: normalized.provenance.queryKind,
    collectorVersion: normalized.provenance.collectorVersion,
    payloadHash: normalized.provenance.sha256Payload,
    snapshotsCount: normalized.snapshotsCount,
    diff: normalizedDiff ? {
      previousSnapshotTimestamp: normalizedDiff.previousSnapshotTimestamp,
      currentSnapshotTimestamp: normalizedDiff.currentSnapshotTimestamp,
      hasChanges: normalizedDiff.hasChanges,
      newMovements: normalizedDiff.newMovements.length,
      changedMovements: normalizedDiff.changedMovements.length,
      possiblyMissingMovements: normalizedDiff.possiblyMissingMovements.length
    } : null
  };

  const changed = stableJson(current) !== stableJson(existingProcess);
  return {
    process: current,
    changed,
    summary: {
      parties: normalized.parties.length,
      movements: normalized.movements.length,
      newMovements: normalizedDiff?.newMovements.length || 0,
      changedMovements: normalizedDiff?.changedMovements.length || 0,
      possiblyMissingMovements: normalizedDiff?.possiblyMissingMovements.length || 0
    }
  };
}

function normalizeLoopbackBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || DEFAULT_BASE_URL));
  } catch {
    throw new TypeError('Endereço do sidecar TJRS inválido.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !LOOPBACK_HOSTS.has(parsed.hostname) || parsed.username || parsed.password) {
    throw new TypeError('O sidecar TJRS deve usar exclusivamente uma interface de loopback local.');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '') + '/';
  parsed.search = '';
  parsed.hash = '';
  return parsed;
}

function normalizeSnapshot(payload, expectedCnj) {
  const metadata = payload?.metadata || {};
  const cnj = assertTjrsCnj(metadata.cnj || expectedCnj);
  if (cnj !== expectedCnj) throw new TjrsSidecarError('O snapshot TJRS pertence a outro processo.', { code: 'INVALID_RESPONSE' });
  const parties = Array.isArray(payload.parties) ? payload.parties.slice(0, 500).map(normalizeParty).filter(Boolean) : [];
  const movements = Array.isArray(payload.movements) ? payload.movements.slice(0, 10_000).map(normalizeMovement).filter(Boolean) : [];
  const provenance = payload?.provenance || {};
  return {
    metadata: {
      cnj,
      rawCnj: formatCnj(metadata.rawCnj || cnj),
      court: safeText(metadata.court, 120),
      district: safeText(metadata.district, 200),
      districtCode: finiteNumber(metadata.districtCode),
      judicialUnit: safeText(metadata.judicialUnit, 300),
      system: safeText(metadata.system, 80),
      processClass: safeText(metadata.processClass, 300),
      classCode: finiteNumber(metadata.classCode),
      subject: safeText(metadata.subject, 500),
      subjectCode: finiteNumber(metadata.subjectCode),
      distributionDate: safeIso(metadata.distributionDate),
      isSecret: Boolean(metadata.isSecret),
      value: finiteNumber(metadata.value)
    },
    parties,
    movements,
    provenance: {
      source: provenance.source === 'TJRS_PUBLIC' ? 'TJRS_PUBLIC' : 'TJRS_PUBLIC',
      queryTimestamp: safeIso(provenance.queryTimestamp),
      collectorVersion: safeText(provenance.collectorVersion, 40),
      queryKind: ['PROCESS_CNJ', 'OAB_SEARCH', 'DAILY_MONITOR'].includes(provenance.queryKind) ? provenance.queryKind : 'PROCESS_CNJ',
      sha256Payload: /^[a-f\d]{64}$/i.test(String(provenance.sha256Payload || '')) ? String(provenance.sha256Payload).toLowerCase() : ''
    },
    snapshotsCount: Math.max(0, Math.trunc(Number(payload.snapshotsCount) || 0))
  };
}

function normalizeParty(value) {
  const name = safeText(value?.name, 300);
  const role = safeText(value?.role, 100);
  if (!name || !role) return null;
  return {
    name,
    role,
    documentType: safeText(value?.documentType, 20),
    documentRedacted: safeText(value?.documentRedacted, 80),
    lawyers: (Array.isArray(value?.lawyers) ? value.lawyers : []).slice(0, 100).map(item => ({
      name: safeText(item?.name, 300),
      oabNumber: safeText(item?.oabNumber, 40),
      oabUf: safeText(item?.oabUf, 2).toUpperCase()
    })).filter(item => item.name)
  };
}

function normalizeMovement(value) {
  const description = safeText(value?.description, 4_000);
  const date = safeIso(value?.date);
  if (!description || !date) return null;
  return {
    eventNumber: finiteNumber(value?.eventNumber),
    sequenceNumber: finiteNumber(value?.sequenceNumber),
    date,
    description,
    cnjCode: finiteNumber(value?.cnjCode),
    documentReferences: (Array.isArray(value?.documentReferences) ? value.documentReferences : []).slice(0, 100).map(item => ({
      id: safeText(item?.id, 200),
      name: safeText(item?.name, 300)
    })).filter(item => item.id || item.name),
    fingerprint: /^[a-f\d]{64}$/i.test(String(value?.fingerprint || '')) ? String(value.fingerprint).toLowerCase() : '',
    source: 'TJRS_PUBLIC'
  };
}

function normalizeDiff(value, expectedCnj) {
  const cnj = assertTjrsCnj(value?.cnj || expectedCnj);
  if (cnj !== expectedCnj) throw new TjrsSidecarError('O diff TJRS pertence a outro processo.', { code: 'INVALID_RESPONSE' });
  return {
    cnj,
    previousSnapshotTimestamp: safeIso(value?.previousSnapshotTimestamp),
    currentSnapshotTimestamp: safeIso(value?.currentSnapshotTimestamp),
    hasChanges: Boolean(value?.hasChanges),
    newMovements: Array.isArray(value?.newMovements) ? value.newMovements.slice(0, 10_000).map(normalizeMovement).filter(Boolean) : [],
    unchangedMovements: Array.isArray(value?.unchangedMovements) ? value.unchangedMovements.slice(0, 10_000).map(normalizeMovement).filter(Boolean) : [],
    changedMovements: Array.isArray(value?.changedMovements) ? value.changedMovements.slice(0, 10_000).map(item => ({
      previous: normalizeMovement(item?.previous),
      current: normalizeMovement(item?.current)
    })).filter(item => item.previous && item.current) : [],
    possiblyMissingMovements: Array.isArray(value?.possiblyMissingMovements) ? value.possiblyMissingMovements.slice(0, 10_000).map(normalizeMovement).filter(Boolean) : []
  };
}

function mergeMovements(existing, incoming, diff) {
  const result = [];
  const incomingEvents = new Set(incoming.map(item => item.eventNumber).filter(Number.isFinite));
  const missingEvents = new Set((diff?.possiblyMissingMovements || []).map(item => item.eventNumber).filter(Number.isFinite));
  for (const movement of Array.isArray(existing) ? existing : []) {
    if (movement?.source !== 'TJRS_PUBLIC') {
      result.push(structuredClone(movement));
      continue;
    }
    if (Number.isFinite(movement.eventNumber) && incomingEvents.has(movement.eventNumber)) continue;
    result.push(missingEvents.has(movement.eventNumber) ? { ...structuredClone(movement), possiblyMissing: true } : structuredClone(movement));
  }
  result.push(...incoming.map(item => ({ ...item, possiblyMissing: false })));
  const seen = new Set();
  return result.filter(item => {
    const key = movementKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function movementKey(value) {
  if (value?.source === 'TJRS_PUBLIC' && Number.isFinite(value?.eventNumber)) return `tjrs:${value.eventNumber}`;
  return `${safeText(value?.fingerprint, 80)}|${safeText(value?.date || value?.occurredAt || value?.at, 80)}|${safeText(value?.description || value?.text || value?.name, 500)}`;
}

function fillEmpty(target, key, value) {
  if ((target[key] === undefined || target[key] === null || String(target[key]).trim() === '') && value !== undefined && value !== null && String(value).trim() !== '') {
    target[key] = value;
  }
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function safeText(value, maxLength = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function safeIso(value) {
  const raw = safeText(value, 80);
  if (!raw) return '';
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stableJson(value) {
  return JSON.stringify(value);
}
