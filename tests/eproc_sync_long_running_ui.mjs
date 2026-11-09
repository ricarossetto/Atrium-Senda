import assert from 'node:assert/strict';
import { createJudicialIntegrationsFeature } from '../js/features/judicial-integrations.js';

const element = id => ({
  id,
  innerHTML: '',
  textContent: '',
  style: {},
  dataset: {},
  classList: {
    values: new Set(),
    add(...values) { values.forEach(value => this.values.add(value)); },
    remove(...values) { values.forEach(value => this.values.delete(value)); },
    contains(value) { return this.values.has(value); },
    toggle(value, force) {
      if (force === false) this.values.delete(value);
      else if (force === true) this.values.add(value);
      else this.values.has(value) ? this.values.delete(value) : this.values.add(value);
    }
  },
  attributes: new Map(),
  setAttribute(name, value) { this.attributes.set(name, String(value)); },
  removeAttribute(name) { this.attributes.delete(name); },
  listeners: new Map(),
  addEventListener(type, handler) { this.listeners.set(type, handler); },
  click() { this.listeners.get('click')?.({ target: this, currentTarget: this }); },
  appendChild() {},
  scrollHeight: 0
});

const makeDocument = () => {
  const ids = [
    'systemStatusBar', 'eprocSyncModalBackdrop', 'eprocSyncStatusLabel', 'eprocSyncPercentLabel',
    'eprocSyncModalTrack', 'eprocSyncModalFill', 'eprocSyncCurrentAction', 'eprocSyncConsoleLogs',
    'eprocSyncModalClose', 'eprocSyncModalMinimize', 'eprocSyncModalDone', 'btnSyncEprocNow',
    'eprocSyncPortalLabel', 'eprocSyncJobIdLabel', 'eprocSyncStateLabel', 'eprocSyncPhaseLabel',
    'eprocSyncCountLabel'
  ];
  const elements = new Map(ids.map(id => [id, element(id)]));
  elements.get('eprocSyncModalBackdrop').classList.add('hidden');
  return {
    getElementById: id => elements.get(id) || null,
    createElement: () => element('line'),
    body: { style: {} },
    elements
  };
};

const response = payload => ({ ok: true, async json() { return payload; } });
const failedResponse = () => ({ ok: false, async json() { return {}; } });
const invalidJsonResponse = () => ({ ok: true, async json() { throw new Error('invalid json'); } });
const runningJob = ({ id = 'job-test', state = 'RUNNING', determinate = false, completed = null, total = null, percent = null } = {}) => ({
  job: {
    id,
    state,
    overall: { currentPortal: 'tjrs-eproc-1g' },
    portals: [{
      portalId: 'tjrs-eproc-1g', state, phase: determinate ? 'processing_processes' : 'connecting',
      action: determinate ? 'Processando alvos reais.' : 'Conectando ao portal.',
      determinate, completed, total, percent
    }]
  }
});
const terminalJob = ({ id = 'job-test', state = 'COMPLETED', determinate = false, completed = null, total = null, percent = null, error = null } = {}) => ({
  active: false,
  job: {
    id, state, error, overall: { currentPortal: null },
    portals: [{
      portalId: 'tjrs-eproc-1g', state,
      phase: state === 'COMPLETED' ? 'completed' : 'partial_error',
      action: state === 'COMPLETED' ? 'Coleta concluída.' : 'Coleta interrompida.',
      determinate, completed, total, percent, error
    }]
  }
});
const flushMicrotasks = async (turns = 12) => {
  for (let index = 0; index < turns; index++) await Promise.resolve();
};

// Long-running job: >36 simulated seconds, PENDING/RUNNING, transient failures, mismatch and one POST.
const documentRef = makeDocument();
const requests = [];
const toasts = [];
const warnings = [];
let manualStarted = false;
let polls = 0;
let coverageRefreshes = 0;
let simulatedElapsedMs = 0;
let longRunningObservation = null;
let releaseFirstPoll;
let globalActivate = null;
const firstPoll = new Promise(resolve => { releaseFirstPoll = resolve; });
const statuses = [
  runningJob({ state: 'PENDING' }),
  ...Array.from({ length: 21 }, () => runningJob()),
  runningJob({ id: 'job-from-another-cycle' }),
  'HTTP_FAILURE',
  'INVALID_JSON',
  new Error('temporary network failure'),
  terminalJob()
];
const feature = createJudicialIntegrationsFeature({
  documentRef,
  secureFetch: async (url, options = {}) => {
    const method = options.method || 'GET';
    requests.push({ url, method });
    if (url.endsWith('/sync')) {
      manualStarted = true;
      return response({ jobId: 'job-test' });
    }
    if (url.endsWith('/sync/status') && !manualStarted) return response({ active: false, job: null });
    if (url.endsWith('/sync/status')) {
      const next = statuses[polls++];
      if (next instanceof Error) throw next;
      if (next === 'HTTP_FAILURE') return failedResponse();
      if (next === 'INVALID_JSON') return invalidJsonResponse();
      return response(next);
    }
    if (url === '/api/integrations/judicial') {
      coverageRefreshes += 1;
      return response({ certificate: {}, portals: [], managedCoverage: [] });
    }
    return response({});
  },
  sleepFn: async ms => {
    simulatedElapsedMs += ms;
    if (simulatedElapsedMs > 36_000 && !longRunningObservation) {
      longRunningObservation = {
        status: documentRef.elements.get('eprocSyncStatusLabel').textContent,
        errorToasts: toasts.filter(toast => toast.type === 'error').length
      };
    }
    if (!releaseFirstPoll.used) {
      releaseFirstPoll.used = true;
      await firstPoll;
    }
  },
  pollIntervalMs: 1800,
  showToast: (message, type) => toasts.push({ message, type }),
  warn: message => warnings.push(message),
  presentation: { icon: () => '' },
  onEprocStatus: ({ onActivate }) => { globalActivate = onActivate; }
});

feature.init();
const runningPromise = feature.syncEprocNow();
await flushMicrotasks(8);
assert.equal(requests.filter(request => request.method === 'POST').length, 1);
assert.equal(documentRef.elements.get('eprocSyncModalBackdrop').classList.contains('hidden'), false, 'novo job abre modal');
documentRef.elements.get('eprocSyncModalMinimize').click();
assert.equal(documentRef.elements.get('eprocSyncModalBackdrop').classList.contains('hidden'), true, 'minimizar fecha somente o modal');
globalActivate?.();
assert.equal(documentRef.elements.get('eprocSyncModalBackdrop').classList.contains('hidden'), false, 'faixa reabre o mesmo modal');
documentRef.elements.get('btnSyncEprocNow').click();
assert.equal(requests.filter(request => request.method === 'POST').length, 1, 'monitoramento ativo não cria segundo POST');
releaseFirstPoll();
await runningPromise;
assert.ok(simulatedElapsedMs > 36_000, 'job deve permanecer ativo por mais de 36 segundos simulados');
assert.deepEqual(longRunningObservation, { status: 'Sincronizando...', errorToasts: 0 }, 'frontend não declara erro após 36 segundos');
assert.equal(requests.filter(request => request.method === 'POST').length, 1);
assert.ok(warnings.some(message => message.includes('job-from-another-cycle')), 'snapshot de outro job deve ser ignorado');
assert.equal(documentRef.elements.get('eprocSyncJobIdLabel').textContent, 'Job job-test');
assert.equal(documentRef.elements.get('eprocSyncStatusLabel').textContent, 'Conclusão confirmada pelo backend');
assert.equal(documentRef.elements.get('eprocSyncModalTrack').attributes.has('aria-valuenow'), false, 'percent nulo deve permanecer indeterminado');
assert.equal(documentRef.elements.get('eprocSyncPercentLabel').textContent, 'Concluída', 'conclusão indeterminada não inventa 100%');
assert.equal(documentRef.elements.get('eprocSyncCountLabel').textContent, 'Progresso não mensurável');
assert.equal(coverageRefreshes, 1, 'Estado terminal deve repintar a cobertura judicial aberta.');

// Determinate telemetry survives the terminal snapshot and is rendered exactly as supplied.
const determinateDocument = makeDocument();
const determinateFeature = createJudicialIntegrationsFeature({
  documentRef: determinateDocument,
  secureFetch: async (url, options = {}) => options.method === 'POST'
    ? response({ jobId: 'job-determinate' })
    : response(terminalJob({ id: 'job-determinate', determinate: true, completed: 3, total: 4, percent: 75 })),
  sleepFn: async () => {}
});
await determinateFeature.syncEprocNow();
assert.equal(determinateDocument.elements.get('eprocSyncPercentLabel').textContent, '75%');
assert.equal(determinateDocument.elements.get('eprocSyncModalTrack').attributes.get('aria-valuenow'), '75');
assert.equal(determinateDocument.elements.get('eprocSyncCountLabel').textContent, '3 de 4 itens');

// Reload reconnects silently to the backend-owned active job and never creates a POST.
const reloadDocument = makeDocument();
const reloadRequests = [];
let reloadStatusCalls = 0;
let reloadSleepCalls = 0;
let restorePollStarted;
let releaseRestorePoll;
const restoreStarted = new Promise(resolve => { restorePollStarted = resolve; });
const restoreGate = new Promise(resolve => { releaseRestorePoll = resolve; });
const reloadFeature = createJudicialIntegrationsFeature({
  documentRef: reloadDocument,
  secureFetch: async (url, options = {}) => {
    reloadRequests.push({ url, method: options.method || 'GET' });
    reloadStatusCalls++;
    if (reloadStatusCalls === 1) return failedResponse();
    return response(reloadStatusCalls === 2
      ? { active: true, job: { id: 'restored-job', state: 'RUNNING', portals: [] } }
      : terminalJob({ id: 'restored-job' }));
  },
  sleepFn: async () => {
    reloadSleepCalls++;
    if (reloadSleepCalls === 1) return;
    restorePollStarted();
    await restoreGate;
  }
});
reloadFeature.init();
const restorePromise = reloadFeature.restoreEprocSync();
await restoreStarted;
assert.equal(reloadRequests.filter(request => request.method === 'POST').length, 0, 'reload não pode criar POST');
assert.equal(reloadDocument.elements.get('eprocSyncModalBackdrop').classList.contains('hidden'), true, 'restauração é silenciosa');
releaseRestorePoll();
await flushMicrotasks();
await restorePromise;
assert.equal(reloadDocument.elements.get('eprocSyncJobIdLabel').textContent, 'Job restored-job');

// Backend ERROR remains visible and clickable with the real error and original job identity.
const errorDocument = makeDocument();
const errorToasts = [];
let errorActivate = null;
let errorStarted = false;
let errorPolls = 0;
const errorFeature = createJudicialIntegrationsFeature({
  documentRef: errorDocument,
  secureFetch: async (url, options = {}) => {
    if (options.method === 'POST') {
      errorStarted = true;
      return response({ jobId: 'job-error' });
    }
    if (!errorStarted) return response({ active: false, job: null });
    return response(errorPolls++ === 0
      ? runningJob({ id: 'job-error' })
      : terminalJob({ id: 'job-error', state: 'ERROR', error: 'Falha sintética do backend' }));
  },
  sleepFn: async () => {},
  showToast: (message, type) => errorToasts.push({ message, type }),
  onEprocStatus: ({ onActivate }) => { errorActivate = onActivate; }
});
errorFeature.init();
await errorFeature.syncEprocNow();
assert.match(errorDocument.elements.get('eprocSyncCurrentAction').textContent, /Falha sintética/);
assert.equal(errorDocument.elements.get('eprocSyncJobIdLabel').textContent, 'Job job-error');
assert.equal(errorDocument.elements.get('eprocSyncStateLabel').textContent, 'Estado: Erro');
assert.ok(errorToasts.some(toast => toast.type === 'error' && toast.message.includes('Falha sintética')));
errorDocument.elements.get('eprocSyncModalMinimize').click();
assert.equal(errorDocument.elements.get('eprocSyncModalBackdrop').classList.contains('hidden'), true);
errorActivate?.();
assert.equal(errorDocument.elements.get('eprocSyncModalBackdrop').classList.contains('hidden'), false, 'erro permanece reabrível pela faixa');

// CANCELLED is a distinct backend terminal state, not a fabricated ERROR.
const cancelledDocument = makeDocument();
const cancelledToasts = [];
const cancelledFeature = createJudicialIntegrationsFeature({
  documentRef: cancelledDocument,
  secureFetch: async (url, options = {}) => options.method === 'POST'
    ? response({ jobId: 'job-cancelled' })
    : response(terminalJob({ id: 'job-cancelled', state: 'CANCELLED', error: 'Cancelado no servidor.' })),
  sleepFn: async () => {},
  showToast: (message, type) => cancelledToasts.push({ message, type })
});
await cancelledFeature.syncEprocNow();
assert.equal(cancelledDocument.elements.get('eprocSyncStateLabel').textContent, 'Estado: Cancelada');
assert.equal(cancelledToasts.some(toast => toast.type === 'error'), false);

// Lost POST response recovers the active job through GET and never reports a false job failure.
const recoveryDocument = makeDocument();
const recoveryToasts = [];
let recoveryStatusCalls = 0;
const recoveryFeature = createJudicialIntegrationsFeature({
  documentRef: recoveryDocument,
  secureFetch: async (url, options = {}) => {
    if (options.method === 'POST') throw new Error('connection reset after send');
    recoveryStatusCalls++;
    if (recoveryStatusCalls === 1) return failedResponse();
    return response(recoveryStatusCalls === 2
      ? { active: true, ...runningJob({ id: 'job-recovered' }) }
      : terminalJob({ id: 'job-recovered' }));
  },
  sleepFn: async () => {},
  showToast: (message, type) => recoveryToasts.push({ message, type })
});
await recoveryFeature.syncEprocNow();
assert.equal(recoveryDocument.elements.get('eprocSyncJobIdLabel').textContent, 'Job job-recovered');
assert.equal(recoveryToasts.some(toast => toast.type === 'error'), false, 'resposta perdida do POST não pode virar ERROR local');
assert.equal(recoveryDocument.elements.get('eprocSyncStatusLabel').textContent, 'Conclusão confirmada pelo backend');

console.log('eproc long-running UI: PASS');
