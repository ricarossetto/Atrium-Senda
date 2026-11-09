/**
 * ATRIUM — Consolidação de tarefas duplicadas de prazo da fonte oficial.
 *
 * Contexto real (29/09/2026): duas suspensões no prazo de um processo geraram **três tarefas**
 * para o mesmo CNJ, com prazos internos diferentes (29/09, 30/09 e 01/10) e títulos de eras
 * distintas ("Conferir prazo informado pelo eproc — …" do modo manual e "Prazo eproc — …" do
 * modo automático). Cada varredura do Painel do Advogado trouxe uma linha nova (evento/`sentAt`
 * diferente), o que produz `externalId` distinto, intimação distinta e tarefa distinta: o prazo
 * da fonte acompanhava a publicação, mas a tarefa anterior continuava viva ao lado da nova.
 *
 * Regra (mesmo padrão da fusão de publicações, aplicada a tarefas):
 * - só entram tarefas **projetadas pela fonte** (`eproc`/`pje`), nunca tarefa criada por pessoa;
 * - a família é o par **processo (CNJ) + ato da fonte** (evento/título da intimação, com o
 *   prefixo do modo removido) — prazos de atos diferentes no mesmo processo não se misturam;
 * - o **keeper** é a tarefa ligada à declaração **mais recente** da fonte naquela família
 *   (`sourceDeadlineChangedAt` → `sourceReportedAt` → `sourceCollectedAt` → `updatedAt`);
 * - só é absorvida tarefa **intocada** (snapshot da fonte intacto, sem prazo fatal, sem
 *   responsável, sem cliente, sem nota, sem apontamento, prioridade normal, etapa de triagem)
 *   e cujo prazo vigente **é o declarado pela própria fonte** — prazo digitado por pessoa
 *   (`deadlineSource` vazio) **nunca** é absorvido (`specs/human-deadline-policy.md`);
 * - a absorção é **reversível**: o perdedor recebe `absorbedInto`/`absorbedAt`/`absorbReason`,
 *   `active = false` e o prazo anterior entra no histórico do keeper; nada é removido do estado.
 *
 * Módulo puro: não faz I/O, não conhece HTTP e não decide sozinho — o chamador aplica o plano
 * dentro da mutação serializada do app-state.
 */
import { createHash } from 'node:crypto';

const SOURCE_PROJECTED_DEADLINE_SOURCES = new Set(['eproc', 'pje']);
const ABSORB_REASON = 'same-source-deadline';
const TITLE_PREFIX_PATTERN = /^(?:conferir\s+prazo\s+informado\s+pel[oa]\s+\w+|prazo\s+\w+)\s*[—–-]\s*/i;

function textOrEmpty(value) {
  return String(value ?? '').trim();
}

export function normalizeCnjDigits(value) {
  return textOrEmpty(value).replace(/\D/g, '');
}

/** Rótulo do ato, independente do modo (`manual`/`auto`) que gerou o título da tarefa. */
export function sourceActLabel({ intimation = null, task = null } = {}) {
  const fromSource = textOrEmpty(intimation?.event) || textOrEmpty(intimation?.subject) || textOrEmpty(intimation?.title);
  if (fromSource) return fromSource.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
  const title = textOrEmpty(task?.title).replace(TITLE_PREFIX_PATTERN, '');
  return title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
}

function taskReferenceKeys(task) {
  const keys = [];
  for (const field of ['intimationId', 'sourceIntimationId', 'publicationId', 'intimationKey']) {
    const value = textOrEmpty(task?.[field]);
    if (value && !keys.includes(value)) keys.push(value);
  }
  return keys;
}

function intimationReferenceKeys(intimation) {
  const keys = [];
  for (const value of [intimation?.id, intimation?.externalId]) {
    const text = textOrEmpty(value);
    if (text && !keys.includes(text)) keys.push(text);
  }
  return keys;
}

/** Tarefa projetada pela fonte oficial? Exige vínculo com intimação de `eproc`/`pje`. */
export function isSourceDeadlineTask(task, { intimation = null } = {}) {
  if (!task || typeof task !== 'object' || !textOrEmpty(task.id)) return false;
  if (task.absorbedInto) return false;
  if (!textOrEmpty(task.sourceReportedDeadlineAt)) return false;
  const source = textOrEmpty(intimation?.source || task.source).toLowerCase();
  const declaredSource = textOrEmpty(task.deadlineSource).toLowerCase();
  return SOURCE_PROJECTED_DEADLINE_SOURCES.has(source) || SOURCE_PROJECTED_DEADLINE_SOURCES.has(declaredSource);
}

/**
 * Tarefa intocada desde a última projeção da fonte. Espelha o critério já usado na reconciliação
 * do eproc (`sourceManagedSnapshot`): qualquer curadoria humana tira a tarefa da absorção.
 */
export function isUntouchedSourceTask(task) {
  if (!task || typeof task !== 'object') return false;
  const snapshot = task.sourceManagedSnapshot;
  if (!snapshot) return false;
  if (textOrEmpty(task.title) !== textOrEmpty(snapshot.title)) return false;
  if (textOrEmpty(task.description) !== textOrEmpty(snapshot.description)) return false;
  if (textOrEmpty(task.deadline) !== textOrEmpty(snapshot.deadline)) return false;
  if (textOrEmpty(task.fatalDeadline)) return false;
  if (textOrEmpty(task.responsible)) return false;
  if (textOrEmpty(task.client)) return false;
  if (textOrEmpty(task.notes)) return false;
  if (Array.isArray(task.responsibles) && task.responsibles.length > 0) return false;
  if (Array.isArray(task.timeLogs) && task.timeLogs.length > 0) return false;
  if (Number(task.timeSpentMinutes) > 0) return false;
  // Agendamento e desfecho são digitação humana no modal da tarefa: a autonomia não absorve
  // projeção que a pessoa já anotou (achado do crítico adversarial de 2026-09-30).
  if (textOrEmpty(task.date)) return false;
  if (textOrEmpty(task.time)) return false;
  if (textOrEmpty(task.resolution)) return false;
  if ((textOrEmpty(task.priority) || 'normal') !== 'normal') return false;
  if ((textOrEmpty(task.status) || 'triagem') !== 'triagem') return false;
  if (textOrEmpty(task.status) !== textOrEmpty(snapshot.status)) return false;
  return true;
}

/**
 * O prazo vigente é o que a própria fonte declarou? (só esse pode ser absorvido; valor digitado
 * por pessoa — divergente do declarado — permanece humano e intocável.)
 */
export function hasSourceOwnedDeadline(task) {
  const deadline = textOrEmpty(task?.deadline);
  if (!deadline) return true;
  return deadline === textOrEmpty(task?.sourceReportedDeadlineAt);
}

function intimationIndex(intimations = []) {
  const byKey = new Map();
  for (const intimation of Array.isArray(intimations) ? intimations : []) {
    if (!intimation || typeof intimation !== 'object' || intimation.mergedInto) continue;
    for (const key of intimationReferenceKeys(intimation)) {
      if (!byKey.has(key)) byKey.set(key, intimation);
    }
  }
  return byKey;
}

/** Índice por chave das intimações (id/externalId) — reexportado para quem precisa resolver a
 *  intimação de uma tarefa fora deste módulo (ex.: escolha determinística do dono no JEV). */
export function intimationIndexByKey(intimations = []) {
  return intimationIndex(intimations);
}

export function resolveTaskIntimation(task, byKey) {
  for (const key of taskReferenceKeys(task)) {
    const intimation = byKey.get(key);
    if (intimation) return intimation;
  }
  return null;
}

function processKeyOf(task, intimation) {
  const fromTask = normalizeCnjDigits(task?.process || task?.processNumber);
  if (fromTask.length === 20) return fromTask;
  const fromIntimation = normalizeCnjDigits(intimation?.process || intimation?.processNumber);
  return fromIntimation.length === 20 ? fromIntimation : '';
}

function timestampOf(value) {
  const parsed = Date.parse(textOrEmpty(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Momento da declaração da fonte: mudança de prazo > reporte > coleta > atualização da tarefa. */
export function taskSourceFreshness(task, intimation = null) {
  return timestampOf(intimation?.sourceDeadlineChangedAt)
    || timestampOf(intimation?.sourceReportedAt)
    || timestampOf(intimation?.sourceCollectedAt)
    || timestampOf(intimation?.lastSeenAt)
    || timestampOf(task?.sourceDeadlineChangedAt)
    || timestampOf(task?.updatedAt)
    || timestampOf(task?.createdAt);
}

function sourceFreshness(member) {
  return taskSourceFreshness(member?.task, member?.intimation);
}

/**
 * Plano de consolidação. Agrupa por processo + ato da fonte e elege como keeper a tarefa da
 * declaração mais recente daquela família.
 */
export function planSourceDeadlineTaskConsolidation({ tasks = [], intimations = [] } = {}) {
  const groups = [];
  const absorptions = [];
  if (!Array.isArray(tasks) || tasks.length < 2) return { groups, absorptions };

  const byKey = intimationIndex(intimations);
  const buckets = new Map();
  for (const task of tasks) {
    if (!task || typeof task !== 'object') continue;
    const intimation = resolveTaskIntimation(task, byKey);
    if (!isSourceDeadlineTask(task, { intimation })) continue;
    const processKey = processKeyOf(task, intimation);
    if (!processKey) continue;
    const actLabel = sourceActLabel({ intimation, task });
    if (!actLabel) continue;
    const bucketKey = `${processKey}|${actLabel}`;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey).push({ task, intimation, actLabel, processKey });
  }

  for (const [bucketKey, members] of buckets) {
    if (members.length < 2) continue;
    const ordered = members.slice().sort((left, right) => sourceFreshness(right) - sourceFreshness(left));
    const keeperMember = ordered[0];
    const group = {
      key: bucketKey,
      processKey: keeperMember.processKey,
      actLabel: keeperMember.actLabel,
      sourceValue: textOrEmpty(keeperMember.intimation?.sourceReportedDeadlineAt) || textOrEmpty(keeperMember.task.sourceReportedDeadlineAt),
      keeperId: textOrEmpty(keeperMember.task.id),
      members: members.map(member => textOrEmpty(member.task.id)),
      absorbable: [],
      preserved: []
    };
    for (const member of ordered.slice(1)) {
      const eligible = isUntouchedSourceTask(member.task) && hasSourceOwnedDeadline(member.task);
      if (!eligible) {
        group.preserved.push(textOrEmpty(member.task.id));
        continue;
      }
      group.absorbable.push(textOrEmpty(member.task.id));
      absorptions.push({
        keeperId: group.keeperId,
        absorbedId: textOrEmpty(member.task.id),
        processKey: group.processKey,
        sourceValue: group.sourceValue,
        absorbedDeadline: textOrEmpty(member.task.deadline),
        absorbedSourceValue: textOrEmpty(member.task.sourceReportedDeadlineAt),
        reason: ABSORB_REASON
      });
    }
    // A família é sempre relatada — inclusive quando nada é absorvível — para que a
    // conferência humana enxergue a duplicata que ficou preservada por curadoria.
    groups.push(group);
  }

  return { groups, absorptions };
}

/**
 * Aplica o plano no estado oficial. Mutação restrita a `state.tasks` (mais o vínculo
 * `linkedTaskIds`/`taskId` das intimações); devolve as entradas de auditoria sem PII.
 */
export function applySourceDeadlineTaskConsolidation(state, plan, { actor = 'Sincronização', nowIso = new Date().toISOString() } = {}) {
  const groups = Array.isArray(plan?.groups) ? plan.groups : [];
  const auditEntries = [];
  if (groups.length === 0) return { changed: false, absorbed: [], auditEntries };
  const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
  const byId = new Map(tasks.filter(task => task && task.id).map(task => [String(task.id), task]));
  const absorbed = [];
  const linkRewrites = new Map();
  let changed = false;

  for (const group of groups) {
    const keeper = byId.get(String(group.keeperId));
    if (!keeper || keeper.absorbedInto || keeper.active === false) continue;
    for (const absorbedId of Array.isArray(group.absorbable) ? group.absorbable : []) {
      const loser = byId.get(String(absorbedId));
      if (!loser || loser.absorbedInto) continue;
      const absorbedDeadline = textOrEmpty(loser.deadline);
      const absorbedSourceValue = textOrEmpty(loser.sourceReportedDeadlineAt);
      loser.absorbedInto = String(group.keeperId);
      loser.absorbedAt = nowIso;
      loser.absorbReason = ABSORB_REASON;
      loser.absorbedBy = String(actor || 'Sincronização').slice(0, 100);
      loser.active = false;
      loser.updatedAt = nowIso;
      loser.history = [...(Array.isArray(loser.history) ? loser.history : []), {
        at: nowIso,
        action: `Tarefa absorvida pela oficial ${String(group.keeperId)} (prazo da fonte ${group.sourceValue || 'não informado'})`,
        actor
      }].slice(-200);
      absorbed.push(String(loser.id));
      linkRewrites.set(String(loser.id), String(group.keeperId));

      keeper.history = [...(Array.isArray(keeper.history) ? keeper.history : []), {
        at: nowIso,
        action: `Absorveu a tarefa ${String(loser.id)} (prazo anterior ${absorbedDeadline || 'sem prazo'}${absorbedSourceValue && absorbedSourceValue !== absorbedDeadline ? `; fonte então ${absorbedSourceValue}` : ''})`,
        actor
      }].slice(-200);
      keeper.updatedAt = nowIso;
      changed = true;
    }
  }

  if (!changed) return { changed: false, absorbed: [], auditEntries };

  for (const intimation of Array.isArray(state?.intimations) ? state.intimations : []) {
    if (!intimation || typeof intimation !== 'object') continue;
    const linked = Array.isArray(intimation.linkedTaskIds) ? intimation.linkedTaskIds : [];
    let touched = false;
    const next = [];
    for (const id of linked) {
      const rewrite = linkRewrites.get(String(id));
      if (rewrite) {
        if (!next.includes(rewrite)) next.push(rewrite);
        touched = true;
        continue;
      }
      if (!next.includes(id)) next.push(id);
    }
    if (touched) intimation.linkedTaskIds = next;
    for (const [absorbedId, keeperId] of linkRewrites) {
      if (intimation.taskId === absorbedId) intimation.taskId = keeperId;
    }
  }

  for (const group of groups) {
    auditEntries.push({
      id: `aud-prazo-consol-${Date.now().toString(36)}-${String(group.keeperId).slice(-6)}`,
      at: nowIso,
      action: 'Tarefas duplicadas de prazo consolidadas',
      detail: `Oficial ${group.keeperId} absorveu ${group.absorbable.join(', ')} (processo ${group.processKey}; prazo da fonte ${group.sourceValue || 'não informado'}; absorção reversível)`.slice(0, 500),
      actor: String(actor || 'Sincronização').slice(0, 100)
    });
  }

  return { changed: true, absorbed, auditEntries };
}

export const SOURCE_DEADLINE_CONSOLIDATION_REASON = ABSORB_REASON;

/** Identidade da publicação de origem da tarefa (externalId/id oficial), ou '' quando não houver. */
function publicationKeyOf(task, intimation) {
  const daIntimacao = textOrEmpty(intimation?.externalId) || textOrEmpty(intimation?.id);
  if (daIntimacao) return daIntimacao;
  return textOrEmpty(task?.sourceIntimationId) || textOrEmpty(task?.intimationId);
}

/**
 * Plano de **conferência humana** de tarefas repetidas — o par do painel de duplicatas de
 * publicações. O plano automático agrupa por `processo|rótulo do ato`, então prazo original e
 * suspensão (rótulos diferentes) nunca se encontram e a duplicata fica para sempre. Aqui o
 * agrupamento usa o **assunto comum** (processo + publicação de origem) e, quando os atos diferem
 * mas o processo e a natureza coincidem, o grupo é oferecido mesmo assim — sempre com
 * `requiresHumanChoice: true`. **Este plano nunca absorve sozinho.**
 */
function normalizeGroupText(value) {
  return textOrEmpty(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function completePublicationTextKey(intimation) {
  const value = textOrEmpty(intimation?.fullText);
  if (value.length < 80 || value.length >= 200_000 || /(?:\.\.\.|…)$/.test(value)) return '';
  if (/processo sigiloso|conte[uú]do indispon[ií]vel/i.test(value)) return '';
  return createHash('sha256').update(value.replace(/\s+/g, ' ')).digest('hex');
}

export function planRepeatedTaskGroups({ tasks = [], intimations = [], processes = [] } = {}) {
  const groups = [];
  if (!Array.isArray(tasks) || tasks.length < 2) return { groups };
  const byKey = intimationIndex(intimations);
  // Contexto do processo (ação e partes) para o grupo não ser só um número.
  const porProcesso = new Map();
  for (const processo of Array.isArray(processes) ? processes : []) {
    if (!processo || typeof processo !== 'object') continue;
    const chave = normalizeCnjDigits(processo.number || processo.processNumber);
    if (chave.length === 20 && !porProcesso.has(chave)) porProcesso.set(chave, processo);
  }
  const candidatos = [];
  for (const task of tasks) {
    if (!task || typeof task !== 'object') continue;
    if (task.absorbedInto || task.active === false) continue;
    if (textOrEmpty(task.status) === 'concluida') continue;
    const intimation = resolveTaskIntimation(task, byKey);
    const processKey = processKeyOf(task, intimation);
    if (!processKey) continue;
    candidatos.push({
      task,
      intimation,
      processKey,
      publicationKey: publicationKeyOf(task, intimation),
      actLabel: sourceActLabel({ intimation, task }),
      hasSourceDeadline: Boolean(textOrEmpty(intimation?.sourceReportedDeadlineAt) || textOrEmpty(task?.sourceReportedDeadlineAt) || textOrEmpty(task?.deadlineSource))
    });
  }

  const buckets = new Map();
  const empurrar = (chave, membro, tipo) => {
    if (!buckets.has(chave)) buckets.set(chave, { tipo, membros: [] });
    const balde = buckets.get(chave);
    if (!balde.membros.some(item => String(item.task.id) === String(membro.task.id))) balde.membros.push(membro);
  };
  for (const membro of candidatos) {
    const contentKey = completePublicationTextKey(membro.intimation);
    const deadline = textOrEmpty(membro.task.deadline);
    if (contentKey && deadline && membro.publicationKey) {
      empurrar(`${membro.processKey}|conteudo:${contentKey}|prazo:${deadline}`, membro, 'mesmo-conteudo');
    }
    if (membro.publicationKey) {
      empurrar(`${membro.processKey}|pub:${membro.publicationKey}`, membro, 'mesma-publicacao');
      continue;
    }
    // Mesmo processo e mesmo título: cobre a tarefa repetida criada à mão, inclusive quando
    // a única diferença é o prazo. O ato da fonte entra como família separada só quando muda o rótulo.
    const titleKey = normalizeGroupText(membro.task.title);
    if (titleKey.length >= 8) empurrar(`${membro.processKey}|titulo:${titleKey}`, membro, 'mesma-tarefa');
    if (membro.actLabel && normalizeGroupText(membro.actLabel) !== titleKey) {
      empurrar(`${membro.processKey}|ato:${membro.actLabel}`, membro, 'mesmo-ato');
    }
  }

  for (const [chave, balde] of buckets) {
    if (balde.membros.length < 2) continue;
    if (balde.tipo === 'mesmo-conteudo' && new Set(balde.membros.map(member => member.publicationKey)).size < 2) continue;
    const ordenado = balde.membros.slice().sort((a, b) => sourceFreshness(b) - sourceFreshness(a));
    const sugestao = ordenado[0];
    const titles = new Set(ordenado.map(membro => normalizeGroupText(membro.task.title)));
    const deadlines = new Set(ordenado.map(membro => textOrEmpty(membro.task.deadline)));
    const descriptions = new Set(ordenado.map(membro => normalizeGroupText(membro.task.description)));
    const clients = new Set(ordenado.map(membro => normalizeGroupText(membro.task.client)));
    let classification = balde.tipo;
    if (titles.size === 1) {
      const sameBody = descriptions.size === 1 && clients.size === 1;
      classification = sameBody && deadlines.size === 1 ? 'identica' : sameBody ? 'prazo-diferente' : 'mesma-tarefa';
    }
    const processo = porProcesso.get(sugestao.processKey) || {};
    groups.push({
      key: chave,
      kind: balde.tipo,
      classification,
      processKey: sugestao.processKey,
      actionType: textOrEmpty(processo.actionType).slice(0, 90),
      actionGroup: textOrEmpty(processo.actionGroup).slice(0, 60),
      client: textOrEmpty(processo.client || processo.clientName).slice(0, 90),
      opposingParty: textOrEmpty(processo.opposingParty).slice(0, 90),
      courtUnit: textOrEmpty(processo.courtUnit || processo.court).slice(0, 90),
      requiresHumanChoice: true,
      actLabels: [...new Set(ordenado.map(membro => membro.actLabel).filter(Boolean))],
      suggestedKeeperId: textOrEmpty(sugestao.task.id),
      members: ordenado.map(membro => ({
        id: textOrEmpty(membro.task.id),
        title: textOrEmpty(membro.task.title).slice(0, 120),
        deadline: textOrEmpty(membro.task.deadline),
        fatalDeadline: textOrEmpty(membro.task.fatalDeadline),
        status: textOrEmpty(membro.task.status),
        responsible: textOrEmpty(membro.task.responsible).slice(0, 80),
        deadlineSource: textOrEmpty(membro.task.deadlineSource) || (membro.hasSourceDeadline ? 'fonte' : ''),
        sourceReportedDeadlineAt: textOrEmpty(membro.task.sourceReportedDeadlineAt),
        humanOwned: !textOrEmpty(membro.task.deadlineSource) && !membro.hasSourceDeadline,
        actLabel: membro.actLabel,
        createdAt: textOrEmpty(membro.task.createdAt)
      })),
      differences: [...new Set(ordenado.map(membro => [
        textOrEmpty(membro.task.deadline) || 'sem prazo',
        membro.actLabel || 'ato não informado',
        textOrEmpty(membro.task.responsible) || 'sem responsável'
      ].join(' · ')))].length > 1
    });
  }
  return { groups };
}

/**
 * Absorve, **com decisão humana explícita**, as tarefas repetidas de um grupo no keeper escolhido.
 * Mesma escrita reversível do plano automático (`absorbedInto`/`absorbedAt`/`absorbReason`),
 * com histórico nos dois lados, remendo de vínculo das publicações e auditoria.
 */
export function applyTaskGroupConsolidation(state, { keeperId = '', loserIds = [], actor = 'Revisão humana', nowIso = new Date().toISOString(), reason = ABSORB_REASON, decision = 'humana' } = {}) {
  const auditEntries = [];
  const automatica = String(decision) === 'automatica';
  const rotuloDecisao = automatica ? 'por decisão autônoma do Atrium IA' : 'por decisão humana';
  const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
  const byId = new Map(tasks.filter(task => task && task.id).map(task => [String(task.id), task]));
  const keeper = byId.get(String(keeperId));
  if (!keeper || keeper.absorbedInto || keeper.active === false) {
    return { changed: false, absorbed: [], auditEntries, reason: 'keeper-indisponivel' };
  }
  const absorbed = [];
  const linkRewrites = new Map();
  for (const id of Array.isArray(loserIds) ? loserIds : []) {
    const alvo = String(id);
    if (!alvo || alvo === String(keeperId)) continue;
    const loser = byId.get(alvo);
    if (!loser || loser.absorbedInto || loser.active === false) continue;
    const prazoAnterior = textOrEmpty(loser.deadline);
    loser.absorbedInto = String(keeperId);
    loser.absorbedAt = nowIso;
    loser.absorbReason = textOrEmpty(reason) || ABSORB_REASON;
    loser.absorbedBy = String(actor || 'Revisão humana').slice(0, 100);
    loser.active = false;
    loser.updatedAt = nowIso;
    loser.history = [...(Array.isArray(loser.history) ? loser.history : []), {
      at: nowIso,
      action: `Tarefa repetida absorvida pela oficial ${String(keeperId)} ${rotuloDecisao} (desfazer disponível)`,
      actor
    }].slice(-200);
    keeper.history = [...(Array.isArray(keeper.history) ? keeper.history : []), {
      at: nowIso,
      action: `Absorveu a tarefa repetida ${alvo} (prazo anterior ${prazoAnterior || 'sem prazo'}) ${rotuloDecisao}`,
      actor
    }].slice(-200);
    keeper.updatedAt = nowIso;
    absorbed.push(alvo);
    linkRewrites.set(alvo, String(keeperId));
  }
  if (absorbed.length === 0) return { changed: false, absorbed, auditEntries, reason: 'nada-a-absorver' };

  for (const intimation of Array.isArray(state?.intimations) ? state.intimations : []) {
    if (!intimation || typeof intimation !== 'object') continue;
    const linked = Array.isArray(intimation.linkedTaskIds) ? intimation.linkedTaskIds : [];
    let touched = false;
    const next = [];
    for (const id of linked) {
      const rewrite = linkRewrites.get(String(id));
      if (rewrite) {
        if (!next.includes(rewrite)) next.push(rewrite);
        touched = true;
        continue;
      }
      if (!next.includes(id)) next.push(id);
    }
    if (touched) intimation.linkedTaskIds = next;
    for (const [absorbedId, keeperFinal] of linkRewrites) {
      if (intimation.taskId === absorbedId) intimation.taskId = keeperFinal;
    }
  }

  auditEntries.push({
    id: `aud-tarefa-repetida-${Date.now().toString(36)}-${String(keeperId).slice(-6)}`,
    at: nowIso,
    action: automatica
      ? 'Tarefas repetidas consolidadas automaticamente pelo Atrium IA'
      : 'Tarefas repetidas consolidadas por decisão humana',
    detail: `Oficial ${keeperId} absorveu ${absorbed.join(', ')} (absorção reversível, com histórico nos dois lados)`.slice(0, 500),
    actor: String(actor || 'Revisão humana').slice(0, 100)
  });
  return { changed: true, absorbed, auditEntries, undo: absorbed.map(id => ({ id, absorbedInto: String(keeperId) })) };
}

/** Desfaz uma consolidação humana: devolve a tarefa absorvida ao fluxo. */
export function undoTaskGroupConsolidation(state, { absorbedId = '', actor = 'Revisão humana', nowIso = new Date().toISOString() } = {}) {
  const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
  const alvo = tasks.find(task => task && String(task.id) === String(absorbedId));
  if (!alvo || !alvo.absorbedInto) return { changed: false };
  const keeperId = String(alvo.absorbedInto);
  delete alvo.absorbedInto;
  delete alvo.absorbedAt;
  delete alvo.absorbReason;
  delete alvo.absorbedBy;
  alvo.active = true;
  alvo.updatedAt = nowIso;
  alvo.history = [...(Array.isArray(alvo.history) ? alvo.history : []), {
    at: nowIso,
    action: `Absorção desfeita: a tarefa voltou ao fluxo (não é mais a absorvida pela oficial ${keeperId})`,
    actor
  }].slice(-200);
  return { changed: true, id: String(absorbedId), keeperId };
}

/**
 * Guardião de criação: id da tarefa oficial já existente para a mesma família
 * (processo + ato da fonte), ou `''` quando não há. Usado pelo reconciliador do eproc para
 * **atualizar** a tarefa do prazo em vez de criar uma segunda quando o portal republica o
 * mesmo ato (suspensão, retificação, nova linha do Painel do Advogado).
 *
 * `intimations` é a lista oficial completa: cada candidata resolve a **própria** intimação
 * para comparar o ato — passar só a intimação nova faria toda candidata cair no fallback do
 * título e o guardião perderia a família.
 */
export function findCanonicalSourceTaskId(tasks = [], { process: processValue = '', intimations = [], actLabel = '', excludeId = '' } = {}) {
  const processKey = normalizeCnjDigits(processValue);
  if (!processKey) return '';
  const wanted = textOrEmpty(actLabel);
  if (!wanted) return '';
  const list = Array.isArray(tasks) ? tasks : [];
  const byKey = intimationIndex(intimations);
  const candidates = [];
  for (const task of list) {
    if (!task || typeof task !== 'object' || !textOrEmpty(task.id)) continue;
    if (task.absorbedInto || task.active === false) continue;
    if (excludeId && String(task.id) === String(excludeId)) continue;
    if (!isSourceDeadlineTask(task)) continue;
    if (normalizeCnjDigits(task.process || task.processNumber) !== processKey) continue;
    candidates.push(task);
  }
  if (candidates.length === 0) return '';
  const exact = candidates.filter(task => sourceActLabel({ intimation: resolveTaskIntimation(task, byKey), task }) === wanted);
  if (exact.length === 0) return '';
  const [canonical] = exact.sort((left, right) => timestampOf(right.updatedAt) - timestampOf(left.updatedAt));
  return String(canonical.id);
}

/**
 * Absorve a tarefa genérica de prazo da fonte quando a publicação passa a ter uma tarefa
 * específica (providência criada por pessoa). Só entra tarefa projetada pela fonte e intocada
 * (sem prazo humano, responsável, nota ou apontamento); a absorção é reversível e o prazo da
 * fonte é herdado pelo keeper quando ele ainda não tem prazo próprio.
 */
export function absorbSourceDeadlineTasksForPublication(state, { publicationId = '', keeperId = '', actor = 'Sistema', nowIso = new Date().toISOString(), reason = 'specific-task', canAbsorb = null } = {}) {
  const publication = textOrEmpty(publicationId);
  const keeper = textOrEmpty(keeperId);
  const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
  const intimations = Array.isArray(state?.intimations) ? state.intimations : [];
  if (!publication || !keeper) return { changed: false, absorbed: [], auditEntries: [] };
  const keeperTask = tasks.find(task => task && String(task.id) === keeper);
  if (!keeperTask || keeperTask.absorbedInto || keeperTask.active === false) return { changed: false, absorbed: [], auditEntries: [] };
  const byKey = intimationIndex(intimations);
  const absorbed = [];
  const linkRewrites = new Map();
  const ator = textOrEmpty(actor).slice(0, 100) || 'Sistema';
  for (const task of tasks) {
    if (!task || typeof task !== 'object') continue;
    const id = textOrEmpty(task.id);
    if (!id || id === keeper) continue;
    if (task.absorbedInto || task.active === false) continue;
    if (typeof canAbsorb === 'function' && !canAbsorb(task)) continue;
    const intimation = resolveTaskIntimation(task, byKey);
    const samePublication = [intimation?.id, intimation?.externalId, task.intimationId, task.sourceIntimationId, task.publicationId]
      .map(textOrEmpty).includes(publication);
    if (!samePublication) continue;
    if (!isSourceDeadlineTask(task, { intimation })) continue;
    if (!isUntouchedSourceTask(task) || !hasSourceOwnedDeadline(task)) continue;
    task.absorbedInto = keeper;
    task.absorbedAt = nowIso;
    task.absorbReason = textOrEmpty(reason) || 'specific-task';
    task.absorbedBy = ator;
    task.active = false;
    task.updatedAt = nowIso;
    task.history = [...(Array.isArray(task.history) ? task.history : []), {
      at: nowIso,
      action: `Tarefa de prazo absorvida pela tarefa específica ${keeper} (absorção reversível)`,
      actor: ator
    }].slice(-200);
    if (!textOrEmpty(keeperTask.deadline) && textOrEmpty(task.deadline)) {
      keeperTask.deadline = task.deadline;
      keeperTask.deadlineSource = task.deadlineSource;
      keeperTask.sourceReportedDeadlineAt = task.sourceReportedDeadlineAt;
      keeperTask.sourceDeadlineSyncAt = task.sourceDeadlineSyncAt;
    }
    keeperTask.history = [...(Array.isArray(keeperTask.history) ? keeperTask.history : []), {
      at: nowIso,
      action: `Absorveu a tarefa de prazo ${id} (prazo ${textOrEmpty(task.deadline) || 'sem prazo'})`,
      actor: ator
    }].slice(-200);
    keeperTask.updatedAt = nowIso;
    absorbed.push(id);
    linkRewrites.set(id, keeper);
  }
  if (!absorbed.length) return { changed: false, absorbed: [], auditEntries: [] };
  for (const intimation of intimations) {
    if (!intimation || typeof intimation !== 'object') continue;
    const linked = Array.isArray(intimation.linkedTaskIds) ? intimation.linkedTaskIds : [];
    let touched = false;
    const next = [];
    for (const id of linked) {
      const rewrite = linkRewrites.get(String(id));
      if (rewrite) { if (!next.includes(rewrite)) next.push(rewrite); touched = true; continue; }
      if (!next.includes(id)) next.push(id);
    }
    if (touched) intimation.linkedTaskIds = next;
    for (const [absorbedId, finalId] of linkRewrites) {
      if (intimation.taskId === absorbedId) intimation.taskId = finalId;
    }
  }
  const auditEntries = [{
    id: `aud-prazo-especifica-${Date.now().toString(36)}-${String(keeper).slice(-6)}`,
    at: nowIso,
    action: 'Tarefa de prazo absorvida pela tarefa específica',
    detail: `Tarefa ${keeper} absorveu ${absorbed.join(', ')} (publicação ${publication}; absorção reversível)`.slice(0, 500),
    actor: ator
  }];
  if (Array.isArray(state.audit)) state.audit = [...auditEntries, ...state.audit].slice(0, 1000);
  else state.audit = auditEntries;
  return { changed: true, absorbed, auditEntries };
}
