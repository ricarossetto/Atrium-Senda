import { addDays, daysBetween, monthAfter, monthOf, partsFromIso } from './calendar.mjs';

export class TempoContribuicaoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TempoContribuicaoError';
  }
}

const TIPOS = ['empregado', 'empregado_domestico', 'contribuinte_individual', 'avulso', 'facultativo', 'rural', 'especial', 'servidor'];

const MARCO_EC20 = '1998-12-16';
const MARCO_EC103 = '2019-11-13';

function assertIso(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TempoContribuicaoError(`${label} inválida: use AAAA-MM-DD.`);
  }
  try {
    partsFromIso(value, label);
  } catch (error) {
    throw new TempoContribuicaoError(`${label} inválida: ${value}.`);
  }
  return value;
}

function diasInclusivos(inicio, fim) {
  return daysBetween(inicio, fim) + 1;
}

function fatorValido(fator) {
  if (fator === undefined || fator === null) return 1;
  const numero = Number(fator);
  if (!Number.isFinite(numero) || numero <= 0 || numero > 3) {
    throw new TempoContribuicaoError(`Fator inválido: ${fator}. Informe um número entre 0 e 3.`);
  }
  return numero;
}

export function calcularTempoContribuicao({ vinculos, dataReferencia } = {}) {
  if (!Array.isArray(vinculos) || vinculos.length === 0) {
    throw new TempoContribuicaoError('Informe ao menos um vínculo para calcular o tempo.');
  }
  if (dataReferencia !== undefined && dataReferencia !== null) assertIso(dataReferencia, 'Data de referência');

  const normalizados = vinculos.map((vinculo, index) => {
    if (!vinculo || typeof vinculo !== 'object') throw new TempoContribuicaoError(`Vínculo ${index + 1} inválido.`);
    const inicio = assertIso(String(vinculo.inicio || ''), `Início do vínculo ${index + 1}`);
    const fim = vinculo.fim ? assertIso(String(vinculo.fim), `Fim do vínculo ${index + 1}`) : dataReferencia || null;
    if (!fim) throw new TempoContribuicaoError(`Vínculo ${index + 1} sem fim exige uma data de referência.`);
    if (fim < inicio) throw new TempoContribuicaoError(`Vínculo ${index + 1} termina antes de começar.`);
    const tipo = vinculo.tipo || 'empregado';
    if (!TIPOS.includes(tipo)) throw new TempoContribuicaoError(`Tipo de vínculo desconhecido: ${tipo}.`);
    return {
      indice: index + 1,
      tipo,
      empresa: vinculo.empresa ? String(vinculo.empresa).slice(0, 120) : null,
      inicio,
      fim,
      fator: fatorValido(vinculo.fator)
    };
  }).sort((a, b) => (a.inicio === b.inicio ? a.fim.localeCompare(b.fim) : a.inicio.localeCompare(b.inicio)));

  const processados = [];
  let cursor = null;
  let totalDias = 0;
  let totalDiasEfetivos = 0;
  const competencias = new Set();
  for (const vinculo of normalizados) {
    const inicioEfetivo = cursor && vinculo.inicio <= cursor ? addDays(cursor, 1) : vinculo.inicio;
    const concomitante = inicioEfetivo > vinculo.inicio;
    const sobreposto = inicioEfetivo > vinculo.fim;
    const dias = sobreposto ? 0 : diasInclusivos(inicioEfetivo, vinculo.fim);
    const diasEfetivos = Math.round(dias * vinculo.fator);
    totalDias += dias;
    totalDiasEfetivos += diasEfetivos;
    if (dias > 0) {
      let periodo = monthOf(inicioEfetivo);
      const ultimoPeriodo = monthOf(vinculo.fim);
      while (periodo <= ultimoPeriodo) {
        competencias.add(periodo);
        periodo = monthAfter(periodo);
      }
      if (!cursor || vinculo.fim > cursor) cursor = vinculo.fim;
    }
    processados.push({
      indice: vinculo.indice,
      tipo: vinculo.tipo,
      empresa: vinculo.empresa,
      inicio: vinculo.inicio,
      fim: vinculo.fim,
      fator: vinculo.fator,
      dias,
      diasEfetivos,
      concomitante,
      sobreposto
    });
  }

  const anos = Math.floor(totalDiasEfetivos / 365);
  const meses = Math.floor((totalDiasEfetivos % 365) / 30);
  const dias = totalDiasEfetivos - anos * 365 - meses * 30;
  const marcos = {
    ateEc20: processados.reduce((total, vinculo) => {
      const fim = vinculo.fim < MARCO_EC20 ? vinculo.fim : MARCO_EC20;
      return total + (vinculo.inicio <= fim ? Math.round(diasInclusivos(vinculo.inicio, fim) * vinculo.fator) : 0);
    }, 0),
    ateEc103: processados.reduce((total, vinculo) => {
      const fim = vinculo.fim < MARCO_EC103 ? vinculo.fim : MARCO_EC103;
      return total + (vinculo.inicio <= fim ? Math.round(diasInclusivos(vinculo.inicio, fim) * vinculo.fator) : 0);
    }, 0),
    aposEc103: processados.reduce((total, vinculo) => {
      const inicio = vinculo.inicio > MARCO_EC103 ? vinculo.inicio : addDays(MARCO_EC103, 1);
      return total + (inicio <= vinculo.fim ? Math.round(diasInclusivos(inicio, vinculo.fim) * vinculo.fator) : 0);
    }, 0)
  };

  const avisos = [
    'Tempo informado é declaratório: confira cada vínculo no CNIS e nos documentos antes de usar o resultado.',
    'Tempo especial, rural e PcD exigem análise própria de enquadramento e não são convertidos automaticamente.'
  ];
  const comConcomitancia = processados.filter(vinculo => vinculo.concomitante).length;
  if (comConcomitancia > 0) avisos.push(`${comConcomitancia} vínculo(s) com período concomitante: apenas a parcela não sobreposta foi somada.`);

  return {
    vinculos: processados,
    totalDias,
    totalDiasEfetivos,
    total: { anos, meses, dias },
    carenciaMeses: competencias.size,
    marcos,
    avisos
  };
}

export function calcularPeriodoGraca({ ultimaContribuicao, contribuicoesMeses, dataReferencia, desempregoComprovado = false } = {}) {
  const ultima = assertIso(String(ultimaContribuicao || ''), 'Última contribuição');
  const referencia = dataReferencia ? assertIso(String(dataReferencia), 'Data de referência') : null;
  const meses = Number(contribuicoesMeses);
  if (!Number.isInteger(meses) || meses < 0) throw new TempoContribuicaoError('Contribuições mensais devem ser um número inteiro não negativo.');
  const prorrogacao = meses >= 120;
  const base = prorrogacao ? 24 : 12;
  const acrescimo = desempregoComprovado ? 12 : 0;
  const mesesTotais = base + acrescimo;
  const inicioMes = `${ultima.slice(0, 7)}-01`;
  const fim = addDays(addMonthsIso(addMonthsIso(inicioMes, mesesTotais), 1), -1);
  const avisos = [];
  if (prorrogacao) avisos.push('Prorrogação para 24 meses aplicada por 120 ou mais contribuições mensais (art. 15, § 1º, Lei 8.213/1991).');
  if (desempregoComprovado) avisos.push('Acréscimo de 12 meses por desemprego comprovado; exige registro no sistema e prova documental.');
  return {
    ultimaContribuicao: ultima,
    contribuicoesMeses: meses,
    mesesPeriodo: mesesTotais,
    prorrogacao,
    acrescimoDesemprego: acrescimo,
    fimPeriodo: fim,
    mantemQualidade: referencia === null ? null : referencia <= fim,
    dataReferencia: referencia,
    avisos
  };
}

function addMonthsIso(iso, months) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const total = (ano * 12) + (mes - 1) + months;
  const novoAno = Math.floor(total / 12);
  const novoMes = (total % 12) + 1;
  const ultimoDia = new Date(Date.UTC(novoAno, novoMes, 0)).getUTCDate();
  const novoDia = Math.min(dia, ultimoDia);
  return `${String(novoAno).padStart(4, '0')}-${String(novoMes).padStart(2, '0')}-${String(novoDia).padStart(2, '0')}`;
}
