import assert from 'node:assert/strict';
import {
  TabelaFiscalError,
  VIGENCIAS_FISCAIS,
  vigenciaFiscal,
  vigenciaResumo,
  calcularInss,
  calcularRedutorIrrf,
  calcularIrrf,
  calcularIrrfExclusivo
} from '../lib/calc/tabelas.mjs';
import { parseDec, toFixedString } from '../lib/calc/decimal.mjs';

assert.equal(Object.isFrozen(VIGENCIAS_FISCAIS), true);
assert.equal(Object.isFrozen(vigenciaFiscal(2026)), true);
assert.throws(() => vigenciaFiscal(1998), TabelaFiscalError, 'Ano sem vigência precisa falhar com orientação.');
assert.throws(() => vigenciaFiscal(2025), TabelaFiscalError);

const resumo = vigenciaResumo(2026);
assert.equal(resumo.salarioMinimo, '1621.00');
assert.equal(resumo.tetoSalarioContribuicao, '8475.55');
assert.equal(resumo.dependente, '189.59');
assert.equal(resumo.descontoSimplificado, '607.20');
assert.ok(resumo.fontes.some(fonte => /13\/2026/.test(fonte)));
assert.ok(resumo.fontes.some(fonte => /15\.270/.test(fonte)));

const inssMinimo = calcularInss('1621.00');
assert.equal(inssMinimo.total, '121.58', 'INSS do salário mínimo 2026 = 7,5% de 1.621,00.');
assert.deepEqual(inssMinimo.detalhe, [{ aliquota: '7,5%', faixaAte: '1621.00', base: '1621.00', valor: '121.58' }]);

const inssTeto = calcularInss('8475.55');
assert.equal(inssTeto.total, '988.09', 'Contribuição máxima publicada para 2026.');
assert.equal(inssTeto.detalhe.length, 4);

const inss2000 = calcularInss('2000.00');
assert.equal(inss2000.total, '155.69', 'Exemplo conferido à mão: 1.621×7,5% + 379×9% = 155,685 (arredondado a centavos).');
assert.equal(inss2000.detalhe.length, 2);

const inssAcimaTeto = calcularInss('20000.00');
assert.equal(inssAcimaTeto.total, '988.09', 'Acima do teto a contribuição fica no máximo.');

assert.throws(() => calcularInss('-1'), TabelaFiscalError);

const redutor5000 = calcularRedutorIrrf('5000.00');
assert.equal(toFixedString(redutor5000, 2), '312.90', 'Redutor em R$ 5.000 zera o imposto (312,89 na lei; arredondamento a centavos).');
const redutor7000 = calcularRedutorIrrf('7000.00');
assert.equal(toFixedString(redutor7000, 2), '46.61', 'Redutor em R$ 7.000 ≈ R$ 46,60.');
const redutor8000 = calcularRedutorIrrf('8000.00');
assert.equal(toFixedString(redutor8000, 2), '0.00', 'Acima de R$ 7.350 não há redutor.');

const irrf5000 = calcularIrrf({ rendimento: '5000.00', inss: calcularInss('5000.00').total });
assert.equal(irrf5000.isento, true);
assert.equal(irrf5000.irrf, '0.00');
assert.ok(parseDec(irrf5000.redutor) > 0n);

const irrf7000 = calcularIrrf({ rendimento: '7000.00', inss: calcularInss('7000.00').total });
assert.equal(irrf7000.redutor, '46.61');
assert.equal(irrf7000.metodo, 'legal', 'Em 7.000 a base legal (após INSS) é menor que a simplificada.');

const irrf12000 = calcularIrrf({ rendimento: '12000.00', inss: calcularInss('12000.00').total });
assert.equal(irrf12000.redutor, '0.00');
assert.equal(irrf12000.metodo, 'legal');

const irrfComDependentes = calcularIrrf({ rendimento: '7000.00', inss: calcularInss('7000.00').total, dependentes: 2 });
assert.equal(irrfComDependentes.metodo, 'legal');

const irrfBaseBaixa = calcularIrrf({ rendimento: '1000.00', inss: calcularInss('1000.00').total });
assert.equal(irrfBaseBaixa.metodo, 'simplificado', 'Rendimento baixo usa o desconto simplificado.');
assert.equal(irrfBaseBaixa.irrf, '0.00');

const irrfZero = calcularIrrf({ rendimento: '0', inss: '0' });
assert.equal(irrfZero.irrf, '0.00');
assert.throws(() => calcularIrrf({ rendimento: '1000', metodo: 'outro' }), TabelaFiscalError);
assert.throws(() => calcularIrrf({ rendimento: '1000', dependentes: 21 }), TabelaFiscalError);
assert.throws(() => calcularIrrf({ rendimento: '1000', ano: 1998 }), TabelaFiscalError);

const decimo3000 = calcularIrrfExclusivo({ rendimento: '3000.00', inss: calcularInss('3000.00').total });
assert.equal(decimo3000.irrf, '0.00', '13º de R$ 3.000 fica isento pelo redutor da Lei 15.270/2025.');
assert.ok(parseDec(decimo3000.redutor) > 0n);

const decimo10000 = calcularIrrfExclusivo({ rendimento: '10000.00', inss: calcularInss('10000.00').total, dependentes: 1 });
assert.ok(parseDec(decimo10000.irrf) > 0n);
assert.equal(decimo10000.metodo, 'legal', 'Imposto exclusivo do 13º não usa desconto simplificado.');
assert.throws(() => calcularIrrfExclusivo({ rendimento: '1000', dependentes: -1 }), TabelaFiscalError);

console.log('Tabelas fiscais 2026 aprovadas: INSS progressivo, teto, redutor do IRRF, métodos e 13º exclusivo PASS.');
