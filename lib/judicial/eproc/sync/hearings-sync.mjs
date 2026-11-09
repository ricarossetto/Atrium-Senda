/**
 * ATRIUM Sovereign Judicial Connectivity — Eproc hearings reconciliation
 *
 * Converte audiências lidas do Painel do Advogado em eventos oficiais da Agenda.
 * Regras:
 * - identidade externa estável por portal + CNJ + data/hora + tipo (idempotência);
 * - nenhuma audiência cria prazo, tarefa fatal ou ato processual;
 * - ausência só é marcada como `not_present` quando a listagem foi reconhecida e
 *   totalmente coletada;
 * - eventos manuais ou de outras fontes nunca são tocados.
 */

import { createHash } from 'node:crypto';

export function hearingExternalId(portalId, hearing) {
  const identity = [
    portalId,
    String(hearing?.cnj || '').replace(/\D/g, ''),
    String(hearing?.scheduledAt || `${hearing?.hearingDate || ''} ${hearing?.hearingTime || ''}`).trim(),
    String(hearing?.hearingType || '').trim().toLowerCase()
  ].join('|');
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 32);
  return `eproc:${portalId}:hearing:${digest}`;
}

function hearingTitle(hearing) {
  const type = String(hearing?.hearingType || 'AUDIÊNCIA').trim();
  return `Audiência ${type} — ${hearing?.processNumber || hearing?.cnj || ''}`.trim();
}

export function reconcileEprocHearings(state, {
  portalId,
  portalLabel = 'eproc',
  collectedAt,
  hearings = [],
  collectionStatus = {}
} = {}) {
  if (!state || typeof state !== 'object') throw new Error('Estado oficial é obrigatório para reconciliar audiências do eproc.');
  state.agenda = Array.isArray(state.agenda) ? state.agenda : [];
  const counts = { created: 0, updated: 0, inactive: 0, unchanged: 0 };
  const seenIds = new Set();
  const seenProcessTypes = new Set();

  for (const hearing of hearings) {
    const cnj = String(hearing?.cnj || '').replace(/\D/g, '');
    if (cnj.length !== 20) continue;
    const processType = `${cnj}|${String(hearing?.hearingType || '').trim().toLowerCase()}`;
    seenProcessTypes.add(processType);
    if (!hearing?.scheduledAt) continue;
    const externalId = hearingExternalId(portalId, hearing);
    seenIds.add(externalId);
    const existing = state.agenda.find(event => event.externalId === externalId || event.id === externalId);

    const date = String(hearing.scheduledAt).slice(0, 10);
    const time = String(hearing.scheduledAt).slice(11, 16);
    const canonical = {
      ...(existing || {}),
      id: existing?.id || externalId,
      externalId,
      title: hearingTitle(hearing),
      date,
      time,
      scheduledAt: hearing.scheduledAt,
      source: `eproc ${portalLabel}`,
      sourcePortalId: portalId,
      process: hearing.processNumber || cnj,
      processNumber: hearing.processNumber || cnj,
      client: existing?.client || '',
      location: hearing.judicialUnit || hearing.modality || '',
      modality: hearing.modality || '',
      hearingType: hearing.hearingType || '',
      status: hearing.status || 'DESIGNADA',
      description: String(hearing.notes || '').slice(0, 1000),
      readOnly: true,
      sourceStatus: 'active',
      sourceStatusChangedAt: existing?.sourceStatus === 'active' ? existing.sourceStatusChangedAt || null : collectedAt,
      firstSeenAt: existing?.firstSeenAt || collectedAt,
      lastSeenAt: collectedAt,
      importedAt: existing?.importedAt || collectedAt,
      updatedAt: collectedAt
    };
    delete canonical.deadline;
    delete canonical.fatalDeadline;
    delete canonical.taskId;

    if (!existing) {
      state.agenda.unshift(canonical);
      counts.created += 1;
      continue;
    }

    const changed = existing.date !== canonical.date
      || existing.time !== canonical.time
      || existing.status !== canonical.status
      || existing.hearingType !== canonical.hearingType
      || existing.location !== canonical.location
      || existing.description !== canonical.description
      || existing.sourceStatus !== 'active';
    Object.assign(existing, canonical);
    if (changed) counts.updated += 1;
    else counts.unchanged += 1;
  }

  if (collectionStatus?.collected === true) {
    for (const event of state.agenda) {
      if (event.sourcePortalId !== portalId || event.sourceStatus !== 'active') continue;
      if (seenIds.has(event.externalId || event.id)) continue;
      // Linha reconhecida porém sem data/hora parseável continua sendo presença na fonte.
      const eventType = `${String(event.process || event.processNumber || '').replace(/\D/g, '')}|${String(event.hearingType || '').trim().toLowerCase()}`;
      if (seenProcessTypes.has(eventType)) continue;
      event.sourceStatus = 'not_present';
      event.status = event.status || 'DESIGNADA';
      event.active = false;
      event.sourceStatusChangedAt = collectedAt;
      event.updatedAt = collectedAt;
      counts.inactive += 1;
    }
  }

  return counts;
}
