import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FactoryResetService } from '../lib/workspaces/factory-reset-service.mjs';

console.log('=== TESTE FOCAL: FACTORY RESET SYMLINK & CHROMIUM LOCK RESILIENCE ===\n');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atrium-factory-reset-test-'));
const workspaceDir = path.join(tempDir, 'workspaces', 'ws-test');
const browserProfileDir = path.join(workspaceDir, 'browser-profiles', 'agent-local', 'eproc-tjrs-1g');

fs.mkdirSync(browserProfileDir, { recursive: true });

// Cria arquivo normal
fs.writeFileSync(path.join(browserProfileDir, 'Preferences'), '{"profile": true}');

// Cria symlinks quebrados simulando SingletonCookie, SingletonLock e SingletonSocket do Chromium
if (process.platform !== 'win32') {
  fs.symlinkSync('non-existent-target-cookie', path.join(browserProfileDir, 'SingletonCookie'));
  fs.symlinkSync('instance-pid-nonexistent', path.join(browserProfileDir, 'SingletonLock'));
  fs.symlinkSync('/tmp/nonexistent-socket', path.join(browserProfileDir, 'SingletonSocket'));
} else {
  // No Windows, tenta criar symlink ou cria arquivo normal se sem privilégios
  try {
    fs.symlinkSync('non-existent-target-cookie', path.join(browserProfileDir, 'SingletonCookie'));
    fs.symlinkSync('instance-pid-nonexistent', path.join(browserProfileDir, 'SingletonLock'));
  } catch {
    // Se Windows sem Developer Mode para symlinks, continua
  }
}

const service = new FactoryResetService({
  dataDirectory: tempDir,
  workspaceDirectory: workspaceDir,
  workspaceId: 'ws-test',
  isDefaultWorkspace: false,
  securityAdapter: {
    preserveWorkspaceMasterIdentity: async () => {},
    initializeWorkspaceAfterReset: async () => {}
  },
  reauthenticationVerifier: async () => true
});

const actor = {
  username: 'admin',
  role: 'master_admin',
  workspaceId: 'ws-test'
};

// 1. Executa plan() - anteriormente falhava com ENOENT em stat(SingletonCookie)
const plan = await service.plan({ actor, workspaceId: 'ws-test' });

assert.ok(plan, 'Plan deve ser gerado');
assert.ok(Array.isArray(plan.entries), 'Entries deve ser um array');
console.log(`✓ Plan gerou ${plan.entries.length} arquivo(s) sem lançar ENOENT para symlinks do Chromium.`);

// Limpeza
fs.rmSync(tempDir, { recursive: true, force: true });
console.log('>>> FACTORY RESET SYMLINK RESILIENCE: PASS <<<\n');
