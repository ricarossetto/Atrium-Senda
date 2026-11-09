/**
 * ATRIUM — Projeção PJe → Publicações (intimações oficiais).
 *
 * Módulo puro: converte as comunicações persistidas (`state.communications`, origem PJe)
 * em itens de intimação para `state.intimations`, o acervo que Publicações lê.
 *
 * Contrato:
 * - Somente comunicações com CNJ de 20 dígitos são projetadas; sem CNJ válido não há
 *   intimation (nunca inventa processo).
 * - A identidade (`externalId`) é estável por portal + expediente da fonte; a mesma
 *   comunicação nunca gera dois itens em sincronizações repetidas.
 * - A data exibida (`sourceReportedAt`) é a informada na listagem do portal; ausente,
 *   a projeção não inventa data.
 * - Prazo: `sourceReportedDeadlineAt` acompanha a autoridade já existente da fonte
 *   (`sourceReportedDeadlineSource: 'pje'`); a projeção NUNCA calcula nem infere prazo,
 *   nunca cria `fatalDeadline` e nunca abre ciência.
 * - Tratamento: entra como `untreated`/`unread`; o upsert oficial preserva tratamento,
 *   leitura, tarefas e prazos humanos já existentes.
 * - `communication.status` (fluxo da comunicação) jamais vira `treatmentStatus`.
 */
import { mergeExternalIntimations } from '../../../publications/intimation-merge.mjs';

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function projectPjeCommunicationToIntimation(communication, { now = new Date().toISOString() } = {}) {
  if (!communication || communication.deletedAt) return null;
  const cnj = digits(communication.processNumber);
  if (cnj.length !== 20) return null;
  const sourceCommunicationId = String(communication.sourceCommunicationId || '').trim();
  if (!sourceCommunicationId) return null;
  const portalId = String(communication.portalId || '').trim();
  const externalId = `pje:${portalId || 'portal'}:${sourceCommunicationId}`;
  const situation = (Array.isArray(communication.situationMemberships) ? communication.situationMemberships : [])[0] || '';
  const summary = String(communication.summary || '').trim();
  const observedAt = communication.lastSeenAt || communication.firstSeenAt || now;
  return {
    id: externalId,
    externalId,
    type: 'pje',
    source: 'pje',
    portalId,
    sourcePortal: portalId,
    process: cnj,
    processNumber: cnj,
    court: communication.portalName || communication.courtUnit || '',
    courtUnit: communication.courtUnit || '',
    title: situation || 'Intimação PJe',
    event: situation,
    description: summary,
    text: summary,
    sourceReportedAt: communication.sourceReportedAt || '',
    sourceReportedDeadlineAt: communication.sourceReportedDeadlineAt || '',
    sourceReportedDeadlineSource: communication.sourceReportedDeadlineAt ? 'pje' : '',
    sourceCollectedAt: communication.firstSeenAt || now,
    sourceProvenance: { system: 'pje', portalId, itemType: 'expediente', sourceCommunicationId },
    treatmentStatus: 'untreated',
    unread: true,
    status: 'active',
    firstSeenAt: communication.firstSeenAt || now,
    lastSeenAt: observedAt,
    createdAt: communication.firstSeenAt || now,
    updatedAt: now
  };
}

export function projectPjeCommunicationsToIntimations(state, { now = new Date().toISOString() } = {}) {
  const communications = Array.isArray(state?.communications) ? state.communications : [];
  const projected = [];
  for (const communication of communications) {
    const item = projectPjeCommunicationToIntimation(communication, { now });
    if (item) projected.push(item);
  }
  return projected;
}

export function mergeProjectedPjeIntimations(currentIntimations = [], projected = []) {
  const known = new Set(
    (Array.isArray(currentIntimations) ? currentIntimations : [])
      .map(item => String(item?.externalId ?? item?.id ?? ''))
      .filter(Boolean)
  );
  let pjeIntimationsCreated = 0;
  let pjeIntimationsUpdated = 0;
  for (const item of projected) {
    if (known.has(String(item?.externalId ?? item?.id ?? ''))) pjeIntimationsUpdated += 1;
    else pjeIntimationsCreated += 1;
  }
  return {
    intimations: mergeExternalIntimations(currentIntimations, projected),
    counters: { pjeIntimationsCreated, pjeIntimationsUpdated }
  };
}
