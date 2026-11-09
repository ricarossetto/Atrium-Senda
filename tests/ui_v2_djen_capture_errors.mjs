import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMonitoringFeature } from '../js/features/monitoring.js';
import { renderDjenCaptureErrorsV2Presentation } from '../js/views/ui-v2/monitoring-presenter.js';

console.log('\n===============================================================');
console.log('  ATRIUM — PAINEL DE FALHAS DE CAPTURA DJEN (UI V2)            ');
console.log('===============================================================\n');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [indexHtml, portalSource] = await Promise.all([
  readFile(path.join(ROOT, 'index.html'), 'utf8'),
  readFile(path.join(ROOT, 'js/portal.js'), 'utf8')
]);

console.log('[C1] Markup oficial no shell da aplicação...');
assert.match(indexHtml, /id="djenCaptureErrorsCard"[^>]*hidden/, 'O painel deve existir oculto por padrão.');
assert.match(indexHtml, /id="djenCaptureErrorsTitle"/);
assert.match(indexHtml, /id="djenCaptureErrorsList"/);
assert.match(indexHtml, /id="djenCaptureErrorsRetryAll"/);
assert.match(indexHtml, /id="djenCaptureErrorsCount"[^>]*aria-live="polite"/);
assert.match(portalSource, /renderDjenCaptureErrorsV2Presentation/, 'Portal deve importar o presenter do painel.');
assert.match(portalSource, /requestCaptureErrors: async \(\) =>/, 'Portal deve injetar a leitura da fila.');
assert.match(portalSource, /requestCaptureErrorRetry: async \(body = \{\}\) =>/, 'Portal deve injetar o retry com CSRF via secureFetch.');
assert.match(portalSource, /capture-errors\/retry\?async=1/, 'Retry deve usar o contrato de comando assíncrono (202 + idCommand).');
assert.match(portalSource, /async function pollAsyncCommand\(/, 'Portal deve aguardar a conclusão real do comando assíncrono.');
assert.match(portalSource, /\/api\/commands\/\$\{encodeURIComponent\(idCommand\)\}/, 'Polling deve consultar a rota oficial de comandos.');
assert.match(portalSource, /onCaptureErrorsApplied: async \(\) =>/, 'Retry bem-sucedido deve reconciliar o estado local.');
console.log('  ✓ Painel, presenter e wiring presentes.');

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const formatDateTime = value => `DT(${value})`;

console.log('[C2] Presenter puro: contagem, plural, escape e ação acessível...');
const hostile = renderDjenCaptureErrorsV2Presentation({
  queue: {
    updatedAt: '2026-09-20T07:00:00.000Z',
    lastRun: { at: '2026-09-20T07:00:00.000Z', trigger: 'scheduled' },
    terms: [
      { termId: 'term-a', oabUf: 'RS', oabNumber: '000123', name: 'Advogada Teste', registration: 'OAB/RS 000123', message: '<script>alert(1)</script>', attempts: 2, lastFailedAt: '2026-09-20T07:00:00.000Z' },
      { termId: 'x"><img src=x onerror=1', message: 'falha sintética', attempts: 1, lastFailedAt: '2026-09-19T19:00:00.000Z' }
    ]
  },
  escapeHtml,
  formatDateTime
});
assert.equal(hostile.count, 2);
assert.match(hostile.detail, /2 termos monitorados falharam/);
assert.match(hostile.detail, /DT\(2026-09-20T07:00:00.000Z\)/);
assert.match(hostile.rowsHtml, /data-retry-term-id="term-a"/);
assert.match(hostile.rowsHtml, /aria-label="Tentar novamente a captura de OAB\/RS 000123 · Advogada Teste"/);
assert.match(hostile.rowsHtml, /2 tentativas/);
assert.doesNotMatch(hostile.rowsHtml, /<script>/i, 'Mensagem externa deve ser escapada.');
assert.doesNotMatch(hostile.rowsHtml, /<img/i, 'Termo malicioso não pode injetar markup.');
assert.match(hostile.rowsHtml, /OAB\/UF 000000/, 'Termo sem identidade usa fallback neutro.');

const single = renderDjenCaptureErrorsV2Presentation({
  queue: { terms: [{ termId: 'term-b', registration: 'OAB/SC 000456', message: 'coleta parcial', attempts: 1 }] },
  escapeHtml,
  formatDateTime
});
assert.equal(single.count, 1);
assert.match(single.detail, /1 termo monitorado falhou/);
assert.match(single.rowsHtml, /1 tentativa/);
assert.match(single.rowsHtml, /Última falha: horário não informado/);
console.log('  ✓ Presenter determinístico, sem markup de fonte externa.');

console.log('[C3] Feature: carregar uma vez, renderizar, retry e reconciliar...');
const listeners = new Map();
const fakeElement = id => ({
  id,
  hidden: true,
  disabled: false,
  innerHTML: '',
  textContent: '',
  attributes: {},
  addEventListener(type, listener) { listeners.set(`${id}:${type}`, listener); },
  setAttribute(name, value) { this.attributes[name] = String(value); },
  removeAttribute(name) { delete this.attributes[name]; },
  querySelectorAll() { return []; }
});
const elementIds = [
  'newTermButton', 'primaryTermCard', 'monitorSourceList',
  'djenCaptureErrorsCard', 'djenCaptureErrorsList', 'djenCaptureErrorsCount',
  'djenCaptureErrorsDetail', 'djenCaptureErrorsRetryAll'
];
const elements = new Map(elementIds.map(id => [id, fakeElement(id)]));
let loadCalls = 0;
let retryBodies = [];
let applied = 0;
const toasts = [];
const queueFixture = {
  terms: [{ termId: 'term-falho', oabUf: 'RS', oabNumber: '000123', name: 'Advogada Teste', registration: 'OAB/RS 000123', message: 'HTTP 429', attempts: 1, lastFailedAt: '2026-09-20T07:00:00.000Z' }],
  lastRun: { at: '2026-09-20T07:00:00.000Z', trigger: 'scheduled' }
};
const feature = createMonitoringFeature({
  store: { state: { terms: [], sources: [], settings: {}, intimations: [] } },
  documentRef: { documentElement: { dataset: { ui: 'v2' } }, getElementById: id => elements.get(id) || null },
  escapeHtml,
  formatDateTime,
  renderCaptureErrorsPresentation: renderDjenCaptureErrorsV2Presentation,
  requestCaptureErrors: async () => { loadCalls += 1; return queueFixture; },
  requestCaptureErrorRetry: async body => {
    retryBodies.push(body);
    return { ok: true, inboxAdded: 2, inboxUpdated: 1, failures: [], queue: { terms: [], lastRun: { at: '2026-09-20T08:00:00.000Z', trigger: 'retry' } } };
  },
  onCaptureErrorsApplied: async () => { applied += 1; },
  showToast: (message, type) => toasts.push({ message, type })
});
assert.equal(feature.init(), true);
feature.render();
await new Promise(resolve => setImmediate(resolve));
assert.equal(loadCalls, 1, 'Primeiro render carrega a fila uma única vez.');
feature.render();
await new Promise(resolve => setImmediate(resolve));
assert.equal(loadCalls, 1, 'Renders seguintes usam a fila em cache.');
assert.equal(elements.get('djenCaptureErrorsCard').hidden, false, 'Fila com falhas torna o painel visível.');
assert.equal(elements.get('djenCaptureErrorsCount').textContent, '1');
assert.match(elements.get('djenCaptureErrorsList').innerHTML, /data-retry-term-id="term-falho"/);
assert.match(elements.get('djenCaptureErrorsDetail').textContent, /1 termo monitorado falhou/);

await feature.retryCaptureErrors('term-falho');
assert.deepEqual(retryBodies, [{ termId: 'term-falho' }]);
assert.equal(toasts.at(-1).type, 'success');
assert.match(toasts.at(-1).message, /\+2 novas, 1 atualizada/);
assert.equal(applied, 1, 'Estado local deve ser reconciliado após retry com novidades.');
assert.equal(elements.get('djenCaptureErrorsCard').hidden, true, 'Fila resolvida oculta o painel.');
assert.equal(elements.get('djenCaptureErrorsCard').attributes['aria-busy'], undefined, 'aria-busy deve ser removido no finally.');
assert.equal(elements.get('djenCaptureErrorsRetryAll').disabled, false);

const retryAllBody = [];
const retryAllFeature = createMonitoringFeature({
  store: { state: { terms: [], sources: [], settings: {}, intimations: [] } },
  documentRef: { documentElement: { dataset: { ui: 'v2' } }, getElementById: id => elements.get(id) || null },
  renderCaptureErrorsPresentation: renderDjenCaptureErrorsV2Presentation,
  requestCaptureErrors: async () => ({ terms: [{ termId: 'term-1', message: 'x', attempts: 1 }] }),
  requestCaptureErrorRetry: async body => { retryAllBody.push(body); return { ok: true, queue: { terms: [] } }; },
  showToast: () => {}
});
retryAllFeature.init();
await retryAllFeature.retryCaptureErrors();
assert.deepEqual(retryAllBody, [{ all: true }], 'Sem termo específico, o retry cobre a fila inteira.');

const classicFeature = createMonitoringFeature({
  store: { state: { terms: [], sources: [], settings: {}, intimations: [] } },
  documentRef: { documentElement: { dataset: { ui: 'classic' } }, getElementById: id => elements.get(id) || null },
  requestCaptureErrors: async () => { throw new Error('Classic não deve consultar a fila.'); }
});
classicFeature.render();
await new Promise(resolve => setImmediate(resolve));
assert.equal(elements.get('djenCaptureErrorsCard').hidden, true, 'Classic permanece sem o painel.');
console.log('  ✓ Carga única, retry individual/total, reconciliação e isolamento do Classic.');

console.log('\n>>> PAINEL DE FALHAS DE CAPTURA DJEN: PASS <<<\n');
