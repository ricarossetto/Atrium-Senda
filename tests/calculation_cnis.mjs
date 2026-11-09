import assert from 'node:assert/strict';
import { CnisError, normalizarValorMonetario, parseCnisText } from '../lib/calc/cnis.mjs';

assert.equal(normalizarValorMonetario('1.234,56'), '1234.56');
assert.equal(normalizarValorMonetario('2.000,00'), '2000.00');
assert.equal(normalizarValorMonetario('1234,50'), '1234.50');
assert.equal(normalizarValorMonetario('1234.50'), '1234.50');
assert.equal(normalizarValorMonetario('R$ 3.500,00'), '3500.00');
assert.throws(() => normalizarValorMonetario('abc'), CnisError);

const texto = [
  'Extrato Previdenciário (CNIS) — fixture sintética',
  'Empresa Exemplo Ltda — 01/2024 1.234,56 PEXT',
  'Empresa Exemplo Ltda — 02/2024 2.000,00',
  '03/2024 — sem remuneração informada',
  'Total: 3.234,56',
  'Empresa Exemplo Ltda — 01/2024 9.999,99',
  'Empresa Exemplo Ltda — DATA INVÁLIDA 500,00',
  'Empresa Exemplo Ltda — 04-2024 R$ 1.500,00'
].join('\n');
const parsed = parseCnisText(texto);
assert.deepEqual(parsed.competencias, [
  { competencia: '2024-01', salario: '1234.56' },
  { competencia: '2024-02', salario: '2000.00' },
  { competencia: '2024-04', salario: '1500.00' }
]);
assert.deepEqual(parsed.resumo, { reconhecidas: 3, ignoradas: 4, duplicadas: 1 });
assert.ok(parsed.avisos.some(aviso => /nominais/.test(aviso)));
assert.ok(parsed.avisos.some(aviso => /ignoradas/.test(aviso)));
assert.ok(parsed.avisos.some(aviso => /duplicada/.test(aviso)));
assert.doesNotThrow(() => JSON.stringify(parsed));

const simples = parseCnisText('01/2025 1.000,00');
assert.equal(simples.competencias.length, 1);
assert.equal(simples.resumo.duplicadas, 0);
assert.equal(simples.resumo.ignoradas, 0);

assert.throws(() => parseCnisText(''), CnisError);
assert.throws(() => parseCnisText('texto sem nenhuma linha reconhecível'), CnisError);
assert.throws(() => parseCnisText('x'.repeat(400_001)), CnisError);
const muitas = Array.from({ length: 601 }, (_, index) => {
  const mes = String((index % 12) + 1).padStart(2, '0');
  const ano = 1994 + Math.floor(index / 12);
  return `${mes}/${ano} 1.000,00`;
}).join('\n');
assert.throws(() => parseCnisText(muitas), CnisError, 'Mais de 600 competências precisa falhar com orientação.');

console.log('Parser de CNIS aprovado: competências, valores brasileiros, indicadores, duplicadas, limites e avisos PASS.');
