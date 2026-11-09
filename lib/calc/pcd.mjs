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
  if (elegivel && media !== null && media !== undefined) {
    const numero = Number(String(media).replace(',', '.'));
    if (!Number.isFinite(numero) || numero < 0) throw new PcdError(`Média inválida: ${media}.`);
    const tetoNumero = teto === null || teto === undefined ? null : Number(String(teto).replace(',', '.'));
    const pisoNumero = piso === null || piso === undefined ? null : Number(String(piso).replace(',', '.'));
    let rmi = numero;
    let limiteAplicado = null;
    if (tetoNumero !== null && rmi > tetoNumero) {
      rmi = tetoNumero;
      limiteAplicado = 'teto';
    } else if (pisoNumero !== null && rmi < pisoNumero) {
      rmi = pisoNumero;
      limiteAplicado = 'piso';
    }
    resultado.rmi = rmi.toFixed(2);
    resultado.limiteAplicado = limiteAplicado;
  }
  return resultado;
}
