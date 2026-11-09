import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEprocProcessReportXls } from '../lib/judicial/eproc/importers/spreadsheet-importer.mjs';
import { computeEprocProcessDelta } from '../lib/judicial/eproc/sync/delta-sync.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'wave_d', 'RelatorioProcessos_sanitized.xls');

async function runReportDiffTest() {
  console.log('=== TESTE FOCAL: EPROC REPORT DIFF & DELTA SYNC ENGINE (WAVE D) ===\n');

  const repBuf = await readFile(FIXTURE_PATH);
  const incoming = parseEprocProcessReportXls(repBuf, { portalId: 'tjrs-eproc-1g' });
  assert.equal(incoming.length, 109, 'Deve carregar 109 processos da planilha');

  // Simulated Persisted State in Atrium
  // - 50 processes are identical (UNCHANGED)
  // - 5 processes have new events (UPDATED)
  // - Remaining (54) are NEW
  // - 2 processes in DB were archived/removed (REMOVED_OR_INACTIVE)
  const persisted = [];
  for (let i = 0; i < 50; i++) {
    persisted.push({ ...incoming[i], id: `db-proc-${i}` });
  }

  // 5 Updated processes
  persisted.push({ ...incoming[50], id: 'db-proc-50', lastEvent: 'Evento anterior arquivado', lastEventAt: '2025-01-01T10:00:00.000Z' });
  persisted.push({ ...incoming[51], id: 'db-proc-51', caseValue: 'R$ 1.000,00' });
  persisted.push({ ...incoming[52], id: 'db-proc-52', judicialUnit: 'Vara Anterior' });
  persisted.push({ ...incoming[53], id: 'db-proc-53', actionClass: 'Classe Anterior' });
  persisted.push({ ...incoming[54], id: 'db-proc-54', lastEventAt: '2025-12-31T23:59:59.000Z' });

  // 2 Inactive processes in DB
  persisted.push({ portalId: 'tjrs-eproc-1g', cnj: '99900010020268210016', number: '9990001-00.2026.8.21.0016', lastEvent: 'Baixa Definitiva' });
  persisted.push({ portalId: 'tjrs-eproc-1g', cnj: '99900020020268210016', number: '9990002-00.2026.8.21.0016', lastEvent: 'Arquivado' });

  const delta = computeEprocProcessDelta(incoming, persisted, { portalId: 'tjrs-eproc-1g' });

  // Assertions
  assert.equal(delta.totalIncoming, 109);
  assert.equal(delta.unchangedCount, 50, '50 processos devem ser classificados como UNCHANGED');
  assert.equal(delta.updatedCount, 5, '5 processos devem ser classificados como UPDATED');
  assert.equal(delta.newCount, 54, '54 processos devem ser classificados como NEW');
  assert.equal(delta.inactiveCount, 2, '2 processos devem ser classificados como REMOVED_OR_INACTIVE');

  // Verify that enrichment candidates contain ONLY new and updated
  assert.equal(delta.enrichmentCandidates.length, 59, 'Apenas NEW e UPDATED entram no enriquecimento');
  assert.ok(delta.enrichmentCandidates.every(p => p.deltaType === 'NEW' || p.deltaType === 'UPDATED'));
  console.log('✓ 1. Classificação diferencial (UNCHANGED, NEW, UPDATED, REMOVED) validada.');

  // Verify changeReason detail on updated processes
  const up0 = delta.updatedProcesses[0];
  assert.ok(up0.changeReason.includes('EVENT:'), 'Deve registrar alteração de evento');
  const up1 = delta.updatedProcesses[1];
  assert.ok(up1.changeReason.includes('VALUE:'), 'Deve registrar alteração de valor da causa');
  console.log('✓ 2. Diagnóstico de alterações (changeReason) detalhado com exatidão.');

  // 3. REMOVED_OR_INACTIVE SAFETY CHECK (P1)
  // Verify that absence in report is strictly an audit/reconciliation signal, NOT an auto-delete
  const in0 = delta.inactiveOrRemoved[0];
  assert.equal(in0.deltaType, 'REMOVED_OR_INACTIVE');
  assert.equal(in0.reconciliationStatus, 'ABSENT_FROM_ACTIVE_REPORT_SIGNAL');
  assert.equal(in0.actionRequired, 'AUDIT_ONLY_NO_AUTO_DELETE');
  console.log('✓ 3. Ausência no relatório comprovada como sinal não-destrutivo (sem exclusão automática).');

  console.log('\n>>> EPROC REPORT DIFF TEST PASSED! <<<\n');
}

runReportDiffTest().catch(err => {
  console.error('Falha no teste de diff:', err);
  process.exit(1);
});
