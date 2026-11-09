import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

console.log('=== Política de interface (lintapple): contrato das superfícies públicas ===');

const root = new URL('..', import.meta.url);
const policy = JSON.parse(await readFile(new URL('ui-policy.json', root), 'utf8'));
const budget = JSON.parse(await readFile(new URL('tests/ui-policy-debt-budget.json', root), 'utf8'));
const runner = await readFile(new URL('scripts/ui-lint.mjs', root), 'utf8');
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

// A policy é a autoridade declarada do gate: sem ela o lintapple usa padrões alheios.
for (const field of ['fonts', 'fontSizes', 'typeRules', 'viewports', 'colorSchemes', 'exceptions']) {
  assert.ok(policy[field], `ui-policy.json precisa declarar ${field}.`);
}
for (const font of ['Inter', 'Georgia', 'serif']) {
  assert.ok(policy.fonts.includes(font), `Pilha aprovada precisa conter ${font}.`);
}
assert.deepEqual(
  policy.fontSizes,
  [10, 11, 12, 13, 14, 16, 18, 20, 24, 32, 40, 48],
  'Escala tipográfica aprovada (guia visual 4).'
);
assert.deepEqual(policy.colorSchemes.sort(), ['dark', 'light'], 'Gate precisa cobrir os dois temas.');
assert.deepEqual(
  policy.viewports.map(v => v.width).sort((a, b) => a - b),
  [390, 1440],
  'Viewports de pressão cobertos: mobile e desktop.'
);
assert.ok(policy.minControlSize >= 24, 'Mínimo de controle precisa existir.');

// Controles densos são declarados, não silenciados.
for (const rule of policy.controlSizeRules) {
  assert.ok(rule.selector && rule.minSize > 0, 'Regra de controle denso precisa de selector e minSize.');
}
// Exceção sem razão é enfraquecimento silencioso.
for (const exception of policy.exceptions) {
  assert.ok(exception.rules?.length && exception.selector && exception.reason?.length > 40,
    'Exceção precisa declarar rules, selector e reason substantivo.');
}

// O runner precisa isolar o servidor em dados sintéticos.
for (const guard of ['mkdtemp', 'KELLER_DATA_DIR', 'JURISFLOW_DATA_DIR', 'ATRIUM_MOCK_SMTP']) {
  assert.ok(runner.includes(guard), `scripts/ui-lint.mjs precisa conter ${guard}.`);
}
assert.match(runner, /waitForReady/, 'Runner precisa aguardar o servidor antes de auditar.');
assert.match(runner, /pathToFileURL/, 'Runner precisa resolver o módulo de setup como file:// URL.');

// DevDependency apenas: nada de runtime novo.
assert.ok(pkg.devDependencies?.lintapple, 'lintapple entra como devDependency.');
assert.ok(!pkg.dependencies?.lintapple, 'lintapple não pode virar dependência de runtime.');
assert.equal(typeof pkg.scripts['lint:ui'], 'string', 'package.json precisa expor o script lint:ui.');

// Orçamento de dívida do app autenticado: precisa existir, ser inteiro e documentado.
assert.ok(Number.isInteger(budget.budget) && budget.budget >= 0, 'Orçamento de dívida precisa ser inteiro não negativo.');
assert.ok(budget.baseline?.byRule, 'Orçamento precisa documentar a baseline por regra.');
const somaBaseline = Object.values(budget.baseline.byRule).reduce((a, b) => a + b, 0);
assert.ok(somaBaseline > 0, 'Baseline por regra precisa ter valores.');
// A soma baseline é a fotografia; o teto vigente só pode ser menor ou igual.
assert.ok(budget.budget <= somaBaseline,
  `Teto ${budget.budget} não pode superar a soma da baseline ${somaBaseline}; reduzir exige correção real.`);
assert.match(budget.note || '', /só pode ser REDUZIDO|não pode crescer|teto/, 'Nota do orçamento precisa deixar a direção explícita.');

console.log('ui_policy_public_surfaces: PASS');
process.exit(0);
