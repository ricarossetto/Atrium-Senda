/**
 * ATRIUM — Inventário derivado da pesquisa CNJ.
 * Lê research/cnj/sources e produz listas auxiliares (núcleo de atos e PDFs).
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCES = path.join(ROOT, 'research', 'cnj', 'sources');
const INVENTORY = path.join(ROOT, 'research', 'cnj', 'inventory');
const ATOS_FILES = 'https://atos.cnj.jus.br/files/';

const CORE_RE = /djen|di[aá]rio (de|da) justi|datajud|domic[ií]lio|comunica[cç][oõ]es processuais|tabelas processuais|\btpu\b|codex|pdpj|plataforma digital|portal de servi[cç]os|interoperab|\bmni\b|prazo|intelig[eê]ncia artificial|\blgpd\b|prote[cç][aã]o de dados|meio eletr[oô]nico|autos digitais|processo judicial eletr[oô]nico|\bpje\b|assinatura (digital|eletr[oô]nica)|certificado digital|editais|estat[ií]stica|siespj/i;
const SOURCE_PRIORITY_RE = /(sistemas|processo-judicial-eletronico|tecnologia-da-informacao|datajud|comunicacoes-processuais|domicilio|codex|tpu|tabelas|portal-de-servicos|justica-4-0|escritorio-digital|governanca|lgpd|seguranca|inteligencia-artificial|interoperabilidade|diario|pje)/i;
const PDF_PRIORITY_RE = /(djen|datajud|domicilio|manual|guia|cartilha|pje|codex|pdpj|tpu|api|comunica|tabelas|interoperab|justica-4-0|lgpd|inteligencia|requisitos|seguranca|tutorial|orientac|parametriz)/i;

const files = fs.readdirSync(SOURCES);
fs.mkdirSync(INVENTORY, { recursive: true });

const core = [];
for (const file of files) {
  if (!/^atos-/.test(file)) continue;
  const text = fs.readFileSync(path.join(SOURCES, file), 'utf8');
  if (!CORE_RE.test(text)) continue;
  const id = (file.match(/detalhar-(\d+)/) || [])[1];
  if (id) core.push(id);
}
core.sort((a, b) => Number(a) - Number(b));
fs.writeFileSync(path.join(INVENTORY, 'core-atos-ids.txt'), `${core.join('\n')}\n`);
console.log(`[inventário] atos de núcleo: ${core.length} (de ${files.filter(f => /^atos-/.test(f)).length} detalhes)`);

const atosPdfs = new Set();
const pagePdfMap = new Map();
for (const file of files) {
  const text = fs.readFileSync(path.join(SOURCES, file), 'utf8');
  if (/^atos-/.test(file)) {
    for (const match of text.matchAll(/\]\(((?:\.\.\/)*files\/[^\s)]+\.pdf)\)/gi)) {
      atosPdfs.add(ATOS_FILES + match[1].replace(/^(\.\.\/)+files\//i, ''));
    }
    for (const match of text.matchAll(/\]\((https:\/\/atos\.cnj\.jus\.br\/files\/[^\s)]+\.pdf)\)/gi)) {
      atosPdfs.add(match[1].replace('/files//', '/files/'));
    }
  } else if (/^(cnj|sgt|datajud-wiki|cnj-extra)-/.test(file)) {
    for (const match of text.matchAll(/\]\((https:\/\/[^\s)]+\.pdf)\)/gi)) {
      const url = match[1];
      if (!pagePdfMap.has(url)) pagePdfMap.set(url, new Set());
      pagePdfMap.get(url).add(file);
    }
  }
}
const atosList = [...atosPdfs].sort();
fs.writeFileSync(path.join(INVENTORY, 'pdfs-atos.txt'), `${atosList.join('\n')}\n`);
console.log(`[inventário] PDFs de atos: ${atosList.length}`);

const allPagePdfs = [...pagePdfMap.keys()].sort();
const priority = allPagePdfs.filter(url => {
  const sources = [...(pagePdfMap.get(url) || [])].join(' ');
  return SOURCE_PRIORITY_RE.test(sources) || PDF_PRIORITY_RE.test(url);
});
const CNJ_HOST_RE = /(^|\.)(cnj\.jus\.br|pdpj\.jus\.br|jus\.br)$/i;
const priorityCnj = priority.filter(url => {
  try { return CNJ_HOST_RE.test(new URL(url).hostname); } catch { return false; }
});
const record = allPagePdfs.map(url => ({ url, sources: [...(pagePdfMap.get(url) || [])], priority: priority.includes(url) }));
fs.writeFileSync(path.join(INVENTORY, 'pdfs-pages.json'), JSON.stringify(record, null, 2));
fs.writeFileSync(path.join(INVENTORY, 'pdfs-from-pages.txt'), `${allPagePdfs.join('\n')}\n`);
fs.writeFileSync(path.join(INVENTORY, 'pdfs-priority.txt'), `${priority.join('\n')}\n`);
fs.writeFileSync(path.join(INVENTORY, 'pdfs-priority-cnj.txt'), `${priorityCnj.join('\n')}\n`);
console.log(`[inventário] PDFs de páginas: ${allPagePdfs.length} (prioritários: ${priority.length}; prioritários em host CNJ/PDPJ: ${priorityCnj.length})`);

const coreSet = new Set(core);
const indexLines = fs.readFileSync(path.join(INVENTORY, 'atos-index.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const tableRows = indexLines
  .filter(entry => coreSet.has(entry.id))
  .map(entry => {
    const [tipo = '', numero = '', data = '', origem = '', situacao = '', ementa = ''] = entry.cells || [];
    return `| ${entry.id} | ${tipo} | ${numero} | ${data} | ${situacao} | ${ementa.replace(/\|/g, '/').slice(0, 160)} |`;
  });
const table = [
  '# Atos do núcleo (recorte de domínio)',
  '',
  `Gerado por scripts/cnj-research-inventory.mjs em ${new Date().toISOString()}.`,
  `Total de atos indexados: ${indexLines.length}; recorte de núcleo: ${tableRows.length}.`,
  '',
  '| id | tipo | número | data | situação | ementa |',
  '|---|---|---|---|---|---|',
  ...tableRows
].join('\n');
fs.writeFileSync(path.join(INVENTORY, 'core-atos-table.md'), `${table}\n`);
console.log(`[inventário] tabela do núcleo: ${tableRows.length} linhas`);
for (const url of priority.slice(0, 25)) console.log(`  ${url}`);
