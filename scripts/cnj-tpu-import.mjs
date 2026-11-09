/**
 * ATRIUM — Importador das Tabelas Processuais Unificadas (TPU) do CNJ/SGT.
 *
 * Uso:
 *   node scripts/cnj-tpu-import.mjs stats    # baixa/cacheia o dump e imprime cobertura
 *   node scripts/cnj-tpu-import.mjs import   # gera o asset versionado do produto
 *
 * Fonte: https://www.cnj.jus.br/sgt/versoes.php — dump MySQL oficial
 * ("Dados - Mysql (inclui temporariedade)"), servido por enviarArquivo.php.
 * O asset `lib/judicial-intelligence/process-intelligence/tpu-official.json` guarda
 * nome, hierarquia e situação dos itens por tipo, com hash das fontes.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'research', 'cnj', 'raw');
const INVENTORY = path.join(ROOT, 'research', 'cnj', 'inventory');
const ASSET = path.join(ROOT, 'lib', 'judicial-intelligence', 'process-intelligence', 'tpu-official.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 ATRIUM-Research/1.0';
const SGT_BASE = 'https://www.cnj.jus.br/sgt/';
const ITEM_TYPE = { A: 'subjects', C: 'classes', D: 'documents', M: 'movements' };

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } });
  if (!response.ok) throw new Error(`HTTP ${response.status} em ${url}`);
  return response.text();
}

async function downloadDump() {
  const cacheDir = path.join(RAW, 'sgt-tabelas');
  await fs.mkdir(cacheDir, { recursive: true });
  const page = await fetchText(`${SGT_BASE}versoes.php`);
  const version = (page.match(/id='dump_dados'[^>]*value="([^"]+)"/i) || page.match(/value="([^"]+)"[^>]*id='dump_dados'/i) || [])[1];
  if (!version || !/^\d+_dump_dados\.sql$/i.test(version)) throw new Error('Não foi possível localizar a versão do dump no SGT.');
  const cacheFile = path.join(cacheDir, version);
  try {
    const cached = await fs.readFile(cacheFile);
    console.log(`[dump] cache ${version} (${cached.length} bytes)`);
    return { buffer: cached, version: version.split('_')[0], url: `${SGT_BASE}enviarArquivo.php?url=${encodeURIComponent(version)}&nome=dump_dados.sql` };
  } catch {}
  const url = `${SGT_BASE}enviarArquivo.php?url=${encodeURIComponent(version)}&nome=dump_dados.sql`;
  console.log(`[dump] baixando ${url}`);
  const response = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!response.ok) throw new Error(`HTTP ${response.status} no dump do SGT.`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(cacheFile, buffer);
  console.log(`[dump] ${buffer.length} bytes`);
  return { buffer, version: version.split('_')[0], url };
}

function parseTuples(valuesSection) {
  const tuples = [];
  let index = 0;
  const length = valuesSection.length;
  while (index < length) {
    if (valuesSection[index] !== '(') { index += 1; continue; }
    index += 1;
    const fields = [];
    let field = '';
    let inString = false;
    while (index < length) {
      const ch = valuesSection[index];
      if (inString) {
        if (ch === '\\') { field += valuesSection[index + 1]; index += 2; continue; }
        if (ch === "'") {
          if (valuesSection[index + 1] === "'") { field += "'"; index += 2; continue; }
          inString = false; index += 1; continue;
        }
        field += ch; index += 1; continue;
      }
      if (ch === "'") { inString = true; index += 1; continue; }
      if (ch === ',') { fields.push(field.trim()); field = ''; index += 1; continue; }
      if (ch === ')') { fields.push(field.trim()); tuples.push(fields); index += 1; break; }
      field += ch; index += 1;
    }
  }
  return tuples;
}

export function parseDump(text) {
  const tables = new Map();
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('INSERT INTO')) continue;
    const match = line.match(/^INSERT INTO ([^\s]+) \(([^)]+)\) VALUES (.*);\s*$/);
    if (!match) continue;
    const [, table, columnsText, valuesText] = match;
    const columns = columnsText.split(',').map(value => value.trim());
    if (!tables.has(table)) tables.set(table, { columns, rows: [] });
    for (const tuple of parseTuples(valuesText)) {
      const row = {};
      columns.forEach((column, index) => { row[column] = tuple[index] === undefined || tuple[index] === 'NULL' ? null : tuple[index]; });
      tables.get(table).rows.push(row);
    }
  }
  return tables;
}

export function buildAsset(tables, { version, url, sourceHash }) {
  const items = tables.get('sgt_consulta.itens')?.rows || [];
  const collections = { movements: {}, classes: {}, subjects: {}, documents: {} };
  for (const item of items) {
    const collection = ITEM_TYPE[String(item.tipo_item || '').toUpperCase()];
    if (!collection) continue;
    const code = String(item.cod_item || '').trim();
    if (!code) continue;
    collections[collection][code] = [
      String(item.nome || '').trim(),
      item.cod_item_pai === null ? null : String(item.cod_item_pai).trim(),
      String(item.situacao || 'A').trim().toUpperCase() === 'A' ? 'A' : 'I'
    ];
  }

  const complementNames = new Map((tables.get('sgt_consulta.complemento')?.rows || []).map(row => [String(row.seq_complemento), String(row.dsc_complemento || '')]));
  const complementValues = new Map();
  for (const row of tables.get('sgt_consulta.complemento_tabelado')?.rows || []) {
    const key = String(row.seq_complemento);
    if (!complementValues.has(key)) complementValues.set(key, []);
    complementValues.get(key).push(String(row.dsc_valor_tabelado || ''));
  }
  const complements = {};
  for (const row of tables.get('sgt_consulta.complemento_movimento')?.rows || []) {
    const movement = String(row.cod_movimento || '');
    const complement = String(row.seq_complemento || '');
    if (!movement || !complement) continue;
    if (!complements[movement]) complements[movement] = [];
    complements[movement].push([complementNames.get(complement) || complement, complementValues.get(complement) || []]);
  }

  return {
    source: 'CNJ — Sistema de Gestão de Tabelas Processuais Unificadas (SGT)',
    sourceUrl: 'https://www.cnj.jus.br/sgt/versoes.php',
    dumpUrl: url,
    tableVersion: version,
    generatedAt: new Date().toISOString(),
    sourceHash,
    counts: {
      movements: Object.keys(collections.movements).length,
      classes: Object.keys(collections.classes).length,
      subjects: Object.keys(collections.subjects).length,
      documents: Object.keys(collections.documents).length,
      movementComplements: Object.keys(complements).length
    },
    movements: collections.movements,
    classes: collections.classes,
    subjects: collections.subjects,
    documents: collections.documents,
    complements
  };
}

async function main() {
  const command = process.argv[2] || 'stats';
  const { buffer, version, url } = await downloadDump();
  const sourceHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const tables = parseDump(buffer.toString('latin1'));
  console.log(`[dump] tabelas: ${[...tables.keys()].length} | hash ${sourceHash.slice(0, 16)} | versão ${version}`);
  const asset = buildAsset(tables, { version, url, sourceHash });
  console.log(`[dump] contagens: ${JSON.stringify(asset.counts)}`);
  console.log(`[dump] movimento 26: ${JSON.stringify(asset.movements['26'] || null)}`);
  console.log(`[dump] classe 7: ${JSON.stringify(asset.classes['7'] || null)}`);
  if (command === 'import') {
    await fs.writeFile(ASSET, JSON.stringify(asset));
    const bytes = (await fs.stat(ASSET)).size;
    await fs.mkdir(INVENTORY, { recursive: true });
    await fs.writeFile(path.join(INVENTORY, 'sgt-dump-source.json'), JSON.stringify({ version, sourceHash, dumpUrl: url, counts: asset.counts }, null, 2));
    console.log(`[import] asset ${path.relative(ROOT, ASSET)} com ${bytes} bytes (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
  }
}

main().catch(error => { console.error('[cnj-tpu-import] falha:', error.message); process.exitCode = 1; });
