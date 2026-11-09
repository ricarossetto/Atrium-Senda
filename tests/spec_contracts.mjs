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
  'full-text-search',
  'dav-integrations',
  'api-evolution',
  'email-policy',
  'security-boundaries',
  'audit-policy',
  'import-policy',
  'legal-intelligence',
  'judicial-intelligence',
  'ai-assistant',
  'productivity-reports'
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
assert.match(specs['document-management'], /metadata oficial vive em `state\.documents`/i);
assert.match(specs['document-management'], /Soft delete precede a exclus[aã]o permanente/i);
assert.match(specs['document-management'], /OCR nunca substitui o original/i);
assert.match(specs['document-management'], /FUTURE[^\n]*classifica[cç][aã]o, versionamento/i);
assert.match(specs['full-text-search'], /DERIVED \/ REBUILDABLE/i);
assert.match(specs['full-text-search'], /nunca é fonte de verdade/i);
assert.match(specs['full-text-search'], /n[aã]o s[aã]o fontes/i);
assert.match(specs['dav-integrations'], /EXPERIMENTAL \/ UNVERIFIED/i);
assert.match(specs['dav-integrations'], /n[aã]o existe timer, sync bidirecional ou reconcilia[cç][aã]o autom[aá]tica/i);
assert.match(specs['api-evolution'], /POLICY-ONLY \/ FUTURE/i);
assert.match(specs['api-evolution'], /n[aã]o s[aã]o duplicadas sob `\/v1` ou `\/v2`/i);
assert.match(specs['api-evolution'], /nenhuma rota atual/i);
assert.match(specs['email-policy'], /envio exclusivamente manual/i);
assert.match(specs['security-boundaries'], /deny-by-default/i);
assert.match(specs['audit-policy'], /n[aã]o inclui CPF\/RG\/telefone\/e-mail\/endere[cç]o\/notas/i);
assert.match(specs['import-policy'], /Preview\/staging [eé] transit[oó]rio/i);
assert.match(specs['legal-intelligence'], /LICENSE_REVIEW_REQUIRED/);
assert.match(specs['legal-intelligence'], /dado n[ãa]o confi[áa]vel/i);
assert.match(specs['legal-intelligence'], /desabilitado por padr[ãa]o/i);
assert.match(specs['legal-intelligence'], /nunca aparece em HTML, JS p[uú]blico, resposta de API, prompt ou log/i);
assert.match(specs['judicial-intelligence'], /EXPERIMENTAL \/ UNVERIFIED/i);
assert.match(specs['judicial-intelligence'], /n[aã]o autoritativo/i);
assert.match(specs['judicial-intelligence'], /desativada por padrão/i);
assert.match(specs['judicial-intelligence'], /clean-room/i);
assert.match(specs['ai-assistant'], /nunca [eé] devolvida ao navegador/i);
assert.match(specs['ai-assistant'], /master_admin/);
assert.match(specs['ai-assistant'], /CSRF/);
assert.match(specs['ai-assistant'], /19 skills/);
assert.match(specs['productivity-reports'], /Essa exceção se restringe ao analisador/);
assert.match(specs['productivity-reports'], /Enviar dados dos relatórios a qualquer provedor externo/);
const specIndex = await readFile(new URL('../specs/README.md', import.meta.url), 'utf8');
assert.doesNotMatch(specIndex, /\(operational-analysis\.md\)/);

const agentGuidance = await readFile(new URL('../AGENTS.md', import.meta.url), 'utf8');
assert.match(agentGuidance, /leia o [ií]ndice `specs\/README\.md`/i);
assert.match(agentGuidance, /n[aã]o implemente comportamento marcado como `FUTURE`/i);

console.log(`✓ Especificações oficiais: ${SPECS.length}/${SPECS.length}, seções obrigatórias, políticas fundacionais e guidance agentivo PASS.`);
