import path from 'node:path';

/**
 * H3 — contexto e políticas de isolamento do coletor por workspace.
 *
 * Funções puras usadas pelo server (builder de env do subprocesso, derivação de
 * termos do workspace) e pelo próprio agente (validação fail-closed do diretório
 * de dados do workspace). Nenhum estado global vive aqui.
 */

export const COLLECTOR_TENANT_SECRET_ENV_KEYS = Object.freeze([
  'A1_PFX_PATH',
  'A1_PFX_PASSPHRASE',
  'PJE_TOTP_SECRET',
  'ALLOW_AUTOMATED_PORTAL_TOTP'
]);

export function isTotpSecretEnvKey(key) {
  return /_TOTP_SECRET$/i.test(String(key || ''));
}

/**
 * Deriva termos/OAB/identidades monitoradas a partir do estado oficial do workspace,
 * nunca do catálogo global de portais.
 */
export function workspaceCollectorInputs(state = {}) {
  const rawTerms = Array.isArray(state?.terms) ? state.terms : [];
  const terms = [];
  for (const term of rawTerms) {
    if (!term || term.active === false) continue;
    // Processo acompanhado pelo número não identifica advogado nem parte.
    if (String(term.type || '').toLowerCase() === 'process') continue;
    const name = String(term.name || '').trim();
    const uf = String(term.uf || term.oabUf || '').trim().toUpperCase();
    const num = String(term.num || term.oabNumber || '').trim();
    const registration = String(term.registration || '').trim() || (uf && num ? `OAB/${uf} ${num}` : '');
    if (!name && !registration) continue;
    const scope = String(term.scope || '').toLowerCase() === 'private' ? 'private' : 'office';
    const privateOwnerUserId = scope === 'private'
      ? String(term.privateOwnerUserId || term.ownerUserId || '').trim()
      : '';
    terms.push({ id: term.id || null, name, registration, uf, num, scope, ...(privateOwnerUserId ? { privateOwnerUserId } : {}) });
  }
  const officeTerms = terms.filter(term => term.scope !== 'private');
  const primary = officeTerms.find(term => term.primary === true && term.uf && term.num)
    || officeTerms.find(term => term.uf && term.num)
    || null;
  const names = new Set();
  const lawyerName = String(state?.settings?.lawyerName || '').trim();
  if (lawyerName) names.add(lawyerName);
  for (const term of officeTerms) if (term.name) names.add(term.name);
  return {
    terms: officeTerms,
    oabUf: primary?.uf || '',
    oabNumber: primary?.num || '',
    monitoredNames: [...names]
  };
}

/**
 * Builder do env do processo coletor. Remove segredos de tenant quando o alvo não é o
 * workspace default e injeta todo o contexto do workspace de forma explícita.
 */
export function buildCollectorSpawnEnv({
  baseEnv = process.env,
  workspaceId,
  workspaceDataDir,
  defaultWorkspaceId,
  spawnToken = '',
  terms = [],
  monitoredNames = [],
  oabUf = '',
  oabNumber = '',
  identityId = 'office-primary',
  centralUrl,
  headless = true,
  interactive = false,
  loginWaitSeconds = 30,
  portalIds = null
} = {}) {
  const targetWorkspaceId = String(workspaceId || '').trim();
  if (!targetWorkspaceId) throw new Error('workspaceId é obrigatório para o coletor.');
  const isDefault = targetWorkspaceId === defaultWorkspaceId;
  const env = { ...baseEnv };
  if (!isDefault) {
    for (const key of Object.keys(env)) {
      if (COLLECTOR_TENANT_SECRET_ENV_KEYS.includes(key) || isTotpSecretEnvKey(key)) delete env[key];
    }
  }
  env.ATRIUM_WORKSPACE_ID = targetWorkspaceId;
  env.ATRIUM_WORKSPACE_IS_DEFAULT = isDefault ? 'true' : 'false';
  if (workspaceDataDir) env.ATRIUM_WORKSPACE_DATA_DIR = path.resolve(workspaceDataDir);
  if (spawnToken) env.COLLECTOR_INGEST_TOKEN = spawnToken;
  env.CENTRAL_URL = centralUrl;
  env.COLLECTOR_HEADLESS = headless ? 'true' : 'false';
  env.COLLECTOR_INTERACTIVE = interactive ? 'true' : 'false';
  env.LOGIN_WAIT_SECONDS = String(loginWaitSeconds);
  env.JUDICIAL_IDENTITY_ID = identityId;
  env.JUDICIAL_OAB_UF = oabUf;
  env.JUDICIAL_OAB_NUMBER = oabNumber;
  env.ATRIUM_JUDICIAL_TERMS = JSON.stringify(terms);
  env.ATRIUM_MONITORED_NAMES = JSON.stringify(monitoredNames);
  if (Array.isArray(portalIds)) env.COLLECTOR_PORTAL_IDS = portalIds.join(',');
  return env;
}

/**
 * Resolve e valida o workspace do agente. Fail-closed: sem contexto válido o agente
 * opera apenas no diretório default; diretórios fora da raiz de workspaces são rejeitados.
 */
export function resolveAgentWorkspace({ env = {}, root } = {}) {
  if (!root) throw new Error('root é obrigatório.');
  const defaultDir = path.resolve(path.join(root, 'data'));
  const boundary = `${path.resolve(path.join(defaultDir, 'workspaces'))}${path.sep}`;
  const workspaceId = String(env.ATRIUM_WORKSPACE_ID || '').trim();
  const requested = String(env.ATRIUM_WORKSPACE_DATA_DIR || '').trim();
  const fail = (message) => { throw Object.assign(new Error(message), { code: 'COLLECTOR_WORKSPACE_INVALID' }); };
  if (!requested) {
    return { workspaceId, dataDir: defaultDir, isDefault: true, allowGlobalFallbacks: true };
  }
  const resolved = path.resolve(requested);
  if (resolved === defaultDir) {
    return { workspaceId, dataDir: resolved, isDefault: true, allowGlobalFallbacks: true };
  }
  if (!resolved.startsWith(boundary)) fail('Diretório de dados do coletor fora da raiz de workspaces.');
  if (!workspaceId) fail('ATRIUM_WORKSPACE_ID é obrigatório para coletor de workspace não-default.');
  const expected = path.resolve(path.join(boundary, workspaceId));
  if (expected !== resolved) fail('Diretório de dados não corresponde ao workspace informado.');
  return { workspaceId, dataDir: resolved, isDefault: false, allowGlobalFallbacks: false };
}
