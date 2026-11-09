import { canonicalJson, computeSha256 } from '../../judicial/omni/fingerprint.mjs';
import { assertJi, JI_ERROR_CODES } from './errors.mjs';

export const SOURCE_IDS = Object.freeze({
  PJE: 'PJE',
  PDPJ: 'PDPJ',
  DATAJUD: 'DATAJUD',
  MNI: 'MNI',
  EPROC: 'EPROC',
  ESAJ: 'ESAJ',
  TJRJ: 'TJRJ',
  TJRS: 'TJRS',
  TJSP: 'TJSP',
  TJDFT: 'TJDFT',
  DJEN: 'DJEN',
  CERTIFICATE_PORTAL: 'CERTIFICATE_PORTAL',
  ATRIUM: 'ATRIUM',
  FIXTURE: 'FIXTURE'
});

export const PROVENANCE_KINDS = Object.freeze({
  CNJ_IDENTITY: 'CNJ_IDENTITY',
  PROCESS_METADATA: 'PROCESS_METADATA',
  PARTY: 'PARTY',
  PUBLIC_MOVEMENT: 'PUBLIC_MOVEMENT',
  AUTHENTICATED_EXPEDIENT: 'AUTHENTICATED_EXPEDIENT',
  AUTHENTICATED_DOCUMENT: 'AUTHENTICATED_DOCUMENT',
  PUBLICATION: 'PUBLICATION',
  CERTIFICATE: 'CERTIFICATE',
  DERIVED_TEXT: 'DERIVED_TEXT'
});

export const COLLECTOR_VERSION = 'ji-beta-1';

export function assertSourceId(source) {
  return assertJi(Object.values(SOURCE_IDS).includes(source), JI_ERROR_CODES.INVALID_ARGUMENT,
    `Fonte de proveniência desconhecida: ${source}`);
}

export function assertProvenanceKind(kind) {
  if (kind === null || kind === undefined) return null;
  return assertJi(Object.values(PROVENANCE_KINDS).includes(kind), JI_ERROR_CODES.INVALID_ARGUMENT,
    `Tipo de proveniência desconhecido: ${kind}`);
}

export function hashPayload(payload) {
  return computeSha256(payload === undefined ? null : payload);
}

export function createProvenance({
  source,
  sourcePortal = null,
  collectedAt = new Date().toISOString(),
  sourceUpdatedAt = null,
  queryKind = null,
  kind = null,
  confidence = null,
  payload,
  collectorVersion = COLLECTOR_VERSION
} = {}) {
  assertSourceId(source);
  assertProvenanceKind(kind);
  return Object.freeze({
    source,
    sourcePortal,
    collectedAt,
    sourceUpdatedAt,
    queryKind,
    kind,
    confidence: confidence === null ? null : Number(confidence),
    collectorVersion,
    payloadHash: hashPayload(payload)
  });
}

export function provenanceForValue(value, provenance) {
  return { value, provenance: provenance ? [provenance] : [] };
}

export function fieldEntries(entries = []) {
  return (Array.isArray(entries) ? entries : [entries]).filter(entry => entry && 'value' in entry);
}

export function detectConflict(entries = []) {
  const list = fieldEntries(entries);
  if (list.length < 2) return { conflict: false, values: list.map(entry => entry.value) };
  const serialized = new Set(list.map(entry => canonicalJson(entry.value ?? null)));
  return { conflict: serialized.size > 1, values: list.map(entry => entry.value) };
}

export function mergeFieldProvenance(entries = []) {
  const list = fieldEntries(entries);
  if (list.length === 0) return { value: null, provenance: [], conflict: false, conflicts: [] };
  const { conflict, values } = detectConflict(list);
  const conflicts = conflict
    ? [{
      kind: 'VALUE_DIVERGENCE',
      values,
      sources: list.map(entry => entry.provenance?.[0]?.source ?? null)
    }]
    : [];
  return {
    value: list[0].value,
    provenance: list.flatMap(entry => entry.provenance ?? []),
    conflict,
    conflicts
  };
}

export function freshnessOf(entry) {
  const parsed = Date.parse(entry?.provenance?.[0]?.sourceUpdatedAt || entry?.provenance?.[0]?.collectedAt || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

export function groupProvenanceBySource(provenanceList = []) {
  const grouped = new Map();
  for (const provenance of provenanceList) {
    const list = grouped.get(provenance.source) ?? [];
    list.push(provenance);
    grouped.set(provenance.source, list);
  }
  return grouped;
}

export function provenanceSummary(provenanceList = []) {
  const grouped = groupProvenanceBySource(provenanceList);
  return [...grouped.entries()].map(([source, list]) => ({
    source,
    entries: list.length,
    latestCollectedAt: list.map(item => item.collectedAt).filter(Boolean).sort().at(-1) ?? null
  }));
}
