/**
 * ATRIUM Sovereign Omni-Collector — 4-Way Process Diff Engine
 *
 * Compares an existing process snapshot against an incoming feed and classifies
 * movements into 4 strict categories:
 * 1. newMovements: completely new movements
 * 2. unchangedMovements: exact SHA-256 fingerprint matches
 * 3. changedMovements: matching sequence/eventNumber but modified text/date/fingerprint
 * 4. possiblyMissingMovements: previously recorded but missing from latest feed
 */

import { computeMovementFingerprint, computeSha256 } from './fingerprint.mjs';

/**
 * Computes 4-way diff between previous and current movements.
 */
export function computeMovementDiff(previousMovements = [], currentMovements = []) {
  const prevList = Array.isArray(previousMovements) ? previousMovements : [];
  const currList = Array.isArray(currentMovements) ? currentMovements : [];

  const prevById = new Map();
  const prevByFingerprint = new Map();

  for (const m of prevList) {
    const fp = m.fingerprint || computeMovementFingerprint(m);
    const key = m.eventNumber != null ? String(m.eventNumber) : (m.sequenceNumber != null ? String(m.sequenceNumber) : fp);
    prevById.set(key, { ...m, fingerprint: fp });
    prevByFingerprint.set(fp, { ...m, fingerprint: fp });
  }

  const newMovements = [];
  const unchangedMovements = [];
  const changedMovements = [];
  const matchedPrevKeys = new Set();

  for (const m of currList) {
    const fp = m.fingerprint || computeMovementFingerprint(m);
    const curr = { ...m, fingerprint: fp };
    const key = curr.eventNumber != null ? String(curr.eventNumber) : (curr.sequenceNumber != null ? String(curr.sequenceNumber) : fp);

    if (prevByFingerprint.has(fp)) {
      unchangedMovements.push(curr);
      matchedPrevKeys.add(key);
    } else if (prevById.has(key)) {
      const prev = prevById.get(key);
      changedMovements.push({
        previous: prev,
        current: curr
      });
      matchedPrevKeys.add(key);
    } else {
      newMovements.push(curr);
    }
  }

  const possiblyMissingMovements = [];
  for (const [key, prev] of prevById.entries()) {
    if (!matchedPrevKeys.has(key)) {
      possiblyMissingMovements.push(prev);
    }
  }

  return {
    hasChanges: newMovements.length > 0 || changedMovements.length > 0 || possiblyMissingMovements.length > 0,
    newMovements,
    unchangedMovements,
    changedMovements,
    possiblyMissingMovements
  };
}

/**
 * Computes complete process diff including metadata and movement diff.
 */
export function computeProcessDiff(previous, current) {
  const cnj = current?.cnj || previous?.cnj || '';
  const prevMovements = previous?.movements || [];
  const currMovements = current?.movements || [];

  const movementDiff = computeMovementDiff(prevMovements, currMovements);

  return {
    cnj,
    previousSnapshotTimestamp: previous?.provenance?.queryTimestamp || previous?.observedAt || null,
    currentSnapshotTimestamp: current?.provenance?.queryTimestamp || current?.observedAt || new Date().toISOString(),
    ...movementDiff,
    metadataChanged: computeSha256(previous?.metadata || {}) !== computeSha256(current?.metadata || {}),
    partiesChanged: computeSha256(previous?.parties || []) !== computeSha256(current?.parties || []),
    documentsChanged: computeSha256(previous?.documents || []) !== computeSha256(current?.documents || []),
    hasChanges: !previous || movementDiff.hasChanges
      || ['metadata', 'parties', 'documents', 'publications'].some(key => computeSha256(previous?.[key] ?? null) !== computeSha256(current?.[key] ?? null))
  };
}
