export {
  PJE_CREDENTIAL_SCOPE,
  PJE_LAYOUT_FAMILIES,
  PJE_RUNTIME_VALUES,
  PJE_DEFAULT_RUNTIME,
  PJE_RUNTIME_FALLBACKS,
  PJE_VERIFICATION_DIMENSIONS,
  PJE_DEFAULT_TRUSTED_AUTH_ORIGINS,
  PJE_PORTALS,
  CANONICAL_PJE_PORTAL_IDS,
  normalizePjePortalId,
  getPjePortalById,
  isPjePortalId,
  isPjeCredentialPortalId,
  getPjeCredentialScope,
  listPjePortals,
  resolvePjeCollector,
  resolvePjeRuntime,
  buildPjeClientCertificateOrigins,
  getAllowedPjeOrigins
} from './portal-registry.mjs';

export {
  PjeReadOnlyViolationError,
  PJE_MUTATION_TOKENS,
  PJE_READ_ONLY_TOKENS,
  normalizePjeActionText,
  findPjeMutationTokens,
  findPjeReadOnlyTokens,
  sanitizePjeUrlForTelemetry,
  assertTrustedPjeTarget,
  classifyPjeRequest,
  assertSafePjeControl,
  installPjeReadOnlyGuard
} from './safety.mjs';

export { PjeVerificationStore, sanitizePjeEvidence } from './verification-store.mjs';

export {
  PjeRuntimeUnavailableError,
  openPjeBrowserSession,
  listPjeRuntimeHosts,
  isPjeSidecarChannelAvailable
} from './runtime/index.mjs';

export {
  PjeAuthError,
  authenticatePjeSession,
  detectPjeAuthState,
  isPjePanelVisible,
  probePjeOfficeHelper,
  runPjeOfficeSsoTask,
  parsePjeHelperImage,
  tryPjeLoginEntry
} from './auth/pdpj-auth.mjs';
