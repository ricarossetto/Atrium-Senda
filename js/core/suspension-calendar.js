/**
 * ATRIUM — Registro de suspensões e indisponibilidades (informativo)
 *
 * A indisponibilidade de sistemas prorroga prazos por regra legal (Resolução CNJ
 * 455/2022, arts. 6º a 9º, para o Portal de Serviços/DJEN; Resolução CNJ 185/2013,
 * arts. 9º a 12º, para o PJe). O ATRIUM não automatiza essa contagem: o escritório
 * registra os períodos divulgados pelas fontes oficiais e a interface apenas avisa
 * que pode haver prorrogação. Nenhum prazo é criado, alterado ou confirmado por
 * este módulo (AGENTS §16; specs/human-deadline-policy.md).
 *
 * Módulo puro, compartilhado entre frontend e backend.
 */

export const SUSPENSION_SCOPES = Object.freeze(['PJe', 'PSPJ', 'DJEN', 'MNI', 'Outro']);

export const MAX_SUSPENSIONS = 100;

export const SUSPENSION_NOTE =
  'Indisponibilidade registrada pelo escritório. Pode haver prorrogação de prazos (Res. CNJ 455/2022, arts. 6º a 9º; Res. CNJ 185/2013, arts. 9º a 12º). Conferir antes de qualquer prazo.';

function dateOnly(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw ? raw : null;
}

function text(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function safeUrl(value) {
  const raw = text(value, 300);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

/**
 * Normaliza um registro; devolve null quando início/fim são inválidos ou o fim é
 * anterior ao início.
 */
export function normalizeSuspension(value, index = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const start = dateOnly(value.start);
  const end = dateOnly(value.end) || start;
  if (!start || !end || end < start) return null;
  const scope = SUSPENSION_SCOPES.includes(value.scope) ? value.scope : 'Outro';
  return {
    id: text(value.id, 80) || `suspension:${start}:${end}:${index}`,
    start,
    end,
    scope,
    sourceUrl: safeUrl(value.sourceUrl),
    note: text(value.note, 200),
    createdAt: text(value.createdAt, 40)
  };
}

export function normalizeSuspensions(list) {
  if (!Array.isArray(list)) return [];
  const normalized = [];
  const seen = new Set();
  for (const [index, value] of list.entries()) {
    const item = normalizeSuspension(value, index);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    normalized.push(item);
    if (normalized.length >= MAX_SUSPENSIONS) break;
  }
  return normalized.sort((left, right) => left.start.localeCompare(right.start));
}

/**
 * Primeiro registro que cobre a data informada (início ≤ data ≤ fim).
 */
export function suspensionForDate(value, list) {
  const date = dateOnly(value);
  if (!date) return null;
  return normalizeSuspensions(list).find(item => item.start <= date && date <= item.end) || null;
}

export function describeSuspension(item) {
  const suspension = normalizeSuspension(item);
  if (!suspension) return '';
  const period = suspension.start === suspension.end
    ? suspension.start
    : `${suspension.start} a ${suspension.end}`;
  const detail = suspension.note ? ` · ${suspension.note}` : '';
  return `${period} · ${suspension.scope}${detail}`;
}
