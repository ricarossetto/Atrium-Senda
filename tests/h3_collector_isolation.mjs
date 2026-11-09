import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTotp } from '../lib/security.mjs';
import { buildCollectorSpawnEnv, resolveAgentWorkspace, workspaceCollectorInputs } from '../lib/collectors/collector-context.mjs';
import { createCollectorRegistry } from '../lib/collectors/collector-jobs.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — H3: ISOLAMENTO MULTI-WORKSPACE DOS COLLECTORS        ');
console.log('===============================================================\n');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'Senha-H3-Collectors-2026!';

// ---------------------------------------------------------------------------
// U1 — Termos/OAB do workspace vêm do estado, nunca do catálogo global
// ---------------------------------------------------------------------------
console.log('[U1] workspaceCollectorInputs deriva termos do estado do workspace...');
const inputs = workspaceCollectorInputs({
  terms: [
    { id: 't1', name: 'Dra. Alfa', uf: 'RS', num: '11111', active: true },
    { id: 't2', name: 'Inativo', uf: 'SP', num: '22222', active: false },
    { id: 't3', name: 'Dr. Beta', oabUf: 'rs', oabNumber: '33333' }
  ],
  settings: { lawyerName: 'Dra. Alfa' }
});
assert.deepEqual(inputs.terms.map(term => term.name), ['Dra. Alfa', 'Dr. Beta']);
assert.equal(inputs.oabUf, 'RS');
assert.equal(inputs.oabNumber, '11111');
assert.deepEqual([...new Set(inputs.monitoredNames)].sort(), ['Dr. Beta', 'Dra. Alfa']);
assert.equal(workspaceCollectorInputs({}).terms.length, 0);

// ---------------------------------------------------------------------------
// U2 — Spawn env: segredos de tenant são removidos para workspace não-default
// ---------------------------------------------------------------------------
console.log('[U2] buildCollectorSpawnEnv isola contexto e remove segredos de tenant...');
const baseEnv = {
  PATH: 'x',
  AUTH_SESSION_SECRET: 'shared',
  A1_PFX_PATH: '/certs/default.pfx',
  A1_PFX_PASSPHRASE: 'segredo-default',
  PJE_TOTP_SECRET: 'totp-global',
  ALLOW_AUTOMATED_PORTAL_TOTP: 'true',
  TRF4_EPROC_TOTP_SECRET: 'totp-regional'
};
const defaultEnv = buildCollectorSpawnEnv({
  baseEnv, workspaceId: 'ws-default', workspaceDataDir: 'C:\\data', defaultWorkspaceId: 'ws-default',
  centralUrl: 'http://127.0.0.1:4173', terms: inputs.terms, monitoredNames: inputs.monitoredNames,
  oabUf: inputs.oabUf, oabNumber: inputs.oabNumber, portalIds: ['tjrs-eproc-1g'], headless: true, interactive: false, loginWaitSeconds: 30
});
assert.equal(defaultEnv.A1_PFX_PATH, '/certs/default.pfx', 'Default preserva fallback legado de env.');
const tenantWorkspaceId = 'ws-11111111-2222-4333-8444-555555555555';
const tenantDataDir = path.join(os.tmpdir(), 'atrium-h3-spawn', 'data', 'workspaces', tenantWorkspaceId);
const tenantEnv = buildCollectorSpawnEnv({
  baseEnv, workspaceId: tenantWorkspaceId, workspaceDataDir: tenantDataDir,
  defaultWorkspaceId: 'ws-default', spawnToken: 'spawn-token-b',
  centralUrl: 'http://127.0.0.1:4173', terms: inputs.terms, monitoredNames: inputs.monitoredNames,
  oabUf: inputs.oabUf, oabNumber: inputs.oabNumber, portalIds: ['tjrs-eproc-1g'], headless: true, interactive: false, loginWaitSeconds: 30
});
for (const forbidden of ['A1_PFX_PATH', 'A1_PFX_PASSPHRASE', 'PJE_TOTP_SECRET', 'ALLOW_AUTOMATED_PORTAL_TOTP', 'TRF4_EPROC_TOTP_SECRET']) {
  assert.equal(tenantEnv[forbidden], undefined, `Segredo de tenant ${forbidden} não pode vazar para o coletor de outro workspace.`);
}
assert.equal(tenantEnv.AUTH_SESSION_SECRET, 'shared', 'Chaves de criptografia continuam necessárias (não são tenant state).');
assert.equal(tenantEnv.ATRIUM_WORKSPACE_ID, tenantWorkspaceId);
assert.equal(tenantEnv.ATRIUM_WORKSPACE_DATA_DIR, path.resolve(tenantDataDir));
assert.equal(tenantEnv.COLLECTOR_INGEST_TOKEN, 'spawn-token-b');
assert.equal(tenantEnv.ATRIUM_WORKSPACE_IS_DEFAULT, 'false');
assert.deepEqual(JSON.parse(tenantEnv.ATRIUM_JUDICIAL_TERMS).map(term => term.name), ['Dra. Alfa', 'Dr. Beta']);
assert.equal(tenantEnv.JUDICIAL_OAB_UF, 'RS');
assert.throws(() => buildCollectorSpawnEnv({ baseEnv, workspaceId: '' }), /workspaceId é obrigatório/);

// ---------------------------------------------------------------------------
// U3 — Resolução fail-closed do workspace no agente
// ---------------------------------------------------------------------------
console.log('[U3] resolveAgentWorkspace valida diretório do workspace (fail-closed)...');
const root = path.join(os.tmpdir(), 'atrium-h3-root');
const wsId = 'ws-11111111-2222-4333-8444-555555555555';
assert.equal(resolveAgentWorkspace({ env: {}, root }).dataDir, path.resolve(root, 'data'));
assert.equal(resolveAgentWorkspace({ env: {}, root }).allowGlobalFallbacks, true);
const resolvedTenant = resolveAgentWorkspace({
  env: { ATRIUM_WORKSPACE_ID: wsId, ATRIUM_WORKSPACE_DATA_DIR: path.join(root, 'data', 'workspaces', wsId) }, root
});
assert.equal(resolvedTenant.isDefault, false);
assert.equal(resolvedTenant.allowGlobalFallbacks, false);
assert.throws(
  () => resolveAgentWorkspace({ env: { ATRIUM_WORKSPACE_ID: wsId, ATRIUM_WORKSPACE_DATA_DIR: 'C:\\Windows' }, root }),
  /fora da raiz de workspaces/
);
assert.throws(
  () => resolveAgentWorkspace({ env: { ATRIUM_WORKSPACE_ID: wsId, ATRIUM_WORKSPACE_DATA_DIR: path.join(root, 'data', 'workspaces', 'ws-outro') }, root }),
  /não corresponde ao workspace/
);
assert.throws(
  () => resolveAgentWorkspace({ env: { ATRIUM_WORKSPACE_DATA_DIR: path.join(root, 'data', 'workspaces', wsId) }, root }),
  /ATRIUM_WORKSPACE_ID é obrigatório/
);

// ---------------------------------------------------------------------------
// U4 — Registry: job por workspace + lock global com token de ownership
// ---------------------------------------------------------------------------
console.log('[U4] Collector registry: jobs por workspace e lock com token...');
const registry = createCollectorRegistry({ now: () => 1_000 });
const lockA = registry.acquire({ workspaceId: 'ws-a', kind: 'managed' });
assert.equal(lockA.ok, true);
const deniedB = registry.acquire({ workspaceId: 'ws-b', kind: 'managed' });
assert.equal(deniedB.ok, false);
assert.equal(deniedB.busy, true);
assert.equal(deniedB.heldByRequestingWorkspace, false, 'B não pode assumir ownership de A.');
assert.equal(deniedB.heldByWorkspace, 'ws-a');
assert.equal(registry.isLockedBy('ws-a'), true);
assert.equal(registry.isLockedBy('ws-b'), false);
assert.equal(registry.release('token-errado'), false);
assert.equal(registry.release(lockA.token), true);
assert.equal(registry.release(lockA.token), false, 'Duplo release é no-op.');
const lockB = registry.acquire({ workspaceId: 'ws-b', kind: 'interactive' });
assert.equal(lockB.ok, true);
assert.equal(registry.release(lockB.token), true);
const raceResults = [];
await Promise.all(['ws-a', 'ws-b'].map(workspaceId => Promise.resolve().then(() => raceResults.push(registry.acquire({ workspaceId })))));
assert.equal(raceResults.filter(result => result.ok).length, 1, 'Apenas um workspace adquire o recurso global por vez.');
registry.release(raceResults.find(result => result.ok).token);
const jobA = registry.startJob({ workspaceId: 'ws-a', kind: 'managed', portalIds: ['p1'] });
const jobB = registry.startJob({ workspaceId: 'ws-b', kind: 'interactive', portalIds: ['p2'] });
assert.notEqual(jobA.jobId, jobB.jobId);
registry.finishJob('ws-a', { exitCode: 1, error: 'falha-a' });
assert.equal(registry.getJob('ws-a').status, 'failed');
assert.equal(registry.getJob('ws-a').lastError, 'falha-a');
assert.equal(registry.getJob('ws-b').status, 'running', 'Erro de A não pode alterar o job de B.');
assert.equal(registry.getJob('ws-b').lastError, '');
assert.equal(registry.getJob('ws-c').status, 'idle');
assert.equal(registry.isJobRunning('ws-b'), true);
registry.removeJob('ws-b');
assert.equal(registry.getJob('ws-b').status, 'idle');

// ---------------------------------------------------------------------------
// U5 — Agente: contexto inválido falha fechado e não cria data/ raiz
// ---------------------------------------------------------------------------
console.log('[U5] Agente do coletor: validação de contexto e aceitação do workspace...');
const agentFile = path.join(ROOT, 'collector', 'agent.mjs');
const invalidRun = spawnSync(process.execPath, [agentFile], {
  cwd: ROOT,
  encoding: 'utf8',
  timeout: 60_000,
  env: {
    ...process.env,
    ATRIUM_WORKSPACE_ID: wsId,
    ATRIUM_WORKSPACE_DATA_DIR: os.tmpdir(),
    COLLECTOR_INGEST_TOKEN: 'synthetic-token'
  }
});
assert.notEqual(invalidRun.status, 0, 'Diretório fora da raiz deve falhar fechado.');
assert.match(String(invalidRun.stderr) + String(invalidRun.stdout), /Contexto de workspace inválido/);

const workspaceDir = path.join(ROOT, 'data', 'workspaces', wsId);
const hadDataDir = existsSync(path.join(ROOT, 'data'));
const hadRootSessions = existsSync(path.join(ROOT, 'data', 'judicial-sessions.json'));
const hadRootProfiles = existsSync(path.join(ROOT, 'data', 'browser-profiles'));
const hadCollectorEnv = existsSync(path.join(ROOT, '.env.collector'));
try {
  const validRun = spawnSync(process.execPath, [agentFile], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      ATRIUM_WORKSPACE_ID: wsId,
      ATRIUM_WORKSPACE_DATA_DIR: workspaceDir,
      COLLECTOR_INGEST_TOKEN: 'synthetic-token',
      COLLECTOR_PORTAL_IDS: 'portal-inexistente',
      CENTRAL_URL: 'http://127.0.0.1:9'
    }
  });
  assert.notEqual(validRun.status, 0, 'Sem portal elegível o agente não pode concluir.');
  assert.match(String(validRun.stderr) + String(validRun.stdout), /Nenhum portal habilitado/);
  assert.equal(existsSync(workspaceDir), true, 'O coletor de workspace deve bootstrapar apenas o diretório do próprio workspace.');
  assert.equal(existsSync(path.join(ROOT, 'data', 'judicial-sessions.json')), hadRootSessions, 'Coletor de tenant não pode tocar sessões do workspace default.');
  assert.equal(existsSync(path.join(ROOT, 'data', 'browser-profiles')), hadRootProfiles, 'Coletor de tenant não pode criar perfil de navegador no default.');
  assert.equal(existsSync(path.join(ROOT, '.env.collector')), hadCollectorEnv, 'Coletor de tenant não pode criar/alterar o .env.collector global.');
} finally {
  await rm(workspaceDir, { recursive: true, force: true }).catch(() => {});
  await rm(path.join(ROOT, 'data', 'workspaces'), { recursive: true, force: true }).catch(() => {});
  if (!hadDataDir) await rm(path.join(ROOT, 'data'), { recursive: true, force: true }).catch(() => {});
}

// ---------------------------------------------------------------------------
// HTTP — isolamento real entre dois workspaces
// ---------------------------------------------------------------------------
async function setupDefaultWorkspace(server) {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin-h3-alfa', displayName: 'Dra. Alfa Teste', email: 'alfa@example.test', workspaceName: 'Alfa Teste', password: PASSWORD
  });
  const pending = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: pending.setupToken, code: generateTotp(pending.manualSecret) });
  const body = await response.json();
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: body.csrfToken, workspaceId: body.user?.workspaceId };
}

async function registerWorkspace(server, username, displayName, email, workspaceName) {
  let response = await postJson(`${server.baseUrl}/api/auth/workspaces/register`, { username, displayName, email, workspaceName, password: PASSWORD });
  const pending = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/workspaces/register/verify`, { setupToken: pending.setupToken, code: generateTotp(pending.manualSecret) });
  const body = await response.json();
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: body.csrfToken, workspaceId: body.workspace?.id || body.user?.workspaceId };
}

const server = await startTestServer({});
try {
  const wsA = await setupDefaultWorkspace(server);
  const wsB = await registerWorkspace(server, 'admin-h3-beta', 'Dr. Beta Teste', 'beta@example.test', 'Beta Teste');
  assert.notEqual(wsA.workspaceId, wsB.workspaceId);

  console.log('[H1] Token legado não alcança workspace de terceiros...');
  let response = await postJson(`${server.baseUrl}/api/ingest`, { events: [{ id: 'legacy-cross' }] }, {
    Authorization: `Bearer ${server.collectorToken}`, 'X-ATRIUM-Workspace-ID': wsB.workspaceId
  });
  assert.equal(response.status, 401, 'Token legado não pode ingerir em outro workspace.');
  response = await postJson(`${server.baseUrl}/api/ingest`, { events: [{ id: 'legacy-default' }] }, {
    Authorization: `Bearer ${server.collectorToken}`
  });
  assert.equal(response.status, 200, 'Token legado continua válido para o workspace default.');

  console.log('[H2] Token pareado de B ingere só em B; header forjado é recusado...');
  response = await postJson(`${server.baseUrl}/api/integrations/collector/pair`, {}, { Cookie: wsB.cookie, 'X-CSRF-Token': wsB.csrf });
  assert.equal(response.status, 201);
  const tokenB = (await response.json()).token;
  response = await postJson(`${server.baseUrl}/api/ingest`, { events: [{ id: 'event-b' }] }, {
    Authorization: `Bearer ${tokenB}`, 'X-ATRIUM-Workspace-ID': wsB.workspaceId
  });
  assert.equal(response.status, 200, 'Token pareado de B deve ingerir em B.');
  response = await postJson(`${server.baseUrl}/api/ingest`, { events: [{ id: 'spoof-cross' }] }, {
    Authorization: `Bearer ${tokenB}`, 'X-ATRIUM-Workspace-ID': wsA.workspaceId
  });
  assert.equal(response.status, 401, 'Header forjado com token de B não pode cruzar tenant.');
  response = await postJson(`${server.baseUrl}/api/ingest`, { events: [{ id: 'spoof-empty' }] }, { Authorization: `Bearer ${tokenB}` });
  assert.equal(response.status, 401, 'Token pareado exige o workspace correto no header.');

  console.log('[H3] Reset judicial de B não toca o estado do default...');
  const defaultMarker = path.join(server.dataDirectory, 'browser-profiles', 'h3-marker-default.txt');
  const betaMarker = path.join(server.dataDirectory, 'workspaces', wsB.workspaceId, 'browser-profiles', 'h3-marker-beta.txt');
  await mkdir(path.dirname(defaultMarker), { recursive: true });
  await mkdir(path.dirname(betaMarker), { recursive: true });
  await writeFile(defaultMarker, 'default', 'utf8');
  await writeFile(betaMarker, 'beta', 'utf8');
  response = await postJson(`${server.baseUrl}/api/integrations/judicial/reset`, { confirm: 'ZERAR_ACESSOS_JUDICIAIS' }, { Cookie: wsB.cookie, 'X-CSRF-Token': wsB.csrf });
  assert.equal(response.status, 200, 'Admin de B deve conseguir resetar apenas o próprio workspace.');
  assert.equal(existsSync(betaMarker), false, 'Reset de B deve remover o perfil de B.');
  assert.equal(existsSync(defaultMarker), true, 'Reset de B não pode remover o perfil do default.');

  console.log('[H4] Status de collector é do workspace autenticado...');
  response = await fetch(`${server.baseUrl}/api/integrations/judicial`, { headers: { Cookie: wsB.cookie } });
  assert.equal(response.status, 200);
  const statusB = await response.json();
  assert.equal(statusB.interactiveCollectorRunning, false);
  assert.equal(statusB.interactiveCollectorState.status, 'idle');
  assert.equal(statusB.interactiveCollectorState.workspaceId, wsB.workspaceId, 'Status de collector deve pertencer ao workspace da sessão.');

  console.log('[H5] Runtime de cada workspace recebe apenas o seu próprio ingest...');
  const runtimeA = await (await fetch(`${server.baseUrl}/api/events`, { headers: { Cookie: wsA.cookie } })).json();
  const runtimeB = await (await fetch(`${server.baseUrl}/api/events`, { headers: { Cookie: wsB.cookie } })).json();
  const idsA = (runtimeA.events || []).map(event => event.id);
  const idsB = (runtimeB.events || []).map(event => event.id);
  assert.ok(idsA.includes('legacy-default'));
  assert.ok(!idsA.includes('event-b') && !idsA.includes('spoof-cross'));
  assert.ok(idsB.includes('event-b'));
  assert.ok(!idsB.includes('legacy-default') && !idsB.includes('legacy-cross'));
} finally {
  await server.stop();
}

console.log('[H6] Cloud: token legado segue restrito ao workspace default...');
const cloudServer = await startTestServer({ env: { JURISFLOW_CLOUD_MODE: 'true' } });
try {
  await setupDefaultWorkspace(cloudServer);
  let response = await postJson(`${cloudServer.baseUrl}/api/ingest`, { events: [{ id: 'cloud-cross' }] }, {
    Authorization: `Bearer ${cloudServer.collectorToken}`,
    'X-ATRIUM-Workspace-ID': 'ws-00000000-0000-4000-8000-000000000000'
  });
  assert.equal(response.status, 401, 'Em cloud, token legado também não pode cruzar para outro workspace.');
  response = await postJson(`${cloudServer.baseUrl}/api/ingest`, { events: [{ id: 'cloud-default' }] }, {
    Authorization: `Bearer ${cloudServer.collectorToken}`
  });
  assert.equal(response.status, 200, 'Token legado continua sendo o ingestor do workspace default em cloud.');
} finally {
  await cloudServer.stop();
}

console.log('\n>>> H3 MULTIWORKSPACE COLLECTORS: PASS <<<\n');
