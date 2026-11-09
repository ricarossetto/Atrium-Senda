import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DOCUMENT_NATIVE_ENGINE,
  DOCUMENT_HYBRID_ENGINE,
  DocumentIntelligenceService,
  createSyntheticMultiPagePdf,
  evaluateNativePdfPage
} from '../lib/documents/document-intelligence.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — FAST PATH NATIVO DE PDF (TEXTO PRIMEIRO, OCR POR PÁGINA)');
console.log('===============================================================\n');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const PAGE_TEXT = 'Processo sintético 5000000-00.2026.8.21.0001.\nPetição inicial apresenta pedido de tutela de urgência.\nValor da causa: R$ 10.000,00.\n'.repeat(4);

assert.equal(evaluateNativePdfPage(PAGE_TEXT).usable, true);
assert.equal(evaluateNativePdfPage('').usable, false);
assert.equal(evaluateNativePdfPage('   \n  ').usable, false);
assert.equal(evaluateNativePdfPage('fl. 3').usable, false, 'Página com densidade abaixo do limite não pode servir de fonte.');
assert.equal(evaluateNativePdfPage(`${'\u0001\u0002'.repeat(80)}abc`).usable, false, 'Excesso de caracteres de controle indica camada de texto corrompida.');
assert.equal(evaluateNativePdfPage(`${'\ufffd'.repeat(80)}`).usable, false, 'Caractere de substituição não é texto confiável.');
assert.equal(evaluateNativePdfPage(`${'.,-;:/\\|'.repeat(60)}`).usable, false, 'Conteúdo não textual deve ir para OCR.');
console.log('  [1] Porta de qualidade por página: densidade, caracteres de controle e razão alfanumérica.');

function extractWith(binary, { totalPages, maxPages = 4, commandRunner } = {}) {
  const calls = [];
  const runner = commandRunner ?? createRunner(calls, totalPages);
  const intelligence = new DocumentIntelligenceService({
    commandRunner: runner,
    tesseractPath: 'tesseract',
    pdftoppmPath: 'pdftoppm',
    languages: 'por',
    maxPages
  });
  return { calls, result: intelligence.extractText(binary, { mime: 'application/pdf', name: 'documento.pdf' }) };
}

function createRunner(calls, totalPages) {
  return async (executable, args) => {
    calls.push({ executable, args: [...args] });
    if (args[0] === '--version') return { stdout: 'tesseract 5.4.1\n' };
    if (executable === 'pdftoppm') {
      const first = Number(args[args.indexOf('-f') + 1]);
      const last = Math.min(Number(args[args.indexOf('-l') + 1]), totalPages);
      for (let page = first; page <= last; page += 1) await writeFile(`${args.at(-1)}-${page}.png`, PNG);
      return { stdout: '', stderr: '' };
    }
    return { stdout: `OCR de ${path.basename(args[0])}`, stderr: '' };
  };
}

const digitalPdf = createSyntheticMultiPagePdf([PAGE_TEXT, PAGE_TEXT, PAGE_TEXT]);
const mixedPdf = createSyntheticMultiPagePdf([PAGE_TEXT, '']);
const scanOnlyPdf = createSyntheticMultiPagePdf(['', '']);
const brokenPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF', 'ascii');

const digital = extractWith(digitalPdf.binary, { totalPages: 3 });
const native = await digital.result;
assert.equal(native.engine, DOCUMENT_NATIVE_ENGINE);
assert.equal(native.pageCount, 3);
assert.equal(digital.calls.length, 0, 'PDF digital não pode iniciar processo externo: sem pdftoppm, sem tesseract.');
assert.deepEqual(native.pageSources, [
  { page: 1, source: 'native' },
  { page: 2, source: 'native' },
  { page: 3, source: 'native' }
]);
assert.match(native.text, /Petição inicial apresenta pedido de tutela de urgência/);
assert.match(native.text, /5000000-00\.2026\.8\.21\.0001/);
console.log('  [2] PDF 100% digital: texto nativo, zero processo externo, zero dependência de binário.');

const mixed = extractWith(mixedPdf.binary, { totalPages: 2 });
const mixedResult = await mixed.result;
assert.equal(mixedResult.engine, DOCUMENT_HYBRID_ENGINE);
assert.equal(mixedResult.pageCount, 2);
assert.deepEqual(mixedResult.pageSources, [
  { page: 1, source: 'native' },
  { page: 2, source: 'ocr' }
]);
const renderCalls = mixed.calls.filter(call => call.executable === 'pdftoppm');
assert.equal(renderCalls.length, 1, 'Somente a página sem camada de texto pode ser renderizada.');
assert.deepEqual(renderCalls[0].args.slice(0, 6), ['-png', '-f', '2', '-l', '2', '-r']);
const ocrCalls = mixed.calls.filter(call => call.executable !== 'pdftoppm' && call.args[0] !== '--version');
assert.equal(ocrCalls.length, 1);
assert.match(path.basename(ocrCalls[0].args[0]), /^page-002\.png$/, 'OCR deve receber a página correta, não a primeira.');
assert.match(mixedResult.text, /Petição inicial apresenta pedido de tutela de urgência/);
assert.match(mixedResult.text, /OCR de page-002\.png/);
assert.ok(mixedResult.text.indexOf('Petição inicial') < mixedResult.text.indexOf('page-002'), 'A ordem de leitura das páginas deve ser preservada.');
console.log('  [3] PDF misto: só a página sem texto é renderizada e passa por OCR, ordem preservada.');

const scanOnly = extractWith(scanOnlyPdf.binary, { totalPages: 2 });
const scanResult = await scanOnly.result;
assert.equal(scanResult.engine, 'tesseract-local');
assert.equal(scanResult.pageCount, 2);
assert.equal(scanOnly.calls.filter(call => call.executable === 'pdftoppm').length, 1, 'Documento sem camada de texto mantém o render integral.');
assert.deepEqual(scanResult.pageSources, [
  { page: 1, source: 'ocr' },
  { page: 2, source: 'ocr' }
]);
assert.match(scanResult.text, /page-001\.png/);
assert.match(scanResult.text, /page-002\.png/);
console.log('  [4] PDF sem camada de texto: comportamento OCR integral preservado.');

const broken = extractWith(brokenPdf, { totalPages: 2 });
const brokenResult = await broken.result;
assert.equal(brokenResult.engine, 'tesseract-local');
assert.equal(brokenResult.pageCount, 2);
assert.ok(broken.calls.some(call => call.executable === 'pdftoppm'), 'PDF ilegível deve cair no caminho OCR supervisionado.');
console.log('  [5] PDF corrompido: falha de leitura nativa cai no OCR integral, sem sucesso fingido.');

const oversized = createSyntheticMultiPagePdf(Array.from({ length: 5 }, () => PAGE_TEXT));
const oversizedRun = extractWith(oversized.binary, { totalPages: 5 });
await assert.rejects(() => oversizedRun.result, error => error.statusCode === 413 && /limite supervisionado/.test(error.message));
assert.equal(oversizedRun.calls.length, 0, 'O limite de páginas deve ser aplicado antes de qualquer processo externo.');
console.log('  [6] Limite supervisionado de páginas continua valendo e é barato de detectar.');

const withoutBinaries = extractWith(digitalPdf.binary, {
  commandRunner: async () => {
    throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  }
});
const withoutBinariesResult = await withoutBinaries.result;
assert.equal(withoutBinariesResult.engine, DOCUMENT_NATIVE_ENGINE);
assert.match(withoutBinariesResult.text, /Petição inicial/);
assert.equal(withoutBinaries.calls.length, 0);
console.log('  [7] PDF digital funciona sem poppler e sem tesseract instalados no servidor.');

const missingEngine = extractWith(mixedPdf.binary, {
  commandRunner: async () => {
    throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  }
});
await assert.rejects(() => missingEngine.result, error => error.statusCode === 503 && /Tesseract OCR local/.test(error.message));
console.log('  [8] Página que realmente precisa de OCR ainda falha alto quando o motor está ausente.');

console.log('\n>>> FAST PATH NATIVO DE PDF: PASS <<<\n');
