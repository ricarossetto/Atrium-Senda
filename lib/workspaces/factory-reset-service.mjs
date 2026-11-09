import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_PRESERVED = new Set(['security.json']);
export const CONTROL_PLANE_ENTRIES = Object.freeze(['system', 'tenants']);
const CONTROL_PLANE_PRESERVED = new Set(CONTROL_PLANE_ENTRIES);
const ROOT_ONLY_PRESERVED = Object.freeze(['.factory-reset', 'workspaces']);
const locks = new Map();

function failure(message, statusCode = 400, code = 'FACTORY_RESET_FAILED') {
  return Object.assign(new Error(message), { statusCode, code });
}

function safeWorkspaceId(value) {
  const id = String(value || '').trim();
  if (!id || id === '.' || id === '..' || !/^[A-Za-z0-9][A-Za-z0-9_-]{1,127}$/.test(id)) {
    throw failure('Escritório inválido.', 400, 'INVALID_WORKSPACE');
  }
  return id;
}

function relativeSafe(root, candidate) {
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw failure('Diretório de escritório inválido.', 400, 'INVALID_WORKSPACE_PATH');
  return relative;
}

async function inventory(root, current = root, result = []) {
  for (const item of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, item.name);
    const relative = path.relative(root, absolute);
    if (item.isDirectory()) await inventory(root, absolute, result);
    else {
      const details = await lstat(absolute).catch(() => null);
      if (details) {
        result.push({ path: relative, bytes: details.size });
      }
    }
  }
  return result;
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${randomUUID()}`;
  await writeFile(temporary, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, file).catch(async error => {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  });
}

export class FactoryResetService {
  constructor({ dataDirectory, workspaceDirectory, workspaceId, isDefaultWorkspace = false, securityAdapter, reauthenticationVerifier, adapters = [], preservedEntries = [], now = () => new Date().toISOString(), logger = console } = {}) {
    if (!dataDirectory || !workspaceDirectory) throw new TypeError('dataDirectory e workspaceDirectory são obrigatórios.');
    this.dataDirectory = path.resolve(dataDirectory);
    this.workspaceId = safeWorkspaceId(workspaceId);
    this.workspaceDirectory = path.resolve(workspaceDirectory);
    if (isDefaultWorkspace) {
      if (this.workspaceDirectory !== this.dataDirectory) throw failure('Diretório do escritório padrão não corresponde ao diretório oficial.', 400, 'INVALID_WORKSPACE_PATH');
    } else if (this.workspaceDirectory !== path.join(this.dataDirectory, 'workspaces', this.workspaceId)) {
      throw failure('Diretório do escritório não corresponde ao resolvedor oficial.', 400, 'INVALID_WORKSPACE_PATH');
    }
    if (!isDefaultWorkspace) relativeSafe(path.join(this.dataDirectory, 'workspaces'), this.workspaceDirectory);
    this.isDefaultWorkspace = Boolean(isDefaultWorkspace);
    this.security = securityAdapter;
    this.reauthenticationVerifier = reauthenticationVerifier;
    this.adapters = Array.isArray(adapters) ? adapters.filter(Boolean) : [];
    this.preservedEntries = new Set([...DEFAULT_PRESERVED, ...preservedEntries.map(String)]);
    if (this.isDefaultWorkspace) {
      for (const entry of ROOT_ONLY_PRESERVED) this.preservedEntries.add(entry);
      for (const entry of CONTROL_PLANE_ENTRIES) this.preservedEntries.add(entry);
    }
    this.now = now;
    this.logger = logger;
  }

  async listMovableEntries() {
    if (!existsSync(this.workspaceDirectory)) return [];
    const movable = [];
    for (const item of await readdir(this.workspaceDirectory, { withFileTypes: true })) {
      if (this.preservedEntries.has(item.name)) continue;
      if (this.isDefaultWorkspace && CONTROL_PLANE_PRESERVED.has(item.name)) {
        throw failure('Dados de control-plane não podem ser redefinidos.', 500, 'CONTROL_PLANE_PROTECTED');
      }
      movable.push(item);
    }
    return movable;
  }

  async plan({ actor, workspaceId = this.workspaceId } = {}) {
    this.assertCallerWorkspace(workspaceId, actor);
    await this.assertAuthorized(actor);
    const entries = (await this.listMovableEntries()).map(item => item.name);
    const files = [];
    for (const entry of entries) {
      const absolute = path.join(this.workspaceDirectory, entry);
      const info = await lstat(absolute).catch(() => null);
      if (!info) continue;
      if (!info.isDirectory()) files.push({ path: entry, bytes: info.size });
      else files.push(...await inventory(this.workspaceDirectory, absolute, []));
    }
    for (const adapter of this.adapters) if (typeof adapter.plan === 'function') files.push(...(await adapter.plan({ workspaceId: this.workspaceId })) || []);
    return { workspaceId: this.workspaceId, destructive: true, preservedEntries: [...this.preservedEntries], entries: files, generatedAt: this.now() };
  }

  async execute({ actor, workspaceId = this.workspaceId, confirmationToken, reauthenticationProof, request, dryRun = false } = {}) {
    this.assertCallerWorkspace(workspaceId, actor);
    await this.assertAuthorized(actor);
    if (typeof this.reauthenticationVerifier !== 'function' || !await this.reauthenticationVerifier({ actor, proof: reauthenticationProof, workspaceId: this.workspaceId })) throw failure('A redefinição exige reautenticação.', 403, 'REAUTH_REQUIRED');
    if (String(confirmationToken || '') !== 'ZERAR_ESCRITORIO') throw failure('Confirmação inválida.', 400, 'CONFIRMATION_REQUIRED');
    if (!this.security || typeof this.security.preserveWorkspaceMasterIdentity !== 'function' || typeof this.security.initializeWorkspaceAfterReset !== 'function') throw failure('Adapter de identidade incompleto para redefinição segura.', 500, 'SECURITY_ADAPTER_REQUIRED');
    const preview = await this.plan({ actor, workspaceId });
    if (dryRun) return { dryRun: true, manifest: preview };
    const operationId = randomUUID();
    const lock = await this.acquireLock(operationId);
    const quarantine = path.join(this.dataDirectory, '.factory-reset', this.workspaceId, operationId);
    const manifest = { operationId, workspaceId: this.workspaceId, isDefaultWorkspace: this.isDefaultWorkspace, startedAt: this.now(), status: 'running', preservedEntries: [...this.preservedEntries], entries: preview.entries, movedEntries: [], quarantine };
    const moved = [];
    const acquired = [];
    const snapshots = [];
    const resetsStarted = new Set();
    try {
      await writeJson(path.join(quarantine, 'manifest.json'), manifest);
      if (typeof this.security?.snapshotFactoryResetIdentity === 'function') {
        const identitySnapshot = await this.security.snapshotFactoryResetIdentity({ workspaceId: this.workspaceId, operationId });
        snapshots.push({ adapter: this.security, value: identitySnapshot });
        if (typeof this.security.persistFactoryResetIdentitySnapshot === 'function') {
          await this.security.persistFactoryResetIdentitySnapshot({ file: path.join(quarantine, 'identity-snapshot.json'), snapshot: identitySnapshot });
        }
      }
      for (const adapter of this.adapters) {
        if (typeof adapter.acquireResetGuard === 'function') { await adapter.acquireResetGuard({ workspaceId: this.workspaceId, operationId }); acquired.push(adapter); }
        if (typeof adapter.snapshot === 'function') snapshots.push({ adapter, value: await adapter.snapshot({ workspaceId: this.workspaceId, operationId }) });
        if (typeof adapter.beforeReset === 'function') await adapter.beforeReset({ workspaceId: this.workspaceId, operationId, manifest });
      }
      await mkdir(quarantine, { recursive: true });
      for (const item of await this.listMovableEntries()) {
        const from = path.join(this.workspaceDirectory, item.name);
        const to = path.join(quarantine, item.name);
        try {
          await rename(from, to);
        } catch (error) {
          // SQLite no Windows renomeia -wal/-shm para nomes .tmp transitórios durante o
          // close dos bancos. Uma entrada que desapareceu entre a listagem e o move é
          // transitória e não pode abortar o reset (role para rollback indevidamente).
          if (error?.code === 'ENOENT') {
            this.logger.warn?.(`[FactoryReset] Entrada transitória ignorada no workspace ${this.workspaceId}: ${item.name}`);
            continue;
          }
          throw error;
        }
        moved.push({ from, to });
        manifest.movedEntries.push(item.name);
        await writeJson(path.join(quarantine, 'manifest.json'), manifest);
      }
      await this.security.preserveWorkspaceMasterIdentity({ workspaceId: this.workspaceId, username: actor.username, req: request });
      for (const adapter of this.adapters) if (typeof adapter.reset === 'function') { resetsStarted.add(adapter); await adapter.reset({ workspaceId: this.workspaceId, operationId, manifest }); }
      await this.security.initializeWorkspaceAfterReset({ workspaceId: this.workspaceId, actor, operationId });
      manifest.status = 'completed'; manifest.completedAt = this.now();
      await writeJson(path.join(quarantine, 'manifest.json'), manifest);
      return { ok: true, operationId, workspaceId: this.workspaceId, manifest: { ...manifest, quarantine: undefined } };
    } catch (cause) {
      this.logger.error?.(`[FactoryReset] Falha no workspace ${this.workspaceId}: ${cause?.message || 'erro desconhecido'}`);
      const rollbackErrors = [];
      for (const { adapter, value } of snapshots.reverse()) {
        // Só reverte adapters cujo reset realmente começou; chamar um restore destrutivo
        // (que remove arquivos assumindo a quarentena) sem reset apagaria dados intactos.
        if (adapter !== this.security && !resetsStarted.has(adapter)) continue;
        const restore = adapter === this.security ? adapter.restoreFactoryResetIdentity : adapter.restore;
        if (typeof restore !== 'function') continue;
        try { await restore.call(adapter, { workspaceId: this.workspaceId, operationId, snapshot: value }); } catch (err) { rollbackErrors.push(err); }
      }
      for (const item of moved.reverse()) {
        try { await mkdir(path.dirname(item.from), { recursive: true }); await rename(item.to, item.from); } catch (err) { rollbackErrors.push(err); }
      }
      manifest.status = rollbackErrors.length ? 'rollback_incomplete' : 'rolled_back'; manifest.failedAt = this.now(); manifest.errorCode = cause.code || 'FACTORY_RESET_FAILED';
      await writeJson(path.join(quarantine, 'manifest.json'), manifest).catch(() => {});
      if (rollbackErrors.length) throw failure('A redefinição falhou e a restauração ficou incompleta.', 500, 'RESET_ROLLBACK_INCOMPLETE');
      throw failure('A redefinição falhou e foi revertida.', 500, 'FACTORY_RESET_ROLLED_BACK');
    } finally {
      for (const adapter of acquired.reverse()) if (typeof adapter.releaseResetGuard === 'function') await adapter.releaseResetGuard({ workspaceId: this.workspaceId, operationId }).catch(() => {});
      await lock.release();
    }
  }

  assertCallerWorkspace(workspaceId, actor) {
    if (String(workspaceId || '') !== this.workspaceId || String(actor?.workspaceId || '') !== this.workspaceId) throw failure('O escritório da sessão não corresponde ao alvo.', 403, 'WORKSPACE_MISMATCH');
  }
  async assertAuthorized(actor) {
    if (String(actor?.role || '') !== 'master_admin') throw failure('Apenas o administrador principal pode redefinir o escritório.', 403, 'FORBIDDEN');
    if (!this.security || typeof this.security.authorizeFactoryReset !== 'function') return;
    if (!await this.security.authorizeFactoryReset({ ...actor, workspaceId: this.workspaceId })) throw failure('Operação não autorizada.', 403, 'FORBIDDEN');
  }
  async acquireLock(operationId) {
    if (locks.has(this.workspaceId)) throw failure('Já existe uma redefinição em andamento para este escritório.', 409, 'RESET_IN_PROGRESS');
    const lockDirectory = path.join(this.dataDirectory, '.factory-reset', this.workspaceId);
    await mkdir(lockDirectory, { recursive: true });
    const lockFile = path.join(lockDirectory, '.lock');
    let handle;
    try { handle = await open(lockFile, 'wx'); await handle.writeFile(JSON.stringify({ operationId, at: this.now() })); } catch (cause) { await handle?.close().catch(() => {}); throw failure('Já existe uma redefinição em andamento para este escritório.', 409, 'RESET_IN_PROGRESS'); }
    locks.set(this.workspaceId, operationId);
    return { release: async () => { locks.delete(this.workspaceId); await handle.close(); await rm(lockFile, { force: true }); } };
  }
}

export function createFactoryResetService(options) { return new FactoryResetService(options); }

export async function planFactoryReset(options, request) {
  return createFactoryResetService(options).plan(request);
}

export async function executeFactoryReset(options, request) {
  return createFactoryResetService(options).execute(request);
}

export async function recoverInterruptedFactoryResets({ dataDirectory, securityAdapter, logger = console } = {}) {
  const root = path.resolve(dataDirectory || '');
  const resetRoot = path.join(root, '.factory-reset');
  if (!dataDirectory || !existsSync(resetRoot)) return { recovered: 0 };
  let recovered = 0;
  for (const workspaceEntry of await readdir(resetRoot, { withFileTypes: true })) {
    if (!workspaceEntry.isDirectory()) continue;
    const workspaceId = safeWorkspaceId(workspaceEntry.name);
    const workspaceResetRoot = path.join(resetRoot, workspaceId);
    for (const operationEntry of await readdir(workspaceResetRoot, { withFileTypes: true })) {
      if (!operationEntry.isDirectory()) continue;
      const quarantine = path.join(workspaceResetRoot, operationEntry.name);
      const manifestFile = path.join(quarantine, 'manifest.json');
      if (!existsSync(manifestFile)) continue;
      let manifest;
      try { manifest = JSON.parse(await readFile(manifestFile, 'utf8')); } catch (error) {
        logger.error?.(`[FactoryReset] Manifesto ilegível em ${quarantine}: ${error.message}`);
        throw failure('Existe uma redefinição interrompida com manifesto ilegível. O workspace permanece bloqueado para recuperação manual.', 500, 'RESET_RECOVERY_REQUIRED');
      }
      if (manifest.status === 'rollback_incomplete') throw failure('Existe uma redefinição com rollback incompleto. O workspace permanece bloqueado.', 500, 'RESET_RECOVERY_REQUIRED');
      if (manifest.status !== 'running') continue;
      if (String(manifest.workspaceId || workspaceId) !== workspaceId) {
        logger.error?.(`[FactoryReset] Manifesto com workspace divergente em ${quarantine}.`);
        throw failure('Existe uma redefinição interrompida com workspace divergente. O workspace permanece bloqueado para recuperação manual.', 500, 'RESET_RECOVERY_REQUIRED');
      }
      const workspaceDirectory = manifest.isDefaultWorkspace
        ? root
        : path.join(root, 'workspaces', workspaceId);
      const restorable = (await readdir(quarantine, { withFileTypes: true }))
        .filter(item => !['manifest.json', 'identity-snapshot.json'].includes(item.name) && !item.name.includes('.tmp-'));
      if (!manifest.isDefaultWorkspace) {
        for (const item of restorable) {
          if (CONTROL_PLANE_PRESERVED.has(item.name)) {
            logger.error?.(`[FactoryReset] Control-plane em quarentena de tenant em ${quarantine}.`);
            throw failure('A redefinição interrompida contém dados de control-plane. O workspace permanece bloqueado para recuperação manual.', 500, 'RESET_RECOVERY_REQUIRED');
          }
        }
      }
      const identitySnapshotFile = path.join(quarantine, 'identity-snapshot.json');
      if (existsSync(identitySnapshotFile)) {
        if (typeof securityAdapter?.restorePersistedFactoryResetIdentitySnapshot !== 'function') {
          throw failure('A recuperação exige o restaurador do snapshot de identidade.', 500, 'RESET_RECOVERY_REQUIRED');
        }
        await securityAdapter.restorePersistedFactoryResetIdentitySnapshot({ workspaceId, file: identitySnapshotFile });
      } else {
        throw failure('Snapshot de identidade ausente para uma redefinição interrompida.', 500, 'RESET_RECOVERY_REQUIRED');
      }
      for (const item of restorable) {
        const target = path.join(workspaceDirectory, item.name);
        await rm(target, { recursive: true, force: true });
        await mkdir(path.dirname(target), { recursive: true });
        await rename(path.join(quarantine, item.name), target);
      }
      manifest.status = 'recovered_after_interruption';
      manifest.recoveredAt = new Date().toISOString();
      await writeJson(manifestFile, manifest);
      recovered++;
    }
    await rm(path.join(workspaceResetRoot, '.lock'), { force: true });
  }
  return { recovered };
}
