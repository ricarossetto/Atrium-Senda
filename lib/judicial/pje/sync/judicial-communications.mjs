function parseBrazilianDate(value) {
  const match = String(value || '').match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

function collapse(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function communicationIdFor({ workspaceId = '', portalId = '', sourceCommunicationId = '' } = {}) {
  return `pje:${workspaceId || 'workspace'}:${portalId || 'portal'}:${sourceCommunicationId}`;
}

function membershipList(record) {
  const values = Array.isArray(record?.situations) && record.situations.length
    ? record.situations
    : record?.situation
      ? [record.situation]
      : Array.isArray(record?.situationMemberships) ? record.situationMemberships : [];
  const memberships = [];
  for (const value of values) {
    const label = collapse(value);
    if (label && !memberships.includes(label)) memberships.push(label);
  }
  return memberships;
}

// Fonte: expedientes coletados (standard e pje-jt). O expediente é a comunicação;
// processo (CNJ) e vínculos de situação são atributos, nunca a identidade.
export function buildPjeCommunications(inventory, { workspaceId = '', now = new Date().toISOString() } = {}) {
  const records = inventory?.expedientes?.expedientes || [];
  const communications = [];
  for (const record of records) {
    const sourceCommunicationId = record.expedienteIdentity || record.identity || '';
    if (!sourceCommunicationId) continue;
    communications.push({
      id: communicationIdFor({ workspaceId, portalId: inventory.portalId, sourceCommunicationId }),
      workspaceId,
      portalId: inventory.portalId || '',
      sourceCommunicationId,
      processNumber: record.processNumber || '',
      source: inventory.portalName || inventory.portalId || '',
      portalName: inventory.portalName || inventory.portalId || '',
      // Data informada na própria listagem do portal (nunca a data da coleta nem
      // inferência de prazo). Serve de referência de publicação na projeção.
      sourceReportedAt: parseBrazilianDate(record.lastDate || ''),
      type: record.tipo || '',
      status: 'new',
      situationMemberships: membershipList(record),
    sourceReportedScienceAt: parseBrazilianDate(record.cienciaAt || record.sourceReportedScienceAt || ''),
    sourceReportedDeadlineAt: parseBrazilianDate(record.prazoFinal || record.sourceReportedDeadlineAt || ''),
    deadline: parseBrazilianDate(record.prazoFinal || record.sourceReportedDeadlineAt || '') || '',
    deadlineSource: 'pje',
      courtUnit: collapse(record.orgaoJulgador || record.courtUnit || record.jurisdiction || ''),
      summary: collapse(record.summary || '').slice(0, 500),
      route: inventory.routes?.expedientes || inventory.expedientes?.url || '',
      firstSeenAt: now,
      lastSeenAt: now,
      version: 1,
      deletedAt: null
    });
  }
  return communications;
}

function contentKey(communication) {
  return JSON.stringify({
    memberships: [...(communication.situationMemberships || [])].sort(),
    science: communication.sourceReportedScienceAt || '',
    deadline: communication.sourceReportedDeadlineAt || '',
    courtUnit: communication.courtUnit || '',
    type: communication.type || '',
    processNumber: communication.processNumber || ''
  });
}

// Chave lógica do expediente para dedupe: workspace + portal + CNJ + conteúdo normalizado.
// situationMemberships acumula vínculos e por isso não participa da identidade lógica.
function logicalKey(communication) {
  return JSON.stringify([
    communication?.workspaceId || '',
    communication?.portalId || '',
    String(communication?.processNumber || '').replace(/\D/g, ''),
    collapse(communication?.courtUnit || '').toLowerCase(),
    collapse(communication?.type || '').toLowerCase(),
    communication?.sourceReportedScienceAt || '',
    communication?.sourceReportedDeadlineAt || ''
  ]);
}

function isExternalSourceId(value) {
  return String(value || '').startsWith('id:');
}

// IDs externos estáveis distintos nunca são colapsados: dois expedientes do mesmo CNJ coexistem.
function hasStableExternalConflict(first, second) {
  const firstId = isExternalSourceId(first?.sourceCommunicationId) ? String(first.sourceCommunicationId) : '';
  const secondId = isExternalSourceId(second?.sourceCommunicationId) ? String(second.sourceCommunicationId) : '';
  return Boolean(firstId && secondId && firstId !== secondId);
}

function unionMemberships(current, incoming) {
  const merged = Array.isArray(current) ? [...current] : [];
  for (const label of Array.isArray(incoming) ? incoming : []) {
    if (label && !merged.includes(label)) merged.push(label);
  }
  return merged;
}

export function mergePjeCommunicationsIntoState(state, inventory, { workspaceId = '', now = new Date().toISOString(), authoritativeExpedientes = false } = {}) {
  const counters = {
    communicationsCreated: 0,
    communicationsUpdated: 0,
    communicationsUnchanged: 0,
    communicationsRemoved: 0
  };
  const existing = Array.isArray(state?.communications) ? [...state.communications] : [];
  const byId = new Map(existing.map((item, index) => [item.id, index]));
  const byLogical = new Map();
  existing.forEach((item, index) => {
    if (!item || item.deletedAt) return;
    const key = logicalKey(item);
    if (!byLogical.has(key)) byLogical.set(key, index);
  });

  const incoming = buildPjeCommunications(inventory, { workspaceId, now });
  if (state?.settings?.deadlineMode === 'manual') {
    for (const communication of incoming) {
      delete communication.deadline;
      delete communication.deadlineSource;
    }
  }
  const dedupedIncoming = [];
  const incomingByKey = new Map();
  for (const communication of incoming) {
    const key = logicalKey(communication);
    const current = incomingByKey.get(key);
    if (!current) {
      incomingByKey.set(key, communication);
      dedupedIncoming.push(communication);
      continue;
    }
    if (hasStableExternalConflict(current, communication)) {
      dedupedIncoming.push(communication);
      continue;
    }
    current.situationMemberships = unionMemberships(current.situationMemberships, communication.situationMemberships);
    current.sourceReportedScienceAt = current.sourceReportedScienceAt || communication.sourceReportedScienceAt;
    current.sourceReportedDeadlineAt = current.sourceReportedDeadlineAt || communication.sourceReportedDeadlineAt;
    current.deadline = current.deadline || communication.deadline;
    current.courtUnit = current.courtUnit || communication.courtUnit;
    current.summary = current.summary || communication.summary;
  }

  const findExistingIndex = communication => {
    const directIndex = byId.get(communication.id);
    if (directIndex !== undefined) return directIndex;
    const candidateIndex = byLogical.get(logicalKey(communication));
    if (candidateIndex === undefined) return undefined;
    const candidate = existing[candidateIndex];
    if (!candidate || candidate.deletedAt) return undefined;
    if (hasStableExternalConflict(candidate, communication)) return undefined;
    return candidateIndex;
  };

  const incomingIds = new Set();
  for (const communication of dedupedIncoming) {
    const index = findExistingIndex(communication);
    if (index === undefined) {
      existing.push(communication);
      byId.set(communication.id, existing.length - 1);
      const key = logicalKey(communication);
      if (!byLogical.has(key)) byLogical.set(key, existing.length - 1);
      incomingIds.add(communication.id);
      counters.communicationsCreated += 1;
      continue;
    }
    const current = existing[index];
    byId.set(communication.id, index);
    incomingIds.add(current.id);
    const merged = {
      ...current,
      workspaceId: communication.workspaceId || current.workspaceId,
      portalId: communication.portalId || current.portalId,
      source: communication.source || current.source,
      sourceCommunicationId: communication.sourceCommunicationId || current.sourceCommunicationId,
      processNumber: communication.processNumber || current.processNumber,
      courtUnit: communication.courtUnit || current.courtUnit,
      type: communication.type || current.type,
      situationMemberships: unionMemberships(current.situationMemberships, communication.situationMemberships),
      sourceReportedScienceAt: communication.sourceReportedScienceAt || current.sourceReportedScienceAt,
      sourceReportedDeadlineAt: communication.sourceReportedDeadlineAt || current.sourceReportedDeadlineAt,
      deadline: communication.deadline || current.deadline,
      deadlineSource: communication.deadline ? 'pje' : (current.deadlineSource || null),
      summary: communication.summary || current.summary,
      route: communication.route || current.route,
      lastSeenAt: now,
      deletedAt: null
    };
    const status = current.status && current.status !== 'new' ? current.status : communication.status;
    merged.status = status;
    if (contentKey(merged) === contentKey(current) && current.deletedAt === null) {
      existing[index] = { ...current, sourceCommunicationId: merged.sourceCommunicationId, lastSeenAt: now };
      counters.communicationsUnchanged += 1;
      continue;
    }
    merged.version = (current.version || 1) + 1;
    existing[index] = merged;
    counters.communicationsUpdated += 1;
  }

  // Invariante: ausência na fonte só significa remoção quando a coleta de Expedientes
  // foi autoritativa e íntegra (loaded/empty_confirmed). Coleta parcial, timeout,
  // parse_error ou SKIPPED_UNRELIABLE preserva o histórico intacto.
  if (authoritativeExpedientes) {
    for (let index = 0; index < existing.length; index += 1) {
      const current = existing[index];
      if (!current.portalId || current.portalId !== (inventory.portalId || '')) continue;
      if (incomingIds.has(current.id) || current.deletedAt) continue;
      existing[index] = { ...current, deletedAt: now, lastSeenAt: now };
      counters.communicationsRemoved += 1;
    }
  }

  return { state: { ...(state || {}), communications: existing }, counters };
}

export function listPjeCommunications(state, { workspaceId = '', portalId = '', includeDeleted = false } = {}) {
  return (state?.communications || []).filter(item => {
    if (!includeDeleted && item.deletedAt) return false;
    if (workspaceId && item.workspaceId !== workspaceId) return false;
    if (portalId && item.portalId !== portalId) return false;
    return true;
  });
}
