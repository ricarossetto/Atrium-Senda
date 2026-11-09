import { normalizarValorMonetario } from './cnis.mjs';
import { periodsInRange } from './calendar.mjs';

export class CnisExtratoError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CnisExtratoError';
  }
}

const CNPJ_RE = /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/;
const DATA_RE = /\b(\d{2})\/(\d{2})\/(\d{4})\b/g;
const COMPETENCIA_RE = /\b(0[1-9]|1[0-2])[\/](\d{4})\b/;
const VALOR_RE = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/;
const INDICADOR_RE = /\b([A-Z]{2,6})\b/g;
const INDICADORES_IGNORADOS = new Set(['CNPJ', 'NIT', 'PIS', 'PASEP', 'CPF', 'RG', 'UF', 'SIM', 'NAO', 'NB', 'DIB', 'DCB', 'DID', 'DER', 'RMI', 'DV', 'IDENT', 'EMPREGADOR', 'BENEFICIO', 'REMUNERACAO', 'COMPETENCIA', 'TOTAL']);

function semAcento(valor) {
  return String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function datasDaLinha(linha) {
  const datas = [];
  for (const match of linha.matchAll(DATA_RE)) {
    datas.push(`${match[3]}-${match[2]}-${match[1]}`);
  }
  return datas;
}

function competenciaIso(mes, ano) {
  return `${ano}-${mes}`;
}

function detectarSecao(linha) {
  const alvo = semAcento(linha);
  if (/relacoes previdenciarias/.test(alvo)) return 'vinculos';
  if (/remuneracoes/.test(alvo)) return 'remuneracoes';
  if (/beneficios/.test(alvo)) return 'beneficios';
  if (/dados cadastrais|identificacao do segurado/.test(alvo)) return 'cadastro';
  return null;
}

function nomeEmpregador(linha, cnpj) {
  const semCnpj = linha.replace(cnpj, ' ').replace(/\s{2,}/g, ' ').trim();
  const semRotulo = semCnpj.replace(/^cnpj[:\s-]*/i, '').trim();
  const semDatas = semRotulo.replace(DATA_RE, ' ').replace(/\s{2,}/g, ' ').trim();
  return semDatas.replace(/[;|]+$/, '').trim();
}

function extrairIndicadores(linha, valor) {
  const semValor = valor ? linha.replace(valor, ' ') : linha;
  const indicadores = [];
  for (const match of semValor.matchAll(INDICADOR_RE)) {
    const codigo = match[1];
    if (!INDICADORES_IGNORADOS.has(codigo)) indicadores.push(codigo);
  }
  return [...new Set(indicadores)];
}

export function consolidarCnis({ vinculos, beneficios = [], avisos = [], origem = 'texto' }) {
  const todasCompetencias = [];
  const avisosConsolidados = [...avisos];
  vinculos.forEach((vinculo, indice) => {
    vinculo.competencias.sort((a, b) => (a.competencia < b.competencia ? -1 : 1));
    const vistos = new Set();
    vinculo.competencias = vinculo.competencias.filter(item => {
      if (vistos.has(item.competencia)) {
        avisosConsolidados.push(`Competência duplicada ${item.competencia} no vínculo ${vinculo.cnpj || indice + 1}; mantida uma ocorrência.`);
        return false;
      }
      vistos.add(item.competencia);
      todasCompetencias.push({ ...item, vinculoIndex: indice });
      return true;
    });
  });

  const porCompetencia = new Map();
  for (const item of todasCompetencias) {
    if (!porCompetencia.has(item.competencia)) porCompetencia.set(item.competencia, new Set());
    porCompetencia.get(item.competencia).add(item.vinculoIndex);
  }
  const concomitancias = [...porCompetencia.entries()]
    .filter(([, indices]) => indices.size > 1)
    .map(([competencia, indices]) => ({ competencia, vinculos: [...indices] }));

  const lacunas = [];
  if (todasCompetencias.length > 0) {
    const periodos = todasCompetencias.map(item => item.competencia).sort();
    const presentes = new Set(periodos);
    const janela = periodsInRange(periodos[0], periodos[periodos.length - 1]);
    if (janela.length <= 720) {
      for (const periodo of janela) {
        if (!presentes.has(periodo)) lacunas.push(periodo);
      }
    } else {
      avisosConsolidados.push('Janela de competências acima de 60 anos; lacunas não foram detalhadas.');
    }
  }

  const indicadores = todasCompetencias.flatMap(item =>
    (item.indicadores || []).map(codigo => ({ codigo, competencia: item.competencia, vinculoIndex: item.vinculoIndex })));

  if (origem === 'ocr') {
    avisosConsolidados.unshift('Leitura por OCR: confira cada competência e remuneração antes de aplicar.');
  }
  if (indicadores.length > 0) {
    avisosConsolidados.push(`${indicadores.length} indicador(es) de pendência encontrados; a conferência é manual e nenhum período é corrigido automaticamente.`);
  }
  if (concomitancias.length > 0) {
    avisosConsolidados.push(`${concomitancias.length} competência(s) concomitante(s) entre vínculos; confira antes de somar tempo.`);
  }
  if (lacunas.length > 0) {
    avisosConsolidados.push(`${lacunas.length} mês(es) sem contribuição na janela; confira se há período a regularizar.`);
  }
  if (todasCompetencias.length === 0) {
    throw new CnisExtratoError('Nenhuma competência com remuneração foi reconhecida no documento.');
  }

  return {
    modo: origem,
    vinculos,
    beneficios,
    competencias: todasCompetencias.sort((a, b) => (a.competencia < b.competencia ? -1 : 1)),
    indicadores,
    lacunas,
    concomitancias,
    resumo: {
      vinculos: vinculos.length,
      competencias: todasCompetencias.length,
      beneficios: beneficios.length,
      indicadores: indicadores.length,
      lacunas: lacunas.length,
      concomitancias: concomitancias.length,
      primeiraCompetencia: todasCompetencias.map(item => item.competencia).sort()[0],
      ultimaCompetencia: todasCompetencias.map(item => item.competencia).sort().pop()
    },
    avisos: avisosConsolidados
  };
}

export function parseCnisExtrato(texto, options = {}) {
  if (typeof texto !== 'string' || !texto.trim()) throw new CnisExtratoError('Texto do CNIS vazio.');
  if (texto.length > 800_000) throw new CnisExtratoError('Texto do CNIS excede o limite de 800 mil caracteres.');
  const linhas = texto.split(/\r?\n/).map(linha => linha.trim()).filter(Boolean);
  const vinculos = [];
  const beneficios = [];
  const avisos = [];
  let secao = null;
  let vinculoAtual = null;
  let competenciasSemVinculo = 0;

  const garantirVinculo = () => {
    if (!vinculoAtual) {
      vinculoAtual = { cnpj: null, empregador: 'Vínculo não identificado no texto', tipoFiliacao: null, inicio: null, fim: null, competencias: [] };
      vinculos.push(vinculoAtual);
    }
    return vinculoAtual;
  };

  for (const linha of linhas) {
    const novaSecao = detectarSecao(linha);
    if (novaSecao) {
      secao = novaSecao;
      continue;
    }
    const cnpjMatch = linha.match(CNPJ_RE);
    if (cnpjMatch && secao !== 'beneficios') {
      const cnpjNumeros = cnpjMatch[1].replace(/[^\d]/g, '');
      const datas = datasDaLinha(linha);
      const existente = vinculos.find(item => item.cnpj === cnpjNumeros);
      if (existente) {
        vinculoAtual = existente;
        if (!existente.inicio && datas[0]) existente.inicio = datas[0];
        if (!existente.fim && datas[1]) existente.fim = datas[1];
        continue;
      }
      vinculoAtual = {
        cnpj: cnpjNumeros,
        empregador: nomeEmpregador(linha, cnpjMatch[1]) || 'Empregador sem nome legível',
        tipoFiliacao: null,
        inicio: datas[0] || null,
        fim: datas[1] || null,
        competencias: []
      };
      vinculos.push(vinculoAtual);
      if (datas.length === 0) avisos.push(`Vínculo ${vinculoAtual.cnpj} sem datas legíveis; confira no extrato.`);
      continue;
    }
    const competenciaMatch = linha.match(COMPETENCIA_RE);
    if (competenciaMatch && secao !== 'beneficios') {
      const valorMatch = linha.match(VALOR_RE);
      if (valorMatch) {
        const salario = normalizarValorMonetario(valorMatch[1]);
        const indicadores = extrairIndicadores(linha, valorMatch[1]);
        const semVinculoAgora = !vinculoAtual;
        const alvo = garantirVinculo();
        if (semVinculoAgora) competenciasSemVinculo += 1;
        alvo.competencias.push({
          competencia: competenciaIso(competenciaMatch[1], competenciaMatch[2]),
          salario,
          indicadores
        });
        continue;
      }
    }
    if (secao === 'beneficios') {
      const numeroMatch = linha.match(/\b(\d{3}\.\d{3}\.\d{3}-\d)\b/);
      const datas = datasDaLinha(linha);
      const valorMatch = linha.match(VALOR_RE);
      if (numeroMatch || datas.length > 0) {
        beneficios.push({
          numero: numeroMatch ? numeroMatch[1] : null,
          inicio: datas[0] || null,
          fim: datas[1] || null,
          valor: valorMatch ? normalizarValorMonetario(valorMatch[1]) : null,
          linha: linha.slice(0, 160)
        });
      }
    }
  }

  const avisosExtras = [];
  if (competenciasSemVinculo > 0) {
    avisosExtras.push(`${competenciasSemVinculo} competência(s) sem vínculo identificado foram agrupadas em "Vínculo não identificado".`);
  }
  return consolidarCnis({
    vinculos,
    beneficios,
    avisos: [...avisos, ...avisosExtras],
    origem: options.origem === 'ocr' ? 'ocr' : 'texto'
  });
}
