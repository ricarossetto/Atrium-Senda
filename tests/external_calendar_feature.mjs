import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEGACY_EXTERNAL_CALENDAR_SOURCE_ID } from '../js/core/store.js';
import { createExternalCalendarFeature } from '../js/features/external-calendar.js';
import { serverSourceText } from './server-source.mjs';

const moduleSource = readFileSync(new URL('../js/features/external-calendar.js', import.meta.url), 'utf8');
const portalSource = readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
const serverSource = serverSourceText;
assert.match(moduleSource, /export function createExternalCalendarFeature/);
assert.doesNotMatch(moduleSource, /^\s*import\s/m);
assert.doesNotMatch(moduleSource, /portal\.js|features\//);
assert.doesNotMatch(moduleSource, /\bfetch\s*\(/);
assert.doesNotMatch(moduleSource, new RegExp(LEGACY_EXTERNAL_CALENDAR_SOURCE_ID, 'i'));
assert.match(portalSource, /openCalendarConfigModal\(\) \{ return getExternalCalendarFeature\(\)\.open\(\); \}/);
assert.match(portalSource, /handleCalendarConfigSubmit\(event\) \{ return getExternalCalendarFeature\(\)\.submit\(event\); \}/);
assert.doesNotMatch(portalSource, /secureFetch\('\/api\/calendar\/configure'/);
const calendarFetchSource = serverSource.slice(
  serverSource.indexOf('async function resolvePublicCalendarAddress'),
  serverSource.indexOf('function unfoldIcs')
);
assert.match(calendarFetchSource, /https\.request\(/, 'A conexão deve usar o endereço validado, não uma nova resolução implícita.');
assert.match(calendarFetchSource, /lookup:\s*\(_hostname, _options, callback\).*address\.address/s, 'O socket deve permanecer fixado ao IP público validado.');
assert.match(calendarFetchSource, /servername:\s*url\.hostname/, 'TLS deve validar o hostname original da agenda.');
assert.match(calendarFetchSource, /response\.statusCode/, 'Redirect e status devem usar o contrato de IncomingMessage.');
assert.match(calendarFetchSource, /setTimeout\(\(\) => request\.destroy\(/, 'O limite deve encerrar a requisição inteira, inclusive corpo em fluxo contínuo.');
assert.match(calendarFetchSource, /finally\s*\{[\s\S]*clearDeadline\(\)/, 'O deadline total só pode ser limpo depois de consumir ou rejeitar a resposta.');
assert.match(calendarFetchSource, /if \(!response\.complete && !response\.destroyed\) response\.destroy\(\)/, 'Resposta não consumida deve ter o socket encerrado antes de limpar o deadline.');
assert.doesNotMatch(calendarFetchSource, /response\.resume\(\)/, 'Redirect ou erro em streaming não pode permanecer drenando sem deadline.');
assert.doesNotMatch(calendarFetchSource, /request\.setTimeout\(/, 'Timeout apenas por inatividade permitiria resposta lenta sem limite total.');
assert.doesNotMatch(calendarFetchSource, /await fetch\(url/, 'Fetch genérico reabriria uma janela de DNS rebinding após a validação.');
assert.doesNotMatch(calendarFetchSource, /Atrium-Senda/, 'Novo transporte não pode introduzir branding legado.');
const calendarRouteSource = serverSource.slice(serverSource.indexOf("url.pathname === '/api/calendar/configure'"));
assert.ok(calendarRouteSource.indexOf('fetchCalendarSource(calendarUrl)') < calendarRouteSource.indexOf('saveAppState(state, expectedRevision)'), 'A agenda deve ser buscada antes da persistência oficial.');
assert.ok(calendarRouteSource.indexOf('saveAppState(state, expectedRevision)') < calendarRouteSource.indexOf('mutateRuntime(runtime =>'), 'O runtime não pode ser alterado antes de a revisão oficial ser aceita.');
assert.ok(calendarRouteSource.indexOf('mutateRuntime(runtime =>') < calendarRouteSource.indexOf('return json(res, 200, {'), 'A resposta deve ser montada somente depois da nova revision e da atualização do runtime.');

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
    listeners, classList: makeClassList(hidden ? ['hidden'] : []), className: '', textContent: '', value: '',
    disabled: false, focused: false,
    addEventListener(type, handler) { (listeners.get(type) || listeners.set(type, []).get(type)).push(handler); },
    focus() { this.focused = true; }
  };
}

const ids = ['configureCalendarButton', 'calendarConfigClose', 'calendarConfigCancel', 'calendarConfigBackdrop', 'calendarConfigForm', 'calendarInputUrl', 'calendarConfigStatus', 'calendarConfigSubmit', 'modalBackdrop'];
const elements = Object.fromEntries(ids.map(id => [id, makeElement({ hidden: id === 'calendarConfigBackdrop' || id === 'modalBackdrop' })]));
const documentRef = { getElementById: id => elements[id] || null, body: { style: { overflow: '' } } };
const audits = [];
let flushResult = true;
const store = {
  state: { settings: { calendarUrl: 'webcal://canonical.example.test/calendar', externalCalendarUrl: 'webcal://fallback.example.test/calendar' } },
  revision: 'revision-before-calendar',
  saves: 0,
  audit(action, detail) { audits.push({ action, detail }); },
  save() { this.saves++; },
  async flush() { return flushResult; }
};
const requests = [];
const toasts = [];
const scheduled = [];
let syncCalls = 0;
let closeConfirmResult = false;
const closeConfirmMessages = [];
let responsePayload = {
  imported: 3,
  calendarUrl: 'https://normalized.example.test/calendar.ics',
  externalCalendarUrl: 'https://normalized.example.test/calendar.ics',
  calendarConfigured: true,
  revision: 'revision-after-calendar',
  message: 'Agenda sintética sincronizada.'
};
let responseOk = true;
const secureFetch = async (url, options = {}) => {
  requests.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
  return { ok: responseOk, async json() { return structuredClone(responsePayload); } };
};
const feature = createExternalCalendarFeature({
  store,
  documentRef,
  windowRef: {},
  secureFetch,
  showToast: (message, type) => toasts.push({ message, type }),
  onSyncAll: async () => { syncCalls++; },
  confirmFn: message => { closeConfirmMessages.push(message); return closeConfirmResult; },
  schedule: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length; }
});

assert.equal(feature.init(), true);
assert.equal(feature.init(), false);
for (const [id, type] of [['configureCalendarButton', 'click'], ['calendarConfigClose', 'click'], ['calendarConfigCancel', 'click'], ['calendarConfigBackdrop', 'click'], ['calendarConfigForm', 'submit']]) {
  assert.equal(elements[id].listeners.get(type)?.length, 1, `${id} deve possuir um listener ${type}.`);
}

assert.equal(feature.open(), 'webcal://canonical.example.test/calendar');
assert.equal(elements.calendarInputUrl.value, 'webcal://canonical.example.test/calendar');
assert.equal(elements.calendarConfigBackdrop.classList.contains('hidden'), false);
assert.equal(documentRef.body.style.overflow, 'hidden');
assert.equal(scheduled.at(-1).delay, 50);
scheduled.at(-1).callback();
assert.equal(elements.calendarInputUrl.focused, true);
feature.close();
store.state.settings.calendarUrl = '';
assert.equal(feature.open(), 'webcal://fallback.example.test/calendar');
assert.equal(elements.calendarInputUrl.value, 'webcal://fallback.example.test/calendar');
elements.calendarInputUrl.value = 'webcal://edited.example.test/calendar';
assert.equal(feature.requestClose(), false);
assert.equal(elements.calendarConfigBackdrop.classList.contains('hidden'), false, 'URL editada deve impedir descarte silencioso.');
assert.match(closeConfirmMessages.at(-1), /alterações não salvas/i);
closeConfirmResult = true;
assert.equal(feature.requestClose(), true);
assert.equal(elements.calendarConfigBackdrop.classList.contains('hidden'), true);
feature.open();

elements.calendarInputUrl.value = '   ';
const requestsBeforeEmpty = requests.length;
assert.equal(await feature.submit({ preventDefault() {} }), false);
assert.equal(requests.length, requestsBeforeEmpty);
assert.deepEqual(toasts.at(-1), { message: 'Informe a URL da agenda em formato Webcal ou iCal.', type: 'error' });

elements.calendarInputUrl.value = 'webcal://submitted.example.test/calendar';
assert.equal(await feature.submit({ preventDefault() {} }), true);
assert.deepEqual(requests.at(-1), {
  url: '/api/calendar/configure', method: 'POST', body: { calendarUrl: 'webcal://submitted.example.test/calendar', revision: 'revision-before-calendar' }
});
assert.deepEqual(store.state.settings, {
  calendarUrl: 'https://normalized.example.test/calendar.ics',
  externalCalendarUrl: 'https://normalized.example.test/calendar.ics',
  calendarConfigured: true
});
assert.equal(audits.length, 0, 'A auditoria deve ser criada no backend, sem uma segunda mutação local.');
assert.equal(store.saves, 0, 'A mutação oficial não deve ser persistida novamente pelo Store.');
assert.equal(store.revision, 'revision-after-calendar');
assert.equal(syncCalls, 1);
assert.equal(elements.calendarConfigStatus.className, 'calendar-sync-status success');
assert.equal(elements.calendarConfigStatus.textContent, 'Agenda sintética sincronizada.');
assert.equal(elements.calendarConfigSubmit.disabled, false);
assert.equal(elements.calendarConfigSubmit.textContent, 'Salvar e Sincronizar Agora');
assert.equal(scheduled.at(-1).delay, 1200);

responsePayload = {
  ok: false,
  partial: true,
  imported: 1,
  error: 'Falha sintética no runtime.',
  errorStage: 'runtime',
  calendarUrl: 'https://calendar.example.test/feed.ics',
  externalCalendarUrl: 'https://calendar.example.test/feed.ics',
  calendarConfigured: true,
  revision: 'revision-after-partial-calendar',
  message: 'URL salva, mas os eventos não puderam ser incorporados à agenda.'
};
elements.calendarInputUrl.value = 'https://calendar.example.test/feed.ics';
assert.equal(await feature.submit({ preventDefault() {} }), false);
assert.equal(elements.calendarConfigStatus.className, 'calendar-sync-status error');
assert.deepEqual(toasts.at(-1), { message: 'URL salva, mas os eventos não puderam ser incorporados à agenda.', type: 'error' });
assert.equal(store.revision, 'revision-after-partial-calendar', 'Resposta parcial ainda deve atualizar a revisão oficial do frontend.');
assert.equal(syncCalls, 1, 'Falha parcial não pode iniciar nova sincronização nem declarar sucesso.');

responseOk = false;
responsePayload = { message: 'Falha sintética do calendário.' };
elements.calendarInputUrl.value = 'https://calendar.example.test/failure.ics';
assert.equal(await feature.submit({ preventDefault() {} }), false);
assert.equal(elements.calendarConfigStatus.textContent, 'Falha sintética do calendário.');
responseOk = true;

const failureElements = Object.fromEntries(ids.map(id => [id, makeElement({ hidden: id === 'calendarConfigBackdrop' || id === 'modalBackdrop' })]));
failureElements.calendarInputUrl.value = 'https://calendar.example.test/not-persisted.ics';
let failureStoreSaves = 0;
let failureStoreFlushes = 0;
const failureStore = {
  state: { settings: {} },
  revision: 'revision-before-no-double-save',
  audit() { throw new Error('A auditoria deve ser exclusivamente oficial no backend.'); },
  save() { failureStoreSaves++; },
  async flush() { failureStoreFlushes++; return false; }
};
const failureFeature = createExternalCalendarFeature({
  store: failureStore,
  documentRef: { getElementById: id => failureElements[id] || null, body: { style: {} } },
  secureFetch: async () => ({ ok: true, async json() { return { imported: 2, revision: 'revision-after-no-double-save', message: 'Agenda sintética sincronizada.' }; } }),
  schedule: () => 1
});
assert.equal(await failureFeature.submit({ preventDefault() {} }), true);
assert.equal(failureStoreSaves, 0, 'A configuração oficial não deve chamar Store.save novamente.');
assert.equal(failureStoreFlushes, 0, 'A configuração oficial não deve chamar Store.flush novamente.');

assert.deepEqual([...new Set(requests.map(request => request.url))], ['/api/calendar/configure']);
console.log('✓ Feature modular de Agenda Externa aprovada: módulo nativo, URL compatível, POST exato, persistência, audit, status e sync injetado.');
