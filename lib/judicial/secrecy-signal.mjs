/**
 * ATRIUM — Sinal textual de sigilo (listas de portais)
 *
 * Decide se um texto de linha/rótulo indica processo sigiloso. É conservador:
 * "Sem sigilo (Nível 0)", "não sigiloso" e "Sigilo: Não/0/Público" NÃO são sinal;
 * apenas "Segredo de Justiça", "processo sigiloso" ou nível explícito ≥ 1 são.
 * Nunca use o HTML/texto inteiro de uma página como entrada.
 */

export function looksLikeSecrecySignal(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  if (/sem\s+sigilo|n[aã]o\s+sigilos|sigilo\s*:?\s*(?:n[aã]o|0|nenhum|p[uú]blico)/i.test(text)) return false;
  return /segredo de justi[cç]a|processo\s+sigiloso|\bsigilo\s*:?\s*(?:sim|s\b|1)|n[ií]vel de sigilo\s*:?\s*[1-9]/i.test(text);
}
