import { sortDocuments } from './metadata.mjs';

export function deduplicateDocuments(records = []) {
  const byChecksum = new Map();
  const unique = [];
  const duplicates = [];
  for (const record of sortDocuments(records)) {
    const checksum = record.sha256;
    if (checksum && byChecksum.has(checksum)) {
      duplicates.push({ sourceId: record.sourceId, checksum, duplicateOf: byChecksum.get(checksum) });
      continue;
    }
    if (checksum) byChecksum.set(checksum, record.sourceId);
    unique.push(record);
  }
  return { unique, duplicates, duplicateCount: duplicates.length };
}

export function findMissingSequences(records = []) {
  const sequences = records
    .map(record => Number(record.sequence))
    .filter(sequence => Number.isFinite(sequence) && sequence > 0)
    .sort((left, right) => left - right);
  if (sequences.length === 0) return [];
  const missing = [];
  const present = new Set(sequences);
  for (let sequence = sequences[0]; sequence <= sequences.at(-1); sequence += 1) {
    if (!present.has(sequence)) missing.push(sequence);
  }
  return missing;
}
