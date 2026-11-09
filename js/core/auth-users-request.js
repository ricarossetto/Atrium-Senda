/**
 * Quatro módulos precisam da lista de usuários logo depois de entrar. Em vez de um pedido por
 * módulo, eles dividem o mesmo: resposta em andamento ou recém-chegada vale por alguns segundos.
 * Depois de alterar um usuário, a tela pede `force` para ler de novo.
 */
const FRESH_MS = 60_000;
let pending = null;
let cached = null;
let cachedAt = 0;

const copyOf = response => (typeof response?.clone === 'function' ? response.clone() : response);

export async function requestAuthUsers(fallbackFetch, { force = false } = {}) {
  const shared = globalThis.KellerAuth?.secureFetch;
  const options = { headers: { Accept: 'application/json' } };
  if (typeof shared !== 'function') return fallbackFetch('/api/auth/users', options);
  if (force !== true && cached && Date.now() - cachedAt < FRESH_MS) return copyOf(cached);
  if (force !== true && pending) return copyOf(await pending);
  pending = Promise.resolve(shared('/api/auth/users', options)).then(response => {
    if (response?.ok) {
      cached = copyOf(response);
      cachedAt = Date.now();
    }
    return response;
  }).finally(() => {
    pending = null;
  });
  return copyOf(await pending);
}
