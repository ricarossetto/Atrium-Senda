import assert from 'node:assert/strict';
import {
  DEADLINE_CONFERENCE_MAX_DAYS,
  DEADLINE_CONFERENCE_NOTE,
  conferenceDeadline
} from '../lib/core/deadline-conference.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — CONFERENCIA DE CONTAGEM DE PRAZO (INFORMATIVA)       ');
console.log('===============================================================\n');

const business = conferenceDeadline({ startDate: '2026-09-18', days: 5, counting: 'business', direction: 'after' });
assert.equal(business.ok, true);
assert.equal(business.startDate, '2026-09-18');
assert.equal(business.direction, 'after');
assert.equal(business.counting, 'business');
assert.deepEqual(business.steps, ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'], 'Fim de semana não é contado (18/09 sexta + 5 dias úteis).');
assert.equal(business.proposedDate, '2026-09-25');
assert.equal(business.firstBusinessDayAfter, '2026-09-21');
assert.equal(business.lastBusinessDayBefore, '2026-09-17');
assert.equal(business.countedDays, 5);
assert.equal(business.note, DEADLINE_CONFERENCE_NOTE);
assert.match(business.note, /confirmação do prazo é humana/);
console.log('✓ Dias úteis: fim de semana fora da contagem e datas de referência.');

const calendar = conferenceDeadline({ startDate: '2026-09-18', days: 5, counting: 'calendar', direction: 'after' });
assert.equal(calendar.proposedDate, '2026-09-23');
assert.deepEqual(calendar.steps, ['2026-09-23']);
const before = conferenceDeadline({ startDate: '2026-09-21', days: 3, counting: 'business', direction: 'before' });
assert.deepEqual(before.steps, ['2026-09-18', '2026-09-17', '2026-09-16']);
assert.equal(before.proposedDate, '2026-09-16');
assert.equal(before.lastBusinessDayBefore, '2026-09-18');
console.log('✓ Dias corridos e direção anterior.');

const holiday = conferenceDeadline({ startDate: '2026-09-04', days: 2, counting: 'business', direction: 'after' });
assert.deepEqual(holiday.steps, ['2026-09-08', '2026-09-09'], 'Feriado nacional (07/09) não é contado.');
const suspended = conferenceDeadline({
  startDate: '2026-09-21',
  days: 3,
  counting: 'business',
  direction: 'after',
  suspensions: [{ from: '2026-09-22', to: '2026-09-23' }]
});
assert.deepEqual(suspended.steps, ['2026-09-24', '2026-09-25', '2026-09-28'], 'Suspensão registrada desloca a contagem.');
assert.equal(suspended.suspensionsApplied, 2);
const ignoredSuspension = conferenceDeadline({ startDate: '2026-09-21', days: 1, counting: 'calendar', direction: 'after', suspensions: [{ from: '2026-09-22', to: '2026-09-22' }] });
assert.equal(ignoredSuspension.proposedDate, '2026-09-22', 'Dias corridos ignoram suspensões.');
console.log('✓ Feriado nacional e suspensões explícitas deslocam dias úteis; corridos não.');

assert.equal(conferenceDeadline({ startDate: '18/09/2026' }).ok, false);
assert.equal(conferenceDeadline({ startDate: '2026-09-18', days: 0 }).reason, 'invalid-days');
assert.equal(conferenceDeadline({ startDate: '2026-09-18', days: DEADLINE_CONFERENCE_MAX_DAYS + 1 }).reason, 'invalid-days');
assert.equal(conferenceDeadline({ startDate: '2026-09-18', counting: 'uteis' }).reason, 'invalid-mode');
assert.equal(conferenceDeadline({ startDate: '2026-09-18', direction: 'depois' }).reason, 'invalid-mode');
const long = conferenceDeadline({ startDate: '2026-09-21', days: 200, counting: 'business' });
assert.equal(long.ok, true);
assert.equal(long.countedDays, 200);
assert.ok(long.steps.length <= 90, 'Lista de datas contadas é limitada para exibição.');
console.log('✓ Entradas inválidas recusadas e teto de exibição respeitado.');

console.log('\n>>> CONFERENCIA DE CONTAGEM DE PRAZO: PASS <<<\n');
