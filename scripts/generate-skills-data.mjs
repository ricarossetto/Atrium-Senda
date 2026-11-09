import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter, firstHeading, previewText, singleLine } from '../lib/legal-intelligence/frontmatter.mjs';
import { loadLexIntelligentiaSkills } from '../lib/legal-intelligence/adapters/lex-intelligentia-adapter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENTS_SKILLS_DIR = path.join(ROOT, '.agents', 'skills');
const CATALOG_FILE = path.join(ROOT, 'lib', 'legal-intelligence', 'catalog', 'skills-catalog.json');
const SKILLS_DATA_FILE = path.join(ROOT, 'js', 'skills-data.js');
// Catálogo do produto é um allowlist explícito de skills jurídicas: qualquer outra
// skill em .agents/skills é tooling de desenvolvimento e fica fora do catálogo.
const PRODUCT_SKILL_IDS = new Set([
  'legal-agent',
  'legal-ingest',
  'legal-planner',
  'legal-research-br',
  'legal-draft-br',
  'legal-audit',
  'fazenda-publica-cumprimento',
  'prescricao-intercorrente',
  'previdenciario-incapacidade'
]);

// Skills de contexto do produto: fonte propria em .agents/skills, renderizadas apos
// as skills juridicas e o vendor Lex (contrato em specs/ai-assistant.md).
const CONTEXT_SKILL_IDS = new Map([
  ['consulta-judicial-mcp', 'pesquisa-judicial'],
  ['padroes-de-qualidade', 'qualidade'],
  ['jev-data-analyzer', 'analise-operacional']
]);

const ATRIUM_CATEGORIES = Object.freeze({
  'legal-agent': 'orquestracao',
  'legal-ingest': 'ingestao',
  'legal-planner': 'planejamento',
  'legal-research-br': 'pesquisa',
  'legal-draft-br': 'redacao',
  'legal-audit': 'auditoria',
  'fazenda-publica-cumprimento': 'execucao-fazenda-publica',
  'prescricao-intercorrente': 'execucao',
  'previdenciario-incapacidade': 'previdenciario'
});

export async function buildAtriumCatalog({ readdir = fs.readdir, readFile = fs.readFile } = {}) {
  const entries = await readdir(AGENTS_SKILLS_DIR, { withFileTypes: true });
  const skills = [];
  const contextSkills = [];
  const excluded = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;
    const isProductSkill = PRODUCT_SKILL_IDS.has(entry.name);
    const isContextSkill = CONTEXT_SKILL_IDS.has(entry.name);
    if (!isProductSkill && !isContextSkill) {
      excluded.push(entry.name);
      continue;
    }
    const file = path.join(AGENTS_SKILLS_DIR, entry.name, 'SKILL.md');
    let source;
    try {
      source = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const { attributes, body } = parseFrontmatter(source);
    const skillRecord = {
      id: attributes.name || entry.name,
      name: attributes.name || entry.name,
      title: firstHeading(body) || attributes.name || entry.name,
      description: singleLine(attributes.description || body.match(/^Descrição: (.+)$/m)?.[1] || ''),
      instructions: body.trim(),
      source: 'atrium',
      category: isContextSkill
        ? CONTEXT_SKILL_IDS.get(entry.name)
        : (ATRIUM_CATEGORIES[entry.name] || 'juridica')
    };
    if (isContextSkill) {
      contextSkills.push(skillRecord);
    } else {
      skills.push(skillRecord);
    }
  }
  return {
    schemaVersion: 1,
    generatedBy: 'scripts/generate-skills-data.mjs',
    sources: {
      atrium: '.agents/skills',
      lexIntelligentia: 'vendor/legal-intelligence/ma-serra/lex-intelligentia/skills'
    },
    excludedDevOnly: excluded,
    skills,
    contextSkills
  };
}

// Os SKILL.md e o vendor Lex ficam como vieram; só o nome exibido na tela é trocado aqui.
const DISPLAY_TITLES = new Map([
  ['Pesquisa jurídica orientada por claims', 'Pesquisa jurídica com fontes verificáveis'],
  ['Ingestão jurídica rastreável', 'Leitura organizada dos autos'],
  ['Auditoria final adversarial', 'Revisão crítica final'],
  ['Legal Agent Orchestrator', 'Coordenação de peça jurídica'],
  ['Calculadora Processual', 'Tabelas de referência para cálculos judiciais'],
  ['Contrato Analyzer BR', 'Análise de contratos brasileiros'],
  ['DJE Monitor', 'Leitura de diários oficiais'],
  ['Jurisprudencia Miner', 'Pesquisa e validação de precedentes'],
  ['Peticao Analyzer', 'Análise de peças processuais'],
  ['Sentenca Judicial BR', 'Minuta de sentença'],
  ['Tese Jurídica Validator', 'Análise da solidez da tese'],
  ['Consulta judicial read-only', 'Consulta judicial somente leitura (fontes oficiais)']
]);
const displayTitle = (title = '') => {
  for (const [prefix, label] of DISPLAY_TITLES) if (title.startsWith(prefix)) return label;
  return title;
};

async function loadLexSkills() {
  // Na edição aberta o vendor Lex pode não estar presente: sem ele, o catálogo
  // conta apenas as fontes ATRIUM e as de contexto. A ausência é silenciosa.
  const result = await loadLexIntelligentiaSkills({ rootDir: ROOT, readFile: fs.readFile, readdir: fs.readdir }).catch(() => ({ skills: [] }));
  return result.skills
    .map(skill => ({
      id: skill.id,
      name: skill.name,
      title: displayTitle(skill.title),
      description: singleLine(skill.description),
      instructions: previewText(skill.previewSource || skill.instructions, 1500),
      source: 'lex-intelligentia',
      category: skill.category
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function renderSkillsData({ atriumSkills = [], lexSkills = [], contextSkills = [] } = {}) {
  const toRenderItem = skill => ({
    id: skill.id,
    name: skill.name,
    title: displayTitle(skill.title),
    description: skill.description,
    source: skill.source || 'atrium',
    category: skill.category || 'juridica',
    instructions: (skill.previewSource || skill.instructions).trim()
  });
  const byId = (left, right) => left.id.localeCompare(right.id);
  const atrium = atriumSkills.map(toRenderItem).sort(byId);
  const context = contextSkills.map(toRenderItem).sort(byId);
  const items = [...atrium, ...lexSkills, ...context];
  const serialized = items.map(item => `  ${JSON.stringify(item, null, 2).split('\n').join('\n  ')}`).join(',\n');
  return `// Atrium — Catálogo de Skills Nativas do Agente Jurídico Codex
(function(root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) { module.exports = data; }
  if (typeof root === 'object' && root) { root.CODEX_LEGAL_SKILLS = data; }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function() {
  return [
${serialized}
];
});
`;
}

async function main() {
  const check = process.argv.includes('--check');
  const [catalogRaw, skillsDataRaw] = await Promise.all([
    fs.readFile(CATALOG_FILE, 'utf8').catch(() => null),
    fs.readFile(SKILLS_DATA_FILE, 'utf8').catch(() => null)
  ]);
  let catalog;
  if (check) {
    if (!catalogRaw) {
      console.error('[FAIL] Catálogo de referência ausente. Execute: node scripts/generate-skills-data.mjs');
      process.exit(1);
    }
    // A fonte é .agents/skills (ignorada pelo Git): o check precisa reconstruir o
    // catálogo e comparar com o artefato rastreado, não apenas reler o artefato.
    const regenerated = await buildAtriumCatalog();
    const normalizeEol = value => String(value).replace(/\r\n/g, '\n');
    if (normalizeEol(`${JSON.stringify(regenerated, null, 2)}\n`) !== normalizeEol(catalogRaw)) {
      console.error('[FAIL] Catálogo de referência fora de sincronia com .agents/skills.');
      console.error('       Execute: node scripts/generate-skills-data.mjs');
      process.exit(1);
    }
    catalog = JSON.parse(catalogRaw);
  } else {
    catalog = await buildAtriumCatalog();
  }
  const lexSkills = await loadLexSkills();
  const expectedSkillsData = renderSkillsData({ atriumSkills: catalog.skills, lexSkills, contextSkills: catalog.contextSkills || [] });
  if (check) {
    if (skillsDataRaw.replace(/\r\n/g, '\n') !== expectedSkillsData) {
      console.error('[FAIL] js/skills-data.js está fora de sincronia com o catálogo de referência + vendor Lex.');
      console.error('       Execute: node scripts/generate-skills-data.mjs');
      process.exit(1);
    }
    console.log(`[PASS] skills-data.js sincronizado (${catalog.skills.length} skills ATRIUM + ${(catalog.contextSkills || []).length} de contexto + ${lexSkills.length} skills Lex Intelligentia).`);
    return;
  }
  await fs.mkdir(path.dirname(CATALOG_FILE), { recursive: true });
  await fs.writeFile(CATALOG_FILE, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  await fs.writeFile(SKILLS_DATA_FILE, expectedSkillsData, 'utf8');
  console.log(`[OK] Catálogo gerado: ${catalog.skills.length} skills ATRIUM + ${(catalog.contextSkills || []).length} de contexto + ${lexSkills.length} skills Lex Intelligentia.`);
  if (catalog.excludedDevOnly?.length) console.log(`     Excluídas (dev-only): ${catalog.excludedDevOnly.join(', ')}.`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch(error => {
    console.error(`[FAIL] ${error.message}`);
    process.exit(1);
  });
}
