/**
 * ATRIUM — Reconciliação de Sessões de Julgamento (eproc 2º grau) na Agenda.
 *
 * Regras (as mesmas das audiências):
 * - identidade externa estável por portal + CNJ + início + sequencial + modalidade;
 * - sessão nunca cria prazo, tarefa fatal, ciência ou ato processual;
 * - ausência só é marcada como `not_present` quando a listagem foi reconhecida e
 *   coletada por inteiro;
 * - sessão virtual assíncrona guarda o período (`sessionStart` a `sessionEnd`);
 * - eventos manuais ou de outras fontes nunca são tocados.
 */

import { createHash } from 'node:crypto';

export function sessionExternalId(portalId, session, sourcePrefix = 'eproc') {
  // O sequencial da sessão é estável quando o tribunal remarca data/hora; usá-lo evita
  // duplicar a sessão a cada remarcação. Sem sequencial, cai no início da sessão.
  const sequential = String(session?.sequential || '').trim();
  const identity = [
    portalId,
    String(session?.cnj || '').replace(/\D/g, ''),
    sequential ? `seq:${sequential}` : `start:${String(session?.sessionStart || '').trim()}`,
    String(session?.sessionMode || '').trim().toLowerCase()
  ].join('|');
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 32);
  return `${sourcePrefix}:${portalId}:session:${digest}`;
}

function sessionTitle(session) {
  const where = String(session?.panel || session?.courtUnit || '').trim();
  return where ? `Sessão de Julgamento — ${where}` : `Sessão de Julgamento — ${session?.processNumber || session?.cnj || ''}`.trim();
}

export function reconcileEprocSessions(state, {
  portalId,
  portalLabel = 'eproc',
  sourcePrefix = 'eproc',
  collectedAt,
  sessions = [],
  collectionStatus = {}
} = {}) {
  if (!state || typeof state !== 'object') throw new Error('Estado oficial é obrigatório para reconciliar sessões do eproc.');
  state.agenda = Array.isArray(state.agenda) ? state.agenda : [];
  const counts = { created: 0, updated: 0, inactive: 0, unchanged: 0 };
  const seenIds = new Set();
  const seenProcessModes = new Set();

  for (const session of sessions) {
    const cnj = String(session?.cnj || '').replace(/\D/g, '');
    if (cnj.length !== 20) continue;
    if (!session?.sessionStart) continue;
    const processMode = `${cnj}|${String(session.sessionMode || '').toLowerCase()}`;
    seenProcessModes.add(processMode);
    const externalId = sessionExternalId(portalId, session, sourcePrefix);
    seenIds.add(externalId);
    const existing = state.agenda.find(event => event.externalId === externalId || event.id === externalId);

    const start = String(session.sessionStart);
    const canonical = {
      ...(existing || {}),
      id: existing?.id || externalId,
      externalId,
      title: sessionTitle(session),
      date: start.slice(0, 10),
      time: start.slice(11, 16),
      scheduledAt: start,
      sessionStart: start,
      sessionEnd: String(session.sessionEnd || '').trim(),
      source: `${sourcePrefix} ${portalLabel}`.trim(),
      sourcePortalId: portalId,
      process: session.processNumber || cnj,
      processNumber: session.processNumber || cnj,
      client: existing?.client || '',
      location: String(session.location || (session.sessionMode === 'VIRTUAL_ASSINCRONA' ? 'Sessão virtual assíncrona' : '')).slice(0, 160),
      modality: session.sessionMode || '',
      sessionMode: session.sessionMode || '',
      hearingType: 'SESSÃO DE JULGAMENTO',
      panel: String(session.panel || '').slice(0, 120),
      panelMembers: Array.isArray(session.panelMembers) ? session.panelMembers.slice(0, 12) : [],
      sequential: String(session.sequential || ''),
      courtUnit: String(session.courtUnit || '').slice(0, 40),
      subject: String(session.subject || '').slice(0, 120),
      status: session.status || 'DESIGNADA',
      description: String(session.event || '').slice(0, 1000),
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
      || existing.sessionEnd !== canonical.sessionEnd
      || existing.status !== canonical.status
      || existing.sessionMode !== canonical.sessionMode
      || existing.panel !== canonical.panel
      || existing.location !== canonical.location
      || existing.description !== canonical.description
      || existing.sourceStatus !== 'active';
    Object.assign(existing, canonical);
    if (changed) counts.updated += 1;
    else counts.unchanged += 1;
  }

  if (collectionStatus?.collected === true) {
    for (const event of state.agenda) {
      if (event.sourcePortalId !== portalId || event.hearingType !== 'SESSÃO DE JULGAMENTO') continue;
      if (event.sourceStatus !== 'active') continue;
      if (seenIds.has(event.externalId || event.id)) continue;
      const key = `${String(event.process || event.processNumber || '').replace(/\D/g, '')}|${String(event.sessionMode || '').toLowerCase()}`;
      if (seenProcessModes.has(key)) continue;
      event.sourceStatus = 'not_present';
      event.active = false;
      event.sourceStatusChangedAt = collectedAt;
      event.updatedAt = collectedAt;
      counts.inactive += 1;
    }
  }

  return counts;
}
