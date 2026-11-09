import {
  parseDec,
  add,
  sub,
  mul,
  div,
  toCents,
  fromCents,
  toFixedString,
  percentOf
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

const JUROS_TYPES = new Set(['sem', 'percentual-fixo', 'serie-mensal', 'taxa-legal']);
const ENCARGOS_BASES = new Set(['debitos-atualizados', 'debitos-com-juros', 'total-atualizado']);

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
  for (const encargo of ['multa', 'honorarios']) {
    const value = input[encargo];
    if (!value) continue;
    ensureNonNegative(value.percentual, `Percentual de ${encargo}`);
    const base = value.base || 'debitos-atualizados';
    if (!ENCARGOS_BASES.has(base)) throw new CivelError(`Base inválida para ${encargo}: ${base}.`);
  }
}

function ratesFor(juros, deps) {
  if (juros.tipo === 'taxa-legal') {
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
  const months = monthFractions(fromIso, toIso);
  const rates = ratesFor(juros, deps);
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
      const runFactor = factorBetween(rows, monthBefore(run.de), run.ate);
      fator = mul(fator, runFactor);
      segmentos.push({ serie: run.serie, de: run.de, ate: run.ate, fator: toFixedString(runFactor, 12) });
    }
    return { fator, segmentos };
  }
  const rows = requireDependency(deps, 'seriesRows', `série ${correcao.serie}`)(correcao.serie);
  const fator = factorBetween(rows, fromPeriod, toPeriod);
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
  const interest = incideJuros ? computeInterest(corrigido, jurosDe, context.ate, context.input.juros, context.deps, item.id) : null;
  const cents = {
    corrigido: toCents(corrigido),
    juros: interest ? toCents(interest.valor) : 0n
  };
  cents.total = rules.sinal === 1 ? cents.corrigido + cents.juros : -(cents.corrigido + cents.juros);
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
  if (interest) {
    memoria.push({
      tipo: 'juros',
      itemId: item.id,
      criterio: interest.criterio,
      de: jurosDe,
      ate: context.ate,
      meses: interest.meses,
      taxaTotal: interest.taxaTotal,
      base: money(cents.corrigido),
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
  let jurosTotal = 0n;
  for (const { item, cents } of computed) {
    const rules = SPECIES_RULES[item.especie];
    if (rules.sinal === -1) abatimentos += cents.corrigido;
    else if (item.especie === 'debito') debitos += cents.corrigido;
    else custos += cents.corrigido;
    jurosTotal += cents.juros;
    if (item.especie === 'debito') jurosDebitos += cents.juros;
  }
  const baseFor = base => {
    if (base === 'debitos-com-juros') return debitos + jurosDebitos;
    if (base === 'total-atualizado') return debitos + custos;
    return debitos;
  };
  const multaCents = input.multa
    ? toCents(percentOf(fromCents(baseFor(input.multa.base || 'debitos-atualizados')), input.multa.percentual))
    : 0n;
  const honorariosCents = input.honorarios
    ? toCents(percentOf(fromCents(baseFor(input.honorarios.base || 'debitos-atualizados')), input.honorarios.percentual))
    : 0n;
  const multa = input.multa
    ? { percentual: toFixedString(parseDec(input.multa.percentual), 2), base: input.multa.base || 'debitos-atualizados', valor: money(multaCents) }
    : null;
  const honorarios = input.honorarios
    ? { percentual: toFixedString(parseDec(input.honorarios.percentual), 2), base: input.honorarios.base || 'debitos-atualizados', valor: money(honorariosCents) }
    : null;
  const total = debitos + custos + jurosTotal - abatimentos + multaCents + honorariosCents;
  return {
    resumo: {
      debitosAtualizados: money(debitos),
      custasDespesas: money(custos),
      juros: money(jurosTotal),
      multa: money(multaCents),
      honorarios: money(honorariosCents),
      abatimentos: money(abatimentos),
      total: money(total)
    },
    encargos: { multa, honorarios }
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
    if (entry.tipo === 'juros' && input.juros.tipo === 'taxa-legal') {
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
