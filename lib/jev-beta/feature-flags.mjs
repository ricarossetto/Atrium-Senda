export const JEV_BETA_FLAGS = Object.freeze({
  BETA_JEV_ENABLED: Object.freeze({
    id: 'BETA_JEV_ENABLED',
    label: 'Jev Beta habilitado',
    description: 'Permite classificação local com fixtures e redação, sem rede.',
    surface: 'tooling',
    defaultEnabled: false
  }),
  BETA_JEV_LIVE: Object.freeze({
    id: 'BETA_JEV_LIVE',
    label: 'Jev live probe',
    description: 'Permite sonda ao vivo de item único com chave efêmera do operador.',
    surface: 'provider',
    defaultEnabled: false
  }),
  BETA_JEV_AUTOMATIONS: Object.freeze({
    id: 'BETA_JEV_AUTOMATIONS',
    label: 'Jev automações em lote',
    description: 'Permite lote limitado; desligado por padrão (kill switch).',
    surface: 'provider',
    defaultEnabled: false
  })
});

export const JEV_BETA_FLAG_IDS = Object.freeze(Object.keys(JEV_BETA_FLAGS));

const TRUTHY = new Set(['1', 'true', 'yes', 'on', 'enabled']);
const FALSY = new Set(['', '0', 'false', 'no', 'off', 'disabled']);

export function parseJevFlagValue(raw, fallback = false) {
  if (raw === undefined || raw === null) return fallback === true;
  const normalized = String(raw).trim().toLowerCase();
  if (TRUTHY.has(normalized)) return true;
  if (FALSY.has(normalized)) return false;
  return fallback === true;
}

export function isJevFlagEnabled(flagId, env = process.env) {
  const definition = JEV_BETA_FLAGS[flagId];
  if (!definition) throw new TypeError(`Flag Jev beta desconhecida: ${flagId}`);
  return parseJevFlagValue(env?.[flagId], definition.defaultEnabled);
}

export function assertJevFlagEnabled(flagId, env = process.env) {
  if (!isJevFlagEnabled(flagId, env)) {
    const error = new Error(`Jev beta desligado por flag: ${flagId}`);
    error.code = 'DISABLED';
    error.details = { flagId };
    throw error;
  }
  return true;
}

export function readJevFlags(env = process.env) {
  return JEV_BETA_FLAG_IDS.map(flagId => {
    const definition = JEV_BETA_FLAGS[flagId];
    const raw = env?.[flagId];
    return {
      id: flagId,
      label: definition.label,
      surface: definition.surface,
      defaultEnabled: definition.defaultEnabled,
      enabled: parseJevFlagValue(raw, definition.defaultEnabled),
      source: raw === undefined || raw === null || String(raw).trim() === '' ? 'default' : 'environment'
    };
  });
}

export function jevAutomationPolicy(env = process.env) {
  const enabled = isJevFlagEnabled('BETA_JEV_ENABLED', env);
  const live = isJevFlagEnabled('BETA_JEV_LIVE', env);
  const batch = isJevFlagEnabled('BETA_JEV_AUTOMATIONS', env);
  return {
    enabled,
    live,
    batch,
    liveProbeAllowed: enabled && live,
    batchAllowed: enabled && live && batch
  };
}

export function assertLiveProbeAllowed(env = process.env) {
  const policy = jevAutomationPolicy(env);
  if (!policy.liveProbeAllowed) {
    const error = new Error('Sonda ao vivo não autorizada: exige BETA_JEV_ENABLED=true e BETA_JEV_LIVE=true no próprio executor.');
    error.code = 'DISABLED';
    error.details = { policy };
    throw error;
  }
  return policy;
}

export function assertBatchAllowed(env = process.env) {
  const policy = jevAutomationPolicy(env);
  if (!policy.batchAllowed) {
    const error = new Error('Lote não autorizado: exige BETA_JEV_ENABLED=true, BETA_JEV_LIVE=true e BETA_JEV_AUTOMATIONS=true no próprio executor.');
    error.code = 'DISABLED';
    error.details = { policy };
    throw error;
  }
  return policy;
}
