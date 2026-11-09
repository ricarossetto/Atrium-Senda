import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FactoryResetService, recoverInterruptedFactoryResets } from '../lib/workspaces/factory-reset-service.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'atrium-factory-reset-'));
const wsA = path.join(root, 'workspaces', 'ws-a');
const wsB = path.join(root, 'workspaces', 'ws-b');
await mkdir(path.join(wsA, 'documents', 'blobs'), { recursive: true });
await mkdir(path.join(wsA, 'judicial', 'browser-profiles'), { recursive: true });
await mkdir(path.join(wsA, 'branding'), { recursive: true });
await mkdir(wsB, { recursive: true });
await writeFile(path.join(wsA, 'security.json'), 'master-contract');
await writeFile(path.join(wsA, 'app-state.json'), JSON.stringify({ processes: ['synthetic-process'], contacts: ['synthetic-client'], tasks: ['synthetic-task'], intimations: ['synthetic-publication'], financial: ['synthetic-entry'], notifications: ['synthetic-notification'] }));
await writeFile(path.join(wsA, 'documents', 'synthetic.pdf'), 'synthetic-document');
for (const [relative, content] of Object.entries({
  'documents/metadata.json': 'synthetic-document-metadata',
  'documents/blobs/synthetic-blob.bin': 'synthetic-document-blob',
  'runtime.json': 'synthetic-movements-and-activity',
  'judicial/judicial-integrations.json': 'synthetic-judicial-credentials-and-totp',
  'judicial/judicial-sessions.json': 'synthetic-judicial-sessions',
  'judicial/eproc-scheduled-slots.json': 'synthetic-eproc-slots',
  'judicial/eproc-sync-slots.sqlite': 'synthetic-sqlite-slots',
  'judicial/browser-profiles/profile/Preferences': 'synthetic-browser-profile',
  'notifications.sqlite': 'synthetic-mail-outbox-and-preferences',
  'dav-integrations.json': 'synthetic-dav-config',
  'ai-secrets.json': 'synthetic-ai-secret-envelope',
  'imports/import-history.json': 'synthetic-imports',
  'audit/operational.json': 'synthetic-operational-audit',
  'branding/office-logo.svg': 'synthetic-branding'
})) {
  const full = path.join(wsA, relative);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}
await writeFile(path.join(wsB, 'app-state.json'), 'other-workspace-state');

const actor = { username: 'master.synthetic', role: 'master_admin', workspaceId: 'ws-a' };
const reauthenticationVerifier = async ({ proof }) => proof === 'synthetic-reauth-proof';
let preservedCalls = 0;
let resetCalls = 0;
const securityAdapter = {
  async authorizeFactoryReset() { return true; },
  async preserveWorkspaceMasterIdentity({ workspaceId }) {
    assert.equal(workspaceId, 'ws-a');
    preservedCalls++;
  },
  async initializeWorkspaceAfterReset({ workspaceId }) {
    await writeFile(path.join(wsA, 'onboarding-required.json'), JSON.stringify({ workspaceId, required: true }));
    await writeFile(path.join(wsA, 'app-state.json'), JSON.stringify({ processes: [], contacts: [], tasks: [], intimations: [], financial: [], documents: [], settings: { guidedTourSeen: false } }));
  }
};
const credentialAdapter = {
  async snapshot() { return { credential: 'synthetic-only' }; },
  async reset({ workspaceId }) { assert.equal(workspaceId, 'ws-a'); resetCalls++; }
};

const service = new FactoryResetService({ dataDirectory: root, workspaceDirectory: wsA, workspaceId: 'ws-a', securityAdapter, reauthenticationVerifier, adapters: [credentialAdapter] });
const preview = await service.execute({ actor, confirmationToken: 'ZERAR_ESCRITORIO', reauthenticationProof: 'synthetic-reauth-proof', dryRun: true });
assert.equal(preview.dryRun, true);
assert.ok(preview.manifest.entries.some(item => item.path.endsWith('synthetic.pdf')));
assert.ok(preview.manifest.entries.some(item => item.path.endsWith('notifications.sqlite')));
assert.ok(preview.manifest.entries.some(item => item.path.endsWith(path.join('judicial', 'eproc-sync-slots.sqlite'))));
assert.equal(await readFile(path.join(wsA, 'app-state.json'), 'utf8').then(() => true).catch(() => false), true);

const result = await service.execute({ actor, confirmationToken: 'ZERAR_ESCRITORIO', reauthenticationProof: 'synthetic-reauth-proof' });
assert.equal(result.ok, true);
assert.equal(preservedCalls, 1);
assert.equal(resetCalls, 1);
assert.equal(await readFile(path.join(wsA, 'security.json'), 'utf8'), 'master-contract');
assert.deepEqual((await readdir(wsA)).sort(), ['app-state.json', 'onboarding-required.json', 'security.json']);
assert.deepEqual(JSON.parse(await readFile(path.join(wsA, 'app-state.json'), 'utf8')), { processes: [], contacts: [], tasks: [], intimations: [], financial: [], documents: [], settings: { guidedTourSeen: false } });
assert.equal(await readFile(path.join(wsB, 'app-state.json'), 'utf8'), 'other-workspace-state');
assert.equal(await readFile(path.join(wsB, 'app-state.json'), 'utf8'), 'other-workspace-state', 'bytes do outro tenant permanecem intactos');
const manifest = JSON.parse(await readFile(path.join(root, '.factory-reset', 'ws-a', result.operationId, 'manifest.json'), 'utf8'));
assert.equal(manifest.status, 'completed');

await assert.rejects(() => service.execute({ actor, confirmationToken: 'ZERAR_ESCRITORIO', reauthenticationProof: 'wrong-proof' }), error => error.code === 'REAUTH_REQUIRED');
await assert.rejects(() => service.execute({ actor, confirmationToken: 'WRONG', reauthenticationProof: 'synthetic-reauth-proof' }), error => error.code === 'CONFIRMATION_REQUIRED');
await assert.rejects(() => service.execute({ actor: { ...actor, workspaceId: 'ws-b' }, confirmationToken: 'ZERAR_ESCRITORIO', reauthenticationProof: 'synthetic-reauth-proof' }), error => error.code === 'WORKSPACE_MISMATCH');

const failureRoot = await mkdtemp(path.join(os.tmpdir(), 'atrium-factory-reset-failure-'));
const failureWs = path.join(failureRoot, 'workspaces', 'ws-fail');
await mkdir(failureWs, { recursive: true });
await writeFile(path.join(failureWs, 'security.json'), 'master');
await writeFile(path.join(failureWs, 'app-state.json'), 'keep-on-failure');
const failing = new FactoryResetService({ dataDirectory: failureRoot, workspaceDirectory: failureWs, workspaceId: 'ws-fail', reauthenticationVerifier, securityAdapter: { authorizeFactoryReset: () => true, preserveWorkspaceMasterIdentity: async () => {}, initializeWorkspaceAfterReset: async () => {} }, adapters: [{ reset: async () => { throw new Error('synthetic failure'); } }] });
await assert.rejects(() => failing.execute({ actor: { ...actor, workspaceId: 'ws-fail' }, confirmationToken: 'ZERAR_ESCRITORIO', reauthenticationProof: 'synthetic-reauth-proof' }), error => error.code === 'FACTORY_RESET_ROLLED_BACK');
assert.equal(await readFile(path.join(failureWs, 'app-state.json'), 'utf8'), 'keep-on-failure');
assert.equal(await readFile(path.join(failureWs, 'security.json'), 'utf8'), 'master');

const defaultRoot = await mkdtemp(path.join(os.tmpdir(), 'atrium-factory-reset-default-'));
await writeFile(path.join(defaultRoot, 'security.json'), 'default-master');
await writeFile(path.join(defaultRoot, 'app-state.json'), 'default-state');
await mkdir(path.join(defaultRoot, 'workspaces', 'ws-other'), { recursive: true });
await writeFile(path.join(defaultRoot, 'workspaces', 'ws-other', 'app-state.json'), 'other-default-root-tenant');
await mkdir(path.join(defaultRoot, 'system'), { recursive: true });
await writeFile(path.join(defaultRoot, 'system', 'platform.sqlite'), 'synthetic-platform-db');
await writeFile(path.join(defaultRoot, 'system', 'audit_anchor.json'), '{"chain":"synthetic"}');
await writeFile(path.join(defaultRoot, 'system', 'tenants.json'), '[]');
await mkdir(path.join(defaultRoot, 'tenants', 'escritorio-sintetico'), { recursive: true });
await writeFile(path.join(defaultRoot, 'tenants', 'escritorio-sintetico', 'tenant.json'), '{"slug":"escritorio-sintetico"}');
const defaultService = new FactoryResetService({
  dataDirectory: defaultRoot,
  workspaceDirectory: defaultRoot,
  workspaceId: 'ws-default',
  isDefaultWorkspace: true,
  reauthenticationVerifier,
  securityAdapter: {
    authorizeFactoryReset: () => true,
    preserveWorkspaceMasterIdentity: async () => {},
    initializeWorkspaceAfterReset: async () => {}
  }
});
const defaultResult = await defaultService.execute({
  actor: { ...actor, workspaceId: 'ws-default' },
  confirmationToken: 'ZERAR_ESCRITORIO',
  reauthenticationProof: 'synthetic-reauth-proof'
});
assert.equal(await readFile(path.join(defaultRoot, 'security.json'), 'utf8'), 'default-master');
assert.equal(await readFile(path.join(defaultRoot, 'app-state.json'), 'utf8').then(() => true).catch(() => false), false);
assert.equal(await readFile(path.join(defaultRoot, 'workspaces', 'ws-other', 'app-state.json'), 'utf8'), 'other-default-root-tenant');
assert.equal(await readFile(path.join(defaultRoot, 'system', 'platform.sqlite'), 'utf8'), 'synthetic-platform-db', 'control-plane platform.sqlite preservado no reset padrão');
assert.equal(await readFile(path.join(defaultRoot, 'system', 'audit_anchor.json'), 'utf8'), '{"chain":"synthetic"}', 'control-plane audit_anchor.json preservado no reset padrão');
assert.equal(await readFile(path.join(defaultRoot, 'tenants', 'escritorio-sintetico', 'tenant.json'), 'utf8'), '{"slug":"escritorio-sintetico"}', 'control-plane tenants/ preservado no reset padrão');
assert.equal(JSON.parse(await readFile(path.join(defaultRoot, '.factory-reset', 'ws-default', defaultResult.operationId, 'manifest.json'), 'utf8')).status, 'completed');
assert.throws(() => new FactoryResetService({ dataDirectory: defaultRoot, workspaceDirectory: defaultRoot, workspaceId: 'ws-default' }), /corresponde ao resolvedor/);

const incompleteRoot = await mkdtemp(path.join(os.tmpdir(), 'atrium-factory-reset-incomplete-'));
const incompleteWs = path.join(incompleteRoot, 'workspaces', 'ws-incomplete');
await mkdir(incompleteWs, { recursive: true });
await writeFile(path.join(incompleteWs, 'security.json'), 'master');
await writeFile(path.join(incompleteWs, 'app-state.json'), 'synthetic-state');
const incomplete = new FactoryResetService({
  dataDirectory: incompleteRoot,
  workspaceDirectory: incompleteWs,
  workspaceId: 'ws-incomplete',
  reauthenticationVerifier,
  securityAdapter: { authorizeFactoryReset: () => true, preserveWorkspaceMasterIdentity: async () => {}, initializeWorkspaceAfterReset: async () => {} },
  adapters: [{ snapshot: async () => ({ state: 'synthetic' }), reset: async () => { throw new Error('injected-reset-failure'); }, restore: async () => { throw new Error('injected-restore-failure'); } }]
});
await assert.rejects(() => incomplete.execute({ actor: { ...actor, workspaceId: 'ws-incomplete' }, confirmationToken: 'ZERAR_ESCRITORIO', reauthenticationProof: 'synthetic-reauth-proof' }), error => error.code === 'RESET_ROLLBACK_INCOMPLETE');
const incompleteOperation = (await readdir(path.join(incompleteRoot, '.factory-reset', 'ws-incomplete'))).find(name => name !== '.lock');
const incompleteManifest = JSON.parse(await readFile(path.join(incompleteRoot, '.factory-reset', 'ws-incomplete', incompleteOperation, 'manifest.json'), 'utf8'));
assert.equal(incompleteManifest.status, 'rollback_incomplete');
await rm(incompleteRoot, { recursive: true, force: true });
await rm(defaultRoot, { recursive: true, force: true });

const concurrentRoot = await mkdtemp(path.join(os.tmpdir(), 'atrium-factory-reset-concurrent-'));
const concurrentWs = path.join(concurrentRoot, 'workspaces', 'ws-concurrent');
await mkdir(concurrentWs, { recursive: true });
await writeFile(path.join(concurrentWs, 'security.json'), 'master');
let releaseGate;
const gate = new Promise(resolve => { releaseGate = resolve; });
const concurrent = new FactoryResetService({ dataDirectory: concurrentRoot, workspaceDirectory: concurrentWs, workspaceId: 'ws-concurrent', reauthenticationVerifier, securityAdapter: { authorizeFactoryReset: () => true, preserveWorkspaceMasterIdentity: async () => {}, initializeWorkspaceAfterReset: async () => {} }, adapters: [{ beforeReset: async () => gate }] });
const first = concurrent.execute({ actor: { ...actor, workspaceId: 'ws-concurrent' }, confirmationToken: 'ZERAR_ESCRITORIO', reauthenticationProof: 'synthetic-reauth-proof' });
await new Promise(resolve => setTimeout(resolve, 10));
await assert.rejects(() => concurrent.execute({ actor: { ...actor, workspaceId: 'ws-concurrent' }, confirmationToken: 'ZERAR_ESCRITORIO', reauthenticationProof: 'synthetic-reauth-proof' }), error => error.code === 'RESET_IN_PROGRESS');
releaseGate();
await first;
await rm(concurrentRoot, { recursive: true, force: true });

const recoveryRoot = await mkdtemp(path.join(os.tmpdir(), 'atrium-factory-reset-recovery-'));
const recoveryWorkspace = path.join(recoveryRoot, 'workspaces', 'ws-recovery');
const recoveryQuarantine = path.join(recoveryRoot, '.factory-reset', 'ws-recovery', 'operation-interrupted');
await mkdir(recoveryQuarantine, { recursive: true });
await mkdir(recoveryWorkspace, { recursive: true });
await writeFile(path.join(recoveryWorkspace, 'app-state.json'), 'partial-new-state');
await writeFile(path.join(recoveryQuarantine, 'app-state.json'), 'original-state');
await writeFile(path.join(recoveryQuarantine, 'identity-snapshot.json'), 'synthetic-encrypted-snapshot');
await writeFile(path.join(recoveryQuarantine, 'manifest.json'), JSON.stringify({ status: 'running', workspaceId: 'ws-recovery', isDefaultWorkspace: false }));
await writeFile(path.join(recoveryRoot, '.factory-reset', 'ws-recovery', '.lock'), 'stale-lock');
let identityRecovered = false;
const recovered = await recoverInterruptedFactoryResets({
  dataDirectory: recoveryRoot,
  securityAdapter: { restorePersistedFactoryResetIdentitySnapshot: async () => { identityRecovered = true; } }
});
assert.equal(recovered.recovered, 1);
assert.equal(identityRecovered, true);
assert.equal(await readFile(path.join(recoveryWorkspace, 'app-state.json'), 'utf8'), 'original-state');
assert.equal(JSON.parse(await readFile(path.join(recoveryQuarantine, 'manifest.json'), 'utf8')).status, 'recovered_after_interruption');
assert.equal(await readFile(path.join(recoveryRoot, '.factory-reset', 'ws-recovery', '.lock')).then(() => true).catch(() => false), false);
await rm(recoveryRoot, { recursive: true, force: true });

// 10. Entrada transitória (SQLite renomeia -wal/-shm para .tmp durante o close) que
// desaparece entre a listagem e o move não pode abortar o reset nem forçar rollback.
const transientRoot = await mkdtemp(path.join(os.tmpdir(), 'atrium-factory-reset-transient-'));
const transientWorkspace = path.join(transientRoot, 'workspaces', 'ws-transient');
await mkdir(transientWorkspace, { recursive: true });
await writeFile(path.join(transientWorkspace, 'app-state.json'), 'transient-workspace-state');
const transientService = new FactoryResetService({
  dataDirectory: transientRoot,
  workspaceDirectory: transientWorkspace,
  workspaceId: 'ws-transient',
  reauthenticationVerifier,
  securityAdapter: {
    authorizeFactoryReset: () => true,
    preserveWorkspaceMasterIdentity: async () => {},
    initializeWorkspaceAfterReset: async () => {}
  }
});
const originalListMovableEntries = transientService.listMovableEntries.bind(transientService);
transientService.listMovableEntries = async () => [
  ...await originalListMovableEntries(),
  { name: 'eproc-sync-slots.sqlite-shm.tmp' }
];
const transientResult = await transientService.execute({
  actor: { ...actor, workspaceId: 'ws-transient' },
  confirmationToken: 'ZERAR_ESCRITORIO',
  reauthenticationProof: 'synthetic-reauth-proof'
});
assert.equal(transientResult.ok, true, 'Entrada transitória ausente não pode abortar o reset.');
assert.equal(
  await readFile(path.join(transientWorkspace, 'app-state.json'), 'utf8').then(() => false).catch(() => true),
  true,
  'Estado real do workspace deve ter sido movido para a quarentena.'
);
await rm(transientRoot, { recursive: true, force: true });

await rm(root, { recursive: true, force: true });
await rm(failureRoot, { recursive: true, force: true });
console.log('factory reset service: isolated cleanup, identity preservation, dry-run, rollback and transient-entry tolerance passed');
