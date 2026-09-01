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
const currentStatusDocs = [documents.readme, documents.guide, documents.readiness, documents.roadmap, documents.masterPlan].join('\n');

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

assert.doesNotMatch(currentStatusDocs, /HUMAN BETA GATE 1 PASSED — PRE-UI-V2|TECHNICAL BETA READY — PRE-UI-V2|Modo atual:[^\n]*PRE-UI-V2|UI V2[^\n]*(?:futur|etapa futura)|UI Cl[aá]ssica[^\n]*(?:[uú]nica interface)|NEXT — UI V2|UI V2 n[aã]o faz parte/i);
assert.doesNotMatch(currentStatusDocs, /\b55\s*\/\s*55\b|\b55\s+su[ií]tes?|Tests-55/i);
assert.match(documents.readme, /UI V2 [eé] a interface visual padr[aã]o/i);
assert.match(documents.readme, /UI Cl[aá]ssica permanece dispon[ií]vel como fallback/i);
assert.match(documents.readme, /mesmo App, o mesmo Store, o mesmo backend e as mesmas regras de neg[oó]cio/i);
assert.match(documents.guide, /UI V2 como interface padr[aã]o/i);
assert.match(documents.guide, /UI Cl[aá]ssica como fallback visual/i);
assert.match(documents.readiness, /UI V2 MIGRATION COMPLETE/);
assert.match(documents.readiness, /um [uú]nico App, Store e backend/i);
assert.doesNotMatch(documents.readiness, /final production ready|produ[cç][aã]o certificada/i);

const roadmapOrder = [
  '## NEXT — Iconography & Visual Language Polish',
  '## AFTER — Global Visual Polish',
  '## THEN — Managed Judicial Connectivity'
].map(heading => documents.roadmap.indexOf(heading));
assert.ok(roadmapOrder.every(index => index >= 0), 'O roadmap deve conter a sequência visual e judicial futura completa.');
assert.ok(roadmapOrder[0] < roadmapOrder[1] && roadmapOrder[1] < roadmapOrder[2], 'A ordem NEXT → AFTER → THEN deve ser preservada.');
assert.match(documents.roadmap, /Migra[cç][aã]o UI V2 conclu[ií]da nas 17 views can[oô]nicas/i);
assert.match(documents.roadmap, /Esta capacidade est[aá] apenas planejada; n[aã]o foi implementada pelo Gate 22/i);
assert.match(documents.roadmap, /read-only por padr[aã]o/i);
assert.match(documents.roadmap, /(?:sem|n[aã]o realizar) ci[eê]ncia, assinatura ou protocolo autom[aá]tico/i);
assert.doesNotMatch(documents.roadmap, /Managed Judicial Connectivity[^\n]*(?:entregue|implementada|conclu[ií]da)/i);

assert.match(documents.masterPlan, /arquitetura frontend foi modularizada/i);
assert.match(documents.masterPlan, /composition shell/i);
assert.match(documents.readiness, /Frontend modular conclu[ií]do/i);
assert.match(documents.decisions, /Migra[cç][aã]o UI V2 conclu[ií]da em modo dual/i);
assert.match(documents.decisions, /Planejamento hist[oó]rico da UI V2 em modo dual/i);
assert.match(allDocs, /JSON cifrado/i);
assert.match(allDocs, /SQLite [eé] possibilidade futura|SQLite permanece uma possibilidade/i);
assert.doesNotMatch(allDocs, /SQLite\s+(?:est[aá]|foi|[eé])\s+(?:implementad[oa]|o padr[aã]o atual)/i);
assert.doesNotMatch(currentStatusDocs, /Managed Judicial Connectivity[^\n]*(?:j[aá] implementada|entregue|conclu[ií]da)/i);

console.log('✓ Readiness documental aprovado: UI V2 concluída/default, Classic fallback, mesma autoridade e roadmap futuro supervisionado.');
