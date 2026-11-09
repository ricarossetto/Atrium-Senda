/**
 * ATRIUM — Motor puro de fusão de publicações duplicadas.
 *
 * Módulo sem I/O (não lê nem grava estado, não conhece HTTP). Recebe dois registros
 * já agrupados por `intimation-identity.mjs` e descreve a fusão:
 * - `merged`: registro do keeper enriquecido com os dados do perdedor;
 * - `alias`: identidade reversível do perdedor (`mergedInto`), nunca remoção física;
 * - `taskLinkRewrites`: tarefas do perdedor que devem apontar para o keeper.
 *
 * Regras de precedência (contrato):
 * - conteúdo (texto/título/data/rawHtml): vence a fonte DJEN quando um dos dois for DJEN;
 *   caso contrário o keeper prevalece e só campos vazios são preenchidos;
 * - texto integral (`fullText`/`fullTextSource`): o Domicílio Eletrônico traz o teor
 *   completo da comunicação — o MAIOR texto integral vence (longer-wins), sem jamais
 *   sobrescrever `text` (publicação do DJEN);
 * - cliente/contato/processo: vence eproc/curadoria; valor existente nunca é
 *   sobrescrito por vazio e recipients DJEN nunca viram `client`;
 * - fonte (sourceReportedDeadlineAt/sourceStatus/sourceProvenance/sourceEvidence):
 *   vence eproc; status fica `active` se qualquer fonte estiver ativa; evidência é
 *   concatenação cronológica deduplicada; `deadlineSource` domicilio é referência
 *   declarada pela fonte, nunca tratada como prazo humano nem aplicada sozinha;
 * - arrays (linkedTaskIds/linkedWorkActions/workNotes) e sourceAliases: união deduplicada;
 * - tratamento: evento mais recente (treatedAt/discardedAt/treatmentStartedAt) e notas
 *   concatenadas; treated × discarded é conflito e impede a fusão;
 * - campos protegidos: status/responsible/completedAt permanecem do keeper; `deadline` e
 *   `fatalDeadline` só são herdados do perdedor quando o keeper não tem valor (preserva
 *   confirmação humana, nunca infere prazo); `unread` é a união booleana dos dois lados.
 *
 * `computeMergePlan` é puro e não muta as entradas; chamadas repetidas sobre um keeper
 * já fundido produzem o mesmo resultado (idempotência), preservando `mergedAt` original.
 * `chooseKeeper` nunca elege registro já absorvido (`mergedInto`) e devolve `null` quando
 * os dois lados não são registros elegíveis a keeper.
 *
 * `absorbedIntimationKeys`/`selectNewPublicationEvents` derivam eventos pós-fusão para
 * digest/e-mail: o perdedor absorvido nunca é anunciado como novidade.
 */
import { computeIntimationIdentity } from './intimation-identity.mjs';

const DJEN_SOURCE = 'djen';
const EPROC_SOURCE = 'eproc';
const DUPLICATE_REASON = 'duplicate-identity';
// Fontes cuja data declarada é aplicada por autoridade da fonte (não é prazo humano).
// `domicilio` fica de fora do conjunto de aplicação automática: o Domicílio Eletrônico
// é redundância declarada e nunca substitui a verdade do eproc sobre prazos.
const SOURCE_DECLARED_DEADLINE_SOURCES = new Set(['eproc', 'pje', 'domicilio']);
const AUTO_APPLIED_DEADLINE_SOURCES = new Set(['eproc', 'pje']);

const CONTENT_FIELDS = ['text', 'title', 'rawHtml', 'date', 'publishedAt'];
const CONTACT_FIELDS = ['client', 'clientName', 'contactId', 'processId'];
const TREATMENT_FIELDS = [
  'treatmentStatus', 'treatedAt', 'treatedBy', 'discardedAt', 'discardedBy',
  'treatmentStartedAt', 'treatmentStartedBy'
];
const UNION_ARRAY_FIELDS = [
  { field: 'linkedTaskIds', key: value => String(value) },
  { field: 'linkedWorkActions', key: value => String(value?.id || JSON.stringify(value)) },
  { field: 'workNotes', key: value => String(value?.id || JSON.stringify(value)) }
];

export function chooseKeeper(first, second, identityOf = computeIntimationIdentity) {
  const firstUsable = isUsableKeeper(first);
  const secondUsable = isUsableKeeper(second);
  if (!firstUsable && !secondUsable) return null;
  if (!firstUsable) return second;
  if (!secondUsable) return first;
  const resolveIdentity = typeof identityOf === 'function' ? identityOf : computeIntimationIdentity;
  const firstScore = keeperScore(first, resolveIdentity);
  const secondScore = keeperScore(second, resolveIdentity);
  if (firstScore !== secondScore) return firstScore > secondScore ? first : second;
  const firstUpdated = recordTimestamp(first);
  const secondUpdated = recordTimestamp(second);
  if (firstUpdated !== secondUpdated) return firstUpdated > secondUpdated ? first : second;
  return first;
}

export function computeMergePlan(keeper, loser, options = {}) {
  const blocked = { mergeable: false, conflict: null, merged: null, alias: null, taskLinkRewrites: [] };
  if (!isRecord(keeper) || !isRecord(loser)) return blocked;
  if (treatmentConflict(keeper, loser)) {
    return { ...blocked, conflict: { reason: 'treatment-conflict' } };
  }

  const resolveIdentity = typeof options.identityOf === 'function' ? options.identityOf : computeIntimationIdentity;
  const identities = {
    keeper: resolveIdentity(keeper) || computeIntimationIdentity(keeper),
    loser: resolveIdentity(loser) || computeIntimationIdentity(loser)
  };
  const merged = cloneValue(keeper);
  delete merged.mergedInto;
  delete merged.mergedAt;
  delete merged.mergeReason;

  applyContentPrecedence(merged, keeper, loser, identities);
  applyFullText(merged, keeper, loser);
  applyContactPrecedence(merged, keeper, loser, identities);
  applySourceFields(merged, keeper, loser, identities);
  applyUnions(merged, keeper, loser);
  applyTreatment(merged, keeper, loser);
  applyProtectedFields(merged, keeper, loser);

  const absorbedAliases = uniqueStrings([
    ...(Array.isArray(loser.sourceAliases) ? loser.sourceAliases : []),
    loser.externalId,
    loser.id
  ]).filter(value => value && value !== String(merged.externalId || ''));
  merged.sourceAliases = uniqueStrings([
    ...(Array.isArray(keeper.sourceAliases) ? keeper.sourceAliases : []),
    ...absorbedAliases
  ]);
  if (!merged.taskId && loser.taskId) merged.taskId = loser.taskId;

  const keeperKey = recordKey(keeper);
  const alias = {
    id: recordKey(loser),
    mergedInto: keeperKey,
    mergedAt: validIso(loser.mergedAt) || new Date().toISOString(),
    reason: DUPLICATE_REASON,
    sourceAliases: absorbedAliases
  };
  const taskLinkRewrites = linkedTaskIds(loser).map(taskId => ({
    taskId,
    from: recordKey(loser),
    to: keeperKey
  }));

  return { mergeable: true, conflict: null, merged, alias, taskLinkRewrites };
}

/**
 * Ids dos perdedores absorvidos por uma rodada de fusão (`merges` do runtime/server).
 * Usado para impedir que o digest anuncie duplicata que o painel já esconde.
 */
export function absorbedIntimationKeys(merges = []) {
  const keys = new Set();
  for (const merge of Array.isArray(merges) ? merges : []) {
    const key = String(merge?.loserId || '').trim();
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * Eventos de publicação pós-fusão: descarta registros ausentes/inválidos, aliases
 * (`mergedInto`), ids já conhecidos (`previousKeys`) e perdedores absorvidos na rodada
 * (`absorbedKeys`). Nunca retorna o alias; o keeper é anunciado no máximo uma vez.
 */
export function selectNewPublicationEvents(records = [], { previousKeys = [], absorbedKeys = [] } = {}) {
  const previous = previousKeys instanceof Set ? previousKeys : new Set(Array.isArray(previousKeys) ? previousKeys : []);
  const absorbed = absorbedKeys instanceof Set ? absorbedKeys : new Set(Array.isArray(absorbedKeys) ? absorbedKeys : []);
  return (Array.isArray(records) ? records : []).filter(record => {
    if (!isRecord(record) || record.mergedInto || record.scope === 'private') return false;
    const key = String(record.id || record.externalId || '').trim();
    if (!key) return false;
    return !previous.has(key) && !absorbed.has(key);
  });
}

function isUsableKeeper(record) {
  return isRecord(record) && !record.mergedInto;
}

function keeperScore(record, identityOf = computeIntimationIdentity) {
  const identity = identityOf(record) || computeIntimationIdentity(record);
  let score = identity.source === EPROC_SOURCE ? 10_000 : 0;
  if (hasValue(record.portalId)) score += 2_000;
  if (hasValue(record.treatedAt) || hasValue(record.discardedAt) || hasValue(record.treatmentStartedAt)) score += 800;
  if (treatmentStatusOf(record) !== 'untreated') score += 200;
  if (hasValue(record.deadline) || hasValue(record.fatalDeadline)) score += 500;
  score += Math.min(300, linkedTaskIds(record).length * 100);
  score += Math.min(120, filledFieldCount(record));
  return score;
}

/**
 * Campos protegidos: status/`responsible`/`completedAt` permanecem do keeper (clonado em
 * `merged`). Prazo confirmado do perdedor é transferido apenas quando o keeper não tem
 * valor — nunca é inferido nem sobrescreve confirmação humana existente. `unread` é a
 * união booleana para não perder publicação não lida absorvida.
 */
function applyProtectedFields(merged, keeper, loser) {
  if (!hasValue(merged.deadline) && hasValue(loser.deadline)) merged.deadline = cloneValue(loser.deadline);
  if (!hasValue(merged.fatalDeadline) && hasValue(loser.fatalDeadline)) merged.fatalDeadline = cloneValue(loser.fatalDeadline);
  merged.unread = Boolean(keeper.unread) || Boolean(loser.unread);
}

function applyContentPrecedence(merged, keeper, loser, identities) {
  const keeperIsDjen = identities.keeper.source === DJEN_SOURCE;
  const loserIsDjen = identities.loser.source === DJEN_SOURCE;
  for (const field of CONTENT_FIELDS) {
    const keeperValue = keeper[field];
    const loserValue = loser[field];
    let chosen = null;
    if (keeperIsDjen && hasValue(keeperValue)) chosen = keeperValue;
    else if (loserIsDjen && hasValue(loserValue)) chosen = loserValue;
    else if (hasValue(keeperValue)) chosen = keeperValue;
    else if (hasValue(loserValue)) chosen = loserValue;
    if (chosen !== null) merged[field] = cloneValue(chosen);
  }
}

/**
 * Texto integral (`fullText`): o Domicílio Eletrônico traz o teor completo da
 * comunicação — a ordem de prioridade fixa é DJEN para captura/metadados e
 * Domicílio para o texto completo, então o **maior texto integral vence**
 * (longer-wins), sem jamais sobrescrever `text` (publicação do DJEN).
 */
function applyFullText(merged, keeper, loser) {
  const keeperText = typeof keeper.fullText === 'string' && keeper.fullText.trim() ? keeper.fullText : null;
  const loserText = typeof loser.fullText === 'string' && loser.fullText.trim() ? loser.fullText : null;
  if (!keeperText && !loserText) {
    if (!('fullText' in keeper)) {
      delete merged.fullText;
      delete merged.fullTextSource;
    }
    return;
  }
  const bestRecord = keeperText && (!loserText || keeperText.length >= loserText.length) ? keeper : loser;
  merged.fullText = keeperText && (!loserText || keeperText.length >= loserText.length) ? keeperText : loserText;
  merged.fullTextSource = bestRecord.fullTextSource || null;
}

function applyContactPrecedence(merged, keeper, loser, identities) {
  const keeperAuthoritative = isAuthoritativeContactSource(keeper, identities.keeper);
  const loserAuthoritative = isAuthoritativeContactSource(loser, identities.loser);
  for (const field of CONTACT_FIELDS) {
    const keeperValue = keeper[field];
    const loserValue = loser[field];
    let chosen = null;
    if (keeperAuthoritative && hasValue(keeperValue)) chosen = keeperValue;
    else if (loserAuthoritative && hasValue(loserValue)) chosen = loserValue;
    else if (hasValue(keeperValue) && !isDjenClient(keeper, identities.keeper, field)) chosen = keeperValue;
    else if (hasValue(loserValue) && !isDjenClient(loser, identities.loser, field)) chosen = loserValue;
    if (chosen !== null) merged[field] = cloneValue(chosen);
  }
}

function applySourceFields(merged, keeper, loser, identities) {
  const deadline = pickBySourcePreference(keeper, loser, identities, 'sourceReportedDeadlineAt');
  if (hasValue(deadline)) {
    merged.sourceReportedDeadlineAt = cloneValue(deadline);
    // Origem da data declarada (aplicada ou não): permite à UI nomear a fonte real da
    // referência sem confundir o Domicílio Eletrônico com o eproc.
    const declaredSource = pickBySourcePreference(keeper, loser, identities, 'sourceReportedDeadlineSource');
    if (hasValue(declaredSource)) merged.sourceReportedDeadlineSource = cloneValue(declaredSource);
    else if (!('sourceReportedDeadlineSource' in keeper)) delete merged.sourceReportedDeadlineSource;
    const keeperManual = hasValue(keeper.deadline) && !SOURCE_DECLARED_DEADLINE_SOURCES.has(keeper.deadlineSource);
    const loserManual = hasValue(loser.deadline) && !SOURCE_DECLARED_DEADLINE_SOURCES.has(loser.deadlineSource);
    const manualValue = keeperManual ? keeper.deadline : (loserManual ? loser.deadline : null);
    if (manualValue) {
      merged.deadline = cloneValue(manualValue);
      merged.deadlineSource = keeperManual ? keeper.deadlineSource : loser.deadlineSource;
    } else {
      // O prazo aplicado pertence à fonte que o declarou: procura o registro cuja data
      // declarada coincide com a escolhida e que aplica prazo por autoridade (eproc/pje).
      // Domicílio nunca aplica: sua data fica só como referência declarada.
      const carriers = [keeper, loser].filter(record => AUTO_APPLIED_DEADLINE_SOURCES.has(record.deadlineSource) && hasValue(record.deadline));
      const carrier = carriers.find(record => record.sourceReportedDeadlineAt === deadline) || carriers[0] || null;
      if (carrier) {
        merged.deadline = cloneValue(carrier.deadline);
        merged.deadlineSource = carrier.deadlineSource;
      }
    }
  } else if (!('sourceReportedDeadlineAt' in keeper)) delete merged.sourceReportedDeadlineAt;

  // Referência de ciência declarada pela fonte (ex.: dataFinalCiencia do Domicílio):
  // preserva a data da fonte com a mesma preferência de prazo, sem virar `deadline`.
  const noticeReference = pickBySourcePreference(keeper, loser, identities, 'noticeDeadlineAt');
  if (hasValue(noticeReference)) merged.noticeDeadlineAt = cloneValue(noticeReference);
  else if (!('noticeDeadlineAt' in keeper)) delete merged.noticeDeadlineAt;

  const keeperActive = keeper.sourceStatus === 'active';
  const loserActive = loser.sourceStatus === 'active';
  if (keeperActive || loserActive) {
    merged.sourceStatus = 'active';
    const activeRecord = keeperActive ? keeper : loser;
    if (hasValue(activeRecord.sourceStatusChangedAt)) merged.sourceStatusChangedAt = cloneValue(activeRecord.sourceStatusChangedAt);
  } else {
    const fallback = hasValue(keeper.sourceStatus) ? keeper : (hasValue(loser.sourceStatus) ? loser : null);
    if (fallback) merged.sourceStatus = cloneValue(fallback.sourceStatus);
  }

  const provenance = pickBySourcePreference(keeper, loser, identities, 'sourceProvenance');
  if (provenance && typeof provenance === 'object') merged.sourceProvenance = cloneValue(provenance);
  else if (hasValue(provenance)) merged.sourceProvenance = provenance;

  const evidence = mergeSourceEvidence(keeper, loser);
  if (evidence.length > 0) merged.sourceEvidence = evidence;
}

function applyUnions(merged, keeper, loser) {
  for (const { field, key } of UNION_ARRAY_FIELDS) {
    const keeperList = Array.isArray(keeper[field]) ? keeper[field] : [];
    const loserList = Array.isArray(loser[field]) ? loser[field] : [];
    const union = uniqueBy([...keeperList, ...loserList], key);
    if (union.length > 0) merged[field] = union.map(cloneValue);
    else if (Array.isArray(keeper[field])) merged[field] = [];
  }
  const taskIds = uniqueStrings([...linkedTaskIds(keeper), ...linkedTaskIds(loser)]);
  if (taskIds.length > 0 || Array.isArray(keeper.linkedTaskIds)) merged.linkedTaskIds = taskIds;
}

function applyTreatment(merged, keeper, loser) {
  const keeperEvent = latestTreatmentTimestamp(keeper);
  const loserEvent = latestTreatmentTimestamp(loser);
  let winner = keeper;
  if (loserEvent && (!keeperEvent || loserEvent > keeperEvent)) {
    winner = loser;
  } else if (!keeperEvent && !loserEvent) {
    const keeperStatus = treatmentStatusOf(keeper);
    const loserStatus = treatmentStatusOf(loser);
    if (keeperStatus === 'untreated' && loserStatus !== 'untreated') winner = loser;
  }
  for (const field of TREATMENT_FIELDS) {
    if (field === 'treatmentStatus') continue;
    merged[field] = winner[field] === undefined ? null : cloneValue(winner[field]);
  }
  merged.treatmentStatus = treatmentStatusOf(winner);
  const note = mergeTreatmentNotes(keeper.treatmentNote, loser.treatmentNote);
  if (note) merged.treatmentNote = note;
  else if (!('treatmentNote' in keeper)) delete merged.treatmentNote;
}

function mergeTreatmentNotes(keeperNote, loserNote) {
  const notes = [];
  const keeperText = String(keeperNote || '').trim();
  if (keeperText) notes.push(keeperText);
  const loserText = String(loserNote || '').trim();
  if (loserText) {
    const existingLines = new Set(notes.flatMap(note => note.split('\n').map(line => line.trim()).filter(Boolean)));
    const incomingLines = loserText.split('\n').map(line => line.trim()).filter(Boolean);
    if (incomingLines.some(line => !existingLines.has(line))) notes.push(loserText);
  }
  return notes.join('\n');
}

function treatmentConflict(keeper, loser) {
  return (hasValue(keeper.treatedAt) && hasValue(loser.discardedAt))
    || (hasValue(keeper.discardedAt) && hasValue(loser.treatedAt));
}

function pickBySourcePreference(keeper, loser, identities, field) {
  const keeperIsEproc = identities.keeper.source === EPROC_SOURCE;
  const loserIsEproc = identities.loser.source === EPROC_SOURCE;
  if (keeperIsEproc && hasValue(keeper[field])) return keeper[field];
  if (loserIsEproc && hasValue(loser[field])) return loser[field];
  if (hasValue(keeper[field])) return keeper[field];
  if (hasValue(loser[field])) return loser[field];
  return null;
}

function mergeSourceEvidence(keeper, loser) {
  const entries = [];
  for (const record of [keeper, loser]) {
    const list = Array.isArray(record?.sourceEvidence) ? record.sourceEvidence : [];
    for (const entry of list) {
      if (entry === undefined || entry === null) continue;
      entries.push({
        entry,
        at: Date.parse(String(entry.collectedAt || entry.at || entry.sourceReportedAt || '')) || 0,
        order: entries.length
      });
    }
  }
  entries.sort((a, b) => a.at - b.at || a.order - b.order);
  const seen = new Set();
  const result = [];
  for (const item of entries) {
    const key = JSON.stringify(item.entry);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cloneValue(item.entry));
  }
  return result;
}

function isAuthoritativeContactSource(record, identity) {
  if (identity.source === EPROC_SOURCE) return true;
  const markers = [
    record?.origin,
    record?.collectionSource,
    record?.sourceProvenance?.system,
    record?.sourceProvenance?.action,
    record?.sourceProvenance?.path
  ];
  return markers.some(marker => String(marker || '').toLocaleLowerCase('pt-BR').includes('curadoria'));
}

function isDjenClient(record, identity, field) {
  return field === 'client' && identity.source === DJEN_SOURCE;
}

function latestTreatmentTimestamp(record) {
  const candidates = [record?.treatedAt, record?.discardedAt, record?.treatmentStartedAt];
  let latest = 0;
  for (const candidate of candidates) {
    const parsed = Date.parse(String(candidate || ''));
    if (Number.isFinite(parsed) && parsed > latest) latest = parsed;
  }
  return latest;
}

function treatmentStatusOf(record) {
  return String(record?.treatmentStatus || 'untreated');
}

function linkedTaskIds(record) {
  const ids = [];
  if (Array.isArray(record?.linkedTaskIds)) {
    for (const id of record.linkedTaskIds) if (id) ids.push(String(id));
  }
  if (record?.taskId) ids.push(String(record.taskId));
  return uniqueStrings(ids);
}

function filledFieldCount(record) {
  let count = 0;
  for (const value of Object.values(record)) {
    if (Array.isArray(value) ? value.length > 0 : hasValue(value)) count += 1;
  }
  return count;
}

function recordTimestamp(record) {
  return Date.parse(String(record?.updatedAt || record?.lastSeenAt || record?.createdAt || '')) || 0;
}

function recordKey(record) {
  return String(record?.id || record?.externalId || '');
}

function validIso(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function uniqueStrings(values) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const text = value === undefined || value === null ? '' : String(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

function uniqueBy(values, keyOf) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const key = keyOf(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function cloneValue(value) {
  if (!isRecord(value) && !Array.isArray(value)) return value;
  return structuredClone(value);
}
