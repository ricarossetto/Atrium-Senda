/**
 * ATRIUM Sovereign Judicial Connectivity — Eproc Portal/Process Matching
 *
 * Pure helpers shared by the report-first pipeline and the authenticated sweep so
 * that both classify a canonical process into the correct portal/grau without
 * duplicating heuristics.
 */

import { getEprocPortalById } from '../portal-registry.mjs';

export const STRICT_PORTAL_MATCHES = Object.freeze(new Set([
  'tjrs-eproc-1g',
  'tjrs-eproc-2g',
  'jfrs-eproc-1g',
  'trf4-eproc-2g'
]));

export function parseEprocCnj(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 20) return null;
  return { digits, justiceRegion: `${digits[13]}${digits.slice(14, 16)}`, originUnit: digits.slice(-4) };
}

export function processMatchesPortal(process, portal) {
  if (!portal) return false;
  const number = String(process?.number || '').replace(/\D/g, '');
  const court = String(process?.court || '').toUpperCase();
  if (portal.id === 'tjrs-eproc-1g' || portal.id === 'tjrs-eproc-2g') {
    const cnj = parseEprocCnj(number);
    const isTjrs = cnj?.justiceRegion === '821' || court.includes('TJRS') || process?.source === 'eproc-tjrs';
    if (!isTjrs) return false;
    const is2G = cnj?.originUnit === '7000' || /2[ºª°\s]*grau|\b2g\b|turma\s*recursal|tribunal\s*de\s*justi[çc]a/i.test(court);
    return portal.id.endsWith('2g') ? is2G : !is2G;
  }
  const cnj = parseEprocCnj(number);
  const originUnit = cnj?.originUnit || '';
  if (portal.id === 'jfrs-eproc-1g') return cnj?.justiceRegion === '404' && originUnit >= '7100' && originUnit <= '7199';
  if (portal.id === 'trf4-eproc-2g') return cnj?.justiceRegion === '404' && originUnit === '0000';
  return false;
}

/**
 * Compatibilidade processo/portal com fail-closed apenas onde existe heurística
 * confiável (TJRS 1G/2G, JFRS 1G, TRF4 2G). Para os demais portais registrados a
 * ausência de heurística não pode impedir uma solicitação explícita do usuário.
 */
export function isProcessPortalCompatible(processNumber, portalId) {
  if (!STRICT_PORTAL_MATCHES.has(portalId)) return true;
  const portal = getEprocPortalById(portalId);
  return Boolean(portal) && processMatchesPortal({ number: processNumber }, portal);
}
