import { add, abs, div, lte, mul, parseDec, sub, toFixedString } from './decimal.mjs';
import { monthAfter } from './calendar.mjs';

/**
 * Colunas da tabela oficial da Fábrica de Cálculos (TRF3) equivalentes às
 * séries de correção aceitas pelo motor cível. A tabela publica a taxa mensal
 * como fração (0,0016 = 0,16%), então o fator do mês é 1 + taxa.
 * Séries sem coluna equivalente ficam declaradas como "sem fonte oficial" em
 * vez de serem aproximadas por outra série.
 */
export const SERIES_OFICIAIS = Object.freeze({
  IPCA: { coluna: 'ipca', rotulo: 'IPCA' },
  INPC: { coluna: 'inpc', rotulo: 'INPC' },
  'IGP-M': { coluna: 'igpm', rotulo: 'IGP-M' },
  'IGP-DI': { coluna: 'igpdi', rotulo: 'IGP-DI' },
  'IPCA-E': { coluna: 'ipcae', rotulo: 'IPCA-E' },
  SELIC: { coluna: 'fatorSelic', rotulo: 'SELIC', fator: true },
  'TAXA-LEGAL': { coluna: 'taxaLegal', rotulo: 'Taxa legal' },
  'taxa-legal (SGS 29543)': { coluna: 'taxaLegal', rotulo: 'Taxa legal' }
});

export const TOLERANCIA_CONFERENCIA = parseDec('0.001');

function fatorDoAtrium(calculo, fonte) {
  for (const entry of Array.isArray(calculo?.memoria) ? calculo.memoria : []) {
    if (entry?.tipo !== 'correcao' || !Array.isArray(entry.segmentos)) continue;
    for (const segment of entry.segmentos) {
      if (segment?.serie === fonte.serie
        && segment?.de === fonte.de
        && segment?.ate === fonte.ate
        && typeof segment.fator === 'string') {
        return segment.fator;
      }
    }
  }
  return null;
}

function intervaloDeCompetencias(fontes) {
  let de = null;
  let ate = null;
  for (const fonte of fontes) {
    if (typeof fonte?.de !== 'string' || typeof fonte?.ate !== 'string') continue;
    if (de === null || fonte.de < de) de = fonte.de;
    if (ate === null || fonte.ate > ate) ate = fonte.ate;
  }
  return de && ate ? { de, ate } : null;
}

function ultimaCompetenciaDaTabela(tabela) {
  const competencias = Object.keys(tabela || {}).filter(key => /^\d{4}-\d{2}$/.test(key)).sort();
  return competencias.length ? competencias[competencias.length - 1] : null;
}

export function conferirIndicesOficiais(calculo, tabela, { tolerancia = TOLERANCIA_CONFERENCIA, agora = new Date() } = {}) {
  if (!tabela || typeof tabela !== 'object' || Array.isArray(tabela)) {
    throw new TypeError('Tabela oficial de índices ausente ou inválida.');
  }
  const fontes = Array.isArray(calculo?.fontes) ? calculo.fontes : [];
  const resultados = fontes.map(fonte => {
    const config = SERIES_OFICIAIS[fonte?.serie];
    if (!config) {
      return { ...fonte, status: 'sem-fonte', motivo: 'Série sem coluna equivalente na tabela oficial.' };
    }
    const fatorAtrium = fatorDoAtrium(calculo, fonte);
    if (!fatorAtrium) {
      return { ...fonte, status: 'ignorado', motivo: 'Fonte de juros; a conferência cobre a correção monetária.' };
    }
    let fatorOficial = parseDec('1');
    let faltante = null;
    for (let period = fonte.de; period <= fonte.ate; period = monthAfter(period)) {
      const row = tabela[period];
      const raw = row ? row[config.coluna] : null;
      if (raw === null || raw === undefined || raw === '') {
        faltante = period;
        break;
      }
      const valor = parseDec(String(raw));
      fatorOficial = mul(fatorOficial, config.fator ? valor : add(parseDec('1'), valor));
    }
    if (faltante) {
      return {
        ...fonte,
        status: 'sem-dado',
        faltante,
        motivo: `Tabela oficial sem ${config.rotulo} para ${faltante}.`
      };
    }
    const engine = parseDec(fatorAtrium);
    const diferenca = sub(div(fatorOficial, engine), parseDec('1'));
    const confere = lte(abs(diferenca), tolerancia);
    return {
      ...fonte,
      status: confere ? 'confere' : 'divergente',
      fatorOficial: toFixedString(fatorOficial, 12),
      fatorAtrium: toFixedString(engine, 12),
      diferencaPercentual: toFixedString(mul(diferenca, parseDec('100')), 6),
      ...(confere ? {} : { motivo: 'Fator do ATRIUM difere da tabela oficial acima da tolerância; confira a série antes de usar.' })
    };
  });
  const resumo = { conferem: 0, divergentes: 0, semDado: 0, semFonte: 0, ignoradas: 0 };
  for (const resultado of resultados) {
    if (resultado.status === 'confere') resumo.conferem += 1;
    else if (resultado.status === 'divergente') resumo.divergentes += 1;
    else if (resultado.status === 'sem-dado') resumo.semDado += 1;
    else if (resultado.status === 'sem-fonte') resumo.semFonte += 1;
    else resumo.ignoradas += 1;
  }
  return {
    disponivel: true,
    fonte: { nome: 'Fábrica de Cálculos (TRF3)', tabela: 'tabela' },
    toleranciaPercentual: toFixedString(mul(tolerancia, parseDec('100')), 2),
    competencias: intervaloDeCompetencias(fontes),
    ultimaCompetenciaOficial: ultimaCompetenciaDaTabela(tabela),
    fontes: resultados,
    resumo,
    geradoEm: agora.toISOString()
  };
}
