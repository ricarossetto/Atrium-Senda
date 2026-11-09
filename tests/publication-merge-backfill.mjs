#!/usr/bin/env node
/**
 * ATRIUM — Backfill de publicações duplicadas (migração v10→v11).
 *
 * Cenários sintéticos:
 *  1. Par oficial eproc + legado: migração funde, mantém 1 registro visível, alias
 *     reversível, tarefa reapontada e 1 audit de fusão sem PII.
 *  2. Replay: reexecutar o backfill/migração não altera nada nem duplica audit.
 *  3. Conflito treated × discarded: registros intocados e pendência no audit.
 *  4. Boot real: backup pre-migration-* criado antes da migração e estado salvo em v11.
 *  5. Isolamento: o backfill de um workspace não toca o estado de outro.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startTestServer } from './helpers.mjs';
import { SecurityManager } from '../lib/security.mjs';
import { CURRENT_DATA_VERSION, CURRENT_SCHEMA_VERSION, runStateMigrations } from '../lib/state-migrations.mjs';
import { backfillDuplicateIntimations, CONFLICT_ACTION, MERGE_ACTION } from '../lib/publications/publication-merge-backfill.mjs';

console.log('\n=== BACKFILL DE PUBLICAÇÕES DUPLICADAS (v10→v11) ===\n');

const CNJ = '5001234-56.2026.8.21.0001';
const CNJ_DIGITS = CNJ.replace(/\D/g, '');
const CANONICAL_ID = 'eproc:tjrs-eproc-1g:0123456789abcdef0123456789abcdef';
const LEGACY_ID = `intimation:eproc:${CNJ_DIGITS}`;
const EVENT = 'Intimação · Decisão';
const CLIENT_MARKER = 'Cliente Marcador Sensivel Teste';

function baseState(overrides = {}) {
  return {
    schemaVersion: 10,
    dataVersion: 10,
    terms: [],
    sources: [],
    intimations: [],
    tasks: [],
    processes: [],
    contacts: [],
    agenda: [],
    audit: [],
    settings: { officeName: 'Escritório Sintético' },
    ...overrides
  };
}

function canonicalRecord() {
  return {
    id: CANONICAL_ID,
    externalId: CANONICAL_ID,
    portalId: 'tjrs-eproc-1g',
    process: CNJ,
    processNumber: CNJ,
    source: 'eproc',
    event: EVENT,
    title: 'Intimação eproc',
    text: 'Teor oficial coletado do painel.',
    sourceReportedAt: '2026-09-10',
    sourceStatus: 'active',
    treatmentStatus: 'in_review',
    treatmentStartedAt: '2026-09-11T09:00:00.000Z',
    treatmentStartedBy: 'Advogada Teste',
    client: CLIENT_MARKER,
    linkedTaskIds: ['task-keeper'],
    taskId: 'task-keeper',
    createdAt: '2026-09-11T08:00:00.000Z',
    updatedAt: '2026-09-12T10:00:00.000Z'
  };
}

function legacyRecord() {
  return {
    id: LEGACY_ID,
    externalId: LEGACY_ID,
    process: CNJ,
    processNumber: CNJ,
    source: 'eproc',
    event: EVENT,
    title: 'Despacho legado',
    text: 'Texto legado com menos detalhes.',
    sourceReportedAt: '2026-09-10',
    treatmentStatus: 'untreated',
    client: CLIENT_MARKER,
    linkedTaskIds: ['task-legacy'],
    taskId: 'task-legacy',
    createdAt: '2026-09-10T12:00:00.000Z',
    updatedAt: '2026-09-10T12:00:00.000Z'
  };
}

function pairTasks() {
  return [
    { id: 'task-keeper', title: 'Providência oficial', intimationId: CANONICAL_ID, sourceIntimationId: CANONICAL_ID, publicationId: CANONICAL_ID, status: 'triagem' },
    { id: 'task-legacy', title: 'Providência legada', intimationId: LEGACY_ID, sourceIntimationId: LEGACY_ID, publicationId: LEGACY_ID, status: 'triagem' }
  ];
}

function duplicatePairState() {
  return baseState({ intimations: [canonicalRecord(), legacyRecord()], tasks: pairTasks() });
}

function conflictPairState() {
  const treated = { ...canonicalRecord(), treatmentStatus: 'treated', treatedAt: '2026-09-12T10:00:00.000Z', treatedBy: 'Advogada Teste' };
  delete treated.treatmentStartedAt;
  const discarded = { ...legacyRecord(), treatmentStatus: 'discarded', discardedAt: '2026-09-12T11:00:00.000Z', discardedBy: 'Advogada Teste' };
  return baseState({ intimations: [treated, discarded], tasks: pairTasks() });
}

function mergeEntries(state) {
  return (state.audit || []).filter(entry => entry?.action === MERGE_ACTION);
}

function conflictEntries(state) {
  return (state.audit || []).filter(entry => entry?.action === CONFLICT_ACTION);
}

// 1. Migração funde o par oficial + legado.
const migrated = runStateMigrations(structuredClone(duplicatePairState()), '2.0.0-test').state;
assert.equal(migrated.schemaVersion, CURRENT_SCHEMA_VERSION);
assert.equal(migrated.dataVersion, CURRENT_DATA_VERSION);
assert.equal(migrated.intimations.length, 2, 'nenhum registro pode ser removido fisicamente');
const visible = migrated.intimations.filter(record => !record.mergedInto);
assert.equal(visible.length, 1, 'apenas o keeper permanece visível');
assert.equal(visible[0].id, CANONICAL_ID, 'keeper é o registro oficial');
assert.deepEqual([...visible[0].linkedTaskIds].sort(), ['task-keeper', 'task-legacy'], 'tarefas unidas no keeper');
const alias = migrated.intimations.find(record => record.id === LEGACY_ID);
assert.equal(alias.mergedInto, CANONICAL_ID, 'perdedor aponta para o keeper');
assert.equal(alias.mergeReason, 'duplicate-identity');
assert.ok(alias.mergedAt, 'alias preserva mergedAt');
assert.ok(alias.sourceAliases.includes(LEGACY_ID));
assert.equal(migrated.tasks.length, 2, 'tarefas nunca são apagadas');
const legacyTask = migrated.tasks.find(task => task.id === 'task-legacy');
assert.equal(legacyTask.intimationId, CANONICAL_ID, 'tarefa do perdedor reaponta');
assert.equal(legacyTask.sourceIntimationId, CANONICAL_ID);
assert.equal(legacyTask.publicationId, CANONICAL_ID);
const merges = mergeEntries(migrated);
assert.equal(merges.length, 1, 'uma entrada de audit por fusão');
assert.ok(merges[0].detail.includes(CANONICAL_ID) && merges[0].detail.includes(LEGACY_ID));
assert.ok(merges[0].detail.includes('duplicate-identity') && merges[0].detail.includes('fontes eproc+eproc'));
assert.ok(!merges[0].detail.includes(CLIENT_MARKER), 'audit de fusão não contém cliente');
assert.ok(!merges[0].detail.includes('@'), 'audit de fusão não contém e-mail');
console.log('ok 1 — fusão oficial+legado: alias, tarefa reapontada e audit sem PII');

// 2. Replay é no-op e preserva mergedAt.
const migratedSnapshot = structuredClone(migrated);
const replay = backfillDuplicateIntimations(migrated, { actor: 'Replay', nowIso: '2030-01-01T00:00:00.000Z' });
assert.equal(replay.changed, false, 'replay não altera o estado');
assert.equal(replay.merges.length, 0);
assert.equal(replay.conflicts.length, 0);
assert.deepEqual(migrated, migratedSnapshot, 'replay não muta intimations/tasks/audit');
assert.equal(migrated.intimations.find(record => record.id === LEGACY_ID).mergedAt, alias.mergedAt, 'mergedAt preservado');
const replayMigration = runStateMigrations(structuredClone(migrated), '2.0.0-test');
assert.equal(replayMigration.migrated, false, 'schema v11 não reexecuta migração');
assert.deepEqual(replayMigration.state.intimations, migratedSnapshot.intimations);
assert.equal(mergeEntries(replayMigration.state).length, 1, 'replay não duplica audit');
console.log('ok 2 — replay idempotente com mergedAt preservado');

// 3. Conflito treated × discarded fica intocado com pendência.
const conflictState = runStateMigrations(structuredClone(conflictPairState()), '2.0.0-test').state;
assert.equal(conflictState.schemaVersion, CURRENT_SCHEMA_VERSION);
assert.equal(conflictState.intimations.length, 2);
assert.equal(conflictState.intimations.some(record => record.mergedInto), false, 'conflito não funde');
assert.equal(mergeEntries(conflictState).length, 0, 'conflito não gera audit de fusão');
const pendencies = conflictEntries(conflictState);
assert.equal(pendencies.length, 1, 'conflito registra pendência para revisão humana');
assert.ok(pendencies[0].detail.includes(CANONICAL_ID) && pendencies[0].detail.includes(LEGACY_ID));
assert.ok(pendencies[0].detail.includes('treatment-conflict'));
assert.ok(!pendencies[0].detail.includes(CLIENT_MARKER), 'pendência não contém cliente');
const conflictSnapshot = structuredClone(conflictState);
const conflictReplay = backfillDuplicateIntimations(conflictState, { actor: 'Replay', nowIso: '2030-01-01T00:00:00.000Z' });
assert.equal(conflictReplay.changed, false, 'replay de conflito não muta');
assert.equal(conflictReplay.conflicts.length, 1, 'conflito continua reportado');
assert.deepEqual(conflictState, conflictSnapshot, 'replay não duplica a pendência');
assert.equal(conflictEntries(conflictState).length, 1);
assert.equal(conflictState.tasks.find(task => task.id === 'task-legacy').intimationId, LEGACY_ID, 'tarefa do conflito permanece');
console.log('ok 3 — conflito treated×discarded intocado com pendência única');

// 3b. Prefixo de fallback (160 chars) sem texto integral idêntico NÃO é fundido no boot:
// ambos continuam vivos para revisão humana e nenhum audit de fusão é gravado.
{
  const prefix = 'linha do painel '.repeat(15);
  const fallbackOnly = baseState({
    intimations: [
      { ...canonicalRecord(), text: `${prefix}desfecho A`, event: 'Intimação · Decisão' },
      { ...legacyRecord(), text: `${prefix}desfecho B`, event: 'Despacho' }
    ]
  });
  const fallbackMigrated = runStateMigrations(structuredClone(fallbackOnly), '2.0.0-test').state;
  assert.equal(fallbackMigrated.intimations.filter(record => !record.mergedInto).length, 2, 'fallback parcial não funde automaticamente');
  assert.equal(mergeEntries(fallbackMigrated).length, 0, 'candidato de fallback não gera audit de fusão');
  assert.equal(fallbackMigrated.intimations.some(record => record.mergedInto), false);
  console.log('ok 3b — fallback de 160 chars não funde no backfill');
}

// 4. Isolamento por workspace: processar A não toca B.
const workspaceA = duplicatePairState();
const workspaceB = conflictPairState();
const workspaceBBefore = structuredClone(workspaceB);
backfillDuplicateIntimations(workspaceA, { actor: 'Teste' });
assert.equal(workspaceA.intimations.filter(record => !record.mergedInto).length, 1);
assert.deepEqual(workspaceB, workspaceBBefore, 'workspace B permanece intacto');
assert.equal((workspaceB.audit || []).length, 0, 'workspace B não recebe audit de A');
console.log('ok 4 — isolamento entre estados de workspaces');

// 5. Boot real: backup pre-migration-* antes da migração e estado salvo em v11.
const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'atrium-merge-backfill-'));
let server = null;
try {
  server = await startTestServer({ dataDirectory });
  const encryptionKey = server.encryptionKey;
  const sessionSecret = server.sessionSecret;
  await server.stop();
  server = null;

  const security = new SecurityManager({ dataDirectory, sessionSecret, encryptionKey });
  await security.init();
  const v10State = duplicatePairState();
  const preMigrationState = structuredClone(v10State);
  const envelope = {
    version: 1,
    schemaVersion: 10,
    appVersion: '2.0.0',
    algorithm: 'aes-256-gcm',
    revision: 'rev-pre-migration-fixture',
    encrypted: security.encrypt(JSON.stringify(v10State)),
    updatedAt: new Date().toISOString()
  };
  await writeFile(path.join(dataDirectory, 'app-state.json'), JSON.stringify(envelope, null, 2), { mode: 0o600 });

  server = await startTestServer({ dataDirectory, env: { AUTH_SESSION_SECRET: sessionSecret, AUTH_ENCRYPTION_KEY: encryptionKey } });
  const migratedEnvelope = JSON.parse(await readFile(path.join(dataDirectory, 'app-state.json'), 'utf8'));
  const bootState = JSON.parse(security.decrypt(migratedEnvelope.encrypted));
  assert.equal(bootState.schemaVersion, CURRENT_SCHEMA_VERSION, 'boot salva schema v11');
  assert.equal(bootState.intimations.filter(record => !record.mergedInto).length, 1, 'boot deixa 1 registro visível');
  assert.equal(bootState.intimations.find(record => record.id === LEGACY_ID).mergedInto, CANONICAL_ID);
  assert.equal(mergeEntries(bootState).length, 1);
  assert.equal(bootState.tasks.find(task => task.id === 'task-legacy').publicationId, CANONICAL_ID);

  const backupFiles = (await readdir(path.join(dataDirectory, 'migrations', 'pre-migration')))
    .filter(name => /^pre-migration-.+\.atrium-backup$/.test(name));
  assert.equal(backupFiles.length, 1, 'boot cria exatamente um backup pré-migração');
  const backupEnvelope = JSON.parse(await readFile(path.join(dataDirectory, 'migrations', 'pre-migration', backupFiles[0]), 'utf8'));
  assert.ok(backupEnvelope.encrypted, 'backup preserva o envelope cifrado original');
  const backupState = JSON.parse(security.decrypt(backupEnvelope.encrypted));
  assert.equal(backupState.schemaVersion, 10, 'backup é o estado anterior à migração');
  assert.equal(backupState.intimations.length, 2);
  assert.equal(backupState.intimations.some(record => record.mergedInto), false, 'backup contém os dois registros vivos');
  assert.deepEqual(backupState, preMigrationState, 'backup é fiel ao estado pré-migração');
  if (process.platform !== 'win32') assert.equal(server.output().includes('rev-pre-migration-fixture'), false);
  console.log('ok 5 — boot cria backup pre-migration-* e persiste a fusão em v11');
} finally {
  if (server) await server.stop();
  await rm(dataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

console.log('\n[PASS] Backfill de publicações duplicadas validado.\n');
