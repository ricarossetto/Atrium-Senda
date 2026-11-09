const PRIVATE = 'private';
const OFFICE = 'office';

export function normalizeTermScope(term = {}) {
  const scope = String(term.scope || '').toLowerCase() === PRIVATE ? PRIVATE : OFFICE;
  const owner = scope === PRIVATE
    ? String(term.privateOwnerUserId || term.ownerUserId || '').trim()
    : '';
  return {
    ...term,
    scope,
    ...(owner ? { privateOwnerUserId: owner, ownerUserId: owner } : { privateOwnerUserId: undefined, ownerUserId: undefined })
  };
}

export function normalizeMonitoringTerms(terms = []) {
  return (Array.isArray(terms) ? terms : [])
    .filter(term => term && term.active !== false)
    .map(normalizeTermScope);
}

/** Termo que acompanha um processo pelo número CNJ, sem OAB. */
export function isProcessMonitoringTerm(term = {}) {
  return String(term?.type || '').toLowerCase() === 'process';
}

export function monitoringTermProcessDigits(term = {}) {
  return String(term?.processNumber || '').replace(/\D/g, '');
}

export function formatMonitoredProcessNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 20) return digits;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`;
}

export function monitoringTermsById(terms = []) {
  const index = new Map();
  for (const term of normalizeMonitoringTerms(terms)) {
    if (term.id) index.set(String(term.id), term);
  }
  return index;
}

export function scopeFromTermIds(termIds, termsById) {
  const ids = Array.isArray(termIds) ? termIds.map(String) : [];
  const officeTerm = ids.map(id => termsById.get(id)).find(term => term && term.scope !== PRIVATE);
  if (officeTerm) return { scope: OFFICE, privateOwnerUserId: '' };
  const privateTerm = ids.map(id => termsById.get(id)).find(term => term && term.scope === PRIVATE);
  if (privateTerm) return { scope: PRIVATE, privateOwnerUserId: String(privateTerm.privateOwnerUserId || '') };
  return null;
}

/**
 * O dono de um registro privado pode estar gravado pelo id do usuário ou, em registros
 * antigos, pelo nome de usuário: a sessão carrega os dois e qualquer um identifica o dono.
 */
export function ownerMatchesUser(owner, user) {
  const value = String(owner || '').trim();
  if (!value) return false;
  return [user?.id, user?.userId, user?.username].some(candidate => String(candidate || '').trim() === value);
}

export function processDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function processIndexForState(processes = []) {
  const index = new Map();
  for (const process of Array.isArray(processes) ? processes : []) {
    if (!process) continue;
    for (const key of [process.id, process.number, process.processNumber]) {
      const value = String(key || '').trim();
      if (value) index.set(value, process);
      const digits = processDigits(value);
      if (digits) index.set(digits, process);
    }
  }
  return index;
}

export function processForMonitoringRecord(record, index) {
  if (!record || !index) return null;
  for (const key of [record.processId, record.process, record.processNumber]) {
    const value = String(key || '').trim();
    if (!value) continue;
    if (index.has(value)) return index.get(value);
    const digits = processDigits(value);
    if (digits && index.has(digits)) return index.get(digits);
  }
  return null;
}

export function privateOwnerForRecord(record, { termsById = new Map(), processIndex = new Map() } = {}) {
  if (!record) return '';
  if (record.scope === PRIVATE) {
    return String(record.privateOwnerUserId || record.ownerUserId || '').trim();
  }
  const linkedProcess = (record.ownerType === 'process' && record.ownerId && processIndex.get(String(record.ownerId)))
    || processForMonitoringRecord(record, processIndex);
  if (linkedProcess?.scope === PRIVATE) {
    return String(linkedProcess.privateOwnerUserId || linkedProcess.ownerUserId || '').trim();
  }
  if (Array.isArray(record.relatedProcessNumbers)) {
    for (const number of record.relatedProcessNumbers) {
      const process = processForMonitoringRecord({ process: number }, processIndex);
      if (process?.scope === PRIVATE) return String(process.privateOwnerUserId || process.ownerUserId || '').trim();
    }
  }
  const fromTerms = scopeFromTermIds(record.monitoredTermIds, termsById);
  return fromTerms?.scope === PRIVATE ? fromTerms.privateOwnerUserId : '';
}

function termNumbers(term) {
  const values = [term?.oabNumber, term?.oab, term?.registration]
    .map(value => String(value || '').replace(/\D/g, ''))
    .filter(value => value.length >= 3);
  return [...new Set(values)];
}

function matchesTermEvidence(record, term) {
  if (!term) return false;
  const numbers = termNumbers(term);
  const lawyers = [
    ...(Array.isArray(record?.publicationLawyers) ? record.publicationLawyers : []),
    ...(Array.isArray(record?.lawyers) ? record.lawyers : [])
  ];
  if (lawyers.some(lawyer => {
    const oab = String(lawyer?.oab || '').replace(/\D/g, '');
    const uf = String(lawyer?.uf || '').toUpperCase();
    return oab && numbers.includes(oab) && (!term.oabUf || !uf || String(term.oabUf).toUpperCase() === uf);
  })) return true;
  const text = `${record?.term || ''} ${record?.lawyers || ''}`.toLowerCase();
  if (numbers.some(number => text.includes(number))) return true;
  const name = String(term.name || '').trim().toLowerCase();
  return Boolean(name && text.includes(name));
}

function termEvidence(record, terms) {
  const office = terms.find(term => term.scope !== PRIVATE && matchesTermEvidence(record, term));
  if (office) return { scope: OFFICE, privateOwnerUserId: '' };
  const privateTerm = terms.find(term => term.scope === PRIVATE && matchesTermEvidence(record, term));
  if (privateTerm) return { scope: PRIVATE, privateOwnerUserId: String(privateTerm.privateOwnerUserId || '') };
  return null;
}

function applyPublicationScope(record, terms, termsById) {
  if (!record || typeof record !== 'object') return record;
  if (record.captureSuppressed) return { ...record, scope: PRIVATE };
  const evidence = termEvidence(record, terms);
  if (evidence?.scope === OFFICE) return { ...record, scope: OFFICE, privateOwnerUserId: undefined };
  if (evidence?.scope === PRIVATE && evidence.privateOwnerUserId) {
    return { ...record, scope: PRIVATE, privateOwnerUserId: evidence.privateOwnerUserId };
  }
  if (record.scope === PRIVATE) {
    const owner = String(record.privateOwnerUserId || record.ownerUserId || '').trim();
    return owner ? { ...record, privateOwnerUserId: owner } : { ...record, scope: PRIVATE, privateOwnerUserId: undefined };
  }
  const fromTerms = scopeFromTermIds(record.monitoredTermIds, termsById);
  if (fromTerms?.scope === OFFICE) return { ...record, scope: OFFICE, privateOwnerUserId: undefined };
  if (fromTerms?.scope === PRIVATE) {
    return { ...record, scope: PRIVATE, privateOwnerUserId: fromTerms.privateOwnerUserId };
  }
  return { ...record, scope: OFFICE };
}

function hasOfficeTermEvidence(record, terms, termsById) {
  if (!record || record.captureSuppressed) return false;
  const evidence = termEvidence(record, terms);
  if (evidence) return evidence.scope === OFFICE;
  return scopeFromTermIds(record.monitoredTermIds, termsById)?.scope === OFFICE;
}

function isDjenProcess(record) {
  return /DJEN|CNJ/i.test(String(record?.source || '')) || /^djen:process/i.test(String(record?.id || ''));
}

function applyProcessScope(record, terms, termsById, publicationScopeByProcess, publicationOwnerByProcess, publicationOfficeByProcess) {
  if (!record || typeof record !== 'object') return record;
  if (record.captureSuppressed) return { ...record, scope: PRIVATE };
  const key = processDigits(record.number || record.externalId);
  const publicationScope = publicationScopeByProcess.get(key);
  if (publicationOfficeByProcess.has(key)) {
    const owner = String(record.privateOwnerUserId || record.ownerUserId || '').trim();
    const responsibleUserIds = Array.isArray(record.responsibleUserIds) ? [...record.responsibleUserIds] : [];
    if (owner && !responsibleUserIds.map(String).includes(owner)) responsibleUserIds.push(owner);
    return { ...record, scope: OFFICE, privateOwnerUserId: undefined, responsibleUserIds };
  }
  if (record.scope === PRIVATE) {
    const owner = String(record.privateOwnerUserId || record.ownerUserId
      || (isDjenProcess(record) && publicationScope === PRIVATE ? publicationOwnerByProcess.get(key) : '')
      || '').trim();
    return owner ? { ...record, privateOwnerUserId: owner } : { ...record, scope: PRIVATE, privateOwnerUserId: undefined };
  }
  if (publicationScope === OFFICE) return { ...record, scope: OFFICE, privateOwnerUserId: undefined };
  if (publicationScope === PRIVATE && isDjenProcess(record)) {
    const owner = String(record.privateOwnerUserId || record.ownerUserId || publicationOwnerByProcess.get(processDigits(record.number || record.externalId)) || '').trim();
    return owner ? { ...record, scope: PRIVATE, privateOwnerUserId: owner } : { ...record, scope: PRIVATE, privateOwnerUserId: undefined };
  }
  const fromTerms = scopeFromTermIds(record.monitoredTermIds, termsById);
  if (fromTerms?.scope === PRIVATE) return { ...record, scope: PRIVATE, privateOwnerUserId: fromTerms.privateOwnerUserId };
  return { ...record, scope: OFFICE, privateOwnerUserId: undefined };
}

/**
 * Aplica o escopo de monitoramento a registros legados e aos capturados por
 * termos com `scope`. Escritório vence quando o mesmo registro contém termo
 * office e private. Também repara a migração antiga em que `term-principal`
 * virou office mas publicações privadas mantiveram o texto OAB privado.
 */
export function applyMonitoringScopes(state = {}) {
  if (!state || typeof state !== 'object') return state;
  const terms = normalizeMonitoringTerms(state.terms);
  const termsById = monitoringTermsById(terms);
  const next = { ...state };

  if (Array.isArray(state.intimations)) next.intimations = state.intimations.map(record => applyPublicationScope(record, terms, termsById));
  if (Array.isArray(state.communications)) next.communications = state.communications.map(record => applyPublicationScope(record, terms, termsById));

  const publicationScopeByProcess = new Map();
  const publicationOwnerByProcess = new Map();
  const publicationOfficeByProcess = new Set();
  for (const publication of [...(next.intimations || []), ...(next.communications || [])]) {
    const digits = processDigits(publication?.process || publication?.processNumber);
    if (!digits) continue;
    if (hasOfficeTermEvidence(publication, terms, termsById)) publicationOfficeByProcess.add(digits);
    const current = publicationScopeByProcess.get(digits);
    if (publication.scope === OFFICE || current === OFFICE) publicationScopeByProcess.set(digits, OFFICE);
    else if (publication.scope === PRIVATE && !current) {
      publicationScopeByProcess.set(digits, PRIVATE);
      publicationOwnerByProcess.set(digits, String(publication.privateOwnerUserId || publication.ownerUserId || ''));
    }
  }

  if (Array.isArray(state.processes)) next.processes = state.processes.map(process => applyProcessScope(process, terms, termsById, publicationScopeByProcess, publicationOwnerByProcess, publicationOfficeByProcess));
  const processIndex = processIndexForState(next.processes);

  const applyLinked = (record) => {
    if (!record || typeof record !== 'object') return record;
    let linked = processForMonitoringRecord(record, processIndex);
    if (!linked && Array.isArray(record.relatedProcessNumbers)) {
      for (const number of record.relatedProcessNumbers) {
        linked = processForMonitoringRecord({ process: number }, processIndex);
        if (linked) break;
      }
    }
    if (linked?.scope === PRIVATE) {
      const owner = String(linked.privateOwnerUserId || linked.ownerUserId || '').trim();
      return owner ? { ...record, scope: PRIVATE, privateOwnerUserId: owner } : record;
    }
    if (record.scope === PRIVATE) {
      const owner = String(record.privateOwnerUserId || record.ownerUserId || '').trim();
      return owner ? { ...record, privateOwnerUserId: owner } : { ...record, scope: PRIVATE, privateOwnerUserId: undefined };
    }
    const fromTerms = scopeFromTermIds(record.monitoredTermIds, termsById);
    if (fromTerms?.scope === PRIVATE) return { ...record, scope: PRIVATE, privateOwnerUserId: fromTerms.privateOwnerUserId };
    return { ...record, scope: OFFICE, privateOwnerUserId: undefined };
  };

  for (const name of ['contacts', 'tasks', 'agenda', 'documents', 'leads']) {
    if (Array.isArray(state[name])) next[name] = state[name].map(record => applyLinked(record));
  }

  const intimationsById = new Map((next.intimations || []).map(item => [String(item.id || item.externalId || ''), item]));
  for (const name of ['tasks', 'agenda', 'documents']) {
    if (!Array.isArray(next[name])) continue;
    next[name] = next[name].map(record => {
      if (record?.scope || !record?.intimationId) return record;
      const source = intimationsById.get(String(record.intimationId));
      if (source?.scope !== PRIVATE) return record;
      const owner = String(source.privateOwnerUserId || source.ownerUserId || '').trim();
      return owner ? { ...record, scope: PRIVATE, privateOwnerUserId: owner } : record;
    });
  }
  return next;
}
