import assert from 'node:assert/strict';
import { TransicoesError, buildTransicoes, pontosExigidos, idadeExigidaMeses } from '../lib/calc/transicoes.mjs';

assert.equal(pontosExigidos('masculino', 2019), 96);
assert.equal(pontosExigidos('feminino', 2026), 93);
assert.equal(pontosExigidos('masculino', 2035), 105, 'Pontos têm teto de 105 para homens.');
assert.equal(pontosExigidos('feminino', 2040), 100, 'Pontos têm teto de 100 para mulheres.');
assert.equal(idadeExigidaMeses('feminino', 2019), 56 * 12);
assert.equal(idadeExigidaMeses('feminino', 2031), 62 * 12);
assert.equal(idadeExigidaMeses('feminino', 2040), 62 * 12, 'Idade progressiva para no teto.');
assert.equal(idadeExigidaMeses('masculino', 2027), 65 * 12);
assert.throws(() => pontosExigidos('outro', 2026), TransicoesError);

const homem = buildTransicoes({
  sexo: 'masculino',
  dataNascimento: '1964-05-10',
  mesesAteReforma: 396,
  mesesAposReforma: 48,
  dataReferencia: '2026-09-18'
});
assert.equal(homem.idadeAnos, 62);
assert.equal(homem.tempoTotalAnos, 37);
assert.equal(homem.regras.find(regra => regra.id === 'direito-adquirido').elegivel, false);
assert.equal(homem.regras.find(regra => regra.id === 'pontos').elegivel, false);
assert.equal(homem.regras.find(regra => regra.id === 'pontos').faltas.pontos, 4, '99 pontos contra 103 exigidos em 2026.');
assert.equal(homem.regras.find(regra => regra.id === 'idade-progressiva').elegivel, false);
assert.equal(homem.regras.find(regra => regra.id === 'pedagio-50').elegivel, true);
assert.equal(homem.regras.find(regra => regra.id === 'pedagio-50').rmi, 'fator-previdenciario');
assert.match(homem.regras.find(regra => regra.id === 'pedagio-50').observacao, /fator previdenciário/);
assert.equal(homem.regras.find(regra => regra.id === 'pedagio-100').elegivel, true);
assert.equal(homem.regras.find(regra => regra.id === 'pedagio-100').rmi, '100%-media');
assert.equal(homem.regras.find(regra => regra.id === 'idade-permanente').elegivel, false);
assert.equal(homem.observacoes.length, 3);

const mulher = buildTransicoes({
  sexo: 'feminino',
  dataNascimento: '1970-10-01',
  mesesAteReforma: 240,
  mesesAposReforma: 90,
  dataReferencia: '2026-09-18'
});
assert.equal(mulher.idadeAnos, 55);
assert.equal(mulher.regras.find(regra => regra.id === 'pedagio-50').faltas.aplicavel, false);
assert.match(mulher.regras.find(regra => regra.id === 'pedagio-50').observacao, /não aplicável/);
assert.equal(mulher.regras.find(regra => regra.id === 'pedagio-100').faltas.tempoMeses, 150);
assert.equal(mulher.regras.find(regra => regra.id === 'pedagio-100').faltas.idadeMeses, 13);

const mulherElegivel = buildTransicoes({
  sexo: 'feminino',
  dataNascimento: '1966-03-01',
  mesesAteReforma: 360,
  mesesAposReforma: 60,
  dataReferencia: '2026-09-18'
});
assert.equal(mulherElegivel.regras.find(regra => regra.id === 'direito-adquirido').elegivel, true);
assert.equal(mulherElegivel.regras.find(regra => regra.id === 'pontos').elegivel, true, '95 pontos ≥ 93 exigidos em 2026.');
assert.equal(mulherElegivel.regras.find(regra => regra.id === 'idade-progressiva').elegivel, true);
assert.equal(mulherElegivel.regras.find(regra => regra.id === 'pedagio-100').faltas.aplicavel, false);
assert.equal(mulherElegivel.regras.find(regra => regra.id === 'idade-permanente').faltas.idadeMeses, 18);

assert.throws(() => buildTransicoes({ sexo: 'feminino' }), TransicoesError);
assert.throws(() => buildTransicoes({ sexo: 'outro', dataNascimento: '1970-01-01' }), TransicoesError);
assert.throws(() => buildTransicoes({ sexo: 'feminino', dataNascimento: '1970-01-01', mesesAteReforma: -1 }), TransicoesError);
assert.throws(() => buildTransicoes({ sexo: 'feminino', dataNascimento: '1970-13-01' }), Error);

console.log('Comparador EC 103 aprovado: pontos, idade progressiva, pedágios, direito adquirido e regra permanente PASS.');
