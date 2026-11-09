import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseEprocPanelProcesses } from '../lib/judicial/eproc/parsers/panel-parser.mjs';
import { parseEprocCaseDetails, parseEprocParties } from '../lib/judicial/eproc/parsers/case-parser.mjs';
import { parseEprocMovements } from '../lib/judicial/eproc/parsers/movement-parser.mjs';
import { parseEprocDocuments } from '../lib/judicial/eproc/parsers/document-parser.mjs';
import { parseEprocDashboardActions } from '../lib/judicial/eproc/parsers/dashboard-parser.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'authenticated', 'jfsc');

async function runJfscFixturesTest() {
  console.log('=== TESTE FOCAL: JFSC 1G AUTHENTICATED FIXTURES (WAVE E) ===\n');

  // 1. Authenticated Panel & Action Map
  const panelHtml = await readFile(path.join(FIXTURES_DIR, 'panel.html'), 'utf8');
  assert.ok(panelHtml.includes('Painel do Advogado'), 'Painel do Advogado JFSC deve estar presente');
  assert.ok(panelHtml.includes('Citações/Intimações'), 'Card de citações/intimações JFSC deve estar presente');
  
  const dashboard = parseEprocDashboardActions(panelHtml, { portalId: 'jfsc-eproc-1g' });
  assert.equal(dashboard.portalId, 'jfsc-eproc-1g');
  assert.equal(dashboard.actions.openDeadlines?.count, 8, 'Deve extrair contagem de prazos abertos');
  assert.equal(dashboard.actions.urgentDeadlines?.count, 1, 'Deve extrair contagem de prazos urgentes');
  console.log('✓ 1. Painel autenticado e mapa de ações JFSC validados com sucesso.');

  // 2. Discover Cases from Relatório
  const relatorioHtml = await readFile(path.join(FIXTURES_DIR, 'relatorio.html'), 'utf8');
  const cases = parseEprocPanelProcesses(relatorioHtml);
  assert.equal(cases.length, 3, `Deve extrair 3 processos do relatório JFSC (extraídos: ${cases.length})`);

  const c0 = cases[0];
  assert.equal(c0.number, '5001234-11.2024.4.04.7200', 'Número CNJ JFSC (origem 7200 - Florianópolis)');
  assert.equal(c0.cnj, '50012341120244047200');
  assert.ok(c0.actionClass.includes('PROCEDIMENTO COMUM CÍVEL'));
  assert.equal(c0.plaintiff, 'PARTE AUTORA PILOTO SC');
  assert.equal(c0.defendant, 'UNIÃO - ADVOCACIA GERAL DA UNIÃO');
  assert.equal(c0.courtLocation, '1ª Vara Federal de Florianópolis');
  assert.equal(c0.lastEvent, 'Juntada de Laudo Pericial');
  assert.equal(c0.caseValue, 'R$ 75.000,00');
  assert.ok(c0.selectHref?.includes('processo_selecionar'));
  console.log(`✓ 2. Descoberta de processos JFSC validada (${cases.length} processos de Santa Catarina extraídos).`);

  // 3. Process Details, Cover & Access Key
  const procHtml = await readFile(path.join(FIXTURES_DIR, 'process.html'), 'utf8');
  const details = parseEprocCaseDetails(procHtml);
  assert.ok(details, 'Detalhes da capa do processo JFSC devem ser extraídos');
  assert.equal(details.actionClass, 'PROCEDIMENTO COMUM CÍVEL');
  assert.equal(details.competence, 'Cível / Saúde Pública');
  assert.equal(details.distributionDate, '10/01/2024 14:22:10');
  assert.equal(details.judicialUnit, '1ª Vara Federal de Florianópolis');
  assert.equal(details.judge, 'JUIZ FEDERAL TITULAR SC');
  assert.equal(details.status, 'MOVIMENTO');
  assert.equal(details.accessKey, '887766554433', 'Chave de acesso do processo JFSC deve ser extraída com sucesso');
  console.log('✓ 3. Capa e chave de acesso JFSC validadas.');

  // 4. Parties & Representatives
  const parties = parseEprocParties(procHtml);
  assert.ok(parties.length >= 2, 'Deve conter partes');
  const activeParty = parties.find(p => p.pole === 'ACTIVE');
  assert.ok(activeParty, 'Polo ativo deve estar presente');
  assert.equal(activeParty.name, 'PARTE AUTORA PILOTO SC');
  assert.equal(activeParty.documentNumber, '000.000.000-00');

  const attorney = parties.find(p => p.pole === 'ATTORNEY' && p.oab === 'SC999999');
  assert.ok(attorney, 'Advogado com OAB/SC deve ser mapeado');
  console.log('✓ 4. Partes e advogados com OAB/SC mapeados.');

  // 5. Timeline of Events
  const movements = parseEprocMovements(procHtml);
  assert.equal(movements.length, 3, 'Deve conter 3 eventos sequenciados');
  assert.equal(movements[0].sequence, 3);
  assert.equal(movements[0].rawDate, '14/09/2026 09:15:30');
  assert.ok(movements[0].description.includes('Juntada de Laudo'));
  console.log('✓ 5. Linha do tempo de movimentações JFSC validada.');

  // 6. Documents Metadata
  const docs = parseEprocDocuments(procHtml);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].title, 'LAUDOPERICIAL1');
  assert.ok(docs[0].accessUrl?.includes('acao=acessar_documento'));
  console.log('✓ 6. Metadados de documentos JFSC validados.');

  console.log('\n>>> JFSC 1G FIXTURES TEST PASSED! <<<\n');
}

runJfscFixturesTest().catch(err => {
  console.error('Falha no teste JFSC:', err);
  process.exit(1);
});
