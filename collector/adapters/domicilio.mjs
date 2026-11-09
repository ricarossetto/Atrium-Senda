/**
 * ATRIUM — Adaptador do coletor para o Domicílio Eletrônico (PDPJ/Jus.br).
 *
 * Executa dentro do navegador automatizado já autenticado pelo usuário (A1 ou
 * conta PDPJ): lê a sessão da página, roda a captura da janela vigente e devolve
 * as intimações oficiais para o runtime persistir. Somente leitura: não informa
 * ciência, não peticiona, não assina e não altera o portal.
 *
 * Quando não há sessão válida, devolve `status: 'sem-sessao'` — nunca inventa
 * sucesso nem dispara autenticação por conta própria.
 */
import { createDomicilioClient } from '../../lib/judicial/domicilio/domicilio-client.mjs';
import { resolveDomicilioSession } from '../../lib/judicial/domicilio/domicilio-session.mjs';
import { captureDomicilioComunicacoes, captureWindow } from '../../lib/judicial/domicilio/domicilio-capture.mjs';

export const DOMICILIO_PORTAL_ID = 'domicilio-eletronico';

/**
 * Captura CRUA (sem normalizar): devolve os DTOs oficiais para o servidor, que é a
 * autoridade da normalização, da janela durável e da persistência oficial. Assim o
 * coletor não duplica contrato nem inventa campos.
 */
export async function captureDomicilioRaw(page, {
  client = null,
  dataInicio,
  dataFim,
  deps = {},
  maxPages = undefined
} = {}) {
  const official = client || createDomicilioClient({ fetchImpl: deps.fetchImpl });
  const session = await resolveDomicilioSession(page, { client: official, deps: deps.session || {} });
  if (!session?.tenantId) {
    return {
      status: 'sem-sessao',
      comunicacoes: [],
      error: { code: 'DOMICILIO_SESSION_MISSING', message: 'Sessão do Domicílio Eletrônico não localizada no navegador autenticado.' }
    };
  }
  try {
    const listing = await official.listarComunicacoes(session, {
      dataInicio,
      dataFim,
      ...(Number.isFinite(Number(maxPages)) ? { maxPages: Number(maxPages) } : {})
    });
    return {
      status: listing.truncated ? 'partial' : 'ok',
      comunicacoes: listing.items,
      paginas: listing.pages.length,
      truncated: listing.truncated,
      origem: session.origem,
      error: listing.truncated
        ? { code: 'DOMICILIO_PARTIAL', message: 'A captura atingiu o teto de páginas e ficou parcial; o ciclo seguinte reconsulta a janela.' }
        : null
    };
  } catch (error) {
    return {
      status: 'failed',
      comunicacoes: [],
      error: {
        code: String(error?.code || 'DOMICILIO_ERROR'),
        message: String(error?.message || 'Falha na captura do Domicílio Eletrônico.').slice(0, 300)
      }
    };
  }
}

export async function collectDomicilio(page, {
  client = null,
  now = new Date(),
  primeiraCaptura = false,
  deps = {},
  maxPages = undefined
} = {}) {
  const official = client || createDomicilioClient({ fetchImpl: deps.fetchImpl });
  const session = await resolveDomicilioSession(page, { client: official, deps: deps.session || {} });
  if (!session?.tenantId) {
    return {
      status: 'sem-sessao',
      intimations: [],
      resumo: { recebidas: 0, normalizadas: 0, ignoradas: 0 },
      window: captureWindow({ now, primeiraCaptura }),
      error: { code: 'DOMICILIO_SESSION_MISSING', message: 'Sessão do Domicílio Eletrônico não localizada no navegador autenticado.' }
    };
  }
  const result = await captureDomicilioComunicacoes({ client: official, session, now, primeiraCaptura, maxPages });
  return { ...result, origem: session.origem };
}
