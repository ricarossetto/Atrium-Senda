import assert from 'node:assert/strict';
import {
  BUSINESS_DAYS_VERSION,
  PUBLICATION_DERIVATION_NOTE,
  derivePublicationDate,
  isBusinessDay,
  isNationalHoliday,
  isWeekend,
  nextBusinessDay
} from '../lib/core/business-days.mjs';

console.log('\n=== DIAS ÚTEIS E DATA DE PUBLICAÇÃO (LEI 11.419/2006; CPC 224) ===\n');

// Implementação independente: iteração por dia com feriados fixos + Páscoa (Meeus).
function referenceEaster(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function referenceAddDays(iso, days) {
  const parsed = Date.parse(`${iso}T12:00:00Z`);
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
}
function referenceIsBusinessDay(iso) {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay();
  if (day === 0 || day === 6) return false;
  const monthDay = iso.slice(5);
  if (['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].includes(monthDay)) return false;
  const year = Number(iso.slice(0, 4));
  if (iso === referenceAddDays(referenceEaster(year), -2)) return false;
  return true;
}
function referenceNextBusinessDay(iso) {
  let cursor = referenceAddDays(iso, 1);
  while (!referenceIsBusinessDay(cursor)) cursor = referenceAddDays(cursor, 1);
  return cursor;
}

assert.equal(BUSINESS_DAYS_VERSION, '2026.1');

// Semana comum: segunda → terça; sexta → segunda.
assert.equal(nextBusinessDay('2026-09-14'), '2026-09-15', 'Segunda deve publicar na terça.');
assert.equal(nextBusinessDay('2026-09-18'), '2026-09-21', 'Sexta deve publicar na segunda.');
assert.equal(nextBusinessDay('2026-09-19'), '2026-09-21', 'Sábado deve publicar na segunda.');
assert.equal(nextBusinessDay('2026-09-20'), '2026-09-21', 'Domingo deve publicar na segunda.');

// Feriados nacionais fixos.
assert.equal(nextBusinessDay('2026-04-20'), '2026-04-22', 'Véspera de Tiradentes deve pular 21/04.');
assert.equal(nextBusinessDay('2026-11-14'), '2026-11-16', 'Sábado antes de 15/11 deve publicar na segunda.');
assert.equal(nextBusinessDay('2026-11-19'), '2026-11-23', '20/11 (Consciência Negra) e fim de semana.');
assert.equal(nextBusinessDay('2026-12-24'), '2026-12-28', 'Natal (sexta) + fim de semana.');
assert.equal(nextBusinessDay('2026-12-31'), '2027-01-04', 'Ano novo + fim de semana.');

// Sexta-feira Santa (Páscoa 2026 = 05/04; Paixão = 03/04).
assert.equal(isNationalHoliday('2026-04-03'), true, 'Sexta-feira Santa é feriado.');
assert.equal(nextBusinessDay('2026-04-02'), '2026-04-06', 'Quinta antes da Paixão publica na segunda.');
assert.equal(nextBusinessDay('2027-03-25'), '2027-03-29', 'Paixão 2027 (26/03) + fim de semana.');

// Classificações diretas.
assert.equal(isWeekend('2026-09-19'), true);
assert.equal(isWeekend('2026-09-21'), false);
assert.equal(isNationalHoliday('2026-01-01'), true);
assert.equal(isNationalHoliday('2026-09-07'), true);
assert.equal(isNationalHoliday('2026-09-08'), false);
assert.equal(isBusinessDay('2026-09-21'), true);
assert.equal(isBusinessDay('2026-11-20'), false);

// Comparação com implementação independente em uma varredura de 3 anos.
let checked = 0;
for (const year of [2026, 2027, 2028]) {
  for (let month = 1; month <= 12; month += 1) {
    for (let day = 1; day <= 28; day += 1) {
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      assert.equal(isBusinessDay(iso), referenceIsBusinessDay(iso), `Dia útil divergente: ${iso}`);
      assert.equal(nextBusinessDay(iso), referenceNextBusinessDay(iso), `Próximo dia útil divergente: ${iso}`);
      checked += 1;
    }
  }
}
console.log(`✓ Varredura de ${checked} datas confere com a implementação independente.`);

// Derivação.
const shifted = derivePublicationDate('2026-09-18');
assert.equal(shifted.availableAt, '2026-09-18');
assert.equal(shifted.publishedAt, '2026-09-21');
assert.equal(shifted.shifted, true);
assert.equal(shifted.note, PUBLICATION_DERIVATION_NOTE);
assert.equal(derivePublicationDate('data-invalida').publishedAt, null);
assert.equal(derivePublicationDate('').availableAt, null);
console.log('✓ Derivação disponibilização → publicação com nota de conferência.');

console.log('\n>>> DIAS ÚTEIS: PASS <<<\n');
