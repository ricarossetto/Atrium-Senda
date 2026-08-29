import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { createMonitoringFeature } from '../js/features/monitoring.js';
import { postJson, startTestServer } from './helpers.mjs';

const monitoringSource = readFileSync(new URL('../js/features/monitoring.js', import.meta.url), 'utf8');
const portalSource = readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
assert.match(monitoringSource, /export function createMonitoringFeature/);
assert.doesNotMatch(monitoringSource, /^\s*import\s/m);
assert.doesNotMatch(monitoringSource, /\bfetch\s*\(/);
assert.match(portalSource, /renderMonitoring\(\) \{ return getMonitoringFeature\(\)\.render\(\); \}/);
assert.match(portalSource, /openTermModal\(defaults = \{\}\) \{ return getMonitoringFeature\(\)\.openTermModal\(defaults\); \}/);
assert.match(portalSource, /getMonitoringFeature\(\)\.saveTerm\(data, this\.modalMode\.defaults\)/);
assert.doesNotMatch(portalSource, /getElementById\('newTermButton'\)|byId\('newTermButton'\)|monitorSourceList.*addEventListener/);

const listenerCounts = new Map();
const listenerElements = new Map(['newTermButton', 'primaryTermCard', 'monitorSourceList'].map(id => [id, {
  addEventListener(type) { listenerCounts.set(`${id}:${type}`, (listenerCounts.get(`${id}:${type}`) || 0) + 1); }
}]));
const unitRoutes = [];
const unitStore = {
  state: {
    terms: [{ id: 'term-primary', name: 'Titular Sintética', registration: 'OAB/RS 000000' }],
    sources: [{ id: 'generic-source', name: 'Fonte Sintética', status: 'off' }],
    settings: {},
    intimations: []
  }
};
const unitFeature = createMonitoringFeature({
  store: unitStore,
  documentRef: { getElementById: id => listenerElements.get(id) || null },
  openModal: (mode, _title, _subtitle, _fields, defaults) => {
    if (mode === 'term') unitRoutes.push(`term:${defaults.id}`);
    else if (mode === 'source') unitRoutes.push(`source:${defaults.id}`);
    else unitRoutes.push(mode);
  },
  onOpenJudicialSetup: () => unitRoutes.push('judicial'),
  onOpenCalendarConfig: () => unitRoutes.push('calendar')
});
assert.equal(unitFeature.init(), true);
assert.equal(unitFeature.init(), false);
for (const id of ['newTermButton:click', 'primaryTermCard:click', 'monitorSourceList:click']) assert.equal(listenerCounts.get(id), 1);
for (const id of ['a1', 'external-calendar', 'djen-cnj', 'datajud-cnj', 'generic-source']) unitFeature.routeSource(id);
assert.deepEqual(unitRoutes, ['judicial', 'calendar', 'term:term-primary', 'datajud', 'source:generic-source']);

const failureToasts = [];
let failureClosed = false;
const flushFailureFeature = createMonitoringFeature({
  store: {
    state: { terms: [], sources: [], settings: {}, intimations: [] },
    audit() {}, save() {}, async flush() { return false; }
  },
  documentRef: { getElementById: () => null },
  showToast: (message, type) => failureToasts.push({ message, type }),
  closeModal: () => { failureClosed = true; }
});
await assert.rejects(() => flushFailureFeature.saveDataJud({ apiKey: 'SYNTHETIC_PUBLIC_KEY' }), /persistir/);
assert.equal(failureClosed, false);
assert.equal(failureToasts.some(item => item.type === 'success'), false);

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

try {
  const session = await setupMaster(server.baseUrl);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const separator = session.cookie.indexOf('=');
  await context.addCookies([{ name: session.cookie.slice(0, separator), value: session.cookie.slice(separator + 1), url: server.baseUrl }]);
  const page = await context.newPage();
  await page.addInitScript(() => {
    const NativeDate = Date;
    const fixedNow = NativeDate.parse('2026-08-29T15:00:00-03:00');
    class FixedDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [fixedNow])); }
      static now() { return fixedNow; }
    }
    window.Date = FixedDate;
    localStorage.setItem('jurisflow_tour_completed', 'true');
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('atrium_tour_seen', 'true');
  });
  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();

  const characterization = await page.evaluate(async () => {
    const app = window.portalApp;
    const store = window.Atrium.Store;
    store.state.terms = [
      { id: 'term-primary', name: 'Advogada Principal Sintética', registration: 'OAB/RS 000000', type: 'oab', active: true },
      { id: 'term-secondary', name: 'Advogado Secundário Sintético', registration: 'OAB/SC 000001', type: 'oab', active: true }
    ];
    store.state.sources = [
      { id: 'a1', short: 'A1', name: 'Certificado Sintético', detail: 'Detalhe A1', method: 'mTLS', status: 'ok', lastCheck: '2026-08-29T15:00:00.000Z' },
      { id: 'external-calendar', short: 'CAL', name: 'Agenda Sintética', detail: 'Detalhe agenda', method: 'iCal', status: 'attention' },
      { id: 'djen-cnj', short: 'DJEN', name: 'DJEN Sintético', detail: 'Detalhe DJEN', method: 'API', status: 'error' },
      { id: 'datajud-cnj', short: 'DJ', name: 'DataJud Sintético', detail: 'Detalhe DataJud', method: 'API', status: 'planned' },
      { id: 'generic-source', short: 'GEN', name: 'Fonte Genérica Sintética', detail: 'Detalhe genérico', method: 'Manual', status: 'off' }
    ];
    store.state.intimations = [{ id: 'int-new', status: 'nova' }, { id: 'int-read', status: 'lida' }];
    store.state.settings.datajudApiKey = 'SYNTHETIC_DATAJUD_PUBLIC_KEY';
    app.filteredIntimations = () => [{ id: 'int-new', status: 'nova' }, { id: 'int-cutoff', status: 'nova' }, { id: 'int-read', status: 'lida' }];
    app.renderMonitoring();

    const render = {
      name: document.getElementById('primaryTermName').textContent,
      registration: document.getElementById('primaryTermRegistration').textContent,
      avatar: document.getElementById('primaryTermAvatar').textContent,
      sourceCount: document.getElementById('termSourceCount').textContent,
      issueCount: document.getElementById('termIssueCount').textContent,
      newCount: document.getElementById('termNewCount').textContent,
      sourceHtml: document.getElementById('monitorSourceList').innerHTML
    };

    return { render, termCount: store.state.terms.length };
  });

  // Characterization of modal records is kept separate so route spies cannot affect it.
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  const records = await page.evaluate(async () => {
    const app = window.portalApp;
    const store = window.Atrium.Store;
    store.state.terms = [
      { id: 'term-primary', name: 'Advogada Principal Sintética', registration: 'OAB/RS 000000', type: 'oab', active: true },
      { id: 'term-secondary', name: 'Advogado Secundário Sintético', registration: 'OAB/SC 000001', type: 'oab', active: true }
    ];
    store.state.sources = [{ id: 'source-edit', name: 'Fonte Inicial', short: 'FI', method: 'Manual', status: 'off', detail: 'Inicial' }];
    store.state.settings.datajudApiKey = 'SYNTHETIC_DATAJUD_PUBLIC_KEY';
    const audits = [];
    store.audit = (action, detail) => audits.push({ action, detail });
    let saves = 0;
    let flushes = 0;
    store.save = () => { saves++; return true; };
    store.flush = async () => { flushes++; return true; };

    app.openTermModal({ id: 'term-primary', name: 'Advogada Principal Sintética', registration: 'OAB/RS 000000', type: 'oab', active: true });
    const ufOptions = [...document.getElementById('field-oabUf').options].map(option => option.value);
    const termForm = document.getElementById('modalForm');
    termForm.elements.name.value = 'Advogada Editada Sintética';
    termForm.elements.type.value = 'oab';
    termForm.elements.oabNumber.value = 'OAB 001.002';
    termForm.elements.oabUf.value = 'SC';
    await app.handleModalSubmit({ preventDefault() {}, currentTarget: termForm });
    const editedTerm = structuredClone(store.state.terms[0]);
    const secondaryAfterEdit = structuredClone(store.state.terms[1]);

    app.openTermModal();
    const documentForm = document.getElementById('modalForm');
    documentForm.elements.name.value = 'Pessoa Documento Sintética';
    documentForm.elements.type.value = 'document';
    documentForm.elements.document.value = 'DOCUMENTO-SINTETICO-000';
    await app.handleModalSubmit({ preventDefault() {}, currentTarget: documentForm });
    const documentTerm = structuredClone(store.state.terms.find(term => term.name === 'Pessoa Documento Sintética'));

    app.openTermModal();
    const nameForm = document.getElementById('modalForm');
    nameForm.elements.name.value = 'Pessoa Nome Sintética';
    nameForm.elements.type.value = 'name';
    await app.handleModalSubmit({ preventDefault() {}, currentTarget: nameForm });
    const nameTerm = structuredClone(store.state.terms.find(term => term.name === 'Pessoa Nome Sintética'));

    app.openSourceModal(store.state.sources[0]);
    const sourceForm = document.getElementById('modalForm');
    sourceForm.elements.name.value = 'Fonte Editada Sintética';
    sourceForm.elements.status.value = 'attention';
    sourceForm.elements.detail.value = 'Detalhe público sintético';
    await app.handleModalSubmit({ preventDefault() {}, currentTarget: sourceForm });
    const sourceRecord = structuredClone(store.state.sources[0]);

    app.openDataJudConfigModal();
    const dataJudDefaults = structuredClone(app.modalMode.defaults);
    const dataJudForm = document.getElementById('modalForm');
    dataJudForm.elements.apiKey.value = 'SYNTHETIC_DATAJUD_UPDATED_KEY';
    dataJudForm.elements.autoSync.value = 'manual';
    dataJudForm.elements.tribunals.value = 'TJXX, TRF0';
    await app.handleModalSubmit({ preventDefault() {}, currentTarget: dataJudForm });

    return {
      ufOptions,
      editedTerm,
      secondaryAfterEdit,
      documentTerm,
      nameTerm,
      sourceRecord,
      dataJudDefaults,
      dataJudKey: store.state.settings.datajudApiKey,
      termCount: store.state.terms.length,
      audits,
      saves,
      flushes
    };
  });

  assert.equal(characterization.render.name, 'Advogada Principal Sintética');
  assert.equal(characterization.render.registration, 'OAB/RS 000000 · Advogado(a) monitorado(a) principal');
  assert.equal(characterization.render.sourceCount, '5');
  assert.equal(characterization.render.issueCount, '2');
  assert.equal(characterization.render.newCount, '2');
  assert.equal(characterization.termCount, 2);
  assert.equal(records.ufOptions.length, 27);
  assert.equal(records.editedTerm.id, 'term-primary');
  assert.equal(records.editedTerm.registration, 'OAB/SC 001002');
  assert.equal(records.editedTerm.oabNumber, '001002');
  assert.equal(records.secondaryAfterEdit.id, 'term-secondary');
  assert.equal(records.documentTerm.registration, 'DOCUMENTO-SINTETICO-000');
  assert.equal(records.nameTerm.registration, 'Pessoa Nome Sintética');
  assert.equal(records.sourceRecord.name, 'Fonte Editada Sintética');
  assert.equal(records.sourceRecord.status, 'attention');
  assert.equal(records.dataJudDefaults.apiKey, 'SYNTHETIC_DATAJUD_PUBLIC_KEY');
  assert.equal(records.dataJudKey, 'SYNTHETIC_DATAJUD_UPDATED_KEY');
  assert.equal(records.termCount, 4);
  assert.ok(records.saves >= 5);
  assert.ok(records.flushes >= 5);
  const sourceHtmlHash = createHash('sha256').update(characterization.render.sourceHtml, 'utf8').digest('hex');
  assert.equal(sourceHtmlHash, 'ee161fa95a64d817ad5d9817221cab0db44f176e7381e529958fc904f976460a');
  console.log(`✓ Feature modular de monitoramento preservada (${sourceHtmlHash.slice(0, 12)}, 27 UFs, múltiplos termos e flush seguro)`);
  await context.close();
} finally {
  await browser.close();
  await server.stop();
}

async function setupMaster(baseUrl) {
  let response = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'admin.monitoring.feature', displayName: 'Administradora Monitoramento Sintética', password: 'Monitoring-Feature-2026!'
  });
  const setup = await response.json();
  assert.equal(response.status, 200);
  response = await postJson(`${baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie').split(';')[0] };
}
