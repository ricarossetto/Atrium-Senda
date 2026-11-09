import { add, div, mul, parseDec, toFixedString } from './decimal.mjs';
import { calcularIrrf, calcularIrrfExclusivo } from './tabelas.mjs';

export class RetornoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RetornoError';
  }
}

const ALFA = Object.freeze({ masculino: '0.31', feminino: '0.26' });
const ISENCAO_65 = 1903.98;

function meses(value, label) {
  const numero = Number(value);
  if (!Number.isInteger(numero) || numero < 0 || numero > 1200) {
    throw new RetornoError(`${label} deve ser um número inteiro de meses entre 0 e 1200.`);
  }
  return numero;
}

export function fatorPrevidenciario({ sexo, idadeAnos, tempoContribuicaoMeses, expectativaSobrevidaAnos } = {}) {
  if (!['masculino', 'feminino'].includes(sexo)) throw new RetornoError(`Sexo inválido: ${sexo}.`);
  const idade = Number(idadeAnos);
  if (!Number.isFinite(idade) || idade < 0 || idade > 110) throw new RetornoError('Idade inválida.');
  const tempo = meses(tempoContribuicaoMeses, 'Tempo de contribuição');
  const expectativa = Number(String(expectativaSobrevidaAnos).replace(',', '.'));
  if (!Number.isFinite(expectativa) || expectativa <= 0) {
    throw new RetornoError('Expectativa de sobrevida deve ser informada em anos (fonte IBGE) e maior que zero.');
  }
  const tc = div(parseDec(String(tempo)), parseDec('12'));
  const alfa = parseDec(ALFA[sexo]);
  const tcAlfa = mul(tc, alfa);
  const primeiraParte = div(tcAlfa, parseDec(String(expectativa)));
  const segundaParte = add(parseDec('1'), div(add(parseDec(String(idade)), tcAlfa), parseDec('100')));
  const fator = mul(primeiraParte, segundaParte);
  return {
    sexo,
    idadeAnos: idade,
    tempoContribuicaoAnos: toFixedString(tc, 4),
    expectativaSobrevidaAnos: expectativa,
    alfa: ALFA[sexo],
    fator: toFixedString(fator, 4),
    formula: '(Tc × a / Es) × [1 + (Id + Tc × a) / 100]',
    avisos: [
      'Fator previdenciário é opcional e só se aplica às regras que o admitem; confirme a regra aplicável antes de usar.',
      'A expectativa de sobrevida deve vir da tábua IBGE vigente na data da DIB (fonte oficial), não de estimativa própria.'
    ]
  };
}

export function calcularRetorno({ rmi, mesesRecebimento, idadeAnos = null, decimoTerceiro = true, contribuicoesTotais = null, dependentes = 0 } = {}) {
  const valor = Number(String(rmi).replace(',', '.'));
  if (!Number.isFinite(valor) || valor <= 0) throw new RetornoError('RMI inválida para o cálculo de retorno.');
  const quantidade = meses(mesesRecebimento, 'Meses de recebimento');
  if (quantidade === 0) throw new RetornoError('Informe meses de recebimento maiores que zero.');
  const idade = idadeAnos === null || idadeAnos === undefined ? null : Number(idadeAnos);
  if (idade !== null && (!Number.isFinite(idade) || idade < 0 || idade > 110)) throw new RetornoError('Idade inválida.');
  const dependentesNumero = meses(dependentes, 'Dependentes');

  const isento65 = idade !== null && idade >= 65 && valor <= ISENCAO_65;
  const irrfMensal = isento65
    ? '0.00'
    : calcularIrrf({ rendimento: valor.toFixed(2), dependentes: dependentesNumero }).irrf;
  const irrfDecimo = decimoTerceiro
    ? calcularIrrfExclusivo({ rendimento: valor.toFixed(2) }).irrf
    : '0.00';

  const rmiLiquida = valor - Number(irrfMensal);
  const bruto = valor * quantidade;
  const mesesComDecimo = decimoTerceiro ? Math.floor(quantidade / 12) : 0;
  const brutoDecimo = mesesComDecimo * valor;
  const liquido = rmiLiquida * quantidade + (decimoTerceiro ? mesesComDecimo * (valor - Number(irrfDecimo)) : 0);
  const contribuicoes = contribuicoesTotais === null || contribuicoesTotais === undefined
    ? null
    : Number(String(contribuicoesTotais).replace(',', '.'));
  if (contribuicoes !== null && (!Number.isFinite(contribuicoes) || contribuicoes < 0)) {
    throw new RetornoError('Contribuições totais inválidas.');
  }
  return {
    rmi: valor.toFixed(2),
    mesesRecebimento: quantidade,
    decimoTerceiro,
    decimos: mesesComDecimo,
    bruto: bruto.toFixed(2),
    brutoComDecimo: (bruto + brutoDecimo).toFixed(2),
    irrfMensal,
    irrfDecimo,
    isento65,
    liquido: liquido.toFixed(2),
    contribuicoesTotais: contribuicoes === null ? null : contribuicoes.toFixed(2),
    retorno: contribuicoes && contribuicoes > 0 ? (liquido / contribuicoes).toFixed(2) : null,
    avisos: [
      'Projeção estimada: usa meses de recebimento informados (expectativa de sobrevida), sem reajustes, juros ou correção futura.',
      isento65
        ? `Isenção de IRRF para 65+ aplicada porque a RMI não excede R$ ${ISENCAO_65.toFixed(2)} (art. 6º, XV, Lei 7.713/1988).`
        : 'IRRF calculado pela tabela vigente de 2026 sobre a RMI; a parcela isenta de 65+ é limitada por lei e pode não zerar o imposto.',
      decimoTerceiro ? '13º tributado exclusivamente na fonte, como rendimento de aposentadoria.' : '13º não considerado nesta projeção.'
    ]
  };
}
