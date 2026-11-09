import { assertCanGrantOfficeRole, assertPrincipalMutationAllowed, isOfficePrincipalMember, OFFICE_PERMISSIONS, OFFICE_ROLES, principalTransferRequiredError } from '../office/role-catalog.mjs';
import { filterOfficeState, filterPrivateScopeState, teamInUseInState } from '../office/access-control.mjs';
import { accessAuditPage, financePortfolio, mergeScopedTerms, orphanTeamAssignments } from '../office/office-insights.mjs';

export const OFFICE_ROUTE_MISS = Symbol('office-route-miss');

export function isOfficeRoute(url) {
  return url.pathname === '/api/office'
    || url.pathname === '/api/me/private-monitoring'
    || url.pathname.startsWith('/api/office/')
    || url.pathname === '/api/office/teams'
    || url.pathname.startsWith('/api/office/teams/');
}

function assertOfficePermission(security, session, permission) {
  if (security.hasOfficePermission(session, 'office.manage') || security.hasOfficePermission(session, permission)) return;
  throw Object.assign(new Error('Seu perfil não tem permissão para esta ação no escritório.'), { statusCode: 403 });
}

// Permissão fora do catálogo é erro de entrada (400), nunca descarte silencioso.
function validateRolePermissions(permissions) {
  if (!Array.isArray(permissions)) throw Object.assign(new Error('Lista de permissões inválida.'), { statusCode: 400 });
  const unique = [...new Set(permissions.map(permission => String(permission)))];
  for (const permission of unique) {
    if (!OFFICE_PERMISSIONS.includes(permission)) {
      throw Object.assign(new Error(`Permissão do escritório inválida: ${permission}.`), { statusCode: 400 });
    }
  }
  return unique;
}

export async function handleOfficeRoute(ctx, req, res, url) {
  const {
    json, readJson, security, assertAuthenticated, appendServerAudit,
    readAppStateEnvelope, enqueueAppStateMutation, saveAppStateDirectUnlocked, assertRevision, assertReauthentication
  } = ctx;

  const sessionIdentity = session => String(session?.id || session?.userId || session?.username || '');
  const visibleStateFor = async session => {
    const envelope = await readAppStateEnvelope();
    const teams = security.listTeams(session.workspaceId);
    let state = filterPrivateScopeState(envelope?.state || {}, session, { teams });
    if (security.officeProfile(session.workspaceId).accessMode === 'enforced') state = filterOfficeState(state, session, { teams });
    return state;
  };

  if (req.method === 'GET' && url.pathname === '/api/office/access-audit') {
    const session = assertAuthenticated(req);
    assertOfficePermission(security, session, 'audit.read');
    const envelope = await readAppStateEnvelope();
    return json(res, 200, { ok: true, ...accessAuditPage(envelope?.state, {
      page: url.searchParams.get('page'),
      pageSize: url.searchParams.get('pageSize')
    }) });
  }

  if (req.method === 'GET' && url.pathname === '/api/office/hygiene') {
    const session = assertAuthenticated(req);
    assertOfficePermission(security, session, 'teams.manage');
    const envelope = await readAppStateEnvelope();
    return json(res, 200, { ok: true, orphanTeamAssignments: orphanTeamAssignments(envelope?.state, security.listTeams(session.workspaceId)) });
  }

  if (req.method === 'GET' && url.pathname === '/api/office/finance/portfolio') {
    const session = assertAuthenticated(req);
    assertOfficePermission(security, session, 'finance.read');
    return json(res, 200, { ok: true, ...financePortfolio(await visibleStateFor(session)) });
  }

  const monitoringRoute = url.pathname === '/api/office/monitoring' ? 'office' : url.pathname === '/api/me/private-monitoring' ? 'private' : '';
  if (monitoringRoute && req.method === 'GET') {
    const session = assertAuthenticated(req);
    if (monitoringRoute === 'office') assertOfficePermission(security, session, 'office.manage');
    const envelope = await readAppStateEnvelope();
    const terms = (envelope?.state?.terms || []).filter(term => (monitoringRoute === 'office'
      ? term?.scope !== 'private'
      : term?.scope === 'private' && [session.id, session.userId, session.username].filter(Boolean).map(String).includes(String(term?.privateOwnerUserId || term?.ownerUserId || ''))));
    return json(res, 200, { ok: true, terms });
  }
  if (monitoringRoute && req.method === 'PATCH') {
    const session = assertAuthenticated(req, true);
    if (monitoringRoute === 'office') assertOfficePermission(security, session, 'office.manage');
    if (monitoringRoute === 'private' && security.officeProfile(session.workspaceId).privateMonitoring === 'disabled') {
      throw Object.assign(new Error('O monitoramento privado está desativado neste escritório.'), { statusCode: 403 });
    }
    const body = await readJson(req);
    const result = await enqueueAppStateMutation(async () => {
      const envelope = await readAppStateEnvelope();
      assertRevision(envelope, body.expectedRevision ?? body.revision);
      const state = envelope.state || {};
      state.terms = mergeScopedTerms(state.terms, body.terms, { scope: monitoringRoute, ownerId: sessionIdentity(session) });
      const saved = await saveAppStateDirectUnlocked(state, envelope.revision || null);
      return { terms: state.terms, revision: saved.revision };
    });
    await appendServerAudit?.('Acesso: monitoramento de OAB atualizado', monitoringRoute === 'office' ? 'OABs do escritório.' : 'OABs privadas do próprio membro.', session.displayName || session.username);
    return json(res, 200, { ok: true, revision: result.revision });
  }

  if (req.method === 'POST' && url.pathname === '/api/office/principal/transfer') {
    const session = assertAuthenticated(req, true);
    const body = await readJson(req);
    await assertReauthentication?.(req, body, session);
    const members = security.listUsers(session.workspaceId);
    const actor = members.find(member => member.id === session.id || member.username === session.username);
    if (!isOfficePrincipalMember(actor)) {
      throw Object.assign(new Error('Só o titular do escritório pode transferir a titularidade.'), { statusCode: 403 });
    }
    const member = await security.transferOfficePrincipal(String(body.toUserId || ''), actor.id, session.workspaceId);
    await appendServerAudit?.('Titularidade transferida', `De ${actor.displayName || actor.username} para ${member.displayName || member.username}.`, session.displayName || session.username);
    return json(res, 200, { ok: true, member });
  }
  if (req.method === 'GET' && url.pathname === '/api/office') {
    const session = assertAuthenticated(req);
    return json(res, 200, {
      profile: security.officeProfile(session.workspaceId),
      members: security.listUsers(session.workspaceId),
      teams: security.listTeams(session.workspaceId),
      currentRole: session.role,
      permissions: session.permissions || []
    });
  }
  if (req.method === 'PATCH' && url.pathname === '/api/office') {
    const session = assertAuthenticated(req, true);
    assertOfficePermission(security, session, 'office.manage');
    const body = await readJson(req);
    const wantsAccessMode = body.accessMode !== undefined;
    const wantsPrivateMonitoring = body.privateMonitoring !== undefined;
    if (!wantsAccessMode && !wantsPrivateMonitoring) throw Object.assign(new Error('Informe accessMode ou privateMonitoring.'), { statusCode: 400 });
    if (wantsAccessMode && !['shadow', 'enforced'].includes(body.accessMode)) throw Object.assign(new Error('Modo de acesso inválido.'), { statusCode: 400 });
    if (wantsPrivateMonitoring && !['allowed', 'disabled'].includes(body.privateMonitoring)) throw Object.assign(new Error('Política de monitoramento privado inválida.'), { statusCode: 400 });
    const accessMode = wantsAccessMode ? await security.setOfficeAccessMode(body.accessMode, session.workspaceId) : security.officeProfile(session.workspaceId).accessMode;
    const privateMonitoring = wantsPrivateMonitoring ? await security.setOfficePrivateMonitoring(body.privateMonitoring, session.workspaceId) : security.officeProfile(session.workspaceId).privateMonitoring;
    await appendServerAudit?.('Política do escritório alterada', wantsPrivateMonitoring ? `Monitoramento privado: ${privateMonitoring}` : `Modo: ${accessMode}`, session.displayName || session.username);
    return json(res, 200, { ok: true, accessMode, privateMonitoring });
  }
  if (req.method === 'GET' && url.pathname === '/api/office/teams') {
    const session = assertAuthenticated(req);
    return json(res, 200, { teams: security.listTeams(session.workspaceId) });
  }
  if (req.method === 'POST' && url.pathname === '/api/office/teams') {
    const session = assertAuthenticated(req, true);
    assertOfficePermission(security, session, 'teams.manage');
    const team = await security.createTeam(await readJson(req), session.workspaceId);
    await appendServerAudit?.('Equipe criada', `Equipe: ${team.name}`, session.displayName || session.username);
    return json(res, 201, { ok: true, team });
  }
  const roleMatch = url.pathname.match(/^\/api\/office\/roles(?:\/([^/]+))?$/);
  if (roleMatch) {
    const roleId = roleMatch[1] ? decodeURIComponent(roleMatch[1]) : '';
    if (req.method === 'GET' && !roleId) {
      const session = assertAuthenticated(req);
      return json(res, 200, {
        roles: [...security.officeProfile(session.workspaceId).roles],
        permissions: security.officeProfile(session.workspaceId).permissionCatalog || [],
        factoryRoleIds: OFFICE_ROLES.map(role => role.id)
      });
    }
    if (req.method === 'POST' && !roleId) {
      const session = assertAuthenticated(req, true);
      assertOfficePermission(security, session, 'roles.manage');
      const body = await readJson(req);
      // 400 antes de 409: permissão fora do catálogo é erro de entrada.
      const permissions = validateRolePermissions(body.permissions);
      assertCanGrantOfficeRole({ actorRoleId: session.officeRoleId || '', actorPermissions: session.permissions || [], targetRoleId: null, targetPermissions: permissions, workspaceId: session.workspaceId });
      const role = await security.createOfficeRole({ ...body, permissions }, session.workspaceId);
      await appendServerAudit?.('Papel do escritório criado', `Papel: ${role.name}; permissões: ${role.permissions.join(', ') || 'nenhuma'}`, session.displayName || session.username);
      return json(res, 201, { ok: true, role });
    }
    if (req.method === 'PATCH' && roleId) {
      const session = assertAuthenticated(req, true);
      assertOfficePermission(security, session, 'roles.manage');
      const body = await readJson(req);
      const permissions = body.permissions === undefined ? undefined : validateRolePermissions(body.permissions);
      if (permissions) assertCanGrantOfficeRole({ actorRoleId: session.officeRoleId || '', actorPermissions: session.permissions || [], targetRoleId: null, targetPermissions: permissions, workspaceId: session.workspaceId });
      const role = await security.updateOfficeRole(roleId, { ...body, permissions }, session.workspaceId);
      await appendServerAudit?.('Papel do escritório atualizado', `Papel: ${role.name}; permissões: ${role.permissions.join(', ') || 'nenhuma'}`, session.displayName || session.username);
      return json(res, 200, { ok: true, role });
    }
    if (req.method === 'DELETE' && roleId) {
      const session = assertAuthenticated(req, true);
      assertOfficePermission(security, session, 'roles.manage');
      await security.deactivateOfficeRole(roleId, session.workspaceId);
      await appendServerAudit?.('Papel do escritório desativado', `ID: ${roleId}`, session.displayName || session.username);
      return json(res, 200, { ok: true });
    }
  }
  const offboardMatch = url.pathname.match(/^\/api\/office\/members\/([^/]+)\/offboard$/);
  if (offboardMatch && req.method === 'POST') {
    const session = assertAuthenticated(req, true);
    assertOfficePermission(security, session, 'members.manage');
    const body = await readJson(req);
    const targetId = decodeURIComponent(offboardMatch[1]);
    const members = security.listUsers(session.workspaceId);
    const target = members.find(member => member.id === targetId || member.username === targetId);
    if (!target) throw Object.assign(new Error('Membro não localizado neste escritório.'), { statusCode: 404 });
    // A titularidade só muda por transferência explícita: o titular não é desligado aqui.
    assertPrincipalMutationAllowed(target, { status: 'inactive' });
    const managers = members.filter(member => member.status === 'active' && ['office_manager', 'office_principal'].includes(member.officeRoleId));
    if (managers.length <= 1 && managers.some(member => member.id === target.id)) throw Object.assign(new Error('O escritório precisa de ao menos um gestor ativo.'), { statusCode: 409, code: 'LAST_MANAGER' });
    const replacement = members.find(member => member.id === String(body.transferToUserId || '') || member.username === String(body.transferToUserId || '')) || null;
    if (replacement && (replacement.status !== 'active' || replacement.id === target.id)) throw Object.assign(new Error('O substituto precisa ser um membro ativo diferente.'), { statusCode: 400 });
    const result = await enqueueAppStateMutation(async () => {
      const envelope = await readAppStateEnvelope();
      assertRevision(envelope, body.expectedRevision ?? body.revision);
      const state = envelope.state || {};
      let processes = 0;
      let tasks = 0;
      for (const process of Array.isArray(state.processes) ? state.processes : []) {
        const ids = Array.isArray(process.responsibleUserIds) ? process.responsibleUserIds.map(String) : [];
        if (!ids.includes(String(target.id))) continue;
        const next = ids.filter(id => id !== String(target.id));
        if (replacement && !next.includes(String(replacement.id))) next.push(String(replacement.id));
        process.responsibleUserIds = next;
        process.assignedBy = String(session.id || session.username || '');
        process.assignedAt = new Date().toISOString();
        processes += 1;
      }
      for (const task of Array.isArray(state.tasks) ? state.tasks : []) {
        if (String(task.assigneeUserId || '') === String(target.id)) {
          task.assigneeUserId = replacement ? String(replacement.id) : '';
          task.responsible = replacement ? (replacement.displayName || replacement.username) : '';
          tasks += 1;
        }
        if (Array.isArray(task.followerUserIds)) task.followerUserIds = task.followerUserIds.filter(id => String(id) !== String(target.id));
      }
      state.updatedAt = new Date().toISOString();
      const saved = await saveAppStateDirectUnlocked(state, envelope.revision || null);
      return { revision: saved?.revision || envelope.revision || null, processes, tasks };
    });
    const member = await security.updateOfficeMember(target.id, { status: 'inactive', teamIds: [] }, session.workspaceId);
    await appendServerAudit?.('Membro desligado do escritório', `Membro: ${target.displayName || target.username}; substituto: ${replacement?.displayName || replacement?.username || 'sem substituto'}; processos: ${result.processes}; tarefas: ${result.tasks}`, session.displayName || session.username);
    return json(res, 200, { ok: true, member, revision: result.revision, transferred: { processes: result.processes, tasks: result.tasks } });
  }
  const memberMatch = url.pathname.match(/^\/api\/office\/members\/([^/]+)$/);
  if (memberMatch && req.method === 'PATCH') {
    const session = assertAuthenticated(req, true);
    assertOfficePermission(security, session, 'members.manage');
    const body = await readJson(req);
    const target = security.listUsers(session.workspaceId).find(member => member.id === decodeURIComponent(memberMatch[1]) || member.username === decodeURIComponent(memberMatch[1]));
    if (!target) throw Object.assign(new Error('Membro não localizado neste escritório.'), { statusCode: 404 });
    // Escalonamento: o ator só concede papel e permissões que ele próprio detém.
    if (body.officeRoleId || Array.isArray(body.permissionOverrides)) {
      assertCanGrantOfficeRole({
        actorRoleId: session.officeRoleId || '',
        actorPermissions: Array.isArray(session.permissions) ? session.permissions : [],
        targetRoleId: body.officeRoleId ? String(body.officeRoleId) : null,
        targetPermissions: body.permissionOverrides,
        workspaceId: session.workspaceId
      });
    }
    // Mesma regra no PATCH: rebaixar ou desativar o titular exige transferência.
    assertPrincipalMutationAllowed(target, body);
    // Segundo titular deixaria os dois impossíveis de rebaixar: a titularidade só muda por transferência.
    if (body.officeRoleId === 'office_principal' && !isOfficePrincipalMember(target)) throw principalTransferRequiredError();
    const member = await security.updateOfficeMember(decodeURIComponent(memberMatch[1]), body, session.workspaceId);
    await appendServerAudit?.('Membro do escritório atualizado', `Membro: ${member.displayName || member.username}; papel: ${member.officeRoleId}; tipo: ${member.memberKind}`, session.displayName || session.username);
    return json(res, 200, { ok: true, member });
  }
  const match = url.pathname.match(/^\/api\/office\/teams\/([^/]+)$/);
  if (match && req.method === 'PATCH') {
    const session = assertAuthenticated(req, true);
    assertOfficePermission(security, session, 'teams.manage');
    const team = await security.updateTeam(decodeURIComponent(match[1]), await readJson(req), session.workspaceId);
    await appendServerAudit?.('Equipe atualizada', `Equipe: ${team.name}`, session.displayName || session.username);
    return json(res, 200, { ok: true, team });
  }
  if (match && req.method === 'DELETE') {
    const session = assertAuthenticated(req, true);
    assertOfficePermission(security, session, 'teams.manage');
    const teamId = decodeURIComponent(match[1]);
    // O predicado é montado a partir do estado atual do workspace e injetado: a exclusão
    // não pode apagar equipe que ainda concede acesso a processo.
    const isTeamInUse = async () => {
      const envelope = await readAppStateEnvelope();
      if (envelope?.state) return teamInUseInState(envelope.state, teamId);
      // Estado nulo não prova ausência de vínculo. Dois casos distintos:
      // - workspace que nunca gravou estado (nenhum detalhe de recuperação): início legítimo,
      //   sem processo que possa referenciar a equipe;
      // - estado existente porém ilegível (recuperação ou schema futuro): não há como
      //   verificar o uso, então a exclusão é recusada em vez de passar em silêncio.
      const estadoIndisponivel = envelope?.status === 'RECOVERY_REQUIRED'
        || envelope?.status === 'FUTURE_SCHEMA_ERROR'
        || Boolean(envelope?.recoveryDetails);
      if (!estadoIndisponivel) return false;
      const mensagem = envelope.status === 'FUTURE_SCHEMA_ERROR'
        ? 'Os dados do escritório exigem uma versão mais nova do ATRIUM, então não é possível verificar se a equipe está em uso. Atualize o ATRIUM e conclua a recuperação antes de excluir a equipe.'
        : 'O estado do escritório está em recuperação e não é possível verificar se a equipe está em uso. Conclua a recuperação do estado antes de excluir a equipe.';
      throw Object.assign(new Error(mensagem), { statusCode: 423 });
    };
    // Dentro da fila de gravação: entre verificar o uso e apagar, ninguém atribui a equipe.
    await enqueueAppStateMutation(() => security.deleteTeam(teamId, session.workspaceId, { isTeamInUse }));
    await appendServerAudit?.('Equipe excluída', `ID: ${teamId}`, session.displayName || session.username);
    return json(res, 200, { ok: true });
  }
  return OFFICE_ROUTE_MISS;
}
