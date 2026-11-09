import assert from 'node:assert/strict';
import {
  PrevidenciarioError,
  SEXOS,
  buildPrevidenciarioCalculation,
  describePrevidenciarioInput,
  calcularRmiComCorrecao,
  mediaSalarios,
  coeficienteProgressivo
} from '../lib/calc/previdenciario.mjs';
import { toFixedString } from '../lib/calc/decimal.mjs';

function competencias(de, quantidade, salario) {
  const [ano, mes] = de.split('-').map(Number);
  const lista = [];
  for (let indice = 0; indice < quantidade; indice += 1) {
    const total = mes - 1 + indice;
    const year = ano + Math.floor(total / 12);
    const month = (total % 12) + 1;
    lista.push({ competencia: `${year}-${String(month).padStart(2, '0')}`, salario });
  }
  return lista;
}

assert.deepEqual([...SEXOS], ['feminino', 'masculino']);

const mulher25 = buildPrevidenciarioCalculation({
  sexo: 'feminino',
  competencias: competencias('2000-01', 300, '2000.00')
});
assert.equal(mulher25.resumo.competencias, 300);
assert.equal(mulher25.resumo.carenciaMeses, 300);
assert.equal(mulher25.resumo.somaSalarios, '600000.00');
assert.equal(mulher25.resumo.salarioBeneficio, '2000.00');
assert.equal(mulher25.resumo.coeficiente, '80.00');
assert.equal(mulher25.resumo.rmi, '1600.00');
assert.equal(mulher25.resumo.limiteAplicado, null);
assert.equal(mulher25.parametros.anos, 25);
assert.equal(mulher25.parametros.mesesRestantes, 0);
assert.equal(mulher25.parametros.divisor, 300);
assert.equal(mulher25.primeiraCompetencia, '2000-01');
assert.equal(mulher25.ultimaCompetencia, '2024-12');
assert.doesNotThrow(() => JSON.stringify(mulher25));
assert.equal(mulher25.memoria.length, 3);

const homem20 = buildPrevidenciarioCalculation({
  sexo: 'masculino',
  competencias: competencias('2000-01', 240, '1500.00')
});
assert.equal(homem20.resumo.salarioBeneficio, '1500.00');
assert.equal(homem20.resumo.coeficiente, '60.00');
assert.equal(homem20.resumo.rmi, '900.00');

const mulher14 = buildPrevidenciarioCalculation({
  sexo: 'feminino',
  competencias: competencias('2000-01', 168, '1000.00')
});
assert.equal(mulher14.parametros.anos, 14);
assert.equal(mulher14.resumo.coeficiente, '60.00');
assert.ok(mulher14.avisos.some(aviso => /abaixo do mínimo/.test(aviso)));

const comTeto = buildPrevidenciarioCalculation({
  sexo: 'feminino',
  competencias: competencias('2000-01', 300, '10000.00'),
  teto: '7000.00'
});
assert.equal(comTeto.resumo.rmiBruta, '8000.00');
assert.equal(comTeto.resumo.rmi, '7000.00');
assert.equal(comTeto.resumo.limiteAplicado, 'teto');
assert.ok(comTeto.memoria.some(entry => entry.tipo === 'limite'));

const comPiso = buildPrevidenciarioCalculation({
  sexo: 'masculino',
  competencias: competencias('2026-01', 12, '1000.00'),
  piso: '1518.00'
});
assert.equal(comPiso.resumo.rmiBruta, '600.00');
assert.equal(comPiso.resumo.rmi, '1518.00');
assert.equal(comPiso.resumo.limiteAplicado, 'piso');

const comDivisor = buildPrevidenciarioCalculation({
  sexo: 'feminino',
  competencias: competencias('2022-01', 50, '1000.00'),
  divisorMinimo: true
});
assert.equal(comDivisor.parametros.divisor, 108);
assert.equal(comDivisor.parametros.divisorMinimoAplicado, true);
assert.equal(comDivisor.resumo.salarioBeneficio, '462.96');
assert.equal(comDivisor.resumo.coeficiente, '60.00');
assert.equal(comDivisor.resumo.rmi, '277.78');
assert.ok(comDivisor.avisos.some(aviso => /Divisor mínimo/.test(aviso)));
assert.equal(comDivisor.memoria[0].descricao, 'Soma de 50 competências dividida por 108');

const semDivisor = buildPrevidenciarioCalculation({
  sexo: 'feminino',
  competencias: competencias('2022-01', 50, '1000.00')
});
assert.equal(semDivisor.resumo.salarioBeneficio, '1000.00');
assert.equal(semDivisor.resumo.rmi, '600.00');

assert.equal(toFixedString(mediaSalarios([{ salario: '1000' }, { salario: '2000' }]), 2), '1500.00');
assert.equal(toFixedString(coeficienteProgressivo('feminino', 180), 2), '60.00');
assert.equal(toFixedString(coeficienteProgressivo('feminino', 240), 2), '70.00');
assert.equal(toFixedString(coeficienteProgressivo('masculino', 240), 2), '60.00');
assert.equal(toFixedString(coeficienteProgressivo('masculino', 300), 2), '70.00');
assert.throws(() => coeficienteProgressivo('outro', 240), PrevidenciarioError);
assert.throws(() => mediaSalarios([]), PrevidenciarioError);

assert.equal(describePrevidenciarioInput({ sexo: 'feminino', competencias: competencias('2026-01', 3, '1000') }).competencias, 3);
assert.equal(describePrevidenciarioInput({ sexo: 'feminino', competencias: competencias('2026-01', 3, '1000'), divisorMinimo: true }).divisorMinimo, true);
assert.equal(describePrevidenciarioInput({ sexo: 'feminino', competencias: competencias('2026-01', 3, '1000'), corrigirSalarios: true }).corrigirSalarios, true);

const comCorrecao = buildPrevidenciarioCalculation({
  sexo: 'feminino',
  corrigirSalarios: true,
  referenciaCorrecao: '2025-02',
  competencias: [
    { competencia: '2004-01', salario: '3000.00' },
    ...competencias('2004-02', 9, '2000.00')
  ]
});
assert.equal(comCorrecao.parametros.correcaoAtiva, true);
assert.equal(comCorrecao.parametros.referenciaCorrecao, '2025-02');
assert.equal(comCorrecao.parametros.descarteAplicado, true);
assert.ok(comCorrecao.correcao, 'Bloco de correção exposto no resultado.');
assert.equal(comCorrecao.correcao.parcelas[0].corrigido, '7655.80');
assert.equal(comCorrecao.correcao.consideradas, 8);
assert.equal(comCorrecao.resumo.salarioBeneficio, comCorrecao.correcao.salarioBeneficio, 'SB usa a média corrigida com descarte.');
assert.ok(comCorrecao.avisos.some(aviso => /INPC/.test(aviso)), 'Aviso de correção presente.');
assert.ok(comCorrecao.avisos.some(aviso => /anteriores a 2001/.test(aviso)), 'Limite pré-2001 declarado nos avisos.');
assert.throws(() => buildPrevidenciarioCalculation({
  sexo: 'feminino',
  corrigirSalarios: true,
  referenciaCorrecao: '2026-13',
  competencias: [{ competencia: '2026-01', salario: '1000' }]
}), PrevidenciarioError);

assert.throws(() => buildPrevidenciarioCalculation({ sexo: 'feminino', competencias: [] }), PrevidenciarioError);
assert.throws(() => buildPrevidenciarioCalculation({ sexo: 'outro', competencias: competencias('2026-01', 1, '1000') }), PrevidenciarioError);
assert.throws(() => buildPrevidenciarioCalculation({ sexo: 'feminino', competencias: [{ competencia: '1990-01', salario: '1000' }] }), PrevidenciarioError);
assert.throws(() => buildPrevidenciarioCalculation({ sexo: 'feminino', competencias: [{ competencia: '2026-13', salario: '1000' }] }), PrevidenciarioError);
assert.throws(() => buildPrevidenciarioCalculation({
  sexo: 'feminino',
  competencias: [{ competencia: '2026-01', salario: '1000' }, { competencia: '2026-01', salario: '1000' }]
}), PrevidenciarioError, 'Concomitância precisa ser conferida, não silenciada.');
assert.throws(() => buildPrevidenciarioCalculation({ sexo: 'feminino', competencias: [{ competencia: '2026-01', salario: '0' }] }), PrevidenciarioError);
assert.throws(() => buildPrevidenciarioCalculation({ sexo: 'feminino', competencias: [{ competencia: '2026-01', salario: '-1' }] }), PrevidenciarioError);
assert.throws(() => buildPrevidenciarioCalculation({ sexo: 'feminino', competencias: competencias('2026-01', 3, '1000'), piso: '2000', teto: '1000' }), PrevidenciarioError);
assert.throws(() => buildPrevidenciarioCalculation({ sexo: 'feminino', competencias: [null] }), PrevidenciarioError);

const comTransicoes = buildPrevidenciarioCalculation({
  sexo: 'masculino',
  dataNascimento: '1956-03-01',
  dataReferencia: '2026-09-18',
  competencias: [
    ...competencias('1994-07', 305, '1000.00'),
    ...competencias('2019-12', 115, '2000.00')
  ]
});
assert.equal(comTransicoes.transicoes.regras.length, 6);
assert.equal(comTransicoes.transicoes.tempoTotalMeses, 420);
assert.equal(comTransicoes.transicoes.tempoAteReformaMeses, 305);
assert.equal(comTransicoes.transicoes.regras.find(regra => regra.id === 'pontos').elegivel, true);
assert.equal(comTransicoes.transicoes.regras.find(regra => regra.id === 'idade-permanente').elegivel, true);
assert.equal(comTransicoes.transicoes.regras.find(regra => regra.id === 'pedagio-50').faltas.aplicavel, false);

const semNascimento = buildPrevidenciarioCalculation({ sexo: 'feminino', competencias: competencias('2024-01', 3, '2000.00') });
assert.equal(semNascimento.transicoes, null, 'Sem data de nascimento o comparador não é calculado.');
assert.equal(describePrevidenciarioInput({ sexo: 'feminino', competencias: competencias('2024-01', 3, '2000.00'), dataNascimento: '1966-03-01' }).dataNascimento, '1966-03-01');
assert.throws(() => buildPrevidenciarioCalculation({ sexo: 'feminino', competencias: competencias('2024-01', 3, '2000.00'), dataNascimento: '1966-13-01' }), PrevidenciarioError);

const rmiCorrigida = calcularRmiComCorrecao({
  referencia: '2025-02',
  competencias: [
    { competencia: '2004-01', salario: '3000.00' },
    { competencia: '2004-02', salario: '2000.00' },
    { competencia: '2004-03', salario: '2000.00' },
    { competencia: '2004-04', salario: '2000.00' },
    { competencia: '2004-05', salario: '2000.00' },
    { competencia: '2004-06', salario: '2000.00' },
    { competencia: '2004-07', salario: '2000.00' },
    { competencia: '2004-08', salario: '2000.00' },
    { competencia: '2004-09', salario: '2000.00' },
    { competencia: '2004-10', salario: '50.00' }
  ]
});
assert.equal(rmiCorrigida.pbc, 10);
assert.equal(rmiCorrigida.consideradas, 8);
assert.equal(rmiCorrigida.descartadas, 2);
assert.equal(rmiCorrigida.parcelas[0].teto, '2400.00');
assert.equal(rmiCorrigida.parcelas[0].considerado, '2400.00', 'Teto da época limita antes da correção.');
assert.equal(rmiCorrigida.parcelas[0].corrigido, '7655.80');
assert.ok(rmiCorrigida.parcelasDescartadas.includes('2004-10'), 'Menor salário corrigido entra no descarte de 20%.');
assert.ok(!rmiCorrigida.parcelasDescartadas.includes('2004-01'), 'Maior salário corrigido permanece na média.');
const somaManual = rmiCorrigida.parcelas
  .filter(parcela => !rmiCorrigida.parcelasDescartadas.includes(parcela.competencia))
  .reduce((total, parcela) => total + Number(parcela.corrigido), 0);
assert.ok(Math.abs(Number(rmiCorrigida.somaConsiderada) - somaManual) < 0.01, 'Soma considerada corresponde às parcelas usadas.');
assert.ok(Math.abs(Number(rmiCorrigida.media) - somaManual / 8) < 0.01, 'Média é a soma das usadas dividida pelas consideradas.');
assert.match(rmiCorrigida.fontes.tetos, /Portarias/);
assert.match(rmiCorrigida.fontes.inpc, /SGS\/BCB/);

const semDescarte = calcularRmiComCorrecao({
  referencia: '2025-02',
  descarte: false,
  competencias: [{ competencia: '2004-01', salario: '1000.00' }, { competencia: '2004-02', salario: '1000.00' }]
});
assert.equal(semDescarte.consideradas, 2);
assert.equal(semDescarte.descartadas, 0);
assert.throws(() => calcularRmiComCorrecao({ referencia: '2025-02', competencias: [] }), PrevidenciarioError);
assert.throws(() => calcularRmiComCorrecao({ referencia: '2025-02', competencias: [{ competencia: '2026-13', salario: '1000' }] }), Error);

console.log('Motor previdenciário aprovado: média, coeficiente progressivo, RMI, teto/piso, divisor mínimo, comparador EC 103, correção com tetos/INPC/descarte e guardas PASS.');

