import { createCertificateIssuer, CERTIFICATE_STATUS, SUBJECT_TYPES } from './issuer-base.mjs';
import { humanRequiredError } from '../../core/errors.mjs';
import { sha256Hex } from '../../document-intelligence/checksum.mjs';

export const CNDT_PORTAL = 'https://cndt-certidao.tst.jus.br/';
export const CNDT_DRIVER_REQUIRED =
  `CNDT exige sessão humana no portal oficial (${CNDT_PORTAL}). O beta não automatiza CAPTCHA nem certificado; ` +
  'forneça um driver supervisionado apenas para testes com fixture.';

export function createCndtIssuer({ driver = null } = {}) {
  const humanAction = driver ? null : CNDT_DRIVER_REQUIRED;

  return createCertificateIssuer({
    id: 'cndt',
    label: 'CNDT (Justiça do Trabalho)',
    issuerLabel: 'TST/TRT — Certidão Negativa de Débitos Trabalhistas',
    subjectTypes: [SUBJECT_TYPES.CPF, SUBJECT_TYPES.CNPJ],
    maturity: 'experimental',
    notes: 'Portal com etapa humana obrigatória; driver injetável existe apenas para testes determinísticos.',
    describeReadiness: async () => ({
      ready: Boolean(driver),
      verificationState: driver ? 'FIXTURE_VALIDATED' : 'HUMAN_REQUIRED',
      humanAction
    }),
    requestCertificate: async subject => {
      if (!driver) {
        return { requestId: null, status: CERTIFICATE_STATUS.HUMAN_REQUIRED, humanAction, validUntil: null };
      }
      const result = await driver.request({ subjectType: subject.subjectType, subjectId: subject.subjectId });
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
      if (!driver) throw humanRequiredError('cndt', 'downloadCertificate', humanAction);
      const result = await driver.download({ requestId });
      const bytes = Buffer.isBuffer(result.bytes) ? result.bytes : Buffer.from(result.bytes ?? '');
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
