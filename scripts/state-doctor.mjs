#!/usr/bin/env node
/**
 * ATRIUM State Doctor — Ferramenta CLI de Diagnóstico e Manutenção de Estado
 *
 * Uso:
 *   node scripts/state-doctor.mjs status        — Exibe metadados de versão, schema, backups e integridade.
 *   node scripts/state-doctor.mjs validate       — Executa validateAppState e relata anomalias.
 *   node scripts/state-doctor.mjs backup         — Gera backup cifrado sob demanda.
 *   node scripts/state-doctor.mjs migrate        — Executa migrations pendentes de forma segura.
 *   node scripts/state-doctor.mjs list-profiles  — Lista perfis de sessão judicial em disco.
 */
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.resolve(process.env.JURISFLOW_DATA_DIR || process.env.KELLER_DATA_DIR || path.join(ROOT, 'data'));
const APP_STATE_FILE = path.join(DATA_DIR, 'app-state.json');
const MIGRATIONS_DIR = path.join(DATA_DIR, 'migrations', 'pre-migration');
const RECOVERY_DIR = path.join(DATA_DIR, 'recovery');

async function loadEnv(file) {
  if (!existsSync(file)) return;
  const source = await readFile(file, 'utf8');
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const sep = line.indexOf('=');
    if (sep < 1) continue;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

await loadEnv(path.join(ROOT, '.env'));

const { SecurityManager } = await import(pathToFileURL(path.join(ROOT, 'lib', 'security.mjs')).href);
const {
  CURRENT_SCHEMA_VERSION,
  CURRENT_DATA_VERSION,
  runStateMigrations,
  validateAppState,
  applySafeDefaults,
  FutureSchemaError,
  CorruptedStateError
} = await import(pathToFileURL(path.join(ROOT, 'lib', 'state-migrations.mjs')).href);

const security = new SecurityManager({
  dataDirectory: DATA_DIR,
  sessionSecret: process.env.AUTH_SESSION_SECRET || randomBytes(48).toString('base64url'),
  encryptionKey: process.env.AUTH_ENCRYPTION_KEY || '',
  secureCookies: false
});
await security.init();

function hr() { console.log('─'.repeat(60)); }

async function readEnvelope() {
  if (!existsSync(APP_STATE_FILE)) return null;
  const raw = await readFile(APP_STATE_FILE, 'utf8');
  return JSON.parse(raw);
}

async function decryptEnvelope(envelope) {
  if (!envelope?.encrypted) throw new Error('Envelope inválido — sem payload criptografado.');
  return JSON.parse(security.decrypt(envelope.encrypted));
}

async function cmdStatus() {
  console.log('\n🔍 ATRIUM STATE DOCTOR — STATUS\n');
  hr();

  const fileExists = existsSync(APP_STATE_FILE);
  console.log(`Estado Arquivo:       ${fileExists ? '✅ Presente' : '❌ Não encontrado'}`);
  console.log(`Data Directory:       ${DATA_DIR}`);
  console.log(`Expected Schema:      v${CURRENT_SCHEMA_VERSION}`);

  if (!fileExists) {
    console.log('\nNenhum estado persistido. O servidor iniciará com NEW_INSTALL.');
    return;
  }

  try {
    const info = await stat(APP_STATE_FILE);
    console.log(`Tamanho:              ${(info.size / 1024).toFixed(1)} KB`);
    console.log(`Última Modificação:   ${info.mtime.toISOString()}`);
  } catch {}

  try {
    const envelope = await readEnvelope();
    console.log(`Envelope Version:     ${envelope.version || '?'}`);
    console.log(`Envelope Schema:      ${envelope.schemaVersion || '(não declarado)'}`);
    console.log(`Revision:             ${envelope.revision || envelope.updatedAt || '?'}`);

    const state = await decryptEnvelope(envelope);
    const foundVer = Number(state.schemaVersion ?? state.version ?? 1);
    console.log(`\nSchema Interno:       v${foundVer}`);
    console.log(`Data Version:         ${state.dataVersion || '?'}`);
    console.log(`App Version:          ${state.appVersion || '?'}`);
    console.log(`Migrated At:          ${state.migratedAt || 'nunca'}`);
    console.log(`Migration History:    ${Array.isArray(state.migrationHistory) ? state.migrationHistory.length : 0} entradas`);

    hr();
    console.log('Registros:');
    for (const col of ['processes', 'contacts', 'tasks', 'intimations', 'agenda', 'audit', 'terms', 'sources']) {
      const count = Array.isArray(state[col]) ? state[col].length : 0;
      console.log(`  ${col.padEnd(16)} ${count}`);
    }

    if (foundVer < CURRENT_SCHEMA_VERSION) {
      console.log(`\n⚠️  Migração pendente: v${foundVer} → v${CURRENT_SCHEMA_VERSION}`);
    } else if (foundVer > CURRENT_SCHEMA_VERSION) {
      console.log(`\n❌ FUTURE SCHEMA: v${foundVer} > v${CURRENT_SCHEMA_VERSION}. Atualize o ATRIUM.`);
    } else {
      console.log(`\n✅ Schema atual (v${CURRENT_SCHEMA_VERSION}) — sem migrações pendentes.`);
    }
  } catch (err) {
    console.log(`\n❌ Falha ao ler estado: ${err.message}`);
  }

  hr();

  // Backups
  let backupCount = 0;
  try {
    if (existsSync(MIGRATIONS_DIR)) {
      const files = await readdir(MIGRATIONS_DIR);
      backupCount = files.filter(f => f.endsWith('.atrium-backup')).length;
    }
  } catch {}
  console.log(`Backups pré-migração: ${backupCount}`);

  let recoveryCount = 0;
  try {
    if (existsSync(RECOVERY_DIR)) {
      const files = await readdir(RECOVERY_DIR);
      recoveryCount = files.filter(f => f.endsWith('.json')).length;
    }
  } catch {}
  console.log(`Arquivos quarentena:  ${recoveryCount}`);
  console.log('');
}

async function cmdValidate() {
  console.log('\n🔍 ATRIUM STATE DOCTOR — VALIDATE\n');
  hr();

  if (!existsSync(APP_STATE_FILE)) {
    console.log('❌ Arquivo de estado não encontrado. Nada a validar.');
    process.exit(1);
  }

  try {
    const envelope = await readEnvelope();
    const state = await decryptEnvelope(envelope);
    const result = validateAppState(state, null);
    console.log(`✅ Estado válido — Schema v${result.schemaVersion}, Data v${result.dataVersion}`);

    if (result.schemaVersion < CURRENT_SCHEMA_VERSION) {
      console.log(`⚠️  Schema desatualizado (v${result.schemaVersion} < v${CURRENT_SCHEMA_VERSION}). Execute 'migrate'.`);
    }
  } catch (err) {
    if (err instanceof FutureSchemaError) {
      console.log(`❌ FUTURE SCHEMA: ${err.message}`);
    } else if (err instanceof CorruptedStateError) {
      console.log(`❌ CORROMPIDO: ${err.message}`);
    } else {
      console.log(`❌ Erro: ${err.message}`);
    }
    process.exit(1);
  }
  console.log('');
}

async function cmdBackup() {
  console.log('\n🔒 ATRIUM STATE DOCTOR — BACKUP\n');
  hr();

  if (!existsSync(APP_STATE_FILE)) {
    console.log('❌ Nenhum estado para backup.');
    process.exit(1);
  }

  await mkdir(MIGRATIONS_DIR, { recursive: true });
  const raw = await readFile(APP_STATE_FILE, 'utf8');
  const filename = `manual-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.atrium-backup`;
  const target = path.join(MIGRATIONS_DIR, filename);
  await writeFile(target, raw, 'utf8');
  console.log(`✅ Backup criado: ${target}`);
  console.log('');
}

async function cmdMigrate() {
  console.log('\n🔄 ATRIUM STATE DOCTOR — MIGRATE\n');
  hr();

  if (!existsSync(APP_STATE_FILE)) {
    console.log('❌ Nenhum estado para migrar.');
    process.exit(1);
  }

  const envelope = await readEnvelope();
  const state = await decryptEnvelope(envelope);
  const foundVer = Number(state.schemaVersion ?? state.version ?? 1);

  if (foundVer >= CURRENT_SCHEMA_VERSION) {
    console.log(`✅ Já na versão atual (v${foundVer}). Sem migrações pendentes.`);
    return;
  }

  console.log(`Migrando: v${foundVer} → v${CURRENT_SCHEMA_VERSION}`);

  // Backup obrigatório
  await mkdir(MIGRATIONS_DIR, { recursive: true });
  const backupFile = `pre-migration-${new Date().toISOString().replace(/[:.]/g, '-')}.atrium-backup`;
  await writeFile(path.join(MIGRATIONS_DIR, backupFile), JSON.stringify(envelope, null, 2), 'utf8');
  console.log(`📦 Backup pré-migração: ${backupFile}`);

  const result = runStateMigrations(state, '2.0.0');
  console.log(`✅ Migrações aplicadas: ${result.migrationsApplied.join(', ')}`);

  // Salvar atomicamente
  const newEnvelope = {
    version: 1,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    algorithm: 'aes-256-gcm',
    revision: randomBytes(18).toString('base64url'),
    encrypted: security.encrypt(JSON.stringify(result.state)),
    updatedAt: new Date().toISOString()
  };
  const tmpFile = `${APP_STATE_FILE}.tmp-${randomBytes(6).toString('hex')}`;
  await writeFile(tmpFile, JSON.stringify(newEnvelope, null, 2), 'utf8');
  const { rename } = await import('node:fs/promises');
  await rename(tmpFile, APP_STATE_FILE);
  console.log(`✅ Estado migrado e salvo atomicamente.`);
  console.log('');
}

async function cmdListProfiles() {
  console.log('\n🏛️ ATRIUM STATE DOCTOR — LIST PROFILES\n');
  hr();

  const profilesDir = path.join(DATA_DIR, 'browser-profiles');
  if (!existsSync(profilesDir)) {
    console.log('Nenhum perfil de tribunal encontrado.');
    return;
  }

  const users = await readdir(profilesDir, { withFileTypes: true });
  let count = 0;
  for (const u of users) {
    if (!u.isDirectory()) continue;
    const portals = await readdir(path.join(profilesDir, u.name), { withFileTypes: true });
    for (const p of portals) {
      if (!p.isDirectory()) continue;
      const profilePath = path.join(profilesDir, u.name, p.name);
      try {
        const info = await stat(profilePath);
        console.log(`  👤 ${u.name} / 🏛️ ${p.name}  — modificado: ${info.mtime.toISOString()}`);
        count++;
      } catch {
        console.log(`  👤 ${u.name} / 🏛️ ${p.name}  — (sem informação)`);
        count++;
      }
    }
  }
  console.log(`\nTotal: ${count} perfil(is) de tribunal.`);
  console.log('');
}

// Main
const command = process.argv[2] || 'status';
switch (command) {
  case 'status': await cmdStatus(); break;
  case 'validate': await cmdValidate(); break;
  case 'backup': await cmdBackup(); break;
  case 'migrate': await cmdMigrate(); break;
  case 'list-profiles': await cmdListProfiles(); break;
  default:
    console.log(`Comando desconhecido: ${command}`);
    console.log('Uso: node scripts/state-doctor.mjs [status|validate|backup|migrate|list-profiles]');
    process.exit(1);
}
