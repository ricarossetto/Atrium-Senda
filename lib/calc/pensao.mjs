/**
 * Acumulação de pensões — porta de `previus-core/src/pension.rs`.
 *
 * Regra: a maior renda entra integral; as demais passam por faixas de 100%, 60%,
 * 40%, 20% sobre a base informada, com excedente a 10%. Cada faixa é
 * quantizada em centavos no próprio passo, e o percentual exibido é apenas
 * apresentação — nunca se multiplica a renda original por ele.
 *
 * Honestidade declarada (herdada da fonte): um único cenário foi observado na
 * origem. A base é entrada explícita do operador e **não** é índice oficial; o
 * desempate e o arredondamento são políticas experimentais. Isto **não** é
 * cálculo de RMI, não valida direito e não substitui conferência humana.
 */

import { parseDec, toCents, fromCents, toFixedString, mul, div, add } from './decimal.mjs';

export class PensaoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PensaoError';
  }
}

export const PENSAO_POLICY_VERSION = 'accumulation_cents_v1';
export const FAIXAS_ACUMULACAO = Object.freeze([100, 60, 40, 20, 10]);
export const MODOS_ARREDONDAMENTO = Object.freeze(['half-up', 'half-even']);

/** Divisão inteira com arredondamento explícito, sobre BigInt (centavos). */
function roundRatio(numerador, denominador, modo) {
  if (denominador === 0n) throw new PensaoError('Divisão por zero no cálculo de percentual.');
  const negativo = (numerador < 0n) !== (denominador < 0n);
  const n = numerador < 0n ? -numerador : numerador;
  const d = denominador < 0n ? -denominador : denominador;
  const quociente = n / d;
  const resto = n % d;
  let resultado = quociente;
  if (resto !== 0n) {
    const dobro = resto * 2n;
    if (modo === 'half-even') {
      if (dobro > d || (dobro === d && quociente % 2n !== 0n)) resultado = quociente + 1n;
    } else if (dobro >= d) {
      resultado = quociente + 1n;
    }
  }
  return negativo ? -resultado : resultado;
}

function normalizarModo(modo) {
  const resolvido = modo === undefined || modo === null ? 'half-up' : String(modo);
  if (!MODOS_ARREDONDAMENTO.includes(resolvido)) {
    throw new PensaoError(`Modo de arredondamento inválido: ${resolvido}.`);
  }
  return resolvido;
}

function exigirCentavos(valor, rotulo, { permitirZero = true } = {}) {
  let centavos;
  try {
    centavos = toCents(parseDec(valor));
  } catch (error) {
    throw new PensaoError(`${rotulo} inválido: ${valor}.`);
  }
  if (centavos < 0n) throw new PensaoError(`${rotulo} não pode ser negativo.`);
  if (!permitirZero && centavos === 0n) throw new PensaoError(`${rotulo} deve ser maior que zero.`);
  return centavos;
}

function moeda(centavos) {
  return toFixedString(fromCents(centavos), 2);
}

/**
 * Percentual recebido sobre a renda original, com 2 casas (ex.: "60.00").
 * `null` quando a renda original é zero — não se inventa percentual de 0/0.
 */
function percentualRecebido(recebidoCentavos, originalCentavos, modo) {
  if (originalCentavos === 0n) return null;
  const centesimos = roundRatio(recebidoCentavos * 10_000n, originalCentavos, modo);
  const inteiro = centesimos / 100n;
  const fracao = centesimos % 100n;
  return `${inteiro}.${String(fracao < 0n ? -fracao : fracao).padStart(2, '0')}`;
}

/**
 * Aplica as cinco faixas sobre a renda excedente.
 * A última faixa absorve o que restar — por isso o total nunca descarta centavo.
 */
function reduzirRenda(originalCentavos, baseCentavos, modo) {
  let restante = originalCentavos;
  let total = 0n;
  const faixas = [];
  FAIXAS_ACUMULACAO.forEach((percentual, indice) => {
    const ultima = indice === FAIXAS_ACUMULACAO.length - 1;
    const baseFaixa = ultima ? restante : (restante < baseCentavos ? restante : baseCentavos);
    restante -= baseFaixa;
    const recebido = toCents(
      mul(fromCents(baseFaixa), div(parseDec(String(percentual)), parseDec('100'))),
      modo
    );
    total += recebido;
    faixas.push({
      ordinal: indice + 1,
      baseAmount: moeda(baseFaixa),
      ratePercent: percentual,
      receivedAmount: moeda(recebido)
    });
  });
  return { total, faixas };
}

/**
 * Acumulação declarada de rendas.
 *
 * @param {object} entrada
 * @param {string} entrada.referenceDate  data de referência (AAAA-MM-DD), informada pelo operador
 * @param {Array<string|number>} entrada.incomes  rendas, na ordem original
 * @param {string|number} entrada.referenceBase  base das faixas; NÃO é índice oficial
 * @param {'half-up'|'half-even'} [entrada.rounding]
 */
export function acumularPensoes({ referenceDate, incomes, referenceBase, rounding } = {}) {
  const modo = normalizarModo(rounding);
  if (typeof referenceDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) {
    throw new PensaoError('Informe a data de referência (AAAA-MM-DD).');
  }
  if (!Array.isArray(incomes) || incomes.length === 0) {
    throw new PensaoError('Acumulação exige ao menos uma renda.');
  }
  if (incomes.length > 500) {
    throw new PensaoError('Acumulação limitada a 500 rendas por cenário.');
  }
  const baseCentavos = exigirCentavos(referenceBase, 'Base de referência', { permitirZero: false });
  const originais = incomes.map((valor, indice) => exigirCentavos(valor, `Renda ${indice + 1}`));

  // Maior renda integral; empate resolvido pela primeira posição (política declarada).
  let maior = 0;
  for (let i = 1; i < originais.length; i += 1) {
    if (originais[i] > originais[maior]) maior = i;
  }

  const resultados = [];
  let totalReduzido = 0n;
  originais.forEach((original, indice) => {
    const integral = indice === maior;
    const { total, faixas } = integral
      ? { total: original, faixas: [] }
      : reduzirRenda(original, baseCentavos, modo);
    if (!integral) totalReduzido += total;
    resultados.push({
      originalIndex: indice,
      originalAmount: moeda(original),
      integral,
      receivedAmount: moeda(total),
      receivedPercentage: percentualRecebido(total, original, modo),
      tranches: faixas
    });
  });

  const integralCentavos = originais[maior];
  const totalCombinado = integralCentavos + totalReduzido;

  return {
    referenceDate,
    referenceBase: moeda(baseCentavos),
    integralIncomeIndex: maior,
    integralIncome: moeda(integralCentavos),
    incomes: resultados,
    reducedTotal: moeda(totalReduzido),
    combinedTotal: moeda(totalCombinado),
    rounding: modo,
    explanation: [
      'Maior renda integral; empate resolvido pela primeira posição, política nova e não observada.',
      'Outras rendas: quatro faixas limitadas à base informada, com 100%, 60%, 40%, 20%; excedente com 10%.',
      'Cada faixa é arredondada em centavos conforme modo explícito; percentuais são somente apresentação.'
    ]
  };
}

/** Envelope do domínio, com a honestidade da fonte preservada. */
export function envelopePensao(entrada) {
  const resultado = acumularPensoes(entrada);
  return {
    status: 'experimental',
    legal_validation_performed: false,
    actual_entitlement_verified: false,
    rule_review_status: 'declared_scenario_assumptions',
    policy_version: PENSAO_POLICY_VERSION,
    warnings: [
      'Um único cenário foi observado na origem. A base é entrada explícita do operador, não validada oficialmente; outras combinações, desempate e arredondamento são políticas experimentais.',
      'Esta acumulação não é cálculo de RMI, não determina direito a benefício e não substitui conferência humana.',
      'Confira a carta de concessão e a legislação aplicável à data do fato gerador antes de usar o resultado.'
    ],
    data: { native_result: resultado }
  };
}
