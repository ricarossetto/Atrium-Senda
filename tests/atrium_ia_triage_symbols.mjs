import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'server.mjs'), 'utf8');
const lines = source.split(/\r?\n/);

// Símbolos que entram por configuração de ambiente: `process.env.X` ou `env.X`
// nunca são importados, e o teste não deve confundi-los com referência ausente.
const ENV_ACCESS = /(?:process\s*\.\s*env|(?<![.\w])env)\s*(?:\.\s*|\[['"])([A-Za-z_$][\w$]*)/g;

function importedAndDeclared(text) {
  const imported = new Set();
  const importRe = /import\s*\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g;
  let match;
  while ((match = importRe.exec(text))) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) imported.add(name);
    }
  }
  const declared = new Set();
  const declRe = /(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
  while ((match = declRe.exec(text))) declared.add(match[1]);
  return { imported, declared };
}

const { imported, declared } = importedAndDeclared(source);

// Referências a nome ausente quebram em tempo de execução, nao de carga: o
// servidor sobe normalmente e a funcionalidade falha só quando é usada. Foi
// assim que o risco de atraso do Atrium IA ficou sem análises em produção.
const SYMBOL = /\b([A-Z][A-Z0-9]*(?:_LIMIT|_BATCH_LIMIT|_MAX|_TTL|_WINDOW|_THRESHOLD|_TIMEOUT|_RETRIES|_CONCURRENCY|_INTERVAL_MS|_PAIR_LIMIT))\b/g;

const missing = [];
lines.forEach((line, index) => {
  if (/^\s*(?:import|export)\b/.test(line)) return;
  if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) return;
  const withoutEnv = line.replace(ENV_ACCESS, '');
  let match;
  const re = new RegExp(SYMBOL.source, 'g');
  while ((match = re.exec(withoutEnv))) {
    const symbol = match[1];
    if (imported.has(symbol) || declared.has(symbol)) continue;
    missing.push({ line: index + 1, symbol, text: line.trim().slice(0, 90) });
  }
});

assert.deepEqual(
  missing,
  [],
  `server.mjs referencia simbolos nao importados nem declarados:\n${missing.map((m) => `  linha ${m.line}: ${m.symbol}`).join('\n')}`
);

// O contrato mínimo da correção: o limite do lote de risco tem de estar
// disponível onde a triagem automática pós-sync o usa.
assert.ok(imported.has('TASK_RISK_BATCH_LIMIT'), 'server.mjs precisa importar TASK_RISK_BATCH_LIMIT de lib/tasks/task-risk-suggestions.mjs.');
const riskImport = source.match(/import\s*\{([^}]*)\}\s*from\s*['"]\.\/lib\/tasks\/task-risk-suggestions\.mjs['"]/);
assert.ok(riskImport, 'a importacao de task-risk-suggestions.mjs existe em server.mjs.');
assert.ok(
  riskImport[1].split(',').map((part) => part.trim()).includes('TASK_RISK_BATCH_LIMIT'),
  'TASK_RISK_BATCH_LIMIT vem da importacao de task-risk-suggestions.mjs.'
);
assert.ok(
  /runTaskRiskTriage\(\{\s*limit:\s*TASK_RISK_BATCH_LIMIT\s*\}\)/.test(source),
  'a triagem automatica de risco usa o limite declarado, nao um numero solto.'
);

console.log('OK: server.mjs nao referencia simbolos ausentes e o risco pos-sync usa o limite declarado.');
