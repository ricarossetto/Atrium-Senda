import { mkdir, appendFile, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getPjePortalById, listPjePortals, resolvePjeCollector } from '../portal-registry.mjs';
import { openPjeBrowserSession } from '../runtime/index.mjs';
import { authenticatePjeSession, installPjeReadOnlyGuard } from '../index.mjs';
import { collectPjeStandardInventory } from '../collectors/standard-painel.mjs';
import { collectPjeJtFamily } from '../collectors/pje-jt.mjs';
import { buildPjeSnapshot, diffPjeSnapshots, PjeSnapshotStore } from './pje-snapshot-store.mjs';
import { mergePjeInventoryIntoState } from './ingest-inventory.mjs';
import { writePjeInventoryXls } from '../report/pje-report.mjs';
import { collectPjePautaSessions } from '../collectors/pauta.mjs';
import { reconcileEprocSessions } from '../../eproc/sync/sessions-sync.mjs';
import { reconcilePjeAcervoHearings } from './acervo-hearings-sync.mjs';

export const PJE_JOB_STATUS = Object.freeze({
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  UNCHANGED: 'UNCHANGED',
  SKIPPED_UNRELIABLE: 'SKIPPED_UNRELIABLE',
  DEGRADED: 'DEGRADED',
  ERROR: 'ERROR'
});

const RELIABLE_STATES = Object.freeze(['loaded', 'empty_confirmed']);

function nowIso() {
  return new Date().toISOString();
}

function sanitizeDuration(startedAt, finishedAt) {
  const start = Date.parse(startedAt || '');
  const finish = Date.parse(finishedAt || '');
  if (!Number.isFinite(start) || !Number.isFinite(finish)) return null;
  return Math.max(0, finish - start);
}

export function collectorForPortal(portal) {
  const resolution = resolvePjeCollector(portal);
  if (resolution.collectorKey === 'trabalhista' && resolution.status === 'implemented') {
    return { family: 'pje-jt', run: collectPjeJtFamily };
  }
  return { family: 'standard-pje', run: collectPjeStandardInventory };
}

export async function runPjePortalPipeline({
  portal,
  runtime = 'server',
  workspaceId = '',
  deps = {},
  onStage = () => {}
} = {}) {
  const portalConfig = typeof portal === 'string' ? getPjePortalById(portal) : portal;
  if (!portalConfig) throw Object.assign(new Error('Portal PJe desconhecido.'), { errorCode: 'PJE-PORTAL-UNKNOWN' });
  const outcome = {
    runtime,
    collectorFamily: null,
    authStatus: 'pending',
    expedientesStatus: null,
    acervoStatus: null,
    expected: null,
    collected: null,
    missing: null,
    diff: null,
    processCounters: null,
    communicationCounters: null,
    errorCode: null,
    errorStage: null
  };
  let session = null;
  try {
    const collector = collectorForPortal(portalConfig);
    outcome.collectorFamily = collector.family;

    onStage({ stage: 'auth', status: 'running' });
    session = await deps.openSession({ portal: portalConfig, runtime });
    try {
      await installPjeReadOnlyGuard(session.page, portalConfig, { onBlocked: deps.onBlocked });
    } catch (guardError) {
      // Fail-closed: sem classificação read-only ativa, a coleta não pode navegar
      // no PJe; abortar é mais seguro do que navegar sem a guarda.
      throw Object.assign(new Error('A guarda read-only do PJe não pôde ser instalada; a coleta foi abortada por segurança.'), {
        code: 'PJE_READONLY_GUARD_UNAVAILABLE',
        errorCode: 'PJE-READONLY-GUARD-UNAVAILABLE',
        cause: guardError
      });
    }
    const target = portalConfig.confirmedRoutes?.panel || portalConfig.url;
    await session.page.goto(target, { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch(() => {});
    await authenticatePjeSession({
      page: session.page,
      portal: portalConfig,
      credentials: deps.credentials || {},
      budget: { settleMs: 1_200, timeoutMs: 180_000, maxTransitions: 24 },
      // Diagnóstico do auth sem segredos: o coletor precisa dizer em que estado
      // parou (helper, TOTP, credencial, painel) para o job não morrer mudo.
      onEvent: typeof deps.onEvent === 'function' ? event => deps.onEvent(event) : undefined
    });
    outcome.authStatus = 'verified';
    onStage({ stage: 'auth', status: 'done' });

    onStage({ stage: 'collect', status: 'running' });
    const inventory = await collector.run(session.page, portalConfig, { budget: deps.collectBudget || {} });
    // Intimações de pauta (2º grau): a aba só existe em alguns portais. Quando existe,
    // a leitura é somente leitura e não cria prazo nem ciência.
    if (inventory && typeof inventory === 'object') {
      const pauta = await collectPjePautaSessions(session.page, portalConfig).catch(error => ({
        sessions: [],
        collectionStatus: { discovered: false, collected: false },
        errors: [{ scope: 'pauta', error: String(error?.message || error).slice(0, 200) }]
      }));
      const levelLabel = portalConfig.level === 2 ? '2G' : portalConfig.level === 1 ? '1G' : '';
      inventory.pauta = {
        portalId: portalConfig.id,
        portalLabel: [portalConfig.court || portalConfig.name || 'PJe', levelLabel].filter(Boolean).join(' '),
        sessions: pauta.sessions,
        collectionStatus: pauta.collectionStatus,
        errors: pauta.errors
      };
      outcome.pautaStatus = pauta.collectionStatus;
      outcome.pautaCounters = { sessionsSeen: pauta.sessions.length };
      if (pauta.collectionStatus?.discovered) {
        console.log(`[PJe] Pauta ${portalConfig.id}: ${pauta.sessions.length} sessão(ões) (coleta=${pauta.collectionStatus.collected === true}).`);
      }
    }
    outcome.expedientesStatus = inventory?.expedientes?.state || null;
    outcome.acervoStatus = inventory?.acervo?.state || null;
    outcome.acervoCounts = inventory?.acervo?.reconciliation
      ? {
        expected: inventory.acervo.reconciliation.expected ?? null,
        collected: inventory.acervo.reconciliation.collected ?? null,
        missing: inventory.acervo.reconciliation.missing ?? null
      }
      : null;
    if (inventory?.expedientes?.reconciliation) {
      outcome.expected = inventory.expedientes.reconciliation.expected ?? null;
      outcome.collected = inventory.expedientes.reconciliation.collected ?? null;
      outcome.missing = inventory.expedientes.reconciliation.missing ?? null;
    }
    onStage({ stage: 'collect', status: 'done' });

    const reliable = RELIABLE_STATES.includes(inventory?.expedientes?.state)
      && RELIABLE_STATES.includes(inventory?.acervo?.state);
    outcome.reliable = reliable;

    onStage({ stage: 'reconcile', status: 'running' });
    if (deps.snapshotRoot) {
      const store = new PjeSnapshotStore({ rootDir: deps.snapshotRoot });
      const previous = await store.read(portalConfig.id);
      const nextSnapshot = buildPjeSnapshot(inventory);
      const diff = reliable
        ? diffPjeSnapshots(previous, nextSnapshot)
        : { status: 'SKIPPED_UNRELIABLE', totals: { added: 0, updated: 0, unchanged: 0, removed: 0 } };
      outcome.diff = { status: diff.status, ...diff.totals };
      if (reliable) await store.save(portalConfig.id, nextSnapshot);
    }
    onStage({ stage: 'reconcile', status: 'done' });

    onStage({ stage: 'import', status: 'running' });
    if (deps.ingestInventory && reliable) {
      const ingestion = await deps.ingestInventory(inventory, { workspaceId });
      outcome.processCounters = ingestion?.processCounters || null;
      outcome.communicationCounters = ingestion?.communicationCounters || null;
    }
    if (deps.reportDirectory) {
      try {
        outcome.reportPath = await writePjeInventoryXls(inventory, { directory: deps.reportDirectory });
      } catch {
        outcome.reportPath = null;
      }
      // Estrutura do DOM observada: diagnostico de coleta que roda mesmo quando o
      // estado cai em load_timeout e o XLS sai vazio. Sem texto de expediente ou PII.
      if (inventory?.structure) {
        try {
          const file = path.join(deps.reportDirectory, `PJe_${portalConfig.id}_estrutura.json`);
          await writeFile(file, JSON.stringify({ portalId: portalConfig.id, collectedAt: inventory.collectedAt, structure: inventory.structure, navigation: inventory.navigation || null }, null, 2));
          outcome.structurePath = file;
        } catch {
          outcome.structurePath = null;
        }
      }
    }
    onStage({ stage: 'import', status: reliable ? 'done' : 'skipped' });
    return outcome;
  } catch (error) {
    const stage = outcome.errorStage || (outcome.authStatus !== 'verified' ? 'auth' : 'collect');
    outcome.errorCode = error?.errorCode || error?.code || 'PJE-ERROR';
    outcome.errorStage = stage;
    outcome.errorMessage = String(error?.message || error).slice(0, 280);
    if (stage === 'auth') outcome.authStatus = 'error';
    throw Object.assign(new Error(outcome.errorMessage), { outcome });
  } finally {
    if (session?.close) await session.close().catch(() => {});
  }
}

export class PjeSyncService {
  constructor({ executor, auditDirectory = '', jobsFile = '', host = () => true, logger = console } = {}) {
    this.executor = executor;
    this.auditDirectory = auditDirectory;
    this.jobsFile = jobsFile;
    this.host = host;
    this.logger = logger;
    this.jobs = new Map();
    this.activeByPortal = new Map();
  }

  async loadAndRecover() {
    if (!this.jobsFile) return { recovered: 0 };
    try {
      const parsed = JSON.parse(await readFile(this.jobsFile, 'utf8'));
      const persisted = Array.isArray(parsed?.jobs) ? parsed.jobs : [];
      let recovered = 0;
      for (const job of persisted) {
        if (!job?.jobId) continue;
        if ([PJE_JOB_STATUS.QUEUED, PJE_JOB_STATUS.RUNNING].includes(job.status)) {
          job.status = PJE_JOB_STATUS.ERROR;
          job.errorCode = job.errorCode || 'PROCESS_RESTARTED';
          job.errorStage = job.errorStage || job.stage || 'run';
          job.finishedAt = job.finishedAt || nowIso();
          recovered += 1;
        }
        this.jobs.set(job.jobId, job);
      }
      if (recovered) await this.#persist();
      return { recovered };
    } catch (error) {
      // Arquivo inexistente é primeira execução; qualquer outro erro precisa ser declarado —
      // sumir com o histórico em silêncio é o mesmo defeito dos jobs sem desfecho.
      if (error?.code !== 'ENOENT') {
        this.logger?.warn?.(`[PjeSync] Histórico de jobs não pôde ser lido (${error?.message || error}); seguindo sem recuperação.`);
      }
      return { recovered: 0 };
    }
  }

  /**
   * Desfecho declarado de todo job: uma linha por execução, com status, contadores e código de
   * erro. Sem isso o agendamento registrava só "Sync agendado" e a falha (ou o sucesso) ficava
   * invisível — foi assim que 26 jobs ERROR passaram por "job que nunca executa".
   */
  #logOutcome(job) {
    try {
      const duration = sanitizeDuration(job.startedAt, job.finishedAt);
      const partes = [
        `job ${job.jobId}`,
        `trigger ${job.trigger || 'manual'}`,
        `runtime ${job.runtime || 'auto'}`,
        duration === null ? 'duração não medida' : `${Math.round(duration / 1000)}s`,
        `expedientes ${job.expedientesStatus || '-'}`,
        `acervo ${job.acervoStatus || '-'}`
      ];
      if (job.expected !== null || job.collected !== null) {
        partes.push(`coletados ${job.collected ?? '-'}/${job.expected ?? '-'}`);
      }
      if (job.missing !== null && job.missing !== undefined) partes.push(`faltando ${job.missing}`);
      if (job.errorCode) partes.push(`errorCode ${job.errorCode}${job.errorStage ? ` (estágio ${job.errorStage})` : ''}`);
      this.logger?.log?.(`[PjeSync] ${job.portalId} ${job.status} — ${partes.join(' · ')}`);
    } catch (error) {
      console.error('[PjeSync] Falha ao registrar o desfecho do job', job?.jobId, error?.message || error);
    }
  }

  async #persist() {
    if (!this.jobsFile) return;
    const jobs = [...this.jobs.values()].slice(-200);
    const payload = { version: 1, updatedAt: nowIso(), jobs };
    await mkdir(path.dirname(this.jobsFile), { recursive: true });
    const temp = this.jobsFile + '.' + process.pid + '.' + Date.now() + '.tmp';
    await writeFile(temp, JSON.stringify(payload, null, 2), { mode: 0o600 });
    await rename(temp, this.jobsFile);
  }

  getJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    return { ...job, percent: null, durationMs: sanitizeDuration(job.startedAt, job.finishedAt) };
  }

  listJobs(workspaceId = '') {
    return [...this.jobs.values()]
      .filter(job => !workspaceId || job.workspaceId === workspaceId)
      .map(job => ({ ...job, percent: null, durationMs: sanitizeDuration(job.startedAt, job.finishedAt) }))
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  }

  latestJobForPortal(workspaceId, portalId) {
    return this.listJobs(workspaceId).find(job => job.portalId === portalId) || null;
  }

  requestSync({ workspaceId = '', portalId, portal, runtime = 'auto', trigger = 'manual', triggerBy = '' } = {}) {
    if (!workspaceId || !portalId) throw Object.assign(new Error('workspaceId e portalId são obrigatórios.'), { statusCode: 400 });
    const key = `${workspaceId}:${portalId}`;
    const existingJobId = this.activeByPortal.get(key);
    if (existingJobId) {
      const existing = this.jobs.get(existingJobId);
      if (existing && [PJE_JOB_STATUS.QUEUED, PJE_JOB_STATUS.RUNNING].includes(existing.status)) {
        return { jobId: existingJobId, joinedExisting: true, status: existing.status };
      }
    }
    const jobId = `pje-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const job = {
      jobId,
      workspaceId,
      portalId,
      portalName: portal?.name || portalId,
      collectorFamily: collectorForPortal(portal).family,
      runtime,
      trigger,
      triggerBy,
      status: PJE_JOB_STATUS.QUEUED,
      stage: 'queued',
      authStatus: 'pending',
      expedientesStatus: null,
      acervoStatus: null,
      expected: null,
      collected: null,
      missing: null,
      diff: null,
      processCounters: null,
      communicationCounters: null,
      errorCode: null,
      errorStage: null,
      startedAt: nowIso(),
      finishedAt: null
    };
    this.jobs.set(jobId, job);
    this.activeByPortal.set(key, jobId);
    void this.#persist().catch(error => this.logger?.warn?.(`[PjeSync] Persistência do job ${jobId} falhou: ${error?.message || error}`));
    void this.#run(job, portal)
      // Rede de segurança do contrato: nenhum job pode terminar sem desfecho declarado.
      .catch(error => {
        if ([PJE_JOB_STATUS.QUEUED, PJE_JOB_STATUS.RUNNING].includes(job.status)) {
          job.status = PJE_JOB_STATUS.ERROR;
          job.errorCode = job.errorCode || 'PJE-ERROR';
          job.errorStage = job.errorStage || job.stage || 'run';
          job.finishedAt = job.finishedAt || nowIso();
          this.#logOutcome(job);
        }
        this.logger?.warn?.(`[PjeSync] Job ${jobId} terminou de forma inesperada: ${error?.message || error}`);
      })
      .finally(() => {
        if (this.activeByPortal.get(key) === jobId) this.activeByPortal.delete(key);
      });
    return { jobId, joinedExisting: false, status: job.status };
  }

  async #run(job, portal) {
    job.status = PJE_JOB_STATUS.RUNNING;
    job.stage = 'auth';
    await this.#persist().catch(() => {});
    try {
      const outcome = await this.executor({
        portal,
        runtime: job.runtime,
        workspaceId: job.workspaceId,
        onStage: event => {
          job.stage = event.stage;
        },
        onEvent: event => {
          // Últimos eventos do auth ficam no job para diagnóstico; nada de
          // segredo (TOTP/senha) entra aqui, só o tipo de estado observado.
          if (!Array.isArray(job.authSteps)) job.authSteps = [];
          job.authSteps.push({
            kind: String(event?.kind || 'unknown'),
            origin: event?.origin || null,
            task: event?.task || null,
            available: typeof event?.available === 'boolean' ? event.available : null,
            seconds: Number.isFinite(Number(event?.seconds)) ? Number(event.seconds) : null
          });
          if (job.authSteps.length > 40) job.authSteps.splice(0, job.authSteps.length - 40);
          this.logger?.log?.(`[PjeAuth] ${job.portalId} ${JSON.stringify(job.authSteps[job.authSteps.length - 1])}`);
        }
      });
      Object.assign(job, {
        authStatus: outcome.authStatus,
        expedientesStatus: outcome.expedientesStatus,
        acervoStatus: outcome.acervoStatus,
        acervoCounts: outcome.acervoCounts ?? null,
        expected: outcome.expected,
        collected: outcome.collected,
        missing: outcome.missing,
        diff: outcome.diff ?? job.diff,
        processCounters: outcome.processCounters ?? job.processCounters,
        communicationCounters: outcome.communicationCounters ?? job.communicationCounters,
        collectorFamily: outcome.collectorFamily || job.collectorFamily,
        errorCode: null,
        errorStage: null
      });
      if (!outcome.reliable) {
        job.status = PJE_JOB_STATUS.SKIPPED_UNRELIABLE;
      } else if (['DEGRADED'].includes(outcome.status)) {
        job.status = PJE_JOB_STATUS.DEGRADED;
      } else if (outcome.diff?.status === 'UNCHANGED') {
        job.status = PJE_JOB_STATUS.UNCHANGED;
      } else {
        job.status = PJE_JOB_STATUS.COMPLETED;
      }
    } catch (error) {
      const outcome = error?.outcome || {};
      Object.assign(job, {
        status: PJE_JOB_STATUS.ERROR,
        authStatus: outcome.authStatus || job.authStatus,
        errorCode: outcome.errorCode || error?.errorCode || 'PJE-ERROR',
        errorStage: outcome.errorStage || 'run'
      });
    } finally {
      job.finishedAt = nowIso();
      job.stage = job.status === PJE_JOB_STATUS.RUNNING ? 'finished' : job.stage;
      await this.#audit(job).catch(error => this.logger?.warn?.(`[PjeSync] Auditoria do job ${job.jobId} falhou: ${error?.message || error}`));
      await this.#persist().catch(error => this.logger?.warn?.(`[PjeSync] Persistência do job ${job.jobId} falhou: ${error?.message || error}`));
      this.#logOutcome(job);
    }
  }

  async #audit(job) {
    if (!this.auditDirectory) return;
    const record = {
      syncId: job.jobId,
      workspaceId: job.workspaceId,
      portalId: job.portalId,
      runtime: job.runtime,
      collectorFamily: job.collectorFamily,
      trigger: job.trigger,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      durationMs: sanitizeDuration(job.startedAt, job.finishedAt),
      finalStatus: job.status,
      auth: job.authStatus,
      acervo: job.acervoStatus,
      expedientes: job.expedientesStatus,
      expected: job.expected,
      collected: job.collected,
      missing: job.missing,
      diff: job.diff,
      processCounters: job.processCounters,
      communicationCounters: job.communicationCounters,
      errorCode: job.errorCode,
      errorStage: job.errorStage
    };
    await mkdir(this.auditDirectory, { recursive: true });
    await appendFile(path.join(this.auditDirectory, 'sync-audit.jsonl'), `${JSON.stringify(record)}\n`, 'utf8');
  }
}

export async function applyPjeInventoryToState({ readAppStateEnvelope, saveState, workspaceId, inventory }) {
  const envelope = await readAppStateEnvelope();
  const merged = mergePjeInventoryIntoState(envelope.state, inventory, { workspaceId });
  let sessionCounters = null;
  const pauta = inventory?.pauta;
  if (pauta?.collectionStatus?.collected === true) {
    sessionCounters = reconcileEprocSessions(merged.state, {
      portalId: pauta.portalId,
      portalLabel: pauta.portalLabel,
      sourcePrefix: 'pje',
      collectedAt: new Date().toISOString(),
      sessions: Array.isArray(pauta.sessions) ? pauta.sessions : [],
      collectionStatus: pauta.collectionStatus
    });
  }
  const hearingCounters = reconcilePjeAcervoHearings(merged.state, inventory);
  await saveState(merged.state, envelope.revision, workspaceId);
  return {
    hearingCounters,
    processCounters: {
      processesCreated: merged.counters.processesCreated,
      processesUpdated: merged.counters.processesUpdated,
      processesUnchanged: merged.counters.processesUnchanged
    },
    communicationCounters: {
      communicationsCreated: merged.counters.communicationsCreated,
      communicationsUpdated: merged.counters.communicationsUpdated,
      communicationsUnchanged: merged.counters.communicationsUnchanged,
      communicationsRemoved: merged.counters.communicationsRemoved
    },
    sessionCounters
  };
}

export function listPjeCommunicationsFromState(state, { workspaceId = '', portalId = '', status = '', processNumber = '', situation = '', hasSourceDeadline = null, includeDeleted = false, page = 1, pageSize = 25 } = {}) {
  const all = (state?.communications || []).filter(item => {
    if (!includeDeleted && item.deletedAt) return false;
    if (workspaceId && item.workspaceId !== workspaceId) return false;
    if (portalId && item.portalId !== portalId) return false;
    if (status && item.status !== status) return false;
    if (processNumber && !String(item.processNumber || '').includes(processNumber)) return false;
    if (situation && !(item.situationMemberships || []).some(label => label === situation)) return false;
    if (hasSourceDeadline === true && !item.sourceReportedDeadlineAt) return false;
    if (hasSourceDeadline === false && item.sourceReportedDeadlineAt) return false;
    return true;
  });
  const total = all.length;
  const size = Math.max(1, Math.min(100, Number(pageSize) || 25));
  const current = Math.max(1, Number(page) || 1);
  const start = (current - 1) * size;
  return {
    total,
    page: current,
    pageSize: size,
    items: all.slice(start, start + size).map(item => ({
      id: item.id,
      portalId: item.portalId,
      processNumber: item.processNumber,
      source: item.source,
      type: item.type || '',
      status: item.status,
      situationMemberships: item.situationMemberships || [],
      sourceReportedScienceAt: item.sourceReportedScienceAt || '',
      sourceReportedDeadlineAt: item.sourceReportedDeadlineAt || '',
      courtUnit: item.courtUnit || '',
      firstSeenAt: item.firstSeenAt,
      lastSeenAt: item.lastSeenAt,
      version: item.version || 1,
      deletedAt: item.deletedAt || null
    }))
  };
}

export function buildPjePortalsStatus({ portals, service, workspaceId = '', config = {} } = {}) {
  const enabled = new Set(config.enabledPortals || []);
  return (portals || listPjePortals()).map(portal => {
    const lastJob = service?.latestJobForPortal(workspaceId, portal.id) || null;
    const resolution = resolvePjeCollector(portal);
    const verified = Boolean(config.verifiedPortals?.includes?.(portal.id))
      || Boolean(lastJob && [PJE_JOB_STATUS.COMPLETED, PJE_JOB_STATUS.UNCHANGED].includes(lastJob.status) && lastJob.authStatus === 'verified');
    let statusLabel = 'Não verificado';
    if (!config.pjeEnabled) statusLabel = 'PJe desabilitado';
    else if (lastJob?.status === PJE_JOB_STATUS.RUNNING) statusLabel = 'Sincronizando';
    else if (lastJob?.status === PJE_JOB_STATUS.ERROR) statusLabel = 'Erro';
    else if (lastJob?.status === PJE_JOB_STATUS.SKIPPED_UNRELIABLE) statusLabel = 'Degradado';
    else if (lastJob?.status === PJE_JOB_STATUS.DEGRADED) statusLabel = 'Degradado';
    else if (lastJob && [PJE_JOB_STATUS.COMPLETED, PJE_JOB_STATUS.UNCHANGED].includes(lastJob.status) && verified) statusLabel = 'Verificado';
    return {
      id: portal.id,
      name: portal.name,
      court: portal.court,
      grau: portal.grau,
      layoutFamily: portal.layoutFamily,
      collectorKey: resolution.collectorKey,
      collectorImplemented: resolution.status === 'implemented',
      runtimePreference: portal.runtime,
      enabled: enabled.has(portal.id),
      routeStatus: portal.routeStatus,
      statusLabel,
      verification: verified ? 'verified' : 'unverified',
      lastSync: lastJob ? {
        jobId: lastJob.jobId,
        status: lastJob.status,
        stage: lastJob.stage,
        finishedAt: lastJob.finishedAt,
        durationMs: lastJob.durationMs,
        acervo: lastJob.acervoStatus,
        expedientes: lastJob.expedientesStatus,
        expected: lastJob.expected,
        collected: lastJob.collected,
        missing: lastJob.missing,
        errorCode: lastJob.errorCode
      } : null
    };
  });
}

// Decisão pura do scheduler automático: qual portal deve iniciar sync agora. Não guarda
// estado; recebe config, portais e jobs do workspace.
//
// **Sequencial por desenho**: o runtime PJe usa um certificado por vez (o A1 do escritório é
// apresentado ao PJeOffice e o diálogo de senha é único), então o tick libera **um** portal —
// o mais atrasado (nunca executado primeiro; empate resolve pela ordem de configuração) — e
// deixa os demais marcados como `waiting_turn`. O tick seguinte, já com o primeiro concluído,
// libera o próximo: é assim que a cadência das 7/12/19 atende N escritórios trocando o
// certificado entre as execuções, sem nunca abrir dois navegadores autenticados ao mesmo tempo.
export function computeDuePjePortals({ config, portals, jobs, nowMs = Date.now() } = {}) {
  const skipped = {};
  if (!config?.pjeEnabled) return { due: [], skipped, reason: 'pje_disabled' };
  if (!config?.automaticSyncEnabled) return { due: [], skipped, reason: 'automatic_disabled' };
  const intervalMs = Math.max(60, Number(config.syncIntervalMinutes) || 360) * 60_000;
  const due = [];
  for (const portalId of config.enabledPortals || []) {
    const portal = (portals || []).find(item => item.id === portalId);
    if (!portal) {
      skipped[portalId] = 'unknown_portal';
      continue;
    }
    if (resolvePjeCollector(portal).status !== 'implemented') {
      skipped[portalId] = 'collector_not_implemented';
      continue;
    }
    const portalJobs = (jobs || []).filter(job => job.portalId === portalId);
    if (portalJobs.some(job => [PJE_JOB_STATUS.QUEUED, PJE_JOB_STATUS.RUNNING].includes(job.status))) {
      skipped[portalId] = 'active';
      continue;
    }
    const last = portalJobs
      .slice()
      .sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')))[0];
    if (last?.finishedAt && (nowMs - Date.parse(last.finishedAt)) < intervalMs) {
      skipped[portalId] = 'not_due';
      continue;
    }
    due.push({ portalId, lastFinishedMs: last?.finishedAt ? Date.parse(last.finishedAt) : 0 });
  }
  if (due.length === 0) return { due: [], skipped, reason: null };
  // Mais atrasado primeiro; empate (inclusive "nunca executado") preserva a ordem da config.
  due.sort((a, b) => a.lastFinishedMs - b.lastFinishedMs);
  const chosen = due[0].portalId;
  for (const item of due.slice(1)) skipped[item.portalId] = 'waiting_turn';
  return { due: [chosen], skipped, reason: null };
}
