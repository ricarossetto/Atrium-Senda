import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const indexSource = read('index.html');
const tokensSource = read('css/views/ui-v2/tokens.css');
const primitivesSource = read('css/views/ui-v2/primitives.css');
const shellSource = read('css/views/ui-v2/shell.css');
const dashboardSource = read('css/views/ui-v2/dashboard.css');
const uiSources = [
  'js/views/ui-v2/mode.js',
  'js/views/ui-v2/primitives.js',
  'js/views/ui-v2/system-status.js',
  'js/views/ui-v2/shell.js',
  'js/views/ui-v2/dashboard.js'
].map(read);
const packageJson = JSON.parse(read('package.json'));

assert.ok(indexSource.indexOf('js/views/ui-v2/preference-init.js') < indexSource.indexOf('css/portal.css'), 'O modo deve ser resolvido antes do primeiro stylesheet operacional.');
for (const stylesheet of ['tokens.css', 'primitives.css', 'shell.css', 'dashboard.css']) {
  assert.match(indexSource, new RegExp(`css/views/ui-v2/${stylesheet.replace('.', '\\.')}`), `${stylesheet} deve estar carregado.`);
}
for (const [token, value] of Object.entries({
  '--v2-color-background': '#171915',
  '--v2-color-surface': '#1E211C',
  '--v2-color-foreground': '#ECECE5',
  '--v2-color-primary': '#819477',
  '--v2-color-gold': '#C0A15C'
})) {
  assert.ok(tokensSource.includes(`${token}: ${value}`), `Token dark ausente: ${token}.`);
}
for (const value of ['#F7F5EF', '#FCFBF7', '#292A25', '#596B50', '#A88742']) {
  assert.ok(tokensSource.includes(value), `Valor light ausente: ${value}.`);
}
assert.match(tokensSource, /html\[data-ui="v2"\]/, 'O namespace V2 deve estar isolado no root.');
assert.doesNotMatch([primitivesSource, shellSource, dashboardSource].join('\n'), /#[0-9a-f]{3,8}\b/i, 'Hex values não podem vazar para CSS de componentes V2.');
assert.match(primitivesSource, /prefers-reduced-motion:\s*reduce/, 'A foundation deve respeitar reduced motion.');
assert.match(primitivesSource, /:focus-visible/, 'A foundation deve declarar foco visível.');
assert.match(indexSource, /data-v2-nav-group/, 'A navegação V2 deve usar agrupamento semântico.');
assert.match(dashboardSource, /#view-dashboard/, 'O piloto deve permanecer escopado ao Dashboard.');
assert.equal((indexSource.match(/id="appShell"/g) || []).length, 1, 'Deve existir uma única árvore App.');
assert.equal((indexSource.match(/id="view-dashboard"/g) || []).length, 1, 'Deve existir um único Dashboard operacional.');
assert.ok(uiSources.every(source => !/from ['"]\.\.\/core\/store\.js|\bStore\.(?:save|flush|audit|upsert)\b/.test(source)), 'Primitives e adapters V2 não podem acoplar ao Store.');
assert.equal(Object.keys(packageJson.dependencies).some(name => ['react', 'vue', 'svelte', 'tailwindcss'].includes(name)), false, 'Nenhum framework frontend pode ser adicionado.');

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => Number.parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}

function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}

assert.ok(contrast('#292A25', '#F7F5EF') >= 7, 'Texto principal light deve passar AAA.');
assert.ok(contrast('#56584F', '#F7F5EF') >= 4.5, 'Texto secundário light deve passar AA.');
assert.ok(contrast('#ECECE5', '#171915') >= 7, 'Texto principal dark deve passar AAA.');
assert.ok(contrast('#BCC0B5', '#171915') >= 4.5, 'Texto secundário dark deve passar AA.');

console.log('✓ Foundation UI V2 aprovada: tokens light/dark, isolamento, primitives, contraste, um DOM e zero framework.');
