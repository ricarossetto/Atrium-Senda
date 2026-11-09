import { canonicalJson } from '../../judicial/omni/fingerprint.mjs';

export const MERGE_DECISIONS = Object.freeze({
  CONSENSUS: 'consensus',
  PREFERRED: 'preferred',
  UNION: 'union',
  MOST_RESTRICTIVE: 'most_restrictive',
  LATEST: 'latest',
  CONFLICT: 'conflict',
  MISSING: 'missing',
  SINGLE_SOURCE: 'single_source'
});

export const SOURCE_TRUST = Object.freeze({
  ATRIUM: 0.99,
  EPROC: 0.98,
  PJE: 0.98,
  PDPJ: 0.95,
  MNI: 0.95,
  TJRS: 0.9,
  CERTIFICATE_PORTAL: 0.9,
  DATAJUD: 0.85,
  ESAJ: 0.85,
  TJRJ: 0.85,
  TJSP: 0.85,
  TJDFT: 0.85,
  DJEN: 0.8,
  FIXTURE: 0.5
});

export const FIELD_POLICIES = Object.freeze({
  cnj: 'consensus',
  'metadata.court': 'consensus',
  'metadata.processClass': 'consensus',
  'metadata.subject': 'consensus',
  'metadata.judicialUnit': 'authenticated_preferred',
  'metadata.distributionDate': 'latest',
  'metadata.isSecret': 'most_restrictive',
  parties: 'authenticated_preferred',
  movements: 'union',
  documents: 'portal_preferred'
});

export const LEGAL_CRITICAL_FIELDS = Object.freeze([
  'cnj',
  'metadata.isSecret',
  'metadata.processClass',
  'metadata.distributionDate'
]);

function trustOf(source, trust = SOURCE_TRUST) {
  return trust[source] ?? trust[String(source).toUpperCase()] ?? 0.5;
}

function getPath(object, path) {
  return path.split('.').reduce((current, key) => (current === null || current === undefined ? undefined : current[key]), object);
}

function normalizeKey(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function movementKey(movement) {
  return canonicalJson([
    normalizeKey(movement?.date ?? movement?.dataHora ?? ''),
    normalizeKey(movement?.description ?? movement?.nome ?? ''),
    String(movement?.tpuCode ?? movement?.cnjCode ?? '')
  ]);
}

function partyKey(party) {
  return canonicalJson([normalizeKey(party?.name), normalizeKey(party?.polo ?? party?.role ?? '')]);
}

function documentKey(document) {
  return canonicalJson([String(document?.sourceId ?? ''), normalizeKey(document?.description ?? document?.type ?? '')]);
}

function unionLists(entries, keyOf, sourceLabel) {
  const merged = [];
  const seen = new Set();
  const provenanceByKey = new Map();
  for (const entry of entries) {
    for (const item of entry.value) {
      const key = keyOf(item);
      const sources = provenanceByKey.get(key) ?? [];
      if (!sources.includes(sourceLabel(entry))) sources.push(sourceLabel(entry));
      provenanceByKey.set(key, sources);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(item);
      }
    }
  }
  return merged.map(item => ({ ...item, sources: provenanceByKey.get(keyOf(item)) ?? [] }));
}

export function mergeProcessSources({
  cnj = null,
  sources = {},
  policies = FIELD_POLICIES,
  trust = SOURCE_TRUST
} = {}) {
  const sourceIds = Object.keys(sources);
  const presence = {};
  for (const sourceId of sourceIds) presence[sourceId] = sources[sourceId] ? 'PRESENT' : 'MISSING';

  const fields = {};
  const conflicts = [];

  for (const [path, policy] of Object.entries(policies)) {
    const entries = sourceIds
      .filter(sourceId => sources[sourceId])
      .map(sourceId => ({
        source: sourceId,
        confidence: trustOf(sourceId, trust),
        value: getPath(sources[sourceId], path)
      }))
      .filter(entry => entry.value !== null && entry.value !== undefined && entry.value !== '')
      .filter(entry => policy === 'union' || !Array.isArray(entry.value) || entry.value.length > 0);

    if (entries.length === 0) {
      fields[path] = { value: null, decision: MERGE_DECISIONS.MISSING, confidence: 0, conflict: false, values: {}, sources: [] };
      continue;
    }

    if (entries.length === 1) {
      fields[path] = {
        value: entries[0].value,
        decision: MERGE_DECISIONS.SINGLE_SOURCE,
        confidence: entries[0].confidence,
        conflict: false,
        values: { [entries[0].source]: entries[0].value },
        sources: [entries[0].source]
      };
      continue;
    }

    const sorted = [...entries].sort((left, right) => right.confidence - left.confidence);
    const distinct = new Set(entries.map(entry => canonicalJson(entry.value)));

    if (policy === 'most_restrictive') {
      const restricted = entries.some(entry => entry.value === true);
      fields[path] = {
        value: restricted,
        decision: MERGE_DECISIONS.MOST_RESTRICTIVE,
        confidence: Math.max(...entries.map(entry => entry.confidence)),
        conflict: false,
        values: Object.fromEntries(entries.map(entry => [entry.source, entry.value])),
        sources: entries.map(entry => entry.source)
      };
      continue;
    }

    if (policy === 'union') {
      const merged = unionLists(entries, path === 'movements' ? movementKey : path === 'parties' ? partyKey : documentKey, entry => entry.source);
      fields[path] = {
        value: merged,
        decision: MERGE_DECISIONS.UNION,
        confidence: Math.min(...entries.map(entry => entry.confidence)),
        conflict: false,
        values: Object.fromEntries(entries.map(entry => [entry.source, entry.value.length])),
        sources: entries.map(entry => entry.source)
      };
      continue;
    }

    if (distinct.size === 1) {
      fields[path] = {
        value: entries[0].value,
        decision: MERGE_DECISIONS.CONSENSUS,
        confidence: Math.min(...entries.map(entry => entry.confidence)),
        conflict: false,
        values: Object.fromEntries(entries.map(entry => [entry.source, entry.value])),
        sources: entries.map(entry => entry.source)
      };
      continue;
    }

    if (policy === 'latest') {
      const dated = entries
        .map(entry => ({ ...entry, timestamp: Date.parse(entry.value) }))
        .filter(entry => Number.isFinite(entry.timestamp))
        .sort((left, right) => right.timestamp - left.timestamp);
      if (dated.length === entries.length) {
        fields[path] = {
          value: dated[0].value,
          decision: MERGE_DECISIONS.LATEST,
          confidence: dated[0].confidence,
          conflict: false,
          values: Object.fromEntries(entries.map(entry => [entry.source, entry.value])),
          sources: entries.map(entry => entry.source),
          basis: `timestamp:${dated[0].source}`
        };
        continue;
      }
    }

    fields[path] = {
      value: sorted[0].value,
      decision: MERGE_DECISIONS.CONFLICT,
      confidence: sorted[0].confidence,
      conflict: true,
      preferredSource: sorted[0].source,
      values: Object.fromEntries(entries.map(entry => [entry.source, entry.value])),
      sources: entries.map(entry => entry.source),
      distinctValues: distinct.size
    };
    conflicts.push({
      field: path,
      decision: MERGE_DECISIONS.CONFLICT,
      values: fields[path].values,
      preferredSource: sorted[0].source,
      requiresHumanReview: LEGAL_CRITICAL_FIELDS.includes(path)
    });
  }

  const merged = {
    cnj: fields.cnj?.value ?? cnj ?? null,
    metadata: {
      cnj: fields.cnj?.value ?? cnj ?? null,
      court: fields['metadata.court']?.value ?? null,
      processClass: fields['metadata.processClass']?.value ?? null,
      subject: fields['metadata.subject']?.value ?? null,
      judicialUnit: fields['metadata.judicialUnit']?.value ?? null,
      distributionDate: fields['metadata.distributionDate']?.value ?? null,
      isSecret: fields['metadata.isSecret']?.value ?? null
    },
    parties: fields.parties?.value ?? [],
    movements: fields.movements?.value ?? [],
    documents: fields.documents?.value ?? []
  };

  return {
    cnj: merged.cnj,
    generatedAt: new Date().toISOString(),
    sources: sourceIds,
    presence,
    fields,
    conflicts,
    requiresHumanReview: conflicts.some(conflict => conflict.requiresHumanReview),
    merged
  };
}
