import path from 'node:path';
import fs from 'node:fs/promises';
import { loadLexIntelligentiaSkills } from './adapters/lex-intelligentia-adapter.mjs';
import { loadRomRecipes, createRomPromptRegistry } from './adapters/rom-adapter.mjs';
import { loadPromptLibrary } from './adapters/prompt-library-adapter.mjs';
import { resolveVendorFile } from './source-policy.mjs';

export const ATRIUM_CATALOG_PATH = path.join('lib', 'legal-intelligence', 'catalog', 'skills-catalog.json');

async function readJson(readFile, file) {
  return JSON.parse(String(await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
}

export async function createLegalIntelligenceRegistry({ rootDir, readFile = fs.readFile, readdir = fs.readdir } = {}) {
  if (!rootDir) throw new TypeError('rootDir é obrigatório para o registry de inteligência jurídica.');
  const [catalog, lex, rom, library, upstream] = await Promise.all([
    readJson(readFile, path.resolve(rootDir, ATRIUM_CATALOG_PATH)).catch(() => null),
    loadLexIntelligentiaSkills({ rootDir, readFile, readdir }).catch(() => ({ skills: [], available: false })),
    loadRomRecipes({ rootDir, readFile }).catch(() => ({ recipes: [], available: false, integrity: 'unavailable' })),
    loadPromptLibrary({ rootDir, readFile }).catch(() => ({ taxonomy: null, recipes: [], imported: false, licenseStatus: 'LICENSE_REVIEW_REQUIRED', status: 'blocked-by-license' })),
    readJson(readFile, resolveVendorFile(rootDir, 'UPSTREAM.json')).catch(() => null)
  ]);

  const skills = new Map();
  const warnings = [];
  for (const entry of Array.isArray(catalog?.skills) ? catalog.skills : []) {
    if (!entry?.id) continue;
    skills.set(entry.id, { ...entry, source: 'atrium', loadKind: 'atrium-catalog', license: 'MIT (ATRIUM)' });
  }
  for (const entry of lex.skills) {
    if (skills.has(entry.id)) {
      warnings.push(`Skill "${entry.id}" já existe no catálogo ATRIUM; a versão Lex Intelligentia foi ignorada para evitar duplicidade.`);
      continue;
    }
    skills.set(entry.id, entry);
  }
  if (!catalog) warnings.push('Catálogo ATRIUM de skills ausente; execute "node scripts/generate-skills-data.mjs".');
  if (!rom.available) warnings.push('Manifesto de recipes do ROM indisponível.');
  if (rom.integrity === 'drift') warnings.push('Divergência de integridade detectada em arquivo vendorado do ROM.');

  const recipes = rom.recipes;
  const romRegistry = createRomPromptRegistry(recipes);

  return {
    rootDir,
    skills,
    recipes,
    romRegistry,
    library,
    upstream,
    warnings,
    getSkill(id) {
      return skills.get(String(id || '')) || null;
    },
    listSkills() {
      return [...skills.values()].sort((left, right) => left.source.localeCompare(right.source) || left.id.localeCompare(right.id));
    },
    getRecipe(id) {
      return romRegistry.get(id);
    },
    selectRecipes({ pieceType, area } = {}) {
      return romRegistry.select({ pieceType, area });
    },
    status() {
      const atriumSkills = [...skills.values()].filter(item => item.source === 'atrium').length;
      const lexSkills = [...skills.values()].filter(item => item.source === 'lex-intelligentia').length;
      const upstreamById = new Map((Array.isArray(upstream?.upstreams) ? upstream.upstreams : []).map(item => [item.id, item]));
      const romStatus = romRegistry.status();
      return {
        skills: { atrium: atriumSkills, lexIntelligentia: lexSkills, total: skills.size },
        recipes: {
          total: romStatus.total,
          available: romStatus.available,
          integrity: romStatus.integrity
        },
        promptLibrary: {
          imported: library.imported,
          licenseStatus: library.licenseStatus,
          recipes: library.recipes.length
        },
        licenses: [...upstreamById.values()].map(item => ({ id: item.id, license: item.license, licenseStatus: item.licenseStatus || 'DECLARED' })),
        warnings: [...warnings]
      };
    }
  };
}
