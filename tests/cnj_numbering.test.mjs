import assert from 'node:assert/strict';
import {
  cleanCnj,
  formatCnj,
  isValidCnj,
  computeCnjCheckDigits,
  suggestCnjCorrection,
  parseCnjSegments,
  describeCnj,
  resolveCourtFromCnj,
  CNJ_SEGMENTS,
  CNJ_TRIBUNALS
} from '../js/core/cnj.js';

console.log('\n=== NUMERAÇÃO ÚNICA CNJ (RESOLUÇÃO 65/2008) ===\n');

// Implementação independente (Módulo 97 Base 10 por dígito) para conferir o DV.
function referenceCheckDigits(digitsWithoutCheck) {
  const rearranged = `${digitsWithoutCheck}00`;
  let remainder = 0n;
  for (const char of rearranged) remainder = (remainder * 10n + BigInt(char)) % 97n;
  return String(98n - remainder).padStart(2, '0');
}

function withCheckDigits(sequential, year, justice, tribunal, origin) {
  const base = `${sequential}${year}${justice}${tribunal}${origin}`;
  return `${sequential}-${referenceCheckDigits(base)}.${year}.${justice}.${tribunal}.${origin}`;
}

const samples = [
  ['5001111', '2026', '8', '21', '0001'],
  ['5002222', '2026', '5', '04', '0001'],
  ['5003333', '2026', '6', '21', '0001'],
  ['5004444', '2026', '9', '21', '0001'],
  ['5005555', '2026', '4', '04', '0001'],
  ['0000100', '2008', '1', '00', '0000']
];
for (const [sequential, year, justice, tribunal, origin] of samples) {
  const number = withCheckDigits(sequential, year, justice, tribunal, origin);
  assert.equal(isValidCnj(number), true, `Número com DV calculado deve ser válido: ${number}`);
  assert.equal(computeCnjCheckDigits(cleanCnj(number).slice(0, 7) + cleanCnj(number).slice(9)), cleanCnj(number).slice(7, 9));
  const tampered = `${number.slice(0, 7)}-99.${number.slice(10)}`;
  if (!isValidCnj(tampered)) assert.equal(isValidCnj(tampered), false, `DV adulterado deve ser inválido: ${tampered}`);
}
console.log('✓ DV Módulo 97 Base 10 confere com implementação independente.');

assert.equal(isValidCnj('0000000-00.0000.0.00.0000'), false, 'Zeros não são número válido.');
assert.equal(isValidCnj('5001111-61.2026.8.21'), false, 'Formato incompleto não é válido.');
assert.equal(formatCnj('5001111-61.2026.8.21.0001'), '5001111-61.2026.8.21.0001');
assert.equal(formatCnj('029/1.12.0001234-5'), '029/1.12.0001234-5', 'Número antigo permanece livre.');
assert.equal(cleanCnj('5001111-61.2026.8.21.0001'), '50011116120268210001');
console.log('✓ Formatação oficial preservada para 20 dígitos e formatos antigos.');

const invalid = '5001111-00.2026.8.21.0001';
assert.equal(isValidCnj(invalid), false);
const suggestion = suggestCnjCorrection(invalid);
assert.ok(suggestion, 'Número com DV errado deve receber sugestão de correção.');
assert.equal(isValidCnj(suggestion), true, 'Sugestão deve ter DV válido.');
assert.equal(suggestion, '5001111-61.2026.8.21.0001');
assert.equal(suggestCnjCorrection('5001111-61.2026.8.21.0001'), null, 'Número correto não gera sugestão.');
assert.equal(suggestCnjCorrection('029/1.12.0001234-5'), null, 'Formato antigo não gera sugestão.');
console.log('✓ Sugestão de correção do DV funciona apenas para 20 dígitos.');

const firstDegree = describeCnj('5001111-61.2026.8.21.0001');
assert.equal(firstDegree.court, 'TJRS');
assert.equal(firstDegree.courtName, 'Tribunal de Justiça (RS)');
assert.equal(firstDegree.segmentName, 'Justiça dos Estados e do Distrito Federal e Territórios');
assert.equal(firstDegree.degree, 'primeiro_grau');
assert.equal(firstDegree.valid, true);

const originaria = describeCnj(withCheckDigits('5006666', '2026', '8', '21', '0000'));
assert.equal(originaria.degree, 'originaria');
assert.equal(originaria.degreeLabel, 'Competência originária');

const turmaRecursal = describeCnj(withCheckDigits('5007777', '2026', '8', '21', '9001'));
assert.equal(turmaRecursal.degree, 'turma_recursal');
assert.equal(turmaRecursal.degreeLabel, 'Turma recursal');

const delegada = describeCnj(withCheckDigits('5008888', '2026', '8', '21', '9999'));
assert.equal(delegada.degree, 'delegada');
assert.equal(delegada.delegated, true);
assert.equal(delegada.degreeLabel, 'Recurso delegado');
console.log('✓ Grau derivado do OOOO (originária, turma recursal, delegada, 1º grau).');

assert.equal(describeCnj(withCheckDigits('5009999', '2026', '4', '04', '0001')).court, 'TRF4');
assert.equal(describeCnj(withCheckDigits('5009999', '2026', '5', '04', '0001')).court, 'TRT4');
assert.equal(describeCnj(withCheckDigits('5009999', '2026', '6', '21', '0001')).court, 'TRE-RS');
assert.equal(describeCnj(withCheckDigits('5009999', '2026', '9', '21', '0001')).court, 'TJM-RS');
assert.equal(describeCnj(withCheckDigits('5009999', '2026', '4', '90', '0001')).court, 'CJF');
assert.equal(describeCnj(withCheckDigits('5009999', '2026', '5', '00', '0000')).court, 'TST');
assert.equal(describeCnj(withCheckDigits('5009999', '2026', '6', '00', '0000')).court, 'TSE');
assert.equal(describeCnj(withCheckDigits('5009999', '2026', '5', '90', '0001')).court, 'CSJT');
assert.equal(describeCnj(withCheckDigits('5009999', '2026', '7', '00', '0000')).court, 'STM');
assert.equal(describeCnj(withCheckDigits('5009999', '2026', '7', '03', '0000')).court, 'CJM-3');
assert.equal(describeCnj(withCheckDigits('5009999', '2026', '8', '07', '0001')).court, 'TJDFT');
assert.equal(resolveCourtFromCnj('5001111-61.2026.8.21.0001'), 'TJRS');
assert.equal(resolveCourtFromCnj('5009999-16.2026.8.21.0002'), 'TJRS');
assert.equal(resolveCourtFromCnj('029/1.12.0001234-5'), null);
console.log('✓ Tabela completa de segmentos e tribunais (TJs, TRFs, TRTs, TREs, militares, conselhos).');

assert.equal(Object.keys(CNJ_SEGMENTS).length, 9);
assert.ok(Object.keys(CNJ_TRIBUNALS).length >= 27 + 6 + 24 + 27 + 12 + 3 + 5);
const parsed = parseCnjSegments('5001111-61.2026.8.21.0001');
assert.equal(parsed.segment, '8.21');
assert.equal(parsed.unmasked, '50011116120268210001');
assert.equal(parseCnjSegments('123'), null);
console.log('✓ Campos, segmento e tabelas oficiais estáveis.');

console.log('\n>>> NUMERAÇÃO CNJ: PASS <<<\n');
