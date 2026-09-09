import { createHash } from 'node:crypto';
import { createDeterministicTextPdf } from '../documents/document-intelligence.mjs';
import { sanitizeDocumentFilename } from '../documents/document-service.mjs';

const MAX_MOVEMENTS = 1_000;

function safeText(value, fallback = '', maxLength = 4_000) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, maxLength);
}

function isoDay(value) {
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] || 'sem-data';
}

function movementTitle(movement, index) {
  return safeText(movement?.description || movement?.text || movement?.name, `Andamento ${index}`, 300);
}

export function formatPieceFilename(index, date, description) {
  const prefix = String(index).padStart(3, '0');
  const title = sanitizeDocumentFilename(description || 'Andamento processual', 'Andamento processual')
    .replace(/\.pdf$/i, '')
    .slice(0, 90)
    .trim();
  return `${prefix} - ${isoDay(date)} - ${title}.pdf`;
}

export function generateProcessMovementPdf({ processItem, snapshot, movement, index, total }) {
  const cnj = safeText(processItem?.number || snapshot?.metadata?.rawCnj || snapshot?.metadata?.cnj, 'Processo sem número', 100);
  const title = movementTitle(movement, index);
  const date = safeText(movement?.date || movement?.occurredAt || movement?.createdAt, 'Data não informada', 60);
  const references = (Array.isArray(movement?.documentReferences) ? movement.documentReferences : [])
    .slice(0, 100)
    .map((reference, referenceIndex) => `${referenceIndex + 1}. ${safeText(reference?.name || reference?.id, 'Documento referenciado', 300)}`);
  const lines = [
    'ATRIUM - CADERNO PROCESSUAL DE CONSULTA',
    '',
    `Processo: ${cnj}`,
    `Tribunal / órgão: ${safeText(processItem?.court || snapshot?.metadata?.court, 'Não informado', 200)}`,
    `Andamento: ${String(index).padStart(3, '0')} de ${String(total).padStart(3, '0')}`,
    `Data: ${date}`,
    `Descrição: ${title}`,
    '',
    safeText(movement?.text || movement?.description || movement?.name, 'Andamento processual sem texto adicional.', 20_000),
    '',
    ...(references.length ? ['Documentos referenciados pelo snapshot:', ...references, ''] : []),
    'Documento derivado pelo ATRIUM a partir do snapshot de consulta.',
    'Não substitui a peça original nem certifica o conteúdo perante o tribunal.'
  ];
  const { binary, pageCount } = createDeterministicTextPdf(lines.join('\n'));
  return {
    binary,
    pageCount,
    size: binary.length,
    checksum: createHash('sha256').update(binary).digest('hex'),
    fileName: formatPieceFilename(index, date, title),
    title,
    date: isoDay(date),
    sourceMovementFingerprint: safeText(movement?.fingerprint, '', 64)
  };
}

export function generateAutosIndexPdf({ processItem, snapshot, pieces }) {
  const cnj = safeText(processItem?.number || snapshot?.metadata?.rawCnj || snapshot?.metadata?.cnj, 'Processo sem número', 100);
  const generatedFrom = safeText(snapshot?.provenance?.queryTimestamp || processItem?.tjrsCollector?.syncedAt, 'Data de coleta não informada', 80);
  const lines = [
    'ATRIUM - ÍNDICE DO CADERNO PROCESSUAL DE CONSULTA',
    '',
    `Processo: ${cnj}`,
    `Cliente / parte: ${safeText(processItem?.client, 'Não informado', 300)}`,
    `Tribunal / órgão: ${safeText(processItem?.court || snapshot?.metadata?.court, 'Não informado', 200)}`,
    `Snapshot consultado em: ${generatedFrom}`,
    `Total de andamentos compilados: ${pieces.length}`,
    '',
    ...pieces.flatMap(piece => [
      `${String(piece.index).padStart(3, '0')} - ${piece.date} - ${piece.title}`,
      `Arquivo: ${piece.fileName} | ${piece.pageCount} página(s) | SHA-256 ${piece.checksum}`,
      ''
    ]),
    'Este índice e os PDFs listados são derivados locais do snapshot de consulta.',
    'Eles não substituem os documentos originais disponíveis no sistema do tribunal.'
  ];
  const { binary, pageCount } = createDeterministicTextPdf(lines.join('\n'));
  const safeCnj = cnj.replace(/[^\d.-]/g, '_');
  return {
    binary,
    pageCount,
    size: binary.length,
    checksum: createHash('sha256').update(binary).digest('hex'),
    fileName: `000 - Indice do Caderno Processual - ${safeCnj}.pdf`,
    title: 'Índice do caderno processual',
    date: isoDay(generatedFrom)
  };
}

export function createProcessAutosArtifacts({ processItem, snapshot }) {
  if (!processItem?.id) throw Object.assign(new Error('Processo local não informado.'), { statusCode: 400 });
  const movements = (Array.isArray(snapshot?.movements) && snapshot.movements.length
    ? snapshot.movements
    : (Array.isArray(processItem?.movements) && processItem.movements.length
      ? processItem.movements
      : (Array.isArray(processItem?.judicialMovements) ? processItem.judicialMovements : [])))
    .filter(Boolean)
    .slice(0, MAX_MOVEMENTS)
    .sort((left, right) => String(left.date || left.occurredAt || '').localeCompare(String(right.date || right.occurredAt || '')));
  if (!movements.length) {
    throw Object.assign(new Error('O processo ainda não possui andamentos registrados para gerar o caderno em PDF. Use "Atualizar TJRS" primeiro.'), { statusCode: 422 });
  }
  const pieces = movements.map((movement, offset) => ({
    index: offset + 1,
    ...generateProcessMovementPdf({ processItem, snapshot, movement, index: offset + 1, total: movements.length })
  }));
  const index = generateAutosIndexPdf({ processItem, snapshot, pieces });
  return { index, pieces, all: [index, ...pieces] };
}
