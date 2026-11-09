import { createHash } from 'node:crypto';

export const CHUNKER_VERSION = 'ji-rag-chunk-v1';

export const DEFAULT_CHUNK_OPTIONS = Object.freeze({
  maxChars: 1200,
  overlapChars: 150,
  minChars: 120
});

export function splitIntoParagraphs(text) {
  return String(text ?? '')
    .split(/\n{2,}/)
    .map(paragraph => paragraph.replace(/\s+\n/g, '\n').trim())
    .filter(Boolean);
}

export function chunkText(text, { maxChars = DEFAULT_CHUNK_OPTIONS.maxChars, overlapChars = DEFAULT_CHUNK_OPTIONS.overlapChars } = {}) {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];
  const chunks = [];
  const paragraphs = splitIntoParagraphs(normalized);
  let current = '';
  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) chunks.push(trimmed);
    current = '';
  };
  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      flush();
      let cursor = 0;
      while (cursor < paragraph.length) {
        const slice = paragraph.slice(cursor, cursor + maxChars);
        chunks.push(slice.trim());
        cursor += Math.max(1, maxChars - overlapChars);
      }
      continue;
    }
    if (`${current}\n\n${paragraph}`.trim().length > maxChars) {
      const carry = current.slice(Math.max(0, current.length - overlapChars)).trim();
      flush();
      current = carry ? `${carry}\n\n${paragraph}` : paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  flush();
  return chunks.filter(chunk => chunk.length > 0);
}

export function chunkIdFor({ documentId, page, index }) {
  return createHash('sha256')
    .update(`${CHUNKER_VERSION}:${documentId}:${page}:${index}`)
    .digest('hex')
    .slice(0, 24);
}

export function chunkDocument({
  documentId,
  cnj = null,
  documentType = null,
  source = null,
  sourcePortal = null,
  date = null,
  party = null,
  pages = [],
  options = DEFAULT_CHUNK_OPTIONS
} = {}) {
  if (!documentId) throw new TypeError('documentId obrigatório para chunking.');
  const chunks = [];
  for (const page of pages) {
    const pageNumber = Number(page?.page ?? page?.pageNumber ?? 0) || null;
    for (const [index, text] of chunkText(page?.text, options).entries()) {
      chunks.push({
        chunkId: chunkIdFor({ documentId, page: pageNumber, index }),
        documentId,
        cnj,
        documentType,
        source,
        sourcePortal,
        date,
        party,
        page: pageNumber,
        index,
        text,
        chars: text.length
      });
    }
  }
  return chunks;
}

export function pagesFromExtractedText(text, { pageMarker = /\f/g } = {}) {
  const segments = String(text ?? '').split(pageMarker);
  return segments
    .map((segment, index) => ({ page: index + 1, text: segment.trim() }))
    .filter(entry => entry.text.length > 0);
}
