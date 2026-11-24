import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const bootstrapSource = readFileSync('js/app/bootstrap.js', 'utf8');
const manifest = JSON.parse(readFileSync('asset-version-manifest.json', 'utf8'));

const scripts = [...html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)].map(match => match[1]);
assert.ok(scripts.length > 0, 'a tela de entrada precisa carregar ao menos um módulo');
for (const script of scripts) {
  assert.match(script, /^js\/.+\.js\?v=[^&"]+$/, `módulo de entrada sem versão de cache: ${script}`);
}

const bootstrap = scripts.find(script => /^js\/app\/bootstrap\.js\?v=/.test(script));
assert.ok(bootstrap, 'bootstrap.js precisa ser a entrada versionada');
const version = new URLSearchParams(bootstrap.split('?')[1]).get('v');
assert.ok(version, 'bootstrap.js precisa declarar a versão de cache');

for (const dependency of ['../portal.js', '../core/environment-badge.js']) {
  assert.match(
    bootstrapSource,
    new RegExp(`import ['"]${dependency.replace('.', '\\.')}\\?v=${version.replaceAll('.', '\\.')}['"]`),
    `${dependency} precisa usar a mesma versão do bootstrap`
  );
}

for (const asset of ['js/app/bootstrap.js', 'js/portal.js']) {
  assert.ok(manifest.assets[`${asset}|${version}`], `${asset} precisa constar no manifesto de versões`);
}

console.log(`[PASS] Cadeia de entrada e versões de módulos: ${scripts.length} script(s) na versão ${version}.`);
