/**
 * ATRIUM — Dias úteis e data de publicação (informativo)
 *
 * Deriva a data de publicação como o primeiro dia útil seguinte à disponibilização,
 * conforme Lei 11.419/2006, art. 4º, §3º e CPC/2015, art. 224, §2º, e a leitura do
 * art. 11, §3º, da Resolução CNJ 455/2022 (redação da Resolução 569/2024).
 *
 * Escopo do cálculo: fins de semana, feriados nacionais estatutários e Sexta-feira
 * Santa. Feriados locais/estaduais, pontos facultativos (Carnaval, Corpus Christi),
 * recesso forense e suspensões por indisponibilidade NÃO são calculados: a data é
 * informativa e a conferência é humana. Nenhum prazo é criado a partir dela
 * (AGENTS §16; specs/human-deadline-policy.md).
 *
 * Módulo puro: sem dependência de navegador, Node, Store ou rede.
 */

export const BUSINESS_DAYS_VERSION = '2026.1';

// Feriados nacionais estatutários (Lei 662/1949, com as alterações da Lei 10.607/2002;
// Lei 6.802/1980; Lei 14.759/2023) + Sexta-feira Santa (feriado religioso nacional,
// Decreto 27.048/1949), calculada a partir da Páscoa.
const FIXED_NATIONAL_HOLIDAYS = new Set([
  '01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'
]);

export const PUBLICATION_DERIVATION_NOTE =
  'Primeiro dia útil seguinte à disponibilização (Lei 11.419/2006 e CPC, art. 224). Feriados locais, pontos facultativos e suspensões podem deslocar a data; conferir antes de qualquer prazo.';

function parseDateOnly(value) {
  const raw = String(value || '').trim();
  if (raw.length < 10) return null;
  const candidate = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const parsed = new Date(`${candidate}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === candidate ? parsed : null;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function goodFriday(year) {
  const easter = easterSunday(year);
  return new Date(easter.getTime() - 2 * 86_400_000);
}

export function isWeekend(value) {
  const date = parseDateOnly(value);
  if (!date) return false;
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function isNationalHoliday(value) {
  const date = parseDateOnly(value);
  if (!date) return false;
  const iso = toIsoDate(date);
  if (FIXED_NATIONAL_HOLIDAYS.has(iso.slice(5))) return true;
  return iso === toIsoDate(goodFriday(date.getUTCFullYear()));
}

export function isBusinessDay(value) {
  const date = parseDateOnly(value);
  if (!date) return false;
  return !isWeekend(value) && !isNationalHoliday(value);
}

/**
 * Próximo dia útil estritamente posterior à data informada.
 * Devolve null quando a entrada não é uma data válida.
 */
export function nextBusinessDay(value) {
  const date = parseDateOnly(value);
  if (!date) return null;
  let cursor = new Date(date.getTime());
  do {
    cursor = new Date(cursor.getTime() + 86_400_000);
  } while (!isBusinessDay(toIsoDate(cursor)));
  return toIsoDate(cursor);
}

/**
 * Deriva a publicação a partir da disponibilização.
 * Devolve `{ availableAt, publishedAt, shifted, note }`; `publishedAt` é null quando
 * `availableAt` não é uma data válida.
 */
export function derivePublicationDate(availableAt) {
  const available = parseDateOnly(availableAt);
  if (!available) return { availableAt: null, publishedAt: null, shifted: false, note: null };
  const availableIso = toIsoDate(available);
  const publishedAt = nextBusinessDay(availableIso);
  return {
    availableAt: availableIso,
    publishedAt,
    shifted: publishedAt !== availableIso,
    note: PUBLICATION_DERIVATION_NOTE
  };
}
