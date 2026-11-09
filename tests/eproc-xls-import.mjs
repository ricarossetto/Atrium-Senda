import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseEprocProcessReportXls,
  parseEprocDeadlinesXls,
  isValidEprocXlsBuffer,
  relateDeadlinesSemantic
} from '../lib/judicial/eproc/importers/spreadsheet-importer.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'wave_d');

async function runXlsImportTest() {
  console.log('=== TESTE FOCAL: EPROC SPREADSHEET (XLS / BIFF8) IMPORTER (WAVE D) ===\n');

  // 1. Signature & Buffer Validation
  const repBuf = await readFile(path.join(FIXTURES_DIR, 'RelatorioProcessos_sanitized.xls'));
  assert.equal(isValidEprocXlsBuffer(repBuf), true, 'Buffer deve ser validado como OLE/BIFF8');
  assert.equal(isValidEprocXlsBuffer(Buffer.from('invalid textual xml')), false, 'Buffer inválido deve ser rejeitado');
  console.log('✓ 1. Validação de assinatura binária OLE/BIFF8 confirmada.');

  // 2. Relatório de Processos (Primary Inventory)
  const processes = parseEprocProcessReportXls(repBuf, { portalId: 'tjrs-eproc-1g' });
  assert.equal(processes.length, 109, `Deve extrair 109 processos da planilha integral (extraídos: ${processes.length})`);

  const p0 = processes[0];
  assert.equal(p0.cnj, '50000010020268210016', 'CNJ limpo de 20 dígitos');
  assert.equal(p0.number, '5000001-00.2026.8.21.0016', 'CNJ formatado padrão');
  assert.equal(p0.judicialUnit, 'IJI1JE1J', 'Vara/Unidade judiciária extraída');
  assert.equal(p0.actionClass, 'PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL', 'Classe processual');
  assert.equal(p0.plaintiff, 'PARTE DEMANDANTE SINTETICA 0001', 'Autor principal');
  assert.equal(p0.defendant, 'PARTE RE SINTETICA 0001', 'Réu principal');
  assert.equal(p0.courtLocation, 'Ijuí', 'Comarca/Localidade judicial');
  assert.equal(p0.subject, 'Indenização por Dano Material', 'Assunto');
  assert.equal(p0.lastEvent, 'Juntada de Carta pelo Correio - devolvida sem cumprimento', 'Último evento');
  assert.equal(p0.rawLastEventDate, '14/09/2026 08:56:03', 'Data bruta do evento');
  assert.equal(p0.lastEventAt, '2026-09-14T08:56:03.000Z', 'Data ISO do evento');
  assert.equal(p0.rawDistributionDate, '10/08/2026 17:49:05', 'Data bruta de distribuição');
  assert.equal(p0.distributionAt, '2026-08-10T17:49:05.000Z', 'Data ISO de distribuição');
  assert.equal(p0.caseValue, 'R$ 24.602,00', 'Valor da causa formatado');
  assert.ok(p0.publicUrl.includes('processo_seleciona_publica'), 'Link público extraído do hyperlink de célula');
  assert.equal(p0.provenance, 'EPROC_REPORT_XLS', 'Proveniência oficial');
  console.log('✓ 2. Relatório de processos (109 registros) ingerido com extração de metadados e hyperlinks.');

  // 3. Processos com Prazo em Aberto (Official Deadlines)
  const deadBuf = await readFile(path.join(FIXTURES_DIR, 'citacaoIntimacao_sanitized.xls'));
  const deadlines = parseEprocDeadlinesXls(deadBuf, { portalId: 'tjrs-eproc-1g' });
  assert.equal(deadlines.length, 16, `Deve extrair 16 prazos da planilha (extraídos: ${deadlines.length})`);

  const d0 = deadlines[0];
  assert.equal(d0.cnj, '50000010020268210016', 'CNJ do prazo');
  assert.equal(d0.judicialUnit, 'IJI2CR1J', 'Órgão judicial do prazo');
  assert.equal(d0.actionClass, 'TERMO CIRCUNSTANCIADO', 'Classe');
  assert.equal(d0.subject, 'Difamação (art. 139)', 'Assunto');
  assert.equal(d0.durationDays, 10, 'Prazo de 10 dias extraído');
  assert.equal(d0.rawStartDate, '04/09/2026 00:00:00', 'Início do prazo');
  assert.equal(d0.startAt, '2026-09-04T00:00:00.000Z');
  assert.equal(d0.rawFinalDate, '14/09/2026 23:59:59', 'Final do prazo');
  assert.equal(d0.finalAt, '2026-09-14T23:59:59.000Z');
  assert.equal(d0.provenance, 'EPROC_PANEL', 'Proveniência explícita EPROC_PANEL sem fundir silenciosamente com DJEN');
  assert.ok(d0.fingerprint.startsWith('tjrs-eproc-1g:50000010020268210016:'), 'Fingerprint idempotente robusto');
  console.log('✓ 3. Prazos em aberto ingeridos com proveniência e fingerprint composto.');

  // 4. Non-Destructive Provenance Linking (EPROC_PANEL <-> DJEN)
  const syntheticDjen = {
    provenance: 'DJEN',
    fingerprint: 'djen:50000010020268210016:comm_9988:2026-09-04',
    sourceRecordId: 'comm_9988'
  };
  const linked = relateDeadlinesSemantic(d0, syntheticDjen);
  assert.equal(linked.provenance, 'EPROC_PANEL', 'Proveniência primária deve permanecer inalterada');
  assert.equal(linked.possiblyRelatedTo.length, 1);
  assert.equal(linked.possiblyRelatedTo[0].provenance, 'DJEN');
  assert.equal(linked.possiblyRelatedTo[0].sourceRecordId, 'comm_9988');
  console.log('✓ 4. Vinculação semântica não-destrutiva (EPROC_PANEL <-> DJEN) validada.');

  console.log('\n>>> EPROC SPREADSHEET IMPORTER TEST PASSED! <<<\n');
}

runXlsImportTest().catch(err => {
  console.error('Falha no teste de importação XLS:', err);
  process.exit(1);
});
