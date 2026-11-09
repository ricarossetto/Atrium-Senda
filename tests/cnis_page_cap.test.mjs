import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { CnisPdfError, extrairTextoPdf } from '../lib/calc/cnis-pdf.mjs';
import { CnisOcrError, createCnisOcr } from '../lib/calc/cnis-ocr.mjs';

const bytes = new Uint8Array([1, 2, 3]);

/* PDF: o corte de páginas precisa acontecer ANTES de extrair o texto. */

let extracaoChamada = 0;
const extrairQueConta = async () => {
  extracaoChamada += 1;
  return { totalPages: 999, text: 'nunca deveria ser alcançado' };
};

extracaoChamada = 0;
await assert.rejects(
  () => extrairTextoPdf(bytes, { _getDocumentProxy: async () => ({ numPages: 401 }), _extractText: extrairQueConta }),
  error => error instanceof CnisPdfError && /excede o limite de 400/.test(error.message),
  'PDF de 401 páginas deve ser rejeitado pelo limite padrão.'
);
assert.equal(extracaoChamada, 0, 'Extração de texto não pode rodar antes do corte de 400 páginas.');

extracaoChamada = 0;
await assert.rejects(
  () => extrairTextoPdf(bytes, { maxPaginas: 2, _getDocumentProxy: async () => ({ numPages: 3 }), _extractText: extrairQueConta }),
  CnisPdfError,
  'PDF acima do limite configurado deve ser rejeitado.'
);
assert.equal(extracaoChamada, 0, 'Extração de texto não pode rodar antes do corte de páginas configurado.');

extracaoChamada = 0;
const noLimite = await extrairTextoPdf(bytes, {
  maxPaginas: 2,
  _getDocumentProxy: async () => ({ numPages: 2 }),
  _extractText: async () => {
    extracaoChamada += 1;
    return { totalPages: 2, text: 'texto válido' };
  }
});
assert.equal(noLimite.totalPages, 2);
assert.equal(noLimite.texto, 'texto válido');
assert.equal(extracaoChamada, 1, 'PDF dentro do limite deve extrair normalmente.');

/* OCR: o pdftoppm precisa receber -f/-l para não rasterizar o PDF inteiro. */

function execOcrFalso({ totalPaginas = 1000 } = {}) {
  const chamadas = [];
  let escritas = 0;
  const execFileImpl = async (comando, args) => {
    chamadas.push([comando, args]);
    if (args[0] === '--version' || args[0] === '-v') return { stdout: `${comando} 5.0\n` };
    if (comando === 'pdftoppm') {
      const indiceF = args.indexOf('-f');
      const indiceL = args.indexOf('-l');
      const primeira = indiceF >= 0 ? Number(args[indiceF + 1]) : 1;
      const ultima = indiceL >= 0 ? Math.min(Number(args[indiceL + 1]), totalPaginas) : totalPaginas;
      const prefixo = args[args.length - 1];
      for (let pagina = primeira; pagina <= ultima; pagina += 1) {
        await writeFile(`${prefixo}-${pagina}.png`, 'fake');
        escritas += 1;
      }
      return { stdout: '' };
    }
    if (comando === 'tesseract') return { stdout: '01/2019 2.000,00\n' };
    throw new Error(`comando inesperado: ${comando}`);
  };
  return { execFileImpl, chamadas, escritas: () => escritas };
}

const limite = execOcrFalso({ totalPaginas: 1000 });
const ocrLimitado = createCnisOcr({ execFileImpl: limite.execFileImpl, maxPaginas: 80 });
await assert.rejects(() => ocrLimitado.reconhecer(bytes), CnisOcrError, 'PDF acima de maxPaginas deve falhar.');
const raster = limite.chamadas.find(([comando]) => comando === 'pdftoppm');
assert.ok(raster, 'pdftoppm precisa ser invocado.');
const argsRaster = raster[1];
assert.equal(argsRaster[argsRaster.indexOf('-f') + 1], '1');
assert.equal(argsRaster[argsRaster.indexOf('-l') + 1], '81', 'Rasterização deve limitar a maxPaginas + 1.');
assert.equal(limite.escritas(), 81, 'Nenhuma página além do corte pode ser rasterizada antes da rejeição.');

const dentroDoLimite = execOcrFalso({ totalPaginas: 2 });
const ocrOk = createCnisOcr({ execFileImpl: dentroDoLimite.execFileImpl, maxPaginas: 80 });
const resultado = await ocrOk.reconhecer(bytes);
assert.equal(resultado.paginas, 2, 'PDF dentro do limite deve ser reconhecido normalmente.');
assert.match(resultado.texto, /01\/2019 2\.000,00/);

console.log('CNIS (teto de páginas) aprovado: PDF rejeitado sem extrair, rasterização limitada por -f/-l e caminho válido preservado PASS.');
