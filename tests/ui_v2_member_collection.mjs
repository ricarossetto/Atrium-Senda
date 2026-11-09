import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { postJson, startTestServer } from './helpers.mjs';
import { generateTotp } from '../lib/security.mjs';

// Membro comum não inicia coleta: o botão Sincronizar só traz o que já foi coletado, e os de coleta somem.
const PASSWORD = 'Senha-Membro-Coleta-2026!';
const server = await startTestServer({ env: { BETA_DISABLE_AUTOMATIONS: 'true' } });
const browser = await chromium.launch({ headless: true });
try {
  const setup = await (await postJson(`${server.baseUrl}/api/auth/setup`, { username: 'titular_coleta', displayName: 'Titular Teste', password: PASSWORD })).json();
  const verified = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  const adminCookie = verified.headers.get('set-cookie').split(';')[0];
  const adminCsrf = (await verified.json()).csrfToken;
  const invited = await (await postJson(`${server.baseUrl}/api/auth/invitations`, { email: 'membro.coleta@example.test', displayName: 'Membro Teste', role: 'collaborator' }, { Cookie: adminCookie, 'X-CSRF-Token': adminCsrf })).json();
  const accepted = await (await postJson(`${server.baseUrl}/api/auth/invitations/accept`, { inviteToken: invited.inviteToken, username: 'membro_coleta', password: PASSWORD })).json();
  await postJson(`${server.baseUrl}/api/auth/register/verify`, { setupToken: accepted.setupToken, code: generateTotp(accepted.manualSecret) });
  const login = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'membro_coleta', password: PASSWORD, code: generateTotp(accepted.manualSecret, Math.floor(Date.now() / 30_000) + 1) });
  assert.equal(login.status, 200);

  const open = async cookieHeader => {
    const [name, value] = cookieHeader.split(/=(.*)/s);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addCookies([{ name, value, url: server.baseUrl }]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const posts = [];
    page.on('request', request => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); });
    await page.goto(`${server.baseUrl}/trabalho/tarefas`, { waitUntil: 'domcontentloaded' });
    await page.locator('#appShell:not(.hidden)').waitFor();
    await page.waitForFunction(() => document.documentElement.dataset.canCollect !== undefined);
    return { page, posts, errors, context };
  };

  const member = await open(login.headers.get('set-cookie').split(';')[0]);
  assert.equal(await member.page.evaluate(() => document.documentElement.dataset.canCollect), 'false');
  assert.equal(await member.page.evaluate(() => getComputedStyle(document.getElementById('btnSyncEprocA1')).display), 'none', 'botão de varredura some');
  await member.page.locator('#syncButton').click();
  await member.page.getByText('A coleta nos tribunais roda nos ciclos automáticos').first().waitFor();
  assert.deepEqual(member.posts.filter(pathname => /\/api\/sync$|\/sync-all$|\/sweep$/.test(pathname)), [], 'botão não inicia coleta');
  assert.deepEqual(member.errors, []);
  await member.context.close();

  const admin = await open(adminCookie);
  assert.equal(await admin.page.evaluate(() => document.documentElement.dataset.canCollect), 'true');
  await admin.page.locator('#syncButton').click();
  await admin.page.waitForTimeout(300);
  assert.ok(admin.posts.some(pathname => pathname === '/api/sync'), 'administrador inicia a coleta');
  await admin.context.close();
} finally {
  await browser.close();
  await server.stop();
}
console.log('[PASS] Membro comum não inicia coleta.');
process.exit(0);
