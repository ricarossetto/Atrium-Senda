/**
 * ATRIUM Sovereign Judicial Connectivity — Eproc Delta Sync Engine
 *
 * Implements low-session differential synchronization for judicial processes:
 * - UNCHANGED: Process already persisted and last movement is identical. Zero network calls, zero session load.
 * - NEW: Process not present in local inventory. Enters enrichment pipeline.
 * - UPDATED: Process present but has newer event timestamp or changed metadata. Enters enrichment pipeline.
 * - REMOVED_OR_INACTIVE: Previously tracked process no longer present in active report.
 */

function makeKey(portalId, cnj) {
  return `${portalId || 'eproc-generic'}:${String(cnj || '').replace(/\D/g, '')}`.toLowerCase();
}

/**
 * Computes delta classification between incoming report processes and persisted inventory.
 *
 * @param {Array<Object>} incomingProcesses List of processes from RelatorioProcessos.xls
 * @param {Array<Object>|Map<string, Object>} persistedProcesses Current Atrium process inventory
 * @param {Object} [options]
 * @param {string} [options.portalId]
 * @returns {Object} Delta classification result
 */
export function computeEprocProcessDelta(incomingProcesses = [], persistedProcesses = [], options = {}) {
  const portalId = options.portalId || 'eproc-generic';

  // Build lookup index of persisted processes
  const persistedIndex = new Map();
  if (persistedProcesses instanceof Map) {
    for (const [k, v] of persistedProcesses.entries()) {
      persistedIndex.set(k.toLowerCase(), v);
    }
  } else if (Array.isArray(persistedProcesses)) {
    for (const p of persistedProcesses) {
      const pKey = makeKey(p.portalId || portalId, p.cnj || p.number);
      persistedIndex.set(pKey, p);
    }
  }

  const unchanged = [];
  const newProcesses = [];
  const updatedProcesses = [];
  const legacySecrecyReview = [];
  const incomingSeenKeys = new Set();

  for (const inc of incomingProcesses) {
    const key = makeKey(inc.portalId || portalId, inc.cnj || inc.number);
    incomingSeenKeys.add(key);

    const existing = persistedIndex.get(key);
    if (!existing) {
      newProcesses.push({
        ...inc,
        deltaType: 'NEW',
        changeReason: 'NOT_IN_INVENTORY'
      });
      continue;
    }

    // Compare movement state and structural metadata
    const eventChanged = (inc.lastEvent || '') !== (existing.lastEvent || '');
    const dateChanged = (inc.lastEventAt || inc.rawLastEventDate || '') !== (existing.lastEventAt || existing.rawLastEventDate || '');
    const classChanged = (inc.actionClass || '') !== (existing.actionClass || '');
    const unitChanged = (inc.judicialUnit || '') !== (existing.judicialUnit || '');
    const valueChanged = (inc.caseValue || '') !== (existing.caseValue || '');

    if (eventChanged || dateChanged || classChanged || unitChanged || valueChanged) {
      const changes = [];
      if (eventChanged) changes.push(`EVENT: '${existing.lastEvent || ''}' -> '${inc.lastEvent || ''}'`);
      if (dateChanged) changes.push(`DATE: '${existing.lastEventAt || ''}' -> '${inc.lastEventAt || ''}'`);
      if (classChanged) changes.push(`CLASS: '${existing.actionClass || ''}' -> '${inc.actionClass || ''}'`);
      if (unitChanged) changes.push(`UNIT: '${existing.judicialUnit || ''}' -> '${inc.judicialUnit || ''}'`);
      if (valueChanged) changes.push(`VALUE: '${existing.caseValue || ''}' -> '${inc.caseValue || ''}'`);

      updatedProcesses.push({
        ...inc,
        deltaType: 'UPDATED',
        previousState: {
          lastEvent: existing.lastEvent,
          lastEventAt: existing.lastEventAt,
          actionClass: existing.actionClass,
          judicialUnit: existing.judicialUnit,
          caseValue: existing.caseValue
        },
        changeReason: changes.join('; '),
        enrichmentStatus: (existing.hasAccessKey || existing.accessKey) ? (existing.enrichmentStatus || 'COMPLETE') : 'PENDING'
      });
    } else {
      const isPending = existing.enrichmentStatus === 'PENDING' || existing.enrichmentStatus === 'RETRYABLE_ERROR' || Boolean(existing.needsEnrichment);
      const entry = {
        ...inc,
        deltaType: 'UNCHANGED',
        id: existing.id || undefined,
        enrichmentStatus: isPending ? 'PENDING' : (existing.enrichmentStatus || 'COMPLETE'),
        needsEnrichment: isPending
      };
      unchanged.push(entry);
      // Revisão única de marca de sigilo sem confirmação: qualquer `secrecy: true`
      // sem marcação manual e sem revisão registrada é relido uma vez — inclusive
      // marcas legadas que já carregam a tag de origem (a releitura confirma ou
      // limpa). Processos já pendentes entram pelo backlog normal, sem duplicação.
      const secrecyReview = existing.secrecy === true
        && existing.secrecyManual !== true
        && !existing.secrecyReviewedAt;
      if (secrecyReview && !isPending) {
        legacySecrecyReview.push({
          ...entry,
          enrichmentStatus: 'PENDING',
          needsEnrichment: true,
          secrecy: true
        });
      }
    }
  }

  // Detect processes removed or inactive from current report
  // CRITICAL RULE: Absence in active report is strictly an audit/reconciliation signal.
  // It NEVER deletes, soft-deletes, or terminates client representation automatically.
  const inactiveOrRemoved = [];
  for (const [pKey, pVal] of persistedIndex.entries()) {
    if (!incomingSeenKeys.has(pKey)) {
      inactiveOrRemoved.push({
        ...pVal,
        deltaType: 'REMOVED_OR_INACTIVE',
        reconciliationStatus: 'ABSENT_FROM_ACTIVE_REPORT_SIGNAL',
        actionRequired: 'AUDIT_ONLY_NO_AUTO_DELETE',
        note: 'Ausência no relatório de acervo ativo é sinal de reconciliação (arquivamento, substabelecimento ou filtro). Preservado sem alteração destrutiva.'
      });
    }
  }

  // Backlog-aware candidates: includes NEW, UPDATED, and any UNCHANGED with PENDING/RETRYABLE_ERROR enrichment status
  const pendingBacklogUnchanged = unchanged.filter(p => p.enrichmentStatus === 'PENDING' || p.enrichmentStatus === 'RETRYABLE_ERROR');

  return {
    portalId,
    totalIncoming: incomingProcesses.length,
    unchangedCount: unchanged.length,
    newCount: newProcesses.length,
    updatedCount: updatedProcesses.length,
    inactiveCount: inactiveOrRemoved.length,
    pendingBacklogCount: pendingBacklogUnchanged.length,
    legacySecrecyReviewCount: legacySecrecyReview.length,
    unchanged,
    newProcesses,
    updatedProcesses,
    inactiveOrRemoved,
    // Enrichment candidates: NEW + UPDATED + pending backlog + revisão de sigilo legado
    enrichmentCandidates: [...newProcesses, ...updatedProcesses, ...pendingBacklogUnchanged, ...legacySecrecyReview]
  };
}
