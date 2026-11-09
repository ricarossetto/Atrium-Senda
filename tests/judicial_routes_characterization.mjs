/**
 * Registra como as rotas judiciais respondem hoje, mesmo que pareça errado. Serve de proteção para a
 * refatoração de server.mjs: mudar de arquivo não pode mudar nenhuma destas respostas.
 * Roda com dados vazios, sem certificado nem termos. O membro é recusado ao iniciar coleta, por decisão do responsável.
 */
import assert from 'node:assert/strict';
import { postJson, startTestServer } from './helpers.mjs';
import { generateTotp } from '../lib/security.mjs';

const PASSWORD = 'Senha-Caracterizacao-2026!';
const UPDATE = process.env.CHARACTERIZATION_PRINT === 'true';
const server = await startTestServer({ env: { BETA_DISABLE_AUTOMATIONS: 'true', ATRIUM_PUBLIC_SIGNUP: 'true' } });

// O terceiro campo diz se o administrador também chama. Quem inicia coleta só é chamado uma vez.
const ROUTES = [
  ['POST', '/api/integrations/eproc/sweep', false],
  ['GET', '/api/integrations/eproc/sweep/status', true],
  ['POST', '/api/integrations/eproc/sweep/reset', false],
  ['POST', '/api/integrations/eproc/reset-lock', false],
  ['POST', '/api/integrations/eproc/processes/enrich-single', true],
  ['POST', '/api/integrations/eproc/processes/download-autos', true],
  ['POST', '/api/integrations/eproc/download-autos', true],
  ['POST', '/api/tjrs/consult', true],
  ['GET', '/api/judicial/domicilio/window', false],
  ['GET', '/api/judicial/domicilio/status', true],
  ['POST', '/api/judicial/domicilio/sync', false],
  ['POST', '/api/judicial/domicilio/ingest', false],
  ['GET', '/api/djen/capture-errors', true],
  ['POST', '/api/djen/capture-errors/retry', false],
  ['GET', '/api/integrations/judicial/pje', true],
  ['GET', '/api/integrations/judicial/pje/portals', true],
  ['POST', '/api/integrations/judicial/pje/config', false],
  ['POST', '/api/integrations/judicial/pje/sync', false],
  ['POST', '/api/integrations/judicial/pje/sync-all', false],
  ['GET', '/api/integrations/judicial/pje/jobs/inexistente', true],
  ['GET', '/api/judicial/communications', true],
  ['GET', '/api/judicial/communications/inexistente', true],
  ['GET', '/api/integrations/eproc/status', true],
  ['POST', '/api/integrations/eproc/sync', false],
  ['GET', '/api/judicial/sync-status', true],
  ['GET', '/api/eproc/sync/status', true],
  ['GET', '/api/integrations/eproc/sync/status', true]
];

const EXPECTED = {
  "POST /api/integrations/eproc/sweep": {
    "semSessao": 401,
    "membro": 403
  },
  "GET /api/integrations/eproc/sweep/status": {
    "semSessao": 401,
    "membro": 200,
    "admin": 200,
    "formato": "action,completed,determinate,error,id,logs,ok,phase,progress,result,startedAt,status,step,total,updatedAt,workspaceId"
  },
  "POST /api/integrations/eproc/sweep/reset": {
    "semSessao": 401,
    "membro": 403
  },
  "POST /api/integrations/eproc/reset-lock": {
    "semSessao": 401,
    "membro": 403
  },
  "POST /api/integrations/eproc/processes/enrich-single": {
    "semSessao": 401,
    "membro": 400,
    "admin": 400,
    "formato": "message"
  },
  "POST /api/integrations/eproc/processes/download-autos": {
    "semSessao": 401,
    "membro": 400,
    "admin": 400,
    "formato": "message"
  },
  "POST /api/integrations/eproc/download-autos": {
    "semSessao": 401,
    "membro": 400,
    "admin": 400,
    "formato": "message"
  },
  "POST /api/tjrs/consult": {
    "semSessao": 401,
    "membro": 400,
    "admin": 400,
    "formato": "message"
  },
  "GET /api/judicial/domicilio/window": {
    "semSessao": 401,
    "membro": 401
  },
  "GET /api/judicial/domicilio/status": {
    "semSessao": 401,
    "membro": 403,
    "admin": 200,
    "formato": "ok,state,window"
  },
  "POST /api/judicial/domicilio/sync": {
    "semSessao": 401,
    "membro": 403
  },
  "POST /api/judicial/domicilio/ingest": {
    "semSessao": 401,
    "membro": 401
  },
  "GET /api/djen/capture-errors": {
    "semSessao": 401,
    "membro": 200,
    "admin": 200,
    "formato": "lastRun,ok,summary,terms,updatedAt,version"
  },
  "POST /api/djen/capture-errors/retry": {
    "semSessao": 401,
    "membro": 403
  },
  "GET /api/integrations/judicial/pje": {
    "semSessao": 401,
    "membro": 200,
    "admin": 200,
    "formato": "config,ok,portals,workspaceId"
  },
  "GET /api/integrations/judicial/pje/portals": {
    "semSessao": 401,
    "membro": 200,
    "admin": 200,
    "formato": "ok,portals"
  },
  "POST /api/integrations/judicial/pje/config": {
    "semSessao": 401,
    "membro": 403
  },
  "POST /api/integrations/judicial/pje/sync": {
    "semSessao": 401,
    "membro": 403
  },
  "POST /api/integrations/judicial/pje/sync-all": {
    "semSessao": 401,
    "membro": 403
  },
  "GET /api/integrations/judicial/pje/jobs/inexistente": {
    "semSessao": 401,
    "membro": 404,
    "admin": 404,
    "formato": "error,ok"
  },
  "GET /api/judicial/communications": {
    "semSessao": 401,
    "membro": 200,
    "admin": 200,
    "formato": "items,ok,page,pageSize,total"
  },
  "GET /api/judicial/communications/inexistente": {
    "semSessao": 401,
    "membro": 404,
    "admin": 404,
    "formato": "error,ok"
  },
  "GET /api/integrations/eproc/status": {
    "semSessao": 401,
    "membro": 200,
    "admin": 200,
    "formato": "activeJob,certificate,ok,portals,scheduler,totpEnabled,workspaceId"
  },
  "POST /api/integrations/eproc/sync": {
    "semSessao": 401,
    "membro": 403
  },
  "GET /api/judicial/sync-status": {
    "semSessao": 401,
    "membro": 200,
    "admin": 200,
    "formato": "jobStatus,ok,workspaceId"
  },
  "GET /api/eproc/sync/status": {
    "semSessao": 401,
    "membro": 200,
    "admin": 200,
    "formato": "jobStatus,ok,workspaceId"
  },
  "GET /api/integrations/eproc/sync/status": {
    "semSessao": 401,
    "membro": 200,
    "admin": 200,
    "formato": "jobStatus,ok,workspaceId"
  }
}

const call = (method, pathname, session) => fetch(`${server.baseUrl}${pathname}`, {
  method,
  headers: { 'Content-Type': 'application/json', ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}) },
  ...(method === 'GET' ? {} : { body: '{}' })
});

// Só o formato: valores como datas mudam a cada execução.
const shapeOf = body => (body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).sort().join(',') : typeof body);

try {
  const setup = await (await postJson(`${server.baseUrl}/api/auth/setup`, { username: 'titular_judicial', displayName: 'Titular Teste', password: PASSWORD })).json();
  const verified = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  const admin = { cookie: verified.headers.get('set-cookie').split(';')[0], csrf: (await verified.json()).csrfToken };
  const invited = await (await fetch(`${server.baseUrl}/api/auth/invitations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf },
    body: JSON.stringify({ email: 'membro.judicial@example.test', displayName: 'Membro Teste', role: 'collaborator' })
  })).json();
  const accepted = await (await postJson(`${server.baseUrl}/api/auth/invitations/accept`, { inviteToken: invited.inviteToken, username: 'membro_judicial', password: PASSWORD })).json();
  await postJson(`${server.baseUrl}/api/auth/register/verify`, { setupToken: accepted.setupToken, code: generateTotp(accepted.manualSecret) });
  const login = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'membro_judicial', password: PASSWORD, code: generateTotp(accepted.manualSecret, Math.floor(Date.now() / 30_000) + 1) });
  assert.equal(login.status, 200, 'membro não entrou');
  const member = { cookie: login.headers.get('set-cookie').split(';')[0], csrf: (await login.json()).csrfToken };

  const seen = {};
  for (const [method, pathname, adminCalls] of ROUTES) {
    const entry = { semSessao: (await call(method, pathname)).status };
    const asMember = await call(method, pathname, member);
    entry.membro = asMember.status;
    await asMember.text();
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
    console.log(`[PASS] Rotas judiciais: ${ROUTES.length} respostas iguais às registradas.`);
  }
} finally {
  await server.stop();
}
process.exit(0);
