import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildPjeSnapshot,
  diffPjeSnapshots,
  PjeSnapshotStore
} from '../lib/judicial/pje/sync/pje-snapshot-store.mjs';
import { mergePjeInventoryIntoState } from '../lib/judicial/pje/sync/ingest-inventory.mjs';
import { writePjeInventoryXls, readPjeInventoryXls } from '../lib/judicial/pje/report/pje-report.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — SLICE TJMT: SNAPSHOT/DIFF, XLS E INGESTÃO IDEMPOTENTE');
console.log('===============================================================\n');

function makeInventory(overrides = {}) {
  return {
    portalId: 'pje-tjmt-1g',
    portalName: 'TJMT · PJe 1º grau',
    layoutFamily: 'standard',
    collectorKey: 'standard',
    collectedAt: '2026-09-17T20:00:00.000Z',
    expedientes: {
      situations: [
        { label: 'Pendentes de ciência ou de resposta', count: 2 },
        { label: 'Ciência dada pelo Judiciário - pendente de resposta', count: 2 }
      ],
      processes: [
        { processNumber: '5001234-56.2025.8.12.0001', summary: 'Intimação para manifestação', lastDate: '12/09/2026', dates: ['12/09/2026'] }
      ]
    },
    acervo: {
      situations: [],
      processes: [
        { processNumber: '5001234-56.2025.8.12.0001', summary: 'Intimação para manifestação', lastDate: '12/09/2026', dates: ['12/09/2026'] },
        { processNumber: '5009876-54.2025.8.12.0002', summary: 'Sentença publicada', lastDate: '02/09/2026', dates: ['02/09/2026'] }
      ]
    },
    ...overrides
  };
}

const rootDir = await mkdtemp(path.join(tmpdir(), 'atrium-pje-slice-'));

try {
  console.log('[T1] Primeiro snapshot classifica tudo como novo...');
  const inventory = makeInventory();
  const snapshot = buildPjeSnapshot(inventory);
  const firstDiff = diffPjeSnapshots(null, snapshot);
  assert.equal(firstDiff.status, 'CHANGED');
  assert.equal(firstDiff.totals.added, 4, 'Duas situações e dois processos únicos.');
  assert.equal(firstDiff.totals.updated, 0);
  console.log('  ✓ 4 registros adicionados (2 situações + 2 processos).');

  console.log('[T2] Segunda coleta idêntica resulta em UNCHANGED...');
  const secondDiff = diffPjeSnapshots(snapshot, buildPjeSnapshot(makeInventory()));
  assert.equal(secondDiff.status, 'UNCHANGED');
  assert.deepEqual(secondDiff.totals, { added: 0, updated: 0, unchanged: 4, removed: 0 });
  console.log('  ✓ Diff estável: 4 UNCHANGED, nada novo.');

  console.log('[T3] Mudança real de contagem vira UPDATED...');
  const changedInventory = makeInventory();
  changedInventory.expedientes.situations[0].count = 3;
  const changedDiff = diffPjeSnapshots(snapshot, buildPjeSnapshot(changedInventory));
  assert.equal(changedDiff.status, 'CHANGED');
  assert.deepEqual(changedDiff.updated, ['exp:Pendentes de ciência ou de resposta']);
  assert.equal(changedDiff.totals.unchanged, 3);
  console.log('  ✓ Somente a situação alterada marcada como UPDATED.');

  console.log('[T4] Snapshot persiste e relê no workspace...');
  const store = new PjeSnapshotStore({ rootDir });
  await store.save('pje-tjmt-1g', snapshot);
  const loaded = await store.read('pje-tjmt-1g');
  assert.equal(loaded.portalId, 'pje-tjmt-1g');
  assert.equal(Object.keys(loaded.records).length, 4);
  assert.equal(await store.read('pje-outro'), null);
  console.log('  ✓ Snapshot por portal, atômico e isolado.');

  console.log('[T5] Ingestão cria processos e tarefas agregadas de situação...');
  const baseState = { processes: [{ id: 'manual-1', number: '1234567-89.2024.8.12.0009', client: 'Cliente Teste', lastMovement: 'manual' }], tasks: [] };
  const firstIngest = mergePjeInventoryIntoState(baseState, inventory, { now: '2026-09-17T20:00:00.000Z' });
  assert.equal(firstIngest.counters.processesCreated, 2);
  assert.equal(firstIngest.counters.tasksCreated, 2);
  const createdProcess = firstIngest.state.processes.find(process => process.number === '5001234-56.2025.8.12.0001');
  assert.equal(createdProcess.sourcePortalId, 'pje-tjmt-1g');
  assert.equal(createdProcess.lastMovementAt, '2026-09-12');
  assert.equal(createdProcess.monitoring, 'active');
  const manualProcess = firstIngest.state.processes.find(process => process.id === 'manual-1');
  assert.equal(manualProcess.client, 'Cliente Teste', 'Processo manual não pode perder cliente.');
  for (const task of firstIngest.state.tasks) {
    assert.equal(task.deadline, '', 'Tarefa agregada de situação não representa um prazo datado.');
    assert.equal(task.status, 'triagem');
  }
  console.log('  ✓ 2 processos e 2 tarefas agregadas criados; manual preservado.');

  console.log('[T5b] A ingestão projeta a comunicação PJe em state.intimations...');
  const withExpediente = makeInventory({
    expedientes: {
      situations: [{ label: 'Pendentes de ciência ou de resposta', count: 1 }],
      processes: [{ processNumber: '5001234-56.2025.8.12.0001', summary: 'Intimação para manifestação', lastDate: '12/09/2026', dates: ['12/09/2026'] }],
      expedientes: [{
        expedienteIdentity: 'id:53180112',
        processNumber: '5001234-56.2025.8.12.0001',
        summary: 'Intimação para manifestação',
        lastDate: '12/09/2026',
        situation: 'Pendentes de ciência ou de resposta'
      }]
    }
  });
  const projected = mergePjeInventoryIntoState({ processes: [], tasks: [] }, withExpediente, { now: '2026-09-17T20:00:00.000Z' });
  assert.equal(projected.counters.pjeIntimationsCreated, 1, 'Uma comunicação com CNJ deve gerar uma intimação.');
  const pjeIntimation = projected.state.intimations.find(item => item.source === 'pje');
  assert.ok(pjeIntimation, 'A comunicação PJe deve aparecer no acervo de Publicações.');
  assert.equal(pjeIntimation.process, '50012345620258120001');
  assert.equal(pjeIntimation.treatmentStatus, 'untreated');
  assert.equal(pjeIntimation.unread, true);
  assert.equal(pjeIntimation.sourceReportedAt, '2026-09-12', 'A data exibida é a da listagem do portal.');
  assert.equal('deadline' in pjeIntimation, false, 'A projeção não calcula prazo.');
  assert.equal('fatalDeadline' in pjeIntimation, false);
  assert.ok(String(pjeIntimation.externalId).startsWith('pje:pje-tjmt-1g:'), 'Identidade estável por portal e expediente.');
  console.log('  ✓ Intimação PJe projetada com origem, data e tratamento honestos.');

  const dated = structuredClone(withExpediente);
  dated.expedientes.expedientes[0].prazoFinal = '23/11/2026';
  const auto = mergePjeInventoryIntoState({ processes: [], tasks: [], settings: { deadlineMode: 'auto' } }, dated, { now: '2026-10-27T12:00:00.000Z' }).state;
  const autoItem = auto.intimations[0];
  assert.equal(autoItem.sourceReportedDeadlineAt, '2026-11-23');
  assert.equal(autoItem.deadline, '2026-11-23');
  assert.equal(autoItem.deadlineSource, 'pje');
  const manual = mergePjeInventoryIntoState({ processes: [], tasks: [], settings: { deadlineMode: 'manual' } }, dated, { now: '2026-10-27T12:00:00.000Z' }).state;
  assert.equal(manual.intimations[0].sourceReportedDeadlineAt, '2026-11-23');
  assert.equal(manual.intimations[0].deadline || '', '');
  const changed = structuredClone(dated);
  changed.expedientes.expedientes[0].prazoFinal = '24/11/2026';
  const tracked = { ...auto, tasks: [{ id: 'task-1', intimationId: autoItem.id, deadline: '2026-11-23', sourceReportedDeadlineAt: '2026-11-23', deadlineSource: 'pje' }] };
  const updated = mergePjeInventoryIntoState(tracked, changed, { now: '2026-10-28T12:00:00.000Z' }).state;
  assert.equal(updated.intimations[0].deadline, '2026-11-24');
  assert.equal(updated.tasks[0].deadline, '2026-11-24');
  assert.equal(tracked.tasks[0].deadline, '2026-11-23');
  const curated = { ...tracked, intimations: [{ ...autoItem, deadline: '2026-11-20', deadlineSource: 'manual' }], tasks: [{ ...tracked.tasks[0], deadline: '2026-11-20' }] };
  const preserved = mergePjeInventoryIntoState(curated, changed, { now: '2026-10-28T12:00:00.000Z' }).state;
  assert.equal(preserved.intimations[0].deadline, '2026-11-20');
  assert.equal(preserved.tasks[0].deadline, '2026-11-20');
  assert.equal(preserved.tasks[0].deadlineConflict.sourceValue, '2026-11-24');

  console.log('[T6] Segunda ingestão idêntica não altera nada...');
  const secondIngest = mergePjeInventoryIntoState(firstIngest.state, inventory, { now: '2026-09-17T21:00:00.000Z' });
  const {
    communicationsCreated, communicationsUpdated, communicationsUnchanged, communicationsRemoved,
    pjeIntimationsCreated, pjeIntimationsUpdated, ...coreCounters
  } = secondIngest.counters;
  void communicationsCreated; void communicationsUpdated; void communicationsUnchanged; void communicationsRemoved;
  void pjeIntimationsCreated; void pjeIntimationsUpdated;
  assert.deepEqual(coreCounters, {
    processesCreated: 0,
    processesUpdated: 0,
    processesUnchanged: 2,
    tasksCreated: 0,
    tasksUpdated: 0,
    tasksUnchanged: 2
  });
  assert.deepEqual(secondIngest.state.processes, firstIngest.state.processes);
  assert.deepEqual(secondIngest.state.tasks, firstIngest.state.tasks);
  console.log('  ✓ Estado idempotente: nenhuma diferença na segunda passagem.');

  console.log('[T7] XLS de auditoria é gerado e reparseável...');
  const xlsPath = await writePjeInventoryXls(inventory, { directory: path.join(rootDir, 'reports'), fileName: 'tjmt-slice.xlsx' });
  const sheets = await readPjeInventoryXls(xlsPath);
  assert.ok(sheets.Expedientes && sheets.Expedientes.length === 2);
  assert.ok(sheets.Acervo && sheets.Acervo.length === 2);
  assert.equal(sheets.Expedientes[0]['Situação'], 'Pendentes de ciência ou de resposta');
  assert.equal(sheets.Expedientes[0].Quantidade, 2);
  console.log('  ✓ XLS com abas Expedientes/Acervo reparseadas do arquivo.');

  console.log('\n>>> SLICE TJMT F1: PASS <<<\n');
} finally {
  await rm(rootDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
