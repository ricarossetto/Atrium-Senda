import { createCertificateIssuer, CERTIFICATE_STATUS, SUBJECT_TYPES } from './issuer-base.mjs';
import { JudicialIntelligenceError, JI_ERROR_CODES, humanRequiredError } from '../../core/errors.mjs';
import { HttpTransport } from '../../core/http.mjs';
import { sha256Hex } from '../../document-intelligence/checksum.mjs';

export const CND_FEDERAL_BASE_URL = 'https://gateway.apiserpro.serpro.gov.br/consultas-gerais/v1';
export const CND_FEDERAL_PORTAL = 'https://servicos.receita.fazenda.gov.br/servicos/certidaointernet/';

export function resolveFederalCredentials({ credentials = null, env = process.env } = {}) {
  const apiKey = credentials?.apiKey || env?.CERTIDAO_FEDERAL_API_KEY || null;
  return apiKey ? { apiKey: String(apiKey) } : null;
}

export function createCndFederalIssuer({
  transport = null,
  credentials = null,
  env = process.env,
  baseUrl = CND_FEDERAL_BASE_URL
} = {}) {
  const resolved = resolveFederalCredentials({ credentials, env });
  // Provider autenticado por chave institucional: HTTPS é obrigatório no transporte padrão.
  const resolvedTransport = transport ?? new HttpTransport({ requireHttps: true });
  const humanAction = resolved
    ? null
    : `CND Federal exige credencial institucional (SERPRO/Receita) ou emissão manual em ${CND_FEDERAL_PORTAL}. O beta não automatiza CAPTCHA nem login com certificado.`;

  return createCertificateIssuer({
    id: 'cnd-federal',
    label: 'CND Federal (Receita/PGFN)',
    issuerLabel: 'Receita Federal / PGFN',
    subjectTypes: [SUBJECT_TYPES.CPF, SUBJECT_TYPES.CNPJ],
    maturity: 'experimental',
    notes: 'Endpoints UNVERIFIED; requer credencial institucional. Sem credencial, retorna human_required honesto.',
    describeReadiness: async () => ({
      ready: Boolean(resolved),
      verificationState: resolved ? 'UNVERIFIED' : 'HUMAN_REQUIRED',
      humanAction
    }),
    requestCertificate: async subject => {
      if (!resolved) {
        return {
          requestId: null,
          status: CERTIFICATE_STATUS.HUMAN_REQUIRED,
          humanAction,
          validUntil: null
        };
      }
            const result = await resolvedTransport.request(`${baseUrl}/certidao`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${resolved.apiKey}` },
        body: JSON.stringify({
          tipo: 'CND',
          documento: subject.subjectId,
          tipoDocumento: subject.subjectType
        })
      });
      if (!result.ok) {
        throw new JudicialIntelligenceError(JI_ERROR_CODES.UNAVAILABLE, `CND Federal respondeu ${result.status}.`, { status: result.status });
      }
      const payload = JSON.parse(result.body.toString('utf8'));
      return {
        requestId: String(payload.protocolo ?? payload.requestId ?? ''),
        status: CERTIFICATE_STATUS.PROCESSING,
        humanAction: null,
        validUntil: payload.validade ?? null
      };
    },
    checkStatus: async requestId => {
      if (!resolved) {
        return { requestId, status: CERTIFICATE_STATUS.HUMAN_REQUIRED, humanAction, validUntil: null };
      }
      const result = await resolvedTransport.request(`${baseUrl}/certidao/${requestId}`, {
        headers: { authorization: `Bearer ${resolved.apiKey}` }
      });
      if (!result.ok) {
        throw new JudicialIntelligenceError(JI_ERROR_CODES.UNAVAILABLE, `CND Federal respondeu ${result.status}.`, { status: result.status });
      }
      const payload = JSON.parse(result.body.toString('utf8'));
      const status = String(payload.situacao ?? '').toLowerCase();
      return {
        requestId,
        status: status.includes('emit') || status.includes('conclu') ? CERTIFICATE_STATUS.ISSUED : CERTIFICATE_STATUS.PROCESSING,
        humanAction: null,
        validUntil: payload.validade ?? null
      };
    },
    downloadCertificate: async requestId => {
      if (!resolved) throw humanRequiredError('cnd-federal', 'downloadCertificate', humanAction);
      const result = await resolvedTransport.request(`${baseUrl}/certidao/${requestId}/pdf`, {
        headers: { authorization: `Bearer ${resolved.apiKey}`, accept: 'application/pdf' }
      });
      if (!result.ok) {
        throw new JudicialIntelligenceError(JI_ERROR_CODES.UNAVAILABLE, `CND Federal respondeu ${result.status}.`, { status: result.status });
      }
      return {
        bytes: result.body,
        sha256: sha256Hex(result.body),
        mimeType: result.headers?.['content-type'] ?? 'application/pdf',
        issuedAt: new Date().toISOString(),
        validUntil: null,
        status: CERTIFICATE_STATUS.ISSUED
      };
    }
  });
}
