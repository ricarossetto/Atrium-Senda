import { ownerMatchesUser } from '../office/monitoring-scope.mjs';
export const PROCESS_ACCESS_ROUTE_MISS = Symbol('process-access-route-miss');

export function isProcessAccessRoute(url) {
  return /^\/api\/processes\/[^/]+\/(?:assignment|access-grants(?:\/[^/]+)?)$/.test(url.pathname);
}

export function processAccessMatch(url) {
  return url.pathname.match(/^\/api\/processes\/([^/]+)\/(assignment|access-grants)(?:\/([^/]+))?$/);
}

function processKey(value) {
  return decodeURIComponent(String(value || ''));
}

function findProcess(state, key) {
  const target = processKey(key);
  const digits = target.replace(/\D/g, '');
  return (state.processes || []).find(process => String(process.id) === target
    || String(process.number) === target
    || (digits && String(process.number || '').replace(/\D/g, '') === digits)) || null;
}

/**
 * `expiresAt` é persistido em milissegundos (epoch) porque servidor e cliente
 * comparam com `Date.now()`. Data sem hora vale até o fim do dia em BRT.
 */
export function normalizeGrantExpiry(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{10,}$/.test(raw)) {
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) return String(Math.trunc(numeric));
  }
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T23:59:59-03:00` : raw);
  if (!Number.isFinite(parsed)) {
    throw Object.assign(new Error('Informe uma data válida para o fim da concessão.'), { statusCode: 400 });
  }
  return String(parsed);
}

function assertAssignableProcess(session, process) {
  if (!process) throw Object.assign(new Error('Processo não localizado neste escritório.'), { statusCode: 404 });
  if (process.scope === 'private' && !ownerMatchesUser(process.privateOwnerUserId, session)) {
    throw Object.assign(new Error('Processo privado pertence a outro membro.'), { statusCode: 403 });
  }
}

export async function handleProcessAccessRoute(ctx, req, res, url, match) {
  const {
    json, readJson, security, assertAuthenticated, readAppStateEnvelope,
    enqueueAppStateMutation, saveAppStateDirectUnlocked, assertRevision, appendServerAudit
  } = ctx;
  const session = assertAuthenticated(req, true);
  if (!security.hasOfficePermission(session, 'processes.assign') && !security.hasOfficePermission(session, 'office.manage')) {
    throw Object.assign(new Error('Seu perfil não pode atribuir processos.'), { statusCode: 403 });
  }
  const processId = match[1];
  const action = match[2] || 'assignment';
  const body = await readJson(req);
  const result = await enqueueAppStateMutation(async () => {
    const envelope = await readAppStateEnvelope();
    assertRevision(envelope, body.expectedRevision ?? body.revision);
    const state = envelope.state || {};
    const process = findProcess(state, processId);
    assertAssignableProcess(session, process);
    const workspaceUsers = security.listUsers(session.workspaceId);
    const activeUserIds = new Set(workspaceUsers.filter(user => user.status === 'active').map(user => String(user.id)));
    const validTeamIds = new Set(security.listTeams(session.workspaceId).map(team => String(team.id)));
    if (action === 'assignment') {
      const responsible = [...new Set((Array.isArray(body.responsibleUserIds) ? body.responsibleUserIds : []).map(String).filter(id => activeUserIds.has(id)))].slice(0, 10);
      const teams = [...new Set((Array.isArray(body.teamIds) ? body.teamIds : []).map(String).filter(id => validTeamIds.has(id)))].slice(0, 20);
      process.responsibleUserIds = responsible;
      process.assignedTeamIds = teams;
      process.assignmentStatus = responsible.length || teams.length ? 'assigned' : 'unassigned';
      process.assignedBy = String(session.id || session.username || '');
      process.assignedAt = new Date().toISOString();
    } else if (action === 'access-grants') {
      const userId = String(body.userId || '');
      if (!activeUserIds.has(userId)) throw Object.assign(new Error('Membro inválido para concessão de acesso.'), { statusCode: 400 });
      const grants = Array.isArray(process.accessGrants) ? process.accessGrants.filter(grant => String(grant.userId) !== userId) : [];
      grants.push({
        userId,
        reason: String(body.reason || '').trim().slice(0, 240),
        grantedBy: String(session.id || session.username || ''),
        grantedAt: new Date().toISOString(),
        expiresAt: normalizeGrantExpiry(body.expiresAt)
      });
      process.accessGrants = grants.slice(-50);
    }
    state.updatedAt = new Date().toISOString();
    const saved = await saveAppStateDirectUnlocked(state, envelope.revision || null);
    return { process, revision: saved?.revision || envelope.revision || null };
  });
  await appendServerAudit?.(
    action === 'access-grants' ? 'Concessão de acesso processual atualizada' : 'Atribuição processual atualizada',
    `Processo: ${result.process.number || result.process.id}`,
    session.displayName || session.username
  );
  return json(res, 200, { ok: true, process: result.process, revision: result.revision });
}

export async function handleProcessAccessRevoke(ctx, req, res, url, match) {
  const {
    json, readJson, security, assertAuthenticated, readAppStateEnvelope,
    enqueueAppStateMutation, saveAppStateDirectUnlocked, assertRevision, appendServerAudit
  } = ctx;
  const session = assertAuthenticated(req, true);
  if (!security.hasOfficePermission(session, 'processes.assign') && !security.hasOfficePermission(session, 'office.manage')) {
    throw Object.assign(new Error('Seu perfil não pode atribuir processos.'), { statusCode: 403 });
  }
  if (!match[3]) {
    throw Object.assign(new Error('Informe o membro cuja concessão será revogada.'), { statusCode: 400 });
  }
  const body = await readJson(req);
  const result = await enqueueAppStateMutation(async () => {
    const envelope = await readAppStateEnvelope();
    assertRevision(envelope, body.expectedRevision ?? body.revision);
    const state = envelope.state || {};
    const process = findProcess(state, match[1]);
    assertAssignableProcess(session, process);
    const userId = decodeURIComponent(String(match[3] || ''));
    process.accessGrants = (process.accessGrants || []).filter(grant => String(grant.userId) !== userId);
    state.updatedAt = new Date().toISOString();
    const saved = await saveAppStateDirectUnlocked(state, envelope.revision || null);
    return { process, revision: saved?.revision || envelope.revision || null };
  });
  await appendServerAudit?.('Concessão de acesso processual revogada', `Processo: ${result.process.number || result.process.id}`, session.displayName || session.username);
  return json(res, 200, { ok: true, process: result.process, revision: result.revision });
}
