import { randomBytes } from 'node:crypto';
import { redactForJev } from '../jev-beta/redaction.mjs';
import { filterOfficeState, filterPrivateScopeState } from '../office/access-control.mjs';
import {
  schemaToSystemoneQuestions,
  extractJevDecision,
  callHeadlessCmd,
  CMD_PROVIDER_MODEL
} from '../jev-beta/client.mjs';
import { assertJevInputSize } from '../jev-beta/schemas.mjs';
import { buildClassifierSkillsBlock } from '../skills/minutaia-knowledge.mjs';
import { applyAreaEvidence, deriveAreaEvidence } from '../jev-beta/area-evidence.mjs';
import { applyAutoOrganize, planAutoOrganize } from '../ai/auto-organize.mjs';
import {
  normalizeCalibrationStore,
  recordHumanCorrection,
  suggestionOverrideFor,
  applyOverridesToPublicSuggestion,
  applyOverridesToTriageEntry,
  calibrationBlockFor,
  calibrationStats,
  customAreasOf,
  findCustomArea,
  registerCustomArea,
  sanitizeCustomArea,
  CALIBRATION_CUSTOM_AREA_CHARS,
  CALIBRATION_CUSTOM_AREA_MIN_CHARS
} from '../jev-beta/calibration.mjs';
import { normalizeJevSuggestion, assertSuggestionIsAssistive, payloadHash } from '../jev-beta/classifier.mjs';
import { getJevSchema } from '../jev-beta/schemas.mjs';
import {
  normalizePublicationTriageStore,
  publicationTriageTargets,
  publicationTriagePending,
  prunePublicationTriageStore,
  upsertPublicationTriageEntry,
  PUBLICATION_TRIAGE_BATCH_LIMIT
} from '../publications/publication-triage-suggestions.mjs';
import {
  normalizeTaskTriageStore,
  taskTriageTargets,
  taskTriagePending,
  pruneTaskTriageStore,
  upsertTaskTriageEntry,
  TASK_TRIAGE_BATCH_LIMIT
} from '../tasks/task-triage-suggestions.mjs';
import { groupDuplicateCandidates } from '../publications/intimation-identity.mjs';
import {
  normalizeProcessTriageStore,
  processTriageTargets,
  processTriagePending,
  processMissingFields,
  pruneProcessTriageStore,
  upsertProcessTriageEntry,
  PROCESS_TRIAGE_BATCH_LIMIT
} from '../processes/process-triage-suggestions.mjs';
import {
  normalizeFinancialTriageStore,
  financialTriageTargets,
  financialTriagePending,
  pruneFinancialTriageStore,
  upsertFinancialTriageEntry,
  collectFinancialRecords,
  FINANCIAL_TRIAGE_BATCH_LIMIT
} from '../financial/financial-triage-suggestions.mjs';
import {
  normalizeDuplicateReviewStore,
  duplicateReviewPairs,
  duplicateReviewPending,
  pruneDuplicateReviewStore,
  upsertDuplicateReviewEntry,
  DUPLICATE_REVIEW_LIMIT,
  DUPLICATE_REVIEW_BATCH_LIMIT
} from '../publications/duplicate-review.mjs';
import {
  planTaskDuplicateCandidatePairs,
  planTaskAutoAbsorptions,
  taskPairKeeper,
  TASK_DUPLICATE_CANDIDATE_LIMIT,
  TASK_DUPLICATE_REVIEW_PAIR_LIMIT,
  TASK_DUPLICATE_AUTO_ABSORB_CONFIDENCE
} from '../tasks/task-duplicate-review.mjs';
import {
  applyTaskGroupConsolidation,
  intimationIndexByKey,
  resolveTaskIntimation
} from '../publications/source-deadline-consolidation.mjs';
import {
  PUBLICATION_ACTION_IDS,
  PUBLICATION_ACTION_LABELS,
  catalogDefinitions,
  mapPublicationActionToTaskDefinition
} from '../tasks/publication-action-map.mjs';
import {
  normalizeTaskRiskStore,
  taskRiskTargets,
  taskRiskPending,
  pruneTaskRiskStore,
  upsertTaskRiskEntry,
  TASK_RISK_BATCH_LIMIT
} from '../tasks/task-risk-suggestions.mjs';
import { buildPublicationPlaybook } from '../tasks/task-playbook.mjs';
import { planTaskConsistency, buildPortfolioBrief, suggestTaskAssignments } from '../tasks/task-insights.mjs';

export const AI_CLASSIFIER_SCHEMA_ID = 'publication_triage';
export const AI_CLASSIFIER_TASK_SCHEMA_ID = 'task_triage';
export const AI_CLASSIFIER_DUPLICATE_SCHEMA_ID = 'duplicate_check';
export const AI_CLASSIFIER_TASK_DUPLICATE_SCHEMA_ID = 'task_duplicate_check';
export const AI_CLASSIFIER_PUBLICATION_ACTION_SCHEMA_ID = 'publication_action';
export const AI_CLASSIFIER_TASK_RISK_SCHEMA_ID = 'task_risk';
export const AI_CLASSIFIER_PROCESS_SCHEMA_ID = 'process_triage';
export const AI_CLASSIFIER_FINANCIAL_SCHEMA_ID = 'financial_triage';
export const AI_CLASSIFIER_SUGGEST_LIMIT_PER_MINUTE = 15;
export const AI_CLASSIFIER_MAX_INPUT_CHARS = 12000;
export const AI_CLASSIFIER_TRIAGE_LIMIT = PUBLICATION_TRIAGE_BATCH_LIMIT;
export const AI_CLASSIFIER_TASK_TRIAGE_LIMIT = TASK_TRIAGE_BATCH_LIMIT;
export const AI_CLASSIFIER_DUPLICATE_TRIAGE_LIMIT = DUPLICATE_REVIEW_BATCH_LIMIT;
export const AI_CLASSIFIER_TASK_DUPLICATE_TRIAGE_LIMIT = TASK_DUPLICATE_REVIEW_PAIR_LIMIT;
export const AI_CLASSIFIER_TASK_RISK_TRIAGE_LIMIT = TASK_RISK_BATCH_LIMIT;
export const AI_CLASSIFIER_PROCESS_TRIAGE_LIMIT = PROCESS_TRIAGE_BATCH_LIMIT;
export const AI_CLASSIFIER_FINANCIAL_TRIAGE_LIMIT = FINANCIAL_TRIAGE_BATCH_LIMIT;
/** Ator da absorção autônoma: distingue a decisão do Atrium IA da decisão humana na auditoria. */
export const AI_CLASSIFIER_AUTONOMOUS_ACTOR = 'Atrium IA';
/** Motivo do motor em linguagem: quem opera lê português, não código interno. */
export const AI_CLASSIFIER_REASON_LABELS = Object.freeze({
  SUGGEST_ONLY: 'a leitura foi concluída sem impedimento identificado',
  LOW_CONFIDENCE_REVIEW: 'a confiança da leitura ficou baixa e pede conferência',
  INSUFFICIENT_EVIDENCE: 'o texto não trouxe evidência suficiente para decidir'
});

export function sanitizeAiClassifierSetting(value) {
  const raw = value && typeof value === 'object' ? value : {};
  return { enabled: raw.enabled === true };
}

export function readAiClassifierSetting(state) {
  return sanitizeAiClassifierSetting(state?.settings?.aiClassifier);
}

export function readAutoOrganizeSetting(state) {
  return { enabled: state?.settings?.aiAutoOrganize?.enabled === true };
}

function sessionActor(session) {
  return session?.displayName || session?.username || session?.userId || 'Usuário autenticado';
}

function fail(statusCode, message) {
  throw Object.assign(new Error(message), { statusCode });
}

export function resolveHeadlessBin(value) {
  const bin = String(value || 'commandcode').trim() || 'commandcode';
  if (!/^[A-Za-z0-9_.-]+$/.test(bin)) {
    throw Object.assign(new Error('Binário do classificador inválido no servidor.'), { statusCode: 500 });
  }
  return bin;
}

export async function probeHeadlessBin(bin, { execImpl = null, platform = process.platform, timeoutMs = 5000 } = {}) {
  const safeBin = resolveHeadlessBin(bin);
  let execFile = execImpl;
  if (!execFile) {
    ({ execFile } = await import('node:child_process'));
  }
  const target = platform === 'win32' ? 'cmd.exe' : safeBin;
  const args = platform === 'win32' ? ['/d', '/s', '/c', `${safeBin} --version`] : ['--version'];
  return new Promise(resolve => {
    execFile(target, args, { timeout: timeoutMs, windowsHide: true }, error => {
      resolve(!error);
    });
  });
}

function publicSuggestionOf(suggestion) {
  return {
    schema: suggestion.schema,
    action: suggestion.action,
    confidence: suggestion.confidence,
    suggestion: suggestion.suggestion,
    reason: suggestion.reason,
    basis: suggestion.basis,
    humanRequired: suggestion.humanRequired,
    notes: suggestion.notes,
    collectedAt: suggestion.collectedAt
  };
}

function publicTriageEntry(entry) {
  return {
    area: entry.area,
    areaConfidence: entry.areaConfidence,
    priority: entry.priority,
    priorityConfidence: entry.priorityConfidence,
    deadlineSignal: entry.deadlineSignal,
    deadlineDays: entry.deadlineDays,
    action: entry.action,
    reason: entry.reason,
    at: entry.at
  };
}

function publicTaskTriageEntry(entry) {
  return {
    category: entry.category,
    categoryConfidence: entry.categoryConfidence,
    urgency: entry.urgency,
    urgencyConfidence: entry.urgencyConfidence,
    action: entry.action,
    reason: entry.reason,
    at: entry.at
  };
}

function publicProcessTriageEntry(entry) {
  return {
    movementType: entry.movementType,
    movementConfidence: entry.movementConfidence,
    needsAttention: entry.needsAttention,
    action: entry.action,
    reason: entry.reason,
    missingFields: Array.isArray(entry.missingFields) ? entry.missingFields : [],
    at: entry.at
  };
}

function publicFinancialTriageEntry(entry) {
  return {
    bucket: entry.bucket,
    bucketConfidence: entry.bucketConfidence,
    action: entry.action,
    reason: entry.reason,
    at: entry.at
  };
}

export function createAiClassifierHttpHandler({
  assertAuthenticated,
  assertAdmin,
  readJson,
  json,
  readAppStateEnvelope,
  saveAppStateDirectUnlocked,
  enqueueAppStateMutation,
  assertRevision,
  resolveIntimationAlias,
  security,
  triageStore = null,
  taskTriageStore = null,
  taskRiskStore = null,
  duplicateStore = null,
  taskDuplicateStore = null,
  processTriageStore = null,
  financialTriageStore = null,
  calibrationStore = null,
  runSuggest = null,
  checkHeadlessAvailable = null,
  execImpl = null
} = {}) {
  for (const [name, fn] of Object.entries({ assertAuthenticated, assertAdmin, readJson, json, readAppStateEnvelope, saveAppStateDirectUnlocked, enqueueAppStateMutation, assertRevision, resolveIntimationAlias })) {
    if (typeof fn !== 'function') throw new TypeError(`Dependência do Atrium IA obrigatória ausente: ${name}.`);
  }
  if (!triageStore || typeof triageStore.read !== 'function' || typeof triageStore.write !== 'function') {
    throw new TypeError('Dependência do Atrium IA obrigatória ausente: triageStore.');
  }
  if (taskTriageStore && (typeof taskTriageStore.read !== 'function' || typeof taskTriageStore.write !== 'function')) {
    throw new TypeError('Dependência do Atrium IA inválida: taskTriageStore.');
  }
  if (taskRiskStore && (typeof taskRiskStore.read !== 'function' || typeof taskRiskStore.write !== 'function')) {
    throw new TypeError('Dependência do Atrium IA inválida: taskRiskStore.');
  }
  if (duplicateStore && (typeof duplicateStore.read !== 'function' || typeof duplicateStore.write !== 'function')) {
    throw new TypeError('Dependência do Atrium IA inválida: duplicateStore.');
  }
  if (taskDuplicateStore && (typeof taskDuplicateStore.read !== 'function' || typeof taskDuplicateStore.write !== 'function')) {
    throw new TypeError('Dependência do Atrium IA inválida: taskDuplicateStore.');
  }
  if (processTriageStore && (typeof processTriageStore.read !== 'function' || typeof processTriageStore.write !== 'function')) {
    throw new TypeError('Dependência do Atrium IA inválida: processTriageStore.');
  }
  if (calibrationStore && (typeof calibrationStore.read !== 'function' || typeof calibrationStore.write !== 'function')) {
    throw new TypeError('Dependência do Atrium IA inválida: calibrationStore.');
  }
  if (financialTriageStore && (typeof financialTriageStore.read !== 'function' || typeof financialTriageStore.write !== 'function')) {
    throw new TypeError('Dependência do Atrium IA inválida: financialTriageStore.');
  }
  getJevSchema(AI_CLASSIFIER_SCHEMA_ID);
  getJevSchema(AI_CLASSIFIER_TASK_SCHEMA_ID);
  getJevSchema(AI_CLASSIFIER_TASK_RISK_SCHEMA_ID);
  getJevSchema(AI_CLASSIFIER_DUPLICATE_SCHEMA_ID);
  getJevSchema(AI_CLASSIFIER_TASK_DUPLICATE_SCHEMA_ID);
  getJevSchema(AI_CLASSIFIER_PUBLICATION_ACTION_SCHEMA_ID);
  getJevSchema(AI_CLASSIFIER_PROCESS_SCHEMA_ID);
  getJevSchema(AI_CLASSIFIER_FINANCIAL_SCHEMA_ID);

  const requestWindows = new Map();
  const availabilityCache = { at: 0, ok: false, reason: 'não verificado' };
  const AVAILABILITY_TTL_MS = 60_000;
  const AVAILABILITY_NEGATIVE_TTL_MS = 10_000;

  const enforceSuggestRateLimit = req => {
    const key = String(req.socket?.remoteAddress || 'local');
    const now = Date.now();
    const current = requestWindows.get(key);
    const bucket = !current || now - current.startedAt >= 60_000 ? { startedAt: now, count: 0 } : current;
    bucket.count += 1;
    requestWindows.set(key, bucket);
    if (bucket.count > AI_CLASSIFIER_SUGGEST_LIMIT_PER_MINUTE) {
      fail(429, 'Limite temporário de sugestões do Atrium IA atingido. Aguarde um minuto.');
    }
  };

  const defaultRunSuggest = async ({ state, questions }) => callHeadlessCmd({
    bin: String(process.env.JEV_CMD_BIN || 'commandcode').trim() || 'commandcode',
    model: CMD_PROVIDER_MODEL,
    state,
    questions,
    timeoutMs: 60000,
    ...(execImpl ? { execImpl } : {})
  });

  const availability = checkHeadlessAvailable || (async () => {
    const ttl = availabilityCache.ok ? AVAILABILITY_TTL_MS : AVAILABILITY_NEGATIVE_TTL_MS;
    if (Date.now() - availabilityCache.at < ttl) return availabilityCache;
    let probe = false;
    try {
      probe = await probeHeadlessBin(process.env.JEV_CMD_BIN || 'commandcode', { execImpl, timeoutMs: 15000 });
    } catch {
      probe = false;
    }
    availabilityCache.at = Date.now();
    availabilityCache.ok = probe;
    availabilityCache.reason = probe ? 'operacional' : 'classificador indisponível no servidor';
    return availabilityCache;
  });
  const suggest = runSuggest || defaultRunSuggest;

  const appendAudit = (state, action, detail, session) => {
    if (!Array.isArray(state.audit)) state.audit = [];
    state.audit.unshift({
      id: `aud-${Date.now()}-${randomBytes(4).toString('hex')}`,
      at: new Date().toISOString(),
      action: String(action).slice(0, 160),
      detail: String(detail || '').slice(0, 500),
      actor: sessionActor(session)
    });
    state.audit = state.audit.slice(0, 1000);
  };

  const classifyRedacted = async (redacted, schemaId = AI_CLASSIFIER_SCHEMA_ID) => {
    const availabilityState = await availability();
    if (!availabilityState.ok) {
      fail(503, `Atrium IA indisponível: ${String(availabilityState.reason || 'sem credencial no servidor')}.`);
    }
    // Teto do modelo aplicado **sempre**: publicação com texto integral longo estourava o limite
    // (`TOO_LARGE`) e ficava presa na fila — o lote tentava de novo e falhava de novo, "erro atrás
    // de erro". O corte é no texto, preservando o bloco de calibração (que entra no fim).
    const clip = value => {
      const text = String(value ?? '');
      return text.length <= AI_CLASSIFIER_MAX_INPUT_CHARS ? text : text.slice(0, AI_CLASSIFIER_MAX_INPUT_CHARS);
    };
    const skillsBlock = buildClassifierSkillsBlock({ text: redacted, schemaId, maxChars: 2400 });
    let calibrationBlock = '';
    if (calibrationStore) {
      const calibration = normalizeCalibrationStore(await calibrationStore.read().catch(() => null));
      calibrationBlock = calibrationBlockFor(calibration, schemaId) || '';
    }
    const reserved = skillsBlock.length + calibrationBlock.length;
    const textBudget = Math.max(1_200, AI_CLASSIFIER_MAX_INPUT_CHARS - reserved);
    let stateForModel = clip(redacted).slice(0, textBudget);
    if (calibrationBlock) stateForModel = `${stateForModel}${calibrationBlock}`;
    if (skillsBlock) stateForModel = `${stateForModel}${stateForModel ? '\n\n' : ''}${skillsBlock}`;
    if (stateForModel.length > AI_CLASSIFIER_MAX_INPUT_CHARS) {
      stateForModel = stateForModel.slice(0, AI_CLASSIFIER_MAX_INPUT_CHARS);
    }
    assertJevInputSize(stateForModel);
    let parsed;
    try {
      parsed = await suggest({ state: stateForModel, questions: schemaToSystemoneQuestions(schemaId), schemaId, sourceText: clip(redacted) });
    } catch {
      fail(502, 'O Atrium IA falhou agora. Tente de novo em instantes.');
    }
    const normalized = extractJevDecision({ answers: parsed.answers }, { schemaId });
    const suggestion = normalizeJevSuggestion({ schemaId, normalizedDecision: normalized, redactedText: clip(redacted) });
    assertSuggestionIsAssistive(suggestion);
    return { suggestion, usage: parsed.usage };
  };

  /** Trecho redigido da publicação, usado como exemplo de calibração (nunca vem do cliente). */
  const redactedExcerptOf = record => {
    const sourceText = [record?.title, record?.text, record?.fullText]
      .map(part => String(part || '').trim())
      .filter(Boolean)
      .join('\n\n')
      .slice(0, AI_CLASSIFIER_MAX_INPUT_CHARS);
    if (!sourceText) return '';
    try {
      return redactForJev(sourceText).redacted || '';
    } catch {
      return '';
    }
  };

  // Projeta o estado oficial pela MESMA autoridade de acesso de `GET /api/state`
  // (reusa `filterPrivateScopeState`/`filterOfficeState`, cobrindo TODAS as coleções de
  // escopo privado: contatos, despesas vinculadas, documentos etc.). Sem sessão
  // (background pós-sync), projeta com um usuário-sistema que não possui nada — nenhum
  // registro privado/suprimido de qualquer membro é processado nem egresso ao provedor.
  const SYSTEM_USER = { id: '\u0000atrium-system', username: '\u0000atrium-system' };
  const projectStateForSession = (state, session) => {
    if (!state || typeof state !== 'object' || !security) return state;
    if (!session) return filterPrivateScopeState(state, SYSTEM_USER, { teams: [] });
    const teams = security.listTeams(session.workspaceId);
    let projected = filterPrivateScopeState(state, session, { teams });
    if (security.officeProfile(session.workspaceId).accessMode === 'enforced') projected = filterOfficeState(projected, session, { teams });
    return projected;
  };

  const triageContext = async (session = null) => {
    const envelope = await readAppStateEnvelope().catch(() => null);
    const state = projectStateForSession(envelope?.state || {}, session);
    if (!readAiClassifierSetting(state).enabled) {
      fail(409, 'Atrium IA desligado. Ative nas configurações do escritório.');
    }
    return {
      envelope,
      intimations: Array.isArray(state.intimations) ? state.intimations : [],
      hashOf: text => payloadHash(text)
    };
  };

  const runTriageBacklog = async ({ ids = null, limit = AI_CLASSIFIER_TRIAGE_LIMIT, session = null } = {}) => {
    const { intimations, hashOf } = await triageContext(session);
    const stored = await triageStore.read().catch(() => null);
    const targets = publicationTriageTargets({ intimations, store: stored, ids, limit, hashOf });
    let store = normalizePublicationTriageStore(stored);
    const results = [];
    let failed = 0;
    for (const target of targets) {
      try {
        const { redacted } = redactForJev(target.text);
        // O teto do modelo é aplicado por corte dentro de `classifyRedacted`: validar aqui
        // recusava a publicação longa e travava a fila (TOO_LARGE a cada tentativa).
        const { suggestion } = await classifyRedacted(redacted);
        const area = suggestion.suggestion?.area || {};
        const priority = suggestion.suggestion?.priority || {};
        store = upsertPublicationTriageEntry(store, target.id, {
          area: area.label || '',
          areaConfidence: Number(area.confidence) || 0,
          priority: priority.label || '',
          priorityConfidence: Number(priority.confidence) || 0,
          deadlineSignal: suggestion.suggestion?.deadline_signal?.label || '',
          deadlineDays: suggestion.suggestion?.deadline_days?.label || '',
          action: suggestion.action,
          reason: suggestion.reason,
          payloadHash: target.hash
        });
        results.push({
          intimationId: target.id,
          action: suggestion.action,
          area: area.label || '',
          areaConfidence: Number(area.confidence) || 0,
          priority: priority.label || '',
          deadlineSignal: suggestion.suggestion?.deadline_signal?.label || '',
          deadlineDays: suggestion.suggestion?.deadline_days?.label || '',
          confidence: suggestion.confidence
        });
      } catch (error) {
        failed += 1;
        results.push({ intimationId: target.id, error: String(error?.code || error?.message || 'ERRO').slice(0, 120) });
      }
    }
    if (targets.length > 0) await triageStore.write(store);
    const pending = publicationTriagePending({ intimations, store, hashOf }).length;
    return { ok: true, classified: results.length - failed, failed, pending, results };
  };

  // Arrumação autorizada pelo titular: ver lib/ai/auto-organize.mjs para o que nunca é feito.
  const runAutoOrganize = async ({ force = false, members = [] } = {}) => {
    const triage = normalizePublicationTriageStore(await triageStore.read().catch(() => null));
    return enqueueAppStateMutation(async () => {
      const envelope = await readAppStateEnvelope();
      const state = envelope.state;
      if (!state || !readAiClassifierSetting(state).enabled) return { ok: false, reason: 'DISABLED', total: 0 };
      if (!force && !readAutoOrganizeSetting(state).enabled) return { ok: false, reason: 'AUTO_OFF', total: 0 };
      const plan = planAutoOrganize({ state, members, triageEntries: triage.entries });
      const outcome = applyAutoOrganize(state, plan, { actor: AI_CLASSIFIER_AUTONOMOUS_ACTOR });
      if (!outcome.total) return { ok: true, ...outcome };
      const saved = await saveAppStateDirectUnlocked(state, envelope.revision || null);
      return { ok: true, ...outcome, revision: saved.revision };
    });
  };

  const taskTriageContext = async (session = null) => {
    if (!taskTriageStore || typeof taskTriageStore.read !== 'function' || typeof taskTriageStore.write !== 'function') {
      fail(503, 'Triagem assistiva de tarefas indisponível neste servidor.');
    }
    const envelope = await readAppStateEnvelope().catch(() => null);
    const state = projectStateForSession(envelope?.state || {}, session);
    if (!readAiClassifierSetting(state).enabled) {
      fail(409, 'Atrium IA desligado. Ative nas configurações do escritório.');
    }
    return {
      envelope,
      // Tarefa absorvida numa consolidação de prazo não entra no lote de triagem: ela não
      // aparece no painel e o classificador não deve gastar chamada com a duplicata.
      tasks: (Array.isArray(state.tasks) ? state.tasks : []).filter(task => task && task.active !== false && !task.absorbedInto),
      hashOf: text => payloadHash(text)
    };
  };

  const runTaskTriage = async ({ ids = null, limit = AI_CLASSIFIER_TASK_TRIAGE_LIMIT, session = null } = {}) => {
    const { tasks, hashOf } = await taskTriageContext(session);
    const stored = await taskTriageStore.read().catch(() => null);
    const targets = taskTriageTargets({ tasks, store: stored, ids, limit, hashOf });
    let store = normalizeTaskTriageStore(stored);
    const results = [];
    let failed = 0;
    for (const target of targets) {
      try {
        const { redacted } = redactForJev(target.text);
        // O teto do modelo é aplicado por corte dentro de `classifyRedacted`: validar aqui
        // recusava a publicação longa e travava a fila (TOO_LARGE a cada tentativa).
        const { suggestion } = await classifyRedacted(redacted, AI_CLASSIFIER_TASK_SCHEMA_ID);
        const category = suggestion.suggestion?.category || {};
        const urgency = suggestion.suggestion?.urgency || {};
        store = upsertTaskTriageEntry(store, target.id, {
          category: category.label || '',
          categoryConfidence: Number(category.confidence) || 0,
          urgency: urgency.label || '',
          urgencyConfidence: Number(urgency.confidence) || 0,
          action: suggestion.action,
          reason: suggestion.reason,
          payloadHash: target.hash
        });
        results.push({
          taskId: target.id,
          action: suggestion.action,
          category: category.label || '',
          categoryConfidence: Number(category.confidence) || 0,
          urgency: urgency.label || '',
          urgencyConfidence: Number(urgency.confidence) || 0,
          confidence: suggestion.confidence
        });
      } catch (error) {
        failed += 1;
        results.push({ taskId: target.id, error: String(error?.code || error?.message || 'ERRO').slice(0, 120) });
      }
    }
    if (targets.length > 0) await taskTriageStore.write(store);
    const pending = taskTriagePending({ tasks, store, hashOf }).length;
    return { ok: true, classified: results.length - failed, failed, pending, results };
  };

  const duplicateContext = async (session = null) => {
    if (!duplicateStore || typeof duplicateStore.read !== 'function' || typeof duplicateStore.write !== 'function') {
      fail(503, 'Revisão assistiva de duplicatas indisponível neste servidor.');
    }
    const envelope = await readAppStateEnvelope().catch(() => null);
    const state = projectStateForSession(envelope?.state || {}, session);
    if (!readAiClassifierSetting(state).enabled) {
      fail(409, 'Atrium IA desligado. Ative nas configurações do escritório.');
    }
    return {
      envelope,
      intimations: Array.isArray(state.intimations) ? state.intimations : [],
      hashOf: text => payloadHash(text)
    };
  };

  const buildDuplicatePairs = intimations => duplicateReviewPairs({
    intimations,
    groupDuplicateCandidates,
    limit: DUPLICATE_REVIEW_LIMIT
  });

  const runDuplicateReview = async ({ keys = null, limit = AI_CLASSIFIER_DUPLICATE_TRIAGE_LIMIT, session = null } = {}) => {
    const { intimations, hashOf } = await duplicateContext(session);
    const stored = await duplicateStore.read().catch(() => null);
    const pairs = buildDuplicatePairs(intimations);
    const pending = duplicateReviewPending({ pairs, store: stored, hashOf });
    const wanted = Array.isArray(keys) && keys.length ? new Set(keys.map(String)) : null;
    const size = Math.max(1, Math.min(Number(limit) || AI_CLASSIFIER_DUPLICATE_TRIAGE_LIMIT, AI_CLASSIFIER_DUPLICATE_TRIAGE_LIMIT));
    const targets = (wanted ? pending.filter(pair => wanted.has(pair.key)) : pending).slice(0, size);
    let store = normalizeDuplicateReviewStore(stored);
    const results = [];
    let failed = 0;
    for (const target of targets) {
      try {
        const { redacted } = redactForJev(target.text);
        // O teto do modelo é aplicado por corte dentro de `classifyRedacted`: validar aqui
        // recusava a publicação longa e travava a fila (TOO_LARGE a cada tentativa).
        const { suggestion } = await classifyRedacted(redacted, AI_CLASSIFIER_DUPLICATE_SCHEMA_ID);
        const verdict = suggestion.suggestion?.verdict || {};
        store = upsertDuplicateReviewEntry(store, target.key, {
          verdict: verdict.label || '',
          confidence: Number(verdict.confidence) || 0,
          action: suggestion.action,
          reason: suggestion.reason,
          pairType: target.pairType,
          payloadHash: target.hash
        });
        results.push({
          key: target.key,
          aId: target.aId,
          bId: target.bId,
          pairType: target.pairType,
          verdict: verdict.label || '',
          confidence: Number(verdict.confidence) || 0,
          action: suggestion.action
        });
      } catch (error) {
        failed += 1;
        results.push({ key: target.key, error: String(error?.code || error?.message || 'ERRO').slice(0, 120) });
      }
    }
    if (targets.length > 0) await duplicateStore.write(store);
    const remaining = duplicateReviewPending({ pairs, store, hashOf }).length;
    return { ok: true, classified: results.length - failed, failed, pending: remaining, candidates: pairs.length, results };
  };

  const taskDuplicateContext = async (session = null) => {
    if (!taskDuplicateStore || typeof taskDuplicateStore.read !== 'function' || typeof taskDuplicateStore.write !== 'function') {
      fail(503, 'Conferência assistiva de tarefas repetidas indisponível neste servidor.');
    }
    const envelope = await readAppStateEnvelope().catch(() => null);
    const state = projectStateForSession(envelope?.state || {}, session);
    if (!readAiClassifierSetting(state).enabled) {
      fail(409, 'Atrium IA desligado. Ative nas configurações do escritório.');
    }
    const projected = projectStateForSession(state, session);
    const tasks = Array.isArray(projected.tasks) ? projected.tasks : [];
    const intimations = Array.isArray(projected.intimations) ? projected.intimations : [];
    // A intimação de cada tarefa entra na escolha do dono (frescor da declaração da fonte), e não
    // o `updatedAt` da tarefa — que é reescrito a cada coleta.
    const intimationByKey = intimationIndexByKey(intimations);
    return {
      envelope,
      state,
      tasks,
      intimationOf: task => resolveTaskIntimation(task, intimationByKey),
      hashOf: (text, pair) => payloadHash(`${text}\n${pair?.publicationFingerprint || ''}`)
    };
  };

  const buildTaskDuplicatePairs = ({ tasks, intimationOf, store }) => {
    const entries = normalizeDuplicateReviewStore(store).entries;
    return planTaskDuplicateCandidatePairs({
      tasks, intimationOf, limit: TASK_DUPLICATE_CANDIDATE_LIMIT,
      isReviewed: pair => Boolean(entries[pair.key]?.payloadHash && entries[pair.key].payloadHash === payloadHash(`${pair.text}\n${pair.publicationFingerprint || ''}`))
    });
  };

  /**
   * Absorção autônoma aprovada pelo operador (veredito `mesma` + confiança ≥ 0.90 + projeção
   * intocada da fonte). Aplica o plano dos trilhos numa única gravação, com a auditoria publicada
   * por esta rota — como no caminho humano — e registra na store o que de fato aconteceu. O que
   * não absorve sai com motivo declarado; nada aqui decide prazo, ciência ou envio (§15–§17).
   */
  const applyTaskDuplicateAutoAbsorptions = async ({ pairs, store, hashOf, absorptions = [], kept = [], session = null }) => {
    if (absorptions.length === 0) return { absorbed: [], refused: kept, store, revision: '' };
    const nowIso = new Date().toISOString();
    const aplicado = await enqueueAppStateMutation(async () => {
      const envelope = await readAppStateEnvelope();
      const state = envelope.state || {};
      const auditEntries = [];
      const absorvidas = [];
      const recusadas = [];
      const visibleState = projectStateForSession(state, session);
      const visibleTasks = Array.isArray(visibleState.tasks) ? visibleState.tasks : [];
      const intimationByKey = intimationIndexByKey(visibleState.intimations || []);
      const currentIntimation = task => resolveTaskIntimation(task, intimationByKey);
      for (const absorcao of absorptions) {
        const original = pairs.find(item => item.key === absorcao.key);
        const currentPairTasks = visibleTasks.filter(item => item && [absorcao.keeperId, absorcao.absorbedId].includes(String(item.id)));
        const candidate = planTaskDuplicateCandidatePairs({ tasks: currentPairTasks, intimationOf: currentIntimation }).pairs.find(item => item.key === absorcao.key);
        if (!original || !candidate || hashOf(candidate.text, candidate) !== hashOf(original.text, original)) {
          recusadas.push({ key: absorcao.key, motivo: 'par-alterado', confidence: absorcao.confidence });
          continue;
        }
        const checked = planTaskAutoAbsorptions({
          tasks: currentPairTasks,
          verdicts: [{ key: absorcao.key, aId: candidate.aId, bId: candidate.bId, verdict: 'mesma', confidence: absorcao.confidence }],
          limit: 1,
          intimationOf: currentIntimation
        });
        if (!checked.absorptions.some(item => item.keeperId === absorcao.keeperId && item.absorbedId === absorcao.absorbedId)) {
          recusadas.push({ key: absorcao.key, motivo: checked.kept[0]?.motivo || 'par-alterado', confidence: absorcao.confidence });
          continue;
        }
        const resultado = applyTaskGroupConsolidation(state, {
          keeperId: absorcao.keeperId,
          loserIds: [absorcao.absorbedId],
          actor: AI_CLASSIFIER_AUTONOMOUS_ACTOR,
          decision: 'automatica',
          reason: absorcao.reason,
          nowIso
        });
        if (!resultado.changed) {
          recusadas.push({ key: absorcao.key, motivo: String(resultado.reason || 'sem-mudanca'), confidence: absorcao.confidence });
          continue;
        }
        absorvidas.push(absorcao);
        for (const entry of resultado.auditEntries) auditEntries.push(entry);
      }
      for (const entry of auditEntries) {
        state.audit = [entry, ...(Array.isArray(state.audit) ? state.audit : [])].slice(0, 5000);
      }
      const saved = absorvidas.length ? await saveAppStateDirectUnlocked(state, envelope.revision || null) : null;
      // Registro vivo de cada tarefa tocada (por id), para o cliente espelhar o servidor inteiro.
      const taskById = new Map((Array.isArray(state.tasks) ? state.tasks : [])
        .filter(task => task && task.id)
        .map(task => [String(task.id), task]));
      return { saved, absorvidas, recusadas, taskById };
    });
    // A store só registra o que o estado confirmou — gravação recusada não vira "absorvida".
    let next = store;
    for (const absorcao of aplicado.absorvidas) {
      const par = pairs.find(item => item.key === absorcao.key);
      next = upsertDuplicateReviewEntry(next, absorcao.key, {
        verdict: 'mesma',
        confidence: absorcao.confidence,
        action: 'absorbed',
        reason: String(absorcao.detail || '').slice(0, 300),
        pairType: 'task-auto-absorb',
        payloadHash: par && typeof hashOf === 'function' ? hashOf(par.text, par) : ''
      });
    }
    await taskDuplicateStore.write(next).catch(() => false);
    // Os registros tocados voltam como ficaram gravados: o cliente espelha exatamente o estado do
    // servidor (sem isso, o primeiro flush apagaria `absorbedBy`, `absorbReason` e o histórico — a
    // absorção deixaria de ser anunciada e o desfazer sumiria do painel).
    const tocados = [];
    const vistos = new Set();
    for (const absorcao of aplicado.absorvidas) {
      for (const id of [absorcao.absorbedId, absorcao.keeperId]) {
        if (vistos.has(String(id))) continue;
        vistos.add(String(id));
        const registro = aplicado.taskById.get(String(id));
        if (registro) tocados.push(registro);
      }
    }
    return {
      absorbed: aplicado.absorvidas,
      refused: [...kept, ...aplicado.recusadas],
      store: next,
      revision: aplicado.saved?.revision || '',
      tasks: tocados
    };
  };

  const runTaskDuplicateReview = async ({ keys = null, limit = AI_CLASSIFIER_TASK_DUPLICATE_TRIAGE_LIMIT, session = null } = {}) => {
    const { tasks, intimationOf, hashOf } = await taskDuplicateContext(session);
    const stored = await taskDuplicateStore.read().catch(() => null);
    const { pairs, truncated } = buildTaskDuplicatePairs({ tasks, intimationOf, store: stored });
    let store = normalizeDuplicateReviewStore(stored);
    const pending = duplicateReviewPending({ pairs, store, hashOf });
    const wanted = Array.isArray(keys) && keys.length ? new Set(keys.map(String)) : null;
    const size = Math.max(1, Math.min(Number(limit) || AI_CLASSIFIER_TASK_DUPLICATE_TRIAGE_LIMIT, AI_CLASSIFIER_TASK_DUPLICATE_TRIAGE_LIMIT));
    const targets = (wanted ? pending.filter(pair => wanted.has(pair.key)) : pending).slice(0, size);
    const results = [];
    let failed = 0;
    for (const target of targets) {
      try {
        const { redacted } = redactForJev(target.text);
        const { suggestion } = await classifyRedacted(redacted, AI_CLASSIFIER_TASK_DUPLICATE_SCHEMA_ID);
        const verdict = suggestion.suggestion?.verdict || {};
        store = upsertDuplicateReviewEntry(store, target.key, {
          verdict: verdict.label || '',
          confidence: Number(verdict.confidence) || 0,
          action: suggestion.action,
          reason: suggestion.reason,
          pairType: 'task-same-process',
          payloadHash: target.hash
        });
        results.push({
          key: target.key,
          verdict: verdict.label || '',
          confidence: Number(verdict.confidence) || 0,
          action: suggestion.action
        });
      } catch (error) {
        failed += 1;
        results.push({ key: target.key, error: String(error?.code || error?.message || 'ERRO').slice(0, 120) });
      }
    }
    if (targets.length > 0) await taskDuplicateStore.write(store);
    // Vereditos vigentes (texto comparado inalterado), inclusive de execuções anteriores: o teto
    // por execução limita cada rodada, mas não pode deixar o par elegível preso para sempre.
    const verdicts = [];
    for (const pair of pairs) {
      const entry = store.entries[pair.key];
      if (!entry?.verdict || entry.action === 'absorbed') continue;
      const hash = hashOf(pair.text, pair);
      if (!hash || entry.payloadHash !== hash) continue;
      verdicts.push({
        key: pair.key,
        aId: pair.aId,
        bId: pair.bId,
        verdict: entry.verdict,
        confidence: entry.confidence,
        reason: entry.reason
      });
    }
    const plano = planTaskAutoAbsorptions({ tasks, verdicts, intimationOf });
    const aplicado = await applyTaskDuplicateAutoAbsorptions({ pairs, store, hashOf, absorptions: plano.absorptions, kept: plano.kept, session });
    const remaining = duplicateReviewPending({ pairs, store: aplicado.store, hashOf }).length;
    return {
      ok: true,
      classified: results.length - failed,
      failed,
      pending: remaining,
      truncated,
      candidates: pairs.length,
      threshold: plano.threshold,
      limit: plano.limit,
      // Revisão do estado depois da absorção: o painel adota a revisão do servidor e o próximo
      // flush não cai em 409 (mesmo contrato da consolidação humana).
      revision: aplicado.revision || '',
      // Tarefas tocadas como ficaram gravadas (o cliente espelha, não reconstrói).
      tasks: aplicado.tasks,
      results,
      absorbed: aplicado.absorbed.map(item => ({
        key: item.key,
        keeperId: item.keeperId,
        absorbedId: item.absorbedId,
        confidence: item.confidence
      })),
      refused: aplicado.refused.map(item => ({
        key: item.key,
        motivo: String(item.motivo || ''),
        confidence: Number(item.confidence) || 0
      }))
    };
  };

  /**
   * Risco de estouro do prazo que a tarefa JÁ tem (priorização, nunca prazo): o modelo lê a tarefa
   * com a situação e os prazos existentes e devolve risco + bloqueio externo. Nada é criado,
   * alterado ou inferido (§16); a store é derivada (`task-risk.json`).
   */
  const taskRiskContext = async (session = null) => {
    if (!taskRiskStore || typeof taskRiskStore.read !== 'function' || typeof taskRiskStore.write !== 'function') {
      fail(503, 'Sugestão de risco das tarefas indisponível neste servidor.');
    }
    const envelope = await readAppStateEnvelope().catch(() => null);
    const state = projectStateForSession(envelope?.state || {}, session);
    if (!readAiClassifierSetting(state).enabled) {
      fail(409, 'Atrium IA desligado. Ative nas configurações do escritório.');
    }
    return {
      envelope,
      tasks: Array.isArray(state.tasks) ? state.tasks : [],
      hashOf: text => payloadHash(text)
    };
  };

  const runTaskRiskTriage = async ({ ids = null, limit = AI_CLASSIFIER_TASK_RISK_TRIAGE_LIMIT, session = null } = {}) => {
    const { tasks, hashOf } = await taskRiskContext(session);
    const stored = await taskRiskStore.read().catch(() => null);
    const targets = taskRiskTargets({ tasks, store: stored, ids, limit, hashOf });
    let store = normalizeTaskRiskStore(stored);
    const results = [];
    let failed = 0;
    for (const target of targets) {
      try {
        const { redacted } = redactForJev(target.text);
        const { suggestion } = await classifyRedacted(redacted, AI_CLASSIFIER_TASK_RISK_SCHEMA_ID);
        const risk = suggestion.suggestion?.risk || {};
        store = upsertTaskRiskEntry(store, target.id, {
          risk: risk.label || '',
          riskConfidence: Number(risk.confidence) || 0,
          action: suggestion.action,
          reason: suggestion.reason,
          payloadHash: target.hash
        });
        results.push({
          taskId: target.id,
          risk: risk.label || '',
          riskConfidence: Number(risk.confidence) || 0,
          blocked: suggestion.suggestion?.blocked?.label === 'sim',
          action: suggestion.action
        });
      } catch (error) {
        failed += 1;
        results.push({ taskId: target.id, error: String(error?.code || error?.message || 'ERRO').slice(0, 120) });
      }
    }
    // Só grava quando algum item foi lido: falha total não mexe no derivado.
    if (targets.length > 0 && results.length > failed) await taskRiskStore.write(store);
    const pending = taskRiskPending({ tasks, store, hashOf }).length;
    return { ok: true, classified: results.length - failed, failed, pending, results };
  };

  const processTriageContext = async (session = null) => {
    if (!processTriageStore || typeof processTriageStore.read !== 'function' || typeof processTriageStore.write !== 'function') {
      fail(503, 'Triagem assistiva de processos indisponível neste servidor.');
    }
    const envelope = await readAppStateEnvelope().catch(() => null);
    const state = projectStateForSession(envelope?.state || {}, session);
    if (!readAiClassifierSetting(state).enabled) {
      fail(409, 'Atrium IA desligado. Ative nas configurações do escritório.');
    }
    return {
      envelope,
      processes: Array.isArray(state.processes) ? state.processes : [],
      hashOf: text => payloadHash(text)
    };
  };

  const runProcessTriage = async ({ ids = null, limit = AI_CLASSIFIER_PROCESS_TRIAGE_LIMIT, session = null } = {}) => {
    const { processes, hashOf } = await processTriageContext(session);
    const stored = await processTriageStore.read().catch(() => null);
    const targets = processTriageTargets({ processes, store: stored, ids, limit, hashOf });
    let store = normalizeProcessTriageStore(stored);
    const results = [];
    let failed = 0;
    for (const target of targets) {
      try {
        const { redacted } = redactForJev(target.text);
        // O teto do modelo é aplicado por corte dentro de `classifyRedacted`: validar aqui
        // recusava a publicação longa e travava a fila (TOO_LARGE a cada tentativa).
        const { suggestion } = await classifyRedacted(redacted, AI_CLASSIFIER_PROCESS_SCHEMA_ID);
        const movement = suggestion.suggestion?.movement_type || {};
        const attention = suggestion.suggestion?.needs_attention || {};
        store = upsertProcessTriageEntry(store, target.id, {
          movementType: movement.label || '',
          movementConfidence: Number(movement.confidence) || 0,
          needsAttention: attention.label || '',
          action: suggestion.action,
          reason: suggestion.reason,
          missingFields: target.missingFields,
          payloadHash: target.hash
        });
        results.push({
          processId: target.id,
          action: suggestion.action,
          movementType: movement.label || '',
          movementConfidence: Number(movement.confidence) || 0,
          needsAttention: attention.label || '',
          missingFields: target.missingFields,
          confidence: suggestion.confidence
        });
      } catch (error) {
        failed += 1;
        results.push({ processId: target.id, error: String(error?.code || error?.message || 'ERRO').slice(0, 120) });
      }
    }
    if (targets.length > 0) await processTriageStore.write(store);
    const pending = processTriagePending({ processes, store, hashOf }).length;
    return { ok: true, classified: results.length - failed, failed, pending, results };
  };

  const financialTriageContext = async (session = null) => {
    if (!financialTriageStore || typeof financialTriageStore.read !== 'function' || typeof financialTriageStore.write !== 'function') {
      fail(503, 'Triagem assistiva de lançamentos indisponível neste servidor.');
    }
    const envelope = await readAppStateEnvelope().catch(() => null);
    const state = projectStateForSession(envelope?.state || {}, session);
    if (!readAiClassifierSetting(state).enabled) {
      fail(409, 'Atrium IA desligado. Ative nas configurações do escritório.');
    }
    return { envelope, records: collectFinancialRecords(state), hashOf: text => payloadHash(text) };
  };

  /**
   * Triagem assistiva da carteira: sugere um bucket de conferência por lançamento com descrição
   * livre, falha isolada por item e nunca escreve no registro financeiro (o selo é só conferência).
   */
  const runFinancialTriage = async ({ ids = null, limit = AI_CLASSIFIER_FINANCIAL_TRIAGE_LIMIT, session = null } = {}) => {
    const { records, hashOf } = await financialTriageContext(session);
    const stored = await financialTriageStore.read().catch(() => null);
    const targets = financialTriageTargets({ records, store: stored, ids, limit, hashOf });
    let store = normalizeFinancialTriageStore(stored);
    const results = [];
    let failed = 0;
    for (const target of targets) {
      try {
        const { redacted } = redactForJev(target.text);
        const { suggestion } = await classifyRedacted(redacted, AI_CLASSIFIER_FINANCIAL_SCHEMA_ID);
        const bucket = suggestion.suggestion?.bucket || {};
        store = upsertFinancialTriageEntry(store, target.id, {
          bucket: bucket.label || '',
          bucketConfidence: Number(bucket.confidence) || 0,
          action: suggestion.action,
          reason: suggestion.reason,
          payloadHash: target.hash
        });
        results.push({
          entryId: target.id,
          bucket: bucket.label || '',
          bucketConfidence: Number(bucket.confidence) || 0,
          action: suggestion.action
        });
      } catch (error) {
        failed += 1;
        results.push({ entryId: target.id, error: String(error?.code || error?.message || 'ERRO').slice(0, 120) });
      }
    }
    if (targets.length > 0) await financialTriageStore.write(store);
    const pending = financialTriagePending({ records, store, hashOf }).length;
    return { ok: true, classified: results.length - failed, failed, pending, results };
  };

  const handleAiClassifierRequest = async function handleAiClassifierRequest(req, res, url) {
    const isStatus = req.method === 'GET' && url.pathname === '/api/ai-classifier/status';
    const isSettings = req.method === 'PATCH' && url.pathname === '/api/ai-classifier/settings';
    const isOrganize = req.method === 'POST' && url.pathname === '/api/ai-classifier/organize';
    const isSuggest = req.method === 'POST' && url.pathname === '/api/ai-classifier/suggest';
    const isSuggestions = req.method === 'GET' && url.pathname === '/api/ai-classifier/suggestions';
    const isTriageBacklog = req.method === 'POST' && url.pathname === '/api/ai-classifier/triage-backlog';
    const isTaskSuggestions = req.method === 'GET' && url.pathname === '/api/ai-classifier/task-suggestions';
    const isTaskTriage = req.method === 'POST' && url.pathname === '/api/ai-classifier/triage-tasks';
    const isDuplicateCandidates = req.method === 'GET' && url.pathname === '/api/ai-classifier/duplicate-candidates';
    const isDuplicateCheck = req.method === 'POST' && url.pathname === '/api/ai-classifier/duplicate-check';
    const isDuplicateDismiss = req.method === 'POST' && url.pathname === '/api/ai-classifier/duplicate-dismiss';
    const isTaskDuplicateCandidates = req.method === 'GET' && url.pathname === '/api/ai-classifier/task-duplicate-candidates';
    const isTaskDuplicateTriage = req.method === 'POST' && url.pathname === '/api/ai-classifier/triage-task-duplicates';
    const isTaskRisks = req.method === 'GET' && url.pathname === '/api/ai-classifier/task-risks';
    const isTaskRiskTriage = req.method === 'POST' && url.pathname === '/api/ai-classifier/triage-task-risks';
    const isPublicationAction = req.method === 'POST' && url.pathname === '/api/ai-classifier/suggest-publication-action';
    const isPublicationPlaybook = req.method === 'GET' && url.pathname === '/api/ai-classifier/publication-playbook';
    const isTaskInsights = req.method === 'GET' && url.pathname === '/api/ai-classifier/task-insights';
    const isProcessSuggestions = req.method === 'GET' && url.pathname === '/api/ai-classifier/process-suggestions';
    const isProcessTriage = req.method === 'POST' && url.pathname === '/api/ai-classifier/triage-processes';
    const isCorrect = req.method === 'POST' && url.pathname === '/api/ai-classifier/correct';
    const isFinancialSuggestions = req.method === 'GET' && url.pathname === '/api/ai-classifier/financial-suggestions';
    const isFinancialTriage = req.method === 'POST' && url.pathname === '/api/ai-classifier/triage-financial';
    if (!isStatus && !isSettings && !isOrganize && !isSuggest && !isSuggestions && !isTriageBacklog && !isTaskSuggestions && !isTaskTriage && !isDuplicateCandidates && !isDuplicateCheck && !isDuplicateDismiss && !isTaskDuplicateCandidates && !isTaskDuplicateTriage && !isTaskRisks && !isTaskRiskTriage && !isPublicationAction && !isPublicationPlaybook && !isTaskInsights && !isProcessSuggestions && !isProcessTriage && !isCorrect && !isFinancialSuggestions && !isFinancialTriage) return false;

    if (isStatus) {
      const session = assertAuthenticated(req, false);
      void session;
      const envelope = await readAppStateEnvelope().catch(() => null);
      const setting = readAiClassifierSetting(envelope?.state);
      const availabilityState = await availability();
      const calibration = calibrationStore ? normalizeCalibrationStore(await calibrationStore.read().catch(() => null)) : null;
      json(res, 200, {
        ok: true,
        enabled: setting.enabled,
        available: availabilityState.ok === true,
        reason: availabilityState.ok === true ? 'operacional' : String(availabilityState.reason || 'indisponível'),
        // Áreas nomeadas pelo escritório: alimentam os botões de correção do painel.
        customAreas: calibration ? calibration.customAreas : []
      });
      return true;
    }

    if (isCorrect) {
      const session = assertAuthenticated(req, true);
      if (!calibrationStore) fail(503, 'Aprendizado do classificador indisponível neste servidor.');
      const body = await readJson(req, 20_000);
      const schemaId = String(body.schemaId || AI_CLASSIFIER_SCHEMA_ID).trim();
      const schema = getJevSchema(schemaId);
      const questionKey = String(body.questionKey || '').trim();
      const question = schema.questions.find(item => item.key === questionKey);
      if (!question) fail(400, 'Pergunta desconhecida para este esquema.');
      const label = String(body.label || '').trim();
      let stored = normalizeCalibrationStore(await calibrationStore.read().catch(() => null));
      // "Outra área" com nome: a pessoa nomeia a área e ela fica registrada no escritório para
      // reutilizar no painel. Só entra por escolha explícita (`custom: true`) ou quando já existe;
      // o vocabulário fixo do modelo continua intocado (a área nomeada é rótulo humano).
      let customArea = '';
      if (!question.labels.includes(label)) {
        if (questionKey !== 'area') fail(400, 'Rótulo inválido para esta pergunta.');
        customArea = findCustomArea(stored, label);
        if (!customArea && body.custom === true) {
          customArea = sanitizeCustomArea(label);
          if (!customArea) fail(400, `Dê um nome de ${CALIBRATION_CUSTOM_AREA_MIN_CHARS} a ${CALIBRATION_CUSTOM_AREA_CHARS} caracteres para a área.`);
          stored = registerCustomArea(stored, customArea).store;
        }
        if (!customArea) fail(400, 'Rótulo inválido para esta pergunta.');
      }
      const envelope = await readAppStateEnvelope().catch(() => null);
      const state = projectStateForSession(envelope?.state || {}, session);
      const record = resolveIntimationAlias(
        Array.isArray(state.intimations) ? state.intimations : [],
        String(body.intimationId || body.targetKey || '').trim()
      );
      if (!record) fail(404, 'Publicação não encontrada para corrigir.');
      const targetKey = String(record.id || body.intimationId || '').trim();
      const stored2 = stored;
      const triage = normalizePublicationTriageStore(await triageStore.read().catch(() => null));
      const entry = triage.entries[targetKey] || null;
      const modelLabel = !entry
        ? ''
        : questionKey === 'area'
          ? String(entry.area || '')
          : questionKey === 'priority'
            ? String(entry.priority || '')
            : '';
      const correction = recordHumanCorrection(stored2, {
        schemaId,
        questionKey,
        label: customArea || label,
        modelLabel,
        excerpt: redactedExcerptOf(record),
        targetKey,
        actor: sessionActor(session)
      });
      await calibrationStore.write(correction.store).catch(() => false);
      json(res, 200, {
        ok: true,
        schemaId,
        questionKey,
        label: customArea || label,
        origin: 'humano',
        targetKey,
        customAreas: customAreasOf(correction.store),
        example: correction.example ? { excerpt: correction.example.excerpt, at: correction.example.at } : null,
        stats: calibrationStats(correction.store),
        message: customArea
          ? `Área "${customArea}" registrada e aplicada: ela passa a aparecer como opção no painel.${correction.example ? ' A correção vira exemplo do aprendizado do classificador.' : ' O trecho não entrou como exemplo (conteúdo sensível ou vazio).'}`
          : correction.example
            ? 'Correção registrada: ela passa a valer no painel e vira exemplo do aprendizado do classificador.'
            : 'Correção registrada no painel. O trecho não entrou como exemplo (conteúdo sensível ou vazio).'
      });
      return true;
    }

    if (isSuggestions) {
      const session = assertAuthenticated(req, false);
      const envelope = await readAppStateEnvelope().catch(() => null);
      const state = projectStateForSession(envelope?.state || {}, session);
      if (!readAiClassifierSetting(state).enabled) {
        json(res, 200, { ok: true, enabled: false, generatedAt: '', suggestions: {} });
        return true;
      }
      const stored = normalizePublicationTriageStore(await triageStore.read().catch(() => null));
      // Poda pelo acervo CANÔNICO (não destrói o que não é visível à sessão); a resposta é
      // filtrada pelo acervo projetado (não vaza o privado alheio).
      const canonicalIds = (Array.isArray(envelope?.state?.intimations) ? envelope.state.intimations : [])
        .map(record => String(record?.id || ''))
        .filter(Boolean);
      const pruned = prunePublicationTriageStore(stored, canonicalIds);
      if (Number(pruned.removed) > 0) await triageStore.write(pruned).catch(() => {});
      const visibleIds = new Set((Array.isArray(state.intimations) ? state.intimations : []).map(record => String(record?.id || '')));
      const calibration = calibrationStore ? normalizeCalibrationStore(await calibrationStore.read().catch(() => null)) : null;
      const intimationsById = new Map((Array.isArray(state.intimations) ? state.intimations : []).map(record => [String(record?.id || ''), record]));
      const processesByDigits = new Map();
      for (const process of Array.isArray(state.processes) ? state.processes : []) {
        const digits = String(process?.number || '').replace(/\D/g, '');
        if (digits && !processesByDigits.has(digits)) processesByDigits.set(digits, process);
      }
      const suggestions = {};
      for (const [id, entry] of Object.entries(pruned.entries)) {
        if (!visibleIds.has(id)) continue;
        // Evidência objetiva corrige palpite fraco já guardado, sem nova chamada ao modelo.
        const record = intimationsById.get(id);
        const digits = String(record?.process || record?.processNumber || '').replace(/\D/g, '');
        const publicEntry = applyAreaEvidence(publicTriageEntry(entry), deriveAreaEvidence({ record, process: processesByDigits.get(digits) || null }));
        const override = calibration ? suggestionOverrideFor(calibration, AI_CLASSIFIER_SCHEMA_ID, id) : null;
        suggestions[id] = override ? applyOverridesToTriageEntry(publicEntry, override) : publicEntry;
      }
      json(res, 200, { ok: true, enabled: true, generatedAt: pruned.generatedAt, suggestions });
      return true;
    }

    if (isTriageBacklog) {
      const session = assertAuthenticated(req, true);
      enforceSuggestRateLimit(req);
      const body = await readJson(req, 20_000).catch(() => ({}));
      const ids = Array.isArray(body?.ids)
        ? body.ids.map(String).filter(Boolean).slice(0, AI_CLASSIFIER_TRIAGE_LIMIT)
        : null;
      const limit = Number(body?.limit) || AI_CLASSIFIER_TRIAGE_LIMIT;
      const result = await runTriageBacklog({ ids, limit, session });
      json(res, 200, result);
      return true;
    }

    if (isTaskSuggestions) {
      const session = assertAuthenticated(req, false);
      const envelope = await readAppStateEnvelope().catch(() => null);
      const state = projectStateForSession(envelope?.state || {}, session);
      if (!readAiClassifierSetting(state).enabled || !taskTriageStore) {
        json(res, 200, { ok: true, enabled: false, generatedAt: '', suggestions: {} });
        return true;
      }
      const stored = normalizeTaskTriageStore(await taskTriageStore.read().catch(() => null));
      const canonicalIds = (Array.isArray(envelope?.state?.tasks) ? envelope.state.tasks : [])
        .filter(record => record && record.active !== false && !record.absorbedInto)
        .map(record => String(record?.id || ''))
        .filter(Boolean);
      const pruned = pruneTaskTriageStore(stored, canonicalIds);
      if (Number(pruned.removed) > 0) await taskTriageStore.write(pruned).catch(() => {});
      const visibleIds = new Set((Array.isArray(state.tasks) ? state.tasks : []).map(record => String(record?.id || '')));
      const suggestions = {};
      for (const [id, entry] of Object.entries(pruned.entries)) if (visibleIds.has(id)) suggestions[id] = publicTaskTriageEntry(entry);
      json(res, 200, { ok: true, enabled: true, generatedAt: pruned.generatedAt, suggestions });
      return true;
    }

    if (isTaskTriage) {
      assertAuthenticated(req, true);
      enforceSuggestRateLimit(req);
      const body = await readJson(req, 20_000).catch(() => ({}));
      const ids = Array.isArray(body?.ids)
        ? body.ids.map(String).filter(Boolean).slice(0, AI_CLASSIFIER_TASK_TRIAGE_LIMIT)
        : null;
      const limit = Number(body?.limit) || AI_CLASSIFIER_TASK_TRIAGE_LIMIT;
      const result = await runTaskTriage({ ids, limit, session: assertAuthenticated(req, true) });
      json(res, 200, result);
      return true;
    }

    if (isDuplicateCandidates) {
      const session = assertAuthenticated(req, false);
      const envelope = await readAppStateEnvelope().catch(() => null);
      const state = projectStateForSession(envelope?.state || {}, session);
      if (!readAiClassifierSetting(state).enabled || !duplicateStore) {
        json(res, 200, { ok: true, enabled: false, generatedAt: '', pairs: [] });
        return true;
      }
      const pairs = buildDuplicatePairs(Array.isArray(state.intimations) ? state.intimations : []);
      const canonicalPairs = buildDuplicatePairs(Array.isArray(envelope?.state?.intimations) ? envelope.state.intimations : []);
      const stored = normalizeDuplicateReviewStore(await duplicateStore.read().catch(() => null));
      const pruned = pruneDuplicateReviewStore(stored, canonicalPairs.map(pair => pair.key));
      if (Number(pruned.removed) > 0) await duplicateStore.write(pruned).catch(() => {});
      const hashOf = text => payloadHash(text);
      // Par que a pessoa descartou (veredito humano "diferente") sai da conferência enquanto o
      // texto comparado continuar o mesmo; se o teor mudar, ele volta a aparecer para revisão.
      const visible = pairs.filter(pair => {
        const entry = pruned.entries[pair.key];
        if (!entry || entry.action !== 'dismissed') return true;
        const hash = hashOf(pair.text);
        return Boolean(entry.payloadHash && hash && entry.payloadHash !== hash);
      });
      json(res, 200, {
        ok: true,
        enabled: true,
        generatedAt: pruned.generatedAt,
        pairs: visible.map(pair => {
          const entry = pruned.entries[pair.key];
          return {
            key: pair.key,
            aId: pair.aId,
            bId: pair.bId,
            aSource: pair.aSource,
            bSource: pair.bSource,
            pairType: pair.pairType,
            exact: pair.exact === true,
            autoSafe: pair.autoSafe !== false,
            verdict: entry?.verdict || '',
            confidence: Number(entry?.confidence) || 0,
            action: entry?.action || '',
            reason: entry?.reason || '',
            at: entry?.at || ''
          };
        })
      });
      return true;
    }

    if (isDuplicateCheck) {
      assertAuthenticated(req, true);
      enforceSuggestRateLimit(req);
      const body = await readJson(req, 20_000).catch(() => ({}));
      const keys = Array.isArray(body?.keys)
        ? body.keys.map(String).filter(Boolean).slice(0, AI_CLASSIFIER_DUPLICATE_TRIAGE_LIMIT)
        : null;
      const limit = Number(body?.limit) || AI_CLASSIFIER_DUPLICATE_TRIAGE_LIMIT;
      const result = await runDuplicateReview({ keys, limit, session: assertAuthenticated(req, true) });
      json(res, 200, result);
      return true;
    }

    // "Descartar sugestão" (não fundir): veredito **humano** sobre um par. Dois efeitos:
    // (1) o par sai da conferência enquanto o texto comparado continuar o mesmo — se o teor
    // mudar, ele volta para revisão; (2) o rótulo entra na calibração do Atrium IA como
    // exemplo do escritório (`diferente`), então a próxima leitura parecida já aprende.
    if (isDuplicateDismiss) {
      const session = assertAuthenticated(req, true);
      if (!duplicateStore) fail(503, 'Revisão assistiva de duplicatas indisponível neste servidor.');
      const body = await readJson(req, 20_000);
      const idA = String(body.aId || body.publicationId || '').trim();
      const idB = String(body.bId || body.otherId || '').trim();
      const wantedKey = String(body.key || '').trim();
      if (!idA || !idB) fail(400, 'Informe as duas publicações do par que deve ser descartado.');
      const envelope = await readAppStateEnvelope().catch(() => null);
      const state = projectStateForSession(envelope?.state || {}, session);
      const pairs = buildDuplicatePairs(Array.isArray(state.intimations) ? state.intimations : []);
      const key = wantedKey || pairs.find(pair => pair.key === [idA, idB].sort().join('|'))?.key || '';
      const target = pairs.find(pair => pair.key === key) || null;
      if (!target) fail(404, 'Este par não está mais entre os candidatos de duplicata.');
      const hash = payloadHash(target.text);
      const stored = normalizeDuplicateReviewStore(await duplicateStore.read().catch(() => null));
      const previous = stored.entries[target.key] || null;
      const next = upsertDuplicateReviewEntry(stored, target.key, {
        verdict: 'diferente',
        confidence: 1,
        action: 'dismissed',
        reason: 'Conferência humana: o par não é a mesma publicação e não deve ser fundido.',
        pairType: target.pairType,
        payloadHash: hash
      });
      await duplicateStore.write(next).catch(() => false);

      // Aprendizado do escritório: a decisão humana vira exemplo de calibração do esquema de
      // duplicatas e nunca é sobrescrita pelo modelo.
      let learned = false;
      if (calibrationStore) {
        const calibration = normalizeCalibrationStore(await calibrationStore.read().catch(() => null));
        const correction = recordHumanCorrection(calibration, {
          schemaId: AI_CLASSIFIER_DUPLICATE_SCHEMA_ID,
          questionKey: 'verdict',
          label: 'diferente',
          modelLabel: String(previous?.verdict || ''),
          excerpt: redactForJev(target.text).redacted || '',
          targetKey: target.key,
          actor: sessionActor(session)
        });
        await calibrationStore.write(correction.store).catch(() => false);
        learned = Boolean(correction.example);
      }
      json(res, 200, {
        ok: true,
        key: target.key,
        verdict: 'diferente',
        origin: 'humano',
        learned,
        pending: duplicateReviewPending({ pairs, store: next, hashOf: text => payloadHash(text) }).length,
        message: learned
          ? 'Sugestão descartada: o par sai da conferência e a decisão vira exemplo do aprendizado do Atrium IA.'
          : 'Sugestão descartada: o par sai da conferência. O trecho não entrou como exemplo (conteúdo sensível ou vazio).'
      });
      return true;
    }

    // Tarefas repetidas do mesmo processo que a chave determinística não agrupou (o "mesmo ato
    // descrito de outra forma"): o JEV dá o veredito com motivo e confiança, e a autonomia só
    // absorve projeção intocada da fonte com veredito `mesma` e confiança ≥ 0.90.
    if (isTaskDuplicateCandidates) {
      const session = assertAuthenticated(req, false);
      const envelope = await readAppStateEnvelope().catch(() => null);
      const state = projectStateForSession(envelope?.state || {}, session);
      if (!readAiClassifierSetting(state).enabled || !taskDuplicateStore) {
        json(res, 200, { ok: true, enabled: false, generatedAt: '', pairs: [], absorbed: [] });
        return true;
      }
      const tasks = Array.isArray(state.tasks) ? state.tasks : [];
      const intimations = Array.isArray(state.intimations) ? state.intimations : [];
      const intimationByKey = intimationIndexByKey(intimations);
      const intimationOf = task => resolveTaskIntimation(task, intimationByKey);
      const stored = normalizeDuplicateReviewStore(await taskDuplicateStore.read().catch(() => null));
      const { pairs, truncated } = buildTaskDuplicatePairs({ tasks, intimationOf, store: stored });
      const canonicalTasks = Array.isArray(envelope?.state?.tasks) ? envelope.state.tasks : [];
      const canonicalIntimations = Array.isArray(envelope?.state?.intimations) ? envelope.state.intimations : [];
      const canonicalIndex = intimationIndexByKey(canonicalIntimations);
      const canonicalResult = buildTaskDuplicatePairs({ tasks: canonicalTasks, intimationOf: task => resolveTaskIntimation(task, canonicalIndex), store: stored });
      const canonicalPairs = canonicalResult.pairs;
      const pruned = canonicalResult.truncated ? stored : pruneDuplicateReviewStore(stored, [
        ...canonicalPairs.map(pair => pair.key),
        // O registro do que a autonomia absorveu fica: é a prova que o painel mostra com o desfazer.
        ...Object.keys(stored.entries).filter(key => stored.entries[key]?.action === 'absorbed')
      ]);
      if (Number(pruned.removed) > 0) await taskDuplicateStore.write(pruned).catch(() => false);
      const hashOf = (text, pair) => payloadHash(`${text}\n${pair?.publicationFingerprint || ''}`);
      const visiveis = pairs.map(pair => {
        const entry = pruned.entries[pair.key] || null;
        const a = tasks.find(task => task && String(task.id) === pair.aId) || null;
        const b = tasks.find(task => task && String(task.id) === pair.bId) || null;
        const keeper = a && b ? taskPairKeeper(a, b, { intimationA: intimationOf(a), intimationB: intimationOf(b) }) : null;
        const verdict = String(entry?.verdict || '');
        const confidence = Number(entry?.confidence) || 0;
        // Motivo declarado de o par **não** ter sido absorvido sozinho: reusa exatamente os trilhos
        // da autonomia, para o painel nunca prometer o que o servidor não faria. Par ainda não
        // classificado não recebe motivo (não é "incerto": não foi avaliado).
        let blockedBy = '';
        if (verdict && a && b) {
          const avaliacao = planTaskAutoAbsorptions({
            tasks,
            verdicts: [{ key: pair.key, aId: pair.aId, bId: pair.bId, verdict, confidence, reason: entry?.reason }],
            limit: 1,
            intimationOf
          });
          blockedBy = avaliacao.absorptions.length ? '' : String(avaliacao.kept[0]?.motivo || 'nao-avaliado');
        }
        return {
          key: pair.key,
          processKey: pair.processKey,
          aId: pair.aId,
          bId: pair.bId,
          aTitle: pair.aTitle,
          bTitle: pair.bTitle,
          aActLabel: pair.aActLabel,
          bActLabel: pair.bActLabel,
          verdict,
          confidence,
          action: String(entry?.action || ''),
          reason: String(entry?.reason || ''),
          at: String(entry?.at || ''),
          suggestedKeeperId: keeper ? String(keeper.id) : '',
          absorbedId: keeper && String(keeper.id) === pair.aId ? pair.bId : pair.aId,
          blockedBy
        };
      });
      const absorvidasDe = tasks
        .filter(task => task && task.absorbedInto && String(task.absorbedBy || '') === AI_CLASSIFIER_AUTONOMOUS_ACTOR);
      const absorvidas = absorvidasDe
        .sort((left, right) => String(right.absorbedAt || '').localeCompare(String(left.absorbedAt || '')))
        .slice(0, 10)
        .map(task => {
          const registro = pruned.entries[[String(task.id), String(task.absorbedInto)].sort().join('|')] || null;
          const keeper = tasks.find(item => item && String(item.id) === String(task.absorbedInto)) || null;
          return {
            id: String(task.id),
            keeperId: String(task.absorbedInto),
            title: String(task.title || '').slice(0, 120),
            keeperTitle: String(keeper?.title || '').slice(0, 120),
            at: String(task.absorbedAt || ''),
            reason: String(task.absorbReason || ''),
            confidence: Number(registro?.confidence) || 0,
            note: String(registro?.reason || '')
          };
        });
      json(res, 200, {
        ok: true,
        enabled: true,
        generatedAt: pruned.generatedAt,
        pending: duplicateReviewPending({ pairs, store: pruned, hashOf }).length,
        truncated,
        threshold: TASK_DUPLICATE_AUTO_ABSORB_CONFIDENCE,
        pairs: visiveis,
        absorbed: absorvidas,
        absorbedTotal: absorvidasDe.length
      });
      return true;
    }

    if (isTaskDuplicateTriage) {
      assertAuthenticated(req, true);
      enforceSuggestRateLimit(req);
      const body = await readJson(req, 20_000).catch(() => ({}));
      const keys = Array.isArray(body?.keys)
        ? body.keys.map(String).filter(Boolean).slice(0, AI_CLASSIFIER_TASK_DUPLICATE_TRIAGE_LIMIT)
        : null;
      const limit = Number(body?.limit) || AI_CLASSIFIER_TASK_DUPLICATE_TRIAGE_LIMIT;
      const result = await runTaskDuplicateReview({ keys, limit, session: assertAuthenticated(req, true) });
      json(res, 200, result);
      return true;
    }

    // Risco de estouro: leitura para o painel (selo + filtro) e classificação por lote.
    if (isTaskRisks) {
      const session = assertAuthenticated(req, false);
      const envelope = await readAppStateEnvelope().catch(() => null);
      const state = projectStateForSession(envelope?.state || {}, session);
      if (!readAiClassifierSetting(state).enabled || !taskRiskStore) {
        json(res, 200, { ok: true, enabled: false, generatedAt: '', pending: 0, suggestions: {} });
        return true;
      }
      const tasks = Array.isArray(state.tasks) ? state.tasks : [];
      const stored = normalizeTaskRiskStore(await taskRiskStore.read().catch(() => null));
      const canonicalIds = (Array.isArray(envelope?.state?.tasks) ? envelope.state.tasks : []).map(task => String(task?.id || '')).filter(Boolean);
      const pruned = pruneTaskRiskStore(stored, canonicalIds);
      if (Number(pruned.removed) > 0) await taskRiskStore.write(pruned).catch(() => false);
      const visibleIds = new Set(tasks.map(task => String(task?.id || '')));
      const hashOf = text => payloadHash(text);
      const suggestions = {};
      for (const [id, entry] of Object.entries(pruned.entries)) {
        if (!visibleIds.has(id)) continue;
        // Só o motivo em linguagem cruza a API: o código interno do motor não vira contrato de tela.
        suggestions[id] = {
          risk: entry.risk,
          riskConfidence: entry.riskConfidence,
          action: entry.action,
          reasonLabel: AI_CLASSIFIER_REASON_LABELS[String(entry.reason || '')] || 'leitura concluída pela Atrium IA',
          at: entry.at
        };
      }
      json(res, 200, {
        ok: true,
        enabled: true,
        generatedAt: pruned.generatedAt,
        pending: taskRiskPending({ tasks, store: pruned, hashOf }).length,
        suggestions
      });
      return true;
    }

    if (isTaskRiskTriage) {
      assertAuthenticated(req, true);
      enforceSuggestRateLimit(req);
      const body = await readJson(req, 20_000).catch(() => ({}));
      const ids = Array.isArray(body?.ids)
        ? body.ids.map(String).filter(Boolean).slice(0, AI_CLASSIFIER_TASK_RISK_TRIAGE_LIMIT)
        : null;
      const limit = Number(body?.limit) || AI_CLASSIFIER_TASK_RISK_TRIAGE_LIMIT;
      const result = await runTaskRiskTriage({ ids, limit, session: assertAuthenticated(req, true) });
      json(res, 200, result);
      return true;
    }

    // Do prazo à providência: o JEV lê a publicação e sugere a **natureza** da providência em
    // vocabulário fixo; o item do catálogo é escolhido pelo servidor por regra determinística
    // (nunca pelo modelo) e pode ser trocado por pessoa antes de confirmar. Nada é criado aqui.
    if (isPublicationAction) {
      const session = assertAuthenticated(req, true);
      enforceSuggestRateLimit(req);
      const body = await readJson(req, 20_000);
      const intimationId = String(body.intimationId || '').trim();
      if (!intimationId) fail(400, 'Informe a publicação para sugerir a providência.');
      const envelope = await readAppStateEnvelope().catch(() => null);
      const state = projectStateForSession(envelope?.state || {}, session);
      if (!readAiClassifierSetting(state).enabled) {
        fail(409, 'Atrium IA desligado. Ative nas configurações do escritório.');
      }
      const intimations = Array.isArray(state.intimations) ? state.intimations : [];
      const record = resolveIntimationAlias(intimations, intimationId);
      if (!record || typeof record !== 'object') fail(404, 'Publicação não encontrada.');
      const sourceText = [record.title, record.text, record.fullText]
        .map(part => String(part || '').trim())
        .filter(Boolean)
        .join('\n\n')
        .slice(0, AI_CLASSIFIER_MAX_INPUT_CHARS);
      if (!sourceText) fail(422, 'Publicação sem texto para sugerir providência.');
      const { redacted } = redactForJev(sourceText);
      const { suggestion } = await classifyRedacted(redacted, AI_CLASSIFIER_PUBLICATION_ACTION_SCHEMA_ID);
      const label = String(suggestion.suggestion?.action?.label || '');
      const action = PUBLICATION_ACTION_IDS.includes(label) ? label : 'outro';
      const confidence = Number(suggestion.suggestion?.action?.confidence) || Number(suggestion.confidence) || 0;
      const taskDefinition = mapPublicationActionToTaskDefinition({
        action,
        taskDefinitions: catalogDefinitions(state.configuration?.taskDefinitions)
      });
      json(res, 200, {
        ok: true,
        intimationId: String(record.id || intimationId),
        action,
        actionLabel: PUBLICATION_ACTION_LABELS[action] || '',
        confidence,
        reason: suggestion.reason,
        reasonLabel: AI_CLASSIFIER_REASON_LABELS[String(suggestion.reason || '')] || 'leitura concluída pela Atrium IA',
        taskDefinition,
        // O vocabulário e o catálogo vão junto: o painel monta os seletores a partir da autoridade
        // do servidor (nenhuma lista de naturezas duplicada no cliente).
        actions: PUBLICATION_ACTION_IDS.map(id => ({ id, label: PUBLICATION_ACTION_LABELS[id] || id })),
        catalog: catalogDefinitions(state.configuration?.taskDefinitions).map(item => ({ name: item.name, points: item.points, area: item.area })),
        revision: envelope?.revision || null
      });
      return true;
    }

    // Playbook do ato: leitura determinística (sem modelo) do catálogo do escritório para a
    // publicação aberta. Cada item é um rascunho de tarefa com prazo em branco.
    if (isPublicationPlaybook) {
      const session = assertAuthenticated(req, false);
      const envelope = await readAppStateEnvelope().catch(() => null);
      const state = projectStateForSession(envelope?.state || {}, session);
      const intimationId = String(url.searchParams?.get('publicationId') || '').trim();
      if (!intimationId) fail(400, 'Informe a publicação para montar o playbook.');
      const record = resolveIntimationAlias(Array.isArray(state.intimations) ? state.intimations : [], intimationId);
      if (!record || typeof record !== 'object') fail(404, 'Publicação não encontrada.');
      const playbook = buildPublicationPlaybook({
        publication: record,
        taskDefinitions: state.configuration?.taskDefinitions
      });
      json(res, 200, {
        ok: true,
        intimationId: String(record.id || intimationId),
        act: playbook.act,
        actKind: playbook.actKind,
        actLabel: playbook.actLabel,
        reason: playbook.reason,
        note: playbook.note,
        references: playbook.references,
        items: playbook.items,
        message: playbook.items.length
          ? 'Providências cabíveis para este ato, com o modelo do catálogo quando houver. Nenhuma tarefa é criada aqui e o prazo nasce em branco.'
          : 'Não identifiquei providência para esta publicação. Escolha o modelo do catálogo na lista.'
      });
      return true;
    }

    // Insights determinísticos de carteira (sem modelo e sem escrita): consistência, resumo e
    // sugestão de responsável. Só a consistência tem rota de correção (com evidência e desfazer).
    if (isTaskInsights) {
      const session = assertAuthenticated(req, false);
      const envelope = await readAppStateEnvelope().catch(() => null);
      const state = projectStateForSession(envelope?.state || {}, session);
      const tasks = Array.isArray(state.tasks) ? state.tasks : [];
      const users = Array.isArray(state.users) ? state.users : [];
      const consistencia = planTaskConsistency({ tasks, users });
      json(res, 200, {
        ok: true,
        generatedAt: new Date().toISOString(),
        consistency: consistencia,
        portfolio: buildPortfolioBrief({ tasks }),
        assignment: suggestTaskAssignments({ tasks, users })
      });
      return true;
    }

    if (isProcessSuggestions) {
      const session = assertAuthenticated(req, false);
      const envelope = await readAppStateEnvelope().catch(() => null);
      const state = projectStateForSession(envelope?.state || {}, session);
      if (!readAiClassifierSetting(state).enabled || !processTriageStore) {
        json(res, 200, { ok: true, enabled: false, generatedAt: '', suggestions: {} });
        return true;
      }
      const stored = normalizeProcessTriageStore(await processTriageStore.read().catch(() => null));
      const records = Array.isArray(state.processes) ? state.processes : [];
      const canonicalIds = (Array.isArray(envelope?.state?.processes) ? envelope.state.processes : []).map(record => String(record?.id || '')).filter(Boolean);
      const pruned = pruneProcessTriageStore(stored, canonicalIds);
      if (Number(pruned.removed) > 0) await processTriageStore.write(pruned).catch(() => {});
      const suggestions = {};
      for (const record of records) {
        const id = String(record?.id || '');
        if (!id) continue;
        const missingFields = processMissingFields(record);
        const entry = pruned.entries[id];
        if (!entry && missingFields.length === 0) continue;
        suggestions[id] = {
          ...(entry ? publicProcessTriageEntry(entry) : { movementType: '', movementConfidence: 0, needsAttention: '', action: '', reason: '', at: '' }),
          missingFields
        };
      }
      json(res, 200, { ok: true, enabled: true, generatedAt: pruned.generatedAt, suggestions });
      return true;
    }

    if (isProcessTriage) {
      assertAuthenticated(req, true);
      enforceSuggestRateLimit(req);
      const body = await readJson(req, 20_000).catch(() => ({}));
      const ids = Array.isArray(body?.ids)
        ? body.ids.map(String).filter(Boolean).slice(0, AI_CLASSIFIER_PROCESS_TRIAGE_LIMIT)
        : null;
      const limit = Number(body?.limit) || AI_CLASSIFIER_PROCESS_TRIAGE_LIMIT;
      const result = await runProcessTriage({ ids, limit, session: assertAuthenticated(req, true) });
      json(res, 200, result);
      return true;
    }

    if (isFinancialSuggestions) {
      const session = assertAuthenticated(req, false);
      const envelope = await readAppStateEnvelope().catch(() => null);
      const state = projectStateForSession(envelope?.state || {}, session);
      if (!readAiClassifierSetting(state).enabled || !financialTriageStore) {
        json(res, 200, { ok: true, enabled: false, generatedAt: '', suggestions: {} });
        return true;
      }
      const records = collectFinancialRecords(state);
      const stored = normalizeFinancialTriageStore(await financialTriageStore.read().catch(() => null));
      const canonicalRecords = collectFinancialRecords(envelope?.state || {});
      const pruned = pruneFinancialTriageStore(stored, canonicalRecords.map(record => record.id));
      if (Number(pruned.removed) > 0) await financialTriageStore.write(pruned).catch(() => {});
      const visibleIds = new Set(records.map(record => String(record.id)));
      const suggestions = {};
      for (const [id, entry] of Object.entries(pruned.entries)) if (visibleIds.has(id)) suggestions[id] = publicFinancialTriageEntry(entry);
      json(res, 200, { ok: true, enabled: true, generatedAt: pruned.generatedAt, suggestions });
      return true;
    }

    if (isFinancialTriage) {
      assertAuthenticated(req, true);
      enforceSuggestRateLimit(req);
      const body = await readJson(req, 20_000).catch(() => ({}));
      const ids = Array.isArray(body?.ids)
        ? body.ids.map(String).filter(Boolean).slice(0, AI_CLASSIFIER_FINANCIAL_TRIAGE_LIMIT)
        : null;
      const limit = Number(body?.limit) || AI_CLASSIFIER_FINANCIAL_TRIAGE_LIMIT;
      const result = await runFinancialTriage({ ids, limit, session: assertAuthenticated(req, true) });
      json(res, 200, result);
      return true;
    }

    if (isOrganize) {
      const session = assertAdmin(req, true, 'Apenas administradores podem mudar a organização automática.');
      const body = await readJson(req, 20_000);
      if (typeof body.enabled === 'boolean') {
        await enqueueAppStateMutation(async () => {
          const envelope = await readAppStateEnvelope();
          const state = envelope.state || {};
          if (!state.settings || typeof state.settings !== 'object') state.settings = {};
          state.settings.aiAutoOrganize = { enabled: body.enabled, updatedAt: new Date().toISOString(), updatedBy: sessionActor(session) };
          appendAudit(state, 'Atrium IA atualizado', body.enabled ? 'Organização automática ligada.' : 'Organização automática desligada.', session);
          await saveAppStateDirectUnlocked(state, envelope.revision || null);
        });
      }
      const members = typeof security?.listUsers === 'function' ? security.listUsers(session.workspaceId) : [];
      const outcome = body.enabled === false ? { ok: true, total: 0 } : await runAutoOrganize({ force: true, members });
      const envelope = await readAppStateEnvelope();
      json(res, 200, { ...outcome, autoOrganize: readAutoOrganizeSetting(envelope.state), revision: envelope.revision });
      return true;
    }

    if (isSettings) {
      const session = assertAdmin(req, true, 'Apenas administradores podem ligar ou desligar o Atrium IA.');
      const body = await readJson(req, 20_000);
      const next = sanitizeAiClassifierSetting({ enabled: body.enabled });
      const result = await enqueueAppStateMutation(async () => {
        const envelope = await readAppStateEnvelope();
        assertRevision(envelope, body.revision);
        const state = envelope.state || {};
        if (!state.settings || typeof state.settings !== 'object') state.settings = {};
        state.settings.aiClassifier = {
          enabled: next.enabled,
          updatedAt: new Date().toISOString(),
          updatedBy: sessionActor(session)
        };
        appendAudit(state, 'Atrium IA atualizado', next.enabled ? 'Atrium IA ativado.' : 'Atrium IA desativado.', session);
        const saved = await saveAppStateDirectUnlocked(state, envelope.revision || null);
        return { state, saved };
      });
      const setting = readAiClassifierSetting(result.state);
      json(res, 200, { ok: true, enabled: setting.enabled, revision: result.saved.revision });
      return true;
    }

    const session = assertAuthenticated(req, true);
    void session;
    enforceSuggestRateLimit(req);
    const body = await readJson(req, 20_000);
    const intimationId = String(body.intimationId || '').trim();
    if (!intimationId) fail(400, 'Informe a publicação para classificar.');
    const envelope = await readAppStateEnvelope().catch(() => null);
    const state = projectStateForSession(envelope?.state || {}, session);
    if (!readAiClassifierSetting(state).enabled) {
      fail(409, 'Atrium IA desligado. Ative nas configurações do escritório.');
    }
    const intimations = Array.isArray(state.intimations) ? state.intimations : [];
    const record = resolveIntimationAlias(intimations, intimationId);
    if (!record || typeof record !== 'object') fail(404, 'Publicação não encontrada.');
    const sourceText = [record.title, record.text, record.fullText]
      .map(part => String(part || '').trim())
      .filter(Boolean)
      .join('\n\n')
      .slice(0, AI_CLASSIFIER_MAX_INPUT_CHARS);
    if (!sourceText) fail(422, 'Publicação sem texto para classificar.');
    const { redacted } = redactForJev(sourceText);
    assertJevInputSize(redacted);
    const { suggestion, usage } = await classifyRedacted(redacted);
    const calibration = calibrationStore ? normalizeCalibrationStore(await calibrationStore.read().catch(() => null)) : null;
    const override = calibration ? suggestionOverrideFor(calibration, AI_CLASSIFIER_SCHEMA_ID, String(record.id || intimationId)) : null;
    const publicSuggestion = publicSuggestionOf(suggestion);
    json(res, 200, {
      ok: true,
      intimationId: record.id || intimationId,
      suggestion: override ? applyOverridesToPublicSuggestion(publicSuggestion, override) : publicSuggestion,
      usage: usage && typeof usage === 'object'
        ? { inputTokens: Number(usage.input_tokens) || 0, outputTokens: Number(usage.output_tokens) || 0 }
        : null,
      revision: envelope?.revision || null
    });
    return true;
  };

  handleAiClassifierRequest.runTriageBacklog = options => runTriageBacklog(options);
  handleAiClassifierRequest.runAutoOrganize = options => runAutoOrganize(options);
  handleAiClassifierRequest.runTaskTriage = options => runTaskTriage(options);
  handleAiClassifierRequest.runDuplicateReview = options => runDuplicateReview(options);
  handleAiClassifierRequest.runTaskDuplicateReview = options => runTaskDuplicateReview(options);
  handleAiClassifierRequest.runTaskRiskTriage = options => runTaskRiskTriage(options);
  handleAiClassifierRequest.runProcessTriage = options => runProcessTriage(options);
  handleAiClassifierRequest.runFinancialTriage = options => runFinancialTriage(options);
  return handleAiClassifierRequest;
}
