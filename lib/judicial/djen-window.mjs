/**
 * Janela de captura do DJEN por workspace.
 *
 * Regra de produto: a primeira captura bem-sucedida de um workspace busca 60 dias
 * de publicações; as seguintes usam apenas os últimos 2 dias (cadência 07h/19h e
 * botão de sincronizar). O marcador é persistido em `djen-sync.json` no diretório
 * de dados do workspace, fora do estado editável pelo frontend.
 */

export const DJEN_INITIAL_LOOKBACK_DAYS = 60;
export const DJEN_ROUTINE_LOOKBACK_DAYS = 2;
export const DJEN_TERM_BUDGET_PER_RUN = 25;

export function resolveDjenCaptureWindow(marker = {}, env = process.env) {
  const initialCapture = !marker?.initialCaptureCompletedAt;
  const lookbackDays = initialCapture ? DJEN_INITIAL_LOOKBACK_DAYS : DJEN_ROUTINE_LOOKBACK_DAYS;
  const trackingSince = String(env?.ATRIUM_DJEN_TRACKING_SINCE || '').trim() || null;
  return {
    initialCapture,
    lookbackDays,
    intimationLookbackDays: lookbackDays,
    intimationTrackingSince: trackingSince
  };
}

/**
 * Orçamento de termos por execução agendada com rotação durável.
 *
 * Cada run processa no máximo `budget` termos, continuando do cursor persistido
 * no marcador; a próxima run segue de onde a anterior parou e dá a volta na lista.
 * Enquanto a captura inicial não tiver coberto todos os termos, a janela de 60
 * dias permanece ativa para os termos ainda não cobertos.
 */
export function selectDjenTermsForRun(terms = [], marker = {}, { budget = DJEN_TERM_BUDGET_PER_RUN } = {}) {
  const list = Array.isArray(terms) ? terms : [];
  const limit = Math.max(1, Number(budget) || DJEN_TERM_BUDGET_PER_RUN);
  if (list.length <= limit) {
    return { terms: list, nextCursor: 0, fullCycleCompleted: true };
  }
  const rawCursor = Number(marker?.termCursor);
  const cursor = Number.isFinite(rawCursor) && rawCursor > 0 ? Math.floor(rawCursor) % list.length : 0;
  const rotated = [...list.slice(cursor), ...list.slice(0, cursor)];
  const selected = rotated.slice(0, limit);
  const nextCursor = (cursor + selected.length) % list.length;
  return { terms: selected, nextCursor, fullCycleCompleted: nextCursor === 0 };
}

export function nextDjenMarker(marker = {}, { completedAt = new Date().toISOString(), termCursor = null, initialCaptureCompleted = true } = {}) {
  const initialCaptureCompletedAt = marker?.initialCaptureCompletedAt
    || (initialCaptureCompleted ? completedAt : null);
  return {
    ...marker,
    ...(initialCaptureCompletedAt ? { initialCaptureCompletedAt } : {}),
    lastSuccessfulSyncAt: completedAt,
    ...(termCursor === null ? {} : { termCursor })
  };
}
