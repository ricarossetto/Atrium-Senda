/**
 * ATRIUM Sovereign Omni-Collector — Deterministic Fingerprint Engine
 *
 * Computes deterministic SHA-256 hashes for movements and raw payloads.
 */

import { createHash } from 'node:crypto';

/**
 * Deterministically stringifies an object by recursively sorting its keys.
 */
export function canonicalJson(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(key => JSON.stringify(key) + ':' + canonicalJson(obj[key]));
  return '{' + pairs.join(',') + '}';
}

/**
 * Computes SHA-256 hex digest for arbitrary input.
 */
export function computeSha256(data) {
  const content = typeof data === 'string' ? data : canonicalJson(data);
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Normalizes movement text by collapsing whitespace and trimming.
 */
export function normalizeMovementText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/**
 * Normalizes movement timestamp into ISO-8601 UTC.
 */
export function normalizeMovementDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }
  return String(dateStr).trim();
}

/**
 * Computes deterministic SHA-256 movement fingerprint.
 */
export function computeMovementFingerprint(movement) {
  const eventNumber = movement.eventNumber != null ? Number(movement.eventNumber) : null;
  const sequenceNumber = movement.sequenceNumber != null ? Number(movement.sequenceNumber) : eventNumber;
  const date = normalizeMovementDate(movement.date || movement.dataHora || movement.timestamp);
  const description = normalizeMovementText(movement.description || movement.nome || movement.descricao || movement.texto);
  const cnjCode = movement.cnjCode != null ? Number(movement.cnjCode) : (movement.codigo != null ? Number(movement.codigo) : null);

  const payload = {
    eventNumber,
    sequenceNumber,
    date,
    description,
    cnjCode
  };

  return computeSha256(payload);
}
