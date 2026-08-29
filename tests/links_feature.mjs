import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LINK_CATEGORIES, createLinksFeature, normalizeExternalUrl } from '../js/features/links.js';

const moduleSource = readFileSync(new URL('../js/features/links.js', import.meta.url), 'utf8');
const portalSource = readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
assert.match(moduleSource, /export function createLinksFeature/);
assert.doesNotMatch(moduleSource, /portal\.js|\b(?:fetch|secureFetch|XMLHttpRequest)\b/);
assert.match(portalSource, /renderLinks\(\) \{ return getLinksFeature\(\)\.render\(\); \}/);
assert.match(portalSource, /openNewLinkModal\(defaults = \{\}\) \{ return getLinksFeature\(\)\.openModal\(defaults\); \}/);
assert.match(portalSource, /getLinksFeature\(\)\.saveRecord\(data, this\.modalMode\.defaults\)/);
assert.doesNotMatch(portalSource, /const normalizedUrl = normalizeExternalUrl|Store\.state\.customLinks\.findIndex/);

assert.match(normalizeExternalUrl('http://example.test/path'), /^http:\/\/example\.test\/path/);
assert.match(normalizeExternalUrl('https://example.test/path'), /^https:\/\/example\.test\/path/);
for (const invalid of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/test', 'sem-protocolo']) {
  assert.equal(normalizeExternalUrl(invalid), '', `${invalid} deveria ser rejeitado.`);
}

function makeClassList(initial = []) {
  const values = new Set(initial);
  return { add: name => values.add(name), remove: name => values.delete(name), contains: name => values.has(name) };
}
function makeElement(initial = []) {
  const listeners = new Map();
  return {
    innerHTML: '', classList: makeClassList(initial), listeners,
    addEventListener(type, handler) { (listeners.get(type) || listeners.set(type, []).get(type)).push(handler); }
  };
}
const elements = {
  btnNewLink: makeElement(),
  customLinksSection: makeElement(['hidden']),
  customLinksGrid: makeElement()
};
const documentRef = { getElementById: id => elements[id] || null };
const audits = [];
const toasts = [];
const modalCalls = [];
let saveCalls = 0;
let flushResult = true;
const store = {
  state: { customLinks: [], audit: [] },
  audit(action, detail) {
    const entry = { id: `audit-${this.state.audit.length}`, action, detail };
    this.state.audit.push(entry);
    audits.push({ action, detail });
    return entry;
  },
  save() { saveCalls++; },
  async flush() { return flushResult; }
};
let idCounter = 0;
const feature = createLinksFeature({
  store,
  documentRef,
  escapeHtml: value => String(value ?? '').replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character])),
  openModal: (...args) => modalCalls.push(args),
  showToast: (message, type) => toasts.push({ message, type }),
  createId: prefix => `${prefix}-${++idCounter}`
});

assert.equal(feature.init(), true);
assert.equal(feature.init(), false);
assert.equal(elements.btnNewLink.listeners.get('click')?.length, 1);
assert.equal(elements.customLinksGrid.listeners.get('click')?.length, 1);
feature.render();
assert.equal(elements.customLinksSection.classList.contains('hidden'), true);
assert.equal(elements.customLinksGrid.innerHTML, '');

feature.openModal();
assert.equal(modalCalls.at(-1)[0], 'link');
assert.deepEqual(modalCalls.at(-1)[3].find(field => field.name === 'category').options, LINK_CATEGORIES);
assert.deepEqual(LINK_CATEGORIES.map(category => category.label), ['Legislação & Códigos', 'Jurisprudência & Tribunais', 'Ferramentas com IA', 'Órgãos Públicos / Cartórios', 'Outros Links']);

const invalidCount = store.state.customLinks.length;
assert.equal(feature.saveRecord({ title: 'Inválido', url: 'javascript:alert(1)' }), null);
assert.equal(store.state.customLinks.length, invalidCount);
assert.ok(toasts.some(toast => toast.message === 'Informe um endereço HTTP ou HTTPS válido.' && toast.type === 'error'));

const created = feature.saveRecord({ title: 'Link <Sintético>', url: 'https://www.example.test/path', category: 'Legislação', description: 'Descrição <segura>' });
assert.equal(created.id, 'link-1');
assert.equal(created.url, 'https://www.example.test/path');
assert.ok(Date.parse(created.createdAt));
assert.ok(Date.parse(created.updatedAt));
assert.deepEqual(audits.at(-1), { action: 'Link útil adicionado', detail: 'Link <Sintético>' });
assert.equal(saveCalls, 0, 'saveRecord delega save/flush ao dispatcher global, sem double save.');
feature.render();
assert.equal(elements.customLinksSection.classList.contains('hidden'), false);
assert.match(elements.customLinksGrid.innerHTML, /href="https:\/\/www\.example\.test\/path"/);
assert.match(elements.customLinksGrid.innerHTML, /example\.test/);
assert.match(elements.customLinksGrid.innerHTML, /Link &lt;Sintético&gt;/);
assert.match(elements.customLinksGrid.innerHTML, /Descrição &lt;segura&gt;/);

const createdAt = created.createdAt;
const edited = feature.saveRecord({ title: 'Link Editado', url: 'http://example.test/editado', category: 'Jurisprudência', description: 'Editado' }, created);
assert.equal(edited.id, created.id);
assert.equal(edited.createdAt, createdAt);
assert.equal(store.state.customLinks.length, 1);
assert.deepEqual(audits.at(-1), { action: 'Link útil atualizado', detail: 'Link Editado' });

store.state.customLinks.push({ id: 'invalid-render', title: 'URL inválida', url: 'data:text/html,unsafe', category: 'Outros', description: '' });
feature.render();
assert.match(elements.customLinksGrid.innerHTML, /Endereço inválido/);
assert.doesNotMatch(elements.customLinksGrid.innerHTML, /href="data:/);

assert.equal(await feature.deleteRecord('invalid-render'), true);
assert.equal(store.state.customLinks.some(link => link.id === 'invalid-render'), false);
assert.equal(saveCalls, 1);
assert.deepEqual(audits.at(-1), { action: 'Link útil excluído', detail: 'URL inválida' });
assert.ok(toasts.some(toast => toast.message === 'Link útil excluído com sucesso.' && toast.type === 'success'));

const linksBeforeFailure = structuredClone(store.state.customLinks);
const auditBeforeFailure = structuredClone(store.state.audit);
const successCount = toasts.filter(toast => toast.type === 'success').length;
flushResult = false;
assert.equal(await feature.deleteRecord(edited.id), false);
assert.deepEqual(store.state.customLinks, linksBeforeFailure);
assert.deepEqual(store.state.audit, auditBeforeFailure);
assert.equal(toasts.filter(toast => toast.type === 'success').length, successCount);
assert.ok(toasts.some(toast => toast.message === 'Não foi possível persistir a exclusão do link.' && toast.type === 'error'));
console.log('✓ Links modulares aprovados: HTTP(S), render seguro, create/edit, delete, audit, flush e rollback.');
