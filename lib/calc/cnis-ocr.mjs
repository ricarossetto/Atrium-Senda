import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export class CnisOcrError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CnisOcrError';
  }
}

const execFileAsync = promisify(execFile);

export function createCnisOcr({
  execFileImpl = execFileAsync,
  pdftoppm = 'pdftoppm',
  tesseract = 'tesseract',
  idioma = 'por',
  dpi = 250,
  maxPaginas = 80,
  timeouts = { raster: 180_000, ocr: 180_000 }
} = {}) {
  async function disponivel() {
    try {
      await execFileImpl(tesseract, ['--version'], { timeout: 20_000 });
      await execFileImpl(pdftoppm, ['-v'], { timeout: 20_000 });
      return true;
    } catch (error) {
      return false;
    }
  }

  async function reconhecer(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (!bytes || bytes.length === 0) throw new CnisOcrError('PDF vazio para OCR.');
    const dir = await mkdtemp(path.join(tmpdir(), 'atrium-cnis-ocr-'));
    try {
      const pdfPath = path.join(dir, 'extrato.pdf');
      await writeFile(pdfPath, Buffer.from(bytes));
      const prefixo = path.join(dir, 'pagina');
      try {
        await execFileImpl(pdftoppm, ['-r', String(dpi), '-gray', '-png', '-f', '1', '-l', String(maxPaginas + 1), pdfPath, prefixo], {
          timeout: timeouts.raster,
          maxBuffer: 10 * 1024 * 1024
        });
      } catch (error) {
        throw new CnisOcrError(`Falha ao rasterizar o PDF para OCR: ${error.message}. Verifique se o poppler-utils está instalado no servidor.`);
      }
      const paginas = (await readdir(dir)).filter(nome => nome.startsWith('pagina') && nome.endsWith('.png')).sort();
      if (paginas.length === 0) throw new CnisOcrError('Nenhuma página foi renderizada para OCR.');
      if (paginas.length > maxPaginas) throw new CnisOcrError(`PDF excede ${maxPaginas} páginas para OCR; divida o documento.`);
      const textos = [];
      for (const pagina of paginas) {
        try {
          const { stdout } = await execFileImpl(tesseract, [path.join(dir, pagina), 'stdout', '-l', idioma, '--psm', '6'], {
            timeout: timeouts.ocr,
            maxBuffer: 20 * 1024 * 1024
          });
          textos.push(String(stdout ?? ''));
        } catch (error) {
          throw new CnisOcrError(`Falha no OCR da página ${pagina}: ${error.message}. Verifique se o tesseract e o idioma "${idioma}" estão instalados no servidor.`);
        }
      }
      return {
        texto: textos.join('\n'),
        paginas: paginas.length,
        idioma,
        dpi,
        avisos: [
          'Leitura por OCR: confira cada competência e remuneração antes de aplicar.',
          'Dígitos podem variar na leitura por OCR; a conferência humana é obrigatória.'
        ]
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  return { disponivel, reconhecer };
}
