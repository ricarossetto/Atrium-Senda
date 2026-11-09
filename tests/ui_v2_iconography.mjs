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
assert.equal(symbols.length, 60, 'O sprite deve conter somente os 60 símbolos realmente usados e documentados.');
assert.equal(new Set(symbolIds).size, symbolIds.length, 'IDs de símbolos devem ser únicos.');
assert.ok(symbolIds.every(Boolean), 'Todo símbolo deve possuir ID.');
assert.ok(symbols.every(symbol => symbol.viewBox === '0 0 24 24'), 'Todo símbolo deve usar viewBox 0 0 24 24.');
assert.ok(symbols.every(symbol => /currentColor/.test(symbol.attributes + symbol.body)), 'Todo símbolo deve herdar cor por currentColor.');
assert.doesNotMatch(sprite, /#[0-9a-f]{3,8}\b|\b(?:rgb|hsl)a?\s*\(/i, 'O sprite não pode conter cores de apresentação hardcoded.');
assert.doesNotMatch(sprite, /gradient|filter=|<image\b|data:/i, 'O sprite não pode conter gradiente, filtro, imagem raster ou data URI.');

const requiredNames = [
  'dashboard', 'processes', 'publications', 'tasks', 'agenda', 'contacts', 'leads', 'reports',
  'financial', 'calculations', 'documents', 'assistant', 'prompts', 'monitoring', 'integrations',
  'configuration', 'importer', 'audit', 'links', 'menu', 'sidebar-collapse', 'search',
  'sync', 'notification', 'theme-light', 'theme-dark', 'close', 'add', 'edit', 'delete',
  'maximize', 'restore',
  'download', 'upload', 'external-link', 'filter', 'more', 'chevron-left', 'chevron-right',
  'chevron-down', 'check', 'warning', 'info', 'lock', 'eye', 'eye-off'
];
for (const name of requiredNames) {
  assert.ok(symbolIds.includes(`atrium-icon-${name}`), `Símbolo obrigatório ausente: ${name}.`);
}

const index = read('index.html');
for (const relativePath of ['index.html']) {
  const iconReferences = [...read(relativePath).matchAll(/#(atrium-icon-[a-z-]+)"/g)].map(match => match[1]);
  for (const iconId of iconReferences) {
    assert.ok(symbolIds.includes(iconId), `${relativePath} referencia símbolo inexistente: ${iconId}.`);
  }
}
const expectedNavigation = new Map([
  ['dashboard', 'dashboard'], ['processes', 'processes'], ['inbox', 'publications'],
  ['kanban', 'tasks'], ['agenda', 'agenda'], ['contacts', 'contacts'], ['leads', 'leads'],
  ['financial', 'financial'], ['calculations', 'calculations'], ['reports', 'reports'], ['documents', 'documents'],
  ['assistant', 'assistant'], ['prompts', 'prompts'], ['integrations', 'integrations'],
  ['configuration', 'configuration'], ['links', 'links']
]);
const navigationButtons = [...index.matchAll(/<button class="nav-item[^"]*" data-view="([^"]+)"[^>]*>([\s\S]*?)<\/button>/g)];
assert.equal(navigationButtons.length, expectedNavigation.size, 'A sidebar deve declarar somente os destinos mapeados.');
for (const [, view, markup] of navigationButtons) {
  const expectedIcon = expectedNavigation.get(view);
  assert.ok(expectedIcon, `View de navegação inesperada: ${view}.`);
  assert.match(markup, new RegExp(`href="assets/icons/atrium-ui-icons\\.svg(?:\\?v=[^"#]+)?#atrium-icon-${expectedIcon}"`), `${view} deve usar ${expectedIcon}.`);
  assert.doesNotMatch(markup, /<(?:path|circle|rect|line|polyline|polygon)\b/, `${view} não pode duplicar geometria SVG inline.`);
}
assert.match(index, /id="view-audit"/, 'A capacidade oficial de auditoria deve permanecer declarada.');
assert.match(read('js/views/ui-v2/configuration-presenter.js'), /dataset\.viewLink\s*=\s*'audit'/, 'Auditoria deve continuar acessível por Configurações > Sistema.');
assert.ok(symbolIds.includes('atrium-icon-audit'), 'O ícone semântico de auditoria deve permanecer disponível para a capacidade oficial.');

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
  'assets/icons/atrium-logo.svg': '57aefeb535bb88fef83be1b1017b10705fab6b8942d141e11798e71f35086e75',
  'assets/icons/atrium-emblem.svg': '9a3e5e785f6f446a46c0719f8fe6fe4d6ea69e6f45c01204a6535d0fde5f0d23',
  'assets/icons/favicon.svg': '379bcf9905c59b682097de70d706c3a65ef2722402a4d6fbd9d0fca3fd66d558'
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
  [],
  'A interface e seus fallbacks não podem conter emojis Unicode.'
);
assert.equal(emojiHits.length, 0, 'Nenhum emoji Unicode pode permanecer no frontend do ATRIUM.');
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
  { relativePath: 'js/core/html-text.js', value: '×' },
  { relativePath: 'js/features/assistant.js', value: '×' },
  { relativePath: 'js/features/configuration.js', value: '×' },
  { relativePath: 'js/features/configuration.js', value: '×' },
  { relativePath: 'js/features/prompts.js', value: '⌕' },
  { relativePath: 'js/features/publications.js', value: '×' },
  { relativePath: 'js/features/publications.js', value: '×' },
  { relativePath: 'js/features/tasks.js', value: '×' },
  { relativePath: 'js/views/ui-v2/calculations-presenter.js', value: '×' },
  { relativePath: 'js/views/ui-v2/financial-chart.js', value: '×' },
  { relativePath: 'js/views/ui-v2/publications-presenter.js', value: '×' }
], 'Somente glyphs Classic congelados e o sinal multiplicativo textual podem permanecer.');

assert.doesNotMatch(read('js/features/email-integration.js'), /[\u{1F000}-\u{1FAFF}]/u);
assert.match(read('js/features/judicial-integrations.js'), /presentation\?\.icon\?\.\('certificate'\) \|\| iconSvg\('certificate'\)/);
assert.match(read('js/views/ui-v2/monitoring-presenter.js'), /iconSvg\('monitoring'\)/);
assert.match(read('js/features/system-admin.js'), /diagnosticV2Html\(d, runtime, runtimeNeedsAttention\)/);
assert.match(read('js/features/system-admin.js'), /backupsV2Html\(\)/);

console.log(`✓ Sprite local: ${symbols.length} símbolos, IDs únicos, viewBox padronizado e currentColor.`);
console.log(`✓ ${expectedNavigation.size - 1}/${expectedNavigation.size - 1} destinos primários mapeados; auditoria oficial preservada em Configurações > Sistema.`);
console.log('✓ Marca preservada, zero CDN/pacote de ícones e zero emojis Unicode no frontend.');
