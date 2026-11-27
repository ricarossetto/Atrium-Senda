import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { createProcessesFeature } from '../js/features/processes.js';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — CARACTERIZAÇÃO DA FEATURE DE PROCESSOS');
console.log('===============================================================\n');

const processesSource = fs.readFileSync(new URL('../js/features/processes.js', import.meta.url), 'utf8');
const portalSource = fs.readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
for (const forbiddenImport of ['portal.js', 'tasks.js', 'publications.js', 'agenda.js']) {
  assert.equal(processesSource.includes(forbiddenImport), false, `Processes não pode importar ${forbiddenImport}.`);
}
for (const forbiddenConcern of ['renderFinancial', 'handleFinancialEntrySubmit', 'financialEntryForm', 'finGrossInput', 'Lançamento financeiro registrado', 'openDocumentGenerator']) {
  assert.equal(processesSource.includes(forbiddenConcern), false, `Processes não pode assumir ${forbiddenConcern}.`);
}
assert.match(processesSource, /String\(item\.number \|\| ''\)\.includes\('\.8\.21\.'\) \|\| String\(item\.court \|\| ''\)\.toUpperCase\(\)\.includes\('TJRS'\)/, 'Detecção histórica TJRS deve aceitar CNJ ou nome do tribunal.');
assert.match(portalSource, /import \{ createProcessesFeature \} from '\.\/features\/processes\.js(?:\?v=[^']*)?';/);
assert.equal((portalSource.match(/createProcessesFeature\(/g) || []).length, 1, 'Portal deve instanciar Processes uma única vez.');
assert.equal(portalSource.includes('processSort:'), false, 'Sort de Processos não pode manter shadow state no App.');
assert.equal(portalSource.includes("secureFetch('/api/tjrs/consult'"), false, 'TJRS concreto não pode permanecer no portal.');
assert.equal(portalSource.includes('data-tjrs-consult'), false, 'Markup e listener TJRS concretos não podem permanecer no portal.');
assert.match(portalSource, /renderProcesses\(query = ''\) \{\s*return getProcessesFeature\(\)\.render\(query\);\s*\}/);
assert.match(portalSource, /openProcessModal\(defaults = \{\}\) \{\s*return getProcessesFeature\(\)\.openProcessModal\(defaults\);\s*\}/);
assert.match(portalSource, /modalMode\.mode === 'process'\) \{\s*const savedProcess = getProcessesFeature\(\)\.saveProcess\(data, this\.modalMode\.defaults\);\s*if \(!savedProcess\) return;\s*if \(!await getProcessesFeature\(\)\.persistAccessKey\(savedProcess\)\) return;/);
assert.match(portalSource, /secureFetch: \(\.\.\.args\) => window\.(?:AtriumAuth|KellerAuth)\.secureFetch\(\.\.\.args\)/, 'Wiring deve usar o cliente autenticado oficial ou seu alias de compatibilidade.');

const listenerMap = { newProcessButton: [], processSearch: [] };
const fakeElements = {
  newProcessButton: { addEventListener: (type, listener) => listenerMap.newProcessButton.push({ type, listener }) },
  processSearch: { value: '', addEventListener: (type, listener) => listenerMap.processSearch.push({ type, listener }) }
};
const unitAudits = [];
const unitStore = {
  revision: 'unit-revision-1',
  flushResult: true,
  state: {
    settings: { hasA1Certificate: false },
    processes: [{ id: 'unit-process', number: '5000000-00.2026.8.21.0001', courtUnit: 'Vara Unitária' }],
    configuration: { actionTypes: [], actionGroups: [] },
    audit: []
  },
  upsert(collection, record) {
    const index = this.state[collection].findIndex(item => item.id === record.id);
    if (index >= 0) this.state[collection][index] = { ...this.state[collection][index], ...record };
    else this.state[collection].push(record);
    return record;
  },
  audit(action, detail) {
    const entry = { id: `unit-audit-${unitAudits.length + 1}`, action, detail };
    unitAudits.push({ action, detail });
    this.state.audit = [...(this.state.audit || []), entry];
    return entry;
  },
  save() {},
  async flush() { return this.flushResult; }
};
let unitOpenCount = 0;
const unitRenders = [];
const unitToasts = [];
const unitRequests = [];
const unitFeature = createProcessesFeature({
  store: unitStore,
  documentRef: { getElementById: id => fakeElements[id] || null, querySelectorAll: () => [] },
  normalizeText: value => String(value || '').toLowerCase(),
  escapeHtml: String,
  formatDate: String,
  formatMinutes: minutes => `${minutes}m`,
  totalTimeMinutes: logs => (logs || []).reduce((total, log) => total + Number(log.minutes || 0), 0),
  sortRecords: records => records,
  updateTableSortHeaders: () => {},
  openModal: () => { unitOpenCount++; },
  showToast: (message, type) => unitToasts.push({ message, type }),
  secureFetch: async (url, options) => {
    unitRequests.push({ url, options });
    if (url.includes('access-key')) {
      return { ok: true, json: async () => ({ ok: true, configured: true, collected: true }) };
    }
    return {
      ok: true,
      json: async () => ({
        ok: true,
        revision: 'unit-revision-2',
        process: { ...unitStore.state.processes[0], lastMovement: 'Snapshot unitário' },
        message: 'Snapshot unitário incorporado.'
      })
    };
  },
  getLinkedTasks: () => [],
  getLinkedIntimations: () => [],
  isTerminalStatus: status => status === 'concluida'
});
unitFeature.openProcessModal = () => { unitOpenCount++; };
unitFeature.render = query => { unitRenders.push(query); return []; };
assert.equal(unitFeature.init(), true);
assert.equal(unitFeature.init(), false);
assert.equal(listenerMap.newProcessButton.length, 1);
assert.equal(listenerMap.processSearch.length, 1);
listenerMap.newProcessButton[0].listener();
listenerMap.processSearch[0].listener({ target: { value: 'busca unitária' } });
assert.equal(unitOpenCount, 1, 'Segundo init não pode duplicar listener de novo processo.');
assert.deepEqual(unitRenders, ['busca unitária'], 'Pesquisa deve disparar um único render.');
fakeElements.processSearch.value = 'sort preservado';
assert.deepEqual(unitFeature.handleSort('registeredAt'), { field: 'registeredAt', direction: 'asc' });
assert.deepEqual(unitFeature.handleSort('client'), { field: 'client', direction: 'asc' });
assert.deepEqual(unitFeature.handleSort('lastMovementAt'), { field: 'lastMovementAt', direction: 'desc' });
assert.deepEqual(unitRenders.slice(-3), ['sort preservado', 'sort preservado', 'sort preservado']);

const unitCreated = unitFeature.saveProcess({
  number: '5001111-61.2026.8.21.0001', client: 'Cliente Unitário', feePercentage: '30', feeAmount: '1500',
  feeMonthly: '', secrecy: 'true', lastMovement: 'Movimento unitário', lastMovementAt: '2026-08-28'
}, {});
assert.ok(unitCreated.id.startsWith('proc-'));
assert.equal(unitCreated.source, 'Interna');
assert.equal(unitCreated.feePercentage, 30);
assert.equal(unitCreated.feeAmount, 1500);
assert.equal(unitCreated.feeMonthly, null);
assert.equal(unitCreated.secrecy, true);
assert.deepEqual(unitAudits.at(-1), { action: 'Processo cadastrado', detail: '5001111-61.2026.8.21.0001 · Cliente Unitário' });
const unitEdited = unitFeature.saveProcess({
  number: unitCreated.number, client: unitCreated.client, feePercentage: '', feeAmount: '', feeMonthly: '400', secrecy: 'false'
}, { ...unitCreated, externalId: 'external-unit', unknownField: 'preservado', source: 'DataJud' });
assert.equal(unitEdited.id, unitCreated.id);
assert.equal(unitEdited.externalId, 'external-unit');
assert.equal(unitEdited.unknownField, 'preservado');
assert.equal(unitEdited.source, 'DataJud');
assert.equal(unitEdited.feePercentage, null);
assert.equal(unitEdited.feeMonthly, 400);
assert.equal(unitEdited.secrecy, false);
assert.deepEqual(unitAudits.at(-1), { action: 'Processo atualizado', detail: '5001111-61.2026.8.21.0001 · Cliente Unitário' });

// CNJ: DV conferido no cadastro manual, duplicidade bloqueada, formato oficial e legado livre.
const dvRejected = unitFeature.saveProcess({ number: '5001111-00.2026.8.21.0001', client: 'Cliente DV' }, {});
assert.equal(dvRejected, null, 'Número novo com DV inválido deve ser recusado.');
assert.deepEqual(unitToasts.at(-1), { message: 'Dígito verificador do número CNJ não confere. Use o número sugerido no formulário.', type: 'error' });
const duplicateRejected = unitFeature.saveProcess({ number: '5001111-61.2026.8.21.0001', client: 'Cliente Duplicado' }, {});
assert.equal(duplicateRejected, null, 'Número CNJ duplicado deve ser recusado.');
assert.match(unitToasts.at(-1).message, /já está cadastrado/);
const normalizedSave = unitFeature.saveProcess({ number: '50022220620265040001', client: 'Cliente Normalizado' }, {});
assert.equal(normalizedSave.number, '5002222-06.2026.5.04.0001', 'Número de 20 dígitos deve ser normalizado ao formato oficial.');
const legacySave = unitFeature.saveProcess({ number: '029/1.12.0001234-5', client: 'Cliente Legado' }, {});
assert.equal(legacySave.number, '029/1.12.0001234-5', 'Formato antigo permanece livre.');
const legacyEdit = unitFeature.saveProcess({ number: legacySave.number, client: legacySave.client, feeMonthly: '100' }, legacySave);
assert.equal(legacyEdit.feeMonthly, 100, 'Edição de dado legado sem alterar o número não é bloqueada.');

// Vínculo de número original: normalização, deduplicação e limite.
const linkedProcess = unitFeature.saveProcess({
  number: '5003333-67.2026.6.21.0001', client: 'Cliente Vínculo',
  originNumbers: '5000000-42.2026.8.21.0001; 5000000-42.2026.8.21.0001; 029/1.12.0001234-5'
}, {});
assert.deepEqual(linkedProcess.originNumbers, ['5000000-42.2026.8.21.0001', '029/1.12.0001234-5'], 'Números anteriores devem ser normalizados, deduplicados e preservar formato antigo.');
const clearedLink = unitFeature.saveProcess({ number: linkedProcess.number, client: linkedProcess.client, originNumbers: '' }, linkedProcess);
assert.deepEqual(clearedLink.originNumbers, [], 'Editar com campo vazio deve limpar os números anteriores.');

fakeElements['field-accessKey'] = { value: 'CHAVE-PROCESSUAL-SINTETICA' };
const keyedProcess = unitFeature.saveProcess({
  number: unitCreated.number, client: unitCreated.client, feePercentage: '', feeAmount: '', feeMonthly: '', secrecy: 'true'
}, unitCreated);
assert.equal(Object.hasOwn(keyedProcess, 'accessKey'), false, 'Chave não pode integrar o registro processual.');
assert.equal(await unitFeature.persistAccessKey(keyedProcess), true);
const keyRequest = unitRequests.at(-1);
assert.equal(keyRequest.url, '/api/integrations/tjrs-sidecar/processes/access-key');
assert.deepEqual(JSON.parse(keyRequest.options.body), {
  processId: keyedProcess.id,
  processNumber: keyedProcess.number,
  accessKey: 'CHAVE-PROCESSUAL-SINTETICA',
  chaveAcesso: 'CHAVE-PROCESSUAL-SINTETICA'
});
delete fakeElements['field-accessKey'];

// Preservação eproc, caseValue numérico e acesso multi-tribunal à chave de acesso.
const eprocExisting = {
  id: 'proc-eproc-jfrs',
  number: '5004444-12.2026.4.04.7100',
  client: 'Cliente JFRS Sintético',
  court: 'JFRS',
  source: 'eproc-jfrs',
  hasAccessKey: true,
  eprocDetails: { actionClass: 'Procedimento Comum Cível', subjects: [{ code: '6094', description: 'Benefício Sintético', principal: true }] },
  structuredParties: { autor: [{ name: 'Cliente JFRS Sintético' }] },
  judicialParties: [{ name: 'Cliente JFRS Sintético', role: 'AUTOR' }]
};
const eprocSaved = unitFeature.saveProcess({
  number: eprocExisting.number,
  client: eprocExisting.client,
  actionClass: 'Procedimento Comum Revisado',
  subject: 'Assunto Principal Revisado',
  competence: 'Previdenciária',
  judge: 'Juiz(a) Sintético(a)',
  caseValue: '15432.5',
  feePercentage: '',
  feeAmount: '',
  feeMonthly: '',
  secrecy: 'true'
}, eprocExisting);
assert.equal(eprocSaved.actionClass, 'Procedimento Comum Revisado');
assert.equal(eprocSaved.subject, 'Assunto Principal Revisado');
assert.equal(eprocSaved.competence, 'Previdenciária');
assert.equal(eprocSaved.judge, 'Juiz(a) Sintético(a)');
assert.equal(eprocSaved.caseValue, 15432.5);
assert.equal(eprocSaved.hasAccessKey, true, 'Edição pelo modal deve preservar hasAccessKey.');
assert.deepEqual(eprocSaved.eprocDetails, eprocExisting.eprocDetails, 'Edição pelo modal deve preservar eprocDetails.');
assert.deepEqual(eprocSaved.structuredParties, eprocExisting.structuredParties, 'Edição pelo modal deve preservar structuredParties.');
assert.deepEqual(eprocSaved.judicialParties, eprocExisting.judicialParties, 'Edição pelo modal deve preservar judicialParties.');
const eprocClearedValue = unitFeature.saveProcess({
  number: eprocExisting.number,
  client: eprocExisting.client,
  caseValue: ''
}, eprocSaved);
assert.equal(eprocClearedValue.caseValue, null, 'caseValue vazio deve virar null.');

const multiRequests = [];
let multiRevCounter = 2;
const multiStore = {
  ...unitStore,
  revision: 'rev-1',
  persistedFingerprint: null,
  adoptedRevisions: [],
  state: {
    processes: [structuredClone({ ...eprocExisting, hasAccessKey: false })],
    tasks: [],
    intimations: [],
    audit: [],
    settings: {},
    documents: [],
    configuration: {}
  },
  persistenceFingerprint() {
    return JSON.stringify(this.state);
  },
  adoptServerRevision(rev) {
    this.revision = rev;
    this.persistedFingerprint = this.persistenceFingerprint();
    this.adoptedRevisions.push(rev);
    return rev;
  }
};
const multiFakeDom = {
  processAccessKeyNumber: { textContent: '' },
  processAccessKeyMessage: { textContent: '' },
  processAccessKeyInput: { value: '', focus() {} },
  processAccessKeyBackdrop: { classList: { add() {}, remove() {} } },
  processAccessKeySave: { disabled: false, textContent: '' },
  processInspectorTitle: { textContent: '' },
  processInspectorBackdrop: { classList: { add() {}, remove() {}, contains: () => false }, addEventListener() {} },
  processInspectorContent: { innerHTML: '', querySelector: () => null, addEventListener() {} },
  processSearch: { value: '' }
};
const multiFeature = createProcessesFeature({
  store: multiStore,
  documentRef: { getElementById: id => fakeElements[id] || multiFakeDom[id] || null, querySelectorAll: () => [] },
  normalizeText: value => String(value || '').toLowerCase(),
  escapeHtml: String,
  formatDate: String,
  formatMinutes: String,
  totalTimeMinutes: () => 0,
  sortRecords: records => records,
  updateTableSortHeaders: () => {},
  openModal: () => {},
  showToast: () => {},
  secureFetch: async (url, options = {}) => {
    multiRequests.push({ url, options });
    if (url.startsWith('/api/integrations/tjrs-sidecar/processes/access-key')) {
      return { ok: false, status: 503, json: async () => ({ ok: false, message: 'Sidecar indisponível' }) };
    }
    if (url.startsWith('/api/judicial/processes/access-key/status')) {
      return { ok: true, status: 200, json: async () => ({ ok: true, configured: true }) };
    }
    if (url === '/api/judicial/processes/access-key') {
      const revision = `rev-${multiRevCounter++}`;
      return { ok: true, status: 200, json: async () => ({ ok: true, configured: true, hasAccessKey: true, revision }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, configured: true }) };
  },
  getLinkedTasks: () => [],
  getLinkedIntimations: () => [],
  isTerminalStatus: () => false
});
multiFeature.render = () => [];
assert.equal(await multiFeature.refreshAccessKeyStatus({ id: 'datajud-only', number: '5012345-67.2025.4.04.7100', court: 'TRF4', source: 'DataJud sintético' }), false);
assert.equal(multiRequests.length, 0, 'Processo DataJud puro não pode consultar status de chave de acesso.');
assert.equal(await multiFeature.refreshAccessKeyStatus(eprocSaved), true);
assert.equal(multiRequests.at(-1).url, '/api/judicial/processes/access-key/status?processNumber=5004444-12.2026.4.04.7100');

fakeElements['field-accessKey'] = { value: 'CHAVE-JFRS-SINTETICA' };
const editedJfrsProcess = multiFeature.saveProcess(
  { number: eprocExisting.number, client: eprocExisting.client, stage: 'Editado' },
  { ...eprocSaved, hasAccessKey: false }
);
assert.equal(await multiFeature.persistAccessKey(editedJfrsProcess), true);
assert.equal(multiRequests.at(-1).url, '/api/judicial/processes/access-key');
assert.equal(editedJfrsProcess.hasAccessKey, true);
assert.equal(
  multiStore.state.processes.find(p => p.id === eprocExisting.id)?.hasAccessKey,
  true,
  'persistAccessKey deve marcar hasAccessKey também na cópia mantida em store.state.processes.'
);
assert.equal(multiStore.revision, 'rev-2', 'persistAccessKey deve atualizar store.revision com a revisão retornada.');
assert.equal(multiStore.adoptedRevisions.length, 0, 'persistAccessKey não pode chamar adoptServerRevision pois há edição pendente de flush.');
delete fakeElements['field-accessKey'];

const tjrsFallbackItem = { id: 'proc-tjrs-fb', number: '5005555-00.2026.8.21.0001', court: 'TJRS', client: 'Cliente TJRS Fallback', hasAccessKey: false };
assert.equal(await multiFeature.refreshAccessKeyStatus(tjrsFallbackItem), true, 'TJRS deve usar fallback em /api/judicial quando sidecar retornar 503.');
assert.equal(multiRequests.slice(-2)[0].url, '/api/integrations/tjrs-sidecar/processes/access-key/status?processNumber=5005555-00.2026.8.21.0001');
assert.equal(multiRequests.slice(-2)[1].url, '/api/judicial/processes/access-key/status?processNumber=5005555-00.2026.8.21.0001');
fakeElements['field-accessKey'] = { value: 'CHAVE-TJRS-FB' };
const savedTjrsFb = multiFeature.saveProcess({ number: tjrsFallbackItem.number, client: tjrsFallbackItem.client }, tjrsFallbackItem);
assert.equal(await multiFeature.persistAccessKey(savedTjrsFb), true);
assert.equal(multiRequests.slice(-2)[0].url, '/api/integrations/tjrs-sidecar/processes/access-key');
assert.equal(multiRequests.slice(-2)[1].url, '/api/judicial/processes/access-key');
assert.equal(multiStore.revision, 'rev-3', 'Fallback TJRS em persistAccessKey deve sincronizar store.revision.');
delete fakeElements['field-accessKey'];

// saveAccessKey: estado limpo adota revisão; estado sujo apenas atualiza store.revision sem mascarar edição pendente.
const jfrsStoreItem = multiStore.state.processes.find(p => p.id === eprocExisting.id);
jfrsStoreItem.hasAccessKey = false;
multiStore.persistedFingerprint = multiStore.persistenceFingerprint();
multiFeature.openAccessKeyDialog(jfrsStoreItem);
multiFakeDom.processAccessKeyInput.value = 'CHAVE-SAVE-CLEAN';
assert.equal(await multiFeature.saveAccessKey(), true);
assert.equal(jfrsStoreItem.hasAccessKey, true);
assert.equal(multiStore.revision, 'rev-4');
assert.deepEqual(multiStore.adoptedRevisions, ['rev-4'], 'saveAccessKey em store limpo deve chamar adoptServerRevision.');
assert.equal(multiStore.persistenceFingerprint(), multiStore.persistedFingerprint);

jfrsStoreItem.hasAccessKey = false;
jfrsStoreItem.stage = 'Edição pendente antes da chave';
assert.notEqual(multiStore.persistenceFingerprint(), multiStore.persistedFingerprint);
multiFeature.openAccessKeyDialog(jfrsStoreItem);
multiFakeDom.processAccessKeyInput.value = 'CHAVE-SAVE-DIRTY';
assert.equal(await multiFeature.saveAccessKey(), true);
assert.equal(jfrsStoreItem.hasAccessKey, true);
assert.equal(multiStore.revision, 'rev-5');
assert.deepEqual(multiStore.adoptedRevisions, ['rev-4'], 'saveAccessKey em store sujo não pode chamar adoptServerRevision.');
assert.notEqual(multiStore.persistenceFingerprint(), multiStore.persistedFingerprint);

// Andamento manual append-only: entra no array principal, preserva o anterior e não rebaixa o último.
const manualProcess = unitStore.state.processes[0];
const manualMovement = await unitFeature.appendMovement('unit-process', { date: '2026-09-05', description: 'Petição protocolada sintética', author: 'Advogada Teste' });
assert.equal(manualMovement.source, 'Interna');
assert.equal(manualMovement.manual, true);
assert.equal(manualMovement.date, '2026-09-05');
assert.equal(manualMovement.name, 'Petição protocolada sintética');
assert.equal(manualProcess.movements.length, 1);
assert.equal(manualProcess.lastMovement, 'Petição protocolada sintética');
assert.equal(manualProcess.lastMovementAt, '2026-09-05');
assert.deepEqual(unitAudits.at(-1), { action: 'Andamento manual registrado', detail: '5000000-00.2026.8.21.0001 · Petição protocolada sintética' });
await unitFeature.appendMovement('unit-process', { date: '2026-09-04', description: 'Andamento anterior sintético' });
assert.equal(manualProcess.movements.length, 2, 'Append preserva o andamento anterior.');
assert.equal(manualProcess.lastMovement, 'Petição protocolada sintética', 'Andamento mais antigo não rebaixa o último andamento.');
unitStore.flushResult = false;
const failedMovement = await unitFeature.appendMovement('unit-process', { date: '2026-09-06', description: 'Falha sintética de persistência' });
assert.equal(failedMovement, null);
assert.equal(manualProcess.movements.length, 2, 'Falha de flush restaura o array anterior.');
assert.equal(manualProcess.lastMovement, 'Petição protocolada sintética');
assert.equal(manualProcess.lastMovementAt, '2026-09-05');
assert.equal(unitStore.state.audit.some(entry => entry.detail.includes('Falha sintética')), false, 'Auditoria de falha não pode permanecer.');
unitStore.flushResult = true;

const unitButton = { dataset: { tjrsConsult: '5000000-00.2026.8.21.0001' }, disabled: false, textContent: 'Atualizar TJRS' };
// Sem A1, o TJRS não tem mais consulta por chave: nada é enviado e o usuário é orientado.
assert.equal(await unitFeature.consultTjrs(unitButton), false);
assert.equal(unitRequests.length, 1, 'Sem A1, nenhuma consulta ao TJRS por chave é enviada.');
assert.deepEqual(unitToasts.at(-1), { message: 'Para atualizar processos do TJRS, cadastre o Certificado A1 em Conexões.', type: 'error' });
assert.equal(unitButton.disabled, false);
// Com A1, a atualização usa somente o eproc.
unitStore.state.settings.hasA1Certificate = true;
await unitFeature.consultTjrs(unitButton);
assert.equal(unitRequests.length, 2);
assert.equal(unitRequests[1].url, '/api/integrations/eproc/processes/enrich-single');
assert.equal(unitRequests[1].options.method, 'POST');
assert.deepEqual(JSON.parse(unitRequests[1].options.body), { processId: 'unit-process', processNumber: '5000000-00.2026.8.21.0001', revision: 'unit-revision-1' });
assert.equal(unitRequests.some(request => request.url.includes('tjrs-sidecar/processes/sync')), false);
assert.equal(unitStore.revision, 'unit-revision-2');
assert.equal(unitStore.state.processes[0].lastMovement, 'Snapshot unitário');
assert.equal(unitButton.disabled, false);
assert.equal(unitButton.textContent, 'Atualizar TJRS');
assert.deepEqual(unitToasts.at(-1), { message: 'Snapshot unitário incorporado.', type: 'success' });

const rejectedToasts = [];
const rejectedFeature = createProcessesFeature({
  store: unitStore,
  documentRef: { getElementById: () => null, querySelectorAll: () => [] },
  normalizeText: String,
  escapeHtml: String,
  formatDate: String,
  formatMinutes: String,
  totalTimeMinutes: () => 0,
  sortRecords: records => records,
  updateTableSortHeaders: () => {},
  openModal: () => {},
  showToast: (message, type) => rejectedToasts.push({ message, type }),
  secureFetch: async () => { throw new Error('Rede TJRS indisponível'); },
  getLinkedTasks: () => [],
  getLinkedIntimations: () => [],
  isTerminalStatus: () => false
});
const rejectedButton = { dataset: { tjrsConsult: '5000000-00.2026.8.21.0001' }, disabled: false, textContent: 'Atualizar TJRS' };
await rejectedFeature.consultTjrs(rejectedButton);
assert.equal(rejectedButton.disabled, false, 'Botão TJRS deve ser restaurado após rejeição de rede.');
assert.deepEqual(rejectedToasts.at(-1), { message: 'Não foi possível atualizar este processo pelo eproc com o Certificado A1. Confira o certificado em Conexões.', type: 'error' });

const disposableNumber = '5009999-99.2026.8.21.0001';
const disposableProcess = { id: 'process-disposable', externalId: 'datajud:process-disposable', number: disposableNumber, client: 'Cliente Descartável', source: 'DataJud / CNJ', movements: [{ code: '1', name: 'Movimento', at: '2026-09-01T00:00:00.000Z' }] };
const lifecycleStore = {
  state: {
    processes: [structuredClone(disposableProcess)],
    tasks: [{ id: 'task-linked', process: disposableNumber, title: 'Tarefa preservada' }],
    intimations: [{ id: 'int-linked', process: disposableNumber, text: 'Publicação preservada' }],
    documents: [{ id: 'doc-linked', ownerType: 'process', ownerId: disposableProcess.id, name: 'Documento preservado', secretToken: 'nao-exportar' }],
    settings: {}, audit: [], configuration: { actionTypes: [], actionGroups: [] }
  },
  audit(action, detail) { this.state.audit.unshift({ action, detail }); },
  save() {},
  async flush() { return true; },
  upsert(collection, record) { this.state[collection].unshift(record); }
};
let exportedDossier;
const lifecycleFeature = createProcessesFeature({
  store: lifecycleStore,
  documentRef: { getElementById: () => null, querySelectorAll: () => [], documentElement: { dataset: { ui: 'v2' } } },
  normalizeText: value => String(value || '').toLowerCase(), escapeHtml: String, formatDate: String, formatMinutes: String,
  totalTimeMinutes: () => 0, sortRecords: records => records, updateTableSortHeaders: () => {}, openModal: () => {},
  showToast: () => {}, secureFetch: async () => ({ json: async () => ({}) }), getLinkedTasks: () => [], getLinkedIntimations: () => [], isTerminalStatus: () => false,
  exportJson: dossier => { exportedDossier = dossier; }, confirmProcessDeletion: () => disposableNumber, requestProcessReenable: () => disposableNumber
});
lifecycleFeature.render = () => [];
const mergedSources = lifecycleFeature.upsertExternalProcess({ ...disposableProcess, source: 'DataJud / CNJ + DJEN / CNJ Oficial + DataJud / CNJ' });
assert.equal(mergedSources.source, 'DataJud / CNJ + DJEN / CNJ Oficial', 'Origens compostas devem ser achatadas e deduplicadas.');
const dossier = lifecycleFeature.exportProcess(disposableProcess);
assert.equal(dossier.scope.processNumber, disposableNumber);
assert.equal(dossier.linked.tasks.length, 1);
assert.equal(dossier.linked.intimations.length, 1);
assert.equal(dossier.linked.documents.length, 1);
assert.equal(JSON.stringify(exportedDossier).includes('nao-exportar'), false, 'Dossiê não pode exportar segredo presente em metadata desconhecida.');
assert.equal(await lifecycleFeature.deleteProcess(disposableProcess), true);
assert.equal(lifecycleStore.state.processes.length, 0);
assert.equal(lifecycleStore.state.tasks[0].process, '');
assert.equal(lifecycleStore.state.tasks[0].unlinkedProcessNumber, disposableNumber);
assert.equal(lifecycleStore.state.intimations[0].process, '');
assert.equal(lifecycleStore.state.documents[0].ownerId, undefined);
assert.equal(lifecycleStore.state.documents[0].ownerType, undefined);
assert.equal(lifecycleStore.state.settings.processDiscoverySuppressions[0].cnj, disposableNumber.replace(/\D/g, ''));
assert.equal(lifecycleFeature.upsertExternalProcess(disposableProcess), null, 'Tombstone deve impedir ressurreição automática do processo excluído.');
assert.equal(await lifecycleFeature.reenableProcessDiscovery(disposableNumber), true);
assert.equal(lifecycleStore.state.settings.processDiscoverySuppressions.length, 0);
assert.ok(lifecycleFeature.upsertExternalProcess(disposableProcess), 'Processo pode voltar somente depois de reativação explícita.');

const server = await startTestServer({ env: { JEV_CMD_BIN: 'node', ATRIUM_SENDA_UNLOCK_PRO_DEV: '1' } });
const browser = await chromium.launch({ headless: true });

try {
  const moduleResponse = await fetch(`${server.baseUrl}/js/features/processes.js`);
  assert.equal(moduleResponse.status, 200, 'Módulo Processes deve ser servido com HTTP 200.');
  assert.match(moduleResponse.headers.get('content-type') || '', /javascript/, 'Módulo Processes deve usar MIME JavaScript.');

  const password = 'Senha-Teste-Processes-2026!';
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_processes',
    displayName: 'Advogada Processos',
    email: 'processes@example.test',
    password
  });
  const setup = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  assert.equal(response.status, 200, 'Setup administrativo da fixture deve concluir.');
  const cookiePair = response.headers.get('set-cookie').split(';')[0];
  const separator = cookiePair.indexOf('=');

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
  await context.addCookies([{
    name: cookiePair.slice(0, separator),
    value: cookiePair.slice(separator + 1),
    url: server.baseUrl
  }]);
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('jurisflow_tour_completed', 'true');
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('atrium_tour_seen', 'true');
    localStorage.setItem('atrium:ui:mode', 'classic');
  });
  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  await page.waitForFunction(() => Boolean(window.Atrium?.Store?.state));

  const fixture = await page.evaluate(async () => {
    // Exercita a compatibilidade interna legada; o bootstrap público continua exclusivamente V2.
    document.documentElement.dataset.ui = 'classic';
    const store = window.Atrium.Store;
    const app = window.portalApp;
    const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const today = localDate(new Date());
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = localDate(tomorrowDate);
    const explicitDeadlineDate = new Date();
    explicitDeadlineDate.setDate(explicitDeadlineDate.getDate() + 8);
    const explicitDeadline = localDate(explicitDeadlineDate);

    store.state.settings.demoMode = false;
    store.state.processes = [
      {
        id: 'process-tjrs', number: '5001234-56.2026.8.21.0001', oldNumber: '001/1.26.0000001-0',
        protocol: 'PROTOCOLO-TJRS', nb: '000.000.000-0', client: 'Cliente Processo Modular',
        clientPosition: 'Autor(a)', opposingParty: 'Parte Contrária Sintética', court: 'TJRS',
        county: 'Comarca Sintética', courtUnit: '1ª Vara Cível Sintética', actionGroup: 'Cível',
        actionType: 'Ação Sintética', judicialPhase: 'Conhecimento', stage: 'Instrução', risk: 'possivel',
        monitoring: 'active', responsible: 'Advogada Processos', caseFolder: 'PASTA-TESTE', secrecy: true,
        feeType: 'exito', feePercentage: 30, feeStatus: 'pendente', source: 'eproc',
        registeredAt: '2026-08-20', createdAt: '2026-08-20T10:00:00.000Z',
        lastMovement: 'Despacho sintético disponibilizado', lastMovementAt: '2026-08-25'
      },
      {
        id: 'process-federal', number: '5009999-00.2026.4.04.0001', client: 'Cliente Federal Sintético',
        opposingParty: 'Autarquia Sintética', court: 'TRF4', county: 'Seção Federal Sintética',
        monitoring: 'inactive', feeType: 'fixo', feeAmount: 2500, feeStatus: 'em_dia', source: 'DataJud',
        createdAt: '2026-08-28T09:00:00.000Z', lastMovement: 'Movimento federal sintético', lastMovementAt: '2026-08-27'
      }
    ];
    store.state.tasks = [
      {
        id: 'process-task-explicit', title: 'Tarefa vinculada com prazo explícito', process: '5001234-56.2026.8.21.0001',
        status: 'andamento', deadline: explicitDeadline, fatalDeadline: tomorrow, description: 'Prazo confirmado manualmente',
        timeLogs: [{ id: 'process-time-1', minutes: 30, date: today, description: 'Estudo sintético' }]
      },
      {
        id: 'process-task-text-only', title: 'Apelação em 15 dias', process: '5001234-56.2026.8.21.0001',
        status: 'concluida', description: 'Embargos e prazo fatal citados apenas como texto',
        timeLogs: [{ id: 'process-time-2', minutes: 45, date: today, description: 'Análise sintética' }]
      }
    ];
    store.state.intimations = [{
      id: 'process-intimation', title: 'Intimação vinculada sintética', process: '5001234-56.2026.8.21.0001',
      text: 'Apelação em 15 dias, embargos e prazo fatal apenas em texto.', publishedAt: today,
      treatmentStatus: 'untreated', unread: true
    }];
    store.state.audit = [];
    app.renderAll();
    await store.flush();
    return { today, tomorrow, explicitDeadline };
  });

  await page.evaluate(() => window.Atrium.App.switchView('processes'));
  await page.locator('#view-processes.active').waitFor();
  assert.deepEqual(
    await page.locator('#processTableBody [data-process-id]').evaluateAll(rows => rows.map(row => row.dataset.processId)),
    ['process-federal', 'process-tjrs'],
    'Ordenação inicial deve permanecer registeredAt desc.'
  );
  assert.equal(await page.locator('#processTable th[data-sort-field="registeredAt"].sorted-desc').count(), 1);

  const tjrsRow = page.locator('#processTableBody [data-process-id="process-tjrs"]');
  const tjrsText = await tjrsRow.textContent();
  for (const expected of [
    '5001234-56.2026.8.21.0001', 'Segredo de justiça', 'PASTA-TESTE', 'NB 000.000.000-0',
    'Autor(a)', 'Cliente Processo Modular', 'Parte Contrária Sintética', '30% êxito', 'pendente',
    'TJRS', 'Ação Sintética', 'Conhecimento', 'Instrução', 'Risco Médio', 'eproc',
    'Despacho sintético disponibilizado', 'Monitorando', 'Atualizar TJRS'
  ]) assert.ok(tjrsText.includes(expected), `Tabela deve preservar semanticamente: ${expected}`);
  assert.equal(await page.locator('#processTableBody [data-process-id="process-federal"] [data-tjrs-consult]').count(), 0);

  const searchCases = [
    ['5001234-56.2026.8.21.0001', 'process-tjrs'],
    ['Cliente Processo Modular', 'process-tjrs'],
    ['tjrs', 'process-tjrs'],
    ['Comarca Sintética', 'process-tjrs'],
    ['Comarca Sintetica', 'process-tjrs'],
    ['000.000.000-0', 'process-tjrs'],
    ['Parte Contrária Sintética', 'process-tjrs'],
    ['2026-08-20', 'process-tjrs'],
    ['2026-08-28', 'process-federal']
  ];
  for (const [query, expectedId] of searchCases) {
    await page.locator('#processSearch').fill(query);
    await page.locator(`#processTableBody [data-process-id="${expectedId}"]`).waitFor();
    assert.equal(await page.locator('#processTableBody [data-process-id]').count(), 1, `Busca deve localizar apenas ${expectedId} por ${query}.`);
  }
  await page.locator('#processSearch').fill('registro inexistente fase 9');
  assert.match(await page.locator('#processTableBody').textContent(), /Nenhum processo encontrado/);
  await page.locator('#processSearch').fill('');

  await page.locator('#processTable th[data-sort-field="client"]').click();
  assert.equal(await page.locator('#processTable th[data-sort-field="client"].sorted-asc').count(), 1);
  await page.locator('#processTable th[data-sort-field="client"]').click();
  assert.equal(await page.locator('#processTable th[data-sort-field="client"].sorted-desc').count(), 1);
  await page.locator('#processTable th[data-sort-field="lastMovementAt"]').click();
  assert.equal(await page.locator('#processTable th[data-sort-field="lastMovementAt"].sorted-desc').count(), 1);

  const crossDomainBefore = await page.evaluate(() => JSON.stringify({
    tasks: window.Atrium.Store.state.tasks,
    intimations: window.Atrium.Store.state.intimations
  }));
  await page.locator('#processTableBody [data-process-id="process-tjrs"]').click();
  const summary = page.locator('[data-process-summary]');
  await summary.waitFor();
  const summaryText = await summary.textContent();
  for (const expected of ['5001234-56.2026.8.21.0001', 'Cliente Processo Modular', 'TJRS', 'Tarefas abertas', 'Intimações', '1h15m', 'Tempo apontado', 'Próximo prazo', 'Despacho sintético disponibilizado']) {
    assert.ok(summaryText.includes(expected), `Resumo deve preservar: ${expected}`);
  }
  const summaryMetrics = summary.locator('.process-summary-metrics > div');
  assert.equal(await summaryMetrics.nth(0).locator('strong').textContent(), '1', 'Tarefa terminal deve ficar fora das tarefas abertas.');
  assert.equal(await summaryMetrics.nth(1).locator('strong').textContent(), '1');
  assert.equal(await summaryMetrics.nth(2).locator('strong').textContent(), '1h15m');
  assert.equal(await summaryMetrics.nth(3).locator('strong').textContent(), fixture.tomorrow.split('-').reverse().join('/'), 'fatalDeadline explícito deve preceder deadline explícito no resumo.');
  const crossDomainAfter = await page.evaluate(() => JSON.stringify({
    tasks: window.Atrium.Store.state.tasks,
    intimations: window.Atrium.Store.state.intimations
  }));
  assert.equal(crossDomainAfter, crossDomainBefore, 'Abrir resumo não pode alterar Tasks ou Publicações.');
  const noInference = await page.evaluate(() => {
    const task = window.Atrium.Store.state.tasks.find(item => item.id === 'process-task-text-only');
    const intimation = window.Atrium.Store.state.intimations.find(item => item.id === 'process-intimation');
    return {
      taskDeadline: Object.hasOwn(task, 'deadline'), taskFatal: Object.hasOwn(task, 'fatalDeadline'),
      intimationDeadline: Object.hasOwn(intimation, 'deadline'), intimationFatal: Object.hasOwn(intimation, 'fatalDeadline')
    };
  });
  assert.deepEqual(noInference, { taskDeadline: false, taskFatal: false, intimationDeadline: false, intimationFatal: false });
  await page.click('#modalCancel');

  let requestCount = 0;
  let requestPayload = null;
  let requestMethod = null;
  let tjrsMode = 'success';
  let releaseRequest;
  let requestStartedResolve;
  let requestStarted = new Promise(resolve => { requestStartedResolve = resolve; });
  const tjrsRevision = await page.evaluate(() => window.Atrium.Store.revision);
  // A consulta por chave foi desativada: o botão do TJRS usa só o eproc com A1.
  await page.route('**/api/integrations/eproc/processes/enrich-single', async route => {
    requestCount++;
    requestMethod = route.request().method();
    requestPayload = route.request().postDataJSON();
    requestStartedResolve();
    if (tjrsMode === 'success') await new Promise(resolve => { releaseRequest = resolve; });
    await route.fulfill({
      status: tjrsMode === 'success' ? 200 : 503,
      contentType: 'application/json',
      body: JSON.stringify(tjrsMode === 'success'
        ? {
            ok: true,
            revision: tjrsRevision,
            message: 'Snapshot sintético incorporado.',
            process: {
              id: 'process-tjrs', number: '5001234-56.2026.8.21.0001', oldNumber: '001/1.26.0000001-0',
              protocol: 'PROTOCOLO-TJRS', nb: '000.000.000-0', client: 'Cliente Processo Modular',
              clientPosition: 'Autor(a)', opposingParty: 'Parte Contrária Sintética', court: 'TJRS',
              county: 'Comarca Sintética', courtUnit: '1ª Vara Cível Sintética', actionGroup: 'Cível',
              actionType: 'Ação Sintética', judicialPhase: 'Conhecimento', stage: 'Instrução', risk: 'possivel',
              monitoring: 'active', responsible: 'Advogada Processos', caseFolder: 'PASTA-TESTE', secrecy: true,
              feeType: 'exito', feePercentage: 30, feeStatus: 'pendente', source: 'eproc',
              registeredAt: '2026-08-20', createdAt: '2026-08-20T10:00:00.000Z',
              lastMovement: 'Snapshot sintético incorporado', lastMovementAt: '2026-09-03T10:00:00.000Z',
              movements: [{ eventNumber: 10, date: '2026-09-03T10:00:00.000Z', description: 'Snapshot sintético incorporado', source: 'TJRS_PUBLIC' }]
            }
          }
        : { ok: false, state: 'UNAVAILABLE', message: 'Falha sintética controlada.' })
    });
  });
  await page.evaluate(() => {
    window.__processOpenCalls = [];
    window.open = (...args) => { window.__processOpenCalls.push(args); return null; };
  });
  assert.equal(requestCount, 0, 'Render e modal não podem consultar TJRS automaticamente.');
  const consultButton = page.locator('#processTableBody [data-process-id="process-tjrs"] [data-tjrs-consult]');
  const successClick = consultButton.click();
  await requestStarted;
  assert.equal(await consultButton.isDisabled(), true, 'Botão TJRS deve ficar desabilitado durante request.');
  releaseRequest();
  await successClick;
  await page.locator('#toastRegion .toast.success', { hasText: 'Snapshot sintético incorporado.' }).waitFor();
  assert.equal(requestCount, 1);
  assert.equal(requestMethod, 'POST');
  assert.deepEqual(requestPayload, { processId: 'process-tjrs', processNumber: '5001234-56.2026.8.21.0001', revision: tjrsRevision });
  assert.equal(await consultButton.isDisabled(), false, 'Botão TJRS deve ser restaurado após request.');
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.processes.find(item => item.id === 'process-tjrs').lastMovement), 'Snapshot sintético incorporado');
  assert.deepEqual(await page.evaluate(() => window.__processOpenCalls), []);

  tjrsMode = 'failure';
  requestStarted = new Promise(resolve => { requestStartedResolve = resolve; });
  await consultButton.click();
  await page.locator('#toastRegion .toast.error', { hasText: 'Falha sintética controlada.' }).waitFor();
  assert.equal(requestCount, 2, 'Cada clique explícito deve gerar exatamente um request TJRS.');
  assert.equal(await consultButton.isDisabled(), false, 'Botão TJRS deve ser restaurado após resposta de falha.');
  assert.equal((await page.evaluate(() => window.__processOpenCalls)).length, 0, 'Falha TJRS não pode navegar.');

  const reauthenticatedOpenCount = await page.evaluate(() => {
    const app = window.portalApp;
    const originalOpenModal = app.openModal;
    let openCount = 0;
    app.openModal = function (...args) {
      openCount++;
      return originalOpenModal.apply(this, args);
    };
    window.dispatchEvent(new CustomEvent('keller:authenticated'));
    document.getElementById('newProcessButton').click();
    app.openModal = originalOpenModal;
    return openCount;
  });
  assert.equal(reauthenticatedOpenCount, 1, 'Segundo evento de autenticação não pode duplicar listeners de Processos.');
  await page.locator('#modalTitle', { hasText: 'Cadastrar processo' }).waitFor();
  await page.click('#modalCancel');

  await page.click('#newProcessButton');
  await page.locator('#modalTitle', { hasText: 'Cadastrar processo' }).waitFor();
  const expectedFields = [
    'number', 'oldNumber', 'originNumbers', 'nb', 'client', 'clientPosition', 'opposingParty', 'actionGroup', 'actionType',
    'actionClass', 'subject', 'judicialPhase', 'risk', 'stage', 'protocol', 'caseFolder', 'court', 'county', 'courtUnit',
    'competence', 'judge', 'responsible',
    // Identidade oculta do combobox de responsáveis (mesmo contrato do assigneeUserId em Tarefas).
    'responsibleUserId',
    'registeredAt', 'lastMovementAt', 'lastMovement', 'feeType', 'feePercentage', 'feeAmount', 'feeMonthly', 'caseValue',
    'feeStatus', 'requisitionType', 'requisitionAmount', 'requisitionBank', 'requisitionStatus', 'feeNotes',
    'secrecy', 'monitoring', 'notes'
  ];
  assert.deepEqual(await page.locator('#modalForm [name]').evaluateAll(elements => elements.map(element => element.name)), expectedFields);
  await page.fill('#field-number', '5007777-85.2026.4.04.0001');
  await page.fill('#field-client', 'Cliente CRUD Processos');
  await page.fill('#field-court', 'TRF4');
  await page.fill('#field-county', 'Seção Sintética CRUD');
  await page.fill('#field-stage', 'Cadastro inicial');
  await page.fill('#field-registeredAt', fixture.today);
  await page.fill('#field-lastMovementAt', fixture.today);
  await page.fill('#field-lastMovement', 'Movimento inicial sintético');
  await page.selectOption('#field-feeType', 'misto');
  await page.fill('#field-feePercentage', '25');
  await page.fill('#field-feeAmount', '1250');
  await page.fill('#field-feeMonthly', '350');
  await page.selectOption('#field-secrecy', 'true');
  await page.selectOption('#field-monitoring', 'active');
  await page.click('#modalForm button[type="submit"]');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const created = await page.evaluate(() => window.Atrium.Store.state.processes.find(item => item.number === '5007777-85.2026.4.04.0001'));
  assert.ok(created?.id?.startsWith('proc-'));
  assert.equal(created.source, 'Interna');
  assert.equal(created.lastMovement, 'Movimento inicial sintético');
  assert.equal(created.lastMovementAt, fixture.today);
  assert.equal(created.feePercentage, 25);
  assert.equal(created.feeAmount, 1250);
  assert.equal(created.feeMonthly, 350);
  assert.equal(created.secrecy, true);
  assert.ok(Date.parse(created.updatedAt));
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.audit.some(item => item.action === 'Processo cadastrado' && item.detail.includes('5007777-85.2026.4.04.0001'))), true);

  await page.locator(`#processTableBody [data-process-id="${created.id}"]`).click();
  await page.fill('#field-stage', 'Etapa editada Fase 9');
  await page.fill('#field-feePercentage', '35');
  await page.fill('#field-feeAmount', '');
  await page.click('#modalForm button[type="submit"]');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const edited = await page.evaluate(id => window.Atrium.Store.state.processes.find(item => item.id === id), created.id);
  assert.equal(edited.id, created.id);
  assert.equal(edited.client, 'Cliente CRUD Processos');
  assert.equal(edited.court, 'TRF4');
  assert.equal(edited.stage, 'Etapa editada Fase 9');
  assert.equal(edited.feePercentage, 35);
  assert.equal(edited.feeAmount, null);
  assert.equal(edited.feeMonthly, 350);
  assert.equal(edited.secrecy, true);
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.audit.some(item => item.action === 'Processo atualizado' && item.detail.includes('5007777-85.2026.4.04.0001'))), true);

  await page.locator('#globalSearch').fill('5007777-85.2026.4.04.0001');
  await page.locator('#globalSearchPalette:not(.hidden)').waitFor();
  await page.locator(`[data-search-target="process"][data-search-id="${created.id}"]`).click();
  await page.locator('#view-processes.active').waitFor();
  assert.equal(await page.locator('#processSearch').inputValue(), '5007777-85.2026.4.04.0001');
  assert.equal(await page.locator(`#processTableBody [data-process-id="${created.id}"]`).count(), 1);

  await page.evaluate(() => window.Atrium.App.switchView('dashboard'));
  await page.locator('#view-dashboard.active').waitFor();
  assert.equal(await page.locator('#metricTasks').textContent(), '2', 'Métrica histórica deve contar monitoring diferente de inactive.');

  await page.evaluate(() => window.Atrium.App.switchView('financial'));
  await page.locator('#view-financial.active').waitFor();
  await page.click('#newFinancialEntryButton');
  await page.selectOption('#finProcessSelect', created.id);
  await page.selectOption('#finTypeSelect', 'rpv');
  await page.selectOption('#finStatusSelect', 'aguardando_deposito');
  await page.fill('#finGrossInput', '50000');
  await page.fill('#finFeePctInput', '20');
  await page.click('#financialEntryForm button[type="submit"]');
  await page.locator('#financialEntryBackdrop').waitFor({ state: 'hidden' });
  const financeMutation = await page.evaluate(id => window.Atrium.Store.state.processes.find(item => item.id === id), created.id);
  assert.equal(financeMutation.requisitionAmount, 50000);
  assert.equal(financeMutation.feePercentage, 35, 'Lançamento RPV deve preservar percentual contratual manual.');
  assert.equal(financeMutation.feeAmount, null, 'Lançamento RPV não pode fabricar honorário fixo.');
  assert.equal(financeMutation.requisitionStatus, 'aguardando_deposito');
  assert.equal(financeMutation.feeType, 'misto', 'Lançamento RPV deve preservar enum oficial do contrato.');
  await page.evaluate(() => window.Atrium.App.switchView('processes'));
  await page.locator('#processSearch').fill('5007777-85.2026.4.04.0001');
  await page.locator(`#processTableBody [data-process-id="${created.id}"] .fee-chip`, { hasText: '35% êxito' }).waitFor();

  await page.evaluate(() => window.Atrium.Store.flush());
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  await page.waitForFunction(() => Boolean(window.Atrium?.Store?.state));
  await page.evaluate(() => window.Atrium.App.switchView('processes'));
  const persisted = await page.evaluate(id => window.Atrium.Store.state.processes.find(item => item.id === id), created.id);
  assert.equal(persisted.stage, 'Etapa editada Fase 9');
  assert.equal(persisted.requisitionAmount, 50000);
  assert.equal(persisted.feeAmount, null);
  assert.equal(persisted.feePercentage, 35);
  assert.equal(persisted.feeType, 'misto');
  assert.equal(persisted.secrecy, true);
  assert.deepEqual(pageErrors, [], `Erros de página detectados: ${pageErrors.join(' | ')}`);

  await context.close();
} finally {
  await browser.close();
  await server.stop();
}

console.log('✓ Caracterização aprovada: pesquisa, sort, tabela, CRUD, resumo, TJRS e integrações externas.');
process.exit(0);
