import path from 'node:path';
import { parseFrontmatter, firstHeading } from '../frontmatter.mjs';
import { sanitizeVendorText } from '../source-policy.mjs';

export const LEX_SKILLS_ROOT = path.join('ma-serra', 'lex-intelligentia', 'skills');

// Skills vendoradas que ensinam contagem de prazo recebem o aviso de política do
// ATRIUM antes do conteúdo: o produto não calcula prazo por heurística — o prazo
// vem exclusivamente da fonte oficial (eproc/PJe) e ajustes de contagem são edição
// humana (AGENTS §16; specs/human-deadline-policy.md).
const ATRIUM_POLICY_NOTICES = Object.freeze({
  'dje-monitor': [
    '> Política ATRIUM: este material é referência de pesquisa para conferência humana.',
    '> O ATRIUM não calcula prazo por regex, heurística ou texto de publicação; o prazo vem da fonte oficial (eproc/PJe)',
    '> e ajustes de contagem (embargos e similares) são edição humana explícita. Nunca promova a estimativa a prazo fatal.',
    ''
  ].join('\n')
});

export function atriumPolicyNoticeFor(skillId) {
  return ATRIUM_POLICY_NOTICES[String(skillId || '')] || '';
}

const LEX_SKILL_PROFILES = Object.freeze({
  'peticao-analyzer': {
    category: 'analise-estruturada',
    domains: ['civil', 'processual', 'trabalhista', 'previdenciario', 'tributario'],
    pieceTypes: ['analise_processual', 'revisao_peca', 'contestacao'],
    phases: ['analise', 'planejamento']
  },
  'jurisprudencia-miner': {
    category: 'pesquisa',
    domains: ['*'],
    pieceTypes: ['*'],
    phases: ['pesquisa']
  },
  'tese-juridica-validator': {
    category: 'validacao',
    domains: ['*'],
    pieceTypes: ['*'],
    phases: ['validacao']
  },
  'calculadora-processual': {
    category: 'calculo',
    domains: ['*'],
    pieceTypes: ['cumprimento_sentenca', 'execucao', 'impugnacao_cumprimento'],
    phases: ['calculo']
  },
  'sentenca-judicial-br': {
    category: 'analise-decisao',
    domains: ['*'],
    pieceTypes: ['apelacao', 'embargos_declaracao', 'recurso_especial', 'recurso_extraordinario', 'analise_processual'],
    phases: ['analise']
  },
  'dje-monitor': {
    category: 'prazos-publicacoes',
    domains: ['*'],
    pieceTypes: ['*'],
    phases: ['prazos']
  },
  'contrato-analyzer-br': {
    category: 'contratos',
    domains: ['civil', 'empresarial', 'consumidor'],
    pieceTypes: ['contrato'],
    phases: ['analise', 'revisao']
  }
});

export function lexSkillProfile(id) {
  return LEX_SKILL_PROFILES[id] || { category: 'juridica', domains: ['*'], pieceTypes: ['*'], phases: ['analise'] };
}

async function listSkillDirectories(skillsRoot, readdir) {
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const directories = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;
    const categoryPath = path.join(skillsRoot, entry.name);
    const children = await readdir(categoryPath, { withFileTypes: true });
    for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
      if (child.isDirectory()) directories.push({ category: entry.name, id: child.name, skillPath: path.join(categoryPath, child.name) });
    }
  }
  return directories;
}

export async function loadLexIntelligentiaSkills({ rootDir, readFile, readdir }) {
  const skillsRoot = path.resolve(rootDir, 'vendor', 'legal-intelligence', LEX_SKILLS_ROOT);
  const skills = [];
  let directories = [];
  try {
    directories = await listSkillDirectories(skillsRoot, readdir);
  } catch {
    return { skills, available: false, root: LEX_SKILLS_ROOT };
  }
  for (const directory of directories) {
    const file = path.join(directory.skillPath, 'SKILL.md');
    let source;
    try {
      source = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const { attributes, body } = parseFrontmatter(source);
    const profile = lexSkillProfile(directory.id);
    const policyNotice = atriumPolicyNoticeFor(directory.id);
    skills.push({
      id: directory.id,
      name: attributes.name || directory.id,
      title: firstHeading(body) || attributes.name || directory.id,
      description: attributes.description || '',
      instructions: policyNotice ? `${policyNotice}\n${body}` : body,
      previewSource: body,
      rawChars: source.length,
      source: 'lex-intelligentia',
      loadKind: 'vendor',
      policyNotice,
      vendorFile: `${LEX_SKILLS_ROOT}/${directory.category}/${directory.id}/SKILL.md`.replace(/\\/g, '/'),
      license: 'MIT',
      category: profile.category,
      domains: profile.domains,
      pieceTypes: profile.pieceTypes,
      phases: profile.phases
    });
  }
  return { skills, available: true, root: LEX_SKILLS_ROOT };
}

export async function loadLexIntelligentiaDocument({ rootDir, readFile }, relativePath) {
  const full = path.resolve(rootDir, 'vendor', 'legal-intelligence', 'ma-serra', 'lex-intelligentia', relativePath);
  const source = await readFile(full, 'utf8');
  return sanitizeVendorText(source);
}
