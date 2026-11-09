import assert from 'node:assert/strict';
import {
  DJEN_INITIAL_LOOKBACK_DAYS,
  DJEN_ROUTINE_LOOKBACK_DAYS,
  DJEN_TERM_BUDGET_PER_RUN,
  nextDjenMarker,
  resolveDjenCaptureWindow,
  selectDjenTermsForRun
} from '../lib/judicial/djen-window.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — JANELA DE CAPTURA DJEN (60 DIAS INICIAL / 2 DIAS)   ');
console.log('===============================================================\n');

const initial = resolveDjenCaptureWindow({}, {});
assert.equal(initial.initialCapture, true, 'Sem marcador, a captura é inicial.');
assert.equal(initial.lookbackDays, DJEN_INITIAL_LOOKBACK_DAYS, 'Captura inicial busca 60 dias.');
assert.equal(initial.lookbackDays, 60);
assert.equal(initial.intimationLookbackDays, 60, 'Captura inicial aceita os 60 dias na inbox.');
assert.equal(initial.intimationTrackingSince, null, 'Sem watermark fixo global na captura inicial.');
console.log('✓ Captura inicial: 60 dias (sem watermark fixo).');

const routine = resolveDjenCaptureWindow({ initialCaptureCompletedAt: '2026-09-17T10:00:00.000Z' }, {});
assert.equal(routine.initialCapture, false, 'Com marcador, a captura é de rotina.');
assert.equal(routine.lookbackDays, DJEN_ROUTINE_LOOKBACK_DAYS, 'Rotina busca apenas 2 dias.');
assert.equal(routine.lookbackDays, 2);
assert.equal(routine.intimationLookbackDays, 2, 'Rotina aceita apenas 2 dias na inbox.');
console.log('✓ Rotina: 2 dias.');

const override = resolveDjenCaptureWindow(
  { initialCaptureCompletedAt: '2026-09-17T10:00:00.000Z' },
  { ATRIUM_DJEN_TRACKING_SINCE: ' 2026-09-15 ' }
);
assert.equal(override.intimationTrackingSince, '2026-09-15', 'Override explícito por env permanece suportado.');
const emptyOverride = resolveDjenCaptureWindow({}, { ATRIUM_DJEN_TRACKING_SINCE: '   ' });
assert.equal(emptyOverride.intimationTrackingSince, null, 'Env vazio não vira watermark.');
console.log('✓ Override explícito por env preservado (sem fallback hardcoded).');

const firstMarker = nextDjenMarker({}, { completedAt: '2026-09-17T10:00:00.000Z' });
assert.equal(firstMarker.initialCaptureCompletedAt, '2026-09-17T10:00:00.000Z');
assert.equal(firstMarker.lastSuccessfulSyncAt, '2026-09-17T10:00:00.000Z');
const secondMarker = nextDjenMarker(firstMarker, { completedAt: '2026-09-18T19:00:00.000Z' });
assert.equal(secondMarker.initialCaptureCompletedAt, '2026-09-17T10:00:00.000Z', 'A data da primeira captura não pode ser sobrescrita.');
assert.equal(secondMarker.lastSuccessfulSyncAt, '2026-09-18T19:00:00.000Z', 'A última sincronização é atualizada.');
console.log('✓ Marcador durável: primeira captura preservada, última sincronização atualizada.');

const terms = Array.from({ length: 60 }, (_, index) => ({ id: `term-${index}`, num: String(1000 + index), uf: 'RS' }));
const firstRun = selectDjenTermsForRun(terms, {});
assert.equal(firstRun.terms.length, DJEN_TERM_BUDGET_PER_RUN, 'Cada run processa no máximo o orçamento de termos.');
assert.equal(firstRun.terms[0].id, 'term-0', 'A primeira run começa do início da lista.');
assert.equal(firstRun.nextCursor, DJEN_TERM_BUDGET_PER_RUN, 'O cursor avança pelo orçamento consumido.');
assert.equal(firstRun.fullCycleCompleted, false, 'Ciclo incompleto não conclui a captura inicial.');
const secondRun = selectDjenTermsForRun(terms, { termCursor: firstRun.nextCursor });
assert.equal(secondRun.terms[0].id, `term-${DJEN_TERM_BUDGET_PER_RUN}`, 'A run seguinte continua de onde a anterior parou.');
const wrapRun = selectDjenTermsForRun(terms, { termCursor: 50 });
assert.equal(wrapRun.terms.length, DJEN_TERM_BUDGET_PER_RUN);
assert.equal(wrapRun.terms[0].id, 'term-50');
assert.equal(wrapRun.terms.at(-1).id, 'term-14', 'A seleção dá a volta na lista sem repetir termos.');
assert.equal(wrapRun.nextCursor, 15, 'O cursor avança após a volta.');
assert.equal(wrapRun.fullCycleCompleted, false);
const smallRun = selectDjenTermsForRun(terms.slice(0, 5), { termCursor: 3 });
assert.equal(smallRun.terms.length, 5, 'Lista menor que o orçamento é processada inteira.');
assert.equal(smallRun.nextCursor, 0);
assert.equal(smallRun.fullCycleCompleted, true, 'Lista inteira coberta conclui o ciclo.');
const partialMarker = nextDjenMarker({}, { completedAt: '2026-09-20T07:00:00.000Z', termCursor: 25, initialCaptureCompleted: false });
assert.equal(partialMarker.initialCaptureCompletedAt, undefined, 'Ciclo parcial não marca a captura inicial como concluída.');
const completedMarker = nextDjenMarker(partialMarker, { completedAt: '2026-09-20T19:00:00.000Z', termCursor: 0, initialCaptureCompleted: true });
assert.equal(completedMarker.initialCaptureCompletedAt, '2026-09-20T19:00:00.000Z', 'A captura inicial é marcada ao fechar o ciclo.');
console.log('✓ Orçamento de termos por run com rotação durável e captura inicial preservada.');

console.log('\n>>> JANELA DE CAPTURA DJEN: PASS <<<\n');
