import { JudicialIntelligenceError, JI_ERROR_CODES } from '../../core/errors.mjs';
import { assertBetaFlagEnabled } from '../../beta/feature-flags.mjs';
import { assertAutomationsEnabled } from '../../beta/automation-guard.mjs';
import {
  CERTIFICATE_STATUS,
  certificateArtifactRecord,
  certificateRequestRecord,
  normalizeSubject,
  subjectLookup
} from './issuer-base.mjs';

export const DD_KINDS = Object.freeze({
  REQUEST: 'certificate_request',
  ARTIFACT: 'certificate_artifact'
});

export const DD_STATUS = Object.freeze({
  PENDING: 'PENDING',
  COMPLETE: 'COMPLETE',
  PARTIAL: 'PARTIAL',
  HUMAN_REQUIRED: 'HUMAN_REQUIRED',
  FAILED: 'FAILED'
});

export function createDueDiligenceCase({
  caseId = `dd-${Date.now()}`,
  clientRef = null,
  subject = {},
  issuerIds = [],
  createdAt = new Date().toISOString()
} = {}) {
  const normalized = normalizeSubject(subject.subjectType, subject.subjectId);
  if (!Array.isArray(issuerIds) || issuerIds.length === 0) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, 'Due diligence exige ao menos um emissor.');
  }
  return {
    caseId,
    clientRef,
    subjectType: normalized.subjectType,
    subjectId: normalized.subjectId,
    issuerIds: [...issuerIds],
    createdAt,
    status: DD_STATUS.PENDING
  };
}

export async function runDueDiligenceCase({ ddCase, registry, store = null, requestOptions = {}, env = process.env } = {}) {
  // Defesa em profundidade: o executor direto recusa execução com a flag desligada,
  // sem depender de quem o chamou.
  assertBetaFlagEnabled('BETA_DUE_DILIGENCE', env);
  assertAutomationsEnabled(env, { operation: 'certificate-batch', provider: 'certificates' });
  if (!registry?.get) throw new TypeError('Registry de certidões obrigatório para due diligence.');
  if (!ddCase?.caseId) throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, 'Caso de due diligence inválido.');

  const requests = [];
  const artifacts = [];

  for (const issuerId of ddCase.issuerIds) {
    const issuer = registry.get(issuerId);
    if (!issuer.accepts(ddCase.subjectType)) {
      requests.push({
        requestId: null,
        issuer: issuerId,
        status: 'UNSUPPORTED',
        humanAction: `Emissor ${issuerId} não atende ${ddCase.subjectType}.`
      });
      continue;
    }

    let request;
    try {
      const created = await issuer.requestCertificate({
        subjectType: ddCase.subjectType,
        subjectId: ddCase.subjectId
      }, requestOptions);
      request = certificateRequestRecord({
        requestId: created.requestId ?? `${issuerId}:${ddCase.caseId}`,
        issuer: issuerId,
        subjectType: ddCase.subjectType,
        subjectId: ddCase.subjectId,
        status: created.status,
        humanAction: created.humanAction ?? null,
        validUntil: created.validUntil ?? null
      });

      if (created.status === CERTIFICATE_STATUS.PROCESSING || created.status === CERTIFICATE_STATUS.REQUESTED) {
        const status = await issuer.checkStatus(request.requestId, requestOptions);
        request = { ...request, status: status.status, validUntil: status.validUntil ?? request.validUntil };
      }

      if (request.status === CERTIFICATE_STATUS.ISSUED) {
        const artifact = await issuer.downloadCertificate(request.requestId, requestOptions);
        const record = certificateArtifactRecord({
          requestId: request.requestId,
          issuer: issuerId,
          bytes: artifact.bytes,
          sha256: artifact.sha256,
          mimeType: artifact.mimeType,
          issuedAt: artifact.issuedAt,
          validUntil: artifact.validUntil ?? request.validUntil,
          status: CERTIFICATE_STATUS.ISSUED
        });
        artifacts.push(record);
        if (store) store.put(DD_KINDS.ARTIFACT, `${issuerId}:${request.requestId}`, record,
          { lookup: subjectLookup(issuerId, ddCase.subjectType, ddCase.subjectId) });
      }
    } catch (error) {
      request = certificateRequestRecord({
        requestId: `${issuerId}:${ddCase.caseId}`,
        issuer: issuerId,
        subjectType: ddCase.subjectType,
        subjectId: ddCase.subjectId,
        status: CERTIFICATE_STATUS.FAILED,
        humanAction: error?.humanAction ?? null
      });
      request.errorClass = error?.code ?? 'INTERNAL';
    }

    requests.push(request);
    if (store) {
      store.put(DD_KINDS.REQUEST, `${issuerId}:${request.requestId}`, request,
        { lookup: subjectLookup(issuerId, ddCase.subjectType, ddCase.subjectId) });
    }
  }

  const summary = {
    total: requests.length,
    issued: requests.filter(request => request.status === CERTIFICATE_STATUS.ISSUED).length,
    humanRequired: requests.filter(request => request.status === CERTIFICATE_STATUS.HUMAN_REQUIRED).length,
    failed: requests.filter(request => request.status === CERTIFICATE_STATUS.FAILED).length,
    unsupported: requests.filter(request => request.status === 'UNSUPPORTED').length
  };

  let status = DD_STATUS.PARTIAL;
  if (summary.issued === summary.total) status = DD_STATUS.COMPLETE;
  else if (summary.failed === summary.total) status = DD_STATUS.FAILED;
  else if (summary.humanRequired > 0 && summary.issued === 0 && summary.failed === 0) status = DD_STATUS.HUMAN_REQUIRED;

  const completed = {
    ...ddCase,
    status,
    completedAt: new Date().toISOString(),
    summary,
    subjectMasked: requests[0]?.subjectMasked ?? null
  };
  if (store) store.put('due_diligence_case', ddCase.caseId, completed, { lookup: `case:${ddCase.caseId}` });
  return { case: completed, requests, artifacts };
}

export function listCaseArtifacts(store, ddCase) {
  const lookup = subjectLookup(ddCase.issuerIds[0] ?? 'unknown', ddCase.subjectType, ddCase.subjectId);
  return store.list(DD_KINDS.ARTIFACT, { lookup, limit: 50 });
}
