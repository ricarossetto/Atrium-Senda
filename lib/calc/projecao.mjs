/**
 * Projeção de data de aposentadoria — porta de `rgps-core/src/projecao.rs`.
 *
 * Simula contribuições contínuas com salário fixo a partir da última
 * competência informada e devolve a **primeira** DER em que alguma regra se
 * torna elegível, com a RMI da regra vencedora.
 *
 * Decisões de honestidade:
 *  - a projeção é estimativa, não certidão de tempo de contribuição;
 *  - período sem contribuição, tempo especial, rural, militar e concomitância
 *    **não** são simulados;
 *  - quando nenhuma regra é atingida no limite de 480 meses (40 anos), o
 *    resultado é declarado sem DER, sem RMI e sem valor inventado;
 *  - a RMI só é calculada quando a regra permite: o pedágio de 50% depende da
 *    expectativa de sobrevida do IBGE, que é entrada explícita do operador;
 *  - a regra vencedora é a de **maior RMI final** entre as elegíveis com RMI
 *    calculável, reproduzindo a seleção da fonte.
 *
 * A elegibilidade de cada regra vem de `lib/calc/transicoes.mjs`, módulo já
 * testado do projeto, em vez de reimplementar as mesmas condições aqui.
 */

import { parseDec, toCents, fromCents, toFixedString, mul, div, add, cmp } from './decimal.mjs';
import { partsFromIso, monthAfter } from './calendar.mjs';
import { buildTransicoes } from './transicoes.mjs';
import { coeficienteProgressivo } from './previdenciario.mjs';
import { fatorPrevidenciario } from './retorno.mjs';
import { tetoVigente } from './tabelas-atualizacao.mjs';

export class ProjecaoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProjecaoError';
  }
}

export const PROJECAO_POLICY_VERSION = 'projecao-observacional-v1';
/** Limite de simulação da fonte: 480 meses (40 anos). */
export const LIMITE_SIMULACAO_MESES = 480;
/** Competência da reforma da Previdência (EC 103/2019). */
export const COMPETENCIA_REFORMA = '2019-11';
export const PRIMEIRA_COMPETENCIA_PBC = '1994-07';
const TEMPO_MINIMO_MESES = Object.freeze({ feminino: 360, masculino: 420 });
/**
 * Regras que a projeção considera para decidir se parou. `direito-adquirido`
 * fica de fora, como na fonte: ele não tem RMI calculável neste comparador e
 * não representa uma data futura.
 */
export const REGRAS_PROJETAVEIS = Object.freeze([
  'pontos',
  'idade-progressiva',
  'pedagio-50',
  'pedagio-100',
  'idade-permanente'
]);

function moeda(centavos) {
  return toFixedString(fromCents(centavos), 2);
}

function exigirCompetencia(valor, rotulo) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}$/.test(valor)) {
    throw new ProjecaoError(`${rotulo} deve estar em AAAA-MM.`);
  }
  const [ano, mes] = valor.split('-').map(Number);
  if (ano < 1900 || ano > 9999 || mes < 1 || mes > 12) {
    throw new ProjecaoError(`${rotulo} fora do intervalo representável: ${valor}.`);
  }
  return valor;
}

function exigirData(valor, rotulo) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    throw new ProjecaoError(`${rotulo} deve estar em AAAA-MM-DD.`);
  }
  try {
    partsFromIso(valor, rotulo);
  } catch (error) {
    throw new ProjecaoError(`${rotulo} inválida: ${valor}.`);
  }
  return valor;
}

/** Avança uma data ISO em `meses`, preservando o dia quando possível. */
function somarMesesIso(iso, meses) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const total = ano * 12 + (mes - 1) + meses;
  const novoAno = Math.floor(total / 12);
  const novoMes = (total % 12) + 1;
  if (novoAno > 9999) throw new ProjecaoError('Data projetada excede o limite representável.');
  const ultimoDia = new Date(Date.UTC(novoAno, novoMes, 0)).getUTCDate();
  const novoDia = Math.min(dia, ultimoDia);
  return `${String(novoAno).padStart(4, '0')}-${String(novoMes).padStart(2, '0')}-${String(novoDia).padStart(2, '0')}`;
}

function validarCompetencias(competencias) {
  if (!Array.isArray(competencias) || competencias.length === 0) {
    throw new ProjecaoError('A projeção exige ao menos uma competência com salário.');
  }
  if (competencias.length > 1200) {
    throw new ProjecaoError('Projeção limitada a 1200 competências informadas.');
  }
  const vistas = new Set();
  const normalizadas = competencias.map((item, indice) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new ProjecaoError(`Competência ${indice + 1} inválida.`);
    }
    const competencia = exigirCompetencia(item.competencia, `Competência ${indice + 1}`);
    if (competencia < PRIMEIRA_COMPETENCIA_PBC) {
      throw new ProjecaoError(`Competência ${competencia} é anterior a ${PRIMEIRA_COMPETENCIA_PBC}; não entra no PBC.`);
    }
    if (vistas.has(competencia)) {
      throw new ProjecaoError(`Competência duplicada: ${competencia}.`);
    }
    vistas.add(competencia);
    let salario;
    try {
      salario = parseDec(item.salario);
    } catch (error) {
      throw new ProjecaoError(`Salário da competência ${competencia} inválido.`);
    }
    if (salario <= 0n) throw new ProjecaoError(`Salário da competência ${competencia} deve ser maior que zero.`);
    return { competencia, salario };
  });
  normalizadas.sort((a, b) => (a.competencia < b.competencia ? -1 : a.competencia > b.competencia ? 1 : 0));
  return normalizadas;
}

function contarMesesAteReforma(competencias) {
  return competencias.filter(item => item.competencia <= COMPETENCIA_REFORMA).length;
}

/**
 * Meses de contribuição **anteriores** ao início do PBC (1994-07).
 *
 * Por que isto existe: o PBC só considera competências a partir de 1994-07
 * (Lei 8.213/1991, art. 29), mas o **tempo de contribuição** e o marco da
 * reforma contam também o que veio antes. Sem separar os dois, quem contribuiu
 * antes de 1994 nunca alcançaria o pedágio de 50% — porque o máximo de meses
 * entre 1994-07 e 2019-11 é 305, abaixo dos 336 necessários para a mulher e
 * muito abaixo dos 396 do homem. Modelar os dois corretamente é o que torna a
 * regra alcançável, como ela é na prática.
 */
function normalizarMesesAnteriores(valor) {
  if (valor === undefined || valor === null || valor === '') return 0;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 0) {
    throw new ProjecaoError('Meses de contribuição anteriores ao PBC devem ser um inteiro não negativo.');
  }
  if (numero > 600) {
    throw new ProjecaoError('Meses de contribuição anteriores ao PBC limitados a 600 (50 anos).');
  }
  return numero;
}

/** Aplica teto e piso, registrando qual limite foi aplicado. */
function aplicarLimites(valor, tetoCentavos, pisoCentavos) {
  const centavos = toCents(valor);
  if (tetoCentavos !== null && centavos > tetoCentavos) return { centavos: tetoCentavos, limite: 'teto' };
  if (pisoCentavos !== null && centavos < pisoCentavos) return { centavos: pisoCentavos, limite: 'piso' };
  return { centavos, limite: null };
}

/**
 * RMI de cada regra elegível, na forma da fonte:
 *  - coeficiente progressivo (pontos, idade progressiva, idade permanente);
 *  - fator previdenciário (pedágio de 50%), só com expectativa de sobrevida;
 *  - 100% da média (pedágio de 100%).
 */
function rmiDaRegra(regraId, contexto) {
  const { sexo, tempoTotalMeses, idadeMeses, salarioBeneficio, tetoCentavos, pisoCentavos, expectativaSobrevidaAnos } = contexto;
  if (regraId === 'pedagio-100') {
    return { ...aplicarLimites(salarioBeneficio, tetoCentavos, pisoCentavos), criterio: '100%-media' };
  }
  if (regraId === 'pedagio-50') {
    if (expectativaSobrevidaAnos === null) {
      return { centavos: null, limite: null, criterio: 'fator-previdenciario', motivo: 'Expectativa de sobrevida do IBGE não informada.' };
    }
    const fator = fatorPrevidenciario({
      sexo,
      idadeAnos: Math.floor(idadeMeses / 12),
      tempoContribuicaoMeses: tempoTotalMeses,
      expectativaSobrevidaAnos
    });
    const bruto = mul(salarioBeneficio, parseDec(fator.fator));
    const limites = aplicarLimites(bruto, tetoCentavos, pisoCentavos);
    return { ...limites, criterio: 'fator-previdenciario', fator: fator.fator };
  }
  if (regraId === 'pontos' || regraId === 'idade-progressiva' || regraId === 'idade-permanente') {
    const coeficiente = coeficienteProgressivo(sexo, tempoTotalMeses);
    const bruto = mul(salarioBeneficio, div(coeficiente, parseDec('100')));
    const limites = aplicarLimites(bruto, tetoCentavos, pisoCentavos);
    return { ...limites, criterio: 'coeficiente-progressivo', coeficiente: toFixedString(coeficiente, 2) };
  }
  return { centavos: null, limite: null, criterio: 'nao-calculado', motivo: `Regra ${regraId} não tem RMI calculável nesta versão.` };
}

/**
 * Regra elegível na forma pública.
 *
 * `centavos` é um BigInt interno, usado só para eleger a vencedora. Ele **não** pode
 * sair no envelope: `JSON.stringify` lança `TypeError` em BigInt e a rota devolveria
 * 500 no caminho feliz. A RMI publicada é a string decimal; o valor interno fica.
 */
function publicarRegra(avaliada) {
  const { centavos, ...resto } = avaliada;
  return { ...resto, rmi: centavos === null ? null : moeda(centavos) };
}

/**
 * Projeta a primeira DER elegível.
 *
 * @param {object} entrada
 * @param {'feminino'|'masculino'} entrada.sexo
 * @param {string} entrada.dataNascimento  AAAA-MM-DD
 * @param {string} entrada.dataReferencia  AAAA-MM-DD da DER de partida
 * @param {Array<{competencia:string,salario:string}>} entrada.competencias
 * @param {boolean} [entrada.corrigirSalarios]
 * @param {boolean} [entrada.descarte]
 * @param {string} [entrada.salarioSimulacao]  padrão: último salário informado
 * @param {string} [entrada.teto]
 * @param {string} [entrada.piso]
 * @param {boolean} [entrada.aplicarTetoVigenteDer]
 * @param {string} [entrada.expectativaSobrevida]  anos (IBGE)
 * @param {string} [entrada.regraAlvo]  exige uma regra específica
 */
export function projetarAposentadoria(entrada = {}) {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    throw new ProjecaoError('A projeção exige um objeto de entrada.');
  }
  const { sexo } = entrada;
  if (!Object.prototype.hasOwnProperty.call(TEMPO_MINIMO_MESES, sexo)) {
    throw new ProjecaoError(`Sexo inválido: ${sexo}.`);
  }
  const dataNascimento = exigirData(entrada.dataNascimento, 'Data de nascimento');
  const dataReferencia = exigirData(entrada.dataReferencia, 'Data de referência');
  const competencias = validarCompetencias(entrada.competencias);
  const regraAlvo = entrada.regraAlvo === undefined || entrada.regraAlvo === null || entrada.regraAlvo === ''
    ? null
    : String(entrada.regraAlvo);
  if (regraAlvo !== null && !REGRAS_PROJETAVEIS.includes(regraAlvo)) {
    throw new ProjecaoError(`Regra alvo desconhecida: ${regraAlvo}.`);
  }

  const ultima = competencias[competencias.length - 1];
  const salarioSimulacao = entrada.salarioSimulacao === undefined || entrada.salarioSimulacao === null || entrada.salarioSimulacao === ''
    ? ultima.salario
    : (() => {
        try {
          return parseDec(entrada.salarioSimulacao);
        } catch (error) {
          throw new ProjecaoError('Salário de simulação inválido.');
        }
      })();
  if (salarioSimulacao <= 0n) throw new ProjecaoError('Salário de simulação deve ser maior que zero.');

  const tetoCentavos = entrada.teto === undefined || entrada.teto === null || entrada.teto === '' ? null : toCents(parseDec(entrada.teto));
  const pisoCentavos = entrada.piso === undefined || entrada.piso === null || entrada.piso === '' ? null : toCents(parseDec(entrada.piso));
  if (tetoCentavos !== null && pisoCentavos !== null && pisoCentavos > tetoCentavos) {
    throw new ProjecaoError('Piso informado é maior que o teto.');
  }
  const expectativaSobrevidaAnos = entrada.expectativaSobrevida === undefined || entrada.expectativaSobrevida === null || entrada.expectativaSobrevida === ''
    ? null
    : Number(String(entrada.expectativaSobrevida).replace(',', '.'));
  if (expectativaSobrevidaAnos !== null && (!Number.isFinite(expectativaSobrevidaAnos) || expectativaSobrevidaAnos <= 0)) {
    throw new ProjecaoError('Expectativa de sobrevida deve ser um número de anos maior que zero.');
  }
  const corrigirSalarios = entrada.corrigirSalarios === true;
  const mesesAnteriores = normalizarMesesAnteriores(entrada.mesesContribuicaoAnteriores);
  const mesesAteReforma = mesesAnteriores + contarMesesAteReforma(competencias);

  const avisos = [
    'Projeção assume contribuições contínuas com salário fixo (último salário ou o informado); períodos sem contribuição, tempo especial, rural, militar e concomitância não são simulados.',
    'A projeção é estimativa e não constitui certidão de tempo de contribuição.',
    'A RMI projetada usa a legislação vigente hoje; mudança legislativa altera o resultado.'
  ];
  if (mesesAnteriores > 0) {
    avisos.push(
      `${mesesAnteriores} mês(es) anteriores a ${PRIMEIRA_COMPETENCIA_PBC} contam para o tempo de contribuição e para o marco da reforma, mas NÃO entram na média do salário de benefício (art. 29 da Lei 8.213/1991).`
    );
  }
  if (corrigirSalarios) {
    avisos.push('Correção monetária solicitada: exige série de índices publicada até a competência da DER projetada.');
  }
  if (expectativaSobrevidaAnos === null) {
    avisos.push('Sem expectativa de sobrevida do IBGE, a regra de pedágio de 50% não tem RMI calculada e não pode vencer por valor.');
  }

  for (let m = 0; m <= LIMITE_SIMULACAO_MESES; m += 1) {
    const competenciaDer = (() => {
      let cursor = monthAfter(ultima.competencia);
      for (let i = 0; i < m; i += 1) cursor = monthAfter(cursor);
      return cursor;
    })();
    const der = somarMesesIso(dataReferencia, m);
    const tempoTotalMeses = mesesAnteriores + competencias.length + m;

    const transicoes = buildTransicoes({
      sexo,
      dataNascimento,
      dataReferencia: der,
      mesesAteReforma,
      mesesAposReforma: tempoTotalMeses - mesesAteReforma
    });
    const elegiveis = transicoes.regras.filter(
      regra => regra.elegivel && REGRAS_PROJETAVEIS.includes(regra.id)
    );
    const atende = regraAlvo === null
      ? elegiveis.length > 0
      : elegiveis.some(regra => regra.id === regraAlvo);
    if (!atende) continue;

    // PBC na competência da DER, incluindo as competências simuladas.
    const pbcCompleto = [...competencias];
    let cursor = monthAfter(ultima.competencia);
    for (let i = 0; i < m; i += 1) {
      pbcCompleto.push({ competencia: cursor, salario: salarioSimulacao });
      cursor = monthAfter(cursor);
    }

    let soma = 0n;
    for (const item of pbcCompleto) soma += item.salario;
    if (corrigirSalarios) {
      throw new ProjecaoError(
        `Correção monetária até ${competenciaDer} não é possível: a série publicada termina antes da DER projetada. ` +
        'Rode a projeção com salários já corrigidos ou sem correção.'
      );
    }
    const salarioBeneficio = div(soma, parseDec(String(pbcCompleto.length)));

    const tetoDerCentavos = entrada.aplicarTetoVigenteDer === true
      ? toCents(parseDec(tetoVigente(competenciaDer).teto))
      : tetoCentavos;

    const contexto = {
      sexo,
      tempoTotalMeses,
      idadeMeses: transicoes.idadeMeses,
      salarioBeneficio,
      tetoCentavos: tetoDerCentavos,
      pisoCentavos,
      expectativaSobrevidaAnos
    };

    const avaliadas = elegiveis.map(regra => ({
      id: regra.id,
      nome: regra.nome,
      fundamento: regra.fundamento,
      criterio: regra.rmi,
      ...rmiDaRegra(regra.id, contexto)
    }));

    // Vencedora: maior RMI final entre as elegíveis com RMI calculada.
    let vencedora = null;
    for (const avaliada of avaliadas) {
      if (avaliada.centavos === null) continue;
      if (vencedora === null || avaliada.centavos > vencedora.centavos) vencedora = avaliada;
    }

    if (vencedora === null) {
      // Elegível, mas sem RMI calculável: a projeção não inventa valor.
      // A(s) regra(s) atingida(s) continuam declaradas — o que falta é a RMI,
      // não a elegibilidade.
      return {
        salarioSimulacao: moeda(toCents(salarioSimulacao)),
        mesesSimulados: m,
        der,
        competenciaDer,
        regraEscolhida: null,
        regraNome: null,
        motivoSemRmi: 'sem_rmi_calculavel',
        regrasElegiveisSemRmi: elegiveis.map(regra => regra.id),
        rmi: null,
        salarioBeneficio: moeda(toCents(salarioBeneficio)),
        idadeDerMeses: transicoes.idadeMeses,
        idadeDerAnos: Math.floor(transicoes.idadeMeses / 12),
        tempoDerMeses: tempoTotalMeses,
        tempoDerAnos: Math.floor(tempoTotalMeses / 12),
        carenciaDer: tempoTotalMeses,
        regraAlvo,
        regrasElegiveis: avaliadas.map(publicarRegra),
        avisos: [
          ...avisos,
          `Há regra elegível (${elegiveis.map(r => r.id).join(', ')}), mas nenhuma tem RMI calculável com os dados informados. Nenhum valor é apresentado.`
        ]
      };
    }

    const limitesAplicados = avaliadas.filter(a => a.limite !== null).map(a => `${a.id}:${a.limite}`);
    return {
      salarioSimulacao: moeda(toCents(salarioSimulacao)),
      mesesSimulados: m,
      der,
      competenciaDer,
      regraEscolhida: vencedora.id,
      regraNome: vencedora.nome,
      regraFundamento: vencedora.fundamento,
      criterioRmi: vencedora.criterio,
      rmi: moeda(vencedora.centavos),
      rmiSemLimite: vencedora.limite === null,
      salarioBeneficio: moeda(toCents(salarioBeneficio)),
      idadeDerMeses: transicoes.idadeMeses,
      idadeDerAnos: Math.floor(transicoes.idadeMeses / 12),
      tempoDerMeses: tempoTotalMeses,
      tempoDerAnos: Math.floor(tempoTotalMeses / 12),
      carenciaDer: tempoTotalMeses,
      regraAlvo,
      regrasElegiveis: avaliadas.map(publicarRegra),
      avisos: [
        ...avisos,
        `Regra vencedora escolhida por maior RMI final entre as elegíveis: ${vencedora.id}.`,
        ...(limitesAplicados.length > 0 ? [`Limites aplicados em: ${limitesAplicados.join(', ')}.`] : [])
      ]
    };
  }

  avisos.push(`Nenhuma regra elegível em ${LIMITE_SIMULACAO_MESES} meses de simulação (40 anos).`);
  return {
    salarioSimulacao: moeda(toCents(salarioSimulacao)),
    mesesSimulados: LIMITE_SIMULACAO_MESES,
    der: null,
    competenciaDer: null,
    regraEscolhida: null,
    regraNome: null,
    rmi: null,
    salarioBeneficio: null,
    idadeDerMeses: null,
    tempoDerMeses: null,
    carenciaDer: null,
    regraAlvo,
    regrasElegiveis: [],
    avisos
  };
}

/** Envelope do domínio com os limites declarados. */
export function envelopeProjecao(entrada) {
  const resultado = projetarAposentadoria(entrada);
  return {
    status: resultado.der === null ? 'unsupported' : 'experimental',
    legal_validation_performed: false,
    actual_entitlement_verified: false,
    rule_review_status: resultado.der === null ? 'unvalidated' : 'declared_scenario_assumptions',
    policy_version: PROJECAO_POLICY_VERSION,
    data: resultado.der === null ? null : { native_result: resultado },
    missing: resultado.der === null ? ['regra_elegivel_no_limite_de_simulacao'] : [],
    warnings: resultado.avisos
  };
}
