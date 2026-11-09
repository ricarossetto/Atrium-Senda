/**
 * ATRIUM — Coleta de pesquisa normativa do CNJ (fora do runtime).
 *
 * Ferramenta de pesquisa: baixa páginas públicas do CNJ, converte HTML/PDF
 * para Markdown e mantém um manifesto com hash. Não é executada pelo servidor
 * e não altera estado do produto.
 *
 * Uso:
 *   node scripts/cnj-research-fetch.mjs atos
 *   node scripts/cnj-research-fetch.mjs pages <arquivo-com-urls.txt> <prefixo>
 *   node scripts/cnj-research-fetch.mjs wiki
 *   node scripts/cnj-research-fetch.mjs pdfs <arquivo-com-urls.txt>
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { extractText, getDocumentProxy } from 'unpdf';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'research', 'cnj');
const SOURCES = path.join(OUT, 'sources');
const RAW = path.join(OUT, 'raw');
const PDF_DIR = path.join(OUT, 'pdf');
const INVENTORY = path.join(OUT, 'inventory');
const MANIFEST_PATH = path.join(OUT, 'MANIFEST.json');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 ATRIUM-Research/1.0 (+pesquisa-normativa; contato: atrium)';
const ATOS_BASE = 'https://atos.cnj.jus.br';
const TEMA_TIC = '1035';

const ATOS_QUERIES = [
  { label: 'tema-tic', params: { atos: 'sim', tema: TEMA_TIC } },
  { label: 'arg-djen', params: { atos: 'sim', argumento: 'DJEN' } },
  { label: 'arg-datajud', params: { atos: 'sim', argumento: 'DataJud' } },
  { label: 'arg-domicilio', params: { atos: 'sim', argumento: 'Domicílio Judicial Eletrônico' } },
  { label: 'arg-pdpj', params: { atos: 'sim', argumento: 'PDPJ' } },
  { label: 'arg-codex', params: { atos: 'sim', argumento: 'Codex' } },
  { label: 'arg-pje', params: { atos: 'sim', argumento: 'PJe' } },
  { label: 'arg-tpu', params: { atos: 'sim', argumento: 'Tabelas Processuais Unificadas' } },
  { label: 'arg-servicos', params: { atos: 'sim', argumento: 'Portal de Serviços' } },
  { label: 'arg-domicilio-eletronico', params: { atos: 'sim', argumento: 'domicilio judicial eletronico' } }
];

const WIKI_URLS = [
  'https://datajud-wiki.cnj.jus.br/',
  'https://datajud-wiki.cnj.jus.br/api-publica',
  'https://datajud-wiki.cnj.jus.br/api-publica/acesso',
  'https://datajud-wiki.cnj.jus.br/api-publica/endpoints',
  'https://datajud-wiki.cnj.jus.br/api-publica/glossario',
  'https://datajud-wiki.cnj.jus.br/api-publica/exemplos',
  'https://datajud-wiki.cnj.jus.br/api-publica/exemplos/exemplo1',
  'https://datajud-wiki.cnj.jus.br/api-publica/exemplos/exemplo2',
  'https://datajud-wiki.cnj.jus.br/api-publica/exemplos/exemplo3',
  'https://datajud-wiki.cnj.jus.br/api-publica/consideracoes_finais',
  'https://datajud-wiki.cnj.jus.br/api-publica/termo-uso',
  'https://datajud-wiki.cnj.jus.br/mtd',
  'https://datajud-wiki.cnj.jus.br/mtd/v1_0',
  'https://datajud-wiki.cnj.jus.br/mtd/v1_1',
  'https://datajud-wiki.cnj.jus.br/mtd/v1_2',
  'https://datajud-wiki.cnj.jus.br/para-tribunais/Datajud/Acesso',
  'https://datajud-wiki.cnj.jus.br/para-tribunais/Datajud/Api-elastic',
  'https://datajud-wiki.cnj.jus.br/para-tribunais/Datajud/Kibana',
  'https://datajud-wiki.cnj.jus.br/para-tribunais/Datajud/tag-datamart',
  'https://datajud-wiki.cnj.jus.br/para-tribunais/manutencao-datajud/contrato',
  'https://datajud-wiki.cnj.jus.br/para-tribunais/manutencao-datajud/endpoints',
  'https://datajud-wiki.cnj.jus.br/para-tribunais/manutencao-datajud/servicos',
  'https://datajud-wiki.cnj.jus.br/para-tribunais/orientacoes-rest',
  'https://datajud-wiki.cnj.jus.br/para-tribunais/orientacoes-rest/criacao-arquivo/exemplo-xml',
  'https://datajud-wiki.cnj.jus.br/para-tribunais/orientacoes-rest/criacao-arquivo/orientacoes',
  'https://datajud-wiki.cnj.jus.br/para-tribunais/orientacoes-rest/envio-xml/autenticacao',
  'https://datajud-wiki.cnj.jus.br/para-tribunais/orientacoes-rest/envio-xml/certificado',
  'https://datajud-wiki.cnj.jus.br/para-tribunais/orientacoes-rest/envio-xml/envio-rest',
  'https://datajud-wiki.cnj.jus.br/para-tribunais/orientacoes-rest/envio-xml/exemplos/envio-processo',
  'https://datajud-wiki.cnj.jus.br/para-tribunais/orientacoes-rest/envio-xml/exemplos/validando-servico',
  'https://datajud-wiki.cnj.jus.br/para-tribunais/orientacoes-rest/protocolo/protocolo',
  'https://datajud-wiki.cnj.jus.br/para-tribunais/orientacoes-rest/verificacao/Fontes-Docker',
  'https://datajud-wiki.cnj.jus.br/para-tribunais/orientacoes-rest/verificacao/Simulando%20Envio',
  'https://datajud-wiki.cnj.jus.br/para-tribunais/orientacoes-rest/verificacao/Validando%20XML',
  'https://datajud-wiki.cnj.jus.br/para-tribunais/paineis-justica-em-numeros/Tutorial%20Painel%20de%20estatisticas'
];

const SGT_URLS = [
  'https://www.cnj.jus.br/sgt/versoes.php',
  'https://www.cnj.jus.br/sgt/versoes.php?tipo_tabela=M',
  'https://www.cnj.jus.br/sgt/versoes.php?tipo_tabela=A',
  'https://www.cnj.jus.br/sgt/versoes.php?tipo_tabela=D',
  'https://www.cnj.jus.br/sgt/versoes_anteriores.php',
  'https://www.cnj.jus.br/sgt/consulta_publica_classes.php',
  'https://www.cnj.jus.br/sgt/consulta_publica_documentos.php'
];

const MAX_ATOS_PAGES = 25;
const CONCURRENCY = 3;
const DELAY_MS = 220;
const TIMEOUT_MS = 60_000;

function slugify(value, max = 90) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, max);
}

function decodeEntities(html) {
  const map = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ordm: 'º', ordf: 'ª',
    ccedil: 'ç', Ccedil: 'Ç', aacute: 'á', Aacute: 'Á', eacute: 'é', Eacute: 'É', iacute: 'í', Iacute: 'Í',
    oacute: 'ó', Oacute: 'Ó', uacute: 'ú', Uacute: 'Ú', agrave: 'à', Agrave: 'À', ecirc: 'ê', Ecirc: 'Ê',
    ocirc: 'ô', Ocirc: 'Ô', atilde: 'ã', Atilde: 'Ã', otilde: 'õ', Otilde: 'Õ', uuml: 'ü', Uuml: 'Ü',
    ndash: '-', mdash: '—', lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"', hellip: '...', sect: '§', deg: '°',
    laquo: '«', raquo: '»', euro: '€', pound: '£', times: 'x', middot: '·'
  };
  return String(html || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(Number(d)); } catch { return ''; } })
    .replace(/&([a-zA-Z]+);/g, (m, name) => (name in map ? map[name] : m));
}

function htmlToMarkdown(html) {
  let text = String(html || '');
  const title = decodeEntities((text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
      const clean = label.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return clean ? ` [${clean}](${href}) ` : ` [${href}](${href}) `;
    })
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<t[dh][^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ');
  const lines = decodeEntities(text).split('\n')
    .map(line => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter((line, index, arr) => line.length > 0 || (arr[index - 1] || '').length > 0);
  return { title, markdown: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}

function normalizeUrl(value) {
  const url = new URL(value);
  if (url.hostname === 'datajud-wiki.cnj.jus.br' && !/\.[a-z0-9]+$/i.test(url.pathname)) {
    if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`;
  }
  return url.href;
}

async function fetchWithRetry(inputUrl, { method = 'GET', body = null, headers = {}, retries = 2 } = {}) {
  const url = normalizeUrl(inputUrl);
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method,
        body,
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/pdf,*/*', ...headers },
        redirect: 'follow',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise(resolve => setTimeout(resolve, 900 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

let manifest = [];
async function loadManifest() {
  try { manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8')); } catch { manifest = []; }
}
async function saveManifest(entry) {
  if (entry) {
    const index = manifest.findIndex(item => item.url === entry.url && item.kind === entry.kind);
    if (index >= 0) manifest[index] = entry; else manifest.push(entry);
  }
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

async function saveHtmlSource(url, { prefix = 'page', extra = {} } = {}) {
  const response = await fetchWithRetry(url);
  const contentType = String(response.headers.get('content-type') || '');
  if (/application\/pdf/i.test(contentType) || /\.pdf($|\?)/i.test(url)) {
    return savePdf(url, { prefix });
  }
  const html = await response.text();
  const { title, markdown } = htmlToMarkdown(html);
  const slug = `${prefix}-${slugify(new URL(url).pathname.replace(/\//g, '-') || new URL(url).hostname)}`;
  const file = path.join(SOURCES, `${slug}.md`);
  const header = [
    '---',
    `url: ${url}`,
    `title: ${(title || extra.title || '').replace(/\n/g, ' ')}`,
    `fetchedAt: ${new Date().toISOString()}`,
    `kind: ${extra.kind || 'html'}`,
    ...Object.entries(extra).filter(([key]) => !['kind', 'title'].includes(key)).map(([key, value]) => `${key}: ${String(value).replace(/\n/g, ' ')}`),
    '---',
    ''
  ].join('\n');
  const payload = `${header}# ${title || url}\n\n${markdown}\n`;
  await fs.mkdir(SOURCES, { recursive: true });
  await fs.writeFile(file, payload);
  const hash = crypto.createHash('sha256').update(payload).digest('hex');
  const entry = { url, kind: extra.kind || 'html', file: path.relative(ROOT, file).replace(/\\/g, '/'), title, bytes: Buffer.byteLength(payload), sha256: hash, fetchedAt: new Date().toISOString(), status: 200, ...extra };
  await saveManifest(entry);
  return { title, markdown, file, entry };
}

async function savePdf(url, { prefix = 'cnj' } = {}) {
  const response = await fetchWithRetry(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const nameDigits = String((url.match(/(?:original|compilado|resolucao|provimento|portaria|instrucao)[^/]*?(\d{3,})/i) || [])[1] || crypto.createHash('sha1').update(url).digest('hex').slice(0, 8));
  const slug = `${prefix}-${nameDigits}-${slugify(path.basename(new URL(url).pathname).slice(0, 40))}`;
  const pdfFile = path.join(PDF_DIR, `${slug}.pdf`);
  await fs.mkdir(PDF_DIR, { recursive: true });
  await fs.writeFile(pdfFile, buffer);
  let text = '';
  let pages = 0;
  try {
    const document = await getDocumentProxy(new Uint8Array(buffer));
    const result = await extractText(document, { mergePages: true });
    text = Array.isArray(result.text) ? result.text.join('\n\n') : String(result.text || '');
    pages = result.totalPages || 0;
  } catch (error) {
    text = `[FALHA NA EXTRAÇÃO DE TEXTO: ${error.message}]`;
  }
  const header = [
    '---',
    `url: ${url}`,
    `kind: pdf`,
    `fetchedAt: ${new Date().toISOString()}`,
    `bytes: ${buffer.length}`,
    `pages: ${pages}`,
    '---',
    ''
  ].join('\n');
  const mdFile = path.join(SOURCES, `${slug}.md`);
  await fs.writeFile(mdFile, `${header}# ${path.basename(new URL(url).pathname)}\n\n${text}\n`);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const entry = { url, kind: 'pdf', file: path.relative(ROOT, mdFile).replace(/\\/g, '/'), pdf: path.relative(ROOT, pdfFile).replace(/\\/g, '/'), bytes: buffer.length, pages, sha256: hash, fetchedAt: new Date().toISOString(), status: 200 };
  await saveManifest(entry);
  return entry;
}

async function mapPool(items, worker, concurrency = CONCURRENCY) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { error: error.message, item: items[index] };
        console.log(`  [erro] ${error.message} :: ${typeof items[index] === 'string' ? items[index] : items[index]?.id || JSON.stringify(items[index])}`);
      }
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  });
  await Promise.all(runners);
  return results;
}

async function enumerateAtos() {
  const found = new Map();
  for (const query of ATOS_QUERIES) {
    let emptyStreak = 0;
    for (let page = 1; page <= MAX_ATOS_PAGES; page += 1) {
      const params = new URLSearchParams({ ...query.params, page: String(page) });
      const url = `${ATOS_BASE}/atos?${params.toString()}`;
      let html = '';
      try {
        html = await (await fetchWithRetry(url)).text();
      } catch (error) {
        console.log(`  [atos] ${query.label} p${page}: ${error.message}`);
        break;
      }
      const tbody = (html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i) || [])[1] || '';
      const ids = [...tbody.matchAll(/atos\/detalhar\/(\d+)/g)].map(match => match[1]);
      const uniqueIds = [...new Set(ids)];
      if (!uniqueIds.length) {
        emptyStreak += 1;
        if (emptyStreak >= 2) break;
        continue;
      }
      emptyStreak = 0;
      let added = 0;
      for (const id of uniqueIds) {
        if (!found.has(id)) {
          const row = tbody.match(new RegExp(`<tr[^>]*>(?:(?!</tr>)[\\s\\S])*?atos/detalhar/${id}[\\s\\S]*?</tr>`, 'i'))?.[0] || '';
          const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(match => decodeEntities(match[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim());
          found.set(id, { id, query: query.label, cells });
          added += 1;
        }
      }
      console.log(`  [atos] ${query.label} p${page}: +${added} (total ${found.size})`);
      if (uniqueIds.length < 10) break;
    }
  }
  await fs.mkdir(INVENTORY, { recursive: true });
  const jsonl = [...found.values()].map(item => JSON.stringify(item)).join('\n');
  await fs.writeFile(path.join(INVENTORY, 'atos-index.jsonl'), `${jsonl}\n`);
  console.log(`[atos] indexados ${found.size} atos`);
  return [...found.values()];
}

async function downloadAtos(list, { skipPdfs = false } = {}) {
  let done = 0;
  await mapPool(list, async item => {
    const url = `${ATOS_BASE}/atos/detalhar/${item.id}`;
    const { markdown } = await saveHtmlSource(url, { prefix: 'atos', kind: 'ato', atoId: item.id });
    if (!skipPdfs) {
      const pdfLinks = [...new Set([...markdown.matchAll(/\((https:\/\/atos\.cnj\.jus\.br\/files\/[^)]+\.pdf)\)/gi)].map(match => match[1]))];
      for (const pdfUrl of pdfLinks) {
        try { await savePdf(pdfUrl, { prefix: 'ato' }); } catch (error) { console.log(`  [pdf] ${pdfUrl}: ${error.message}`); }
      }
    }
    done += 1;
    if (done % 25 === 0) console.log(`  [atos-detalhe] ${done}/${list.length}`);
  }, 2);
  console.log(`[atos] detalhes coletados: ${done}`);
}

async function downloadPdfsFromSources(nameRegex) {
  const filter = nameRegex ? new RegExp(nameRegex, 'i') : null;
  const files = await fs.readdir(SOURCES);
  const urls = new Set();
  for (const file of files) {
    if (!/^atos-/.test(file)) continue;
    const content = await fs.readFile(path.join(SOURCES, file), 'utf8');
    if (filter && !filter.test(content)) continue;
    for (const match of content.matchAll(/https:\/\/atos\.cnj\.jus\.br\/files\/[^\s)]+\.pdf/gi)) {
      urls.add(match[0]);
    }
  }
  console.log(`[pdfs-sources] ${urls.size} PDFs encontrados${nameRegex ? ` (filtro ${nameRegex})` : ''}`);
  let done = 0;
  await mapPool([...urls], async url => {
    await savePdf(url);
    done += 1;
    if (done % 20 === 0) console.log(`  [pdfs-sources] ${done}/${urls.size}`);
  });
  console.log(`[pdfs-sources] concluído: ${done}`);
}

async function downloadList(file, prefix) {
  const urls = (await fs.readFile(file, 'utf8')).split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  console.log(`[${prefix}] ${urls.length} URLs de ${file}`);
  let done = 0;
  await mapPool(urls, async url => {
    await saveHtmlSource(url, { prefix, kind: prefix });
    done += 1;
    if (done % 25 === 0) console.log(`  [${prefix}] ${done}/${urls.length}`);
  });
  console.log(`[${prefix}] concluído: ${done}`);
}

async function downloadPdfs(file) {
  const urls = (await fs.readFile(file, 'utf8')).split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  console.log(`[pdfs] ${urls.length} PDFs`);
  let done = 0;
  await mapPool(urls, async url => {
    await savePdf(url);
    done += 1;
    if (done % 20 === 0) console.log(`  [pdfs] ${done}/${urls.length}`);
  });
  console.log(`[pdfs] concluído: ${done}`);
}

async function main() {
  const [command, arg1, arg2] = process.argv.slice(2);
  await fs.mkdir(SOURCES, { recursive: true });
  await fs.mkdir(RAW, { recursive: true });
  await fs.mkdir(INVENTORY, { recursive: true });
  await loadManifest();

  if (command === 'atos') {
    const list = await enumerateAtos();
    await downloadAtos(list);
  } else if (command === 'atos-index') {
    await enumerateAtos();
  } else if (command === 'atos-fetch') {
    const jsonl = await fs.readFile(arg1 || path.join(INVENTORY, 'atos-index.jsonl'), 'utf8');
    const entries = jsonl.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    const skipPdfs = process.argv.includes('--no-pdf');
    const filter = arg2 && arg2 !== '--no-pdf' ? new RegExp(arg2, 'i') : null;
    const selected = filter
      ? entries.filter(entry => filter.test((entry.cells || []).join(' ')))
      : entries;
    console.log(`[atos-fetch] ${selected.length}/${entries.length} atos selecionados${filter ? ` por /${arg2}/i` : ''}${skipPdfs ? ' (sem PDF)' : ''}`);
    await downloadAtos(selected, { skipPdfs });
  } else if (command === 'pdfs-from-sources') {
    await downloadPdfsFromSources(arg1);
  } else if (command === 'pages') {
    await downloadList(arg1 || path.join(RAW, 'cnj-relevant-urls.txt'), arg2 || 'cnj');
  } else if (command === 'wiki') {
    let done = 0;
    await mapPool(WIKI_URLS, async url => {
      await saveHtmlSource(url, { prefix: 'datajud-wiki', kind: 'wiki' });
      done += 1;
      if (done % 10 === 0) console.log(`  [wiki] ${done}/${WIKI_URLS.length}`);
    });
    console.log(`[wiki] concluído: ${done}`);
  } else if (command === 'sgt') {
    let done = 0;
    await mapPool(SGT_URLS, async url => {
      await saveHtmlSource(url, { prefix: 'sgt', kind: 'sgt' });
      done += 1;
    });
    console.log(`[sgt] concluído: ${done}`);
  } else if (command === 'pdfs') {
    await downloadPdfs(arg1);
  } else {
    console.log('Uso: node scripts/cnj-research-fetch.mjs atos|pages <file> <prefix>|wiki|sgt|pdfs <file>');
  }
  await saveManifest();
  console.log(`[manifest] ${manifest.length} entradas em research/cnj/MANIFEST.json`);
}

main().catch(error => {
  console.error('[cnj-research-fetch] falha fatal:', error);
  process.exitCode = 1;
});
