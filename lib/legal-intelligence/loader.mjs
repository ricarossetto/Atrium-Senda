import fs from 'node:fs/promises';
import {
  DEFAULT_MODULE_BUDGET_CHARS,
  DEFAULT_RECIPE_BUDGET_CHARS,
  DEFAULT_SKILL_BUDGET_CHARS,
  MAX_BUNDLE_MODULES,
  resolveVendorFile,
  sanitizeVendorText
} from './source-policy.mjs';

const SOURCE_LABELS = {
  atrium: 'ATRIUM',
  'lex-intelligentia': 'Lex Intelligentia (MIT)',
  rom: 'ROM',
  'biblioteca-prompts-juridicos': 'Biblioteca de Prompts'
};

export function createLegalIntelligenceLoader({
  rootDir,
  registry,
  readFile = fs.readFile,
  budgets = {}
} = {}) {
  if (!rootDir || !registry) throw new TypeError('rootDir e registry são obrigatórios para o loader.');
  const limits = {
    moduleChars: budgets.moduleChars || DEFAULT_MODULE_BUDGET_CHARS,
    skillChars: budgets.skillChars || DEFAULT_SKILL_BUDGET_CHARS,
    recipeChars: budgets.recipeChars || DEFAULT_RECIPE_BUDGET_CHARS
  };
  const cache = new Map();

  async function readVendorModule(vendorFile) {
    const buffer = await readFile(resolveVendorFile(rootDir, vendorFile));
    return buffer.toString('utf8');
  }

  async function loadSkill(id) {
    const cacheKey = `skill:${id}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const skill = registry.getSkill(id);
    if (!skill) return null;
    let raw = '';
    if (skill.loadKind === 'atrium-catalog') raw = skill.instructions || '';
    else if (skill.vendorFile) raw = await readVendorModule(skill.vendorFile).catch(() => '');
    const sanitizedFull = sanitizeVendorText(raw);
    const text = sanitizeVendorText(raw, { maxChars: limits.skillChars });
    const module = {
      id: skill.id,
      kind: 'skill',
      source: skill.source,
      sourceLabel: SOURCE_LABELS[skill.source] || skill.source,
      title: skill.title,
      category: skill.category || '',
      text,
      chars: text.length,
      rawChars: raw.length,
      sanitized: sanitizedFull.length !== raw.length,
      truncated: sanitizedFull.length > text.length,
      vendorFile: skill.vendorFile || null
    };
    cache.set(cacheKey, module);
    return module;
  }

  async function loadRecipe(id) {
    const cacheKey = `recipe:${id}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const recipe = registry.getRecipe(id);
    if (!recipe) return null;
    const raw = recipe.available ? await readVendorModule(recipe.vendorFile).catch(() => '') : '';
    const sanitizedFull = sanitizeVendorText(raw);
    const text = sanitizeVendorText(raw, { maxChars: limits.recipeChars });
    const module = {
      id: recipe.id,
      kind: recipe.role === 'recipe' ? 'recipe' : 'method',
      source: recipe.source,
      sourceLabel: SOURCE_LABELS[recipe.source] || recipe.source,
      title: recipe.title,
      purpose: recipe.purpose || '',
      text,
      chars: text.length,
      rawChars: raw.length,
      sanitized: sanitizedFull.length !== raw.length,
      truncated: sanitizedFull.length > text.length,
      vendorFile: recipe.vendorFile,
      available: recipe.available,
      integrity: recipe.integrity
    };
    cache.set(cacheKey, module);
    return module;
  }

  async function loadModule(id) {
    if (String(id).startsWith('rom.') || registry.getRecipe(id)) return loadRecipe(id);
    return loadSkill(id);
  }

  async function composeBundle(modules = [], { budgetChars = limits.moduleChars, maxModules = MAX_BUNDLE_MODULES } = {}) {
    const ordered = [...modules].map((module, index) => ({
      id: typeof module === 'string' ? module : module.id,
      priority: typeof module === 'string' ? index : (module.priority ?? index),
      reason: typeof module === 'string' ? '' : (module.reason || '')
    })).sort((left, right) => left.priority - right.priority);
    const selected = [];
    const skipped = [];
    let totalChars = 0;
    for (const entry of ordered) {
      if (selected.length >= maxModules) {
        skipped.push({ id: entry.id, reason: 'limite de módulos por geração' });
        continue;
      }
      const loaded = await loadModule(entry.id).catch(() => null);
      if (!loaded || !loaded.text) {
        skipped.push({ id: entry.id, reason: loaded ? 'módulo vazio' : 'módulo indisponível' });
        continue;
      }
      if (totalChars + loaded.chars > budgetChars) {
        skipped.push({ id: entry.id, reason: 'orçamento de contexto esgotado' });
        continue;
      }
      totalChars += loaded.chars;
      selected.push({ ...loaded, priority: entry.priority, reason: entry.reason });
    }
    const text = selected.length
      ? `=== MÓDULOS DE INTELIGÊNCIA JURÍDICA (ATRIUM) ===\n${selected.map(module =>
        `--- módulo: ${module.id} | origem: ${module.sourceLabel} | função: ${module.kind}${module.truncated ? ' | truncado' : ''} ---\n${module.text}`
      ).join('\n\n')}\n=== FIM DOS MÓDULOS ===`
      : '';
    return {
      text,
      totalChars,
      modules: selected.map(module => ({
        id: module.id,
        kind: module.kind,
        source: module.source,
        title: module.title,
        chars: module.chars,
        truncated: module.truncated,
        integrity: module.integrity || null,
        reason: module.reason
      })),
      skipped
    };
  }

  return { loadSkill, loadRecipe, loadModule, composeBundle, limits, clearCache: () => cache.clear() };
}
