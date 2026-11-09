import { disabledError } from '../core/errors.mjs';

export const BETA_FLAGS = Object.freeze({
  BETA_PDPJ_PROVIDER: Object.freeze({
    id: 'BETA_PDPJ_PROVIDER',
    label: 'PDPJ Provider',
    description: 'Consulta read-only ao PDPJ com token humano efêmero.',
    surface: 'provider',
    defaultEnabled: false
  }),
  BETA_DOCUMENT_ACQUISITION: Object.freeze({
    id: 'BETA_DOCUMENT_ACQUISITION',
    label: 'Aquisição de Autos',
    description: 'Download resiliente de autos com manifesto, checksum e retomada.',
    surface: 'provider',
    defaultEnabled: false
  }),
  BETA_PROCESS_INTELLIGENCE: Object.freeze({
    id: 'BETA_PROCESS_INTELLIGENCE',
    label: 'Process Intelligence',
    description: 'TPU, classificação de movimentos, estado oficial e merge de fontes.',
    surface: 'module',
    defaultEnabled: false
  }),
  BETA_DUE_DILIGENCE: Object.freeze({
    id: 'BETA_DUE_DILIGENCE',
    label: 'Due Diligence',
    description: 'Registry de certidões, pedidos e artefatos supervisionados.',
    surface: 'module',
    defaultEnabled: false
  }),
  BETA_PRIVACY_AUDIT: Object.freeze({
    id: 'BETA_PRIVACY_AUDIT',
    label: 'Privacy Audit',
    description: 'Linter interno de privacidade/LGPD e isolamento de workspace.',
    surface: 'tooling',
    defaultEnabled: false
  }),
  BETA_LEGAL_RAG: Object.freeze({
    id: 'BETA_LEGAL_RAG',
    label: 'Legal RAG',
    description: 'Indexação e recuperação com citação verificável e abstenção.',
    surface: 'module',
    defaultEnabled: false
  })
});

export const BETA_FLAG_IDS = Object.freeze(Object.keys(BETA_FLAGS));

const TRUTHY = new Set(['1', 'true', 'yes', 'on', 'enabled']);
const FALSY = new Set(['', '0', 'false', 'no', 'off', 'disabled']);

export function parseFlagValue(raw, fallback = false) {
  if (raw === undefined || raw === null) return fallback === true;
  const normalized = String(raw).trim().toLowerCase();
  if (TRUTHY.has(normalized)) return true;
  if (FALSY.has(normalized)) return false;
  return fallback === true;
}

export function isBetaFlagEnabled(flagId, env = process.env) {
  const definition = BETA_FLAGS[flagId];
  if (!definition) {
    throw new TypeError(`Flag beta desconhecida: ${flagId}`);
  }
  return parseFlagValue(env?.[flagId], definition.defaultEnabled);
}

export function assertBetaFlagEnabled(flagId, env = process.env) {
  if (!isBetaFlagEnabled(flagId, env)) {
    throw disabledError(BETA_FLAGS[flagId].surface, 'feature-flag', flagId);
  }
  return true;
}

export function readBetaFlags(env = process.env) {
  return BETA_FLAG_IDS.map(flagId => {
    const definition = BETA_FLAGS[flagId];
    const raw = env?.[flagId];
    return {
      id: flagId,
      label: definition.label,
      surface: definition.surface,
      defaultEnabled: definition.defaultEnabled,
      enabled: parseFlagValue(raw, definition.defaultEnabled),
      source: raw === undefined || raw === null || String(raw).trim() === '' ? 'default' : 'environment'
    };
  });
}

export function betaFlagsEnvironmentSummary(env = process.env) {
  const flags = readBetaFlags(env);
  return {
    total: flags.length,
    enabled: flags.filter(flag => flag.enabled).map(flag => flag.id),
    disabled: flags.filter(flag => !flag.enabled).map(flag => flag.id)
  };
}
