/**
 * Chave de repetição do lado do navegador: a mesma intenção mantém o mesmo UUID até ter resposta.
 * Sem resposta (queda de rede), a nova tentativa reaproveita a chave e o servidor não repete o efeito.
 */
export function createAttemptKey(cryptoRef = globalThis.crypto) {
  let current = null;
  return {
    for(fingerprint) {
      if (!current || current.fingerprint !== fingerprint) current = { fingerprint, key: cryptoRef.randomUUID() };
      return current.key;
    },
    settle() { current = null; }
  };
}
