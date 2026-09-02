import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const sha256CanonicalText = relativePath => crypto.createHash('sha256')
  .update(read(relativePath).replaceAll('\r\n', '\n'))
  .digest('hex');

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 ICONOGRAPHY SOURCE INVENTORY');
console.log('===============================================================\n');

const spritePath = 'assets/icons/atrium-ui-icons.svg';
const helperPath = 'js/views/ui-v2/icons.js';
const cssPath = 'css/views/ui-v2/icons.css';
for (const relativePath of [spritePath, 'assets/icons/README.md', helperPath, cssPath]) {
  assert.equal(fs.existsSync(path.join(ROOT, relativePath)), true, `${relativePath} deve existir.`);
}

const sprite = read(spritePath);
const symbols = [...sprite.matchAll(/<symbol\b([^>]*)>([\s\S]*?)<\/symbol>/g)].map(match => ({
  attributes: match[1],
  body: match[2],
  id: match[1].match(/\bid="([^"]+)"/)?.[1],
  viewBox: match[1].match(/\bviewBox="([^"]+)"/)?.[1]
}));
const symbolIds = symbols.map(symbol => symbol.id);
assert.equal(symbols.length, 50, 'O sprite deve conter somente os 50 símbolos realmente usados e documentados.');
assert.equal(new Set(symbolIds).size, symbolIds.length, 'IDs de símbolos devem ser únicos.');
assert.ok(symbolIds.every(Boolean), 'Todo símbolo deve possuir ID.');
assert.ok(symbols.every(symbol => symbol.viewBox === '0 0 24 24'), 'Todo símbolo deve usar viewBox 0 0 24 24.');
assert.ok(symbols.every(symbol => /currentColor/.test(symbol.attributes + symbol.body)), 'Todo símbolo deve herdar cor por currentColor.');
assert.doesNotMatch(sprite, /#[0-9a-f]{3,8}\b|\b(?:rgb|hsl)a?\s*\(/i, 'O sprite não pode conter cores de apresentação hardcoded.');
assert.doesNotMatch(sprite, /gradient|filter=|<image\b|data:/i, 'O sprite não pode conter gradiente, filtro, imagem raster ou data URI.');

const requiredNames = [
  'dashboard', 'processes', 'publications', 'tasks', 'agenda', 'contacts', 'leads',
  'financial', 'documents', 'assistant', 'prompts', 'monitoring', 'integrations',
  'configuration', 'importer', 'audit', 'links', 'menu', 'sidebar-collapse', 'search',
  'sync', 'notification', 'theme-light', 'theme-dark', 'close', 'add', 'edit', 'delete',
  'download', 'upload', 'external-link', 'filter', 'more', 'chevron-left', 'chevron-right',
  'chevron-down', 'check', 'warning', 'info'
];
for (const name of requiredNames) {
  assert.ok(symbolIds.includes(`atrium-icon-${name}`), `Símbolo obrigatório ausente: ${name}.`);
}

const index = read('index.html');
const expectedNavigation = new Map([
  ['dashboard', 'dashboard'], ['processes', 'processes'], ['inbox', 'publications'],
  ['kanban', 'tasks'], ['agenda', 'agenda'], ['contacts', 'contacts'], ['leads', 'leads'],
  ['financial', 'financial'], ['documents', 'documents'], ['assistant', 'assistant'],
  ['prompts', 'prompts'], ['monitoring', 'monitoring'], ['integrations', 'integrations'],
  ['configuration', 'configuration'], ['importer', 'importer'], ['audit', 'audit'], ['links', 'links']
]);
const navigationButtons = [...index.matchAll(/<button class="nav-item[^"]*" data-view="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)];
assert.equal(navigationButtons.length, 16, 'A sidebar deve declarar exatamente os 16 destinos primários.');
for (const [, view, markup] of navigationButtons) {
  const expectedIcon = expectedNavigation.get(view);
  assert.ok(expectedIcon, `View de navegação inesperada: ${view}.`);
  assert.match(markup, new RegExp(`href="assets/icons/atrium-ui-icons\\.svg#atrium-icon-${expectedIcon}"`), `${view} deve usar ${expectedIcon}.`);
  assert.doesNotMatch(markup, /<(?:path|circle|rect|line|polyline|polygon)\b/, `${view} não pode duplicar geometria SVG inline.`);
}
assert.match(index, /id="view-audit"/, 'A capacidade canônica de auditoria deve permanecer declarada.');
assert.match(read('js/views/ui-v2/configuration-presenter.js'), /dataset\.viewLink\s*=\s*'audit'/, 'Auditoria deve continuar acessível por Configurações > Sistema.');
assert.ok(symbolIds.includes('atrium-icon-audit'), 'O ícone semântico de auditoria deve permanecer disponível para a capacidade canônica.');

const menuMarkup = index.match(/<button[^>]*id="menuToggle"[\s\S]*?<\/button>/)?.[0] || '';
assert.match(menuMarkup, /aria-label="Abrir menu"/);
assert.match(menuMarkup, /#atrium-icon-menu/);
assert.doesNotMatch(menuMarkup, /☰/);
assert.match(index, /href="css\/views\/ui-v2\/icons\.css(?:\?[^\"]+)?"/);

const helper = read(helperPath);
assert.doesNotMatch(helper, /\bStore\b|\bfetch\s*\(|\bsecureFetch\b|localStorage|sessionStorage|setTimeout|setInterval/, 'O helper deve ser apresentação pura.');
assert.match(helper, /aria-hidden="true"/);
assert.match(helper, /focusable="false"/);

const packageJson = JSON.parse(read('package.json'));
const dependencies = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
assert.equal(Object.keys(dependencies).some(name => /(?:icon|lucide|fontawesome|heroicons|material)/i.test(name)), false, 'Não pode existir pacote de iconografia.');
assert.doesNotMatch(index, /(?:fontawesome|font-awesome|material-icons|material-symbols|unpkg\.com\/.*icon|cdn\.jsdelivr\.net\/.*icon)/i, 'Não pode existir CDN de iconografia.');

const brandHashes = {
  'assets/icons/atrium-logo.svg': '6db6896590bbe1a61a678e7760446b343299d1826109980edb10e2b4e68be8c1',
  'assets/icons/atrium-emblem.svg': '9a3e5e785f6f446a46c0719f8fe6fe4d6ea69e6f45c01204a6535d0fde5f0d23',
  'assets/icons/favicon.svg': '14fde9b36ce5828ac511f00d95adbcf5f674e4cb98668083a683549c5c690619'
};
for (const [relativePath, expectedHash] of Object.entries(brandHashes)) {
  assert.equal(sha256CanonicalText(relativePath), expectedHash, `${relativePath} deve permanecer idêntico ao Gate 22, independentemente do EOL do checkout.`);
}

const controlledFiles = [
  'index.html',
  ...fs.readdirSync(path.join(ROOT, 'js'), { recursive: true })
    .map(entry => String(entry).replaceAll('\\', '/'))
    .filter(entry => entry.endsWith('.js') && entry !== 'prompts-data.js')
    .map(entry => `js/${entry}`)
];
const emojiPattern = /[\u{1F000}-\u{1FAFF}]|[\u2600-\u26FF]|[\u2700-\u27BF]/gu;
const emojiHits = [];
for (const relativePath of controlledFiles) {
  const source = read(relativePath);
  for (const match of source.matchAll(emojiPattern)) emojiHits.push({ relativePath, value: match[0] });
}
assert.deepEqual(
  [...new Set(emojiHits.map(hit => hit.relativePath))].sort(),
  [
    'js/components/global-search.js',
    'js/features/configuration.js',
    'js/features/email-integration.js',
    'js/features/importer.js',
    'js/features/judicial-integrations.js',
    'js/features/monitoring.js',
    'js/features/system-admin.js'
  ],
  'A allowlist de emoji deve permanecer limitada aos fallbacks Classic aprovados.'
);
assert.equal(emojiHits.length, 30, 'Somente os 30 emojis Classic explicitamente preservados podem permanecer.');
assert.match(read('js/components/global-search.js'), /classic-search-icon/);
const importerPresenter = read('js/views/ui-v2/importer-presenter.js');
assert.match(importerPresenter, /icon:\s*'processes'/);
assert.match(importerPresenter, /icon:\s*'contacts'/);
assert.match(importerPresenter, /icon:\s*'tasks'/);
assert.match(importerPresenter, /iconSvg\(definition\.icon\)/);
const glyphHits = [];
for (const relativePath of controlledFiles) {
  for (const match of read(relativePath).matchAll(/[⌕⌾↗✕×]/gu)) glyphHits.push({ relativePath, value: match[0] });
}
assert.deepEqual(glyphHits, [
  { relativePath: 'js/features/configuration.js', value: '×' },
  { relativePath: 'js/features/configuration.js', value: '×' },
  { relativePath: 'js/features/email-integration.js', value: '✕' },
  { relativePath: 'js/features/prompts.js', value: '⌕' },
  { relativePath: 'js/features/publications.js', value: '×' }
], 'Somente glyphs Classic congelados e o sinal multiplicativo textual podem permanecer.');

assert.match(read('js/features/email-integration.js'), /presentation\?\.icon\?\.\('send'\) \|\| '🚀 '/);
assert.match(read('js/features/judicial-integrations.js'), /presentation\?\.icon\?\.\('certificate'\) \|\| '🧪 '/);
assert.match(read('js/views/ui-v2/monitoring-presenter.js'), /iconSvg\('monitoring'\)/);
assert.match(read('js/features/system-admin.js'), /diagnosticV2Html\(d, runtime, runtimeNeedsAttention\)/);
assert.match(read('js/features/system-admin.js'), /backupsV2Html\(\)/);

console.log(`✓ Sprite local: ${symbols.length} símbolos, IDs únicos, viewBox padronizado e currentColor.`);
console.log('✓ 16/16 destinos primários mapeados; auditoria canônica preservada em Configurações > Sistema.');
console.log('✓ Marca preservada, zero CDN/pacote de ícones e fallbacks Classic explicitamente isolados.');
