import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { redactEprocSecrets } from '../lib/judicial/eproc/key-redaction.mjs';
import { buildLegacyEprocJobView, legacyStepForPhase } from '../lib/judicial/eproc/legacy-job-view.mjs';
import { JudicialCredentialManager, WORKSPACE_ACCESS_KEY_OWNER } from '../lib/judicial/credential-manager.mjs';
import { migrateEprocPlaintextAccessKeys, reconcileSourceAccessKey } from '../lib/judicial/eproc-a1-downloader.mjs';
import { serverSourceText } from './server-source.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.dirname(__dirname);
const tempRoot = path.join(os.tmpdir(), `atrium-eproc-key-hygiene-${Date.now()}`);

async function run() {
  console.log('=== TESTE FOCAL: HIGIENE DE CHAVE EPROC, COFRE E PROJEÇÃO LEGADA ===\n');

  const payload = {
    revision: 7,
    processes: [
      {
        id: 'p1', number: '5000001-00.2026.8.21.0016',
        client: 'Cliente Teste', hasAccessKey: true,
        accessKey: 'CHAVE-SECRETA-1', chaveAcesso: 'CHAVE-SECRETA-1',
        nested: { accessKey: 'CHAVE-SECRETA-2', chaveAcessoProcesso: 'CHAVE-SECRETA-3' }
      },
      { id: 'p2', number: '5000002-00.2026.8.21.0016', hasAccessKey: false }
    ]
  };
  const clean = redactEprocSecrets(payload);
  const serialized = JSON.stringify(clean);
  assert.doesNotMatch(serialized, /CHAVE-SECRETA/, 'Nenhuma chave pode sobreviver à redação');
  assert.equal(clean.processes[0].hasAccessKey, true, 'Marcador público de chave deve ser preservado');
  assert.equal(clean.processes[0].client, 'Cliente Teste');
  assert.equal(clean.revision, 7);
  assert.equal(redactEprocSecrets(null), null);
  assert.deepEqual(redactEprocSecrets([{ accessKey: 'x', ok: 1 }]), [{ ok: 1 }]);
  console.log('✓ 1. Redação profunda remove chaves e preserva dados públicos.');

  const credentialManager = {
    saved: [],
    fail: false,
    async saveProcessAccessKey(number, options) {
      if (this.fail) throw new Error('cofre indisponível');
      this.saved.push({ number, ...options });
      return { ok: true, configured: true, keyId: 'mock' };
    }
  };
  const state = {
    processes: [
      { number: '5000001-00.2026.8.21.0016', portalId: 'tjrs-eproc-1g', accessKey: 'LEGACY-1', chaveAcesso: 'LEGACY-1' },
      { number: '5000002-00.2026.8.21.0016', portalId: 'tjrs-eproc-2g', chaveAcesso: 'LEGACY-2' }
    ]
  };
  const migrated = await migrateEprocPlaintextAccessKeys(state, { credentialManager, portalId: 'tjrs-eproc-1g', logger: { warn() {} } });
  assert.deepEqual(migrated, { migrated: 2, failed: 0 }, 'Ambas as chaves legadas devem ser migradas para o cofre');
  assert.ok(credentialManager.saved.every(entry => entry.userId === WORKSPACE_ACCESS_KEY_OWNER), 'Chaves vivem no escopo do workspace, não de usuários individuais');
  assert.equal(credentialManager.saved[0].portalId, 'tjrs-eproc-1g');
  assert.equal(credentialManager.saved[1].portalId, 'tjrs-eproc-2g', 'Escopo portal/grau por processo é preservado');
  assert.ok(state.processes.every(proc => !('accessKey' in proc) && !('chaveAcesso' in proc)), 'Estado não pode reter plaintext');
  assert.ok(state.processes.every(proc => proc.hasAccessKey === true));

  const failingState = { processes: [{ number: '5000003-00.2026.8.21.0016', portalId: 'tjrs-eproc-1g', accessKey: 'PRESERVAR' }] };
  credentialManager.fail = true;
  const migratedOnFailure = await migrateEprocPlaintextAccessKeys(failingState, { credentialManager, portalId: 'tjrs-eproc-1g', logger: { warn() {} } });
  assert.deepEqual(migratedOnFailure, { migrated: 0, failed: 1 });
  assert.equal(failingState.processes[0].accessKey, 'PRESERVAR', 'Falha no cofre nunca pode descartar a chave silenciosamente');
  credentialManager.fail = false;
  console.log('✓ 2. Migração legada é idempotente, escopada por workspace/portal e não destrutiva em falha.');

  await mkdir(tempRoot, { recursive: true });
  const secretsFile = path.join(tempRoot, 'judicial-integrations.json');
  await writeFile(secretsFile, JSON.stringify({ version: 2, encrypted: Buffer.from('{}', 'utf8').toString('base64') }), 'utf8');
  const vault = new JudicialCredentialManager({
    dataDirectory: tempRoot,
    securityManager: {
      encrypt: value => Buffer.from(value, 'utf8').toString('base64'),
      decrypt: value => Buffer.from(value, 'base64').toString('utf8')
    },
    allowLegacyRootFallback: false,
    allowEnvironmentFallback: false
  });
  const cnj = '5000001-00.2026.8.21.0016';
  await vault.saveProcessAccessKey(cnj, { accessKey: 'CHAVE-COFRE-1', userId: WORKSPACE_ACCESS_KEY_OWNER, portalId: 'tjrs-eproc-1g' });
  assert.equal(await vault.getProcessAccessKey(cnj, 'advogado-teste'), 'CHAVE-COFRE-1', 'Usuário do workspace encontra a chave do coletor sem depender do portal');
  assert.equal(await vault.getProcessAccessKey(cnj, '', 'tjrs-eproc-1g'), 'CHAVE-COFRE-1', 'Consulta por portal/grau encontra a chave do workspace');
  assert.equal(await vault.getProcessAccessKey(cnj, '', 'tjrs-eproc-2g'), null, 'Chave de 1G não serve para 2G');
  assert.equal(await vault.getProcessAccessKey('5000002-00.2026.8.21.0016', 'advogado-teste'), null, 'Chave não vaza entre processos');
  const rawVault = await readFile(secretsFile, 'utf8');
  assert.doesNotMatch(rawVault, /CHAVE-COFRE-1/, 'Cofre persistido não contém a chave em texto claro');

  const concurrentCnj = Array.from({ length: 20 }, (_, index) => `50000${String(index).padStart(2, '0')}-00.2026.8.21.0016`);
  await Promise.all(concurrentCnj.map((keyCnj, index) => vault.saveProcessAccessKey(keyCnj, {
    accessKey: `CHAVE-CONCORRENTE-${index}`,
    userId: WORKSPACE_ACCESS_KEY_OWNER,
    portalId: 'tjrs-eproc-1g'
  })));
  for (let index = 0; index < concurrentCnj.length; index += 1) {
    assert.equal(
      await vault.getProcessAccessKey(concurrentCnj[index], '', 'tjrs-eproc-1g'),
      `CHAVE-CONCORRENTE-${index}`,
      `Escrita concorrente no cofre perdeu a chave ${index}`
    );
  }
  const leftoverTmp = (await readdir(tempRoot)).filter(file => file.endsWith('.tmp'));
  assert.deepEqual(leftoverTmp, [], 'Cofre não pode deixar arquivos temporários após escritas concorrentes');
  assert.doesNotThrow(() => JSON.parse(rawVault), 'Cofre precisa permanecer JSON válido');
  const concurrentVaultRaw = await readFile(secretsFile, 'utf8');
  assert.doesNotMatch(concurrentVaultRaw, /CHAVE-CONCORRENTE-/, 'Cofre persistido segue sem texto claro');
  console.log('✓ 3. Cofre do workspace resolve por identidade/portal e sobrevive a escritas concorrentes sem lost update.');

  const workspaceId = 'ws-default';
  const canonicalRunning = {
    active: true,
    job: {
      id: 'sync-1', state: 'RUNNING',
      portals: [{
        portalId: 'tjrs-eproc-1g', state: 'RUNNING', phase: 'processing_processes',
        determinate: true, percent: 50, completed: 2, total: 4,
        action: 'Enriquecendo processo 2 de 4.', log: 'Enriquecendo processo 2 de 4.'
      }]
    }
  };
  const runningView = buildLegacyEprocJobView({ workspaceId, canonical: canonicalRunning, previous: null });
  assert.equal(runningView.status, 'running');
  assert.equal(runningView.progress, 50);
  assert.equal(runningView.step, 4, 'Fase de processamento deve mapear para o passo 4 do modal legado');
  assert.ok(runningView.logs.includes('Enriquecendo processo 2 de 4.'));
  assert.equal(runningView.result, null, 'Job em andamento não pode expor resultado terminal');

  const previous = { ...runningView, id: 'sync-1', startedAt: Date.now() - 1000 };
  const canonicalError = {
    active: false,
    job: {
      id: 'sync-1', state: 'ERROR',
      portals: [{
        portalId: 'tjrs-eproc-1g', state: 'ERROR', phase: 'partial_error',
        determinate: false, percent: null, error: '3 erro(s) durante a coleta eproc.',
        errorCode: 'A1_CERT_MISSING', errorStatus: 412,
        counts: { processes: 4, enrichedProcesses: 1, deadlines: 0, intimations: 2 },
        discoverySource: 'PANEL_DOM_FALLBACK', errors: [{ scope: 'process', processNumber: 'x' }]
      }]
    }
  };
  const errorView = buildLegacyEprocJobView({ workspaceId, canonical: canonicalError, previous });
  assert.equal(errorView.status, 'error');
  assert.match(errorView.error, /erro\(s\)/);
  assert.equal(errorView.result.ok, false);
  assert.equal(errorView.result.discoverySource, 'PANEL_DOM_FALLBACK');
  assert.equal(errorView.result.counts.enrichedProcesses, 1);
  assert.equal(legacyStepForPhase('panel_opened'), 3);

  const canonicalCompleted = {
    active: false,
    job: {
      id: 'sync-2', state: 'COMPLETED',
      portals: [{ portalId: 'tjrs-eproc-1g', state: 'COMPLETED', phase: 'completed', determinate: true, percent: 100, counts: { processes: 1, enrichedProcesses: 1, deadlines: 0, intimations: 0 }, reportCounts: { newProcesses: 1, updatedProcesses: 0, unchangedProcesses: 108, inactiveProcesses: 0, deferredProcesses: 0 } }]
    }
  };
  const completedWithHistory = buildLegacyEprocJobView({ workspaceId, canonical: canonicalCompleted, previous: errorView });
  assert.equal(completedWithHistory.status, 'completed');
  assert.equal(completedWithHistory.result.counts.processes, 1);
  assert.equal(completedWithHistory.result.reportCounts.unchangedProcesses, 108);
  const afterReset = buildLegacyEprocJobView({ workspaceId, canonical: canonicalCompleted, previous: null });
  assert.equal(afterReset.status, 'idle', 'Sem acompanhamento iniciado, job terminal antigo não pode reaparecer após reset');
  assert.equal(afterReset.id, null);
  const otherWorkspace = buildLegacyEprocJobView({ workspaceId: 'ws-outro', canonical: canonicalCompleted, previous: completedWithHistory });
  assert.equal(otherWorkspace.id, null, 'Projeção legada nunca reaproveita estado de outro workspace');
  console.log('✓ 4. Projeção legada mapeia fases, erros, contagens e reset sem expor outro workspace.');

  const serverSource = serverSourceText;
  assert.match(serverSource, /state:\s*(?:withoutMergedIntimationAliases\()?redactEprocSecrets(?:InPlace)?\(envelope\.state\)/, '/api/state deve redigir chaves na borda.');
  assert.match(serverSource, /process:\s*updated\s*\?\s*redactEprocSecrets\(updated\)\s*:\s*null/, 'enrich-single deve redigir o processo devolvido.');
  assert.doesNotMatch(serverSource, /accessKey:\s*downloadResult\.accessKey/, 'download-autos não pode devolver a chave.');
  const sidecarSource = await readFile(path.join(ROOT, 'lib', 'http', 'tjrs-sidecar-routes.mjs'), 'utf8');
  assert.match(sidecarSource, /redactEprocSecrets/, 'Respostas do sidecar também devem redigir chaves.');
  console.log('✓ 5. Contratos de borda garantem que a chave não retorna ao frontend.');

  console.log('6. Reconciliacao do marcador de chave: residuo sai, chave real e manual ficam.');
  assert.equal(await vault.hasAnyProcessAccessKey(cnj), true, 'Cofre com chave do coletor responde true.');
  assert.equal(await vault.hasAnyProcessAccessKey('5099999-00.2026.8.21.0016'), false, 'CNJ sem chave responde false.');
  await vault.saveProcessAccessKey('5000010-00.2026.8.21.0016', { accessKey: 'CHAVE-MANUAL', userId: 'advogado-teste', portalId: 'tjrs-eproc-1g' });
  assert.equal(await vault.hasAnyProcessAccessKey('5000010-00.2026.8.21.0016'), true, 'Chave registrada manualmente tambem conta como chave guardada.');

  const residual = { number: cnj, hasAccessKey: true, accessKeyUpdatedAt: '2026-09-01T00:00:00.000Z', tags: ['chave-disponivel'] };
  assert.equal(reconcileSourceAccessKey(residual, { accessKey: '' }, { vaultHasKey: false }), true, 'Sem chave na fonte e cofre vazio, o residuo e limpo.');
  assert.equal('hasAccessKey' in residual, false);
  assert.equal('accessKeyUpdatedAt' in residual, false);
  assert.deepEqual(residual.tags, []);
  assert.equal(reconcileSourceAccessKey(residual, { accessKey: '' }, { vaultHasKey: false }), false, 'Limpeza e idempotente.');

  const legitimo = { number: cnj, hasAccessKey: true, tags: ['chave-disponivel'] };
  assert.equal(reconcileSourceAccessKey(legitimo, { accessKey: '' }, { vaultHasKey: true }), false, 'Chave guardada no cofre mantem o marcador.');
  assert.equal(legitimo.hasAccessKey, true);
  const incerto = { number: cnj, hasAccessKey: true, tags: ['chave-disponivel'] };
  assert.equal(reconcileSourceAccessKey(incerto, { accessKey: '' }), false, 'Cofre incerto mantem o marcador (fail-closed).');
  assert.equal(incerto.hasAccessKey, true);

  const daFonte = { number: cnj, accessKey: 'PLAINTEXT', chaveAcesso: 'PLAINTEXT' };
  assert.equal(reconcileSourceAccessKey(daFonte, { accessKey: 'ABCD1234' }), true, 'Chave declarada pela fonte marca o registro.');
  assert.equal(daFonte.hasAccessKey, true);
  assert.equal('accessKey' in daFonte, false, 'Texto claro nunca permanece no registro.');
  assert.equal('chaveAcesso' in daFonte, false);
  assert.ok(daFonte.tags.includes('chave-disponivel'));
  assert.ok(daFonte.accessKeyUpdatedAt);

  const manualSemMarca = { number: cnj };
  assert.equal(reconcileSourceAccessKey(manualSemMarca, { accessKey: '' }, { vaultHasKey: false }), false, 'Registro sem marcador nao e tocado.');
  console.log('  OK: marcador reconciliado com fonte e cofre, sem limpar chave real e sem tocar em registro sem marca.');

  console.log('\n>>> EPROC ACCESS KEY HYGIENE & LEGACY VIEW TEST PASSED! <<<\n');
}

run()
  .catch(error => {
    console.error('Falha no teste de higiene de chave eproc:', error);
    process.exit(1);
  })
  .finally(async () => {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  });
