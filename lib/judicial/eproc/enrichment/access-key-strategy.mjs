/**
 * ATRIUM Sovereign Judicial Connectivity — Access Key Enrichment Strategy
 *
 * Implements the Two-Tier Low-Session access-key enrichment pipeline:
 *
 * Tier 1: Vault-First
 * - Consults the encrypted credential vault for an existing process access key.
 * - If key exists, attempts public search (outside of heavy authenticated session).
 *
 * Tier 2: Authenticated Refresh on Expiration/Absence
 * - If key is missing, or if public search indicates KEY_EXPIRED / KEY_INVALID:
 *   Executes EXACTLY ONE authenticated refresh attempt in the eproc session:
 *   Navigates to case details -> reveals "Informações Adicionais" -> copies new key.
 * - Atomically updates the vault with the refreshed key.
 * - Retries public search once.
 * - Never enters refresh loops.
 * - Never assumes a key from one portal/degree serves another.
 *
 * Public search gate:
 * - The public-key client is only honored when explicitly injected AND enabled.
 * - `options.publicSearchEnabled` defaults to true so existing callers that inject a
 *   client keep the current behavior; the runtime wiring injects the client only when
 *   `EPROC_PUBLIC_KEY_ENABLED` is on. With the flag off nothing is injected and this
 *   strategy follows the authenticated-session path exactly as before.
 * - Reasons the portal cannot serve over public search (HUMAN_REQUIRED, CAPTCHA_REQUIRED,
 *   UNSUPPORTED) degrade to the authenticated session without a false error.
 */

import { redactEprocSecrets } from '../key-redaction.mjs';

export const ENRICHMENT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETE: 'COMPLETE',
  RETRYABLE_ERROR: 'RETRYABLE_ERROR',
  RESTRICTED: 'RESTRICTED'
});

export const PUBLIC_SEARCH_DEGRADABLE_REASONS = Object.freeze([
  'HUMAN_REQUIRED',
  'CAPTCHA_REQUIRED',
  'UNSUPPORTED'
]);

const DEGRADABLE_REASON_SET = new Set(PUBLIC_SEARCH_DEGRADABLE_REASONS);

function redactSecretText(value, secret) {
  const needle = String(secret || '');
  if (needle.length < 6) return value;
  if (typeof value === 'string') return value.split(needle).join('[redigido]');
  if (Array.isArray(value)) return value.map(item => redactSecretText(item, secret));
  if (value && typeof value === 'object') {
    const clean = {};
    for (const [key, nested] of Object.entries(value)) clean[key] = redactSecretText(nested, secret);
    return clean;
  }
  return value;
}

function sanitizePublicSearchValue(value, accessKey) {
  return redactSecretText(redactEprocSecrets(value), accessKey);
}

function extractPublicSearchData(result, accessKey) {
  if (!result || typeof result !== 'object') return null;
  if (result.data !== undefined && result.data !== null) {
    return sanitizePublicSearchValue(result.data, accessKey);
  }
  if (result.source === 'EPROC_PUBLIC_KEY' || result.parties || result.movements || result.documents) {
    return sanitizePublicSearchValue({
      source: result.source || 'EPROC_PUBLIC_KEY',
      collectedAt: result.collectedAt || null,
      metadata: result.metadata || null,
      parties: Array.isArray(result.parties) ? result.parties : [],
      movements: Array.isArray(result.movements) ? result.movements : [],
      documents: Array.isArray(result.documents) ? result.documents : [],
      provenance: result.provenance || null
    }, accessKey);
  }
  return null;
}

export class AccessKeyEnrichmentStrategy {
  constructor({ credentialManager, sessionObserver, publicSearchClient, options = {} } = {}) {
    this.credentialManager = credentialManager;
    this.sessionObserver = sessionObserver;
    this.publicSearchClient = publicSearchClient || null;
    this.options = options;
    this.publicSearchEnabled = options.publicSearchEnabled !== false;
  }

  get shouldUsePublicSearch() {
    return Boolean(this.publicSearchClient) && this.publicSearchEnabled === true;
  }

  /**
   * Enriches a process with case details and documents via access key strategy.
   *
   * @param {Object} params
   * @param {string} params.cnj Clean or formatted CNJ
   * @param {string} params.portalId Target portal ID
   * @param {string} [params.userId] User/Workspace ID
   * @returns {Promise<Object>} Enrichment result
   */
  async enrichProcess({ cnj, portalId, userId = '' }) {
    if (!cnj) throw new Error('Número do processo (CNJ) é obrigatório.');
    const cleanCnj = String(cnj).replace(/\D/g, '');

    // Step 1: Check vault for existing key (portal/degree scoped)
    let accessKey = null;
    if (this.credentialManager && typeof this.credentialManager.getProcessAccessKey === 'function') {
      accessKey = await this.credentialManager.getProcessAccessKey(cleanCnj, userId, portalId);
    }

    // Step 2: If key is present in vault and public search is enabled, try it first.
    // HUMAN_REQUIRED / CAPTCHA_REQUIRED / UNSUPPORTED do not fail the enrichment: they
    // simply hand the work to the authenticated session without a false error.
    let degradedPublicReason = null;
    if (accessKey && this.shouldUsePublicSearch) {
      try {
        const publicResult = await this.publicSearchClient.searchByProcessKey({
          cnj: cleanCnj,
          accessKey,
          portalId
        });

        if (publicResult?.ok) {
          return {
            ok: true,
            strategy: 'VAULT_KEY_PUBLIC_SEARCH',
            keyRefreshed: false,
            portalId,
            cnj: cleanCnj,
            data: extractPublicSearchData(publicResult, accessKey)
          };
        }

        const reason = publicResult?.reason || null;
        // If public search returned key invalid/expired, fall through to single authenticated refresh
        if (reason && !DEGRADABLE_REASON_SET.has(reason) && reason !== 'KEY_INVALID' && reason !== 'KEY_EXPIRED') {
          return {
            ok: false,
            strategy: 'VAULT_KEY_PUBLIC_SEARCH',
            keyRefreshed: false,
            portalId,
            cnj: cleanCnj,
            reason,
            error: sanitizePublicSearchValue(publicResult?.error || 'Falha na consulta pública externa por chave.', accessKey)
          };
        }
        if (DEGRADABLE_REASON_SET.has(reason)) degradedPublicReason = reason;
      } catch (err) {
        // Network or fetch error in public search
        if (!err.isKeyInvalid) {
          return {
            ok: false,
            strategy: 'VAULT_KEY_PUBLIC_SEARCH',
            keyRefreshed: false,
            portalId,
            cnj: cleanCnj,
            error: sanitizePublicSearchValue(err.message, accessKey)
          };
        }
      }
    }

    // Step 3: Authenticated session extraction / refresh (single attempt)
    if (!this.sessionObserver || typeof this.sessionObserver.fetchProcessAccessKey !== 'function') {
      return {
        ok: false,
        strategy: 'AUTHENTICATED_SESSION_UNAVAILABLE',
        keyRefreshed: false,
        portalId,
        cnj: cleanCnj,
        ...(degradedPublicReason ? { publicSearchDegraded: degradedPublicReason } : {}),
        error: 'Sessão autenticada não disponível para extração da chave de acesso.'
      };
    }

    try {
      const isRefresh = Boolean(accessKey);
      const extractionResult = await this.sessionObserver.fetchProcessAccessKey({
        cnj: cleanCnj,
        portalId
      });

      if (!extractionResult.ok || !extractionResult.accessKey) {
        return {
          ok: false,
          strategy: isRefresh ? 'REFRESH_FAILED' : 'EXTRACTION_FAILED',
          keyRefreshed: false,
          portalId,
          cnj: cleanCnj,
          ...(degradedPublicReason ? { publicSearchDegraded: degradedPublicReason } : {}),
          error: extractionResult.error || 'Não foi possível extrair a chave de acesso da capa do processo.'
        };
      }

      const refreshedKey = extractionResult.accessKey;

      // Atomically update vault (scoped to portal and user)
      if (this.credentialManager && typeof this.credentialManager.saveProcessAccessKey === 'function') {
        await this.credentialManager.saveProcessAccessKey(cleanCnj, {
          accessKey: refreshedKey,
          userId,
          portalId
        });
      }

      // Re-try public search ONCE with the refreshed/extracted key
      if (this.shouldUsePublicSearch) {
        const publicRetry = await this.publicSearchClient.searchByProcessKey({
          cnj: cleanCnj,
          accessKey: refreshedKey,
          portalId
        });

        if (publicRetry?.ok) {
          return {
            ok: true,
            strategy: isRefresh ? 'REFRESHED_KEY_PUBLIC_SEARCH' : 'AUTHENTICATED_EXTRACTION_PUBLIC_SEARCH',
            keyRefreshed: isRefresh,
            portalId,
            cnj: cleanCnj,
            data: extractPublicSearchData(publicRetry, refreshedKey)
          };
        }
      }

      // If public search is not enabled or failed, return data extracted directly during session
      return {
        ok: true,
        strategy: 'SESSION_ENRICHMENT_DIRECT',
        keyRefreshed: isRefresh,
        portalId,
        cnj: cleanCnj,
        ...(degradedPublicReason ? { publicSearchDegraded: degradedPublicReason } : {}),
        data: extractionResult.caseData || null
      };
    } catch (err) {
      return {
        ok: false,
        strategy: 'AUTHENTICATED_REFRESH_ERROR',
        keyRefreshed: false,
        portalId,
        cnj: cleanCnj,
        ...(degradedPublicReason ? { publicSearchDegraded: degradedPublicReason } : {}),
        error: sanitizePublicSearchValue(err.message, accessKey)
      };
    }
  }

  /**
   * Enriches a batch of processes using AT MOST ONE authenticated session for the batch,
   * enforcing conservative rate limiting and batch budgeting to protect against burst calls on initial bootstrap.
   *
   * @param {Object} params
   * @param {Array<Object>} params.processes Processes from delta sync (NEW / UPDATED)
   * @param {string} params.portalId Target portal ID
   * @param {string} [params.userId] Workspace / User ID
   * @param {number} [params.maxPerBatch] Maximum authenticated case opens per run (default 5)
   * @param {number} [params.delayBetweenMs] Delay between case opens (default 3000ms)
   * @returns {Promise<Object>} Batch enrichment summary
   */
  async enrichProcessBatch({ processes = [], portalId, userId = '', maxPerBatch = 5, delayBetweenMs = 3000 } = {}) {
    const results = [];
    let authenticatedCount = 0;
    let vaultResolvedCount = 0;
    let unchangedSkippedCount = 0;
    const pendingNextRun = [];

    // Step A: Immediate vault check / public search resolution for all processes
    const requiresAuthenticatedExtraction = [];

    for (const proc of processes) {
      const enrichmentStatus = proc.enrichmentStatus || (proc.deltaType === 'NEW' || proc.deltaType === 'UPDATED' ? ENRICHMENT_STATUS.PENDING : ENRICHMENT_STATUS.COMPLETE);
      const isPending = enrichmentStatus === ENRICHMENT_STATUS.PENDING || enrichmentStatus === ENRICHMENT_STATUS.RETRYABLE_ERROR;

      // Processos inalterados só são ignorados se já foram enriquecidos (COMPLETE ou RESTRICTED)
      if (proc.deltaType === 'UNCHANGED' && !isPending) {
        unchangedSkippedCount++;
        continue;
      }

      const cnj = proc.cnj || proc.number;
      const cleanCnj = String(cnj).replace(/\D/g, '');

      // Check vault first
      let accessKey = null;
      if (this.credentialManager && typeof this.credentialManager.getProcessAccessKey === 'function') {
        accessKey = await this.credentialManager.getProcessAccessKey(cleanCnj, userId, portalId);
      }

      if (accessKey && this.shouldUsePublicSearch) {
        try {
          const publicRes = await this.publicSearchClient.searchByProcessKey({
            cnj: cleanCnj,
            accessKey,
            portalId
          });
          if (publicRes.ok) {
            vaultResolvedCount++;
            proc.enrichmentStatus = ENRICHMENT_STATUS.COMPLETE;
            results.push({
              cnj: cleanCnj,
              ok: true,
              strategy: 'VAULT_KEY_PUBLIC_SEARCH',
              keyRefreshed: false
            });
            continue;
          }
        } catch {
          // Public search failed, falls through to authenticated batch
        }
      }

      requiresAuthenticatedExtraction.push(proc);
    }

    // Step B: Budgeted authenticated extraction with AT MOST ONE session per batch
    const toProcess = requiresAuthenticatedExtraction.slice(0, maxPerBatch);
    const deferred = requiresAuthenticatedExtraction.slice(maxPerBatch);
    for (const d of deferred) {
      d.enrichmentStatus = ENRICHMENT_STATUS.PENDING;
      pendingNextRun.push(d.cnj || d.number);
    }

    if (toProcess.length > 0) {
      let activeSession = null;
      try {
        if (this.sessionObserver && typeof this.sessionObserver.acquireSession === 'function') {
          activeSession = await this.sessionObserver.acquireSession(portalId);
        }

        for (let i = 0; i < toProcess.length; i++) {
          const proc = toProcess[i];
          const cnj = proc.cnj || proc.number;
          const cleanCnj = String(cnj).replace(/\D/g, '');

          if (i > 0 && delayBetweenMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenMs));
          }

          const res = await this.enrichProcess({
            cnj: cleanCnj,
            portalId,
            userId,
            existingSession: activeSession
          });

          if (res.strategy !== 'VAULT_KEY_PUBLIC_SEARCH') {
            authenticatedCount++;
          }
          if (res.ok) {
            proc.enrichmentStatus = ENRICHMENT_STATUS.COMPLETE;
          } else if (res.error?.includes('segredo de justiça')) {
            proc.enrichmentStatus = ENRICHMENT_STATUS.RESTRICTED;
          } else {
            proc.enrichmentStatus = ENRICHMENT_STATUS.RETRYABLE_ERROR;
          }
          results.push(res);
        }
      } finally {
        if (activeSession && typeof activeSession.close === 'function') {
          await activeSession.close().catch(() => {});
        }
      }
    }

    return {
      portalId,
      totalCandidateProcesses: processes.length,
      unchangedSkipped: unchangedSkippedCount,
      vaultResolvedWithoutSession: vaultResolvedCount,
      authenticatedCaseOpens: authenticatedCount,
      maxBatchLimit: maxPerBatch,
      pendingDeferredForNextRuns: pendingNextRun.length,
      pendingProcessNumbers: pendingNextRun,
      results
    };
  }
}
