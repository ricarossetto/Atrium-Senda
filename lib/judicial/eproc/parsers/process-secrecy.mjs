/**
 * ATRIUM — Nível de sigilo do PROCESSO (eproc)
 *
 * O sigilo do processo é um campo próprio da página:
 *   - `Nível de Sigilo: 0 (Público)` / `Nível de Sigilo: 2`
 *   - `O Gaia Assistente está indisponível devido ao nível de sigilo deste processo (0)`
 *   - campo por id (`txtNivelSigilo` / `nivelSigilo`)
 *
 * Rótulos POR DOCUMENTO ("Sem Sigilo (Nível 0)", "Segredo de Justiça (Nível 1)"
 * em anexos) descrevem cada peça, não o processo, e por isso NÃO são usados como
 * sinal — usá-los marcava quase todo processo como segredo de justiça.
 */

/**
 * Fontes das expressões (serializáveis) usadas para ler o nível do processo.
 * O coletor eproc executa a leitura DENTRO da página (`page.evaluate`), onde
 * funções importadas não existem: as fontes são passadas como dado e o mesmo
 * conjunto é usado no Node — uma única origem para a regra.
 */
export const PROCESS_SECRECY_LEVEL_PATTERN_SOURCES = Object.freeze([
  'id=["\'](?:txtNivelSigilo|nivelSigilo)["\'][^>]*value=["\']?(\\d{1,2})',
  'value=["\']?(\\d{1,2})["\']?[^>]*id=["\'](?:txtNivelSigilo|nivelSigilo)["\']',
  'n[ií]vel de sigilo deste processo\\s*\\(?\\s*(\\d{1,2})',
  'n[ií]vel de sigilo\\s*:?\\s*(\\d{1,2})\\b'
]);

/**
 * Devolve o nível de sigilo do processo e se a página declarou o nível
 * explicitamente. `explicit: false` significa "não informado" — ausência de
 * evidência, que nunca deve ser usada para limpar uma marcação existente.
 * Nunca infere a partir de rótulos de documentos/anexos.
 */
export function extractProcessSecrecy(html) {
  const text = String(html || '');
  if (!text) return { level: 0, explicit: false };
  for (const source of PROCESS_SECRECY_LEVEL_PATTERN_SOURCES) {
    const match = text.match(new RegExp(source, 'i'));
    if (!match) continue;
    const level = Number(match[1]);
    if (!Number.isFinite(level) || level < 0) return { level: 0, explicit: false };
    return { level, explicit: true };
  }
  return { level: 0, explicit: false };
}

/**
 * Compatibilidade: apenas o nível (0 quando público ou não informado).
 */
export function extractProcessSecrecyLevel(html) {
  return extractProcessSecrecy(html).level;
}

export function describeProcessSecrecy(level) {
  const numeric = Number(level);
  return Number.isFinite(numeric) && numeric > 0 ? `Segredo de Justiça (Nível ${numeric})` : '';
}
