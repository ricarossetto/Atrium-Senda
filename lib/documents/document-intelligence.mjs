import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { extractText as extractPdfPages, getDocumentProxy } from 'unpdf';

const execFileAsync = promisify(execFile);

export const DOCUMENT_INTELLIGENCE_VERSION = '1';
export const DOCUMENT_OCR_MAX_PAGES = 25;
export const DOCUMENT_OCR_MAX_CHARACTERS = 1_000_000;

export const NATIVE_PDF_MIN_PAGE_CHARACTERS = 50;
export const NATIVE_PDF_MIN_ALNUM_RATIO = 0.5;
export const NATIVE_PDF_MAX_CONTROL_RATIO = 0.05;

export const DOCUMENT_NATIVE_ENGINE = 'atrium-native-pdf';
export const DOCUMENT_HYBRID_ENGINE = 'atrium-hybrid-pdf';

const TEXT_MIME_TYPES = new Set(['text/plain', 'text/markdown']);
const IMAGE_TYPES = Object.freeze({
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tiff: 'image/tiff'
});

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function cleanMime(value) {
  return String(value || '').split(';', 1)[0].trim().toLowerCase();
}

function hasPrefix(binary, bytes) {
  return binary.length >= bytes.length && bytes.every((value, index) => binary[index] === value);
}

function looksLikeActiveText(binary) {
  const head = binary.subarray(0, Math.min(binary.length, 2048)).toString('utf8').trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<svg') || head.includes('<script');
}

function decodeUtf8(binary, maxBytes = 2_000_000) {
  if (!Buffer.isBuffer(binary) || !binary.length) throw httpError(400, 'O documento está vazio.');
  if (binary.length > maxBytes) throw httpError(413, 'O texto excede o limite seguro para processamento local.');
  if (binary.includes(0)) throw httpError(415, 'O conteúdo não é texto UTF-8 suportado.');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(binary).replace(/^\uFEFF/, '');
  } catch {
    throw httpError(415, 'O conteúdo não é texto UTF-8 suportado.');
  }
}

export function detectDocumentContent(binary, { mime = '', name = '' } = {}) {
  if (!Buffer.isBuffer(binary) || !binary.length) throw httpError(400, 'O documento está vazio.');
  if (hasPrefix(binary, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { kind: 'pdf', mime: 'application/pdf', extension: '.pdf' };
  if (hasPrefix(binary, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: 'image', format: 'png', mime: IMAGE_TYPES.png, extension: '.png' };
  if (hasPrefix(binary, [0xff, 0xd8, 0xff])) return { kind: 'image', format: 'jpeg', mime: IMAGE_TYPES.jpeg, extension: '.jpg' };
  if (binary.length >= 12 && binary.subarray(0, 4).toString('ascii') === 'RIFF' && binary.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { kind: 'image', format: 'webp', mime: IMAGE_TYPES.webp, extension: '.webp' };
  }
  if (hasPrefix(binary, [0x42, 0x4d])) return { kind: 'image', format: 'bmp', mime: IMAGE_TYPES.bmp, extension: '.bmp' };
  if (hasPrefix(binary, [0x49, 0x49, 0x2a, 0x00]) || hasPrefix(binary, [0x4d, 0x4d, 0x00, 0x2a])) {
    return { kind: 'image', format: 'tiff', mime: IMAGE_TYPES.tiff, extension: '.tiff' };
  }

  const declaredMime = cleanMime(mime);
  const extension = path.extname(String(name || '')).toLowerCase();
  if (TEXT_MIME_TYPES.has(declaredMime) || ['.txt', '.md', '.markdown'].includes(extension)) {
    if (looksLikeActiveText(binary)) throw httpError(415, 'HTML e SVG ativos não são suportados para preview ou extração.');
    decodeUtf8(binary);
    return { kind: 'text', mime: declaredMime === 'text/markdown' || ['.md', '.markdown'].includes(extension) ? 'text/markdown' : 'text/plain', extension: extension || '.txt' };
  }
  if (looksLikeActiveText(binary)) throw httpError(415, 'HTML e SVG ativos não são suportados para preview ou extração.');
  throw httpError(415, 'Formato não suportado pelo pipeline documental seguro.');
}

function safeExecutable(value, fallback) {
  let command = String(value || fallback || '').trim();
  if (process.platform !== 'win32' && (/^[A-Za-z]:\\/.test(command) || command.includes('\\'))) {
    command = String(fallback || '').trim();
  } else if (process.platform === 'win32' && command.startsWith('/') && !command.includes('\\')) {
    command = String(fallback || '').trim();
  }
  if (!command || command.includes('\0') || command.includes('\r') || command.includes('\n')) {
    throw httpError(500, 'Executável local do pipeline documental inválido.');
  }
  if (!path.isAbsolute(command) && !/^[A-Za-z0-9_.-]+$/.test(command)) {
    throw httpError(500, 'Executável local do pipeline documental inválido.');
  }
  return command;
}

function safeLanguages(value) {
  const languages = String(value || 'por').trim().toLowerCase();
  if (!/^[a-z0-9_+.-]{2,80}$/.test(languages)) throw httpError(500, 'Configuração de idiomas OCR inválida.');
  return languages;
}

async function defaultCommandRunner(executable, args, options = {}) {
  return execFileAsync(executable, args, {
    cwd: options.cwd,
    windowsHide: true,
    timeout: options.timeout ?? 120_000,
    maxBuffer: options.maxBuffer ?? 8_000_000,
    shell: false,
    encoding: options.encoding ?? 'utf8'
  });
}

function commandUnavailable(error, label) {
  if (error?.code === 'ENOENT') return httpError(503, `${label} local não está disponível. Configure o executável no ambiente do ATRIUM.`);
  if (error?.killed || error?.signal === 'SIGTERM') return httpError(504, `${label} local excedeu o tempo seguro de processamento.`);
  return httpError(422, `${label} local não conseguiu processar este arquivo.`);
}

function normalizedOcrText(value) {
  const text = String(value || '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  if (!text) throw httpError(422, 'O motor local não encontrou texto legível no documento.');
  if (text.length > DOCUMENT_OCR_MAX_CHARACTERS) throw httpError(413, 'A extração excedeu o limite seguro de caracteres.');
  return text;
}

export function evaluateNativePdfPage(rawText) {
  const text = String(rawText ?? '');
  const compact = text.replace(/\s+/g, '');
  if (!compact) return { usable: false, reason: 'vazia' };
  if (compact.length < NATIVE_PDF_MIN_PAGE_CHARACTERS) return { usable: false, reason: 'baixa densidade' };
  const control = (compact.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/g) || []).length;
  if (control / compact.length > NATIVE_PDF_MAX_CONTROL_RATIO) return { usable: false, reason: 'caracteres de controle' };
  const alphanumeric = (compact.match(/[\p{L}\p{N}]/gu) || []).length;
  if (alphanumeric / compact.length < NATIVE_PDF_MIN_ALNUM_RATIO) return { usable: false, reason: 'conteúdo não textual' };
  return { usable: true, characters: compact.length };
}

function versionLine(value, fallback) {
  return String(value || '').split(/\r?\n/, 1)[0].trim().slice(0, 120) || fallback;
}

function sortedRenderedPages(files, prefix) {
  return files
    .filter(file => file.startsWith(`${prefix}-`) && file.toLowerCase().endsWith('.png'))
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function wrapTextLine(line, width = 88) {
  if (!line) return [''];
  const parts = [];
  let remaining = line;
  while (remaining.length > width) {
    let split = remaining.lastIndexOf(' ', width);
    if (split < Math.floor(width * 0.55)) split = width;
    parts.push(remaining.slice(0, split));
    remaining = remaining.slice(split).trimStart();
  }
  parts.push(remaining);
  return parts;
}

function winAnsiPdfString(value) {
  const replacements = new Map([
    [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
    [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
    [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
    [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
    [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
    [0x017e, 0x9e], [0x0178, 0x9f]
  ]);
  const bytes = [];
  for (const character of String(value || '')) {
    const code = character.codePointAt(0);
    const byte = code <= 0xff ? code : replacements.get(code) ?? 0x3f;
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) bytes.push(0x5c, byte);
    else if (byte < 0x20) bytes.push(0x20);
    else bytes.push(byte);
  }
  return Buffer.from(bytes).toString('latin1');
}

export function createDeterministicTextPdf(text) {
  const lines = String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .split('\n')
    .flatMap(line => wrapTextLine(line));
  if (!lines.some(line => line.trim())) throw httpError(422, 'O texto está vazio e não pode ser convertido em PDF.');
  if (lines.length > 5_000) throw httpError(413, 'O texto excede o limite seguro para conversão em PDF.');

  const pages = [];
  for (let index = 0; index < lines.length; index += 52) pages.push(lines.slice(index, index + 52));
  return buildTextPdfFromPageLines(pages);
}

export function createSyntheticMultiPagePdf(pageTexts = []) {
  const pages = (Array.isArray(pageTexts) ? pageTexts : [pageTexts]).map(text => String(text ?? '').split('\n'));
  if (!pages.length) throw httpError(422, 'É necessário ao menos uma página para compor o PDF sintético.');
  return buildTextPdfFromPageLines(pages);
}

function buildTextPdfFromPageLines(pages) {
  const objects = new Map();
  objects.set(1, Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'ascii'));
  const pageObjectIds = pages.map((_, index) => 4 + (index * 2));
  objects.set(2, Buffer.from(`<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map(id => `${id} 0 R`).join(' ')}] >>`, 'ascii'));
  objects.set(3, Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>', 'ascii'));
  pages.forEach((pageLines, index) => {
    const pageId = pageObjectIds[index];
    const contentId = pageId + 1;
    objects.set(pageId, Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`, 'ascii'));
    const commands = `BT\n/F1 10 Tf\n52 790 Td\n14 TL\n${pageLines.map(line => `(${winAnsiPdfString(line)}) Tj\nT*`).join('\n')}\nET`;
    const stream = Buffer.from(commands, 'latin1');
    objects.set(contentId, Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'ascii'),
      stream,
      Buffer.from('\nendstream', 'ascii')
    ]));
  });

  const chunks = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [0];
  let length = chunks[0].length;
  const maxObject = Math.max(...objects.keys());
  for (let id = 1; id <= maxObject; id += 1) {
    offsets[id] = length;
    const object = Buffer.concat([
      Buffer.from(`${id} 0 obj\n`, 'ascii'),
      objects.get(id),
      Buffer.from('\nendobj\n', 'ascii')
    ]);
    chunks.push(object);
    length += object.length;
  }
  const xrefOffset = length;
  const xref = [`xref\n0 ${maxObject + 1}\n`, '0000000000 65535 f \n'];
  for (let id = 1; id <= maxObject; id += 1) xref.push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  xref.push(`trailer\n<< /Size ${maxObject + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  chunks.push(Buffer.from(xref.join(''), 'ascii'));
  return { binary: Buffer.concat(chunks), pageCount: pages.length };
}

export function findWindowsPoppler() {
  if (process.platform !== 'win32') return null;
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const wingetDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    if (existsSync(wingetDir)) {
      try {
        const matches = readdirSync(wingetDir).filter(name => name.startsWith('oschwartz10612.Poppler'));
        for (const match of matches) {
          const candidate = path.join(wingetDir, match);
          if (existsSync(candidate)) {
            const subs = readdirSync(candidate);
            for (const sub of subs) {
              const bin = path.join(candidate, sub, 'Library', 'bin', 'pdftoppm.exe');
              if (existsSync(bin)) return bin;
              const directBin = path.join(candidate, sub, 'bin', 'pdftoppm.exe');
              if (existsSync(directBin)) return directBin;
            }
          }
        }
      } catch {}
    }
  }
  const standardPaths = [
    'C:\\Program Files\\poppler\\Library\\bin\\pdftoppm.exe',
    'C:\\Program Files\\poppler\\bin\\pdftoppm.exe',
    'C:\\Program Files (x86)\\poppler\\bin\\pdftoppm.exe',
    'C:\\poppler\\bin\\pdftoppm.exe'
  ];
  for (const candidate of standardPaths) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function findWindowsTesseract() {
  if (process.platform !== 'win32') return null;
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const wingetDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
    if (existsSync(wingetDir)) {
      try {
        const matches = readdirSync(wingetDir).filter(name => name.toLowerCase().includes('tesseract'));
        for (const match of matches) {
          const candidate = path.join(wingetDir, match);
          if (existsSync(path.join(candidate, 'tesseract.exe'))) return path.join(candidate, 'tesseract.exe');
        }
      } catch {}
    }
  }
  const standardPaths = [
    'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
    'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe',
    'C:\\Tesseract-OCR\\tesseract.exe'
  ];
  for (const candidate of standardPaths) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export class DocumentIntelligenceService {
  constructor({
    commandRunner = defaultCommandRunner,
    tesseractPath = process.env.ATRIUM_TESSERACT_PATH || (process.platform === 'win32' ? findWindowsTesseract() : null),
    pdftoppmPath = process.env.ATRIUM_PDFTOPPM_PATH || (process.platform === 'win32' ? findWindowsPoppler() : null),
    languages = process.env.ATRIUM_OCR_LANGUAGES,
    maxPages = DOCUMENT_OCR_MAX_PAGES
  } = {}) {
    this.runCommand = commandRunner;
    this.tesseractPath = safeExecutable(tesseractPath, 'tesseract');
    this.pdftoppmPath = safeExecutable(pdftoppmPath, 'pdftoppm');
    this.languages = safeLanguages(languages);
    this.maxPages = Math.max(1, Math.min(DOCUMENT_OCR_MAX_PAGES, Number(maxPages) || DOCUMENT_OCR_MAX_PAGES));
  }

  async tesseractVersion() {
    try {
      const result = await this.runCommand(this.tesseractPath, ['--version'], { timeout: 15_000 });
      return versionLine(result.stdout || result.stderr, 'tesseract-local');
    } catch (error) {
      throw commandUnavailable(error, 'Tesseract OCR');
    }
  }

  async renderPdf(binary, { firstPageOnly = false } = {}) {
    const directory = await mkdtemp(path.join(tmpdir(), 'atrium-document-preview-'));
    try {
      const source = path.join(directory, 'source.pdf');
      const prefix = 'page';
      await writeFile(source, binary, { mode: 0o600 });
      const lastPage = firstPageOnly ? 1 : this.maxPages + 1;
      try {
        await this.runCommand(this.pdftoppmPath, ['-png', '-f', '1', '-l', String(lastPage), '-r', '150', source, path.join(directory, prefix)], { cwd: directory, timeout: 120_000 });
      } catch (error) {
        throw commandUnavailable(error, 'Renderizador PDF Poppler');
      }
      const pages = sortedRenderedPages(await readdir(directory), prefix);
      if (!pages.length) throw httpError(422, 'O PDF não produziu páginas seguras para processamento.');
      if (!firstPageOnly && pages.length > this.maxPages) {
        // O limite é deliberado: não há continuação silenciosa em documento maior.
        throw httpError(413, `O PDF excede o limite supervisionado de ${this.maxPages} páginas para OCR.`);
      }
      const buffers = [];
      let totalBytes = 0;
      for (const page of pages) {
        const pagePath = path.join(directory, page);
        const pageStat = await stat(pagePath);
        totalBytes += pageStat.size;
        if (pageStat.size > 25_000_000 || totalBytes > 150_000_000) throw httpError(413, 'A renderização do PDF excedeu o limite seguro.');
        buffers.push(await readFile(pagePath));
      }
      return buffers;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async renderPdfPage(binary, pageNumber) {
    const directory = await mkdtemp(path.join(tmpdir(), 'atrium-document-page-'));
    try {
      const source = path.join(directory, 'source.pdf');
      const prefix = 'page';
      await writeFile(source, binary, { mode: 0o600 });
      try {
        await this.runCommand(this.pdftoppmPath, ['-png', '-f', String(pageNumber), '-l', String(pageNumber), '-r', '150', source, path.join(directory, prefix)], { cwd: directory, timeout: 120_000 });
      } catch (error) {
        throw commandUnavailable(error, 'Renderizador PDF Poppler');
      }
      const pages = sortedRenderedPages(await readdir(directory), prefix);
      if (!pages.length) throw httpError(422, 'O PDF não produziu páginas seguras para processamento.');
      const rendered = path.join(directory, pages[0]);
      const pageStat = await stat(rendered);
      if (pageStat.size > 25_000_000) throw httpError(413, 'A renderização do PDF excedeu o limite seguro.');
      return await readFile(rendered);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async readNativePdfPages(binary) {
    let pdf;
    try {
      pdf = await getDocumentProxy(new Uint8Array(binary), { verbosity: 0 });
    } catch {
      return null;
    }
    const totalPages = Number(pdf?.numPages) || 0;
    if (!totalPages) return null;
    if (totalPages > this.maxPages) {
      throw httpError(413, `O PDF excede o limite supervisionado de ${this.maxPages} páginas para OCR.`);
    }
    try {
      const extracted = await extractPdfPages(pdf, { mergePages: false });
      const pages = Array.isArray(extracted?.text) ? extracted.text : [];
      if (pages.length !== totalPages) return null;
      return { totalPages, pages };
    } catch {
      return null;
    }
  }

  async extractPdfText(binary) {
    const native = await this.readNativePdfPages(binary);
    const pages = new Map();
    if (native) {
      for (let index = 0; index < native.pages.length; index += 1) {
        const pageNumber = index + 1;
        const verdict = evaluateNativePdfPage(native.pages[index]);
        if (verdict.usable) pages.set(pageNumber, { text: String(native.pages[index] || '').trim(), source: 'native' });
      }
    }

    const pendingOcr = native
      ? native.pages.map((_, index) => index + 1).filter(pageNumber => !pages.has(pageNumber))
      : [];

    if (!native || pendingOcr.length === native.totalPages) return this.ocrAllPdfPages(binary);
    if (pendingOcr.length === 0) return this.buildPdfResult(pages, native.totalPages, DOCUMENT_NATIVE_ENGINE, DOCUMENT_INTELLIGENCE_VERSION);

    const engineVersion = await this.tesseractVersion();
    const directory = await mkdtemp(path.join(tmpdir(), 'atrium-document-ocr-'));
    try {
      for (const pageNumber of pendingOcr) {
        const rendered = await this.renderPdfPage(binary, pageNumber);
        const pageType = detectDocumentContent(rendered, { mime: 'image/png', name: 'page.png' });
        const source = path.join(directory, `page-${String(pageNumber).padStart(3, '0')}${pageType.extension}`);
        await writeFile(source, rendered, { mode: 0o600 });
        try {
          const result = await this.runCommand(this.tesseractPath, [source, 'stdout', '-l', this.languages], { cwd: directory, timeout: 120_000, maxBuffer: 12_000_000 });
          pages.set(pageNumber, { text: String(result.stdout || '').trim(), source: 'ocr' });
        } catch (error) {
          throw commandUnavailable(error, 'Tesseract OCR');
        }
      }
      return this.buildPdfResult(pages, native.totalPages, DOCUMENT_HYBRID_ENGINE, engineVersion);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async ocrAllPdfPages(binary) {
    const engineVersion = await this.tesseractVersion();
    const rendered = await this.renderPdf(binary);
    const pages = new Map();
    const directory = await mkdtemp(path.join(tmpdir(), 'atrium-document-ocr-'));
    try {
      for (let index = 0; index < rendered.length; index += 1) {
        const pageNumber = index + 1;
        const pageType = detectDocumentContent(rendered[index], { mime: 'image/png', name: 'page.png' });
        const source = path.join(directory, `page-${String(pageNumber).padStart(3, '0')}${pageType.extension}`);
        await writeFile(source, rendered[index], { mode: 0o600 });
        try {
          const result = await this.runCommand(this.tesseractPath, [source, 'stdout', '-l', this.languages], { cwd: directory, timeout: 120_000, maxBuffer: 12_000_000 });
          pages.set(pageNumber, { text: String(result.stdout || '').trim(), source: 'ocr' });
        } catch (error) {
          throw commandUnavailable(error, 'Tesseract OCR');
        }
      }
      return this.buildPdfResult(pages, rendered.length, 'tesseract-local', engineVersion);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  buildPdfResult(pages, totalPages, engine, engineVersion) {
    const ordered = [...pages.entries()].sort((left, right) => left[0] - right[0]);
    return {
      text: normalizedOcrText(ordered.map(([, page]) => page.text).join('\n\n')),
      engine,
      engineVersion,
      language: this.languages,
      pageCount: totalPages,
      sourceKind: 'pdf',
      pageSources: ordered.map(([pageNumber, page]) => ({ page: pageNumber, source: page.source }))
    };
  }

  async extractText(binary, metadata = {}) {
    const detected = detectDocumentContent(binary, metadata);
    if (detected.kind === 'text') {
      const text = normalizedOcrText(decodeUtf8(binary));
      return { text, engine: 'atrium-text-extractor', engineVersion: DOCUMENT_INTELLIGENCE_VERSION, language: 'utf-8', pageCount: 1, sourceKind: 'text', pageSources: [{ page: 1, source: 'text' }] };
    }

    if (detected.kind === 'pdf') return this.extractPdfText(binary);

    const engineVersion = await this.tesseractVersion();
    const directory = await mkdtemp(path.join(tmpdir(), 'atrium-document-ocr-'));
    try {
      const source = path.join(directory, `page-001${detected.extension}`);
      await writeFile(source, binary, { mode: 0o600 });
      try {
        const result = await this.runCommand(this.tesseractPath, [source, 'stdout', '-l', this.languages], { cwd: directory, timeout: 120_000, maxBuffer: 12_000_000 });
        return {
          text: normalizedOcrText(String(result.stdout || '')),
          engine: 'tesseract-local',
          engineVersion,
          language: this.languages,
          pageCount: 1,
          sourceKind: detected.kind,
          pageSources: [{ page: 1, source: 'ocr' }]
        };
      } catch (error) {
        throw commandUnavailable(error, 'Tesseract OCR');
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async createPreview(binary, metadata = {}) {
    const detected = detectDocumentContent(binary, metadata);
    if (detected.kind === 'text') {
      return { binary: Buffer.from(decodeUtf8(binary), 'utf8'), mime: 'text/plain; charset=utf-8', kind: 'text', extension: '.txt', engine: 'atrium-safe-text-preview', engineVersion: DOCUMENT_INTELLIGENCE_VERSION };
    }
    if (detected.kind === 'image' && ['png', 'jpeg', 'webp'].includes(detected.format)) {
      return { binary, mime: detected.mime, kind: 'image', extension: detected.extension, engine: 'browser-image-decoder', engineVersion: DOCUMENT_INTELLIGENCE_VERSION };
    }
    if (detected.kind === 'pdf') {
      const [page] = await this.renderPdf(binary, { firstPageOnly: true });
      detectDocumentContent(page, { mime: 'image/png', name: 'preview.png' });
      return { binary: page, mime: 'image/png', kind: 'image', extension: '.png', engine: 'poppler-local', engineVersion: DOCUMENT_INTELLIGENCE_VERSION };
    }
    throw httpError(415, 'Este formato não possui preview seguro no ATRIUM.');
  }

  convertTextToPdf(binary, metadata = {}) {
    const detected = detectDocumentContent(binary, metadata);
    if (detected.kind !== 'text') throw httpError(415, 'A conversão PDF segura deste Gate aceita somente texto UTF-8 e Markdown sem HTML ativo.');
    const result = createDeterministicTextPdf(decodeUtf8(binary));
    return { ...result, engine: 'atrium-text-pdf', engineVersion: DOCUMENT_INTELLIGENCE_VERSION, sourceKind: 'text' };
  }
}
