// De onde vem a sugestão de cada campo. Só usa o que este usuário já pode ver.
function distinct(values) {
  const seen = new Map();
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (!text) continue;
    const key = text.toLocaleLowerCase('pt-BR');
    if (!seen.has(key)) seen.set(key, text);
  }
  return [...seen.values()].sort((left, right) => left.localeCompare(right, 'pt-BR')).map(value => ({ value }));
}

const list = value => (Array.isArray(value) ? value : []);
const names = items => list(items).map(item => item?.name);
const splitNames = value => String(value ?? '').split(',');

function contactOptions(state) {
  const options = new Map();
  for (const contact of list(state.contacts)) {
    const value = String(contact?.name ?? '').trim();
    if (!value || options.has(value.toLocaleLowerCase('pt-BR'))) continue;
    const role = contact.contactRole === 'cliente' ? 'Cliente' : contact.contactRole;
    const label = [role, contact.document, contact.city].filter(Boolean).join(' · ');
    options.set(value.toLocaleLowerCase('pt-BR'), { value, label });
  }
  return [...options.values()].sort((left, right) => left.value.localeCompare(right.value, 'pt-BR'));
}

function withExtra(base, extra) {
  const known = new Set(base.map(option => option.value.toLocaleLowerCase('pt-BR')));
  return [...base, ...distinct(extra).filter(option => !known.has(option.value.toLocaleLowerCase('pt-BR')))];
}

function memberOptions(state, members) {
  const options = list(members)
    .map(member => ({ value: String(member?.displayName || member?.username || '').trim(), label: String(member?.email || '') }))
    .filter(option => option.value);
  const base = withExtra(options, []);
  return withExtra(base, [
    ...names(state.configuration?.users),
    ...list(state.processes).flatMap(process => splitNames(process?.responsible))
  ]);
}

const fromProcesses = (state, key) => distinct(list(state.processes).map(process => process?.[key]));

function processOptions(state) {
  return list(state.processes)
    .filter(process => process?.number)
    .map(process => ({ value: String(process.number), label: String(process.client || '') }));
}

const members = ({ state, teamMembers }) => memberOptions(state, teamMembers);
const courts = ({ state }) => distinct([
  ...list(state.processes).map(item => item?.court),
  ...list(state.intimations).map(item => item?.court)
]);
const actionTypes = ({ state }) => withExtra(distinct(names(state.configuration?.actionTypes)), list(state.processes).map(item => item?.actionType));

const RULES = {
  client: { options: ({ state }) => contactOptions(state) },
  parties: { options: ({ state }) => contactOptions(state), multiple: true },
  opposingParty: { options: ({ state }) => withExtra(contactOptions(state), list(state.processes).map(item => item?.opposingParty)) },
  process: { options: ({ state }) => processOptions(state) },
  responsible: { options: members },
  responsibles: { options: members, multiple: true },
  publicationResponsible: { options: members },
  defaultAttendant: { options: members },
  author: { options: members },
  court: { options: courts },
  county: { options: ({ state }) => fromProcesses(state, 'county') },
  courtUnit: { options: ({ state }) => fromProcesses(state, 'courtUnit') },
  protocol: { options: ({ state }) => fromProcesses(state, 'protocol') },
  caseFolder: { options: ({ state }) => fromProcesses(state, 'caseFolder') },
  stage: { options: ({ state }) => withExtra(distinct(names(state.configuration?.stages)), list(state.processes).map(item => item?.stage)) },
  actionGroup: { options: ({ state }) => withExtra(distinct(names(state.configuration?.actionGroups)), list(state.processes).map(item => item?.actionGroup)) },
  actionType: { options: actionTypes },
  serviceType: { options: actionTypes },
  origin: { options: ({ state }) => withExtra(distinct(names(state.configuration?.origins)), list(state.contacts).map(item => item?.origin)) },
  city: { options: ({ state }) => distinct(list(state.contacts).map(item => item?.city)) },
  district: { options: ({ state }) => distinct(list(state.contacts).map(item => item?.district)) },
  category: { options: ({ state }) => distinct(list(state.prompts).map(item => item?.category)) },
  tags: { options: ({ state }) => distinct(list(state.prompts).flatMap(item => (Array.isArray(item?.tags) ? item.tags : splitNames(item?.tags)))), multiple: true }
};

export function fieldContextRule(name) {
  return Object.hasOwn(RULES, name) ? RULES[name] : null;
}

export function fieldContextOptions(name, { state = {}, teamMembers = [] } = {}) {
  return fieldContextRule(name)?.options({ state, teamMembers }) || [];
}

export function teamEmailOptions(teamMembers = []) {
  return list(teamMembers)
    .filter(member => member?.email)
    .map(member => ({ value: String(member.email), label: String(member.displayName || member.username || '') }));
}

export function teamNameOptions(teamMembers = []) {
  return list(teamMembers)
    .map(member => ({ value: String(member?.displayName || member?.username || '').trim(), label: String(member?.email || '') }))
    .filter(option => option.value);
}

export function normalizeSuggestion(option) {
  if (option && typeof option === 'object') return { value: String(option.value ?? ''), label: String(option.label ?? '') };
  return { value: String(option ?? ''), label: '' };
}

const folded = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR').trim();

/** Toda palavra digitada precisa aparecer, em qualquer ordem. Quem começa igual vem antes. */
export function filterSuggestions(options, query, limit = 30) {
  const words = folded(query).split(/\s+/).filter(Boolean);
  const normalized = options.map(normalizeSuggestion).filter(option => option.value);
  if (!words.length) return normalized.slice(0, limit);
  const first = folded(query);
  const matches = normalized.filter(option => {
    const text = `${folded(option.value)} ${folded(option.label)}`;
    return words.every(word => text.includes(word));
  });
  const starts = matches.filter(option => folded(option.value).startsWith(first));
  const others = matches.filter(option => !folded(option.value).startsWith(first));
  return [...starts, ...others].slice(0, limit);
}
