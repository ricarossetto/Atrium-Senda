import { canonicalJson } from '../../judicial/omni/fingerprint.mjs';

export const COMPARISON_CLASSIFICATION = Object.freeze({
  MATCH: 'MATCH',
  SOURCE_A_NEWER: 'SOURCE_A_NEWER',
  SOURCE_B_NEWER: 'SOURCE_B_NEWER',
  MISSING: 'MISSING',
  CONFLICT: 'CONFLICT'
});

export const COMPARISON_FIELDS = Object.freeze([
  'court',
  'judicialUnit',
  'processClass',
  'subject',
  'distributionDate',
  'isSecret',
  'movementCount',
  'lastMovementAt',
  'partiesCount',
  'documentsCount'
]);

const DATE_FIELDS = new Set(['distributionDate', 'lastMovementAt']);

function firstValue(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

export function movementTimestamp(movement) {
  return firstValue(movement?.date, movement?.dataHora, movement?.data, movement?.dataMovimento);
}

export function lastMovementAt(process) {
  const timestamps = (process?.movements ?? [])
    .map(movementTimestamp)
    .filter(Boolean)
    .sort();
  return timestamps.at(-1) ?? null;
}

export function readComparableField(process, field) {
  if (!process) return null;
  switch (field) {
    case 'court':
      return firstValue(process.metadata?.court, process.court);
    case 'judicialUnit':
      return firstValue(process.metadata?.judicialUnit, process.judicialUnit);
    case 'processClass':
      return firstValue(process.metadata?.processClass, process.processClass);
    case 'subject':
      return firstValue(process.metadata?.subject, process.subject);
    case 'distributionDate':
      return firstValue(process.metadata?.distributionDate, process.distributionDate);
    case 'isSecret':
      return firstValue(process.metadata?.isSecret, process.isSecret);
    case 'movementCount':
      return Array.isArray(process.movements) ? process.movements.length : null;
    case 'lastMovementAt':
      return lastMovementAt(process);
    case 'partiesCount':
      return Array.isArray(process.parties) ? process.parties.length : null;
    case 'documentsCount':
      return Array.isArray(process.documents) ? process.documents.length : null;
    default:
      return null;
  }
}

function parseTimestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const direct = Date.parse(value);
  if (Number.isFinite(direct)) return direct;
  const brazilian = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (brazilian) {
    const [, day, month, year, hour = '00', minute = '00', second = '00'] = brazilian;
    const parsed = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function compareField(field, sources = {}) {
  const values = {};
  for (const [sourceId, process] of Object.entries(sources)) {
    values[sourceId] = readComparableField(process, field);
  }
  const available = Object.entries(values)
    .filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (available.length === 0) {
    return { field, classification: COMPARISON_CLASSIFICATION.MISSING, values, winner: null, availableFrom: [], basis: 'no-source' };
  }
  if (available.length === 1) {
    return { field, classification: COMPARISON_CLASSIFICATION.MISSING, values, winner: null, availableFrom: [available[0][0]], basis: 'single-source' };
  }
  const serialized = new Set(available.map(([, value]) => canonicalJson(value)));
  if (serialized.size === 1) {
    return { field, classification: COMPARISON_CLASSIFICATION.MATCH, values, winner: null, availableFrom: available.map(([id]) => id), basis: 'equality' };
  }
  if (DATE_FIELDS.has(field)) {
    const dated = available
      .map(([id, value]) => ({ id, timestamp: parseTimestamp(value) }))
      .filter(entry => entry.timestamp !== null);
    if (dated.length === available.length && dated.length >= 2) {
      dated.sort((a, b) => b.timestamp - a.timestamp);
      if (dated[0].timestamp === dated[1].timestamp) {
        return { field, classification: COMPARISON_CLASSIFICATION.MATCH, values, winner: null, availableFrom: available.map(([id]) => id), basis: 'date-equality' };
      }
      const classification = dated[0].id === 'pje' || dated[0].id === 'sourceA'
        ? COMPARISON_CLASSIFICATION.SOURCE_A_NEWER
        : COMPARISON_CLASSIFICATION.SOURCE_B_NEWER;
      return {
        field,
        classification,
        values,
        winner: dated[0].id,
        availableFrom: available.map(([id]) => id),
        basis: 'date-order'
      };
    }
  }
  return {
    field,
    classification: COMPARISON_CLASSIFICATION.CONFLICT,
    values,
    winner: null,
    availableFrom: available.map(([id]) => id),
    basis: 'divergence'
  };
}

export function compareProcessSources({ cnj = null, sources = {}, generatedAt = new Date().toISOString() } = {}) {
  const sourceIds = Object.keys(sources);
  const presence = {};
  for (const sourceId of sourceIds) {
    presence[sourceId] = sources[sourceId] ? 'PRESENT' : 'MISSING';
  }
  const cnjValues = new Set(Object.values(sources).filter(Boolean).map(process => process.cnj ?? null).filter(Boolean));
  const fields = COMPARISON_FIELDS.map(field => compareField(field, sources));
  const summary = {};
  for (const classification of Object.values(COMPARISON_CLASSIFICATION)) summary[classification] = 0;
  for (const entry of fields) summary[entry.classification] += 1;
  return {
    cnj: cnj ?? [...cnjValues][0] ?? null,
    generatedAt,
    sources: sourceIds,
    presence,
    cnjConsensus: cnjValues.size <= 1 ? [...cnjValues][0] ?? null : null,
    cnjConflict: cnjValues.size > 1,
    fields,
    summary
  };
}

export function renderComparisonReport(report) {
  const lines = [];
  lines.push(`# Comparativo de fontes — ${report.cnj ?? 'CNJ não informado'}`);
  lines.push('');
  lines.push(`Gerado em ${report.generatedAt}. Nenhuma mescla automática: divergências permanecem visíveis.`);
  lines.push('');
  lines.push('## Presença');
  lines.push('');
  lines.push('| Fonte | Estado |');
  lines.push('|---|---|');
  for (const [sourceId, state] of Object.entries(report.presence)) {
    lines.push(`| ${sourceId} | ${state} |`);
  }
  lines.push('');
  lines.push('## Campos');
  lines.push('');
  lines.push('| Campo | Classificação | Base | Fontes com valor | Valores |');
  lines.push('|---|---|---|---|---|');
  for (const entry of report.fields) {
    const values = Object.entries(entry.values)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([sourceId, value]) => `${sourceId}=${String(value).slice(0, 60)}`)
      .join(' · ');
    lines.push(`| ${entry.field} | ${entry.classification} | ${entry.basis} | ${entry.availableFrom.join(', ') || '—'} | ${values || '—'} |`);
  }
  lines.push('');
  lines.push(`Resumo: ${Object.entries(report.summary).map(([classification, total]) => `${classification}=${total}`).join(' · ')}`);
  lines.push('');
  return lines.join('\n');
}
