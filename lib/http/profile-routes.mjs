// ATRIUM — Rotas de perfil (extração strangler de server.mjs).
// Preserva gates de autenticação, CSRF, RBAC e cookies.

import { publicClientAddress } from './client-address.mjs';

export const PROFILE_ROUTE_MISS = Symbol('profile-route-miss');

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

export function isProfileRoute(url) {
  return url.pathname === '/api/auth/profile'
    || url.pathname === '/api/auth/profile/reset'
    || url.pathname === '/api/auth/profile/delete'
    || url.pathname === '/api/auth/onboarding';
}

export async function handleProfileRoute(ctx, req, res, url) {
  const { json, readJson, security, assertAuthenticated, assertReauthentication, getNotificationService } = ctx;

  // Aviso ao endereço anterior usa o pipeline oficial de notificações
  // (enqueueLifecycleEmail -> outbox -> worker). Nenhum SMTP paralelo.
  const sendEmailChangeNotice = async ({ session, previousEmail, newEmail, displayName, workspaceId, username, changedAt }) => {
    if (!previousEmail || previousEmail === newEmail) return 'not_applicable';
    if (typeof getNotificationService !== 'function') return 'not_configured';
    try {
      const service = getNotificationService(workspaceId || session.workspaceId);
      const name = String(displayName || session.displayName || 'usuário');
      const subject = newEmail ? 'ATRIUM | E-mail da sua conta alterado' : 'ATRIUM | E-mail removido da sua conta';
      const text = `Olá, ${name}.\n\n`
        + (newEmail
          ? 'O endereço de e-mail da sua conta ATRIUM foi alterado.\n\n'
            + `Endereço anterior: ${previousEmail}\n`
            + `Novo endereço: ${newEmail}\n\n`
            + 'Se não foi você, contate o administrador do escritório e redefina sua senha.\n\n'
          : 'O endereço de e-mail foi removido da sua conta ATRIUM.\n\n'
            + `Endereço anterior: ${previousEmail}\n\n`
            + 'Se não foi você, contate o administrador do escritório imediatamente.\n\n')
        + 'Equipe ATRIUM';
      const html = `<p>Olá, ${escapeHtml(name)}.</p>`
        + (newEmail
          ? '<p>O endereço de e-mail da sua conta ATRIUM foi alterado.</p>'
            + `<p>Endereço anterior: <strong>${escapeHtml(previousEmail)}</strong><br>`
            + `Novo endereço: <strong>${escapeHtml(newEmail)}</strong></p>`
          : '<p>O endereço de e-mail foi removido da sua conta ATRIUM.</p>'
            + `<p>Endereço anterior: <strong>${escapeHtml(previousEmail)}</strong></p>`)
        + (newEmail
          ? '<p>Se não foi você, contate o administrador do escritório e redefina sua senha.</p>'
          : '<p>Se não foi você, contate o administrador do escritório imediatamente.</p>')
        + '<p>Equipe ATRIUM</p>';
      const from = service?.provider?.getFromAddress?.('general');
      await service.enqueueLifecycleEmail({
        workspaceId: workspaceId || session.workspaceId,
        eventType: 'SECURITY_EMAIL_CHANGED',
        recipient: previousEmail,
        ...(from ? { from } : {}),
        template: { subject, html, text },
        idempotencyKey: `email-change/${workspaceId || session.workspaceId}/${username}/${Date.parse(changedAt) || Date.now()}`
      });
      return 'queued';
    } catch {
      return 'failed';
    }
  };

  if (req.method === 'POST' && url.pathname === '/api/auth/profile') {
    const session = assertAuthenticated(req, true);
    const body = await readJson(req);
    let emailNotice = 'not_applicable';
    const user = await security.updateCurrentUserProfile(session.username, {
      displayName: body?.displayName,
      email: body?.email,
      phone: body?.phone,
      avatar: body?.avatar,
      currentPassword: body?.currentPassword,
      mfaCode: body?.mfaCode
    }, {
      req,
      remoteAddress: publicClientAddress(req) || '',
      sendEmailChangeNotice: async details => {
        emailNotice = await sendEmailChangeNotice({ session, ...details });
        return emailNotice;
      }
    });
    return json(res, 200, { ok: true, user, emailNotice });
  }

  // Marcação de primeiro acesso do próprio usuário (apresentação vista, bloco ocultado).
  // Mutação autenticada com CSRF; o usuário vem da sessão, nunca do corpo.
  if (req.method === 'POST' && url.pathname === '/api/auth/onboarding') {
    const session = assertAuthenticated(req, true);
    const body = await readJson(req, 2_000);
    const onboarding = await security.markOnboarding(session.username, body?.marker);
    return json(res, 200, { ok: true, onboarding });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/profile/reset') {
    const session = assertAuthenticated(req, true);
    const user = await security.resetCurrentUserProfile(session.username);
    return json(res, 200, { ok: true, user, message: 'Perfil redefinido para as configurações padrão com sucesso.' });
  }

  if ((req.method === 'POST' || req.method === 'DELETE') && (url.pathname === '/api/auth/profile/delete' || url.pathname === '/api/auth/profile')) {
    const session = assertAuthenticated(req, true);
    const body = await readJson(req, 10_000).catch(() => ({}));
    if (typeof assertReauthentication === 'function') {
      await assertReauthentication(req, body, session);
    }
    const result = await security.deleteCurrentUserAccount(session.username, session);
    const cookies = [...(typeof security.clearSessionCookies === 'function' ? security.clearSessionCookies() : [security.clearCookie()]), security.clearTrustedDeviceCookie()];
    return json(res, 200, result, { 'Set-Cookie': cookies });
  }

  return PROFILE_ROUTE_MISS;
}
