import { JudicialIntelligenceError, JI_ERROR_CODES } from '../../core/errors.mjs';
import { SUBJECT_TYPES } from './issuer-base.mjs';

export class CertificateRegistry {
  #issuers = new Map();

  register(issuer) {
    if (!issuer?.id || typeof issuer.requestCertificate !== 'function') {
      throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, 'Emissor de certidão inválido.');
    }
    if (this.#issuers.has(issuer.id)) {
      throw new JudicialIntelligenceError(JI_ERROR_CODES.CONFLICT, `Emissor já registrado: ${issuer.id}`);
    }
    this.#issuers.set(issuer.id, issuer);
    return issuer;
  }

  get(id) {
    const issuer = this.#issuers.get(id);
    if (!issuer) {
      throw new JudicialIntelligenceError(JI_ERROR_CODES.NOT_FOUND, `Emissor de certidão não registrado: ${id}`);
    }
    return issuer;
  }

  has(id) {
    return this.#issuers.has(id);
  }

  ids() {
    return [...this.#issuers.keys()];
  }

  list() {
    return [...this.#issuers.values()].map(issuer => ({
      id: issuer.id,
      label: issuer.label,
      issuerLabel: issuer.issuerLabel,
      subjectTypes: issuer.subjectTypes,
      maturity: issuer.maturity
    }));
  }

  bySubjectType(type) {
    const normalized = String(type || '').toUpperCase();
    return [...this.#issuers.values()].filter(issuer => issuer.accepts(normalized));
  }

  async readiness() {
    const entries = await Promise.all([...this.#issuers.values()].map(async issuer => {
      const state = await issuer.describeReadiness().catch(() => ({
        ready: false,
        humanAction: 'Falha ao verificar prontidão.',
        verificationState: 'UNAVAILABLE'
      }));
      return [issuer.id, {
        ready: state.ready === true,
        humanAction: state.humanAction ?? null,
        maturity: issuer.maturity,
        verificationState: state.verificationState ?? (state.ready === true ? 'UNVERIFIED' : 'HUMAN_REQUIRED')
      }];
    }));
    return Object.fromEntries(entries);
  }
}

export const DEFAULT_CERTIFICATE_SUBJECT_TYPES = SUBJECT_TYPES;
