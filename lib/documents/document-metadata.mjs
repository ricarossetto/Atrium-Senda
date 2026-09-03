const ENTITY_TYPES = new Set(['person', 'organization', 'process', 'court', 'law', 'other']);

export function normalizeDocumentMetadata(input = {}, { documents = [], documentId = '', ownerType = '', ownerId = '' } = {}) {
  const relatedCandidates = normalizeStrings(input.relatedDocumentIds, { maxItems: 20, maxLength: 160 });
  const allowedRelated = new Set((documents || [])
    .filter(item => item && !item.deletedAt && String(item.id || '') !== String(documentId || '')
      && item.ownerType === ownerType && String(item.ownerId || '') === String(ownerId || ''))
    .map(item => String(item.id)));
  return Object.freeze({
    documentType: safeText(input.documentType, 100),
    origin: safeText(input.origin, 120),
    tags: Object.freeze(normalizeStrings(input.tags, { maxItems: 12, maxLength: 40 })),
    summary: safeText(input.summary, 1_200),
    context: safeText(input.context, 1_500),
    entities: Object.freeze(normalizeEntities(input.entities)),
    relatedDocumentIds: Object.freeze(relatedCandidates.filter(id => allowedRelated.has(id))),
    classificationStatus: input.classificationStatus === 'reviewed' ? 'reviewed' : 'unclassified'
  });
}

export function normalizeStrings(value, { maxItems, maxLength }) {
  const source = Array.isArray(value) ? value : String(value || '').split(',');
  const seen = new Set();
  const result = [];
  for (const item of source) {
    const normalized = safeText(item, maxLength);
    const key = normalized.toLocaleLowerCase('pt-BR');
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= maxItems) break;
  }
  return result;
}

function normalizeEntities(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(',').map(label => ({ label }));
  const seen = new Set();
  const result = [];
  for (const item of source) {
    const entity = typeof item === 'string' ? { label: item } : item || {};
    const label = safeText(entity.label || entity.name, 120);
    if (!label) continue;
    const type = ENTITY_TYPES.has(entity.type) ? entity.type : 'other';
    const identifier = safeText(entity.identifier, 120);
    const key = `${type}:${label.toLocaleLowerCase('pt-BR')}:${identifier.toLocaleLowerCase('pt-BR')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(Object.freeze({ type, label, ...(identifier ? { identifier } : {}) }));
    if (result.length >= 20) break;
  }
  return result;
}

function safeText(value, maxLength) {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}
