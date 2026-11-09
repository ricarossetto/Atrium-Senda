import * as XLSX from 'xlsx';
import { normalizarValorMonetario } from './cnis.mjs';
import { consolidarCnis, CnisExtratoError } from './cnis-extrato.mjs';

const MAX_LINHAS = 5_000;
const MAX_CARACTERES_CSV = 800_000;

function semAcento(valor) {
  return String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function competenciaDeCelula(celula) {
  if (celula === null || celula === undefined || celula === '') return null;
  if (celula instanceof Date && !Number.isNaN(celula.getTime())) {
    return `${celula.getUTCFullYear()}-${String(celula.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  if (typeof celula === 'number' && Number.isFinite(celula)) {
    if (celula >= 20000 && celula <= 60000) {
      const data = new Date(Date.UTC(1899, 11, 30) + Math.round(celula) * 86400000);
      return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    const texto = String(Math.trunc(celula));
    if (/^\d{6}$/.test(texto)) {
      const mes = Number(texto.slice(4, 6));
      if (mes >= 1 && mes <= 12) return `${texto.slice(0, 4)}-${texto.slice(4, 6)}`;
    }
    return null;
  }
  const texto = String(celula).trim();
  let match = texto.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (match) {
    const mes = Number(match[1]);
    if (mes >= 1 && mes <= 12) return `${match[2]}-${String(mes).padStart(2, '0')}`;
  }
  match = texto.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (match) {
    const mes = Number(match[2]);
    if (mes >= 1 && mes <= 12) return `${match[1]}-${String(mes).padStart(2, '0')}`;
  }
  match = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    const mes = Number(match[2]);
    if (mes >= 1 && mes <= 12) return `${match[3]}-${String(mes).padStart(2, '0')}`;
  }
  match = texto.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (match) {
    const mes = Number(match[2]);
    if (mes >= 1 && mes <= 12) return `${match[1]}-${match[2]}`;
  }
  match = texto.match(/^(\d{4})(\d{2})$/);
  if (match) {
    const mes = Number(match[2]);
    if (mes >= 1 && mes <= 12) return `${match[1]}-${match[2]}`;
  }
  return null;
}

function valorDeCelula(celula) {
  if (celula === null || celula === undefined || celula === '') return null;
  if (typeof celula === 'number' && Number.isFinite(celula)) {
    if (celula <= 0) return null;
    return celula.toFixed(2);
  }
  const texto = String(celula).trim().replace(/R\$\s*/i, '').replace(/\s/g, '');
  if (!texto) return null;
  try {
    if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(texto) || /^\d+,\d{2}$/.test(texto)) {
      return normalizarValorMonetario(texto);
    }
    if (/^\d+(\.\d{1,2})?$/.test(texto)) return Number(texto).toFixed(2);
    if (/^\d{1,3}(\.\d{3})+$/.test(texto)) return texto.replaceAll('.', '') + '.00';
  } catch (error) {
    return null;
  }
  return null;
}

function matrizDeEntrada(input) {
  if (input && typeof input === 'object' && !Array.isArray(input) && !(input instanceof Uint8Array)) {
    if (input.base64) {
      const buffer = Buffer.from(input.base64, 'base64');
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new CnisExtratoError('A planilha está vazia.');
      return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true });
    }
    if (typeof input.content === 'string') {
      if (input.content.length > MAX_CARACTERES_CSV) throw new CnisExtratoError('CSV acima do limite de 800 mil caracteres.');
      const linhas = input.content.split(/\r?\n/).filter(linha => linha.trim());
      if (linhas.length === 0) throw new CnisExtratoError('Arquivo de texto vazio.');
      const delimitador = linhas[0].includes(';') ? ';' : linhas[0].includes('\t') ? '\t' : ',';
      return linhas.map(linha => linha.split(delimitador).map(parte => parte.replace(/^["']|["']$/g, '').trim()));
    }
    throw new CnisExtratoError('Envie a planilha como base64 (XLSX) ou conteúdo CSV.');
  }
  if (input instanceof Uint8Array || Buffer.isBuffer(input)) {
    const workbook = XLSX.read(input, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new CnisExtratoError('A planilha está vazia.');
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true });
  }
  throw new CnisExtratoError('Formato de planilha não suportado.');
}

export function parseCnisPlanilha(input, options = {}) {
  const matriz = matrizDeEntrada(input);
  if (!Array.isArray(matriz) || matriz.length === 0) throw new CnisExtratoError('A planilha não contém dados legíveis.');
  if (matriz.length > MAX_LINHAS) throw new CnisExtratoError(`Planilha excede ${MAX_LINHAS} linhas.`);

  let cabecalho = null;
  let colunas = null;
  for (let indice = 0; indice < Math.min(matriz.length, 20); indice += 1) {
    const linha = (matriz[indice] || []).map(semAcento);
    const colunaCompetencia = linha.findIndex(celula => /^(competencia|mes|periodo|referencia|compet)$/.test(celula));
    const colunaValor = linha.findIndex(celula => /^(remuneracao|salario|salario de contribuicao|valor|contribuicao|base)$/.test(celula) || /^(remuneracao|salario|valor|contribuicao)/.test(celula));
    if (colunaCompetencia >= 0 && colunaValor >= 0) {
      cabecalho = indice;
      colunas = {
        competencia: colunaCompetencia,
        valor: colunaValor,
        cnpj: linha.findIndex(celula => /^cnpj$/.test(celula)),
        empregador: linha.findIndex(celula => /^(empregador|empresa|fonte|vinculo)$/.test(celula)),
        indicador: linha.findIndex(celula => /^indicador/.test(celula))
      };
      break;
    }
  }
  if (!cabecalho && cabecalho !== 0) {
    throw new CnisExtratoError('Não encontrei colunas de competência e remuneração no cabeçalho da planilha.');
  }

  const vinculos = new Map();
  const avisos = [];
  let ignoradas = 0;
  for (let indice = cabecalho + 1; indice < matriz.length; indice += 1) {
    const linha = matriz[indice] || [];
    const competencia = competenciaDeCelula(linha[colunas.competencia]);
    const salario = valorDeCelula(linha[colunas.valor]);
    if (!competencia || !salario) {
      if (linha.some(celula => String(celula ?? '').trim() !== '')) ignoradas += 1;
      continue;
    }
    const cnpjBruto = colunas.cnpj >= 0 ? String(linha[colunas.cnpj] ?? '').replace(/[^\d]/g, '') : '';
    const empregador = colunas.empregador >= 0 ? String(linha[colunas.empregador] ?? '').trim() : '';
    const chaveNome = empregador ? `nome:${empregador.toLowerCase()}` : null;
    let chave = cnpjBruto ? `cnpj:${cnpjBruto}` : (chaveNome || 'planilha');
    if (cnpjBruto && chaveNome && vinculos.has(chaveNome) && !vinculos.get(chaveNome).cnpj) {
      const existente = vinculos.get(chaveNome);
      vinculos.delete(chaveNome);
      existente.cnpj = cnpjBruto;
      vinculos.set(chave, existente);
    }
    if (!cnpjBruto && chaveNome) {
      const porNome = [...vinculos.values()].find(item => item.cnpj && item.empregador.toLowerCase() === empregador.toLowerCase());
      if (porNome) chave = `cnpj:${porNome.cnpj}`;
    }
    if (!vinculos.has(chave)) {
      vinculos.set(chave, {
        cnpj: cnpjBruto || null,
        empregador: empregador || 'Vínculo da planilha',
        tipoFiliacao: null,
        inicio: null,
        fim: null,
        competencias: []
      });
    }
    const indicadores = colunas.indicador >= 0
      ? String(linha[colunas.indicador] ?? '').split(/[,;|\s]+/).map(parte => parte.trim().toUpperCase()).filter(parte => /^[A-Z]{2,6}$/.test(parte))
      : [];
    vinculos.get(chave).competencias.push({ competencia, salario, indicadores });
  }

  if (ignoradas > 0) avisos.push(`${ignoradas} linha(s) sem competência ou remuneração foram ignoradas.`);
  const lista = [...vinculos.values()];
  for (const vinculo of lista) {
    const periodos = vinculo.competencias.map(item => item.competencia).sort();
    vinculo.inicio = periodos[0] || null;
    vinculo.fim = periodos[periodos.length - 1] || null;
  }
  return consolidarCnis({ vinculos: lista, beneficios: [], avisos, origem: options.origem === 'ocr' ? 'ocr' : 'planilha' });
}

export function planilhaCnisModelo() {
  const cabecalho = ['Competência', 'Remuneração', 'CNPJ', 'Empregador', 'Indicador'];
  const linhas = [
    ['01/2024', '2.000,00', '11.111.111/0001-11', 'Empresa Exemplo Alfa Ltda', ''],
    ['02/2024', '2.000,00', '11.111.111/0001-11', 'Empresa Exemplo Alfa Ltda', ''],
    ['03/2024', '2.500,00', '22.222.222/0001-22', 'Empresa Exemplo Beta S.A.', 'PEXT']
  ];
  return { cabecalho, linhas };
}
