import assert from 'node:assert/strict';
import { calcularTempoContribuicao, calcularPeriodoGraca, TempoContribuicaoError } from '../lib/calc/tempo-contribuicao.mjs';

const simples = calcularTempoContribuicao({
  vinculos: [
    { inicio: '2015-01-01', fim: '2024-12-31', empresa: 'Empresa Teste' }
  ]
});
assert.equal(simples.totalDias, 3653);
assert.equal(simples.total.anos, 10);
assert.equal(simples.total.meses, 0);
assert.equal(simples.carenciaMeses, 120);
assert.equal(simples.vinculos[0].concomitante, false);
assert.equal(simples.marcos.ateEc20, 0);
assert.equal(simples.marcos.ateEc103, 1778);
assert.equal(simples.marcos.aposEc103, 1875);

const concomitantes = calcularTempoContribuicao({
  dataReferencia: '2026-01-31',
  vinculos: [
    { inicio: '2024-01-01', fim: '2024-06-30', tipo: 'empregado' },
    { inicio: '2024-04-01', fim: '2024-09-30', tipo: 'contribuinte_individual' }
  ]
});
assert.equal(concomitantes.vinculos.length, 2);
assert.equal(concomitantes.vinculos[0].dias, 182);
assert.equal(concomitantes.vinculos[1].concomitante, true);
assert.equal(concomitantes.vinculos[1].dias, 92, 'Somente a parcela não sobreposta entra.');
assert.ok(concomitantes.avisos.some(aviso => /concomitante/.test(aviso)));
assert.equal(concomitantes.carenciaMeses, 9);

const comFator = calcularTempoContribuicao({
  vinculos: [{ inicio: '2010-01-01', fim: '2010-12-31', tipo: 'especial', fator: 1.4 }]
});
assert.equal(comFator.totalDias, 365);
assert.equal(comFator.totalDiasEfetivos, 511);
assert.equal(comFator.vinculos[0].fator, 1.4);

const emAberto = calcularTempoContribuicao({
  dataReferencia: '2026-01-10',
  vinculos: [{ inicio: '2025-12-01' }]
});
assert.equal(emAberto.vinculos[0].fim, '2026-01-10');
assert.equal(emAberto.vinculos[0].dias, 41);

assert.throws(() => calcularTempoContribuicao({}), TempoContribuicaoError);
assert.throws(() => calcularTempoContribuicao({ vinculos: [{ inicio: '2024-13-01', fim: '2024-12-01' }] }), TempoContribuicaoError);
assert.throws(() => calcularTempoContribuicao({ vinculos: [{ inicio: '2024-06-01', fim: '2024-01-01' }] }), TempoContribuicaoError);
assert.throws(() => calcularTempoContribuicao({ vinculos: [{ inicio: '2024-01-01', fim: '2024-12-31', tipo: 'inventado' }] }), TempoContribuicaoError);
assert.throws(() => calcularTempoContribuicao({ vinculos: [{ inicio: '2024-01-01', fim: '2024-12-31', fator: 9 }] }), TempoContribuicaoError);
assert.throws(() => calcularTempoContribuicao({ vinculos: [{ inicio: '2024-01-01' }] }), TempoContribuicaoError);

const graca12 = calcularPeriodoGraca({ ultimaContribuicao: '2025-06-15', contribuicoesMeses: 30, dataReferencia: '2026-06-30' });
assert.equal(graca12.mesesPeriodo, 12);
assert.equal(graca12.fimPeriodo, '2026-06-30');
assert.equal(graca12.mantemQualidade, true);

const graca24 = calcularPeriodoGraca({ ultimaContribuicao: '2025-06-15', contribuicoesMeses: 130, dataReferencia: '2026-12-31' });
assert.equal(graca24.prorrogacao, true);
assert.equal(graca24.mesesPeriodo, 24);
assert.equal(graca24.fimPeriodo, '2027-06-30');
assert.equal(graca24.mantemQualidade, true);
assert.ok(graca24.avisos.some(aviso => /24 meses/.test(aviso)));

const perdida = calcularPeriodoGraca({ ultimaContribuicao: '2024-01-10', contribuicoesMeses: 40, dataReferencia: '2026-01-01' });
assert.equal(perdida.fimPeriodo, '2025-01-31');
assert.equal(perdida.mantemQualidade, false);

const desempregado = calcularPeriodoGraca({ ultimaContribuicao: '2025-01-05', contribuicoesMeses: 30, desempregoComprovado: true, dataReferencia: '2026-03-01' });
assert.equal(desempregado.acrescimoDesemprego, 12);
assert.equal(desempregado.fimPeriodo, '2027-01-31');
assert.equal(desempregado.mantemQualidade, true);

assert.throws(() => calcularPeriodoGraca({ ultimaContribuicao: '2025-06-15', contribuicoesMeses: -1 }), TempoContribuicaoError);
assert.throws(() => calcularPeriodoGraca({ ultimaContribuicao: '15/06/2025', contribuicoesMeses: 10 }), TempoContribuicaoError);

console.log('Tempo de contribuição e qualidade de segurado aprovados: vínculos, concomitância, fatores, marcos EC 20/103, carência, período de graça 12/24 + desemprego e guardas PASS.');
