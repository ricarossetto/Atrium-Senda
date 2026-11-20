import {
  parseDec,
  add,
  sub,
  mul,
  div,
  powInt,
  roundTo,
  toFixedString
} from './decimal.mjs';

export class SfhCivelError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SfhCivelError';
  }
}

const ONE = parseDec('1');
const HUNDRED = parseDec('100');
const ZERO = 0n;

function roundMoney(v) {
  return roundTo(v, 2, 'half-up');
}

function roundOrHalfDown(v, useHalfDown) {
  return roundTo(v, 2, useHalfDown ? 'half-down' : 'half-up');
}

export function buildSingleSfh(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new SfhCivelError('Parâmetros do financiamento SFH inválidos.');
  }
  const rawSys = String(input.sistema || 'SACRE').toUpperCase();
  const sistema = rawSys === 'SAC' ? 'SAC' : rawSys === 'PRICE' ? 'PRICE' : 'SACRE';
  const valorImovel = parseDec(input.valorImovel ?? '0');
  const valorFinanciado = parseDec(input.valorFinanciado ?? '0');
  const juAnualPct = parseDec(input.taxaJurosAnualNominalPct ?? '0');
  const trMensalPct = parseDec(input.trMensalPct ?? '0');
  const prazoAnos = Math.trunc(Number(input.prazoAnos ?? 0));
  const totalMeses = prazoAnos * 12;
  const cicloRecalc = Math.max(1, Math.trunc(Number(input.cicloRecalculoMeses ?? 12)));
  const mipPct = div(parseDec(input.mipPctMensal ?? '0'), HUNDRED);
  const dfiPct = div(parseDec(input.dfiPctMensal ?? '0'), HUNDRED);
  const tca = roundMoney(parseDec(input.taxaAdministracaoMensal ?? '0'));
  const useHalfDown = input.usarArredondamentoBancario !== false && input.usarTruncamentoDrCalc !== false;

  if (valorFinanciado <= ZERO || valorImovel <= ZERO) {
    throw new SfhCivelError('Os valores do imóvel e do financiamento devem ser positivos.');
  }
  if (!Number.isInteger(prazoAnos) || prazoAnos < 1 || prazoAnos > 40) {
    throw new SfhCivelError('O prazo do financiamento habitacional deve estar entre 1 e 40 anos.');
  }
  if (juAnualPct < ZERO || trMensalPct < ZERO) {
    throw new SfhCivelError('As taxas de juros e TR não podem ser negativas.');
  }

  const juAnual = div(juAnualPct, HUNDRED);
  const juMensal = div(juAnual, parseDec('12'));
  const tr = div(trMensalPct, HUNDRED);
  const taxaVerdadeiraMensalPct = mul(add(add(tr, juMensal), mul(tr, juMensal)), HUNDRED);
  const ltvPct = mul(div(valorFinanciado, valorImovel), HUNDRED);

  let saldo = roundMoney(valorFinanciado);
  const cronograma = [];
  let totalTr = ZERO;
  let totalAmort = ZERO;
  let totalJuros = ZERO;
  let totalEncargos = ZERO;
  let totalPago = ZERO;
  let maiorPrestacao = ZERO;
  let prestacaoCiclo = ZERO;

  for (let m = 1; m <= totalMeses; m += 1) {
    const anoContrato = Math.ceil(m / 12);
    const mesesRestantes = totalMeses - m + 1;

    if ((m - 1) % cicloRecalc === 0) {
      if (sistema === 'PRICE') {
        if (juMensal === ZERO) {
          prestacaoCiclo = roundOrHalfDown(div(saldo, parseDec(String(mesesRestantes))), useHalfDown);
        } else {
          const factor = powInt(add(ONE, juMensal), mesesRestantes);
          const rawP = div(mul(saldo, mul(juMensal, factor)), sub(factor, ONE));
          prestacaoCiclo = roundOrHalfDown(rawP, useHalfDown);
        }
      } else if (sistema === 'SACRE') {
        const ciclosRestantes = Math.max(1, Math.ceil(mesesRestantes / cicloRecalc));
        const amortCiclo = div(saldo, parseDec(String(ciclosRestantes)));
        const jurosAno = mul(juAnual, saldo);
        prestacaoCiclo = roundOrHalfDown(div(add(amortCiclo, jurosAno), parseDec(String(cicloRecalc))), useHalfDown);
      }
    }

    const saldoAnterior = saldo;
    const saldoComTr = roundOrHalfDown(mul(saldoAnterior, add(ONE, tr)), useHalfDown);
    const correcaoTr = roundMoney(sub(saldoComTr, saldoAnterior));

    let juros = roundOrHalfDown(mul(saldoComTr, juMensal), useHalfDown);
    let amortizacao;
    let prestacaoBase;
    const isLast = m === totalMeses;

    if (sistema === 'SAC') {
      amortizacao = isLast ? saldoComTr : roundOrHalfDown(div(saldoComTr, parseDec(String(mesesRestantes))), useHalfDown);
      prestacaoBase = roundMoney(add(amortizacao, juros));
    } else if (sistema === 'SACRE') {
      if (isLast) {
        amortizacao = saldoComTr;
        prestacaoBase = roundMoney(add(amortizacao, juros));
      } else {
        prestacaoBase = prestacaoCiclo;
        const amortCalc = roundOrHalfDown(sub(prestacaoBase, juros), useHalfDown);
        amortizacao = amortCalc > saldoComTr ? saldoComTr : amortCalc;
        if (amortCalc > saldoComTr) {
          prestacaoBase = roundMoney(add(amortizacao, juros));
        }
      }
    } else {
      if (isLast) {
        amortizacao = saldoComTr;
        prestacaoBase = roundMoney(add(amortizacao, juros));
      } else {
        prestacaoBase = prestacaoCiclo;
        amortizacao = roundOrHalfDown(sub(prestacaoBase, juros), useHalfDown);
        if (amortizacao > saldoComTr) {
          amortizacao = saldoComTr;
          prestacaoBase = roundMoney(add(amortizacao, juros));
        }
      }
    }

    const saldoFinal = isLast ? ZERO : roundOrHalfDown(sub(saldoComTr, amortizacao), useHalfDown);
    if (useHalfDown) {
      if (isLast) {
        amortizacao = saldoAnterior;
        juros = roundMoney(sub(prestacaoBase, amortizacao));
      } else {
        amortizacao = roundMoney(sub(saldoAnterior, saldoFinal));
        juros = roundMoney(sub(prestacaoBase, amortizacao));
      }
    }
    saldo = saldoFinal;

    const seguroMip = roundMoney(mul(saldoComTr, mipPct));
    const seguroDfi = roundMoney(mul(valorImovel, dfiPct));
    const prestacaoTotal = roundMoney(add(add(add(prestacaoBase, seguroMip), seguroDfi), tca));
    if (prestacaoTotal > maiorPrestacao) maiorPrestacao = prestacaoTotal;

    totalTr = add(totalTr, correcaoTr);
    totalAmort = add(totalAmort, amortizacao);
    totalJuros = add(totalJuros, juros);
    totalEncargos = add(totalEncargos, add(add(seguroMip, seguroDfi), tca));
    totalPago = add(totalPago, prestacaoTotal);

    cronograma.push({
      mes: m,
      anoContrato,
      saldoAtualizadoTr: toFixedString(saldoComTr, 2),
      correcaoTr: toFixedString(correcaoTr, 2),
      amortizacao: toFixedString(amortizacao, 2),
      juros: toFixedString(juros, 2),
      prestacaoBase: toFixedString(prestacaoBase, 2),
      seguroMip: toFixedString(seguroMip, 2),
      seguroDfi: toFixedString(seguroDfi, 2),
      taxaAdm: toFixedString(tca, 2),
      prestacaoTotal: toFixedString(prestacaoTotal, 2),
      saldoDevedorFinal: toFixedString(saldoFinal, 2)
    });
  }

  return {
    sistema,
    prazoMeses: totalMeses,
    resumo: {
      valorImovel: toFixedString(valorImovel, 2),
      valorFinanciado: toFixedString(valorFinanciado, 2),
      ltvPct: toFixedString(ltvPct, 1),
      taxaJurosAnualNominalPct: toFixedString(juAnualPct, 2),
      trMensalPct: toFixedString(trMensalPct, 4),
      taxaMensalEfetivaComTrPct: toFixedString(taxaVerdadeiraMensalPct, 4),
      primeiraPrestacaoTotal: cronograma[0]?.prestacaoTotal ?? '0.00',
      maiorPrestacaoTotal: toFixedString(maiorPrestacao, 2),
      ultimaPrestacaoTotal: cronograma[cronograma.length - 1]?.prestacaoTotal ?? '0.00',
      totalCorrecaoTr: toFixedString(totalTr, 2),
      totalAmortizado: toFixedString(totalAmort, 2),
      totalJuros: toFixedString(totalJuros, 2),
      totalSegurosETaxas: toFixedString(totalEncargos, 2),
      total: toFixedString(totalPago, 2)
    },
    cronograma
  };
}

export function buildSfhCalculation(input) {
  const sacre = buildSingleSfh({ ...input, sistema: 'SACRE' });
  const sac = buildSingleSfh({ ...input, sistema: 'SAC' });
  const price = buildSingleSfh({ ...input, sistema: 'PRICE' });
  const rawSys = String(input?.sistema || 'SACRE').toUpperCase();
  const principal = rawSys === 'SAC' ? sac : rawSys === 'PRICE' ? price : sacre;

  return {
    modalidade: 'financiamento_sfh',
    sistemaAtivo: principal.sistema,
    prazoMeses: principal.prazoMeses,
    resumo: principal.resumo,
    comparativo: {
      sacre: { resumo: sacre.resumo },
      sac: { resumo: sac.resumo },
      price: { resumo: price.resumo }
    },
    cronograma: principal.cronograma
  };
}
