import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { InpiService } from '../lib/inpi/inpi-service.mjs';

console.log('\n=== INPI SERVICE: GUARDA IN-FLIGHT E FENCE DE REDEFINIÇÃO ===\n');

const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'atrium-inpi-guard-'));
const service = new InpiService({
  dataDir: dataDirectory,
  resolveDataDir: () => dataDirectory,
  pythonBin: 'atrium-binary-inexistente-sintetico',
  logger: { info: () => {}, warn: () => {}, error: () => {} }
});
const activeState = { sources: [{ id: 'inpi-rpi', active: true }] };

try {
  let releaseMonitors;
  const monitorsGate = new Promise(resolve => { releaseMonitors = resolve; });
  service.getAllMonitors = async () => {
    await monitorsGate;
    return { all: [{ term: 'Marca Teste', type: 'marca' }] };
  };
  service.persistScanMetadata = async () => null;
  service.getDashboardData = async () => ({ matches: [], statistics: {}, lastRun: null });
  service.syncMatchesToState = async () => ({ added: 0, newIntimations: [] });

  const first = service.runScan({ state: activeState, limit: 1 });
  // A guarda precisa estar marcada de forma síncrona, antes de qualquer await.
  assert.equal(service.getScanState().isScanning, true, 'Guarda in-flight deve ser síncrona (sem janela TOCTOU).');
  const second = await service.runScan({ state: activeState, limit: 1 });
  assert.equal(second.busy, true, 'Segunda chamada concorrente deve receber busy.');
  releaseMonitors();
  await first.catch(() => {});
  console.log('✓ Guarda in-flight marcada antes do primeiro await; concorrente recebe busy.');

  // Sem monitores, a guarda é liberada e a última varredura anterior é preservada.
  const emptyService = new InpiService({
    dataDir: dataDirectory,
    resolveDataDir: () => dataDirectory,
    pythonBin: 'atrium-binary-inexistente-sintetico',
    logger: { info: () => {}, warn: () => {}, error: () => {} }
  });
  emptyService.getAllMonitors = async () => ({ all: [] });
  const emptyResult = await emptyService.runScan({ state: activeState, limit: 1 });
  assert.equal(emptyResult.ok, false);
  assert.equal(emptyService.getScanState().isScanning, false, 'Sem monitores a guarda deve ser liberada.');
  console.log('✓ Ausência de monitores libera a guarda sem travar o painel.');

  // Fence de redefinição: runScan e agendador não iniciam trabalho no workspace.
  let fenced = true;
  const fencedService = new InpiService({
    dataDir: dataDirectory,
    resolveDataDir: () => dataDirectory,
    pythonBin: 'atrium-binary-inexistente-sintetico',
    getWorkspaceId: () => 'ws-em-reset',
    isWorkspaceFenced: workspaceId => fenced && workspaceId === 'ws-em-reset',
    logger: { info: () => {}, warn: () => {}, error: () => {} }
  });
  fencedService.getAllMonitors = async () => { throw new Error('não deveria consultar monitores'); };
  const fencedScan = await fencedService.runScan({ state: activeState, limit: 1 });
  assert.equal(fencedScan.skipped, true, 'Varredura deve ser suspensa durante a redefinição.');
  fencedService.getDashboardData = async () => { throw new Error('não deveria ler o dashboard'); };
  await fencedService.checkScheduledRunForWorkspace({ getState: async () => activeState });
  assert.equal(fencedService.getScanState().isScanning, false);
  fenced = false;
  console.log('✓ Fence impede varredura manual e agendada durante a redefinição do escritório.');
  console.log('\n>>> INPI SERVICE GUARD: PASS <<<\n');
} finally {
  await rm(dataDirectory, { recursive: true, force: true }).catch(() => {});
}
