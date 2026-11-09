/**
 * ATRIUM — Sanitização base de registros do app-state.
 *
 * Helpers puros, sem I/O, compartilhados por `server.mjs` e pelo fluxo oficial de
 * intimações. Removem chaves perigosas de prototype pollution, descartam entradas
 * inválidas e aplicam o teto de itens antes de qualquer persistência.
 */

export function sanitizeRecord(value, depth = 0) {
  if (depth > 12) return null;
  if (Array.isArray(value)) return value.slice(0, 10_000).map(item => sanitizeRecord(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const clean = {};
  for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) continue;
    clean[key] = sanitizeRecord(item, depth + 1);
  }
  return clean;
}

export function sanitizeArray(value, max = 10_000) {
  return Array.isArray(value)
    ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)).slice(0, max).map(item => sanitizeRecord(item))
    : [];
}
