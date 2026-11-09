/**
 * ATRIUM — Conferência assistida de tarefas repetidas (JEV).
 *
 * A duplicata de tarefa tem duas naturezas:
 *
 * 1. **Identidade exata** — mesmo processo e mesma publicação de origem (ou mesmo rótulo de ato).
 *    Quem responde é a chave determinística (`planRepeatedTaskGroups`), sem modelo: a pergunta é
 *    "é o mesmo registro?", não "é o mesmo ato?". Absorção sempre humana.
 * 2. **Mesmo ato descrito de formas diferentes** — "Protocolar contestação" × "Apresentar defesa",
 *    prazo original × suspensão com outro rótulo, fontes distintas do mesmo ato. Aí a chave falha e
 *    o juízo é semântico: é o `task_duplicate_check` do JEV.
 *
 * Este módulo monta os pares candidatos da segunda natureza e o plano de absorção **autônoma**
 * autorizada pelo operador (veredito `mesma` com confiança ≥ 0.90), sempre com os trilhos:
 * tarefa absorvida precisa ser projeção intocada da fonte (sem prazo humano, prazo fatal, curadoria,
 * responsável, notas ou tempo apontado), o dono é escolhido pela regra determinística de frescor da
 * fonte e a absorção é reversível, auditada com ator próprio e limitada por execução.
 */
import {
  isSourceDeadlineTask,
  isUntouchedSourceTask,
  hasSourceOwnedDeadline,
  completePublicationTextKey,
  sourceActLabel,
  taskSourceFreshness
} from '../publications/source-deadline-consolidation.mjs';

/** Confiança mínima para o JEV absorver sozinho (decisão do operador, 2026-09-30). */
export const TASK_DUPLICATE_AUTO_ABSORB_CONFIDENCE = 0.9;
/** Teto de absorções automáticas por execução: soluço do modelo não varre o acervo. */
export const TASK_DUPLICATE_AUTO_ABSORB_LIMIT = 10;
/** Pares enviados ao modelo por rodada. */
export const TASK_DUPLICATE_REVIEW_PAIR_LIMIT = 12;
export const TASK_DUPLICATE_CANDIDATE_LIMIT = 500;
/** Tarefas consideradas por processo ao montar os pares (as mais recentes). */
const TASKS_PER_PROCESS = 100;
const MAX_CANDIDATE_PAIRS = 10_000;
/** Texto comparado por lado, em caracteres. */
const SIDE_TEXT_LIMIT = 900;

const ABSORB_REASON_AUTONOMOUS = 'same-act-autonomous';

function textOrEmpty(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function digitsOf(value) {
  return String(value || '').replace(/\D/g, '');
}

function timestampOf(value) {
  const parsed = Date.parse(textOrEmpty(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function liveTask(task) {
  if (!task || typeof task !== 'object' || !textOrEmpty(task.id)) return null;
  if (task.absorbedInto || task.active === false) return null;
  if (textOrEmpty(task.status) === 'concluida') return null;
  return task;
}

function publicationKeyOf(task) {
  for (const field of ['sourceIntimationId', 'intimationId', 'publicationId']) {
    const value = textOrEmpty(task?.[field]);
    if (value) return value;
  }
  return '';
}

function pairKey(idA, idB) {
  return [String(idA), String(idB)].sort().join('|');
}

function sideText(task) {
  const partes = [
    `ato: ${sourceActLabel({ task }) || 'não informado'}`,
    `título: ${textOrEmpty(task.title) || 'sem título'}`,
    `descrição: ${textOrEmpty(task.description).slice(0, SIDE_TEXT_LIMIT) || 'sem descrição'}`,
    `prazo: ${textOrEmpty(task.deadline) || 'sem prazo'}`,
    `prazo declarado pela fonte: ${textOrEmpty(task.sourceReportedDeadlineAt) || 'não informado'}`,
    `prazo fatal: ${textOrEmpty(task.fatalDeadline) || 'não informado'}`,
    `fonte: ${textOrEmpty(task.source) || 'não informada'}`,
    `situação: ${textOrEmpty(task.status) || 'não informada'}`,
    `responsável: ${textOrEmpty(task.responsible) ? 'definido' : 'não definido'}`,
    `criada em: ${textOrEmpty(task.createdAt)}`
  ];
  return partes.join('\n');
}

/**
 * Pares do mesmo processo que a chave determinística **não** agruparia (publicações de origem
 * diferentes ou ausentes) e que ainda estão vivos. Ordenados de forma estável para o mesmo estado
 * produzir sempre os mesmos pares (e o mesmo custo).
 */
export function planTaskDuplicateCandidatePairs({
  tasks = [],
  intimationOf = null,
  isReviewed = null,
  limit = TASK_DUPLICATE_REVIEW_PAIR_LIMIT
} = {}) {
  const resolveIntimation = typeof intimationOf === 'function' ? intimationOf : () => null;
  const contentKeys = new Map();
  const textKey = task => {
    if (!contentKeys.has(task)) contentKeys.set(task, completePublicationTextKey(resolveIntimation(task)));
    return contentKeys.get(task);
  };
  const porProcesso = new Map();
  for (const task of Array.isArray(tasks) ? tasks : []) {
    const viva = liveTask(task);
    if (!viva) continue;
    const processKey = digitsOf(viva.process || viva.processNumber);
    if (processKey.length !== 20) continue;
    if (!porProcesso.has(processKey)) porProcesso.set(processKey, []);
    porProcesso.get(processKey).push(viva);
  }
  const candidatos = [];
  let truncated = false;
  for (const processKey of [...porProcesso.keys()].sort()) {
    if (porProcesso.get(processKey).length > TASKS_PER_PROCESS) truncated = true;
    const doProcesso = porProcesso.get(processKey)
      .slice()
      .sort((left, right) => timestampOf(right.updatedAt || right.createdAt) - timestampOf(left.updatedAt || left.createdAt) || String(left.id).localeCompare(String(right.id)))
      .slice(0, TASKS_PER_PROCESS);
    for (let i = 0; i < doProcesso.length; i += 1) {
      for (let j = i + 1; j < doProcesso.length; j += 1) {
        const a = doProcesso[i];
        const b = doProcesso[j];
        const pubA = publicationKeyOf(a);
        const pubB = publicationKeyOf(b);
        // Mesma publicação (ou já vista na conferência determinística) não é caso do modelo.
        if (pubA && pubA === pubB) continue;
        if (candidatos.length >= MAX_CANDIDATE_PAIRS) { truncated = true; break; }
        const aKey = textKey(a);
        const bKey = textKey(b);
        const sameDocument = Boolean(aKey && aKey === bKey);
        const sameDeadline = Boolean(textOrEmpty(a.deadline) && textOrEmpty(a.deadline) === textOrEmpty(b.deadline));
        const sameTitle = Boolean(textOrEmpty(a.title) && textOrEmpty(a.title).toLowerCase() === textOrEmpty(b.title).toLowerCase());
        candidatos.push({
          key: pairKey(a.id, b.id),
          aId: String(a.id),
          bId: String(b.id),
          processKey,
          aTitle: textOrEmpty(a.title).slice(0, 120),
          bTitle: textOrEmpty(b.title).slice(0, 120),
          aActLabel: sourceActLabel({ task: a }),
          bActLabel: sourceActLabel({ task: b }),
          publicationFingerprint: `${aKey}|${bKey}`,
          text: `LEITURA A (tarefa ${textOrEmpty(a.id)})\n${sideText(a)}\n\nLEITURA B (tarefa ${textOrEmpty(b.id)})\n${sideText(b)}${sameDocument ? '\n\nO texto integral da publicação é idêntico nos dois registros.' : ''}`,
          priority: (sameDocument ? 4 : 0) + (sameDeadline ? 2 : 0) + (sameTitle ? 1 : 0)
        });
      }
      if (candidatos.length >= MAX_CANDIDATE_PAIRS) break;
    }
    if (candidatos.length >= MAX_CANDIDATE_PAIRS) break;
  }
  const size = Math.max(1, Number(limit) || TASK_DUPLICATE_REVIEW_PAIR_LIMIT);
  const reviewed = typeof isReviewed === 'function' ? isReviewed : () => false;
  for (const candidate of candidatos) candidate.reviewed = Boolean(reviewed(candidate));
  candidatos.sort((a, b) => Number(a.reviewed) - Number(b.reviewed) || b.priority - a.priority || a.key.localeCompare(b.key));
  const cappedSize = Math.min(size, TASK_DUPLICATE_CANDIDATE_LIMIT);
  return { pairs: candidatos.slice(0, cappedSize), truncated: truncated || candidatos.length >= MAX_CANDIDATE_PAIRS || candidatos.length > cappedSize };
}

/**
 * Motivo pelo qual uma tarefa **nunca** pode ser absorvida sozinha. Vazio = elegível.
 * É a mesma trava da consolidação conservadora: qualquer dado humano tira a tarefa da autonomia.
 */
export function taskAutonomyBlocker(task, { intimation = null } = {}) {
  if (!task || typeof task !== 'object') return 'tarefa-ausente';
  if (!isSourceDeadlineTask(task, { intimation })) return 'sem-prazo-da-fonte';
  if (!hasSourceOwnedDeadline(task)) return 'prazo-humano';
  if (textOrEmpty(task.fatalDeadline)) return 'prazo-fatal-humano';
  if (!isUntouchedSourceTask(task)) return 'curadoria-humana';
  return '';
}

/**
 * Dono determinístico do par: quem tem a declaração de fonte mais recente prevalece (§16). Nunca é
 * o modelo que escolhe — a mesma regra vale para a autonomia e para o botão do painel.
 *
 * A intimação de cada lado entra na conta: sem ela, a "frescor" cairia no `updatedAt` da tarefa,
 * que é reescrito a cada coleta — e a autonomia poderia absorver a declaração **nova** mantendo a
 * **velha** (achado do crítico adversarial de 2026-09-30).
 */
export function taskPairKeeper(a, b, { intimationA = null, intimationB = null } = {}) {
  return taskSourceFreshness(a, intimationA) >= taskSourceFreshness(b, intimationB) ? a : b;
}

/**
 * Plano de absorção autônoma a partir dos vereditos do modelo. Nunca muta estado: devolve o que
 * absorver (`absorptions`), o que **fica para gente** (`kept`, com o motivo) e o resultado da
 * chamada de absorção é do chamador.
 */
export function planTaskAutoAbsorptions({
  tasks = [],
  verdicts = [],
  threshold = TASK_DUPLICATE_AUTO_ABSORB_CONFIDENCE,
  limit = TASK_DUPLICATE_AUTO_ABSORB_LIMIT,
  intimationOf = null
} = {}) {
  const limite = Math.max(0, Number(limit) || 0);
  const porId = new Map((Array.isArray(tasks) ? tasks : []).filter(task => task && task.id).map(task => [String(task.id), task]));
  const elegiveis = [];
  const kept = [];
  for (const verdict of Array.isArray(verdicts) ? verdicts : []) {
    const key = textOrEmpty(verdict?.key);
    const aId = String(verdict?.aId || '');
    const bId = String(verdict?.bId || '');
    const confianca = Number(verdict?.confidence) || 0;
    const veredito = textOrEmpty(verdict?.verdict);
    if (!aId || !bId) {
      kept.push({ key, motivo: 'par-invalido' });
      continue;
    }
    if (veredito !== 'mesma') {
      kept.push({ key, aId, bId, motivo: veredito === 'diferente' ? 'evento-distinto' : 'incerto' });
      continue;
    }
    if (confianca < threshold) {
      kept.push({ key, aId, bId, motivo: 'abaixo-do-limiar', confidence: confianca });
      continue;
    }
    const a = porId.get(aId);
    const b = porId.get(bId);
    if (!a || !b) {
      kept.push({ key, aId, bId, motivo: 'tarefa-ausente' });
      continue;
    }
    // O dono é decidido pela regra determinística de frescor da fonte — nunca pelo modelo: a
    // palavra mais recente da fonte prevalece (§16). A intimação de cada lado entra na conta.
    const intimacaoDe = typeof intimationOf === 'function' ? intimationOf : () => null;
    const keeper = taskPairKeeper(a, b, { intimationA: intimacaoDe(a), intimationB: intimacaoDe(b) });
    const absorbed = keeper === a ? b : a;
    const motivo = taskAutonomyBlocker(absorbed, { intimation: intimacaoDe(absorbed) });
    if (motivo) {
      kept.push({ key, aId, bId, motivo, confidence: confianca });
      continue;
    }
    if (taskAutonomyBlocker(keeper, { intimation: intimacaoDe(keeper) })) {
      // Dono com dado humano: absorver nele mudaria a curadoria de quem fica — fica para gente.
      kept.push({ key, aId, bId, motivo: 'dono-com-curadoria', confidence: confianca });
      continue;
    }
    elegiveis.push({
      key,
      keeperId: String(keeper.id),
      absorbedId: String(absorbed.id),
      confidence: confianca,
      reason: ABSORB_REASON_AUTONOMOUS,
      detail: textOrEmpty(verdict?.reason).slice(0, 200)
    });
  }
  elegiveis.sort((left, right) => (right.confidence - left.confidence) || left.key.localeCompare(right.key));
  const absorptions = elegiveis.slice(0, limite);
  for (const excedente of elegiveis.slice(limite)) {
    kept.push({ key: excedente.key, aId: excedente.keeperId, bId: excedente.absorbedId, motivo: 'teto-da-execucao', confidence: excedente.confidence });
  }
  return { absorptions, kept, threshold, limit: limite };
}

export { ABSORB_REASON_AUTONOMOUS };
