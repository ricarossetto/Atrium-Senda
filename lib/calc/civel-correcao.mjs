import {
  parseDec,
  add,
  sub,
  mul,
  div,
  powInt,
  nthRoot,
  roundTo,
  toFixedString,
  percentOf
} from './decimal.mjs';
import {
  partsFromIso,
  daysBetween,
  daysInMonth,
  monthAfter,
  periodsInRange
} from './calendar.mjs';

export class CorrecaoCivelError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CorrecaoCivelError';
  }
}

const ONE = parseDec('1');
const HUNDRED = parseDec('100');
const ZERO = 0n;

function buildHalfOpenMonthSlices(startIso, endIso) {
  const start = partsFromIso(startIso, 'data inicial');
  const end = partsFromIso(endIso, 'data final');
  if (startIso >= endIso) return [];
  const startPeriod = startIso.slice(0, 7);
  const endPeriod = endIso.slice(0, 7);
  if (startPeriod === endPeriod) {
    const dim = daysInMonth(startPeriod);
    const covered = end.day - start.day;
    return covered > 0 ? [{ period: startPeriod, daysCovered: covered, daysInMonth: dim }] : [];
  }
  const periods = periodsInRange(startPeriod, endPeriod);
  const slices = [];
  for (let i = 0; i < periods.length; i += 1) {
    const p = periods[i];
    const dim = daysInMonth(p);
    let covered = dim;
    if (i === 0) covered = dim - start.day + 1;
    else if (i === periods.length - 1) covered = end.day - 1;
    if (covered > 0) slices.push({ period: p, daysCovered: covered, daysInMonth: dim });
  }
  return slices;
}

function buildFullMonthSlices(startIso, endIso) {
  if (startIso >= endIso) return [];
  const start = partsFromIso(startIso, 'data inicial');
  const end = partsFromIso(endIso, 'data final');
  const startPeriod = startIso.slice(0, 7);
  let lastPeriod = endIso.slice(0, 7);
  if (end.day === 1 && lastPeriod > startPeriod) {
    // Exclui o mês final quando termina no dia 01 (ex.: 01/01/2024 a 01/01/2025 -> jan..dez/2024)
    const [ey, em] = lastPeriod.split('-').map(Number);
    lastPeriod = em === 1 ? `${ey - 1}-12` : `${ey}-${String(em - 1).padStart(2, '0')}`;
  }
  if (lastPeriod < startPeriod) {
    const dim = daysInMonth(startPeriod);
    return [{ period: startPeriod, daysCovered: dim, daysInMonth: dim }];
  }
  return periodsInRange(startPeriod, lastPeriod).map(period => {
    const dim = daysInMonth(period);
    return { period, daysCovered: dim, daysInMonth: dim };
  });
}

function toRateMap(rows, serieKey) {
  if (rows instanceof Map) return rows;
  if (!Array.isArray(rows)) throw new CorrecaoCivelError(`Série ${serieKey} inválida.`);
  const map = new Map();
  for (const row of rows) {
    if (!row || typeof row.period !== 'string') continue;
    map.set(row.period, typeof row.value === 'bigint' ? row.value : parseDec(row.value));
  }
  return map;
}

export function computeCorrecaoChain({
  serie,
  dataInicial,
  dataFinal,
  proRata = true,
  expurgarDeflacao = false,
  seriesRows
}) {
  if (!serie) throw new CorrecaoCivelError('Informe o índice de correção monetária.');
  partsFromIso(dataInicial, 'data inicial');
  partsFromIso(dataFinal, 'data final');
  if (typeof seriesRows !== 'function') {
    throw new CorrecaoCivelError('Fonte de séries obrigatória para calcular a correção.');
  }

  const isReverse = dataFinal < dataInicial;
  const lowDate = isReverse ? dataFinal : dataInicial;
  const highDate = isReverse ? dataInicial : dataFinal;
  const slices = proRata ? buildHalfOpenMonthSlices(lowDate, highDate) : buildFullMonthSlices(lowDate, highDate);
  const rateMap = toRateMap(seriesRows(serie), serie);

  let factor = ONE;
  const passos = [];
  for (const slice of slices) {
    const rawPct = rateMap.get(slice.period);
    if (rawPct === undefined) {
      throw new CorrecaoCivelError(`Competência ${slice.period} indisponível para a série ${serie}.`);
    }
    const effectivePct = expurgarDeflacao && rawPct < ZERO ? ZERO : rawPct;
    let stepFactor;
    let appliedPct;
    if (slice.daysCovered === slice.daysInMonth) {
      appliedPct = effectivePct;
      stepFactor = add(ONE, div(appliedPct, HUNDRED));
    } else {
      const baseFactor = add(ONE, div(effectivePct, HUNDRED));
      stepFactor = nthRoot(powInt(baseFactor, slice.daysCovered), slice.daysInMonth);
      appliedPct = mul(sub(stepFactor, ONE), HUNDRED);
    }
    factor = mul(factor, stepFactor);
    passos.push({
      periodo: slice.period,
      diasCobertos: slice.daysCovered,
      diasNoMes: slice.daysInMonth,
      variacaoMensalPct: toFixedString(rawPct, 4),
      variacaoAplicadaPct: toFixedString(appliedPct, 6),
      fatorMes: toFixedString(stepFactor, 8),
      fatorAcumulado: toFixedString(factor, 8)
    });
  }

  const finalFactor = isReverse ? roundTo(div(ONE, factor), 12, 'half-up') : roundTo(factor, 12, 'half-up');
  const percentual = mul(sub(finalFactor, ONE), HUNDRED);
  return {
    direcao: isReverse ? 'reversa' : 'direta',
    fator: finalFactor,
    percentual,
    diasCorridos: daysBetween(dataInicial, dataFinal),
    passos
  };
}

export function buildCorrecaoCalculation(input, deps = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CorrecaoCivelError('Dados de correção inválidos.');
  }
  const valorOriginal = parseDec(input.valor);
  if (valorOriginal < ZERO) throw new CorrecaoCivelError('O valor base não pode ser negativo.');
  const serie = String(input.serie || input.indice || 'IPCA').trim();
  const proRata = input.proRata !== false;
  const expurgarDeflacao = input.expurgarDeflacao === true;

  const chain = computeCorrecaoChain({
    serie,
    dataInicial: input.dataInicial,
    dataFinal: input.dataFinal,
    proRata,
    expurgarDeflacao,
    seriesRows: deps.seriesRows
  });

  const valorCorrigido = roundTo(mul(valorOriginal, chain.fator), 2, 'half-up');
  const diferencaCorrecao = sub(valorCorrigido, roundTo(valorOriginal, 2, 'half-up'));

  const jurosMensalPct = input.jurosMensalPct ? parseDec(input.jurosMensalPct) : ZERO;
  const capitalizacaoJuros = input.capitalizacaoJuros === 'composto' ? 'composto' : 'simples';
  const multaPct = input.multaPct ? parseDec(input.multaPct) : ZERO;
  const honorariosPct = input.honorariosPct ? parseDec(input.honorariosPct) : ZERO;

  if (jurosMensalPct < ZERO || multaPct < ZERO || honorariosPct < ZERO) {
    throw new CorrecaoCivelError('Percentuais de juros, multa e honorários não podem ser negativos.');
  }

  let jurosTaxaTotalPct = ZERO;
  let jurosValor = ZERO;
  if (jurosMensalPct > ZERO && chain.direcao === 'direta' && chain.diasCorridos > 0) {
    const mesesEquiv = div(parseDec(String(chain.diasCorridos)), parseDec('30'));
    if (capitalizacaoJuros === 'simples') {
      jurosTaxaTotalPct = mul(jurosMensalPct, mesesEquiv);
      jurosValor = roundTo(percentOf(valorCorrigido, jurosTaxaTotalPct), 2, 'half-up');
    } else {
      const wholeMonths = Math.floor(chain.diasCorridos / 30);
      const remDays = chain.diasCorridos - wholeMonths * 30;
      const baseFactor = add(ONE, div(jurosMensalPct, HUNDRED));
      const wholeFactor = powInt(baseFactor, wholeMonths);
      const remFactor = remDays > 0
        ? add(ONE, div(mul(jurosMensalPct, parseDec(String(remDays))), parseDec('3000')))
        : ONE;
      const totalFactor = mul(wholeFactor, remFactor);
      jurosTaxaTotalPct = mul(sub(totalFactor, ONE), HUNDRED);
      jurosValor = roundTo(mul(valorCorrigido, sub(totalFactor, ONE)), 2, 'half-up');
    }
  }

  const subtotalComJuros = add(valorCorrigido, jurosValor);
  const multaValor = multaPct > ZERO ? roundTo(percentOf(subtotalComJuros, multaPct), 2, 'half-up') : ZERO;
  const baseHonorarios = add(subtotalComJuros, multaValor);
  const honorariosValor = honorariosPct > ZERO ? roundTo(percentOf(baseHonorarios, honorariosPct), 2, 'half-up') : ZERO;
  const total = add(baseHonorarios, honorariosValor);

  let comparativo = null;
  if (Array.isArray(input.seriesComparadas) && input.seriesComparadas.length > 0) {
    comparativo = input.seriesComparadas.map(serieKey => {
      try {
        const c = computeCorrecaoChain({
          serie: serieKey,
          dataInicial: input.dataInicial,
          dataFinal: input.dataFinal,
          proRata,
          expurgarDeflacao,
          seriesRows: deps.seriesRows
        });
        const corr = roundTo(mul(valorOriginal, c.fator), 2, 'half-up');
        return {
          serie: serieKey,
          ok: true,
          fator: toFixedString(c.fator, 6),
          percentual: toFixedString(c.percentual, 4),
          valorCorrigido: toFixedString(corr, 2)
        };
      } catch (err) {
        return {
          serie: serieKey,
          ok: false,
          erro: err?.message || 'Indisponível para o período'
        };
      }
    });
  }

  return {
    modalidade: 'correcao_monetaria',
    direcao: chain.direcao,
    serie,
    dataInicial: input.dataInicial,
    dataFinal: input.dataFinal,
    diasCorridos: chain.diasCorridos,
    proRata,
    expurgarDeflacao,
    resumo: {
      valorOriginal: toFixedString(valorOriginal, 2),
      fatorCorrecao: toFixedString(chain.fator, 6),
      percentualCorrecao: toFixedString(chain.percentual, 4),
      valorCorrigido: toFixedString(valorCorrigido, 2),
      diferencaCorrecao: toFixedString(diferencaCorrecao, 2),
      jurosTaxaTotalPct: toFixedString(jurosTaxaTotalPct, 4),
      juros: toFixedString(jurosValor, 2),
      multa: toFixedString(multaValor, 2),
      honorarios: toFixedString(honorariosValor, 2),
      total: toFixedString(total, 2)
    },
    passos: chain.passos,
    ...(comparativo ? { comparativo } : {})
  };
}
