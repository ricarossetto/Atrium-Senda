/**
 * ATRIUM Sovereign Judicial Connectivity — Legacy eproc job view
 *
 * Compatibilidade temporária: o acompanhamento legado (/api/integrations/eproc/sweep)
 * passa a ser uma PROJEÇÃO somente-leitura do job oficial do EprocSyncScheduler.
 * Não existe segundo pipeline: este módulo apenas traduz telemetria.
 */

import { emptyEprocSweepJob } from './legacy-operation-state.mjs';

const PHASE_STEPS = Object.freeze({
  queued: 1,
  connecting: 1,
  auth: 1,
  a1_loaded: 1,
  mtls_started: 1,
  tls_handshake: 1,
  keycloak_auth: 2,
  keycloak_opened: 2,
  cert_login_clicked: 2,
  totp_challenge_detected: 2,
  totp_generated: 2,
  totp_submitted: 2,
  redirect_awaited: 2,
  eproc_session_confirmed: 2,
  panel_opened: 3,
  panel_query: 3,
  report_download: 3,
  report_diff: 3,
  process_sweep_start: 4,
  processing_processes: 4,
  consolidating: 5,
  completing: 5,
  completed: 5,
  partial_error: 5
});

export function legacyStepForPhase(phase) {
  return PHASE_STEPS[String(phase || '').toLowerCase()] || 1;
}

export function buildLegacyEprocJobView({ workspaceId, canonical = null, previous = null } = {}) {
  const base = previous && previous.workspaceId === workspaceId ? previous : emptyEprocSweepJob(workspaceId);
  const job = canonical?.job || null;
  // Sem job oficial ativo e sem acompanhamento iniciado neste ciclo, o estado legado
  // permanece idle (inclusive após um reset explícito do acompanhamento).
  if (!job || (canonical.active !== true && !base.id)) {
    return { ...base, ok: true };
  }

  const portal = (Array.isArray(job.portals) ? job.portals[0] : null) || {};
  const isRunning = canonical.active === true || job.state === 'RUNNING';
  const isError = !isRunning && job.state === 'ERROR';
  const logs = Array.isArray(base.logs) ? [...base.logs] : [];
  if (portal.log && !logs.includes(portal.log)) logs.push(portal.log);

  const determinate = portal.determinate === true && typeof portal.percent === 'number' && Number.isFinite(portal.percent);
  const startedAt = job.startedAt ? (Date.parse(job.startedAt) || base.startedAt) : base.startedAt;

  return {
    ...base,
    ok: true,
    id: job.id || base.id,
    status: isRunning ? 'running' : (isError ? 'error' : 'completed'),
    determinate,
    progress: determinate ? Math.max(0, Math.min(100, Math.round(portal.percent))) : null,
    completed: typeof portal.completed === 'number' ? portal.completed : null,
    total: typeof portal.total === 'number' ? portal.total : null,
    phase: portal.phase || base.phase || '',
    step: legacyStepForPhase(portal.phase) || base.step || 1,
    action: portal.action || base.action || '',
    logs: logs.slice(-80),
    error: isError ? (portal.error || job.error || 'Erro durante a sincronização eproc.') : null,
    result: isRunning ? null : {
      ok: !isError,
      discoverySource: portal.discoverySource || null,
      reportStatus: portal.reportStatus || null,
      counts: portal.counts || null,
      reportCounts: portal.reportCounts || null,
      agendaCounts: portal.agendaCounts || null,
      warnings: Array.isArray(portal.warnings) ? portal.warnings : [],
      errors: Array.isArray(portal.errors) ? portal.errors : [],
      partialResults: portal.partialResults || null
    },
    startedAt,
    updatedAt: Date.now()
  };
}
