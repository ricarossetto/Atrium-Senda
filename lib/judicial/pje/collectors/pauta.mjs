/**
 * ATRIUM — Intimações de pauta do PJe (2º grau).
 *
 * A aba "Intimações de pauta" do painel do advogado lista os processos incluídos em
 * sessão de julgamento com data, horário e tipo da sessão. A coleta é somente leitura:
 * abre a aba, lê a tabela e devolve as sessões normalizadas; nada é clicado dentro dos
 * autos, nenhum prazo é criado e nenhuma ciência é dada.
 *
 * O painel usa RichFaces (JSF com AJAX). A aba só existe em portais que a oferecem
 * (2º grau); quando não existe, a coleta se declara não descoberta em vez de fingir
 * lista vazia.
 */

const CNJ_RE = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/;
const PERIOD_RE = /(\d{2})\/(\d{2})\/(\d{4})\s*(?:às|as)?\s*(\d{2})[:h](\d{2})\s*(?:a|até)\s*(\d{2})\/(\d{2})\/(\d{4})\s*(?:às|as)?\s*(\d{2})[:h](\d{2})/i;
const DATE_TIME_RE = /(\d{2})\/(\d{2})\/(\d{4})(?:\s*(?:às|as|,|-)?\s*(\d{2})[:h](\d{2}))?/g;
const SEQUENTIAL_RE = /sequencial\s*:?\s*(\d{1,6})/i;
const PANEL_RE = /(\d{1,2}\s*ª?\s*(?:c[âa]mara|turma|se[çc][ãa]o|vara|órgão|orgao)[^0-9]{0,48})/i;
const EMPTY_RE = /n[ãa]o h[áa] quaisquer intima[çc][õo]es|nenhum registro|n[ãa]o existem intima[çc][õo]es/i;
const TAB_ID = 'tabProcAdvPainelIntimacaoPendente';
const PANEL_ID = 'tabProcAdvPainelIntimacaoPendente';

function collapse(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isoDate(day, month, year) {
  return `${year}-${month}-${day}`;
}

function isoDateTime(day, month, year, hour = '00', minute = '00') {
  return `${year}-${month}-${day}T${hour}:${minute}:00`;
}

export function parsePjeSessionMode(text) {
  const source = collapse(text).toLowerCase();
  if (!/sess[ãa]o/.test(source)) return '';
  if (/ass[íi]ncrona/.test(source)) return 'VIRTUAL_ASSINCRONA';
  if (/telepresencial/.test(source)) return 'TELEPRESENCIAL';
  if (/h[íi]brida/.test(source)) return 'HIBRIDA';
  if (/virtual/.test(source)) return 'VIRTUAL';
  if (/presencial/.test(source)) return 'PRESENCIAL';
  return 'SESSAO';
}

export function isPjePautaEmpty(text) {
  return EMPTY_RE.test(collapse(text));
}

/**
 * Converte o texto de uma linha da pauta em sessão normalizada.
 * Aceita período (sessão assíncrona), data+hora ou apenas data.
 */
export function parsePjePautaRow(text, { portalId = '', href = '' } = {}) {
  const normalized = collapse(text);
  if (!normalized) return null;
  const cnj = normalized.match(CNJ_RE)?.[0] || '';
  if (!cnj) return null;

  const period = PERIOD_RE.exec(normalized);
  let sessionStart = '';
  let sessionEnd = '';
  if (period) {
    sessionStart = isoDateTime(period[1], period[2], period[3], period[4], period[5]);
    sessionEnd = isoDateTime(period[6], period[7], period[8], period[9], period[10]);
  } else {
    const dates = [...normalized.matchAll(DATE_TIME_RE)];
    const withTime = dates.find(match => match[4]);
    const chosen = withTime || dates[0];
    if (chosen) sessionStart = isoDateTime(chosen[1], chosen[2], chosen[3], chosen[4] || '00', chosen[5] || '00');
  }
  if (!sessionStart) return null;

  const panelRaw = normalized.match(PANEL_RE)?.[1] || '';
  const panel = collapse(panelRaw
    .split(/\s+(?:sess[ãa]o|data|per[íi]odo|sequencial|processo|classe|assunto|relator|intima[çc][ãa]o)\b/i)[0]
    .replace(/[;,.]\s*$/, ''));
  const sequential = normalized.match(SEQUENTIAL_RE)?.[1] || '';
  const mode = parsePjeSessionMode(normalized);
  const status = /cancelad[ao]/i.test(normalized) ? 'CANCELADA' : 'DESIGNADA';

  return {
    cnj: cnj.replace(/\D/g, ''),
    processNumber: cnj,
    portalId,
    sessionStart,
    sessionEnd,
    sessionMode: mode,
    panel: collapse(panel).slice(0, 120),
    panelMembers: [],
    sequential,
    location: mode === 'VIRTUAL_ASSINCRONA' ? 'Sessão virtual assíncrona' : '',
    courtUnit: '',
    subject: '',
    status,
    event: normalized.slice(0, 500),
    href: String(href || '')
  };
}

/** Extrai sessões de uma lista de linhas ({ text, href }). */
export function parsePjePautaRows(rows = [], { portalId = '' } = {}) {
  const seen = new Set();
  const sessions = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const session = parsePjePautaRow(row?.text, { portalId, href: row?.href });
    if (!session) continue;
    const key = `${session.cnj}|${session.sessionStart}|${session.sessionMode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sessions.push(session);
  }
  return sessions;
}

async function readPanelText(page) {
  return page.evaluate((id) => document.getElementById(id)?.innerText || '', PANEL_ID).catch(() => '');
}

/**
 * Abre a aba e aguarda o painel carregar. RichFaces responde por AJAX, então o texto
 * é observado até ficar estável (ou até aparecer o aviso de lista vazia).
 */
export async function openPjePautaTab(page, { timeoutMs = 45_000 } = {}) {
  const tab = page.locator(`#${TAB_ID}_lbl`).first();
  if (!(await tab.count())) return { discovered: false, opened: false };
  const box = await tab.boundingBox().catch(() => null);
  if (box && box.width > 0) {
    await page.mouse.click(box.x + Math.min(24, box.width / 2), box.y + box.height / 2);
  } else {
    await page.locator(`#${TAB_ID}_shifted`).first().click({ timeout: 10_000 }).catch(() => {});
  }
  const started = Date.now();
  let previous = '';
  let stable = 0;
  while (Date.now() - started < timeoutMs) {
    await page.waitForTimeout(1_000);
    const text = collapse(await readPanelText(page));
    if (isPjePautaEmpty(text)) return { discovered: true, opened: true };
    if (text && text === previous) {
      stable += 1;
      if (stable >= 2) return { discovered: true, opened: true };
    } else {
      stable = 0;
      previous = text;
    }
  }
  return { discovered: true, opened: true };
}

/** Lê as linhas da tabela de pauta (texto + link quando houver). */
export async function readPjePautaRows(page) {
  return page.evaluate((id) => {
    const panel = document.getElementById(id);
    if (!panel) return [];
    const rows = [];
    const seen = new Set();
    for (const tr of panel.querySelectorAll('tbody tr')) {
      const text = (tr.innerText || '').replace(/\s+/g, ' ').trim();
      if (!/\d{7}-\d{2}\.\d{4}/.test(text) || seen.has(text)) continue;
      seen.add(text);
      const link = tr.querySelector('a[href]');
      rows.push({ text, href: link?.getAttribute('href') || '' });
    }
    if (rows.length) return rows;
    for (const anchor of panel.querySelectorAll('a[href]')) {
      const text = (anchor.innerText || anchor.textContent || '').replace(/\s+/g, ' ').trim();
      if (!/\d{7}-\d{2}\.\d{4}/.test(text) || seen.has(text)) continue;
      seen.add(text);
      rows.push({ text, href: anchor.getAttribute('href') || '' });
    }
    return rows;
  }, PANEL_ID).catch(() => []);
}

/**
 * Coleta completa da pauta. Retorna sessões e o estado da coleta, sem criar nada.
 */
export async function collectPjePautaSessions(page, portal = {}, { timeoutMs = 45_000 } = {}) {
  const portalId = String(portal?.id || '');
  const result = { sessions: [], collectionStatus: { discovered: false, collected: false }, pages: 0, errors: [] };
  try {
    const opened = await openPjePautaTab(page, { timeoutMs });
    result.collectionStatus.discovered = opened.discovered === true;
    if (!opened.discovered) return result;

    const text = collapse(await readPanelText(page));
    if (isPjePautaEmpty(text)) {
      result.collectionStatus.collected = true;
      return result;
    }

    const rows = await readPjePautaRows(page);
    result.sessions = parsePjePautaRows(rows, { portalId });
    result.pages = rows.length ? 1 : 0;
    result.collectionStatus.collected = rows.length > 0 || text.length > 0;
    if (!rows.length) result.errors.push({ scope: 'pauta', error: 'Aba de pauta sem linhas reconhecíveis.' });
  } catch (error) {
    result.errors.push({ scope: 'pauta', error: String(error?.message || error).slice(0, 200) });
  }
  return result;
}
