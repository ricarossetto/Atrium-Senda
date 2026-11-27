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
import { buildClassifierSkillsBlock } from '../skills/knowledge-base.mjs';
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
import { publicClientAddress } from './client-address.mjs';

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

/** Lê só chave própria: chaves como `__proto__` em derivados não viram prototype. */
function ownValue(map, key) {
  return map && typeof map === 'object' && Object.prototype.hasOwnProperty.call(map, key)
    ? map[key]
    : null;
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
  hasAiPlan = null,
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
    const key = publicClientAddress(req) || 'local';
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

  /** Trecho redigido do registro, usado como exemplo de calibração (nunca vem do cliente). */
  const redactedExcerptOf = record => {
    const parts = (record?.text || record?.fullText)
      ? [record?.title, record?.text, record?.fullText]
      : record?.lastMovement || record?.actionClass || record?.judicialPhase
        ? [record?.lastMovement, record?.actionClass || record?.actionType, record?.judicialPhase || record?.stage]
        : record?.description && !record?.title
          ? [record?.description, record?.kind || record?.type, record?.process || record?.processNumber]
          : [record?.title, record?.description, record?.process];
    const sourceText = parts
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

  const storeWriteQueues = new Map();
  const withStoreLock = (storeKey, operation) => {
    const key = String(storeKey || 'default');
    const previous = storeWriteQueues.get(key) || Promise.resolve();
    const run = previous.catch(() => {}).then(operation);
    const cleanup = () => {
      if (storeWriteQueues.get(key) === tail) storeWriteQueues.delete(key);
    };
    const tail = run.then(cleanup, cleanup);
    storeWriteQueues.set(key, tail);
    return run;
  };

  const rawEntriesOf = raw => (raw && typeof raw === 'object' && raw.entries && typeof raw.entries === 'object' && !Array.isArray(raw.entries))
    ? raw.entries
    : {};

  const preserveDismissedFlags = (store, rawEntries) => {
    if (!store?.entries || !rawEntries) return store;
    for (const [key, rawEntry] of Object.entries(rawEntries)) {
      if (rawEntry?.dismissed === true && store.entries[key]) {
        store.entries[key].dismissed = true;
      }
    }
    return store;
  };

  const mergeBatchIntoStore = async ({
    storeKey,
    storeAdapter,
    normalize,
    upsert,
    updates,
    priorRawEntries = {},
    preserveConcurrentDismiss = false
  }) => withStoreLock(storeKey, async () => {
    const currentRaw = await storeAdapter.read().catch(() => null);
    const currentRawEntries = rawEntriesOf(currentRaw);
    let merged = normalize(currentRaw);
    for (const { key, data } of updates) {
      const rawEntry = currentRawEntries[key];
      if (rawEntry?.dismissed === true) continue;
      if (preserveConcurrentDismiss) {
        const priorRaw = priorRawEntries[key];
        const isDismissedOrAbsorbed = Boolean(rawEntry && (rawEntry.dismissed === true || rawEntry.action === 'dismissed' || rawEntry.action === 'absorbed'));
        const sameContent = !rawEntry?.payloadHash || !data?.payloadHash || rawEntry.payloadHash === data.payloadHash;
        const changedConcurrently = Boolean(rawEntry && (!priorRaw || rawEntry.dismissed !== priorRaw.dismissed || rawEntry.action !== priorRaw.action || rawEntry.at !== priorRaw.at));
        if (isDismissedOrAbsorbed && (sameContent || changedConcurrently)) continue;
      } else if (rawEntry?.action === 'dismissed') {
        continue;
      }
      merged = upsert(merged, key, data);
    }
    preserveDismissedFlags(merged, currentRawEntries);
    await storeAdapter.write(merged);
    return merged;
  });

  const pruneStoreLocked = async ({ storeKey, storeAdapter, normalize, prune, validKeys }) => withStoreLock(storeKey, async () => {
    const currentRaw = await storeAdapter.read().catch(() => null);
    const currentRawEntries = rawEntriesOf(currentRaw);
    const pruned = prune(normalize(currentRaw), validKeys);
    preserveDismissedFlags(pruned, currentRawEntries);
    if (Number(pruned.removed) > 0) {
      await storeAdapter.write(pruned).catch(() => false);
    }
    return pruned;
  });

  const resolveCorrectionTargetKind = ({ scope, schemaId }) => {
    const rawScope = String(scope || '').trim().toLowerCase();
    if (['tasks', 'task', 'task_triage', 'task_risk'].includes(rawScope)) return 'tasks';
    if (['processes', 'process', 'process_triage'].includes(rawScope)) return 'processes';
    if (['finance', 'financial', 'financial_triage', 'financialentries', 'officeexpenses'].includes(rawScope)) return 'finance';
    if (['intimations', 'intimation', 'publications', 'publication', 'publication_triage', 'publication_action'].includes(rawScope)) return 'intimations';
    if (rawScope) fail(400, 'Escopo inválido para correção.');
    if ([AI_CLASSIFIER_TASK_SCHEMA_ID, AI_CLASSIFIER_TASK_RISK_SCHEMA_ID].includes(schemaId)) return 'tasks';
    if (schemaId === AI_CLASSIFIER_PROCESS_SCHEMA_ID) return 'processes';
    if (schemaId === AI_CLASSIFIER_FINANCIAL_SCHEMA_ID) return 'finance';
    return 'intimations';
  };

  const findCorrectionRecord = (state, targetKind, targetId) => {
    if (!targetId) return null;
    if (targetKind === 'tasks') {
      const tasks = Array.isArray(state.tasks) ? state.tasks : [];
      return tasks.find(item => item && (String(item.id || '') === targetId || String(item.externalId || '') === targetId)) || null;
    }
    if (targetKind === 'processes') {
      const processes = Array.isArray(state.processes) ? state.processes : [];
      return processes.find(item => item && (String(item.id || '') === targetId || String(item.externalId || '') === targetId || String(item.number || '') === targetId)) || null;
    }
    if (targetKind === 'finance') {
      const direct = collectFinancialRecords(state).find(item => item && (String(item.id || '') === targetId || String(item.editKey || '') === targetId));
      if (direct) return direct;
      const extra = [
        ...(Array.isArray(state.financialEntries) ? state.financialEntries : []),
        ...(Array.isArray(state.officeRecurringExpenses) ? state.officeRecurringExpenses : []),
        ...(Array.isArray(state.officeImportRules) ? state.officeImportRules : []),
        ...(Array.isArray(state.officeExpenses) ? state.officeExpenses : [])
      ];
      return extra.find(item => item && (String(item.id || '') === targetId || String(item.editKey || '') === targetId)) || null;
    }
    return resolveIntimationAlias(Array.isArray(state.intimations) ? state.intimations : [], targetId);
  };

  const readCorrectionModelLabel = async ({ schemaId, questionKey, targetKey }) => {
    if (schemaId === AI_CLASSIFIER_SCHEMA_ID && triageStore) {
      const entry = normalizePublicationTriageStore(await triageStore.read().catch(() => null)).entries[targetKey] || null;
      return !entry ? '' : questionKey === 'area' ? String(entry.area || '') : questionKey === 'priority' ? String(entry.priority || '') : '';
    }
    if (schemaId === AI_CLASSIFIER_TASK_SCHEMA_ID && taskTriageStore) {
      const entry = normalizeTaskTriageStore(await taskTriageStore.read().catch(() => null)).entries[targetKey] || null;
      return !entry ? '' : questionKey === 'category' ? String(entry.category || '') : questionKey === 'urgency' ? String(entry.urgency || '') : '';
    }
    if (schemaId === AI_CLASSIFIER_TASK_RISK_SCHEMA_ID && taskRiskStore) {
      const entry = normalizeTaskRiskStore(await taskRiskStore.read().catch(() => null)).entries[targetKey] || null;
      return !entry ? '' : questionKey === 'risk' ? String(entry.risk || '') : '';
    }
    if (schemaId === AI_CLASSIFIER_PROCESS_SCHEMA_ID && processTriageStore) {
      const entry = normalizeProcessTriageStore(await processTriageStore.read().catch(() => null)).entries[targetKey] || null;
      return !entry ? '' : questionKey === 'movement_type' ? String(entry.movementType || '') : questionKey === 'needs_attention' ? String(entry.needsAttention || '') : '';
    }
    if (schemaId === AI_CLASSIFIER_FINANCIAL_SCHEMA_ID && financialTriageStore) {
      const entry = normalizeFinancialTriageStore(await financialTriageStore.read().catch(() => null)).entries[targetKey] || null;
      return !entry ? '' : questionKey === 'bucket' ? String(entry.bucket || '') : '';
    }
    return '';
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

  // O trecho de calibração alimenta o prompt de TODO o escritório. Um registro privado,
  // suprimido ou ligado a processo/intimação privados não pode entrar nesse trecho, ainda
  // que a sessão corrente seja a dona e por isso o veja no painel. Os auxiliares abaixo
  // reusam os predicados oficiais de escopo, com SYSTEM_USER (que não possui nada), e a
  // regra de intimação oculta já aplicada na arrumação automática. Nenhum deles faz rede.
  const publicOnlyStateOf = state => filterPrivateScopeState(
    state && typeof state === 'object' ? state : {}, SYSTEM_USER, { teams: [] }
  );
  const idSetOf = (state, collection) => {
    const ids = new Set();
    for (const record of Array.isArray(state?.[collection]) ? state[collection] : []) {
      for (const key of [record?.id, record?.externalId]) {
        const value = String(key || '').trim();
        if (value) ids.add(value);
      }
    }
    return ids;
  };
  const hiddenIntimationIdsOf = (rawState, publicState) => {
    const raw = idSetOf(rawState, 'intimations');
    const visible = idSetOf(publicState, 'intimations');
    return new Set([...raw].filter(id => !visible.has(id)));
  };
  const linksHiddenIntimation = (record, hiddenIds) => hiddenIds.size > 0
    && ['intimationId', 'sourceIntimationId', 'publicationId'].some(field => {
      const ref = String(record?.[field] || '').trim();
      return Boolean(ref && hiddenIds.has(ref));
    });
  const pairHasPrivateMember = (ids, publicIds, hiddenIntimations = new Set(), recordsById = new Map()) =>
    !Array.isArray(ids) || ids.length === 0 || ids.some(id => {
      const key = String(id || '').trim();
      return !key || !publicIds.has(key) || linksHiddenIntimation(recordsById.get(key), hiddenIntimations);
    });
  const isPrivateCorrectionSource = ({ envelope, targetKind, requestedTargetId, record }) => {
    const publicState = publicOnlyStateOf(envelope?.state);
    if (!findCorrectionRecord(publicState, targetKind, requestedTargetId)) return true;
    return targetKind === 'tasks'
      && linksHiddenIntimation(record, hiddenIntimationIdsOf(envelope?.state, publicState));
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
    const updates = [];
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
        updates.push({
          key: target.id,
          data: {
            area: area.label || '',
            areaConfidence: Number(area.confidence) || 0,
            priority: priority.label || '',
            priorityConfidence: Number(priority.confidence) || 0,
            deadlineSignal: suggestion.suggestion?.deadline_signal?.label || '',
            deadlineDays: suggestion.suggestion?.deadline_days?.label || '',
            action: suggestion.action,
            reason: suggestion.reason,
            payloadHash: target.hash
          }
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
    if (updates.length > 0) {
      store = await mergeBatchIntoStore({
        storeKey: 'triage',
        storeAdapter: triageStore,
        normalize: normalizePublicationTriageStore,
        upsert: upsertPublicationTriageEntry,
        updates,
        priorRawEntries: rawEntriesOf(stored)
      });
    } else if (targets.length > 0) {
      store = normalizePublicationTriageStore(await triageStore.read().catch(() => null));
    }
    const pending = publicationTriagePending({ intimations, store, hashOf }).length;
    return { ok: true, classified: results.length - failed, failed, pending, results };
  };

  // Arrumação autorizada pelo titular: ver lib/ai/auto-organize.mjs para o que nunca é feito.
  const runAutoOrganize = async ({ force = false, members = [] } = {}) => {
    const triage = normalizePublicationTriageStore(await triageStore.read().catch(() => null));
    const calibration = calibrationStore ? normalizeCalibrationStore(await calibrationStore.read().catch(() => null)) : null;
    const calibratedTriageEntries = { ...triage.entries };
    if (calibration) {
      const overrides = calibration.overrides?.[AI_CLASSIFIER_SCHEMA_ID] || {};
      for (const [id, override] of Object.entries(overrides)) {
        const overrideArea = String(override?.questions?.area || '').trim();
        if (!overrideArea) continue;
        const baseEntry = calibratedTriageEntries[id] || {};
        calibratedTriageEntries[id] = {
          ...applyOverridesToTriageEntry(baseEntry, override),
          action: 'suggest'
        };
      }
    }
    return enqueueAppStateMutation(async () => {
      const envelope = await readAppStateEnvelope();
      const state = envelope.state;
      if (!state || !readAiClassifierSetting(state).enabled) return { ok: false, reason: 'DISABLED', total: 0 };
      if (!force && !readAutoOrganizeSetting(state).enabled) return { ok: false, reason: 'AUTO_OFF', total: 0 };
      const isPrivateOrSuppressed = record => !record || typeof record !== 'object'
        || String(record.scope || '').toLowerCase() === 'private'
        || Boolean(record.privateOwnerUserId)
        || Boolean(record.captureSuppressed);
      const basePublic = filterPrivateScopeState(state, SYSTEM_USER, { teams: [] });
      const rawIntimationKeys = new Set(
        (Array.isArray(state.intimations) ? state.intimations : [])
          .flatMap(item => [item?.id, item?.externalId].map(value => String(value || '').trim()).filter(Boolean))
      );
      const visibleIntimationKeys = new Set(
        (Array.isArray(basePublic.intimations) ? basePublic.intimations : [])
          .filter(record => !isPrivateOrSuppressed(record))
          .flatMap(item => [item?.id, item?.externalId].map(value => String(value || '').trim()).filter(Boolean))
      );
      const hiddenIntimationKeys = new Set([...rawIntimationKeys].filter(key => !visibleIntimationKeys.has(key)));
      const safeState = {
        ...basePublic,
        tasks: (Array.isArray(basePublic.tasks) ? basePublic.tasks : []).filter(record => {
          if (isPrivateOrSuppressed(record)) return false;
          if (!hiddenIntimationKeys.size) return true;
          return !['intimationId', 'sourceIntimationId', 'publicationId'].some(field => {
            const ref = String(record[field] || '').trim();
            return Boolean(ref && hiddenIntimationKeys.has(ref));
          });
        }),
        processes: (Array.isArray(basePublic.processes) ? basePublic.processes : []).filter(record => !isPrivateOrSuppressed(record)),
        intimations: (Array.isArray(basePublic.intimations) ? basePublic.intimations : []).filter(record => !isPrivateOrSuppressed(record))
      };
      const allowedTaskIds = new Set(safeState.tasks.map(task => String(task?.id || '')));
      const allowedProcessIds = new Set(safeState.processes.map(proc => String(proc?.id || '')));
      const rawPlan = planAutoOrganize({ state: safeState, members, triageEntries: calibratedTriageEntries });
      const plan = {
        taskChanges: (rawPlan.taskChanges || []).filter(change => allowedTaskIds.has(String(change?.id || ''))),
        processChanges: (rawPlan.processChanges || []).filter(change => allowedProcessIds.has(String(change?.id || '')))
      };
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
    const updates = [];
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
        updates.push({
          key: target.id,
          data: {
            category: category.label || '',
            categoryConfidence: Number(category.confidence) || 0,
            urgency: urgency.label || '',
            urgencyConfidence: Number(urgency.confidence) || 0,
            action: suggestion.action,
            reason: suggestion.reason,
            payloadHash: target.hash
          }
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
    if (updates.length > 0) {
      store = await mergeBatchIntoStore({
        storeKey: 'taskTriage',
        storeAdapter: taskTriageStore,
        normalize: normalizeTaskTriageStore,
        upsert: upsertTaskTriageEntry,
        updates,
        priorRawEntries: rawEntriesOf(stored)
      });
    } else if (targets.length > 0) {
      store = normalizeTaskTriageStore(await taskTriageStore.read().catch(() => null));
    }
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
    const updates = [];
    const results = [];
    let failed = 0;
    for (const target of targets) {
      try {
        const { redacted } = redactForJev(target.text);
        // O teto do modelo é aplicado por corte dentro de `classifyRedacted`: validar aqui
        // recusava a publicação longa e travava a fila (TOO_LARGE a cada tentativa).
        const { suggestion } = await classifyRedacted(redacted, AI_CLASSIFIER_DUPLICATE_SCHEMA_ID);
        const verdict = suggestion.suggestion?.verdict || {};
        updates.push({
          key: target.key,
          data: {
            verdict: verdict.label || '',
            confidence: Number(verdict.confidence) || 0,
            action: suggestion.action,
            reason: suggestion.reason,
            pairType: target.pairType,
            payloadHash: target.hash
          }
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
    if (updates.length > 0) {
      store = await mergeBatchIntoStore({
        storeKey: 'duplicate',
        storeAdapter: duplicateStore,
        normalize: normalizeDuplicateReviewStore,
        upsert: upsertDuplicateReviewEntry,
        updates,
        priorRawEntries: rawEntriesOf(stored),
        preserveConcurrentDismiss: true
      });
    } else if (targets.length > 0) {
      store = normalizeDuplicateReviewStore(await duplicateStore.read().catch(() => null));
    }
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
      const latestTaskDupRaw = rawEntriesOf(await taskDuplicateStore.read().catch(() => null));
      for (const absorcao of absorptions) {
        const latestEntry = latestTaskDupRaw[absorcao.key];
        if (latestEntry && (latestEntry.dismissed === true || latestEntry.action === 'dismissed' || latestEntry.action === 'absorbed')) {
          recusadas.push({ key: absorcao.key, motivo: 'dispensado-concorrente', confidence: absorcao.confidence });
          continue;
        }
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
    if (aplicado.absorvidas.length > 0) {
      const updates = aplicado.absorvidas.map(absorcao => {
        const par = pairs.find(item => item.key === absorcao.key);
        return {
          key: absorcao.key,
          data: {
            verdict: 'mesma',
            confidence: absorcao.confidence,
            action: 'absorbed',
            reason: String(absorcao.detail || '').slice(0, 300),
            pairType: 'task-auto-absorb',
            payloadHash: par && typeof hashOf === 'function' ? hashOf(par.text, par) : ''
          }
        };
      });
      next = await mergeBatchIntoStore({
        storeKey: 'taskDuplicate',
        storeAdapter: taskDuplicateStore,
        normalize: normalizeDuplicateReviewStore,
        upsert: upsertDuplicateReviewEntry,
        updates,
        priorRawEntries: rawEntriesOf(store),
        preserveConcurrentDismiss: true
      }).catch(() => next);
    }
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
    const updates = [];
    const results = [];
    let failed = 0;
    for (const target of targets) {
      try {
        const { redacted } = redactForJev(target.text);
        const { suggestion } = await classifyRedacted(redacted, AI_CLASSIFIER_TASK_DUPLICATE_SCHEMA_ID);
        const verdict = suggestion.suggestion?.verdict || {};
        updates.push({
          key: target.key,
          data: {
            verdict: verdict.label || '',
            confidence: Number(verdict.confidence) || 0,
            action: suggestion.action,
            reason: suggestion.reason,
            pairType: 'task-same-process',
            payloadHash: target.hash
          }
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
    if (updates.length > 0) {
      store = await mergeBatchIntoStore({
        storeKey: 'taskDuplicate',
        storeAdapter: taskDuplicateStore,
        normalize: normalizeDuplicateReviewStore,
        upsert: upsertDuplicateReviewEntry,
        updates,
        priorRawEntries: rawEntriesOf(stored),
        preserveConcurrentDismiss: true
      });
    } else {
      store = normalizeDuplicateReviewStore(await taskDuplicateStore.read().catch(() => null));
    }
    // Vereditos vigentes (texto comparado inalterado), inclusive de execuções anteriores: o teto
    // por execução limita cada rodada, mas não pode deixar o par elegível preso para sempre.
    const verdicts = [];
    for (const pair of pairs) {
      const entry = store.entries[pair.key];
      if (!entry?.verdict || entry.action === 'absorbed' || entry.action === 'dismissed' || entry.dismissed === true) continue;
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
    const updates = [];
    const results = [];
    let failed = 0;
    for (const target of targets) {
      try {
        const { redacted } = redactForJev(target.text);
        const { suggestion } = await classifyRedacted(redacted, AI_CLASSIFIER_TASK_RISK_SCHEMA_ID);
        const risk = suggestion.suggestion?.risk || {};
        updates.push({
          key: target.id,
          data: {
            risk: risk.label || '',
            riskConfidence: Number(risk.confidence) || 0,
            action: suggestion.action,
            reason: suggestion.reason,
            payloadHash: target.hash
          }
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
    if (targets.length > 0 && results.length > failed && updates.length > 0) {
      store = await mergeBatchIntoStore({
        storeKey: 'taskRisk',
        storeAdapter: taskRiskStore,
        normalize: normalizeTaskRiskStore,
        upsert: upsertTaskRiskEntry,
        updates,
        priorRawEntries: rawEntriesOf(stored)
      });
    } else if (targets.length > 0) {
      store = normalizeTaskRiskStore(await taskRiskStore.read().catch(() => null));
    }
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
    const updates = [];
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
        updates.push({
          key: target.id,
          data: {
            movementType: movement.label || '',
            movementConfidence: Number(movement.confidence) || 0,
            needsAttention: attention.label || '',
            action: suggestion.action,
            reason: suggestion.reason,
            missingFields: target.missingFields,
            payloadHash: target.hash
          }
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
    if (updates.length > 0) {
      store = await mergeBatchIntoStore({
        storeKey: 'processTriage',
        storeAdapter: processTriageStore,
        normalize: normalizeProcessTriageStore,
        upsert: upsertProcessTriageEntry,
        updates,
        priorRawEntries: rawEntriesOf(stored)
      });
    } else if (targets.length > 0) {
      store = normalizeProcessTriageStore(await processTriageStore.read().catch(() => null));
    }
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
    const updates = [];
    const results = [];
    let failed = 0;
    for (const target of targets) {
      try {
        const { redacted } = redactForJev(target.text);
        const { suggestion } = await classifyRedacted(redacted, AI_CLASSIFIER_FINANCIAL_SCHEMA_ID);
        const bucket = suggestion.suggestion?.bucket || {};
        updates.push({
          key: target.id,
          data: {
            bucket: bucket.label || '',
            bucketConfidence: Number(bucket.confidence) || 0,
            action: suggestion.action,
            reason: suggestion.reason,
            payloadHash: target.hash
          }
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
    if (updates.length > 0) {
      store = await mergeBatchIntoStore({
        storeKey: 'financialTriage',
        storeAdapter: financialTriageStore,
        normalize: normalizeFinancialTriageStore,
        upsert: upsertFinancialTriageEntry,
        updates,
        priorRawEntries: rawEntriesOf(stored)
      });
    } else if (targets.length > 0) {
      store = normalizeFinancialTriageStore(await financialTriageStore.read().catch(() => null));
    }
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
    const isTaskDuplicateDismiss = req.method === 'POST' && url.pathname === '/api/ai-classifier/task-duplicate-dismiss';
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
    if (!isStatus && !isSettings && !isOrganize && !isSuggest && !isSuggestions && !isTriageBacklog && !isTaskSuggestions && !isTaskTriage && !isDuplicateCandidates && !isDuplicateCheck && !isDuplicateDismiss && !isTaskDuplicateCandidates && !isTaskDuplicateTriage && !isTaskDuplicateDismiss && !isTaskRisks && !isTaskRiskTriage && !isPublicationAction && !isPublicationPlaybook && !isTaskInsights && !isProcessSuggestions && !isProcessTriage && !isCorrect && !isFinancialSuggestions && !isFinancialTriage) return false;

    if (isStatus) {
      const session = assertAuthenticated(req, false);
      void session;
      const planIncluded = typeof hasAiPlan === 'function' ? hasAiPlan() !== false : true;
      const envelope = await readAppStateEnvelope().catch(() => null);
      const setting = readAiClassifierSetting(envelope?.state);
      const availabilityState = await availability();
      const calibration = calibrationStore ? normalizeCalibrationStore(await calibrationStore.read().catch(() => null)) : null;
      json(res, 200, {
        ok: true,
        enabled: setting.enabled,
        planIncluded,
        available: planIncluded && availabilityState.ok === true,
        reason: planIncluded
          ? (availabilityState.ok === true ? 'operacional' : String(availabilityState.reason || 'indisponível'))
          : 'O Atrium IA faz parte do plano Pro IA.',
        // Áreas nomeadas pelo escritório: alimentam os botões de correção do painel.
        customAreas: calibration ? calibration.customAreas : []
      });
      return true;
    }

    if (isCorrect) {
      const session = assertAuthenticated(req, true);
      if (!calibrationStore) fail(503, 'Aprendizado do classificador indisponível neste servidor.');
      const body = await readJson(req, 20_000);
      const questionKey = String(body.questionKey || '').trim();
      const rawSchemaId = String(body.schemaId || '').trim();
      const rawScope = String(body.scope || '').trim().toLowerCase();
      const targetKind = resolveCorrectionTargetKind({ scope: body.scope, schemaId: rawSchemaId || AI_CLASSIFIER_SCHEMA_ID });
      const schemaId = rawSchemaId || (
        targetKind === 'tasks'
          ? (questionKey === 'risk' || questionKey === 'blocked' ? AI_CLASSIFIER_TASK_RISK_SCHEMA_ID : AI_CLASSIFIER_TASK_SCHEMA_ID)
          : targetKind === 'processes'
            ? AI_CLASSIFIER_PROCESS_SCHEMA_ID
            : targetKind === 'finance'
              ? AI_CLASSIFIER_FINANCIAL_SCHEMA_ID
              : (rawScope === 'publication_action' || questionKey === 'action' ? AI_CLASSIFIER_PUBLICATION_ACTION_SCHEMA_ID : AI_CLASSIFIER_SCHEMA_ID)
      );
      const schema = getJevSchema(schemaId);
      const question = schema.questions.find(item => item.key === questionKey);
      if (!question) fail(400, 'Pergunta desconhecida para este esquema.');
      const label = String(body.label || '').trim();
      const envelope = await readAppStateEnvelope().catch(() => null);
      const state = projectStateForSession(envelope?.state || {}, session);
      const requestedTargetId = String(body.intimationId || body.publicationId || body.taskId || body.processId || body.entryId || body.recordId || body.targetKey || body.targetId || body.id || '').trim();
      const record = findCorrectionRecord(state, targetKind, requestedTargetId);
      if (!record) {
        const missingMsg = targetKind === 'tasks'
          ? 'Tarefa não encontrada para corrigir.'
          : targetKind === 'processes'
            ? 'Processo não encontrado para corrigir.'
            : targetKind === 'finance'
              ? 'Lançamento financeiro não encontrado para corrigir.'
              : 'Publicação não encontrada para corrigir.';
        fail(404, missingMsg);
      }
      // B6: registro privado (direto ou derivado) não entrega trecho ao store compartilhado.
      const privateSource = isPrivateCorrectionSource({ envelope, targetKind, requestedTargetId, record });
      const targetKey = String(record.id || requestedTargetId).trim();
      const modelLabel = await readCorrectionModelLabel({ schemaId, questionKey, targetKey });
      let customArea = '';
      const correction = await withStoreLock('calibration', async () => {
        let stored = normalizeCalibrationStore(await calibrationStore.read().catch(() => null));
        // "Outra área" com nome: a pessoa nomeia a área e ela fica registrada no escritório para
        // reutilizar no painel. Só entra por escolha explícita (`custom: true`) ou quando já existe;
        // o vocabulário fixo do modelo continua intocado (a área nomeada é rótulo humano).
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
        const next = recordHumanCorrection(stored, {
          schemaId,
          questionKey,
          label: customArea || label,
          modelLabel,
          excerpt: privateSource ? '' : redactedExcerptOf(record),
          targetKey,
          actor: sessionActor(session)
        });
        await calibrationStore.write(next.store).catch(() => false);
        return next;
      });
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
      // Poda pelo acervo oficial (não destrói o que não é visível à sessão); a resposta é
      // filtrada pelo acervo projetado (não vaza o privado alheio).
      const officialIds = (Array.isArray(envelope?.state?.intimations) ? envelope.state.intimations : [])
        .map(record => String(record?.id || ''))
        .filter(Boolean);
      const pruned = await pruneStoreLocked({
        storeKey: 'triage',
        storeAdapter: triageStore,
        normalize: normalizePublicationTriageStore,
        prune: prunePublicationTriageStore,
        validKeys: officialIds
      });
      const visibleIds = new Set((Array.isArray(state.intimations) ? state.intimations : []).map(record => String(record?.id || '')));
      const calibration = calibrationStore ? normalizeCalibrationStore(await calibrationStore.read().catch(() => null)) : null;
      const intimationsById = new Map((Array.isArray(state.intimations) ? state.intimations : []).map(record => [String(record?.id || ''), record]));
      const processesByDigits = new Map();
      for (const process of Array.isArray(state.processes) ? state.processes : []) {
        const digits = String(process?.number || '').replace(/\D/g, '');
        if (digits && !processesByDigits.has(digits)) processesByDigits.set(digits, process);
      }
      const suggestions = Object.create(null);
      const overrides = calibration ? ownValue(calibration.overrides, AI_CLASSIFIER_SCHEMA_ID) : null;
      for (const [id, record] of intimationsById) {
        if (!visibleIds.has(id)) continue;
        const entry = ownValue(pruned.entries, id);
        const override = overrides ? ownValue(overrides, id) : null;
        // Correção humana aparece mesmo sem entrada do modelo; a base vazia não inventa veredito.
        if (!entry && !override) continue;
        const digits = String(record?.process || record?.processNumber || '').replace(/\D/g, '');
        // Evidência objetiva corrige palpite fraco já guardado, sem nova chamada ao modelo.
        const base = entry
          ? applyAreaEvidence(publicTriageEntry(entry), deriveAreaEvidence({ record, process: processesByDigits.get(digits) || null }))
          : { area: '', areaConfidence: 0, priority: '', priorityConfidence: 0, deadlineSignal: '', deadlineDays: '', action: 'abstain', reason: '', at: '' };
        suggestions[id] = override ? applyOverridesToTriageEntry(base, override) : base;
      }
      json(res, 200, { ok: true, enabled: true, generatedAt: pruned.generatedAt, suggestions: { ...suggestions } });
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
      const officialIds = (Array.isArray(envelope?.state?.tasks) ? envelope.state.tasks : [])
        .filter(record => record && record.active !== false && !record.absorbedInto)
        .map(record => String(record?.id || ''))
        .filter(Boolean);
      const pruned = await pruneStoreLocked({
        storeKey: 'taskTriage',
        storeAdapter: taskTriageStore,
        normalize: normalizeTaskTriageStore,
        prune: pruneTaskTriageStore,
        validKeys: officialIds
      });
      const visibleIds = new Set((Array.isArray(state.tasks) ? state.tasks : []).map(record => String(record?.id || '')));
      const calibration = calibrationStore ? normalizeCalibrationStore(await calibrationStore.read().catch(() => null)) : null;
      const suggestions = Object.create(null);
      const overrides = calibration ? ownValue(calibration.overrides, AI_CLASSIFIER_TASK_SCHEMA_ID) : null;
      for (const record of Array.isArray(state.tasks) ? state.tasks : []) {
        const id = String(record?.id || '');
        if (!id || !visibleIds.has(id)) continue;
        const entry = ownValue(pruned.entries, id);
        const override = overrides ? ownValue(overrides, id) : null;
        // Correção humana aparece mesmo sem entrada do modelo; a base vazia não inventa veredito.
        if (!entry && !override) continue;
        const base = entry ? publicTaskTriageEntry(entry)
          : { category: '', categoryConfidence: 0, urgency: '', urgencyConfidence: 0, action: 'abstain', reason: '', at: '' };
        if (override?.questions) {
          if (override.questions.category) {
            base.category = override.questions.category;
            base.categoryConfidence = 1;
            base.origin = 'humano';
          }
          if (override.questions.urgency) {
            base.urgency = override.questions.urgency;
            base.urgencyConfidence = 1;
            base.origin = 'humano';
          }
        }
        suggestions[id] = base;
      }
      json(res, 200, { ok: true, enabled: true, generatedAt: pruned.generatedAt, suggestions: { ...suggestions } });
      return true;
    }

    if (isTaskTriage) {
      const session = assertAuthenticated(req, true);
      enforceSuggestRateLimit(req);
      const body = await readJson(req, 20_000).catch(() => ({}));
      const ids = Array.isArray(body?.ids)
        ? body.ids.map(String).filter(Boolean).slice(0, AI_CLASSIFIER_TASK_TRIAGE_LIMIT)
        : null;
      const limit = Number(body?.limit) || AI_CLASSIFIER_TASK_TRIAGE_LIMIT;
      const result = await runTaskTriage({ ids, limit, session });
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
      const officialPairs = buildDuplicatePairs(Array.isArray(envelope?.state?.intimations) ? envelope.state.intimations : []);
      const pruned = await pruneStoreLocked({
        storeKey: 'duplicate',
        storeAdapter: duplicateStore,
        normalize: normalizeDuplicateReviewStore,
        prune: pruneDuplicateReviewStore,
        validKeys: officialPairs.map(pair => pair.key)
      });
      const hashOf = text => payloadHash(text);
      // Par que a pessoa descartou (veredito humano "diferente") sai da conferência enquanto o
      // texto comparado continuar o mesmo; se o teor mudar, ele volta a aparecer para revisão.
      const visible = pairs.filter(pair => {
        const entry = pruned.entries[pair.key];
        if (!entry || (entry.action !== 'dismissed' && entry.dismissed !== true)) return true;
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
      const session = assertAuthenticated(req, true);
      enforceSuggestRateLimit(req);
      const body = await readJson(req, 20_000).catch(() => ({}));
      const keys = Array.isArray(body?.keys)
        ? body.keys.map(String).filter(Boolean).slice(0, AI_CLASSIFIER_DUPLICATE_TRIAGE_LIMIT)
        : null;
      const limit = Number(body?.limit) || AI_CLASSIFIER_DUPLICATE_TRIAGE_LIMIT;
      const result = await runDuplicateReview({ keys, limit, session });
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
      // B6: par com membro privado não pode fornecer trecho ao aprendizado compartilhado.
      const pairPrivate = pairHasPrivateMember(
        [target.aId, target.bId],
        idSetOf(publicOnlyStateOf(envelope?.state), 'intimations')
      );
      const hash = payloadHash(target.text);
      const { next, previous } = await withStoreLock('duplicate', async () => {
        const currentRaw = await duplicateStore.read().catch(() => null);
        const currentRawEntries = rawEntriesOf(currentRaw);
        const stored = normalizeDuplicateReviewStore(currentRaw);
        const prev = stored.entries[target.key] || null;
        const updated = upsertDuplicateReviewEntry(stored, target.key, {
          verdict: 'diferente',
          confidence: 1,
          action: 'dismissed',
          reason: 'Conferência humana: o par não é a mesma publicação e não deve ser fundido.',
          pairType: target.pairType,
          payloadHash: hash
        });
        preserveDismissedFlags(updated, currentRawEntries);
        await duplicateStore.write(updated).catch(() => false);
        return { next: updated, previous: prev };
      });

      // Aprendizado do escritório: a decisão humana vira exemplo de calibração do esquema de
      // duplicatas e nunca é sobrescrita pelo modelo.
      let learned = false;
      if (calibrationStore) {
        learned = await withStoreLock('calibration', async () => {
          const calibration = normalizeCalibrationStore(await calibrationStore.read().catch(() => null));
          const correction = recordHumanCorrection(calibration, {
            schemaId: AI_CLASSIFIER_DUPLICATE_SCHEMA_ID,
            questionKey: 'verdict',
            label: 'diferente',
            modelLabel: String(previous?.verdict || ''),
            excerpt: pairPrivate ? '' : redactForJev(target.text).redacted || '',
            targetKey: target.key,
            actor: sessionActor(session)
          });
          await calibrationStore.write(correction.store).catch(() => false);
          return Boolean(correction.example);
        });
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
      const officialTasks = Array.isArray(envelope?.state?.tasks) ? envelope.state.tasks : [];
      const officialIntimations = Array.isArray(envelope?.state?.intimations) ? envelope.state.intimations : [];
      const officialIndex = intimationIndexByKey(officialIntimations);
      const { pairs, truncated, pruned } = await withStoreLock('taskDuplicate', async () => {
        const currentRaw = await taskDuplicateStore.read().catch(() => null);
        const currentRawEntries = rawEntriesOf(currentRaw);
        const stored = normalizeDuplicateReviewStore(currentRaw);
        const visibleResult = buildTaskDuplicatePairs({ tasks, intimationOf, store: stored });
        const officialResult = buildTaskDuplicatePairs({ tasks: officialTasks, intimationOf: task => resolveTaskIntimation(task, officialIndex), store: stored });
        const officialPairs = officialResult.pairs;
        const nextPruned = officialResult.truncated ? stored : pruneDuplicateReviewStore(stored, [
          ...officialPairs.map(pair => pair.key),
          // O registro do que a autonomia absorveu fica: é a prova que o painel mostra com o desfazer.
          ...Object.keys(stored.entries).filter(key => stored.entries[key]?.action === 'absorbed')
        ]);
        preserveDismissedFlags(nextPruned, currentRawEntries);
        if (Number(nextPruned.removed) > 0) await taskDuplicateStore.write(nextPruned).catch(() => false);
        return { pairs: visibleResult.pairs, truncated: visibleResult.truncated, pruned: nextPruned };
      });
      const hashOf = (text, pair) => payloadHash(`${text}\n${pair?.publicationFingerprint || ''}`);
      // "Manter as duas" (veredito humano "diferente"): o par sai da conferência enquanto o texto
      // comparado continuar o mesmo; se uma das tarefas ou a publicação mudar, ele volta.
      const mantidoPorPessoa = pair => {
        const entry = pruned.entries[pair.key];
        if (!entry || (entry.action !== 'dismissed' && entry.dismissed !== true)) return false;
        const hash = hashOf(pair.text, pair);
        return !(entry.payloadHash && hash && entry.payloadHash !== hash);
      };
      const visiveis = pairs.filter(pair => !mantidoPorPessoa(pair)).map(pair => {
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

    // "Manter as duas": a pessoa conferiu o par e decidiu que são providências diferentes. Grava o
    // veredito humano (nunca sobrescrito pelo modelo enquanto o texto comparado for o mesmo), tira o
    // par da conferência e registra o exemplo no aprendizado do escritório. Não altera tarefa.
    if (isTaskDuplicateDismiss) {
      const session = assertAuthenticated(req, true);
      const body = await readJson(req, 20_000);
      const wantedKey = String(body.key || '').trim();
      const idA = String(body.aId || '').trim();
      const idB = String(body.bId || '').trim();
      if (!wantedKey && (!idA || !idB)) fail(400, 'Informe o par de tarefas que deve ser mantido.');
      const { envelope, tasks, intimationOf, hashOf } = await taskDuplicateContext(session);
      const { target, previous } = await withStoreLock('taskDuplicate', async () => {
        const currentRaw = await taskDuplicateStore.read().catch(() => null);
        const currentRawEntries = rawEntriesOf(currentRaw);
        const stored = normalizeDuplicateReviewStore(currentRaw);
        const { pairs } = buildTaskDuplicatePairs({ tasks, intimationOf, store: stored });
        const key = wantedKey || [idA, idB].sort().join('|');
        const found = pairs.find(pair => pair.key === key) || null;
        if (!found) fail(404, 'Este par não está mais entre as tarefas parecidas. A lista foi atualizada.');
        const prev = stored.entries[found.key] || null;
        const next = upsertDuplicateReviewEntry(stored, found.key, {
          verdict: 'diferente',
          confidence: 1,
          action: 'dismissed',
          reason: 'Conferência humana: são providências diferentes e as duas tarefas continuam.',
          pairType: 'task-same-process',
          payloadHash: hashOf(found.text, found)
        });
        preserveDismissedFlags(next, currentRawEntries);
        await taskDuplicateStore.write(next);
        return { target: found, previous: prev };
      });
      // B6: membro privado, direto ou por intimação privada ligada à tarefa, não entra
      // no trecho do aprendizado compartilhado do escritório.
      const publicState = publicOnlyStateOf(envelope?.state);
      const pairPrivate = pairHasPrivateMember(
        [target.aId, target.bId],
        idSetOf(publicState, 'tasks'),
        hiddenIntimationIdsOf(envelope?.state, publicState),
        new Map((Array.isArray(tasks) ? tasks : []).map(task => [String(task?.id || ''), task]))
      );
      let learned = false;
      if (calibrationStore) {
        learned = await withStoreLock('calibration', async () => {
          const calibration = normalizeCalibrationStore(await calibrationStore.read().catch(() => null));
          const correction = recordHumanCorrection(calibration, {
            schemaId: AI_CLASSIFIER_TASK_DUPLICATE_SCHEMA_ID,
            questionKey: 'verdict',
            label: 'diferente',
            modelLabel: String(previous?.verdict || ''),
            excerpt: pairPrivate ? '' : redactForJev(target.text).redacted || '',
            targetKey: target.key,
            actor: sessionActor(session)
          });
          await calibrationStore.write(correction.store).catch(() => false);
          return Boolean(correction.example);
        });
      }
      json(res, 200, {
        ok: true,
        key: target.key,
        verdict: 'diferente',
        origin: 'humano',
        learned,
        message: learned
          ? 'As duas tarefas continuam. O par saiu da conferência e a decisão vira exemplo para o Atrium IA.'
          : 'As duas tarefas continuam. O par saiu da conferência e a decisão humana foi registrada.'
      });
      return true;
    }

    if (isTaskDuplicateTriage) {
      const session = assertAuthenticated(req, true);
      enforceSuggestRateLimit(req);
      const body = await readJson(req, 20_000).catch(() => ({}));
      const keys = Array.isArray(body?.keys)
        ? body.keys.map(String).filter(Boolean).slice(0, AI_CLASSIFIER_TASK_DUPLICATE_TRIAGE_LIMIT)
        : null;
      const limit = Number(body?.limit) || AI_CLASSIFIER_TASK_DUPLICATE_TRIAGE_LIMIT;
      const result = await runTaskDuplicateReview({ keys, limit, session });
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
      const officialIds = (Array.isArray(envelope?.state?.tasks) ? envelope.state.tasks : []).map(task => String(task?.id || '')).filter(Boolean);
      const pruned = await pruneStoreLocked({
        storeKey: 'taskRisk',
        storeAdapter: taskRiskStore,
        normalize: normalizeTaskRiskStore,
        prune: pruneTaskRiskStore,
        validKeys: officialIds
      });
      const visibleIds = new Set(tasks.map(task => String(task?.id || '')));
      const calibration = calibrationStore ? normalizeCalibrationStore(await calibrationStore.read().catch(() => null)) : null;
      const hashOf = text => payloadHash(text);
      const suggestions = Object.create(null);
      const overrides = calibration ? ownValue(calibration.overrides, AI_CLASSIFIER_TASK_RISK_SCHEMA_ID) : null;
      for (const task of tasks) {
        const id = String(task?.id || '');
        if (!id || !visibleIds.has(id)) continue;
        const entry = ownValue(pruned.entries, id);
        const override = overrides ? ownValue(overrides, id) : null;
        const overrideRisk = String(override?.questions?.risk || '').trim();
        // Correção humana aparece mesmo sem entrada do modelo; a base vazia não inventa veredito.
        if (!entry && !overrideRisk) continue;
        const base = entry || {};
        // Só o motivo em linguagem cruza a API: o código interno do motor não vira contrato de tela.
        suggestions[id] = {
          risk: overrideRisk || base.risk,
          riskConfidence: overrideRisk ? 1 : base.riskConfidence,
          action: overrideRisk ? 'suggest' : base.action,
          reasonLabel: overrideRisk
            ? `Risco corrigido por pessoa${override.actor ? ` (${override.actor})` : ''}.`
            : (AI_CLASSIFIER_REASON_LABELS[String(base.reason || '')] || 'leitura concluída pela Atrium IA'),
          at: overrideRisk ? (override.at || base.at) : base.at,
          ...(overrideRisk ? { origin: 'humano' } : {})
        };
      }
      json(res, 200, {
        ok: true,
        enabled: true,
        generatedAt: pruned.generatedAt,
        pending: taskRiskPending({ tasks, store: pruned, hashOf }).length,
        suggestions: { ...suggestions }
      });
      return true;
    }

    if (isTaskRiskTriage) {
      const session = assertAuthenticated(req, true);
      enforceSuggestRateLimit(req);
      const body = await readJson(req, 20_000).catch(() => ({}));
      const ids = Array.isArray(body?.ids)
        ? body.ids.map(String).filter(Boolean).slice(0, AI_CLASSIFIER_TASK_RISK_TRIAGE_LIMIT)
        : null;
      const limit = Number(body?.limit) || AI_CLASSIFIER_TASK_RISK_TRIAGE_LIMIT;
      const result = await runTaskRiskTriage({ ids, limit, session });
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
      const calibration = calibrationStore ? normalizeCalibrationStore(await calibrationStore.read().catch(() => null)) : null;
      const officialId = String(record.id || intimationId);
      const override = calibration
        ? (suggestionOverrideFor(calibration, AI_CLASSIFIER_PUBLICATION_ACTION_SCHEMA_ID, officialId)
          || (intimationId && officialId !== intimationId ? suggestionOverrideFor(calibration, AI_CLASSIFIER_PUBLICATION_ACTION_SCHEMA_ID, intimationId) : null))
        : null;
      const overrideAction = String(override?.questions?.action || '').trim();
      const hasValidOverride = Boolean(overrideAction && PUBLICATION_ACTION_IDS.includes(overrideAction));
      let action;
      let confidence;
      let reason;
      let reasonLabel;
      if (hasValidOverride) {
        action = overrideAction;
        confidence = 1;
        reason = 'HUMAN_OVERRIDE';
        reasonLabel = `Providência corrigida por pessoa${override.actor ? ` (${override.actor})` : ''}.`;
      } else {
        const { redacted } = redactForJev(sourceText);
        const { suggestion } = await classifyRedacted(redacted, AI_CLASSIFIER_PUBLICATION_ACTION_SCHEMA_ID);
        const label = String(suggestion.suggestion?.action?.label || '');
        action = PUBLICATION_ACTION_IDS.includes(label) ? label : 'outro';
        confidence = Number(suggestion.suggestion?.action?.confidence) || Number(suggestion.confidence) || 0;
        reason = suggestion.reason;
        reasonLabel = AI_CLASSIFIER_REASON_LABELS[String(suggestion.reason || '')] || 'leitura concluída pela Atrium IA';
      }
      const taskDefinition = mapPublicationActionToTaskDefinition({
        action,
        taskDefinitions: catalogDefinitions(state.configuration?.taskDefinitions)
      });
      json(res, 200, {
        ok: true,
        intimationId: officialId,
        action,
        actionLabel: PUBLICATION_ACTION_LABELS[action] || '',
        confidence,
        reason,
        reasonLabel,
        ...(hasValidOverride ? { origin: 'humano' } : {}),
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
      const records = Array.isArray(state.processes) ? state.processes : [];
      const officialIds = (Array.isArray(envelope?.state?.processes) ? envelope.state.processes : []).map(record => String(record?.id || '')).filter(Boolean);
      const pruned = await pruneStoreLocked({
        storeKey: 'processTriage',
        storeAdapter: processTriageStore,
        normalize: normalizeProcessTriageStore,
        prune: pruneProcessTriageStore,
        validKeys: officialIds
      });
      const calibration = calibrationStore ? normalizeCalibrationStore(await calibrationStore.read().catch(() => null)) : null;
      const suggestions = Object.create(null);
      const overrides = calibration ? ownValue(calibration.overrides, AI_CLASSIFIER_PROCESS_SCHEMA_ID) : null;
      for (const record of records) {
        const id = String(record?.id || '');
        if (!id) continue;
        const missingFields = processMissingFields(record);
        const entry = ownValue(pruned.entries, id);
        const override = overrides ? ownValue(overrides, id) : null;
        if (!entry && !override && missingFields.length === 0) continue;
        const base = entry ? publicProcessTriageEntry(entry) : { movementType: '', movementConfidence: 0, needsAttention: '', action: '', reason: '', at: '' };
        if (override?.questions?.movement_type) {
          base.movementType = override.questions.movement_type;
          base.movementConfidence = 1;
          base.origin = 'humano';
        }
        if (override?.questions?.needs_attention) {
          base.needsAttention = override.questions.needs_attention;
          base.origin = 'humano';
        }
        suggestions[id] = {
          ...base,
          missingFields
        };
      }
      json(res, 200, { ok: true, enabled: true, generatedAt: pruned.generatedAt, suggestions: { ...suggestions } });
      return true;
    }

    if (isProcessTriage) {
      const session = assertAuthenticated(req, true);
      enforceSuggestRateLimit(req);
      const body = await readJson(req, 20_000).catch(() => ({}));
      const ids = Array.isArray(body?.ids)
        ? body.ids.map(String).filter(Boolean).slice(0, AI_CLASSIFIER_PROCESS_TRIAGE_LIMIT)
        : null;
      const limit = Number(body?.limit) || AI_CLASSIFIER_PROCESS_TRIAGE_LIMIT;
      const result = await runProcessTriage({ ids, limit, session });
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
      const officialRecords = collectFinancialRecords(envelope?.state || {});
      const pruned = await pruneStoreLocked({
        storeKey: 'financialTriage',
        storeAdapter: financialTriageStore,
        normalize: normalizeFinancialTriageStore,
        prune: pruneFinancialTriageStore,
        validKeys: officialRecords.map(record => record.id)
      });
      const visibleIds = new Set(records.map(record => String(record.id)));
      const calibration = calibrationStore ? normalizeCalibrationStore(await calibrationStore.read().catch(() => null)) : null;
      const suggestions = Object.create(null);
      const overrides = calibration ? ownValue(calibration.overrides, AI_CLASSIFIER_FINANCIAL_SCHEMA_ID) : null;
      for (const record of records) {
        const id = String(record?.id || '');
        if (!id || !visibleIds.has(id)) continue;
        const entry = ownValue(pruned.entries, id);
        const override = overrides ? ownValue(overrides, id) : null;
        // Correção humana aparece mesmo sem entrada do modelo; a base vazia não inventa veredito.
        if (!entry && !override) continue;
        const base = entry ? publicFinancialTriageEntry(entry)
          : { bucket: '', bucketConfidence: 0, action: 'abstain', reason: '', at: '' };
        if (override?.questions?.bucket) {
          base.bucket = override.questions.bucket;
          base.bucketConfidence = 1;
          base.origin = 'humano';
        }
        suggestions[id] = base;
      }
      json(res, 200, { ok: true, enabled: true, generatedAt: pruned.generatedAt, suggestions: { ...suggestions } });
      return true;
    }

    if (isFinancialTriage) {
      const session = assertAuthenticated(req, true);
      enforceSuggestRateLimit(req);
      const body = await readJson(req, 20_000).catch(() => ({}));
      const ids = Array.isArray(body?.ids)
        ? body.ids.map(String).filter(Boolean).slice(0, AI_CLASSIFIER_FINANCIAL_TRIAGE_LIMIT)
        : null;
      const limit = Number(body?.limit) || AI_CLASSIFIER_FINANCIAL_TRIAGE_LIMIT;
      const result = await runFinancialTriage({ ids, limit, session });
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
