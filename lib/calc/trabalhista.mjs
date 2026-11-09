import { parseDec, toCents, fromCents, toFixedString, percentOf, div, mul } from './decimal.mjs';
import { calcularInss, calcularIrrf, calcularIrrfExclusivo, vigenciaFiscal } from './tabelas.mjs';
import { partsFromIso, monthOf, monthAfter, daysInMonth, daysBetween, isoFromParts } from './calendar.mjs';

export class TrabalhistaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TrabalhistaError';
  }
}

export const TIPOS_DESLIGAMENTO = Object.freeze(['sem_justa_causa', 'pedido_demissao', 'acordo_484a', 'justa_causa', 'termino_contrato']);
export const TIPOS_AVISO = Object.freeze(['indenizado', 'trabalhado', 'descontado', 'nao_aplicavel']);

const MULTA_POR_TIPO = Object.freeze({
  sem_justa_causa: '40',
  acordo_484a: '20',
  pedido_demissao: '0',
  justa_causa: '0',
  termino_contrato: '0'
});

const AVISO_PADRAO = Object.freeze({
  sem_justa_causa: 'indenizado',
  acordo_484a: 'indenizado',
  pedido_demissao: 'descontado',
  justa_causa: 'nao_aplicavel',
  termino_contrato: 'nao_aplicavel'
});

function money(cents) {
  return toFixedString(fromCents(cents), 2);
}

function ensureObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TrabalhistaError(`${label} deve ser um objeto.`);
  return value;
}

function ensureDate(iso, label) {
  try {
    partsFromIso(iso, label);
  } catch (error) {
    throw new TrabalhistaError(`${label} inválida: ${iso}.`);
  }
  return iso;
}

function ensureNonNegative(value, label) {
  let parsed;
  try {
    parsed = parseDec(value);
  } catch (error) {
    throw new TrabalhistaError(`${label} inválido: ${value}.`);
  }
  if (parsed < 0n) throw new TrabalhistaError(`${label} não pode ser negativo.`);
  return parsed;
}

function fullYearsBetween(startIso, endIso) {
  const start = partsFromIso(startIso);
  const end = partsFromIso(endIso);
  let years = end.year - start.year;
  if (end.month < start.month || (end.month === start.month && end.day < start.day)) years -= 1;
  return Math.max(0, years);
}

function avosBetween(startIso, endIso) {
  if (endIso < startIso) return 0;
  let count = 0;
  let period = monthOf(startIso);
  const last = monthOf(endIso);
  while (period <= last) {
    const total = daysInMonth(period);
    const [year, month] = period.split('-').map(Number);
    const monthStart = isoFromParts(year, month, 1);
    const monthEnd = isoFromParts(year, month, total);
    const overlapStart = startIso > monthStart ? startIso : monthStart;
    const overlapEnd = endIso < monthEnd ? endIso : monthEnd;
    if (daysBetween(overlapStart, overlapEnd) + 1 >= 15) count += 1;
    period = monthAfter(period);
  }
  return count;
}

function lastAnniversary(admissaoIso, referenceIso) {
  const admissao = partsFromIso(admissaoIso);
  const reference = partsFromIso(referenceIso);
  const years = fullYearsBetween(admissaoIso, referenceIso);
  return isoFromParts(admissao.year + years, admissao.month, admissao.day);
}

function validate(input) {
  ensureObject(input, 'Entrada da rescisão');
  const salario = ensureNonNegative(input.salario, 'Salário');
  if (salario <= 0n) throw new TrabalhistaError('Salário deve ser maior que zero.');
  ensureDate(input.admissao, 'Data de admissão');
  ensureDate(input.desligamento, 'Data de desligamento');
  if (input.desligamento < input.admissao) throw new TrabalhistaError('Desligamento não pode ser anterior à admissão.');
  if (!TIPOS_DESLIGAMENTO.includes(input.tipoDesligamento)) {
    throw new TrabalhistaError(`Tipo de desligamento inválido: ${input.tipoDesligamento}.`);
  }
  const dias = input.diasTrabalhados === undefined ? 30 : input.diasTrabalhados;
  if (!Number.isInteger(dias) || dias < 0 || dias > 30) throw new TrabalhistaError(`Dias trabalhados inválidos: ${dias}.`);
  const feriasVencidas = input.feriasVencidas === undefined ? 0 : input.feriasVencidas;
  if (!Number.isInteger(feriasVencidas) || feriasVencidas < 0 || feriasVencidas > 5) {
    throw new TrabalhistaError(`Períodos de férias vencidas inválidos: ${feriasVencidas}.`);
  }
  const aviso = input.aviso || AVISO_PADRAO[input.tipoDesligamento];
  if (!TIPOS_AVISO.includes(aviso)) throw new TrabalhistaError(`Tipo de aviso inválido: ${aviso}.`);
  const saldoFgts = input.saldoFgts === undefined || input.saldoFgts === '' ? null : ensureNonNegative(input.saldoFgts, 'Saldo do FGTS');
  const multa = parseDec(MULTA_POR_TIPO[input.tipoDesligamento]);
  if (multa > 0n && saldoFgts === null) throw new TrabalhistaError('Informe o saldo do FGTS para calcular a multa.');
  const descontos = input.descontos === undefined ? [] : input.descontos;
  if (!Array.isArray(descontos)) throw new TrabalhistaError('Descontos devem ser uma lista.');
  descontos.forEach((desconto, index) => {
    ensureObject(desconto, `Desconto ${index + 1}`);
    if (!desconto.descricao) throw new TrabalhistaError(`Desconto ${index + 1} exige descrição.`);
    ensureNonNegative(desconto.valor, `Valor do desconto ${index + 1}`);
  });
  let tributacao = null;
  if (input.tributacao !== undefined && input.tributacao !== null) {
    ensureObject(input.tributacao, 'Tributação');
    const ano = input.tributacao.ano === undefined ? 2026 : input.tributacao.ano;
    if (!Number.isInteger(ano)) throw new TrabalhistaError(`Ano da tributação inválido: ${ano}.`);
    try {
      vigenciaFiscal(ano);
    } catch (error) {
      throw new TrabalhistaError(error.message);
    }
    const dependentes = input.tributacao.dependentes === undefined ? 0 : input.tributacao.dependentes;
    if (!Number.isInteger(dependentes) || dependentes < 0 || dependentes > 20) {
      throw new TrabalhistaError(`Dependentes inválidos para a tributação: ${dependentes}.`);
    }
    const pensao = input.tributacao.pensao === undefined || input.tributacao.pensao === '' ? '0' : input.tributacao.pensao;
    const outrasDeducoes = input.tributacao.outrasDeducoes === undefined || input.tributacao.outrasDeducoes === '' ? '0' : input.tributacao.outrasDeducoes;
    ensureNonNegative(pensao, 'Pensão alimentícia');
    ensureNonNegative(outrasDeducoes, 'Outras deduções');
    tributacao = { ano, dependentes, pensao, outrasDeducoes };
  }
  return { salario, dias, feriasVencidas, aviso, saldoFgts, descontos, multa, tributacao };
}

export function buildTrabalhistaCalculation(input) {
  const { salario, dias, feriasVencidas, aviso, saldoFgts, descontos, multa, tributacao } = validate(input);
  const tipo = input.tipoDesligamento;
  const justaCausa = tipo === 'justa_causa';
  const anosCompletos = fullYearsBetween(input.admissao, input.desligamento);
  const avisoDiasBase = Math.min(30 + 3 * anosCompletos, 90);
  const avisoDias = aviso === 'nao_aplicavel' || aviso === 'descontado' ? 0 : avisoDiasBase;
  const projecaoDias = aviso === 'indenizado' ? Math.floor(tipo === 'acordo_484a' ? avisoDias / 2 : avisoDias) : 0;
  const projecaoParts = projecaoDias > 0 ? addDaysIso(input.desligamento, projecaoDias) : null;
  const projecaoAte = projecaoParts ? isoFromParts(projecaoParts.year, projecaoParts.month, projecaoParts.day) : null;
  const referenciaProjecao = projecaoAte || input.desligamento;

  const verbas = [];
  const memoria = [];
  const addVerba = (id, descricao, fundamento, valorDec, natureza = 'provento') => {
    const cents = toCents(valorDec);
    verbas.push({ id, descricao, fundamento, natureza, valor: money(cents) });
    memoria.push({ tipo: 'verba', id, descricao, fundamento, valor: money(cents), natureza });
    return cents;
  };

  const saldoCents = addVerba('saldo', `Saldo de salário (${dias} dias)`, 'CLT, art. 462', div(mul(salario, parseDec(String(dias))), parseDec('30')));

  let decimoCents = 0n;
  let feriasPropCents = 0n;
  let feriasVencidasCents = 0n;

  if (feriasVencidas > 0) {
    feriasVencidasCents = addVerba('ferias-vencidas', `Férias vencidas (${feriasVencidas} período${feriasVencidas === 1 ? '' : 's'}) + 1/3`, 'CLT, arts. 130 e 142', div(mul(mul(salario, parseDec(String(feriasVencidas))), parseDec('4')), parseDec('3')));
  }

  if (!justaCausa) {
    const avos13 = avosBetween(`${partsFromIso(referenciaProjecao).year}-01-01`, referenciaProjecao);
    decimoCents = addVerba('decimo', `13º proporcional (${avos13}/12 avos)`, 'Lei 4.090/1962, art. 1º, § 2º', div(mul(salario, parseDec(String(avos13))), parseDec('12')));
    const aquisitivoInicio = lastAnniversary(input.admissao, referenciaProjecao);
    const avosFerias = avosBetween(aquisitivoInicio, referenciaProjecao);
    feriasPropCents = addVerba('ferias-proporcionais', `Férias proporcionais (${avosFerias}/12 avos) + 1/3`, 'Súmula 261 do TST; CF/88, art. 7º, XVII', div(mul(div(mul(salario, parseDec(String(avosFerias))), parseDec('12')), parseDec('4')), parseDec('3')));
  }

  let avisoCents = 0n;
  if (aviso === 'indenizado') {
    const bruto = div(mul(salario, parseDec(String(avisoDias))), parseDec('30'));
    const valor = tipo === 'acordo_484a' ? div(bruto, parseDec('2')) : bruto;
    avisoCents = addVerba('aviso', `Aviso prévio indenizado (${avisoDias} dias${tipo === 'acordo_484a' ? ', metade no acordo' : ''})`, 'CLT, art. 487; Lei 12.506/2011; CLT, art. 484-A', valor);
  } else if (aviso === 'trabalhado') {
    memoria.push({ tipo: 'observacao', id: 'aviso', descricao: `Aviso prévio trabalhado (${avisoDias} dias): verba paga no curso do contrato.`, fundamento: 'CLT, art. 488' });
  }

  let multaCents = 0n;
  if (multa > 0n && saldoFgts !== null) {
    multaCents = addVerba('multa-fgts', `Multa do FGTS (${toFixedString(multa, 0)}% sobre saldo informado)`, tipo === 'acordo_484a' ? 'CLT, art. 484-A' : 'Lei 8.036/1990, art. 18', percentOf(saldoFgts, multa));
  }

  const descontosCents = [];
  if (aviso === 'descontado') {
    const valor = div(mul(salario, parseDec('30')), parseDec('30'));
    descontosCents.push({ descricao: 'Desconto do aviso prévio não concedido (30 dias)', fundamento: 'CLT, art. 487, § 2º', valor: toCents(valor) });
  }

  let tributacaoResumo = null;
  if (tributacao) {
    const { ano, dependentes, pensao, outrasDeducoes } = tributacao;
    const saldoValor = fromCents(saldoCents);
    const inssSaldo = calcularInss(saldoValor, ano);
    const irrfSaldo = calcularIrrf({ rendimento: saldoValor, inss: inssSaldo.total, dependentes, pensao, outrasDeducoes, ano });
    descontosCents.push({
      descricao: `INSS sobre o saldo de salário (${ano})`,
      fundamento: `Lei 8.212/1991, art. 28; vigência ${ano} conferida na Portaria Interministerial MPS/MF`,
      valor: toCents(parseDec(inssSaldo.total))
    });
    descontosCents.push({
      descricao: `IRRF sobre o saldo de salário (${ano}, método ${irrfSaldo.metodo})`,
      fundamento: 'Lei 9.250/1995; Lei 15.191/2025 (tabela); Lei 15.270/2025 (redutor)',
      valor: toCents(parseDec(irrfSaldo.irrf))
    });
    let inssDecimo = null;
    let irrfDecimo = null;
    if (decimoCents > 0n) {
      const decimoValor = fromCents(decimoCents);
      inssDecimo = calcularInss(decimoValor, ano);
      irrfDecimo = calcularIrrfExclusivo({ rendimento: decimoValor, inss: inssDecimo.total, dependentes, ano });
      descontosCents.push({
        descricao: `INSS sobre o 13º proporcional (${ano}, em separado)`,
        fundamento: 'Lei 8.620/1993, art. 7º; Lei 8.212/1991, art. 28 (13º não soma à competência mensal)',
        valor: toCents(parseDec(inssDecimo.total))
      });
      descontosCents.push({
        descricao: `IRRF exclusivo sobre o 13º (${ano})`,
        fundamento: 'Decreto 9.580/2018, art. 700; Lei 15.270/2025, art. 2º, § 3º (redutor no 13º)',
        valor: toCents(parseDec(irrfDecimo.irrf))
      });
    }
    tributacaoResumo = {
      ano,
      dependentes,
      metodoSaldo: irrfSaldo.metodo,
      inss: { saldo: inssSaldo.total, decimo: inssDecimo ? inssDecimo.total : '0.00' },
      irrf: { saldo: irrfSaldo.irrf, decimo: irrfDecimo ? irrfDecimo.irrf : '0.00' },
      redutor: { saldo: irrfSaldo.redutor, decimo: irrfDecimo ? irrfDecimo.redutor : '0.00' },
      fontes: vigenciaFiscal(ano).fontes
    };
  }

  for (const desconto of descontos) {
    descontosCents.push({ descricao: desconto.descricao, fundamento: 'Desconto informado pelo operador', valor: toCents(parseDec(desconto.valor)) });
  }
  for (const desconto of descontosCents) {
    verbas.push({ id: null, descricao: desconto.descricao, fundamento: desconto.fundamento, natureza: 'desconto', valor: money(desconto.valor) });
    memoria.push({ tipo: 'verba', id: null, descricao: desconto.descricao, fundamento: desconto.fundamento, valor: money(desconto.valor), natureza: 'desconto' });
  }

  const totalProventos = verbas.filter(verba => verba.natureza === 'provento').reduce((total, verba) => total + toCents(parseDec(verba.valor)), 0n);
  const totalDescontos = verbas.filter(verba => verba.natureza === 'desconto').reduce((total, verba) => total + toCents(parseDec(verba.valor)), 0n);
  const liquido = totalProventos - totalDescontos;

  return {
    admissao: input.admissao,
    desligamento: input.desligamento,
    tipoDesligamento: tipo,
    parametros: {
      anosCompletos,
      avisoDiasBase,
      aviso,
      avisoDias: aviso === 'descontado' ? 30 : avisoDias,
      projecaoAte,
      multaPercentual: toFixedString(multa, 0),
      avos: {
        decimo: justaCausa ? 0 : avosBetween(`${partsFromIso(referenciaProjecao).year}-01-01`, referenciaProjecao),
        ferias: justaCausa ? 0 : avosBetween(lastAnniversary(input.admissao, referenciaProjecao), referenciaProjecao)
      },
      restricaoJustaCausa: justaCausa ? 'Justa causa: sem aviso, sem 13º e férias proporcionais e sem multa (Súmula 171 do TST).' : null
    },
    verbas,
    resumo: {
      proventos: money(totalProventos),
      descontos: money(totalDescontos),
      liquido: money(liquido),
      saldo: money(saldoCents),
      decimo: money(decimoCents),
      feriasProporcionais: money(feriasPropCents),
      feriasVencidas: money(feriasVencidasCents),
      aviso: money(avisoCents),
      multaFgts: money(multaCents)
    },
    tributacao: tributacaoResumo,
    memoria,
    avisos: [
      ...(tributacaoResumo
        ? [
            `Tributação automática aplicada com a vigência fiscal ${tributacaoResumo.ano}; confira as fontes antes de usar.`,
            'Férias indenizadas e aviso prévio indenizado ficam isentos por padrão; confira o tratamento do caso concreto.'
          ]
        : ['INSS e IRRF não são calculados nesta execução: informe os descontos manualmente com base nas tabelas vigentes.']),
      'O saldo do FGTS é informado pelo operador; o motor não estima depósitos mensais.',
      'Correção e juros trabalhistas seguem o título; use o módulo cível com a linha do tempo escolhida.'
    ]
  };
}

function addDaysIso(iso, days) {
  const { year, month, day } = partsFromIso(iso);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function describeTrabalhistaInput(input) {
  validate(input);
  return {
    tipoDesligamento: input.tipoDesligamento,
    aviso: input.aviso || AVISO_PADRAO[input.tipoDesligamento],
    multaPercentual: MULTA_POR_TIPO[input.tipoDesligamento],
    tributacao: input.tributacao ? { ano: input.tributacao.ano ?? 2026, dependentes: input.tributacao.dependentes ?? 0 } : null
  };
}
