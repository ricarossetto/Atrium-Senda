/**
 * ATRIUM — Guardião das versões de asset (`?v=`).
 *
 * Problema real (29/09): um módulo era alterado, o deploy acontecia, e o navegador seguia
 * executando a cópia antiga porque a **URL não mudou** (`shell.js?v=6.2.10` com conteúdo novo).
 * O sintoma era um recurso novo existir no servidor e não aparecer na tela — exatamente o
 * botão "Confirmar fusão" e a correção do `keydown`.
 *
 * Contrato: para cada referência local com `?v=<versão>` no `index.html` e em `js/**`, se o
 * arquivo referenciado mudou desde a última vez que aquela versão foi registrada, o `?v=`
 * precisa ser rebumpado. O manifesto guarda `asset|versão -> sha256` do conteúdo registrado.
 *
 * Uso:
 *   node scripts/asset-version-manifest.mjs        # verifica (falha se algum asset mudou sem bump)
 *   node scripts/asset-version-manifest.mjs --write # regrava o manifesto (após o bump)
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'asset-version-manifest.json');
// Aceita caminho relativo (`./views/x.js`) ou a partir da raiz do projeto (`js/x.js`), com
// `?v=`; URLs absolutas (http/https) ficam de fora porque o `:` não entra na classe.
const VERSIONED = /["'(`]((?:\.{0,2}\/)?[\w@.\-/]+\.(?:js|css|svg))\?v=([0-9][0-9A-Za-z.\-]*)(?:#[^"'`)]*)?["'`)]/g;

async function listSources(dir, out = []) {
  const { readdir } = await import('node:fs/promises');
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await listSources(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

export async function collectReferences() {
  const references = new Map();
  const sources = [path.join(root, 'index.html'), ...(await listSources(path.join(root, 'js')))];
  for (const file of sources) {
    const content = await readFile(file, 'utf8').catch(() => '');
    if (!content) continue;
    const base = path.dirname(file);
    for (const match of content.matchAll(VERSIONED)) {
      const [, relative, version] = match;
      let target = path.resolve(base, relative);
      if (!existsSync(target)) target = path.resolve(root, relative);
      if (!existsSync(target)) continue;
      const relTarget = path.relative(root, target).split(path.sep).join('/');
      const key = `${relTarget}|${version}`;
      if (!references.has(key)) references.set(key, { asset: relTarget, version, file: target, sources: [] });
      references.get(key).sources.push(path.relative(root, file).split(path.sep).join('/'));
    }
  }
  return [...references.values()];
}

// O hash ignora o fim de linha: com core.autocrlf o mesmo commit vira CRLF no disco do Windows,
// e o navegador recebe LF. Só mudança real de conteúdo pode acusar asset sem bump.
export function hashContent(buffer) {
  const normalized = Buffer.from(buffer.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

export async function hashOf(file) {
  return hashContent(await readFile(file));
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    return { version: 1, assets: {} };
  }
}

/**
 * Import local sem `?v=` é o mesmo risco do asset sem bump: o módulo pode ficar
 * até 4h no cache do navegador mesmo depois do deploy. Este guardião percorre
 * `js/**` e exige versão em toda importação relativa que resolva para arquivo.
 */
export async function findUnversionedLocalImports() {
  const sources = await listSources(path.join(root, 'js'));
  const missing = [];
  for (const file of sources) {
    const content = await readFile(file, 'utf8').catch(() => '');
    if (!content) continue;
    const base = path.dirname(file);
    for (const match of content.matchAll(/(?:from\s+|import\s*)["'](\.{1,2}\/[^"']+?)["']/g)) {
      const spec = match[1];
      if (spec.includes('?v=')) continue;
      const target = path.resolve(base, spec);
      if (!existsSync(target)) continue;
      const line = content.slice(0, match.index).split('\n').length;
      missing.push({
        source: path.relative(root, file).split(path.sep).join('/'),
        line,
        spec
      });
    }
  }
  return missing;
}

export async function checkAssetVersions({ write = false } = {}) {
  const references = (await collectReferences()).sort((a, b) => a.asset.localeCompare(b.asset) || a.version.localeCompare(b.version));
  const manifest = await readManifest();
  const next = { version: 1, generatedAt: new Date().toISOString(), assets: {} };
  const stale = [];
  const fresh = [];
  for (const reference of references) {
    const key = `${reference.asset}|${reference.version}`;
    const hash = await hashOf(reference.file);
    next.assets[key] = hash;
    const recorded = manifest.assets?.[key];
    if (!recorded) {
      fresh.push(key);
      continue;
    }
    if (recorded !== hash) stale.push({ key, asset: reference.asset, version: reference.version, sources: [...new Set(reference.sources)] });
  }
  if (write && stale.length > 0) {
    return { references: references.length, fresh, stale, manifestPath, written: false };
  }
  if (write) {
    await writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  }
  return { references: references.length, fresh, stale, manifestPath, written: Boolean(write) };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const write = process.argv.includes('--write');
  const result = await checkAssetVersions({ write });
  if (write && result.written) {
    console.log(`[asset-versions] manifesto regravado: ${Object.keys((await readManifest()).assets).length} referências (${result.fresh.length} novas).`);
    process.exit(0);
  }
  if (write && result.stale.length > 0) {
    console.error('[asset-versions] FALHA: --write recusado porque um asset mudou sem rebumpar o ?v=.');
    for (const item of result.stale) {
      console.error(`  - ${item.asset} continua em ?v=${item.version} (importado por ${item.sources.join(', ')}) — rebumpe a versão antes de regravar.`);
    }
    process.exit(1);
  }
  if (result.stale.length > 0) {
    console.error('[asset-versions] FALHA: asset mudou sem rebumpar o ?v= (o navegador continuaria servindo a cópia antiga):');
    for (const item of result.stale) {
      console.error(`  - ${item.asset} continua em ?v=${item.version} (importado por ${item.sources.join(', ')}) — rebumpe para a versão do próximo release`);
    }
    process.exit(1);
  }
  console.log(`[asset-versions] OK: ${result.references} referências versionadas, ${result.fresh.length} novas, nenhuma mudança sem bump.`);
}
