import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractEprocDetailsInPage } from '../collector/adapters/eproc.mjs';
import { extractProcessSecrecy, PROCESS_SECRECY_LEVEL_PATTERN_SOURCES } from '../lib/judicial/eproc/parsers/process-secrecy.mjs';

console.log('\n=== EXTRAÇÃO EPROC DENTRO DA PÁGINA (AUTOSSUFICIÊNCIA) ===\n');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A função roda no contexto do navegador via page.evaluate: precisa funcionar
// sem nenhum import/closures. Executamos em vm sem escopo de módulo para provar.
function runInPageContext(text) {
  const sandbox = {
    document: {
      body: { innerText: text },
      querySelector: () => null,
      querySelectorAll: () => []
    }
  };
  const fn = vm.runInNewContext(`(${extractEprocDetailsInPage.toString()})`, sandbox, { timeout: 5_000 });
  return fn({ injectedNames: [], secrecyPatterns: PROCESS_SECRECY_LEVEL_PATTERN_SOURCES });
}

const publicPage = runInPageContext('Processo sintético. Nível de Sigilo: 0 (Público)');
assert.equal(publicPage.secrecy, false, 'Nível 0 na página não marca sigilo.');
assert.equal(publicPage.secrecyLevel, '');
assert.equal(publicPage.secrecyExplicit, true, 'Nível declarado é evidência explícita.');
assert.equal(typeof publicPage.movements, 'object');

const secretPage = runInPageContext('Processo sintético. Nível de Sigilo: 2');
assert.equal(secretPage.secrecy, true, 'Nível 2 na página marca sigilo.');
assert.equal(secretPage.secrecyLevel, 'Segredo de Justiça (Nível 2)');
assert.equal(secretPage.secrecyExplicit, true);

const silentPage = runInPageContext('Processo sintético sem menção de nível.');
assert.equal(silentPage.secrecy, false);
assert.equal(silentPage.secrecyExplicit, false, 'Ausência de menção não é evidência.');
console.log('✓ Função da página roda sem imports (vm) e extrai o sigilo corretamente.');

// Paridade página × Node com as mesmas fontes de expressão (uma única regra).
for (const text of [
  'Nível de Sigilo: 0 (Público)',
  'Nível de Sigilo: 3',
  '<input id="txtNivelSigilo" value="1">',
  '<input value="4" id="nivelSigilo">',
  'Sem Sigilo (Nível 0) · Segredo de Justiça (Nível 1) em anexos',
  'Sem menção de nível'
]) {
  const page = runInPageContext(text);
  const node = extractProcessSecrecy(text);
  assert.equal(page.secrecy, node.level > 0, `Divergência de nível para: ${text}`);
  assert.equal(page.secrecyExplicit, node.explicit, `Divergência de evidência para: ${text}`);
}
console.log('✓ Extração da página e do Node permanecem idênticas.');

// Guarda estática: o adapter não pode voltar a chamar função importada dentro da página
// nem passar mais de um argumento (page.evaluate do Playwright aceita UM argumento).
const adapterSource = await readFile(path.join(ROOT, 'collector/adapters/eproc.mjs'), 'utf8');
assert.match(
  adapterSource,
  /page\.evaluate\(extractEprocDetailsInPage, \{\s*injectedNames: injectedLawyerNames,\s*secrecyPatterns: PROCESS_SECRECY_LEVEL_PATTERN_SOURCES\s*\}\)/,
  'A página deve receber a função autossuficiente e UM objeto com nomes e expressões.'
);
assert.doesNotMatch(
  adapterSource,
  /page\.evaluate\(extractEprocDetailsInPage, injectedLawyerNames/,
  'A forma antiga (dois argumentos) não pode voltar: Playwright recusa com "Too many arguments".'
);
assert.match(adapterSource, /export function extractEprocDetailsInPage\(\{ injectedNames = \[\], secrecyPatterns = \[\] \} = \{\}\)/, 'A função da página deve desestruturar o objeto recebido.');
assert.doesNotMatch(adapterSource, /extractProcessSecrecy\s*\(/, 'O adapter não pode chamar extractProcessSecrecy dentro do contexto da página.');
assert.doesNotMatch(adapterSource, /describeProcessSecrecy\s*\(/, 'O adapter não pode chamar describeProcessSecrecy dentro do contexto da página.');
console.log('✓ Guarda estática do contrato page.evaluate presente (um argumento, função autossuficiente).');

console.log('\n>>> EXTRAÇÃO EPROC NA PÁGINA: PASS <<<\n');
