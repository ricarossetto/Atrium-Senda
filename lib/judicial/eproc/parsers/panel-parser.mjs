/**
 * ATRIUM Sovereign Judicial Connectivity — Eproc Panel & Deadlines Parser
 *
 * Generic, zero-DOM-dependency HTML parser for Painel do Advogado (1G and 2G)
 * and Deadline/Intimation tables across the eproc family.
 */

const CNJ_REGEX = /\b(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\b/;
const DATE_REGEX = /(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/g;

function cleanText(value) {
  return String(value || '')
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

/**
 * Extracts process rows from eproc lawyer panel report tables
 */
export function parseEprocPanelProcesses(html) {
  if (!html || typeof html !== 'string') return [];
  const rows = [];

  // Match table headers if available to dynamically map column indices
  let colMap = {
    numberIdx: 1,
    classIdx: 2,
    plaintiffIdx: 3,
    defendantIdx: 4,
    locationIdx: 5,
    subjectIdx: 6,
    lastEventIdx: 7,
    lastEventDateIdx: 8,
    filedDateIdx: 9,
    caseValueIdx: 10
  };

  const tableMatch = html.match(/<table[^>]+(?:summary=["']Processos["']|class=["'][^"']*infraTable[^"']*["'])[^>]*>([\s\S]*?)<\/table>/i);
  const searchArea = tableMatch ? tableMatch[1] : html;
  const thMatches = [...searchArea.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)];
  if (thMatches.length >= 5) {
    thMatches.forEach((m, idx) => {
      const header = cleanText(m[1]);
      if (/Classe\s*\/\s*Assunto/i.test(header)) {
        colMap.classIdx = idx;
        colMap.subjectIdx = idx;
      } else if (/Classe/i.test(header)) colMap.classIdx = idx;
      else if (/Autor|Polo Ativo|Exequente|Requerente/i.test(header)) colMap.plaintiffIdx = idx;
      else if (/R[eé]u|Polo Passivo|Executado|Requerido/i.test(header)) colMap.defendantIdx = idx;
      else if (/[OÓ]rg[aã]o|Ju[ií]zo|Localiza[cç][aã]o|Localidade|Vara/i.test(header)) colMap.locationIdx = idx;
      else if (/Assunto/i.test(header)) colMap.subjectIdx = idx;
      else if (/[UÚ]ltimo\s*Evento/i.test(header)) colMap.lastEventIdx = idx;
      else if (/Data.*(?:Ult|Evento)/i.test(header)) colMap.lastEventDateIdx = idx;
      else if (/Distribui[cç][aã]o|Autua[cç][aã]o/i.test(header)) colMap.filedDateIdx = idx;
      else if (/Valor/i.test(header)) colMap.caseValueIdx = idx;
    });
  }

  // Match table rows
  const trMatches = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

  for (const tr of trMatches) {
    const cnjMatch = tr.match(CNJ_REGEX);
    if (!cnjMatch) continue;

    // Must be a data row, not a header
    if (tr.includes('<th') && !tr.includes('<td')) continue;

    const cells = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || []).map(cleanText);
    if (cells.length < 3) continue;

    const linkMatch = tr.match(/href=[\"']([^\"']*(?:processo_selecionar|processo_seleciona_publica|processo_detalhes|processo_consulta)[^\"']*)[\"']/i);
    const selectHref = linkMatch ? linkMatch[1].replace(/&amp;/g, '&') : null;

    const processNumber = cnjMatch[1];
    const actionClass = cells[colMap.classIdx] || '';
    const plaintiff = cells[colMap.plaintiffIdx] || '';
    const defendant = cells[colMap.defendantIdx] || '';
    const courtLocation = cells[colMap.locationIdx] || '';
    const subject = cells[colMap.subjectIdx] || '';
    const lastEvent = cells[colMap.lastEventIdx] || '';
    const lastEventDate = cells[colMap.lastEventDateIdx] || '';
    const filedDate = cells[colMap.filedDateIdx] || '';
    const caseValue = cells[colMap.caseValueIdx] || '';

    rows.push({
      number: processNumber,
      cnj: processNumber.replace(/\D/g, ''),
      actionClass,
      plaintiff,
      defendant,
      courtLocation,
      subject,
      lastEvent,
      lastEventDate,
      filedDate,
      caseValue,
      selectHref
    });
  }

  return rows;
}

/**
 * Extracts deadlines and pending intimations from eproc deadline tables
 */
export function parseEprocDeadlines(html, { kind = 'deadline' } = {}) {
  if (!html || typeof html !== 'string') return [];
  const items = [];

  const trMatches = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

  for (const tr of trMatches) {
    const cnjMatch = tr.match(CNJ_REGEX);
    if (!cnjMatch) continue;
    if (tr.includes('<th') && !tr.includes('<td')) continue;

    const cells = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || []).map(cleanText);
    const rowClean = cleanText(tr);
    const dates = rowClean.match(DATE_REGEX) || [];

    const rawDeadline = dates[dates.length - 1] || '';
    const rawSent = dates[0] || '';
    const rawStarts = dates[1] || dates[0] || '';

    items.push({
      kind,
      processNumber: cnjMatch[1],
      cnj: cnjMatch[1].replace(/\D/g, ''),
      className: cells[2] || cells[1] || '',
      subject: cells[3] || '',
      event: cells[4] || (kind === 'intimation' ? 'Intimação pendente' : 'Prazo em aberto'),
      sentAt: rawSent,
      startsAt: rawStarts,
      deadlineAt: rawDeadline
    });
  }

  return items;
}

/**
 * Extracts pagination metadata from eproc select#selInfraPaginacaoSuperior
 */
export function parseEprocPagination(html) {
  if (!html || typeof html !== 'string') return { totalPages: 1, options: [] };

  const selectMatch = html.match(/<select[^>]+(?:id|name)=[\"']selInfraPaginacaoSuperior[\"'][^>]*>([\s\S]*?)<\/select>/i);
  if (!selectMatch) return { totalPages: 1, options: [] };

  const optionMatches = selectMatch[1].match(/<option[^>]+value=[\"']([^\"']+)[\"'][^>]*>([^<]+)<\/option>/gi) || [];
  const options = optionMatches.map(opt => {
    const m = opt.match(/value=[\"']([^\"']+)[\"'][^>]*>([^<]+)<\/option>/i);
    return m ? { value: m[1], label: m[2].trim() } : null;
  }).filter(Boolean);

  return {
    totalPages: Math.max(1, options.length),
    options
  };
}
