import { assertBetaFlagEnabled } from '../../beta/feature-flags.mjs';
import { assertAutomationsEnabled } from '../../beta/automation-guard.mjs';
import { CertificateRegistry } from './registry.mjs';
import { createCndFederalIssuer } from './federal.mjs';
import { createCndtIssuer } from './labor.mjs';
import { createTjrsDistribuicaoIssuer } from './state.mjs';

export { CERTIFICATE_STATUS, SUBJECT_TYPES, normalizeSubject, maskSubject, createCertificateIssuer, certificateRequestRecord, certificateArtifactRecord } from './issuer-base.mjs';
export { CertificateRegistry } from './registry.mjs';
export { createCndFederalIssuer, CND_FEDERAL_PORTAL, CND_FEDERAL_BASE_URL } from './federal.mjs';
export { createCndtIssuer, CNDT_PORTAL } from './labor.mjs';
export { createStateCertificateIssuer, createTjrsDistribuicaoIssuer, TJRS_DISTRIBUICAO_PORTAL } from './state.mjs';
export { createDueDiligenceCase, runDueDiligenceCase, DD_STATUS, DD_KINDS, listCaseArtifacts } from './due-diligence.mjs';

export const DEFAULT_CERTIFICATE_ISSUER_IDS = Object.freeze(['cnd-federal', 'cndt', 'tjrs-distribuicao']);

export function createDefaultCertificateRegistry({
  env = process.env,
  federalTransport = null,
  cndtDriver = null,
  stateDriver = null,
  federalCredentials = null
} = {}) {
  const registry = new CertificateRegistry();
  registry.register(createCndFederalIssuer({ transport: federalTransport, credentials: federalCredentials, env }));
  registry.register(createCndtIssuer({ driver: cndtDriver }));
  registry.register(createTjrsDistribuicaoIssuer({ driver: stateDriver }));
  return registry;
}

export function createDueDiligenceService({
  env = process.env,
  registry = null,
  store = null,
  allowDisabled = false
} = {}) {
  if (!allowDisabled) assertBetaFlagEnabled('BETA_DUE_DILIGENCE', env);
  assertAutomationsEnabled(env, { operation: 'certificate-batch', provider: 'certificates' });
  const resolvedRegistry = registry ?? createDefaultCertificateRegistry({ env });
  return {
    registry: resolvedRegistry,
    list: () => resolvedRegistry.list(),
    readiness: () => resolvedRegistry.readiness(),
    createCase: options => import('./due-diligence.mjs').then(module => module.createDueDiligenceCase(options)),
    run: ddCase => import('./due-diligence.mjs').then(module => module.runDueDiligenceCase({ ddCase, registry: resolvedRegistry, store, env }))
  };
}
