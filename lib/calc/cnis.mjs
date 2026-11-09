export class CnisError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CnisError';
  }
}

const PERIODO_RE = /\b(0[1-9]|1[0-2])[\/-](\d{4})\b/;
const VALOR_RE = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})/;
const MAX_CARACTERES = 400_000;
const MAX_COMPETENCIAS = 600;

export function normalizarValorMonetario(valor) {
  const raw = String(valor ?? '').replace(/R\$\s*/i, '').trim();
  if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(raw)) return raw.replaceAll('.', '').replace(',', '.');
  if (/^\d+,\d{2}$/.test(raw)) return raw.replace(',', '.');
  if (/^\d+\.\d{2}$/.test(raw)) return raw;
  throw new CnisError(`Valor monetário não reconhecido: ${valor}.`);
}

export function parseCnisText(text) {
  if (typeof text !== 'string' || !text.trim()) throw new CnisError('Cole o texto do CNIS para importar.');
  if (text.length > MAX_CARACTERES) throw new CnisError('Texto do CNIS excede o limite de 400 mil caracteres.');
  const competencias = [];
  const vistas = new Set();
  let ignoradas = 0;
  let duplicadas = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^(total|soma|base|subtotal)/i.test(line)) {
      ignoradas += 1;
      continue;
    }
    const periodo = line.match(PERIODO_RE);
    const valor = line.match(VALOR_RE);
    if (!periodo || !valor) {
      ignoradas += 1;
      continue;
    }
    const competencia = `${periodo[2]}-${periodo[1]}`;
    let salario;
    try {
      salario = normalizarValorMonetario(valor[1]);
    } catch (error) {
      ignoradas += 1;
      continue;
    }
    if (!Number(salario) || Number(salario) <= 0) {
      ignoradas += 1;
      continue;
    }
    if (competencias.length >= MAX_COMPETENCIAS) {
      throw new CnisError(`O CNIS excede ${MAX_COMPETENCIAS} competências; divida a importação por período.`);
    }
    if (vistas.has(competencia)) {
      duplicadas += 1;
      continue;
    }
    vistas.add(competencia);
    competencias.push({ competencia, salario });
  }
  if (competencias.length === 0) {
    throw new CnisError('Nenhuma competência com remuneração foi reconhecida; cole as linhas do extrato com mês/ano e valor.');
  }
  competencias.sort((a, b) => (a.competencia < b.competencia ? -1 : a.competencia > b.competencia ? 1 : 0));
  const avisos = [
    'Extração assistida: confira cada competência e remuneração no extrato original antes de calcular.',
    'Os valores do CNIS são nominais; corrija os salários para a data de referência antes do cálculo.',
    'Indicadores de pendência não alteram a competência importada e continuam exigindo conferência manual.'
  ];
  if (ignoradas > 0) avisos.push(`${ignoradas} linha(s) sem competência ou remuneração foram ignoradas.`);
  if (duplicadas > 0) avisos.push(`${duplicadas} competência(s) duplicada(s) foram mantidas apenas uma vez.`);
  return {
    competencias,
    resumo: { reconhecidas: competencias.length, ignoradas, duplicadas },
    avisos
  };
}
