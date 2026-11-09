import { createHash } from 'node:crypto';
import { resolveVendorFile } from '../source-policy.mjs';

export const ROM_MANIFEST_PATH = 'ma-serra/rom/recipes.json';

export async function loadRomRecipes({ rootDir, readFile }) {
  const manifestFile = resolveVendorFile(rootDir, ROM_MANIFEST_PATH);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  } catch {
    return { recipes: [], manifest: null, available: false, integrity: 'unavailable' };
  }
  const recipes = [];
  for (const entry of Array.isArray(manifest.recipes) ? manifest.recipes : []) {
    const vendorFile = `ma-serra/rom/${entry.file}`.replace(/\\/g, '/');
    let available = false;
    let integrity = 'missing';
    let bytes = 0;
    try {
      const buffer = await readFile(resolveVendorFile(rootDir, vendorFile));
      bytes = buffer.length;
      const digest = createHash('sha256').update(buffer).digest('hex');
      integrity = digest === entry.sha256 ? 'pinned' : 'drift';
      available = true;
    } catch {
      available = false;
    }
    recipes.push({
      id: entry.id,
      title: entry.title,
      purpose: entry.purpose,
      role: entry.role,
      pieceTypes: Array.isArray(entry.pieceTypes) ? entry.pieceTypes : [],
      areas: Array.isArray(entry.areas) ? entry.areas : [],
      priority: Number(entry.priority) || 50,
      vendorFile,
      sha256: entry.sha256 || null,
      bytes,
      available,
      integrity,
      source: 'rom',
      loadKind: 'vendor',
      license: 'LICENSE_REVIEW_REQUIRED'
    });
  }
  return { recipes, manifest, available: true, integrity: recipes.every(recipe => recipe.integrity !== 'drift') ? 'pinned' : 'drift' };
}

export function selectRomRecipes(recipes, { pieceType, area }) {
  const matches = (recipes || []).filter(recipe => recipe.available && recipe.pieceTypes.includes(pieceType));
  const areaMatches = area ? matches.filter(recipe => !recipe.areas.length || recipe.areas.includes(area)) : [];
  const candidates = areaMatches.length ? areaMatches : matches;
  const recipesOnly = candidates.filter(recipe => recipe.role === 'recipe').sort((left, right) => left.priority - right.priority);
  const methods = candidates.filter(recipe => recipe.role !== 'recipe').sort((left, right) => left.priority - right.priority);
  return { recipe: recipesOnly[0] || null, methods };
}

export function createRomPromptRegistry(recipes = []) {
  return {
    list: () => [...recipes],
    get: id => recipes.find(recipe => recipe.id === id) || null,
    select: ({ pieceType, area } = {}) => selectRomRecipes(recipes, { pieceType, area }),
    status: () => ({
      total: recipes.length,
      available: recipes.filter(recipe => recipe.available).length,
      integrity: recipes.some(recipe => recipe.integrity === 'drift') ? 'drift' : recipes.every(recipe => recipe.integrity === 'pinned') ? 'pinned' : 'partial'
    })
  };
}


