import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAuditFeature } from '../js/features/audit.js';

const moduleSource = readFileSync(new URL('../js/features/audit.js', import.meta.url), 'utf8');
const portalSource = readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
assert.match(moduleSource, /export function createAuditFeature/);
assert.doesNotMatch(moduleSource, /store\.audit\s*\(|\.splice\s*\(|\.filter\([^\n]*=>[^\n]*\.id\s*!==/);
assert.doesNotMatch(moduleSource, /portal\.js|\b(?:fetch|secureFetch)\s*\(/);
assert.match(portalSource, /renderAudit\(filter = 'all', query = ''\) \{ return getAuditFeature\(\)\.render\(filter, query\); \}/);

function classList() { return { add() {}, remove() {}, toggle() {} }; }
function element() {
  const listeners = new Map();
  return {
    innerHTML: '', textContent: '', value: '', classList: classList(), listeners,
    addEventListener(type, handler) { (listeners.get(type) || listeners.set(type, []).get(type)).push(handler); },
    querySelectorAll() { return [element(), element(), element(), element(), element()]; }
  };
}
const ids = ['auditFilters', 'auditSearch', 'btnExportAuditLog', 'btnClearAuditLog', 'exportAuditButton', 'auditList', 'auditCountBadge'];
const elements = Object.fromEntries(ids.map(id => [id, element()]));
const documentRef = { getElementById: id => elements[id] || null };
const audit = [
  { at: '2026-08-29T10:00:00.000Z', actor: 'Admin <script>', action: 'Login autorizado', detail: 'Sessão <img src=x>' },
  { at: '2026-08-29T11:00:00.000Z', actor: 'Agente Coletor', action: 'Sincronização DJEN concluída', detail: 'Importação completa' },
  { at: '2026-08-29T12:00:00.000Z', actor: 'Advogada Teste', action: 'Tarefa criada', detail: 'Prazo manual' },
  { at: '2026-08-29T13:00:00.000Z', actor: 'Sistema', action: 'Processo atualizado', detail: 'Cliente Teste' }
];
const originalAudit = structuredClone(audit);
const exports = [];
const toasts = [];
const feature = createAuditFeature({
  store: { state: { audit } },
  documentRef,
  escapeHtml: value => String(value ?? '').replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character])),
  formatDateTime: value => `DT:${value}`,
  exportJson: (data, filename) => exports.push({ data, filename }),
  getIsoDate: () => '2026-08-29',
  showToast: (message, type) => toasts.push({ message, type })
});

assert.equal(feature.init(), true);
assert.equal(feature.init(), false);
for (const [id, type] of [['auditFilters', 'click'], ['auditSearch', 'input'], ['btnExportAuditLog', 'click'], ['btnClearAuditLog', 'click'], ['exportAuditButton', 'click']]) {
  assert.equal(elements[id].listeners.get(type)?.length, 1, `${id} deve ter um único listener.`);
}

assert.equal(feature.render().length, 4);
assert.equal(elements.auditCountBadge.textContent, '4 eventos');
assert.match(elements.auditList.innerHTML, /Data e Hora[\s\S]*Usuário \/ Agente[\s\S]*Ação Executada[\s\S]*Detalhes do Evento[\s\S]*Status/);
assert.match(elements.auditList.innerHTML, /Admin &lt;script&gt;/);
assert.match(elements.auditList.innerHTML, /Sessão &lt;img src=x&gt;/);
assert.doesNotMatch(elements.auditList.innerHTML, /Admin <script>|<img src=x>/);
assert.deepEqual(feature.filteredEvents('security', '').map(event => event.action), ['Login autorizado']);
assert.deepEqual(feature.filteredEvents('sync', '').map(event => event.action), ['Sincronização DJEN concluída']);
assert.deepEqual(feature.filteredEvents('task', '').map(event => event.action), ['Tarefa criada']);
assert.deepEqual(feature.filteredEvents('process', '').map(event => event.action), ['Processo atualizado']);
assert.deepEqual(feature.filteredEvents('all', 'advogada teste').map(event => event.action), ['Tarefa criada']);
assert.deepEqual(feature.filteredEvents('all', 'importação completa').map(event => event.action), ['Sincronização DJEN concluída']);

feature.filter = 'task';
feature.query = 'prazo';
elements.auditSearch.value = 'prazo';
feature.resetFilters();
assert.equal(feature.filter, 'all');
assert.equal(feature.query, '');
assert.equal(elements.auditSearch.value, '');
assert.ok(toasts.some(toast => toast.message === 'Filtros de auditoria redefinidos.' && toast.type === 'info'));
assert.deepEqual(audit, originalAudit, 'Reset/filtros não podem mutar registros de auditoria.');

feature.export();
assert.equal(exports.length, 1);
assert.equal(exports[0].data, audit);
assert.equal(exports[0].filename, 'atrium-auditoria-2026-08-29.json');
assert.deepEqual(audit, originalAudit);
console.log('✓ Auditoria modular aprovada: render, escaping, filtros, busca, reset, export e imutabilidade.');
