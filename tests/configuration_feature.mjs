import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createConfigurationFeature } from '../js/features/configuration.js';

const moduleSource = readFileSync(new URL('../js/features/configuration.js', import.meta.url), 'utf8');
const portalSource = readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
assert.match(moduleSource, /export function createConfigurationFeature/);
assert.doesNotMatch(moduleSource, /^\s*import\s/m);
assert.doesNotMatch(moduleSource, /portal\.js|system-admin\.js/);
assert.doesNotMatch(moduleSource, /\bfetch\s*\(/);
assert.match(portalSource, /renderConfiguration\(query = ''\) \{ return getConfigurationFeature\(\)\.render\(query\); \}/);
assert.match(portalSource, /openConfigurationModal\(defaults = \{\}, index = null\) \{ return getConfigurationFeature\(\)\.openModal\(defaults, index\); \}/);
assert.doesNotMatch(portalSource, /const sections = \[\s*\['taskDefinitions'/);
assert.doesNotMatch(portalSource, /configurationList'\)\?\.addEventListener/);

function makeClassList() {
  const values = new Set();
  return {
    toggle(name, force) { if (force) values.add(name); else values.delete(name); },
    contains: name => values.has(name)
  };
}

function makeElement() {
  const listeners = new Map();
  return {
    innerHTML: '', textContent: '', value: '', classList: makeClassList(), listeners,
    wrapper: { classList: makeClassList() },
    closest(selector) { return selector === '.table-search' ? this.wrapper : null; },
    addEventListener(type, handler) { (listeners.get(type) || listeners.set(type, []).get(type)).push(handler); }
  };
}

const elementIds = ['configurationSearch', 'configurationTabs', 'newConfigurationButton', 'configurationList', 'configurationMetrics', 'configurationHeading', 'configurationCount'];
const elements = Object.fromEntries(elementIds.map(id => [id, makeElement()]));
const documentRef = { getElementById: id => elements[id] || null };
const configuration = {
  taskDefinitions: [{ name: 'Tarefa Sintética', points: 10, phase: 'Judicial' }, { name: 'Pesquisar Acórdão Sintético', points: 20, phase: 'Pesquisa' }],
  users: [{ name: 'Usuária Estrutural', role: 'Colaboradora', pointsGoal: '100' }],
  actionGroups: [{ name: 'Grupo Sintético', publicationResponsible: 'Responsável Sintético' }],
  actionTypes: [{ name: 'Ação Sintética', group: 'Grupo Sintético' }],
  stages: [{ name: 'Etapa Sintética', classification: 'Ativa', phase: 'Inicial' }],
  origins: [{ name: 'Origem Sintética' }],
  goals: [{ group: 'Equipe Sintética', monthlyClosings: null }],
  inboxSections: ['Seção Sintética'],
  notificationAssignments: [{ event: 'Evento Sintético', responsibles: ['Pessoa A', 'Pessoa B'] }],
  integrations: [{ name: 'Integração Sintética', status: 'Ativa', method: 'API' }]
};
const audits = [];
const toasts = [];
const modalCalls = [];
const requests = [];
let flushResult = true;
let diagnosticRenders = 0;
let backupRenders = 0;
const store = {
  state: { configuration, contacts: [{ id: 'contact-synthetic' }, { id: 'contact-synthetic-2' }] },
  saveCalls: 0,
  audit(action, detail) { audits.push({ action, detail }); },
  save() { this.saveCalls++; },
  async flush() { return flushResult; }
};
let usersResponse = {
  ok: true,
  async json() {
    return {
      currentRole: 'master_admin',
      users: [
        { id: 'master-synthetic', username: 'master.synthetic', displayName: 'Master Sintética', email: 'master@example.test', role: 'master_admin', status: 'active' },
        { id: 'pending-synthetic', username: 'pending.synthetic', displayName: 'Pendente Sintética', email: 'pending@example.test', role: 'collaborator', status: 'pending_approval' },
        { id: 'active-synthetic', username: 'active.synthetic', displayName: 'Ativa Sintética', email: 'active@example.test', role: 'collaborator', status: 'active' },
        { id: 'inactive-synthetic', username: 'inactive.synthetic', displayName: 'Inativa Sintética', email: 'inactive@example.test', role: 'collaborator', status: 'inactive' }
      ]
    };
  }
};
const secureFetch = async (url, options = {}) => {
  requests.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
  if (url.endsWith('/manage')) return { ok: true, async json() { return { ok: true }; } };
  return usersResponse;
};

const feature = createConfigurationFeature({
  store,
  documentRef,
  secureFetch,
  escapeHtml: value => String(value ?? '').replaceAll('<', '&lt;'),
  normalizeText: value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(),
  openModal: (...args) => modalCalls.push(args),
  showToast: (message, type) => toasts.push({ message, type }),
  onRenderDiagnostic: () => { diagnosticRenders++; },
  onRenderBackups: () => { backupRenders++; }
});

assert.equal(feature.section, 'taskDefinitions');
assert.deepEqual(feature.users, []);
assert.equal(feature.role, 'collaborator');
assert.equal(feature.init(), true);
assert.equal(feature.init(), false);
for (const [id, type] of [['configurationSearch', 'input'], ['configurationTabs', 'click'], ['newConfigurationButton', 'click'], ['configurationList', 'click'], ['configurationList', 'submit']]) {
  assert.equal(elements[id].listeners.get(type)?.length, 1, `${id} deve possuir exatamente um listener ${type}.`);
}

feature.render();
const tabKeys = [...elements.configurationTabs.innerHTML.matchAll(/data-config-section="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(tabKeys, ['taskDefinitions', 'users', 'actionGroups', 'actionTypes', 'stages', 'origins', 'goals', 'inboxSections', 'notificationAssignments', 'integrations', 'registry', 'diagnostic', 'backups']);
assert.match(elements.configurationMetrics.innerHTML, /2[\s\S]*Definições de tarefa/);
assert.match(elements.configurationMetrics.innerHTML, /1[\s\S]*Tipos de ação/);
assert.match(elements.configurationMetrics.innerHTML, /1[\s\S]*Etapas/);
assert.match(elements.configurationMetrics.innerHTML, /0[\s\S]*Usuários de acesso/);
assert.match(elements.configurationMetrics.innerHTML, /2[\s\S]*Contatos importados/);

feature.render('acordao');
assert.match(elements.configurationList.innerHTML, /Pesquisar Acórdão Sintético/);
assert.doesNotMatch(elements.configurationList.innerHTML, /Tarefa Sintética/);
assert.match(feature.row('Seção Sintética', 3), /Seção da caixa de entrada[\s\S]*data-delete-config="3"/);
assert.match(feature.row({ name: 'Objeto Sintético', phase: 'Execução', points: 17 }, 2), /Objeto Sintético[\s\S]*Execução[\s\S]*17 pontos/);
assert.match(feature.row({ group: 'Equipe Sintética', monthlyClosings: null }, 4), /Meta não definida/);
assert.match(feature.row({ event: 'Evento legado', responsibles: 'Pessoa A; Pessoa B' }, 5), /Pessoa A; Pessoa B/);
assert.match(feature.row({ event: 'Evento sem responsáveis', responsibles: { malformed: true } }, 6), /Evento sem responsáveis[\s\S]*—/);
feature.openModal({ event: 'Evento legado', responsibles: null }, 0);
assert.equal(modalCalls.at(-1)[4].responsibles, '');

await feature.loadAuthUsers();
assert.equal(feature.users.length, 4);
assert.equal(feature.role, 'master_admin');
assert.match(feature.authUserRow(feature.users[1]), /Aguardando aprovação[\s\S]*Aprovar/);
assert.match(feature.authUserRow(feature.users[2]), /Ativo[\s\S]*Suspender/);
assert.match(feature.authUserRow(feature.users[3]), /Suspenso[\s\S]*Reativar/);
assert.doesNotMatch(feature.authUserRow(feature.users[0]), /data-auth-user-status/);
feature.role = 'collaborator';
assert.doesNotMatch(feature.authUserRow(feature.users[2]), /data-auth-user-status/);

feature.role = 'master_admin';
assert.equal(await feature.manageAuthUser('pending-synthetic', 'active'), true);
assert.deepEqual(requests.find(request => request.url.endsWith('/manage')).body, { userId: 'pending-synthetic', status: 'active' });
assert.ok(toasts.some(item => item.message === 'Acesso do usuário atualizado.' && item.type === 'success'));
usersResponse = { ok: false, async json() { return { message: 'Falha sintética de usuários' }; } };
await feature.loadAuthUsers();
assert.deepEqual(feature.users, []);
assert.equal(feature.role, 'collaborator');

const expectedFields = {
  taskDefinitions: ['name', 'points', 'phase'], users: ['name', 'role', 'pointsGoal'], actionGroups: ['name', 'publicationResponsible'],
  actionTypes: ['name', 'group'], stages: ['name', 'classification', 'phase'], origins: ['name'], goals: ['group', 'monthlyClosings'],
  inboxSections: ['value'], notificationAssignments: ['event', 'responsibles'], integrations: ['name', 'status', 'method']
};
for (const [section, names] of Object.entries(expectedFields)) {
  feature.section = section;
  feature.openModal(section === 'inboxSections' ? 'Entrada Sintética' : {}, null);
  const call = modalCalls.at(-1);
  assert.equal(call[0], 'configuration');
  assert.deepEqual(call[3].map(field => field.name), names);
  assert.equal(call[4]._section, section);
}

feature.saveRecord({ name: 'Criada Sintética', points: '31', phase: 'Administrativo' }, { _section: 'taskDefinitions', _index: null });
assert.equal(configuration.taskDefinitions.at(-1).points, 31);
feature.saveRecord({ name: 'Editada Sintética', points: '', phase: 'Judicial' }, { _section: 'taskDefinitions', _index: 0 });
assert.equal(configuration.taskDefinitions[0].points, 0);
feature.saveRecord({ value: 'Caixa Normalizada' }, { _section: 'inboxSections', _index: null });
assert.equal(configuration.inboxSections.at(-1), 'Caixa Normalizada');
feature.saveRecord({ event: 'Evento Normalizado', responsibles: ' Pessoa A, Pessoa B; ;Pessoa C ' }, { _section: 'notificationAssignments', _index: null });
assert.deepEqual(configuration.notificationAssignments.at(-1).responsibles, ['Pessoa A', 'Pessoa B', 'Pessoa C']);
feature.saveRecord({ group: 'Meta Sem Número', monthlyClosings: '' }, { _section: 'goals', _index: null });
assert.equal(configuration.goals.at(-1).monthlyClosings, null);
assert.ok(audits.some(item => item.action === 'Configuração adicionada'));
assert.ok(audits.some(item => item.action === 'Configuração atualizada'));

feature.section = 'origins';
const originalOrigins = structuredClone(configuration.origins);
flushResult = false;
const successCountBeforeFailure = toasts.filter(item => item.type === 'success').length;
assert.equal(await feature.deleteRecord(0), false);
assert.deepEqual(configuration.origins, originalOrigins);
assert.equal(toasts.filter(item => item.type === 'success').length, successCountBeforeFailure);
flushResult = true;
assert.equal(await feature.deleteRecord(0), true);
assert.deepEqual(configuration.origins, []);
assert.ok(toasts.some(item => item.message === 'Item removido com sucesso.' && item.type === 'success'));

elements.configurationSearch.value = 'consulta anterior';
const tabHandler = elements.configurationTabs.listeners.get('click')[0];
tabHandler({ target: { closest: () => ({ dataset: { configSection: 'diagnostic' } }) } });
assert.equal(elements.configurationSearch.value, '');
assert.equal(feature.section, 'diagnostic');
assert.equal(diagnosticRenders, 1);
assert.equal(elements.newConfigurationButton.classList.contains('hidden'), true);
assert.equal(elements.configurationSearch.wrapper.classList.contains('hidden'), true);
feature.section = 'backups';
feature.render();
assert.equal(backupRenders, 1);
feature.section = 'users';
feature.render();
assert.equal(elements.newConfigurationButton.classList.contains('hidden'), true);
assert.equal(elements.configurationSearch.wrapper.classList.contains('hidden'), false);

console.log('✓ Feature modular de Configurações e Usuários aprovada: arquitetura, tabs, busca, schemas, CRUD, rollback e RBAC visual.');
