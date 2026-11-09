/**
 * ATRIUM — Captura do Domicílio Eletrônico (redundância de intimações).
 *
 * Orquestra a leitura da janela oficial (7 dias na primeira captura, 2 dias nos
 * ciclos seguintes), normaliza para o registro oficial e devolve um resultado
 * honesto: nada é persistido aqui e uma falha nunca vira sucesso presumido.
 *
 * O resultado é consumido pelo caminho de persistência oficial do servidor
 * (`persistExternalCollectionsToCanonical`), que funde por identidade e despacha
 * o digest — o Domicílio nunca abre prazo, nunca dá ciência e nunca cria tarefa.
 */
import { normalizeDomicilioBatch } from './domicilio-normalizer.mjs';

export const DOMICILIO_FIRST_CAPTURE_DAYS = 7;
export const DOMICILIO_ROUTINE_CAPTURE_DAYS = 2;

function toIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Data inválida para a janela do Domicílio.');
  return date.toISOString().slice(0, 10);
}

/**
 * Janela de captura: 7 dias na primeira execução por workspace e 2 dias nos ciclos
 * seguintes (limite da API oficial por consulta).
 */
export function captureWindow({ now = new Date(), primeiraCaptura = false } = {}) {
  const days = primeiraCaptura ? DOMICILIO_FIRST_CAPTURE_DAYS : DOMICILIO_ROUTINE_CAPTURE_DAYS;
  const fim = toIsoDate(now);
  const start = new Date(`${fim}T12:00:00Z`).getTime() - (days - 1) * 86_400_000;
  return {
    dataInicio: new Date(start).toISOString().slice(0, 10),
    dataFim: fim,
    days,
    primeiraCaptura: Boolean(primeiraCaptura)
  };
}

/**
 * Executa a captura de um ciclo.
 * @param {object} options
 * @param {object} options.client cliente oficial (createDomicilioClient)
 * @param {object} options.session { accessToken, tenantId }
 * @param {Date} [options.now]
 * @param {boolean} [options.primeiraCaptura]
 * @returns {Promise<{status: string, intimations: Array, resumo: object, window: object, error: object|null}>}
 */
export async function captureDomicilioComunicacoes({
  client,
  session,
  now = new Date(),
  primeiraCaptura = false,
  maxPages = undefined
} = {}) {
  const window = captureWindow({ now, primeiraCaptura });
  if (!client || typeof client.listarComunicacoes !== 'function') {
    return { status: 'unavailable', intimations: [], resumo: { recebidas: 0, normalizadas: 0, ignoradas: 0 }, window, error: { code: 'DOMICILIO_CLIENT_MISSING', message: 'Cliente do Domicílio Eletrônico indisponível.' } };
  }
  try {
    const listing = await client.listarComunicacoes(session, {
      dataInicio: window.dataInicio,
      dataFim: window.dataFim,
      ...(Number.isFinite(Number(maxPages)) ? { maxPages: Number(maxPages) } : {})
    });
    const batch = normalizeDomicilioBatch(listing.items, { collectedAt: new Date(now).toISOString() });
    return {
      status: listing.truncated ? 'partial' : 'ok',
      intimations: batch.intimations,
      resumo: {
        ...batch.resumo,
        paginas: listing.pages.length,
        truncada: listing.truncated
      },
      window,
      error: listing.truncated
        ? { code: 'DOMICILIO_PARTIAL', message: 'A captura atingiu o teto de páginas e ficou parcial; o ciclo seguinte reconsulta a janela.' }
        : null
    };
  } catch (error) {
    return {
      status: 'failed',
      intimations: [],
      resumo: { recebidas: 0, normalizadas: 0, ignoradas: 0 },
      window,
      error: {
        code: String(error?.code || 'DOMICILIO_ERROR'),
        message: String(error?.message || 'Falha na captura do Domicílio Eletrônico.').slice(0, 300),
        statusCode: Number.isFinite(Number(error?.statusCode)) ? Number(error.statusCode) : null
      }
    };
  }
}
