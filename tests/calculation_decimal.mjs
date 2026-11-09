import assert from 'node:assert/strict';
import {
  DecimalError,
  parseDec,
  add,
  sub,
  mul,
  div,
  neg,
  abs,
  cmp,
  eq,
  lt,
  gte,
  min,
  max,
  sum,
  roundTo,
  toFixedString,
  formatBR,
  toCents,
  fromCents,
  toNumber,
  factorFromPercent,
  percentOf,
  isDecimal,
  decimalScale
} from '../lib/calc/decimal.mjs';

assert.equal(decimalScale, 18, 'A escala decimal oficial deve ser 18 casas.');

assert.equal(toFixedString(add('0.1', '0.2'), 1), '0.3', 'Soma decimal não pode depender de float.');
assert.equal(toFixedString(add(0.1, 0.2), 18), '0.300000000000000000');
assert.equal(toFixedString(sub('1', '0.999999999999999999'), 18), '0.000000000000000001');

assert.equal(toFixedString('1.005', 2), '1.01', 'Moeda usa half-up.');
assert.equal(toFixedString('1.005', 2, 'half-even'), '1.00', 'NBR 5891 usa half-even em empate exato.');
assert.equal(toFixedString('2.675', 2), '2.68');
assert.equal(toFixedString('2.5', 0, 'half-even'), '2');
assert.equal(toFixedString('3.5', 0, 'half-even'), '4');
assert.equal(toFixedString('0.125', 2, 'half-even'), '0.12');
assert.equal(toFixedString('0.135', 2, 'half-even'), '0.14');
assert.equal(toFixedString('2.5000001', 0, 'half-even'), '3');
assert.equal(toFixedString('-2.5', 0, 'half-even'), '-2');
assert.equal(toFixedString('-3.5', 0, 'half-even'), '-4');
assert.equal(toFixedString('-1.005', 2, 'half-even'), '-1.00');

assert.equal(toFixedString(mul('1234.56', '1.0035'), 5), '1238.88096');
assert.equal(toFixedString(mul('1234.56', '1.0035'), 2), '1238.88');
assert.equal(toFixedString(mul(mul('1.01', '1.01'), '1.01'), 6), '1.030301');
assert.equal(toFixedString(div(1, 3), 6), '0.333333');
assert.equal(toFixedString(div(2, 3), 6), '0.666667');
assert.throws(() => div(10, 0), DecimalError);

assert.equal(formatBR(parseDec('1,5')), '1,50', 'Vírgula decimal deve ser aceita como entrada.');
assert.equal(toFixedString(parseDec('0.0000000000000000005'), 18), '0.000000000000000001', 'Excesso de casas é arredondado, não truncado.');

assert.throws(() => parseDec('1,2,3'), DecimalError);
assert.throws(() => parseDec('abc'), DecimalError);
assert.throws(() => parseDec(''), DecimalError);
assert.throws(() => parseDec('3.'), DecimalError);
assert.throws(() => parseDec(Number.NaN), DecimalError);
assert.throws(() => parseDec(Number.POSITIVE_INFINITY), DecimalError);
assert.throws(() => parseDec(1e-7), DecimalError, 'Notação científica não é aceita como valor decimal.');
assert.throws(() => parseDec('9'.repeat(49)), DecimalError);
assert.throws(() => parseDec({}), DecimalError);

assert.equal(toCents('2.675'), 268n);
assert.equal(typeof toCents('2.675'), 'bigint');
assert.equal(formatBR(fromCents(268)), '2,68');
assert.equal(toCents(fromCents(-5)), -5n);
assert.throws(() => fromCents(1.5), DecimalError);
assert.throws(() => fromCents('5'), DecimalError);

assert.equal(formatBR(1234567.891), '1.234.567,89');
assert.equal(formatBR('-45.5'), '-45,50');
assert.equal(formatBR(0), '0,00');
assert.equal(formatBR('-0.001'), '0,00');

assert.equal(toFixedString(neg('12.5')), '-12.50');
assert.equal(toFixedString(abs('-12.5')), '12.50');
assert.equal(cmp('2', '10'), -1);
assert.equal(cmp('10', '10'), 0);
assert.equal(eq('1.000', '1'), true);
assert.equal(lt('1', '2'), true);
assert.equal(gte('2', '2'), true);
assert.equal(toFixedString(min('2', '3')), '2.00');
assert.equal(toFixedString(max('2', '3')), '3.00');
assert.equal(toFixedString(sum(['0.1', '0.2', '0.3']), 1), '0.6');
assert.throws(() => sum('1'), DecimalError);

assert.equal(toFixedString(factorFromPercent('1'), 4), '1.0100');
assert.equal(toFixedString(percentOf('1000', '1.5')), '15.00');
assert.equal(toFixedString(percentOf('100', '0.605306'), 6), '0.605306');
assert.equal(toFixedString(roundTo('1.23456', 3), 3), '1.235');
assert.throws(() => roundTo('1', 19), DecimalError);
assert.throws(() => roundTo('1', 2, 'nearest'), DecimalError);

assert.equal(isDecimal(parseDec('1')), true);
assert.equal(isDecimal(1), false);
assert.equal(toNumber(parseDec('123.45')), 123.45);
assert.equal(toNumber(parseDec('0.1')), 0.1);

console.log('Aritmética decimal aprovada: exatidão, half-up, NBR 5891 half-even, centavos, formatação e guardas PASS.');
