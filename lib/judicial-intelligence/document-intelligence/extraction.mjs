import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { statSync } from 'node:fs';
import { pagesFromExtractedText } from '../rag/chunker.mjs';

export const PDFTOTEXT_ENV = 'ATRIUM_PDFTOTEXT_PATH';
export const MAX_EXTRACT_BYTES = 32 * 1024 * 1024;

export const TEXT_MIME_TYPES = Object.freeze(['text/plain', 'text/markdown', 'text/csv', 'application/json']);

function isFile(candidate) {
  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

export function findPdftotext({ env = process.env, extraPaths = [] } = {}) {
  const candidates = [
    env?.[PDFTOTEXT_ENV],
    ...extraPaths,
    path.join(process.env['ProgramFiles'] ?? 'C:/Program Files', 'poppler', 'Library', 'bin', 'pdftotext.exe'),
    path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Links', 'pdftotext.exe'),
    'C:/ProgramData/chocolatey/bin/pdftotext.exe'
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (isFile(candidate)) return candidate;
  }
  const probe = spawnSync('pdftotext', ['-v'], { encoding: 'utf8', stdio: 'pipe' });
  const output = `${probe.stdout ?? ''}${probe.stderr ?? ''}`;
  return /pdftotext/i.test(output) ? 'pdftotext' : null;
}

export function runPdftotext(pdftotextPath, bytes) {
  const result = spawnSync(pdftotextPath, ['-layout', '-', '-'], {
    input: bytes,
    maxBuffer: MAX_EXTRACT_BYTES,
    encoding: 'utf8',
    timeout: 60_000
  });
  if (result.status !== 0) {
    const error = new Error('pdftotext falhou ao extrair o PDF.');
    error.code = 'EXTRACTION_FAILED';
    error.stderr = String(result.stderr ?? result.error?.message ?? '').slice(0, 400);
    throw error;
  }
  return String(result.stdout ?? '');
}

export function extractDocumentText({
  mimeType = 'application/pdf',
  bytes = Buffer.alloc(0),
  pdftotextPath = null,
  runner = runPdftotext,
  env = process.env
} = {}) {
  const normalizedMime = String(mimeType || '').toLowerCase();
  if (TEXT_MIME_TYPES.includes(normalizedMime) || normalizedMime.startsWith('text/')) {
    const text = Buffer.from(bytes).toString('utf8');
    return {
      available: true,
      engine: 'utf8',
      pages: pagesFromExtractedText(text),
      characterCount: text.length
    };
  }
  if (normalizedMime !== 'application/pdf') {
    return {
      available: false,
      engine: null,
      pages: [],
      characterCount: 0,
      humanAction: `Tipo ${mimeType} sem extrator no beta; use OCR supervisionado do fluxo oficial de documentos.`
    };
  }
  const resolved = pdftotextPath ?? findPdftotext({ env });
  if (!resolved) {
    return {
      available: false,
      engine: null,
      pages: [],
      characterCount: 0,
      humanAction: `Instale poppler (pdftotext) ou defina ${PDFTOTEXT_ENV}; sem isso o beta não rastreia PDF nativo e não duplica o OCR oficial.`
    };
  }
  const text = runner(resolved, Buffer.from(bytes));
  return {
    available: true,
    engine: 'pdftotext',
    pages: pagesFromExtractedText(text),
    characterCount: text.length
  };
}
