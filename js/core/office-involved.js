import { memberAvatarHtml } from './member-avatar.js?v=3.4.0';
import { publicationLawyersList } from './publication-lawyers.js?v=3.4.0';
import { officeSideLawyers } from './publication-parties.js?v=3.4.0';

const HONORIFICS = /^(?:dr|dra|adv|advogad[ao]|sr|sra)\.?$/i;

export function firstName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && HONORIFICS.test(parts[0])) parts.shift();
  return parts[0] || '';
}

const digitsOf = value => String(value || '').replace(/\D/g, '');

export function createInvolvementIndex({ processes = [], intimations = [], users = [], teams = [] } = {}) {
  const processByKey = new Map();
  const processByDigits = new Map();
  const pubProcessByDigits = new Map();
  const processList = Array.isArray(processes) ? processes : [];
  for (let i = 0; i < processList.length; i++) {
    const process = processList[i];
    if (!process) continue;
    const entry = { item: process, pos: i };
    const id = String(process.id || process.externalId || '').trim();
    const num = String(process.number || process.processNumber || '').trim();
    const numDigits = digitsOf(num);
    if (id && !processByKey.has(id)) processByKey.set(id, entry);
    if (num && !processByKey.has(num)) processByKey.set(num, entry);
    if (numDigits && !processByDigits.has(numDigits)) processByDigits.set(numDigits, entry);
    const pubDigits = digitsOf(process.number || process.externalId);
    if (pubDigits && !pubProcessByDigits.has(pubDigits)) pubProcessByDigits.set(pubDigits, process);
  }

  const intimationById = new Map();
  const intimationsByProcessDigits = new Map();
  for (const item of Array.isArray(intimations) ? intimations : []) {
    if (!item) continue;
    const id = String(item.id || '');
    const extId = String(item.externalId || '');
    if (id && !intimationById.has(id)) intimationById.set(id, item);
    if (extId && !intimationById.has(extId)) intimationById.set(extId, item);
    const pDigits = digitsOf(item.process || item.processNumber);
    if (pDigits) {
      let bucket = intimationsByProcessDigits.get(pDigits);
      if (!bucket) {
        bucket = [];
        intimationsByProcessDigits.set(pDigits, bucket);
      }
      bucket.push(item);
    }
  }
  for (const bucket of intimationsByProcessDigits.values()) {
    if (bucket.length > 1) {
      bucket.sort((left, right) => String(right?.publishedAt || right?.disponibilizadoEm || '').localeCompare(String(left?.publishedAt || left?.disponibilizadoEm || '')));
    }
  }

  const userById = new Map();
  const userByName = new Map();
  const userByOab = new Map();
  for (const user of Array.isArray(users) ? users : []) {
    if (!user) continue;
    const key = String(user.id || user.username || '');
    if (key && !userById.has(key)) userById.set(key, user);
    for (const candidate of [user.displayName, user.username, user.email]) {
      const norm = String(candidate || '').trim().toLocaleLowerCase('pt-BR');
      if (norm && !userByName.has(norm)) userByName.set(norm, user);
    }
    const oabDigits = digitsOf(user.oab);
    if (oabDigits) {
      let bucket = userByOab.get(oabDigits);
      if (!bucket) {
        bucket = [];
        userByOab.set(oabDigits, bucket);
      }
      bucket.push(user);
    }
  }

  const teamById = new Map();
  for (const team of Array.isArray(teams) ? teams : []) {
    if (!team) continue;
    const tid = String(team.id);
    if (!teamById.has(tid)) teamById.set(tid, team);
  }

  return {
    processByKey,
    processByDigits,
    pubProcessByDigits,
    intimationById,
    intimationsByProcessDigits,
    userById,
    userByName,
    userByOab,
    teamById
  };
}

export function involvedPeopleFromIds(ids, users, userById = null) {
  const directory = Array.isArray(users) ? users : [];
  const seen = new Set();
  const people = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    const user = userById
      ? (userById.get(id) || null)
      : directory.find(item => String(item?.id || item?.username || '') === id);
    if (!user) continue;
    seen.add(id);
    people.push(user);
  }
  return people;
}

export function findPersonByName(users, value, userByName = null) {
  const name = String(value || '').trim().toLocaleLowerCase('pt-BR');
  if (!name) return null;
  if (userByName) return userByName.get(name) || null;
  return (Array.isArray(users) ? users : []).find(user => [user?.displayName, user?.username, user?.email]
    .some(candidate => String(candidate || '').trim().toLocaleLowerCase('pt-BR') === name)) || null;
}

export function peopleFromResponsibleText(value, users = [], userByName = null) {
  const names = String(value || '').split(/[,;]/).map(part => part.trim()).filter(Boolean);
  const seen = new Set();
  const people = [];
  for (const name of names) {
    if (GENERIC_RESPONSIBLE.test(name)) continue;
    const user = findPersonByName(users, name, userByName);
    const key = user ? String(user.id || user.username || '') : `name:${name.toLocaleLowerCase('pt-BR')}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    people.push(user || { displayName: name });
  }
  return people;
}

const GENERIC_RESPONSIBLE = /^(?:advogad[ao]|respons[aá]vel|n[aã]o atribu[ií]do|sem respons[aá]vel|equipe|—|-)$/i;

export function processForTask(task, processes = [], index = null) {
  const taskProcess = String(task?.processId || task?.process || task?.processNumber || '').trim();
  if (!taskProcess) return null;
  if (index) {
    const byKey = index.processByKey.get(taskProcess);
    const taskDigits = digitsOf(taskProcess);
    const byDigits = taskDigits ? index.processByDigits.get(taskDigits) : null;
    if (byKey && byDigits) return byKey.pos <= byDigits.pos ? byKey.item : byDigits.item;
    return byKey?.item || byDigits?.item || null;
  }
  return (Array.isArray(processes) ? processes : []).find(process => {
    const id = String(process?.id || process?.externalId || '').trim();
    const number = String(process?.number || process?.processNumber || '').trim();
    return id === taskProcess || number === taskProcess || (digitsOf(number) && digitsOf(number) === digitsOf(taskProcess));
  }) || null;
}

export function teamForTask(task, teams = [], processes = [], index = null) {
  const process = processForTask(task, processes, index);
  const assignedList = process?.assignedTeamIds || [];
  if (index && assignedList.length) {
    if (assignedList.length === 1) return index.teamById.get(String(assignedList[0])) || null;
    const assigned = new Set(assignedList.map(String));
    return (Array.isArray(teams) ? teams : []).find(team => assigned.has(String(team.id))) || null;
  }
  const assigned = new Set(assignedList.map(String));
  if (assigned.size) {
    const direct = (Array.isArray(teams) ? teams : []).find(team => assigned.has(String(team.id)));
    if (direct) return direct;
  }
  return null;
}

export function taskInvolvedPeople(task, users = [], processes = [], intimations = [], officeOabKeys = [], index = null) {
  const process = processForTask(task, processes, index);
  const ids = [
    task?.assigneeUserId,
    ...(Array.isArray(task?.followerUserIds) ? task.followerUserIds : []),
    ...(Array.isArray(process?.responsibleUserIds) ? process.responsibleUserIds : [])
  ];
  const people = involvedPeopleFromIds(ids, users, index?.userById || null);
  if (people.length) return people;
  const fromProcessText = peopleFromResponsibleText(process?.responsible, users, index?.userByName || null);
  if (fromProcessText.length) return fromProcessText;
  const fallback = findPersonByName(users, task?.responsible, index?.userByName || null);
  if (fallback) return [fallback];
  const intimationId = String(task?.intimationId || task?.sourceIntimationId || '');
  const intimation = intimationId
    ? (index
        ? (index.intimationById.get(intimationId) || null)
        : (Array.isArray(intimations) ? intimations : []).find(item => String(item?.id || '') === intimationId || String(item?.externalId || '') === intimationId))
    : null;
  if (intimation) {
    const sideLawyers = officeSideLawyers(intimation, { oabKeys: officeOabKeys }) || publicationLawyersList(intimation);
    const fromPublication = publicationInvolvedPeople(intimation, { users, processes, lawyers: sideLawyers, index });
    if (fromPublication.length) return fromPublication;
  }
  const taskProcessDigits = String(task?.process || task?.processNumber || '').replace(/\D/g, '');
  if (taskProcessDigits) {
    const sibling = index
      ? (index.intimationsByProcessDigits.get(taskProcessDigits) || []).find(item => String(item?.id || '') !== intimationId && publicationLawyersList(item).length)
      : (Array.isArray(intimations) ? intimations : [])
          .filter(item => String(item?.process || item?.processNumber || '').replace(/\D/g, '') === taskProcessDigits)
          .filter(item => String(item?.id || '') !== intimationId)
          .sort((left, right) => String(right?.publishedAt || right?.disponibilizadoEm || '').localeCompare(String(left?.publishedAt || left?.disponibilizadoEm || '')))
          .find(item => publicationLawyersList(item).length);
    if (sibling) {
      const sideSibling = officeSideLawyers(sibling, { oabKeys: officeOabKeys }) || publicationLawyersList(sibling);
      const fromProcessPublication = publicationInvolvedPeople(sibling, { users, processes, lawyers: sideSibling, index });
      if (fromProcessPublication.length) return fromProcessPublication;
    }
  }
  const text = String(task?.responsible || '').trim();
  return text && !GENERIC_RESPONSIBLE.test(text) ? [{ displayName: text }] : [];
}

export function publicationInvolvedPeople(item, { users = [], processes = [], lawyers = [], index = null } = {}) {
  const itemDigits = digitsOf(item?.process);
  const linked = index
    ? (itemDigits ? (index.pubProcessByDigits.get(itemDigits) || null) : null)
    : (Array.isArray(processes) ? processes : []).find(process => digitsOf(process?.number || process?.externalId) && digitsOf(process?.number || process?.externalId) === itemDigits);
  const fromProcess = involvedPeopleFromIds(linked?.responsibleUserIds, users, index?.userById || null);
  if (fromProcess.length) return fromProcess;
  const fromProcessText = peopleFromResponsibleText(linked?.responsible, users, index?.userByName || null);
  if (fromProcessText.length) return fromProcessText;
  const directory = Array.isArray(users) ? users : [];
  const seen = new Set();
  const people = [];
  for (const lawyer of Array.isArray(lawyers) ? lawyers : []) {
    const oab = digitsOf(lawyer?.oab);
    const uf = String(lawyer?.uf || '').trim().toUpperCase();
    const candidates = index && oab ? (index.userByOab.get(oab) || []) : directory;
    const user = oab
      ? candidates.find(candidate => digitsOf(candidate?.oab) === oab && (!uf || !candidate?.oabUf || String(candidate.oabUf).toUpperCase() === uf))
      : null;
    const key = user ? String(user.id || user.username || '') : `lawyer:${String(lawyer?.name || '').toLocaleLowerCase('pt-BR')}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    people.push(user || { displayName: lawyer?.name || `OAB ${uf || 'UF'} ${oab}`.trim(), oab, oabUf: uf });
  }
  if (people.length) return people;
  const manual = String(item?.responsible || '').trim();
  return manual && !GENERIC_RESPONSIBLE.test(manual) ? [{ displayName: manual }] : [];
}

export function teamForPeople(teams, people) {
  const ids = new Set((Array.isArray(people) ? people : []).map(person => String(person?.id || person?.username || '')).filter(Boolean));
  if (!ids.size) return null;
  let best = null;
  let bestScore = 0;
  for (const team of Array.isArray(teams) ? teams : []) {
    const members = Array.isArray(team?.memberIds) ? team.memberIds : [];
    const score = members.filter(id => ids.has(String(id))).length;
    if (score > bestScore) {
      best = team;
      bestScore = score;
    }
  }
  return best;
}

export function renderOfficeInvolved({ people = [], team = null, escapeHtml = String, iconSvg = () => '', maxVisible = 2 } = {}) {
  const allPeople = (Array.isArray(people) ? people : [])
    .filter(person => person && String(person.displayName || person.name || person.username || '').trim());
  const list = allPeople.slice(0, Math.max(1, maxVisible));
  const teamName = String(team?.name || '').trim();
  if (!list.length && !teamName) return '';
  const names = list.map(person => firstName(person.displayName || person.name || person.username));
  const fullNames = allPeople.map(person => String(person.displayName || person.name || person.username).trim());
  const label = [
    list.length ? `Envolvidos: ${fullNames.join(', ')}` : '',
    teamName ? `Equipe: ${teamName}` : ''
  ].filter(Boolean).join('. ');
  const avatars = list.map(person => {
    const name = String(person.displayName || person.name || person.username).trim();
    return `<span class="office-involved-avatar" title="${escapeHtml(name)}">${memberAvatarHtml(person, escapeHtml)}</span>`;
  }).join('');
  const visibleNames = names.slice(0, 2).join(', ');
  const extra = allPeople.length > list.length ? ` +${allPeople.length - list.length}` : '';
  const teamChip = teamName
    ? `<span class="office-involved-divider" aria-hidden="true"></span><span class="office-involved-team">${iconSvg('office')}<span>${escapeHtml(teamName)}</span></span>`
    : '';
  return `<span class="office-involved" role="group" aria-label="${escapeHtml(label)}">${avatars ? `<span class="office-involved-avatars" aria-hidden="true">${avatars}</span>` : ''}${visibleNames ? `<span class="office-involved-names">${escapeHtml(visibleNames)}${escapeHtml(extra)}</span>` : ''}${teamChip}</span>`;
}
