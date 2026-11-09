import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAtriumCatalog, renderSkillsData } from '../scripts/generate-skills-data.mjs';
import { loadLexIntelligentiaSkills } from '../lib/legal-intelligence/adapters/lex-intelligentia-adapter.mjs';
import { createLegalIntelligenceRegistry } from '../lib/legal-intelligence/registry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET_PATTERNS = [/sk_live_[A-Za-z0-9]/, /sk-ant-[A-Za-z0-9]/, /ghp_[A-Za-z0-9]/, /AKIA[0-9A-Z]{12,}/, /BEGIN (?:RSA |EC )?PRIVATE KEY/];
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2700}-\u{27BF}\u{2600}-\u{26FF}]/u;

console.log('\n===============================================================');
console.log('  ATRIUM — CATÁLOGO DERIVADO DE SKILLS E VENDOR');
console.log('===============================================================\n');

const check = execFileSync(process.execPath, ['scripts/generate-skills-data.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
assert.match(check, /\[PASS\] skills-data\.js sincronizado/);
console.log('  [1] skills-data.js está em sincronia com o catálogo de referência + vendor Lex.');

const catalogRaw = await fs.readFile(path.join(ROOT, 'lib/legal-intelligence/catalog/skills-catalog.json'), 'utf8');
const catalog = JSON.parse(catalogRaw);
assert.equal(catalog.skills.length, 9);
const ids = catalog.skills.map(skill => skill.id);
assert.equal(new Set(ids).size, ids.length, 'Catálogo ATRIUM não pode conter ids duplicados.');
assert.ok(catalog.skills.some(skill => skill.id === 'legal-agent' && skill.instructions.includes('Fase 1 — Ingestão')));
assert.ok(catalog.skills.some(skill => skill.id === 'previdenciario-incapacidade'));
for (const productSkill of ['legal-agent', 'legal-ingest', 'legal-planner', 'legal-research-br', 'legal-draft-br', 'legal-audit', 'fazenda-publica-cumprimento', 'prescricao-intercorrente', 'previdenciario-incapacidade']) {
  assert.ok(catalog.skills.some(skill => skill.id === productSkill), `Skill de produto ausente: ${productSkill}`);
}
const sourceEntries = await fs.readdir(path.join(ROOT, '.agents/skills'), { withFileTypes: true });
const toolingCatalog = await buildAtriumCatalog({ readdir: async () => [...sourceEntries, ...['astra-orchestrator', 'security-audit'].filter(name => !sourceEntries.some(entry => entry.name === name)).map(name => ({ name, isDirectory: () => true }))] });
assert.ok(toolingCatalog.excludedDevOnly.includes('astra-orchestrator'), 'Tooling de orquestração não deve entrar no catálogo do produto.');
assert.ok(toolingCatalog.excludedDevOnly.includes('security-audit'), 'Skills de engenharia/segurança são dev-only e ficam fora do catálogo.');
assert.deepEqual(toolingCatalog.skills, catalog.skills);
assert.deepEqual(toolingCatalog.contextSkills, catalog.contextSkills);
assert.equal(catalog.contextSkills.length, 3);
assert.ok(catalog.contextSkills.some(skill => skill.id === 'jev-data-analyzer' && skill.category === 'analise-operacional'));
assert.ok(!catalog.excludedDevOnly.includes('jev-data-analyzer'));
assert.ok(!catalog.excludedDevOnly.includes('legal-agent'), 'Skill jurídica não pode ser classificada como dev-only.');
assert.ok(!catalog.skills.some(skill => skill.id === 'astra-orchestrator'), 'Skill de tooling não deve entrar no catálogo do produto.');
console.log('  [2] Catálogo oficial contém 9 skills jurídicas ATRIUM e exclui tooling de desenvolvimento.');

const lex = await loadLexIntelligentiaSkills({ rootDir: ROOT, readFile: fs.readFile, readdir: fs.readdir });
const vendorRoot = path.join(ROOT, 'vendor', 'legal-intelligence');
const hasVendor = await fs.stat(vendorRoot).then(() => true).catch(() => false);
if (hasVendor) {
  assert.equal(lex.available, true);
  assert.equal(lex.skills.length, 7);
  for (const required of ['peticao-analyzer', 'jurisprudencia-miner', 'tese-juridica-validator', 'calculadora-processual', 'contrato-analyzer-br']) {
    assert.ok(lex.skills.some(skill => skill.id === required), `Skill Lex obrigatória ausente: ${required}`);
  }
  assert.ok(lex.skills.every(skill => skill.license === 'MIT'));
  console.log('  [3] Vendor Lex Intelligentia preservado com 7 skills MIT (CAPPD, precedentes, teses, cálculo e contratos).');
} else {
  assert.equal(lex.available, false, 'Edição aberta sem vendor deve degradar o Lex como indisponível.');
  assert.equal(lex.skills.length, 0);
  console.log('  [3] Vendor ausente na edição aberta: Lex indisponível com degradação declarada.');
}

const skillsDataRaw = await fs.readFile(path.join(ROOT, 'js/skills-data.js'), 'utf8');
assert.ok(skillsDataRaw.includes('"source": "atrium"'));
if (hasVendor) assert.ok(skillsDataRaw.includes('"source": "lex-intelligentia"'));
const atriumCatalog = await buildAtriumCatalog({ readdir: fs.readdir, readFile: fs.readFile });
const firstRender = renderSkillsData({ atriumSkills: atriumCatalog.skills, lexSkills: lex.skills.map(skill => ({ ...skill, description: skill.description })) });
const secondRender = renderSkillsData({ atriumSkills: atriumCatalog.skills, lexSkills: lex.skills.map(skill => ({ ...skill, description: skill.description })) });
assert.equal(createHash('sha256').update(firstRender).digest('hex'), createHash('sha256').update(secondRender).digest('hex'));
console.log('  [4] Geração determinística: duas execuções produzem bytes idênticos.');

for (const skill of catalog.skills) {
  assert.ok(!EMOJI_RE.test(`${skill.title} ${skill.description}`), `Skill ATRIUM com símbolo decorativo: ${skill.id}`);
}
for (const skill of lex.skills) {
  assert.ok(!EMOJI_RE.test(skill.title), `Skill Lex com símbolo decorativo no título: ${skill.id}`);
}
assert.ok(!EMOJI_RE.test(skillsDataRaw.slice(0, 4_000)));
console.log('  [5] Catálogo exibível sem emojis nem símbolos decorativos (guardrail de UI).');

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}
if (hasVendor) {
  const vendorFiles = await walk(vendorRoot);
  assert.ok(vendorFiles.length >= 40);
  for (const file of vendorFiles) {
    const buffer = await fs.readFile(file);
    const text = buffer.toString('utf8');
    for (const pattern of SECRET_PATTERNS) {
      assert.ok(!pattern.test(text), `Padrão de segredo encontrado em ${path.relative(ROOT, file)}`);
    }
  }
  assert.ok(vendorFiles.every(file => path.extname(file) !== '.env'));
  console.log('  [6] Vendor sem credenciais, cookies, chaves ou arquivos .env.');
} else {
  console.log('  [6] Vendor ausente na edição aberta: varredura de segredos vetada neste modo.');
}

const registry = await createLegalIntelligenceRegistry({ rootDir: ROOT, readFile: fs.readFile, readdir: fs.readdir });
if (hasVendor) {
  assert.equal(registry.status().recipes.available, registry.status().recipes.total);
  const recipeManifest = JSON.parse(await fs.readFile(path.join(vendorRoot, 'ma-serra', 'rom', 'recipes.json'), 'utf8'));
  for (const recipe of recipeManifest.recipes) {
    const buffer = await fs.readFile(path.join(vendorRoot, 'ma-serra', 'rom', recipe.file));
    assert.equal(createHash('sha256').update(buffer).digest('hex'), recipe.sha256, `Integridade divergente: ${recipe.id}`);
  }
  console.log('  [7] Recipes ROM pinadas por sha256 e biblioteca sem licença bloqueada no registry.');
} else {
  assert.equal(registry.status().recipes.available, 0, 'Sem vendor, nenhuma receita deve estar disponível.');
  console.log('  [7] Sem vendor, o registry reporta degradação declarada das receitas.');
}
assert.equal(registry.status().promptLibrary.imported, false);

console.log('\n>>> SKILLS CATALOG GENERATION: PASS <<<\n');
