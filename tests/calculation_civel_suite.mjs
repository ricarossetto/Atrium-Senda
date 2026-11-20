import assert from 'node:assert/strict';
import { buildCorrecaoCalculation } from '../lib/calc/civel-correcao.mjs';
import { buildAmortizacaoCalculation } from '../lib/calc/civel-amortizacao.mjs';
import { buildSfhCalculation } from '../lib/calc/civel-sfh.mjs';
import { buildJurosTvmCalculation, convertEquivalentRates, solveTvm } from '../lib/calc/civel-juros-tvm.mjs';
import { buildReajusteCalculation } from '../lib/calc/civel-reajuste.mjs';
import { auditLegacyHtmSheet } from '../lib/calc/civel-htm-import.mjs';
import { buildCivelCalculation } from '../lib/calc/civel.mjs';
import { parseDec } from '../lib/calc/decimal.mjs';
import { createCalcSource } from '../lib/calc/source.mjs';
import { buildCivelSummaryText, buildCivelCsv } from '../js/views/ui-v2/calculations-civel-suite.js';

const IPCA_2024 = [
  ['2024-01', '0.42'], ['2024-02', '0.83'], ['2024-03', '0.16'], ['2024-04', '0.38'],
  ['2024-05', '0.46'], ['2024-06', '0.21'], ['2024-07', '0.38'], ['2024-08', '-0.02'],
  ['2024-09', '0.44'], ['2024-10', '0.56'], ['2024-11', '0.39'], ['2024-12', '0.52']
].map(([period, v]) => ({ period, value: parseDec(v) }));

const INPC_2024 = [
  ['2024-03', '0.19'], ['2024-04', '0.37'], ['2024-05', '0.46'], ['2024-06', '0.25'],
  ['2024-07', '0.26'], ['2024-08', '-0.14'], ['2024-09', '0.48'], ['2024-10', '0.61'],
  ['2024-11', '0.33']
].map(([period, v]) => ({ period, value: parseDec(v) }));

const IGPM_2023_2024 = [
  ['2023-01', '0.21'], ['2023-02', '-0.06'], ['2023-03', '0.05'], ['2023-04', '-0.95'],
  ['2023-05', '-1.84'], ['2023-06', '-1.93'], ['2023-07', '-0.72'], ['2023-08', '-0.14'],
  ['2023-09', '0.37'], ['2023-10', '0.50'], ['2023-11', '0.59'], ['2023-12', '0.74']
].map(([period, v]) => ({ period, value: parseDec(v) }));

// 1. Correção direta, reversa e pró-rata (paridade R$ 10.483,13 / R$ 9.539,14 / R$ 10.263,13)
const fwd = buildCorrecaoCalculation({
  valor: '10000.00',
  dataInicial: '2024-01-01',
  dataFinal: '2025-01-01',
  serie: 'IPCA',
  proRata: false,
  expurgarDeflacao: false
}, { seriesRows: () => IPCA_2024 });
assert.equal(fwd.resumo.valorCorrigido, '10483.13');
assert.equal(fwd.diasCorridos, 366);

const rev = buildCorrecaoCalculation({
  valor: '10000.00',
  dataInicial: '2025-01-01',
  dataFinal: '2024-01-01',
  serie: 'IPCA',
  proRata: false,
  expurgarDeflacao: false
}, { seriesRows: () => IPCA_2024 });
assert.equal(rev.direcao, 'reversa');
assert.equal(rev.resumo.valorCorrigido, '9539.14');

const proRata = buildCorrecaoCalculation({
  valor: '10000.00',
  dataInicial: '2024-03-15',
  dataFinal: '2024-11-20',
  serie: 'INPC',
  proRata: true,
  expurgarDeflacao: false
}, { seriesRows: () => INPC_2024 });
assert.equal(proRata.diasCorridos, 250);
assert.equal(proRata.resumo.valorCorrigido, '10263.13');

// 2. Amortização PRICE e SAC (sem 13ª parcela fantasma)
const amort = buildAmortizacaoCalculation({
  sistema: 'COMPARATIVO',
  valorBem: '100000.00',
  taxaJuros: '1.00',
  periodicidadeTaxa: 'mensal',
  prazoMeses: 12
});
assert.equal(amort.comparativo.price.resumo.primeiraPrestacao, '8884.88');
assert.equal(amort.comparativo.price.resumo.ultimaPrestacao, '8884.85');
assert.equal(amort.comparativo.sac.cronograma.length, 12);
assert.equal(amort.comparativo.sac.resumo.totalAmortizado, '100000.00');
assert.equal(amort.comparativo.sac.cronograma[11].saldoFinal, '0.00');

// 3. Financiamento Imobiliário SFH — SACRE 120 meses (paridade 2.200,00 m1 e 1.452,60 m120)
const sfh = buildSfhCalculation({
  sistema: 'SACRE',
  valorImovel: '120000.00',
  valorFinanciado: '120000.00',
  taxaJurosAnualNominalPct: '12.00',
  trMensalPct: '0.50',
  prazoAnos: 10,
  usarArredondamentoBancario: true
});
assert.equal(sfh.cronograma.length, 120);
assert.equal(sfh.cronograma[0].prestacaoTotal, '2200.00');
assert.equal(sfh.cronograma[0].amortizacao, '394.00');
assert.equal(sfh.cronograma[0].juros, '1806.00');
assert.equal(sfh.cronograma[0].saldoDevedorFinal, '119606.00');
assert.equal(sfh.cronograma[119].prestacaoTotal, '1452.60');
assert.equal(sfh.cronograma[119].amortizacao, '1431.06');
assert.equal(sfh.cronograma[119].juros, '21.54');
assert.equal(sfh.cronograma[119].saldoDevedorFinal, '0.00');

// 4. Equivalência de Juros & TVM Solver
const eq = convertEquivalentRates({ ratePct: '1', basis: 'mes', capitalizacao: 'composto' });
const eqAnual = eq.equivalents.find(e => e.basis === 'ano');
assert.equal(eqAnual.ratePct.slice(0, 7), '12.6825');

const tvmFvComp = solveTvm({
  solveFor: 'fv',
  capitalizacao: 'composto',
  timing: 'vencido',
  pv: '10000',
  pmt: '0',
  ratePct: '1',
  nper: '12'
});
assert.equal(tvmFvComp.fv, '11268.25');

const tvmFvSimp = solveTvm({
  solveFor: 'fv',
  capitalizacao: 'simples',
  timing: 'vencido',
  pv: '10000',
  pmt: '0',
  ratePct: '1',
  nper: '12'
});
assert.equal(tvmFvSimp.fv, '11200.00');

const tvmPmt = buildJurosTvmCalculation({
  ratePct: '1',
  basis: 'mes',
  tvm: { solveFor: 'pmt', capitalizacao: 'composto', timing: 'vencido', pv: '100000', fv: '0', ratePct: '1', nper: '12' }
});
assert.equal(tvmPmt.tvm.pmt, '8884.88');

// 5. Reajuste de Aluguel com piso anti-deflação
const reajFrozen = buildReajusteCalculation({
  valorInicial: '3000.00',
  competenciaInicio: '2023-01',
  competenciaFim: '2023-12',
  periodicidadeMeses: 12,
  serie: 'IGP-M',
  congelarDeflacao: true
}, { seriesRows: () => IGPM_2023_2024 });
assert.equal(reajFrozen.ciclos[0].deflacaoCongelada, true);
assert.equal(reajFrozen.resumo.valorAtual, '3000.00');

// 6. Auditoria e Importação de Planilhas .HTM Legadas
const htmDiag = auditLegacyHtmSheet(
  '<html><head><title>Planilha Judicial</title></head><body><script src="http://exemplo.local/calc.js"></script><table><tr><td>10/01/2024</td><td>Principal</td><td>R$ 5.000,00</td></tr></table></body></html>'
);
assert.equal(htmDiag.affectedByPre2023SslBug, true);
assert.equal(htmDiag.detectedHttpLegacyUrls, 1);
assert.equal(htmDiag.extractedItems.length, 1);
assert.equal(htmDiag.extractedItems[0].valor, '5000.00');
assert.ok(htmDiag.repairedHtml.includes('https://exemplo.local/calc.js'));

// 7. Transição automática Lei 14.905/2024 em buildCivelCalculation
const transicaoRes = buildCivelCalculation({
  atualizacaoAte: '2024-09-30',
  correcao: { tipo: 'sem' },
  juros: { tipo: 'transicao-lei-14905' },
  itens: [{ id: '1', especie: 'debito', descricao: 'Título', data: '2024-07-31', valor: '10000.00' }]
}, {
  taxaLegalRates: () => new Map([['2024-08', parseDec('0.600000')], ['2024-09', parseDec('0.500000')]])
});
assert.ok(Number(transicaoRes.resumo.juros) > 100);
assert.ok(transicaoRes.memoria[0].meses.some(m => m.regime?.includes('CC/2002')));
assert.ok(transicaoRes.memoria[0].meses.some(m => m.regime?.includes('Lei 14.905')));

// 8. Juros compostos na Planilha Judicial (12 meses cheios a 1% a.m. sobre R$ 10.000,00 = R$ 11.268,25)
const compostoRes = buildCivelCalculation({
  atualizacaoAte: '2025-01-31',
  correcao: { tipo: 'sem' },
  juros: { tipo: 'percentual-fixo', percentual: '1', capitalizacao: 'composto' },
  itens: [{ id: 'comp-1', especie: 'debito', descricao: 'Principal', data: '2024-01-31', valor: '10000.00' }]
});
assert.equal(compostoRes.resumo.juros, '1268.25');
assert.equal(compostoRes.resumo.total, '11268.25');

// 9. Desapropriação: juros compensatórios com e sem incidência de moratórios sobre compensatórios (jmsobrejc)
const desaprBase = {
  atualizacaoAte: '2024-04-30',
  correcao: { tipo: 'sem' },
  juros: { tipo: 'percentual-fixo', percentual: '0.5' },
  jurosCompensatorios: { percentual: '0.5', incidirMoratoriosSobreCompensatorios: false },
  itens: [{ id: 'imovel', especie: 'debito', descricao: 'Indenização', data: '2024-01-31', valor: '10000.00' }]
};
const desaprSemSobre = buildCivelCalculation(desaprBase);
const desaprComSobre = buildCivelCalculation({
  ...desaprBase,
  jurosCompensatorios: { percentual: '0.5', incidirMoratoriosSobreCompensatorios: true }
});
assert.equal(desaprSemSobre.resumo.jurosCompensatorios, '150.00');
assert.equal(desaprSemSobre.resumo.juros, '150.00');
assert.equal(desaprSemSobre.resumo.total, '10300.00');
assert.equal(desaprComSobre.resumo.jurosCompensatorios, '150.00');
assert.equal(desaprComSobre.resumo.juros, '152.25');
assert.equal(desaprComSobre.resumo.total, '10302.25');

// 10. Multa contratual + art. 523 §1º CPC (multa + honorários) + custas finais fixas
const encargosRes = buildCivelCalculation({
  atualizacaoAte: '2024-01-31',
  correcao: { tipo: 'sem' },
  juros: { tipo: 'sem' },
  multaContratual: { percentual: '2', base: 'debitos-atualizados' },
  art523: 'multa_e_honorarios_10',
  custasFinais: '350.00',
  itens: [{ id: 'deb-enc', especie: 'debito', descricao: 'Contrato', data: '2024-01-01', valor: '1000.00' }]
});
assert.equal(encargosRes.resumo.multaContratual, '20.00');
assert.equal(encargosRes.resumo.multaArt523, '102.00');
assert.equal(encargosRes.resumo.honorariosArt523, '102.00');
assert.equal(encargosRes.resumo.custasFinais, '350.00');
assert.equal(encargosRes.resumo.total, '1574.00');

// 11. Série Poupança atravessando 04/05/2012 (emenda automática SGS 25 + SGS 195)
const poupSource = createCalcSource({
  fetchSeriesImpl: async code => {
    if (code === 25) return [{ date: '2012-04-30', period: '2012-04', value: parseDec('0.500000') }];
    if (code === 195) return [{ date: '2012-05-31', period: '2012-05', value: parseDec('0.400000') }];
    throw new Error(`Código inesperado ${code}`);
  }
});
const poupMerged = await poupSource.rows('POUPANCA', '2012-04-01', '2012-05-31');
assert.equal(poupMerged.length, 2);
assert.equal(poupMerged[0].period, '2012-04');
assert.equal(poupMerged[1].period, '2012-05');

// 12. Helpers de exportação CSV e resumo para petição
const txtSummary = buildCivelSummaryText(encargosRes);
assert.ok(txtSummary.includes('Multa contratual'));
assert.ok(txtSummary.includes('Custas finais'));
const csvJudicial = buildCivelCsv(encargosRes);
assert.ok(csvJudicial.includes('Especie;Descricao;DataBase'));
const csvSfh = buildCivelCsv(sfh);
assert.ok(csvSfh.includes('Mes;AnoContrato;PrestacaoTotal'));
assert.ok(csvSfh.includes('120;10;1452,60'));

console.log('Central de Cálculos Cíveis e Financeiros aprovada: Correção/Reversa, PRICE/SAC, SFH/SACRE 120m, Equivalência/TVM, Reajuste Locatício, Importador .HTM, Lei 14.905, Juros Compostos, Desapropriação, Art. 523, Poupança 2012 e Exportação CSV PASS.');
