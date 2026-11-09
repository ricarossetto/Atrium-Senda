import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSystemStatusBar } from '../js/views/ui-v2/system-status.js';

const portalSource = await readFile(new URL('../js/portal.js', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
assert.match(
  portalSource,
  new RegExp(`views/ui-v2/system-status\\.js\\?v=${escapeRegExp(packageJson.version)}`),
  'A barra global deve ter cache bust próprio quando seu contrato interativo muda.'
);

class FakeClassList {
  values = new Set();
  add(...values) { values.forEach(value => this.values.add(value)); }
  remove(...values) { values.forEach(value => this.values.delete(value)); }
  toggle(value, force) { if (force) this.values.add(value); else this.values.delete(value); }
  contains(value) { return this.values.has(value); }
}

function element() {
  const listeners = new Map();
  const attributes = new Map();
  return {
    classList: new FakeClassList(), dataset: {}, style: {}, textContent: '', innerHTML: '',
    addEventListener(type, handler) { listeners.set(type, handler); },
    dispatch(type, event = {}) { listeners.get(type)?.(event); },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
    getAttribute(name) { return attributes.get(name) ?? null; }
  };
}

const ids = Object.fromEntries([
  'systemStatusBar', 'systemStatusIcon', 'systemStatusLabel', 'systemStatusPercent',
  'systemStatusDetail', 'systemStatusProgressTrack', 'systemStatusProgressFill'
].map(id => [id, element()]));
const documentRef = { getElementById: id => ids[id] || null };
const windowRef = { navigator: { onLine: true }, addEventListener() {}, setTimeout: () => 1, clearTimeout() {} };
const status = createSystemStatusBar({ documentRef, windowRef });
assert.equal(status.init(), true);
assert.equal(ids.systemStatusBar.getAttribute('role'), null);

let activations = 0;
status.setState('syncing', 'Processando', null, { owner: 'eproc', determinate: false, onActivate: () => activations++ });
assert.equal(ids.systemStatusBar.getAttribute('role'), 'button');
assert.equal(ids.systemStatusBar.getAttribute('tabindex'), '0');
assert.equal(ids.systemStatusBar.getAttribute('aria-controls'), 'eprocSyncModalBackdrop');
assert.equal(ids.systemStatusProgressTrack.classList.contains('is-indeterminate'), true);
assert.equal(ids.systemStatusProgressTrack.getAttribute('aria-valuenow'), null);
ids.systemStatusBar.dispatch('click');
ids.systemStatusBar.dispatch('keydown', { key: 'Enter', preventDefault() {} });
ids.systemStatusBar.dispatch('keydown', { key: ' ', preventDefault() {} });
assert.equal(activations, 3);

status.setState('saved', 'Mudança alheia');
assert.equal(status.currentState, 'syncing');
status.setState('syncing', 'Metade concluída', 50, { owner: 'eproc', determinate: true });
assert.equal(ids.systemStatusProgressTrack.getAttribute('aria-valuenow'), '50');
status.setState('syncing', 'Nova fase', 20, { owner: 'eproc', determinate: true });
assert.equal(ids.systemStatusProgressTrack.getAttribute('aria-valuenow'), '20');
status.setState('saved', 'Concluído', null, { owner: 'eproc', onActivate: null });
assert.equal(status.currentState, 'saved');
assert.equal(ids.systemStatusBar.getAttribute('role'), 'status');
assert.equal(ids.systemStatusBar.getAttribute('tabindex'), null);

status.setState('syncing', 'Novo job', null, { owner: 'eproc', determinate: false, onActivate: () => activations++ });
status.setState('offline', 'Conexão perdida');
assert.equal(status.currentState, 'offline');
assert.equal(ids.systemStatusBar.getAttribute('role'), 'status');

console.log('EPROC GLOBAL STATUS INTERACTION: PASS');
