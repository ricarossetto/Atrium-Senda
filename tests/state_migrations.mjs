#!/usr/bin/env node
/**
 * ATRIUM — State Migrations & Hygiene Test Suite
 *
 * Tests:
 *  1. Deterministic migration v1 → v7 with strict record count preservation
 *  2. Source ID normalization (djen → djen-cnj, datajud → datajud-cnj) without duplicates
 *  3. Financial field canonicalization (rpvAmount → requisitionAmount, pago → repassado)
 *  4. AI key isolation (settings.geminiApiKey removed from state)
 *  5. Future schema rejection (schemaVersion > CURRENT throws FutureSchemaError)
 *  6. Corrupted state detection (invalid objects fail validateAppState)
 *  7. Idempotent migration (running twice produces same output)
 *  8. Safe defaults application without data loss
 *  9. Migration history tracking
 * 10. 10 consecutive migrations produce zero data duplication
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsUrl = pathToFileURL(path.join(ROOT, 'lib', 'state-migrations.mjs')).href;
const {
  CURRENT_SCHEMA_VERSION,
  CURRENT_DATA_VERSION,
  runStateMigrations,
  validateAppState,
  applySafeDefaults,
  FutureSchemaError,
  CorruptedStateError,
  migrate1To2,
  migrate2To3,
  migrate3To4,
  migrate4To5,
  migrate5To6,
  migrate6To7,
  migrate7To8,
  migrate8To9,
  migrate9To10
} = await import(migrationsUrl);

const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'state');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

console.log('\n═══════════════════════════════════════════');
console.log('  ATRIUM STATE MIGRATIONS TEST SUITE');
console.log('═══════════════════════════════════════════\n');

// Load fixtures
const legacyV1 = JSON.parse(await readFile(path.join(FIXTURES, 'legacy-v1.json'), 'utf8'));
const futureV99 = JSON.parse(await readFile(path.join(FIXTURES, 'future-v99.json'), 'utf8'));

// ─────────────────────────────────────────
// TEST 1: Full migration v1 → v7
// ─────────────────────────────────────────
console.log('📋 Migration Pipeline v1 → v7');

test('Full migration v1→v7 completes successfully', () => {
  const result = runStateMigrations(structuredClone(legacyV1), '2.0.0-test');
  assert.equal(result.migrated, true);
  assert.equal(result.fromVersion, 1);
  assert.equal(result.toVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(result.state.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.equal(result.state.dataVersion, CURRENT_DATA_VERSION);
});

test('Migration preserves exact record counts', () => {
  const result = runStateMigrations(structuredClone(legacyV1), '2.0.0-test');
  const s = result.state;
  assert.equal(s.processes.length, legacyV1.processes.length, 'process count mismatch');
  assert.equal(s.contacts.length, legacyV1.contacts.length, 'contact count mismatch');
  assert.equal(s.tasks.length, legacyV1.tasks.length, 'task count mismatch');
  assert.equal(s.intimations.length, legacyV1.intimations.length, 'intimation count mismatch');
  assert.equal(s.agenda.length, legacyV1.agenda.length, 'agenda count mismatch');
  assert.equal(s.audit.length, legacyV1.audit.length, 'audit count mismatch');
});

// ─────────────────────────────────────────
// TEST 2: Source ID normalization
// ─────────────────────────────────────────
console.log('\n📋 Source ID Normalization');

test('djen → djen-cnj migration without duplicates', () => {
  const result = runStateMigrations(structuredClone(legacyV1), '2.0.0-test');
  const sources = result.state.sources;
  const djenCount = sources.filter(s => s.id === 'djen-cnj').length;
  const oldDjen = sources.filter(s => s.id === 'djen').length;
  assert.equal(djenCount, 1, 'should have exactly one djen-cnj');
  assert.equal(oldDjen, 0, 'should have no old djen');
});

test('datajud → datajud-cnj migration without duplicates', () => {
  const result = runStateMigrations(structuredClone(legacyV1), '2.0.0-test');
  const sources = result.state.sources;
  const datajudCount = sources.filter(s => s.id === 'datajud-cnj').length;
  const oldDatajud = sources.filter(s => s.id === 'datajud').length;
  assert.equal(datajudCount, 1, 'should have exactly one datajud-cnj');
  assert.equal(oldDatajud, 0, 'should have no old datajud');
});

test('Canonical sources are present after migration', () => {
  const result = runStateMigrations(structuredClone(legacyV1), '2.0.0-test');
  const ids = result.state.sources.map(s => s.id);
  assert.ok(ids.includes('external-calendar'), 'missing external-calendar');
  assert.ok(ids.includes('djen-cnj'), 'missing djen-cnj');
  assert.ok(ids.includes('datajud-cnj'), 'missing datajud-cnj');
  assert.ok(ids.includes('a1'), 'missing a1');
});

// ─────────────────────────────────────────
// TEST 3: Financial field canonicalization
// ─────────────────────────────────────────
console.log('\n📋 Financial Field Migration');

test('rpvAmount → requisitionAmount', () => {
  const result = runStateMigrations(structuredClone(legacyV1), '2.0.0-test');
  const proc1 = result.state.processes.find(p => p.id === 'proc-1');
  assert.equal(proc1.requisitionAmount, 15000);
});

test('economicValue → requisitionAmount fallback', () => {
  const result = runStateMigrations(structuredClone(legacyV1), '2.0.0-test');
  const proc2 = result.state.processes.find(p => p.id === 'proc-2');
  assert.equal(proc2.requisitionAmount, 30000);
});

test('feeStatus pago → repassado', () => {
  const result = runStateMigrations(structuredClone(legacyV1), '2.0.0-test');
  const proc1 = result.state.processes.find(p => p.id === 'proc-1');
  assert.equal(proc1.feeStatus, 'repassado');
});

// ─────────────────────────────────────────
// TEST 4: AI key isolation
// ─────────────────────────────────────────
console.log('\n📋 AI Key Sanitization');

test('settings.geminiApiKey removed from state', () => {
  const result = runStateMigrations(structuredClone(legacyV1), '2.0.0-test');
  assert.equal(result.state.settings.geminiApiKey, undefined, 'geminiApiKey should be removed');
});

// ─────────────────────────────────────────
// TEST 5: Future schema rejection
// ─────────────────────────────────────────
console.log('\n📋 Future Schema Protection');

test('FutureSchemaError thrown for schemaVersion > CURRENT', () => {
  assert.throws(
    () => runStateMigrations(structuredClone(futureV99), '2.0.0-test'),
    (err) => err instanceof FutureSchemaError && err.foundVersion === 99,
    'Should throw FutureSchemaError'
  );
});

test('validateAppState rejects future schema', () => {
  assert.throws(
    () => validateAppState(structuredClone(futureV99), CURRENT_SCHEMA_VERSION),
    (err) => err instanceof FutureSchemaError,
    'Should throw FutureSchemaError on validate'
  );
});

// ─────────────────────────────────────────
// TEST 6: Corrupted state detection
// ─────────────────────────────────────────
console.log('\n📋 Corruption Detection');

test('null state throws CorruptedStateError', () => {
  assert.throws(
    () => validateAppState(null),
    (err) => err instanceof CorruptedStateError,
    'null state should throw'
  );
});

test('array state throws CorruptedStateError', () => {
  assert.throws(
    () => validateAppState([1, 2, 3]),
    (err) => err instanceof CorruptedStateError,
    'array state should throw'
  );
});

test('string processes throws CorruptedStateError', () => {
  assert.throws(
    () => validateAppState({ schemaVersion: CURRENT_SCHEMA_VERSION, processes: 'not-array' }, CURRENT_SCHEMA_VERSION),
    (err) => err instanceof CorruptedStateError,
    'string collection should throw'
  );
});

// ─────────────────────────────────────────
// TEST 7: Idempotent migration
// ─────────────────────────────────────────
console.log('\n📋 Idempotency');

test('Running migration on already-migrated state is a no-op', () => {
  const first = runStateMigrations(structuredClone(legacyV1), '2.0.0-test');
  const second = runStateMigrations(structuredClone(first.state), '2.0.0-test');
  assert.equal(second.migrated, false, 'second migration should be no-op');
  assert.equal(second.state.processes.length, first.state.processes.length);
  assert.equal(second.state.contacts.length, first.state.contacts.length);
  assert.equal(second.state.tasks.length, first.state.tasks.length);
});

// ─────────────────────────────────────────
// TEST 8: Safe defaults
// ─────────────────────────────────────────
console.log('\n📋 Safe Defaults');

test('applySafeDefaults adds missing settings without overwriting existing', () => {
  const state = { schemaVersion: CURRENT_SCHEMA_VERSION, settings: { officeName: 'Custom Office' } };
  const result = applySafeDefaults(state);
  assert.equal(result.settings.officeName, 'Custom Office', 'should preserve custom office name');
  assert.equal(typeof result.settings.lawyerName, 'string', 'should have default lawyerName');
});

test('applySafeDefaults creates terms if empty', () => {
  const state = { schemaVersion: CURRENT_SCHEMA_VERSION, terms: [] };
  const result = applySafeDefaults(state);
  assert.equal(result.terms.length, 1, 'should have 1 default term');
});

test('applySafeDefaults does NOT replace existing terms', () => {
  const state = { schemaVersion: CURRENT_SCHEMA_VERSION, terms: [{ id: 'custom', name: 'Custom Term' }] };
  const result = applySafeDefaults(state);
  assert.equal(result.terms.length, 1, 'should keep existing terms');
  assert.equal(result.terms[0].name, 'Custom Term', 'should preserve custom term');
});

// ─────────────────────────────────────────
// TEST 9: Migration history
// ─────────────────────────────────────────
console.log('\n📋 Migration History');

test('Migration history records from/to/applied', () => {
  const result = runStateMigrations(structuredClone(legacyV1), '2.0.0-test');
  assert.ok(Array.isArray(result.state.migrationHistory), 'migrationHistory should be array');
  assert.ok(result.state.migrationHistory.length > 0, 'should have at least 1 entry');
  const entry = result.state.migrationHistory[result.state.migrationHistory.length - 1];
  assert.equal(entry.from, 1);
  assert.equal(entry.to, CURRENT_SCHEMA_VERSION);
  assert.ok(Array.isArray(entry.applied), 'applied should be array');
  assert.ok(entry.applied.length > 0, 'applied should have steps');
});

// ─────────────────────────────────────────
// TEST 10: 10 consecutive migrations — zero duplication
// ─────────────────────────────────────────
console.log('\n📋 Consecutive Startup Stability');

test('10 consecutive runStateMigrations produce zero data duplication', () => {
  let state = structuredClone(legacyV1);
  const firstResult = runStateMigrations(state, '2.0.0-test');
  const processCount = firstResult.state.processes.length;
  const contactCount = firstResult.state.contacts.length;
  const taskCount = firstResult.state.tasks.length;
  const sourceCount = firstResult.state.sources.length;

  let current = firstResult.state;
  for (let i = 0; i < 10; i++) {
    const result = runStateMigrations(structuredClone(current), '2.0.0-test');
    current = result.state;
  }

  assert.equal(current.processes.length, processCount, `processes duplicated after 10 runs: ${current.processes.length} vs ${processCount}`);
  assert.equal(current.contacts.length, contactCount, `contacts duplicated after 10 runs`);
  assert.equal(current.tasks.length, taskCount, `tasks duplicated after 10 runs`);
  assert.equal(current.sources.length, sourceCount, `sources duplicated after 10 runs: ${current.sources.length} vs ${sourceCount}`);
});

// ─────────────────────────────────────────
// Individual migration step tests
// ─────────────────────────────────────────
console.log('\n📋 Individual Migration Steps');

test('migrate1To2 normalizes OAB extraction', () => {
  const input = { version: 1, terms: [{ registration: 'OAB/RS 54321' }] };
  const result = migrate1To2(input);
  assert.equal(result.schemaVersion, 2);
  assert.equal(result.terms[0].oabUf, 'RS');
});

test('migrate2To3 normalizes source IDs', () => {
  const input = { schemaVersion: 2, sources: [{ id: 'djen' }, { id: 'datajud' }] };
  const result = migrate2To3(input);
  assert.equal(result.schemaVersion, 3);
  assert.ok(result.sources.some(s => s.id === 'djen-cnj'));
  assert.ok(result.sources.some(s => s.id === 'datajud-cnj'));
  assert.ok(!result.sources.some(s => s.id === 'djen'));
});

test('migrate3To4 normalizes financial fields', () => {
  const input = { schemaVersion: 3, processes: [{ id: 'p1', rpvAmount: 5000, feeStatus: 'pago' }] };
  const result = migrate3To4(input);
  assert.equal(result.schemaVersion, 4);
  assert.equal(result.processes[0].requisitionAmount, 5000);
  assert.equal(result.processes[0].feeStatus, 'repassado');
});

test('migrate5To6 removes geminiApiKey from settings', () => {
  const input = { schemaVersion: 5, settings: { geminiApiKey: 'secret', officeName: 'Test' } };
  const result = migrate5To6(input);
  assert.equal(result.schemaVersion, 6);
  assert.equal(result.settings.geminiApiKey, undefined);
  assert.equal(result.settings.officeName, 'Test');
});

test('migrate6To7 initializes configuration catalogs and migrationHistory', () => {
  const input = { schemaVersion: 6 };
  const result = migrate6To7(input);
  assert.equal(result.schemaVersion, 7);
  assert.ok(typeof result.configuration === 'object');
  assert.ok(Array.isArray(result.configuration.taskDefinitions));
  assert.ok(Array.isArray(result.migrationHistory));
});

test('migrate7To8 normalizes publication treatmentStatus and metadata', () => {
  const input = {
    schemaVersion: 7,
    intimations: [
      { id: 'int-1', title: 'Intimação Nova', status: 'nova', text: 'Texto original', publishedAt: '2026-08-20' },
      { id: 'int-2', title: 'Intimação Arquivada', status: 'arquivada', text: 'Texto arquivado', publishedAt: '2026-08-20' },
      { id: 'int-3', title: 'Intimação Conferida', status: 'prazo', text: 'Texto conferido', publishedAt: '2026-08-20' }
    ]
  };
  const result = migrate7To8(input);
  assert.equal(result.schemaVersion, 8);
  assert.equal(result.dataVersion, 8);
  assert.equal(result.intimations[0].treatmentStatus, 'untreated');
  assert.equal(result.intimations[0].text, 'Texto original');
  assert.equal(result.intimations[1].treatmentStatus, 'discarded');
  assert.equal(result.intimations[1].discardedAt, null, 'discardedAt must not be fabricated from publishedAt');
  assert.equal(result.intimations[2].treatmentStatus, 'treated');
  assert.equal(result.intimations[2].treatedAt, null, 'treatedAt must not be fabricated from publishedAt');
});

test('migrate8To9 cleanses legacy fabricated timestamps on migrated records', () => {
  const input = {
    schemaVersion: 8,
    intimations: [
      {
        id: 'int-1',
        treatmentStatus: 'treated',
        treatedBy: 'Sistema (Migração)',
        treatedAt: '2026-08-20',
        publishedAt: '2026-08-20'
      },
      {
        id: 'int-2',
        treatmentStatus: 'treated',
        treatedBy: 'Dr. Ricardo',
        treatedAt: '2026-08-20T10:00:00.000Z',
        publishedAt: '2026-08-20'
      },
      {
        id: 'int-3',
        treatmentStatus: 'discarded',
        discardedBy: 'Sistema (Migração)',
        discardedAt: '2026-08-20',
        publishedAt: '2026-08-20'
      }
    ]
  };
  const result = migrate8To9(input);
  assert.equal(result.schemaVersion, 9);
  assert.equal(result.dataVersion, 9);
  assert.equal(result.intimations[0].treatedAt, null, 'Fabricated timestamp must be cleansed to null');
  assert.equal(result.intimations[1].treatedAt, '2026-08-20T10:00:00.000Z', 'Real user timestamp must be preserved');
  assert.equal(result.intimations[2].discardedAt, null, 'Fabricated timestamp must be cleansed to null');
});

test('migrate9To10 initializes canonical document metadata without inventing files', () => {
  const input = { schemaVersion: 9, dataVersion: 9, settings: { officeName: 'Escritório preservado' } };
  const result = migrate9To10(input);
  assert.equal(result.schemaVersion, 10);
  assert.equal(result.dataVersion, 10);
  assert.deepEqual(result.documents, []);
  assert.equal(result.settings.documentNamingTemplate, '');
  assert.equal(result.settings.officeName, 'Escritório preservado');
});

// ─────────────────────────────────────────
// Summary
// ─────────────────────────────────────────
console.log('\n═══════════════════════════════════════════');
console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log('═══════════════════════════════════════════\n');

if (failed > 0) process.exit(1);
