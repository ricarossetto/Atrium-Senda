/**
 * ATRIUM Sovereign Judicial Connectivity — Eproc Spreadsheet Downloader
 *
 * Implements the official spreadsheet retrieval mechanism with dual-mode acquisition:
 *
 * 1. Primary Path: Native Playwright download
 *    - Triggers the "Gerar Planilha" action and intercepts the browser's download event.
 *    - Validates minimum size and OLE/BIFF8 binary magic bytes (d0cf11e0a1b11ae1).
 *
 * 2. Fallback Path: Authenticated context.request
 *    - If native download times out or is blocked by browser configuration, falls back to
 *      executing the request via page.context().request within the current authenticated session.
 *    - Crucial refinement: Captures the REAL action, href, or form from the authenticated page,
 *      including dynamic tokens, ephemeral hashes, and CSRF/hidden fields.
 *    - Never hardcodes ephemeral hashes or URLs.
 *    - Validates Content-Type, binary signature, and size bounds to guarantee parity with native download.
 */

import { isValidEprocXlsBuffer } from './spreadsheet-importer.mjs';
import { assertJudicialActionSafe } from '../parsers/dashboard-parser.mjs';

const OLE_HEADER_HEX = 'd0cf11e0a1b11ae1';

/**
 * Downloads an official eproc spreadsheet with native Playwright download and authenticated HTTP fallback.
 *
 * @param {import('playwright').Page} page Authenticated Playwright page
 * @param {Object} [options]
 * @param {string} [options.selector] Selector for the "Gerar Planilha" button/link
 * @param {import('playwright').Locator} [options.triggerLocator] Pre-resolved locator (supports frame-scoped triggers)
 * @param {Object} [options.documentRoot] Page or Frame used for DOM extraction (defaults to page)
 * @param {number} [options.timeoutMs] Timeout in ms (default 30000)
 * @param {number} [options.minSizeBytes] Minimum valid file size (default 512)
 * @param {Object} [options.logger] Optional logger
 * @returns {Promise<Object>} Download result with buffer, size, contentType, and source
 */
export async function downloadEprocSpreadsheet(page, options = {}) {
  if (!page) throw new Error('Instância do Playwright Page é obrigatória para download de planilha.');

  const selector = options.selector || '#btnGerarPlanilha, a:has-text("Gerar Planilha"), input[value="Gerar Planilha"], button:has-text("Gerar Planilha")';
  const documentRoot = options.documentRoot || page;
  const timeoutMs = options.timeoutMs || 30000;
  const minSizeBytes = options.minSizeBytes || 512;
  const logger = options.logger || console;

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Primary Path: Native Playwright download
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const triggerLocator = options.triggerLocator || page.locator(selector).first();
    const count = await triggerLocator.count().catch(() => 0);

    if (count > 0) {
      logger.info?.('[SpreadsheetDownloader] Tentando download nativo via Playwright...');

      const triggerAction = typeof triggerLocator.evaluate === 'function'
        ? await triggerLocator.evaluate(el => {
            // formaction sobrescreve o destino no submit nativo: valida o destino efetivo.
            const formActionOverride = typeof el.getAttribute === 'function' ? el.getAttribute('formaction') : '';
            if (formActionOverride) {
              try {
                const url = new URL(formActionOverride, window.location.href);
                return url.searchParams.get('acao') || 'formaction';
              } catch {
                return 'formaction';
              }
            }
            const form = el.closest('form');
            if (form) {
              const acaoInput = form.querySelector('input[name="acao"]');
              if (acaoInput?.value) return acaoInput.value;
              const url = new URL(form.action || window.location.href, window.location.href);
              return url.searchParams.get('acao') || '';
            }
            if (el.href) {
              const url = new URL(el.href, window.location.href);
              return url.searchParams.get('acao') || '';
            }
            return '';
          }).catch(() => '')
        : '';
      if (triggerAction) {
        assertJudicialActionSafe(triggerAction);
      }

      const excelContentType = /application\/(?:vnd\.ms-excel|msexcel|x-msexcel|octet-stream)|spreadsheet/i;
      const clickLocator = typeof triggerLocator.first === 'function' ? triggerLocator.first() : triggerLocator;
      const downloadPromise = page.waitForEvent('download', { timeout: Math.min(timeoutMs, 15000) }).catch(() => null);
      const responsePromise = typeof page.waitForResponse === 'function'
        ? page.waitForResponse(response => excelContentType.test(String(response.headers()['content-type'] || '')), {
            timeout: Math.min(timeoutMs, 15000)
          }).catch(() => null)
        : Promise.resolve(null);

      try {
        await clickLocator.click();
      } catch (clickError) {
        logger.warn?.(`[SpreadsheetDownloader] Clique no comando de exportação falhou (${clickError.message}).`);
      }

      const download = await downloadPromise;
      let buffer = null;
      let suggestedFilename = 'RelatorioEproc.xls';
      let source = 'PLAYWRIGHT_NATIVE_DOWNLOAD';
      let contentType = 'application/vnd.ms-excel';

      if (download) {
        const stream = await download.createReadStream();
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        buffer = Buffer.concat(chunks);
        suggestedFilename = download.suggestedFilename?.() || suggestedFilename;
      } else {
        // Exportações disparadas por JavaScript podem responder com o binário sem
        // emitir evento de download; capturamos a resposta Excel autenticada.
        const response = await responsePromise;
        if (response) {
          try {
            buffer = Buffer.from(await response.body());
            contentType = response.headers()['content-type'] || contentType;
            source = 'AUTHENTICATED_EXCEL_RESPONSE';
            const disposition = response.headers()['content-disposition'] || '';
            const fnameMatch = disposition.match(/filename=["']?([^"';]+)["']?/i);
            if (fnameMatch) suggestedFilename = fnameMatch[1].trim();
          } catch (bodyError) {
            logger.warn?.(`[SpreadsheetDownloader] Resposta Excel sem corpo legível (${bodyError.message}).`);
          }
        }
      }

      if (buffer && buffer.length >= minSizeBytes && isValidEprocXlsBuffer(buffer)) {
        logger.info?.(`[SpreadsheetDownloader] Exportação concluída com sucesso (${buffer.length} bytes, OLE/BIFF8 válido, origem ${source}).`);
        return {
          ok: true,
          source,
          buffer,
          size: buffer.length,
          contentType,
          suggestedFilename,
          signatureHex: OLE_HEADER_HEX,
          isValidXls: true
        };
      } else {
        logger.warn?.(`[SpreadsheetDownloader] Exportação nativa retornou arquivo inválido ou incompleto (${buffer ? buffer.length : 0} bytes). Ativando fallback.`);
      }
    }
  } catch (nativeErr) {
    logger.warn?.(`[SpreadsheetDownloader] Download nativo indisponível ou expirou (${nativeErr.message}). Iniciando fallback via HTTP context.request.`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Fallback Path: Authenticated context.request with live DOM extraction
  // ─────────────────────────────────────────────────────────────────────────────
  logger.info?.('[SpreadsheetDownloader] Inspecionando página para extração da ação real do botão...');

  const actionDescriptor = await documentRoot.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;

    // Check if element is inside a form
    const form = el.closest('form');
    if (form) {
      const formData = {};
      for (const input of form.querySelectorAll('input, select, textarea')) {
        if (input.name && !input.disabled) {
          formData[input.name] = input.value;
        }
      }
      return {
        type: 'form',
        action: form.action || window.location.href,
        method: (form.method || 'GET').toUpperCase(),
        formData
      };
    }

    // Check if element is an anchor link with href
    if (el.tagName.toLowerCase() === 'a' && el.href) {
      return {
        type: 'link',
        action: el.href,
        method: 'GET',
        formData: {}
      };
    }

    // Check if element has an explicit onclick handler with navigation
    const onclick = el.getAttribute('onclick') || '';
    const urlMatch = onclick.match(/(?:window\.location(?:\.href)?|location\.href)\s*=\s*['"]([^'"]+)['"]/);
    if (urlMatch) {
      const resolved = new URL(urlMatch[1], window.location.href).href;
      return {
        type: 'onclick_url',
        action: resolved,
        method: 'GET',
        formData: {}
      };
    }

    return null;
  }, selector);

  if (!actionDescriptor || !actionDescriptor.action) {
    throw new Error(`Falha ao identificar a ação/URL real de download para o seletor "${selector}" na página autenticada.`);
  }

  // Safety Gate: Enforce READ-ONLY ALLOWLIST before sending HTTP request
  const parsedActionUrl = new URL(actionDescriptor.action, 'http://localhost');
  const extractedAcao = parsedActionUrl.searchParams.get('acao') || actionDescriptor.formData?.acao || '';
  if (extractedAcao) {
    assertJudicialActionSafe(extractedAcao);
  }

  logger.info?.(`[SpreadsheetDownloader] Executando fallback HTTP (${actionDescriptor.method}) para: ${actionDescriptor.action.split('?')[0]}`);

  let response;
  const contextRequest = page.context().request;
  let refererUrl = page.url();
  try {
    if (documentRoot && documentRoot !== page && typeof documentRoot.url === 'function') {
      refererUrl = documentRoot.url() || refererUrl;
    }
  } catch {}

  if (actionDescriptor.method === 'POST') {
    response = await contextRequest.post(actionDescriptor.action, {
      form: actionDescriptor.formData,
      timeout: timeoutMs,
      headers: {
        Referer: refererUrl
      }
    });
  } else {
    // GET request
    const targetUrl = new URL(actionDescriptor.action);
    for (const [key, val] of Object.entries(actionDescriptor.formData)) {
      if (!targetUrl.searchParams.has(key)) {
        targetUrl.searchParams.set(key, val);
      }
    }
    response = await contextRequest.get(targetUrl.href, {
      timeout: timeoutMs,
      headers: {
        Referer: refererUrl
      }
    });
  }

  if (!response.ok()) {
    throw new Error(`Fallback HTTP falhou com status ${response.status()} (${response.statusText()}).`);
  }

  const responseHeaders = response.headers();
  const rawContentType = responseHeaders['content-type'] || '';
  const buffer = Buffer.from(await response.body());

  // Strict Validation: Content-Type, OLE Signature, Minimum Size
  const isExcelContentType = /application\/(?:vnd\.ms-excel|msexcel|x-msexcel|octet-stream)/i.test(rawContentType);
  const isValidSize = buffer.length >= minSizeBytes;
  const isValidSignature = isValidEprocXlsBuffer(buffer);

  if (!isValidSignature) {
    throw new Error(`Fallback HTTP retornou conteúdo sem assinatura OLE/BIFF8 válida (recebido: ${buffer.subarray(0, 8).toString('hex')}).`);
  }

  if (!isValidSize) {
    throw new Error(`Fallback HTTP retornou arquivo truncado (${buffer.length} bytes).`);
  }

  // Extract filename from Content-Disposition if present
  let suggestedFilename = 'RelatorioEproc.xls';
  const disposition = responseHeaders['content-disposition'] || '';
  const fnameMatch = disposition.match(/filename=["']?([^"';]+)["']?/i);
  if (fnameMatch) suggestedFilename = fnameMatch[1].trim();

  logger.info?.(`[SpreadsheetDownloader] Fallback HTTP concluído com sucesso (${buffer.length} bytes, signature OLE verificada).`);

  return {
    ok: true,
    source: 'HTTP_CONTEXT_REQUEST_FALLBACK',
    buffer,
    size: buffer.length,
    contentType: rawContentType || 'application/vnd.ms-excel',
    isExcelContentType,
    suggestedFilename,
    signatureHex: OLE_HEADER_HEX,
    isValidXls: true
  };
}

/**
 * Compares two spreadsheet artifacts (e.g. from native download and HTTP fallback)
 * to verify parity of signature, content bounds, and format.
 *
 * @param {Object} artifactA
 * @param {Object} artifactB
 * @returns {Object} Comparison report
 */
export function compareSpreadsheetArtifacts(artifactA, artifactB) {
  if (!artifactA?.buffer || !artifactB?.buffer) {
    return {
      match: false,
      reason: 'Um ou ambos os artefatos não possuem buffer válido.'
    };
  }

  const sigA = isValidEprocXlsBuffer(artifactA.buffer);
  const sigB = isValidEprocXlsBuffer(artifactB.buffer);

  const sizeDiff = Math.abs(artifactA.buffer.length - artifactB.buffer.length);
  const sizeDiffPercent = ((sizeDiff / Math.max(artifactA.buffer.length, artifactB.buffer.length)) * 100).toFixed(2);

  const identicalBytes = artifactA.buffer.equals(artifactB.buffer);

  return {
    match: sigA && sigB && sizeDiffPercent < 5,
    identicalBytes,
    signatureAValid: sigA,
    signatureBValid: sigB,
    sizeA: artifactA.buffer.length,
    sizeB: artifactB.buffer.length,
    sizeDiffBytes: sizeDiff,
    sizeDiffPercent: `${sizeDiffPercent}%`,
    contentTypeA: artifactA.contentType,
    contentTypeB: artifactB.contentType
  };
}
