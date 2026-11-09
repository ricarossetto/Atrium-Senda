import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEmailIntegrationFeature } from '../js/features/email-integration.js';

const moduleSource = readFileSync(new URL('../js/features/email-integration.js', import.meta.url), 'utf8');
const portalSource = readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
assert.match(moduleSource, /export function createEmailIntegrationFeature/);
assert.doesNotMatch(moduleSource, /^\s*import\s/m);
assert.doesNotMatch(moduleSource, /portal\.js|features\/publications|createPublicationsFeature/);
assert.doesNotMatch(moduleSource, /\bfetch\s*\(/);
assert.doesNotMatch(moduleSource, /localStorage|sessionStorage|\bstore\.|\baudit\s*\(/);
assert.doesNotMatch(moduleSource, /console[^\n]*password|password[^\n]*console/i);
assert.doesNotMatch(moduleSource, /\/api\/(?:publications|intimations)\/email|setInterval|setTimeout\([^,]+,\s*\d+\s*\*\s*60/);
for (const contract of [
  /loadEmailStatus\(\) \{ return getEmailIntegrationFeature\(\)\.loadStatus\(\); \}/,
  /submitEmailConfig\(event\) \{ return getEmailIntegrationFeature\(\)\.submitConfig\(event\); \}/,
  /submitEmailReceiver\(event\) \{ return getEmailIntegrationFeature\(\)\.submitReceiver\(event\); \}/,
  /deleteEmailReceiver\(id\) \{ return getEmailIntegrationFeature\(\)\.deleteReceiver\(id\); \}/
]) assert.match(portalSource, contract);
assert.doesNotMatch(portalSource, /secureFetch\('\/api\/integrations\/email\/(?:status|configure|test|receivers)'/);

function makeClassList(initial = []) {
  const values = new Set(initial);
  return {
    add: (...names) => names.forEach(name => values.add(name)),
    remove: (...names) => names.forEach(name => values.delete(name)),
    toggle: (name, force) => {
      const enabled = force === undefined ? !values.has(name) : Boolean(force);
      if (enabled) values.add(name); else values.delete(name);
      return enabled;
    },
    contains: name => values.has(name)
  };
}

function makeElement({ hidden = false } = {}) {
  const listeners = new Map();
  return {
    listeners,
    classList: makeClassList(hidden ? ['hidden'] : []),
    className: '', textContent: '', innerHTML: '', value: '', placeholder: '', required: false,
    checked: false, disabled: false, selectedIndex: -1, clicks: 0,
    addEventListener(type, handler) { (listeners.get(type) || listeners.set(type, []).get(type)).push(handler); },
    click() { this.clicks++; },
    focus() { this.focused = true; }
  };
}

const ids = [
  'btnConfigureEmail', 'emailConfigClose', 'emailConfigCancel', 'emailConfigBackdrop', 'emailConfigForm',
  'btnTestEmail', 'emailTestClose', 'emailTestCancel', 'emailTestBackdrop', 'emailTestForm',
  'btnAddEmailReceiver', 'emailReceiverModalClose', 'receiverCancelBtn', 'emailReceiverModalBackdrop',
  'receiverTypeInternal', 'receiverTypeExternal', 'receiverInternalFields', 'receiverExternalFields',
  'emailReceiverForm', 'emailReceiversList', 'emailIntegrationStatus', 'emailIntegrationDetail',
  'emailHostInput', 'emailPortInput', 'emailSecureInput', 'emailUserInput', 'emailPasswordInput',
  'emailFromNameInput', 'emailFromAddressInput', 'emailConfigSubmitBtn', 'emailTestRecipientInput',
  'emailTestSubmitBtn', 'emailReceiversSection', 'emailReceiversCount', 'emailReceiverModalTitle',
  'receiverIdInput', 'receiverEditTypeInput', 'receiverTypeSelectorContainer', 'receiverUserSelect',
  'receiverNameInput', 'receiverEmailInput', 'receiverEnabledInput', 'receiverSubmitBtn', 'modalBackdrop',
  'btnTestAtriumMail', 'btnAddExternalRecipient', 'btnConfigureMailPreferences', 'mailPreferencesClose',
  'mailPreferencesCancel', 'mailPreferencesBackdrop', 'mailPreferencesForm', 'atriumMailToggleCheckbox',
  'atriumMailToggleLabel', 'atriumMailSwitchContainer', 'atriumMailTodayCount', 'atriumMailMonthCount',
  'atriumMailQueueCount', 'mailPrefPublication', 'mailPrefDeadline', 'mailPrefHearing', 'mailPrefMovements', 'mailPrefSyncFailed', 'mailPrefCertificate', 'mailPrefSyncFailedField', 'mailPrefCertificateField', 'mailPreferencesSubmit', 'mailPreferencesFeedback'
];
const hiddenIds = new Set(['emailConfigBackdrop', 'emailTestBackdrop', 'emailReceiverModalBackdrop', 'modalBackdrop']);
const elements = Object.fromEntries(ids.map(id => [id, makeElement({ hidden: hiddenIds.has(id) })]));
const documentRef = { getElementById: id => elements[id] || null, body: { style: { overflow: '' } } };
const windowRef = { console: { error() {} } };

let currentUser = { id: 'admin-synthetic', role: 'master_admin', email: 'personal-address@example.test' };
let statusPayload = { configured: true, stats: { enabled: true, sentToday: 1, sentMonth: 2, queue: { QUEUED: 0 } }, limits: { daily: 100, monthly: 3000 } };
let statusFailure = false;
let receiversPayload = [{ id: 'receiver-1', type: 'external', name: 'Destinatária Sintética', email: 'receiver@example.test', enabled: true }];
let confirmResult = true;
let closeConfirmResult = false;
const confirmMessages = [];
const requests = [];
const toasts = [];
let preferencePayload = [
  { event_type: 'PUBLICATION_NEW', cadence: 'SYNC_DIGEST', enabled: true },
  { event_type: 'DEADLINE_CRITICAL', cadence: 'IMMEDIATE', enabled: true },
  { event_type: 'HEARING_NEW', cadence: 'DAILY', enabled: true },
  { event_type: 'MOVEMENT_NEW', cadence: 'BULLETINS', enabled: true }
];
let preferenceFailure = null;
let savedPreferenceFailure = null;
let pendingPreferenceReply = null;
const response = (body = {}, ok = true) => ({ ok, async json() { return structuredClone(body); } });
const secureFetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : undefined;
  requests.push({ url, method, body });
  if (url === '/api/admin/mail/status') {
    if (statusFailure) throw new Error('Falha sintética de status');
    return response(statusPayload);
  }
  if (url === '/api/auth/users') return response({ users: [
    { id: 'user-active', displayName: 'Usuária Ativa', email: 'active@example.test', status: 'active' },
    { id: 'user-inactive', displayName: 'Usuária Inativa', email: 'inactive@example.test', status: 'inactive' }
  ] });
  if (url === '/api/admin/mail/recipients' && method === 'GET') return response({ recipients: receiversPayload });
  if (url === '/api/admin/mail/test') return response({ ok: true, message: 'Teste sintético enviado.' });
  if (url === '/api/admin/mail/recipients' && method === 'POST') return response({ ok: true });
  if (url.startsWith('/api/admin/mail/recipients/')) return response({ ok: true });
  if (url === '/api/user/notification-preferences' && method === 'GET') return preferenceFailure
    ? response({ message: preferenceFailure }, false) : response({ preferences: preferencePayload });
  if (url === '/api/user/notification-preferences' && method === 'PUT' && pendingPreferenceReply) return pendingPreferenceReply;
  if (url === '/api/user/notification-preferences' && method === 'PUT') return savedPreferenceFailure
    ? response({ message: savedPreferenceFailure }, false) : response({ ok: true });
  if (url === '/api/integrations/email/configure') return response({ ok: true });
  return response({ ok: true });
};

const feature = createEmailIntegrationFeature({
  documentRef,
  windowRef,
  secureFetch,
  escapeHtml: value => String(value ?? '').replaceAll('<', '&lt;'),
  showToast: (message, type) => toasts.push({ message, type }),
  getCurrentUser: () => currentUser,
  getOfficeName: () => 'Escritório Local Sintético',
  confirmFn: message => { confirmMessages.push(message); return confirmResult; }
});

assert.equal(feature.init(), true);
assert.equal(feature.init(), false);
const expectedListeners = [
  ['btnConfigureEmail', 'click'], ['emailConfigClose', 'click'], ['emailConfigCancel', 'click'], ['emailConfigBackdrop', 'click'], ['emailConfigForm', 'submit'],
  ['btnTestEmail', 'click'], ['emailTestClose', 'click'], ['emailTestCancel', 'click'], ['emailTestBackdrop', 'click'], ['emailTestForm', 'submit'],
  ['btnConfigureMailPreferences', 'click'], ['mailPreferencesClose', 'click'], ['mailPreferencesCancel', 'click'], ['mailPreferencesBackdrop', 'click'], ['mailPreferencesForm', 'submit'],
  ['btnAddEmailReceiver', 'click'], ['emailReceiverModalClose', 'click'], ['receiverCancelBtn', 'click'], ['emailReceiverModalBackdrop', 'click'],
  ['receiverTypeInternal', 'change'], ['receiverTypeExternal', 'change'], ['emailReceiverForm', 'submit'], ['emailReceiversList', 'click']
];
for (const [id, type] of expectedListeners) assert.equal(elements[id].listeners.get(type)?.length, 1, `${id} deve possuir um listener ${type}.`);

let status = await feature.loadStatus();
assert.equal(status.configured, true);
assert.equal(elements.emailIntegrationStatus.textContent, 'Ativo');
assert.equal(elements.emailIntegrationStatus.className, 'status-chip connected');
assert.match(elements.emailIntegrationDetail.textContent, /E-mail conectado[\s\S]*Notificações automáticas ativas/);
assert.equal(elements.btnTestAtriumMail.classList.contains('hidden'), false);
assert.equal(await feature.openPreferencesDrawer(), true);
assert.equal(elements.mailPrefHearing.value, 'BULLETINS');
assert.equal(elements.mailPrefMovements.value, 'BULLETINS');
assert.equal(await feature.savePreferences({ preventDefault() {} }), true);
assert.deepEqual(requests.find(request => request.url === '/api/user/notification-preferences' && request.method === 'PUT').body.preferences, [
  { eventType: 'PUBLICATION_NEW', cadence: 'BULLETINS', enabled: true },
  { eventType: 'DEADLINE_CRITICAL', cadence: 'BULLETINS', enabled: true },
  { eventType: 'HEARING_NEW', cadence: 'BULLETINS', enabled: true },
  { eventType: 'MOVEMENT_NEW', cadence: 'BULLETINS', enabled: true },
  { eventType: 'SYNC_FAILED', cadence: 'BULLETINS', enabled: true },
  { eventType: 'A1_CERT_EXPIRING', cadence: 'BULLETINS', enabled: true }
]);
preferencePayload = [
  { event_type: 'PUBLICATION_NEW', cadence: 'BULLETINS', enabled: false },
  { event_type: 'DEADLINE_CRITICAL', cadence: 'DISABLED', enabled: true },
  { event_type: 'HEARING_NEW', cadence: 'UNSUPPORTED_FUTURE', enabled: true },
  { event_type: 'MOVEMENT_NEW', cadence: 'BULLETINS', enabled: 0 },
  { event_type: 'PASSWORD_RESET', cadence: 'IMMEDIATE', enabled: true },
  { event_type: 'SYSTEM_TEST', cadence: 'IMMEDIATE', enabled: true }
];
await feature.openPreferencesDrawer();
assert.equal(elements.mailPrefPublication.value, 'DISABLED');
assert.equal(elements.mailPrefDeadline.value, 'DISABLED');
assert.equal(elements.mailPrefHearing.value, 'DISABLED');
assert.equal(elements.mailPrefMovements.value, 'DISABLED');
assert.match(elements.mailPreferencesFeedback.textContent, /preservadas/);
await feature.savePreferences();
let lastPreferences = requests.filter(item => item.method === 'PUT').at(-1).body.preferences;
assert.equal(lastPreferences.some(item => item.eventType === 'HEARING_NEW'), false);
assert.equal(lastPreferences.some(item => ['PASSWORD_RESET', 'SYSTEM_TEST'].includes(item.eventType)), false);
assert.deepEqual(lastPreferences.find(item => item.eventType === 'PUBLICATION_NEW'), { eventType: 'PUBLICATION_NEW', cadence: 'DISABLED', enabled: false });
await feature.openPreferencesDrawer();
elements.mailPrefHearing.value = 'BULLETINS';
elements.mailPrefHearing.listeners.get('change')[0]();
await feature.savePreferences();
assert.deepEqual(requests.filter(item => item.method === 'PUT').at(-1).body.preferences.find(item => item.eventType === 'HEARING_NEW'), { eventType: 'HEARING_NEW', cadence: 'BULLETINS', enabled: true });
currentUser = { role: 'collaborator' };
await feature.openPreferencesDrawer();
assert.equal(elements.mailPrefSyncFailedField.hidden, true);
assert.equal(elements.mailPrefCertificateField.hidden, true);
await feature.savePreferences();
assert.equal(requests.filter(item => item.method === 'PUT').at(-1).body.preferences.some(item => ['SYNC_FAILED', 'A1_CERT_EXPIRING'].includes(item.eventType)), false);
currentUser = { role: 'admin' };
await feature.openPreferencesDrawer();
assert.equal(elements.mailPrefSyncFailedField.hidden, false);
currentUser = { role: 'master_admin', email: 'personal-address@example.test' };
for (const failure of ['Falha sintética HTTP 500', 'Conflito sintético HTTP 409']) {
  savedPreferenceFailure = failure;
  await feature.openPreferencesDrawer();
  elements.mailPrefPublication.value = 'DISABLED';
  const successes = toasts.filter(item => item.type === 'success').length;
  assert.equal(await feature.savePreferences(), false);
  assert.equal(elements.mailPreferencesBackdrop.classList.contains('hidden'), false);
  assert.equal(elements.mailPrefPublication.value, 'DISABLED');
  assert.equal(elements.mailPreferencesFeedback.textContent, failure);
  assert.equal(toasts.filter(item => item.type === 'success').length, successes);
}
savedPreferenceFailure = null;
assert.equal(await feature.savePreferences(), true);
let releasePreferenceReply;
pendingPreferenceReply = new Promise(resolve => { releasePreferenceReply = resolve; });
await feature.openPreferencesDrawer();
const pendingSave = feature.savePreferences();
const pendingRequestCount = requests.length;
assert.equal(elements.mailPreferencesSubmit.disabled, true);
assert.equal(await feature.savePreferences(), false);
assert.equal(requests.length, pendingRequestCount);
assert.equal(feature.closePreferencesDrawer(), false);
assert.equal(elements.mailPreferencesBackdrop.classList.contains('hidden'), false);
releasePreferenceReply(response({ ok: true }));
assert.equal(await pendingSave, true);
pendingPreferenceReply = null;
preferenceFailure = 'Leitura indisponível';
await feature.openPreferencesDrawer();
const beforeFailedReadSave = requests.length;
assert.equal(elements.mailPreferencesSubmit.disabled, true);
assert.equal(await feature.savePreferences(), false);
assert.equal(requests.length, beforeFailedReadSave);
preferenceFailure = null;
preferencePayload = [];
await feature.openPreferencesDrawer();
assert.equal(elements.mailPrefPublication.value, 'BULLETINS');
assert.equal(elements.mailPrefHearing.value, 'BULLETINS');
assert.equal(feature.receivers.length, 1);
assert.match(elements.emailReceiversList.innerHTML, /Destinatária Sintética/);
assert.match(elements.emailReceiversList.innerHTML, /receiver@example\.test/);
assert.match(elements.emailReceiversList.innerHTML, />Ativo</);

statusPayload = { configured: false, stats: { enabled: false, queue: {} }, limits: { daily: 100, monthly: 3000 } };
status = await feature.loadStatus();
assert.equal(status.configured, false);
assert.equal(elements.emailIntegrationStatus.textContent, 'Desativado');
statusFailure = true;
assert.equal(await feature.loadStatus(), null);
assert.equal(elements.emailIntegrationStatus.textContent, 'Indisponível');
assert.equal(elements.emailIntegrationStatus.className, 'status-chip muted');
statusFailure = false;

elements.emailTestRecipientInput.value = '';
feature.openTestModal();
assert.equal(elements.emailTestRecipientInput.value, 'personal-address@example.test', 'O teste restrito ao master deve sugerir o e-mail da própria conta autenticada.');
elements.emailTestRecipientInput.value = 'explicit-recipient@example.test';
assert.equal(await feature.submitTest({ preventDefault() {} }), true);
assert.deepEqual(requests.find(request => request.url === '/api/admin/mail/test').body, { recipient: 'explicit-recipient@example.test' });
assert.equal(elements.emailTestSubmitBtn.disabled, false);

currentUser = { role: 'collaborator' };
const beforeCollaboratorRequests = requests.length;
assert.deepEqual(await feature.loadReceivers(), []);
assert.equal(requests.length, beforeCollaboratorRequests, 'Colaborador não deve solicitar a lista administrativa.');
assert.equal(elements.emailReceiversSection.classList.contains('hidden'), true);
assert.equal(elements.btnAddExternalRecipient.classList.contains('hidden'), true);
currentUser = { role: 'master_admin' };
await feature.loadReceivers();
assert.equal(elements.emailReceiversSection.classList.contains('hidden'), false);

await feature.openReceiverModal();
elements.receiverIdInput.value = '';
elements.receiverNameInput.value = 'Externa Sintética';
elements.receiverEmailInput.value = 'external@example.test';
elements.receiverEnabledInput.checked = true;
assert.equal(await feature.submitReceiver({ preventDefault() {} }), true);
const createExternal = requests.find(request => request.url === '/api/admin/mail/recipients' && request.method === 'POST' && request.body?.email === 'external@example.test');
assert.deepEqual(createExternal.body, { enabled: true, name: 'Externa Sintética', email: 'external@example.test' });

elements.receiverIdInput.value = 'receiver-edit';
elements.receiverEditTypeInput.value = 'external';
elements.receiverNameInput.value = 'Externa Editada';
elements.receiverEmailInput.value = 'edited@example.test';
elements.receiverEnabledInput.checked = false;
assert.equal(await feature.submitReceiver({ preventDefault() {} }), true);
assert.deepEqual(requests.find(request => request.url.endsWith('/receiver-edit') && request.method === 'PATCH').body, {
  enabled: false, name: 'Externa Editada', email: 'edited@example.test'
});

await feature.toggleReceiver('receiver-toggle', true);
assert.deepEqual(requests.find(request => request.url.endsWith('/receiver-toggle')).body, { enabled: true });
confirmResult = false;
const beforeCancelledDelete = requests.length;
await feature.deleteReceiver('receiver-delete');
assert.equal(requests.length, beforeCancelledDelete, 'Cancelamento da confirmação deve gerar zero requests.');
confirmResult = true;
await feature.deleteReceiver('receiver-delete');
assert.equal(requests.find(request => request.url.endsWith('/receiver-delete')).method, 'DELETE');

assert.equal(requests.some(request => request.url.includes('/api/publications/email') || request.url.includes('/api/intimations/email')), false);

// Cancelamento de step-up no envio de teste: fecha o modal Mail para o prompt não
// ficar encoberto e restaura-o com o destinatário digitado, sem sucesso presumido.
{
  const cancelElements = Object.fromEntries(ids.map(id => [id, makeElement({ hidden: hiddenIds.has(id) })]));
  cancelElements.emailTestRecipientInput.value = 'digitado@example.test';
  const cancelToasts = [];
  let closedBeforeRequest = null;
  const cancelFeature = createEmailIntegrationFeature({
    documentRef: { getElementById: id => cancelElements[id] || null, body: { style: { overflow: '' } } },
    windowRef,
    escapeHtml: value => String(value ?? '').replaceAll('<', '&lt;'),
    showToast: (message, type) => cancelToasts.push({ message, type }),
    getCurrentUser: () => ({ role: 'master_admin', email: 'master@example.test' }),
    confirmFn: () => true,
    withReauth: async exec => {
      closedBeforeRequest = cancelElements.emailTestBackdrop.classList.contains('hidden');
      const response = await exec({});
      response.reauthCancelled = true;
      return response;
    },
    secureFetch: async (url, options = {}) => {
      if (url === '/api/admin/mail/test') return response({ code: 'REAUTH_REQUIRED', message: 'Ação exige reautenticação.' }, false);
      return response({ ok: true });
    }
  });
  cancelFeature.openTestModal();
  assert.equal(cancelElements.emailTestRecipientInput.value, 'master@example.test');
  cancelElements.emailTestRecipientInput.value = 'digitado@example.test';
  assert.equal(await cancelFeature.submitTest({ preventDefault() {} }), false);
  assert.equal(closedBeforeRequest, true, 'modal Mail deve fechar antes do prompt de step-up');
  assert.equal(cancelElements.emailTestBackdrop.classList.contains('hidden'), false, 'cancelamento restaura o modal de teste');
  assert.equal(cancelElements.emailTestRecipientInput.value, 'digitado@example.test', 'restauração preserva o destinatário digitado');
  assert.equal(cancelToasts.some(item => item.type === 'success'), false, 'cancelamento não anuncia sucesso');
  assert.ok(cancelToasts.some(item => item.type === 'warning'), 'cancelamento é informado como aviso neutro');
}

console.log('✓ Feature modular de ATRIUM Mail aprovada: Resend, preferências, teste explícito, receivers e RBAC.');
