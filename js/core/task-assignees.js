// ATRIUM — Resolução oficial de responsáveis de tarefa por membro do escritório.
// Espelho frontend de lib/tasks/task-assignees.mjs: mesma normalização, mesma
// semântica, sem dependências de DOM. Testes de paridade cobrem os dois lados.
// Nunca inventa vínculo: nome ambíguo ou fora da equipe resulta em null.

const AMBIGUOUS = Symbol('atrium-ambiguous-member');

export function normalizeMemberKey(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim();
}

function memberCandidates(member) {
  if (!member || typeof member !== 'object') return [];
  return [member.displayName, member.username, member.email].map(normalizeMemberKey).filter(Boolean);
}

export function buildMemberIndex(members) {
  const byId = new Map();
  const byName = new Map();
  for (const member of Array.isArray(members) ? members : []) {
    if (!member || member.status === 'inactive') continue;
    const id = String(member.id || member.username || '').trim();
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, member);
    for (const key of memberCandidates(member)) {
      if (!key) continue;
      if (byName.has(key) && byName.get(key) !== member) byName.set(key, AMBIGUOUS);
      else if (!byName.has(key)) byName.set(key, member);
    }
  }
  return { byId, byName };
}

export function matchMemberByName(members, name) {
  const key = normalizeMemberKey(name);
  if (!key) return null;
  const { byName } = buildMemberIndex(members);
  const hit = byName.get(key);
  return hit && hit !== AMBIGUOUS ? hit : null;
}

export function memberIdOf(member) {
  return String(member?.id || member?.username || '').trim() || null;
}

export function memberKeys(member) {
  const keys = new Set();
  for (const raw of [member?.id, member?.username, member?.displayName, member?.email]) {
    const clean = String(raw || '').trim();
    if (clean) keys.add(clean);
    const normalized = normalizeMemberKey(raw);
    if (normalized) keys.add(normalized);
  }
  return keys;
}

export function itemVisibleToMember(item, me, { ids = [], names = [] } = {}) {
  if (!me) return true;
  const keys = memberKeys(me);
  const cleanIds = (Array.isArray(ids) ? ids : []).map(id => String(id || '').trim()).filter(Boolean);
  if (cleanIds.some(id => keys.has(id))) return true;
  if (cleanIds.length) return false;
  const cleanNames = (Array.isArray(names) ? names : String(names || '').split(/[,;]/))
    .map(normalizeMemberKey).filter(Boolean);
  if (!cleanNames.length) return true;
  return cleanNames.some(name => keys.has(name));
}

export function resolveMemberIdList(names, members, cap = 10) {
  const { byName } = buildMemberIndex(members);
  const ids = [];
  const seen = new Set();
  const list = Array.isArray(names) ? names : String(names || '').split(/[,;]/);
  for (const name of list) {
    const hit = byName.get(normalizeMemberKey(name));
    const id = hit && hit !== AMBIGUOUS ? memberIdOf(hit) : null;
    if (!id || seen.has(id) || ids.length >= cap) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function resolveTaskAssignees(task, members) {
  const { byId, byName } = buildMemberIndex(members);
  const lookup = key => {
    const hit = byName.get(normalizeMemberKey(key));
    return hit && hit !== AMBIGUOUS ? hit : null;
  };

  let assignee = null;
  const rawAssignee = String(task?.assigneeUserId || '').trim();
  if (rawAssignee && byId.has(rawAssignee)) assignee = byId.get(rawAssignee);
  if (!assignee) {
    const named = lookup(task?.responsible);
    if (named) assignee = named;
  }
  const assigneeUserId = memberIdOf(assignee);

  const followers = [];
  const seen = new Set(assigneeUserId ? [assigneeUserId] : []);
  const pushId = id => {
    const clean = String(id || '').trim();
    if (!clean || seen.has(clean) || !byId.has(clean) || followers.length >= 20) return;
    seen.add(clean);
    followers.push(clean);
  };
  for (const id of Array.isArray(task?.followerUserIds) ? task.followerUserIds : []) pushId(id);
  const names = Array.isArray(task?.responsibles)
    ? task.responsibles
    : String(task?.responsibles || '').split(/[,;]/);
  for (const name of names) {
    const hit = lookup(name);
    if (hit) pushId(memberIdOf(hit));
  }
  return { assigneeUserId, followerUserIds: followers };
}
