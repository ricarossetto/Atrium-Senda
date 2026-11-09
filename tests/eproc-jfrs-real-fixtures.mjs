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
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'authenticated', 'jfrs');

async function runJfrsRealFixturesTest() {
  console.log('=== TESTE FOCAL: JFRS 1G REAL AUTHENTICATED FIXTURES ===\n');

  // 1. Authenticated Panel
  const panelHtml = await readFile(path.join(FIXTURES_DIR, 'panel.html'), 'utf8');
  assert.ok(panelHtml.includes('Painel do Advogado'), 'Painel do Advogado deve estar presente');
  assert.ok(panelHtml.includes('Citações/Intimações'), 'Card de citações/intimações deve estar presente');
  assert.ok(panelHtml.includes('Área de trabalho'), 'Card de área de trabalho deve estar presente');
  console.log('✓ 1. Painel autenticado JFRS validado com sucesso.');

  // 2. Discover Cases from Relatório
  const relatorioHtml = await readFile(path.join(FIXTURES_DIR, 'relatorio.html'), 'utf8');
  const cases = parseEprocPanelProcesses(relatorioHtml);
  assert.ok(cases.length >= 20, `Deve encontrar processos na relação (encontrados: ${cases.length})`);
  
  const c0 = cases[0];
  assert.match(c0.number, /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/, 'CNJ formatado');
  assert.equal(c0.cnj, c0.number.replace(/\D/g, ''), 'CNJ desformatado');
  assert.equal(c0.actionClass, 'PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL', 'Classe da ação');
  assert.equal(c0.plaintiff, 'PARTE AUTORA PILOTO', 'Polo Ativo');
  assert.equal(c0.defendant, 'EMPRESA PUBLICA REU', 'Polo Passivo');
  assert.equal(c0.courtLocation, 'Bento Gonçalves', 'Comarca/Localidade');
  assert.equal(c0.subject, 'Fraude Bancária', 'Assunto');
  assert.equal(c0.lastEvent, 'Publicado no DJEN', 'Último evento');
  assert.equal(c0.lastEventDate, '14/09/2026 04:36:15', 'Data do último evento');
  assert.equal(c0.filedDate, '12/08/2026 11:03:58', 'Data de autuação');
  assert.equal(c0.caseValue, 'R$ 60.000,00', 'Valor da causa');
  assert.ok(c0.selectHref?.includes('processo_selecionar'), 'Link de seleção do processo');
  console.log(`✓ 2. Descoberta de processos JFRS validada (${cases.length} processos com metadados oficiais completos).`);

  // 3. Process Details & Cover
  const procHtml = await readFile(path.join(FIXTURES_DIR, 'process.html'), 'utf8');
  const details = parseEprocCaseDetails(procHtml);
  assert.ok(details, 'Detalhes do processo devem ser extraídos');
  assert.match(details.number, /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/, 'Número CNJ');
  assert.equal(details.actionClass, 'PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL', 'Classe');
  assert.equal(details.competence, 'JEF Cível', 'Competência');
  assert.equal(details.distributionDate, '12/08/2026 11:03:58', 'Data de autuação');
  assert.equal(details.judicialUnit, 'Juízo Substituto da 1ª VF de Bento Gonçalves', 'Unidade Judiciária');
  assert.equal(details.judge, 'ANDRE AUGUSTO GIORDANI', 'Magistrado');
  assert.equal(details.status, 'MOVIMENTO', 'Situação');
  console.log('✓ 3. Capa e metadados estruturados JFRS validados.');

  // 4. Parties & Representatives
  const parties = parseEprocParties(procHtml);
  assert.ok(parties.length >= 2, 'Deve conter partes');
  const activeParty = parties.find(p => p.pole === 'ACTIVE');
  assert.ok(activeParty, 'Deve conter parte ativa');
  assert.equal(activeParty.name, 'PARTE AUTORA PILOTO');
  assert.equal(activeParty.documentNumber, '000.000.000-00');

  const attorney = parties.find(p => p.pole === 'ATTORNEY' && p.oab === 'RS999999');
  assert.ok(attorney, 'Deve conter advogado constituído com OAB');
  console.log(`✓ 4. Partes e advogados JFRS validados (${parties.length} registros com polos e OABs).`);

  // 5. Movements / Timeline
  const movements = parseEprocMovements(procHtml);
  assert.equal(movements.length, 18, 'Deve conter 18 movimentos extraídos');
  assert.equal(movements[0].sequence, 18, 'Primeiro movimento deve ser o mais recente (seq 18)');
  assert.equal(movements[0].rawDate, '14/09/2026 04:36:15');
  assert.ok(movements[0].occurredAt.startsWith('2026-09-14'), 'Data ISO normalizada');
  assert.ok(movements[0].description.includes('Publicado no DJEN'), 'Descrição do evento');
  assert.ok(movements[0].user.includes('SISTEMA DE DIÁRIO ELETRÔNICO'), 'Usuário do evento');
  console.log(`✓ 5. Linha do tempo de movimentos JFRS validada (${movements.length} eventos sequenciados).`);

  // 6. Documents Metadata
  const docs = parseEprocDocuments(procHtml);
  assert.ok(docs.length >= 1, 'Deve conter ao menos 1 documento');
  const doc0 = docs[0];
  assert.equal(doc0.title, 'ATOORD1', 'Título da peça');
  assert.ok(doc0.accessUrl?.includes('acao=acessar_documento'), 'URL de acesso seguro sem ciência');
  console.log(`✓ 6. Metadados de documentos JFRS validados (${docs.length} documentos identificados).`);

  console.log('\n>>> JFRS 1G REAL AUTHENTICATED FIXTURES TEST PASSED! <<<\n');
}

runJfrsRealFixturesTest().catch(err => {
  console.error('Falha no teste JFRS:', err);
  process.exit(1);
});
