/**
 * ATRIUM Sovereign Judicial Connectivity — Eproc access-key redaction
 *
 * Boundary guard: chaves de acesso do eproc vivem exclusivamente no cofre cifrado do
 * workspace. Qualquer payload derivado do estado oficial que saia para a API, para o
 * frontend, para telemetria ou para logs precisa atravessar esta redação.
 */

const ACCESS_KEY_FIELDS = /^(?:accessKey|chaveAcesso|chaveAcessoProcesso|processAccessKey)$/i;
const MAX_DEPTH = 40;

export function redactEprocSecrets(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return value;
  if (Array.isArray(value)) return value.map(item => redactEprocSecrets(item, depth + 1));
  if (typeof value !== 'object') return value;

  const clean = {};
  for (const [key, nested] of Object.entries(value)) {
    if (ACCESS_KEY_FIELDS.test(key)) continue;
    clean[key] = redactEprocSecrets(nested, depth + 1);
  }
  return clean;
}

export function redactEprocSecretsFromProcess(process) {
  if (!process || typeof process !== 'object') return process;
  return redactEprocSecrets(process);
}

/**
 * Variante in-place para objetos recém-parseados: remove chaves de acesso sem clonar
 * a árvore inteira. Só use quando o objeto não for compartilhado (ex.: envelope recém-lido).
 */
export function redactEprocSecretsInPlace(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > MAX_DEPTH) return value;
  if (Array.isArray(value)) {
    for (const item of value) redactEprocSecretsInPlace(item, depth + 1);
    return value;
  }
  for (const key of Object.keys(value)) {
    if (ACCESS_KEY_FIELDS.test(key)) {
      delete value[key];
      continue;
    }
    redactEprocSecretsInPlace(value[key], depth + 1);
  }
  return value;
}
