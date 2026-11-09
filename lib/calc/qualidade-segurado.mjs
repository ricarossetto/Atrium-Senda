/**
 * Qualidade de segurado — porta de `previus-core/src/quality.rs`, integrada ao
 * cálculo de período de graça que o ATRIUM já tinha.
 *
 * Dois modelos coexistem aqui, e o envelope diz **qual** foi aplicado:
 *
 * 1. **Regra geral** (`calcularPeriodoGraca`, já existente): 12 meses de período
 *    de graça, prorrogados a 24 com 120 ou mais contribuições mensais, mais 12
 *    por desemprego comprovado — art. 15 da Lei 8.213/1991.
 * 2. **Variante facultativa** (esta porta, de `quality.rs`): 6 meses civis somados
 *    ao mês da última contribuição, prazo no dia 15 do segundo mês seguinte e
 *    perda no dia seguinte.
 *
 * A variante facultativa é declaradamente experimental na origem: deriva de
 * apenas dois vetores observados (TEST-02/TEST-03, UI-030/UI-033), sem ajuste de
 * feriado ou fim de semana e sem interpretação jurídica. Por isso ela nunca é
 * apresentada como se fosse a regra geral, e o resultado carrega essa ressalva.
 */

import { addDays, monthOf, monthAfter, partsFromIso } from './calendar.mjs';
import { calcularPeriodoGraca } from './tempo-contribuicao.mjs';

export class QualidadeSeguradoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QualidadeSeguradoError';
  }
}

export const CATEGORIAS_SEGURADO = Object.freeze(['facultative', 'employee', 'individual_contributor', 'other']);
export const QUALIDADE_FACULTATIVA_POLICY = 'facultative_quality_v1';
export const GRACA_FACULTATIVA_MESES = 6;
/** Meses somados ao último mês de graça até o prazo; o dia é sempre 15. */
export const MESES_ATE_PRAZO = 2;
export const DIA_DO_PRAZO = 15;

function exigirIso(valor, rotulo) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new QualidadeSeguradoError(`${rotulo} deve estar em AAAA-MM-DD.`);
  }
  try {
    partsFromIso(valor, rotulo);
  } catch (error) {
    throw new QualidadeSeguradoError(`${rotulo} inválida: ${valor}.`);
  }
  return valor;
}

/**
 * Variante facultativa: 6 meses civis somados ao mês, prazo no dia 15 do segundo
 * mês seguinte, perda no dia seguinte ao prazo.
 */
export function periodoGracaFacultativo({ lastContributionDate } = {}) {
  const ultima = exigirIso(lastContributionDate, 'Data da última contribuição');
  let mes = monthOf(ultima);
  for (let i = 0; i < GRACA_FACULTATIVA_MESES; i += 1) mes = monthAfter(mes);
  const ultimoMesGraca = mes;
  let mesPrazo = ultimoMesGraca;
  for (let i = 0; i < MESES_ATE_PRAZO; i += 1) mesPrazo = monthAfter(mesPrazo);
  const dataPrazo = `${mesPrazo}-${String(DIA_DO_PRAZO).padStart(2, '0')}`;
  const dataPerda = addDays(dataPrazo, 1);

  return {
    graceMonths: GRACA_FACULTATIVA_MESES,
    lastGraceMonth: ultimoMesGraca,
    latestPaymentDate: dataPrazo,
    qualityLossDate: dataPerda,
    explanation: [
      'Mês da contribuição informado explicitamente; somam-se seis meses civis ao mês, sem deslocar o dia.',
      'Prazo experimental: dia 15 do segundo mês após o último mês de graça.',
      'Perda experimental: dia seguinte ao prazo, sem correção de feriados/fins de semana.'
    ]
  };
}

/**
 * Avalia a qualidade de segurado e devolve envelope de domínio.
 *
 * `unsupported` quando nenhum modelo se aplica — a ausência de suporte é
 * declarada, nunca convertida em resultado inventado.
 */
export function avaliarQualidadeSegurado(entrada = {}) {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    throw new QualidadeSeguradoError('A avaliação de qualidade exige um objeto de entrada.');
  }
  const categoria = entrada.insuredCategory;
  if (categoria !== undefined && categoria !== null && !CATEGORIAS_SEGURADO.includes(categoria)) {
    throw new QualidadeSeguradoError(`Categoria de segurado inválida: ${categoria}.`);
  }
  const parouDeContribuir = entrada.stoppedContributing === true;
  const recebeBeneficio = entrada.currentlyReceivingBenefit === true;

  const usaFacultativa = parouDeContribuir && !recebeBeneficio && categoria === 'facultative';
  const temDadosGerais = entrada.contribuicoesMeses !== undefined && entrada.contribuicoesMeses !== null;

  if (!usaFacultativa && !temDadosGerais) {
    return {
      status: 'unsupported',
      legal_validation_performed: false,
      actual_entitlement_verified: false,
      rule_review_status: 'unvalidated',
      policy_version: QUALIDADE_FACULTATIVA_POLICY,
      data: null,
      missing: ['qualidade_modelo_aplicavel'],
      warnings: [
        'Nenhum modelo de qualidade de segurado se aplica a esta entrada.',
        'A variante facultativa exige: contribuição interrompida, sem benefício em curso e categoria facultativa.',
        'A regra geral exige o número de contribuições mensais (e, se houver, a última contribuição).'
      ]
    };
  }

  const resultado = {};
  const avisos = [];

  if (usaFacultativa) {
    const facultativa = periodoGracaFacultativo({ lastContributionDate: entrada.lastContributionDate });
    resultado.facultativa = facultativa;
    avisos.push(
      'Variante facultativa: deriva de dois vetores observados na origem; outras datas são extrapolação experimental.',
      'A variante facultativa não ajusta feriados nem fins de semana e não determina direito a benefício.'
    );
  }

  if (temDadosGerais) {
    resultado.geral = calcularPeriodoGraca({
      ultimaContribuicao: entrada.lastContributionDate,
      contribuicoesMeses: entrada.contribuicoesMeses,
      dataReferencia: entrada.dataReferencia,
      desempregoComprovado: entrada.desempregoComprovado === true
    });
    avisos.push(
      'Regra geral aplicada: art. 15 da Lei 8.213/1991 (12 meses, prorrogáveis a 24 com 120 ou mais contribuições).'
    );
  }

  const modeloAplicado = usaFacultativa && temDadosGerais
    ? 'geral_e_facultativa'
    : usaFacultativa
      ? 'facultativa'
      : 'geral';

  return {
    status: 'experimental',
    legal_validation_performed: false,
    actual_entitlement_verified: false,
    rule_review_status: 'declared_scenario_assumptions',
    policy_version: QUALIDADE_FACULTATIVA_POLICY,
    modelo_aplicado: modeloAplicado,
    warnings: [
      'Período de graça é contagem declarada: não determina direito a benefício nem substitui conferência humana.',
      ...avisos
    ],
    data: { native_result: resultado }
  };
}
