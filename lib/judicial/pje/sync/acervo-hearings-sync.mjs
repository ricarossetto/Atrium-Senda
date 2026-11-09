/**
 * ATRIUM — Audiências do Acervo Geral do PJe-JT na Agenda.
 *
 * Regras:
 * - a audiência vem da coluna "Data da Audiência" do Acervo Geral, dado da fonte;
 * - nunca cria prazo, tarefa, ciência ou ato processual;
 * - remarcação atualiza o evento futuro do mesmo processo, sem criar duplicata;
 * - ausência só desativa evento futuro, e só com o Acervo lido por inteiro: o portal
 *   deixa de mostrar a audiência depois que ela acontece, e o histórico deve ficar;
 * - eventos manuais ou de outras fontes nunca são tocados.
 */

import { createHash } from 'node:crypto';

const SOURCE_KIND = 'pje-acervo-hearing';

function hearingExternalId(portalId, cnj, scheduledAt) {
  const digest = createHash('sha256').update([portalId, cnj, scheduledAt].join('|')).digest('hex').slice(0, 32);
  return `pje:${portalId}:hearing:${digest}`;
}

export function reconcilePjeAcervoHearings(state, inventory) {
  const counts = { created: 0, updated: 0, inactive: 0, unchanged: 0 };
  const acervo = inventory?.acervo;
  const portalId = inventory?.portalId;
  if (!portalId || !Array.isArray(acervo?.processes)) return counts;
  state.agenda = Array.isArray(state.agenda) ? state.agenda : [];
  const collectedAt = inventory.collectedAt || new Date().toISOString();
  const today = new Date(new Date(collectedAt).getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
  const owned = event => event.sourceKind === SOURCE_KIND && event.sourcePortalId === portalId;
  const seenIds = new Set();

  for (const record of acervo.processes) {
    const hearing = record?.hearing;
    const cnj = String(record?.processNumber || '').replace(/\D/g, '');
    if (!hearing?.scheduledAt || cnj.length !== 20) continue;
    const externalId = hearingExternalId(portalId, cnj, hearing.scheduledAt);
    const existing = state.agenda.find(event => event.externalId === externalId || event.id === externalId)
      || state.agenda.find(event => owned(event)
        && event.sourceStatus === 'active'
        && String(event.date || '') >= today
        && !seenIds.has(event.externalId)
        && String(event.processNumber || '').replace(/\D/g, '') === cnj);
    const eventId = existing?.externalId || externalId;
    seenIds.add(eventId);
    const date = hearing.scheduledAt.slice(0, 10);
    const time = hearing.time || '';
    const location = hearing.court || '';
    const description = hearing.parties || '';
    const changed = !existing
      || existing.date !== date
      || existing.time !== time
      || existing.location !== location
      || existing.description !== description
      || existing.sourceStatus !== 'active';
    const event = {
      ...(existing || {}),
      id: existing?.id || externalId,
      externalId: eventId,
      sourceKind: SOURCE_KIND,
      title: `Audiência — ${description || [record.classe, record.processNumber].filter(Boolean).join(' ')}`,
      date,
      time,
      scheduledAt: hearing.scheduledAt,
      source: `pje ${inventory.portalName || portalId}`,
      sourcePortalId: portalId,
      process: record.processNumber,
      processNumber: record.processNumber,
      client: existing?.client || '',
      parties: description,
      location,
      hearingType: 'AUDIÊNCIA',
      status: 'DESIGNADA',
      description,
      readOnly: true,
      active: true,
      sourceStatus: 'active',
      sourceStatusChangedAt: existing?.sourceStatus === 'active' ? existing.sourceStatusChangedAt || null : collectedAt,
      firstSeenAt: existing?.firstSeenAt || collectedAt,
      lastSeenAt: collectedAt,
      importedAt: existing?.importedAt || collectedAt,
      updatedAt: changed ? collectedAt : existing.updatedAt
    };
    if (existing) {
      Object.assign(existing, event);
      counts[changed ? 'updated' : 'unchanged'] += 1;
    } else {
      state.agenda.unshift(event);
      counts.created += 1;
    }
  }

  if (acervo.state === 'loaded' || acervo.state === 'empty_confirmed') {
    for (const event of state.agenda) {
      if (!owned(event) || event.sourceStatus !== 'active') continue;
      if (seenIds.has(event.externalId) || String(event.date || '') < today) continue;
      event.sourceStatus = 'not_present';
      event.active = false;
      event.sourceStatusChangedAt = collectedAt;
      event.updatedAt = collectedAt;
      counts.inactive += 1;
    }
  }
  return counts;
}
