import { memberAvatarHtml } from './member-avatar.js?v=3.0.0';
import { publicationLawyersList } from './publication-lawyers.js?v=3.0.0';
import { officeSideLawyers } from './publication-parties.js?v=3.0.0';

const HONORIFICS = /^(?:dr|dra|adv|advogad[ao]|sr|sra)\.?$/i;

export function firstName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && HONORIFICS.test(parts[0])) parts.shift();
  return parts[0] || '';
}

export function involvedPeopleFromIds(ids, users) {
  const directory = Array.isArray(users) ? users : [];
  const seen = new Set();
  const people = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    const user = directory.find(item => String(item?.id || item?.username || '') === id);
    if (!user) continue;
    seen.add(id);
    people.push(user);
  }
  return people;
}

export function findPersonByName(users, value) {
  const name = String(value || '').trim().toLocaleLowerCase('pt-BR');
  if (!name) return null;
  return (Array.isArray(users) ? users : []).find(user => [user?.displayName, user?.username, user?.email]
    .some(candidate => String(candidate || '').trim().toLocaleLowerCase('pt-BR') === name)) || null;
}

export function peopleFromResponsibleText(value, users = []) {
  const names = String(value || '').split(/[,;]/).map(part => part.trim()).filter(Boolean);
  const seen = new Set();
  const people = [];
  for (const name of names) {
    if (GENERIC_RESPONSIBLE.test(name)) continue;
    const user = findPersonByName(users, name);
    const key = user ? String(user.id || user.username || '') : `name:${name.toLocaleLowerCase('pt-BR')}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    people.push(user || { displayName: name });
  }
  return people;
}

const GENERIC_RESPONSIBLE = /^(?:advogad[ao]|respons[aá]vel|n[aã]o atribu[ií]do|sem respons[aá]vel|equipe|—|-)$/i;

export function processForTask(task, processes = []) {
  const digits = value => String(value || '').replace(/\D/g, '');
  const taskProcess = String(task?.processId || task?.process || task?.processNumber || '').trim();
  if (!taskProcess) return null;
  return (Array.isArray(processes) ? processes : []).find(process => {
    const id = String(process?.id || process?.externalId || '').trim();
    const number = String(process?.number || process?.processNumber || '').trim();
    return id === taskProcess || number === taskProcess || (digits(number) && digits(number) === digits(taskProcess));
  }) || null;
}

export function teamForTask(task, teams = [], processes = []) {
  const process = processForTask(task, processes);
  const assigned = new Set((process?.assignedTeamIds || []).map(String));
  if (assigned.size) {
    const direct = (Array.isArray(teams) ? teams : []).find(team => assigned.has(String(team.id)));
    if (direct) return direct;
  }
  return null;
}

export function taskInvolvedPeople(task, users = [], processes = [], intimations = [], officeOabKeys = []) {
  const process = processForTask(task, processes);
  const ids = [
    task?.assigneeUserId,
    ...(Array.isArray(task?.followerUserIds) ? task.followerUserIds : []),
    ...(Array.isArray(process?.responsibleUserIds) ? process.responsibleUserIds : [])
  ];
  const people = involvedPeopleFromIds(ids, users);
  if (people.length) return people;
  const fromProcessText = peopleFromResponsibleText(process?.responsible, users);
  if (fromProcessText.length) return fromProcessText;
  const fallback = findPersonByName(users, task?.responsible);
  if (fallback) return [fallback];
  const intimationId = String(task?.intimationId || task?.sourceIntimationId || '');
  const intimation = intimationId
    ? (Array.isArray(intimations) ? intimations : []).find(item => String(item?.id || '') === intimationId || String(item?.externalId || '') === intimationId)
    : null;
  if (intimation) {
    const sideLawyers = officeSideLawyers(intimation, { oabKeys: officeOabKeys }) || publicationLawyersList(intimation);
    const fromPublication = publicationInvolvedPeople(intimation, { users, processes, lawyers: sideLawyers });
    if (fromPublication.length) return fromPublication;
  }
  const taskProcessDigits = String(task?.process || task?.processNumber || '').replace(/\D/g, '');
  if (taskProcessDigits) {
    const sibling = (Array.isArray(intimations) ? intimations : [])
      .filter(item => String(item?.process || item?.processNumber || '').replace(/\D/g, '') === taskProcessDigits)
      .filter(item => String(item?.id || '') !== intimationId)
      .sort((left, right) => String(right?.publishedAt || right?.disponibilizadoEm || '').localeCompare(String(left?.publishedAt || left?.disponibilizadoEm || '')))
      .find(item => publicationLawyersList(item).length);
    if (sibling) {
      const sideSibling = officeSideLawyers(sibling, { oabKeys: officeOabKeys }) || publicationLawyersList(sibling);
      const fromProcessPublication = publicationInvolvedPeople(sibling, { users, processes, lawyers: sideSibling });
      if (fromProcessPublication.length) return fromProcessPublication;
    }
  }
  const text = String(task?.responsible || '').trim();
  return text && !GENERIC_RESPONSIBLE.test(text) ? [{ displayName: text }] : [];
}

export function publicationInvolvedPeople(item, { users = [], processes = [], lawyers = [] } = {}) {
  const digits = value => String(value || '').replace(/\D/g, '');
  const linked = (Array.isArray(processes) ? processes : []).find(process => digits(process?.number || process?.externalId) && digits(process?.number || process?.externalId) === digits(item?.process));
  const fromProcess = involvedPeopleFromIds(linked?.responsibleUserIds, users);
  if (fromProcess.length) return fromProcess;
  const fromProcessText = peopleFromResponsibleText(linked?.responsible, users);
  if (fromProcessText.length) return fromProcessText;
  const directory = Array.isArray(users) ? users : [];
  const seen = new Set();
  const people = [];
  for (const lawyer of Array.isArray(lawyers) ? lawyers : []) {
    const oab = String(lawyer?.oab || '').replace(/\D/g, '');
    const uf = String(lawyer?.uf || '').trim().toUpperCase();
    const user = oab
      ? directory.find(candidate => String(candidate?.oab || '').replace(/\D/g, '') === oab && (!uf || !candidate?.oabUf || String(candidate.oabUf).toUpperCase() === uf))
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
