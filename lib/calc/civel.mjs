import {
  parseDec,
  add,
  sub,
  mul,
  div,
  toCents,
  fromCents,
  toFixedString,
  percentOf,
  powInt,
  nthRoot
} from './decimal.mjs';
import { factorBetween } from './indices.mjs';
import { monthOf, monthBefore, monthAfter, monthFractions, previousPeriodsBetween, assertPeriodValue } from './calendar.mjs';

export class CivelError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CivelError';
  }
}

export const CIVEL_SPECIES = Object.freeze(['debito', 'amortizacao', 'custas', 'despesa', 'desconto']);
const SPECIES = new Set(CIVEL_SPECIES);

const SPECIES_RULES = Object.freeze({
  debito: Object.freeze({ incideJuros: true, entraBaseEncargos: true, sinal: 1 }),
  amortizacao: Object.freeze({ incideJuros: false, entraBaseEncargos: false, sinal: -1 }),
  desconto: Object.freeze({ incideJuros: false, entraBaseEncargos: false, sinal: -1 }),
  custas: Object.freeze({ incideJuros: false, entraBaseEncargos: false, sinal: 1 }),
  despesa: Object.freeze({ incideJuros: false, entraBaseEncargos: false, sinal: 1 })
});

const JUROS_TYPES = new Set(['sem', 'percentual-fixo', 'serie-mensal', 'taxa-legal', 'transicao-lei-14905']);
const ENCARGOS_BASES = new Set(['debitos-atualizados', 'debitos-com-juros', 'total-atualizado']);
const CAPITALIZACOES = new Set(['simples', 'composto']);
const ART523_MODES = new Set(['nao_aplicar', 'multa_10', 'multa_e_honorarios_10']);
const ONE = parseDec('1');
const HUNDRED = parseDec('100');

function money(cents) {
  return toFixedString(fromCents(cents), 2);
}

function ensureObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CivelError(`${label} deve ser um objeto.`);
  }
  return value;
}

function ensureNonNegative(value, label) {
  let parsed;
  try {
    parsed = parseDec(value);
  } catch (error) {
    throw new CivelError(`${label} inválido: ${value}.`);
  }
  if (parsed < 0n) throw new CivelError(`${label} não pode ser negativo.`);
  return parsed;
}

function requireDependency(deps, name, label) {
  ensureObject(deps, 'Dependências do cálculo');
  if (typeof deps[name] !== 'function') {
    throw new CivelError(`Dependência ausente: ${label || name}.`);
  }
  return deps[name];
}

function ensureDate(iso, label) {
  try {
    monthOf(iso);
  } catch (error) {
    throw new CivelError(`${label} inválida: ${iso}.`);
  }
  return iso;
}

function ensurePeriod(period, label) {
  try {
    assertPeriodValue(period, label);
  } catch (error) {
    throw new CivelError(`${label} inválido: ${period}.`);
  }
  return period;
}

function normalizeTimeline(timeline) {
  if (!Array.isArray(timeline) || timeline.length === 0) {
    throw new CivelError('Linha do tempo de correção exige ao menos um segmento.');
  }
  const segments = timeline.map(segment => {
    ensureObject(segment, 'Segmento de correção');
    if (!segment.serie) throw new CivelError('Segmento de correção exige serie.');
    ensurePeriod(segment.de, 'Período inicial do segmento de correção');
    if (segment.ate !== null && segment.ate !== undefined) {
      ensurePeriod(segment.ate, 'Período final do segmento de correção');
      if (segment.ate < segment.de) throw new CivelError(`Segmento de correção ${segment.de} tem final anterior ao início.`);
    }
    return { de: segment.de, ate: segment.ate ?? null, serie: String(segment.serie) };
  });
  segments.sort((a, b) => (a.de < b.de ? -1 : a.de > b.de ? 1 : 0));
  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    if (!previous.ate) throw new CivelError('Só o último segmento de correção pode ter final aberto.');
    if (previous.ate >= segments[index].de) throw new CivelError('Segmentos de correção não podem se sobrepor.');
  }
  return segments;
}

function validateInput(input) {
  ensureObject(input, 'Entrada do cálculo');
  if (!input.atualizacaoAte) throw new CivelError('Informe a data de atualização.');
  ensureDate(input.atualizacaoAte, 'Data de atualização');
  if (!Array.isArray(input.itens) || input.itens.length === 0) {
    throw new CivelError('O cálculo exige ao menos um item.');
  }
  const ids = new Set();
  input.itens.forEach((item, index) => {
    ensureObject(item, `Item ${index + 1}`);
    if (!item.id) throw new CivelError(`Item ${index + 1} exige id.`);
    if (ids.has(item.id)) throw new CivelError(`Item duplicado: ${item.id}.`);
    ids.add(item.id);
    if (!SPECIES.has(item.especie)) throw new CivelError(`Espécie inválida no item ${item.id}: ${item.especie}.`);
    if (!item.data) throw new CivelError(`Item ${item.id} exige data.`);
    ensureDate(item.data, `Data do item ${item.id}`);
    if (item.jurosDe) ensureDate(item.jurosDe, `Data de juros do item ${item.id}`);
    ensureNonNegative(item.valor, `Valor do item ${item.id}`);
    if (item.incideJuros !== undefined && typeof item.incideJuros !== 'boolean') {
      throw new CivelError(`incideJuros do item ${item.id} deve ser booleano.`);
    }
  });
  const correcao = input.correcao;
  if (!correcao || correcao.tipo === 'sem') {
    // sem correção
  } else if (correcao.timeline) {
    normalizeTimeline(correcao.timeline);
  } else if (!correcao.serie) {
    throw new CivelError('Critério de correção exige serie, timeline ou tipo "sem".');
  }
  const juros = input.juros || { tipo: 'sem' };
  if (!JUROS_TYPES.has(juros.tipo)) throw new CivelError(`Critério de juros inválido: ${juros.tipo}.`);
  if (juros.tipo === 'percentual-fixo') ensureNonNegative(juros.percentual, 'Percentual de juros');
  if (juros.tipo === 'serie-mensal' && !juros.serie) throw new CivelError('Juros por série exigem serie.');
  if (juros.kind && !['percent-month', 'factor'].includes(juros.kind)) {
    throw new CivelError(`Tipo de série de juros inválido: ${juros.kind}.`);
  }
  if (juros.capitalizacao !== undefined && !CAPITALIZACOES.has(juros.capitalizacao)) {
    throw new CivelError(`Capitalização de juros inválida: ${juros.capitalizacao}.`);
  }
  if (input.jurosCompensatorios !== undefined && input.jurosCompensatorios !== null) {
    const jc = ensureObject(input.jurosCompensatorios, 'Juros compensatórios');
    ensureNonNegative(jc.percentual ?? '0', 'Percentual de juros compensatórios');
    if (jc.capitalizacao !== undefined && !CAPITALIZACOES.has(jc.capitalizacao)) {
      throw new CivelError(`Capitalização de juros compensatórios inválida: ${jc.capitalizacao}.`);
    }
    if (jc.jurosDe) ensureDate(jc.jurosDe, 'Data inicial de juros compensatórios');
  }
  if (input.art523 !== undefined && !ART523_MODES.has(input.art523)) {
    throw new CivelError(`Modalidade de art. 523 inválida: ${input.art523}.`);
  }
  if (input.custasFinais !== undefined && input.custasFinais !== null && String(input.custasFinais).trim() !== '') {
    ensureNonNegative(input.custasFinais, 'Custas finais');
  }
  for (const encargo of ['multa', 'honorarios', 'multaContratual']) {
    const value = input[encargo];
    if (!value) continue;
    ensureNonNegative(value.percentual, `Percentual de ${encargo}`);
    const base = value.base || 'debitos-atualizados';
    if (!ENCARGOS_BASES.has(base)) throw new CivelError(`Base inválida para ${encargo}: ${base}.`);
  }
}

function ratesFor(juros, deps) {
  if (juros.tipo === 'taxa-legal' || juros.tipo === 'transicao-lei-14905') {
    const provider = requireDependency(deps, 'taxaLegalRates', 'taxas da taxa legal');
    const rates = provider();
    if (!(rates instanceof Map)) throw new CivelError('Taxas da taxa legal devem vir em um Map por período.');
    return rates;
  }
  if (juros.tipo === 'serie-mensal') {
    const provider = requireDependency(deps, 'seriesRows', `série ${juros.serie}`);
    const rows = provider(juros.serie);
    const kind = juros.kind || 'percent-month';
    const rates = new Map();
    for (const row of rows) {
      if (typeof row.value !== 'bigint' || typeof row.period !== 'string') {
        throw new CivelError(`Série de juros ${juros.serie} exige pontos normalizados.`);
      }
      rates.set(row.period, kind === 'factor' ? sub(mul(row.value, parseDec('100')), parseDec('100')) : row.value);
    }
    return rates;
  }
  if (juros.tipo === 'percentual-fixo') return new Map([['*', juros.percentual]]);
  return new Map();
}

function computeInterest(base, fromIso, toIso, juros, deps, itemId) {
  if (juros.tipo === 'sem') return null;
  if (fromIso > toIso) throw new CivelError(`Item ${itemId}: data de juros posterior à atualização.`);
  if (juros.tipo === 'transicao-lei-14905') {
    const rates = ratesFor(juros, deps);
    let totalRate = 0n;
    const detail = [];
    // Trecho 1: CC/1916 (0,5% a.m. até 11/01/2003) e CC/2002 (1,0% a.m. de 12/01/2003 a 29/08/2024)
    const preEnd = toIso < '2024-08-29' ? toIso : '2024-08-29';
    if (fromIso < preEnd) {
      const cc1916End = preEnd < '2003-01-11' ? preEnd : '2003-01-11';
      if (fromIso < cc1916End) {
        const rate1916 = parseDec('0.5');
        for (const month of monthFractions(fromIso, cc1916End)) {
          const fraction = div(parseDec(String(month.days)), parseDec(String(month.daysInMonth)));
          const applied = mul(rate1916, fraction);
          totalRate = add(totalRate, applied);
          detail.push({
            periodo: month.period,
            dias: month.days,
            diasNoMes: month.daysInMonth,
            taxa: toFixedString(rate1916, 6),
            taxaAplicada: toFixedString(applied, 12),
            regime: 'CC/1916 (0,5% a.m.)'
          });
        }
      }
      const cc2002Start = fromIso > '2003-01-11' ? fromIso : '2003-01-11';
      if (cc2002Start < preEnd) {
        const rate2002 = parseDec('1');
        for (const month of monthFractions(cc2002Start, preEnd)) {
          const fraction = div(parseDec(String(month.days)), parseDec(String(month.daysInMonth)));
          const applied = mul(rate2002, fraction);
          totalRate = add(totalRate, applied);
          detail.push({
            periodo: month.period,
            dias: month.days,
            diasNoMes: month.daysInMonth,
            taxa: toFixedString(rate2002, 6),
            taxaAplicada: toFixedString(applied, 12),
            regime: 'CC/2002 (1,0% a.m. até 29/08/2024)'
          });
        }
      }
    }
    // Trecho 2: Lei 14.905/2024 (Taxa Legal a partir de 30/08/2024 -> início exclusivo em 29/08/2024)
    if (toIso >= '2024-08-30') {
      const postStart = fromIso > '2024-08-29' ? fromIso : '2024-08-29';
      for (const month of monthFractions(postStart, toIso)) {
        const rate = rates.get(month.period);
        if (rate === undefined) throw new CivelError(`Item ${itemId}: sem taxa de juros para ${month.period}.`);
        const fraction = div(parseDec(String(month.days)), parseDec(String(month.daysInMonth)));
        const applied = mul(rate, fraction);
        totalRate = add(totalRate, applied);
        detail.push({
          periodo: month.period,
          dias: month.days,
          diasNoMes: month.daysInMonth,
          taxa: toFixedString(rate, 6),
          taxaAplicada: toFixedString(applied, 12),
          regime: 'Lei 14.905/2024 (Taxa Legal CMN 5.171)'
        });
      }
    }
    return { criterio: juros.tipo, meses: detail, taxaTotal: toFixedString(totalRate, 12), valor: percentOf(base, totalRate) };
  }
  const months = monthFractions(fromIso, toIso);
  const rates = ratesFor(juros, deps);
  if (juros.capitalizacao === 'composto') {
    let factor = ONE;
    const detail = [];
    for (const month of months) {
      const rate = rates.has('*') ? rates.get('*') : rates.get(month.period);
      if (rate === undefined) throw new CivelError(`Item ${itemId}: sem taxa de juros para ${month.period}.`);
      const baseFactor = add(ONE, div(rate, HUNDRED));
      const stepFactor = month.days === month.daysInMonth
        ? baseFactor
        : nthRoot(powInt(baseFactor, month.days), month.daysInMonth);
      factor = mul(factor, stepFactor);
      const appliedPct = mul(sub(stepFactor, ONE), HUNDRED);
      detail.push({
        periodo: month.period,
        dias: month.days,
        diasNoMes: month.daysInMonth,
        taxa: toFixedString(rate, 6),
        taxaAplicada: toFixedString(appliedPct, 12)
      });
    }
    const netFactor = sub(factor, ONE);
    const totalRate = mul(netFactor, HUNDRED);
    return { criterio: juros.tipo, capitalizacao: 'composto', meses: detail, taxaTotal: toFixedString(totalRate, 12), valor: mul(base, netFactor) };
  }
  let totalRate = 0n;
  const detail = [];
  for (const month of months) {
    const rate = rates.has('*') ? rates.get('*') : rates.get(month.period);
    if (rate === undefined) throw new CivelError(`Item ${itemId}: sem taxa de juros para ${month.period}.`);
    const fraction = div(parseDec(String(month.days)), parseDec(String(month.daysInMonth)));
    const applied = mul(rate, fraction);
    totalRate = add(totalRate, applied);
    detail.push({
      periodo: month.period,
      dias: month.days,
      diasNoMes: month.daysInMonth,
      taxa: toFixedString(rate, 6),
      taxaAplicada: toFixedString(applied, 12)
    });
  }
  return { criterio: juros.tipo, meses: detail, taxaTotal: toFixedString(totalRate, 12), valor: percentOf(base, totalRate) };
}

function resolveCorrection(fromIso, toIso, correcao, deps) {
  if (!correcao || correcao.tipo === 'sem') return null;
  if (fromIso > toIso) throw new CivelError(`Atualização ${toIso} é anterior à data-base ${fromIso}.`);
  const fromPeriod = monthOf(fromIso);
  const toPeriod = monthOf(toIso);
  if (fromPeriod > toPeriod) throw new CivelError(`Atualização ${toIso} é anterior à data-base ${fromIso}.`);
  if (fromPeriod === toPeriod) return { fator: parseDec('1'), segmentos: [] };
  if (correcao.timeline) {
    const segments = normalizeTimeline(correcao.timeline);
    const months = previousPeriodsBetween(fromPeriod, toPeriod);
    const runs = [];
    for (const period of months) {
      const segment = segments.find(entry => entry.de <= period && (entry.ate === null || period <= entry.ate));
      if (!segment) throw new CivelError(`Sem série de correção definida para ${period}.`);
      const last = runs[runs.length - 1];
      if (last && last.serie === segment.serie && monthAfter(last.ate) === period) last.ate = period;
      else runs.push({ serie: segment.serie, de: period, ate: period });
    }
    let fator = parseDec('1');
    const segmentos = [];
    for (const run of runs) {
      const rows = requireDependency(deps, 'seriesRows', `série ${run.serie}`)(run.serie);
      const runFactor = factorBetween(rows, monthBefore(run.de), run.ate, { requireFromPeriod: false });
      fator = mul(fator, runFactor);
      segmentos.push({ serie: run.serie, de: run.de, ate: run.ate, fator: toFixedString(runFactor, 12) });
    }
    return { fator, segmentos };
  }
  const rows = requireDependency(deps, 'seriesRows', `série ${correcao.serie}`)(correcao.serie);
  const fator = factorBetween(rows, fromPeriod, toPeriod, { requireFromPeriod: false });
  const de = previousPeriodsBetween(fromPeriod, toPeriod)[0];
  return { fator, segmentos: [{ serie: correcao.serie, de, ate: toPeriod, fator: toFixedString(fator, 12) }] };
}

function computeItem(item, context) {
  const rules = SPECIES_RULES[item.especie];
  const valor = parseDec(item.valor);
  const correction = resolveCorrection(item.data, context.ate, context.input.correcao, context.deps);
  const fator = correction ? correction.fator : parseDec('1');
  const corrigido = mul(valor, fator);
  const incideJuros = item.incideJuros === undefined ? rules.incideJuros : item.incideJuros;
  const jurosDe = item.jurosDe || item.data;
  const jcSpec = context.input.jurosCompensatorios;
  const hasComp = item.especie === 'debito' && incideJuros && jcSpec && parseDec(jcSpec.percentual ?? '0') > 0n;
  const compDe = hasComp ? (jcSpec.jurosDe || item.data) : jurosDe;
  const compInterest = hasComp
    ? computeInterest(
        corrigido,
        compDe,
        context.ate,
        { tipo: 'percentual-fixo', percentual: jcSpec.percentual, capitalizacao: jcSpec.capitalizacao || 'simples' },
        context.deps,
        item.id
      )
    : null;
  const compCents = compInterest ? toCents(compInterest.valor) : 0n;
  const moratorioBase = compInterest && jcSpec.incidirMoratoriosSobreCompensatorios === true
    ? add(corrigido, fromCents(compCents))
    : corrigido;
  const interest = incideJuros ? computeInterest(moratorioBase, jurosDe, context.ate, context.input.juros, context.deps, item.id) : null;
  const cents = {
    corrigido: toCents(corrigido),
    juros: interest ? toCents(interest.valor) : 0n,
    jurosCompensatorios: compCents
  };
  cents.total = rules.sinal === 1
    ? cents.corrigido + cents.juros + cents.jurosCompensatorios
    : -(cents.corrigido + cents.juros);
  const memoria = [];
  if (correction) {
    memoria.push({
      tipo: 'correcao',
      itemId: item.id,
      de: monthOf(item.data),
      ate: monthOf(context.ate),
      segmentos: correction.segmentos,
      fator: toFixedString(fator, 12),
      valorAntes: toFixedString(valor, 2),
      valorDepois: money(cents.corrigido)
    });
  }
  if (compInterest) {
    memoria.push({
      tipo: 'juros-compensatorios',
      itemId: item.id,
      criterio: 'compensatorio',
      capitalizacao: jcSpec.capitalizacao || 'simples',
      de: compDe,
      ate: context.ate,
      meses: compInterest.meses,
      taxaTotal: compInterest.taxaTotal,
      base: money(cents.corrigido),
      valor: money(cents.jurosCompensatorios)
    });
  }
  if (interest) {
    memoria.push({
      tipo: 'juros',
      itemId: item.id,
      criterio: interest.criterio,
      ...(interest.capitalizacao ? { capitalizacao: interest.capitalizacao } : {}),
      de: jurosDe,
      ate: context.ate,
      meses: interest.meses,
      taxaTotal: interest.taxaTotal,
      base: money(toCents(moratorioBase)),
      valor: money(cents.juros)
    });
  }
  return {
    item: {
      id: item.id,
      especie: item.especie,
      descricao: item.descricao || null,
      data: item.data,
      jurosDe,
      incideJuros,
      valorOriginal: toFixedString(valor, 2),
      fatorCorrecao: toFixedString(fator, 12),
      valorCorrigido: money(cents.corrigido),
      juros: money(cents.juros),
      ...(compInterest ? { jurosCompensatorios: money(cents.jurosCompensatorios) } : {}),
      total: money(cents.total < 0n ? -cents.total : cents.total)
    },
    cents,
    memoria
  };
}

function summarize(computed, input) {
  let debitos = 0n;
  let custos = 0n;
  let abatimentos = 0n;
  let jurosDebitos = 0n;
  let jurosCompTotal = 0n;
  let jurosTotal = 0n;
  for (const { item, cents } of computed) {
    const rules = SPECIES_RULES[item.especie];
    if (rules.sinal === -1) {
      abatimentos += cents.corrigido + cents.juros;
    } else {
      if (item.especie === 'debito') {
        debitos += cents.corrigido;
        jurosDebitos += cents.juros;
        jurosCompTotal += cents.jurosCompensatorios || 0n;
      } else {
        custos += cents.corrigido;
      }
      jurosTotal += cents.juros;
    }
  }
  const baseFor = base => {
    if (base === 'debitos-com-juros') return debitos + jurosDebitos + jurosCompTotal;
    if (base === 'total-atualizado') return debitos + custos;
    return debitos;
  };
  const multaCents = input.multa
    ? toCents(percentOf(fromCents(baseFor(input.multa.base || 'debitos-atualizados')), input.multa.percentual))
    : 0n;
  const honorariosCents = input.honorarios
    ? toCents(percentOf(fromCents(baseFor(input.honorarios.base || 'debitos-atualizados')), input.honorarios.percentual))
    : 0n;
  const multaContratualCents = input.multaContratual
    ? toCents(percentOf(fromCents(baseFor(input.multaContratual.base || 'debitos-atualizados')), input.multaContratual.percentual))
    : 0n;
  const art523Mode = input.art523 || 'nao_aplicar';
  const rawArt523Base = debitos + jurosDebitos + jurosCompTotal + multaContratualCents - abatimentos;
  const art523Base = rawArt523Base > 0n ? rawArt523Base : 0n;
  const multaArt523Cents = art523Mode !== 'nao_aplicar'
    ? toCents(percentOf(fromCents(art523Base), '10'))
    : 0n;
  const honorariosArt523Cents = art523Mode === 'multa_e_honorarios_10'
    ? toCents(percentOf(fromCents(art523Base), '10'))
    : 0n;
  const custasFinaisCents = input.custasFinais !== undefined && input.custasFinais !== null && String(input.custasFinais).trim() !== ''
    ? toCents(parseDec(input.custasFinais))
    : 0n;

  const multa = input.multa
    ? { percentual: toFixedString(parseDec(input.multa.percentual), 2), base: input.multa.base || 'debitos-atualizados', valor: money(multaCents) }
    : null;
  const honorarios = input.honorarios
    ? { percentual: toFixedString(parseDec(input.honorarios.percentual), 2), base: input.honorarios.base || 'debitos-atualizados', valor: money(honorariosCents) }
    : null;
  const multaContratual = input.multaContratual && multaContratualCents > 0n
    ? { percentual: toFixedString(parseDec(input.multaContratual.percentual), 2), base: input.multaContratual.base || 'debitos-atualizados', valor: money(multaContratualCents) }
    : null;
  const multaArt523 = multaArt523Cents > 0n ? { percentual: '10.00', base: 'subtotal-art523', valor: money(multaArt523Cents) } : null;
  const honorariosArt523 = honorariosArt523Cents > 0n ? { percentual: '10.00', base: 'subtotal-art523', valor: money(honorariosArt523Cents) } : null;
  const custasFinais = custasFinaisCents > 0n ? { valor: money(custasFinaisCents) } : null;

  const total = debitos + custos + jurosTotal + jurosCompTotal - abatimentos + multaCents + honorariosCents + multaContratualCents + multaArt523Cents + honorariosArt523Cents + custasFinaisCents;
  return {
    resumo: {
      debitosAtualizados: money(debitos),
      custasDespesas: money(custos),
      juros: money(jurosTotal),
      ...(jurosCompTotal > 0n ? { jurosCompensatorios: money(jurosCompTotal) } : {}),
      multa: money(multaCents),
      honorarios: money(honorariosCents),
      ...(multaContratualCents > 0n ? { multaContratual: money(multaContratualCents) } : {}),
      ...(multaArt523Cents > 0n ? { multaArt523: money(multaArt523Cents) } : {}),
      ...(honorariosArt523Cents > 0n ? { honorariosArt523: money(honorariosArt523Cents) } : {}),
      ...(custasFinaisCents > 0n ? { custasFinais: money(custasFinaisCents) } : {}),
      abatimentos: money(abatimentos),
      total: money(total)
    },
    encargos: { multa, honorarios, multaContratual, multaArt523, honorariosArt523, custasFinais }
  };
}

function collectSources(memoria, input) {
  const sources = new Map();
  const addSource = (serie, de, ate) => {
    const key = `${serie}|${de}|${ate}`;
    if (!sources.has(key)) sources.set(key, { serie, de, ate });
  };
  for (const entry of memoria) {
    if (entry.tipo === 'correcao') {
      for (const segment of entry.segmentos) addSource(segment.serie, segment.de, segment.ate);
    }
    if (entry.tipo === 'juros' && input.juros.tipo === 'serie-mensal') {
      addSource(input.juros.serie, monthOf(entry.de), monthOf(entry.ate));
    }
    if (entry.tipo === 'juros' && (input.juros.tipo === 'taxa-legal' || input.juros.tipo === 'transicao-lei-14905')) {
      addSource('taxa-legal (SGS 29543)', monthOf(entry.de), monthOf(entry.ate));
    }
  }
  return [...sources.values()].sort((a, b) => (a.serie < b.serie ? -1 : a.serie > b.serie ? 1 : a.de < b.de ? -1 : 1));
}

export function buildCivelCalculation(input, deps = {}) {
  validateInput(input);
  const context = { input: { ...input, juros: input.juros || { tipo: 'sem' } }, deps, ate: input.atualizacaoAte };
  const computed = input.itens.map(item => computeItem(item, context));
  const { resumo, encargos } = summarize(computed, context.input);
  const memoria = computed.flatMap(entry => entry.memoria);
  if (encargos.multa) memoria.push({ tipo: 'multa', ...encargos.multa });
  if (encargos.honorarios) memoria.push({ tipo: 'honorarios', ...encargos.honorarios });
  if (encargos.multaContratual) memoria.push({ tipo: 'multa-contratual', ...encargos.multaContratual });
  if (encargos.multaArt523) memoria.push({ tipo: 'multa-art523', ...encargos.multaArt523 });
  if (encargos.honorariosArt523) memoria.push({ tipo: 'honorarios-art523', ...encargos.honorariosArt523 });
  if (encargos.custasFinais) memoria.push({ tipo: 'custas-finais', ...encargos.custasFinais });
  if (computed.some(entry => SPECIES_RULES[entry.item.especie].sinal === -1)) {
    memoria.push({
      tipo: 'abatimento',
      valor: resumo.abatimentos,
      itens: computed.filter(entry => SPECIES_RULES[entry.item.especie].sinal === -1).map(entry => entry.item.id)
    });
  }
  return {
    atualizacaoAte: input.atualizacaoAte,
    parametros: {
      correcao: input.correcao || { tipo: 'sem' },
      juros: context.input.juros,
      multa: encargos.multa,
      honorarios: encargos.honorarios
    },
    itens: computed.map(entry => entry.item),
    resumo,
    memoria,
    fontes: collectSources(memoria, context.input)
  };
}

export function describeCivelInput(input) {
  validateInput(input);
  const correcao = input.correcao;
  return {
    atualizacaoAte: input.atualizacaoAte,
    itens: input.itens.length,
    especies: [...new Set(input.itens.map(item => item.especie))].sort(),
    juros: (input.juros || { tipo: 'sem' }).tipo,
    correcao: !correcao || correcao.tipo === 'sem' ? 'sem' : correcao.timeline ? 'timeline' : 'serie'
  };
}
