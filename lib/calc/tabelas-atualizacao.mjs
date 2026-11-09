import { parseDec, add, mul, div, min, toCents, fromCents, toFixedString } from './decimal.mjs';
import { assertPeriodValue, monthAfter } from './calendar.mjs';
import { INPC_MENSAL, INPC_FONTE } from './dados/inpc-mensal.mjs';
import { TETOS_CONTRIBUICAO, TETOS_FONTE } from './dados/tetos-contribuicao.mjs';

export class AtualizacaoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AtualizacaoError';
  }
}

export function tetoVigente(competencia) {
  assertPeriodValue(competencia, 'competência');
  let vigente = null;
  for (const item of TETOS_CONTRIBUICAO) {
    if (item.competencia <= competencia) vigente = item;
    else break;
  }
  if (!vigente) throw new AtualizacaoError(`Sem teto de contribuição cadastrado para ${competencia}.`);
  return { competencia: vigente.competencia, teto: vigente.teto, fonte: TETOS_FONTE };
}

export function fatorAtualizacao(competencia, referencia, options = {}) {
  assertPeriodValue(competencia, 'competência');
  assertPeriodValue(referencia, 'competência de referência');
  if (competencia > referencia) {
    throw new AtualizacaoError(`Competência ${competencia} é posterior à referência ${referencia}.`);
  }
  const serie = options.serie || INPC_MENSAL;
  const porMes = new Map(serie.map(item => [item.competencia, item.taxa]));
  let fator = parseDec('1');
  let meses = 0;
  let cursor = competencia;
  while (cursor <= referencia) {
    const taxa = porMes.get(cursor);
    if (taxa === undefined) throw new AtualizacaoError(`Série de atualização sem valor para ${cursor}.`);
    fator = mul(fator, add(parseDec('1'), div(parseDec(taxa), parseDec('100'))));
    meses += 1;
    cursor = monthAfter(cursor);
  }
  return { fator, indice: toFixedString(fator, 6), meses, fonte: options.fonte || INPC_FONTE };
}

export function corrigirSalario(competencia, salarioNominal, referencia, options = {}) {
  const salario = parseDec(salarioNominal);
  if (salario < 0n) throw new AtualizacaoError('Salário de contribuição não pode ser negativo.');
  const { teto } = tetoVigente(competencia);
  const considerado = min(salario, parseDec(teto));
  const { fator, indice, fonte } = fatorAtualizacao(competencia, referencia, options);
  const corrigido = mul(considerado, fator);
  return {
    competencia,
    salarioNominal: toFixedString(salario, 2),
    teto,
    considerado: toFixedString(considerado, 2),
    indice,
    corrigido: toFixedString(fromCents(toCents(corrigido)), 2),
    corrigidoDec: corrigido,
    fonte
  };
}

export function fontesAtualizacao() {
  return { tetos: TETOS_FONTE, inpc: INPC_FONTE };
}
