import assert from 'node:assert/strict';
import { CnisExtratoError, parseCnisExtrato } from '../lib/calc/cnis-extrato.mjs';
import { avaliarQualidadeTexto } from '../lib/calc/cnis-pdf.mjs';

const extratoSintetico = [
  'Extrato Previdenciário (CNIS) — fixture sintética',
  'Dados Cadastrais',
  'Nome: Segurada Teste',
  'Relações Previdenciárias',
  'CNPJ 11.111.111/0001-11 Empresa Exemplo Alfa Ltda 01/03/2015 31/12/2019',
  '01/2019 2.000,00',
  '04/2019 2.500,00 PEXT',
  'Remunerações',
  'CNPJ 22.222.222/0001-22 Empresa Exemplo Beta S.A. 01/06/2018 31/12/2019',
  '01/2019 1.500,00',
  '03/2019 1.800,00 PREC',
  'Benefícios',
  'NB 123.456.789-0 01/02/2020 30/06/2020 1.045,00'
].join('\n');

const extrato = parseCnisExtrato(extratoSintetico);
assert.equal(extrato.vinculos.length, 2);
assert.equal(extrato.vinculos[0].cnpj, '11111111000111');
assert.match(extrato.vinculos[0].empregador, /Empresa Exemplo Alfa/);
assert.equal(extrato.vinculos[0].inicio, '2015-03-01');
assert.equal(extrato.vinculos[0].fim, '2019-12-31');
assert.equal(extrato.vinculos[0].competencias.length, 2);
assert.equal(extrato.vinculos[1].competencias.length, 2);
assert.equal(extrato.resumo.competencias, 4);
assert.equal(extrato.resumo.primeiraCompetencia, '2019-01');
assert.equal(extrato.resumo.ultimaCompetencia, '2019-04');
assert.equal(extrato.resumo.beneficios, 1);
assert.equal(extrato.beneficios[0].numero, '123.456.789-0');
assert.equal(extrato.beneficios[0].valor, '1045.00');
assert.equal(extrato.indicadores.length, 2);
assert.deepEqual(extrato.indicadores.map(item => item.codigo).sort(), ['PEXT', 'PREC']);
assert.deepEqual(extrato.concomitancias, [{ competencia: '2019-01', vinculos: [0, 1] }]);
assert.deepEqual(extrato.lacunas, ['2019-02']);
assert.ok(extrato.avisos.some(aviso => /indicador/i.test(aviso)));
assert.ok(extrato.avisos.some(aviso => /concomitante/i.test(aviso)));
assert.ok(extrato.avisos.some(aviso => /sem contribuição/i.test(aviso)));
assert.doesNotThrow(() => JSON.stringify(extrato));

const comOcr = parseCnisExtrato(extratoSintetico, { origem: 'ocr' });
assert.equal(comOcr.modo, 'ocr');
assert.match(comOcr.avisos[0], /OCR/);

const semVinculo = parseCnisExtrato('Remunerações\n05/2020 1.000,00\n06/2020 1.000,00');
assert.equal(semVinculo.vinculos.length, 1);
assert.match(semVinculo.vinculos[0].empregador, /não identificado/);
assert.ok(semVinculo.avisos.some(aviso => /sem vínculo identificado/.test(aviso)));

const duplicada = parseCnisExtrato('CNPJ 33.333.333/0001-33 Empresa Gama 01/01/2020\n01/2020 1.000,00\n01/2020 1.000,00');
assert.equal(duplicada.vinculos[0].competencias.length, 1);
assert.ok(duplicada.avisos.some(aviso => /duplicada/.test(aviso)));

assert.throws(() => parseCnisExtrato(''), CnisExtratoError);
assert.throws(() => parseCnisExtrato('Texto sem nenhuma competência reconhecível'), CnisExtratoError);
assert.throws(() => parseCnisExtrato('x'.repeat(800_001)), CnisExtratoError);

const limpo = [
  'Relações Previdenciárias',
  'CNPJ 11.111.111/0001-11 Empresa Exemplo Alfa Ltda 01/03/2015 31/12/2019',
  ...Array.from({ length: 24 }, (_, index) => {
    const mes = String((index % 12) + 1).padStart(2, '0');
    const ano = 2018 + Math.floor(index / 12);
    return `${mes}/${ano} 2.000,00`;
  })
].join('\n');
const qualidadeLimpa = avaliarQualidadeTexto(limpo);
assert.equal(qualidadeLimpa.utilizavel, true);
assert.equal(qualidadeLimpa.modoRecomendado, 'texto');

const lixo = '\u0001\u0002\u0003\u0004 >??\\B? \u0005\u0006\u0007\u0008'.repeat(120);
const qualidadeLixo = avaliarQualidadeTexto(lixo);
assert.equal(qualidadeLixo.utilizavel, false);
assert.equal(qualidadeLixo.modoRecomendado, 'ocr');
assert.ok(qualidadeLixo.motivos.some(motivo => /controle/.test(motivo)));
assert.ok(qualidadeLixo.motivos.some(motivo => /competência ou remuneração/.test(motivo)));

assert.equal(avaliarQualidadeTexto('').utilizavel, false);

console.log('CNIS (extrato) aprovado: vínculos, competências, indicadores, benefícios, lacunas, concomitâncias e portão de qualidade PASS.');
