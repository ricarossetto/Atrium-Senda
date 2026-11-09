/**
 * Cabeçalho Idempotency-Key: repetir o mesmo pedido devolve a mesma resposta, sem repetir o efeito.
 *
 * A chave é um UUID gerado pelo navegador a cada intenção, sem dado pessoal. Esta versão fica em memória
 * e serve para envio de e-mail: o sistema não tem banco para isso, roda em instância única, e o pior caso
 * depois de reiniciar é um e-mail repetido. A cobrança guarda as chaves em disco, em billing-service.mjs.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

export function readIdempotencyKey(req) {
  const value = String(req.headers['idempotency-key'] || '').trim();
  if (!value) return null;
  if (!UUID.test(value)) throw httpError(400, 'Chave de repetição inválida. Atualize a página e tente de novo.');
  return value.toLowerCase();
}

export function createIdempotentRequests({ ttlMs = 10 * 60 * 1000, maxEntries = 2000, now = () => Date.now() } = {}) {
  const entries = new Map();
  const prune = () => {
    for (const [id, entry] of entries) {
      if (entry.settled && now() - entry.at > ttlMs) entries.delete(id);
    }
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
  };
  /** Falha não fica guardada: o próximo pedido com a mesma chave tenta de novo. */
  return async function run({ scope, key, fingerprint, operation }) {
    if (!key) return { value: await operation(), replayed: false };
    prune();
    const id = `${scope}:${key}`;
    const known = entries.get(id);
    if (known) {
      if (known.fingerprint !== fingerprint) throw httpError(409, 'Esta chave já foi usada em outro pedido. Atualize a página e tente de novo.');
      return { value: await known.promise, replayed: true };
    }
    const entry = { fingerprint, at: now(), settled: false, promise: null };
    entry.promise = Promise.resolve().then(operation);
    entries.set(id, entry);
    try {
      const value = await entry.promise;
      entry.settled = true;
      entry.at = now();
      return { value, replayed: false };
    } catch (error) {
      entries.delete(id);
      throw error;
    }
  };
}
