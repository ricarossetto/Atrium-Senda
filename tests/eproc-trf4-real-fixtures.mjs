import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseEprocPanelProcesses } from '../lib/judicial/eproc/parsers/panel-parser.mjs';
import { parseEprocCaseDetails, parseEprocParties } from '../lib/judicial/eproc/parsers/case-parser.mjs';
import { parseEprocMovements } from '../lib/judicial/eproc/parsers/movement-parser.mjs';
import { parseEprocDocuments } from '../lib/judicial/eproc/parsers/document-parser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'authenticated', 'trf4');

async function runTrf4RealFixturesTest() {
  console.log('=== TESTE FOCAL: TRF4 2G REAL AUTHENTICATED FIXTURES ===\n');

  // 1. Authenticated Panel
  const panelHtml = await readFile(path.join(FIXTURES_DIR, 'panel.html'), 'utf8');
  assert.ok(panelHtml.includes('Painel do Advogado'), 'Painel do Advogado deve estar presente');
  assert.ok(panelHtml.includes('Citações/Intimações'), 'Card de citações/intimações deve estar presente');
  console.log('✓ 1. Painel autenticado TRF4 validado com sucesso.');

  // 2. Discover Cases from Relatório
  const relatorioHtml = await readFile(path.join(FIXTURES_DIR, 'relatorio.html'), 'utf8');
  const cases = parseEprocPanelProcesses(relatorioHtml);
  assert.equal(cases.length, 12, `Deve encontrar 12 processos no TRF4 2G (encontrados: ${cases.length})`);

  const c0 = cases[0];
  assert.match(c0.number, /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/, 'CNJ formatado');
  assert.equal(c0.cnj, c0.number.replace(/\D/g, ''), 'CNJ desformatado');
  assert.equal(c0.actionClass, 'Agravo de Instrumento', 'Classe recursal no 2G');
  assert.equal(c0.plaintiff, 'PARTE AUTORA PILOTO 2G', 'Polo Ativo');
  assert.equal(c0.defendant, 'INSTITUTO NACIONAL DO SEGURO SOCIAL - INSS', 'Polo Passivo');
  assert.equal(c0.courtLocation, 'Tribunal Regional Federal 4ª Região', 'Localidade do Tribunal');
  assert.equal(c0.subject, 'Aposentadoria', 'Assunto recursal');
  assert.equal(c0.lastEvent, 'Conclusos para decisão de admissibilidade', 'Último evento processual');
  assert.equal(c0.lastEventDate, '15/10/2025 13:05:38', 'Data do último evento');
  assert.equal(c0.filedDate, '22/04/2024 20:44:26', 'Data de autuação no 2G');
  assert.equal(c0.caseValue, 'R$ 0,00', 'Valor da causa');
  assert.ok(c0.selectHref?.includes('processo_selecionar'), 'Link de seleção do processo');
  console.log(`✓ 2. Descoberta de processos TRF4 2G validada (${cases.length} processos com metadados oficiais completos).`);

  // 3. Process Details & Cover
  const procHtml = await readFile(path.join(FIXTURES_DIR, 'process.html'), 'utf8');
  const details = parseEprocCaseDetails(procHtml);
  assert.ok(details, 'Detalhes do processo devem ser extraídos');
  assert.match(details.number, /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/, 'Número CNJ');
  assert.equal(details.actionClass, 'Agravo de Instrumento', 'Classe');
  assert.equal(details.competence, 'Administrativo (Turma)', 'Competência recursal');
  assert.equal(details.distributionDate, '22/04/2024 20:44:26', 'Data de autuação');
  assert.equal(details.judicialUnit, 'Vice-Presidência', 'Unidade Judiciária');
  assert.equal(details.judge, 'VIVIAN JOSETE PANTALEÃO CAMINHA', 'Magistrada relatora');
  assert.equal(details.status, 'MOVIMENTO', 'Situação');
  console.log('✓ 3. Capa e metadados estruturados TRF4 2G validados.');

  // 4. Parties & Representatives
  const parties = parseEprocParties(procHtml);
  assert.ok(parties.length >= 2, 'Deve conter partes');
  const activeParty = parties.find(p => p.pole === 'ACTIVE');
  assert.ok(activeParty, 'Deve conter parte ativa');
  assert.equal(activeParty.name, 'PARTE AUTORA PILOTO 2G');

  const attorney = parties.find(p => p.pole === 'ATTORNEY' && p.oab === 'RS999999');
  assert.ok(attorney, 'Deve conter advogado constituído com OAB no TRF4');
  console.log(`✓ 4. Partes e advogados TRF4 validados (${parties.length} registros com polos e OABs).`);

  // 5. Movements / Timeline
  const movements = parseEprocMovements(procHtml);
  assert.equal(movements.length, 51, 'Deve conter 51 movimentos extraídos');
  assert.equal(movements[0].sequence, 51, 'Primeiro movimento deve ser o mais recente (seq 51)');
  assert.equal(movements[0].rawDate, '15/10/2025 13:05:38');
  assert.ok(movements[0].occurredAt.startsWith('2025-10-15'), 'Data ISO normalizada');
  assert.ok(movements[0].description.includes('Conclusos para decisão'), 'Descrição do evento');
  assert.ok(movements[0].user.includes('SISTEMA DE PROCESSO ELETRÔNICO'), 'Usuário do evento');
  console.log(`✓ 5. Linha do tempo de movimentos TRF4 validada (${movements.length} eventos sequenciados).`);

  // 6. Documents Metadata
  const docs = parseEprocDocuments(procHtml);
  assert.ok(docs.length >= 1, 'Deve conter ao menos 1 documento');
  const doc0 = docs[0];
  assert.equal(doc0.title, 'RECESPEC1', 'Título da peça');
  assert.ok(doc0.accessUrl?.includes('acao=acessar_documento'), 'URL de acesso seguro sem ciência');
  console.log(`✓ 6. Metadados de documentos TRF4 validados (${docs.length} documentos identificados).`);

  console.log('\n>>> TRF4 2G REAL AUTHENTICATED FIXTURES TEST PASSED! <<<\n');
}

runTrf4RealFixturesTest().catch(err => {
  console.error('Falha no teste TRF4:', err);
  process.exit(1);
});
