import assert from 'node:assert/strict';
import { PcdError, avaliarAposentadoriaPcd, tempoMinimoPcd } from '../lib/calc/pcd.mjs';
import { RetornoError, calcularRetorno, fatorPrevidenciario } from '../lib/calc/retorno.mjs';

assert.equal(tempoMinimoPcd('grave', 'feminino'), 240);
assert.equal(tempoMinimoPcd('grave', 'masculino'), 300);
assert.equal(tempoMinimoPcd('moderada', 'feminino'), 288);
assert.equal(tempoMinimoPcd('leve', 'masculino'), 396);
assert.throws(() => tempoMinimoPcd('inventado', 'feminino'), PcdError);
assert.throws(() => tempoMinimoPcd('grave', 'outro'), PcdError);

const pcdElegivel = avaliarAposentadoriaPcd({
  sexo: 'feminino',
  grau: 'grave',
  tempoMeses: 260,
  carenciaMeses: 210,
  idadeAnos: 57,
  media: '6554.10',
  teto: '8157.41',
  piso: '1518.00'
});
assert.equal(pcdElegivel.elegivel, true);
assert.equal(pcdElegivel.coeficiente, '100.00');
assert.equal(pcdElegivel.rmi, '6554.10');
assert.equal(pcdElegivel.limiteAplicado, null);
assert.ok(pcdElegivel.avisos.some(aviso => /100% do salário de benefício/.test(aviso)));

const pcdFaltante = avaliarAposentadoriaPcd({ sexo: 'masculino', grau: 'moderada', tempoMeses: 300, carenciaMeses: 150 });
assert.equal(pcdFaltante.elegivel, false);
assert.deepEqual(pcdFaltante.faltantes, [
  { requisito: 'Tempo de contribuição na condição de PcD', faltamMeses: 48 },
  { requisito: 'Carência', faltamMeses: 30 }
]);
assert.equal(pcdFaltante.rmi, null);

const pcdTeto = avaliarAposentadoriaPcd({
  sexo: 'feminino',
  grau: 'grave',
  tempoMeses: 240,
  carenciaMeses: 180,
  media: '9000.00',
  teto: '8157.41'
});
assert.equal(pcdTeto.rmi, '8157.41');
assert.equal(pcdTeto.limiteAplicado, 'teto');

assert.throws(() => avaliarAposentadoriaPcd({ sexo: 'feminino', grau: 'grave', tempoMeses: -1, carenciaMeses: 180 }), PcdError);
assert.throws(() => avaliarAposentadoriaPcd({ sexo: 'feminino', grau: 'grave', tempoMeses: 240, carenciaMeses: 180, media: '-5' }), PcdError);

const fator = fatorPrevidenciario({
  sexo: 'masculino',
  idadeAnos: 55,
  tempoContribuicaoMeses: 420,
  expectativaSobrevidaAnos: 25
});
assert.equal(fator.tempoContribuicaoAnos, '35.0000');
assert.equal(fator.fator, '0.7198');

const fatorMulher = fatorPrevidenciario({
  sexo: 'feminino',
  idadeAnos: 60,
  tempoContribuicaoMeses: 360,
  expectativaSobrevidaAnos: 24
});
assert.equal(fatorMulher.alfa, '0.26');
assert.ok(Number(fatorMulher.fator) > 0.54 && Number(fatorMulher.fator) < 0.56);

assert.throws(() => fatorPrevidenciario({ sexo: 'outro', idadeAnos: 55, tempoContribuicaoMeses: 420, expectativaSobrevidaAnos: 25 }), RetornoError);
assert.throws(() => fatorPrevidenciario({ sexo: 'masculino', idadeAnos: 55, tempoContribuicaoMeses: 420, expectativaSobrevidaAnos: 0 }), RetornoError);

const retorno = calcularRetorno({
  rmi: '6554.10',
  mesesRecebimento: 300,
  idadeAnos: 57,
  contribuicoesTotais: '250000.00'
});
assert.equal(retorno.mesesRecebimento, 300);
assert.equal(retorno.decimos, 25);
assert.equal(retorno.brutoComDecimo, (6554.10 * 325).toFixed(2));
assert.ok(Number(retorno.irrfMensal) > 0);
assert.ok(Number(retorno.liquido) < Number(retorno.brutoComDecimo));
assert.ok(Number(retorno.retorno) > 1);

const isento = calcularRetorno({ rmi: '1800.00', mesesRecebimento: 120, idadeAnos: 66, contribuicoesTotais: '100000.00' });
assert.equal(isento.isento65, true);
assert.equal(isento.irrfMensal, '0.00');
assert.ok(isento.avisos.some(aviso => /Isenção de IRRF/.test(aviso)));

const sem13 = calcularRetorno({ rmi: '3000.00', mesesRecebimento: 24, decimoTerceiro: false });
assert.equal(sem13.decimos, 0);
assert.equal(sem13.brutoComDecimo, sem13.bruto);
assert.equal(sem13.retorno, null);

assert.throws(() => calcularRetorno({ rmi: '0', mesesRecebimento: 12 }), RetornoError);
assert.throws(() => calcularRetorno({ rmi: '3000', mesesRecebimento: 0 }), RetornoError);
assert.throws(() => calcularRetorno({ rmi: '3000', mesesRecebimento: 12, contribuicoesTotais: '-1' }), RetornoError);

console.log('PcD e retorno aprovados: LC 142 (tempo por grau, carência 180, RMI 100%, teto/piso), fator previdenciário com tábua informada, ROI com 13º, isenção 65+ e IRRF exclusivo PASS.');
