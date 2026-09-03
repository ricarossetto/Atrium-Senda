const UNKNOWN_CLIENT = /^(?:cliente\s+)?(?:n[aã]o\s+(?:informado|identificado|vinculado)|ainda\s+n[aã]o\s+vinculado|n\/?i|sem\s+cliente)$/i;
const MINIMUM_CONFIDENCE = 0.9;

export function normalizeProcessNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

export function isKnownClientName(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  return name.length >= 3 && !UNKNOWN_CLIENT.test(name);
}

function normalizedName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function applyClientReconciliation(state, links = []) {
  if (!state || typeof state !== 'object' || !Array.isArray(links)) return { linkedProcesses: 0, updatedRecords: 0 };
  const contacts = Array.isArray(state.contacts) ? state.contacts : [];
  const collections = ['intimations', 'tasks', 'agenda', 'events', 'documents', 'financial'];
  let linkedProcesses = 0;
  let updatedRecords = 0;

  for (const link of links) {
    const processNumber = normalizeProcessNumber(link?.processNumber);
    const clientName = String(link?.clientName || '').replace(/\s+/g, ' ').trim();
    const confidence = Number(link?.confidence);
    if (processNumber.length !== 20 || !isKnownClientName(clientName) || !Number.isFinite(confidence) || confidence < MINIMUM_CONFIDENCE) continue;
    const process = (state.processes || []).find(item => normalizeProcessNumber(item.number) === processNumber);
    if (!process || isKnownClientName(process.client) || process.contactId) continue;

    const contactById = link.contactId ? contacts.find(item => String(item.id || '') === String(link.contactId)) : null;
    const contactByName = contacts.find(item => normalizedName(item.name) === normalizedName(clientName));
    const contact = contactById || contactByName;
    if (contact && (contact.contactRole !== 'cliente' || normalizedName(contact.name) !== normalizedName(clientName))) continue;
    process.client = contact?.name || clientName;
    if (contact?.id) process.contactId = contact.id;
    process.clientLinkProvenance = {
      method: link.method || 'ai-grounded',
      confidence,
      evidence: String(link.evidence || '').slice(0, 280),
      model: String(link.model || '').slice(0, 80),
      linkedAt: link.linkedAt || new Date().toISOString()
    };
    linkedProcesses += 1;
    updatedRecords += 1;

    for (const collection of collections) {
      for (const record of Array.isArray(state[collection]) ? state[collection] : []) {
        const sameProcess = normalizeProcessNumber(record.process || record.processNumber || record.number) === processNumber
          || (record.processId && [process.id, process.externalId].filter(Boolean).includes(record.processId));
        if (!sameProcess) continue;
        let changed = false;
        if (!isKnownClientName(record.client)) { record.client = process.client; changed = true; }
        if (!record.process) { record.process = process.number; changed = true; }
        if (!record.processId && process.id) { record.processId = process.id; changed = true; }
        if (contact?.id && !record.contactId && !record.clientContactId) {
          record.contactId = contact.id;
          record.clientContactId = contact.id;
          changed = true;
        }
        if (changed) updatedRecords += 1;
      }
    }
  }

  return { linkedProcesses, updatedRecords };
}
