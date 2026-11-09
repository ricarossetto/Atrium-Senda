/**
 * Cadeia de decisão do classificador: **JEV (fonte oficial) → provedor do escritório → CLI headless**.
 *
 * Falha do JEV (chave revogada, provedor fora do ar, timeout, limite de uso) **não pode
 * derrubar o recurso**: a cadeia registra a degradação e segue para o próximo transporte,
 * declarando no resultado que o modelo de decisão JEV não foi usado. A degradação vira
 * `jevUnavailable` na resposta, nunca um falso sucesso silencioso.
 */

/**
 * @param {object} options
 * @param {() => Promise<object|null>} options.jev transporte do modelo de decisão JEV
 * @param {() => Promise<object|null>} options.provider provedor de IA do escritório (modo degradado)
 * @param {() => Promise<object|null>} [options.headless] CLI headless local (apenas desenvolvimento)
 * @param {(failure: { code: string }) => void} [options.onDegrade] aviso de degradação, sem segredo
 */
export async function resolveClassifierDecision({ jev, provider, headless, onDegrade } = {}) {
  let jevFailure = null;
  try {
    const viaJev = typeof jev === 'function' ? await jev() : null;
    if (viaJev) return viaJev;
  } catch (error) {
    jevFailure = { code: String(error?.code || 'ERRO').slice(0, 40) };
    if (typeof onDegrade === 'function') {
      try { onDegrade(jevFailure); } catch { /* aviso é best-effort */ }
    }
  }

  const viaProvider = typeof provider === 'function' ? await provider() : null;
  if (viaProvider) {
    return jevFailure ? { ...viaProvider, jevUnavailable: jevFailure.code } : viaProvider;
  }

  const viaHeadless = typeof headless === 'function' ? await headless() : null;
  if (viaHeadless) {
    return jevFailure ? { ...viaHeadless, jevUnavailable: jevFailure.code } : viaHeadless;
  }
  return null;
}
