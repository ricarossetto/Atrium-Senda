/**
 * Registra como as rotas de documentos, agenda, integrações e estado respondem hoje, mesmo que pareça errado.
 * Serve de proteção para a refatoração de server.mjs: mudar de arquivo não pode mudar estas respostas.
 * Roda com dados vazios. O terceiro campo diz se o administrador também chama: quem apaga ou fala com fora não é chamado.
 */
import assert from 'node:assert/strict';
import { postJson, startTestServer } from './helpers.mjs';
import { generateTotp } from '../lib/security.mjs';

const PASSWORD = 'Senha-Caracterizacao-2026!';
const UPDATE = process.env.CHARACTERIZATION_PRINT === 'true';
const server = await startTestServer({ env: { BETA_DISABLE_AUTOMATIONS: 'true' } });

const ROUTES = [
  ['POST', '/api/integrations/judicial/sync', false],
  ['GET', '/api/state', true],
  ['POST', '/api/state', true],
  ['GET', '/api/documents', true],
  ['POST', '/api/documents', true],
  ['PATCH', '/api/documents/settings', true],
  ['POST', '/api/integrations/judicial/portals/inexistente', true],
  ['POST', '/api/state/import-legacy', true],
  ['GET', '/api/integrations/email/status', true],
  ['POST', '/api/integrations/email/configure', false],
  ['POST', '/api/integrations/email/test', false],
  ['GET', '/api/integrations/email/receivers', true],
  ['POST', '/api/integrations/email/receivers', true],
  ['PATCH', '/api/integrations/email/receivers/inexistente', true],
  ['PATCH', '/api/integrations/email/receivers/update', true],
  ['DELETE', '/api/integrations/email/receivers/inexistente', true],
  ['DELETE', '/api/integrations/email/receivers/delete', true],
  ['DELETE', '/api/integrations/email/receivers', true],
  ['POST', '/api/calendar/configure', false],
  ['GET', '/api/integrations/judicial', true],
  ['GET', '/api/integrations/judicial/diagnostics', true],
  ['POST', '/api/integrations/judicial/a1/sandbox', false],
  ['POST', '/api/integrations/judicial/totp/sandbox', false],
  ['POST', '/api/integrations/judicial/totp/parse', false],
  ['POST', '/api/integrations/judicial/certificate', false],
  ['POST', '/api/integrations/judicial/2fa', false],
  ['POST', '/api/integrations/judicial/credentials', false],
  ['POST', '/api/integrations/judicial/portals', false],
  ['POST', '/api/integrations/judicial/reset', false],
  ['POST', '/api/integrations/judicial/connect', false],
  ['GET', '/api/integrations/collector/pair', true],
  ['POST', '/api/integrations/collector/pair', false],
  ['DELETE', '/api/integrations/collector/pair', false]
];

const EXPECTED = {
  "POST /api/integrations/judicial/sync": {
    "semSessao": 401,
    "membro": 200,
    "formatoMembro": "message,ok,portalCount,skipped"
  },
  "GET /api/state": {
    "semSessao": 401,
    "membro": 200,
    "formatoMembro": "appVersion,buildId,builtAt,commitSha,dataVersion,environment,gitSha,revision,schemaVersion,state,stateStatus",
    "admin": 200,
    "formato": "appVersion,buildId,builtAt,commitSha,dataVersion,environment,gitSha,revision,schemaVersion,state,stateStatus"
  },
  "POST /api/state": {
    "semSessao": 401,
    "membro": 200,
    "formatoMembro": "ok,revision,schemaVersion,updatedAt",
    "admin": 409,
    "formato": "message"
  },
  "GET /api/documents": {
    "semSessao": 401,
    "membro": 200,
    "formatoMembro": "documents,ok,revision",
    "admin": 200,
    "formato": "documents,ok,revision"
  },
  "POST /api/documents": {
    "semSessao": 401,
    "membro": 400,
    "formatoMembro": "message",
    "admin": 400,
    "formato": "message"
  },
  "PATCH /api/documents/settings": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message",
    "admin": 409,
    "formato": "message"
  },
  "POST /api/integrations/judicial/portals/inexistente": {
    "semSessao": 405,
    "membro": 405,
    "formatoMembro": "message",
    "admin": 405,
    "formato": "message"
  },
  "POST /api/state/import-legacy": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message",
    "admin": 409,
    "formato": "message"
  },
  "GET /api/integrations/email/status": {
    "semSessao": 401,
    "membro": 200,
    "formatoMembro": "ok,status",
    "admin": 200,
    "formato": "ok,status"
  },
  "POST /api/integrations/email/configure": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message"
  },
  "POST /api/integrations/email/test": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message"
  },
  "GET /api/integrations/email/receivers": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message",
    "admin": 200,
    "formato": "ok,receivers"
  },
  "POST /api/integrations/email/receivers": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message",
    "admin": 400,
    "formato": "message"
  },
  "PATCH /api/integrations/email/receivers/inexistente": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message",
    "admin": 404,
    "formato": "message"
  },
  "PATCH /api/integrations/email/receivers/update": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message",
    "admin": 404,
    "formato": "message"
  },
  "DELETE /api/integrations/email/receivers/inexistente": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message",
    "admin": 404,
    "formato": "message"
  },
  "DELETE /api/integrations/email/receivers/delete": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message",
    "admin": 404,
    "formato": "message"
  },
  "DELETE /api/integrations/email/receivers": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message",
    "admin": 400,
    "formato": "message"
  },
  "POST /api/calendar/configure": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message"
  },
  "GET /api/integrations/judicial": {
    "semSessao": 401,
    "membro": 200,
    "formatoMembro": "automatedTotpEnabled,certificate,diagnostics,interactiveCollectorRunning,interactiveCollectorState,managedCoverage,managedPolicy,ok,pjeOffice,portals",
    "admin": 200,
    "formato": "automatedTotpEnabled,certificate,diagnostics,interactiveCollectorRunning,interactiveCollectorState,managedCoverage,managedPolicy,ok,pjeOffice,portals"
  },
  "GET /api/integrations/judicial/diagnostics": {
    "semSessao": 401,
    "membro": 200,
    "formatoMembro": "diagnostics,ok",
    "admin": 200,
    "formato": "diagnostics,ok"
  },
  "POST /api/integrations/judicial/a1/sandbox": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message"
  },
  "POST /api/integrations/judicial/totp/sandbox": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message"
  },
  "POST /api/integrations/judicial/totp/parse": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message"
  },
  "POST /api/integrations/judicial/certificate": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message"
  },
  "POST /api/integrations/judicial/2fa": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message"
  },
  "POST /api/integrations/judicial/credentials": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message"
  },
  "POST /api/integrations/judicial/portals": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message"
  },
  "POST /api/integrations/judicial/reset": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message"
  },
  "POST /api/integrations/judicial/connect": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message"
  },
  "GET /api/integrations/collector/pair": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message",
    "admin": 200,
    "formato": "createdAt,ok,paired,workspaceId"
  },
  "POST /api/integrations/collector/pair": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message"
  },
  "DELETE /api/integrations/collector/pair": {
    "semSessao": 401,
    "membro": 403,
    "formatoMembro": "message"
  }
};

const call = (method, pathname, session) => fetch(`${server.baseUrl}${pathname}`, {
  method,
  headers: { 'Content-Type': 'application/json', ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}) },
  ...(method === 'GET' ? {} : { body: '{}' })
});
const shapeOf = body => (body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).sort().join(',') : typeof body);

try {
  const setup = await (await postJson(`${server.baseUrl}/api/auth/setup`, { username: 'titular_rotas', displayName: 'Titular Teste', password: PASSWORD })).json();
  const verified = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  const admin = { cookie: verified.headers.get('set-cookie').split(';')[0], csrf: (await verified.json()).csrfToken };
  const invited = await (await postJson(`${server.baseUrl}/api/auth/invitations`, { email: 'membro.rotas@example.test', displayName: 'Membro Teste', role: 'collaborator' }, { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf })).json();
  const accepted = await (await postJson(`${server.baseUrl}/api/auth/invitations/accept`, { inviteToken: invited.inviteToken, username: 'membro_rotas', password: PASSWORD })).json();
  await postJson(`${server.baseUrl}/api/auth/register/verify`, { setupToken: accepted.setupToken, code: generateTotp(accepted.manualSecret) });
  const login = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'membro_rotas', password: PASSWORD, code: generateTotp(accepted.manualSecret, Math.floor(Date.now() / 30_000) + 1) });
  assert.equal(login.status, 200, 'membro não entrou');
  const member = { cookie: login.headers.get('set-cookie').split(';')[0], csrf: (await login.json()).csrfToken };

  const seen = {};
  for (const [method, pathname, adminCalls] of ROUTES) {
    const entry = { semSessao: (await call(method, pathname)).status };
    const asMember = await call(method, pathname, member);
    entry.membro = asMember.status;
    entry.formatoMembro = shapeOf(await asMember.json().catch(() => null));
    if (adminCalls) {
      const asAdmin = await call(method, pathname, admin);
      entry.admin = asAdmin.status;
      entry.formato = shapeOf(await asAdmin.json().catch(() => null));
    }
    seen[`${method} ${pathname}`] = entry;
  }
  if (UPDATE) {
    console.log(JSON.stringify(seen, null, 2));
  } else {
    assert.deepEqual(seen, EXPECTED);
    console.log(`[PASS] Rotas registradas: ${ROUTES.length} respostas iguais.`);
  }
} finally {
  await server.stop();
}
process.exit(0);
