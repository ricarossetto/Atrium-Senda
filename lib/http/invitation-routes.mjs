// ATRIUM — Rotas de convites e perfil (extração strangler de server.mjs).
// Preserva gates de autenticação, CSRF, RBAC e cookies.

import { assertCanGrantOfficeRole, principalTransferRequiredError } from '../office/role-catalog.mjs';

export const INVITATION_ROUTE_MISS = Symbol('invitation-route-miss');

const DEFAULT_INVITATION_ROLE_ID = 'associate';

function assertInviterCanGrant(session, { officeRoleId, permissionOverrides } = {}) {
  assertCanGrantOfficeRole({
    actorRoleId: session.officeRoleId || '',
    actorPermissions: Array.isArray(session.permissions) ? session.permissions : [],
    targetRoleId: officeRoleId || DEFAULT_INVITATION_ROLE_ID,
    targetPermissions: permissionOverrides,
    workspaceId: session.workspaceId
  });
  if (officeRoleId === 'office_principal') throw principalTransferRequiredError();
}

export function isInvitationOrProfileRoute(url) {
  return url.pathname.startsWith('/api/auth/invitations')
    || url.pathname === '/api/auth/profile'
    || url.pathname === '/api/auth/profile/reset'
    || url.pathname === '/api/auth/profile/delete';
}

export async function handleInvitationOrProfileRoute(ctx, req, res, url) {
  const { json, readJson, security, assertAuthenticated, getNotificationService } = ctx;
  const assertMemberPermission = (session, permission = 'members.manage') => {
    if (security.hasOfficePermission(session, 'office.manage') || security.hasOfficePermission(session, permission)) return;
    throw Object.assign(new Error('Seu perfil não tem permissão para gerenciar convites.'), { statusCode: 403 });
  };
  const maybeSendInviteEmail = async ({ session, invitation, inviteToken, sendEmail }) => {
    if (sendEmail !== true) return 'not_requested';
    if (typeof getNotificationService !== 'function') return 'not_configured';
    try {
      const service = getNotificationService(session.workspaceId);
      const baseUrl = String(service?.baseUrl || 'http://127.0.0.1:4173').replace(/\/+$/, '');
      await service.sendTeamInviteEmail({
        workspaceId: session.workspaceId,
        recipient: invitation.email,
        displayName: invitation.displayName,
        officeName: session.workspaceName || 'ATRIUM',
        inviterName: session.displayName || session.username || '',
        inviteUrl: `${baseUrl}/login#invite=${encodeURIComponent(inviteToken)}`,
        invitationId: invitation.id,
        generation: invitation.createdAt
      });
      return 'queued';
    } catch {
      return 'failed';
    }
  };

  if (req.method === 'POST' && url.pathname === '/api/auth/profile') {
    const session = assertAuthenticated(req, true);
    const user = await security.updateCurrentUserProfile(session.username, await readJson(req));
    return json(res, 200, { ok: true, user });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/profile/reset') {
    const session = assertAuthenticated(req, true);
    const user = await security.resetCurrentUserProfile(session.username);
    return json(res, 200, { ok: true, user, message: 'Perfil redefinido para as configurações padrão com sucesso.' });
  }

  if ((req.method === 'POST' || req.method === 'DELETE') && (url.pathname === '/api/auth/profile/delete' || url.pathname === '/api/auth/profile')) {
    const session = assertAuthenticated(req, true);
    const result = await security.deleteCurrentUserAccount(session.username, session);
    return json(res, 200, result, { 'Set-Cookie': [security.clearCookie(), security.clearTrustedDeviceCookie()] });
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/invitations/accept') {
    return json(res, 200, { ok: true, invitation: security.validateTeamInvitation(url.searchParams.get('token')) });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/invitations/accept') {
    return json(res, 200, await security.acceptTeamInvitation(await readJson(req)));
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/invitations') {
    const session = assertAuthenticated(req);
    assertMemberPermission(session);
    return json(res, 200, { invitations: security.listTeamInvitations(session.workspaceId), currentRole: session.role });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/invitations') {
    const session = assertAuthenticated(req, true);
    assertMemberPermission(session, 'members.invite');
    const body = await readJson(req);
    assertInviterCanGrant(session, body);
    const created = await security.createTeamInvitation(body, session.workspaceId);
    const emailStatus = await maybeSendInviteEmail({ session, invitation: created.invitation, inviteToken: created.inviteToken, sendEmail: body.sendEmail });
    return json(res, 201, { ok: true, ...created, emailStatus });
  }

  if (req.method === 'DELETE' && url.pathname === '/api/auth/invitations') {
    const session = assertAuthenticated(req, true);
    assertMemberPermission(session);
    const body = await readJson(req);
    await security.revokeTeamInvitation(body.invitationId, session.workspaceId);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/invitations/resend') {
    const session = assertAuthenticated(req, true);
    assertMemberPermission(session, 'members.invite');
    const body = await readJson(req);
    // O papel do convite não pode ser reenviado por quem não teria podido concedê-lo.
    const pendingInvitation = security.listTeamInvitations(session.workspaceId)
      .find(invitation => invitation.id === body.invitationId);
    if (pendingInvitation) assertInviterCanGrant(session, { officeRoleId: pendingInvitation.officeRoleId });
    const resent = await security.resendTeamInvitation(body.invitationId, session.workspaceId);
    const emailStatus = await maybeSendInviteEmail({ session, invitation: resent.invitation, inviteToken: resent.inviteToken, sendEmail: body.sendEmail });
    return json(res, 200, { ok: true, ...resent, emailStatus });
  }

  return INVITATION_ROUTE_MISS;
}
