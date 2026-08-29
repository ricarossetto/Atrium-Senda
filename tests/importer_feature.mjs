import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContactsFeature } from '../js/features/contacts.js';
import { createImporterFeature } from '../js/features/importer.js';
import { createProcessesFeature } from '../js/features/processes.js';
import { createTasksFeature } from '../js/features/tasks.js';

const moduleSource = readFileSync(new URL('../js/features/importer.js', import.meta.url), 'utf8');
const portalSource = readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
assert.match(moduleSource, /export function createImporterFeature/);
assert.doesNotMatch(moduleSource, /^\s*import\s/m);
assert.doesNotMatch(moduleSource, /portal\.js|features\//);
assert.doesNotMatch(moduleSource, /\bfetch\s*\(|Gemini|telemetry|localStorage|sessionStorage/);
assert.doesNotMatch(moduleSource, /fatalDeadline\s*=|deadline\s*=/);
assert.match(portalSource, /handleSpreadsheetUpload\(file\) \{ return getImporterFeature\(\)\.handleUpload\(file\); \}/);
assert.match(portalSource, /commitSpreadsheetImport\(\) \{ return getImporterFeature\(\)\.commit\(\); \}/);
assert.doesNotMatch(portalSource, /secureFetch\('\/api\/import\/spreadsheet'/);

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
    listeners, classList: makeClassList(hidden ? ['hidden'] : []), innerHTML: '', textContent: '', value: '', clicks: 0, scrolls: 0,
    addEventListener(type, handler) { (listeners.get(type) || listeners.set(type, []).get(type)).push(handler); },
    click() { this.clicks++; },
    scrollIntoView() { this.scrolls++; }
  };
}

const ids = ['importerDropzone', 'importerFileInput', 'btnSelectSpreadsheet', 'importerCancelButton', 'importerCommitButton', 'importerPreviewCard', 'importerFileLabel', 'importerSummaryTitle', 'importerBadges', 'importerPreviewHead', 'importerPreviewBody'];
const elements = Object.fromEntries(ids.map(id => [id, makeElement({ hidden: id === 'importerPreviewCard' })]));
const documentRef = { getElementById: id => elements[id] || null };
const events = [];
let flushResult = true;
const store = {
  state: {
    processes: [{ id: 'proc-existing', number: '5000000-00.2026.8.21.0001', client: 'Cliente Manual Preservado', court: 'Vara Manual', lastMovement: 'Movimento anterior', lastMovementAt: '2026-08-20T10:00:00.000Z' }],
    contacts: [{ id: 'contact-existing', externalId: 'contact-ext', name: 'Contato Manual', document: 'DOCUMENTO-SINTETICO-001', mobile: 'telefone-manual', email: 'manual@example.test', notes: 'Nota manual preservada' }],
    tasks: [{ id: 'task-existing', externalId: 'task-ext', title: 'Tarefa Manual', status: 'em_andamento', priority: 'urgente', fatalDeadline: '', notes: 'Nota manual preservada', timeLogs: [{ minutes: 30 }] }]
  },
  audit(action, detail) { events.push({ type: 'audit', action, detail }); },
  save() { events.push({ type: 'save' }); },
  async flush() { events.push({ type: 'flush' }); return flushResult; },
  upsert(collection, record, externalKey = 'id') {
    const index = this.state[collection].findIndex(item => item[externalKey] === record[externalKey]);
    if (index >= 0) this.state[collection][index] = { ...this.state[collection][index], ...record };
    else this.state[collection].unshift(record);
    this.save();
    return record;
  }
};
const processFeature = createProcessesFeature({ store });
const contactFeature = createContactsFeature({ store });
const taskFeature = createTasksFeature({ store });

let parserPayload = {
  filename: 'parsed.csv', totalRows: 3,
  preview: [{ Processo: '5000000-00.2026.8.21.0001', Cliente: 'Cliente Importado' }],
  processes: [], contacts: [], tasks: []
};
let parserOk = true;
const requests = [];
const toasts = [];
const renderedViews = [];
const switchedViews = [];
const secureFetch = async (url, options = {}) => {
  requests.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
  return {
    ok: parserOk,
    async json() { return parserOk ? structuredClone(parserPayload) : { message: 'Falha sintética do parser.' }; }
  };
};
const feature = createImporterFeature({
  store,
  documentRef,
  windowRef: { btoa: value => Buffer.from(value, 'binary').toString('base64') },
  secureFetch,
  escapeHtml: value => String(value ?? '').replaceAll('<', '&lt;'),
  showToast: (message, type) => { toasts.push({ message, type }); events.push({ type: 'toast', message, toastType: type }); },
  upsertProcess: record => processFeature.upsertExternalProcess(record),
  upsertContact: record => contactFeature.upsertExternalContact(record),
  upsertTask: record => taskFeature.upsertExternalTask(record),
  onRenderAll: () => { renderedViews.push('all'); events.push({ type: 'render' }); },
  onSwitchView: view => { switchedViews.push(view); events.push({ type: 'switch', view }); }
});

assert.equal(feature.init(), true);
assert.equal(feature.init(), false);
for (const [id, type] of [['btnSelectSpreadsheet', 'click'], ['importerDropzone', 'click'], ['importerDropzone', 'dragover'], ['importerDropzone', 'dragleave'], ['importerDropzone', 'drop'], ['importerFileInput', 'change'], ['importerCancelButton', 'click'], ['importerCommitButton', 'click']]) {
  assert.equal(elements[id].listeners.get(type)?.length, 1, `${id} deve possuir um listener ${type}.`);
}
let prevented = false;
elements.importerDropzone.listeners.get('dragover')[0]({ preventDefault() { prevented = true; } });
assert.equal(prevented, true);
assert.equal(elements.importerDropzone.classList.contains('drag-over'), true);
elements.importerDropzone.listeners.get('dragleave')[0]();
assert.equal(elements.importerDropzone.classList.contains('drag-over'), false);
const droppedFiles = [];
const originalUpload = feature.handleUpload;
feature.handleUpload = async file => { droppedFiles.push(file); };
const dropFile = { name: 'drop.csv' };
elements.importerDropzone.listeners.get('drop')[0]({ preventDefault() {}, dataTransfer: { files: [dropFile] } });
elements.importerFileInput.listeners.get('change')[0]({ target: { files: [{ name: 'input.csv' }] } });
assert.deepEqual(droppedFiles.map(file => file.name), ['drop.csv', 'input.csv']);
feature.handleUpload = originalUpload;

const initialState = structuredClone(store.state);
const csvFile = { name: 'synthetic.csv', async text() { return 'nome,email\nPessoa Sintética,pessoa@example.test'; } };
const csvResult = await feature.handleUpload(csvFile);
assert.equal(csvResult.totalRows, 3);
assert.deepEqual(requests.at(-1), {
  url: '/api/import/spreadsheet', method: 'POST',
  body: { filename: 'synthetic.csv', content: 'nome,email\nPessoa Sintética,pessoa@example.test' }
});
assert.deepEqual(store.state, initialState, 'Preview não pode mutar Store antes da confirmação.');
assert.equal(elements.importerPreviewCard.classList.contains('hidden'), false);
assert.equal(elements.importerFileLabel.textContent, 'Arquivo: parsed.csv');
assert.equal(elements.importerSummaryTitle.textContent, '3 linha(s) identificada(s)');
assert.match(elements.importerPreviewHead.innerHTML, /Processo[\s\S]*Cliente/);
assert.match(elements.importerPreviewBody.innerHTML, /5000000-00\.2026\.8\.21\.0001[\s\S]*Cliente Importado/);

const binaryFile = { name: 'synthetic.xlsx', async arrayBuffer() { return Uint8Array.from([1, 2, 3]).buffer; } };
await feature.handleUpload(binaryFile);
assert.deepEqual(requests.at(-1).body, { filename: 'synthetic.xlsx', base64: 'AQID' });

feature.data = null;
parserOk = false;
const requestsBeforeFailure = requests.length;
assert.equal(await feature.handleUpload(csvFile), null);
assert.equal(requests.length, requestsBeforeFailure + 1);
assert.equal(feature.data, null);
assert.deepEqual(store.state, initialState, 'Falha do parser não pode alterar Store.');
assert.deepEqual(toasts.at(-1), { message: 'Falha sintética do parser.', type: 'error' });
parserOk = true;

feature.data = { filename: 'cancel.csv', totalRows: 1, processes: [{ id: 'must-not-import' }], contacts: [], tasks: [] };
elements.importerFileInput.value = 'synthetic-selection';
feature.cancel();
assert.equal(feature.data, null);
assert.equal(elements.importerPreviewCard.classList.contains('hidden'), true);
assert.equal(elements.importerFileInput.value, '');
assert.deepEqual(store.state, initialState, 'Cancelamento não pode consolidar lote.');

feature.data = {
  filename: 'consolidation.csv', totalRows: 3, preview: [],
  processes: [{ externalId: 'proc-import', number: '5000000-00.2026.8.21.0001', client: 'Cliente Externo', court: 'Tribunal Externo', lastMovement: 'Movimento novo', lastMovementAt: '2026-08-29T10:00:00.000Z', source: 'Importação' }],
  contacts: [{ externalId: 'contact-ext', name: 'Contato Manual', document: 'DOCUMENTO-SINTETICO-001', mobile: 'telefone-externo', email: 'external@example.test', source: 'Importação' }],
  tasks: [{ id: 'task-incoming', externalId: 'task-ext', title: 'Tarefa Externa Atualizada', status: 'nova', priority: 'baixa', deadline: '', fatalDeadline: '', notes: 'Nota externa', source: 'Importação' }]
};
events.length = 0;
assert.equal(await feature.commit(), true);
assert.equal(store.state.processes.length, 1, 'Processo deve ser deduplicado pela identidade canônica.');
assert.equal(store.state.processes[0].client, 'Cliente Manual Preservado');
assert.equal(store.state.processes[0].court, 'Vara Manual');
assert.equal(store.state.processes[0].lastMovement, 'Movimento novo');
assert.equal(store.state.contacts.length, 1, 'Contato deve ser deduplicado.');
assert.equal(store.state.contacts[0].mobile, 'telefone-manual');
assert.equal(store.state.contacts[0].email, 'manual@example.test');
assert.equal(store.state.contacts[0].notes, 'Nota manual preservada');
assert.equal(store.state.tasks.length, 1, 'Tarefa deve ser deduplicada.');
assert.equal(store.state.tasks[0].title, 'Tarefa Externa Atualizada');
assert.equal(store.state.tasks[0].priority, 'urgente');
assert.equal(store.state.tasks[0].fatalDeadline, '');
assert.equal(store.state.tasks[0].notes, 'Nota manual preservada');
assert.deepEqual(store.state.tasks[0].timeLogs, [{ minutes: 30 }]);
assert.deepEqual(events.find(event => event.type === 'audit'), {
  type: 'audit', action: 'Importação de planilha concluída', detail: '1 processos, 1 contatos e 1 tarefas consolidados.'
});
const flushIndex = events.findIndex(event => event.type === 'flush');
const renderIndex = events.findIndex(event => event.type === 'render');
const successIndex = events.findIndex(event => event.type === 'toast' && event.toastType === 'success' && event.message.startsWith('Importação concluída:'));
assert.ok(flushIndex >= 0 && renderIndex > flushIndex && successIndex > flushIndex, 'Render/sucesso devem ocorrer somente após flush.');
assert.deepEqual(renderedViews, ['all']);
assert.deepEqual(switchedViews, ['processes']);

const failureEvents = [];
const failureStore = {
  state: { processes: [], contacts: [], tasks: [] },
  audit() { failureEvents.push('audit'); }, save() { failureEvents.push('save'); }, async flush() { failureEvents.push('flush'); return false; }
};
let failureRendered = false;
let failureNavigation = false;
const failureToasts = [];
const failureFeature = createImporterFeature({
  store: failureStore,
  documentRef: { getElementById: () => null },
  showToast: (message, type) => failureToasts.push({ message, type }),
  upsertProcess: record => failureStore.state.processes.push(record),
  onRenderAll: () => { failureRendered = true; },
  onSwitchView: () => { failureNavigation = true; }
});
failureFeature.data = { processes: [{ id: 'proc-failure' }], contacts: [], tasks: [] };
assert.equal(await failureFeature.commit(), false);
assert.equal(failureFeature.data.processes.length, 1, 'Preview deve permanecer recuperável após falha de flush.');
assert.equal(failureRendered, false);
assert.equal(failureNavigation, false);
assert.equal(failureToasts.some(item => item.type === 'success'), false);

assert.deepEqual([...new Set(requests.map(request => request.url))], ['/api/import/spreadsheet']);
console.log('✓ Feature modular do Importador de Planilhas aprovada: CSV/base64, preview, cancelamento, consolidação, dados manuais, prazo vazio e flush antes do sucesso.');
