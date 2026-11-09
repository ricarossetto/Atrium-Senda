import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

console.log('\n===============================================================');
console.log('  ATRIUM — BUSCA INTERNA SEM AUTOFILL DO NAVEGADOR             ');
console.log('===============================================================\n');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(path.join(ROOT, relative), 'utf8');

const CONTEXTUAL_SEARCH_IDS = [
  'globalSearch', 'leadSearch', 'financialSearch', 'taskListSearch', 'processSearch',
  'contactSearch', 'configurationSearch', 'auditSearch', 'assistantContextSearch',
  'promptsSearchInput', 'inpiSearchInput'
];

const html = await read('index.html');
const jsSources = Object.fromEntries(await Promise.all([
  'js/features/configuration.js',
  'js/features/financial.js'
].map(async file => [file, await read(file)])));

console.log('[C1] Nenhuma busca contextual usa type="search" (busca semântica do navegador)...');
const searchTypeOccurrences = [
  ...(html.match(/<input[^>]*type="search"[^>]*>/g) || []).map(match => `index.html: ${match.slice(0, 90)}`),
  ...Object.entries(jsSources).flatMap(([file, source]) =>
    [...(source.match(/<input[^>]*type="search"[^>]*>/g) || [])].map(match => `${file}: ${match.slice(0, 90)}`))
];
assert.deepEqual(searchTypeOccurrences, [], 'type="search" abre histórico/busca semântica do navegador; use type="text" + role="searchbox".');
console.log('  ✓ Zero inputs type="search" no shell e nas features de busca.');

console.log('[C2] Buscas contextuais declaram os atributos de supressão...');
for (const id of CONTEXTUAL_SEARCH_IDS) {
  const match = html.match(new RegExp(`<input[^>]*\\bid="${id}"[^>]*>`));
  assert.ok(match, `${id} deve existir no shell.`);
  const tag = match[0];
  for (const attribute of ['type="text"', 'inputmode="search"', 'role="searchbox"', 'autocomplete="off"', 'autocorrect="off"', 'autocapitalize="off"', 'spellcheck="false"']) {
    assert.ok(tag.includes(attribute), `${id} deve declarar ${attribute}.`);
  }
}
console.log(`  ✓ ${CONTEXTUAL_SEARCH_IDS.length} buscas contextuais com supressão de autofill/autocorreção.`);

console.log('[C3] Autenticação preserva autofill legítimo (sem regressão)...');
for (const attribute of ['autocomplete="email"', 'autocomplete="username"', 'autocomplete="new-password"', 'autocomplete="one-time-code"']) {
  assert.ok(html.includes(attribute), `Login/onboarding deve manter ${attribute}.`);
}
console.log('  ✓ Login e onboarding mantêm os atributos de autofill corretos.');

console.log('\n>>> BUSCA INTERNA SEM AUTOFILL: PASS <<<\n');
