import { randomBytes } from 'node:crypto';
import {
  PUBLICATION_ACTION_IDS,
  PUBLICATION_ACTION_LABELS,
  catalogDefinitions,
  buildProvidenciaTask
} from '../tasks/publication-action-map.mjs';
import { absorbSourceDeadlineTasksForPublication, isSourceDeadlineTask } from '../publications/source-deadline-consolidation.mjs';
import { buildTaskContextBlock } from '../tasks/task-context-brief.mjs';
import { planTaskConsistency } from '../tasks/task-insights.mjs';
import { buildProcessIndex, canAccessTask } from '../office/access-control.mjs';

/**
 * ATRIUM — Do prazo à providência: o par de ações oficial.
 *
 * Uma confirmação humana faz **duas** escritas no mesmo estado e na mesma gravação com CAS:
 * conclui a tarefa de conferência da publicação (quando existir) e cria a tarefa específica a
 * partir do catálogo `configuration.taskDefinitions` — com o **prazo calculado na conferência**
 * quando a pessoa o informar (data humana, marcada com `deadlineSource: 'conferencia'`; §16), sem
 * tocar tratamento, ciência ou envio (§15/§17).
 *
 * Trilhos: o nome da tarefa vem sempre do catálogo do escritório (o servidor recusa nome fora
 * dele, então o modelo nunca inventa tarefa), a execução é declarada (o que concluiu, o que criou
 * e o que ficou de fora com motivo), há auditoria dos dois lados e o desfazer devolve a conferência
 * ao fluxo — removendo a tarefa criada apenas quando ela continua intocada.
 */

function fail(statusCode, message, extra = {}) {
  throw Object.assign(new Error(message), { statusCode, ...extra });
}

function actorOf(session) {
  return String(session?.displayName || session?.username || session?.userId || 'Usuário autenticado').slice(0, 100);
}

function auditId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
}

function textOrEmpty(value) {
  return String(value ?? '').trim();
}

function isIsoDate(value) {
  const text = textOrEmpty(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`));
}

function formatIsoBrDate(value) {
  const [year, month, day] = textOrEmpty(value).split('-');
  return year && month && day ? `${day}/${month}/${year}` : textOrEmpty(value);
}

/** Tarefas de conferência da publicação: projeções de prazo da fonte, vivas e não concluídas. */
export function findConferenceTasks(tasks, { publicationId = '', intimation = null } = {}) {
  const alvo = textOrEmpty(publicationId);
  if (!alvo) return [];
  return (Array.isArray(tasks) ? tasks : []).filter(task => {
    if (!task || typeof task !== 'object') return false;
    if (task.absorbedInto || task.active === false) return false;
    if (textOrEmpty(task.status) === 'concluida') return false;
    const vinculada = [task.intimationId, task.sourceIntimationId]
      .some(value => textOrEmpty(value) && textOrEmpty(value) === alvo);
    if (!vinculada) return false;
    return isSourceDeadlineTask(task, { intimation });
  }).sort((left, right) => Date.parse(String(right.updatedAt || right.createdAt || 0)) - Date.parse(String(left.updatedAt || left.createdAt || 0)));
}

/**
 * Tarefa de conferência da publicação: projeção de prazo da fonte, viva e ainda não concluída.
 * Com **mais de uma** conferência vinculada, não há como decidir qual delas corresponde à
 * providência escolhida — devolve `null` e o chamador declara a ambiguidade em vez de fechar a
 * errada (achado do crítico de produto de 2026-09-30).
 */
export function findConferenceTask(tasks, { publicationId = '', intimation = null } = {}) {
  const candidatas = findConferenceTasks(tasks, { publicationId, intimation });
  return candidatas.length === 1 ? candidatas[0] : null;
}

/** Tarefa criada ainda intocada? Só ela pode ser removida pelo desfazer. */
export function isUntouchedCreatedTask(task) {
  if (!task || typeof task !== 'object') return false;
  if (textOrEmpty(task.status) !== 'triagem') return false;
  if (textOrEmpty(task.priority) && textOrEmpty(task.priority) !== 'normal') return false;
  if (textOrEmpty(task.responsible) || (Array.isArray(task.responsibles) && task.responsibles.length > 0)) return false;
  if (textOrEmpty(task.fatalDeadline)) return false;
  // O prazo da conferência entra na criação (decisão humana confirmada na contagem): ele não é
  // "trabalho posterior". A tarefa deixa de ser intocada se o prazo sumir ou for trocado à mão —
  // o desfazer nunca apaga edição humana.
  const carriedDeadline = textOrEmpty(task.conferenceDeadlineAt);
  const deadline = textOrEmpty(task.deadline);
  if (carriedDeadline ? deadline !== carriedDeadline : Boolean(deadline)) return false;
  if (textOrEmpty(task.completedAt) || textOrEmpty(task.completedBy)) return false;
  if (task.notes || task.resolution) return false;
  const apontamentos = (Array.isArray(task.timeLogs) ? task.timeLogs : [])
    .reduce((total, log) => total + (Number(log?.minutes) || 0), 0);
  return apontamentos === 0;
}

export function createTaskHttpHandler({
  assertAuthenticated,
  readJson,
  json,
  readAppStateEnvelope,
  saveAppStateDirectUnlocked,
  enqueueAppStateMutation,
  resolveIntimationAlias,
  buildPublicationTask,
  listTeams = () => []
} = {}) {
  for (const [name, fn] of Object.entries({
    assertAuthenticated, readJson, json, readAppStateEnvelope,
    saveAppStateDirectUnlocked, enqueueAppStateMutation, resolveIntimationAlias, buildPublicationTask
  })) {
    if (typeof fn !== 'function') throw new TypeError(`Dependência de tarefas obrigatória ausente: ${name}.`);
  }

  const appendAudit = (state, { action, detail, actor, at }) => {
    if (!Array.isArray(state.audit)) state.audit = [];
    state.audit.unshift({ id: auditId('aud'), at, action: String(action).slice(0, 160), detail: String(detail || '').slice(0, 500), actor });
    state.audit = state.audit.slice(0, 1000);
  };

  const handleTaskRequest = async function handleTaskRequest(req, res, url) {
    const isFromPublication = req.method === 'POST' && url.pathname === '/api/tasks/from-publication';
    const isUndo = req.method === 'POST' && url.pathname === '/api/tasks/from-publication/undo';
    const isConsistencyApply = req.method === 'POST' && url.pathname === '/api/tasks/consistency/apply';
    const isConsistencyUndo = req.method === 'POST' && url.pathname === '/api/tasks/consistency/undo';
    if (!isFromPublication && !isUndo && !isConsistencyApply && !isConsistencyUndo) return false;

    const session = assertAuthenticated(req, true);
    if (session.status === 'pending' || session.status === 'inactive') {
      fail(403, 'Usuário inativo ou com cadastro pendente.');
    }
    const actor = actorOf(session);
    const body = await readJson(req, 60_000);

    if (isFromPublication) {
      const publicationId = textOrEmpty(body.publicationId);
      const action = textOrEmpty(body.action);
      const definitionName = textOrEmpty(body.definitionName);
      if (!publicationId) fail(400, 'Informe a publicação de origem.');
      if (!PUBLICATION_ACTION_IDS.includes(action)) fail(400, 'Providência inválida para este fluxo.');
      if (!definitionName) fail(400, 'Escolha o modelo de tarefa no catálogo do escritório.');
      // Prazo calculado na conferência (opcional): data confirmada por pessoa no bloco acima.
      // O servidor só aceita o formato oficial — nunca inventa, desloca ou ajusta a data.
      const conferenceDeadline = textOrEmpty(body.deadline);
      if (conferenceDeadline && !isIsoDate(conferenceDeadline)) fail(400, 'Prazo da conferência inválido.');

      const result = await enqueueAppStateMutation(async () => {
        const envelope = await readAppStateEnvelope();
        const state = envelope.state || {};
        if (!Array.isArray(state.tasks)) state.tasks = [];
        if (!Array.isArray(state.intimations)) state.intimations = [];
        const item = resolveIntimationAlias(state.intimations, publicationId);
        if (!item) fail(404, 'Publicação não encontrada no acervo.');
        if (textOrEmpty(item.treatmentStatus) === 'discarded') {
          fail(409, 'Publicação descartada não pode originar nova tarefa.');
        }
        // O modelo (ou a pessoa) só pode usar um nome que já existe no catálogo: nada é inventado.
        const definition = catalogDefinitions(state.configuration?.taskDefinitions)
          .find(candidate => candidate.name === definitionName);
        if (!definition) {
          fail(422, 'Este modelo de tarefa não existe no catálogo do escritório.');
        }
        const nowIso = new Date().toISOString();
        // Idempotência do par: duplo clique, retry depois de timeout ou duas abas não podem criar
        // duas tarefas para a mesma providência — e a segunda tentativa não pode diagnosticar
        // "sem tarefa de conferência" quando foi a primeira que a concluiu.
        const jaCriada = state.tasks.find(task => task
          && task.providenciaUndo
          && String(task.providenciaUndo.publicationId || '') === String(item.id || publicationId)
          && String(task.providenciaUndo.action || '') === action
          && !task.absorbedInto
          && task.active !== false
          && isUntouchedCreatedTask(task));
        if (jaCriada) {
          return {
            saved: { revision: envelope.revision || '' },
            task: jaCriada,
            conferencia: null,
            completedTaskId: '',
            conferenceReason: '',
            idempotent: true
          };
        }
        const conferencia = findConferenceTask(state.tasks, { publicationId: item.id || publicationId, intimation: item });
        let completedTaskId = '';
        let conferenceReason = '';
        let conferencePreviousStatus = '';
        if (!conferencia && findConferenceTasks(state.tasks, { publicationId: item.id || publicationId, intimation: item }).length > 1) {
          // Mais de uma conferência vinculada: fechar a errada tira do fluxo o prazo de outro ato.
          conferenceReason = 'conferencia-ambigua';
        }
        if (conferencia) {
          conferencePreviousStatus = textOrEmpty(conferencia.status) || 'triagem';
          conferencia.status = 'concluida';
          conferencia.completedAt = nowIso;
          conferencia.completedBy = actor;
          conferencia.updatedAt = nowIso;
          conferencia.history = [...(Array.isArray(conferencia.history) ? conferencia.history : []), {
            at: nowIso,
            action: `Conferência concluída ao criar a providência "${PUBLICATION_ACTION_LABELS[action] || action}" (desfazer disponível)`,
            actor
          }].slice(-200);
          completedTaskId = String(conferencia.id);
          conferenceReason = '';
          appendAudit(state, {
            action: 'Tarefa de conferência concluída',
            detail: `${conferencia.title || conferencia.id} · ${item.process || item.id || publicationId}`,
            actor,
            at: nowIso
          });
        } else if (!conferenceReason) {
          conferenceReason = 'sem-tarefa-de-conferencia';
        }

        const processo = (Array.isArray(state.processes) ? state.processes : []).find(registro => {
          const numero = String(registro?.number || registro?.processNumber || '').replace(/\D/g, '');
          const alvo = String(item.process || item.processNumber || '').replace(/\D/g, '');
          return Boolean(numero && alvo && numero === alvo);
        }) || null;
        const esqueleto = buildProvidenciaTask({
          definitionName: definition.name,
          action,
          publication: item,
          // A data declarada pela fonte entra como REFERÊNCIA (descrição + campo próprio), nunca
          // como prazo: `deadline` continua vazio até uma pessoa preencher (§16).
          sourceDeadlineReference: textOrEmpty(item.sourceReportedDeadlineAt),
          // Contexto de 3 a 5 linhas no corpo da tarefa, cada linha com a origem declarada.
          contextBlock: buildTaskContextBlock({
            publication: item,
            process: processo,
            // A tarefa ainda não existe: o contexto lê os mesmos campos que ela vai receber.
            task: {
              process: textOrEmpty(item.process || item.processNumber),
              client: textOrEmpty(item.client),
              sourceReportedDeadlineAt: textOrEmpty(item.sourceReportedDeadlineAt),
              deadline: '',
              history: []
            }
          })
        });
        const task = buildPublicationTask({
          ...esqueleto,
          taskDefinition: definition.name,
          points: definition.points,
          process: item.process || item.processNumber || '',
          client: item.client || '',
          source: item.source || 'Publicação'
        }, item.id || publicationId, actor, nowIso);
        if (esqueleto.sourceDeadlineReference) task.sourceDeadlineReference = esqueleto.sourceDeadlineReference;
        task.providenciaUndo = {
          at: nowIso,
          action,
          publicationId: String(item.id || publicationId),
          conferenceTaskId: completedTaskId,
          conferencePreviousStatus,
          createdBy: actor
        };
        // O prazo da contagem entra como data confirmada por pessoa (nunca inferida): fica marcado
        // com a origem `conferencia` e o valor aplicado, para o desfazer distinguir edição humana.
        if (conferenceDeadline) {
          task.deadline = conferenceDeadline;
          task.deadlineSource = 'conferencia';
          task.conferenceDeadlineAt = conferenceDeadline;
        }
        state.tasks.unshift(task);
        if (!Array.isArray(item.linkedTaskIds)) item.linkedTaskIds = item.taskId ? [item.taskId] : [];
        if (!item.linkedTaskIds.includes(task.id)) item.linkedTaskIds.push(task.id);
        // O servidor também aponta o vínculo corrente da publicação (o cliente espelha o mesmo).
        item.taskId = task.id;

        // A tarefa específica substitui a tarefa genérica de prazo da mesma publicação:
        // a genérica intocada é absorvida (reversível) e o prazo da fonte é herdado.
        absorbSourceDeadlineTasksForPublication(state, {
          publicationId: String(item.id || publicationId),
          keeperId: String(task.id),
          actor,
          nowIso,
          canAbsorb: candidate => canAccessTask(session, candidate, buildProcessIndex(state.processes), listTeams(session.workspaceId))
        });
        appendAudit(state, {
          action: 'Tarefa criada a partir da providência',
          detail: `${task.title} · ${item.process || item.id || publicationId}${conferenceDeadline ? ` · prazo ${conferenceDeadline} (conferência)` : ''}`,
          actor,
          at: nowIso
        });
        const saved = await saveAppStateDirectUnlocked(state, envelope.revision || null);
        return { saved, task, conferencia, completedTaskId, conferenceReason, publication: item };
      });

      const idempotente = Boolean(result.idempotent);
      json(res, idempotente ? 200 : 201, {
        ok: true,
        idempotent: idempotente,
        task: result.task,
        // A conferência volta no payload para o cliente espelhar o mesmo estado que o servidor
        // gravou (sem isso, o espelho local apagaria a autoria da conclusão no próximo flush).
        conferenceTask: result.conferencia || null,
        completedTaskId: result.completedTaskId,
        declared: result.conferenceReason ? { conference: result.conferenceReason } : {},
        revision: result.saved?.revision || '',
        message: idempotente
          ? 'Esta providência já havia sido criada para esta publicação — nada foi duplicado.'
          : result.completedTaskId
            ? (conferenceDeadline
              ? `Conferência concluída e tarefa específica criada — prazo ${formatIsoBrDate(conferenceDeadline)} aplicado a partir da conferência.`
              : 'Conferência concluída e tarefa específica criada — prazo em branco, para o seu preenchimento.')
            : result.conferenceReason === 'conferencia-ambigua'
              ? 'Tarefa específica criada — esta publicação tem mais de uma conferência vinculada e nenhuma foi concluída; escolha à mão qual delas conferir.'
              : 'Tarefa específica criada — não havia tarefa de conferência vinculada a esta publicação.'
      });
      // O handler devolve `true` para o despachante parar aqui: responder e devolver outro valor
      // faz a rota cair no tratamento de erro e tentar responder de novo (headers já enviados).
      return true;
    }

    // Consistência cadastral: correção SÓ com evidência inequívoca, aditiva em campo estrutural
    // seguro — o servidor recomputa o plano e nunca aceita um valor vindo do cliente.
    if (isConsistencyApply) {
      const alvos = Array.isArray(body?.taskIds) && body.taskIds.length ? new Set(body.taskIds.map(String)) : null;
      const result = await enqueueAppStateMutation(async () => {
        const envelope = await readAppStateEnvelope();
        const state = envelope.state || {};
        if (!Array.isArray(state.tasks)) state.tasks = [];
        const nowIso = new Date().toISOString();
        const plano = planTaskConsistency({ tasks: state.tasks, users: Array.isArray(state.users) ? state.users : [] });
        const aplicaveis = plano.fixes.filter(fix => !alvos || alvos.has(String(fix.taskId)));
        const aplicados = [];
        const tocados = new Set();
        for (const fix of aplicaveis) {
          const task = state.tasks.find(registro => registro && String(registro.id) === String(fix.taskId));
          if (!task) continue;
          // Aditivo: só preenche o que está ausente. Qualquer valor existente é dado humano.
          if (textOrEmpty(task[fix.field])) continue;
          task[fix.field] = String(fix.proposed).slice(0, 80);
          task.updatedAt = nowIso;
          task.history = [...(Array.isArray(task.history) ? task.history : []), {
            at: nowIso,
            action: `Consistência corrigida: ${fix.field} preenchido com ${fix.proposed} (evidência: ${fix.evidence})`,
            actor
          }].slice(-200);
          const anteriores = Array.isArray(task.consistencyFix?.entries) ? task.consistencyFix.entries : [];
          task.consistencyFix = { at: nowIso, by: actor, entries: [...anteriores, { field: fix.field, previous: '' }] };
          aplicados.push({ taskId: fix.taskId, field: fix.field, proposed: fix.proposed, evidence: fix.evidence });
          tocados.add(task);
        }
        if (aplicados.length > 0) {
          appendAudit(state, {
            action: 'Consistência cadastral corrigida',
            detail: aplicados.map(item => `${item.taskId}:${item.field}`).join(', '),
            actor,
            at: nowIso
          });
        }
        const saved = await saveAppStateDirectUnlocked(state, envelope.revision || null);
        return { saved, aplicados, tocados: [...tocados] };
      });
      json(res, 200, {
        ok: true,
        applied: result.aplicados,
        tasks: result.tocados,
        revision: result.saved?.revision || '',
        message: result.aplicados.length
          ? `${result.aplicados.length} inconsistência(s) corrigida(s) com evidência — reversível pelo desfazer.`
          : 'Nada foi corrigido: nenhuma inconsistência com evidência inequívoca neste momento.'
      });
      return true;
    }

    if (isConsistencyUndo) {
      const alvoIds = Array.isArray(body?.taskIds) && body.taskIds.length ? new Set(body.taskIds.map(String)) : null;
      const result = await enqueueAppStateMutation(async () => {
        const envelope = await readAppStateEnvelope();
        const state = envelope.state || {};
        const nowIso = new Date().toISOString();
        const revertidos = [];
        const tocados = new Set();
        for (const task of Array.isArray(state.tasks) ? state.tasks : []) {
          if (!task || !task.consistencyFix) continue;
          if (alvoIds && !alvoIds.has(String(task.id))) continue;
          for (const entry of Array.isArray(task.consistencyFix.entries) ? task.consistencyFix.entries : []) {
            if (!entry?.field) continue;
            if (entry.previous === '' || entry.previous === undefined) delete task[entry.field];
            else task[entry.field] = entry.previous;
            revertidos.push({ taskId: String(task.id), field: entry.field, restored: entry.previous ?? '' });
          }
          delete task.consistencyFix;
          task.updatedAt = nowIso;
          task.history = [...(Array.isArray(task.history) ? task.history : []), { at: nowIso, action: 'Correção de consistência desfeita', actor }].slice(-200);
          tocados.add(task);
        }
        if (revertidos.length > 0) {
          appendAudit(state, {
            action: 'Correção de consistência desfeita',
            detail: revertidos.map(item => `${item.taskId}:${item.field}`).join(', '),
            actor,
            at: nowIso
          });
        }
        const saved = await saveAppStateDirectUnlocked(state, envelope.revision || null);
        return { saved, revertidos, tocados: [...tocados] };
      });
      json(res, 200, {
        ok: true,
        restored: result.revertidos,
        tasks: result.tocados,
        revision: result.saved?.revision || '',
        message: result.revertidos.length ? 'Correção desfeita: os campos voltaram ao que estavam.' : 'Nada a desfazer neste momento.'
      });
      return true;
    }

    const createdTaskId = textOrEmpty(body.createdTaskId);
    const fallbackConferenceId = textOrEmpty(body.conferenceTaskId);
    if (!createdTaskId) fail(400, 'Informe a tarefa criada que deve ser desfeita.');
    const result = await enqueueAppStateMutation(async () => {
      const envelope = await readAppStateEnvelope();
      const state = envelope.state || {};
      if (!Array.isArray(state.tasks)) state.tasks = [];
      const nowIso = new Date().toISOString();
      const criada = state.tasks.find(task => task && String(task.id) === createdTaskId);
      if (!criada) {
        // Tarefa criada sumiu (absorvida, removida ou editada em outra aba): se o chamador informou
        // a conferência do par, ela volta ao fluxo — o par não fica meio-aplicado.
        const conferencia = fallbackConferenceId
          ? state.tasks.find(task => task && String(task.id) === fallbackConferenceId)
          : null;
        if (!conferencia) fail(404, 'Esta tarefa não está mais no acervo.');
        if (textOrEmpty(conferencia.status) === 'concluida') {
          conferencia.status = 'triagem';
          delete conferencia.completedAt;
          delete conferencia.completedBy;
          conferencia.updatedAt = nowIso;
          conferencia.history = [...(Array.isArray(conferencia.history) ? conferencia.history : []), {
            at: nowIso,
            action: 'Desfazer da providência: a conferência voltou ao fluxo (a tarefa criada não estava mais no acervo)',
            actor
          }].slice(-200);
        }
        appendAudit(state, {
          action: 'Providência desfeita',
          detail: `${createdTaskId} não está mais no acervo · conferência ${fallbackConferenceId} devolvida ao fluxo`,
          actor,
          at: nowIso
        });
        const saved = await saveAppStateDirectUnlocked(state, envelope.revision || null);
        return {
          saved,
          declarado: { createdTaskGone: 'a-tarefa-criada-nao-esta-mais-no-acervo' },
          removed: false,
          conferenceTaskId: fallbackConferenceId,
          conferencia,
          semConferenciaOriginal: false
        };
      }
      const registro = criada.providenciaUndo && typeof criada.providenciaUndo === 'object' ? criada.providenciaUndo : null;
      if (!registro) fail(409, 'Esta tarefa não foi criada pelo fluxo de providência.');
      // Desfazer é do autor da criação (ou de administrador): o desfazer remove uma tarefa do
      // acervo, então não pode ficar aberto a qualquer membro que descubra o id (achado do crítico
      // adversarial de 2026-09-30).
      const criador = textOrEmpty(registro.createdBy);
      const papel = String(session.role || '');
      const administrador = papel === 'admin' || papel === 'master_admin';
      if (criador && criador !== actor && !administrador) {
        fail(403, 'Só quem criou esta providência (ou um administrador) pode desfazê-la.');
      }
      const declarado = {};
      const intocada = isUntouchedCreatedTask(criada);
      if (intocada) {
        state.tasks = state.tasks.filter(task => task !== criada);
        for (const item of Array.isArray(state.intimations) ? state.intimations : []) {
          if (!item || typeof item !== 'object') continue;
          if (Array.isArray(item.linkedTaskIds)) item.linkedTaskIds = item.linkedTaskIds.filter(id => String(id) !== createdTaskId);
          if (String(item.taskId || '') === createdTaskId) item.taskId = item.linkedTaskIds[0] || '';
        }
      } else {
        declarado.createdTaskKept = 'a-tarefa-criada-ja-foi-trabalhada';
      }
      const conferencia = registro.conferenceTaskId
        ? state.tasks.find(task => task && String(task.id) === String(registro.conferenceTaskId))
        : null;
      if (conferencia && textOrEmpty(conferencia.status) === 'concluida') {
        conferencia.status = textOrEmpty(registro.conferencePreviousStatus) || 'triagem';
        delete conferencia.completedAt;
        delete conferencia.completedBy;
        conferencia.updatedAt = nowIso;
        conferencia.history = [...(Array.isArray(conferencia.history) ? conferencia.history : []), {
          at: nowIso,
          action: 'Desfazer da providência: a conferência voltou ao fluxo',
          actor
        }].slice(-200);
      } else if (registro.conferenceTaskId) {
        declarado.conference = 'conferencia-nao-encontrada-ou-andamento';
      }
      appendAudit(state, {
        action: 'Providência desfeita',
        detail: `${criada.title || createdTaskId}${intocada ? ' (tarefa criada removida)' : ' (tarefa criada mantida: já trabalhada)'}`,
        actor,
        at: nowIso
      });
      const saved = await saveAppStateDirectUnlocked(state, envelope.revision || null);
      return {
        saved,
        declarado,
        removed: intocada,
        conferenceTaskId: String(registro.conferenceTaskId || ''),
        conferencia,
        semConferenciaOriginal: !registro.conferenceTaskId
      };
    });

    // A mensagem nunca afirma conferência que não existia no par (achado do crítico de 2026-09-30).
    const conferenciaVoltou = Boolean(result.conferenceTaskId) && !result.declarado.conference;
    const tarefaSumiu = Boolean(result.declarado.createdTaskGone);
    const mensagem = tarefaSumiu
      ? (conferenciaVoltou
        ? 'A conferência voltou ao fluxo; a tarefa criada não está mais no acervo.'
        : 'A tarefa criada não está mais no acervo.')
      : result.removed
        ? (conferenciaVoltou
          ? 'Providência desfeita: a tarefa criada saiu do fluxo e a conferência voltou.'
          : 'Providência desfeita: a tarefa criada saiu do fluxo.')
        : (conferenciaVoltou
          ? 'Conferência devolvida ao fluxo; a tarefa criada foi mantida porque já tem trabalho apontado.'
          : 'Nada foi removido — a tarefa criada já tem trabalho apontado.');
    json(res, 200, {
      ok: true,
      removed: result.removed,
      conferenceTaskId: result.conferenceTaskId,
      conferenceTask: result.conferencia || null,
      declared: result.declarado,
      revision: result.saved?.revision || '',
      message: mensagem
    });
    return true;
  };

  return handleTaskRequest;
}
