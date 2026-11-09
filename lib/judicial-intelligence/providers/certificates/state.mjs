import { createCertificateIssuer, CERTIFICATE_STATUS, SUBJECT_TYPES } from './issuer-base.mjs';
import { JudicialIntelligenceError, JI_ERROR_CODES, humanRequiredError } from '../../core/errors.mjs';
import { sha256Hex } from '../../document-intelligence/checksum.mjs';

export const TJRS_DISTRIBUICAO_PORTAL = 'https://www.tjrs.jus.br/servicos/certidoes/';

export function createStateCertificateIssuer({
  id = 'tjrs-distribuicao',
  label = 'Certidão de Distribuição TJRS',
  issuerLabel = 'TJRS',
  uf = 'RS',
  portalUrl = TJRS_DISTRIBUICAO_PORTAL,
  subjectTypes = [SUBJECT_TYPES.CPF, SUBJECT_TYPES.CNPJ, SUBJECT_TYPES.PROCESS],
  driver = null
} = {}) {
  const humanAction = driver
    ? null
    : `Certidão estadual exige sessão humana em ${portalUrl}. O beta não contorna CAPTCHA; use o portal oficial ou configure um driver supervisionado para teste.`;

  return createCertificateIssuer({
    id,
    label,
    issuerLabel,
    subjectTypes,
    maturity: 'experimental',
    notes: 'Somente leitura; driver injetável para testes; emissão real permanece humana.',
    describeReadiness: async () => ({
      ready: Boolean(driver),
      verificationState: driver ? 'FIXTURE_VALIDATED' : 'HUMAN_REQUIRED',
      humanAction,
      uf
    }),
    requestCertificate: async subject => {
      if (!driver) {
        return { requestId: null, status: CERTIFICATE_STATUS.HUMAN_REQUIRED, humanAction, validUntil: null };
      }
      const result = await driver.request({ uf, subjectType: subject.subjectType, subjectId: subject.subjectId });
      return {
        requestId: String(result.requestId),
        status: result.status ?? CERTIFICATE_STATUS.PROCESSING,
        humanAction: null,
        validUntil: result.validUntil ?? null
      };
    },
    checkStatus: async requestId => {
      if (!driver) return { requestId, status: CERTIFICATE_STATUS.HUMAN_REQUIRED, humanAction, validUntil: null };
      const result = await driver.status({ requestId });
      return {
        requestId,
        status: result.status ?? CERTIFICATE_STATUS.PROCESSING,
        humanAction: null,
        validUntil: result.validUntil ?? null
      };
    },
    downloadCertificate: async requestId => {
      if (!driver) throw humanRequiredError(id, 'downloadCertificate', humanAction);
      const result = await driver.download({ requestId });
      if (!result?.bytes) {
        throw new JudicialIntelligenceError(JI_ERROR_CODES.PARSE_ERROR, 'Driver estadual não retornou o PDF da certidão.');
      }
      const bytes = Buffer.isBuffer(result.bytes) ? result.bytes : Buffer.from(result.bytes);
      return {
        bytes,
        sha256: sha256Hex(bytes),
        mimeType: result.mimeType ?? 'application/pdf',
        issuedAt: new Date().toISOString(),
        validUntil: result.validUntil ?? null,
        status: CERTIFICATE_STATUS.ISSUED
      };
    }
  });
}

export function createTjrsDistribuicaoIssuer({ driver = null } = {}) {
  return createStateCertificateIssuer({ driver });
}
