import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkAssetVersions, findUnversionedLocalImports } from '../scripts/asset-version-manifest.mjs';

console.log('--- Iniciando Testes: Versões de asset (cache-busting do frontend) ---');

// O guardião existe porque um módulo alterado sem rebump do `?v=` continua sendo servido do
// cache do navegador depois do deploy — foi a causa real do botão novo "não aparecer" na tela.
const result = await checkAssetVersions({ write: false });

assert.ok(result.references >= 20, `esperava dezenas de referências versionadas, achei ${result.references}`);
assert.deepEqual(
  result.stale,
  [],
  `asset alterado sem rebump do ?v=: ${result.stale.map(item => `${item.asset} (?v=${item.version})`).join(', ')}`
);

const manifest = JSON.parse(await readFile(new URL('../asset-version-manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.version, 1, 'manifesto versionado');
const keys = Object.keys(manifest.assets);
assert.ok(keys.every(key => key.includes('|')), 'manifesto guarda asset|versão -> hash');
assert.ok(keys.some(key => key.startsWith('js/app/bootstrap.js|')), 'cadeia de entrada registrada');
assert.ok(keys.some(key => key.startsWith('js/views/ui-v2/shell.js|')), 'módulos de UI registrados');
assert.ok(keys.some(key => key.startsWith('css/views/ui-v2/publications.css|')), 'CSS de publicações registrado');

const stable = await checkAssetVersions({ write: false });
assert.equal(stable.stale.length, 0, 'verificação é estável entre execuções');

const unversioned = await findUnversionedLocalImports();
assert.deepEqual(
  unversioned,
  [],
  `import local sem ?v=: ${unversioned.map(item => `${item.source}:${item.line} (${item.spec})`).join(', ')}`
);

console.log(`  OK: ${result.references} referências versionadas conferidas; nenhum asset mudou sem bump.`);
console.log(`  OK: ${unversioned.length} importações locais sem versão (esperado: 0).`);
console.log('\n[PASS] Cache-busting do frontend validado.');
