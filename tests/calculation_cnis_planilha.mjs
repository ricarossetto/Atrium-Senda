import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseCnisPlanilha, planilhaCnisModelo } from '../lib/calc/cnis-planilha.mjs';
import { CnisExtratoError } from '../lib/calc/cnis-extrato.mjs';

function bufferXlsx(matriz) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matriz), 'CNIS');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

const modelo = planilhaCnisModelo();
const xlsx = bufferXlsx([modelo.cabecalho, ...modelo.linhas]);
const planilha = parseCnisPlanilha({ base64: Buffer.from(xlsx).toString('base64') });
assert.equal(planilha.modo, 'planilha');
assert.equal(planilha.vinculos.length, 2);
assert.equal(planilha.resumo.competencias, 3);
assert.equal(planilha.vinculos[0].cnpj, '11111111000111');
assert.equal(planilha.vinculos[1].cnpj, '22222222000122');
assert.equal(planilha.indicadores.length, 1);
assert.equal(planilha.indicadores[0].codigo, 'PEXT');
assert.equal(planilha.resumo.primeiraCompetencia, '2024-01');
assert.equal(planilha.resumo.ultimaCompetencia, '2024-03');
assert.equal(planilha.vinculos[0].competencias[0].salario, '2000.00');

const csv = [
  'Competência;Remuneração;CNPJ;Empregador',
  '01/2019;1.234,56;33.333.333/0001-33;Empresa Gama',
  '02/2019;1234.56;;Empresa Gama',
  '03/2019;R$ 1.500,00;;Empresa Gama',
  'Total;;;'
].join('\n');
const porCsv = parseCnisPlanilha({ content: csv });
assert.equal(porCsv.vinculos.length, 1);
assert.equal(porCsv.resumo.competencias, 3);
assert.equal(porCsv.vinculos[0].cnpj, '33333333000133');
assert.equal(porCsv.vinculos[0].competencias[1].salario, '1234.56');
assert.equal(porCsv.vinculos[0].competencias[2].salario, '1500.00');
assert.ok(porCsv.avisos.some(aviso => /ignorada/i.test(aviso)), 'Linha de total sem competência precisa ser ignorada.');

const serial = bufferXlsx([
  ['Competência', 'Salário'],
  [new Date(Date.UTC(2024, 0, 15)), 3000],
  ['2024-02', '3.000,00'],
  ['202402', 3100],
  ['02/15/2024', 3200]
]);
const comSerial = parseCnisPlanilha({ base64: Buffer.from(serial).toString('base64') });
assert.equal(comSerial.resumo.competencias, 2);
assert.deepEqual(comSerial.competencias.map(item => item.competencia), ['2024-01', '2024-02']);
assert.ok(comSerial.avisos.some(aviso => /duplicada/.test(aviso)), 'Competência repetida no mesmo vínculo é deduplicada com aviso.');
assert.equal(comSerial.vinculos[0].empregador, 'Vínculo da planilha');

const semCabecalho = bufferXlsx([['a', 'b'], ['c', 'd']]);
assert.throws(() => parseCnisPlanilha({ base64: Buffer.from(semCabecalho).toString('base64') }), CnisExtratoError);
assert.throws(() => parseCnisPlanilha({ content: '' }), CnisExtratoError);
assert.throws(() => parseCnisPlanilha({}), CnisExtratoError);
assert.throws(() => parseCnisPlanilha({ content: 'Competência;Remuneração\n;' }), CnisExtratoError);

console.log('CNIS (planilha) aprovado: XLSX, CSV, datas seriais, valores BR, agrupamento por vínculo e guardas PASS.');
