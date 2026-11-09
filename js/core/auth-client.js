// Wrapper neutro de autenticacao (F-15). Resolve o cliente canonico
// AtriumAuth com fallback ao alias legado KellerAuth (AGENTS §9).
export function getAuthClient(g = globalThis) {
  return g.AtriumAuth || g.KellerAuth || null;
}
