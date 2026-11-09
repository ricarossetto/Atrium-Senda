import assert from 'node:assert/strict';
import {
  DJEN_CAPTURE_ERRORS_LIMIT,
  emptyDjenCaptureErrorsQueue,
  normalizeCaptureErrorMessage,
  normalizeDjenCaptureErrorsQueue,
  filterCaptureErrorsForSession,
  reconcileDjenCaptureErrors,
  summarizeDjenCaptureErrors,
  termKeyForCaptureErrors
} from '../lib/judicial/djen-capture-errors.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — FILA DE FALHAS DE CAPTURA DJEN POR TERMO/OAB        ');
console.log('===============================================================\n');

assert.deepEqual(normalizeDjenCaptureErrorsQueue(null), emptyDjenCaptureErrorsQueue(), 'Fila ausente vira fila vazia.');
assert.deepEqual(normalizeDjenCaptureErrorsQueue('lixo'), emptyDjenCaptureErrorsQueue(), 'Fila corrompida vira fila vazia.');
assert.deepEqual(normalizeDjenCaptureErrorsQueue({ terms: 'não é lista' }).terms, [], 'Terms inválidos não viram entradas.');
console.log('✓ Normalização fail-closed de fila ausente/corrompida.');

const termA = { id: 'term-a', oabUf: 'RS', oabNumber: '000123', name: 'Advogada Teste A', registration: 'OAB/RS 000123' };
const termB = { id: 'term-b', oabUf: 'SC', oabNumber: '000456', name: 'Advogado Teste B', registration: 'OAB/SC 000456' };
assert.equal(termKeyForCaptureErrors(termA), 'term-a', 'ID oficial vence como identidade.');
assert.equal(termKeyForCaptureErrors({ oabUf: 'RS', oabNumber: '000123' }), 'oab:RS:000123', 'Sem ID, a inscrição OAB identifica o termo.');
assert.equal(termKeyForCaptureErrors({ name: 'Sem OAB' }), '', 'Termo sem identidade não entra na fila.');
console.log('✓ Identidade estável do termo (ID oficial ou OAB/UF).');

const first = reconcileDjenCaptureErrors(emptyDjenCaptureErrorsQueue(), {
  attemptedTerms: [termA, termB],
  failures: [{ ...termA, message: 'DJEN limitou requisições (HTTP 429). Tente novamente em instantes.' }],
  run: { trigger: 'scheduled' },
  now: '2026-09-20T07:00:00.000Z'
});
assert.equal(first.terms.length, 1, 'Somente o termo falho entra na fila.');
assert.equal(first.terms[0].termId, 'term-a');
assert.equal(first.terms[0].attempts, 1, 'Primeira falha registra uma tentativa.');
assert.equal(first.terms[0].firstFailedAt, '2026-09-20T07:00:00.000Z');
assert.equal(first.terms[0].lastFailedAt, '2026-09-20T07:00:00.000Z');
assert.equal(first.updatedAt, '2026-09-20T07:00:00.000Z');
assert.deepEqual(first.lastRun, { at: '2026-09-20T07:00:00.000Z', trigger: 'scheduled', termCount: 2, failedCount: 1 });
console.log('✓ Falha nova entra na fila com tentativas e horários.');

const second = reconcileDjenCaptureErrors(first, {
  attemptedTerms: [termA],
  failures: [{ ...termA, message: 'coleta parcial' }],
  run: { trigger: 'manual' },
  now: '2026-09-20T19:00:00.000Z'
});
assert.equal(second.terms.length, 1, 'Termo continua na fila enquanto falha.');
assert.equal(second.terms[0].attempts, 2, 'Nova falha incrementa tentativas.');
assert.equal(second.terms[0].firstFailedAt, '2026-09-20T07:00:00.000Z', 'Primeira falha é preservada.');
assert.equal(second.terms[0].lastFailedAt, '2026-09-20T19:00:00.000Z', 'Última falha é atualizada.');
assert.equal(second.terms[0].message, 'coleta parcial', 'Mensagem mais recente é registrada.');
assert.equal(second.lastRun.trigger, 'manual');
console.log('✓ Falha recorrente atualiza tentativas sem perder o histórico inicial.');

const resolved = reconcileDjenCaptureErrors(second, {
  attemptedTerms: [termA],
  failures: [],
  run: { trigger: 'retry' },
  now: '2026-09-20T20:00:00.000Z'
});
assert.equal(resolved.terms.length, 0, 'Termo que volta a coletar sai da fila automaticamente.');
assert.equal(resolved.lastRun.failedCount, 0);
console.log('✓ Sucesso remove o termo da fila (resolvido).');

const untouched = reconcileDjenCaptureErrors(second, {
  attemptedTerms: [termB],
  failures: [],
  run: { trigger: 'scheduled' },
  now: '2026-09-21T07:00:00.000Z'
});
assert.equal(untouched.terms.length, 1, 'Falha fora do lote tentado permanece pendente.');
assert.equal(untouched.terms[0].termId, 'term-a');
console.log('✓ Falha pendente fora do lote não é descartada pela rotação de termos.');

const strayFailure = reconcileDjenCaptureErrors(second, {
  attemptedTerms: [termB],
  failures: [{ ...termA, message: 'falha fora do lote' }],
  run: { trigger: 'scheduled' },
  now: '2026-09-21T07:00:00.000Z'
});
assert.equal(strayFailure.terms.find(entry => entry.termId === 'term-a').attempts, 2, 'Falha fora do lote tentado não altera a entrada existente.');
assert.equal(strayFailure.lastRun.failedCount, 1, 'Contador do lote reflete apenas a falha recebida.');
console.log('✓ Falha de termo não tentado não polui a fila.');

const many = [];
for (let index = 0; index < DJEN_CAPTURE_ERRORS_LIMIT + 25; index += 1) {
  many.push({ id: `term-${index}`, oabUf: 'RS', oabNumber: String(100000 + index), message: `falha ${index}` });
}
const capped = reconcileDjenCaptureErrors(emptyDjenCaptureErrorsQueue(), {
  attemptedTerms: many,
  failures: many,
  run: { trigger: 'scheduled' },
  now: '2026-09-22T07:00:00.000Z'
});
assert.equal(capped.terms.length, DJEN_CAPTURE_ERRORS_LIMIT, 'Fila é limitada para não crescer sem teto.');
assert.equal(capped.terms[0].lastFailedAt, '2026-09-22T07:00:00.000Z');
console.log('✓ Fila com teto durável e ordenação por falha mais recente.');

assert.equal(normalizeCaptureErrorMessage('  Falha\n\ncom   espaços  '), 'Falha com espaços', 'Mensagem é normalizada em linha única.');
assert.equal(normalizeCaptureErrorMessage('x'.repeat(500)).length, 200, 'Mensagem é truncada no limite.');
const summary = summarizeDjenCaptureErrors(capped);
assert.equal(summary.count, DJEN_CAPTURE_ERRORS_LIMIT);
assert.equal(summary.lastRunAt, '2026-09-22T07:00:00.000Z');
assert.equal(summary.lastRunTrigger, 'scheduled');
console.log('✓ Mensagem sanitizada e resumo para a UI.');

const scopeQueue = {
  version: 1,
  updatedAt: '2026-09-23T07:00:00.000Z',
  lastRun: null,
  terms: [
    { termId: 'term-private', oabUf: 'RS', oabNumber: '000123', name: 'Advogada Teste', registration: 'OAB/RS 000123', scope: 'private', message: 'falha', attempts: 1, firstFailedAt: '2026-09-23T07:00:00.000Z', lastFailedAt: '2026-09-23T07:00:00.000Z' },
    { termId: 'term-office', oabUf: 'RS', oabNumber: '000456', name: 'Advogado Teste Dois', registration: 'OAB/RS 000456', scope: 'office', message: 'falha', attempts: 1, firstFailedAt: '2026-09-23T07:00:00.000Z', lastFailedAt: '2026-09-23T07:00:00.000Z' }
  ]
};
const scopeTerms = [
  { id: 'term-private', scope: 'private', privateOwnerUserId: 'usr-1' },
  { id: 'term-office', scope: 'office' }
];
const ownerView = filterCaptureErrorsForSession(scopeQueue, { session: { id: 'usr-1' }, terms: scopeTerms });
assert.deepEqual(ownerView.terms.map(entry => entry.termId).sort(), ['term-office', 'term-private']);
const otherView = filterCaptureErrorsForSession(scopeQueue, { session: { id: 'usr-2' }, terms: scopeTerms });
assert.deepEqual(otherView.terms.map(entry => entry.termId), ['term-office']);
assert.equal(otherView.terms.some(entry => entry.name === 'Advogada Teste'), false, 'Termo privado n�o vaza nome/OAB.');
const unknownOwnerView = filterCaptureErrorsForSession(scopeQueue, { session: { id: 'usr-1' }, terms: [] });
assert.deepEqual(unknownOwnerView.terms.map(entry => entry.termId), ['term-office'], 'Sem resolu��o de dono, o privado fica oculto.');
console.log('V Fila de captura respeita o escopo privado (dono v�; os demais n�o).');

console.log('\n>>> FILA DE FALHAS DE CAPTURA DJEN: PASS <<<\n');
