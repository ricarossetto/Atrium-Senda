import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CnisOcrError, createCnisOcr } from '../lib/calc/cnis-ocr.mjs';

function execFalso({ disponivel = true, falhaRaster = false, falhaOcr = false, textoPagina = '01/2019 2.000,00\n02/2019 2.000,00\n' } = {}) {
  const chamadas = [];
  const execFileImpl = async (comando, args) => {
    chamadas.push([comando, args]);
    if (args[0] === '--version' || args[0] === '-v') {
      if (!disponivel) throw new Error('binário ausente');
      return { stdout: `${comando} 5.0\n` };
    }
    if (comando === 'pdftoppm') {
      if (falhaRaster) throw new Error('render falhou');
      const prefixo = args[args.length - 1];
      await writeFile(`${prefixo}-1.png`, 'fake');
      await writeFile(`${prefixo}-2.png`, 'fake');
      return { stdout: '' };
    }
    if (comando === 'tesseract') {
      if (falhaOcr) throw new Error('ocr falhou');
      return { stdout: textoPagina };
    }
    throw new Error(`comando inesperado: ${comando}`);
  };
  return { execFileImpl, chamadas };
}

const { execFileImpl, chamadas } = execFalso();
const ocr = createCnisOcr({ execFileImpl });
assert.equal(await ocr.disponivel(), true);
const resultado = await ocr.reconhecer(new Uint8Array([1, 2, 3]));
assert.equal(resultado.paginas, 2);
assert.match(resultado.texto, /01\/2019 2\.000,00/);
assert.equal(resultado.idioma, 'por');
assert.ok(resultado.avisos.some(aviso => /OCR/.test(aviso)));
assert.ok(chamadas.some(([comando, args]) => comando === 'pdftoppm' && args.includes('-r')));
assert.ok(chamadas.filter(([comando]) => comando === 'tesseract').length >= 3, 'Tesseract roda para cada página.');

const semBinario = createCnisOcr({ execFileImpl: execFalso({ disponivel: false }).execFileImpl });
assert.equal(await semBinario.disponivel(), false);

const rasterQuebrado = createCnisOcr({ execFileImpl: execFalso({ falhaRaster: true }).execFileImpl });
await assert.rejects(() => rasterQuebrado.reconhecer(new Uint8Array([1])), CnisOcrError);

const ocrQuebrado = createCnisOcr({ execFileImpl: execFalso({ falhaOcr: true }).execFileImpl });
await assert.rejects(() => ocrQuebrado.reconhecer(new Uint8Array([1])), CnisOcrError);

await assert.rejects(() => ocr.reconhecer(new Uint8Array()), CnisOcrError);

const limitePaginas = createCnisOcr({ execFileImpl: execFalso().execFileImpl, maxPaginas: 1 });
await assert.rejects(() => limitePaginas.reconhecer(new Uint8Array([1, 2])), CnisOcrError);

console.log('CNIS (OCR) aprovado: disponibilidade, rasterização, idioma, limites, falhas claras e limpeza PASS.');
