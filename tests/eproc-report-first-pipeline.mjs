import assert from 'node:assert/strict';
import { readFile, readdir, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

import {
  EprocReportSnapshotStore,
  runEprocProcessReportInventory,
  mergeEprocReportInventory,
  buildEprocReportBaseline,
  selectEprocReportEnrichmentTargets,
  normalizeReportRecord,
  reportRecordFingerprint,
  EPROC_REPORT_STATUS,
  digitsOnly
} from '../lib/judicial/eproc/sync/report-sync.mjs';
import { computeEprocProcessDelta } from '../lib/judicial/eproc/sync/delta-sync.mjs';
import { parseEprocProcessReportXls, isValidEprocXlsBuffer } from '../lib/judicial/eproc/importers/spreadsheet-importer.mjs';
import { parseEprocCnj, processMatchesPortal } from '../lib/judicial/eproc/sync/portal-process-match.mjs';
import { getEprocPortalById } from '../lib/judicial/eproc/portal-registry.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'wave_d', 'RelatorioProcessos_sanitized.xls');

const tempRoot = path.join(os.tmpdir(), `atrium-eproc-report-test-${Date.now()}`);
const PORTAL_ID = 'tjrs-eproc-1g';
const PORTAL = getEprocPortalById(PORTAL_ID);

function buildEmptyWorkbookBuffer() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['Número Processo', 'Classe', 'Autor', 'Réu', 'Localidade Judicial', 'Assunto', 'Último Evento', 'Data/Hora', 'Distribuição', 'Valor da Causa']
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Relatorio');
  return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'biff8' }));
}

function buildFakeReportPage(buffer, { action = 'relatorio_processo_gerar_planilha' } = {}) {
  const probes = { navigation: 0, triggerLocatorReads: 0 };
  const frame = {
    url: () => 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=relatorio_processo_procurador_listar',
    locator: () => ({
      count: async () => 1,
      click: async () => {},
      first: () => ({ count: async () => 1, click: async () => {} })
    }),
    evaluate: async () => {
      probes.triggerLocatorReads += 1;
      return {
        labelText: 'Gerar Planilha',
        action,
        targetUrl: 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=relatorio_processo_gerar_planilha',
        cssPath: '#sbmPlanilha',
        controlId: 'sbmPlanilha',
        controlName: 'sbmPlanilha',
        controlType: 'submit'
      };
    }
  };
  const navigationProbeLocator = {
    count: async () => 0,
    click: async () => {},
    evaluateAll: async () => { probes.navigation += 1; return []; },
    first: () => ({ count: async () => 0, click: async () => {} })
  };
  const page = {
    url: () => frame.url(),
    frames: () => [frame],
    locator: () => navigationProbeLocator,
    getByRole: () => ({ first: () => ({ count: async () => 0, isVisible: async () => false }) }),
    waitForEvent: async eventName => {
      if (eventName !== 'download') throw new Error(`Evento inesperado: ${eventName}`);
      return {
        createReadStream: async () => (async function* () {
          yield buffer;
        })(),
        suggestedFilename: () => 'RelatorioProcessos.xls'
      };
    }
  };
  return { page, probes };
}

async function run() {
  console.log('=== TESTE FOCAL: EPROC REPORT-FIRST PIPELINE ===\n');
  await mkdir(tempRoot, { recursive: true });

  try {
    const fixtureBuffer = await readFile(FIXTURE_PATH);
    const parsed = parseEprocProcessReportXls(fixtureBuffer, { portalId: PORTAL_ID });
    assert.equal(parsed.length, 109, 'Fixture deve conter 109 processos');
    const records = parsed.map(record => normalizeReportRecord(record, PORTAL_ID));
    assert.ok(records.every(record => record.cnj.length === 20));
    assert.ok(records.every(record => record.portalId === PORTAL_ID));
    assert.ok(records.every(record => record.fingerprint && record.fingerprint.length === 64));
    console.log('✓ 1. Parser oficial + normalização oficial do Relatório de Processos.');

    const originalFingerprint = reportRecordFingerprint(records[0]);
    const shuffled = { ...records[0], plaintiff: records[0].plaintiff, subject: records[0].subject };
    assert.equal(reportRecordFingerprint(shuffled), originalFingerprint, 'Fingerprint não depende da ordem das colunas do objeto');
    console.log('✓ 2. Fingerprint determinístico e estável.');

    const workspaceA = path.join(tempRoot, 'ws-a');
    const workspaceB = path.join(tempRoot, 'ws-b');
    const storeA = new EprocReportSnapshotStore({ dataDirectory: workspaceA, logger: { warn() {} } });
    const storeB = new EprocReportSnapshotStore({ dataDirectory: workspaceB, logger: { warn() {} } });
    await storeA.savePortalSnapshot(PORTAL_ID, { collectedAt: '2026-09-17T10:00:00.000Z', records });
    const saved = await storeA.getPortalSnapshot(PORTAL_ID);
    assert.equal(saved.count, 109);
    assert.equal(saved.records.length, 109);
    assert.equal(await storeB.getPortalSnapshot(PORTAL_ID), null, 'Snapshots são isolados por workspace');
    const snapshotRaw = await readFile(path.join(workspaceA, 'eproc-report-snapshots.json'), 'utf8');
    assert.ok(!/accessKey|chaveAcesso|"secret"|"passphrase"/i.test(snapshotRaw), 'Snapshot não pode conter segredos/chaves');
    const leftover = (await readdir(workspaceA)).filter(file => file.endsWith('.tmp'));
    assert.deepEqual(leftover, [], 'Gravação atômica não deixa arquivos temporários');
    const encryptedStore = new EprocReportSnapshotStore({
      dataDirectory: path.join(tempRoot, 'ws-enc'),
      securityManager: {
        encrypt: value => Buffer.from(value, 'utf8').toString('base64'),
        decrypt: value => Buffer.from(value, 'base64').toString('utf8')
      },
      logger: { warn() {} }
    });
    await encryptedStore.savePortalSnapshot(PORTAL_ID, { collectedAt: '2026-09-17T10:30:00.000Z', records: records.slice(0, 3) });
    const encryptedRaw = await readFile(path.join(tempRoot, 'ws-enc', 'eproc-report-snapshots.json'), 'utf8');
    assert.match(encryptedRaw, /"encrypted"/, 'Snapshot com cofre deve ser gravado cifrado');
    assert.doesNotMatch(encryptedRaw, /Cliente Teste|Autor Teste|Réu Teste/, 'Snapshot cifrado não expõe PII de partes');
    const encryptedRead = await encryptedStore.getPortalSnapshot(PORTAL_ID);
    assert.equal(encryptedRead.count, 3);
    assert.equal(encryptedRead.records[0].cnj, records[0].cnj);
    console.log('✓ 3. Snapshot por workspace, atômico, cifrado quando há cofre e sem segredos.');

    const baseline = [];
    for (let i = 0; i < 5; i++) {
      baseline.push({ id: `db-${i}`, number: records[i].number, client: 'Cliente Teste', eprocReport: records[i] });
    }
    baseline.push({
      id: 'db-updated',
      number: records[5].number,
      client: 'Cliente Teste',
      eprocReport: { ...records[5], lastEvent: 'Petição anterior', lastEventAt: '2025-01-01T00:00:00.000Z' }
    });
    baseline.push({ id: 'db-absent', number: '9990001-00.2026.8.21.0016', portalId: PORTAL_ID, eprocReport: { cnj: '99900010020268210016', lastEvent: 'Arquivado' } });

    const delta = computeEprocProcessDelta(records, buildEprocReportBaseline(baseline, PORTAL_ID), { portalId: PORTAL_ID });
    assert.equal(delta.totalIncoming, 109);
    assert.equal(delta.unchangedCount, 5, '5 processos inalterados por fotografia estável');
    assert.equal(delta.updatedCount, 1, '1 processo atualizado por novo evento');
    assert.equal(delta.newCount, 103);
    assert.equal(delta.inactiveCount, 1);
    assert.equal(delta.enrichmentCandidates.length, 104, 'Somente NEW/UPDATED entram em enriquecimento');

    const reordered = [...records].reverse();
    const deltaReordered = computeEprocProcessDelta(reordered, buildEprocReportBaseline(baseline, PORTAL_ID), { portalId: PORTAL_ID });
    assert.equal(deltaReordered.unchangedCount, 5, 'Ordem das linhas não pode gerar falso UPDATED');
    assert.equal(deltaReordered.updatedCount, 1);
    console.log('✓ 4. Diff estável: ordem não gera falso update; UNCHANGED não é candidato.');

    const { selected, deferred, totalCandidates } = selectEprocReportEnrichmentTargets(delta, { maxProcesses: 4 });
    assert.equal(selected.length, 4);
    assert.equal(deferred.length, totalCandidates - 4);
    assert.ok(selected.every(candidate => candidate.deltaType === 'NEW' || candidate.deltaType === 'UPDATED'));
    console.log('✓ 5. Enriquecimento orçado: apenas NEW/UPDATED, restante diferido com registro.');

    const state = {
      processes: [
        {
          id: 'manual-1',
          number: records[0].number,
          client: 'Cliente Manual Preservado',
          opposingParty: 'Adverso Manual',
          tags: []
        }
      ]
    };
    const mergeCounts = mergeEprocReportInventory(state, {
      portalId: PORTAL_ID,
      portalLabel: 'TJRS 1G',
      records,
      collectedAt: '2026-09-17T11:00:00.000Z'
    });
    const manual = state.processes.find(proc => digitsOnly(proc.number) === records[0].cnj);
    assert.equal(manual.client, 'Cliente Manual Preservado', 'Relação manual de cliente nunca é sobrescrita');
    assert.equal(manual.opposingParty, 'Adverso Manual', 'Parte adversa manual preservada');
    assert.equal(manual.eprocReport.cnj, records[0].cnj);
    assert.equal(mergeCounts.created, 108, '108 processos novos criados; o manual é atualizado in-place');
    assert.equal(mergeCounts.updated, 1);
    state.processes.find(proc => digitsOnly(proc.number) === records[1].cnj);
    assert.ok(state.processes.every(proc => !('accessKey' in proc) && !('chaveAcesso' in proc)), 'Mesclagem nunca grava chaves em texto claro');

    const secondMerge = mergeEprocReportInventory(state, {
      portalId: PORTAL_ID,
      portalLabel: 'TJRS 1G',
      records,
      collectedAt: '2026-09-17T11:05:00.000Z'
    });
    assert.equal(secondMerge.created, 0);
    assert.equal(secondMerge.updated, 0, 'Reimportação idêntica é no-op');
    assert.equal(secondMerge.untouched, 109);
    console.log('✓ 6. Mesclagem não destrutiva, idempotente e sem plaintext de chave.');

    const snapshotStore = new EprocReportSnapshotStore({ dataDirectory: path.join(tempRoot, 'ws-run'), logger: { warn() {} } });
    const stateRun = {};
    const progressEvents = [];
    const reportPage = buildFakeReportPage(fixtureBuffer);
    const result = await runEprocProcessReportInventory({
      page: reportPage.page,
      portalId: PORTAL_ID,
      state: stateRun,
      snapshotStore,
      collectedAt: '2026-09-17T12:00:00.000Z',
      logger: { warn() {}, info() {} },
      onProgress: event => progressEvents.push(event)
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, EPROC_REPORT_STATUS.OBTAINED);
    assert.equal(result.records.length, 109);
    assert.equal(result.delta.newCount, 109);
    assert.equal(result.merge.created, 109);
    assert.equal(result.artifact.sha256.length, 64);
    assert.ok(reportPage.probes.navigation > 0, 'Pipeline deve navegar/tentar a Relação de Processos antes de gerar a planilha');
    assert.ok(progressEvents.some(event => event.phase === 'report_download'));
    assert.ok(progressEvents.some(event => event.phase === 'report_diff' && event.determinate === true));
    const persistedSnapshot = await snapshotStore.getPortalSnapshot(PORTAL_ID);
    assert.equal(persistedSnapshot.count, 109);
    console.log('✓ 7. Orquestração completa: descobrir comando -> download -> parse -> snapshot -> diff -> merge.');

    const emptyBuffer = buildEmptyWorkbookBuffer();
    assert.ok(isValidEprocXlsBuffer(emptyBuffer), 'Workbook vazio ainda é OLE/BIFF8 válido');
    const emptyStore = new EprocReportSnapshotStore({ dataDirectory: path.join(tempRoot, 'ws-empty'), logger: { warn() {} } });
    const suspiciousResult = await runEprocProcessReportInventory({
      page: buildFakeReportPage(emptyBuffer).page,
      portalId: PORTAL_ID,
      state: { processes: [{ id: 'p1', number: '9990001-00.2026.8.21.0016', portalId: PORTAL_ID }] },
      snapshotStore: emptyStore,
      collectedAt: '2026-09-17T13:00:00.000Z',
      logger: { warn() {}, info() {} }
    });
    assert.equal(suspiciousResult.ok, false, 'Relatório vazio para carteira ativa não pode ser sucesso pleno');
    assert.equal(suspiciousResult.status, EPROC_REPORT_STATUS.EMPTY);
    assert.equal(suspiciousResult.code, 'EPROC_REPORT_EMPTY_SUSPICIOUS');
    assert.equal(suspiciousResult.merge, undefined, 'Carteira ativa nunca é integralmente marcada como ausente por relatório vazio');
    assert.equal(suspiciousResult.delta.inactiveCount, 1, 'Delta permanece apenas como sinal de auditoria');

    const genuinelyEmpty = await runEprocProcessReportInventory({
      page: buildFakeReportPage(emptyBuffer).page,
      portalId: PORTAL_ID,
      state: { processes: [] },
      snapshotStore: new EprocReportSnapshotStore({ dataDirectory: path.join(tempRoot, 'ws-empty-new'), logger: { warn() {} } }),
      collectedAt: '2026-09-17T13:05:00.000Z',
      logger: { warn() {}, info() {} }
    });
    assert.equal(genuinelyEmpty.ok, true, 'Carteira realmente vazia é uma coleta válida');
    assert.equal(genuinelyEmpty.status, EPROC_REPORT_STATUS.EMPTY);
    assert.equal(genuinelyEmpty.merge.created, 0);
    console.log('✓ 8. Workbook vazio distinguido de incompatível e de carteira ativa.');

    const unknownLayout = (() => {
      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet([
        ['Coluna Um', 'Coluna Dois', 'Coluna Três', 'Coluna Quatro'],
        ['a', 'b', 'c', 'd'],
        ['e', 'f', 'g', 'h']
      ]);
      XLSX.utils.book_append_sheet(workbook, sheet, 'Export');
      return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'biff8' }));
    })();
    const unknownLayoutResult = await runEprocProcessReportInventory({
      page: buildFakeReportPage(unknownLayout).page,
      portalId: PORTAL_ID,
      state: { processes: [] },
      snapshotStore: new EprocReportSnapshotStore({ dataDirectory: path.join(tempRoot, 'ws-unknown'), logger: { warn() {} } }),
      collectedAt: '2026-09-17T14:30:00.000Z',
      logger: { warn() {}, info() {} }
    });
    assert.equal(unknownLayoutResult.ok, false, 'Layout de relatório não reconhecido não pode ser lido como carteira vazia');
    assert.equal(unknownLayoutResult.status, EPROC_REPORT_STATUS.UNAVAILABLE);
    assert.equal(unknownLayoutResult.code, 'EPROC_REPORT_HEADER_NOT_FOUND');
    console.log('✓ 9b. Layout oficial desconhecido falha explicitamente, sem falso vazio.');

    const incompatible = Buffer.from('<html><body>Relatório indisponível</body></html>');
    const invalidResult = await runEprocProcessReportInventory({
      page: buildFakeReportPage(incompatible).page,
      portalId: PORTAL_ID,
      state: { processes: [] },
      snapshotStore: new EprocReportSnapshotStore({ dataDirectory: path.join(tempRoot, 'ws-invalid'), logger: { warn() {} } }),
      collectedAt: '2026-09-17T14:00:00.000Z',
      logger: { warn() {}, info() {} }
    });
    assert.equal(invalidResult.ok, false, 'Payload incompatível jamais pode ser reportado como sucesso');
    assert.equal(invalidResult.status, EPROC_REPORT_STATUS.UNAVAILABLE);
    console.log('✓ 9. Payload incompatível falha de forma explícita (sem falso sucesso).');

    const missingTriggerPage = {
      url: () => 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=painel_adv_listar',
      frames: () => [{
        url: () => 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=painel_adv_listar',
        evaluate: async () => null,
        locator: () => ({ count: async () => 0 })
      }],
      locator: () => ({ first: () => ({ count: async () => 0 }) })
    };
    const noTrigger = await runEprocProcessReportInventory({
      page: missingTriggerPage,
      portalId: PORTAL_ID,
      state: { processes: [] },
      snapshotStore: null,
      collectedAt: '2026-09-17T15:00:00.000Z',
      logger: { warn() {}, info() {} }
    });
    assert.equal(noTrigger.ok, false);
    assert.equal(noTrigger.code, 'EPROC_REPORT_TRIGGER_NOT_FOUND');
    console.log('✓ 10. Ausência do comando oficial é reportada como indisponibilidade explícita.');

    const portal = PORTAL;
    assert.ok(portal, 'Portal oficial deve existir');
    assert.equal(parseEprocCnj('5000001-00.2026.8.21.0016').justiceRegion, '821');
    assert.equal(processMatchesPortal({ number: '5000001-00.2026.8.21.0016' }, portal), true);
    assert.equal(processMatchesPortal({ number: '5000001-00.2024.4.04.7100' }, portal), false);
    console.log('✓ 11. Classificação portal/grau compartilhada preservada.');

    console.log('\n>>> EPROC REPORT-FIRST PIPELINE TEST PASSED! <<<\n');
  } finally {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}

run().catch(error => {
  console.error('Falha no teste do pipeline report-first:', error);
  process.exit(1);
});
