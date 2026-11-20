import {
  parseDec,
  add,
  sub,
  mul,
  div,
  powInt,
  nthRoot,
  roundTo,
  toFixedString
} from './decimal.mjs';

export class AmortizacaoCivelError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AmortizacaoCivelError';
  }
}

const ONE = parseDec('1');
const HUNDRED = parseDec('100');
const ZERO = 0n;

export function resolveMonthlyEffectiveRate(ratePct, periodicidade = 'mensal', tipoTaxaAnual = 'efetiva') {
  const r = div(parseDec(ratePct), HUNDRED);
  if (periodicidade === 'mensal') return r;
  if (periodicidade === 'semestral') {
    return tipoTaxaAnual === 'nominal' ? div(r, parseDec('6')) : sub(nthRoot(add(ONE, r), 6), ONE);
  }
  if (periodicidade === 'anual') {
    return tipoTaxaAnual === 'nominal' ? div(r, parseDec('12')) : sub(nthRoot(add(ONE, r), 12), ONE);
  }
  throw new AmortizacaoCivelError(`Periodicidade da taxa inválida: ${periodicidade}.`);
}

function solveIrrMonthlyPct(netLoanReceived, cashflows) {
  let low = parseDec('0');
  let high = parseDec('0.50');
  for (let iter = 0; iter < 55; iter += 1) {
    const mid = div(add(low, high), parseDec('2'));
    let npv = -netLoanReceived;
    const onePlus = add(ONE, mid);
    let discount = ONE;
    for (let t = 0; t < cashflows.length; t += 1) {
      discount = mul(discount, onePlus);
      npv = add(npv, div(cashflows[t], discount));
    }
    if (npv > ZERO) low = mid;
    else high = mid;
  }
  return mul(div(add(low, high), parseDec('2')), HUNDRED);
}

export function buildSingleAmortization(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new AmortizacaoCivelError('Parâmetros de amortização inválidos.');
  }
  const sistema = String(input.sistema || 'PRICE').toUpperCase() === 'SAC' ? 'SAC' : 'PRICE';
  const valorBem = parseDec(input.valorBem ?? input.valorFinanciado ?? '0');
  const entrada = parseDec(input.entrada ?? '0');
  const tarifas = parseDec(input.tarifasFinanciadas ?? '0');
  const prazo = Math.trunc(Number(input.prazoMeses ?? 0));
  const carencia = Math.max(0, Math.trunc(Number(input.carenciaMeses ?? 0)));
  const modoCarencia = carencia > 0 ? (input.modoCarencia || 'juros_pagos') : 'sem';
  const entradaNoAto = input.entradaNoAto === true;

  if (!Number.isInteger(prazo) || prazo < 1 || prazo > 600) {
    throw new AmortizacaoCivelError('O prazo deve estar entre 1 e 600 meses.');
  }
  if (valorBem <= ZERO) throw new AmortizacaoCivelError('O valor do bem deve ser maior que zero.');
  if (entrada < ZERO || entrada >= valorBem) {
    throw new AmortizacaoCivelError('A entrada deve ser menor que o valor do bem e não negativa.');
  }
  if (tarifas < ZERO) throw new AmortizacaoCivelError('As tarifas financiadas não podem ser negativas.');

  const taxaJurosPct = parseDec(input.taxaJuros ?? '0');
  if (taxaJurosPct < ZERO) throw new AmortizacaoCivelError('A taxa de juros não pode ser negativa.');

  const r = resolveMonthlyEffectiveRate(
    taxaJurosPct,
    input.periodicidadeTaxa || 'mensal',
    input.tipoTaxaAnual || 'efetiva'
  );
  const taxaMensalEfetivaPct = mul(r, HUNDRED);
  const taxaAnualEquivalentePct = mul(sub(powInt(add(ONE, r), 12), ONE), HUNDRED);

  const valorFinanciadoBase = roundTo(add(sub(valorBem, entrada), tarifas), 2, 'half-up');
  let saldo = valorFinanciadoBase;
  const cronograma = [];
  let totalJuros = ZERO;
  let totalAmortizado = ZERO;
  let totalPago = ZERO;

  for (let c = 1; c <= carencia; c += 1) {
    const saldoIni = saldo;
    const jurosMes = roundTo(mul(saldoIni, r), 2, 'half-up');
    if (modoCarencia === 'juros_capitalizados') {
      saldo = roundTo(add(saldoIni, jurosMes), 2, 'half-up');
      cronograma.push({
        parcela: c,
        fase: 'carencia',
        saldoInicial: toFixedString(saldoIni, 2),
        juros: toFixedString(jurosMes, 2),
        amortizacao: '0.00',
        prestacao: '0.00',
        saldoFinal: toFixedString(saldo, 2),
        prestacaoDec: ZERO
      });
    } else {
      totalJuros = add(totalJuros, jurosMes);
      totalPago = add(totalPago, jurosMes);
      cronograma.push({
        parcela: c,
        fase: 'carencia',
        saldoInicial: toFixedString(saldoIni, 2),
        juros: toFixedString(jurosMes, 2),
        amortizacao: '0.00',
        prestacao: toFixedString(jurosMes, 2),
        saldoFinal: toFixedString(saldoIni, 2),
        prestacaoDec: jurosMes
      });
    }
  }

  const saldoAposCarencia = saldo;

  if (sistema === 'PRICE') {
    let pmtFixa;
    if (r === ZERO) {
      pmtFixa = roundTo(div(saldoAposCarencia, parseDec(String(prazo))), 2, 'half-up');
    } else {
      const factorPow = powInt(add(ONE, r), prazo);
      const num = mul(r, factorPow);
      const den = sub(factorPow, ONE);
      let rawPmt = mul(saldoAposCarencia, div(num, den));
      if (entradaNoAto && entrada === ZERO) {
        rawPmt = div(rawPmt, add(ONE, r));
      }
      pmtFixa = roundTo(rawPmt, 2, 'half-up');
    }

    for (let k = 1; k <= prazo; k += 1) {
      const saldoIni = saldo;
      const isFirstAnticipated = k === 1 && entradaNoAto && entrada === ZERO;
      const juros = isFirstAnticipated ? ZERO : roundTo(mul(saldoIni, r), 2, 'half-up');
      let amortizacao;
      let prestacao;
      let saldoFinal;
      if (k === prazo) {
        amortizacao = saldoIni;
        prestacao = roundTo(add(amortizacao, juros), 2, 'half-up');
        saldoFinal = ZERO;
      } else {
        prestacao = pmtFixa;
        amortizacao = roundTo(sub(prestacao, juros), 2, 'half-up');
        saldoFinal = roundTo(sub(saldoIni, amortizacao), 2, 'half-up');
      }
      saldo = saldoFinal;
      totalJuros = add(totalJuros, juros);
      totalAmortizado = add(totalAmortizado, amortizacao);
      totalPago = add(totalPago, prestacao);
      cronograma.push({
        parcela: carencia + k,
        fase: 'amortizacao',
        saldoInicial: toFixedString(saldoIni, 2),
        juros: toFixedString(juros, 2),
        amortizacao: toFixedString(amortizacao, 2),
        prestacao: toFixedString(prestacao, 2),
        saldoFinal: toFixedString(saldoFinal, 2),
        prestacaoDec: prestacao
      });
    }
  } else {
    // SAC com absorção de centavos na última parcela (sem 13ª parcela fantasma)
    const amortConst = roundTo(div(saldoAposCarencia, parseDec(String(prazo))), 2, 'half-up');
    for (let k = 1; k <= prazo; k += 1) {
      const saldoIni = saldo;
      const juros = roundTo(mul(saldoIni, r), 2, 'half-up');
      const amortizacao = k === prazo ? saldoIni : amortConst;
      const prestacao = roundTo(add(amortizacao, juros), 2, 'half-up');
      const saldoFinal = k === prazo ? ZERO : roundTo(sub(saldoIni, amortizacao), 2, 'half-up');
      saldo = saldoFinal;
      totalJuros = add(totalJuros, juros);
      totalAmortizado = add(totalAmortizado, amortizacao);
      totalPago = add(totalPago, prestacao);
      cronograma.push({
        parcela: carencia + k,
        fase: 'amortizacao',
        saldoInicial: toFixedString(saldoIni, 2),
        juros: toFixedString(juros, 2),
        amortizacao: toFixedString(amortizacao, 2),
        prestacao: toFixedString(prestacao, 2),
        saldoFinal: toFixedString(saldoFinal, 2),
        prestacaoDec: prestacao
      });
    }
  }

  const amortRows = cronograma.filter(row => row.fase === 'amortizacao');
  const primeiraPrestacao = amortRows[0]?.prestacaoDec ?? ZERO;
  const ultimaPrestacao = amortRows[amortRows.length - 1]?.prestacaoDec ?? ZERO;
  const netReceived = sub(valorBem, entrada);
  const cetPct = tarifas > ZERO || carencia > 0
    ? solveIrrMonthlyPct(netReceived, cronograma.map(row => row.prestacaoDec))
    : taxaMensalEfetivaPct;

  return {
    sistema,
    resumo: {
      valorFinanciadoBase: toFixedString(valorFinanciadoBase, 2),
      saldoAposCarencia: toFixedString(saldoAposCarencia, 2),
      taxaMensalEfetivaPct: toFixedString(taxaMensalEfetivaPct, 4),
      taxaAnualEquivalentePct: toFixedString(taxaAnualEquivalentePct, 4),
      cetSimplificadoMensalPct: toFixedString(cetPct, 4),
      primeiraPrestacao: toFixedString(primeiraPrestacao, 2),
      ultimaPrestacao: toFixedString(ultimaPrestacao, 2),
      totalJuros: toFixedString(totalJuros, 2),
      totalAmortizado: toFixedString(totalAmortizado, 2),
      total: toFixedString(totalPago, 2)
    },
    totalJurosDec: totalJuros,
    cronograma: cronograma.map(({ prestacaoDec, ...rest }) => rest)
  };
}

export function buildAmortizacaoCalculation(input) {
  const price = buildSingleAmortization({ ...input, sistema: 'PRICE' });
  const sac = buildSingleAmortization({ ...input, sistema: 'SAC' });
  const sistema = String(input?.sistema || 'COMPARATIVO').toUpperCase();
  const principal = sistema === 'SAC' ? sac : price;
  const economiaJurosSac = sub(price.totalJurosDec, sac.totalJurosDec);

  return {
    modalidade: 'amortizacao_price_sac',
    sistemaAtivo: principal.sistema,
    modoVisao: sistema === 'PRICE' || sistema === 'SAC' ? sistema : 'COMPARATIVO',
    resumo: {
      ...principal.resumo,
      economiaJurosSac: toFixedString(economiaJurosSac, 2)
    },
    comparativo: {
      price: { resumo: price.resumo, cronograma: price.cronograma },
      sac: { resumo: sac.resumo, cronograma: sac.cronograma },
      economiaJurosSac: toFixedString(economiaJurosSac, 2)
    },
    cronograma: principal.cronograma
  };
}
