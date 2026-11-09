import { createHash } from 'node:crypto';
import { getPjeProfileForPortal } from '../profiles/tjmt.mjs';

const CNJ_RE = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/;
const A4J_URL_RE = /\/pje\/Painel\/painel_usuario\/advogado\.seam/;
const EMPTY_TEXT_RE = /nenhum[ao]?\s|não existem|nao existem|sem resultados|não há processos|nao ha processos/i;
// O painel repete o título de resultados ("Expedientes N resultados encontrados") em um
// contêiner que carrega o CNJ e o texto do primeiro item. Ele NÃO é um expediente.
const RESULTS_HEADER_RE = /resultados?\s+encontrados?/i;
// O id de cada célula real carrega o id do expediente: ...:tbExpedientes:<id>:...
// TABLE, TBODY, cabeçalhos, paginador e células de ação sem esse segmento NÃO são linhas.
const EXPEDIENTE_CELL_RE = /:tbExpedientes:(\d{4,}):/;

export function parseExpedienteCellId(id) {
  const match = String(id || '').match(EXPEDIENTE_CELL_RE);
  return match ? match[1] : '';
}

export function isExpedienteResultsHeader(text) {
  return RESULTS_HEADER_RE.test(String(text || ''));
}

function validListedDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value || '');
  if (!match) return '';
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() + 1 === Number(month) && date.getUTCDate() === Number(day) ? value : '';
}

/**
 * Decide quais candidatos raspados do painel são linhas reais de expediente.
 * Pura e testável: o navegador só coleta { rowId, text, externalId }; a regra vive aqui.
 * - aceita SOMENTE nós cujo id carrega o id do expediente (`:tbExpedientes:<id>:`);
 * - o id do DOM precisa aparecer no próprio texto entre parênteses `(id)`;
 * - ignora o cabeçalho de resultados e textos sem CNJ;
 * - deduplica por id do expediente (nó de ação + linha real são o mesmo expediente).
 */
export function selectExpedienteCells(candidates = []) {
  const seen = new Set();
  const stats = { scanned: 0, semTexto: 0, semCnj: 0, agrupados: 0, cabecalhos: 0, foraCelula: 0, semVinculo: 0 };
  const rows = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const text = String(candidate?.text || '').replace(/\s+/g, ' ').trim();
    stats.scanned += 1;
    if (!text) { stats.semTexto += 1; continue; }
    const cellId = parseExpedienteCellId(candidate?.rowId);
    if (!cellId) { stats.foraCelula += 1; continue; }
    if (isExpedienteResultsHeader(text)) { stats.cabecalhos += 1; continue; }
    if (!CNJ_RE.test(text)) { stats.semCnj += 1; continue; }
    const mention = new RegExp(`\\(\\s*${cellId}\\s*\\)`);
    if (!mention.test(text)) { stats.semVinculo += 1; continue; }
    if (seen.has(cellId)) { stats.agrupados += 1; continue; }
    seen.add(cellId);
    const dates = text.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) || [];
    const prazoFinal = validListedDate(text.match(/\bData limite prevista para manifesta[çc][ãa]o\s*:\s*(\d{2}\/\d{2}\/\d{4})\b/i)?.[1]);
    const cienciaAt = validListedDate(text.match(/\bO sistema registrou ci[êe]ncia em\s+(\d{2}\/\d{2}\/\d{4})\b/i)?.[1]);
    rows.push({
      rowId: candidate?.rowId || '',
      rowIndex: cellId,
      externalId: candidate?.externalId || cellId,
      processNumber: text.match(CNJ_RE)[0],
      summary: text.slice(0, 500),
      prazoFinal,
      cienciaAt,
      dates,
      lastDate: dates.length ? dates[dates.length - 1] : ''
    });
  }
  return { rows: rows.slice(0, 400), stats };
}

export const PJE_COLLECTION_STATES = Object.freeze({
  LOADED: 'loaded',
  EMPTY_CONFIRMED: 'empty_confirmed',
  PARTIAL: 'partial',
  LOAD_TIMEOUT: 'load_timeout',
  PARSE_ERROR: 'parse_error',
  // Seção do painel ausente (página não autenticada, layout inesperado ou aba
  // indisponível): nunca é "vazio confirmado" nem sucesso silencioso.
  SECTION_NOT_FOUND: 'section_not_found'
});

export const PJE_SITUATION_KEYWORDS = Object.freeze([
  'ciência',
  'ciencia',
  'prazo',
  'resposta',
  'sem prazo',
  'respondido'
]);

export function parsePjeSituationList(text, { labels } = {}) {
  if (Array.isArray(labels) && labels.length) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    const results = [];
    for (const label of labels) {
      const index = normalized.indexOf(label);
      if (index < 0) continue;
      const tail = normalized.slice(index + label.length);
      const match = tail.match(/^\s*(\d{1,5})(?:\s|$)/);
      if (!match) continue;
      results.push({ label, count: Number(match[1]) });
    }
    return results;
  }
  const situations = [];
  const seen = new Set();
  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line || line.length > 120) continue;
    const match = line.match(/^(.{5,90}?)\s+(\d{1,4})$/);
    if (!match) continue;
    const label = match[1].trim();
    const count = Number(match[2]);
    if (!PJE_SITUATION_KEYWORDS.some(keyword => label.toLowerCase().includes(keyword))) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    situations.push({ label, count });
  }
  return situations;
}

export function parsePjeProcessRows(rows) {
  const records = [];
  const seen = new Set();
  for (const row of rows || []) {
    const text = String(row?.text || '').replace(/\s+/g, ' ').trim();
    const processNumber = text.match(CNJ_RE)?.[0];
    if (!processNumber) continue;
    if (seen.has(processNumber)) continue;
    seen.add(processNumber);
    const dates = text.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) || [];
    records.push({
      processNumber,
      summary: text.slice(0, 500),
      dates,
      lastDate: dates.length ? dates[dates.length - 1] : '',
      rowId: String(row?.id || '')
    });
  }
  return records;
}

export function reconcilePjeCollection({ expected, collected, tolerance = 0 } = {}) {
  const expectedTotal = Number(expected || 0);
  const collectedTotal = Number(collected || 0);
  if (collectedTotal === 0 && expectedTotal === 0) {
    return { state: PJE_COLLECTION_STATES.EMPTY_CONFIRMED, expected: 0, collected: 0, missing: 0 };
  }
  if (collectedTotal === expectedTotal) return { state: PJE_COLLECTION_STATES.LOADED, expected: expectedTotal, collected: collectedTotal, missing: 0 };
  if (collectedTotal < expectedTotal && collectedTotal > 0) {
    return { state: PJE_COLLECTION_STATES.PARTIAL, expected: expectedTotal, collected: collectedTotal, missing: expectedTotal - collectedTotal };
  }
  if (collectedTotal === 0 && expectedTotal > 0) {
    return { state: PJE_COLLECTION_STATES.LOAD_TIMEOUT, expected: expectedTotal, collected: 0, missing: expectedTotal };
  }
  if (collectedTotal > expectedTotal && collectedTotal - expectedTotal > tolerance) {
    return { state: PJE_COLLECTION_STATES.PARTIAL, expected: expectedTotal, collected: collectedTotal, missing: 0, excess: collectedTotal - expectedTotal };
  }
  return { state: PJE_COLLECTION_STATES.PARTIAL, expected: expectedTotal, collected: collectedTotal, missing: Math.max(0, expectedTotal - collectedTotal) };
}

async function readRegionSignature(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('tr')].filter(row => row.getClientRects().length);
    const text = document.body.innerText || '';
    return {
      rows: rows.length,
      length: text.length,
      cnj: (text.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g) || []).length,
      hash: `${rows.length}:${text.length}`
    };
  }).catch(() => null);
}

async function waitRegionChanged(page, before, { timeoutMs = 12_000, stepMs = 250 } = {}) {
  if (!before) return false;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const now = await readRegionSignature(page);
    if (now && (now.hash !== before.hash || now.cnj !== before.cnj)) return true;
    if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(stepMs);
  }
  return false;
}

async function clickWithA4jWait(page, clickAction, { responseTimeoutMs = 15_000, changeTimeoutMs = 12_000 } = {}) {
  const before = await readRegionSignature(page);
  const waiter = page.waitForResponse(response => {
    const request = response.request();
    return A4J_URL_RE.test(response.url())
      && request.method() === 'POST'
      && ['xhr', 'fetch'].includes(request.resourceType());
  }, { timeout: responseTimeoutMs }).catch(() => null);
  const clickResult = await clickAction();
  const response = await waiter;
  const changed = await waitRegionChanged(page, before, { timeoutMs: changeTimeoutMs });
  return { clickResult, responseSeen: Boolean(response), changed };
}

function clickLeafByPredicate(page, acceptedTexts) {
  return page.evaluate(expected => {
    if (!Array.isArray(expected) || !expected.length) return null;
    const wanted = new Set(expected.map(value => String(value)));
    let best = null;
    for (const node of document.querySelectorAll('tr, td, a, span, li, div')) {
      if (!node.getClientRects().length) continue;
      const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length > 140) continue;
      if (!wanted.has(text)) continue;
      const size = text.length;
      if (!best || size < best.size) best = { node, text, size };
    }
    if (!best) return null;
    const clickable = best.node.closest('td[onclick], a[onclick], td.rich-tree-node-text, a, td, tr') || best.node;
    clickable.click();
    return { text: best.text.slice(0, 90), tag: clickable.tagName, id: clickable.id || '' };
  }, acceptedTexts).catch(() => null);
}

function clickTab(page, tab) {
  const selector = tab === 'acervo' ? '#tabAcervo_lbl' : '#tabExpedientes_lbl';
  return page.evaluate(sel => {
    const node = document.querySelector(sel);
    if (!node) return false;
    node.click();
    return true;
  }, selector).catch(() => false);
}

function readBodyText(page) {
  return page.evaluate(() => (document.body.innerText || '')).catch(() => '');
}

export function decisionsFromGroups(groups, { situationsFound = groups.length > 0 } = {}) {
  if (!groups.length) {
    // Lista de situações ausente = seção não encontrada; lista presente e vazia
    // (todas as situações com contagem zero) = vazio confirmado de verdade.
    return situationsFound ? PJE_COLLECTION_STATES.EMPTY_CONFIRMED : PJE_COLLECTION_STATES.SECTION_NOT_FOUND;
  }
  let sawPartial = false;
  let sawTimeout = false;
  for (const group of groups) {
    if (group.state === PJE_COLLECTION_STATES.LOAD_TIMEOUT) sawTimeout = true;
    else if (group.state === PJE_COLLECTION_STATES.PARTIAL || group.state === PJE_COLLECTION_STATES.PARSE_ERROR) sawPartial = true;
  }
  if (sawTimeout || sawPartial) return PJE_COLLECTION_STATES.PARTIAL;
  return PJE_COLLECTION_STATES.LOADED;
}

async function readCenterState(page) {
  return page.evaluate(() => {
    const centerStart = 380;
    const centerTables = [...document.querySelectorAll('table')].filter(table => {
      const rect = table.getBoundingClientRect();
      return rect.width > 300 && rect.left >= centerStart && table.getClientRects().length;
    });
    const tables = centerTables.length
      ? centerTables
      : [...document.querySelectorAll('table')].filter(table => table.getClientRects().length);
    const text = tables.map(table => table.innerText || '').join(' ');
    const cnj = (text.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g) || []).length;
    const rows = tables.reduce((sum, table) => sum + table.querySelectorAll('tbody tr').length, 0);
    const empty = /nenhum[ao]?\s|não existem|nao existem|sem resultados|não há|nao ha/i.test(text);
    return { cnj, rows, empty };
  }).catch(() => null);
}

async function waitCenterLoaded(page, { timeoutMs = 15_000, stepMs = 300 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastState = null;
  for (;;) {
    const state = await readCenterState(page);
    if (state) lastState = state;
    if (state?.cnj > 0) return { kind: 'rows', ...state };
    if (state?.empty) return { kind: 'empty', ...state };
    if (Date.now() >= deadline) return { kind: 'timeout', state: lastState };
    if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(stepMs);
  }
}

const JURISDICTION_RE = /^(.{3,90}?)\s+(\d{1,5})$/;

function markSituationJurisdictions(page, { situationLabel, situationCount, canonicalLabels }) {
  return page.evaluate(({ label, count, labels }) => {
    const canonical = labels.map(item => item.toLowerCase());
    const collapse = value => (value || '').replace(/\s+/g, ' ').trim();
    const isSituation = text => {
      const lower = text.toLowerCase();
      return canonical.some(item => lower === item || lower.startsWith(item + ' '));
    };
    let anchor = null;
    for (const node of document.querySelectorAll('a')) {
      const text = collapse(node.innerText || node.textContent);
      if (text === label || text === label + ' ' + count) { anchor = node; break; }
    }
    if (!anchor) return { found: false, nodes: [] };
    const form = anchor.closest('#formAbaExpediente, form[id*="AbaExpediente"], form') || document;
    const levels = [...form.querySelectorAll('[id*="linhaN"]')];
    const anchorLevel = levels.findIndex(element => element.contains(anchor));
    const containerScope = anchorLevel >= 0 ? levels : [];
    const nodes = [];
    const seen = new Set();
    const scan = element => {
      for (const link of element.querySelectorAll('a')) {
        const text = collapse(link.innerText || link.textContent);
        const match = text.match(/^(.{3,90}?)\s+(\d{1,5})$/);
        if (!match) continue;
        const nodeLabel = match[1].trim();
        if (isSituation(nodeLabel)) continue;
        if (/\d{7}-\d{2}\.\d{4}/.test(nodeLabel) || /total/i.test(nodeLabel)) continue;
        if (seen.has(nodeLabel)) continue;
        seen.add(nodeLabel);
        link.setAttribute('data-atrium-jur', String(nodes.length));
        nodes.push({ label: nodeLabel, count: Number(match[2]) });
      }
    };
    if (containerScope.length) {
      for (let index = anchorLevel + 1; index < containerScope.length; index += 1) {
        const element = containerScope[index];
        const id = String(element.id || '');
        if (/linhaN1(?:\b|$)/.test(id)) break;
        scan(element);
      }
    }
    if (!nodes.length) {
      let scope = anchor.parentElement;
      let hops = 0;
      while (scope && hops < 4 && !nodes.length) {
        if (scope.id && /AbaExpediente|divMenuContexto/.test(scope.id)) scan(scope);
        scope = scope.parentElement;
        hops += 1;
      }
    }
    return { found: true, nodes };
  }, { label: situationLabel, count: situationCount, labels: canonicalLabels }).catch(() => ({ found: false, nodes: [] }));
}

function clickMarkedJurisdiction(page, index) {
  return page.evaluate(marker => {
    const holder = document.querySelector('[data-atrium-jur="' + marker + '"]');
    if (!holder) return null;
    const text = (holder.innerText || holder.textContent || '').replace(/\s+/g, ' ').trim();
    holder.click();
    return { text: text.slice(0, 80), tag: holder.tagName, id: holder.id || '' };
  }, index).catch(() => null);
}
function clearMarkedJurisdictions(page) {
  return page.evaluate(() => {
    const marked = [...document.querySelectorAll('[data-atrium-jur]')];
    for (const node of marked) node.removeAttribute('data-atrium-jur');
    return marked.length;
  }).catch(() => 0);
}

function readAcervoJurisdictions(page) {
  return page.evaluate(() => {
    const collapse = value => (value || '').replace(/\s+/g, ' ').trim();
    const matchesNode = node => {
      if (!node.getClientRects().length) return null;
      const text = collapse(node.innerText || node.textContent);
      if (!text || text.length > 120) return null;
      const match = text.match(/^(.{3,90}?)\s+(\d{1,5})$/);
      if (!match) return null;
      const label = match[1].trim();
      if (/ciência|ciencia|prazo|resposta|total/i.test(label)) return null;
      if (/\d{7}-\d{2}\.\d{4}/.test(label)) return null;
      return { label, count: Number(match[2]) };
    };
    let anchor = null;
    for (const node of document.querySelectorAll('td, a, span, tr')) {
      if (matchesNode(node)) { anchor = node; break; }
    }
    if (!anchor) return { found: false, nodes: [] };
    const scopes = [];
    let scope = anchor.closest('table');
    while (scope && scopes.length < 4) {
      scopes.push(scope);
      scope = scope.parentElement ? scope.parentElement.closest('table') : null;
    }
    scopes.push(anchor.parentElement);
    let best = { nodes: [], markers: [] };
    for (const candidate of scopes) {
      if (!candidate) continue;
      const nodes = [];
      const seen = new Set();
      for (const node of candidate.querySelectorAll('td, a, span')) {
        const info = matchesNode(node);
        if (!info) continue;
        if (seen.has(info.label)) continue;
        seen.add(info.label);
        nodes.push({ ...info, node });
      }
      if (nodes.length > best.nodes.length) best = { nodes, markers: nodes };
    }
    best.nodes.forEach((entry, index) => entry.node.setAttribute('data-atrium-jur', String(index)));
    return { found: true, nodes: best.nodes.map(entry => ({ label: entry.label, count: entry.count })) };
  }).catch(() => ({ found: false, nodes: [] }));
}
function readCenterRows(page) {
  return page.evaluate(() => {
    const centerStart = 380;
    const centerTables = [...document.querySelectorAll('table')].filter(table => {
      const rect = table.getBoundingClientRect();
      return rect.width > 300 && rect.left >= centerStart && table.getClientRects().length;
    });
    const tables = centerTables.length ? centerTables : [...document.querySelectorAll('table')].filter(table => table.getClientRects().length);
    const rows = [];
    for (const table of tables) {
      for (const row of table.querySelectorAll('tr')) {
        if (!row.getClientRects().length) continue;
        const text = (row.innerText || '').replace(/\s+/g, ' ').trim();
        if (!text || text.length > 1_500) continue;
        rows.push({ id: row.id || '', text });
      }
    }
    return rows.slice(0, 1_500);
  }).catch(() => []);
}

const EXPEDIENTE_ID_PATTERNS = Object.freeze([
  /(?:id|nu|num|cod(?:igo)?)[_.-]?expediente[_.-]?(?:id)?[=:'"(\s]+(\d{4,})/i,
  /expediente[_.-]?id[=:'"(\s]+(\d{4,})/i
]);

function normalizeExpedienteDates(record) {
  const values = [];
  if (Array.isArray(record?.dates)) values.push(...record.dates);
  for (const key of ['lastDate', 'createdAt', 'audienciaAt', 'cienciaAt', 'prazoFinal']) {
    if (record?.[key]) values.push(record[key]);
  }
  values.push(...(String(record?.summary || '').match(/\b\d{2}\/\d{2}\/\d{4}\b/g) || []));
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].sort();
}

// Identidade do expediente: ID externo estável quando o portal o expõe; caso contrário,
// fingerprint determinístico do conteúdo normalizado (processo + situação + órgão + datas).
// Índices de renderização JSF (tbExpedientes:<n>) e texto mutável nunca viram identidade.
export function expedienteIdentityFor(record) {
  const externalId = String(record?.externalId || record?.expedienteId || '').trim();
  if (externalId) return `id:${externalId}`;
  const normalized = [
    String(record?.processNumber || '').trim(),
    String(record?.situation || '').replace(/\s+/g, ' ').trim(),
    String(record?.orgaoJulgador || record?.courtUnit || '').replace(/\s+/g, ' ').trim(),
    normalizeExpedienteDates(record).join(',')
  ].join('|');
  const hash = createHash('sha1').update(normalized).digest('hex').slice(0, 20);
  return `fp:${hash}`;
}

export function readExpedienteCandidates(page) {
  return page.evaluate(() => {
    const CNJ_RE = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/;
    const ID_PATTERNS = [
      /(?:id|nu|num|cod(?:igo)?)[_.-]?expediente[_.-]?(?:id)?[=:'"(\s]+(\d{4,})/i,
      /expediente[_.-]?id[=:'"(\s]+(\d{4,})/i
    ];
    const externalIdFor = row => {
      const candidates = [
        row.getAttribute('data-expediente-id') || '',
        row.getAttribute('data-id-expediente') || '',
        row.getAttribute('data-nu-expediente') || ''
      ];
      for (const node of row.querySelectorAll('a, input, button')) {
        candidates.push(node.getAttribute('href') || '', node.getAttribute('onclick') || '', node.id || '');
        for (const value of Object.values(node.dataset || {})) candidates.push(String(value || ''));
      }
      for (const candidate of candidates) {
        if (!/expediente/i.test(candidate)) continue;
        for (const pattern of ID_PATTERNS) {
          const match = candidate.match(pattern);
          if (match) return match[1];
        }
      }
      return '';
    };
    const candidates = [];
    const structure = [];
    for (const node of document.querySelectorAll('[id*="tbExpedientes"]')) {
      const id = node.id || '';
      if (!/tbExpedientes/.test(id)) continue;
      const container = node.closest('tr, [id*="tbExpedientes"]') || node;
      const text = (container.innerText || '').replace(/\s+/g, ' ').trim();
      // Estrutura do nó (sem texto/PII): permite distinguir cabeçalho, ação e linha real.
      if (structure.length < 120) {
        structure.push({
          nodeId: id.slice(0, 70),
          tag: container.tagName,
          containerId: (container.id || '').slice(0, 70),
          containerClass: String(container.className || '').slice(0, 70),
          parentTag: container.parentElement?.tagName || '',
          parentId: (container.parentElement?.id || '').slice(0, 70),
          children: container.children?.length || 0,
          links: container.querySelectorAll?.('a').length || 0,
          buttons: container.querySelectorAll?.('button').length || 0,
          textLength: text.length,
          hasCnj: CNJ_RE.test(text),
          expedienteNumero: /\(\d{4,}\)/.test(text),
          diario: /Diário Eletrônico/i.test(text),
          resultados: /resultados?\s+encontrados?/i.test(text),
          responder: /^\s*RESPONDER\b/i.test(text)
        });
      }
      candidates.push({ rowId: id, text, externalId: externalIdFor(container) });
    }
    return { candidates, structure };
  }).catch(() => ({ candidates: [], structure: [] }));
}

async function loadSectionRows(page, { maxLoads = 24 } = {}) {
  const expedientes = new Map();
  const centerRows = [];
  const structure = [];
  const stats = { scanned: 0, semTexto: 0, semCnj: 0, agrupados: 0, cabecalhos: 0, foraCelula: 0, semVinculo: 0 };
  const collect = async () => {
    const read = await readExpedienteCandidates(page);
    const selection = selectExpedienteCells(read.candidates);
    stats.scanned += selection.stats.scanned;
    stats.semTexto += selection.stats.semTexto;
    stats.semCnj += selection.stats.semCnj;
    stats.agrupados += selection.stats.agrupados;
    stats.cabecalhos += selection.stats.cabecalhos;
    stats.foraCelula += selection.stats.foraCelula;
    stats.semVinculo += selection.stats.semVinculo;
    for (const entry of read.structure || []) {
      if (structure.length < 120) structure.push(entry);
    }
    for (const record of selection.rows) {
      const identity = expedienteIdentityFor(record);
      if (!expedientes.has(identity)) expedientes.set(identity, record);
    }
    for (const row of await readCenterRows(page)) centerRows.push(row);
  };
  await collect();
  let loads = 0;
  let morePages = true;
  while (morePages && loads < maxLoads && (expedientes.size > 0 || parsePjeProcessRows(centerRows).length > 0)) {
    morePages = false;
    const pagination = await page.evaluate(() => {
      for (const node of document.querySelectorAll('a, input[type="button"], button')) {
        const text = (node.innerText || node.value || '').replace(/\s+/g, ' ').trim();
        if (!/^pr[oó]xim[ao]$|^next$|^»$/i.test(text)) continue;
        const disabled = node.disabled || /disabled|rich-.*-dis/.test(String(node.className || ''));
        if (disabled) return null;
        node.click();
        return text;
      }
      return null;
    }).catch(() => null);
    if (!pagination) break;
    loads += 1;
    await page.waitForTimeout(900);
    const before = expedientes.size + centerRows.length;
    await collect();
    morePages = expedientes.size + centerRows.length > before;
  }
  const expedienteList = [...expedientes.values()];
  const processMap = new Map();
  for (const record of expedienteList) {
    if (!processMap.has(record.processNumber)) {
      processMap.set(record.processNumber, {
        processNumber: record.processNumber,
        summary: record.summary,
        dates: record.dates,
        lastDate: record.lastDate,
        rowId: record.rowId
      });
    }
  }
  for (const record of parsePjeProcessRows(centerRows)) {
    if (!processMap.has(record.processNumber)) processMap.set(record.processNumber, record);
  }
  return { processes: [...processMap.values()], expedientes: expedienteList, pagesLoaded: loads + 1, stats, structure };
}

export async function collectPjeStandardSection(page, portal, section, { budget = {} } = {}) {
  const limits = { maxJurisdictions: 40, maxProcessRows: 800, responseTimeoutMs: 15_000, changeTimeoutMs: 12_000, ...budget };
  const capturedAt = new Date().toISOString();
  const tabName = section === 'acervo' ? 'acervo' : 'expedientes';
  const profile = getPjeProfileForPortal(portal);
  
  await clickWithA4jWait(page, () => clickTab(page, tabName), { responseTimeoutMs: limits.responseTimeoutMs, changeTimeoutMs: limits.changeTimeoutMs });
  let bodyText = await readBodyText(page);

  let situations = [];
  const groups = [];
  let sectionState = PJE_COLLECTION_STATES.LOADED;
  let reconciliation = { expected: 0, collected: 0, missing: 0, state: PJE_COLLECTION_STATES.EMPTY_CONFIRMED };

  if (tabName === 'expedientes') {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      bodyText = await readBodyText(page);
      situations = parsePjeSituationList(bodyText, { labels: profile?.situationLabels });
      if (situations.length >= (profile?.situationLabels?.length || 1)) break;
      await page.waitForTimeout(1_200);
    }
    const canonicalByOriginal = new Map((profile?.situationLabels || []).map(label => [label.toLowerCase(), label]));
    const allExpedientes = [];
    let groupExpectedTotal = 0;
    let groupCollectedTotal = 0;
    const groupMissingTotal = { value: 0 };
    for (const situation of situations) {
      const group = {
        labelOriginal: situation.label,
        labelCanonical: canonicalByOriginal.get(situation.label.toLowerCase()) || situation.label,
        expected: situation.count,
        state: situation.count === 0 ? PJE_COLLECTION_STATES.EMPTY_CONFIRMED : PJE_COLLECTION_STATES.PARTIAL,
        jurisdictions: [],
        collected: 0
      };
      if (situation.count > 0) {
        await clickWithA4jWait(
          page,
          () => clickLeafByPredicate(
            page,
            [situation.label, `${situation.label} ${situation.count}`]
          ),
          { responseTimeoutMs: limits.responseTimeoutMs, changeTimeoutMs: limits.changeTimeoutMs }
        );
        const marked = await markSituationJurisdictions(page, {
          situationLabel: situation.label,
          situationCount: situation.count,
          canonicalLabels: profile?.situationLabels || []
        });
        const jurisdictions = marked.nodes.map((node, index) => ({ ...node, marker: index }));
        const groupIdentities = new Set();
        const groupProcesses = new Set();
        for (const jurisdiction of jurisdictions.slice(0, limits.maxJurisdictions)) {
          const attempts = 2;
          let bestLoaded = { processes: [], expedientes: [], pagesLoaded: 0, stats: { scanned: 0, semTexto: 0, semCnj: 0, agrupados: 0, cabecalhos: 0, foraCelula: 0, semVinculo: 0 } };
          let selectedReport = null;
          let centerReport = null;
          let emptyText = false;
          for (let attempt = 0; attempt < attempts; attempt += 1) {
            await markSituationJurisdictions(page, {
              situationLabel: situation.label,
              situationCount: situation.count,
              canonicalLabels: profile?.situationLabels || []
            });
            const selected = await clickWithA4jWait(
              page,
              () => clickMarkedJurisdiction(page, jurisdiction.marker),
              { responseTimeoutMs: limits.responseTimeoutMs, changeTimeoutMs: limits.changeTimeoutMs }
            );
            selectedReport = selected;
            emptyText = EMPTY_TEXT_RE.test(await readBodyText(page));
            const center = await waitCenterLoaded(page, { timeoutMs: limits.changeTimeoutMs });
            centerReport = center;
            const loaded = center.kind === 'rows'
              ? await loadSectionRows(page, { maxLoads: 12 })
              : { processes: [], expedientes: [], pagesLoaded: center.kind === 'empty' ? 1 : 0, stats: { scanned: 0, semTexto: 0, semCnj: 0, agrupados: 0, cabecalhos: 0, foraCelula: 0, semVinculo: 0 } };
            if (loaded.expedientes.length >= Math.min(jurisdiction.count, bestLoaded.expedientes.length + 1)) {
              bestLoaded = loaded;
            }
            if (loaded.expedientes.length >= jurisdiction.count) break;
          }
          const situationIdentityFor = record => expedienteIdentityFor({ ...record, situation: situation.label });
          const uniqueLoaded = [];
          for (const record of bestLoaded.expedientes) {
            const identity = situationIdentityFor(record);
            if (groupIdentities.has(identity)) continue;
            groupIdentities.add(identity);
            uniqueLoaded.push({ identity, record });
          }
          for (const record of bestLoaded.processes) groupProcesses.add(record.processNumber);
          for (const { identity, record } of uniqueLoaded) {
            const existing = allExpedientes.find(item => item.identity === identity);
            if (!existing) {
              allExpedientes.push({ identity, ...record, situations: [situation.label], situation: situation.label, jurisdiction: jurisdiction.label });
            } else if (!existing.situations.includes(situation.label)) {
              existing.situations.push(situation.label);
            }
          }
          group.jurisdictions.push({
            label: jurisdiction.label,
            expected: jurisdiction.count,
            collected: bestLoaded.expedientes.length,
            expedienteIds: bestLoaded.expedientes.map(record => situationIdentityFor(record)),
            processNumbers: [...new Set(bestLoaded.expedientes.map(record => record.processNumber))],
            selected: Boolean(selectedReport?.clickResult),
            responseSeen: Boolean(selectedReport?.responseSeen),
            centerKind: centerReport?.kind || 'timeout',
            parseError: centerReport?.kind === 'rows' && bestLoaded.expedientes.length === 0,
            emptyConfirmed: (centerReport?.kind === 'empty' || emptyText) && bestLoaded.expedientes.length === 0,
            pages: bestLoaded.pagesLoaded,
            linhasVarridas: bestLoaded.stats?.scanned || 0,
            linhasSemCnj: bestLoaded.stats?.semCnj || 0,
            linhasAgrupadas: bestLoaded.stats?.agrupados || 0,
            linhasForaCelula: bestLoaded.stats?.foraCelula || 0,
            linhasCabecalho: bestLoaded.stats?.cabecalhos || 0,
            linhasSemVinculo: bestLoaded.stats?.semVinculo || 0,
            arvore: Array.isArray(bestLoaded.structure) ? bestLoaded.structure.slice(0, 120) : []
          });
        }
        group.expedientesUnicos = groupIdentities.size;
        group.processosUnicos = groupProcesses.size;
        group.collected = groupIdentities.size;
        await clearMarkedJurisdictions(page);
        const groupExpected = situation.count;
        const groupReconcile = reconcilePjeCollection({ expected: groupExpected, collected: group.collected });
        group.state = group.jurisdictions.some(item => item.parseError)
          ? PJE_COLLECTION_STATES.PARSE_ERROR
          : groupReconcile.state;
        groupMissingTotal.value += groupReconcile.missing || 0;
      }
      groupExpectedTotal += group.expected;
      groupCollectedTotal += group.collected;
      groups.push(group);
    }
    const processMap = new Map();
    for (const record of allExpedientes) {
      if (!record.processNumber) continue;
      const existing = processMap.get(record.processNumber);
      if (!existing) {
        processMap.set(record.processNumber, {
          processNumber: record.processNumber,
          summary: record.summary,
          dates: record.dates,
          lastDate: record.lastDate,
          rowId: record.rowId,
          situation: record.situation,
          jurisdiction: record.jurisdiction
        });
      }
    }
    const allProcesses = [...processMap.values()];
    reconciliation = {
      state: decisionsFromGroups(groups, { situationsFound: situations.length > 0 }),
      expected: groupExpectedTotal,
      collected: groupCollectedTotal,
      uniqueExpedientes: allExpedientes.length,
      uniqueProcesses: allProcesses.length,
      missing: groupMissingTotal.value
    };
    sectionState = reconciliation.state;
    return {
      section: 'expedientes',
      state: sectionState,
      situations,
      groups,
      expedientes: allExpedientes.slice(0, limits.maxProcessRows),
      processes: allProcesses.slice(0, limits.maxProcessRows),
      reconciliation,
      totals: {
        situations: situations.length,
        situationSum: groupExpectedTotal,
        expedientes: allExpedientes.length,
        processes: allProcesses.length,
        uniqueExpedientes: allExpedientes.length,
        uniqueProcesses: allProcesses.length
      },
      url: page.url(),
      capturedAt
    };
  }

  const { nodes = [] } = await readAcervoJurisdictions(page);
  const acervoBodyText = await readBodyText(page);
  const totalMatch = acervoBodyText.match(/total\s+(\d{1,5})/i);
  const expectedTotal = totalMatch ? Number(totalMatch[1]) : nodes.reduce((sum, item) => sum + item.count, 0);
  // Sem nós de jurisdição, sem total e sem texto de vazio: a seção do acervo não
  // foi encontrada (página não autenticada ou layout inesperado) — nunca "vazio
  // confirmado" por ausência de evidência.
  if (!nodes.length && !totalMatch && !EMPTY_TEXT_RE.test(acervoBodyText)) {
    sectionState = PJE_COLLECTION_STATES.SECTION_NOT_FOUND;
    return {
      section: 'acervo',
      state: sectionState,
      nodes: [],
      processes: [],
      reconciliation: { state: sectionState, expected: 0, collected: 0, missing: 0 },
      totals: { nodes: 0, expectedSum: 0, processes: 0 },
      url: page.url(),
      capturedAt
    };
  }
  const collectedNumbers = new Set();
  const allProcesses = [];
  const nodeReports = [];
  for (const [index, node] of nodes.slice(0, limits.maxJurisdictions).entries()) {
    const selected = await clickWithA4jWait(
      page,
      () => clickLeafByPredicate(
        page,
        [node.label + ' ' + node.count, node.label]
      ),
      { responseTimeoutMs: limits.responseTimeoutMs, changeTimeoutMs: limits.changeTimeoutMs }
    );
    const emptyText = EMPTY_TEXT_RE.test(await readBodyText(page));
    const center = await waitCenterLoaded(page, { timeoutMs: limits.changeTimeoutMs });
    const loaded = center.kind === 'rows'
      ? await loadSectionRows(page, { maxLoads: 12 })
      : { processes: [], pagesLoaded: center.kind === 'empty' ? 1 : 0 };
    for (const record of loaded.processes) {
      if (collectedNumbers.has(record.processNumber)) continue;
      collectedNumbers.add(record.processNumber);
      allProcesses.push({ ...record, jurisdiction: node.label });
    }
    nodeReports.push({
      label: node.label,
      expected: node.count,
      collected: loaded.processes.length,
      responseSeen: Boolean(selected?.responseSeen),
      centerKind: center.kind,
      emptyConfirmed: (center.kind === 'empty' || emptyText) && loaded.processes.length === 0,
      pages: loaded.pagesLoaded
    });
  }
  reconciliation = reconcilePjeCollection({ expected: expectedTotal, collected: allProcesses.length });
  sectionState = reconciliation.state;
  await clearMarkedJurisdictions(page);
  return {
    section: 'acervo',
    state: sectionState,
    nodes: nodeReports,
    processes: allProcesses.slice(0, limits.maxProcessRows),
    reconciliation,
    totals: {
      nodes: nodes.length,
      expectedSum: expectedTotal,
      processes: allProcesses.length
    },
    url: page.url(),
    capturedAt
  };
}

export async function collectPjeStandardInventory(page, portal, { budget = {} } = {}) {
  const expedientes = await collectPjeStandardSection(page, portal, 'expedientes', { budget });
  const acervo = await collectPjeStandardSection(page, portal, 'acervo', { budget });
  return {
    portalId: portal?.id || '',
    portalName: portal?.name || '',
    layoutFamily: portal?.layoutFamily || 'standard',
    collectorKey: portal?.collectorKey || 'standard',
    collectedAt: new Date().toISOString(),
    expedientes,
    acervo
  };
}

export const pjeStandardInternals = Object.freeze({
  parsePjeSituationList,
  parsePjeProcessRows,
  reconcilePjeCollection,
  CNJ_RE
});
