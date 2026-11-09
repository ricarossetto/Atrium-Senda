/**
 * ATRIUM Sovereign Judicial Connectivity — Eproc Movements & Events Parser
 *
 * Generic, zero-DOM-dependency HTML parser for process movement timeline
 * across the eproc family.
 */

const DATE_TIME_REGEX = /(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/;

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

function parseBrDateToIso(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(DATE_TIME_REGEX);
  if (!m) return null;
  const [_, day, month, year, hours = '12', minutes = '00', seconds = '00'] = m;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}.000Z`;
}

export function parseEprocMovements(html) {
  if (!html || typeof html !== 'string') return [];
  const movements = [];

  // Target table#tblEventos if present (standard eproc events table)
  const tblMatch = html.match(/<table[^>]+id=["']tblEventos["'][^>]*>([\s\S]*?)<\/table>/i);
  const targetHtml = tblMatch ? tblMatch[1] : html;

  const trMatches = targetHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

  // Check header row for column mapping
  let colDocsIdx = -1;
  let colUserIdx = -1;
  const headerRowMatch = targetHtml.match(/<tr[^>]*>[\s\S]*?<th[\s\S]*?<\/tr>/i);
  if (headerRowMatch) {
    const thCells = (headerRowMatch[0].match(/<th[^>]*>[\s\S]*?<\/th>/gi) || []).map(cleanText);
    thCells.forEach((h, idx) => {
      if (/Documento/i.test(h)) colDocsIdx = idx;
      else if (/Usu[aá]rio/i.test(h)) colUserIdx = idx;
    });
  }

  for (const tr of trMatches) {
    if (tr.includes('<th') && !tr.includes('<td')) continue;

    const rawCells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
    if (rawCells.length < 3) continue;

    const cells = rawCells.map(cleanText);

    // First cell sequence number: e.g. "18", "18&nbsp;"
    const seqMatch = cells[0].match(/^\d+/);
    if (!seqMatch) continue;

    const sequence = Number(seqMatch[0]);
    const rawDate = cells[1] || '';
    const occurredAt = parseBrDateToIso(rawDate);

    // Clean inline tooltip scripts and handlers from description
    const descRaw = rawCells[2]
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/if\s*\(window\.carregarTooltip[\s\S]*?}\s*}\s*}/gi, '');
    const description = cleanText(descRaw);

    const user = colUserIdx > -1 ? (cells[colUserIdx] || '') : (cells.length > 4 ? cells[3] : '');

    // Extract any document links attached to this event row
    const docLinks = [];
    const aMatches = tr.match(/<a[^>]+href=[\"']([^\"']*(?:documento|anexo|download|processo_documento|acessar_documento)[^\"']*)[\"'][^>]*>([\s\S]*?)<\/a>/gi) || [];
    for (const aTag of aMatches) {
      const hrefMatch = aTag.match(/href=[\"']([^\"']+)[\"']/i);
      const textMatch = aTag.match(/>([^<]+)</);
      if (hrefMatch) {
        docLinks.push({
          url: hrefMatch[1].replace(/&amp;/g, '&'),
          title: cleanText(textMatch ? textMatch[1] : 'Documento')
        });
      }
    }

    // If no anchor matches but a document column exists with text codes (e.g. INIC1, DEC2)
    if (docLinks.length === 0 && colDocsIdx > -1 && cells[colDocsIdx]) {
      const docCode = cells[colDocsIdx].trim();
      if (docCode && docCode.length <= 30 && !/nenhum/i.test(docCode)) {
        docLinks.push({
          url: null,
          title: docCode
        });
      }
    }

    movements.push({
      sequence,
      rawDate,
      occurredAt,
      description,
      user,
      documents: docLinks
    });
  }

  return movements.sort((a, b) => b.sequence - a.sequence);
}
