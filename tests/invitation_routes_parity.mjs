import assert from 'node:assert/strict';
import { generateTotp } from '../lib/security.mjs';
import { startTestServer, postJson } from './helpers.mjs';

console.log('=== F13 slice: invitation and profile routes parity ===');
const server = await startTestServer();
const adminPass = 'Senha-Slice-2026!';
try {
  let res = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_slice', displayName: 'Admin Slice', email: 'slice@example.test', password: adminPass
  });
  const setup = await res.json();
  res = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken, code: generateTotp(setup.manualSecret)
  });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const csrf = (await res.json()).csrfToken;
  const auth = { Cookie: cookie, 'X-CSRF-Token': csrf };

  res = await fetch(`${server.baseUrl}/api/auth/invitations`, { headers: auth });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).invitations, []);

  res = await postJson(`${server.baseUrl}/api/auth/invitations`, {
    email: 'convidado@example.test', displayName: 'Convidado Legal', role: 'collaborator'
  }, auth);
  assert.equal(res.status, 201);
  const inv = await res.json();
  assert.ok(inv.invitation?.id);
  assert.ok(inv.inviteToken);

  res = await fetch(`${server.baseUrl}/api/auth/invitations/accept?token=${encodeURIComponent(inv.inviteToken)}`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).invitation?.email, 'convidado@example.test');

  res = await postJson(`${server.baseUrl}/api/auth/invitations`, {
    email: 'reenvio@example.test', displayName: 'Reenvio Legal', role: 'collaborator'
  }, auth);
  assert.equal(res.status, 201);
  const inv2 = await res.json();
  res = await postJson(`${server.baseUrl}/api/auth/invitations/resend`, { invitationId: inv2.invitation.id }, auth);
  assert.equal(res.status, 200);
  const resent = await res.json();
  assert.ok(resent.ok);
  assert.ok(resent.inviteToken);
  assert.notEqual(resent.inviteToken, inv2.inviteToken);
  assert.ok(Number(resent.invitation.expiresAt) >= Number(inv2.invitation.expiresAt));
  res = await fetch(`${server.baseUrl}/api/auth/invitations/accept?token=${encodeURIComponent(inv2.inviteToken)}`);
  assert.equal(res.status, 401);
  res = await fetch(`${server.baseUrl}/api/auth/invitations/accept?token=${encodeURIComponent(resent.inviteToken)}`);
  assert.equal(res.status, 200);
  res = await postJson(`${server.baseUrl}/api/auth/invitations/resend`, { invitationId: 'inv-inexistente' }, auth);
  assert.equal(res.status, 404);

  res = await postJson(`${server.baseUrl}/api/auth/profile`, { displayName: 'Admin Atualizado', phone: '5551999999999' }, auth);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).user?.phone, '5551999999999');

  console.log('slice parity: PASS (convites + perfil extraídos com sucesso)');
} finally {
  await server.stop();
}
process.exit(0);
