import { add, cmp, div, mul, parseDec, sub, toFixedString, toNumber } from './decimal.mjs';
import { calcularIrrf, calcularIrrfExclusivo } from './tabelas.mjs';

export class RetornoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RetornoError';
  }
}

const ALFA = Object.freeze({ masculino: '0.31', feminino: '0.26' });
const ISENCAO_65 = '1903.98';
const ISENCAO_65_DEC = parseDec(ISENCAO_65);

function meses(value, label, { maximo = 1200 } = {}) {
  const numero = Number(value);
  if (!Number.isInteger(numero) || numero < 0 || numero > maximo) {
    throw new RetornoError(`${label} deve ser um número inteiro entre 0 e ${maximo}.`);
  }
  return numero;
}

function parseDecimalOpcional(value) {
  if (value === null || value === undefined) return null;
  let normalized = value;
  if (typeof normalized === 'string') {
    const trimmed = normalized.trim();
    if (trimmed === '') return null;
    normalized = trimmed.replace(',', '.');
  }
  return parseDec(normalized);
}

export function fatorPrevidenciario({ sexo, idadeAnos, tempoContribuicaoMeses, expectativaSobrevidaAnos } = {}) {
  if (!['masculino', 'feminino'].includes(sexo)) throw new RetornoError(`Sexo inválido: ${sexo}.`);
  const idade = Number(idadeAnos);
  if (!Number.isFinite(idade) || idade < 0 || idade > 110) throw new RetornoError('Idade inválida.');
  const tempo = meses(tempoContribuicaoMeses, 'Tempo de contribuição');
  let expectativaDec;
  try {
    expectativaDec = parseDecimalOpcional(expectativaSobrevidaAnos);
  } catch {
    expectativaDec = null;
  }
  if (expectativaDec === null || expectativaDec <= 0n) {
    throw new RetornoError('Expectativa de sobrevida deve ser informada em anos (fonte IBGE) e maior que zero.');
  }
  const tc = div(parseDec(String(tempo)), parseDec('12'));
  const alfa = parseDec(ALFA[sexo]);
  const tcAlfa = mul(tc, alfa);
  const primeiraParte = div(tcAlfa, expectativaDec);
  const segundaParte = add(parseDec('1'), div(add(parseDec(String(idade)), tcAlfa), parseDec('100')));
  const fator = mul(primeiraParte, segundaParte);
  return {
    sexo,
    idadeAnos: idade,
    tempoContribuicaoAnos: toFixedString(tc, 4),
    expectativaSobrevidaAnos: toNumber(expectativaDec),
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
  let valor;
  try {
    valor = parseDecimalOpcional(rmi);
  } catch {
    valor = null;
  }
  if (valor === null || valor <= 0n) throw new RetornoError('RMI inválida para o cálculo de retorno.');
  const quantidade = meses(mesesRecebimento, 'Meses de recebimento');
  if (quantidade === 0) throw new RetornoError('Informe meses de recebimento maiores que zero.');
  if (typeof idadeAnos === 'boolean' || (typeof idadeAnos === 'object' && idadeAnos !== null)) {
    throw new RetornoError('Idade inválida.');
  }
  const idadeTexto = typeof idadeAnos === 'string' ? idadeAnos.trim() : idadeAnos;
  const idade = idadeTexto === null || idadeTexto === undefined || idadeTexto === '' ? null : Number(idadeTexto);
  if (idade !== null && (!Number.isFinite(idade) || idade < 0 || idade > 110)) throw new RetornoError('Idade inválida.');
  const dependentesNumero = meses(dependentes ?? 0, 'Dependentes', { maximo: 20 });

  const rmiArredondada = toFixedString(valor, 2);
  const isento65 = idade !== null && idade >= 65 && cmp(valor, ISENCAO_65_DEC) <= 0;
  const irrfMensal = isento65
    ? '0.00'
    : calcularIrrf({ rendimento: rmiArredondada, dependentes: dependentesNumero }).irrf;
  const irrfDecimo = decimoTerceiro
    ? calcularIrrfExclusivo({ rendimento: rmiArredondada, dependentes: dependentesNumero }).irrf
    : '0.00';

  const irrfMensalDec = parseDec(irrfMensal);
  const irrfDecimoDec = parseDec(irrfDecimo);
  const rmiLiquida = sub(valor, irrfMensalDec);
  const quantidadeDec = parseDec(String(quantidade));
  const bruto = mul(valor, quantidadeDec);
  const mesesComDecimo = decimoTerceiro ? Math.floor(quantidade / 12) : 0;
  const decimosDec = parseDec(String(mesesComDecimo));
  const brutoDecimo = mul(decimosDec, valor);
  const liquidoMensalTotal = mul(rmiLiquida, quantidadeDec);
  const liquidoDecimoTotal = decimoTerceiro ? mul(decimosDec, sub(valor, irrfDecimoDec)) : parseDec('0');
  const liquido = add(liquidoMensalTotal, liquidoDecimoTotal);
  const brutoComDecimo = add(bruto, brutoDecimo);

  let contribuicoes = null;
  try {
    contribuicoes = parseDecimalOpcional(contribuicoesTotais);
  } catch {
    throw new RetornoError('Contribuições totais inválidas.');
  }
  if (contribuicoes !== null && contribuicoes < 0n) {
    throw new RetornoError('Contribuições totais inválidas.');
  }
  return {
    rmi: rmiArredondada,
    mesesRecebimento: quantidade,
    decimoTerceiro,
    decimos: mesesComDecimo,
    bruto: toFixedString(bruto, 2),
    brutoComDecimo: toFixedString(brutoComDecimo, 2),
    irrfMensal,
    irrfDecimo,
    isento65,
    liquido: toFixedString(liquido, 2),
    contribuicoesTotais: contribuicoes === null ? null : toFixedString(contribuicoes, 2),
    retorno: contribuicoes !== null && contribuicoes > 0n ? toFixedString(div(liquido, contribuicoes), 2) : null,
    avisos: [
      'Projeção estimada: usa meses de recebimento informados (expectativa de sobrevida), sem reajustes, juros ou correção futura.',
      isento65
        ? `Isenção de IRRF para 65+ aplicada porque a RMI não excede R$ ${ISENCAO_65} (art. 6º, XV, Lei 7.713/1988).`
        : 'IRRF calculado pela tabela vigente de 2026 sobre a RMI; a parcela isenta de 65+ é limitada por lei e pode não zerar o imposto.',
      decimoTerceiro ? '13º tributado exclusivamente na fonte, como rendimento de aposentadoria.' : '13º não considerado nesta projeção.'
    ]
  };
}
