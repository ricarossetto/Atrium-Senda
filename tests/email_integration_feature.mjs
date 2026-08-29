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
  'receiverNameInput', 'receiverEmailInput', 'receiverEnabledInput', 'receiverSubmitBtn', 'modalBackdrop'
];
const hiddenIds = new Set(['emailConfigBackdrop', 'emailTestBackdrop', 'emailReceiverModalBackdrop', 'modalBackdrop']);
const elements = Object.fromEntries(ids.map(id => [id, makeElement({ hidden: hiddenIds.has(id) })]));
const documentRef = { getElementById: id => elements[id] || null, body: { style: { overflow: '' } } };
const windowRef = { console: { error() {} } };

let currentUser = { id: 'admin-synthetic', role: 'master_admin', email: 'personal-address@example.test' };
let statusPayload = {
  configured: true, host: 'smtp.example.test', port: 465, secure: true, userMasked: 'us***@example.test',
  fromName: 'Escritório Sintético', fromAddress: 'office@example.test', lastTestAt: '2026-08-29T12:00:00.000Z', lastTestStatus: 'success'
};
let statusFailure = false;
let receiversPayload = [{ id: 'receiver-1', type: 'external', name: 'Destinatária Sintética', email: 'receiver@example.test', enabled: true }];
let confirmResult = true;
const requests = [];
const toasts = [];
const response = (body = {}, ok = true) => ({ ok, async json() { return structuredClone(body); } });
const secureFetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : undefined;
  requests.push({ url, method, body });
  if (url === '/api/integrations/email/status') {
    if (statusFailure) throw new Error('Falha sintética de status');
    return response({ status: statusPayload });
  }
  if (url === '/api/auth/users') return response({ users: [
    { id: 'user-active', displayName: 'Usuária Ativa', email: 'active@example.test', status: 'active' },
    { id: 'user-inactive', displayName: 'Usuária Inativa', email: 'inactive@example.test', status: 'inactive' }
  ] });
  if (url === '/api/integrations/email/receivers' && method === 'GET') return response({ receivers: receiversPayload });
  if (url === '/api/integrations/email/test') return response({ ok: true, message: 'Teste sintético enviado.' });
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
  confirmFn: message => {
    assert.equal(message, 'Remover este destinatário das notificações de publicações?');
    return confirmResult;
  }
});

assert.equal(feature.init(), true);
assert.equal(feature.init(), false);
const expectedListeners = [
  ['btnConfigureEmail', 'click'], ['emailConfigClose', 'click'], ['emailConfigCancel', 'click'], ['emailConfigBackdrop', 'click'], ['emailConfigForm', 'submit'],
  ['btnTestEmail', 'click'], ['emailTestClose', 'click'], ['emailTestCancel', 'click'], ['emailTestBackdrop', 'click'], ['emailTestForm', 'submit'],
  ['btnAddEmailReceiver', 'click'], ['emailReceiverModalClose', 'click'], ['receiverCancelBtn', 'click'], ['emailReceiverModalBackdrop', 'click'],
  ['receiverTypeInternal', 'change'], ['receiverTypeExternal', 'change'], ['emailReceiverForm', 'submit'], ['emailReceiversList', 'click']
];
for (const [id, type] of expectedListeners) assert.equal(elements[id].listeners.get(type)?.length, 1, `${id} deve possuir um listener ${type}.`);

let status = await feature.loadStatus();
assert.equal(status.configured, true);
assert.equal(elements.emailIntegrationStatus.textContent, 'SMTP conectado');
assert.equal(elements.emailIntegrationStatus.className, 'status-chip connected');
assert.match(elements.emailIntegrationDetail.textContent, /smtp\.example\.test:465[\s\S]*office@example\.test[\s\S]*Sucesso/);
assert.equal(elements.btnConfigureEmail.textContent, 'Reconfigurar SMTP');
assert.equal(elements.btnTestEmail.classList.contains('hidden'), false);
assert.equal(feature.receivers.length, 1);
assert.match(elements.emailReceiversList.innerHTML, /Destinatária Sintética/);
assert.match(elements.emailReceiversList.innerHTML, /receiver@example\.test/);
assert.match(elements.emailReceiversList.innerHTML, />Ativo</);

statusPayload = { configured: false };
status = await feature.loadStatus();
assert.equal(status.configured, false);
assert.equal(elements.emailIntegrationStatus.textContent, 'Não configurado');
assert.equal(elements.btnConfigureEmail.textContent, 'Configurar SMTP');
assert.equal(elements.btnTestEmail.classList.contains('hidden'), true);
statusFailure = true;
assert.equal(await feature.loadStatus(), null);
assert.equal(elements.emailIntegrationStatus.textContent, 'Erro ao verificar');
assert.equal(elements.emailIntegrationStatus.className, 'status-chip danger');
statusFailure = false;

statusPayload = {
  configured: true, host: 'smtp.config.example.test', port: 587, secure: false, userMasked: 'co***@example.test',
  fromName: '', fromAddress: 'configured@example.test'
};
elements.emailPasswordInput.value = 'must-be-cleared-before-open';
assert.equal(await feature.openConfigModal(), true);
assert.equal(elements.emailHostInput.value, 'smtp.config.example.test');
assert.equal(elements.emailPortInput.value, 587);
assert.equal(elements.emailSecureInput.checked, false);
assert.equal(elements.emailUserInput.value, 'co***@example.test');
assert.equal(elements.emailPasswordInput.value, '');
assert.equal(elements.emailPasswordInput.required, false);
assert.equal(elements.emailFromNameInput.value, 'Escritório Local Sintético');
assert.equal(elements.emailConfigBackdrop.classList.contains('hidden'), false);

Object.assign(elements.emailHostInput, { value: 'smtp.submit.example.test' });
Object.assign(elements.emailPortInput, { value: '465' });
Object.assign(elements.emailSecureInput, { checked: true });
Object.assign(elements.emailUserInput, { value: 'smtp-user@example.test' });
Object.assign(elements.emailPasswordInput, { value: 'Transient-SMTP-Password-Only' });
Object.assign(elements.emailFromNameInput, { value: 'Remetente Sintético' });
Object.assign(elements.emailFromAddressInput, { value: 'sender@example.test' });
assert.equal(await feature.submitConfig({ preventDefault() {} }), true);
const configRequest = requests.find(request => request.url === '/api/integrations/email/configure');
assert.deepEqual(configRequest, {
  url: '/api/integrations/email/configure', method: 'POST',
  body: {
    host: 'smtp.submit.example.test', port: 465, secure: true, user: 'smtp-user@example.test',
    password: 'Transient-SMTP-Password-Only', fromName: 'Remetente Sintético', fromAddress: 'sender@example.test'
  }
});
assert.equal(elements.emailPasswordInput.value, '', 'Senha SMTP deve sair do DOM ao concluir/fechar o modal.');
assert.equal(elements.emailConfigSubmitBtn.disabled, false);
assert.equal(elements.emailConfigSubmitBtn.textContent, 'Salvar e Validar Conexão');

elements.emailTestRecipientInput.value = '';
feature.openTestModal();
assert.equal(elements.emailTestRecipientInput.value, '', 'Modal de teste não pode preencher endereço pessoal automaticamente.');
elements.emailTestRecipientInput.value = 'explicit-recipient@example.test';
assert.equal(await feature.submitTest({ preventDefault() {} }), true);
assert.deepEqual(requests.find(request => request.url === '/api/integrations/email/test').body, { recipient: 'explicit-recipient@example.test' });
assert.equal(elements.emailTestSubmitBtn.disabled, false);

currentUser = { role: 'collaborator' };
const beforeCollaboratorRequests = requests.length;
assert.deepEqual(await feature.loadReceivers(), []);
assert.equal(requests.length, beforeCollaboratorRequests, 'Colaborador não deve solicitar a lista administrativa.');
assert.equal(elements.emailReceiversSection.classList.contains('hidden'), true);
assert.equal(elements.btnAddEmailReceiver.classList.contains('hidden'), true);
currentUser = { role: 'admin' };
await feature.loadReceivers();
assert.equal(elements.emailReceiversSection.classList.contains('hidden'), false);

await feature.openReceiverModal();
assert.match(elements.receiverUserSelect.innerHTML, /user-active[\s\S]*Usuária Ativa/);
assert.doesNotMatch(elements.receiverUserSelect.innerHTML, /user-inactive/);
elements.receiverIdInput.value = '';
elements.receiverTypeInternal.checked = true;
elements.receiverUserSelect.value = 'user-active';
elements.receiverEnabledInput.checked = true;
assert.equal(await feature.submitReceiver({ preventDefault() {} }), true);
const createInternal = requests.find(request => request.url === '/api/integrations/email/receivers' && request.method === 'POST' && request.body?.type === 'internal');
assert.deepEqual(createInternal.body, { type: 'internal', enabled: true, userId: 'user-active' });

elements.receiverIdInput.value = '';
elements.receiverTypeInternal.checked = false;
elements.receiverNameInput.value = 'Externa Sintética';
elements.receiverEmailInput.value = 'external@example.test';
elements.receiverEnabledInput.checked = true;
assert.equal(await feature.submitReceiver({ preventDefault() {} }), true);
const createExternal = requests.find(request => request.url === '/api/integrations/email/receivers' && request.method === 'POST' && request.body?.type === 'external');
assert.deepEqual(createExternal.body, { type: 'external', enabled: true, name: 'Externa Sintética', email: 'external@example.test' });

elements.receiverIdInput.value = 'receiver-edit';
elements.receiverEditTypeInput.value = 'external';
elements.receiverNameInput.value = 'Externa Editada';
elements.receiverEmailInput.value = 'edited@example.test';
elements.receiverEnabledInput.checked = false;
assert.equal(await feature.submitReceiver({ preventDefault() {} }), true);
assert.deepEqual(requests.find(request => request.url.endsWith('/receiver-edit') && request.method === 'PATCH').body, {
  enabled: false, name: 'Externa Editada', email: 'edited@example.test'
});

assert.equal(await feature.toggleReceiver('receiver-toggle', true), true);
assert.deepEqual(requests.find(request => request.url.endsWith('/receiver-toggle')).body, { enabled: false });
confirmResult = false;
const beforeCancelledDelete = requests.length;
assert.equal(await feature.deleteReceiver('receiver-delete'), false);
assert.equal(requests.length, beforeCancelledDelete, 'Cancelamento da confirmação deve gerar zero requests.');
confirmResult = true;
assert.equal(await feature.deleteReceiver('receiver-delete'), true);
assert.equal(requests.find(request => request.url.endsWith('/receiver-delete')).method, 'DELETE');

assert.equal(requests.some(request => request.url.includes('/api/publications/email') || request.url.includes('/api/intimations/email')), false);
assert.equal(toasts.some(item => String(item.message).includes('Transient-SMTP-Password-Only')), false, 'Senha SMTP não pode entrar em toast/log/audit.');
console.log('✓ Feature modular de Integração de E-mail aprovada: arquitetura, status, configuração, teste explícito, receivers, RBAC e segredo transitório.');
