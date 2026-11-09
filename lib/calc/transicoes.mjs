import { partsFromIso } from './calendar.mjs';

export class TransicoesError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TransicoesError';
  }
}

export const REFORMA = '2019-11-13';
const TEMPO_MINIMO_MESES = Object.freeze({ feminino: 360, masculino: 420 });
const PONTOS_BASE = Object.freeze({ feminino: 86, masculino: 96 });
const PONTOS_TETO = Object.freeze({ feminino: 100, masculino: 105 });
const IDADE_BASE = Object.freeze({ feminino: 56, masculino: 61 });
const IDADE_TETO = Object.freeze({ feminino: 62, masculino: 65 });
const PEDAGIO_100_IDADE = Object.freeze({ feminino: 57, masculino: 60 });

function idadeEmMeses(nascimentoIso, referenciaIso) {
  const nascimento = partsFromIso(nascimentoIso, 'data de nascimento');
  const referencia = partsFromIso(referenciaIso, 'data de referência');
  let meses = (referencia.year - nascimento.year) * 12 + (referencia.month - nascimento.month);
  if (referencia.day < nascimento.day) meses -= 1;
  return Math.max(0, meses);
}

function mesesParaAnos(meses) {
  return Math.floor(meses / 12);
}

function anosCompletosDeTempo(meses) {
  return Math.floor(meses / 12);
}

export function pontosExigidos(sexo, ano) {
  if (!['feminino', 'masculino'].includes(sexo)) throw new TransicoesError(`Sexo inválido: ${sexo}.`);
  const exigido = PONTOS_BASE[sexo] + Math.max(0, ano - 2019);
  return Math.min(exigido, PONTOS_TETO[sexo]);
}

export function idadeExigidaMeses(sexo, ano) {
  if (!['feminino', 'masculino'].includes(sexo)) throw new TransicoesError(`Sexo inválido: ${sexo}.`);
  const exigida = IDADE_BASE[sexo] + 0.5 * Math.max(0, ano - 2019);
  return Math.round(Math.min(exigida, IDADE_TETO[sexo]) * 12);
}

export function buildTransicoes(input) {
  if (!input || typeof input !== 'object') throw new TransicoesError('Transições exigem um objeto de entrada.');
  const sexo = input.sexo;
  if (!['feminino', 'masculino'].includes(sexo)) throw new TransicoesError(`Sexo inválido: ${sexo}.`);
  if (!input.dataNascimento) throw new TransicoesError('Informe a data de nascimento para comparar as regras.');
  const referencia = input.dataReferencia || new Date().toISOString().slice(0, 10);
  partsFromIso(referencia, 'data de referência');
  const tempoAteReforma = Number.isInteger(input.mesesAteReforma) ? input.mesesAteReforma : 0;
  const tempoAposReforma = Number.isInteger(input.mesesAposReforma) ? input.mesesAposReforma : 0;
  if (tempoAteReforma < 0 || tempoAposReforma < 0) throw new TransicoesError('Tempo de contribuição não pode ser negativo.');
  const tempoTotal = tempoAteReforma + tempoAposReforma;
  const idadeMeses = idadeEmMeses(input.dataNascimento, referencia);
  const anoReferencia = partsFromIso(referencia).year;
  const tempoMinimo = TEMPO_MINIMO_MESES[sexo];

  const regras = [];

  const direitoAdquirido = tempoAteReforma >= tempoMinimo;
  regras.push({
    id: 'direito-adquirido',
    nome: 'Direito adquirido (pré-reforma)',
    fundamento: 'Regras vigentes até 13/11/2019',
    elegivel: direitoAdquirido,
    rmi: 'regras-antigas',
    requisitos: [`Tempo mínimo de ${mesesParaAnos(tempoMinimo)} anos cumprido até ${REFORMA}`],
    faltas: direitoAdquirido ? null : { tempoMeses: tempoMinimo - tempoAteReforma },
    observacao: 'Regras antigas (média com descarte e fator previdenciário quando favorável) não são recalculadas neste comparador.'
  });

  const pontos = pontosExigidos(sexo, anoReferencia);
  const pontosAtuais = anosCompletosDeTempo(tempoTotal) + mesesParaAnos(idadeMeses);
  const faltaTempoPontos = Math.max(0, tempoMinimo - tempoTotal);
  const faltaPontos = Math.max(0, pontos - pontosAtuais);
  regras.push({
    id: 'pontos',
    nome: `Transição por pontos (${pontos} pontos em ${anoReferencia})`,
    fundamento: 'EC 103/2019, art. 15',
    elegivel: faltaTempoPontos === 0 && faltaPontos === 0,
    rmi: 'coeficiente-progressivo',
    requisitos: [
      `Tempo mínimo de ${mesesParaAnos(tempoMinimo)} anos`,
      `Pontos exigidos em ${anoReferencia}: ${pontos} (idade ${mesesParaAnos(idadeMeses)} + tempo ${anosCompletosDeTempo(tempoTotal)})`
    ],
    faltas: faltaTempoPontos === 0 && faltaPontos === 0 ? null : { tempoMeses: faltaTempoPontos, pontos: faltaPontos }
  });

  const idadeExigida = idadeExigidaMeses(sexo, anoReferencia);
  const faltaIdade = Math.max(0, idadeExigida - idadeMeses);
  regras.push({
    id: 'idade-progressiva',
    nome: `Transição por idade progressiva (${(idadeExigida / 12).toFixed(1).replace('.', ',')} anos em ${anoReferencia})`,
    fundamento: 'EC 103/2019, art. 16',
    elegivel: faltaTempoPontos === 0 && faltaIdade === 0,
    rmi: 'coeficiente-progressivo',
    requisitos: [`Tempo mínimo de ${mesesParaAnos(tempoMinimo)} anos`, 'Idade mínima progressiva'],
    faltas: faltaTempoPontos === 0 && faltaIdade === 0 ? null : { tempoMeses: faltaTempoPontos, idadeMeses: faltaIdade }
  });

  const faltava50 = Math.max(0, tempoMinimo - tempoAteReforma);
  const aplica50 = faltava50 > 0 && faltava50 <= 24;
  const pedagio50 = Math.ceil(faltava50 / 2);
  regras.push({
    id: 'pedagio-50',
    nome: 'Transição por pedágio de 50%',
    fundamento: 'EC 103/2019, art. 17',
    elegivel: aplica50 && tempoTotal >= tempoMinimo + pedagio50,
    rmi: 'fator-previdenciario',
    requisitos: ['Faltavam até 2 anos em 13/11/2019', `Pedágio de ${pedagio50} mês(es)`],
    faltas: !aplica50 ? { aplicavel: false } : (tempoTotal >= tempoMinimo + pedagio50 ? null : { tempoMeses: tempoMinimo + pedagio50 - tempoTotal }),
    observacao: aplica50 ? 'O RMI desta regra usa fator previdenciário (Lei 9.876/1999); o fator exige expectativa de sobrevida do IBGE e não é calculado neste comparador.' : 'Regra não aplicável: o segurado não estava a menos de 2 anos do tempo mínimo em 13/11/2019.'
  });

  const aplica100 = tempoAteReforma > 0 && tempoAteReforma < tempoMinimo;
  const pedagio100 = faltava50;
  const idade100Exigida = PEDAGIO_100_IDADE[sexo] * 12;
  const faltaIdade100 = Math.max(0, idade100Exigida - idadeMeses);
  const faltaTempo100 = Math.max(0, tempoMinimo + pedagio100 - tempoTotal);
  regras.push({
    id: 'pedagio-100',
    nome: 'Transição por pedágio de 100%',
    fundamento: 'EC 103/2019, art. 20',
    elegivel: aplica100 && faltaIdade100 === 0 && faltaTempo100 === 0,
    rmi: '100%-media',
    requisitos: [`Idade mínima de ${PEDAGIO_100_IDADE[sexo]} anos`, `Tempo mínimo de ${mesesParaAnos(tempoMinimo)} anos`, `Pedágio de ${pedagio100} mês(es)`],
    faltas: !aplica100 ? { aplicavel: false } : (faltaIdade100 === 0 && faltaTempo100 === 0 ? null : { tempoMeses: faltaTempo100, idadeMeses: faltaIdade100 }),
    observacao: 'RMI de 100% da média, sem redutor.'
  });

  const idadeRegraGeral = sexo === 'feminino' ? 62 * 12 : 65 * 12;
  const faltaIdadeGeral = Math.max(0, idadeRegraGeral - idadeMeses);
  const faltaCarencia = Math.max(0, 180 - tempoTotal);
  regras.push({
    id: 'idade-permanente',
    nome: `Regra permanente por idade (${idadeRegraGeral / 12} anos)`,
    fundamento: 'EC 103/2019, art. 18',
    elegivel: faltaIdadeGeral === 0 && faltaCarencia === 0,
    rmi: 'coeficiente-progressivo',
    requisitos: ['Idade mínima', 'Carência de 15 anos'],
    faltas: faltaIdadeGeral === 0 && faltaCarencia === 0 ? null : { idadeMeses: faltaIdadeGeral, carenciaMeses: faltaCarencia }
  });

  return {
    referencia,
    sexo,
    idadeMeses,
    idadeAnos: mesesParaAnos(idadeMeses),
    tempoTotalMeses: tempoTotal,
    tempoTotalAnos: anosCompletosDeTempo(tempoTotal),
    tempoAteReformaMeses: tempoAteReforma,
    regras,
    observacoes: [
      'Tempo apurado por competências: não considera concomitância, tempo especial, rural ou militar; confira o CNIS.',
      'Projeções usam a idade e o tempo atuais; a data de aposentadoria futura exige simulação com contribuições contínuas.',
      'Pedágio de 50% depende de fator previdenciário (expectativa de sobrevida do IBGE), não calculado aqui.'
    ]
  };
}
