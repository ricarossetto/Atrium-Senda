import { AUTH_STRATEGIES } from './auth-adapters.mjs';
import { SESSION_STATUS } from './session-manager.mjs';

export const CONNECTIVITY_STATUS = Object.freeze({
  NOT_CONFIGURED: SESSION_STATUS.NOT_CONFIGURED,
  AUTHENTICATING: SESSION_STATUS.AUTHENTICATING,
  CONNECTED: SESSION_STATUS.CONNECTED,
  ACTION_REQUIRED: SESSION_STATUS.ACTION_REQUIRED,
  EXPIRED: SESSION_STATUS.EXPIRED,
  ERROR: SESSION_STATUS.ERROR
});

export const PORTAL_CAPABILITIES = Object.freeze([
  'authenticate',
  'health',
  'discoverCases',
  'fetchMovements',
  'fetchPublications',
  'disconnect'
]);

export const FORBIDDEN_JUDICIAL_OPERATIONS = Object.freeze([
  'acknowledge',
  'science',
  'sign',
  'file',
  'protocol',
  'petition',
  'confirmDeadline'
]);

const CNJ_DIGITS = /^\d{20}$/;
const DEFAULT_SUCCESS_CADENCE_MS = 30 * 60 * 1000;
const DEFAULT_BACKOFF_BASE_MS = 15 * 60 * 1000;
const DEFAULT_BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;

export function normalizeCnjNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return CNJ_DIGITS.test(digits) ? digits : '';
}

export function sanitizeJudicialError(value) {
  return String(value?.message || value || 'Falha judicial não identificada.')
    .replace(/(?:authorization:\s*bearer|bearer)\s+[a-z0-9._~+\/-]+=*/gi, 'Bearer [segredo oculto]')
    .replace(/(?:password|senha|passphrase|secret|segredo|token|cookie|otp|totp|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[segredo oculto]')
    .replace(/\b\d{6}\b/g, '[código oculto]')
    .replace(/(?:[A-Z2-7]{16,128})/g, '[segredo oculto]')
    .slice(0, 300);
}

export function resolvePortalAuthStrategy(portal = {}) {
  const explicit = String(portal.authStrategy || '').trim();
  if (Object.values(AUTH_STRATEGIES).includes(explicit)) return explicit;
  if (['djen', 'datajud'].includes(portal.strategy)) return AUTH_STRATEGIES.PUBLIC;
  if (portal.certificateMode === 'pjeoffice') return AUTH_STRATEGIES.PJEOFFICE_LOCAL;
  if (portal.certificateMode === 'pfx-mtls') return AUTH_STRATEGIES.CLIENT_CERT_MTLS;
  if (portal.certificateMode === 'windows-store') return AUTH_STRATEGIES.WINDOWS_STORE;
  if (portal.supportsTotp && portal.requiresPassword) return AUTH_STRATEGIES.USERNAME_PASSWORD_TOTP;
  if (portal.supportsTotp) return AUTH_STRATEGIES.TOTP;
  return AUTH_STRATEGIES.INTERACTIVE_HUMAN_REQUIRED;
}

export function portalVerificationState(portal = {}) {
  if (portal.verificationEvidence === true || portal.verificationEvidence?.verifiedAt) return 'verified';
  if (portal.strategy === 'djen' || portal.strategy === 'datajud') return 'verified';
  if (portal.automationLevel === 'experimental') return 'experimental';
  return 'not_verified';
}

export function computeNextRefresh({ now = Date.now(), success = false, failureCount = 0, authenticationRequired = false, successCadenceMs = DEFAULT_SUCCESS_CADENCE_MS, backoffBaseMs = DEFAULT_BACKOFF_BASE_MS, backoffMaxMs = DEFAULT_BACKOFF_MAX_MS } = {}) {
  if (authenticationRequired) return null;
  const delay = success
    ? successCadenceMs
    : Math.min(backoffMaxMs, backoffBaseMs * (2 ** Math.max(0, Number(failureCount || 1) - 1)));
  return new Date(Number(now) + delay).toISOString();
}

export function isRefreshDue(session = {}, now = Date.now()) {
  if ([SESSION_STATUS.HUMAN_ACTION_REQUIRED, SESSION_STATUS.ACTION_REQUIRED].includes(session.status)) return false;
  if (!session.nextRefreshAt) return true;
  const refreshAt = Date.parse(session.nextRefreshAt);
  return !Number.isFinite(refreshAt) || refreshAt <= Number(now);
}

export function deduplicateJudicialRecords(records = [], kind = 'record') {
  const seen = new Map();
  for (const record of records.filter(Boolean)) {
    const cnj = normalizeCnjNumber(record.process || record.number || record.processNumber);
    const external = String(record.externalId || record.sourceReference || record.id || '').trim();
    const movement = String(record.movementId || record.sequence || record.occurredAt || record.publishedAt || '').trim();
    const fallback = stableHash(JSON.stringify({ kind, cnj, title: record.title || record.description || record.lastMovement || '', movement }));
    const key = kind === 'case' && cnj ? `case:${cnj}` : external || `${kind}:${cnj || 'unmatched'}:${movement || fallback}`;
    if (!seen.has(key)) seen.set(key, { ...record });
  }
  return [...seen.values()];
}

export function suggestCanonicalCases(incoming = {}, canonicalCases = [], { source = '' } = {}) {
  const incomingCnj = normalizeCnjNumber(incoming.process || incoming.number || incoming.processNumber);
  const incomingReference = normalizeText(incoming.externalReference || incoming.reference || incoming.protocol);
  const incomingParties = normalizeText([incoming.client, incoming.party, incoming.parties, incoming.opposingParty].filter(Boolean).join(' '));
  const incomingCourt = normalizeText(incoming.court || incoming.tribunal);
  const suggestions = [];

  for (const candidate of canonicalCases) {
    const candidateCnj = normalizeCnjNumber(candidate.number || candidate.process || candidate.processNumber);
    if (incomingCnj && candidateCnj === incomingCnj) {
      suggestions.push(match(candidate, 'CNJ_EXACT', source, 1));
      continue;
    }
    const candidateReferences = [candidate.externalId, candidate.externalReference, candidate.protocol, candidate.oldNumber]
      .map(normalizeText)
      .filter(Boolean);
    if (incomingReference && candidateReferences.includes(incomingReference)) {
      suggestions.push(match(candidate, 'EXTERNAL_REFERENCE_EXACT', source, 0.92));
      continue;
    }
    const candidateParties = normalizeText([candidate.client, candidate.party, candidate.parties, candidate.opposingParty].filter(Boolean).join(' '));
    const candidateCourt = normalizeText(candidate.court || candidate.tribunal);
    const sharedParty = incomingParties && candidateParties && meaningfulTokens(incomingParties).some(token => candidateParties.includes(token));
    const sameCourt = incomingCourt && candidateCourt && (incomingCourt.includes(candidateCourt) || candidateCourt.includes(incomingCourt));
    if (sharedParty && sameCourt) suggestions.push(match(candidate, 'PARTY_AND_COURT', source, 0.68));
  }

  return suggestions.sort((left, right) => right.confidence - left.confidence || left.caseId.localeCompare(right.caseId));
}

export class ManagedJudicialConnectivity {
  constructor({ credentialManager, sessionManager, portalsConfig = [], adapterFactory, now = () => Date.now(), successCadenceMs = DEFAULT_SUCCESS_CADENCE_MS, backoffBaseMs = DEFAULT_BACKOFF_BASE_MS, backoffMaxMs = DEFAULT_BACKOFF_MAX_MS } = {}) {
    if (!credentialManager || !sessionManager) throw new Error('Managed Judicial Connectivity exige os gerenciadores canônicos de credencial e sessão.');
    this.credentials = credentialManager;
    this.sessions = sessionManager;
    this.portals = new Map(portalsConfig.map(portal => [portal.id, { ...portal }]));
    this.adapterFactory = adapterFactory || (() => null);
    this.now = now;
    this.successCadenceMs = successCadenceMs;
    this.backoffBaseMs = backoffBaseMs;
    this.backoffMaxMs = backoffMaxMs;
  }

  async coverage(userId, identityId = 'office-primary') {
    const credentialStatus = await this.credentials.getPublicStatus();
    const rows = [];
    for (const portal of this.portals.values()) {
      const session = await this.sessions.getSessionStatus(userId, portal.id, identityId);
      rows.push(publicCoverage(portal, session, credentialStatus));
    }
    return rows;
  }

  async syncPortal({ userId, identityId = 'office-primary', portalId, canonicalCases = [], force = false } = {}) {
    const portal = this.portals.get(portalId);
    if (!portal) throw new Error(`Portal judicial não configurado: ${portalId}.`);
    const strategy = resolvePortalAuthStrategy(portal);
    const previous = await this.sessions.getSessionStatus(userId, portalId, identityId);
    if (!force && !isRefreshDue(previous, this.now())) {
      return { ok: true, skipped: true, reason: 'not_due', portalId, state: previous.status, nextRefreshAt: previous.nextRefreshAt };
    }

    const adapter = this.adapterFactory(portal, strategy);
    assertReadOnlyAdapter(adapter, portalId);
    const release = await this.sessions.acquireLock(userId, portalId, identityId);
    const attemptedAt = new Date(this.now()).toISOString();
    let disconnected = false;
    try {
      await this.sessions.updateSessionStatus(userId, portalId, SESSION_STATUS.AUTHENTICATING, {
        authStrategy: strategy,
        lastAttemptAt: attemptedAt,
        humanAction: null,
        error: null
      }, identityId);

      const credential = await this.#credentialFor(strategy, portalId, identityId);
      const authentication = await adapter.authenticate({ userId, identityId, portal, strategy, credential, readOnly: true });
      if (authentication?.humanActionRequired) {
        return await this.#humanAction(userId, identityId, portal, strategy, attemptedAt, authentication);
      }
      const health = await adapter.health({ userId, identityId, portal, strategy, readOnly: true });
      if (health?.expired) {
        await this.sessions.updateSessionStatus(userId, portalId, SESSION_STATUS.EXPIRED, {
          authStrategy: strategy,
          lastAttemptAt: attemptedAt,
          nextRefreshAt: null,
          humanAction: health.humanAction || 'Reconecte a sessão do portal.',
          error: null
        }, identityId);
        return { ok: false, portalId, state: SESSION_STATUS.EXPIRED, humanActionRequired: true };
      }

      const discovered = deduplicateJudicialRecords(await adapter.discoverCases({ portal, readOnly: true }), 'case');
      const movements = deduplicateJudicialRecords(await adapter.fetchMovements({ portal, cases: discovered, readOnly: true }), 'movement');
      const publications = deduplicateJudicialRecords(await adapter.fetchPublications({ portal, cases: discovered, readOnly: true }), 'publication');
      const suggestions = publications.flatMap(record => suggestCanonicalCases(record, canonicalCases, { source: portal.name || portal.id }));
      const completedAt = new Date(this.now()).toISOString();
      const nextRefreshAt = computeNextRefresh({ now: this.now(), success: true, successCadenceMs: this.successCadenceMs });
      await this.sessions.updateSessionStatus(userId, portalId, SESSION_STATUS.CONNECTED, {
        authStrategy: strategy,
        lastAttemptAt: attemptedAt,
        lastSuccessfulSyncAt: completedAt,
        nextRefreshAt,
        failureCount: 0,
        humanAction: null,
        error: null,
        counts: { cases: discovered.length, movements: movements.length, publications: publications.length }
      }, identityId);
      return {
        ok: true,
        portalId,
        state: SESSION_STATUS.CONNECTED,
        readOnly: true,
        nextRefreshAt,
        cases: discovered,
        movements,
        publications,
        suggestions
      };
    } catch (error) {
      if (error?.humanRequired || error?.errorCode === 'AUTH-CAPTCHA-REQUIRED') {
        return await this.#humanAction(userId, identityId, portal, strategy, attemptedAt, error);
      }
      const failureCount = Number(previous.failureCount || 0) + 1;
      const nextRefreshAt = computeNextRefresh({
        now: this.now(),
        failureCount,
        backoffBaseMs: this.backoffBaseMs,
        backoffMaxMs: this.backoffMaxMs
      });
      const safeError = sanitizeJudicialError(error);
      await this.sessions.updateSessionStatus(userId, portalId, SESSION_STATUS.ERROR, {
        authStrategy: strategy,
        lastAttemptAt: attemptedAt,
        nextRefreshAt,
        failureCount,
        humanAction: null,
        error: safeError
      }, identityId);
      return { ok: false, portalId, state: SESSION_STATUS.ERROR, nextRefreshAt, error: safeError };
    } finally {
      try { await adapter.disconnect({ portal, readOnly: true }); disconnected = true; }
      catch { disconnected = false; }
      release();
      void disconnected;
    }
  }

  async #credentialFor(strategy, portalId, identityId) {
    if (strategy === AUTH_STRATEGIES.CLIENT_CERT_MTLS) return this.credentials.getCertificateSecrets();
    const credentials = await this.credentials.getPortalCredentials(portalId, identityId);
    const totpSecret = [AUTH_STRATEGIES.TOTP, AUTH_STRATEGIES.CREDENTIALS_TOTP, AUTH_STRATEGIES.USERNAME_PASSWORD_TOTP].includes(strategy)
      ? await this.credentials.getPortalTotpSecret(portalId, identityId)
      : null;
    return credentials || totpSecret ? { ...(credentials || {}), ...(totpSecret ? { totpSecret } : {}) } : null;
  }

  async #humanAction(userId, identityId, portal, strategy, attemptedAt, detail) {
    const humanAction = String(detail?.humanAction || detail?.message || 'Conclua a autenticação no portal.').slice(0, 180);
    await this.sessions.updateSessionStatus(userId, portal.id, SESSION_STATUS.ACTION_REQUIRED, {
      authStrategy: strategy,
      lastAttemptAt: attemptedAt,
      nextRefreshAt: null,
      humanAction,
      error: null
    }, identityId);
    return { ok: false, portalId: portal.id, state: SESSION_STATUS.ACTION_REQUIRED, humanActionRequired: true, humanAction };
  }
}

function publicCoverage(portal, session, credentialStatus) {
  const strategy = resolvePortalAuthStrategy(portal);
  const requiresA1 = [AUTH_STRATEGIES.CLIENT_CERT_MTLS, AUTH_STRATEGIES.WINDOWS_STORE].includes(strategy);
  const requiresPjeOffice = strategy === AUTH_STRATEGIES.PJEOFFICE_LOCAL;
  const configured = strategy === AUTH_STRATEGIES.PUBLIC
    || (!requiresA1 && !requiresPjeOffice && session.status !== SESSION_STATUS.NOT_CONFIGURED)
    || (requiresA1 && credentialStatus.certificate?.configured)
    || requiresPjeOffice;
  return {
    id: portal.id,
    name: portal.name,
    system: portal.system || portal.strategy || 'Portal judicial',
    authStrategy: strategy,
    verification: portalVerificationState(portal),
    configured,
    connectivityState: configured ? session.status : SESSION_STATUS.NOT_CONFIGURED,
    lastSuccessfulSyncAt: session.lastSuccessfulSyncAt || null,
    lastAttemptAt: session.lastAttemptAt || null,
    nextRefreshAt: session.nextRefreshAt || null,
    lastError: session.error ? sanitizeJudicialError(session.error) : null,
    humanAction: session.humanAction || null,
    readOnly: true
  };
}

function assertReadOnlyAdapter(adapter, portalId) {
  if (!adapter) throw new Error(`Adaptador do portal ${portalId} não está disponível.`);
  for (const capability of PORTAL_CAPABILITIES) {
    if (typeof adapter[capability] !== 'function') throw new Error(`Adaptador ${portalId} não implementa ${capability}().`);
  }
  if (adapter.readOnly !== true) throw new Error(`Adaptador ${portalId} não declarou modo somente leitura.`);
  for (const operation of FORBIDDEN_JUDICIAL_OPERATIONS) {
    if (typeof adapter[operation] === 'function') throw new Error(`Adaptador ${portalId} expõe operação judicial proibida: ${operation}.`);
  }
}

function match(candidate, reason, source, confidence) {
  return {
    caseId: String(candidate.id || candidate.externalId || candidate.number || ''),
    reason,
    source: String(source || ''),
    confidence
  };
}

function meaningfulTokens(value) {
  return [...new Set(value.split(/\s+/).filter(token => token.length >= 4 && !['processo', 'tribunal', 'cliente'].includes(token)))];
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function stableHash(value) {
  let result = 2166136261;
  for (const character of String(value || '')) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}
