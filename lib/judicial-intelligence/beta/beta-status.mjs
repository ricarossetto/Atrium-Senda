import { readBetaFlags, isBetaFlagEnabled } from './feature-flags.mjs';
import { VERIFICATION_STATES, isVerificationState } from '../core/verification-state.mjs';

export const MODULE_STATUS = Object.freeze({
  OK: 'ok',
  DEGRADED: 'degraded',
  EXPERIMENTAL: 'experimental',
  UNAVAILABLE: 'unavailable',
  DISABLED: 'disabled'
});

export const BETA_MODULE_IDS = Object.freeze({
  PDPJ: 'pdpj',
  DATAJUD: 'datajud',
  MNI: 'mni',
  PROCESS_INTELLIGENCE: 'process_intelligence',
  DOCUMENTS: 'documents',
  CERTIFICATES: 'certificates',
  PRIVACY_AUDIT: 'privacy_audit',
  RAG: 'rag'
});

export const DEFAULT_BETA_MODULES = Object.freeze([
  { id: BETA_MODULE_IDS.PDPJ, label: 'PDPJ', flag: 'BETA_PDPJ_PROVIDER', maturity: MODULE_STATUS.EXPERIMENTAL, verificationState: VERIFICATION_STATES.UNVERIFIED },
  { id: BETA_MODULE_IDS.DATAJUD, label: 'DataJud', flag: 'BETA_PROCESS_INTELLIGENCE', maturity: MODULE_STATUS.EXPERIMENTAL, verificationState: VERIFICATION_STATES.UNVERIFIED },
  { id: BETA_MODULE_IDS.MNI, label: 'MNI', flag: 'BETA_PDPJ_PROVIDER', maturity: MODULE_STATUS.EXPERIMENTAL, verificationState: VERIFICATION_STATES.UNVERIFIED },
  { id: BETA_MODULE_IDS.PROCESS_INTELLIGENCE, label: 'Process Intelligence', flag: 'BETA_PROCESS_INTELLIGENCE', maturity: MODULE_STATUS.EXPERIMENTAL, verificationState: VERIFICATION_STATES.UNVERIFIED },
  { id: BETA_MODULE_IDS.DOCUMENTS, label: 'Document Acquisition', flag: 'BETA_DOCUMENT_ACQUISITION', maturity: MODULE_STATUS.EXPERIMENTAL, verificationState: VERIFICATION_STATES.UNVERIFIED },
  { id: BETA_MODULE_IDS.CERTIFICATES, label: 'Certidões', flag: 'BETA_DUE_DILIGENCE', maturity: MODULE_STATUS.EXPERIMENTAL, verificationState: VERIFICATION_STATES.UNVERIFIED },
  { id: BETA_MODULE_IDS.PRIVACY_AUDIT, label: 'Privacy Audit', flag: 'BETA_PRIVACY_AUDIT', maturity: MODULE_STATUS.EXPERIMENTAL, verificationState: VERIFICATION_STATES.UNVERIFIED },
  { id: BETA_MODULE_IDS.RAG, label: 'Legal RAG', flag: 'BETA_LEGAL_RAG', maturity: MODULE_STATUS.EXPERIMENTAL, verificationState: VERIFICATION_STATES.UNVERIFIED }
]);

export function mapProbeResult(probe) {
  if (!probe) return MODULE_STATUS.EXPERIMENTAL;
  const status = String(probe.status || '').toLowerCase();
  // human_required é etapa humana explícita, não degradação (ver specs/judicial-intelligence.md).
  if (status === 'human_required') return MODULE_STATUS.EXPERIMENTAL;
  if (status === MODULE_STATUS.OK) return MODULE_STATUS.OK;
  // `ok` só vale quando não há status explícito, para nunca mascarar um estado pior.
  if (!status && probe.ok === true) return MODULE_STATUS.OK;
  if (status === MODULE_STATUS.DEGRADED) return MODULE_STATUS.DEGRADED;
  if (status === MODULE_STATUS.UNAVAILABLE || status === 'error') return MODULE_STATUS.UNAVAILABLE;
  if (status === MODULE_STATUS.DISABLED) return MODULE_STATUS.DISABLED;
  return MODULE_STATUS.EXPERIMENTAL;
}

export class BetaStatusRegistry {
  #env;
  #modules;

  constructor({ env = process.env, modules = DEFAULT_BETA_MODULES } = {}) {
    this.#env = env;
    this.#modules = [...modules];
  }

  modules() {
    return this.#modules.map(module => ({ ...module }));
  }

  async snapshot({ probes = {} } = {}) {
    const modules = {};
    const verification = {};
    const verificationEvidence = {};
    const verificationNotes = {};
    for (const module of this.#modules) {
      if (!isBetaFlagEnabled(module.flag, this.#env)) {
        modules[module.id] = MODULE_STATUS.DISABLED;
        verification[module.id] = VERIFICATION_STATES.UNAVAILABLE;
        verificationEvidence[module.id] = 'declared';
        verificationNotes[module.id] = null;
        continue;
      }
      const probe = probes[module.id];
      const resolved = probe ? await safeProbe(probe) : null;
      modules[module.id] = resolved ? mapProbeResult(resolved) : module.maturity;
      verification[module.id] = resolved && isVerificationState(resolved.verificationState)
        ? resolved.verificationState
        : module.verificationState;
      verificationEvidence[module.id] = resolved ? 'probed' : 'declared';
      verificationNotes[module.id] = resolved?.note ?? null;
    }
    return {
      generatedAt: new Date().toISOString(),
      isolation: 'beta-namespace',
      authority: 'non-authoritative',
      modules,
      verification,
      verificationEvidence,
      verificationNotes,
      flags: readBetaFlags(this.#env)
    };
  }
}

async function safeProbe(probe) {
  try {
    return typeof probe === 'function' ? await probe() : probe;
  } catch (error) {
    return { status: 'unavailable', errorClass: error?.code ?? 'INTERNAL', verificationState: VERIFICATION_STATES.UNAVAILABLE };
  }
}
