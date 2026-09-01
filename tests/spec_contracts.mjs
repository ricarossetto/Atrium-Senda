import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SPECS = [
  'ui-mode',
  'store-persistence',
  'human-deadline-policy',
  'publication-treatment',
  'judicial-readonly-policy',
  'managed-judicial-connectivity',
  'document-management',
  'email-policy',
  'security-boundaries',
  'audit-policy',
  'import-policy'
];

const REQUIRED_SECTIONS = [
  'Purpose',
  'Canonical authority',
  'Invariants',
  'Allowed operations',
  'Forbidden operations',
  'State model',
  'Security boundary',
  'Failure semantics',
  'Persistence semantics',
  'Relevant tests'
];

const entries = await Promise.all(SPECS.map(async name => {
  const body = await readFile(new URL(`../specs/${name}.md`, import.meta.url), 'utf8');
  return [name, body];
}));
const specs = Object.fromEntries(entries);

for (const [name, body] of entries) {
  assert.match(body, /Status: \*\*(?:CURRENT|CURRENT[^\n]*FUTURE)/, `${name}: status CURRENT/FUTURE ausente.`);
  for (const section of REQUIRED_SECTIONS) {
    assert.ok(body.includes(`## ${section}`), `${name}: seção ${section} ausente.`);
  }
  assert.match(body, /`tests\//, `${name}: testes relevantes não apontados.`);
}

assert.match(specs['ui-mode'], /um [uú]nico App, um [uú]nico Store/i);
assert.match(specs['store-persistence'], /revision.*expectedRevision|expectedRevision.*revision/is);
assert.match(specs['human-deadline-policy'], /n[aã]o (?:s[aã]o |é )?inferid/i);
assert.match(specs['publication-treatment'], /n[aã]o significa ci[eê]ncia/i);
assert.match(specs['judicial-readonly-policy'], /Ci[eê]ncia, acknowledgment, assinatura, peti[cç][aã]o, protocolo/i);
assert.match(specs['managed-judicial-connectivity'], /backoff exponencial/i);
assert.match(specs['document-management'], /metadata can[oô]nica vive em `state\.documents`/i);
assert.match(specs['document-management'], /Soft delete precede a exclus[aã]o permanente/i);
assert.match(specs['document-management'], /FUTURE[^\n]*OCR, classifica[cç][aã]o, versionamento/i);
assert.match(specs['email-policy'], /envio exclusivamente manual/i);
assert.match(specs['security-boundaries'], /deny-by-default/i);
assert.match(specs['audit-policy'], /n[aã]o inclui CPF\/RG\/telefone\/e-mail\/endere[cç]o\/notas/i);
assert.match(specs['import-policy'], /Preview\/staging [eé] transit[oó]rio/i);

const agentGuidance = await readFile(new URL('../AGENTS.md', import.meta.url), 'utf8');
assert.match(agentGuidance, /leia o [ií]ndice `specs\/README\.md`/i);
assert.match(agentGuidance, /n[aã]o implemente comportamento marcado como `FUTURE`/i);

console.log(`✓ Especificações canônicas: ${SPECS.length}/${SPECS.length}, seções obrigatórias, políticas fundacionais e guidance agentivo PASS.`);
