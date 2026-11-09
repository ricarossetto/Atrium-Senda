/**
 * ATRIUM — Parser de Sessões de Julgamento do eproc (2º grau).
 *
 * Fonte: página "Processos em pauta" (`acao=intimacao_de_pauta_listar`), aberta pelo
 * link "Sessões de Julgamento" do Painel do Advogado.
 *
 * Extrai, por linha: processo, juízo, colegiado, assunto, evento, modalidade,
 * início e fim da sessão (a sessão virtual assíncrona tem período), sequencial,
 * composição prevista e sala/local.
 *
 * Somente leitura: nada aqui cria prazo, tarefa ou ato processual.
 */

const CNJ_RE = /\b(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\b/;
const DATE_TIME = '(\\d{2})\\/(\\d{2})\\/(\\d{4})\\s+(\\d{2}:\\d{2})(?::\\d{2})?';
const PERIOD_RE = new RegExp(`Per[ií]odo da sess[aã]o\\s*:\\s*${DATE_TIME}\\s*(?:a|at[eé]|-)\\s*${DATE_TIME}`, 'i');
const SINGLE_RE = new RegExp(`Data da sess[aã]o\\s*:\\s*${DATE_TIME}`, 'i');

function cleanText(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function isoFromParts(day, month, year, time) {
  return `${year}-${month}-${day}T${time.length === 5 ? `${time}:00` : time}`;
}

function matchToIso(match, offset) {
  if (!match) return '';
  const [day, month, year, time] = match.slice(offset, offset + 4);
  return isoFromParts(day, month, year, time);
}

function headerIndex(headers, patterns, fallback) {
  for (let index = 0; index < headers.length; index += 1) {
    if (patterns.some(pattern => pattern.test(headers[index]))) return index;
  }
  return fallback;
}

export function parseEprocSessions(html, { portalId = 'eproc-generic' } = {}) {
  if (!html || typeof html !== 'string') return [];
  const sessions = [];

  const headers = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(match => cleanText(match[1]));
  const col = {
    process: headerIndex(headers, [/processo/i], 0),
    subject: headerIndex(headers, [/assunto/i], 1),
    event: headerIndex(headers, [/evento/i], 2),
    date: headerIndex(headers, [/data\s*sess/i], 3),
    sequential: headerIndex(headers, [/sequencial/i], 4),
    panel: headerIndex(headers, [/composi/i], 5)
  };

  for (const row of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []) {
    if (/<th/i.test(row) && !/<td/i.test(row)) continue;
    const cnjMatch = row.match(CNJ_RE);
    if (!cnjMatch) continue;

    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || []).map(cleanText);
    if (cells.length < 3) continue;
    const rowText = cleanText(row);

    const processNumber = cnjMatch[1];
    const cnj = processNumber.replace(/\D/g, '');
    const processCell = cells[col.process] || cells.find(cell => CNJ_RE.test(cell)) || '';
    const eventCell = cells[col.event] || cells.find(cell => /sess[aã]o/i.test(cell)) || '';
    const dateCell = cells[col.date] || cells.find(cell => /\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/.test(cell)) || '';
    const panelCell = cells[col.panel] || '';
    const subjectCell = cells[col.subject] || '';

    const period = PERIOD_RE.exec(eventCell) || PERIOD_RE.exec(dateCell) || PERIOD_RE.exec(rowText);
    const single = SINGLE_RE.exec(eventCell) || SINGLE_RE.exec(rowText);
    const dateCellRange = new RegExp(`^${DATE_TIME}\\s*(?:a|at[eé]|-)\\s*${DATE_TIME}$`, 'i').exec(dateCell.trim());

    let sessionStart = '';
    let sessionEnd = '';
    if (period) {
      sessionStart = matchToIso(period, 1);
      sessionEnd = matchToIso(period, 5);
    } else if (single) {
      sessionStart = matchToIso(single, 1);
    } else if (dateCellRange) {
      sessionStart = matchToIso(dateCellRange, 1);
      sessionEnd = matchToIso(dateCellRange, 5);
    } else {
      const generic = new RegExp(DATE_TIME, 'i').exec(dateCell) || new RegExp(DATE_TIME, 'i').exec(rowText);
      if (generic) sessionStart = matchToIso(generic, 1);
    }
    if (!sessionStart) continue;

    const modeText = `${eventCell} ${rowText}`;
    let sessionMode = 'PRESENCIAL';
    if (/virtual\s+ass[ií]ncr/i.test(modeText)) sessionMode = 'VIRTUAL_ASSINCRONA';
    else if (/h[ií]brida/i.test(modeText)) sessionMode = 'HÍBRIDA';
    else if (/telepresencial|videoconfer|virtual/i.test(modeText)) sessionMode = 'VIRTUAL';

    let status = 'DESIGNADA';
    if (/cancelada/i.test(modeText)) status = 'CANCELADA';
    else if (/redesignada/i.test(modeText)) status = 'REDESIGNADA';
    else if (/suspensa/i.test(modeText)) status = 'SUSPENSA';
    else if (/realizada/i.test(modeText)) status = 'REALIZADA';

    const courtUnit = /Ju[ií]zo\s*:\s*([A-Z0-9][A-Z0-9.\-/]{0,20})/i.exec(processCell)?.[1] || '';
    const panel = /Colegiado\s*:\s*(.+?(?:C[aâ]mara[^0-9]{0,24}(?:C[ií]vel|Criminal)|Turma[^0-9]{0,24}|Se[cç][aã]o[^0-9]{0,24}|Grupo[^0-9]{0,24}|Plen[aá]rio|[ÓO]rg[aã]o Especial))/i.exec(processCell)?.[1]?.trim() || '';
    const sequential = (cells[col.sequential] || '').match(/\d{1,6}/)?.[0] || /Sequencial\s*:\s*(\d{1,6})/i.exec(eventCell)?.[1] || '';
    const location = /Data da sess[aã]o\s*:\s*[^-]+-\s*(.+?)(?:Sequencial\s*:|$)/i.exec(eventCell)?.[1]?.trim()?.slice(0, 160) || '';
    const panelMembers = panelCell
      .split(/(?=[A-ZÀ-Ý]{2,}(?:\s+[A-ZÀ-Ý]{2,}){0,5}\s*\([A-Z]{2,6}\))/)
      .map(name => name.trim())
      .filter(name => name.length >= 5)
      .slice(0, 12);

    sessions.push({
      processNumber,
      cnj,
      portalId,
      courtUnit,
      panel,
      subject: subjectCell.slice(0, 120),
      event: eventCell.slice(0, 600),
      sessionMode,
      sessionStart,
      sessionEnd,
      sequential,
      panelMembers,
      location,
      status
    });
  }

  return sessions;
}

/** Reconhece a página de pauta mesmo quando não há linha (para confirmar ausência). */
export function isEprocSessionsPage(html) {
  const text = String(html || '');
  return /Processos em pauta|Lista de Processos em Pauta|Data Sess[aã]o/i.test(text);
}
