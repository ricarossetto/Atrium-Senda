/**
 * ATRIUM Sovereign Judicial Connectivity — Eproc Spreadsheet Importer (XLS / BIFF8)
 *
 * Implements the Spreadsheet-First ingestion pipeline for official eproc reports:
 * - Relatório de Processos (full collection inventory)
 * - Processos com Prazo em Aberto (official deadline spreadsheet)
 *
 * Refinements:
 * - Validates OLE/BIFF8 file signature (d0cf11e0a1b11ae1) and content bounds.
 * - Normalized, accent-insensitive header mapping.
 * - Robust composite fingerprint for deadlines: portal + CNJ + eventId/communicationId + startDate + dueDate.
 * - Explicit provenance: EPROC_PANEL (never overwrites or silently merges DJEN).
 * - Reuses SheetJS (xlsx) for zero-network binary OLE/BIFF decoding.
 */

import { createHash } from 'node:crypto';
import * as xlsxModule from 'xlsx';
const XLSX = xlsxModule.default || xlsxModule;

export { downloadEprocSpreadsheet, compareSpreadsheetArtifacts } from './spreadsheet-downloader.mjs';

const CNJ_FORMATTED_REGEX = /\b(\d{7,8}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\b/;
const OLE_HEADER_HEX = 'd0cf11e0a1b11ae1';

function cleanStr(val) {
  return String(val || '').trim().replace(/\s+/g, ' ');
}

function normalizeHeaderStr(val) {
  return cleanStr(val)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseBrazilianDateToIso(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const m = dateStr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, day, month, year, hour = '00', min = '00', sec = '00'] = m;
  return `${year}-${month}-${day}T${hour}:${min}:${sec}.000Z`;
}

/**
 * Validates that a buffer is a genuine Microsoft Compound File / BIFF8 (.xls)
 *
 * @param {Buffer|Uint8Array} buffer
 * @returns {boolean}
 */
export function isValidEprocXlsBuffer(buffer) {
  if (!buffer || buffer.length < 512) return false;
  const headerHex = Buffer.from(buffer.subarray(0, 8)).toString('hex');
  return headerHex === OLE_HEADER_HEX;
}

/**
 * Parses official Relatório de Processos XLS into canonical process list.
 *
 * @param {Buffer|Uint8Array} buffer XLS file buffer
 * @param {Object} [options]
 * @param {string} [options.portalId]
 * @returns {Array<Object>} List of canonical process records
 */
export function parseEprocProcessReportXls(buffer, options = {}) {
  if (!buffer) return [];
  if (!isValidEprocXlsBuffer(buffer)) {
    throw new Error('Arquivo XLS inválido: assinatura OLE/BIFF8 (d0cf11e0a1b11ae1) ausente.');
  }

  const portalId = options.portalId || 'eproc-generic';

  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Locate the header row dynamically (must have >= 4 non-empty cells)
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(matrix.length, 10); r++) {
    const nonEmpty = matrix[r].filter(c => String(c).trim() !== '');
    if (nonEmpty.length < 4) continue;
    const rowStr = nonEmpty.map(c => normalizeHeaderStr(c)).join(' ');
    if (rowStr.includes('processo') && (rowStr.includes('classe') || rowStr.includes('evento') || rowStr.includes('autor'))) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx === -1) {
    const hasDataRows = matrix.slice(0, 30).some(row => (row || []).filter(cell => String(cell).trim() !== '').length >= 2);
    if (hasDataRows) {
      throw Object.assign(new Error('Cabeçalho do Relatório de Processos não reconhecido no XLS oficial.'), {
        code: 'EPROC_REPORT_HEADER_NOT_FOUND'
      });
    }
    return [];
  }

  const headers = matrix[headerRowIdx].map(h => normalizeHeaderStr(h));

  const colMap = {
    number: headers.findIndex(h => h.includes('numero') || h === 'processo'),
    actionClass: headers.findIndex(h => h.includes('classe')),
    plaintiff: headers.findIndex(h => h.includes('autor') || h.includes('polo ativo')),
    defendant: headers.findIndex(h => h.includes('reu') || h.includes('polo passivo')),
    location: headers.findIndex(h => h.includes('localidade') || h.includes('comarca') || h.includes('juizo')),
    subject: headers.findIndex(h => h.includes('assunto')),
    lastEvent: headers.findIndex(h => h.includes('ultimo evento')),
    lastEventDate: headers.findIndex(h => h.includes('data/hora') || h.includes('data evento')),
    distributionDate: headers.findIndex(h => h.includes('distribuicao') || h.includes('autuacao')),
    caseValue: headers.findIndex(h => h.includes('valor'))
  };

  const processes = [];

  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.length === 0) continue;

    const rawNumberCell = cleanStr(row[colMap.number >= 0 ? colMap.number : 0]);
    if (!rawNumberCell) continue;

    const cnjMatch = rawNumberCell.match(CNJ_FORMATTED_REGEX);
    if (!cnjMatch) continue;
    const formattedNumber = cnjMatch[1];
    const cleanCnj = formattedNumber.replace(/\D/g, '');

    // Extract unit if in cell text e.g. "5000001-00... (IJI1JE1J)"
    let judicialUnit = '';
    const unitMatch = rawNumberCell.match(/\(([A-Za-z0-9]+)\)/);
    if (unitMatch) judicialUnit = unitMatch[1];

    // Check cell hyperlink for public URL and canonical clean CNJ
    let publicUrl = '';
    const cellKey = XLSX.utils.encode_cell({ r, c: colMap.number >= 0 ? colMap.number : 0 });
    const cellObj = ws[cellKey];
    if (cellObj && cellObj.l && cellObj.l.Target) {
      publicUrl = cellObj.l.Target;
    }

    let rawLastEventDate = cleanStr(row[colMap.lastEventDate]);
    if (typeof row[colMap.lastEventDate] === 'number') {
      rawLastEventDate = XLSX.SSF.format('dd/mm/yyyy hh:mm:ss', row[colMap.lastEventDate]);
    }

    let rawDistributionDate = cleanStr(row[colMap.distributionDate]);
    if (typeof row[colMap.distributionDate] === 'number') {
      rawDistributionDate = XLSX.SSF.format('dd/mm/yyyy hh:mm:ss', row[colMap.distributionDate]);
    }

    let rawCaseValue = cleanStr(row[colMap.caseValue]);
    if (typeof row[colMap.caseValue] === 'number') {
      rawCaseValue = `R$ ${Number(row[colMap.caseValue]).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    }

    processes.push({
      cnj: cleanCnj,
      number: formattedNumber,
      judicialUnit,
      actionClass: cleanStr(row[colMap.actionClass]),
      plaintiff: cleanStr(row[colMap.plaintiff]),
      defendant: cleanStr(row[colMap.defendant]),
      courtLocation: cleanStr(row[colMap.location]),
      subject: cleanStr(row[colMap.subject]),
      lastEvent: cleanStr(row[colMap.lastEvent]),
      rawLastEventDate,
      lastEventAt: parseBrazilianDateToIso(rawLastEventDate),
      rawDistributionDate,
      distributionAt: parseBrazilianDateToIso(rawDistributionDate),
      caseValue: rawCaseValue,
      publicUrl,
      portalId,
      provenance: 'EPROC_REPORT_XLS'
    });
  }

  return processes;
}

/**
 * Parses official Processos com Prazo em Aberto XLS into canonical deadlines.
 *
 * @param {Buffer|Uint8Array} buffer XLS file buffer
 * @param {Object} [options]
 * @param {string} [options.portalId]
 * @returns {Array<Object>} List of canonical deadline records
 */
export function parseEprocDeadlinesXls(buffer, options = {}) {
  if (!buffer) return [];
  if (!isValidEprocXlsBuffer(buffer)) {
    throw new Error('Arquivo XLS inválido: assinatura OLE/BIFF8 (d0cf11e0a1b11ae1) ausente.');
  }

  const portalId = options.portalId || 'eproc-generic';

  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Locate the header row dynamically (must have >= 4 non-empty cells)
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(matrix.length, 10); r++) {
    const nonEmpty = matrix[r].filter(c => String(c).trim() !== '');
    if (nonEmpty.length < 4) continue;
    const rowStr = nonEmpty.map(c => normalizeHeaderStr(c)).join(' ');
    if (rowStr.includes('processo') && (rowStr.includes('prazo') || rowStr.includes('evento') || rowStr.includes('partes') || rowStr.includes('orgao'))) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx === -1) {
    const hasDataRows = matrix.slice(0, 30).some(row => (row || []).filter(cell => String(cell).trim() !== '').length >= 2);
    if (hasDataRows) {
      throw Object.assign(new Error('Cabeçalho de prazos não reconhecido no XLS oficial.'), {
        code: 'EPROC_REPORT_HEADER_NOT_FOUND'
      });
    }
    return [];
  }

  const headers = matrix[headerRowIdx].map(h => normalizeHeaderStr(h));

  const colMap = {
    number: headers.findIndex(h => h === 'processo' || h.includes('numero')),
    courtUnit: headers.findIndex(h => h.includes('orgao') || h.includes('juizo')),
    parties: headers.findIndex(h => h.includes('partes') && !h.includes('doc')),
    partiesDoc: headers.findIndex(h => h.includes('doc')),
    actionClass: headers.findIndex(h => h.includes('classe')),
    subject: headers.findIndex(h => h.includes('assunto')),
    eventAndDays: headers.findIndex(h => h.includes('evento e prazo') || h.includes('evento')),
    dispatchDate: headers.findIndex(h => h.includes('envio')),
    startDate: headers.findIndex(h => h.includes('inicio')),
    finalDate: headers.findIndex(h => h.includes('final') || h.includes('fim'))
  };

  const deadlines = [];

  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.length === 0) continue;

    const rawNumberCell = cleanStr(row[colMap.number >= 0 ? colMap.number : 0]);
    if (!rawNumberCell) continue;

    const cnjMatch = rawNumberCell.match(CNJ_FORMATTED_REGEX);
    if (!cnjMatch) continue;
    const formattedNumber = cnjMatch[1];
    const cleanCnj = formattedNumber.replace(/\D/g, '');

    let rawStartDate = cleanStr(row[colMap.startDate]);
    if (typeof row[colMap.startDate] === 'number') {
      rawStartDate = XLSX.SSF.format('dd/mm/yyyy hh:mm:ss', row[colMap.startDate]);
    }

    let rawFinalDate = cleanStr(row[colMap.finalDate]);
    if (typeof row[colMap.finalDate] === 'number') {
      rawFinalDate = XLSX.SSF.format('dd/mm/yyyy hh:mm:ss', row[colMap.finalDate]);
    }

    let rawDispatchDate = cleanStr(row[colMap.dispatchDate]);
    if (typeof row[colMap.dispatchDate] === 'number') {
      rawDispatchDate = XLSX.SSF.format('dd/mm/yyyy hh:mm:ss', row[colMap.dispatchDate]);
    }

    const eventAndDays = cleanStr(row[colMap.eventAndDays]);

    // Extract days if available e.g. "10 dias"
    const daysMatch = eventAndDays.match(/\b(\d+)\s*dias\b/i);
    const durationDays = daysMatch ? parseInt(daysMatch[1], 10) : null;

    // Extract explicit sourceRecord / event / communication ID if present
    const eventIdMatch = eventAndDays.match(/(?:evento|comunicacao|intimacao|citacao|seq|id)?\s*#?\s*(\d{1,8})\b/i);
    const sourceRecordId = eventIdMatch ? eventIdMatch[1] : null;
    const communicationId = sourceRecordId || createHash('sha256').update(eventAndDays).digest('hex').substring(0, 12);
    const fingerprintStrategy = sourceRecordId ? 'EXPLICIT_SOURCE_RECORD_ID' : 'TEXTUAL_HASH_FALLBACK';

    // Preferred composite fingerprint: portal + CNJ + sourceRecordId/communicationId + startDate + dueDate
    const fingerprint = `${portalId}:${cleanCnj}:${communicationId}:${rawStartDate}:${rawFinalDate}`.toLowerCase();

    deadlines.push({
      fingerprint,
      fingerprintStrategy,
      communicationId,
      sourceRecordId,
      cnj: cleanCnj,
      number: formattedNumber,
      judicialUnit: cleanStr(row[colMap.courtUnit]),
      parties: cleanStr(row[colMap.parties]),
      partiesDocument: cleanStr(row[colMap.partiesDoc]),
      actionClass: cleanStr(row[colMap.actionClass]),
      subject: cleanStr(row[colMap.subject]),
      eventDescription: eventAndDays,
      durationDays,
      rawDispatchDate,
      dispatchAt: parseBrazilianDateToIso(rawDispatchDate),
      rawStartDate,
      startAt: parseBrazilianDateToIso(rawStartDate),
      rawFinalDate,
      finalAt: parseBrazilianDateToIso(rawFinalDate),
      portalId,
      provenance: 'EPROC_PANEL',
      status: 'OPEN',
      possiblyRelatedTo: []
    });
  }

  return deadlines;
}

/**
 * Non-destructively links an eproc deadline with a DJEN/DataJud record
 * preserving independent provenance without overwriting or merging.
 *
 * @param {Object} eprocDeadline
 * @param {Object} otherRecord (e.g. DJEN intimation or DataJud event)
 * @param {Object} [options]
 * @returns {Object} Enriched eproc deadline with related reference
 */
export function relateDeadlinesSemantic(eprocDeadline, otherRecord, options = {}) {
  if (!eprocDeadline || !otherRecord) return eprocDeadline;

  const relation = {
    provenance: otherRecord.provenance || 'EXTERNAL',
    identifier: otherRecord.fingerprint || otherRecord.id || otherRecord.communicationId || 'unknown',
    sourceRecordId: otherRecord.sourceRecordId || otherRecord.communicationId || null,
    reason: options.reason || 'SAME_PROCESS_AND_TIMEFRAME',
    linkedAt: new Date().toISOString()
  };

  const existing = Array.isArray(eprocDeadline.possiblyRelatedTo) ? [...eprocDeadline.possiblyRelatedTo] : [];
  if (!existing.some(r => r.provenance === relation.provenance && r.identifier === relation.identifier)) {
    existing.push(relation);
  }

  return {
    ...eprocDeadline,
    possiblyRelatedTo: existing
  };
}
