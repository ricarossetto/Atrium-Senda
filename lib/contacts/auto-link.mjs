/**
 * ATRIUM — Vínculo automático (conservador) entre contato-cliente e processo/publicação.
 *
 * Contrato (specs/relationship-crm.md):
 * - só vincula quando a identidade é EXATA e o candidato é ÚNICO: documento com os
 *   mesmos dígitos ou nome normalizado idêntico (sem acento/caixa/espaços);
 * - homônimos, nome genérico ("SIGILO", "não informado", "Geral"), contato adverso e
 *   alvo já vinculado a outro contato nunca são sobrescritos — viram pendência;
 * - nunca cria contato, nunca troca o cliente de um alvo já preenchido, nunca decide
 *   por semelhança: semelhança é sugestão (camada assistiva), não vínculo.
 *
 * Módulo puro: o chamador aplica o plano no estado oficial e registra o audit.
 */

const GENERIC_CLIENT_PATTERNS = [
  /^sigilo/i,
  /^segredo/i,
  /n[ãa]o informad/i,
  /sem cliente/i,
  /parte desconhecida/i,
  /\bgeral\b/i,
  /^cliente$/i
];

const NON_CLIENT_ROLES = new Set(['adverso', 'adversa', 'parte contraria', 'parte contrária', 'testemunha', 'terceiro', 'outro']);

export function normalizeContactName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function documentDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function isGenericClientName(value) {
  const name = normalizeContactName(value);
  if (!name) return true;
  return GENERIC_CLIENT_PATTERNS.some(pattern => pattern.test(name));
}

export function isClientRole(role) {
  const normalized = normalizeContactName(role);
  if (!normalized) return true;
  return !NON_CLIENT_ROLES.has(normalized);
}

function targetReference(record) {
  return String(record?.id || record?.externalId || record?.number || '').trim();
}

function targetClientName(record) {
  return String(record?.clientName || record?.client || '').trim();
}

function targetDocument(record) {
  return documentDigits(record?.clientDocument || record?.contactDocument || '');
}

/**
 * Plano de vínculo. Devolve `links` (aplicáveis), `ambiguous` (homônimos/duplicidade de
 * documento — pendência de conferência) e `skipped` (sem candidato único ou alvo já
 * vinculado), sem alterar nada.
 */
export function planContactAutoLinks({ contacts = [], processes = [], intimations = [] } = {}) {
  const links = [];
  const ambiguous = [];
  const skipped = [];
  const contactById = new Map();
  const byDocument = new Map();
  const byName = new Map();

  for (const contact of Array.isArray(contacts) ? contacts : []) {
    if (!contact || typeof contact !== 'object') continue;
    const id = String(contact.id || '').trim();
    if (!id || contact.mergedInto) continue;
    contactById.set(id, contact);
    if (!isClientRole(contact.contactRole || contact.role)) continue;
    const name = normalizeContactName(contact.name || contact.displayName);
    if (!name || isGenericClientName(name)) continue;
    const document = documentDigits(contact.document || contact.cpf || contact.cnpj);
    if (document.length >= 11) {
      if (!byDocument.has(document)) byDocument.set(document, []);
      byDocument.get(document).push(contact);
    }
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(contact);
  }

  const targets = [
    ...(Array.isArray(processes) ? processes : []).map(record => ({ kind: 'process', record })),
    ...(Array.isArray(intimations) ? intimations : []).map(record => ({ kind: 'intimation', record }))
  ];

  for (const { kind, record } of targets) {
    if (!record || typeof record !== 'object' || record.mergedInto) continue;
    const reference = targetReference(record);
    if (!reference) continue;
    const clientName = targetClientName(record);
    const currentContactId = String(record.contactId || '').trim();
    if (currentContactId && contactById.has(currentContactId)) {
      skipped.push({ kind, id: reference, reason: 'ja-vinculado', contactId: currentContactId });
      continue;
    }
    if (currentContactId && !contactById.has(currentContactId)) {
      skipped.push({ kind, id: reference, reason: 'vinculo-externo' });
      continue;
    }
    const document = targetDocument(record);
    const normalizedName = normalizeContactName(clientName);
    const genericName = isGenericClientName(clientName);
    if (!document && genericName) {
      skipped.push({ kind, id: reference, reason: 'cliente-generico' });
      continue;
    }

    if (document) {
      const byDocumentMatches = byDocument.get(document) || [];
      if (byDocumentMatches.length === 1) {
        links.push({
          kind,
          id: reference,
          contactId: String(byDocumentMatches[0].id),
          contactName: String(byDocumentMatches[0].name || byDocumentMatches[0].displayName || '').trim(),
          matchedBy: 'documento',
          clientName
        });
        continue;
      }
      if (byDocumentMatches.length > 1) {
        ambiguous.push({ kind, id: reference, matchedBy: 'documento', candidates: byDocumentMatches.map(item => String(item.id)) });
        continue;
      }
    }

    const byNameMatches = genericName ? [] : (byName.get(normalizedName) || []);
    if (byNameMatches.length === 1) {
      links.push({
        kind,
        id: reference,
        contactId: String(byNameMatches[0].id),
        contactName: String(byNameMatches[0].name || byNameMatches[0].displayName || '').trim(),
        matchedBy: 'nome',
        clientName
      });
      continue;
    }
    if (byNameMatches.length > 1) {
      ambiguous.push({ kind, id: reference, matchedBy: 'nome', candidates: byNameMatches.map(item => String(item.id)) });
      continue;
    }
    skipped.push({ kind, id: reference, reason: 'sem-candidato' });
  }

  return { links, ambiguous, skipped };
}

/**
 * Aplica o plano no estado oficial. Nunca cria contato, nunca troca cliente já
 * preenchido por outro nome; devolve o audit das mudanças efetivas.
 */
export function applyContactAutoLinks(state, plan, { actor = 'Sincronização', nowIso = new Date().toISOString(), maxAudit = 50 } = {}) {
  const links = Array.isArray(plan?.links) ? plan.links : [];
  const processes = Array.isArray(state?.processes) ? state.processes : [];
  const intimations = Array.isArray(state?.intimations) ? state.intimations : [];
  const contacts = new Map((Array.isArray(state?.contacts) ? state.contacts : [])
    .filter(contact => contact && contact.id)
    .map(contact => [String(contact.id), contact]));
  const indexTargets = kind => (kind === 'process' ? processes : intimations);
  const auditEntries = [];
  let linked = 0;

  for (const link of links) {
    const list = indexTargets(link.kind);
    const record = list.find(item => item && (String(item.id || '').trim() === link.id || String(item.externalId || '').trim() === link.id));
    if (!record) continue;
    const contact = contacts.get(String(link.contactId));
    if (!contact) continue;
    if (String(record.contactId || '').trim() === link.contactId) continue;
    if (String(record.contactId || '').trim()) continue;
    const currentClient = targetClientName(record);
    const contactName = String(contact.name || contact.displayName || '').trim();
    if (currentClient && normalizeContactName(currentClient) !== normalizeContactName(contactName)) {
      // O alvo já exibe outro cliente: não sobrescreve — o caso é de conferência humana.
      continue;
    }
    record.contactId = link.contactId;
    if (!currentClient && contactName) {
      record.client = contactName;
      record.clientName = contactName;
    }
    record.autoLinkedAt = nowIso;
    record.autoLinkedBy = `correspondência exata (${link.matchedBy})`;
    record.updatedAt = nowIso;
    linked += 1;
    if (auditEntries.length < maxAudit) {
      auditEntries.push({
        id: `aud-vinculo-${Date.now().toString(36)}${linked}`,
        at: nowIso,
        action: 'Vínculo automático de cliente',
        detail: `${link.kind === 'process' ? 'Processo' : 'Publicação'} ${link.id} · ${contactName || link.contactId} (correspondência exata de ${link.matchedBy})`,
        actor: String(actor || 'Sincronização').slice(0, 100)
      });
    }
  }

  return { linked, changed: linked > 0 || auditEntries.length > 0, auditEntries, ambiguous: Array.isArray(plan?.ambiguous) ? plan.ambiguous.length : 0 };
}
