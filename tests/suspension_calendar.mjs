import assert from 'node:assert/strict';
import {
  MAX_SUSPENSIONS,
  SUSPENSION_NOTE,
  SUSPENSION_SCOPES,
  describeSuspension,
  normalizeSuspension,
  normalizeSuspensions,
  suspensionForDate
} from '../js/core/suspension-calendar.js';
import { CURRENT_SCHEMA_VERSION, validateAppState } from '../lib/state-migrations.mjs';

console.log('\n=== SUSPENSÕES E INDISPONIBILIDADES (INFORMATIVO) ===\n');

assert.deepEqual([...SUSPENSION_SCOPES], ['PJe', 'PSPJ', 'DJEN', 'MNI', 'Outro']);
assert.match(SUSPENSION_NOTE, /Pode haver prorrogação de prazos/);
assert.match(SUSPENSION_NOTE, /Conferir antes de qualquer prazo/);

// Normalização e validação.
const valid = normalizeSuspension({ id: 's1', start: '2026-09-21', end: '2026-09-22', scope: 'PJe', note: '  queda  ', sourceUrl: 'https://www.cnj.jus.br/nota' });
assert.deepEqual(valid, { id: 's1', start: '2026-09-21', end: '2026-09-22', scope: 'PJe', sourceUrl: 'https://www.cnj.jus.br/nota', note: 'queda', createdAt: '' });
assert.equal(normalizeSuspension({ start: '2026-09-22', end: '2026-09-21' }), null, 'Fim anterior ao início é inválido.');
assert.equal(normalizeSuspension({ start: '21/09/2026', end: '22/09/2026' }), null, 'Formato de data inválido.');
assert.equal(normalizeSuspension({ start: '2026-02-30' }), null, 'Data inexistente é inválida.');
assert.equal(normalizeSuspension(null), null);
assert.equal(normalizeSuspension({ start: '2026-09-21', scope: 'Inexistente' }).scope, 'Outro');
assert.equal(normalizeSuspension({ start: '2026-09-21', sourceUrl: 'javascript:alert(1)' }).sourceUrl, '', 'URL não HTTP(S) é descartada.');
console.log('✓ Normalização e rejeições conferem.');

// Lista: dedupe, limite e ordenação.
const list = normalizeSuspensions([
  { id: 'b', start: '2026-10-01', end: '2026-10-02' },
  { id: 'a', start: '2026-09-01', end: '2026-09-02' },
  { id: 'a', start: '2026-09-01', end: '2026-09-02' }
]);
assert.deepEqual(list.map(item => item.id), ['a', 'b'], 'Duplicados são removidos e a lista é ordenada por início.');
const overflow = normalizeSuspensions(Array.from({ length: MAX_SUSPENSIONS + 10 }, (_, index) => ({
  id: `s${index}`, start: '2026-01-01', end: '2026-01-02'
})));
assert.equal(overflow.length, MAX_SUSPENSIONS, 'Limite de registros respeitado.');
console.log('✓ Dedupe, limite e ordenação.');

// Consulta por data (limites inclusivos).
const suspension = { id: 's', start: '2026-09-21', end: '2026-09-23', scope: 'PSPJ' };
assert.ok(suspensionForDate('2026-09-21', [suspension]), 'Início é inclusivo.');
assert.ok(suspensionForDate('2026-09-23', [suspension]), 'Fim é inclusivo.');
assert.equal(suspensionForDate('2026-09-20', [suspension]), null);
assert.equal(suspensionForDate('2026-09-24', [suspension]), null);
assert.equal(suspensionForDate('data-invalida', [suspension]), null);
assert.match(describeSuspension(suspension), /2026-09-21 a 2026-09-23 · PSPJ/);
assert.match(describeSuspension({ start: '2026-09-21', end: '2026-09-21', scope: 'DJEN' }), /^2026-09-21 · DJEN$/);
console.log('✓ Consulta por data e descrição.');

// Validação de estado: aceita lista válida e rejeita corrompida.
const baseState = { schemaVersion: CURRENT_SCHEMA_VERSION, settings: { suspensions: [suspension] } };
assert.equal(validateAppState(baseState).valid, true);
assert.throws(() => validateAppState({ schemaVersion: CURRENT_SCHEMA_VERSION, settings: { suspensions: 'x' } }), /settings\.suspensions/);
assert.throws(() => validateAppState({ schemaVersion: CURRENT_SCHEMA_VERSION, settings: { suspensions: [{ start: '2026-09-23', end: '2026-09-21' }] } }), /registro inválido/);
assert.throws(() => validateAppState({
  schemaVersion: CURRENT_SCHEMA_VERSION,
  settings: { suspensions: Array.from({ length: MAX_SUSPENSIONS + 1 }, () => ({ start: '2026-01-01', end: '2026-01-02' })) }
}), /excede o limite/);
console.log('✓ Validação do estado (settings.suspensions).');

console.log('\n>>> SUSPENSÕES: PASS <<<\n');
