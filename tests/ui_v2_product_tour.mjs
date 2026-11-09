import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { postJson, startTestServer } from './helpers.mjs';
import { generateTotp } from '../lib/security.mjs';
import { buildTourSteps, shouldStartTour } from '../js/core/product-tour-steps.js';
import { placeTourCard } from '../js/components/product-tour.js';
import { HOW_TO, TOTP_SLIDES } from '../js/core/setup-how-to.js';
import { statSync } from 'node:fs';

const SHOTS = process.env.TOUR_SHOTS || '';

// Regras sem navegador
assert.equal(shouldStartTour({ pending: true, seenBefore: true }), true, 'conta nova abre mesmo em navegador já usado');
assert.equal(shouldStartTour({ pending: true, doneForUser: true }), false, 'quem concluiu não vê de novo');
assert.equal(shouldStartTour({ seenBefore: true }), false, 'quem já usava o sistema não é interrompido');
assert.equal(shouldStartTour({}), true, 'membro novo vê');
assert.deepEqual(buildTourSteps({ canManage: true }).map(step => step.id), ['dashboard', 'monitoring', 'inbox', 'kanban', 'agenda', 'processes', 'sync', 'spreadsheet', 'mfa', 'a1', 'oab']);
assert.deepEqual(buildTourSteps({ canManage: true, hasCertificate: true, mfaEnabled: true }).map(step => step.id).slice(-3), ['certificate', 'totp', 'oab'], 'com certificado, ensina o envio e o QR Code');
assert.equal(buildTourSteps({ canManage: true, hasCertificate: false }).some(step => ['a1', 'certificate', 'totp'].includes(step.id)), false, 'sem certificado, não insiste');
assert.equal(buildTourSteps({ canManage: true, mfaEnabled: true }).some(step => step.id === 'mfa'), false, 'com duas etapas ativas, não ensina de novo');
assert.match(buildTourSteps({}).find(step => step.id === 'monitoring').body, /7h, 12h e 19h/);
assert.equal(buildTourSteps({ canManage: true, hasCertificate: true }).find(step => step.id === 'totp').guide, 'totp', 'QR Code com passo a passo animado');
assert.deepEqual(HOW_TO.totp.slice(0, 4).join(' ').match(/Transferir contas|Exportar contas|Marque só o tribunal|tire um print/g), ['Transferir contas', 'Exportar contas', 'Marque só o tribunal', 'tire um print']);
assert.equal(TOTP_SLIDES.length, 6);
for (const slide of TOTP_SLIDES) assert.ok(statSync(new URL(`../assets/images/authenticator/${slide.image}`, import.meta.url)).size < 80_000, slide.image);
assert.equal(buildTourSteps({ canManage: true, hasOab: true }).some(step => step.id === 'oab'), false, 'com OAB, não pede de novo');
assert.deepEqual(buildTourSteps({ canManage: false }).map(step => step.id), ['dashboard', 'monitoring', 'inbox', 'kanban', 'agenda', 'processes', 'sync', 'mfa'], 'membro não configura o escritório');
assert.match(buildTourSteps({ canManage: false }).find(step => step.id === 'sync').body, /já foi coletado/);
assert.ok(buildTourSteps({}).find(step => step.id === 'inbox').example, 'tela vazia mostra exemplo');
assert.equal(buildTourSteps({ counts: { intimations: 2 } }).find(step => step.id === 'inbox').example, null, 'com dados reais, sem exemplo');
assert.match(buildTourSteps({}).find(step => step.id === 'monitoring').note, /não é ato judicial/);
const card = { width: 420, height: 240 };
const viewport = { width: 1440, height: 900 };
const below = placeTourCard({ spot: { left: 300, top: 100, width: 600, height: 200 }, card, viewport });
assert.ok(below.top >= 312, 'cartão abaixo do destaque');
assert.equal(placeTourCard({ spot: { left: 0, top: 0, width: 100, height: 100 }, card, viewport: { width: 390, height: 844 } }).dock, true, 'celular usa cartão embaixo');
const crowded = placeTourCard({ spot: { left: 260, top: 100, width: 1160, height: 780 }, card, viewport });
assert.ok(crowded.left + card.width <= viewport.width && crowded.top + card.height <= viewport.height, 'sem espaço, o cartão continua na tela');

const PASSWORD = 'Senha-Tour-Sintetica-2026!';
const server = await startTestServer({ env: { BETA_DISABLE_AUTOMATIONS: 'true', ATRIUM_PUBLIC_SIGNUP: 'true' } });
const browser = await chromium.launch({ headless: true });
try {
  const setup = await (await postJson(`${server.baseUrl}/api/auth/setup`, { username: 'titular_tour', displayName: 'Titular Teste', password: PASSWORD })).json();
  const verified = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  const adminCookie = verified.headers.get('set-cookie').split(';')[0];
  const adminCsrf = (await verified.json()).csrfToken;
  const registered = await (await postJson(`${server.baseUrl}/api/auth/register`, { username: 'membro_tour', displayName: 'Membro Teste', email: 'membro.tour@example.test', password: PASSWORD, officeRoleId: 'associate' }, { Cookie: adminCookie, 'X-CSRF-Token': adminCsrf })).json();
  await postJson(`${server.baseUrl}/api/auth/register/verify`, { setupToken: registered.setupToken, code: generateTotp(registered.manualSecret) });
  const listedUsers = await (await (await fetch(`${server.baseUrl}/api/auth/users`, { headers: { Cookie: adminCookie } })).json());
  const memberUser = listedUsers.users.find(user => user.username === 'membro_tour');
  await postJson(`${server.baseUrl}/api/auth/users/manage`, { userId: memberUser.id, status: 'active', password: PASSWORD, code: generateTotp(setup.manualSecret) }, { Cookie: adminCookie, 'X-CSRF-Token': adminCsrf });
  const login = await postJson(`${server.baseUrl}/api/auth/login`, { username: 'membro_tour', password: PASSWORD, code: generateTotp(registered.manualSecret, Math.floor(Date.now() / 30_000) + 1) });
  assert.equal(login.status, 200);
  const memberCookie = login.headers.get('set-cookie').split(';')[0];

  const open = async ({ cookie, width = 1440, height = 900, theme = 'light', init = () => {} }) => {
    const [name, value] = cookie.split(/=(.*)/s);
    const context = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR' });
    await context.addCookies([{ name, value, url: server.baseUrl }]);
    await context.addInitScript(selected => localStorage.setItem('atrium_theme', selected), theme);
    await context.addInitScript(init);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const stateWrites = [];
    page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/state') stateWrites.push(request.postData() || ''); });
    await page.goto(`${server.baseUrl}/trabalho/tarefas`, { waitUntil: 'domcontentloaded' });
    await page.locator('#appShell:not(.hidden)').waitFor();
    return { page, context, errors, stateWrites };
  };
  const stepOf = page => page.locator('#productTourTitle').textContent();

  for (const [width, height, theme] of [[1440, 900, 'light'], [1024, 768, 'dark'], [390, 844, 'light']]) {
    const { page, context, errors, stateWrites } = await open({ cookie: adminCookie, width, height, theme, init: () => sessionStorage.setItem('atrium_pending_product_tour', 'true') });
    await page.locator('#productTour .product-tour-card').waitFor();
    assert.match(await stepOf(page), /Boas-vindas/);
    assert.equal(await page.evaluate(() => document.getElementById('appShell').inert), true, 'o resto da tela não recebe clique');
    const seen = [];
    for (let position = 0; position < 15; position += 1) {
      await page.waitForTimeout(450);
      const check = await page.evaluate(() => {
        const spot = document.querySelector('.product-tour-spot').getBoundingClientRect();
        const card = document.querySelector('.product-tour-card').getBoundingClientRect();
        return {
          title: document.getElementById('productTourTitle').textContent,
          hasSpot: document.getElementById('productTour').classList.contains('has-spot'),
          overlapArea: Math.max(0, Math.min(card.right, spot.right) - Math.max(card.left, spot.left)) * Math.max(0, Math.min(card.bottom, spot.bottom) - Math.max(card.top, spot.top)),
          insideX: card.left >= 0 && card.right <= innerWidth,
          insideY: card.top >= 0 && card.bottom <= innerHeight,
          scrollInside: document.querySelector('.product-tour-card').scrollHeight - document.querySelector('.product-tour-card').clientHeight,
          overflow: document.documentElement.scrollWidth - innerWidth,
          focus: Boolean(document.activeElement?.closest('.product-tour-card')),
          count: document.querySelector('.product-tour-count').textContent
        };
      });
      const label = JSON.stringify({ width, ...check });
      seen.push(check.title);
      assert.equal(check.insideX && check.insideY, true, `cartão inteiro na tela: ${label}`);
      assert.ok(check.overflow <= 2, `sem estouro: ${label}`);
      assert.equal(check.focus, true, `foco no cartão: ${label}`);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `tour-${width}-${theme}-${String(position + 1).padStart(2, '0')}.png`) });
      const choice = page.locator('[data-tour-choice="true"]');
      if (await choice.count()) { await choice.click(); continue; }
      const next = page.locator('[data-tour-next]');
      if (/Informar minha OAB/.test(await next.textContent())) break;
      await next.click();
    }
    for (const expected of [/Como o monitoramento/, /planilha/, /OAB/]) assert.ok(seen.some(title => expected.test(title)), `parada ausente: ${expected}`);
    assert.ok(seen.some(title => /QR Code de cada tribunal/.test(title)), 'quem tem certificado aprende o QR Code');
    // Última parada leva à ação real.
    await page.locator('[data-tour-next]').click();
    await page.locator('#productTour').waitFor({ state: 'detached' });
    await page.locator('#modalBackdrop:not(.hidden)').waitFor();
    assert.equal(stateWrites.some(body => /Elaborar contesta|Audi.ncia de instru/.test(body)), false, 'exemplos não entram nos dados');
    assert.deepEqual(errors, []);
    await context.close();
  }

  // Teclado, Pular e não reabrir
  {
    const { page, context, errors } = await open({ cookie: adminCookie, init: () => sessionStorage.setItem('atrium_pending_product_tour', 'true') });
    await page.locator('#productTour .product-tour-card').waitFor();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => /monitoramento/.test(document.getElementById('productTourTitle').textContent));
    assert.match(await page.locator('.product-tour-list').textContent(), /DJEN/);
    await page.keyboard.press('ArrowRight');
    await page.locator('.product-tour-example').waitFor();
    assert.match(await page.locator('.product-tour-example').textContent(), /Exemplo/);
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => /monitoramento/.test(document.getElementById('productTourTitle').textContent));
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => /Boas-vindas/.test(document.getElementById('productTourTitle').textContent));
    await page.keyboard.press('Escape');
    await page.locator('#productTour').waitFor({ state: 'detached' });
    await page.getByText('Você pode rever o tour no menu').first().waitFor();
    assert.equal(await page.evaluate(() => document.getElementById('appShell').inert), false, 'a tela volta a receber clique');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('#appShell:not(.hidden)').waitFor();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#productTour').count(), 0, 'não reabre depois de pular');
    await page.evaluate(() => window.Atrium.App.startProductTour());
    await page.locator('#productTour .product-tour-card').waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  }

  // O atalho do QR Code chega ao formulário, com o passo a passo aberto e passando.
  {
    const { page, context, errors } = await open({ cookie: adminCookie, init: () => localStorage.setItem('atrium_product_tour_off', 'true') });
    await page.waitForFunction(() => window.Atrium?.App?.runSetupAction);
    await page.evaluate(() => window.Atrium.App.runSetupAction('totp'));
    await page.locator('#portalTotpForm').waitFor();
    await page.locator('#totpGuideMount [data-totp-caption]').waitFor();
    assert.match(await page.locator('#totpGuideMount [data-totp-caption]').textContent(), /toque no menu/);
    await page.locator('#totpGuideMount [data-totp-next]').click();
    assert.match(await page.locator('#totpGuideMount [data-totp-caption]').textContent(), /Transferir contas/);
    assert.equal(await page.locator('#totpGuideMount [data-totp-slide="1"]').isVisible(), true);
    assert.deepEqual(errors, []);
    await context.close();
  }

  // Membro comum: abre sozinho, sem a parada da OAB.
  {
    const { page, context, errors } = await open({ cookie: memberCookie });
    await page.locator('#productTour .product-tour-card').waitFor();
    const total = Number((await page.locator('.product-tour-count').textContent()).split(' de ')[1]);
    assert.ok(total === 7 || total === 8, String(total));
    for (let position = 0; position < 6; position += 1) await page.locator('[data-tour-next]').click();
    assert.match(await page.locator('#productTourBody').textContent(), /já foi coletado/);
    for (let position = 7; position < total; position += 1) await page.locator('[data-tour-next]').click();
    assert.match(await page.locator('[data-tour-next]').textContent(), /Concluir/);
    await page.locator('[data-tour-next]').click();
    await page.locator('#productTour').waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    await context.close();
  }

  // Quem já tinha a apresentação marcada neste navegador não é interrompido.
  {
    const { page, context } = await open({ cookie: memberCookie, init: () => localStorage.setItem('atrium_tour_seen', 'true') });
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#productTour').count(), 0);
    await context.close();
  }
} finally {
  await browser.close();
  await server.stop();
}
console.log('[PASS] Tour de primeiro acesso.');
process.exit(0);
