import assert from 'node:assert/strict';
import { CivelError, CIVEL_SPECIES, buildCivelCalculation, describeCivelInput } from '../lib/calc/civel.mjs';
import { normalizeSgsRows } from '../lib/calc/indices.mjs';
import { parseDec } from '../lib/calc/decimal.mjs';

function monthlySeries(pairs) {
  return normalizeSgsRows(pairs.map(([data, valor]) => ({ data, valor })), 'fixture');
}

const IPCA = monthlySeries([
  ['31/01/2026', '0.50'],
  ['28/02/2026', '0.40'],
  ['31/03/2026', '0.30'],
  ['30/04/2026', '0.20']
]);
const INPC = monthlySeries([
  ['31/01/2026', '0.50'],
  ['28/02/2026', '0.60']
]);
const SELIC_MONTH = monthlySeries([
  ['31/01/2026', '0.50'],
  ['28/02/2026', '0.50'],
  ['31/03/2026', '0.40'],
  ['30/04/2026', '0.40']
]);
const TAXA_LEGAL = new Map([
  ['2026-01', parseDec('0.500000')],
  ['2026-02', parseDec('0.500000')],
  ['2026-03', parseDec('0.400000')],
  ['2026-04', parseDec('0.400000')]
]);
const deps = {
  seriesRows: key => {
    if (key === 'IPCA') return IPCA;
    if (key === 'INPC') return INPC;
    if (key === 'SELIC_MONTH') return SELIC_MONTH;
    throw new CivelError(`série desconhecida: ${key}`);
  },
  taxaLegalRates: () => TAXA_LEGAL
};

assert.deepEqual([...CIVEL_SPECIES], ['debito', 'amortizacao', 'custas', 'despesa', 'desconto']);

const simples = buildCivelCalculation({
  atualizacaoAte: '2026-04-20',
  correcao: { serie: 'IPCA' },
  juros: { tipo: 'taxa-legal' },
  itens: [{ id: 'principal', especie: 'debito', descricao: 'Dano material', data: '2026-01-15', valor: '1000.00' }]
}, deps);
assert.equal(simples.itens[0].fatorCorrecao, '1.009026024000');
assert.equal(simples.itens[0].valorCorrigido, '1009.03');
assert.equal(simples.itens[0].juros, '14.38');
assert.equal(simples.itens[0].total, '1023.41');
assert.deepEqual(simples.resumo, {
  debitosAtualizados: '1009.03',
  custasDespesas: '0.00',
  juros: '14.38',
  multa: '0.00',
  honorarios: '0.00',
  abatimentos: '0.00',
  total: '1023.41'
});
const memoriaJuros = simples.memoria.find(entry => entry.tipo === 'juros');
assert.equal(memoriaJuros.meses.length, 4);
assert.deepEqual(memoriaJuros.meses[0], { periodo: '2026-01', dias: 16, diasNoMes: 31, taxa: '0.500000', taxaAplicada: '0.258064516129' });
assert.deepEqual(memoriaJuros.meses[3], { periodo: '2026-04', dias: 20, diasNoMes: 30, taxa: '0.400000', taxaAplicada: '0.266666666667' });
assert.equal(memoriaJuros.taxaTotal, '1.424731182796');
assert.equal(memoriaJuros.base, '1009.03');
assert.equal(memoriaJuros.valor, '14.38');
assert.deepEqual(simples.fontes, [
  { serie: 'IPCA', de: '2026-02', ate: '2026-04' },
  { serie: 'taxa-legal (SGS 29543)', de: '2026-01', ate: '2026-04' }
]);
assert.doesNotThrow(() => JSON.stringify(simples), 'Resultado precisa ser serializável em JSON.');

const comEncargos = buildCivelCalculation({
  atualizacaoAte: '2026-04-20',
  correcao: { serie: 'IPCA' },
  juros: { tipo: 'sem' },
  multa: { percentual: '10', base: 'debitos-atualizados' },
  honorarios: { percentual: '10', base: 'debitos-atualizados' },
  itens: [
    { id: 'a', especie: 'debito', data: '2026-01-15', valor: '1000.00' },
    { id: 'b', especie: 'debito', data: '2026-02-10', valor: '500.00' }
  ]
}, deps);
assert.equal(comEncargos.itens[0].valorCorrigido, '1009.03');
assert.equal(comEncargos.itens[1].valorCorrigido, '502.50');
assert.equal(comEncargos.resumo.debitosAtualizados, '1511.53');
assert.equal(comEncargos.resumo.multa, '151.15');
assert.equal(comEncargos.resumo.honorarios, '151.15');
assert.equal(comEncargos.resumo.total, '1813.83');
assert.equal(comEncargos.memoria.filter(entry => entry.tipo === 'multa').length, 1);
assert.equal(comEncargos.memoria.filter(entry => entry.tipo === 'honorarios').length, 1);

const comAbatimento = buildCivelCalculation({
  atualizacaoAte: '2026-04-20',
  correcao: { serie: 'IPCA' },
  juros: { tipo: 'sem' },
  itens: [
    { id: 'a', especie: 'debito', data: '2026-01-15', valor: '1000.00' },
    { id: 'custas', especie: 'custas', data: '2026-02-10', valor: '100.00' },
    { id: 'pagamento', especie: 'amortizacao', data: '2026-02-10', valor: '200.00' }
  ]
}, deps);
assert.equal(comAbatimento.itens[1].valorCorrigido, '100.50');
assert.equal(comAbatimento.itens[2].valorCorrigido, '201.00');
assert.equal(comAbatimento.resumo.custasDespesas, '100.50');
assert.equal(comAbatimento.resumo.abatimentos, '201.00');
assert.equal(comAbatimento.resumo.total, '908.53');
assert.equal(comAbatimento.memoria.some(entry => entry.tipo === 'abatimento'), true);

const porTimeline = buildCivelCalculation({
  atualizacaoAte: '2026-04-20',
  correcao: {
    timeline: [
      { de: '2026-01', ate: '2026-02', serie: 'INPC' },
      { de: '2026-03', ate: null, serie: 'IPCA' }
    ]
  },
  juros: { tipo: 'sem' },
  itens: [{ id: 'a', especie: 'debito', data: '2026-01-15', valor: '1000.00' }]
}, deps);
assert.equal(porTimeline.itens[0].fatorCorrecao, '1.011036036000');
assert.equal(porTimeline.itens[0].valorCorrigido, '1011.04');
const correcaoMemoria = porTimeline.memoria.find(entry => entry.tipo === 'correcao');
assert.deepEqual(correcaoMemoria.segmentos, [
  { serie: 'INPC', de: '2026-02', ate: '2026-02', fator: '1.006000000000' },
  { serie: 'IPCA', de: '2026-03', ate: '2026-04', fator: '1.005006000000' }
]);

const proRata = buildCivelCalculation({
  atualizacaoAte: '2026-03-31',
  juros: { tipo: 'percentual-fixo', percentual: '1' },
  itens: [{ id: 'a', especie: 'debito', data: '2026-03-01', valor: '1000.00' }]
}, deps);
assert.equal(proRata.itens[0].fatorCorrecao, '1.000000000000');
assert.equal(proRata.itens[0].juros, '9.68');

const fevereiro = buildCivelCalculation({
  atualizacaoAte: '2026-02-28',
  juros: { tipo: 'percentual-fixo', percentual: '1' },
  itens: [{ id: 'a', especie: 'debito', data: '2026-02-01', valor: '1000.00' }]
}, deps);
assert.equal(fevereiro.itens[0].juros, '9.64');

const porSerie = buildCivelCalculation({
  atualizacaoAte: '2026-02-28',
  juros: { tipo: 'serie-mensal', serie: 'SELIC_MONTH' },
  itens: [{ id: 'a', especie: 'debito', data: '2026-01-31', valor: '1000.00' }]
}, deps);
assert.equal(porSerie.itens[0].juros, '5.00');
assert.equal(porSerie.fontes[0].serie, 'SELIC_MONTH');

assert.equal(describeCivelInput({
  atualizacaoAte: '2026-04-20',
  correcao: { serie: 'IPCA' },
  juros: { tipo: 'taxa-legal' },
  itens: [{ id: 'a', especie: 'debito', data: '2026-01-15', valor: '1' }]
}).correcao, 'serie');
assert.equal(describeCivelInput({
  atualizacaoAte: '2026-04-20',
  correcao: { timeline: [{ de: '2026-01', ate: null, serie: 'IPCA' }] },
  juros: { tipo: 'sem' },
  itens: [{ id: 'a', especie: 'debito', data: '2026-01-15', valor: '1' }]
}).correcao, 'timeline');

assert.throws(() => buildCivelCalculation({
  atualizacaoAte: '2026-01-10',
  correcao: { serie: 'IPCA' },
  juros: { tipo: 'sem' },
  itens: [{ id: 'a', especie: 'debito', data: '2026-01-15', valor: '1' }]
}, deps), CivelError);
assert.throws(() => buildCivelCalculation({
  atualizacaoAte: '2026-04-20',
  juros: { tipo: 'percentual-fixo', percentual: '1' },
  itens: [{ id: 'a', especie: 'debito', data: '2026-01-15', jurosDe: '2026-05-01', valor: '1' }]
}, deps), CivelError);
assert.throws(() => buildCivelCalculation({
  atualizacaoAte: '2026-04-20',
  juros: { tipo: 'taxa-legal' },
  itens: [{ id: 'a', especie: 'debito', data: '2026-01-15', valor: '1' }]
}, { taxaLegalRates: () => new Map([['2026-01', parseDec('0.5')], ['2026-02', parseDec('0.5')]]) }), CivelError, 'Mês sem taxa não pode ser silenciado.');
assert.throws(() => buildCivelCalculation({
  atualizacaoAte: '2026-04-20',
  correcao: { timeline: [{ de: '2026-01', ate: '2026-01', serie: 'IPCA' }, { de: '2026-03', ate: null, serie: 'IPCA' }] },
  juros: { tipo: 'sem' },
  itens: [{ id: 'a', especie: 'debito', data: '2026-01-15', valor: '1' }]
}, deps), CivelError, 'Lacuna na linha do tempo deve falhar.');
assert.throws(() => buildCivelCalculation({
  atualizacaoAte: '2026-04-20',
  correcao: { timeline: [{ de: '2026-01', ate: '2026-03', serie: 'IPCA' }, { de: '2026-03', ate: null, serie: 'INPC' }] },
  juros: { tipo: 'sem' },
  itens: [{ id: 'a', especie: 'debito', data: '2026-01-15', valor: '1' }]
}, deps), CivelError, 'Segmentos sobrepostos devem falhar.');
assert.throws(() => buildCivelCalculation({
  atualizacaoAte: '2026-04-20',
  juros: { tipo: 'sem' },
  itens: [{ id: 'a', especie: 'invalida', data: '2026-01-15', valor: '1' }]
}, deps), CivelError);
assert.throws(() => buildCivelCalculation({
  atualizacaoAte: '2026-04-20',
  juros: { tipo: 'sem' },
  itens: [{ id: 'a', especie: 'debito', data: '2026-01-15', valor: '1' }, { id: 'a', especie: 'debito', data: '2026-01-15', valor: '1' }]
}, deps), CivelError);
assert.throws(() => buildCivelCalculation({
  atualizacaoAte: '2026-04-20',
  juros: { tipo: 'sem' },
  itens: [{ id: 'a', especie: 'debito', data: '2026-01-15', valor: '-1' }]
}, deps), CivelError);
assert.throws(() => buildCivelCalculation({
  atualizacaoAte: '2026-04-20',
  correcao: { serie: 'AUSENTE' },
  juros: { tipo: 'sem' },
  itens: [{ id: 'a', especie: 'debito', data: '2026-01-15', valor: '1' }]
}, deps), CivelError);
assert.throws(() => buildCivelCalculation({
  atualizacaoAte: '2026-02-30',
  juros: { tipo: 'sem' },
  itens: [{ id: 'a', especie: 'debito', data: '2026-01-15', valor: '1' }]
}, deps), CivelError);
assert.throws(() => buildCivelCalculation({
  atualizacaoAte: '2026-04-20',
  juros: { tipo: 'percentual-fixo' },
  itens: [{ id: 'a', especie: 'debito', data: '2026-01-15', valor: '1' }]
}, deps), CivelError);
assert.throws(() => buildCivelCalculation({
  atualizacaoAte: '2026-04-20',
  juros: { tipo: 'sem' },
  multa: { percentual: '10', base: 'base-invalida' },
  itens: [{ id: 'a', especie: 'debito', data: '2026-01-15', valor: '1' }]
}, deps), CivelError);
assert.throws(() => buildCivelCalculation({
  atualizacaoAte: '2026-04-20',
  correcao: { serie: 'IPCA' },
  juros: { tipo: 'sem' },
  itens: [{ id: 'a', especie: 'debito', data: '2026-01-15', valor: '1' }]
}, {}), CivelError, 'Dependência ausente deve falhar.');

console.log('Motor cível aprovado: correção, juros (taxa legal, série e pró-rata), multa 523, honorários, abatimentos e memória PASS.');
