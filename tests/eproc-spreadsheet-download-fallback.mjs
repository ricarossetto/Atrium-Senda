import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  downloadEprocSpreadsheet,
  compareSpreadsheetArtifacts
} from '../lib/judicial/eproc/importers/spreadsheet-downloader.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'wave_d');

async function runSpreadsheetDownloadFallbackTest() {
  console.log('=== TESTE FOCAL: SPREADSHEET DOWNLOAD & HTTP FALLBACK (WAVE D) ===\n');

  const realXlsBuffer = await readFile(path.join(FIXTURES_DIR, 'RelatorioProcessos_sanitized.xls'));

  // 1. Mock Page with Successful Native Playwright Download
  const mockPageNative = {
    url: () => 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=relatorio_processo_procurador_listar',
    locator: (selector) => ({
      first: () => ({
        count: async () => 1,
        click: async () => {}
      })
    }),
    waitForEvent: async (eventName, options) => {
      assert.equal(eventName, 'download');
      return {
        createReadStream: async () => {
          return (async function* () {
            yield realXlsBuffer;
          })();
        },
        suggestedFilename: () => 'RelatorioProcessos.xls'
      };
    }
  };

  const nativeResult = await downloadEprocSpreadsheet(mockPageNative);
  assert.equal(nativeResult.ok, true);
  assert.equal(nativeResult.source, 'PLAYWRIGHT_NATIVE_DOWNLOAD');
  assert.equal(nativeResult.isValidXls, true);
  assert.equal(nativeResult.size, realXlsBuffer.length);
  assert.equal(nativeResult.signatureHex, 'd0cf11e0a1b11ae1');
  console.log('✓ 1. Caminho preferencial: Download nativo via Playwright com validação OLE/BIFF8 concluído.');

  // 2. Mock Page with Native Download Failure triggering Authenticated HTTP Fallback
  let capturedAction = null;
  let capturedMethod = null;
  let capturedForm = null;

  const mockPageFallback = {
    url: () => 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=relatorio_processo_procurador_listar&hash=live_session_hash_123',
    locator: (selector) => ({
      first: () => ({
        count: async () => 1,
        click: async () => {
          throw new Error('Download event timeout in browser');
        }
      })
    }),
    waitForEvent: async () => {
      throw new Error('Download event timeout in browser');
    },
    evaluate: async (fn, sel) => {
      // Simulates discovering live form in authenticated DOM with dynamic CSRF/hash
      return {
        type: 'form',
        action: 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=relatorio_processo_gerar_planilha',
        method: 'POST',
        formData: {
          acao_origem: 'relatorio_processo_procurador_listar',
          txtNumProcesso: '',
          csrf_token: 'csrf_dyn_token_abc890',
          session_hash: 'ephemeral_hash_xyz789'
        }
      };
    },
    context: () => ({
      request: {
        post: async (url, options) => {
          capturedAction = url;
          capturedMethod = 'POST';
          capturedForm = options.form;
          return {
            ok: () => true,
            status: () => 200,
            statusText: () => 'OK',
            headers: () => ({
              'content-type': 'application/vnd.ms-excel',
              'content-disposition': 'attachment; filename="RelatorioProcessos_export.xls"'
            }),
            body: async () => realXlsBuffer
          };
        }
      }
    })
  };

  const fallbackResult = await downloadEprocSpreadsheet(mockPageFallback);
  assert.equal(fallbackResult.ok, true);
  assert.equal(fallbackResult.source, 'HTTP_CONTEXT_REQUEST_FALLBACK');
  assert.equal(fallbackResult.isValidXls, true);
  assert.equal(fallbackResult.size, realXlsBuffer.length);
  assert.equal(fallbackResult.isExcelContentType, true);
  assert.equal(capturedAction, 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=relatorio_processo_gerar_planilha');
  assert.equal(capturedForm.csrf_token, 'csrf_dyn_token_abc890');
  assert.equal(capturedForm.session_hash, 'ephemeral_hash_xyz789');
  console.log('✓ 2. Fallback HTTP via context.request reproduz ação real da página (com CSRF e hashes efêmeros).');

  // 3. Artifact Parity Comparison
  const comparison = compareSpreadsheetArtifacts(nativeResult, fallbackResult);
  assert.equal(comparison.match, true);
  assert.equal(comparison.identicalBytes, true);
  assert.equal(comparison.sizeDiffBytes, 0);
  assert.equal(comparison.signatureAValid, true);
  assert.equal(comparison.signatureBValid, true);
  console.log('✓ 3. Comparação de paridade comprovou bytes, assinatura OLE e Content-Type idênticos entre nativo e fallback.');

  // 4. Rejection of Truncated or Invalid Textual HTML Response in Fallback
  const mockPageInvalidHttp = {
    url: () => 'https://eproc1g.tjrs.jus.br/eproc/',
    locator: () => ({ first: () => ({ count: async () => 0 }) }),
    evaluate: async () => ({
      type: 'link',
      action: 'https://eproc1g.tjrs.jus.br/eproc/export.php',
      method: 'GET',
      formData: {}
    }),
    context: () => ({
      request: {
        get: async () => ({
          ok: () => true,
          status: () => 200,
          statusText: () => 'OK',
          headers: () => ({ 'content-type': 'text/html' }),
          body: async () => Buffer.from('<html><body>Erro de Sessão ou Página HTML</body></html>')
        })
      }
    })
  };

  await assert.rejects(
    async () => downloadEprocSpreadsheet(mockPageInvalidHttp),
    /sem assinatura OLE\/BIFF8 válida/,
    'Deve rejeitar payload que não seja binário OLE/BIFF8'
  );
  console.log('✓ 4. Rejeição de resposta textual/inválida verificada.');

  // 5. Exportação JS sem evento de download: captura da resposta Excel autenticada
  const mockPageJsExport = {
    url: () => 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=relatorio_processo_procurador_listar',
    locator: () => ({ first: () => ({ count: async () => 1, click: async () => {} }) }),
    waitForEvent: async () => { throw new Error('Download event timeout in browser'); },
    waitForResponse: async predicate => {
      const response = {
        status: () => 200,
        headers: () => ({
          'content-type': 'application/vnd.ms-excel',
          'content-disposition': 'attachment; filename="RelatorioProcessos-2026-9-17.xls"'
        }),
        body: async () => realXlsBuffer
      };
      assert.equal(predicate(response), true, 'Predicado deve aceitar resposta Excel');
      return response;
    }
  };

  const jsExportResult = await downloadEprocSpreadsheet(mockPageJsExport);
  assert.equal(jsExportResult.ok, true);
  assert.equal(jsExportResult.source, 'AUTHENTICATED_EXCEL_RESPONSE');
  assert.equal(jsExportResult.suggestedFilename, 'RelatorioProcessos-2026-9-17.xls');
  assert.equal(jsExportResult.isValidXls, true);
  assert.equal(jsExportResult.size, realXlsBuffer.length);
  console.log('✓ 5. Exportação JS sem evento de download capturada pela resposta Excel autenticada.');

  console.log('\n>>> SPREADSHEET DOWNLOAD & HTTP FALLBACK TEST PASSED! <<<\n');
}

runSpreadsheetDownloadFallbackTest().catch(err => {
  console.error('Falha no teste de download e fallback:', err);
  process.exit(1);
});
