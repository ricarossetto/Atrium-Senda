import assert from 'node:assert/strict';
import { looksLikeSecrecySignal } from '../lib/judicial/secrecy-signal.mjs';

console.log('\n=== SINAL TEXTUAL DE SIGILO (LISTAS DE PORTAIS) ===\n');

// Negativos: rótulos de nível 0 não podem virar sinal.
assert.equal(looksLikeSecrecySignal('Sem Sigilo (Nível 0)'), false);
assert.equal(looksLikeSecrecySignal('Sem sigilo'), false);
assert.equal(looksLikeSecrecySignal('Processo não sigiloso'), false);
assert.equal(looksLikeSecrecySignal('Sigilo: Não'), false);
assert.equal(looksLikeSecrecySignal('Sigilo: 0'), false);
assert.equal(looksLikeSecrecySignal('Nível de sigilo: 0 (Público)'), false);
assert.equal(looksLikeSecrecySignal(''), false);
assert.equal(looksLikeSecrecySignal(null), false);

// Positivos: indicadores explícitos.
assert.equal(looksLikeSecrecySignal('Segredo de Justiça'), true);
assert.equal(looksLikeSecrecySignal('Processo sigiloso'), true);
assert.equal(looksLikeSecrecySignal('Sigilo: Sim'), true);
assert.equal(looksLikeSecrecySignal('Sigilo: S'), true);
assert.equal(looksLikeSecrecySignal('Nível de sigilo: 2'), true);
assert.equal(looksLikeSecrecySignal('0000001-58.2099.8.21.0000 Cliente Teste Sigilo: 1'), true);
assert.equal(looksLikeSecrecySignal('0000001-58.2099.8.21.0000 Cliente Teste Sem Sigilo'), false);
console.log('✓ Negativos de nível 0 e positivos explícitos conferem.');

console.log('\n>>> SINAL DE SIGILO: PASS <<<\n');
