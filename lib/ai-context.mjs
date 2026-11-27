const PROCESS_NUMBER_RE = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g;
const SEARCH_STOP_WORDS = new Set(['ainda', 'analise', 'como', 'com', 'dados', 'este', 'esta', 'isso', 'para', 'pela', 'pelo', 'processo', 'sobre', 'todos', 'uma', 'qual', 'quais']);

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const compact = value => String(value || '').replace(/\s+/g, ' ').trim();
const SELECTED_CONTEXT_TYPES = Object.freeze(['process', 'intimation', 'document', 'contact']);

function selectedRecord(state, type, requested = {}) {
  const collection = ({
    process: state.processes,
    intimation: state.intimations,
    document: state.documents,
    contact: state.contacts
  })[type];
  const id = String(requested?.id || '').trim();
  if (!id || !Array.isArray(collection)) return null;
  return collection.find(item => String(item?.id || '') === id || String(item?.externalId || '') === id) || null;
}

// Vínculos usados apenas na verificação de escopo. Não são campos de prompt:
// as funções de mensagem renderizam uma lista fixa e não consomem estes metadados.
function internalScopeLinks(record) {
  const links = {};
  if (Array.isArray(record?.monitoredTermIds) && record.monitoredTermIds.length) {
    links.monitoredTermIds = record.monitoredTermIds
      .filter(id => id !== null && id !== undefined)
      .map(id => String(id));
  }
  if (Array.isArray(record?.relatedProcessNumbers) && record.relatedProcessNumbers.length) {
    links.relatedProcessNumbers = record.relatedProcessNumbers
      .filter(value => value !== null && value !== undefined)
      .map(value => String(value));
  }
  return links;
}

function projectCompanyProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const taxEvents = Array.isArray(profile.taxEvents)
    ? profile.taxEvents.slice(0, 4).map(ev => ({
      regime: compact(ev?.regime).slice(0, 24),
      from: compact(ev?.from).slice(0, 24),
      text: compact(ev?.text).slice(0, 120)
    })).filter(ev => ev.regime || ev.from || ev.text)
    : [];
  const qsa = Array.isArray(profile.qsa)
    ? profile.qsa.slice(0, 8).map(partner => ({
      name: compact(partner?.name).slice(0, 100),
      role: compact(partner?.role).slice(0, 80),
      since: compact(partner?.since).slice(0, 24)
    })).filter(partner => partner.name)
    : [];
  const capitalNum = Number(profile.capital);
  const projected = {
    tradeName: compact(profile.tradeName).slice(0, 120),
    establishmentType: compact(profile.establishmentType).slice(0, 24),
    status: compact(profile.status).slice(0, 48),
    statusDate: compact(profile.statusDate).slice(0, 24),
    openedAt: compact(profile.openedAt).slice(0, 24),
    legalNature: compact(profile.legalNature).slice(0, 120),
    size: compact(profile.size).slice(0, 60),
    sizeAcronym: compact(profile.sizeAcronym).slice(0, 16),
    capital: Number.isFinite(capitalNum) && capitalNum >= 0 ? capitalNum : null,
    primaryActivity: compact(profile.primaryActivity).slice(0, 180),
    primaryActivityCode: compact(profile.primaryActivityCode).slice(0, 24),
    simpleNational: typeof profile.simpleNational === 'boolean' ? profile.simpleNational : null,
    mei: typeof profile.mei === 'boolean' ? profile.mei : null,
    taxEvents,
    qsa
  };
  const hasAny = Boolean(
    projected.tradeName || projected.establishmentType || projected.status || projected.legalNature
    || projected.size || projected.primaryActivity || projected.capital !== null
    || projected.simpleNational !== null || projected.mei !== null || projected.qsa.length
  );
  return hasAny ? projected : null;
}

export function formatCompanyProfileSummary(profile) {
  const projected = projectCompanyProfile(profile);
  if (!projected) return '';
  const parts = [];
  if (projected.tradeName) parts.push(`Fantasia: ${projected.tradeName}`);
  if (projected.establishmentType) parts.push(`Tipo: ${projected.establishmentType}`);
  if (projected.status) parts.push(`Situação: ${projected.status}${projected.statusDate ? ` (desde ${projected.statusDate})` : ''}`);
  if (projected.legalNature) parts.push(`Natureza: ${projected.legalNature}`);
  if (projected.size) {
    const acronym = projected.sizeAcronym && !projected.size.toUpperCase().includes(projected.sizeAcronym.toUpperCase())
      ? ` (${projected.sizeAcronym})` : '';
    parts.push(`Porte: ${projected.size}${acronym}`);
  }
  if (projected.capital !== null) {
    parts.push(`Capital: R$ ${projected.capital.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  }
  if (projected.primaryActivity) parts.push(`CNAE: ${projected.primaryActivity}`);
  const regime = [
    projected.simpleNational === true ? 'Simples Nacional' : projected.simpleNational === false ? 'Fora do Simples' : '',
    projected.mei === true ? 'MEI' : ''
  ].filter(Boolean).join(' · ');
  if (regime) parts.push(`Regime: ${regime}`);
  if (projected.taxEvents.length) {
    parts.push(`Eventos tributários: ${projected.taxEvents.map(ev => [ev.regime, ev.from, ev.text].filter(Boolean).join(' ')).join('; ')}`);
  }
  if (projected.qsa.length) {
    parts.push(`QSA: ${projected.qsa.map(p => p.role ? `${p.name} (${p.role})` : p.name).join(', ')}`);
  }
  return parts.join(' | ');
}

function selectedSystemData(type, record) {
  const scopeMeta = {
    scope: record.scope || 'office',
    privateOwnerUserId: record.privateOwnerUserId || record.ownerUserId || null,
    ...(record.restricted ? { restricted: true } : {}),
    ...(record.captureSuppressed ? { captureSuppressed: true } : {}),
    ...internalScopeLinks(record)
  };
  if (type === 'process') return {
    id: record.id, number: record.number || record.protocol || '', client: record.client || '', contactId: record.contactId || '',
    opposingParty: record.opposingParty || '', court: record.court || record.county || '', actionType: record.actionType || record.subject || '',
    judicialPhase: record.judicialPhase || '', stage: record.stage || '', lastMovement: record.lastMovement || '',
    ...scopeMeta
  };
  if (type === 'intimation') return {
    id: record.id, title: record.title || '', process: record.process || record.number || '', processId: record.processId || '', client: record.client || '',
    court: record.court || '', publishedAt: record.publishedAt || '', fatalDate: record.fatalDate || '', treatmentStatus: record.treatmentStatus || '',
    originalText: record.text || record.summary || '',
    ...scopeMeta
  };
  if (type === 'document') return {
    id: record.id, name: record.name || record.originalName || '', documentType: record.documentType || '', documentDate: record.documentDate || '',
    ownerType: record.ownerType || '', ownerId: record.ownerId || '', classificationStatus: record.metadata?.classificationStatus || record.classificationStatus || '',
    summary: record.metadata?.summary || '', context: record.metadata?.context || '', hasExtractedText: Boolean(record.intelligence?.ocr?.checksum),
    ...scopeMeta
  };
  const companyProfile = projectCompanyProfile(record.companyProfile);
  return {
    id: record.id, name: record.name || '', contactRole: record.contactRole || '', city: record.city || '', state: record.state || '',
    ...(companyProfile ? { companyProfile } : {}),
    ...scopeMeta
  };
}

export async function resolveSelectedAssistantContext(state = {}, requestedContext = {}, { loadOcrText } = {}) {
  const type = SELECTED_CONTEXT_TYPES.find(candidate => requestedContext?.[candidate]?.id);
  if (!type) return {};
  const record = selectedRecord(state, type, requestedContext[type]);
  if (!record || (type === 'document' && record.deletedAt)) return {};
  const selected = selectedSystemData(type, record);
  if (type === 'document' && selected.hasExtractedText && typeof loadOcrText === 'function') {
    try {
      selected.extractedText = String(await loadOcrText(record.intelligence.ocr.checksum) || '').slice(0, 16_000);
    } catch {
      selected.extractedText = '';
    }
  }
  return { [type]: selected };
}

export function buildSelectedAssistantContextMessage(selectedContext = {}) {
  const type = SELECTED_CONTEXT_TYPES.find(candidate => selectedContext?.[candidate]?.id);
  if (!type) return '';
  const item = selectedContext[type];
  if (type === 'process') return `[CONTEXTO EXPLICITAMENTE SELECIONADO — DADOS DO SISTEMA]\nTipo: Processo\nNúmero CNJ: ${compact(item.number || 'N/I')}\nCliente: ${compact(item.client || 'N/I')}\nParte contrária: ${compact(item.opposingParty || 'N/I')}\nTribunal/comarca: ${compact(item.court || 'N/I')}\nAção/fase: ${compact([item.actionType, item.judicialPhase, item.stage].filter(Boolean).join(' · ') || 'N/I')}\nÚltimo andamento cadastrado: ${compact(item.lastMovement || 'N/I')}`;
  if (type === 'intimation') return `[CONTEXTO EXPLICITAMENTE SELECIONADO — DADOS DO SISTEMA]\nTipo: Publicação/intimação\nProcesso: ${compact(item.process || 'N/I')}\nCliente: ${compact(item.client || 'N/I')}\nTribunal: ${compact(item.court || 'N/I')}\nData da publicação: ${compact(item.publishedAt || 'N/I')}\nEstado de tratamento: ${compact(item.treatmentStatus || 'N/I')}\n\n[CONTEXTO EXPLICITAMENTE SELECIONADO — TEXTO ORIGINAL]\n${String(item.originalText || '').slice(0, 16_000)}`;
  if (type === 'document') return `[CONTEXTO EXPLICITAMENTE SELECIONADO — DADOS DO SISTEMA]\nTipo: Documento\nNome: ${compact(item.name || 'N/I')}\nTipo documental: ${compact(item.documentType || 'N/I')}\nData documental: ${compact(item.documentDate || 'N/I')}\nClassificação: ${compact(item.classificationStatus || 'N/I')}\nResumo supervisionado: ${compact(item.summary || 'N/I')}\nContexto supervisionado: ${compact(item.context || 'N/I')}\n\n[CONTEXTO EXPLICITAMENTE SELECIONADO — TEXTO EXTRAÍDO]\n${String(item.extractedText || 'Extração não disponível; não presuma o conteúdo do arquivo.').slice(0, 16_000)}`;
  const companySummary = formatCompanyProfileSummary(item.companyProfile);
  return `[CONTEXTO EXPLICITAMENTE SELECIONADO — DADOS DO SISTEMA]\nTipo: Cliente/contato\nNome: ${compact(item.name || 'N/I')}\nPapel cadastrado: ${compact(item.contactRole || 'N/I')}\nLocalidade: ${compact([item.city, item.state].filter(Boolean).join('/') || 'N/I')}${companySummary ? `\nPerfil empresarial público: ${companySummary}` : ''}\nDados pessoais de contato foram omitidos por minimização.`;
}

function mergeRecords(left = [], right = [], key = 'id') {
  const result = [...left];
  for (const record of right) {
    const value = record?.[key] ?? record?.id;
    const index = result.findIndex(item => (item?.[key] ?? item?.id) === value);
    if (index >= 0) result[index] = { ...result[index], ...record };
    else result.unshift(record);
  }
  return result;
}

function recordScore(record, query, rawQuery, tokens) {
  const processNumber = String(record?.number || record?.process || '').trim();
  if (processNumber && rawQuery.includes(processNumber)) return 100;
  let score = 0;
  const candidates = [record?.name, record?.client, record?.title, record?.opposingParty, record?.court];
  if (record?.companyProfile && typeof record.companyProfile === 'object') {
    candidates.push(record.companyProfile.tradeName, record.companyProfile.primaryActivity);
    if (Array.isArray(record.companyProfile.qsa)) {
      for (const partner of record.companyProfile.qsa.slice(0, 8)) candidates.push(partner?.name);
    }
  }
  for (const value of candidates) {
    const candidate = normalize(value);
    if (candidate.length >= 5 && query.includes(candidate)) score += 30;
    for (const token of tokens) if (candidate.includes(token)) score += 2;
  }
  return score;
}

function selectRelevant(records, query, rawQuery, tokens, limit, includeGeneral = false) {
  const scored = records
    .map(record => ({ record, score: recordScore(record, query, rawQuery, tokens) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.record);
  if (scored.length) return scored.slice(0, limit);
  return includeGeneral ? records.slice(0, limit) : [];
}

function isPrivateContextRecord(record) {
  return Boolean(record && (record.scope === 'private' || record.privateOwnerUserId || record.ownerUserId || record.restricted || record.captureSuppressed));
}

export function selectRelevantOfficeRecords(state = {}, runtime = {}, message = '', selectedContext = {}) {
  const rawQuery = String(message || '');
  const query = normalize(rawQuery);
  const tokens = [...new Set(query.split(/[^a-z0-9]+/).filter(token => token.length >= 4 && !SEARCH_STOP_WORDS.has(token)))];
  const contacts = state.contacts || [];
  const processes = mergeRecords(state.processes || [], runtime.processes || [], 'number');
  const intimations = mergeRecords(state.intimations || [], runtime.intimations || [], 'id');
  // Tarefa absorvida numa consolidação de prazo sai do contexto do assistente: o trabalho vivo
  // é a oficial, e o assistente não deve responder com a duplicata que o painel já esconde.
  const tasks = mergeRecords(state.tasks || [], runtime.tasks || [], 'id')
    .filter(task => task && task.active !== false && !task.absorbedInto);
  // Compromisso vindo da agenda pessoal (Google) nunca vai para provedor de IA: é regra de uso limitado.
  const agenda = mergeRecords(state.agenda || [], runtime.events || [], 'id').filter(item => item?.source !== 'Agenda pessoal');
  const documents = state.documents || [];

  const explicitNumbers = new Set(rawQuery.match(PROCESS_NUMBER_RE) || []);
  for (const record of [selectedContext.intimation, selectedContext.process]) {
    const number = String(record?.process || record?.number || '').trim();
    if (number) explicitNumbers.add(number);
  }

  const asksProcesses = /\b(process|acervo|carteira)\w*/.test(query);
  const asksIntimations = /\b(intim|publica[cç]|djen|diario)\w*/.test(query);
  const asksTasks = /\b(tarefa|prazo|kanban|pendencia)\w*/.test(query);
  const asksAgenda = /\b(agenda|audiencia|compromisso|evento)\w*/.test(query);
  const asksContacts = /\b(cliente|contato|parte|empresa|cnpj|soci[oa]|qsa|cnae|simples|mei)\w*/.test(query);

  let relevantProcesses = selectRelevant(processes, query, rawQuery, tokens, 8, asksProcesses && /\b(ativ|lista|todos|carteira|acervo)\w*/.test(query));
  if (explicitNumbers.size) {
    relevantProcesses = processes.filter(item => explicitNumbers.has(String(item.number || item.protocol || '').trim())).slice(0, 8);
  }
  const selectedProcessIds = new Set([
    selectedContext.process?.id,
    selectedContext.intimation?.processId,
    selectedContext.document?.ownerType === 'process' ? selectedContext.document.ownerId : ''
  ].filter(Boolean).map(String));
  const selectedContact = selectedContext.contact;
  const selectedContactName = normalize(selectedContact?.name);
  const explicitlyLinkedProcesses = processes.filter(item => selectedProcessIds.has(String(item.id || ''))
    || (selectedContact?.id && String(item.contactId || '') === String(selectedContact.id))
    || (selectedContactName && normalize(item.client) === selectedContactName));
  if (explicitlyLinkedProcesses.length) relevantProcesses = mergeRecords(explicitlyLinkedProcesses, relevantProcesses).slice(0, 8);
  const relatedNumbers = new Set([...explicitNumbers, ...relevantProcesses.map(item => String(item.number || item.protocol || '').trim()).filter(Boolean)]);

  const byRelatedProcess = record => relatedNumbers.has(String(record?.process || '').trim());
  let relevantIntimations = intimations.filter(byRelatedProcess);
  if (!relevantIntimations.length) relevantIntimations = selectRelevant(intimations, query, rawQuery, tokens, 6, asksIntimations);
  relevantIntimations = relevantIntimations.slice(0, 6);

  let relevantTasks = tasks.filter(byRelatedProcess);
  if (!relevantTasks.length) relevantTasks = selectRelevant(tasks, query, rawQuery, tokens, 8, asksTasks);
  relevantTasks = relevantTasks.slice(0, 8);

  let relevantAgenda = agenda.filter(byRelatedProcess);
  if (!relevantAgenda.length) relevantAgenda = selectRelevant(agenda, query, rawQuery, tokens, 6, asksAgenda);
  relevantAgenda = relevantAgenda.slice(0, 6);

  let relevantContacts = asksContacts ? selectRelevant(contacts, query, rawQuery, tokens, 5, false) : [];
  if (selectedContact?.id) relevantContacts = mergeRecords([selectedContact], relevantContacts).slice(0, 5);
  if (selectedContext.document?.ownerType === 'contact') {
    const owner = contacts.find(item => String(item.id || '') === String(selectedContext.document.ownerId || ''));
    if (owner) relevantContacts = mergeRecords([owner], relevantContacts).slice(0, 5);
  }
  const relevantDocuments = selectedContext.document?.id
    ? documents.filter(item => String(item.id || '') === String(selectedContext.document.id)).slice(0, 1)
    : [];

  return {
    relevantProcesses,
    relevantIntimations,
    relevantTasks,
    relevantAgenda,
    relevantContacts,
    relevantDocuments
  };
}

export function hasPrivateOfficeContext(state = {}, runtime = {}, message = '', selectedContext = {}) {
  if (SELECTED_CONTEXT_TYPES.some(type => isPrivateContextRecord(selectedContext?.[type]))) {
    return true;
  }
  if (!state || typeof state !== 'object') return false;
  const matched = selectRelevantOfficeRecords(state, runtime || {}, message, selectedContext);
  const matchedRecords = [
    ...matched.relevantProcesses,
    ...matched.relevantIntimations,
    ...matched.relevantTasks,
    ...matched.relevantAgenda,
    ...matched.relevantContacts,
    ...matched.relevantDocuments
  ];
  if (matchedRecords.some(isPrivateContextRecord)) return true;

  const privateTermIds = new Set(
    (Array.isArray(state.terms) ? state.terms : [])
      .filter(term => term && (term.scope === 'private' || term.privateOwnerUserId || term.ownerUserId))
      .map(term => String(term.id || ''))
      .filter(Boolean)
  );
  if (privateTermIds.size > 0) {
    const selectedItems = SELECTED_CONTEXT_TYPES.map(type => selectedContext?.[type]).filter(Boolean);
    for (const record of [...matchedRecords, ...selectedItems]) {
      if (Array.isArray(record?.monitoredTermIds) && record.monitoredTermIds.some(id => privateTermIds.has(String(id || '')))) {
        return true;
      }
    }
  }
  const relatedNumbers = Array.isArray(selectedContext?.contact?.relatedProcessNumbers)
    ? selectedContext.contact.relatedProcessNumbers.map(value => String(value || '').replace(/\D/g, '')).filter(Boolean)
    : [];
  if (relatedNumbers.length > 0 && Array.isArray(state.processes)) {
    const relatedSet = new Set(relatedNumbers);
    if (state.processes.some(proc => isPrivateContextRecord(proc) && relatedSet.has(String(proc?.number || proc?.processNumber || '').replace(/\D/g, '')))) {
      return true;
    }
  }
  return false;
}

export function buildRelevantOfficeContext(state = {}, runtime = {}, message = '', selectedContext = {}) {
  const {
    relevantProcesses,
    relevantIntimations,
    relevantTasks,
    relevantAgenda,
    relevantContacts,
    relevantDocuments
  } = selectRelevantOfficeRecords(state, runtime, message, selectedContext);
  const sections = [];

  if (relevantProcesses.length) {
    sections.push(`[PROCESSOS RELEVANTES — ${relevantProcesses.length}]\n${relevantProcesses.map(item =>
      `- ${compact(item.number || item.protocol || 'Sem número')} | Cliente: ${compact(item.client || 'N/I')} | Parte contrária: ${compact(item.opposingParty || 'N/I')} | Órgão: ${compact(item.court || item.county || 'N/I')} | Ação/fase: ${compact([item.actionType, item.judicialPhase, item.stage].filter(Boolean).join(' · ') || 'N/I')} | Último andamento: ${compact(item.lastMovement || 'N/I')}`
    ).join('\n')}`);
  }
  if (relevantIntimations.length) {
    sections.push(`[PUBLICAÇÕES RELEVANTES — DADOS DO SISTEMA — ${relevantIntimations.length}]\n${relevantIntimations.map(item =>
      `- Processo: ${compact(item.process || 'N/I')} | Tribunal: ${compact(item.court || 'N/I')} | Publicação: ${compact(item.publishedAt || 'N/I')} | Prazo informado: ${compact(item.fatalDate || 'N/I')}`
    ).join('\n')}`);
    sections.push(`[PUBLICAÇÕES RELEVANTES — TEXTO ORIGINAL]\n${relevantIntimations.map(item =>
      `- ${compact(item.process || item.id || 'N/I')}: ${compact(item.text || item.summary || '').slice(0, 600)}`
    ).join('\n')}`);
  }
  if (relevantTasks.length) {
    sections.push(`[TAREFAS E PRAZOS RELEVANTES — ${relevantTasks.length}]\n${relevantTasks.map(item =>
      `- ${compact(item.title || 'Sem título')} | Processo: ${compact(item.process || 'Geral')} | Cliente: ${compact(item.client || 'N/I')} | Prazo fatal: ${compact(item.fatalDeadline || 'N/I')} | Prazo da tarefa: ${compact(item.deadline || item.dueDate || 'N/I')} | Status: ${compact(item.status || 'pendente')} | Responsável: ${compact(item.responsible || item.lawyer || 'N/I')}`
    ).join('\n')}`);
  }
  if (relevantAgenda.length) {
    sections.push(`[AGENDA RELEVANTE — ${relevantAgenda.length}]\n${relevantAgenda.map(item =>
      `- ${compact(item.date || 'S/D')} ${compact(item.time || '')} | ${compact(item.title || 'Compromisso')} | Cliente: ${compact(item.client || 'N/I')} | Processo: ${compact(item.process || 'N/I')}`
    ).join('\n')}`);
  }
  if (relevantContacts.length) {
    sections.push(`[CONTATOS RELEVANTES — ${relevantContacts.length}]\n${relevantContacts.map(item => {
      const companySummary = formatCompanyProfileSummary(item.companyProfile);
      return `- ${compact(item.name || 'Sem nome')} | Papel: ${compact(item.contactRole || 'cliente')} | Localidade: ${compact([item.city, item.state].filter(Boolean).join('/') || 'N/I')}${companySummary ? ` | Empresa: ${companySummary}` : ''}`;
    }).join('\n')}`);
  }
  if (relevantProcesses.length && Array.isArray(state?.contacts)) {
    const companyContacts = state.contacts.filter(contact => contact && !isPrivateContextRecord(contact) && contact.companyProfile);
    if (companyContacts.length) {
      const seenPartyIds = new Set();
      const matchedParties = [];
      for (const proc of relevantProcesses) {
        const procContactId = String(proc?.contactId || '').trim();
        const clientNorm = normalize(proc?.client);
        const oppNorm = normalize(proc?.opposingParty);
        for (const contact of companyContacts) {
          const cid = String(contact.id || contact.name || '').trim();
          if (!cid || seenPartyIds.has(cid)) continue;
          const contactNorm = normalize(contact.name);
          const linked = (procContactId && String(contact.id || '') === procContactId)
            || (clientNorm && contactNorm === clientNorm)
            || (oppNorm && contactNorm === oppNorm);
          if (!linked) continue;
          const summary = formatCompanyProfileSummary(contact.companyProfile);
          if (!summary) continue;
          seenPartyIds.add(cid);
          matchedParties.push(`- ${compact(contact.name || 'Sem nome')} (${compact(contact.contactRole || 'parte')}) | ${summary}`);
          if (matchedParties.length >= 5) break;
        }
        if (matchedParties.length >= 5) break;
      }
      if (matchedParties.length) {
        sections.push(`[PERFIL SOCIETÁRIO DE PARTES ENVOLVIDAS — DADOS PÚBLICOS — ${matchedParties.length}]\n${matchedParties.join('\n')}`);
      }
    }
  }
  if (relevantDocuments.length) {
    const item = selectedContext.document;
    sections.push(`[DOCUMENTO SELECIONADO — DADOS DO SISTEMA]\n- ${compact(item.name || 'Sem nome')} | Tipo: ${compact(item.documentType || 'N/I')} | Data: ${compact(item.documentDate || 'N/I')} | Classificação: ${compact(item.classificationStatus || 'N/I')} | Resumo supervisionado: ${compact(item.summary || 'N/I')}`);
    sections.push(`[DOCUMENTO SELECIONADO — TEXTO EXTRAÍDO]\n${String(item.extractedText || 'Extração não disponível; não presuma o conteúdo do arquivo.').slice(0, 16_000)}`);
  }

  const body = sections.length ? sections.join('\n\n') : 'Nenhum registro interno foi selecionado para esta pergunta.';
  return `\n=== CONTEXTO INTERNO LIMITADO À PERGUNTA ===\n${body}`.slice(0, 24_000);
}
