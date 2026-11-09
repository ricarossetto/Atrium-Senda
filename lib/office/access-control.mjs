import { monitoringTermsById, ownerMatchesUser, privateOwnerForRecord, processForMonitoringRecord } from './monitoring-scope.mjs';

const USER_MANAGER_PERMISSIONS = new Set(['office.manage', 'processes.read_all']);

function identity(user) {
  return String(user?.id || user?.username || '');
}

function hasPermission(user, permission) {
  return Array.isArray(user?.permissions) && user.permissions.includes(permission);
}

function isManager(user) {
  return hasPermission(user, 'office.manage') || hasPermission(user, 'processes.read_all');
}

function grantExpiryMs(value) {
  if (!value) return Infinity;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const text = String(value).trim();
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T23:59:59-03:00` : text);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function processIdentity(process) {
  return String(process?.id || process?.processId || process?.number || '').trim();
}

export function processNumber(process) {
  return String(process?.number || process?.processNumber || '').replace(/\D/g, '');
}

export function buildProcessIndex(processes = []) {
  const index = new Map();
  for (const process of Array.isArray(processes) ? processes : []) {
    if (!process) continue;
    for (const key of [process.id, process.processId, process.number, process.processNumber]) {
      const value = String(key || '').trim();
      if (value && !index.has(value)) index.set(value, process);
    }
    const digits = processNumber(process);
    if (digits && !index.has(digits)) index.set(digits, process);
  }
  return index;
}

export function processForRecord(record, index) {
  if (!record) return null;
  for (const key of [record.processId, record.process, record.processNumber]) {
    const value = String(key || '').trim();
    if (value && index.has(value)) return index.get(value);
    const digits = value.replace(/\D/g, '');
    if (digits && index.has(digits)) return index.get(digits);
  }
  return null;
}

export function userInTeam(user, team) {
  const id = identity(user);
  const username = String(user?.username || '');
  return (team?.memberIds || []).some(memberId => String(memberId) === id || String(memberId) === username);
}

export function canAccessProcess(user, process, teams = []) {
  if (!process) return false;
  if (isSuppressedRecord(process)) return false;
  const userId = identity(user);
  if (process.scope === 'private') return ownerMatchesUser(process.privateOwnerUserId, user);
  if (isManager(user)) return true;
  if (String(process.workspaceId || '') && user?.workspaceId && String(process.workspaceId) !== String(user.workspaceId)) return false;
  if (Array.isArray(process.responsibleUserIds) && process.responsibleUserIds.map(String).includes(userId)) return true;
  if (Array.isArray(process.responsibleUserIds) && process.responsibleUserIds.map(String).includes(String(user?.username || ''))) return true;
  const assignedTeams = new Set((process.assignedTeamIds || []).map(String));
  if (assignedTeams.size && (Array.isArray(teams) ? teams : []).some(team => assignedTeams.has(String(team.id)) && userInTeam(user, team))) return true;
  const grants = Array.isArray(process.accessGrants) ? process.accessGrants : [];
  return grants.some(grant => String(grant?.userId || '') === userId && grantExpiryMs(grant?.expiresAt) > Date.now());
}

export function isSuppressedRecord(record) {
  return Boolean(record?.captureSuppressed);
}

// Exclusão de equipe em uso revogaria acesso em silêncio (assignedTeamIds órfão).
// A varredura cobre todo o workspace, inclusive processos de escopo privado: é
// preferível recusar a exclusão de um vínculo que ninguém enxerga do que perder acesso.
export function teamInUseInState(state, teamId) {
  const id = String(teamId || '').trim();
  if (!id) return false;
  return (Array.isArray(state?.processes) ? state.processes : []).some(process =>
    Array.isArray(process?.assignedTeamIds) && process.assignedTeamIds.map(String).includes(id));
}

export function canAccessTask(user, task, processIndex, teams = []) {
  if (!task) return false;
  if (isSuppressedRecord(task)) return false;
  if (task.scope === 'private') return ownerMatchesUser(task.privateOwnerUserId, user);
  const process = processForRecord(task, processIndex);
  if (process) {
    if (process.scope === 'private' && !ownerMatchesUser(process.privateOwnerUserId, user)) return false;
    return canAccessProcess(user, process, teams);
  }
  if (hasPermission(user, 'tasks.read_all') || hasPermission(user, 'office.manage')) return true;
  const userId = identity(user);
  return String(task.assigneeUserId || '') === userId
    || (Array.isArray(task.followerUserIds) && task.followerUserIds.map(String).includes(userId));
}

export function canAccessPublication(user, publication, processIndex, teams = []) {
  if (!publication) return false;
  if (isSuppressedRecord(publication)) return false;
  if (publication.scope === 'private' && !ownerMatchesUser(publication.privateOwnerUserId || publication.ownerUserId, user)) return false;
  const process = processForRecord(publication, processIndex);
  if (process) {
    if (process.scope === 'private' && !ownerMatchesUser(process.privateOwnerUserId, user)) return false;
    return canAccessProcess(user, process, teams);
  }
  return hasPermission(user, 'publications.read_all') || hasPermission(user, 'office.manage');
}

export function canAccessContact(user, contact, processIndex, teams = []) {
  if (!contact) return false;
  if (isSuppressedRecord(contact)) return false;
  if (contact.scope === 'private' && !ownerMatchesUser(contact.privateOwnerUserId || contact.ownerUserId, user)) return false;
  let process = processForRecord(contact, processIndex);
  if (!process && Array.isArray(contact.relatedProcessNumbers)) {
    for (const number of contact.relatedProcessNumbers) {
      process = processIndex.get(String(number)) || processIndex.get(String(number).replace(/\D/g, ''));
      if (process) break;
    }
  }
  if (process?.scope === 'private') {
    if (!ownerMatchesUser(process.privateOwnerUserId, user)) return false;
    return true;
  }
  if (hasPermission(user, 'clients.read_all') || hasPermission(user, 'crm.read_all') || hasPermission(user, 'office.manage')) return true;
  if (ownerMatchesUser(contact.ownerUserId, user)) return true;
  return process ? canAccessProcess(user, process, teams) : false;
}

export function canAccessAgenda(user, event, processIndex, teams = []) {
  if (!event) return false;
  if (event.scope === 'private' && !ownerMatchesUser(event.privateOwnerUserId || event.ownerUserId, user)) return false;
  const process = processForRecord(event, processIndex);
  if (process?.scope === 'private') {
    if (!ownerMatchesUser(process.privateOwnerUserId, user)) return false;
    return true;
  }
  if (hasPermission(user, 'agenda.read_all') || hasPermission(user, 'office.manage')) return true;
  if (ownerMatchesUser(event.ownerUserId, user)) return true;
  return process ? canAccessProcess(user, process, teams) : false;
}

export function canAccessDocument(user, document, processIndex, teams = []) {
  if (!document) return false;
  if (document.scope === 'private' && !ownerMatchesUser(document.privateOwnerUserId || document.ownerUserId, user)) return false;
  if (document.ownerType === 'process' && document.ownerId) {
    const process = processIndex.get(String(document.ownerId));
    if (process?.scope === 'private' && !ownerMatchesUser(process.privateOwnerUserId, user)) return false;
    if (hasPermission(user, 'documents.read_all') || hasPermission(user, 'office.manage')) return true;
    return process ? canAccessProcess(user, process, teams) : false;
  }
  if (hasPermission(user, 'documents.read_all') || hasPermission(user, 'office.manage')) return true;
  const process = processForRecord(document, processIndex);
  return process ? canAccessProcess(user, process, teams) : false;
}

export function canAccessSearchResult(user, result, state, teams = []) {
  const type = String(result?.entityType || '').toLowerCase();
  const collection = ({ document: 'documents', process: 'processes', contact: 'contacts', lead: 'leads', publication: 'intimations', note: 'intimations', task: 'tasks', appointment: 'agenda' })[type] || '';
  const id = String(result?.id || '');
  const index = buildProcessIndex(state?.processes);
  if (type === 'movement' || type === 'financial') {
    const process = index.get(id);
    return process ? canAccessProcess(user, process, teams) : false;
  }
  if (type === 'prompt' || type === 'audit') return hasPermission(user, 'audit.read') || hasPermission(user, 'office.manage');
  if (!collection) return false;
  const items = Array.isArray(state?.[collection]) ? state[collection] : [];
  const item = items.find(record => String(record?.id || '') === id);
  if (!item) return false;
  if (collection === 'processes') return canAccessProcess(user, item, teams);
  if (collection === 'tasks') return canAccessTask(user, item, index, teams);
  if (collection === 'intimations') return canAccessPublication(user, item, index, teams);
  if (collection === 'contacts' || collection === 'leads') return canAccessContact(user, item, index, teams);
  if (collection === 'agenda') return canAccessAgenda(user, item, index, teams);
  if (collection === 'documents') return canAccessDocument(user, item, index, teams);
  return false;
}

export function filterPrivateSearchResults(user, results, state, { teams = [] } = {}) {
  const visible = filterPrivateScopeState(state, user, { teams });
  const sets = {
    process: new Set((visible.processes || []).map(item => String(item.id))),
    publication: new Set((visible.intimations || []).map(item => String(item.id))),
    note: new Set((visible.intimations || []).map(item => String(item.id))),
    task: new Set((visible.tasks || []).map(item => String(item.id))),
    contact: new Set((visible.contacts || []).map(item => String(item.id))),
    lead: new Set((visible.leads || []).map(item => String(item.id))),
    agenda: new Set((visible.agenda || []).map(item => String(item.id))),
    document: new Set((visible.documents || []).map(item => String(item.id)))
  };
  return (Array.isArray(results) ? results : []).filter(result => {
    const type = String(result?.entityType || '').toLowerCase();
    if (type === 'movement' || type === 'financial') return sets.process.has(String(result?.id || ''));
    const set = sets[type];
    return set ? set.has(String(result?.id || '')) : true;
  });
}

export function canManageFinance(user) {
  return hasPermission(user, 'finance.read') || hasPermission(user, 'finance.write') || hasPermission(user, 'office.manage');
}

// Gravar lançamento exige direito próprio. `finance.read` só lê: quem enxerga não
// edita. `office.manage` continua valendo porque administra o escritório inteiro.
export function canWriteFinancial(user) {
  if (user?.financeBlockedByPlan === true) return false;
  return hasPermission(user, 'finance.write') || hasPermission(user, 'office.manage');
}

// A visibilidade do lançamento deriva do processo vinculado, não de um campo de dono
// paralelo. Sem vínculo resolvido, vale o autor do lançamento — regra conservadora.
export function canAccessFinancialEntry(user, entry, processIndex, teams = []) {
  if (!entry) return false;
  if (isSuppressedRecord(entry)) return false;
  if (canManageFinance(user)) return true;
  const index = processIndex instanceof Map ? processIndex : buildProcessIndex(processIndex);
  const process = processForRecord(entry, index);
  if (process) return canAccessProcess(user, process, teams);
  const userId = identity(user);
  return Boolean(userId && String(entry.createdByUserId || '') === userId);
}

function filterCollection(list, predicate) {
  return Array.isArray(list) ? list.filter(predicate) : list;
}

export function filterOfficeState(state, user, { teams = [] } = {}) {
  if (!state || typeof state !== 'object') return state;
  const next = structuredClone(state);
  const processIndex = buildProcessIndex(state.processes);
  next.processes = filterCollection(state.processes, process => canAccessProcess(user, process, teams));
  next.tasks = filterCollection(state.tasks, task => canAccessTask(user, task, processIndex, teams));
  next.intimations = filterCollection(state.intimations, item => canAccessPublication(user, item, processIndex, teams));
  next.communications = filterCollection(state.communications, item => canAccessPublication(user, item, processIndex, teams));
  next.contacts = filterCollection(state.contacts, item => canAccessContact(user, item, processIndex, teams));
  next.agenda = filterCollection(state.agenda, item => canAccessAgenda(user, item, processIndex, teams));
  next.documents = filterCollection(state.documents, item => canAccessDocument(user, item, processIndex, teams));
  next.leads = filterCollection(state.leads, item => canAccessContact(user, item, processIndex, teams));
  // Financeiro segue o mesmo predicado nos dois pontos de projeção (filtro e merge).
  // Antes aqui o binário `canManageFinance` zerava a coleção inteira.
  next.officeExpenses = filterCollection(state.officeExpenses, entry => canAccessFinancialEntry(user, entry, processIndex, teams));
  next.financialEntries = filterCollection(state.financialEntries, entry => canAccessFinancialEntry(user, entry, processIndex, teams));
  if (!hasPermission(user, 'audit.read') && !hasPermission(user, 'office.manage')) next.audit = [];
  return next;
}

const PRIVATE_SCOPE_COLLECTIONS = ['processes', 'tasks', 'intimations', 'communications', 'contacts', 'agenda', 'documents', 'leads', 'terms'];

export function filterPrivateScopeState(state, user, { teams = [] } = {}) {
  if (!state || typeof state !== 'object') return state;
  const next = { ...state };
  const processIndex = buildProcessIndex(state.processes);
  const termsById = monitoringTermsById(state.terms);
  for (const name of PRIVATE_SCOPE_COLLECTIONS) {
    if (!Array.isArray(state[name])) continue;
    next[name] = state[name].filter(record => {
      if (isSuppressedRecord(record)) return false;
      const owner = privateOwnerForRecord(record, { termsById, processIndex });
      const linkedPrivate = processForMonitoringRecord(record, processIndex)?.scope === 'private'
        || (Array.isArray(record.relatedProcessNumbers)
          && record.relatedProcessNumbers.some(number => processForMonitoringRecord({ process: number }, processIndex)?.scope === 'private'));
      if ((record.scope === 'private' || linkedPrivate) && !owner) return false;
      return !owner || ownerMatchesUser(owner, user);
    });
  }
  return next;
}

export function mergePrivateScopeState(current, incoming, user, { teams = [] } = {}) {
  if (!current || !incoming) return incoming;
  const next = structuredClone(incoming);
  const processIndex = buildProcessIndex(current.processes);
  const termsById = monitoringTermsById(current.terms);
  for (const name of PRIVATE_SCOPE_COLLECTIONS) {
    const currentItems = Array.isArray(current[name]) ? current[name] : [];
    const hidden = currentItems.filter(record => {
      const owner = privateOwnerForRecord(record, { termsById, processIndex });
      return Boolean(owner) && !ownerMatchesUser(owner, user);
    });
    if (!hidden.length) continue;
    const hiddenIds = new Set(hidden.map(item => String(item.id)));
    const incomingItems = Array.isArray(next[name]) ? next[name] : [];
    next[name] = [...hidden, ...incomingItems.filter(item => !hiddenIds.has(String(item.id)))];
  }
  return next;
}

const HIDDEN_COLLECTIONS = ['processes', 'tasks', 'intimations', 'communications', 'contacts', 'agenda', 'documents', 'leads', 'terms'];
const HIDDEN_FINANCE_COLLECTIONS = ['officeExpenses', 'financialEntries'];

export function mergeVisibleClientState(current, incoming, user, { teams = [] } = {}) {
  if (!current || !incoming) return incoming;
  const next = structuredClone(incoming);
  const processIndex = buildProcessIndex(current.processes);
  for (const name of HIDDEN_COLLECTIONS) {
    const currentItems = Array.isArray(current[name]) ? current[name] : [];
    const incomingItems = Array.isArray(incoming[name]) ? incoming[name] : [];
    const predicate = item => {
      if (name === 'processes') return canAccessProcess(user, item, teams);
      if (name === 'tasks') return canAccessTask(user, item, processIndex, teams);
      if (name === 'intimations' || name === 'communications') return canAccessPublication(user, item, processIndex, teams);
      if (name === 'contacts' || name === 'leads') return canAccessContact(user, item, processIndex, teams);
      if (name === 'agenda') return canAccessAgenda(user, item, processIndex, teams);
      if (name === 'documents') return canAccessDocument(user, item, processIndex, teams);
      if (name === 'terms') return item?.scope !== 'private' && !item?.privateOwnerUserId
        ? true
        : ownerMatchesUser(item.privateOwnerUserId || item.ownerUserId, user);
      return true;
    };
    const hidden = currentItems.filter(item => !predicate(item));
    const visibleIncoming = incomingItems.filter(predicate);
    // Id repetido no mesmo lote não vira duas linhas: vale a última versão enviada.
    const uniqueIncoming = [...new Map(visibleIncoming.map((item, index) => [String(item?.id ?? `sem-id-${index}`), item])).values()];
    next[name] = [...hidden, ...uniqueIncoming];
  }
  // Financeiro: mesmo predicado de `filterOfficeState`. O merge preserva o registro
  // oculto do estado anterior e descarta a versão que o cliente não enxerga.
  const financeWritable = canWriteFinancial(user);
  for (const name of HIDDEN_FINANCE_COLLECTIONS) {
    const currentItems = Array.isArray(current[name]) ? current[name] : [];
    const incomingItems = Array.isArray(incoming[name]) ? incoming[name] : [];
    // Sem direito de gravação, a versão oficial das duas coleções prevalece por
    // inteiro: o cliente pode ler, mas o flush não altera nem cria lançamento.
    if (!financeWritable) {
      next[name] = Array.isArray(current[name]) ? structuredClone(current[name]) : current[name];
      continue;
    }
    const predicate = item => canAccessFinancialEntry(user, item, processIndex, teams);
    const hidden = structuredClone(currentItems.filter(item => !predicate(item)));
    // O registro oculto do estado oficial é a fonte única desse id. Um item entrante
    // com o mesmo id — inclusive com o vínculo trocado para um processo que o usuário
    // acessa — é descartado antes do filtro de visibilidade. Sem esse descarte o
    // cliente duplicaria o id e o flush carimbaria a cópia plantada com o autor oficial.
    const hiddenIds = new Set(
      hidden.map(item => String(item?.id ?? '')).filter(id => id.length > 0)
    );
    const visibleIncoming = incomingItems
      .filter(item => {
        const id = String(item?.id ?? '');
        return !id || !hiddenIds.has(id);
      })
      .filter(predicate);
    next[name] = [...hidden, ...visibleIncoming];
  }
  const applyAccessFields = (item, previous) => {
    if (!previous) {
      item.scope = 'office';
      item.assignmentStatus = identity(user) ? 'provisional' : 'unassigned';
      item.responsibleUserIds = identity(user) ? [identity(user)] : [];
      item.assignedTeamIds = [];
      item.accessGrants = [];
      return;
    }
    item.scope = previous.scope === 'private' ? 'private' : 'office';
    item.privateOwnerUserId = previous.privateOwnerUserId;
    item.assignedTeamIds = structuredClone(previous.assignedTeamIds || []);
    item.responsibleUserIds = structuredClone(previous.responsibleUserIds || []);
    item.accessGrants = structuredClone(previous.accessGrants || []);
    item.assignmentStatus = previous.assignmentStatus || 'assigned';
    item.assignedBy = previous.assignedBy;
    item.assignedAt = previous.assignedAt;
  };
  const previousById = new Map((current.processes || []).map(process => [String(process.id), process]));
  next.processes = (next.processes || []).map(process => {
    const copy = process;
    applyAccessFields(copy, previousById.get(String(copy.id)));
    return copy;
  });
  return next;
}

const FLUSH_GUARDED_COLLECTIONS = ['processes', 'tasks', 'intimations', 'contacts', 'agenda', 'leads', 'terms'];

/**
 * Devolve ao corpo do flush o que ele não pode ter apagado: registro que a leitura não
 * entregou a este navegador e, em qualquer caso, publicação (só muda pelas rotas oficiais).
 * O que sobra é remoção real do usuário, relatada para a auditoria.
 */
export function restoreRecordsUnseenByClient(current, next, readView) {
  const restored = [];
  const removed = [];
  if (!current || !next) return { restored, removed };
  for (const name of FLUSH_GUARDED_COLLECTIONS) {
    const currentItems = Array.isArray(current[name]) ? current[name] : [];
    if (!currentItems.length || !Array.isArray(next[name])) continue;
    const incomingIds = new Set(next[name].map(item => String(item?.id || '')));
    const visibleIds = new Set((Array.isArray(readView?.[name]) ? readView[name] : []).map(item => String(item?.id || '')));
    const giveBack = [];
    const seen = new Set();
    let removedCount = 0;
    for (const record of currentItems) {
      const id = String(record?.id || '');
      if (!id || incomingIds.has(id) || seen.has(id)) continue;
      seen.add(id);
      if (name === 'intimations' && record.mergedInto) continue;
      if (name === 'intimations' || !visibleIds.has(id)) giveBack.push(record);
      else removedCount += 1;
    }
    if (giveBack.length) {
      next[name] = [...giveBack, ...next[name]];
      restored.push({ collection: name, count: giveBack.length });
    }
    if (removedCount) removed.push({ collection: name, count: removedCount });
  }
  return { restored, removed };
}
