/**
 * ATRIUM — Eproc public search client (access key)
 *
 * Consulta pública por chave de acesso da família eproc, em modo leitura.
 * O usuário informa chave/senha de consulta e o sistema lê a resposta oficial
 * do portal. A chave vive apenas em memória nesta chamada e nunca é retornada,
 * persistida, logada ou incluída em telemetria.
 *
 * Contrato: specs/eproc-public-key.md.
 * Integração prevista: AccessKeyEnrichmentStrategy
 * (`publicSearchClient.searchByProcessKey({ cnj, accessKey, portalId })`).
 */

import { getEprocPortalById } from '../portal-registry.mjs';
import { redactEprocSecrets } from '../key-redaction.mjs';
import {
  assertReadOnlyJudicialOperation,
  normalizeCnjNumber,
  sanitizeJudicialError
} from '../../managed-connectivity.mjs';
import { isValidCnj } from '../../omni/contracts.mjs';
import { createDirectHttpTransport, redactSecretsInText, EprocTransportError } from './http-transport.mjs';
import { buildEprocPublicKeyFormRequest, buildEprocPublicKeySearchRequest, detectEprocCaptcha, interpretEprocKeySearchResponse, parseEprocPublicKeyForm } from './key-search-parser.mjs';

export const PUBLIC_SEARCH_SOURCE = 'EPROC_PUBLIC_KEY';

export const PUBLIC_SEARCH_FAILURE_REASONS = Object.freeze([
  'KEY_INVALID',
  'KEY_EXPIRED',
  'NOT_FOUND',
  'PORTAL_UNAVAILABLE',
  'RATE_LIMITED',
  'PARSE_ERROR',
  'HUMAN_REQUIRED',
  'CAPTCHA_REQUIRED',
  'AUTH_REQUIRED',
  'UNSUPPORTED',
  'DOCUMENT_RESTRICTED'
]);

const TRANSPORT_REASON_BY_CODE = Object.freeze({
  TIMEOUT: 'PORTAL_UNAVAILABLE',
  NETWORK_ERROR: 'PORTAL_UNAVAILABLE',
  RESPONSE_TOO_LARGE: 'PORTAL_UNAVAILABLE',
  TRANSPORT_ERROR: 'PORTAL_UNAVAILABLE',
  INVALID_URL: 'UNSUPPORTED',
  INSECURE_TRANSPORT: 'UNSUPPORTED',
  HOST_NOT_ALLOWED: 'UNSUPPORTED',
  REDIRECT_BLOCKED: 'UNSUPPORTED',
  REDIRECT_INVALID: 'UNSUPPORTED',
  TOO_MANY_REDIRECTS: 'UNSUPPORTED'
});

function createPortalResolver(registry) {
  if (!registry) return portalId => getEprocPortalById(portalId);
  if (typeof registry === 'function') return registry;
  if (typeof registry.getPortalById === 'function') return registry.getPortalById.bind(registry);
  if (typeof registry.getPortal === 'function') return registry.getPortal.bind(registry);
  if (Array.isArray(registry)) return portalId => registry.find(portal => portal?.id === portalId) || null;
  return () => null;
}

function createSafeLogger(logger) {
  if (!logger) return () => {};
  return (level, message) => {
    try {
      if (typeof logger === 'function') logger(level, message);
      else if (typeof logger[level] === 'function') logger[level](message);
    } catch {
      // Logging nunca pode interromper nem vazar segredo.
    }
  };
}

function toIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function buildPortalAllowlist(portal) {
  try {
    return [new URL(portal.baseUrl).hostname];
  } catch {
    return [];
  }
}

/**
 * Cria o cliente de consulta pública por chave do eproc.
 *
 * @param {Object} [options]
 * @param {Object} [options.transport] transporte HTTP injetável (padrão: HTTP direto)
 * @param {Object|Function|Array} [options.registry] resolvedor de portais
 * @param {Object} [options.logger] logger sanitizado (padrão silencioso)
 * @param {Function} [options.now] relógio injetável para `collectedAt`
 */
export function createEprocPublicSearchClient({ transport, registry, logger, now } = {}) {
  assertReadOnlyJudicialOperation('fetchCaseDetails');
  const resolvePortal = createPortalResolver(registry);
  const log = createSafeLogger(logger);
  const clock = typeof now === 'function' ? now : () => new Date();

  return Object.freeze({
    async searchByProcessKey({ cnj, accessKey, portalId } = {}) {
      const sanitize = (value, secrets = []) => sanitizeJudicialError(redactSecretsInText(value, secrets));

      const fail = (reason, message, { secretValues = [], portal = '', digits = '', errorCode = '', extra = null } = {}) => {
        const error = sanitize(message, secretValues);
        log('warn', `[eproc-public-search] ${reason}${errorCode ? ` (${errorCode})` : ''}: ${error}`);
        return {
          ok: false,
          reason,
          error,
          ...(portal ? { portalId: portal } : {}),
          ...(digits ? { cnj: digits } : {}),
          ...(errorCode ? { errorCode } : {}),
          ...(extra && typeof extra === 'object' ? extra : {})
        };
      };

      const cleanCnj = normalizeCnjNumber(cnj);
      if (!cleanCnj || !isValidCnj(cleanCnj)) {
        return fail('UNSUPPORTED', 'Número de processo (CNJ) inválido para consulta pública.', { errorCode: 'INVALID_CNJ' });
      }

      const portal = resolvePortal(portalId);
      if (!portal) {
        return fail('UNSUPPORTED', 'Portal eproc desconhecido ou não registrado para consulta pública.', { cnj: cleanCnj, errorCode: 'UNKNOWN_PORTAL' });
      }
      if (!portal.publicSearchPath) {
        return fail('UNSUPPORTED', 'Portal eproc sem caminho de consulta pública declarado.', { portal: portal.id, cnj: cleanCnj, errorCode: 'NO_PUBLIC_SEARCH_PATH' });
      }

      const secret = typeof accessKey === 'string' ? accessKey.trim() : '';
      if (!secret) {
        return fail('AUTH_REQUIRED', 'Chave de acesso não informada para a consulta pública.', { portal: portal.id, cnj: cleanCnj, errorCode: 'MISSING_ACCESS_KEY' });
      }

      const formRequest = buildEprocPublicKeyFormRequest({ portal });
      if (!formRequest) {
        return fail('UNSUPPORTED', 'Não foi possível montar a consulta pública por chave para este portal.', { portal: portal.id, cnj: cleanCnj, errorCode: 'INVALID_FORM_REQUEST' });
      }

      const activeTransport = transport || createDirectHttpTransport({ allowlist: buildPortalAllowlist(portal) });
      const interactiveCaptcha = activeTransport?.capabilities?.interactiveCaptcha === true;
      const secretValues = [secret];

      let formResponse;
      try {
        formResponse = await activeTransport.request({ ...formRequest, secrets: secretValues });
      } catch (transportError) {
        const transportCode = transportError instanceof EprocTransportError
          ? transportError.code
          : String(transportError?.code || '');
        const reason = TRANSPORT_REASON_BY_CODE[transportCode] || 'PORTAL_UNAVAILABLE';
        return fail(reason, transportError?.message || 'Falha de transporte na consulta pública.', {
          secretValues,
          portal: portal.id,
          cnj: cleanCnj,
          errorCode: transportCode || 'TRANSPORT_ERROR'
        });
      }

      const captcha = detectEprocCaptcha(formResponse?.body);
      if (captcha && !interactiveCaptcha) {
        return fail('CAPTCHA_REQUIRED', 'O portal exige verificação por CAPTCHA; a consulta automática não prossegue sem intervenção humana.', {
          secretValues,
          portal: portal.id,
          cnj: cleanCnj,
          errorCode: 'CAPTCHA_REQUIRED',
          extra: { captchaType: captcha.type }
        });
      }

      const form = parseEprocPublicKeyForm(formResponse?.body, portal.baseUrl);
      let sourceResponse = formResponse;
      if (form) {
        const request = buildEprocPublicKeySearchRequest({ form, cnj: cleanCnj, accessKey: secret });
        if (!request) {
          return fail('UNSUPPORTED', 'Não foi possível montar a requisição de consulta pública para este portal.', { secretValues, portal: portal.id, cnj: cleanCnj, errorCode: 'INVALID_SEARCH_REQUEST' });
        }
        try {
          sourceResponse = await activeTransport.request({
            ...request,
            headers: { referer: formRequest.url },
            secrets: secretValues
          });
        } catch (transportError) {
          const transportCode = transportError instanceof EprocTransportError
            ? transportError.code
            : String(transportError?.code || '');
          const reason = TRANSPORT_REASON_BY_CODE[transportCode] || 'PORTAL_UNAVAILABLE';
          return fail(reason, transportError?.message || 'Falha de transporte na consulta pública.', {
            secretValues,
            portal: portal.id,
            cnj: cleanCnj,
            errorCode: transportCode || 'TRANSPORT_ERROR'
          });
        }
      }

      let interpretation;
      try {
        interpretation = interpretEprocKeySearchResponse({
          html: sourceResponse?.body,
          requestedCnj: cleanCnj,
          portalId: portal.id,
          status: sourceResponse?.status
        });
      } catch (parseError) {
        return fail('PARSE_ERROR', parseError?.message || 'Falha ao interpretar a resposta da consulta pública.', {
          secretValues,
          portal: portal.id,
          cnj: cleanCnj,
          errorCode: 'INTERPRETATION_FAILED'
        });
      }

      if (!interpretation?.ok) {
        return fail(interpretation?.reason || 'PARSE_ERROR', interpretation?.error || 'Consulta pública não confirmada.', {
          secretValues,
          portal: portal.id,
          cnj: cleanCnj
        });
      }

      const safeMetadata = redactEprocSecrets(interpretation.metadata || {});
      const finalUrl = redactSecretsInText(sourceResponse?.finalUrl || formRequest.url, secretValues);

      log('info', `[eproc-public-search] consulta pública confirmada para o portal ${portal.id} (${interpretation.cnj}).`);

      return {
        ok: true,
        portalId: portal.id,
        cnj: interpretation.cnj,
        source: PUBLIC_SEARCH_SOURCE,
        collectedAt: toIsoDate(clock()),
        metadata: safeMetadata,
        parties: interpretation.parties || [],
        movements: interpretation.movements || [],
        documents: interpretation.documents || [],
        provenance: {
          portalId: portal.id,
          court: portal.court,
          level: portal.level,
          baseUrl: portal.baseUrl,
          publicSearchPath: portal.publicSearchPath,
          transport: activeTransport?.id || 'direct-http',
          assisted: interactiveCaptcha,
          finalUrl,
          redirects: Number(sourceResponse?.hops || 0),
          validation: {
            cnjMatched: true,
            coverRecognized: Boolean(interpretation.structure?.coverRecognized),
            eventsRecognized: Boolean(interpretation.structure?.eventsRecognized),
            partyCount: Number(interpretation.structure?.partyCount || 0),
            movementCount: Number(interpretation.structure?.movementCount || 0),
            documentCount: Number(interpretation.structure?.documentCount || 0)
          }
        }
      };
    }
  });
}
