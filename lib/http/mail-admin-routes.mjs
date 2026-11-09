// ATRIUM — Rotas administrativas do ATRIUM Mail (extracao strangler de server.mjs).
// Contrato preservado: gate master_admin + 7 subrotas /api/admin/mail/*;
// rota mail nao casada devolve MISS para o 404 comum do bloco admin.

const MAIL_ROUTE_MISS = Symbol('mail-route-miss');

export function isMailAdminRoute(url) {
  return url.pathname.startsWith('/api/admin/mail/');
}

export async function handleMailAdminRoute(ctx, req, res, url, adminSession) {
  const { json, readJson, maskEmail, appendServerAudit, notificationDbForWorkspace, notificationServiceForWorkspace, resendProvider, assertReauthentication } = ctx;
  if (adminSession.role !== 'master_admin') {
    throw Object.assign(new Error('Somente o administrador principal pode gerenciar o ATRIUM Mail.'), { statusCode: 403 });
  }
  const outcome = await (async () => {
    if (req.method === 'GET' && url.pathname === '/api/admin/mail/status') {
      const db = notificationDbForWorkspace(adminSession.workspaceId);
      const stats = db.getStats();
      const budget = resendProvider.checkBudget(db);
      return json(res, 200, {
        ok: true,
        configured: resendProvider.isConfigured(),
        workspaceId: adminSession.workspaceId,
        stats,
        budget,
        limits: resendProvider.getLimits()
      });
    }
  
    if (req.method === 'POST' && url.pathname === '/api/admin/mail/toggle') {
      const body = await readJson(req, 10_000);
      if (body.workspaceId && body.workspaceId !== adminSession.workspaceId) {
        throw Object.assign(new Error('Proibido alterar status de workspace de terceiros.'), { statusCode: 403 });
      }
      await assertReauthentication(req, body, adminSession);
      const db = notificationDbForWorkspace(adminSession.workspaceId);
      const enabled = Boolean(body.enabled);
      db.setWorkspaceEnabled(enabled);
      await appendServerAudit(
        `ATRIUM Mail ${enabled ? 'ativado' : 'desativado'}`,
        `Workspace ${adminSession.workspaceId}`,
        adminSession.displayName || adminSession.username
      );
      return json(res, 200, { ok: true, enabled, enabledAt: db.getActivationWatermark() });
    }
  
    if (req.method === 'POST' && url.pathname === '/api/admin/mail/test') {
      const body = await readJson(req, 100_000);
      if (body.workspaceId && body.workspaceId !== adminSession.workspaceId) {
        throw Object.assign(new Error('Proibido enviar teste em nome de outro workspace.'), { statusCode: 403 });
      }
      await assertReauthentication(req, body, adminSession);
      const service = notificationServiceForWorkspace(adminSession.workspaceId);
      const targetEmail = body.recipient || adminSession.email;
      const result = await service.sendTestEmail({
        workspaceId: adminSession.workspaceId,
        recipient: targetEmail
      });
      await appendServerAudit(
        'Teste do ATRIUM Mail enfileirado',
        `Destinatário: ${maskEmail(targetEmail)}`,
        adminSession.displayName || adminSession.username
      );
      return json(res, 200, { ok: true, message: 'E-mail de teste enfileirado com sucesso!', result });
    }
  
    if (req.method === 'GET' && url.pathname === '/api/admin/mail/recipients') {
      const db = notificationDbForWorkspace(adminSession.workspaceId);
      const recipients = db.listRecipients(adminSession.workspaceId);
      return json(res, 200, { ok: true, recipients });
    }
  
    if (req.method === 'POST' && url.pathname === '/api/admin/mail/recipients') {
      const body = await readJson(req, 100_000);
      if (body.workspaceId && body.workspaceId !== adminSession.workspaceId) {
        throw Object.assign(new Error('Proibido cadastrar destinatário em outro workspace.'), { statusCode: 403 });
      }
      if (!body.email || !body.name) {
        throw Object.assign(new Error('Nome e e-mail são obrigatórios.'), { statusCode: 400 });
      }
      const db = notificationDbForWorkspace(adminSession.workspaceId);
      const recipient = db.addRecipient({
        workspaceId: adminSession.workspaceId,
        name: body.name,
        email: body.email,
        enabled: body.enabled !== false,
        preferences: body.preferences || []
      });
      await appendServerAudit(
        'Destinatário externo adicionado ao ATRIUM Mail',
        `${recipient.name} (${maskEmail(recipient.email)})`,
        adminSession.displayName || adminSession.username
      );
      return json(res, 201, { ok: true, recipient });
    }
  
    if ((req.method === 'PATCH' || req.method === 'POST') && (url.pathname.startsWith('/api/admin/mail/recipients/') || url.pathname === '/api/admin/mail/recipients/update')) {
      const body = await readJson(req, 100_000);
      const id = url.pathname.startsWith('/api/admin/mail/recipients/')
        ? url.pathname.slice('/api/admin/mail/recipients/'.length).trim()
        : String(body.id || '').trim();
      const db = notificationDbForWorkspace(adminSession.workspaceId);
      const updated = db.updateRecipient(adminSession.workspaceId, id, body);
      if (!updated) throw Object.assign(new Error('Destinatário não encontrado.'), { statusCode: 404 });
      await appendServerAudit(
        'Destinatário externo do ATRIUM Mail atualizado',
        `${updated.name} (${maskEmail(updated.email)})`,
        adminSession.displayName || adminSession.username
      );
      return json(res, 200, { ok: true, recipient: updated });
    }
  
    if ((req.method === 'DELETE' || req.method === 'POST') && (url.pathname.startsWith('/api/admin/mail/recipients/') || url.pathname === '/api/admin/mail/recipients/delete')) {
      let body = {};
      if (req.method === 'POST') body = await readJson(req, 100_000);
      const id = url.pathname.startsWith('/api/admin/mail/recipients/')
        ? url.pathname.slice('/api/admin/mail/recipients/'.length).trim()
        : String(url.searchParams.get('id') || body.id || '').trim();
      const db = notificationDbForWorkspace(adminSession.workspaceId);
      const deleted = db.deleteRecipient(adminSession.workspaceId, id);
      if (!deleted) throw Object.assign(new Error('Destinatário não encontrado.'), { statusCode: 404 });
      await appendServerAudit(
        'Destinatário externo removido do ATRIUM Mail',
        `${deleted.name} (${maskEmail(deleted.email)})`,
        adminSession.displayName || adminSession.username
      );
      return json(res, 200, { ok: true, message: 'Destinatário excluído com sucesso.' });
    }
    return MAIL_ROUTE_MISS;
  })();
  return outcome !== MAIL_ROUTE_MISS;
}
