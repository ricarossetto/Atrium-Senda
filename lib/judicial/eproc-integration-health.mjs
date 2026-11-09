/**
 * ATRIUM — saúde da integração eproc para o painel administrativo.
 *
 * O painel não pode inferir o modo eproc de um campo legado (`hasA1Certificate`)
 * que nenhum fluxo atual preenche. A autoridade é o status real do orquestrador:
 * certificado do cofre e portais com sessão conectada.
 */
export function buildEprocIntegrationHealth(status = {}) {
  const portals = Array.isArray(status?.portals) ? status.portals : [];
  const connectedPortals = portals.filter(portal => portal && portal.status === 'connected').length;
  const certificateConfigured = Boolean(status?.certificate?.configured);

  if (certificateConfigured) {
    return { status: 'HEALTHY', mode: 'mtls_a1_habilitado', connectedPortals };
  }
  if (connectedPortals > 0) {
    return { status: 'HEALTHY', mode: 'conta_tribunal_totp', connectedPortals };
  }
  return { status: 'DEGRADED', mode: 'consulta_publica', connectedPortals };
}
