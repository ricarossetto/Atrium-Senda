import assert from 'node:assert/strict';
import { buildCivelCalculation } from '../lib/calc/civel.mjs';
import { normalizeSgsRows } from '../lib/calc/indices.mjs';

/**
 * Âncora oficial do motor cível — Fábrica de Cálculos (TRF3).
 * Fonte: https://fabrica-de-calculos.app.trf3.jus.br/indices/api/v1/tabela
 * Consulta: 22/10/2026. A tabela publica a taxa mensal como fração
 * (0,0016 = 0,16%); o fator esperado é o produto decimal dessas taxas na janela.
 * O motor recebe as mesmas taxas em pontos percentuais (como nas séries SGS) e
 * precisa reproduzir o fator oficial. Divergência aqui é regressão do motor ou
 * da janela de competências, nunca arredondamento aceitável.
 */
const IPCA_OFICIAL = Object.freeze({
  '2025-01': '0.0016',
  '2025-02': '0.0131',
  '2025-03': '0.0056',
  '2025-04': '0.0043',
  '2025-05': '0.0026',
  '2025-06': '0.0024',
  '2025-07': '0.0026',
  '2025-08': '-0.0011',
  '2025-09': '0.0048',
  '2025-10': '0.0009',
  '2025-11': '0.0018',
  '2025-12': '0.0033'
});

const INPC_OFICIAL = Object.freeze({
  '2025-01': '0',
  '2025-02': '0.0148',
  '2025-03': '0.0051',
  '2025-04': '0.0048',
  '2025-05': '0.0035',
  '2025-06': '0.0023',
  '2025-07': '0.0021',
  '2025-08': '-0.0021',
  '2025-09': '0.0052',
  '2025-10': '0.0003',
  '2025-11': '0.0003',
  '2025-12': '0.0021'
});

function serieOficial(taxas) {
  return normalizeSgsRows(Object.entries(taxas).map(([period, taxa]) => {
    const [ano, mes] = period.split('-').map(Number);
    const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    return {
      data: `${String(ultimoDia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`,
      valor: (Number(taxa) * 100).toFixed(4)
    };
  }), 'oficial');
}

const IPCA = serieOficial(IPCA_OFICIAL);
const INPC = serieOficial(INPC_OFICIAL);
const deps = {
  seriesRows: key => {
    if (key === 'IPCA') return IPCA;
    if (key === 'INPC') return INPC;
    throw new Error(`Série inesperada na âncora: ${key}`);
  }
};

const simples = buildCivelCalculation({
  atualizacaoAte: '2025-12-31',
  correcao: { serie: 'IPCA' },
  itens: [{ id: 'principal', especie: 'debito', data: '2025-01-15', valor: '1000.00' }]
}, deps);

assert.equal(simples.itens[0].fatorCorrecao, '1.040978283792', 'IPCA fev–dez/2025 deve reproduzir o fator oficial.');
assert.deepEqual(simples.fontes, [{ serie: 'IPCA', de: '2025-02', ate: '2025-12' }]);

const timeline = buildCivelCalculation({
  atualizacaoAte: '2025-12-31',
  correcao: {
    timeline: [
      { serie: 'IPCA', de: '2025-01', ate: '2025-06' },
      { serie: 'INPC', de: '2025-07', ate: '2025-12' }
    ]
  },
  itens: [{ id: 'principal', especie: 'debito', data: '2025-01-15', valor: '1000.00' }]
}, deps);

assert.equal(timeline.itens[0].fatorCorrecao, '1.036410884649', 'IPCA fev–jun + INPC jul–dez/2025 deve reproduzir o fator oficial.');
assert.deepEqual(timeline.fontes, [
  { serie: 'INPC', de: '2025-07', ate: '2025-12' },
  { serie: 'IPCA', de: '2025-02', ate: '2025-06' }
]);

const julho = buildCivelCalculation({
  atualizacaoAte: '2025-12-31',
  correcao: { serie: 'IPCA' },
  itens: [{ id: 'principal', especie: 'debito', data: '2025-06-15', valor: '1000.00' }]
}, deps);

assert.equal(julho.itens[0].fatorCorrecao, '1.012352753994', 'IPCA jul–dez/2025 deve reproduzir o fator oficial.');
assert.deepEqual(julho.fontes, [{ serie: 'IPCA', de: '2025-07', ate: '2025-12' }]);

console.log('calculation_civel_anchor: ok');
