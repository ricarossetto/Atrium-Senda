import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

console.log('\n=== BETA READINESS DOCUMENTATION GATE ===\n');

const documentUrls = {
  readme: new URL('../README.md', import.meta.url),
  guide: new URL('../docs/BETA_TESTER_GUIDE.md', import.meta.url),
  readiness: new URL('../docs/development/BETA_READINESS.md', import.meta.url),
  roadmap: new URL('../docs/development/ROADMAP.md', import.meta.url),
  decisions: new URL('../docs/development/DECISIONS.md', import.meta.url),
  masterPlan: new URL('../DEVELOPMENT_MASTER_PLAN.md', import.meta.url)
};
const documents = Object.fromEntries(await Promise.all(
  Object.entries(documentUrls).map(async ([name, url]) => [name, await readFile(url, 'utf8')])
));
const allDocs = Object.values(documents).join('\n');

assert.doesNotMatch(allDocs, /Node(?:\.js)?\s*(?:>=|v(?:ers[aã]o)?)?\s*20(?:\.0\.0)?/i);
assert.doesNotMatch(documents.readme, /\bnpm\s+(?:install|start|test|run)\b/i);
assert.match(documents.readme, /Node\.js \*\*24\.x\*\*/);
assert.match(documents.readme, /pnpm install --frozen-lockfile/);

assert.doesNotMatch(allDocs, /\b(?:9|10|11)\s*\/\s*(?:9|10|11)\b|\b(?:9|10|11)\s+su[ií]tes?\b/i);
assert.doesNotMatch(allDocs, /assinatura HMAC|integridade HMAC|HMAC-SHA256/i);
assert.match(documents.readme, /checksum SHA-256/i);

for (const forbiddenClaim of [
  /calcula automaticamente o prazo/i,
  /preenche (?:automaticamente )?a data sugerida/i,
  /an[aá]lise preditiva de prazos fatais/i,
  /importa[cç][aã]o aut[oô]noma (?:de )?.*prazos/i,
  /consolida[cç][aã]o di[aá]ria autom[aá]tica/i,
  /Gmail Web\s*\/\s*Thunderbird/i,
  /modo local com modelos|modelos locais embutidos/i
]) {
  assert.doesNotMatch(allDocs, forbiddenClaim);
}

assert.match(allDocs, /confer[eê]ncia e confirma[cç][aã]o humana|confer[eê]ncia humana/i);
assert.match(documents.guide, /come[cç]a sem deadline/i);
assert.match(documents.guide, /n[aã]o infere automaticamente deadline jur[ií]dico/i);
assert.match(allDocs, /envio manual de publica[cç][aã]o|envio individual manual/i);
assert.match(allDocs, /boletim em lote manual/i);
assert.match(allDocs, /n[aã]o existe envio autom[aá]tico|n[aã]o h[aá] auto-send/i);
assert.match(documents.guide, /grava a mensagem cifrada apenas no ambiente local/i);
assert.match(documents.guide, /Nada [eé] enviado automaticamente/i);

assert.match(documents.roadmap, /NEXT — UI V2 dual-mode/i);
assert.match(documents.roadmap, /Nova UI como modo visual padr[aã]o/i);
assert.match(documents.roadmap, /UI Cl[aá]ssica preservada/i);
assert.match(documents.masterPlan, /arquitetura frontend foi modularizada/i);
assert.match(documents.masterPlan, /composition shell/i);
assert.match(documents.readiness, /Frontend modular conclu[ií]do/i);
assert.match(documents.readiness, /TECHNICAL BETA READY — PRE-UI-V2/);
assert.match(allDocs, /JSON cifrado/i);
assert.match(allDocs, /SQLite [eé] possibilidade futura|SQLite permanece uma possibilidade/i);

console.log('✓ Toolchain, e-mail manual, deadlines humanos, storage atual e UI V2 futura estão documentados sem claims legados.');
