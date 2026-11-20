import { cmp, parseDec, toFixedString } from './decimal.mjs';

export class PcdError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PcdError';
  }
}

export const GRAUS_PCD = ['leve', 'moderada', 'grave'];

const TEMPO_MINIMO_MESES = Object.freeze({
  grave: { masculino: 25 * 12, feminino: 20 * 12 },
  moderada: { masculino: 29 * 12, feminino: 24 * 12 },
  leve: { masculino: 33 * 12, feminino: 28 * 12 }
});

const CARENCIA_MESES = 180;

function decimalOpcional(value, label) {
  if (value === null || value === undefined) return null;
  let normalized = value;
  if (typeof normalized === 'string') {
    const trimmed = normalized.trim();
    if (trimmed === '') return null;
    normalized = trimmed.replace(',', '.');
  }
  let parsed;
  try {
    parsed = parseDec(normalized);
  } catch {
    throw new PcdError(`${label} inválido: ${value}.`);
  }
  if (parsed < 0n) throw new PcdError(`${label} não pode ser negativo.`);
  return parsed;
}

function inteiro(value, label, { minimo = 0, maximo = 1200 } = {}) {
  const numero = Number(value);
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
    throw new PcdError(`${label} deve ser um número inteiro entre ${minimo} e ${maximo}.`);
  }
  return numero;
}

export function tempoMinimoPcd(grau, sexo) {
  if (!GRAUS_PCD.includes(grau)) throw new PcdError(`Grau de deficiência inválido: ${grau}.`);
  if (!['masculino', 'feminino'].includes(sexo)) throw new PcdError(`Sexo inválido: ${sexo}.`);
  return TEMPO_MINIMO_MESES[grau][sexo];
}

export function avaliarAposentadoriaPcd({ sexo, grau, tempoMeses, carenciaMeses, idadeAnos = null, media = null, teto = null, piso = null } = {}) {
  const minimo = tempoMinimoPcd(grau, sexo);
  const tempo = inteiro(tempoMeses, 'Tempo de contribuição (meses)');
  const carencia = inteiro(carenciaMeses, 'Carência (meses)');
  const idade = idadeAnos === null || idadeAnos === undefined ? null : inteiro(idadeAnos, 'Idade', { maximo: 110 });
  const requisitos = [
    { requisito: 'Tempo de contribuição na condição de PcD', minimoMeses: minimo, atualMeses: tempo, cumprido: tempo >= minimo },
    { requisito: 'Carência', minimoMeses: CARENCIA_MESES, atualMeses: carencia, cumprido: carencia >= CARENCIA_MESES }
  ];
  const elegivel = requisitos.every(item => item.cumprido);
  const faltantes = requisitos
    .filter(item => !item.cumprido)
    .map(item => ({ requisito: item.requisito, faltamMeses: item.minimoMeses - item.atualMeses }));
  const resultado = {
    grau,
    sexo,
    tempoMinimoMeses: minimo,
    carenciaMinimaMeses: CARENCIA_MESES,
    idadeAnos: idade,
    elegivel,
    requisitos,
    faltantes,
    coeficiente: elegivel ? '100.00' : null,
    rmi: null,
    avisos: [
      'LC 142/2013: RMI de 100% do salário de benefício para a aposentadoria da PcD, sem fator previdenciário.',
      'A avaliação da deficiência (grau, início e agravamento) é biopsicossocial e deve ser instruída por perícia e documentos; o grau informado aqui é declaratório.',
      'Conversão de tempo entre condição PcD e comum (Decreto 10.410/2020) não é automática: use o fator de conversão informado e registre o enquadramento.'
    ]
  };
  const tetoValor = decimalOpcional(teto, 'Teto');
  const pisoValor = decimalOpcional(piso, 'Piso');
  if (pisoValor !== null && tetoValor !== null && cmp(pisoValor, tetoValor) > 0) {
    throw new PcdError('Piso não pode ser maior que o teto.');
  }
  const mediaValor = decimalOpcional(media, 'Média');
  if (elegivel && mediaValor !== null) {
    let rmi = mediaValor;
    let limiteAplicado = null;
    if (tetoValor !== null && cmp(rmi, tetoValor) > 0) {
      rmi = tetoValor;
      limiteAplicado = 'teto';
    } else if (pisoValor !== null && cmp(rmi, pisoValor) < 0) {
      rmi = pisoValor;
      limiteAplicado = 'piso';
    }
    resultado.rmi = toFixedString(rmi, 2);
    resultado.limiteAplicado = limiteAplicado;
  }
  return resultado;
}
