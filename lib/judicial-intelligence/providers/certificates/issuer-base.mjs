import { JudicialIntelligenceError, JI_ERROR_CODES } from '../../core/errors.mjs';
import { createProvenance, SOURCE_IDS, PROVENANCE_KINDS } from '../../core/provenance.mjs';
import { cleanCnj } from '../../../judicial/omni/contracts.mjs';

export const CERTIFICATE_STATUS = Object.freeze({
  REQUESTED: 'REQUESTED',
  PROCESSING: 'PROCESSING',
  ISSUED: 'ISSUED',
  FAILED: 'FAILED',
  HUMAN_REQUIRED: 'HUMAN_REQUIRED',
  EXPIRED: 'EXPIRED'
});

export const SUBJECT_TYPES = Object.freeze({
  CPF: 'CPF',
  CNPJ: 'CNPJ',
  PROCESS: 'PROCESS',
  OTHER: 'OTHER'
});

const SUBJECT_DIGITS = Object.freeze({ CPF: 11, CNPJ: 14, PROCESS: 20 });

export function normalizeSubject(subjectType, subjectId) {
  const type = String(subjectType || '').toUpperCase();
  if (!Object.values(SUBJECT_TYPES).includes(type)) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, `Tipo de titular desconhecido: ${subjectType}`);
  }
  const digits = cleanCnj(subjectId);
  const expected = SUBJECT_DIGITS[type];
  if (expected && digits.length !== expected) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT,
      `${type} deve conter ${expected} dígitos para consulta de certidão.`);
  }
  if (!expected && digits.length === 0) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, 'Titular da certidão sem identificador válido.');
  }
  return { subjectType: type, subjectId: digits };
}

export function maskSubject(subjectId) {
  const text = String(subjectId ?? '');
  if (text.length <= 4) return '[mascarado]';
  return `${'*'.repeat(Math.max(0, text.length - 4))}${text.slice(-4)}`;
}

export function subjectLookup(issuerId, subjectType, subjectId) {
  return `${issuerId}:${subjectType}:${subjectId}`;
}

export function createCertificateIssuer({
  id,
  label = id,
  issuerLabel,
  subjectTypes = [SUBJECT_TYPES.CPF, SUBJECT_TYPES.CNPJ],
  maturity = 'experimental',
  requestCertificate,
  checkStatus,
  downloadCertificate,
  describeReadiness = null,
  notes = null
} = {}) {
  if (!/^[a-z][a-z0-9-]{2,47}$/.test(String(id || ''))) {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, `Id de emissor inválido: ${id}`);
  }
  if (typeof requestCertificate !== 'function' || typeof checkStatus !== 'function' || typeof downloadCertificate !== 'function') {
    throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT,
      `Emissor ${id} deve implementar requestCertificate, checkStatus e downloadCertificate.`);
  }
  const normalizedTypes = [...new Set(subjectTypes.map(type => String(type).toUpperCase()))];
  for (const type of normalizedTypes) {
    if (!Object.values(SUBJECT_TYPES).includes(type)) {
      throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, `Tipo de titular inválido em ${id}: ${type}`);
    }
  }
  return Object.freeze({
    id,
    label,
    issuerLabel: issuerLabel ?? label,
    subjectTypes: normalizedTypes,
    maturity,
    notes,
    accepts: type => normalizedTypes.includes(String(type).toUpperCase()),
    requestCertificate: async (subject, options) => {
      const normalized = normalizeSubject(subject?.subjectType, subject?.subjectId);
      if (!normalizedTypes.includes(normalized.subjectType)) {
        throw new JudicialIntelligenceError(JI_ERROR_CODES.CAPABILITY_UNSUPPORTED,
          `Emissor ${id} não atende ${normalized.subjectType}.`, { provider: id });
      }
      return requestCertificate({ ...subject, ...normalized }, options);
    },
    checkStatus: async (requestId, options) => {
      if (!requestId) throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, 'requestId obrigatório.');
      return checkStatus(requestId, options);
    },
    downloadCertificate: async (requestId, options) => {
      if (!requestId) throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, 'requestId obrigatório.');
      return downloadCertificate(requestId, options);
    },
    describeReadiness: describeReadiness ?? (async () => ({ ready: true, humanAction: null }))
  });
}

export function certificateRequestRecord({
  requestId,
  issuer,
  subjectType,
  subjectId,
  requestedAt = new Date().toISOString(),
  status = CERTIFICATE_STATUS.REQUESTED,
  humanAction = null,
  validUntil = null
} = {}) {
  return {
    requestId,
    issuer,
    subjectType,
    subjectId,
    subjectMasked: maskSubject(subjectId),
    requestedAt,
    status,
    humanAction,
    validUntil,
    provenance: createProvenance({
      source: SOURCE_IDS.CERTIFICATE_PORTAL,
      sourcePortal: issuer,
      kind: PROVENANCE_KINDS.CERTIFICATE,
      queryKind: 'certificate-request',
      confidence: 0.9,
      payload: requestId
    })
  };
}

export function certificateArtifactRecord({
  requestId,
  issuer,
  bytes,
  sha256,
  mimeType = 'application/pdf',
  issuedAt = new Date().toISOString(),
  validUntil = null,
  status = CERTIFICATE_STATUS.ISSUED
} = {}) {
  return {
    requestId,
    issuer,
    issuedAt,
    validUntil,
    status,
    mimeType,
    size: bytes?.length ?? 0,
    sha256,
    contentBase64: bytes ? Buffer.from(bytes).toString('base64') : null,
    provenance: createProvenance({
      source: SOURCE_IDS.CERTIFICATE_PORTAL,
      sourcePortal: issuer,
      kind: PROVENANCE_KINDS.CERTIFICATE,
      queryKind: 'certificate-artifact',
      confidence: 0.9,
      payload: sha256
    })
  };
}
