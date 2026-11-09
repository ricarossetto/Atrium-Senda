import { resolveVendorFile } from '../source-policy.mjs';

export const PROMPT_LIBRARY_TAXONOMY_PATH = 'ma-serra/biblioteca-prompts/taxonomy.json';
export const PROMPT_LIBRARY_RECIPES_PATH = 'ma-serra/biblioteca-prompts/prompts.json';

export function convertLibraryPromptToNative(entry = {}) {
  const minimumInputs = Array.isArray(entry.minimumInputs) ? entry.minimumInputs.map(item => String(item)) : [];
  const delivery = Array.isArray(entry.output) ? entry.output : [];
  const sections = [
    `# Objetivo\n${entry.objective || entry.purpose || ''}`.trim(),
    minimumInputs.length ? `# Material necessário\n${minimumInputs.map(item => `- ${item}`).join('\n')}` : '',
    entry.sharedRules ? `# Regras de segurança\n${entry.sharedRules}` : '',
    delivery.length ? `# Entrega\n${delivery.map((item, index) => `${index + 1}. ${item}`).join('\n')}` : '',
    entry.doNotUse ? `# Quando não usar\n${entry.doNotUse}` : '',
    entry.stop ? `# Condição de parada\n${entry.stop}` : ''
  ].filter(Boolean);
  return {
    id: String(entry.id || ''),
    title: String(entry.title || ''),
    category: String(entry.category || ''),
    architecture: String(entry.architecture || ''),
    minimumInputs,
    reasoning: String(entry.reasoning || ''),
    instructions: entry.prompt || sections.join('\n\n'),
    stopCondition: String(entry.stop || ''),
    applicability: Array.isArray(entry.variations) ? entry.variations.map(item => String(item)) : [],
    source: 'biblioteca-prompts-juridicos',
    imported: true
  };
}

export async function loadPromptLibrary({ rootDir, readFile }) {
  let taxonomy = null;
  try {
    taxonomy = JSON.parse(await readFile(resolveVendorFile(rootDir, PROMPT_LIBRARY_TAXONOMY_PATH), 'utf8'));
  } catch {
    taxonomy = null;
  }
  let recipes = [];
  let imported = false;
  try {
    const raw = JSON.parse(await readFile(resolveVendorFile(rootDir, PROMPT_LIBRARY_RECIPES_PATH), 'utf8'));
    if (Array.isArray(raw)) {
      recipes = raw.map(convertLibraryPromptToNative).filter(entry => entry.id);
      imported = recipes.length > 0;
      if (taxonomy?.licenseStatus === 'LICENSE_REVIEW_REQUIRED' && !raw.every(entry => entry.licenseGranted === true)) {
        recipes = [];
        imported = false;
      }
    }
  } catch {
    recipes = [];
  }
  return {
    taxonomy,
    recipes,
    imported,
    licenseStatus: imported ? 'LICENSED' : 'LICENSE_REVIEW_REQUIRED',
    status: imported ? 'available' : 'blocked-by-license'
  };
}
