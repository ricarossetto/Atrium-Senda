import { parseDec, toCents, fromCents, toFixedString, div, mul, add, cmp } from './decimal.mjs';
import { assertPeriodValue, partsFromIso } from './calendar.mjs';
import { buildTransicoes } from './transicoes.mjs';
import { corrigirSalario, fontesAtualizacao } from './tabelas-atualizacao.mjs';

export class PrevidenciarioError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PrevidenciarioError';
  }
}

export const SEXOS = Object.freeze(['feminino', 'masculino']);
const PRIMEIRA_COMPETENCIA = '1994-07';
const DIVISOR_MINIMO = 108;
const COEFICIENTE_BASE = '60';
const COEFICIENTE_INCREMENTO = '2';
const ANOS_BASE = Object.freeze({ feminino: 15, masculino: 20 });

function money(cents) {
  return toFixedString(fromCents(cents), 2);
}

function ensureNonNegative(value, label) {
  let parsed;
  try {
    parsed = parseDec(value);
  } catch (error) {
    throw new PrevidenciarioError(`${label} inválido: ${value}.`);
  }
  if (parsed < 0n) throw new PrevidenciarioError(`${label} não pode ser negativo.`);
  return parsed;
}

function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new PrevidenciarioError('Entrada do cálculo previdenciário deve ser um objeto.');
  }
  if (!SEXOS.includes(input.sexo)) throw new PrevidenciarioError(`Sexo inválido: ${input.sexo}.`);
  if (!Array.isArray(input.competencias) || input.competencias.length === 0) {
    throw new PrevidenciarioError('Informe ao menos uma competência com salário de contribuição.');
  }
  const vistas = new Set();
  const competencias = input.competencias.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new PrevidenciarioError(`Competência ${index + 1} inválida.`);
    }
    try {
      assertPeriodValue(item.competencia, `Competência ${index + 1}`);
    } catch (error) {
      throw new PrevidenciarioError(`Competência ${index + 1} inválida: ${item.competencia}.`);
    }
    if (item.competencia < PRIMEIRA_COMPETENCIA) {
      throw new PrevidenciarioError(`Competência ${item.competencia} é anterior a ${PRIMEIRA_COMPETENCIA}; períodos anteriores não entram no PBC.`);
    }
    if (vistas.has(item.competencia)) {
      throw new PrevidenciarioError(`Competência duplicada: ${item.competencia}. Concomitância exige conferência manual.`);
    }
    vistas.add(item.competencia);
    const salario = ensureNonNegative(item.salario, `Salário da competência ${item.competencia}`);
    if (salario === 0n) throw new PrevidenciarioError(`Salário da competência ${item.competencia} deve ser maior que zero.`);
    return { competencia: item.competencia, salario };
  });
  competencias.sort((a, b) => (a.competencia < b.competencia ? -1 : a.competencia > b.competencia ? 1 : 0));
  const teto = input.teto === undefined || input.teto === '' ? null : ensureNonNegative(input.teto, 'Teto');
  const piso = input.piso === undefined || input.piso === '' ? null : ensureNonNegative(input.piso, 'Piso');
  if (teto !== null && piso !== null && piso > teto) throw new PrevidenciarioError('Piso informado é maior que o teto.');
  let dataNascimento = null;
  if (input.dataNascimento) {
    try {
      partsFromIso(input.dataNascimento, 'Data de nascimento');
    } catch (error) {
      throw new PrevidenciarioError(`Data de nascimento inválida: ${input.dataNascimento}.`);
    }
    dataNascimento = input.dataNascimento;
  }
  if (input.dataReferencia) {
    try {
      partsFromIso(input.dataReferencia, 'Data de referência');
    } catch (error) {
      throw new PrevidenciarioError(`Data de referência inválida: ${input.dataReferencia}.`);
    }
  }
  if (input.referenciaCorrecao) {
    try {
      assertPeriodValue(input.referenciaCorrecao, 'Competência de referência da correção');
    } catch (error) {
      throw new PrevidenciarioError(`Competência de referência inválida: ${input.referenciaCorrecao}.`);
    }
  }
  return { competencias, teto, piso, divisorMinimo: input.divisorMinimo === true, dataNascimento, dataReferencia: input.dataReferencia || null };
}

export function buildPrevidenciarioCalculation(input) {
  const { competencias, teto, piso, divisorMinimo, dataNascimento, dataReferencia } = validate(input);
  const correcaoAtiva = input.corrigirSalarios === true;
  const correcao = correcaoAtiva
    ? calcularRmiComCorrecao({
        competencias: competencias.map(item => ({ competencia: item.competencia, salario: toFixedString(item.salario, 2) })),
        referencia: input.referenciaCorrecao || competencias[competencias.length - 1].competencia,
        descarte: input.descarte !== false
      })
    : null;
  const quantidade = competencias.length;
  let soma = 0n;
  for (const item of competencias) soma = add(soma, item.salario);
  const divisor = divisorMinimo && quantidade < DIVISOR_MINIMO ? DIVISOR_MINIMO : quantidade;
  const salarioBeneficio = correcao ? parseDec(correcao.salarioBeneficio) : div(soma, parseDec(String(divisor)));
  const anos = Math.floor(quantidade / 12);
  const mesesRestantes = quantidade % 12;
  const anosBase = ANOS_BASE[input.sexo];
  const excedente = Math.max(0, anos - anosBase);
  const coeficiente = add(parseDec(COEFICIENTE_BASE), mul(parseDec(COEFICIENTE_INCREMENTO), parseDec(String(excedente))));
  const rmiBruta = mul(salarioBeneficio, div(coeficiente, parseDec('100')));
  let rmi = rmiBruta;
  let limiteAplicado = null;
  if (teto !== null && rmi > teto) {
    rmi = teto;
    limiteAplicado = 'teto';
  } else if (piso !== null && rmi < piso) {
    rmi = piso;
    limiteAplicado = 'piso';
  }
  const avisos = [
    correcaoAtiva
      ? 'Salários nominais corrigidos pelo INPC com o teto da época aplicado antes da correção.'
      : 'Informe os salários de contribuição já corrigidos para a mesma data de referência; a correção monetária é etapa separada.',
    'Regras de transição da EC 103, direito adquirido, tempo especial, rural e concomitância não são calculados nesta fase.',
    correcaoAtiva
      ? 'O descarte aplicado é o dos 20% menores salários corrigidos (regra pré-reforma); o descarte do art. 26, § 6º, da EC 103 não é aplicado.'
      : 'O descarte de contribuições do art. 26, § 6º, da EC 103 não é aplicado.',
    'Confira o CNIS e a carta de concessão antes de usar o resultado.'
  ];
  if (anos < anosBase) {
    avisos.push(`Tempo informado (${anos} anos) abaixo do mínimo de ${anosBase} anos para o coeficiente cheio; o coeficiente permanece em 60%.`);
  }
  if (divisorMinimo && quantidade < DIVISOR_MINIMO) {
    avisos.push(`Divisor mínimo aplicado: a soma foi dividida por ${DIVISOR_MINIMO} (Lei 14.331/2022), e não por ${quantidade} competências.`);
  }
  let transicoes = null;
  if (dataNascimento) {
    const mesesAteReforma = competencias.filter(item => item.competencia <= '2019-11').length;
    transicoes = buildTransicoes({
      sexo: input.sexo,
      dataNascimento,
      mesesAteReforma,
      mesesAposReforma: quantidade - mesesAteReforma,
      ...(dataReferencia ? { dataReferencia } : {})
    });
  }
  return {
    sexo: input.sexo,
    primeiraCompetencia: competencias[0].competencia,
    ultimaCompetencia: competencias[competencias.length - 1].competencia,
    parametros: {
      divisor,
      divisorMinimoAplicado: divisorMinimo && quantidade < DIVISOR_MINIMO,
      anos,
      mesesRestantes,
      anosBase,
      coeficiente: toFixedString(coeficiente, 2),
      correcaoAtiva,
      referenciaCorrecao: correcao ? correcao.referencia : null,
      descarteAplicado: correcao ? correcao.descarteAplicado : null
    },
    resumo: {
      competencias: quantidade,
      carenciaMeses: quantidade,
      somaSalarios: correcao ? correcao.somaConsiderada : money(toCents(soma)),
      salarioBeneficio: money(toCents(salarioBeneficio)),
      coeficiente: toFixedString(coeficiente, 2),
      rmiBruta: money(toCents(rmiBruta)),
      rmi: money(toCents(rmi)),
      limiteAplicado,
      teto: teto === null ? null : money(toCents(teto)),
      piso: piso === null ? null : money(toCents(piso))
    },
    correcao,
    memoria: [
      {
        tipo: 'media',
        descricao: correcao
          ? `Média dos ${correcao.consideradas} maiores salários corrigidos (PBC de ${correcao.pbc}; ${correcao.descartadas} descartados)`
          : `Soma de ${quantidade} competências dividida por ${divisor}`,
        valor: money(toCents(salarioBeneficio))
      },
      { tipo: 'coeficiente', descricao: `60% + 2% × ${excedente} ano(s) excedente(s) a ${anosBase}`, valor: `${toFixedString(coeficiente, 2)}%` },
      { tipo: 'rmi', descricao: 'Salário de benefício × coeficiente', valor: money(toCents(rmiBruta)) },
      ...(limiteAplicado ? [{ tipo: 'limite', descricao: `Limite de ${limiteAplicado} aplicado`, valor: money(toCents(rmi)) }] : [])
    ],
    transicoes,
    avisos: [
      ...avisos,
      ...(correcao
        ? [
            `Salários corrigidos pelo INPC (teto da época aplicado antes) com referência ${correcao.referencia}; fontes: ${correcao.fontes.tetos}`,
            'Competências anteriores a 2001 podem divergir da tabela de transição oficial do INSS; o descarte dos 20% menores costuma absorver a diferença.'
          ]
        : [])
    ]
  };
}

export function calcularRmiComCorrecao({ competencias, referencia, descarte = true, serieInpc = null } = {}) {
  if (!Array.isArray(competencias) || competencias.length === 0) {
    throw new PrevidenciarioError('Informe as competências com salários para a correção.');
  }
  assertPeriodValue(referencia, 'competência de referência');
  const opcoes = serieInpc ? { serie: serieInpc } : {};
  const parcelas = competencias.map(item => {
    if (!item || typeof item !== 'object') throw new PrevidenciarioError('Competência inválida na lista de correção.');
    assertPeriodValue(String(item.competencia || ''), 'competência');
    return corrigirSalario(item.competencia, item.salario, referencia, opcoes);
  });
  const pbc = parcelas.length;
  const consideradas = descarte ? Math.max(1, Math.floor(pbc * 0.8)) : pbc;
  const ordenadas = [...parcelas].sort((a, b) => cmp(b.corrigidoDec, a.corrigidoDec));
  const usadas = ordenadas.slice(0, consideradas);
  const descartadas = ordenadas.slice(consideradas);
  let soma = 0n;
  for (const parcela of usadas) soma += toCents(parcela.corrigidoDec);
  const media = div(fromCents(soma), parseDec(String(consideradas)));
  const salarioBeneficio = toCents(media);
  const parcelasPublicas = parcelas.map(parcela => ({
    competencia: parcela.competencia,
    salario: parcela.salarioNominal,
    teto: parcela.teto,
    considerado: parcela.considerado,
    indice: parcela.indice,
    corrigido: parcela.corrigido,
    fonte: parcela.fonte
  }));
  return {
    referencia,
    pbc,
    consideradas,
    descartadas: descartadas.length,
    parcelas: parcelasPublicas,
    parcelasDescartadas: descartadas.map(parcela => parcela.competencia),
    somaConsiderada: money(soma),
    media: money(salarioBeneficio),
    salarioBeneficio: money(salarioBeneficio),
    descarteAplicado: descarte,
    fontes: fontesAtualizacao()
  };
}

export function describePrevidenciarioInput(input) {
  validate(input);
  return {
    sexo: input.sexo,
    competencias: input.competencias.length,
    divisorMinimo: input.divisorMinimo === true,
    teto: input.teto ?? null,
    piso: input.piso ?? null,
    dataNascimento: input.dataNascimento ?? null,
    corrigirSalarios: input.corrigirSalarios === true,
    referenciaCorrecao: input.referenciaCorrecao ?? null
  };
}

export function mediaSalarios(competencias) {
  if (!Array.isArray(competencias) || competencias.length === 0) {
    throw new PrevidenciarioError('Média exige competências.');
  }
  let soma = 0n;
  for (const item of competencias) soma = add(soma, parseDec(item.salario));
  return div(soma, parseDec(String(competencias.length)));
}

export function coeficienteProgressivo(sexo, meses) {
  if (!SEXOS.includes(sexo)) throw new PrevidenciarioError(`Sexo inválido: ${sexo}.`);
  if (!Number.isInteger(meses) || meses < 0) throw new PrevidenciarioError(`Meses inválidos: ${meses}.`);
  const anos = Math.floor(meses / 12);
  const excedente = Math.max(0, anos - ANOS_BASE[sexo]);
  return add(parseDec(COEFICIENTE_BASE), mul(parseDec(COEFICIENTE_INCREMENTO), parseDec(String(excedente))));
}
