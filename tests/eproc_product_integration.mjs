import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EprocSyncScheduler } from '../lib/judicial/eproc/scheduler/sync-scheduler.mjs';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const portalSource = await readFile(new URL('../js/portal.js', import.meta.url), 'utf8');
assert.match(
  portalSource,
  /features\/judicial-integrations\.js\?v=[\d.]+/,
  'O módulo judicial deve ter cache bust próprio quando sua API pública muda.'
);

let releasePipeline;
const pipelineGate = new Promise(resolve => { releasePipeline = resolve; });
const observedProgress = [];
const observedPortals = [];
const scheduler = new EprocSyncScheduler({
  orchestrator: {
    syncPortal: async (portalId, { onProgress }) => {
      observedPortals.push(portalId);
      const connecting = { phase: 'connecting', action: 'Conectando.', determinate: false, completed: null, total: null, percent: null };
      observedProgress.push(connecting);
      onProgress(connecting);
      if (observedPortals.length === 1) await pipelineGate;
      const processing = { phase: 'processing_processes', action: 'Processando.', determinate: true, completed: 2, total: 2, percent: 100 };
      observedProgress.push(processing);
      onProgress(processing);
      return { ok: true, counts: { processes: 2, enrichedProcesses: 1, intimations: 1 } };
    }
  }
});

const first = await scheduler.requestSync({ workspaceId: 'workspace-controlled', trigger: 'manual' });
const joined = await scheduler.requestSync({ workspaceId: 'workspace-controlled', trigger: 'manual' });
assert.match(first.jobId, /^sync-/);
assert.equal(joined.joinedExisting, true);
assert.equal(joined.jobId, first.jobId);
assert.equal(scheduler.getJobStatus('workspace-controlled').job.portals[0].percent, null);
releasePipeline();
await new Promise(resolve => setTimeout(resolve, 20));
const completed = scheduler.getJobStatus('workspace-controlled');
assert.equal(completed.job.state, 'COMPLETED');
assert.deepEqual(observedPortals, ['tjrs-eproc-1g']);
assert.deepEqual(completed.job.portals.find(portal => portal.portalId === 'tjrs-eproc-1g').counts, { processes: 2, enrichedProcesses: 1, intimations: 1 });
assert.equal(observedProgress[0].determinate, false);
assert.equal(observedProgress[0].percent, null);
assert.deepEqual([observedProgress[1].completed, observedProgress[1].total], [2, 2]);
console.log('[OK] Scheduler, jobId, single-flight e telemetria controlada validados.');

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
  const portals = [
    ['tjrs-eproc-1g', 'TJRS 1G'], ['tjrs-eproc-2g', 'TJRS 2G'], ['jfrs-eproc-1g', 'JFRS 1G'],
    ['jfsc-eproc-1g', 'JFSC 1G'], ['jfpr-eproc-1g', 'JFPR 1G'], ['trf4-eproc-2g', 'TRF4 2G']
  ].map(([id, acronym]) => ({
    id, acronym, name: `${acronym} eproc`, court: acronym, level: id.includes('2g') ? 2 : 1,
    url: 'https://example.test/', authType: 'Aguardando verificação local', status: 'available',
    statusLabel: 'Disponível — aguardando conexão/verificação', badgeClass: 'warning',
    credentialConfigured: false, connectionVerified: false, metrics: null, lastSuccessfulSyncAt: null
  }));

  let polls = 0;
  let syncPosts = 0;
  let legacySweepPosts = 0;
  await page.route('**/api/integrations/eproc/status', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, scheduler: { nextSyncFormatted: '07:00 BRT (amanhã)' }, portals })
  }));
  await page.route('**/api/integrations/eproc/sync', route => {
    syncPosts++;
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, jobId: 'sync-controlled-ui', joinedExisting: true, status: 'running' })
    });
  });
  await page.route('**/api/integrations/eproc/sweep', route => {
    legacySweepPosts++;
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false }) });
  });
  await page.route('**/api/integrations/eproc/sync/status', route => {
    polls++;
    const job = polls === 1
      ? { id: 'sync-controlled-ui', state: 'RUNNING', overall: { currentPortal: 'tjrs-eproc-1g', percent: null }, portals: [{ portalId: 'tjrs-eproc-1g', state: 'RUNNING', step: 1, determinate: false, percent: null, action: 'Conectando.' }] }
      : { id: 'sync-controlled-ui', state: 'ERROR', overall: { currentPortal: null, percent: 100 }, portals: [{ portalId: 'tjrs-eproc-1g', state: 'ERROR', determinate: false, percent: null, error: 'Falha controlada de autenticação.' }] };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, active: polls === 1, job }) });
  });

  await page.evaluate(() => window.Atrium.App.switchView('integrations'));
  await page.locator('#certificateGuideButton').click();
  await page.locator('#eprocPortalsGrid .v2-eproc-portal-card').first().waitFor({ state: 'visible', timeout: 5000 });
  assert.equal(await page.locator('#eprocPortalsGrid .v2-eproc-portal-card').count(), 6);
  for (const id of ['jfsc-eproc-1g', 'jfpr-eproc-1g']) {
    const text = await page.locator(`[data-portal-id="${id}"] .status-chip`).textContent();
    assert.equal(text.trim(), 'Disponível — aguardando conexão/verificação');
  }

  await page.locator('#btnSyncEprocNow').click();
  await page.locator('#eprocSyncStatusLabel').filter({ hasText: 'Erro confirmado pelo backend' }).waitFor({ timeout: 5000 });
  assert.equal(await page.locator('#eprocSyncModalDone:not(.hidden)').count(), 1);
  const modalText = await page.locator('#eprocSyncModalBackdrop').textContent();
  assert.match(modalText, /Falha controlada de autenticação/);
  assert.doesNotMatch(modalText, /acervo e agenda atualizados|concluída com sucesso/i);
  await page.locator('#eprocSyncModalClose').click();
  await page.locator('#judicialSetupClose').click();
  await page.evaluate(() => window.Atrium.App.switchView('processes'));
  await page.locator('#btnSyncEprocA1').click();
  await page.waitForFunction(() => document.querySelector('#eprocSyncModalBackdrop:not(.hidden)'));
  assert.equal(syncPosts, 2, 'O botão da carteira deve reutilizar o scheduler oficial.');
  assert.equal(legacySweepPosts, 0, 'A carteira não deve disparar o sweep legacy nem no startup.');
  await page.locator('#eprocSyncModalMinimize').click();
  assert.equal(await page.locator('#eprocSyncModalBackdrop.hidden').count(), 1);
  assert.equal(await page.locator('#systemStatusBar').getAttribute('role'), 'button');
  assert.equal(await page.locator('#systemStatusBar').getAttribute('tabindex'), '0');
  await page.locator('#systemStatusBar').click();
  assert.equal(await page.locator('#eprocSyncModalBackdrop:not(.hidden)').count(), 1);
  assert.equal(syncPosts, 2, 'Reabrir pela barra global não pode criar outro job.');
  assert.deepEqual(pageErrors, []);
  console.log('[OK] Falha exibida sem false success; JFSC/JFPR permanecem não verificados.');
  await context.close();
} finally {
  await session.stop();
}
