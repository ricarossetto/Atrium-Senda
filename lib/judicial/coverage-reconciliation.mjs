const ACTIVE_STATES = new Set(['syncing', 'running', 'pending', 'authenticating', 'connecting']);

/** Project canonical eproc state onto the managed-coverage row. */
export function reconcileManagedEprocCoverage(managedCoverage = [], eprocPortals = [], {
  normalizePortalId = value => String(value || '').trim()
} = {}) {
  const eprocByPortal = new Map((Array.isArray(eprocPortals) ? eprocPortals : [])
    .map(item => [normalizePortalId(item?.id), item]));
  return (Array.isArray(managedCoverage) ? managedCoverage : []).map(item => {
    const canonicalId = normalizePortalId(item?.id);
    const eproc = String(item?.system || '').trim().toLowerCase() === 'eproc'
      ? eprocByPortal.get(canonicalId) : null;
    if (!eproc) return item;
    const lastSuccessfulSyncAt = eproc.lastSuccessfulSyncAt || item.lastSuccessfulSyncAt || null;
    const eprocState = String(eproc.status || '').trim().toLowerCase();
    const active = ACTIVE_STATES.has(eprocState);
    const currentError = !active && (Boolean(eproc.lastError) || eprocState === 'error');
    const lastAttemptAt = eproc.lastAttemptAt || item.lastAttemptAt || null;
    const metrics = eproc.metrics ? { syncMetrics: eproc.metrics } : {};
    if (active) return {
      ...item, connectivityState: 'authenticating', lastAttemptAt, lastSuccessfulSyncAt,
      verification: lastSuccessfulSyncAt ? 'verified' : item.verification,
      lastError: null, humanAction: null, ...metrics
    };
    if (currentError) return {
      ...item, connectivityState: 'error',
      verification: lastSuccessfulSyncAt ? 'verified' : item.verification,
      lastSuccessfulSyncAt, lastAttemptAt,
      lastError: eproc.lastError || item.lastError || 'A última sincronização eproc falhou.',
      // O erro oficial do pipeline eproc é a autoridade: o texto de intervenção do
      // coletor gerenciado legado ("conclua o login…") não descreve o fluxo atual
      // (certificado/TOTP no cofre) e sai da linha para não induzir a ação errada.
      humanAction: null, ...metrics
    };
    if (lastSuccessfulSyncAt) return {
      ...item, connectivityState: 'connected', verification: 'verified',
      lastSuccessfulSyncAt, lastAttemptAt, lastError: null, humanAction: null, ...metrics
    };
    // Para eproc, o pipeline oficial é a autoridade: estados de intervenção humana
    // herdados do coletor gerenciado legado não podem manter o portal preso em
    // "Ação necessária". Sem erro oficial, o estado honesto é "não verificado".
    // Inclui os estados de progresso legados (authenticating/connecting/syncing):
    // sem job ativo nem tentativa registrada, "Autenticando" preso por dias é rótulo
    // falso — portal desabilitado sem credencial aparece como se estivesse logando.
    const staleLegacyStates = new Set([
      'action_required', 'human_action_required', 'expired',
      'authenticating', 'connecting', 'syncing', 'running', 'pending'
    ]);
    const staleHumanAction = staleLegacyStates.has(String(item.connectivityState || ''));
    return {
      ...item,
      ...(staleHumanAction ? { connectivityState: 'not_verified', lastError: null, humanAction: null } : {}),
      lastAttemptAt,
      ...metrics
    };
  });
}
