import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEGACY_EXTERNAL_CALENDAR_SOURCE_ID } from '../js/core/store.js';
import { createExternalCalendarFeature } from '../js/features/external-calendar.js';

const moduleSource = readFileSync(new URL('../js/features/external-calendar.js', import.meta.url), 'utf8');
const portalSource = readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
assert.match(moduleSource, /export function createExternalCalendarFeature/);
assert.doesNotMatch(moduleSource, /^\s*import\s/m);
assert.doesNotMatch(moduleSource, /portal\.js|features\//);
assert.doesNotMatch(moduleSource, /\bfetch\s*\(/);
assert.doesNotMatch(moduleSource, new RegExp(LEGACY_EXTERNAL_CALENDAR_SOURCE_ID, 'i'));
assert.match(portalSource, /openCalendarConfigModal\(\) \{ return getExternalCalendarFeature\(\)\.open\(\); \}/);
assert.match(portalSource, /handleCalendarConfigSubmit\(event\) \{ return getExternalCalendarFeature\(\)\.submit\(event\); \}/);
assert.doesNotMatch(portalSource, /secureFetch\('\/api\/calendar\/configure'/);

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
  saves: 0,
  audit(action, detail) { audits.push({ action, detail }); },
  save() { this.saves++; },
  async flush() { return flushResult; }
};
const requests = [];
const toasts = [];
const scheduled = [];
let syncCalls = 0;
let responsePayload = { imported: 3, message: 'Agenda sintética sincronizada.' };
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

elements.calendarInputUrl.value = '   ';
const requestsBeforeEmpty = requests.length;
assert.equal(await feature.submit({ preventDefault() {} }), false);
assert.equal(requests.length, requestsBeforeEmpty);
assert.deepEqual(toasts.at(-1), { message: 'Informe a URL da agenda em formato Webcal ou iCal.', type: 'error' });

elements.calendarInputUrl.value = 'webcal://submitted.example.test/calendar';
assert.equal(await feature.submit({ preventDefault() {} }), true);
assert.deepEqual(requests.at(-1), {
  url: '/api/calendar/configure', method: 'POST', body: { calendarUrl: 'webcal://submitted.example.test/calendar' }
});
assert.deepEqual(store.state.settings, {
  calendarUrl: 'webcal://submitted.example.test/calendar',
  externalCalendarUrl: 'webcal://submitted.example.test/calendar',
  calendarConfigured: true
});
assert.deepEqual(audits.at(-1), { action: 'Agenda externa configurada', detail: '3 compromissos sincronizados.' });
assert.equal(store.saves, 1);
assert.equal(syncCalls, 1);
assert.equal(elements.calendarConfigStatus.className, 'calendar-sync-status success');
assert.equal(elements.calendarConfigStatus.textContent, 'Agenda sintética sincronizada.');
assert.equal(elements.calendarConfigSubmit.disabled, false);
assert.equal(elements.calendarConfigSubmit.textContent, 'Salvar e Sincronizar Agora');
assert.equal(scheduled.at(-1).delay, 1200);

responsePayload = { imported: 1, error: true, message: 'Agenda importada com ressalva sintética.' };
elements.calendarInputUrl.value = 'https://calendar.example.test/feed.ics';
assert.equal(await feature.submit({ preventDefault() {} }), true);
assert.equal(elements.calendarConfigStatus.className, 'calendar-sync-status error');
assert.deepEqual(toasts.at(-1), { message: 'Agenda importada com ressalva sintética.', type: 'error' });

responseOk = false;
responsePayload = { message: 'Falha sintética do calendário.' };
elements.calendarInputUrl.value = 'https://calendar.example.test/failure.ics';
assert.equal(await feature.submit({ preventDefault() {} }), false);
assert.equal(elements.calendarConfigStatus.textContent, 'Falha sintética do calendário.');
responseOk = true;

const failureElements = Object.fromEntries(ids.map(id => [id, makeElement({ hidden: id === 'calendarConfigBackdrop' || id === 'modalBackdrop' })]));
failureElements.calendarInputUrl.value = 'https://calendar.example.test/not-persisted.ics';
let failureSyncCalls = 0;
const failureToasts = [];
const failureStore = {
  state: { settings: {} }, audit() {}, save() {}, async flush() { return false; }
};
const failureFeature = createExternalCalendarFeature({
  store: failureStore,
  documentRef: { getElementById: id => failureElements[id] || null, body: { style: {} } },
  secureFetch: async () => ({ ok: true, async json() { return { imported: 2, message: 'Não deve virar sucesso.' }; } }),
  showToast: (message, type) => failureToasts.push({ message, type }),
  onSyncAll: () => { failureSyncCalls++; },
  schedule: () => 1
});
assert.equal(await failureFeature.submit({ preventDefault() {} }), false);
assert.equal(failureSyncCalls, 0, 'Sync não pode ocorrer após falha de persistência.');
assert.equal(failureToasts.some(item => item.type === 'success'), false, 'Não pode haver sucesso antes do flush.');
assert.deepEqual(failureToasts.at(-1), { message: 'Não foi possível persistir a configuração da agenda.', type: 'error' });

assert.deepEqual([...new Set(requests.map(request => request.url))], ['/api/calendar/configure']);
console.log('✓ Feature modular de Agenda Externa aprovada: módulo nativo, URL compatível, POST exato, persistência, audit, status e sync injetado.');
