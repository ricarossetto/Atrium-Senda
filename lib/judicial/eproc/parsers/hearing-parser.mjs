/**
 * ATRIUM Sovereign Judicial Connectivity — Eproc Hearing Parser
 *
 * Zero-DOM-dependency HTML parser for eproc Hearing listings (acao=audiencia_listar
 * and acao=audiencia_conciliacao_listar).
 * Extracts verified structured hearing records without textual guesswork.
 */

const CNJ_REGEX = /\b(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\b/;
const DATE_TIME_REGEX = /(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}(?::\d{2})?)/;

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
 * Parses official hearing records from eproc hearing tables.
 *
 * @param {string} html HTML of the hearing list page
 * @param {Object} [options]
 * @param {string} [options.portalId]
 * @returns {Array<Object>} Array of structured hearing records
 */
export function parseEprocHearings(html, { portalId = 'eproc-generic' } = {}) {
  if (!html || typeof html !== 'string') return [];
  const hearings = [];

  let colMap = {
    processIdx: 0,
    dateTimeIdx: 1,
    typeIdx: 2,
    statusIdx: 3,
    modalityIdx: 4,
    unitIdx: 5,
    notesIdx: 6
  };

  const thMatches = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)];
  if (thMatches.length >= 4) {
    thMatches.forEach((m, idx) => {
      const header = cleanText(m[1]);
      if (/processo/i.test(header)) colMap.processIdx = idx;
      else if (/data|hora/i.test(header)) colMap.dateTimeIdx = idx;
      else if (/tipo/i.test(header)) colMap.typeIdx = idx;
      else if (/situa[cç][aã]o|status/i.test(header)) colMap.statusIdx = idx;
      else if (/local|modalidade/i.test(header)) colMap.modalityIdx = idx;
      else if (/[oó]rg[aã]o|ju[ií]zo|unidade|vara/i.test(header)) colMap.unitIdx = idx;
      else if (/observa[cç][oõ]es|obs/i.test(header)) colMap.notesIdx = idx;
    });
  }

  const trMatches = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

  for (const tr of trMatches) {
    const cnjMatch = tr.match(CNJ_REGEX);
    if (!cnjMatch) continue;
    if (tr.includes('<th') && !tr.includes('<td')) continue;

    const cells = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || []).map(cleanText);
    if (cells.length < 3) continue;

    const rowText = cleanText(tr);
    const dtMatch = rowText.match(DATE_TIME_REGEX);

    const processNumber = cnjMatch[1];
    const cnj = processNumber.replace(/\D/g, '');

    const hearingDate = dtMatch ? dtMatch[1] : '';
    const hearingTime = dtMatch ? dtMatch[2] : '';
    let scheduledAt = null;
    if (hearingDate && hearingTime) {
      const [d, m, y] = hearingDate.split('/');
      scheduledAt = `${y}-${m}-${d}T${hearingTime.length === 5 ? hearingTime + ':00' : hearingTime}`;
    }

    // Determine hearing type
    let hearingType = 'GERAL';
    if (/concilia[cç][aã]o/i.test(rowText)) hearingType = 'CONCILIAÇÃO';
    else if (/instru[cç][aã]o/i.test(rowText)) hearingType = 'INSTRUÇÃO E JULGAMENTO';
    else if (/justifica[cç][aã]o/i.test(rowText)) hearingType = 'JUSTIFICAÇÃO';
    else if (/pericial|per[ií]cia/i.test(rowText)) hearingType = 'PERICIAL';
    else if (/inicial/i.test(rowText)) hearingType = 'INICIAL';

    // Determine status
    let status = 'DESIGNADA';
    if (/cancelada/i.test(rowText)) status = 'CANCELADA';
    else if (/realizada/i.test(rowText)) status = 'REALIZADA';
    else if (/redesignada/i.test(rowText)) status = 'REDESIGNADA';
    else if (/suspensa/i.test(rowText)) status = 'SUSPENSA';

    // Determine modality
    let modality = 'PRESENCIAL';
    if (/telepresencial|videoconfer[eê]ncia|zoom|teams|virtual|online/i.test(rowText)) {
      modality = 'TELEPRESENCIAL';
    } else if (/h[ií]brida/i.test(rowText)) {
      modality = 'HÍBRIDA';
    }

    // Extract judicial unit and room/notes
    const judicialUnit = cells[colMap.unitIdx] || cells.find(c => /vara|ju[ií]zo|gabinete|turma/i.test(c)) || '';
    const notes = cells[colMap.notesIdx] || (cells.length > 5 ? cells[cells.length - 1] : '');

    hearings.push({
      processNumber,
      cnj,
      portalId,
      hearingDate,
      hearingTime,
      scheduledAt,
      hearingType,
      status,
      modality,
      judicialUnit,
      notes
    });
  }

  return hearings;
}
