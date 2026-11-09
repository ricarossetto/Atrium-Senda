/**
 * ATRIUM — Captura do Domicílio Eletrônico pela Central de Comunicações (servidor)
 *
 * Depois do login (máquina PDPJ de eproc/PJe), a Central de Comunicações do portal
 * expõe uma API **same-origin** (`/api/v1/comunicacao`) autenticada por `Bearer`
 * anexado pela própria página. Este módulo:
 *  1. abre `/central-comunicacoes`, dispensa a navegação guiada e dispara a busca
 *     do Domicílio Eletrônico, capturando a requisição real (Bearer + base);
 *  2. repete a consulta na janela pedida (`djen=false`), paginando quando preciso;
 *  3. devolve os itens **com o texto integral** (`texto`) para normalização.
 *
 * Somente leitura: nada é marcado como lido, nenhuma ciência é dada e nenhuma
 * escrita acontece no portal.
 */

export const DOMICILIO_CENTRAL_PATH = '/central-comunicacoes';
export const DOMICILIO_CENTRAL_API = '/api/v1/comunicacao';
export const DOMICILIO_TAB_API = '/api/v1/domicilio-eletronico/comunicacao';
// O portal expõe dois endpoints de consulta: o da aba Domicílio
// (`/api/v1/domicilio-eletronico/comunicacao?dataInicio&dataFim` em ISO) e o da
// busca unificada (`/api/v1/comunicacao?...&djen=false`). Os dois servem.
const API_MATCH_RE = /\/api\/v1\/(?:domicilio-eletronico\/)?comunicacao(\?|$)/;

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * @param {object} page página autenticada (Playwright)
 * @param {object} options
 * @param {string} options.ufOab UF da OAB do escritório (ex.: RS)
 * @param {string} options.numeroOab número da OAB (somente dígitos)
 * @param {string} options.dataInicio AAAA-MM-DD
 * @param {string} options.dataFim AAAA-MM-DD
 */
export async function captureDomicilioFromPortal(page, {
  ufOab,
  numeroOab,
  dataInicio,
  dataFim,
  maxPages = 20,
  requestTimeoutMs = 20_000,
  onProgress = () => {}
} = {}) {
  const uf = String(ufOab || '').trim().toUpperCase();
  const numero = digits(numeroOab);
  if (!uf || !numero) {
    return { status: 'failed', items: [], error: { code: 'DOMICILIO_OAB_MISSING', message: 'Informe a OAB (UF e número) do escritório para consultar a Central de Comunicações.' } };
  }

  const captured = { url: null, auth: null };
  const listener = request => {
    try {
      const url = request.url();
      if (!API_MATCH_RE.test(url)) return;
      captured.url = url;
      captured.auth = request.headers()?.authorization || captured.auth;
    } catch {
      // requisição já finalizada: ignora
    }
  };
  page.on?.('request', listener);

  try {
    onProgress({ phase: 'central', action: 'Abrindo a Central de Comunicações do Domicílio Eletrônico...' });
    const base = new URL(page.url?.() || 'https://portaldeservicos.pdpj.jus.br/');
    await page.goto(`${base.origin}${DOMICILIO_CENTRAL_PATH}`, { waitUntil: 'commit', timeout: 90_000 }).catch(() => {});
    await page.waitForTimeout(8_000);

    // Navegação guiada ("Pular") pode cobrir os filtros.
    const skip = page.getByRole('button', { name: 'Pular' }).first();
    if (await skip.count().catch(() => 0)) {
      await skip.click().catch(() => {});
      await page.waitForTimeout(1_200);
    }
    const tab = page.getByText('Domicílio Eletrônico', { exact: true }).first();
    if (await tab.count().catch(() => 0)) {
      await tab.click().catch(() => {});
      await page.waitForTimeout(2_000);
    }
    for (let attempt = 1; attempt <= 2 && !captured.url; attempt += 1) {
      const buscar = page.getByRole('button', { name: /Buscar/ }).first();
      if (await buscar.count().catch(() => 0)) await buscar.click().catch(() => {});
      await page.waitForTimeout(attempt === 1 ? 12_000 : 8_000);
    }
    if (!captured.url || !captured.auth) {
      return {
        status: 'failed',
        items: [],
        error: {
          code: 'DOMICILIO_CENTRAL_UNAVAILABLE',
          message: 'A Central de Comunicações não expôs a consulta autenticada nesta execução. Nada foi lido.'
        }
      };
    }

    const apiBase = new URL(captured.url).origin + new URL(captured.url).pathname;
    const isTabApi = new URL(captured.url).pathname.includes(DOMICILIO_TAB_API);
    const collected = [];
    const seen = new Set();
    let total = null;
    const limit = Math.max(1, Number(maxPages) || 20);
    for (let pagina = 0; pagina < limit; pagina += 1) {
      const params = new URL(captured.url).searchParams;
      if (isTabApi) {
        params.set('dataInicio', `${dataInicio}T00:00:00Z`);
        params.set('dataFim', `${dataFim}T23:59:59Z`);
      } else {
        params.set('numeroProcesso', '');
        params.set('ufOab', uf);
        params.set('numeroOab', numero);
        params.set('dataDisponibilizacaoInicio', String(dataInicio));
        params.set('dataDisponibilizacaoFim', String(dataFim));
        params.set('djen', 'false');
      }
      params.delete('pagina');
      if (pagina > 0) params.set('pagina', String(pagina));
      const payload = await page.evaluate(async ({ url, auth, timeoutMs }) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(url, { credentials: 'include', headers: { accept: 'application/json', authorization: auth }, signal: controller.signal });
          const json = await response.json().catch(() => null);
          return { status: response.status, json };
        } catch (error) {
          return { status: 0, error: String(error?.message || error).slice(0, 160) };
        } finally {
          clearTimeout(timer);
        }
      }, { url: `${apiBase}?${params.toString()}`, auth: captured.auth, timeoutMs: requestTimeoutMs });

      if (payload.status !== 200 || !payload.json) {
        if (pagina === 0) {
          return {
            status: 'failed',
            items: [],
            error: { code: 'DOMICILIO_CENTRAL_HTTP', message: `A Central de Comunicações respondeu ${payload.status || 'sem resposta'} na consulta.` }
          };
        }
        break;
      }
      const dados = payload.json?.dadosResposta || {};
      const items = Array.isArray(dados.items) ? dados.items
        : (Array.isArray(dados.comunicacoes) ? dados.comunicacoes
          : (Array.isArray(dados) ? dados : []));
      total = Number.isFinite(Number(dados.count)) ? Number(dados.count)
        : (Number.isFinite(Number(payload.json?.count)) ? Number(payload.json.count) : total);
      let added = 0;
      for (const item of items) {
        const key = String(item?.numeroComunicacao || item?.hash || `${item?.numero_processo}|${item?.datadisponibilizacao}`);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        collected.push(item);
        added += 1;
      }
      if (items.length === 0 || added === 0) break;
      if (total !== null && collected.length >= total) break;
    }

    onProgress({ phase: 'capture', action: `${collected.length} comunicação(ões) lida(s) na Central (janela ${dataInicio} a ${dataFim}).` });
    return { status: 'ok', items: collected, total, api: apiBase };
  } catch (error) {
    return { status: 'failed', items: [], error: { code: 'DOMICILIO_CENTRAL_ERROR', message: String(error?.message || error).slice(0, 200) } };
  } finally {
    page.off?.('request', listener);
  }
}

/**
 * Converte o item da Central para o contrato do normalizador, preservando o
 * **texto integral** declarado pela fonte.
 */
export function mapPortalItemToDomicilio(item) {
  const processo = item?.numeroprocessocommascara || item?.numero_processo || '';
  return {
    numeroComunicacao: item?.numeroComunicacao || item?.hash || '',
    numeroProcesso: digits(processo),
    tribunalOrigem: item?.siglaTribunal || item?.tribunal || '',
    tipoComunicacao: item?.tipoDocumento || item?.nomeClasse || 'Comunicação',
    tipoIntimacao: item?.tipoDocumento || '',
    dataComunicacao: item?.datadisponibilizacao || item?.dataDisponibilizacao || '',
    prazo: item?.prazo ?? '',
    dataFinalCiencia: item?.dataFinalCiencia ?? '',
    texto: item?.texto || '',
    meioEnvio: item?.meio || item?.meiocompleto || '',
    link: item?.link || '',
    hash: item?.hash || '',
    destinatarios: item?.destinatarios || null,
    representantes: Array.isArray(item?.destinatarioadvogados) ? item.destinatarioadvogados : []
  };
}
