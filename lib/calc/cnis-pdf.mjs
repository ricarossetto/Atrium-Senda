import { extractText, getDocumentProxy } from 'unpdf';

export class CnisPdfError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CnisPdfError';
  }
}

const PALAVRAS_CHAVE = /\b(de|da|do|das|dos|empresa|beneficio|contribuicao|remuneracao|relacoes|previdenciarias|segurado|competencia|indicador|vinculo|filiação|filiacao)\b/g;

export function avaliarQualidadeTexto(texto) {
  const conteudo = String(texto ?? '');
  const normalizado = conteudo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const tokens = normalizado.split(/\s+/).filter(Boolean).length || 1;
  const metricas = {
    caracteres: conteudo.length,
    caracteresControle: (conteudo.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length,
    cnpjReconhecidos: (conteudo.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) || []).length,
    competenciasReconhecidas: (conteudo.match(/\b(0[1-9]|1[0-2])[\/]\d{4}\b/g) || []).length,
    valoresReconhecidos: (conteudo.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || []).length,
    palavrasChavePor100Tokens: Math.round((((normalizado.match(PALAVRAS_CHAVE) || []).length) / tokens) * 1000) / 10
  };
  const motivos = [];
  if (metricas.caracteres < 500) motivos.push('Texto extraído insuficiente para leitura automática.');
  if (metricas.caracteres > 0 && metricas.caracteresControle > metricas.caracteres * 0.05) {
    motivos.push('Excesso de caracteres de controle: a fonte do PDF não expõe mapa Unicode utilizável.');
  }
  if (metricas.palavrasChavePor100Tokens < 1) {
    motivos.push('Baixa densidade de palavras reconhecíveis no texto extraído.');
  }
  if (metricas.competenciasReconhecidas === 0 && metricas.valoresReconhecidos === 0) {
    motivos.push('Nenhuma competência ou remuneração reconhecida no texto extraído.');
  }
  return {
    utilizavel: motivos.length === 0,
    motivos,
    metricas,
    modoRecomendado: motivos.length === 0 ? 'texto' : 'ocr'
  };
}

export async function extrairTextoPdf(input, options = {}) {
  const bytes = ArrayBuffer.isView(input)
    ? new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength))
    : new Uint8Array(input);
  if (!bytes || bytes.length === 0) throw new CnisPdfError('Arquivo PDF vazio.');
  if (bytes.length > (options.maxBytes ?? 12_000_000)) throw new CnisPdfError('PDF acima do limite de 12 MB.');
  const abrirPdf = options._getDocumentProxy ?? getDocumentProxy;
  const extrair = options._extractText ?? extractText;
  const maxPaginas = options.maxPaginas ?? 400;
  let pdf;
  try {
    pdf = await abrirPdf(bytes, { verbosity: 0 });
  } catch (error) {
    throw new CnisPdfError(`Não foi possível abrir o PDF: ${error.message}`);
  }
  const numPages = Number(pdf?.numPages) || 0;
  if (!Number.isInteger(numPages) || numPages <= 0) throw new CnisPdfError('PDF sem páginas legíveis.');
  if (numPages > maxPaginas) throw new CnisPdfError('PDF excede o limite de 400 páginas.');
  const { totalPages, text } = await extrair(pdf, { mergePages: true });
  if (!Number.isInteger(totalPages) || totalPages <= 0) throw new CnisPdfError('PDF sem páginas legíveis.');
  if (totalPages > maxPaginas) throw new CnisPdfError('PDF excede o limite de 400 páginas.');
  return { totalPages, texto: String(text ?? '') };
}

export async function analisarPdfCnis(input, options = {}) {
  const extraido = await extrairTextoPdf(input, options);
  const qualidade = avaliarQualidadeTexto(extraido.texto);
  return {
    totalPages: extraido.totalPages,
    texto: extraido.texto,
    qualidade,
    modoRecomendado: qualidade.modoRecomendado
  };
}
