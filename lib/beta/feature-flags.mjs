// ATRIUM — Identificação de ambiente e feature flags experimentais (MEGA BETA).
//
// Contratos:
// - A identificação do ambiente vem de configuração server-side (ATRIUM_ENV),
//   nunca do hostname ou de valor enviado pelo frontend.
// - Toda flag experimental é declarada nesta lista e é FALSA por padrão, exceto
//   o kill-switch de automação (BETA_DISABLE_AUTOMATIONS), que é TRUE por padrão
//   (fail-safe): subir o servidor beta não autoriza automação.
// - Flags BETA_* somente produzem efeito quando ATRIUM_ENV=beta. Em qualquer
//   outro ambiente o valor efetivo é sempre false: nenhuma rota, worker, UI,
//   chamada externa ou side effect experimental é habilitado.
// - Este módulo nunca expõe valores de ambiente nem segredos; apenas o estado
//   efetivo das flags declaradas.

const BETA_ENVIRONMENTS = new Set(['beta']);

export const BETA_FLAG_DEFINITIONS = Object.freeze([
  { name: 'ATRIUM_BETA_MODE', env: 'ATRIUM_BETA_MODE', description: 'Modo experimental global do MEGA BETA.' },
  { name: 'BETA_JUDICIAL_INTELLIGENCE', env: 'BETA_JUDICIAL_INTELLIGENCE', description: 'Judicial Intelligence (fontes processuais, proveniência e comparação) em modo experimental.' },
  { name: 'BETA_LEGAL_INTELLIGENCE', env: 'BETA_LEGAL_INTELLIGENCE', description: 'Legal Intelligence (skills, receitas e prompts jurídicos) em modo experimental.' },
  { name: 'BETA_LEGAL_MCP', env: 'BETA_LEGAL_MCP', description: 'Servidores MCP jurídicos experimentais.' },
  { name: 'BETA_ROM_RECIPES', env: 'BETA_ROM_RECIPES', description: 'Recipes ROM experimentais.' },
  { name: 'BETA_LEX_SKILLS', env: 'BETA_LEX_SKILLS', description: 'Skills Lex Intelligentia experimentais.' },
  { name: 'BETA_LEGAL_RAG', env: 'BETA_LEGAL_RAG', description: 'RAG jurídico experimental (chunking, recuperação e fusão de fontes).' },
  { name: 'BETA_DISABLE_AUTOMATIONS', env: 'BETA_DISABLE_AUTOMATIONS', defaultEnabled: true, description: 'Kill-switch compartilhado com a Judicial Intelligence: bloqueia agendadores e automações de varredura.' }
]);

function envFlag(value) {
  return /^(?:true|1|yes|on)$/i.test(String(value || '').trim());
}

export function resolveEnvironment(env = process.env) {
  const explicit = String(env.ATRIUM_ENV || '').trim().toLowerCase();
  if (explicit) return explicit;
  const nodeEnv = String(env.NODE_ENV || '').trim().toLowerCase();
  return nodeEnv || 'production';
}

export function isBetaEnvironment(env = process.env) {
  return BETA_ENVIRONMENTS.has(resolveEnvironment(env));
}

export function featureFlags(env = process.env) {
  const beta = isBetaEnvironment(env);
  const flags = {};
  for (const definition of BETA_FLAG_DEFINITIONS) {
    const raw = env[definition.env];
    const effective = raw === undefined || raw === null || String(raw).trim() === ''
      ? definition.defaultEnabled === true
      : envFlag(raw);
    flags[definition.name] = beta && effective;
  }
  return Object.freeze(flags);
}

export function featureFlag(name, env = process.env) {
  return featureFlags(env)[name] === true;
}

export function publicBetaStatus(env = process.env) {
  const flags = featureFlags(env);
  const enabled = Object.freeze(Object.keys(flags).filter(name => flags[name]));
  return Object.freeze({
    environment: resolveEnvironment(env),
    betaMode: isBetaEnvironment(env),
    featureFlags: flags,
    enabledFeatureFlags: enabled
  });
}
