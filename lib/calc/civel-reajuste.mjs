import {
  parseDec,
  add,
  sub,
  mul,
  div,
  roundTo,
  toFixedString,
  formatBR
} from './decimal.mjs';
import {
  assertPeriodValue,
  monthAfter
} from './calendar.mjs';

export class ReajusteCivelError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReajusteCivelError';
  }
}

const ONE = parseDec('1');
const HUNDRED = parseDec('100');
const ZERO = 0n;

function toRateMap(rows, serieKey) {
  if (rows instanceof Map) return rows;
  if (!Array.isArray(rows)) throw new ReajusteCivelError(`Série ${serieKey} inválida.`);
  const map = new Map();
  for (const row of rows) {
    if (!row || typeof row.period !== 'string') continue;
    map.set(row.period, typeof row.value === 'bigint' ? row.value : parseDec(row.value));
  }
  return map;
}

export function buildReajusteCalculation(input, deps = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ReajusteCivelError('Dados de reajuste locatício inválidos.');
  }
  const valorInicial = roundTo(parseDec(input.valorInicial ?? '0'), 2, 'half-up');
  if (valorInicial <= ZERO) {
    throw new ReajusteCivelError('O valor inicial do contrato/aluguel deve ser maior que zero.');
  }
  const periodo = Math.trunc(Number(input.periodicidadeMeses ?? 12));
  if (!Number.isInteger(periodo) || periodo < 1 || periodo > 36) {
    throw new ReajusteCivelError('A periodicidade do reajuste deve estar entre 1 e 36 meses.');
  }
  const competenciaInicio = assertPeriodValue(input.competenciaInicio, 'competência inicial');
  const competenciaFim = input.competenciaFim
    ? assertPeriodValue(input.competenciaFim, 'competência final')
    : null;
  if (competenciaFim && competenciaFim < competenciaInicio) {
    throw new ReajusteCivelError('A competência final não pode ser anterior à inicial.');
  }

  const serie = String(input.serie || input.indice || 'IGP-M').trim();
  const congelarDeflacao = input.congelarDeflacao !== false;
  if (typeof deps.seriesRows !== 'function') {
    throw new ReajusteCivelError('Fonte de séries obrigatória para calcular o reajuste.');
  }

  const rows = deps.seriesRows(serie);
  const rateMap = toRateMap(rows, serie);
  const availablePeriods = [...rateMap.keys()].sort();
  const limitPeriod = competenciaFim || availablePeriods[availablePeriods.length - 1];
  if (!limitPeriod || limitPeriod < competenciaInicio) {
    throw new ReajusteCivelError(`Sem dados disponíveis para ${serie} a partir de ${competenciaInicio}.`);
  }

  const ciclos = [];
  let currentPeriod = competenciaInicio;
  let valorCorrente = valorInicial;
  let cicloNum = 1;

  while (currentPeriod <= limitPeriod) {
    const meses = [];
    let factor = ONE;
    let cursor = currentPeriod;
    let complete = true;

    for (let m = 0; m < periodo; m += 1) {
      if (cursor > limitPeriod) {
        complete = false;
        break;
      }
      const pct = rateMap.get(cursor);
      if (pct === undefined) {
        complete = false;
        break;
      }
      const stepFactor = add(ONE, div(pct, HUNDRED));
      factor = mul(factor, stepFactor);
      meses.push({
        periodo: cursor,
        variacaoPct: toFixedString(pct, 4),
        fatorAcumulado: toFixedString(factor, 8)
      });
      cursor = monthAfter(cursor);
    }

    if (!complete || meses.length < periodo) break;

    const rawFactor = roundTo(factor, 8, 'half-up');
    const isNegativeCycle = rawFactor < ONE;
    const deflacaoCongelada = congelarDeflacao && isNegativeCycle;
    const appliedFactor = deflacaoCongelada ? ONE : rawFactor;
    const percentualCiclo = mul(sub(appliedFactor, ONE), HUNDRED);
    const valorReajustado = roundTo(mul(valorCorrente, appliedFactor), 2, 'half-up');

    ciclos.push({
      ciclo: cicloNum,
      deCompetencia: meses[0].periodo,
      ateCompetencia: meses[meses.length - 1].periodo,
      valorAnterior: toFixedString(valorCorrente, 2),
      fatorCiclo: toFixedString(appliedFactor, 8),
      percentualCiclo: toFixedString(percentualCiclo, 4),
      deflacaoCongelada,
      valorReajustado: toFixedString(valorReajustado, 2),
      meses
    });

    valorCorrente = valorReajustado;
    currentPeriod = cursor;
    cicloNum += 1;
  }

  if (ciclos.length === 0) {
    throw new ReajusteCivelError(
      `Não há ${periodo} competências fechadas de ${serie} a partir de ${competenciaInicio} para formar 1 ciclo completo.`
    );
  }

  const fatorTotal = roundTo(div(valorCorrente, valorInicial), 8, 'half-up');
  const pctTotal = mul(sub(fatorTotal, ONE), HUNDRED);
  const ultimo = ciclos[ciclos.length - 1];
  const notificacaoTexto = [
    'NOTIFICAÇÃO DE REAJUSTE CONTRATUAL DE LOCAÇÃO',
    '',
    `Nos termos do contrato de locação vigente e conforme o índice pactuado (${serie}), comunicamos a atualização do valor locatício para o novo ciclo contratual:`,
    `• Ciclo apurado: ${ultimo.deCompetencia} a ${ultimo.ateCompetencia}`,
    `• Valor anterior: R$ ${formatBR(parseDec(ultimo.valorAnterior), 2)}`,
    `• Variação aplicada no ciclo: ${formatBR(parseDec(ultimo.percentualCiclo), 4)}%${ultimo.deflacaoCongelada ? ' (aplicada cláusula de piso zero em deflação)' : ''}`,
    `• Novo aluguel mensal vigente: R$ ${formatBR(valorCorrente, 2)}`,
    '',
    `Variação acumulada desde ${competenciaInicio}: ${formatBR(pctTotal, 4)}% (fator ${formatBR(fatorTotal, 6)}).`
  ].join('\n');

  return {
    modalidade: 'reajuste_aluguel',
    serie,
    competenciaInicio,
    competenciaFim: ultimo.ateCompetencia,
    periodicidadeMeses: periodo,
    congelarDeflacao,
    resumo: {
      valorInicial: toFixedString(valorInicial, 2),
      valorAtual: toFixedString(valorCorrente, 2),
      percentualAcumuladoTotal: toFixedString(pctTotal, 4),
      fatorAcumuladoTotal: toFixedString(fatorTotal, 6),
      totalCiclos: ciclos.length,
      total: toFixedString(valorCorrente, 2)
    },
    ciclos,
    notificacaoTexto
  };
}
