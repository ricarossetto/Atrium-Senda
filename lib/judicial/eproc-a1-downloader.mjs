import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';

import { createModernizedPfx } from './a1-sandbox.mjs';
import { SecurityManager, generateTotp } from '../security.mjs';
import { EncryptedLocalDocumentStorageProvider } from '../documents/document-storage-provider.mjs';
import { JudicialCredentialManager, WORKSPACE_ACCESS_KEY_OWNER } from './credential-manager.mjs';
import {
  authenticateEprocWithCertAndTotp,
  authenticateEprocWithCredentials,
  openEprocProcessDetails,
  extractProcessDetails,
  downloadAndOrganizeProcessDocuments,
  collectEprocDeadlines,
  collectEprocHearings,
  collectEprocSessions
} from '../../collector/adapters/eproc.mjs';
import { reconcileEprocHearings } from './eproc/sync/hearings-sync.mjs';
import { reconcileEprocSessions } from './eproc/sync/sessions-sync.mjs';
import { assertReadOnlyJudicialOperation } from './managed-connectivity.mjs';
import { getEprocPortalById, getPortalCredentialKeyCandidates } from './eproc/portal-registry.mjs';
import { recordEprocEnrichmentCompletion } from './eproc/enrichment/completion-evidence.mjs';
import { parseEprocCnj as parseEprocCnjShared, processMatchesPortal } from './eproc/sync/portal-process-match.mjs';
import { taskDeadlineOwnership } from '../publications/source-deadline-sync.mjs';
import { eprocTaskTitle } from './source-task-label.mjs';
import {
  findCanonicalSourceTaskId,
  planSourceDeadlineTaskConsolidation,
  applySourceDeadlineTaskConsolidation,
  sourceActLabel
} from '../publications/source-deadline-consolidation.mjs';
import {
  EprocReportSnapshotStore,
  runEprocProcessReportInventory,
  selectEprocReportEnrichmentTargets,
  EPROC_DISCOVERY_SOURCE,
  digitsOnly
} from './eproc/sync/report-sync.mjs';

export function parseBrDateToIso(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const match = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }
  return null;
}

function isRevisionConflictError(error) {
  if (Number(error?.statusCode) === 409) return true;
  const message = String(error?.message || error || '');
  return /409|outra aba|Recarregue a Central|revision conflict/i.test(message);
}

export function buildEprocProgress(completed, total) {
  const realTotal = Number(total);
  if (!Number.isFinite(realTotal) || realTotal <= 0) {
    return { determinate: false, progress: null, completed: null, total: null };
  }
  const realCompleted = Math.min(realTotal, Math.max(0, Number(completed) || 0));
  return {
    determinate: true,
    progress: Math.floor((realCompleted / realTotal) * 100),
    completed: realCompleted,
    total: realTotal
  };
}

export const parseEprocCnj = parseEprocCnjShared;

export function isEnrichmentMarked(process) {
  const explicitTag = (Array.isArray(process?.tags) ? process.tags : [])
    .some(tag => String(tag || '').trim().toLocaleLowerCase('pt-BR') === 'enriquecimento eproc');
  if (explicitTag) return true;
  const cnj = parseEprocCnj(process?.number);
  const court = String(process?.court || '').toUpperCase();
  const isTjrs = cnj?.justiceRegion === '821' || court.includes('TJRS');
  if (!isTjrs) return false;
  const client = String(process?.client || '').trim();
  return Boolean(process?.secrecy) || !client || /^(?:cliente\s+)?(?:geral|n[aã]o\s+informado|n[aã]o\s+identificado|modelo|do\s+escrit[oó]rio|sigilo|n\/?i|sem\s+cliente)$/i.test(client);
}

function isEnrichmentCandidate(process) {
  const client = String(process?.client || '').trim();
  const isSigilo = client.toUpperCase() === 'SIGILO' || process?.secrecy === true || (process?.tags && process.tags.includes('segredo-de-justica'));
  const isMissingClient = !client || client === 'undefined' || client === 'null' || /^(?:cliente\s+)?(?:geral|n[aã]o\s+informado|n[aã]o\s+identificado|modelo|do\s+escrit[oó]rio|sigilo|n\/?i|sem\s+cliente)$/i.test(client);
  return isSigilo || isMissingClient || !process?.judge || !process?.court || !process?.actionClass || (!process?.accessKey && !process?.chaveAcesso) || !process?.opposingParty;
}

/**
 * Reconcilia o marcador "chave processual armazenada" com a fonte e o cofre.
 *
 * - A página declarou chave: marca o registro (o sweep persiste a chave no cofre);
 * - A página não declarou e o cofre **não guarda nenhuma chave** para o CNJ (nem
 *   coletada nem manual): limpa a marca residual de detecções antigas por texto;
 * - Cofre indisponível/incerto: mantém a marca (fail-closed, nunca limpa no escuro).
 *
 * Devolve true quando alterou o registro.
 */
export function reconcileSourceAccessKey(process, details, { vaultHasKey = true } = {}) {
  if (!process || typeof process !== 'object') return false;
  const sourceKey = typeof details?.accessKey === 'string' ? details.accessKey.trim() : '';
  if (sourceKey) {
    delete process.accessKey;
    delete process.chaveAcesso;
    process.hasAccessKey = true;
    process.accessKeyUpdatedAt = new Date().toISOString();
    if (!Array.isArray(process.tags)) process.tags = [];
    if (!process.tags.includes('chave-disponivel')) process.tags.push('chave-disponivel');
    return true;
  }
  if (process.hasAccessKey !== true || vaultHasKey) return false;
  delete process.hasAccessKey;
  delete process.accessKeyUpdatedAt;
  if (Array.isArray(process.tags)) process.tags = process.tags.filter(tag => tag !== 'chave-disponivel');
  return true;
}

/**
 * Reconcilia o sigilo do processo com o que a fonte oficial reportou.
 *
 * A fonte prevalece quando declara o nível do processo:
 * - nível > 0 marca (`secrecy: true` + tag de origem `segredo-de-justica`);
 * - nível 0 explícito limpa a marcação de origem, inclusive marcas legadas sem
 *   tag (anteriores à proveniência), desde que não sejam manuais;
 * - sem nível declarado não há evidência para limpar nem para confirmar: a
 *   marca é mantida e registrada a revisão única (`secrecyReviewedAt`).
 *
 * Marcação manual do usuário (`secrecyManual: true`) nunca é alterada.
 * Devolve true quando alterou o registro.
 */
export function reconcileSourceSecrecy(process, details) {
  const sourceSaysSecret = Boolean(details?.secrecy);
  const taggedBySource = Array.isArray(process?.tags) && process.tags.includes('segredo-de-justica');
  if (sourceSaysSecret) {
    process.secrecy = true;
    process.secrecyLevel = details.secrecyLevel || process.secrecyLevel || 'Segredo de Justiça (Nível 1)';
    if (!Array.isArray(process.tags)) process.tags = [];
    if (!process.tags.includes('segredo-de-justica')) process.tags.push('segredo-de-justica');
    // Sigilo confirmado pela fonte: sai da fila de revisão única (não relê eternamente).
    process.secrecyReviewedAt = new Date().toISOString();
    return true;
  }
  if (process?.secrecyManual === true) return false;
  if (process?.secrecy === true) {
    if (details?.secrecyExplicit === true) {
      process.secrecy = false;
      process.secrecyLevel = '';
      if (Array.isArray(process.tags)) process.tags = process.tags.filter(tag => tag !== 'segredo-de-justica');
      delete process.secrecyReviewedAt;
      return true;
    }
    // Normalização do resíduo legado (detector antigo por rótulos de peça): a capa
    // real do processo não declara "Nível de Sigilo" em texto (verificado em página
    // real: inner-text sem qualquer linha de sigilo). Após DUAS leituras oficiais
    // sem evidência de sigilo, a marca de origem é limpa — a manual jamais é alterada.
    if (process.secrecyReviewedAt) {
      process.secrecy = false;
      process.secrecyLevel = '';
      delete process.secrecyReviewedAt;
      if (Array.isArray(process.tags)) process.tags = process.tags.filter(tag => tag !== 'segredo-de-justica');
      return true;
    }
    process.secrecyReviewedAt = new Date().toISOString();
    return true;
  }
  if (taggedBySource) {
    process.secrecyLevel = '';
    process.tags = process.tags.filter(tag => tag !== 'segredo-de-justica');
    return true;
  }
  return false;
}

export function selectEprocSweepTargets(processes = [], portalId, { processNumber, maxProcesses = 50 } = {}) {
  const portal = getEprocPortalById(portalId);
  if (!portal) return [];
  if (processNumber) {
    const norm = String(processNumber).replace(/\D/g, '');
    const existing = processes.find(process => String(process?.number || '').replace(/\D/g, '') === norm);
    if (existing) return processMatchesPortal(existing, portal) ? [existing] : [];
    if (processMatchesPortal({ number: processNumber }, portal)) return [{ number: processNumber, client: 'Não identificado', source: `eproc-${portal.id}` }];
    return [];
  }
  const candidates = processes.filter(process => processMatchesPortal(process, portal)
    && (isEnrichmentMarked(process) || isEnrichmentCandidate(process)));
  const score = process => {
    const client = String(process.client || '').trim().toLowerCase();
    const missing = !client || client === 'undefined' || /geral|n[aã]o|sigilo/i.test(client);
    return (client === 'sigilo' ? 10 : 0) + (missing ? 8 : 0) + (!process.accessKey ? 4 : 0);
  };
  candidates.sort((a, b) => score(b) - score(a));
  const marked = candidates.filter(isEnrichmentMarked);
  const remaining = candidates.filter(candidate => !marked.includes(candidate));
  const safeLimit = Math.max(0, Number(maxProcesses) || 0);
  return [...marked, ...remaining.slice(0, safeLimit)];
}

function normalizedSourceDate(value) {
  return parseBrDateToIso(value) || null;
}

const GENERIC_CLIENT_NAME = /^(?:cliente\s+)?(?:geral|n[aã]o\s+informado|n[aã]o\s+identificado|modelo|do\s+escrit[oó]rio|sigilo|n\/?i|sem\s+cliente)$/i;

function isMissingOrGenericClient(value) {
  const client = String(value || '').trim();
  return !client || client === 'undefined' || client === 'null' || GENERIC_CLIENT_NAME.test(client);
}

function normalizedClientIdentity(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function applyConfirmedClientLink(record, { client = '', clientName = '', contactId = '' } = {}) {
  if (!record || typeof record !== 'object') return false;
  const confirmedClient = isMissingOrGenericClient(client) ? '' : String(client).replace(/\s+/g, ' ').trim();
  if (!confirmedClient) return false;
  const aligned = isMissingOrGenericClient(record.client)
    || normalizedClientIdentity(record.client) === normalizedClientIdentity(confirmedClient);
  if (!aligned) return false;
  const confirmedClientName = isMissingOrGenericClient(clientName) ? '' : String(clientName).replace(/\s+/g, ' ').trim();
  const confirmedContactId = String(contactId || '').trim();
  let changed = false;
  if (isMissingOrGenericClient(record.client)) {
    record.client = confirmedClient;
    changed = true;
  }
  if (confirmedClientName && !String(record.clientName || '').trim()) {
    record.clientName = confirmedClientName;
    changed = true;
  }
  if (confirmedContactId && !String(record.contactId || '').trim()) {
    record.contactId = confirmedContactId;
    changed = true;
  }
  return changed;
}

function backfillEprocPublicationClient(state, proc, link = {}) {
  if (!state || !proc || typeof proc !== 'object') return 0;
  const processId = String(proc.id || '').trim();
  const cnj = String(proc.number || proc.cnj || '').replace(/\D/g, '');
  const matchesProcess = record => {
    if (!record || typeof record !== 'object') return false;
    if (processId && String(record.processId || '').trim() === processId) return true;
    const recordCnj = String(record.process || record.processNumber || '').replace(/\D/g, '');
    return Boolean(cnj && recordCnj === cnj);
  };
  let updated = 0;
  for (const task of Array.isArray(state.tasks) ? state.tasks : []) {
    if (matchesProcess(task) && applyConfirmedClientLink(task, { client: link.client, contactId: link.contactId })) updated += 1;
  }
  for (const intimation of Array.isArray(state.intimations) ? state.intimations : []) {
    if (matchesProcess(intimation) && applyConfirmedClientLink(intimation, link)) updated += 1;
  }
  return updated;
}

function eprocSourceFingerprint(portalId, item) {
  const cnj = String(item?.processNumber || '').replace(/\D/g, '');
  const identity = [
    portalId,
    item?.itemType || 'pending_intimation',
    cnj,
    String(item?.event || '').trim().toLowerCase(),
    normalizedSourceDate(item?.sentAt || item?.startsAt) || String(item?.sentAt || item?.startsAt || '').trim().toLowerCase()
  ].join('|');
  return createHash('sha256').update(identity).digest('hex');
}

function sourceEvidenceSnapshot(item, collectedAt, status = 'active') {
  return {
    status,
    collectedAt,
    sourceReportedDeadlineAt: normalizedSourceDate(item?.deadlineAt),
    sourceReportedAt: normalizedSourceDate(item?.sentAt || item?.startsAt),
    sourceText: String(item?.sourceText || item?.processDetails || '').slice(0, 4000)
  };
}

export function getEprocPanelCollectionErrors(collectionStatus = {}, portalId = '') {
  return [
    ['open_deadline', 'Prazos em aberto'],
    ['pending_intimation', 'Intimações pendentes']
  ].flatMap(([itemType, label]) => (collectionStatus?.[itemType]?.collected === true || collectionStatus?.[itemType]?.notFound === true) ? [] : [{
    scope: 'deadlines_and_intimations',
    portalId,
    itemType,
    error: `${label} não pôde ser confirmado no Painel do Advogado.`
  }]);
}

export function getEprocPanelCollectionWarnings(collectionStatus = {}) {
  return [
    ['open_deadline', 'Prazos em aberto'],
    ['pending_intimation', 'Intimações pendentes']
  ].flatMap(([itemType, label]) => collectionStatus?.[itemType]?.notFound === true
    ? [`A seção "${label}" não está disponível no Painel do Advogado deste usuário; nenhum item foi marcado como ausente.`]
    : []);
}

export function reconcileEprocSourceItems(state, {
  portalId,
  portalLabel,
  collectedAt,
  openDeadlines = [],
  pendingIntimations = [],
  collectionStatus = {}
} = {}) {
  state.intimations = Array.isArray(state.intimations) ? state.intimations : [];
  state.processes = Array.isArray(state.processes) ? state.processes : [];
  const incoming = [
    ...openDeadlines.map(item => ({ ...item, itemType: 'open_deadline' })),
    ...pendingIntimations.map(item => ({ ...item, itemType: 'pending_intimation' }))
  ];
  const seenIds = new Set();
  const counts = { created: 0, updated: 0, inactive: 0, deadlines: 0, intimations: 0 };
  const deadlineMode = state?.settings?.deadlineMode === 'manual' ? 'manual' : 'auto';

  for (const item of incoming) {
    if (!item.processNumber) continue;
    const cnj = String(item.processNumber).replace(/\D/g, '');
    if (cnj.length !== 20) continue;
    const fingerprint = eprocSourceFingerprint(portalId, item);
    const externalId = `eproc:${portalId}:${fingerprint.slice(0, 32)}`;
    seenIds.add(externalId);
    const existing = state.intimations.find(record => record.externalId === externalId || record.id === externalId);
    const sourceReportedDeadlineAt = normalizedSourceDate(item.deadlineAt);
    const sourceReportedAt = normalizedSourceDate(item.sentAt || item.startsAt);
    const snapshot = sourceEvidenceSnapshot(item, collectedAt);
    const priorEvidence = Array.isArray(existing?.sourceEvidence) ? existing.sourceEvidence : [];
    const lastEvidence = priorEvidence.at(-1);
    const evidenceChanged = !lastEvidence
      || lastEvidence.status !== snapshot.status
      || lastEvidence.sourceReportedDeadlineAt !== snapshot.sourceReportedDeadlineAt
      || lastEvidence.sourceReportedAt !== snapshot.sourceReportedAt
      || lastEvidence.sourceText !== snapshot.sourceText;
    const sourceEvidence = evidenceChanged ? [...priorEvidence, snapshot] : priorEvidence;
    const canonical = {
      ...(existing || {}),
      id: existing?.id || externalId,
      externalId,
      processNumber: item.processNumber,
      process: item.processNumber,
      portalId,
      itemType: item.itemType,
      source: 'eproc',
      court: portalLabel,
      event: item.event || (item.itemType === 'open_deadline' ? 'Prazo em aberto' : 'Intimação pendente'),
      title: item.subject || item.event || (item.itemType === 'open_deadline' ? 'Prazo informado pelo eproc' : 'Intimação eproc'),
      description: `${item.subject || item.className || item.event || 'Registro eproc'} — ${item.processDetails || ''}`.trim(),
      sourceText: snapshot.sourceText,
      sourceReportedAt,
      sourceReportedDeadlineAt,
      ...(lastEvidence && String(lastEvidence.sourceReportedDeadlineAt || '') !== String(sourceReportedDeadlineAt || '')
        ? {
            sourceDeadlineChangedAt: collectedAt,
            sourceReportedDeadlinePrevious: String(lastEvidence.sourceReportedDeadlineAt || '')
          }
        : {}),
      ...(deadlineMode === 'auto' && sourceReportedDeadlineAt
        ? { deadline: sourceReportedDeadlineAt, deadlineSource: 'eproc' }
        : {}),
      sourceCollectedAt: collectedAt,
      firstSeenAt: existing?.firstSeenAt || collectedAt,
      lastSeenAt: collectedAt,
      sourceStatus: 'active',
      sourceStatusChangedAt: existing?.sourceStatus === 'active' ? existing.sourceStatusChangedAt || null : collectedAt,
      sourceProvenance: {
        system: 'eproc',
        portalId,
        itemType: item.itemType,
        action: item.sourceAction || null,
        path: item.sourcePath || null
      },
      sourceEvidence,
      date: sourceReportedAt || collectedAt.slice(0, 10),
      publishedAt: sourceReportedAt || collectedAt.slice(0, 10),
      status: existing?.status || 'pendente',
      treatmentStatus: existing?.treatmentStatus || 'untreated',
      unread: existing ? existing.unread : true,
      createdAt: existing?.createdAt || collectedAt,
      updatedAt: collectedAt
    };
    delete canonical.deadlineAt;
    if (existing) {
      Object.assign(existing, canonical);
      counts.updated += 1;
    } else {
      state.intimations.unshift(canonical);
      counts.created += 1;
    }
    if (item.itemType === 'open_deadline') {
      const taskId = `task:eproc-panel:${externalId}`;
      let task = state.tasks.find(candidate => candidate.id === taskId || candidate.externalId === taskId || candidate.sourceIntimationId === canonical.id);
      if (!task) {
        // O portal pode republicar o mesmo ato (suspensão, retificação, nova linha do Painel)
        // com `event`/`sentAt` diferente: o `externalId` muda e, sem este guardião, nasceria
        // uma segunda tarefa para o mesmo prazo — foi assim que duas suspensões deixaram três
        // tarefas no acervo real. A tarefa oficial da família é reaproveitada e atualizada.
        const familyTaskId = findCanonicalSourceTaskId(state.tasks, {
          process: item.processNumber,
          intimations: state.intimations,
          actLabel: sourceActLabel({ intimation: canonical }),
          excludeId: taskId
        });
        if (familyTaskId) task = state.tasks.find(candidate => String(candidate.id) === familyTaskId) || null;
      }
      const generatedTitle = eprocTaskTitle({
        auto: deadlineMode === 'auto',
        subject: item.subject,
        event: item.event
      });
      const generatedDescription = deadlineMode === 'auto'
        ? `${item.sourceText || item.processDetails || 'Registro coletado no Painel do Advogado.'} Prazo informado pelo eproc: ${sourceReportedDeadlineAt || 'não informado'}. Ajuste manualmente quando houver embargos ou particularidade de contagem.`
        : `${item.sourceText || item.processDetails || 'Registro coletado no Painel do Advogado.'} Data informada pela fonte: ${sourceReportedDeadlineAt || 'não informada'}. Confirmação humana obrigatória.`;
      const priorSnapshot = task?.sourceManagedSnapshot;
      const taskUntouched = !task || Boolean(priorSnapshot
        && task.title === priorSnapshot.title
        && task.description === priorSnapshot.description
        && String(task.deadline || '') === String(priorSnapshot.deadline || '')
        && !task.fatalDeadline
        && !task.responsible
        && !task.client
        && !task.notes
        && !(Array.isArray(task.responsibles) && task.responsibles.length)
        && !(Array.isArray(task.timeLogs) && task.timeLogs.length)
        && (task.priority || 'normal') === 'normal'
        && (task.status || 'triagem') === (priorSnapshot.status || 'triagem'));
      const sourceDeadlineValue = String(sourceReportedDeadlineAt || '').trim();
      const deadlineFields = {};
      let deadlineConflictPending = false;
      if (deadlineMode === 'auto' && sourceDeadlineValue) {
        if (task && taskDeadlineOwnership(task) === 'human' && String(task.deadline || '').trim() !== sourceDeadlineValue) {
          // Prazo editado por pessoa nunca é sobrescrito: a divergência vira aviso de
          // conferência (specs/human-deadline-policy.md). O aviso vigente é preservado
          // sem reescrita para não poluir o estado a cada coleta.
          const existingConflict = task.deadlineConflict;
          const sameConflict = existingConflict
            && String(existingConflict.sourceValue || '') === sourceDeadlineValue
            && String(existingConflict.humanValue || '') === String(task.deadline || '').trim();
          if (!sameConflict) {
            deadlineFields.deadlineConflict = {
              source: 'eproc',
              sourceValue: sourceDeadlineValue,
              humanValue: String(task.deadline || '').trim(),
              previousSourceValue: String(task.sourceReportedDeadlineAt || '').trim(),
              at: collectedAt,
              mode: 'auto'
            };
          }
          deadlineConflictPending = true;
        } else {
          deadlineFields.deadline = sourceDeadlineValue;
          deadlineFields.deadlineSource = 'eproc';
        }
      }
      const taskFields = {
        id: task?.id || taskId,
        externalId: task?.externalId || taskId,
        intimationId: canonical.id,
        sourceIntimationId: canonical.id,
        process: item.processNumber,
        source: 'eproc',
        portalId,
        sourceReportedDeadlineAt,
        ...deadlineFields,
        sourceStatus: 'active',
        createdAt: task?.createdAt || collectedAt,
        updatedAt: collectedAt
      };
      if (taskUntouched) Object.assign(taskFields, {
        title: generatedTitle,
        description: generatedDescription,
        client: task?.client || '',
        priority: task?.priority || 'normal',
        status: task?.status || 'triagem',
        active: true,
        sourceManagedSnapshot: { title: generatedTitle, description: generatedDescription, status: task?.status || 'triagem', deadline: deadlineFields.deadline || task?.deadline || '' }
      });
      if (task) {
        Object.assign(task, taskFields);
        if (!deadlineConflictPending) delete task.deadlineConflict;
        if (deadlineFields.deadline) task.sourceDeadlineSyncAt = String(canonical.sourceDeadlineChangedAt || collectedAt);
      } else {
        state.tasks.push(taskFields);
      }
      canonical.taskId = taskFields.id;
      canonical.linkedTaskIds = [...new Set([...(canonical.linkedTaskIds || []), taskFields.id])];
      if (existing) Object.assign(existing, { taskId: canonical.taskId, linkedTaskIds: canonical.linkedTaskIds });
    }
    if (item.itemType === 'open_deadline') counts.deadlines += 1;
    else counts.intimations += 1;

    let linkedProcess = state.processes.find(process => String(process.number || '').replace(/\D/g, '') === cnj);
    if (!linkedProcess) {
      linkedProcess = {
        id: `proc:eproc:${cnj}`,
        number: item.processNumber,
        title: `${item.subject || item.className || 'Processo Judicial'} (${portalLabel})`,
        client: '',
        court: portalLabel,
        actionClass: item.className || 'Classe não informada',
        status: 'ATIVO',
        source: `eproc-${portalId}`,
        tags: ['eproc', 'painel-advogado'],
        createdAt: collectedAt,
        updatedAt: collectedAt
      };
      state.processes.unshift(linkedProcess);
    }
    const targetRecord = existing || canonical;
    applyConfirmedClientLink(targetRecord, {
      client: linkedProcess.client,
      clientName: linkedProcess.clientName || linkedProcess.client,
      contactId: linkedProcess.contactId
    });
    if (!targetRecord.text && snapshot.sourceText) targetRecord.text = snapshot.sourceText;
  }

  for (const itemType of ['open_deadline', 'pending_intimation']) {
    if (collectionStatus?.[itemType]?.collected !== true) continue;
    for (const existing of state.intimations) {
      if (existing.source !== 'eproc' || existing.portalId !== portalId || existing.itemType !== itemType) continue;
      if (seenIds.has(existing.externalId || existing.id) || existing.sourceStatus === 'not_present') continue;
      existing.sourceStatus = 'not_present';
      existing.sourceStatusChangedAt = collectedAt;
      existing.updatedAt = collectedAt;
      existing.sourceEvidence = [...(Array.isArray(existing.sourceEvidence) ? existing.sourceEvidence : []), {
        status: 'not_present',
        collectedAt,
        sourceReportedDeadlineAt: existing.sourceReportedDeadlineAt || null,
        sourceReportedAt: existing.sourceReportedAt || null,
        sourceText: existing.sourceText || ''
      }];
      if (itemType === 'open_deadline') {
        const task = state.tasks.find(candidate => candidate.sourceIntimationId === existing.id || candidate.intimationId === existing.id);
        if (task) {
          task.sourceStatus = 'not_present';
          const snapshot = task.sourceManagedSnapshot;
        const untouched = Boolean(snapshot
          && task.title === snapshot.title
          && task.description === snapshot.description
          && String(task.deadline || '') === String(snapshot.deadline || '')
            && !task.fatalDeadline
            && !task.responsible
            && !task.client
            && !task.notes
            && !(Array.isArray(task.responsibles) && task.responsibles.length)
            && !(Array.isArray(task.timeLogs) && task.timeLogs.length)
            && (task.priority || 'normal') === 'normal'
            && (task.status || 'triagem') === (snapshot.status || 'triagem'));
          if (untouched) task.active = false;
          task.updatedAt = collectedAt;
        }
      }
      counts.inactive += 1;
    }
  }

  // Família de prazo consolidada ao fim da reconciliação: com o prazo já aplicado, a tarefa
  // oficial do ato absorve as repetidas (reversível) — curadoria humana fica preservada.
  const consolidation = applySourceDeadlineTaskConsolidation(state, planSourceDeadlineTaskConsolidation({
    tasks: state.tasks,
    intimations: state.intimations
  }), { actor: 'Sincronização', nowIso: collectedAt });
  counts.consolidated = consolidation.absorbed.length;
  if (consolidation.auditEntries.length > 0) {
    state.audit = [...consolidation.auditEntries, ...(Array.isArray(state.audit) ? state.audit : [])].slice(0, 1000);
  }
  return counts;
}

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(path.dirname(path.dirname(__filename)));
const DATA_DIR = path.join(ROOT, 'data');
const APP_STATE_FILE = path.join(DATA_DIR, 'app-state.json');

function monitoredLawyerNamesFromState(state) {
  const names = new Set();
  const push = value => {
    const clean = String(value || '').trim();
    if (clean.length >= 5) names.add(clean);
  };
  push(state?.settings?.lawyerName);
  for (const term of Array.isArray(state?.terms) ? state.terms : []) {
    if (term?.active === false || String(term?.type || '').toLowerCase() === 'process') continue;
    push(term?.name);
  }
  for (const user of Array.isArray(state?.users) ? state.users : []) push(user?.displayName);
  return [...names];
}

async function cleanStaleProfileLocks(profileDir) {
  try {
    for (const lockFile of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile']) {
      const lockPath = path.join(profileDir, lockFile);
      await rm(lockPath, { force: true }).catch(() => {});
    }
  } catch {}
}

/**
 * Migra chaves de acesso legadas em texto claro para o cofre cifrado do workspace
 * (escopo portal/grau + CNJ) e remove os campos públicos. Nunca descarta uma chave
 * que não pôde ser persistida no cofre.
 */
export async function migrateEprocPlaintextAccessKeys(state, { credentialManager, portalId = '', logger = console } = {}) {
  if (!state || typeof state !== 'object') return { migrated: 0, failed: 0 };
  let migrated = 0;
  let failed = 0;
  for (const proc of Array.isArray(state.processes) ? state.processes : []) {
    if (!proc || typeof proc !== 'object') continue;
    const legacyKey = proc.accessKey || proc.chaveAcesso;
    if (legacyKey) {
      try {
        const saved = await credentialManager?.saveProcessAccessKey?.(proc.number || proc.cnj || '', {
          accessKey: legacyKey,
          userId: WORKSPACE_ACCESS_KEY_OWNER,
          portalId: proc.portalId || portalId
        });
        if (saved?.ok) {
          migrated += 1;
          proc.hasAccessKey = true;
          proc.accessKeyUpdatedAt = proc.accessKeyUpdatedAt || new Date().toISOString();
          delete proc.accessKey;
          delete proc.chaveAcesso;
        } else {
          failed += 1;
        }
      } catch (error) {
        failed += 1;
        logger.warn?.(`[eproc] Não foi possível migrar chave legada para o cofre: ${error.message}`);
      }
    } else if ('accessKey' in proc || 'chaveAcesso' in proc) {
      delete proc.accessKey;
      delete proc.chaveAcesso;
    }
  }
  return { migrated, failed };
}

export async function downloadProcessWithA1({
  cnj,
  portalId = 'tjrs-eproc-1g',
  pfxPath,
  passphrase,
  totpSecret,
  headed = false,
  securityManager,
  credentialManager,
  documentStorage: injectedDocStorage,
  readStateEnvelope,
  saveState,
  maxPieces = 15,
  dependencies = null
}) {
  const deps = dependencies || {};
  const modernizePfxFn = deps.createModernizedPfx || createModernizedPfx;
  const launchBrowserFn = deps.launchPersistentContext || ((directory, options) => chromium.launchPersistentContext(directory, options));
  const openDetailsFn = deps.openEprocProcessDetails || openEprocProcessDetails;
  const extractDetailsFn = deps.extractProcessDetails || extractProcessDetails;
  const downloadDocumentsFn = deps.downloadAndOrganizeProcessDocuments || downloadAndOrganizeProcessDocuments;
  if (!cnj) throw new Error('O número CNJ do processo é obrigatório.');
  const selectedPortal = getEprocPortalById(portalId);
  if (!selectedPortal) throw new Error(`Portal eproc desconhecido: ${portalId}.`);

  // Fail-closed: o download nunca cria nem usa um cofre global por conta própria.
  if (!credentialManager) {
    throw Object.assign(
      new Error('O cofre de credenciais do escritório é obrigatório para o download A1. Nenhuma credencial global foi utilizada.'),
      { statusCode: 412, code: 'EPROC_CREDENTIAL_MANAGER_REQUIRED' }
    );
  }
  const credManager = credentialManager;
  await credManager.init();
  if (path.resolve(credManager.dataDirectory) !== path.resolve(DATA_DIR) && (!readStateEnvelope || !saveState)) {
    throw Object.assign(
      new Error('Estado oficial do workspace é obrigatório junto do cofre do workspace para o download A1.'),
      { statusCode: 412, code: 'EPROC_WORKSPACE_STATE_REQUIRED' }
    );
  }

  const sec = securityManager || new SecurityManager({
    dataDirectory: credManager.dataDirectory || DATA_DIR,
    sessionSecret: process.env.AUTH_SESSION_SECRET,
    encryptionKey: process.env.AUTH_ENCRYPTION_KEY
  });
  if (!securityManager) await sec.init();
  const rawSecrets = await credManager.readRawSecrets();

  // 1. Resolução da credencial: Certificado A1 ou conta do tribunal (usuário/senha + TOTP)
  let certPath = pfxPath || rawSecrets.certificate?.path || (credManager.allowEnvironmentFallback ? process.env.A1_PFX_PATH : null);
  let certPass = passphrase || rawSecrets.certificate?.passphrase || (credManager.allowEnvironmentFallback ? process.env.A1_PFX_PASSPHRASE : null);

  if (certPath && !path.isAbsolute(certPath)) {
    certPath = path.resolve(credManager.dataDirectory || ROOT, certPath);
  }

  const portalCredentials = (typeof credManager.getPortalCredentials === 'function'
    ? await credManager.getPortalCredentials(portalId).catch(() => null)
    : null)
    || rawSecrets.portalCredentials?.[portalId]
    || null;
  const certConfigured = Boolean(certPath);
  const certFileExists = Boolean(certPath && existsSync(certPath));
  const hasUsableCertificate = Boolean(certFileExists && certPass);
  const hasAccountCredentials = Boolean(portalCredentials?.username && portalCredentials?.password);

  if (!hasUsableCertificate && !hasAccountCredentials) {
    if (certConfigured && !certFileExists) {
      throw Object.assign(
        new Error('Certificado Digital A1 não encontrado no caminho configurado do cofre. Vincule novamente o certificado em "Cobertura Judicial".'),
        { statusCode: 412, code: 'A1_CERT_MISSING' }
      );
    }
    if (certFileExists && !certPass) {
      throw Object.assign(
        new Error('Senha do Certificado Digital A1 não configurada no cofre. Vincule novamente o certificado em "Cobertura Judicial".'),
        { statusCode: 412, code: 'A1_PASSPHRASE_MISSING' }
      );
    }
    throw Object.assign(
      new Error('Credencial do tribunal não configurada: Certificado Digital A1 não encontrado e nenhuma conta do tribunal vinculada. Acesse "Cobertura Judicial" e vincule o Certificado A1 ou a conta do tribunal (usuário e senha).'),
      { statusCode: 412, code: 'EPROC_CREDENTIAL_MISSING' }
    );
  }

  if (!hasUsableCertificate) {
    certPath = null;
    certPass = null;
  }

  const authFn = hasUsableCertificate
    ? (deps.authenticateEprocWithCertAndTotp || authenticateEprocWithCertAndTotp)
    : (deps.authenticateEprocWithCredentials || authenticateEprocWithCredentials);

  // 2. Resolução do Segredo TOTP (2FA)
  const activeTotpSecret = selectedPortal.auth?.totp
    ? (totpSecret || await credManager.getPortalTotpSecret(portalId))
    : null;

  if (selectedPortal.auth?.totp && !activeTotpSecret) {
    throw Object.assign(
      new Error(`Segundo fator (2FA TOTP) do ${portalId} não configurado. Acesse o menu "Cobertura Judicial" (Etapa 3) e vincule o QR Code deste portal.`),
      { statusCode: 412, code: 'TOTP_2FA_MISSING' }
    );
  }

  // 3. Gera código TOTP atual
  const totpCode = generateTotp(activeTotpSecret);

  // 4. Moderniza o certificado temporariamente para o Node/Playwright (somente no modo A1)
  const modernCert = hasUsableCertificate
    ? await modernizePfxFn({ pfxPath: certPath, passphrase: certPass })
    : null;

  const scopedDataDir = credManager.dataDirectory || DATA_DIR;
  const profileDir = path.join(scopedDataDir, 'browser-profiles', 'agent-eproc-worker');
  await mkdir(profileDir, { recursive: true });
  await cleanStaleProfileLocks(profileDir);

  const clientOrigins = new Set([new URL(selectedPortal.baseUrl).origin]);
  if (selectedPortal.auth?.mtlsOrigin) clientOrigins.add(selectedPortal.auth.mtlsOrigin);
  const clientCerts = hasUsableCertificate
    ? [...clientOrigins].map(origin => ({
        origin, pfxPath: modernCert.modernPath, passphrase: modernCert.modernPassphrase
      }))
    : [];

    const context = await launchBrowserFn(profileDir, {
      headless: !headed,
      viewport: { width: 1440, height: 960 },
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      acceptDownloads: true,
      clientCertificates: clientCerts.length ? clientCerts : undefined,
      args: ['--renderer-process-limit=1', '--disable-gpu', '--disable-software-rasterizer', '--js-flags=--max-old-space-size=192']
    });

  const page = context.pages()[0] || (await context.newPage());

  try {
    // 5. Autenticação no portal eproc selecionado (A1 ou conta do tribunal)
    const portalLabel = `${selectedPortal.court} ${selectedPortal.level === 2 ? '2G' : '1G'}`;
    const authResult = hasUsableCertificate
      ? await authFn(page, selectedPortal.baseUrl, { totpSecret: activeTotpSecret, portalLabel })
      : await authFn(page, selectedPortal.baseUrl, {
          username: portalCredentials.username,
          password: portalCredentials.password,
          totpSecret: activeTotpSecret,
          portalLabel
        });
    if (!authResult.ok) {
      throw new Error(`Falha na autenticação do eproc ${selectedPortal.name} com ${hasUsableCertificate ? 'o Certificado A1' : 'a conta do tribunal'}${selectedPortal.auth?.totp ? ' e TOTP' : ''}.`);
    }

    // 6. Abre processo no eproc
    await openDetailsFn(page, cnj);
    let lawyerNames = [];
    try {
      if (readStateEnvelope) {
        const lawyerEnvelope = await readStateEnvelope();
        lawyerNames = monitoredLawyerNamesFromState(lawyerEnvelope?.state || lawyerEnvelope);
      }
    } catch {}
    const details = await extractDetailsFn(page, { lawyerNames });
    const clientName = details.clientName || '';

    // 7. Download das peças reais
    const safeClient = (clientName || 'Processos').replace(/[^\w.-]/g, '_');
    const safeCnj = cnj.replace(/[^\w.-]/g, '_');
    const targetDir = path.join(scopedDataDir, 'storage', 'processos', safeClient, safeCnj);

    const downloadResult = await downloadDocumentsFn(page, {
      cnj: details.number || cnj,
      clientName,
      targetBaseDir: targetDir,
      maxPieces: Math.min(Number(maxPieces) || 15, 30)
    });

    // 8. Ingestão Oficial e Criptográfica no ATRIUM
    const docStorage = injectedDocStorage || new EncryptedLocalDocumentStorageProvider({
      dataDirectory: scopedDataDir,
      securityManager: sec
    });
    if (!injectedDocStorage) await docStorage.init();

    let state;
    let envelopeRevision = null;

    if (readStateEnvelope) {
      const envelope = await readStateEnvelope();
      state = structuredClone(envelope?.state || envelope || {});
      envelopeRevision = envelope?.revision || null;
    } else {
      const raw = JSON.parse(await readFile(APP_STATE_FILE, 'utf8'));
      state = JSON.parse(sec.decrypt(raw.encrypted));
      envelopeRevision = raw.revision || raw.updatedAt || null;
    }

    if (!state || typeof state !== 'object') state = {};
    state.processes = Array.isArray(state.processes) ? state.processes : [];
    state.documents = Array.isArray(state.documents) ? state.documents : [];

    const normDigits = cnj.replace(/\D/g, '');
    let proc = state.processes.find(p =>
      (p.number && p.number.replace(/\D/g, '') === normDigits) ||
      (p.id && p.id.replace(/\D/g, '').includes(normDigits))
    );
    const procId = proc ? proc.id : `proc-${normDigits}`;
    const nowIso = new Date().toISOString();

    if (!proc) {
      proc = {
        id: procId,
        number: details.number || cnj,
        client: clientName,
        hasAccessKey: Boolean(details.accessKey),
        accessKeyUpdatedAt: details.accessKey ? nowIso : null,
        clientDocument: details.clientDocument || '',
        clientPosition: details.clientPosition || '',
        opposingParty: details.opposingParty || '',
        opposingPartyDocument: details.opposingPartyDocument || '',
        opposingPosition: details.opposingPosition || '',
        title: `${clientName} — ${details.actionClass || 'Processo Judicial'} (eproc A1)`,
        court: details.court || 'TJRS · eproc 1º grau',
        judge: details.judge || '',
        actionClass: details.actionClass || '',
        competence: details.competence || '',
        caseValue: details.caseValue || '',
        value: details.caseValue || '',
        secrecy: Boolean(details.secrecy),
        secrecyLevel: details.secrecyLevel || '',
        distributionDate: details.distributionDate || '',
        status: details.status || 'ATIVO',
        source: 'eproc-tjrs',
        system: 'eproc',
        movementsCount: details.movementsCount || 0,
        movements: details.movements || [],
        tags: ['eproc', 'tjrs', 'certificado-a1', 'autos-integrais'],
        createdAt: nowIso,
        updatedAt: nowIso
      };
      if (details.secrecy) proc.tags.push('segredo-de-justica');
      if (details.accessKey) proc.tags.push('chave-disponivel');
      state.processes.unshift(proc);
    } else {
      proc.client = clientName || proc.client;
      if (details.clientDocument) proc.clientDocument = details.clientDocument;
      if (details.clientPosition) proc.clientPosition = details.clientPosition;
      if (details.opposingParty) proc.opposingParty = details.opposingParty;
      if (details.opposingPartyDocument) proc.opposingPartyDocument = details.opposingPartyDocument;
      if (details.opposingPosition) proc.opposingPosition = details.opposingPosition;
      if (details.caseValue) {
        proc.caseValue = details.caseValue;
        proc.value = details.caseValue;
      }
      if (details.accessKey) {
        delete proc.accessKey;
        delete proc.chaveAcesso;
        proc.hasAccessKey = true;
        proc.accessKeyUpdatedAt = nowIso;
        if (!Array.isArray(proc.tags)) proc.tags = [];
        if (!proc.tags.includes('chave-disponivel')) proc.tags.push('chave-disponivel');
      }
      reconcileSourceSecrecy(proc, details);
      proc.court = details.court || proc.court;
      proc.judge = details.judge || proc.judge;
      proc.actionClass = details.actionClass || proc.actionClass;
      proc.competence = details.competence || proc.competence;
      proc.movementsCount = details.movementsCount || proc.movementsCount;
      if (Array.isArray(details.movements) && details.movements.length > 0) {
        proc.movements = details.movements;
      }
      proc.lastSyncAt = nowIso;
      proc.updatedAt = nowIso;
    }

    // A chave vive apenas no cofre cifrado do workspace, com escopo portal/grau + CNJ.
    if (details.accessKey) {
      await credManager.saveProcessAccessKey(proc.number, {
        accessKey: details.accessKey,
        userId: WORKSPACE_ACCESS_KEY_OWNER,
        portalId
      });
    }

    // Ingestão das peças baixadas
    let ingestedCount = 0;
    for (const f of downloadResult.files) {
      const fileBinary = await readFile(f.path);
      const { checksum } = await docStorage.put(fileBinary);

      const existingDoc = state.documents.find(
        d => (d.ownerId === procId || d.ownerId === proc.number) && d.name === f.name
      );

      const isIndice = f.type === 'indice';
      const docType = isIndice ? 'Índice de Autos Oficiais' : 'Peça Processual (eproc A1)';

      if (existingDoc) {
        existingDoc.checksum = checksum;
        existingDoc.size = fileBinary.length;
        existingDoc.updatedAt = nowIso;
        existingDoc.documentType = docType;
        existingDoc.metadata = {
          ...(existingDoc.metadata || {}),
          origin: 'eproc TJRS (Certificado A1)',
          localPath: f.path,
          summary: f.name.replace(/\.pdf$/i, ''),
          context: 'Peça oficial extraída dos autos integrais do eproc TJRS via Certificado Digital A1.'
        };
      } else {
        state.documents.push({
          id: `doc-eproc-${randomBytes(6).toString('hex')}`,
          name: f.name,
          originalName: f.name,
          mime: 'application/pdf',
          size: fileBinary.length,
          createdAt: nowIso,
          updatedAt: nowIso,
          documentDate: nowIso.slice(0, 10),
          ownerType: 'process',
          ownerId: procId,
          documentType: docType,
          metadata: {
            origin: 'eproc TJRS (Certificado A1)',
            tags: ['eproc', 'autos', 'tjrs', 'a1', 'peca-oficial'],
            localPath: f.path,
            summary: f.name.replace(/\.pdf$/i, ''),
            context: 'Peça oficial extraída dos autos integrais do eproc TJRS via Certificado Digital A1.'
          },
          derivation: {
            kind: 'eproc-autos-download',
            downloadedAt: nowIso
          },
          deletedAt: null,
          checksum
        });
      }
      ingestedCount++;
    }

    // Registro de Auditoria
    state.audit = Array.isArray(state.audit) ? state.audit : [];
    state.audit.unshift({
      id: `audit-eproc-autos-${randomBytes(6).toString('hex')}`,
      at: nowIso,
      action: 'Autos oficiais baixados (eproc A1)',
      detail: `${cnj} · ${clientName} · ${downloadResult.totalFiles} peça(s) oficial(is) arquivada(s)`,
      actor: 'Certificado A1 / eproc'
    });

    const keyMigration = await migrateEprocPlaintextAccessKeys(state, { credentialManager: credManager, portalId });
    if (keyMigration.failed > 0) {
      console.warn(`[eproc] ${keyMigration.failed} chave(s) legada(s) não puderam ser migradas para o cofre neste download.`);
    }

    // Salva o estado
    let nextRevision = envelopeRevision;
    if (saveState) {
      const savedResult = await saveState(state, envelopeRevision);
      nextRevision = savedResult?.revision || envelopeRevision;
    } else {
      const raw = JSON.parse(await readFile(APP_STATE_FILE, 'utf8'));
      raw.encrypted = sec.encrypt(JSON.stringify(state));
      raw.updatedAt = nowIso;
      raw.revision = (raw.revision || 0) + 1;
      nextRevision = raw.revision;
      await writeFile(APP_STATE_FILE, JSON.stringify(raw, null, 2), 'utf8');
    }

    return {
      ok: true,
      cnj: details.number || cnj,
      client: clientName,
      court: details.court,
      totalFiles: downloadResult.totalFiles,
      piecesCount: ingestedCount,
      documents: state.documents,
      hasAccessKey: Boolean(details.accessKey || proc?.hasAccessKey),
      process: proc,
      processes: state.processes,
      revision: nextRevision
    };
  } finally {
    if (modernCert?.cleanup) await modernCert.cleanup().catch(() => {});
    await context.close().catch(() => {});
  }
}

/**
 * Diretório de perfil persistente do eproc, sempre ancorado no diretório de dados
 * do cofre do workspace. Função pura para permitir teste de isolamento sem Chromium.
 */
export function resolveEprocProfileDir(credentialManager, profileKey = 'agent-eproc-worker') {
  const baseDirectory = credentialManager?.dataDirectory;
  if (!baseDirectory) {
    throw Object.assign(
      new Error('Diretório de dados do cofre é obrigatório para o perfil eproc.'),
      { statusCode: 412, code: 'EPROC_CREDENTIAL_MANAGER_REQUIRED' }
    );
  }
  const safeProfileKey = String(profileKey || 'agent-eproc-worker').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(baseDirectory, 'browser-profiles', safeProfileKey);
}

/**
 * Varredura A1: Desvenda processos com Segredo de Justiça no eproc TJRS,
 * vincula clientes não identificados e preenche dados faltantes (juiz, comarca, vara, classe).
 */
export async function sweepAndEnrichProcessesWithA1({
  portalId = 'tjrs-eproc-1g',
  processNumber,
  securityManager,
  credentialManager,
  readStateEnvelope,
  saveState,
  maxProcesses = 50,
  headed = false,
  onProgress = () => {},
  judicialOperation = 'syncReadOnly',
  profileKey = 'agent-eproc-worker',
  allowUnverified = false,
  dependencies = null
} = {}) {
  const deps = dependencies || {};
  const modernizePfxFn = deps.createModernizedPfx || createModernizedPfx;
  const launchBrowserFn = deps.launchPersistentContext || ((directory, options) => chromium.launchPersistentContext(directory, options));
  const authFn = deps.authenticateEprocWithCertAndTotp || authenticateEprocWithCertAndTotp;
  const credentialsAuthFn = deps.authenticateEprocWithCredentials || authenticateEprocWithCredentials;
  const openDetailsFn = deps.openEprocProcessDetails || openEprocProcessDetails;
  const extractDetailsFn = deps.extractProcessDetails || extractProcessDetails;
  const collectDeadlinesFn = deps.collectEprocDeadlines || collectEprocDeadlines;
  const collectHearingsFn = deps.collectEprocHearings || collectEprocHearings;
    const collectSessionsFn = deps.collectEprocSessions || collectEprocSessions;
  const reportInventoryFn = deps.runEprocProcessReportInventory || runEprocProcessReportInventory;
  assertReadOnlyJudicialOperation(judicialOperation);
  // Fail-closed: a varredura nunca cria um cofre global por conta própria. Sem o gestor
  // de credenciais do workspace do chamador, a operação falha antes de qualquer autenticação.
  if (!credentialManager) {
    throw Object.assign(
      new Error('O cofre de credenciais do escritório é obrigatório para a varredura A1. Nenhuma credencial global foi utilizada.'),
      { statusCode: 412, code: 'EPROC_CREDENTIAL_MANAGER_REQUIRED' }
    );
  }
  await credentialManager.init();
  if (path.resolve(credentialManager.dataDirectory) !== path.resolve(DATA_DIR) && (!readStateEnvelope || !saveState)) {
    throw Object.assign(
      new Error('Estado oficial do workspace é obrigatório junto do cofre do workspace para a varredura A1.'),
      { statusCode: 412, code: 'EPROC_WORKSPACE_STATE_REQUIRED' }
    );
  }

  const sec = securityManager || new SecurityManager({
    dataDirectory: DATA_DIR,
    sessionSecret: process.env.AUTH_SESSION_SECRET,
    encryptionKey: process.env.AUTH_ENCRYPTION_KEY
  });
  if (!securityManager) await sec.init();

  let state;
  let envelopeRevision = null;

  if (readStateEnvelope) {
    const envelope = await readStateEnvelope();
    state = structuredClone(envelope?.state || envelope || {});
    envelopeRevision = envelope?.revision || null;
  } else {
    const raw = JSON.parse(await readFile(APP_STATE_FILE, 'utf8'));
    state = JSON.parse(sec.decrypt(raw.encrypted));
    envelopeRevision = raw.revision || raw.updatedAt || null;
  }

  if (!state || typeof state !== 'object') state = {};
  state.processes = Array.isArray(state.processes) ? state.processes : [];
  state.contacts = Array.isArray(state.contacts) ? state.contacts : [];
  state.audit = Array.isArray(state.audit) ? state.audit : [];
  state.intimations = Array.isArray(state.intimations) ? state.intimations : [];
  state.tasks = Array.isArray(state.tasks) ? state.tasks : [];
  state.events = Array.isArray(state.events) ? state.events : [];

  const portal = getEprocPortalById(portalId);
  if (!portal || (!portal.capabilities?.liveSyncVerified && !allowUnverified)) {
    throw Object.assign(new Error(`Portal eproc sem elegibilidade de sincronização ao vivo: ${portalId}.`), { code: 'EPROC_LIVE_SYNC_UNVERIFIED' });
  }
  const portalLabel = `${portal.court} ${portal.level === 2 ? '2G' : '1G'}`;
  let targets = [];
  let discoverySource = EPROC_DISCOVERY_SOURCE.PANEL_DOM_FALLBACK;
  let reportInventory = null;
  let deferredEnrichmentTargets = [];
  if (processNumber) {
    targets = selectEprocSweepTargets(state.processes, portalId, { processNumber, maxProcesses });
    discoverySource = EPROC_DISCOVERY_SOURCE.TARGET_PROCESS;
  }

  console.log(`[eproc sweep] ${targets.length} processo(s) ${portalLabel} selecionado(s) para enriquecimento cadastral.`);
  onProgress({ determinate: false, progress: null, completed: null, total: null, step: 1, phase: 'connecting', action: `Iniciando comunicação com ${portalLabel}...`, log: `Iniciando comunicação com ${portalLabel}...` });
  onProgress({ determinate: false, progress: null, completed: null, total: null, step: 1, phase: 'connecting', action: 'Conectando canal seguro mTLS (porta 443)...', log: 'Conectando canal seguro mTLS (porta 443)...' });

  // Resolução de credenciais A1 + 2FA no cofre do workspace do chamador
  const credManager = credentialManager;
  await credManager.init();
  const rawSecrets = await credManager.readRawSecrets();

  let certPath = rawSecrets.certificate?.path || (credManager.allowEnvironmentFallback ? process.env.A1_PFX_PATH : null);
  let certPass = rawSecrets.certificate?.passphrase || (credManager.allowEnvironmentFallback ? process.env.A1_PFX_PASSPHRASE : null);

  if (certPath && !path.isAbsolute(certPath)) {
    certPath = path.resolve(credManager.dataDirectory || ROOT, certPath);
  }

  const portalCredentials = (typeof credManager.getPortalCredentials === 'function'
    ? await credManager.getPortalCredentials(portalId).catch(() => null)
    : null)
    || rawSecrets.portalCredentials?.[portalId]
    || null;
  const certConfigured = Boolean(certPath);
  const certFileExists = Boolean(certPath && existsSync(certPath));
  const hasUsableCertificate = Boolean(certFileExists && certPass);
  const hasAccountCredentials = Boolean(portalCredentials?.username && portalCredentials?.password);

  if (!hasUsableCertificate && !hasAccountCredentials) {
    if (certConfigured && !certFileExists) {
      throw Object.assign(
        new Error('Certificado Digital A1 não encontrado no caminho configurado do cofre. Vincule novamente o certificado em "Cobertura Judicial".'),
        { statusCode: 412, code: 'A1_CERT_MISSING' }
      );
    }
    if (certFileExists && !certPass) {
      throw Object.assign(
        new Error('Senha do Certificado Digital A1 não configurada no cofre. Vincule novamente o certificado em "Cobertura Judicial".'),
        { statusCode: 412, code: 'A1_PASSPHRASE_MISSING' }
      );
    }
    throw Object.assign(
      new Error('Credencial do tribunal não configurada: Certificado Digital A1 não encontrado e nenhuma conta do tribunal vinculada. Acesse "Cobertura Judicial" e vincule o Certificado A1 ou a conta do tribunal (usuário e senha).'),
      { statusCode: 412, code: 'EPROC_CREDENTIAL_MISSING' }
    );
  }

  if (!hasUsableCertificate) {
    certPath = null;
    certPass = null;
  }

  const activeTotpSecret = portal.auth?.totp
    ? await credManager.getPortalTotpSecret(portal.id)
    : null;

  if (portal.auth?.totp && !activeTotpSecret) {
    throw Object.assign(
      new Error(`Segundo fator (2FA TOTP) do ${portalLabel} não configurado. Acesse o menu "Cobertura Judicial" (Etapa 3) e vincule o QR Code deste portal.`),
      { statusCode: 412, code: 'TOTP_2FA_MISSING' }
    );
  }

  const modernCert = hasUsableCertificate
    ? await modernizePfxFn({ pfxPath: certPath, passphrase: certPass })
    : null;
  onProgress(hasUsableCertificate
    ? { determinate: false, progress: null, completed: null, total: null, step: 1, phase: 'tls_handshake', action: 'Autenticando sessão com Certificado A1 e 2FA TOTP...', log: 'Certificado Digital A1 validado. Negociando handshake TLS com tribunal.' }
    : { determinate: false, progress: null, completed: null, total: null, step: 1, phase: 'credentials_auth', action: 'Autenticando sessão com a conta do tribunal e 2FA TOTP...', log: 'Conta do tribunal validada. Abrindo sessão autenticada sem certificado.' });

  const profileDir = resolveEprocProfileDir(credManager, profileKey);
  await mkdir(profileDir, { recursive: true });
  await cleanStaleProfileLocks(profileDir);

  const clientOrigins = new Set([new URL(portal.baseUrl).origin]);
  if (portal.auth?.mtlsOrigin) clientOrigins.add(portal.auth.mtlsOrigin);
  if (portal.court === 'TJRS') {
    clientOrigins.add('https://keycloak-httpd-mtls.tjrs.jus.br');
    clientOrigins.add('https://keycloak-eks.tjrs.jus.br');
  }
  const clientCerts = hasUsableCertificate
    ? [...clientOrigins].map(origin => ({
        origin,
        pfxPath: modernCert.modernPath,
        passphrase: modernCert.modernPassphrase
      }))
    : [];

    const context = await launchBrowserFn(profileDir, {
      headless: !headed,
      viewport: { width: 1440, height: 960 },
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      acceptDownloads: true,
      clientCertificates: clientCerts.length ? clientCerts : undefined,
      args: ['--renderer-process-limit=1', '--disable-gpu', '--disable-software-rasterizer', '--js-flags=--max-old-space-size=192']
    });

  const page = context.pages()[0] || (await context.newPage());
  const updatedProcesses = [];
  const collectionErrors = [];
  const collectionWarnings = [];
  let persistenceConflict = false;

  try {
    const targetUrl = portal.baseUrl;
    onProgress({ determinate: false, progress: null, completed: null, total: null, step: 2, phase: 'keycloak_auth', action: `Autenticando em ${portalLabel}...`, log: `Autenticando em ${portalLabel}.` });
    const authResult = hasUsableCertificate
      ? await authFn(page, targetUrl, { totpSecret: activeTotpSecret, portalLabel, onProgress })
      : await credentialsAuthFn(page, targetUrl, {
          username: portalCredentials.username,
          password: portalCredentials.password,
          totpSecret: activeTotpSecret,
          portalLabel,
          onProgress
        });
    if (!authResult.ok) {
      throw new Error(`Falha na autenticação do eproc ${portalLabel} com ${hasUsableCertificate ? 'o Certificado A1' : 'a conta do tribunal'}${portal.auth?.totp ? ' e TOTP' : ''}.`);
    }
    onProgress({ determinate: false, progress: null, completed: null, total: null, step: 3, phase: 'panel_query', action: `Consultando Painel do Advogado ${portalLabel} e intimações pendentes...`, log: `Sessão autorizada pelo tribunal. Acessando Painel do Advogado (${portalLabel}).` });

    const nowIso = new Date().toISOString();
    let newIntimationsCount = 0;
    let deadlinesCollectedCount = 0;
    let pendingIntimationsCollectedCount = 0;
    let sourceRecordsChanged = 0;
    let sourceReconciliation = null;
    let hearingsSeenCount = 0;
    let hearingReconciliation = { created: 0, updated: 0, inactive: 0, unchanged: 0 };
    let sessionsSeenCount = 0;
    let sessionReconciliation = { created: 0, updated: 0, inactive: 0, unchanged: 0 };

    // Coleta intimações e datas informadas pela fonte para triagem humana.
    try {
      console.log(`[eproc sweep] Coletando prazos em aberto e intimações do Painel do Advogado (${portalLabel})...`);
      const eprocDeadlines = await collectDeadlinesFn(page);
      onProgress({ phase: 'auth', authStage: 'panel_opened', timestamp: new Date().toISOString(), step: 3, determinate: false, progress: null, completed: null, total: null, action: 'Painel do Advogado eproc aberto após autenticação.', log: 'Painel do Advogado eproc aberto após autenticação.' });
      const detailedPanelErrors = (eprocDeadlines.collectionErrors || []).map(error => ({
        scope: 'deadlines_and_intimations',
        portalId,
        itemType: error.itemType,
        error: error.error
      }));
      collectionErrors.push(...detailedPanelErrors);
      collectionErrors.push(...getEprocPanelCollectionErrors(eprocDeadlines.collectionStatus, portalId)
        .filter(error => !detailedPanelErrors.some(detailed => detailed.itemType === error.itemType)));
      collectionWarnings.push(...getEprocPanelCollectionWarnings(eprocDeadlines.collectionStatus));
      sourceReconciliation = reconcileEprocSourceItems(state, {
        portalId,
        portalLabel,
        collectedAt: nowIso,
        ...eprocDeadlines
      });
      newIntimationsCount = sourceReconciliation.created;
      deadlinesCollectedCount = sourceReconciliation.deadlines;
      pendingIntimationsCollectedCount = sourceReconciliation.intimations;
      sourceRecordsChanged = sourceReconciliation.created + sourceReconciliation.updated + sourceReconciliation.inactive;

      if (sourceRecordsChanged > 0) {
        console.log(`[eproc sweep] ${sourceRecordsChanged} registro(s) de fonte reconciliado(s) para triagem humana.`);
        state.audit.unshift({
          id: `aud-${Date.now()}-${randomBytes(4).toString('hex')}`,
          at: nowIso,
          action: `Sincronização Painel eproc ${portal.court}`,
          detail: `Painel do Advogado: ${deadlinesCollectedCount} prazo(s) em aberto e ${pendingIntimationsCollectedCount} intimação(ões) pendente(s) reconciliados; nenhum prazo jurídico foi confirmado automaticamente.`,
          actor: 'Certificado Digital A1'
        });
      }
    } catch (intimationErr) {
      console.warn(`[eproc sweep] Aviso na leitura de intimações: ${intimationErr.message}`);
      collectionErrors.push({ scope: 'deadlines_and_intimations', portalId, error: intimationErr.message });
    }

    // Audiências designadas: reconciliadas na Agenda oficial, sem prazo e sem tarefa fatal.
    try {
      const hearingCollection = await collectHearingsFn(page, { portalId });
      hearingsSeenCount = hearingCollection.hearings.length;
      for (const error of hearingCollection.collectionErrors || []) {
        collectionErrors.push({ scope: 'hearings', portalId, itemType: error.itemType, error: error.error });
      }
      if (hearingsSeenCount > 0 || hearingCollection.collectionStatus?.collected === true) {
        hearingReconciliation = reconcileEprocHearings(state, {
          portalId,
          portalLabel,
          collectedAt: nowIso,
          hearings: hearingCollection.hearings,
          collectionStatus: hearingCollection.collectionStatus
        });
        const hearingChanges = hearingReconciliation.created + hearingReconciliation.updated + hearingReconciliation.inactive;
        if (hearingChanges > 0) {
          sourceRecordsChanged += hearingChanges;
          console.log(`[eproc sweep] ${hearingsSeenCount} audiência(s) do Painel reconciliada(s) na Agenda.`);
        }
      }
    } catch (hearingErr) {
      console.warn(`[eproc sweep] Aviso na leitura de audiências: ${hearingErr.message}`);
      collectionErrors.push({ scope: 'hearings', portalId, error: hearingErr.message });
    }

    // Sessões de Julgamento (2º grau): reconciliadas na Agenda; assíncrona guarda o período.
    try {
      const sessionCollection = await collectSessionsFn(page, { portalId });
      sessionsSeenCount = sessionCollection.sessions.length;
      console.log(`[eproc sweep] Sessões de julgamento: ${sessionsSeenCount} lida(s) (descoberta=${sessionCollection.collectionStatus?.discovered === true}, coleta=${sessionCollection.collectionStatus?.collected === true}).`);
      for (const error of sessionCollection.collectionErrors || []) {
        collectionErrors.push({ scope: 'sessions', portalId, itemType: error.itemType, error: error.error });
      }
      if (sessionsSeenCount > 0 || sessionCollection.collectionStatus?.collected === true) {
        sessionReconciliation = reconcileEprocSessions(state, {
          portalId,
          portalLabel,
          collectedAt: nowIso,
          sessions: sessionCollection.sessions,
          collectionStatus: sessionCollection.collectionStatus
        });
        const sessionChanges = sessionReconciliation.created + sessionReconciliation.updated + sessionReconciliation.inactive;
        if (sessionChanges > 0) {
          sourceRecordsChanged += sessionChanges;
          console.log(`[eproc sweep] ${sessionsSeenCount} sessão(ões) de julgamento reconciliada(s) na Agenda.`);
        }
      }
    } catch (sessionErr) {
      console.warn(`[eproc sweep] Aviso na leitura de sessões de julgamento: ${sessionErr.message}`);
      collectionErrors.push({ scope: 'sessions', portalId, error: sessionErr.message });
    }

    if (!processNumber) {
      reportInventory = await reportInventoryFn({
        page,
        portalId,
        state,
        snapshotStore: new EprocReportSnapshotStore({ dataDirectory: credManager.dataDirectory || DATA_DIR, securityManager: sec }),
        collectedAt: nowIso,
        onProgress
      });
      if (reportInventory.ok) {
        if (reportInventory.snapshotError) {
          collectionErrors.push({ scope: 'process_report_snapshot', portalId, error: reportInventory.snapshotError });
        }
        discoverySource = EPROC_DISCOVERY_SOURCE.REPORT_XLS;
        const selection = selectEprocReportEnrichmentTargets(reportInventory.delta, { maxProcesses });
        targets = selection.selected
          .map(record => state.processes.find(proc => digitsOnly(proc.number || proc.cnj) === digitsOnly(record.cnj)))
          .filter(Boolean);
        deferredEnrichmentTargets = selection.deferred.map(record => record.number || record.cnj);
      } else {
        collectionErrors.push({
          scope: 'process_report',
          portalId,
          code: reportInventory.code || null,
          error: `Relatório de Processos não pôde ser obtido: ${reportInventory.error}`
        });
        discoverySource = EPROC_DISCOVERY_SOURCE.PANEL_DOM_FALLBACK;
        targets = selectEprocSweepTargets(state.processes, portalId, { maxProcesses });
      }
    }

    onProgress({
      ...buildEprocProgress(0, targets.length),
      step: 4,
      phase: 'process_sweep_start',
      action: targets.length > 0
        ? `Iniciando enriquecimento de ${targets.length} processo(s) novo(s)/atualizado(s)...`
        : 'Nenhum processo novo ou atualizado exige enriquecimento nesta execução.',
      log: discoverySource === EPROC_DISCOVERY_SOURCE.REPORT_XLS
        ? `Relatório oficial de processos processado; ${targets.length} processo(s) seguirão para enriquecimento nesta execução.`
        : 'Painel do Advogado consultado como fallback. Selecionando processos com cadastro incompleto.'
    });

    let completedTargets = 0;
    for (const [targetIndex, proc] of targets.entries()) {
      const processErrorStart = collectionErrors.length;
      try {
        console.log(`[eproc sweep] Varrendo processo: ${proc.number}`);
        onProgress({
          ...buildEprocProgress(completedTargets, targets.length),
          step: 4,
          phase: 'processing_processes',
          action: `Varrendo processo ${proc.number} (${targetIndex + 1} de ${targets.length})...`,
          log: `[eproc sweep] Varrendo processo: ${proc.number}`
        });
        await page.waitForTimeout(1_500); // Cadência conservadora
        await openDetailsFn(page, proc.number);
        const details = await extractDetailsFn(page, { lawyerNames: monitoredLawyerNamesFromState(state) });

        let modified = false;

        const isClientMissingOrGeneric = isMissingOrGenericClient(proc.client) || Boolean(proc.secrecy);

        const canAutoAssignClient = details.clientPoleConfirmed === true;
        if (details.clientName && canAutoAssignClient && !/^(?:cliente\s+)?(?:geral|modelo|do\s+escrit[oó]rio)$/i.test(details.clientName)) {
          if (isClientMissingOrGeneric || !proc.client) {
            proc.client = details.clientName;
            modified = true;
          }
        }

        const publicationClient = isMissingOrGenericClient(proc.client) ? '' : String(proc.client).replace(/\s+/g, ' ').trim();
        const publicationClientLink = { client: publicationClient, clientName: publicationClient, contactId: proc.contactId || '' };
        if (publicationClient) backfillEprocPublicationClient(state, proc, publicationClientLink);

        if (details.clientDocument && (!proc.clientDocument || proc.clientDocument !== details.clientDocument)) {
          proc.clientDocument = details.clientDocument;
          modified = true;
        }

        if (details.clientPosition && (!proc.clientPosition || proc.clientPosition !== details.clientPosition)) {
          proc.clientPosition = details.clientPosition;
          modified = true;
        }

        if (details.opposingParty && !proc.opposingParty) {
          proc.opposingParty = details.opposingParty;
          modified = true;
        }

        if (details.opposingPartyDocument && !proc.opposingPartyDocument) {
          proc.opposingPartyDocument = details.opposingPartyDocument;
          modified = true;
        }

        if (details.opposingPosition && (!proc.opposingPosition || proc.opposingPosition !== details.opposingPosition)) {
          proc.opposingPosition = details.opposingPosition;
          modified = true;
        }

        if (details.caseValue && (!proc.caseValue || proc.caseValue !== details.caseValue)) {
          proc.caseValue = details.caseValue;
          proc.value = details.caseValue;
          modified = true;
        }

        const sourceAccessKey = typeof details.accessKey === 'string' ? details.accessKey.trim() : '';
        let vaultHasKey = true;
        if (!sourceAccessKey && proc.hasAccessKey === true) {
          try {
            vaultHasKey = typeof credManager.hasAnyProcessAccessKey === 'function'
              ? await credManager.hasAnyProcessAccessKey(proc.number)
              : true;
          } catch {
            vaultHasKey = true;
          }
        }
        if (reconcileSourceAccessKey(proc, details, { vaultHasKey })) {
          modified = true;
        }
        if (sourceAccessKey) {
          // A chave vive apenas no cofre cifrado do workspace, com escopo portal/grau + CNJ.
          try {
            await credManager.saveProcessAccessKey(proc.number, {
              accessKey: sourceAccessKey,
              userId: WORKSPACE_ACCESS_KEY_OWNER,
              portalId
            });
          } catch (err) {
            console.warn(`[eproc sweep] Erro ao salvar chave no cofre do workspace: ${err.message}`);
            collectionErrors.push({ scope: 'credential_persistence', processNumber: proc.number, error: err.message });
          }
        }

        if (reconcileSourceSecrecy(proc, details)) {
          modified = true;
        }

        if (details.judge && (!proc.judge || proc.judge !== details.judge)) {
          proc.judge = details.judge;
          modified = true;
        }

        if (details.court && (!proc.court || proc.court.length < details.court.length)) {
          proc.court = details.court;
          modified = true;
        }

        if (details.actionClass && (!proc.actionClass || proc.actionClass !== details.actionClass)) {
          proc.actionClass = details.actionClass;
          modified = true;
        }

        if (details.competence && (!proc.competence || proc.competence !== details.competence)) {
          proc.competence = details.competence;
          modified = true;
        }

        if (details.distributionDate && !proc.distributionDate) {
          proc.distributionDate = details.distributionDate;
          modified = true;
        }

        if (details.status && (!proc.status || proc.status === 'ATIVO')) {
          proc.status = details.status;
          modified = true;
        }

        if (details.movementsCount && details.movementsCount > (proc.movementsCount || 0)) {
          proc.movementsCount = details.movementsCount;
          if (Array.isArray(details.movements) && details.movements.length > 0) {
            proc.movements = details.movements;
          }
          modified = true;
        }

        // Only a successful detail read with the access key and the core
        // cover fields is completion evidence. The legacy varredura-a1 tag is
        // intentionally insufficient because it can be written for a partial
        // detail update (especially for restricted cases).
        if (recordEprocEnrichmentCompletion(proc, details, {
          portalId, collectedAt: nowIso, hasErrors: collectionErrors.length !== processErrorStart
        })) modified = true;

        if (modified) {
          proc.title = `${proc.client} — ${proc.actionClass || 'Processo Judicial'} (${portalLabel})`;
          proc.lastSyncAt = nowIso;
          proc.updatedAt = nowIso;
          if (!Array.isArray(proc.tags)) proc.tags = [];
          if (!proc.tags.includes('eproc')) proc.tags.push('eproc');
          if (!proc.tags.includes('tjrs')) proc.tags.push('tjrs');
          if (!proc.tags.includes('varredura-a1')) proc.tags.push('varredura-a1');
          if (details.accessKey && !proc.tags.includes('chave-disponivel')) proc.tags.push('chave-disponivel');
          if (details.secrecy && !proc.tags.includes('segredo-de-justica')) proc.tags.push('segredo-de-justica');

          // Reconcilia contatos do cliente
          if (proc.client && proc.client !== 'SIGILO' && !proc.client.includes('Geral')) {
            const normClient = normalizedClientIdentity(proc.client);
            let contact = state.contacts.find(c => normalizedClientIdentity(c.name) === normClient);
            if (!contact) {
              contact = {
                id: `contact:eproc-a1:${Date.now()}-${randomBytes(4).toString('hex')}`,
                name: proc.client,
                contactRole: 'cliente',
                document: details.clientDocument || '',
                cpf: details.clientDocument || '',
                source: `eproc ${portalLabel} (Varredura Certificado A1)`,
                relatedProcessNumbers: [proc.number],
                registeredAt: nowIso.slice(0, 10),
                collectedAt: nowIso
              };
              state.contacts.push(contact);
            } else {
              contact.relatedProcessNumbers = Array.isArray(contact.relatedProcessNumbers) ? contact.relatedProcessNumbers : [];
              if (!contact.relatedProcessNumbers.includes(proc.number)) {
                contact.relatedProcessNumbers.push(proc.number);
              }
              if (details.clientDocument && !contact.document) {
                contact.document = details.clientDocument;
                contact.cpf = details.clientDocument;
              }
            }
            proc.contactId = contact.id;
          }
          if (publicationClient) backfillEprocPublicationClient(state, proc, {
            client: publicationClient,
            clientName: publicationClient,
            contactId: proc.contactId || ''
          });

          // Reconcilia parte contrária (adversa)
          if (details.opposingParty) {
            const normOpp = normalizedClientIdentity(details.opposingParty);
            let oppContact = state.contacts.find(c => normalizedClientIdentity(c.name) === normOpp);
            if (!oppContact) {
              oppContact = {
                id: `contact:eproc-adverso:${Date.now()}-${randomBytes(4).toString('hex')}`,
                name: details.opposingParty,
                contactRole: 'adverso',
                document: details.opposingPartyDocument || '',
                cpf: details.opposingPartyDocument || '',
                source: `eproc ${portalLabel} (Varredura Certificado A1)`,
                relatedProcessNumbers: [proc.number],
                registeredAt: nowIso.slice(0, 10),
                collectedAt: nowIso
              };
              state.contacts.push(oppContact);
            } else {
              oppContact.relatedProcessNumbers = Array.isArray(oppContact.relatedProcessNumbers) ? oppContact.relatedProcessNumbers : [];
              if (!oppContact.relatedProcessNumbers.includes(proc.number)) {
                oppContact.relatedProcessNumbers.push(proc.number);
              }
              if (details.opposingPartyDocument && !oppContact.document) {
                oppContact.document = details.opposingPartyDocument;
                oppContact.cpf = details.opposingPartyDocument;
              }
            }
          }

          // Auditoria
          state.audit.unshift({
            id: `aud-${Date.now()}-${randomBytes(4).toString('hex')}`,
            at: nowIso,
            action: `Varredura A1 ${portalLabel}`,
            detail: `Processo ${proc.number} enriquecido: cliente "${proc.client}" (${proc.clientDocument || 'sem doc'}), parte contrária "${proc.opposingParty || '—'}" (${proc.opposingPartyDocument || '—'}), chave protegida no cofre local, valor "${proc.caseValue || '—'}"`,
            actor: 'Certificado Digital A1'
          });

          updatedProcesses.push({
            number: proc.number,
            client: proc.client,
            clientDocument: proc.clientDocument,
            opposingParty: proc.opposingParty,
            opposingPartyDocument: proc.opposingPartyDocument,
            judge: proc.judge,
            court: proc.court,
            actionClass: proc.actionClass,
            caseValue: proc.caseValue,
            hasAccessKey: Boolean(proc.hasAccessKey),
            enrichmentStatus: proc.enrichmentStatus || null,
            eprocEnrichmentCompletedAt: proc.eprocEnrichmentCompletedAt || null
          });

          // Persistência incremental por processo enriquecido
          if (saveState && !persistenceConflict) {
            try {
              const saved = await saveState(state, envelopeRevision);
              if (saved?.revision) envelopeRevision = saved.revision;
            } catch (saveErr) {
              console.warn(`[eproc sweep] Aviso ao persistir processo ${proc.number}: ${saveErr.message}`);
              // Conflito de revisão significa que outro fluxo do próprio escritório gravou
              // antes: os dados permanecem íntegros e a coleta é retomada no próximo ciclo.
              if (isRevisionConflictError(saveErr)) {
                persistenceConflict = true;
                collectionWarnings.push('Persistência adiada por edição concorrente do escritório; as gravações deste ciclo foram suspensas para preservar a edição mais recente e o pendente será reprocessado no próximo ciclo.');
              } else {
                collectionErrors.push({ scope: 'persistence', processNumber: proc.number, error: saveErr.message });
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[eproc sweep] Erro ao varrer processo ${proc.number}: ${err.message}`);
        if (proc && proc.enrichmentStatus !== 'COMPLETE') proc.enrichmentStatus = 'RETRYABLE_ERROR';
        collectionErrors.push({ scope: 'process', processNumber: proc.number, error: err.message });
      }
      completedTargets += 1;
      onProgress({
        ...buildEprocProgress(completedTargets, targets.length),
        step: 4,
        phase: 'processing_processes',
        action: `Processamento concluído para ${completedTargets} de ${targets.length} processo(s).`
      });
    }

    // Salva o estado final consolidado
    onProgress({
      determinate: false,
      progress: null,
      completed: null,
      total: null,
      step: 5,
      phase: 'consolidating',
      action: 'Consolidando intimações e dados processuais consultados...',
      log: 'Coleta de autos e chaves de acesso concluída. Consolidando dados de leitura.'
    });
    const keyMigration = await migrateEprocPlaintextAccessKeys(state, { credentialManager: credManager, portalId });
    if (keyMigration.failed > 0) {
      collectionErrors.push({
        scope: 'credential_persistence',
        error: `${keyMigration.failed} chave(s) legada(s) em texto claro não puderam ser migradas para o cofre.`
      });
    }
    // A fonte do portal no Painel de Monitoramento passa a refletir o pipeline oficial,
    // substituindo estados legados (coletor gerenciado) por evidência real da execução.
    const hasErrors = collectionErrors.length > 0;
    const deadlineMode = state?.settings?.deadlineMode === 'manual' ? 'manual' : 'auto';
    const deadlineSummary = deadlineMode === 'auto' ? 'prazos informados pela fonte aplicados automaticamente' : 'prazos informados pela fonte aguardam confirmação humana';
    const portalKeyCandidates = new Set(
      getPortalCredentialKeyCandidates(portalId).map(key => String(key || '').toLowerCase())
    );
    const previousSource = (Array.isArray(state.sources) ? state.sources : [])
      .find(source => portalKeyCandidates.has(String(source?.id || '').toLowerCase()));
    const sourceDetail = hasErrors
      ? `Relatório oficial com ${collectionErrors.length} erro(s) registrados; ${deadlineSummary}.`
      : `Relatório oficial: ${reportInventory?.delta?.totalIncoming ?? 0} processo(s) na carteira · ${updatedProcesses.length} enriquecido(s) · ${deadlinesCollectedCount} prazo(s) em aberto · ${pendingIntimationsCollectedCount} intimação(ões) pendente(s).`;
    const sourceEntry = {
      ...(previousSource || {}),
      id: previousSource?.id || portalId,
      name: previousSource?.name || `eproc ${portalLabel}`,
      short: previousSource?.short || portal.court,
      method: 'Relatório oficial + Painel do Advogado (A1 + 2FA)',
      status: hasErrors ? 'attention' : 'ok',
      lastCheck: nowIso,
      detail: `${sourceDetail}${collectionWarnings.length ? ` ${collectionWarnings.join(' ')}` : ''}`
    };
    const remainingSources = (Array.isArray(state.sources) ? state.sources : [])
      .filter(source => !portalKeyCandidates.has(String(source?.id || '').toLowerCase()));
    if (authResult?.ok) {
      // A fonte A1 reflete a autenticação real do pipeline oficial no cofre do workspace.
      for (let index = remainingSources.length - 1; index >= 0; index -= 1) {
        if (String(remainingSources[index]?.id || '').toLowerCase() === 'a1') remainingSources.splice(index, 1);
      }
      remainingSources.push({
        id: 'a1',
        name: 'Portais com certificado A1 / PJe',
        short: 'A1',
        method: 'Certificado A1 (cofre do workspace) + 2FA TOTP',
        status: 'ok',
        lastCheck: nowIso,
        detail: `Autenticação confirmada em ${portalLabel} com o certificado do cofre; sessões permanecem isoladas por portal.`
      });
    }
    state.sources = [...remainingSources, sourceEntry].slice(0, 200);

    let nextRevision = envelopeRevision;
    const reportInventoryChanged = reportInventory?.ok
      ? (reportInventory.merge?.created || 0) + (reportInventory.merge?.updated || 0)
      : 0;
    const sourceChanged = !previousSource
      || previousSource.status !== sourceEntry.status
      || previousSource.detail !== sourceEntry.detail
      || previousSource.method !== sourceEntry.method;
    if ((updatedProcesses.length > 0 || sourceRecordsChanged > 0 || reportInventoryChanged > 0 || sourceChanged) && !persistenceConflict) {
      state.audit = state.audit.slice(0, 1000);
      if (saveState) {
        const savedResult = await saveState(state, envelopeRevision).catch(err => {
          console.warn(`[eproc sweep] Aviso no save final: ${err.message}`);
          if (isRevisionConflictError(err)) {
            collectionWarnings.push('Consolidação final adiada por edição concorrente do escritório; os dados parciais permanecem íntegros e o ciclo seguinte reprocessa o pendente.');
          } else {
            collectionErrors.push({ scope: 'persistence', error: err.message });
          }
          return null;
        });
        nextRevision = savedResult?.revision || envelopeRevision;
      } else {
        const raw = JSON.parse(await readFile(APP_STATE_FILE, 'utf8'));
        raw.encrypted = sec.encrypt(JSON.stringify(state));
        raw.updatedAt = new Date().toISOString();
        raw.revision = (raw.revision || 0) + 1;
        nextRevision = raw.revision;
        await writeFile(APP_STATE_FILE, JSON.stringify(raw, null, 2), 'utf8');
      }
    }

    const collectedSourceItems = deadlinesCollectedCount + pendingIntimationsCollectedCount;
    const warningSummary = collectionWarnings.length > 0 ? ` Avisos: ${collectionWarnings.join(' ')}` : '';
    const reportSummary = reportInventory?.ok
      ? `Relatório de Processos: ${reportInventory.delta?.newCount || 0} novo(s), ${reportInventory.delta?.updatedCount || 0} atualizado(s), ${reportInventory.delta?.unchangedCount || 0} inalterado(s), ${reportInventory.delta?.inactiveCount || 0} ausente(s).`
      : null;
    const completionMsg = hasErrors
      ? `Sincronização eproc concluída parcialmente: ${collectedSourceItems} registro(s) do Painel para triagem e ${updatedProcesses.length} processo(s) enriquecido(s), com ${collectionErrors.length} erro(s) real(is).`
      : `Sincronização eproc concluída: ${collectedSourceItems} registro(s) do Painel para triagem e ${updatedProcesses.length} processo(s) enriquecido(s); ${deadlineSummary}.${reportSummary ? ` ${reportSummary}` : ''}${warningSummary}`;
    onProgress({
      determinate: !hasErrors,
      progress: hasErrors ? null : 100,
      completed: hasErrors ? null : targets.length,
      total: hasErrors ? null : targets.length,
      step: 5,
      phase: hasErrors ? 'partial_error' : 'completed',
      action: hasErrors ? 'Sincronização concluída parcialmente, com erros.' : 'Sincronização concluída com sucesso!',
      log: completionMsg
    });

    return {
      ok: !hasErrors,
      partial: hasErrors && (updatedProcesses.length > 0 || sourceRecordsChanged > 0 || reportInventoryChanged > 0),
      error: hasErrors ? `${collectionErrors.length} erro(s) durante a coleta eproc.` : null,
      errors: collectionErrors,
      discoverySource,
      reportStatus: reportInventory?.status || null,
      reportDelta: reportInventory?.ok ? {
        totalIncoming: reportInventory.delta?.totalIncoming || 0,
        newCount: reportInventory.delta?.newCount || 0,
        updatedCount: reportInventory.delta?.updatedCount || 0,
        unchangedCount: reportInventory.delta?.unchangedCount || 0,
        inactiveCount: reportInventory.delta?.inactiveCount || 0,
        pendingBacklogCount: reportInventory.delta?.pendingBacklogCount || 0,
        legacySecrecyReviewCount: reportInventory.delta?.legacySecrecyReviewCount || 0
      } : null,
      deferredEnrichmentCount: deferredEnrichmentTargets.length,
      sweptCount: targets.length,
      enrichedCount: updatedProcesses.length,
      newIntimationsCount,
      deadlinesCollectedCount,
      pendingIntimationsCollectedCount,
      hearingsCount: hearingsSeenCount,
      hearingsCreated: hearingReconciliation.created,
      hearingsUpdated: hearingReconciliation.updated,
      hearingsInactive: hearingReconciliation.inactive,
      sessionsCount: sessionsSeenCount,
      sessionsCreated: sessionReconciliation.created,
      sessionsUpdated: sessionReconciliation.updated,
      sessionsInactive: sessionReconciliation.inactive,
      sourceRecordsChanged,
      sourceReconciliation,
      warnings: collectionWarnings,
      newTasksCount: 0,
      updatedProcesses,
      revision: nextRevision,
      message: completionMsg
    };
  } finally {
    if (modernCert?.cleanup) await modernCert.cleanup().catch(() => {});
    await context.close().catch(() => {});
  }
}

