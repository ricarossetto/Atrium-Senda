import { getEprocPortalById, isEprocPortalLiveSyncVerified } from './portal-registry.mjs';
import { sanitizeTelemetryPayload } from './telemetry.mjs';

export function createEprocRuntimeExecutor({
  sweep,
  securityManager,
  credentialManager,
  readStateEnvelope,
  saveState,
  allowSweep,
  isWorkspaceBusy,
  maxProcesses = 4,
  publicSearchRuntime = null
} = {}) {
  if (typeof sweep !== 'function') throw new Error('Coletor eproc real não configurado.');

  const executor = async ({ portalId, workspaceId, onProgress, allowManualVerification = false, allowWorkspaceVerified = false, targetProcessNumber = null, maxProcesses: requestedMaxProcesses = null }) => {
    const portal = getEprocPortalById(portalId);
    const isManualCandidate = portal?.capabilities?.manualVerificationCandidate === true;
    if (!isEprocPortalLiveSyncVerified(portalId) && !(allowManualVerification && isManualCandidate) && !allowWorkspaceVerified) {
      throw new Error(`Portal ${portalId} ainda não possui conexão live verificada.`);
    }
    if (typeof allowSweep === 'function' && !allowSweep(workspaceId)) {
      throw new Error('A sincronização eproc via A1 não está disponível para este escritório neste runtime.');
    }
    if (typeof isWorkspaceBusy === 'function' && isWorkspaceBusy(workspaceId)) {
      throw Object.assign(
        new Error('Outra operação eproc deste escritório está em andamento. Aguarde a conclusão antes de sincronizar.'),
        { code: 'EPROC_BUSY' }
      );
    }

    const authTimeline = [];
    const authStages = new Set(['a1_loaded', 'mtls_started', 'mtls_confirmed', 'keycloak_opened', 'cert_login_clicked', 'totp_challenge_detected', 'totp_generated', 'totp_submitted', 'redirect_awaited', 'eproc_session_confirmed', 'panel_opened']);

    const normalizedRequestedMax = requestedMaxProcesses === null || requestedMaxProcesses === undefined || String(requestedMaxProcesses).trim() === ''
      ? null
      : Number(requestedMaxProcesses);
    const effectiveMaxProcesses = normalizedRequestedMax !== null && Number.isFinite(normalizedRequestedMax)
      ? Math.max(0, normalizedRequestedMax)
      : maxProcesses;
    const result = await sweep({
        portalId,
        processNumber: targetProcessNumber || undefined,
        securityManager,
        readStateEnvelope,
        saveState,
        credentialManager,
        maxProcesses: effectiveMaxProcesses,
        judicialOperation: 'syncReadOnly',
        allowUnverified: allowManualVerification || allowWorkspaceVerified,
        profileKey: `scheduler-${String(workspaceId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        onProgress: ({ progress, step, action, log, determinate, completed, total, phase, authStage, timestamp }) => {
          if (authStages.has(authStage) && timestamp && Number.isFinite(Date.parse(timestamp)) && authTimeline.length < 32) {
            authTimeline.push({ authStage, timestamp: new Date(timestamp).toISOString() });
          }
          onProgress?.({
            phase: phase || 'running',
            step: step || null,
            action: action || log || 'Sincronização eproc em andamento.',
            determinate: determinate === true,
            completed: typeof completed === 'number' ? completed : null,
            total: typeof total === 'number' ? total : null,
            percent: determinate === true && typeof progress === 'number' ? progress : null,
            ...(log ? { log } : {}),
            ...(authTimeline.length ? { authTimeline: sanitizeTelemetryPayload(authTimeline) } : {})
          });
        }
      });

    // "processos consultados" reflete a carteira lida no relatório oficial; sem
    // relatório (fallback), usa os alvos efetivamente processados.
    const reportConsulted = Number(result?.reportDelta?.newCount || 0)
      + Number(result?.reportDelta?.updatedCount || 0)
      + Number(result?.reportDelta?.unchangedCount || 0);

    return {
      ok: result?.ok === true,
      error: result?.error || (!result?.ok ? result?.message || 'O pipeline eproc não confirmou a conclusão.' : null),
      errors: Array.isArray(result?.errors) ? result.errors : [],
      warnings: Array.isArray(result?.warnings) ? result.warnings.map(warning => String(warning).slice(0, 300)) : [],
      discoverySource: result?.discoverySource || null,
      reportStatus: result?.reportStatus || null,
      partialResults: result?.partial ? {
        updatedProcesses: result.updatedProcesses || [],
        sourceReconciliation: result.sourceReconciliation || null,
        discoverySource: result.discoverySource || null,
        deferredEnrichmentCount: Number(result.deferredEnrichmentCount || 0)
      } : null,
      authTimeline: sanitizeTelemetryPayload(authTimeline),
      counts: {
        processes: reportConsulted > 0 ? reportConsulted : Number(result?.sweptCount || 0),
        enrichedProcesses: Number(result?.enrichedCount || 0),
        deadlines: Number(result?.deadlinesCollectedCount || 0),
        intimations: Number(result?.pendingIntimationsCollectedCount ?? result?.newIntimationsCount ?? 0)
      },
      reportCounts: {
        newProcesses: Number(result?.reportDelta?.newCount || 0),
        updatedProcesses: Number(result?.reportDelta?.updatedCount || 0),
        unchangedProcesses: Number(result?.reportDelta?.unchangedCount || 0),
        inactiveProcesses: Number(result?.reportDelta?.inactiveCount || 0),
        deferredProcesses: Number(result?.deferredEnrichmentCount || 0)
      },
      agendaCounts: {
        hearingsSeen: Number(result?.hearingsCount || 0),
        hearingsCreated: Number(result?.hearingsCreated || 0),
        hearingsUpdated: Number(result?.hearingsUpdated || 0),
        hearingsInactive: Number(result?.hearingsInactive || 0),
        sessionsSeen: Number(result?.sessionsCount || 0),
        sessionsCreated: Number(result?.sessionsCreated || 0),
        sessionsUpdated: Number(result?.sessionsUpdated || 0),
        sessionsInactive: Number(result?.sessionsInactive || 0)
      }
    };
  };

  // Diagnóstico honesto do wiring da consulta pública por chave: nunca expõe a chave
  // nem o cliente, apenas o estado resolvido (desligado, pronto, indisponível, falhou).
  executor.getPublicSearchStatus = async () => {
    if (!publicSearchRuntime) return { enabled: false, state: 'disabled', client: false, reason: null };
    try {
      const runtime = await Promise.resolve(publicSearchRuntime);
      return {
        enabled: runtime?.enabled === true,
        state: runtime?.state || 'unknown',
        client: Boolean(runtime?.client),
        reason: runtime?.reason || null
      };
    } catch (error) {
      return {
        enabled: true,
        state: 'failed',
        client: false,
        reason: 'RUNTIME_UNAVAILABLE',
        error: String(error?.message || error || 'Falha ao resolver o runtime de consulta pública.').slice(0, 200)
      };
    }
  };

  return executor;
}
