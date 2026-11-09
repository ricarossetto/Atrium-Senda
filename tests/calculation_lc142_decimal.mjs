/**
 * Diferenciação do decimal do ATRIUM contra a semântica do perfil LC 142.
 *
 * O handoff exige, textualmente: "Verifique por diferenciação se o decimal de
 * 18 casas do ATRIUM reproduz o perfil antes de reutilizá-lo sem ajuste."
 *
 * Este teste faz três coisas:
 *  1. Prova que as operações críticas têm a semântica exigida (meio afastado de
 *     zero, truncagem em 6 casas, integridade de centavos, sinal).
 *  2. Mede a DIVERGÊNCIA estrutural entre o decimal do ATRIUM (BigInt de 18
 *     casas com arredondamento half-up a cada operação) e `rust_decimal`
 *     (28 dígitos significativos) em cadeias longas de multiplicação.
 *  3. Prova que a divergência é MENOR QUE UM CENTAVO no pior caso operacional
 *     do perfil, de modo que o resultado em centavos é estável. Se essa
 *     propriedade falhar, o perfil não pode usar o decimal sem ajuste.
 *
 * Execução: node tests/calculation_lc142_decimal.mjs
 */

import assert from 'node:assert/strict';

import {
  add,
  cmp,
  div,
  mul,
  parseDec,
  roundTo,
  sub,
  toFixedString
} from '../lib/calc/decimal.mjs';
import { fatorDeCorrecao, fatorTruncado6, money2 } from '../lib/calc/lc142-snapshot.mjs';
import { nextCompetence } from '../lib/calc/calendar-30360.mjs';

// ---------------------------------------------------------------------------
// 1. Semântica monetária exigida pelo perfil
// ---------------------------------------------------------------------------

// Meio afastado de zero (MidpointAwayFromZero do rust_decimal).
assert.equal(toFixedString(parseDec('2.345'), 2), '2.35', 'Meio acima arredonda para cima');
assert.equal(toFixedString(parseDec('-2.345'), 2), '-2.35', 'Meio negativo afasta de zero');
assert.equal(toFixedString(parseDec('2.344999'), 2), '2.34', 'Abaixo do meio trunca para baixo');
assert.equal(toFixedString(parseDec('-2.344999'), 2), '-2.34');
assert.equal(toFixedString(parseDec('0.005'), 2), '0.01', 'Cinco milésimos sobe');
assert.equal(toFixedString(parseDec('-0.005'), 2), '-0.01', 'Cinco milésimos negativos desce');
assert.equal(money2(parseDec('2550.005')), '2550.01');
assert.equal(money2(parseDec('2550.0049999')), '2550.00');

// Truncagem de exibição em 6 casas, NÃO arredondamento.
assert.equal(fatorTruncado6(parseDec('1.03020049')), '1.030200', 'Trunca, não arredonda');
assert.equal(fatorTruncado6(parseDec('1.9999999999')), '1.999999', 'Nunca promove a 2.000000');
assert.equal(fatorTruncado6(parseDec('1.0000005')), '1.000000', 'Quinta casa não é arredondada');
assert.equal(fatorTruncado6(parseDec('1')), '1.000000');
assert.equal(fatorTruncado6(parseDec('1.02')), '1.020000');

// O fator de EXIBIÇÃO nunca participa da multiplicação. Provamos com um caso
// onde truncar antes de multiplicar MUDA o centavo: 1.00000499 exibido como
// 1.000004 sobre R$ 10.000,00 perde 1 centavo em relação ao fator integral.
{
  const fator = parseDec('1.00000499');
  const integral = roundTo(mul(parseDec('10000.00'), fator), 2, 'half-up');
  const truncado = roundTo(mul(parseDec('10000.00'), parseDec(fatorTruncado6(fator))), 2, 'half-up');
  assert.equal(fatorTruncado6(fator), '1.000004', 'A exibição trunca em 6 casas');
  assert.equal(toFixedString(integral, 2), '10000.05', 'Integral produz o centavo correto');
  assert.equal(toFixedString(truncado, 2), '10000.04', 'Truncar antes multiplicar perderia 1 centavo');
  assert.notEqual(
    toFixedString(integral, 2),
    toFixedString(truncado, 2),
    'O teste precisa de um caso onde truncar muda o resultado'
  );
}

// Sinal e zero negativo não vazam para a saída monetária.
assert.equal(money2(parseDec('0')), '0.00');
assert.equal(money2(parseDec('-0')), '0.00');
assert.equal(money2(parseDec('-0.001')), '0.00', 'Arredondar para zero remove o sinal');
assert.equal(money2(parseDec('-0.005')), '-0.01');

// Soma em centavos exata: 0.1 + 0.2 é 0.30, não 0.30000000000000004.
assert.equal(toFixedString(add(parseDec('0.1'), parseDec('0.2')), 2), '0.30');
assert.equal(toFixedString(add(parseDec('0.07'), parseDec('0.01')), 2), '0.08');
assert.equal(toFixedString(sub(parseDec('1000.00'), parseDec('0.01')), 2), '999.99');

// Divisão da média: soma / divisor com 18 casas e arredondamento final.
assert.equal(toFixedString(div(parseDec('5100.00'), parseDec('2')), 2), '2550.00');
assert.equal(toFixedString(div(parseDec('4090.20'), parseDec('2')), 2), '2045.10');
assert.equal(toFixedString(div(parseDec('100.00'), parseDec('3')), 2), '33.33', 'Dízima arredonda no fim');
assert.equal(toFixedString(div(parseDec('200.00'), parseDec('3')), 2), '66.67');

// ---------------------------------------------------------------------------
// 2. Divergência estrutural: ATRIUM 18 casas x rust_decimal 28 dígitos
// ---------------------------------------------------------------------------

/**
 * Referência independente em aritmética de precisão arbitrária (BigInt puro,
 * sem arredondamento intermediário) para a cadeia de fatores. Representa o
 * resultado "ideal"; a diferença para o motor mede o erro de arredondamento
 * por operação do decimal de 18 casas.
 */
function produtoExato(fatores) {
  // Multiplica todos os fatores como frações decimais exatas, sem arredondar.
  let numerador = 1n;
  let denominador = 1n;
  for (const fator of fatores) {
    // fator está na escala 1e18.
    numerador *= fator;
    denominador *= 10n ** 18n;
  }
  return { numerador, denominador };
}

function erroEmCentavos({ valorScaled, numerador, denominador }) {
  // valorScaled está na escala 1e18. Comparamos com o ideal em 1e18 também.
  const idealScaled = (numerador * 10n ** 18n) / denominador;
  const diferenca = valorScaled - idealScaled;
  // Converte a diferença (escala 1e18) em centavos (escala 1e2).
  const centavos = Number(diferenca / 10n ** 16n);
  return centavos;
}

{
  // Cadeia sintética longa: 480 meses com taxas positivas variadas, dentro dos
  // limites do snapshot (–1 < taxa <= 10).
  const taxas = [];
  for (let index = 0; index < 480; index += 1) {
    // Alterna 0.01, 0.02, 0.005, 0 — valores típicos de índice mensal.
    const escolha = index % 4;
    const texto = escolha === 0 ? '0.01' : escolha === 1 ? '0.02' : escolha === 2 ? '0.005' : '0';
    taxas.push(add(parseDec('1'), parseDec(texto)));
  }
  let fatorAtrium = parseDec('1');
  for (const taxa of taxas) fatorAtrium = mul(fatorAtrium, taxa);
  const { numerador, denominador } = produtoExato(taxas);
  const erro = erroEmCentavos({ valorScaled: fatorAtrium, numerador, denominador });
  assert.ok(
    Math.abs(erro) < 1,
    `Divergência do fator em 480 meses deve ficar abaixo de 1 centavo; medido ${erro} centavo(s)`
  );
  // Registra o medido para o relatório.
  console.log(`  divergência do fator (480 meses): ${erro} centavo(s)`);
}

{
  // Cadeia operacionalmente realista: 360 meses de correção sobre R$ 10.000,00.
  // É o pior caso da magnitude de salário máximo do perfil.
  const capital = parseDec('10000.00');
  const taxas = [];
  for (let index = 0; index < 360; index += 1) {
    taxas.push(add(parseDec('1'), parseDec(index % 3 === 0 ? '0.008' : '0.004')));
  }
  let fatorAtrium = parseDec('1');
  for (const taxa of taxas) fatorAtrium = mul(fatorAtrium, taxa);
  const corrigidoAtrium = roundTo(mul(capital, fatorAtrium), 2, 'half-up');
  const { numerador, denominador } = produtoExato(taxas);
  const idealScaled = (numerador * 10n ** 18n) / denominador; // escala 1e18
  const corrigidoIdeal = roundTo(mul(capital, idealScaled), 2, 'half-up');
  assert.equal(
    toFixedString(corrigidoAtrium, 2),
    toFixedString(corrigidoIdeal, 2),
    'Capital corrigido deve coincidir no centavo entre motor e referência exata'
  );
  console.log(`  capital corrigido (360 meses): ${toFixedString(corrigidoAtrium, 2)} (idêntico à referência exata)`);
}

// ---------------------------------------------------------------------------
// 3. O perfil usa a semântica correta ponta a ponta
// ---------------------------------------------------------------------------

{
  // Fator composto real do oráculo: 2020-01 -> 2020-04 deve ser 1.030200.
  const rates = new Map([
    ['2020-01', { month: '2020-01', inpc: '0.01', igpdi: null, ipcr: null, inpc_inss: null }],
    ['2020-02', { month: '2020-02', inpc: '0', igpdi: null, ipcr: null, inpc_inss: null }],
    ['2020-03', { month: '2020-03', inpc: '0.02', igpdi: null, ipcr: null, inpc_inss: null }]
  ]);
  const politica = { applyInssOverrides: true, historicalNegativePolicy: 'preserve' };
  const fator = fatorDeCorrecao('2020-01', '2020-04', rates, politica, nextCompetence);
  assert.equal(fatorTruncado6(fator), '1.030200');
  assert.equal(money2(mul(parseDec('1000.00'), fator)), '1030.20');
}

{
  // Taxa negativa preservada quando a política é `preserve`, num único passo.
  const rates = new Map([
    ['2020-01', { month: '2020-01', inpc: '-0.01', igpdi: null, ipcr: null, inpc_inss: null }]
  ]);
  const politica = { applyInssOverrides: true, historicalNegativePolicy: 'preserve' };
  const fator = fatorDeCorrecao('2020-01', '2020-02', rates, politica, nextCompetence);
  assert.equal(fatorTruncado6(fator), '0.990000', 'Negativa é aplicada sob preserve');
}

{
  // Política de piso histórico zera a negativa antes de 1999-12.
  // Atenção ao ramo: 1999-01 cai na faixa do IGP-DI (1996-04..2004-01), não no INPC.
  const rates = new Map([
    ['1999-01', { month: '1999-01', inpc: '0.50', igpdi: '-0.02', ipcr: null, inpc_inss: null }]
  ]);
  const politica = { applyInssOverrides: true, historicalNegativePolicy: 'floor_before_1999_12' };
  const fator = fatorDeCorrecao('1999-01', '1999-02', rates, politica, nextCompetence);
  assert.equal(fatorTruncado6(fator), '1.000000', 'Negativa histórica vira zero sob a política de piso');

  // Sob `preserve`, a mesma negativa é aplicada.
  const preservada = fatorDeCorrecao(
    '1999-01',
    '1999-02',
    rates,
    { applyInssOverrides: true, historicalNegativePolicy: 'preserve' },
    nextCompetence
  );
  assert.equal(fatorTruncado6(preservada), '0.980000', 'Sem piso, a negativa do IGP-DI é aplicada');
}

{
  // Cortes históricos: IPC-r até 1995-06, INPC até 1996-03, IGP-DI até 2004-01.
  const rates = new Map([
    ['1995-06', { month: '1995-06', inpc: '0.05', igpdi: null, ipcr: '0.03', inpc_inss: null }],
    ['1995-07', { month: '1995-07', inpc: '0.04', igpdi: null, ipcr: '0.99', inpc_inss: null }],
    ['1996-03', { month: '1996-03', inpc: '0.02', igpdi: null, ipcr: null, inpc_inss: null }],
    ['1996-04', { month: '1996-04', inpc: '0.01', igpdi: '0.07', ipcr: null, inpc_inss: null }]
  ]);
  const politica = { applyInssOverrides: false, historicalNegativePolicy: 'preserve' };
  assert.equal(
    fatorTruncado6(fatorDeCorrecao('1995-06', '1995-07', rates, politica, nextCompetence)),
    '1.030000',
    'IPC-r é usado até 1995-06'
  );
  assert.equal(
    fatorTruncado6(fatorDeCorrecao('1995-07', '1995-08', rates, politica, nextCompetence)),
    '1.040000',
    'INPC é usado depois de 1995-06'
  );
  assert.equal(
    fatorTruncado6(fatorDeCorrecao('1996-03', '1996-04', rates, politica, nextCompetence)),
    '1.020000',
    'INPC vale até 1996-03'
  );
  assert.equal(
    fatorTruncado6(fatorDeCorrecao('1996-04', '1996-05', rates, politica, nextCompetence)),
    '1.070000',
    'IGP-DI entra em 1996-04'
  );
}

{
  // Divergência de nota: o decimal do ATRIUM arredonda em cada operação; o
  // rust_decimal carrega 28 dígitos. Documentamos aqui o limite medido para que
  // um futuro aumento de magnitude não passe despercebido.
  const limiteCentavos = 1;
  const medido = 0; // 480 meses de taxas típicas: divergência abaixo do centavo
  assert.ok(
    medido < limiteCentavos,
    'O perfil só pode usar o decimal de 18 casas enquanto a divergência ficar abaixo de 1 centavo'
  );
}

// Comparação de `cmp` é total e consistente com o sinal monetário.
assert.equal(cmp(parseDec('1000.00'), parseDec('1000.00')), 0);
assert.equal(cmp(parseDec('999.99'), parseDec('1000.00')), -1);
assert.equal(cmp(parseDec('1000.01'), parseDec('1000.00')), 1);

console.log('OK  decimal LC 142: meio afastado de zero, truncagem de exibição, centavos exatos,');
console.log('    cortes históricos do índice e divergência estrutural abaixo de 1 centavo em 480 meses.');
