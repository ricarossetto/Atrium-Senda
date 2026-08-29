import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSystemAdminFeature } from '../js/features/system-admin.js';

const moduleSource = readFileSync(new URL('../js/features/system-admin.js', import.meta.url), 'utf8');
const portalSource = readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
assert.match(moduleSource, /export function createSystemAdminFeature/);
assert.doesNotMatch(moduleSource, /^\s*import\s/m);
assert.doesNotMatch(moduleSource, /portal\.js|configuration\.js/);
assert.match(portalSource, /renderDiagnostic\(\) \{ return getSystemAdminFeature\(\)\.renderDiagnostic\(\); \}/);
assert.match(portalSource, /renderBackups\(\) \{ return getSystemAdminFeature\(\)\.renderBackups\(\); \}/);
assert.doesNotMatch(portalSource, /HMAC-SHA256|btnCreateBackupNow'\)\?\.addEventListener|fetch\('\/api\/system\/diagnostic'/);

function makeElement() {
  const listeners = new Map();
  return {
    innerHTML: '', textContent: '', value: '', files: [], listeners,
    addEventListener(type, handler) { (listeners.get(type) || listeners.set(type, []).get(type)).push(handler); }
  };
}

const elementIds = [
  'configurationList', 'btnExportDiagnosticJson', 'btnOpenFeedbackModal', 'btnClearUiCache', 'btnResetVisualPrefs',
  'btnRebuildRuntime', 'btnManagePortalSessions', 'btnCreateBackupNow', 'inputRestoreBackup'
];
const elements = Object.fromEntries(elementIds.map(id => [id, makeElement()]));
const anchors = [];
const documentRef = {
  getElementById: id => elements[id] || null,
  createElement(tag) {
    assert.equal(tag, 'a');
    const anchor = { href: '', download: '', clicks: 0, click() { this.clicks++; } };
    anchors.push(anchor);
    return anchor;
  }
};

function createLocalStorage(entries) {
  const values = new Map(entries);
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    snapshot() { return Object.fromEntries(values); }
  };
}

const localStorage = createLocalStorage([
  ['atrium:cache:dashboard', 'cache'], ['atrium:cache:diagnostic', 'cache'], ['atrium_theme', 'light'],
  ['jurisflow_theme', 'light'], ['atrium_sidebar_collapsed', 'true'], ['atrium_tour_seen', 'true'],
  ['jurisflow_tour_seen', 'true'], ['atrium_ui_mode_future', 'classic'], ['legal-record-synthetic', 'preserve']
]);
const revokedUrls = [];
let createdUrls = 0;
let reloads = 0;
let confirmResult = true;
const windowRef = {
  localStorage,
  Blob,
  URL: {
    createObjectURL(blob) { assert.ok(blob instanceof Blob); return `blob:synthetic-${++createdUrls}`; },
    revokeObjectURL(url) { revokedUrls.push(url); }
  },
  location: { href: '', reload() { reloads++; } },
  confirm: () => confirmResult,
  setTimeout(callback, delay) { assert.equal(delay, 1200); callback(); return 1; }
};
const store = {
  serverMeta: { appVersion: '2.0.0-synthetic', buildId: 'build-synthetic', schemaVersion: 9 },
  stateStatus: 'READY',
  state: { processes: [{ id: 'must-not-send' }], contacts: [{ id: 'must-not-send' }] }
};
const toasts = [];
const modalCalls = [];
const secureRequests = [];
let closedModals = 0;
let selectedView = '';
let selectedTheme = '';
let secureResponses = new Map();
const secureFetch = async (url, options = {}) => {
  secureRequests.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
  const response = secureResponses.get(url);
  if (response instanceof Error) throw response;
  return response || { ok: true, async json() { return { ok: true }; } };
};

const diagnostic = {
  app: { name: 'ATRIUM Sintético', version: '2.0.0', uptimeSeconds: 600, nodeVersion: '24.0.0', platform: 'synthetic', arch: 'x64', cloudMode: false },
  storage: { type: 'Estado Cifrado Sintético', records: { contacts: 2, processes: 3, tasks: 4, intimations: 5 }, sizeBytes: 2048 },
  security: { encryption: 'AES-256-GCM', twoFactor: 'TOTP RFC 6238', totalUsers: 2 },
  integrations: {
    djen: { status: 'conectado', description: 'DJEN sintético' }, datajud: { status: 'configurado' },
    gemini: { status: 'não configurado' }, collector: { lastRun: null }
  }
};
let resolveDiagnostic;
let diagnosticRequest;
const fetchFn = (url, options) => {
  diagnosticRequest = { url, options };
  return new Promise(resolve => { resolveDiagnostic = resolve; });
};
const feature = createSystemAdminFeature({
  store,
  documentRef,
  windowRef,
  secureFetch,
  fetchFn,
  escapeHtml: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  showToast: (message, type) => toasts.push({ message, type }),
  openModal: (...args) => modalCalls.push(args),
  closeModal: () => { closedModals++; },
  setTheme: theme => { selectedTheme = theme; },
  switchView: view => { selectedView = view; }
});

const diagnosticPromise = feature.renderDiagnostic();
assert.match(elements.configurationList.innerHTML, /Consultando diagnóstico/);
resolveDiagnostic({ async json() { return { ok: true, diagnostic }; } });
await diagnosticPromise;
assert.deepEqual(diagnosticRequest, { url: '/api/system/diagnostic', options: { credentials: 'same-origin' } });
for (const heading of ['Banco de Dados & Estado', 'Criptografia & Sessão', 'Tribunais & Coleta', 'Higiene de Dados']) assert.match(elements.configurationList.innerHTML, new RegExp(heading.replace('&', '&amp;|&')));
assert.match(elements.configurationList.innerHTML, /2\.0\.0-synthetic[\s\S]*build-synthetic[\s\S]*v9[\s\S]*READY/);
for (const id of ['btnExportDiagnosticJson', 'btnOpenFeedbackModal', 'btnClearUiCache', 'btnResetVisualPrefs', 'btnRebuildRuntime', 'btnManagePortalSessions']) {
  assert.equal(elements[id].listeners.get('click')?.length, 1, `${id} deve receber listener dinâmico.`);
}

feature.exportDiagnostic();
assert.equal(windowRef.location.href, '/api/system/diagnostic/export');
feature.clearUiCache();
let storageSnapshot = localStorage.snapshot();
assert.equal('atrium:cache:dashboard' in storageSnapshot, false);
assert.equal('atrium:cache:diagnostic' in storageSnapshot, false);
assert.equal(storageSnapshot['legal-record-synthetic'], 'preserve');
assert.deepEqual(store.state, { processes: [{ id: 'must-not-send' }], contacts: [{ id: 'must-not-send' }] });

feature.resetVisualPreferences();
storageSnapshot = localStorage.snapshot();
for (const key of ['atrium_theme', 'jurisflow_theme', 'atrium_sidebar_collapsed', 'atrium_tour_seen', 'jurisflow_tour_seen']) assert.equal(key in storageSnapshot, false);
assert.equal(storageSnapshot.atrium_ui_mode_future, 'classic');
assert.equal(storageSnapshot['legal-record-synthetic'], 'preserve');
assert.equal(selectedTheme, 'dark');

secureResponses.set('/api/system/rebuild-runtime', { ok: true, async json() { return { ok: true, message: 'Runtime sintético reconstruído.' }; } });
assert.equal(await feature.rebuildRuntime(), true);
assert.ok(toasts.some(item => item.message === 'Runtime sintético reconstruído.' && item.type === 'success'));
secureResponses.set('/api/system/rebuild-runtime', { ok: false, async json() { return { message: 'Falha sintética' }; } });
assert.equal(await feature.rebuildRuntime(), false);
assert.ok(toasts.some(item => item.message === 'Falha ao reconstruir dados derivados.' && item.type === 'error'));
feature.managePortalSessions();
assert.equal(selectedView, 'integrations');
assert.ok(toasts.some(item => item.message.includes('Limpar sessão local') && item.type === 'info'));

feature.renderBackups();
assert.match(elements.configurationList.innerHTML, /checksum SHA-256/);
assert.doesNotMatch(elements.configurationList.innerHTML, /HMAC-SHA256/);
assert.match(elements.configurationList.innerHTML, /AES-256-GCM/);
assert.equal(elements.btnCreateBackupNow.listeners.get('click')?.length, 1);
assert.equal(elements.inputRestoreBackup.listeners.get('change')?.length, 1);

const backupData = { format: 'atrium-encrypted-backup-v1', encryptedState: { iv: 'synthetic', tag: 'synthetic', ciphertext: 'synthetic' }, checksum: '0'.repeat(64) };
secureResponses.set('/api/system/backup/create', { ok: true, async json() { return { ok: true, fileName: 'backup-synthetic.atrium-backup', backupData }; } });
const createdBackup = await feature.createBackup();
assert.equal(createdBackup.fileName, 'backup-synthetic.atrium-backup');
assert.equal(anchors.at(-1).download, 'backup-synthetic.atrium-backup');
assert.equal(anchors.at(-1).clicks, 1);
assert.equal(revokedUrls.at(-1), 'blob:synthetic-1');
assert.deepEqual(secureRequests.find(request => request.url.endsWith('/backup/create')), { url: '/api/system/backup/create', method: 'POST', body: undefined });

const restoreInput = { value: 'selected' };
const restoreFile = { name: 'restore-synthetic.atrium-backup', async text() { return JSON.stringify(backupData); } };
confirmResult = false;
const restoreRequestsBeforeCancel = secureRequests.filter(request => request.url.endsWith('/backup/restore')).length;
assert.equal(await feature.restoreBackup(restoreFile, restoreInput), false);
assert.equal(restoreInput.value, '');
assert.equal(secureRequests.filter(request => request.url.endsWith('/backup/restore')).length, restoreRequestsBeforeCancel);

confirmResult = true;
const invalidFile = { name: 'invalid-synthetic.json', async text() { return '{'; } };
assert.equal(await feature.restoreBackup(invalidFile, { value: 'selected' }), false);
assert.equal(reloads, 0);
assert.ok(toasts.some(item => item.message.includes('Erro na restauração') && item.type === 'error'));

secureResponses.set('/api/system/backup/restore', { ok: true, async json() { return { ok: true }; } });
assert.equal(await feature.restoreBackup(restoreFile, { value: 'selected' }), true);
assert.equal(reloads, 1);
assert.deepEqual(secureRequests.find(request => request.url.endsWith('/backup/restore')).body, { backupData });
secureResponses.set('/api/system/backup/restore', { ok: false, async json() { return { message: 'Restore sintético rejeitado' }; } });
assert.equal(await feature.restoreBackup(restoreFile, { value: 'selected' }), false);
assert.equal(reloads, 1);

feature.openFeedbackModal();
const feedbackModal = modalCalls.at(-1);
assert.equal(feedbackModal[0], 'feedback');
assert.deepEqual(feedbackModal[3].map(field => field.name), ['type', 'component', 'message']);
assert.deepEqual(feedbackModal[3][0].options.map(option => option.value), ['sugestao', 'bug', 'dificuldade', 'performance']);
assert.deepEqual(feedbackModal[3][1].options.map(option => option.value), ['Geral', 'Área de Trabalho', 'Kanban', 'Intimações', 'Processos', 'Financeiro', 'Documentos', 'Configurações']);

secureResponses.set('/api/system/feedback', { ok: true, async json() { return { ok: true }; } });
assert.equal(await feature.submitFeedback({ type: 'bug', component: 'Configurações', message: 'Mensagem sintética', store, processes: ['PII-NOT-SENT'] }), true);
const feedbackRequest = secureRequests.find(request => request.url.endsWith('/feedback'));
assert.deepEqual(feedbackRequest.body, { type: 'bug', component: 'Configurações', message: 'Mensagem sintética' });
assert.equal(JSON.stringify(feedbackRequest.body).includes('PII-NOT-SENT'), false);
assert.equal(closedModals, 1);
secureResponses.set('/api/system/feedback', { ok: false, async json() { return { message: 'Feedback sintético rejeitado' }; } });
assert.equal(await feature.submitFeedback({ type: 'bug', component: 'Geral', message: 'Falha sintética' }), false);
assert.equal(closedModals, 1);
assert.ok(toasts.some(item => item.message === 'Feedback sintético rejeitado' && item.type === 'error'));

const escapedElements = { configurationList: makeElement() };
let rejectDiagnostic;
const failureFeature = createSystemAdminFeature({
  store,
  documentRef: { getElementById: id => escapedElements[id] || null },
  windowRef,
  secureFetch,
  fetchFn: () => new Promise((_resolve, reject) => { rejectDiagnostic = reject; }),
  escapeHtml: value => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;')
});
const failurePromise = failureFeature.renderDiagnostic();
rejectDiagnostic(new Error('<script>falha sintética</script>'));
await failurePromise;
assert.match(escapedElements.configurationList.innerHTML, /&lt;script&gt;falha sintética&lt;\/script&gt;/);
assert.doesNotMatch(escapedElements.configurationList.innerHTML, /<script>/);

console.log('✓ Feature modular de Administração do Sistema aprovada: diagnóstico, cache, prefs, runtime, backup/restore e feedback minimizado.');
