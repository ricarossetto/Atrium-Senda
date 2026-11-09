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
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'authenticated', 'jfpr');

async function runJfprFixturesTest() {
  console.log('=== TESTE FOCAL: JFPR 1G AUTHENTICATED FIXTURES (WAVE E) ===\n');

  // 1. Authenticated Panel & Action Map
  const panelHtml = await readFile(path.join(FIXTURES_DIR, 'panel.html'), 'utf8');
  assert.ok(panelHtml.includes('Painel do Advogado'), 'Painel do Advogado JFPR deve estar presente');
  assert.ok(panelHtml.includes('Citações/Intimações'), 'Card de citações/intimações JFPR deve estar presente');
  
  const dashboard = parseEprocDashboardActions(panelHtml, { portalId: 'jfpr-eproc-1g' });
  assert.equal(dashboard.portalId, 'jfpr-eproc-1g');
  assert.equal(dashboard.actions.openDeadlines?.count, 14, 'Deve extrair contagem de prazos abertos');
  assert.equal(dashboard.actions.urgentDeadlines?.count, 2, 'Deve extrair contagem de prazos urgentes');
  assert.equal(dashboard.actions.futureHearings?.count, 3, 'Deve extrair contagem de audiências');
  console.log('✓ 1. Painel autenticado e mapa de ações JFPR validados com sucesso.');

  // 2. Discover Cases from Relatório
  const relatorioHtml = await readFile(path.join(FIXTURES_DIR, 'relatorio.html'), 'utf8');
  const cases = parseEprocPanelProcesses(relatorioHtml);
  assert.equal(cases.length, 3, `Deve extrair 3 processos do relatório JFPR (extraídos: ${cases.length})`);

  const c0 = cases[0];
  assert.equal(c0.number, '5005678-22.2024.4.04.7000', 'Número CNJ JFPR (origem 7000 - Curitiba)');
  assert.equal(c0.cnj, '50056782220244047000');
  assert.ok(c0.actionClass.includes('PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL'));
  assert.equal(c0.plaintiff, 'PARTE AUTORA PILOTO PR');
  assert.equal(c0.defendant, 'INSTITUTO NACIONAL DO SEGURO SOCIAL - INSS');
  assert.equal(c0.courtLocation, '2ª Vara Federal de Curitiba');
  assert.equal(c0.lastEvent, 'Sentença com Resolução do Mérito');
  assert.equal(c0.caseValue, 'R$ 42.000,00');
  assert.ok(c0.selectHref?.includes('processo_selecionar'));
  console.log(`✓ 2. Descoberta de processos JFPR validada (${cases.length} processos do Paraná extraídos).`);

  // 3. Process Details, Cover & Access Key
  const procHtml = await readFile(path.join(FIXTURES_DIR, 'process.html'), 'utf8');
  const details = parseEprocCaseDetails(procHtml);
  assert.ok(details, 'Detalhes da capa do processo JFPR devem ser extraídos');
  assert.equal(details.actionClass, 'PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL');
  assert.equal(details.competence, 'JEF Previdenciário');
  assert.equal(details.distributionDate, '02/02/2024 10:15:20');
  assert.equal(details.judicialUnit, '2ª Vara Federal de Curitiba');
  assert.equal(details.judge, 'JUIZ FEDERAL TITULAR PR');
  assert.equal(details.status, 'MOVIMENTO');
  assert.equal(details.accessKey, '776655443322', 'Chave de acesso do processo JFPR deve ser extraída com sucesso');
  console.log('✓ 3. Capa e chave de acesso JFPR validadas.');

  // 4. Parties & Representatives
  const parties = parseEprocParties(procHtml);
  assert.ok(parties.length >= 2, 'Deve conter partes');
  const activeParty = parties.find(p => p.pole === 'ACTIVE');
  assert.ok(activeParty, 'Polo ativo deve estar presente');
  assert.equal(activeParty.name, 'PARTE AUTORA PILOTO PR');
  assert.equal(activeParty.documentNumber, '000.000.000-00');

  const attorney = parties.find(p => p.pole === 'ATTORNEY' && p.oab === 'PR999999');
  assert.ok(attorney, 'Advogado com OAB/PR deve ser mapeado');
  console.log('✓ 4. Partes e advogados com OAB/PR mapeados.');

  // 5. Timeline of Events
  const movements = parseEprocMovements(procHtml);
  assert.equal(movements.length, 4, 'Deve conter 4 eventos sequenciados');
  assert.equal(movements[0].sequence, 4);
  assert.equal(movements[0].rawDate, '14/09/2026 14:00:15');
  assert.ok(movements[0].description.includes('Sentença'));
  console.log('✓ 5. Linha do tempo de movimentações JFPR validada.');

  // 6. Documents Metadata
  const docs = parseEprocDocuments(procHtml);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].title, 'SENT1');
  assert.ok(docs[0].accessUrl?.includes('acao=acessar_documento'));
  console.log('✓ 6. Metadados de documentos JFPR validados.');

  console.log('\n>>> JFPR 1G FIXTURES TEST PASSED! <<<\n');
}

runJfprFixturesTest().catch(err => {
  console.error('Falha no teste JFPR:', err);
  process.exit(1);
});
