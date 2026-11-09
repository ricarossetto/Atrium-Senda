import { buildPjeClientCertificateOrigins } from '../portal-registry.mjs';

export class PjeRuntimeUnavailableError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PjeRuntimeUnavailableError';
    this.errorCode = 'PJE-RUNTIME-UNAVAILABLE';
    Object.assign(this, details);
  }
}

// Contrato comum dos runtimes: openPjeBrowserSession deve devolver
// { runtime, portalId, context, page, close() }; collector, parser, snapshot e ingestão
// nunca acessam o browser diretamente, apenas a sessão devolvida.
export function buildPjeClientCertificateEntries(portal, certificate) {
  if (!certificate?.pfxPath) return [];
  return buildPjeClientCertificateOrigins(portal).map(origin => ({
    origin,
    pfxPath: certificate.pfxPath,
    passphrase: certificate.passphrase || ''
  }));
}
