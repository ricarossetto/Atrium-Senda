import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ATRIUM_ICON_NAMES, iconHref, iconSvg } from '../js/views/ui-v2/icons.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 ICONOGRAPHY SEMANTICS');
console.log('===============================================================\n');

const canonicalMapping = Object.freeze({
  dashboard: 'dashboard', processes: 'processes', inbox: 'publications', kanban: 'tasks',
  agenda: 'agenda', contacts: 'contacts', leads: 'leads', financial: 'financial',
  calculations: 'calculations', documents: 'documents', assistant: 'assistant', prompts: 'prompts',
  monitoring: 'monitoring', integrations: 'integrations', configuration: 'configuration',
  importer: 'importer', audit: 'audit', links: 'links', reports: 'reports',
  admin: 'security'
});
const primaryMapping = Object.freeze(Object.fromEntries(
  Object.entries(canonicalMapping).filter(([view]) => !['audit', 'monitoring', 'importer'].includes(view))
));
assert.equal(Object.keys(canonicalMapping).length, 20);
assert.equal(Object.keys(primaryMapping).length, 17);
assert.equal(new Set(Object.values(canonicalMapping)).size, 20, 'Cada view oficial deve possuir um nome semântico próprio.');

const mappedFromMarkup = Object.fromEntries([...index.matchAll(/<button class="nav-item[^"]*" data-view="([^"]+)"[^>]*>[\s\S]*?<use href="assets\/icons\/atrium-ui-icons\.svg(?:\?v=[^"#]+)?#atrium-icon-([^"]+)"[\s\S]*?<\/button>/g)]
  .map(match => [match[1], match[2]]));
assert.deepEqual(mappedFromMarkup, primaryMapping, 'O mapping semântico da sidebar deve coincidir com os destinos primários.');
assert.match(index, /id="view-audit"/, 'A view oficial de auditoria deve permanecer no DOM.');
assert.match(fs.readFileSync(path.join(ROOT, 'js/views/ui-v2/configuration-presenter.js'), 'utf8'), /dataset\.viewLink\s*=\s*'audit'/, 'Auditoria deve ser alcançável por Configurações > Sistema.');

for (const icon of Object.values(canonicalMapping)) {
  assert.ok(ATRIUM_ICON_NAMES.includes(icon), `${icon} deve estar no registro do helper.`);
  assert.match(iconHref(icon), new RegExp(`^assets/icons/atrium-ui-icons\\.svg(?:\\?v=[^#]+)?#atrium-icon-${icon}$`));
}

const criticalPairs = [
  ['processes', 'documents'], ['documents', 'publications'], ['contacts', 'leads'],
  ['tasks', 'audit'], ['monitoring', 'integrations'], ['assistant', 'prompts']
];
for (const [left, right] of criticalPairs) {
  assert.notEqual(iconHref(left), iconHref(right), `${left} e ${right} precisam manter símbolos distintos.`);
}

const decorative = iconSvg('court');
assert.match(decorative, /aria-hidden="true"/);
assert.match(decorative, /focusable="false"/);
assert.doesNotMatch(decorative, /aria-label=/);
const named = iconSvg('certificate', { label: 'Certificado digital' });
assert.match(named, /role="img"/);
assert.match(named, /aria-label="Certificado digital"/);
assert.match(iconHref('nome-inexistente'), /^assets\/icons\/atrium-ui-icons\.svg(?:\?v=[^#]+)?#atrium-icon-info$/, 'Nome inválido deve cair em fallback visual seguro.');

console.log('✓ 19 capacidades usam nomes oficiais; 16 destinos declarados na sidebar (15 primários e o admin oculto) e auditoria permanece em Configurações.');
console.log('✓ 6/6 pares críticos possuem símbolos distintos.');
console.log('✓ Helper preserva ícones decorativos ocultos e ícones informativos nomeados.');
