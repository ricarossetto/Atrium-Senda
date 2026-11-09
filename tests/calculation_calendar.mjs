import assert from 'node:assert/strict';
import {
  CalendarError,
  partsFromIso,
  isoFromParts,
  monthOf,
  monthBefore,
  addDays,
  addYears,
  daysBetween,
  daysInMonth,
  monthFractions,
  periodsInRange,
  previousPeriodsBetween
} from '../lib/calc/calendar.mjs';

assert.deepEqual(partsFromIso('2026-09-18'), { year: 2026, month: 9, day: 18 });
assert.throws(() => partsFromIso('2026-02-30'), CalendarError);
assert.throws(() => partsFromIso('18/09/2026'), CalendarError);
assert.equal(isoFromParts(2026, 9, 8), '2026-09-08');
assert.equal(monthOf('2026-09-18'), '2026-09');
assert.throws(() => monthOf('2026-13-01'), CalendarError);

assert.equal(monthBefore('2026-01'), '2025-12');
assert.equal(monthBefore('2026-09'), '2026-08');
assert.equal(monthBefore('2026-12'), '2026-11');
assert.throws(() => monthBefore('2026-00'), CalendarError);

assert.equal(addDays('2026-12-31', 1), '2027-01-01');
assert.equal(addDays('2024-02-28', 1), '2024-02-29');
assert.equal(addDays('2026-02-28', 1), '2026-03-01');
assert.equal(addDays('2026-01-01', -1), '2025-12-31');
assert.throws(() => addDays('2026-01-01', 1.5), CalendarError);
assert.equal(addYears('2026-09-18', 10), '2036-09-18');

assert.equal(daysBetween('2026-01-01', '2026-01-31'), 30);
assert.equal(daysBetween('2026-01-31', '2026-02-01'), 1);
assert.equal(daysBetween('2026-02-01', '2026-01-01'), -31);

assert.equal(daysInMonth('2026-02'), 28);
assert.equal(daysInMonth('2024-02'), 29);
assert.equal(daysInMonth('2026-01'), 31);
assert.equal(daysInMonth('2026-04'), 30);
assert.throws(() => daysInMonth('2026-13'), CalendarError);

const fractions = monthFractions('2026-01-15', '2026-04-20');
assert.deepEqual(fractions, [
  { period: '2026-01', days: 16, daysInMonth: 31, fraction: '16/31' },
  { period: '2026-02', days: 28, daysInMonth: 28, fraction: '28/28' },
  { period: '2026-03', days: 31, daysInMonth: 31, fraction: '31/31' },
  { period: '2026-04', days: 20, daysInMonth: 30, fraction: '20/30' }
]);

assert.deepEqual(monthFractions('2026-03-01', '2026-03-31'), [
  { period: '2026-03', days: 30, daysInMonth: 31, fraction: '30/31' }
]);
assert.deepEqual(monthFractions('2026-02-01', '2026-02-28'), [
  { period: '2026-02', days: 27, daysInMonth: 28, fraction: '27/28' }
]);
assert.deepEqual(monthFractions('2026-01-31', '2026-02-01'), [
  { period: '2026-02', days: 1, daysInMonth: 28, fraction: '1/28' }
]);
assert.deepEqual(monthFractions('2026-03-10', '2026-03-10'), []);
assert.deepEqual(monthFractions('2026-03-10', '2026-03-05'), []);

assert.deepEqual(periodsInRange('2026-01', '2026-03'), ['2026-01', '2026-02', '2026-03']);
assert.throws(() => periodsInRange('2026-03', '2026-01'), CalendarError);
assert.deepEqual(previousPeriodsBetween('2026-01', '2026-04'), ['2026-02', '2026-03', '2026-04']);
assert.deepEqual(previousPeriodsBetween('2026-01', '2026-01'), []);
assert.deepEqual(previousPeriodsBetween('2026-04', '2026-01'), []);

console.log('Calendário de cálculos aprovado: datas reais, frações de mês (início exclusivo/fim inclusivo) e intervalos PASS.');
