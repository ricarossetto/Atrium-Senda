import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMonitoringFeature } from '../js/features/monitoring.js';
import { prepareUiV2MonitoringFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [featureSource, presenterSource, portalSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/monitoring.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/views/ui-v2/monitoring-presenter.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/portal.js'), 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 SYSTEM MONITORING WORKSPACE');
console.log('===============================================================\n');

assert.equal((portalSource.match(/createMonitoringFeature\s*\(/g) || []).length, 1);
assert.doesNotMatch(featureSource, /^\s*import\s/m);
assert.doesNotMatch(featureSource, /\b(?:fetch|secureFetch|XMLHttpRequest|WebSocket|setInterval)\b/);
assert.doesNotMatch(presenterSource, /\bStore\b|store\.state|\bfetch\s*\(|secureFetch|setTimeout|setInterval|\bsave\s*\(|\bflush\s*\(|\baudit\s*\(|datajudApiKey|cDZHY/);

const listeners = new Map();
const routes = [];
const fakeElement = id => ({
  id,
  addEventListener(type, listener) { listeners.set(`${id}:${type}`, [...(listeners.get(`${id}:${type}`) || []), listener]); }
});
const fakeElements = new Map(['newTermButton', 'primaryTermCard', 'monitorSourceList'].map(id => [id, fakeElement(id)]));
const unitFeature = createMonitoringFeature({
  store: {
    state: {
      terms: [{ id: 'unit-primary', name: 'Titular Unitária', registration: 'OAB/RS 1' }],
      sources: [{ id: 'generic-source', name: 'Fonte Unitária', status: 'off' }],
      settings: {}, intimations: []
    }
  },
  documentRef: { documentElement: { dataset: { ui: 'v2' } }, getElementById: id => fakeElements.get(id) || null },
  openModal: (mode, _title, _subtitle, _fields, defaults) => routes.push(mode === 'term' || mode === 'source' ? `${mode}:${defaults.id}` : mode),
  onOpenJudicialSetup: () => routes.push('judicial'),
  onOpenCalendarConfig: () => routes.push('calendar')
});
assert.equal(unitFeature.init(), true);
assert.equal(unitFeature.init(), false);
for (const key of ['newTermButton:click', 'primaryTermCard:click', 'primaryTermCard:keydown', 'monitorSourceList:click', 'monitorSourceList:keydown']) {
  assert.equal(listeners.get(key)?.length, 1, `${key} deve possuir exatamente um listener.`);
}
for (const id of ['a1', 'pje', 'external-calendar', 'djen-cnj', 'djen', 'datajud-cnj', 'datajud', 'generic-source', 'missing-source']) unitFeature.routeSource(id);
assert.deepEqual(routes, ['judicial', 'judicial', 'calendar', 'term:unit-primary', 'term:unit-primary', 'datajud', 'datajud', 'source:generic-source']);

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });
  const fixture = await prepareUiV2MonitoringFixture(page);

  const baseline = await page.evaluate(() => {
    const { Store } = window.Atrium;
    const originals = { audit: Store.audit.bind(Store), save: Store.save.bind(Store), flush: Store.flush.bind(Store) };
    window.__monitoringV2Calls = { audit: 0, save: 0, flush: 0 };
    window.__monitoringV2Originals = originals;
    Store.audit = (...args) => { window.__monitoringV2Calls.audit++; return originals.audit(...args); };
    Store.save = (...args) => { window.__monitoringV2Calls.save++; return originals.save(...args); };
    Store.flush = async (...args) => { window.__monitoringV2Calls.flush++; return originals.flush(...args); };
    return {
      terms: JSON.stringify(Store.state.terms),
      sources: JSON.stringify(Store.state.sources),
      settings: JSON.stringify(Store.state.settings),
      requests: window.__uiV2RuntimeProbe.mutationRequests.length,
      intervals: window.__uiV2RuntimeProbe.intervals
    };
  });

  assert.equal(await page.locator('#primaryTermName').textContent(), 'Advogada Mineral Sintética');
  assert.match(await page.locator('#primaryTermRegistration').textContent(), /OAB\/RS 000123 · Advogado\(a\) monitorado\(a\) principal/);
  assert.equal(await page.locator('#termSourceCount').textContent(), '5');
  assert.equal(await page.locator('#termIssueCount').textContent(), '2');
  assert.equal(await page.locator('#termNewCount').textContent(), '2');
  assert.equal(fixture.rawIntimations.filter(item => item.status === 'nova').length, 4, 'A fixture raw deve divergir do cutoff canônico.');

  const sources = await page.locator('#monitorSourceList [data-source-id]').evaluateAll(rows => rows.map(row => ({
    id: row.dataset.sourceId,
    text: row.textContent.replace(/\s+/g, ' ').trim(),
    status: row.querySelector('.status-chip')?.textContent.trim()
  })));
  assert.deepEqual(sources.map(source => source.id), ['a1', 'external-calendar', 'djen-cnj', 'datajud-cnj', 'generic-source']);
  assert.deepEqual(sources.map(source => source.status), ['Ativo', 'Atenção', 'Falha', 'Preparado', 'Desativado']);
  for (const [index, source] of sources.entries()) {
    assert.match(source.text, new RegExp(fixture.sources[index].short));
    assert.match(source.text, new RegExp(fixture.sources[index].name));
    assert.match(source.text, new RegExp(fixture.sources[index].detail));
    assert.match(source.text, new RegExp(fixture.sources[index].method));
  }
  assert.equal(await page.getByText('Ainda não verificada', { exact: true }).count(), 3);

  await page.evaluate(() => {
    const { App, Store } = window.Atrium;
    Store.state.sources.find(item => item.id === 'generic-source').status = 'historical-unknown';
    App.renderMonitoring();
  });
  assert.equal(await page.locator('[data-source-id="generic-source"] .status-chip').textContent(), 'Desativado');
  await page.evaluate(() => {
    const { App, Store } = window.Atrium;
    Store.state.sources.find(item => item.id === 'generic-source').status = 'off';
    App.renderMonitoring();
  });

  const readOnly = await page.evaluate(() => ({
    calls: { ...window.__monitoringV2Calls },
    requests: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));
  assert.deepEqual(readOnly.calls, { audit: 0, save: 0, flush: 0 });
  assert.equal(readOnly.requests, baseline.requests);
  assert.equal(readOnly.intervals, baseline.intervals);

  const fallback = await page.evaluate(() => {
    const { App, Store } = window.Atrium;
    const originalTerms = structuredClone(Store.state.terms);
    Store.state.terms = [];
    const before = { ...window.__monitoringV2Calls };
    App.renderMonitoring();
    const result = {
      name: document.getElementById('primaryTermName').textContent,
      registration: document.getElementById('primaryTermRegistration').textContent,
      termCount: Store.state.terms.length,
      calls: { ...window.__monitoringV2Calls },
      before
    };
    Store.state.terms = originalTerms;
    App.renderMonitoring();
    return result;
  });
  assert.equal(fallback.name, 'Dr(a). Advogado(a) Titular');
  assert.match(fallback.registration, /^OAB\/UF 000000/);
  assert.equal(fallback.termCount, 0);
  assert.deepEqual(fallback.calls, fallback.before);

  const secondaryBefore = await page.evaluate(() => structuredClone(window.Atrium.Store.state.terms[1]));
  const settingsBefore = await page.evaluate(() => structuredClone(window.Atrium.Store.state.settings));
  await page.locator('#primaryTermCard').click();
  assert.deepEqual(await page.locator('#modalForm [name]').evaluateAll(fields => fields.map(field => field.name)), ['name', 'type', 'oabNumber', 'oabUf', 'document']);
  assert.equal(await page.locator('#field-oabUf option').count(), 27);
  await page.locator('#field-name').fill('Advogada Principal Editada');
  await page.locator('#field-oabNumber').fill('OAB 001.002');
  await page.locator('#field-oabUf').selectOption('SC');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const editedPrimary = await page.evaluate(() => ({
    primary: structuredClone(window.Atrium.Store.state.terms[0]),
    secondary: structuredClone(window.Atrium.Store.state.terms[1]),
    settings: structuredClone(window.Atrium.Store.state.settings)
  }));
  assert.equal(editedPrimary.primary.id, 'monitor-term-primary');
  assert.equal(editedPrimary.primary.registration, 'OAB/SC 001002');
  assert.equal(editedPrimary.primary.oabNumber, '001002');
  assert.deepEqual(editedPrimary.secondary, secondaryBefore);
  assert.equal(editedPrimary.settings.lawyerName, 'Advogada Principal Editada');
  assert.equal(editedPrimary.settings.lawyerOab, 'OAB/SC 001002');
  assert.equal(editedPrimary.settings.monitoringFixtureMarker, settingsBefore.monitoringFixtureMarker);

  await page.locator('#newTermButton').click();
  await page.locator('#field-name').fill('Pessoa Documento Sintética');
  await page.locator('#field-type').selectOption('document');
  await page.locator('#field-document').fill('DOCUMENTO-SINTETICO-015');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.terms.find(item => item.name === 'Pessoa Documento Sintética')?.registration), 'DOCUMENTO-SINTETICO-015');

  await page.locator('#newTermButton').click();
  await page.locator('#field-name').fill('Pessoa Nome Sintética');
  await page.locator('#field-type').selectOption('name');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.Atrium.Store.state.terms.find(item => item.name === 'Pessoa Nome Sintética')?.registration), 'Pessoa Nome Sintética');

  await page.locator('[data-source-id="generic-source"]').click();
  assert.deepEqual(await page.locator('#modalForm [name]').evaluateAll(fields => fields.map(field => field.name)), ['name', 'short', 'method', 'status', 'detail']);
  assert.equal(await page.locator('#field-status option').count(), 5);
  await page.locator('#field-name').fill('Fonte Manual Editada');
  await page.locator('#field-status').selectOption('attention');
  await page.locator('#field-detail').fill('Detalhe público sintético atualizado.');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const editedSource = await page.evaluate(() => structuredClone(window.Atrium.Store.state.sources.find(item => item.id === 'generic-source')));
  assert.equal(editedSource.name, 'Fonte Manual Editada');
  assert.equal(editedSource.status, 'attention');
  assert.equal(editedSource.detail, 'Detalhe público sintético atualizado.');

  await page.locator('[data-source-id="datajud-cnj"]').click();
  assert.deepEqual(await page.locator('#modalForm [name]').evaluateAll(fields => fields.map(field => field.name)), ['apiKey', 'autoSync', 'tribunals']);
  assert.match(await page.locator('.monitoring-contract-note').textContent(), /Somente a chave pública é salva/);
  await page.locator('#field-apiKey').fill('SYNTHETIC_DATAJUD_UPDATED_KEY');
  await page.locator('#field-autoSync').selectOption('manual');
  await page.locator('#field-tribunals').fill('TJXX, TRF0');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const dataJud = await page.evaluate(() => ({
    settings: structuredClone(window.Atrium.Store.state.settings),
    audit: structuredClone(window.Atrium.Store.state.audit.find(item => item.action === 'Configuração DataJud atualizada'))
  }));
  assert.equal(dataJud.settings.datajudApiKey, 'SYNTHETIC_DATAJUD_UPDATED_KEY');
  assert.equal(Object.hasOwn(dataJud.settings, 'datajudAutoSync'), false);
  assert.equal(Object.hasOwn(dataJud.settings, 'datajudTribunals'), false);
  assert.equal(dataJud.audit.action, 'Configuração DataJud atualizada');
  assert.equal(dataJud.audit.detail.includes('SYNTHETIC_DATAJUD_UPDATED_KEY'), false);

  await page.locator('[data-source-id="datajud-cnj"]').click();
  await page.evaluate(() => {
    const { App, Store } = window.Atrium;
    window.__monitoringFailureMessages = [];
    window.__monitoringFailureFlush = Store.flush;
    window.__monitoringFailureToast = App.toast;
    Store.flush = async () => false;
    App.toast = (message, type) => window.__monitoringFailureMessages.push({ message, type });
  });
  await page.locator('#field-apiKey').fill('SYNTHETIC_DATAJUD_FAILURE_KEY');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelector('#modalForm button[type="submit"]')?.disabled === false);
  const failure = await page.evaluate(() => ({
    visible: !document.getElementById('modalBackdrop').classList.contains('hidden'),
    success: window.__monitoringFailureMessages.filter(item => item.type === 'success').length,
    key: window.Atrium.Store.state.settings.datajudApiKey
  }));
  assert.equal(failure.visible, true);
  assert.equal(failure.success, 0);
  assert.notEqual(failure.key, 'SYNTHETIC_DATAJUD_FAILURE_KEY');
  await page.evaluate(() => {
    const { App, Store } = window.Atrium;
    Store.flush = window.__monitoringFailureFlush;
    App.toast = window.__monitoringFailureToast;
  });
  await page.keyboard.press('Escape');

  const finalState = await page.evaluate(() => ({
    calls: { ...window.__monitoringV2Calls },
    intervals: window.__uiV2RuntimeProbe.intervals,
    termCount: window.Atrium.Store.state.terms.length,
    sourceCount: window.Atrium.Store.state.sources.length
  }));
  assert.equal(finalState.intervals, baseline.intervals);
  assert.equal(finalState.termCount, 4);
  assert.equal(finalState.sourceCount, 5);
  assert.ok(finalState.calls.audit >= 5);
  assert.ok(finalState.calls.save >= 5);
  assert.ok(finalState.calls.flush >= 5);
  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ Monitoring V2: arquitetura, métricas, cutoff, rotas, CRUD e DataJud preservados.');
