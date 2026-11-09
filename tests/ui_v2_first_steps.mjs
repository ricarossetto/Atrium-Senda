import assert from 'node:assert/strict';
import { startUiV2Session } from './ui_v2_helpers.mjs';
import { computeFirstSteps, hasMonitoredOab, renderFirstSteps } from '../js/views/ui-v2/first-steps.js';

console.log('--- Iniciando Teste: bloco Comece por aqui e cadastro em dois passos ---');

// 1. A OAB de exemplo não conta como informada.
assert.equal(hasMonitoredOab([{ registration: 'OAB/UF 000000', active: true }]), false);
assert.equal(hasMonitoredOab([{ registration: 'OAB/RS 000000', active: true }]), false);
assert.equal(hasMonitoredOab([{ registration: 'OAB/RS 123456', active: false }]), false);
assert.equal(hasMonitoredOab([{ registration: 'OAB/RS 123456', active: true }]), true);
assert.equal(hasMonitoredOab(undefined), false);

// 2. Os passos saem do estado oficial.
const pending = computeFirstSteps({ terms: [], processes: [], tasks: [] });
assert.deepEqual(pending.map(step => [step.id, step.done]), [['oab', false], ['mfa', false], ['a1', false], ['processes', false], ['tasks', false]]);
const withCertificate = computeFirstSteps({ settings: { hasA1Certificate: true } }, { certificateValid: true });
assert.deepEqual(withCertificate.filter(step => ['a1', 'certificate', 'totp'].includes(step.id)).map(step => [step.id, step.done]), [['a1', true], ['certificate', true], ['totp', false]]);
assert.equal(computeFirstSteps({ settings: { hasA1Certificate: false } }).some(step => step.id === 'totp'), false, 'sem certificado, não pede QR Code');
assert.ok(computeFirstSteps({}).find(step => step.id === 'mfa').how.length > 2, 'cada passo ensina como fazer');
const done = computeFirstSteps({ terms: [{ registration: 'OAB/RS 123456' }], processes: [{}], tasks: [{}], settings: { hasA1Certificate: false } }, { mfaEnabled: true });
assert.ok(done.every(step => step.done));

// 3. Apresentação: quem não administra e quem já terminou não veem o bloco; ocultar persiste.
const container = { hidden: true, innerHTML: '', querySelector: () => null };
const documentRef = { getElementById: () => container };
const escapeHtml = value => String(value);
assert.equal(renderFirstSteps({ documentRef, state: {}, canManage: false, storage: null, escapeHtml }).visible, false);
assert.equal(renderFirstSteps({ documentRef, state: { terms: [{ registration: 'OAB/RS 123456' }], processes: [{}], tasks: [{}], settings: { hasA1Certificate: false } }, status: { mfaEnabled: true }, canManage: true, storage: null, escapeHtml }).visible, false);
assert.equal(renderFirstSteps({ documentRef, state: {}, canManage: true, storage: { getItem: () => 'true' }, escapeHtml }).visible, false);
const shown = renderFirstSteps({ documentRef, state: { terms: [{ registration: 'OAB/RS 123456' }] }, canManage: true, storage: null, escapeHtml });
assert.deepEqual(shown, { visible: true, pending: 4 });
assert.match(container.innerHTML, /Como fazer/);
assert.match(container.innerHTML, /data-setup-action="a1-yes"/);
assert.match(container.innerHTML, /1 de 5 concluídos/);

// 4. Jornada real: cadastro em dois passos, uma pergunta e o bloco no painel, sem wizard nem apresentação.
const session = await startUiV2Session({ viewport: { width: 1280, height: 800 } });
const { server, browser } = session;
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR' })).newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${server.baseUrl}/?auth=register`, { waitUntil: 'networkidle' });
  await page.locator('#authRegisterForm.active').waitFor();
  assert.equal(await page.locator('.auth-register-progress li').count(), 2, 'O cadastro tem dois passos.');
  const form = page.locator('#authRegisterForm');
  for (const [name, value] of Object.entries({ displayName: 'Advogada Teste', email: 'teste@example.test', username: 'advogada_teste', password: 'Senha-Sintetica-2026!', confirmPassword: 'Senha-Sintetica-2026!' })) {
    await form.locator(`[name="${name}"]`).fill(value);
  }
  await page.locator('#authRegisterNext').click();
  await form.locator('[name="workspaceName"]').fill('Escritório Teste');
  assert.match(await form.locator('#authRegisterOfficeStep').innerText(), /encontra suas publicações/);
  assert.equal(await page.locator('#authRegisterNext').innerText(), 'Cadastrar escritório');
  assert.equal(await page.locator('#authRegisterPlanStep').isVisible(), false, 'O plano não é um passo obrigatório.');
  await page.locator('#authRegisterNext').click();
  await page.locator('#skipMfaButton').click();
  await page.locator('#productTour .product-tour-card').waitFor();
  assert.equal(await page.locator('#onboardingCertificateBackdrop').isVisible(), false, 'O cadastro não pede certificado de cara.');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('atrium_pending_setup_wizard')), null);
  await page.locator('[data-tour-skip]').click();
  await page.locator('#productTour').waitFor({ state: 'detached' });
  await page.locator('#v2FirstSteps:not([hidden])').waitFor();
  await page.waitForTimeout(900);
  assert.equal(await page.locator('#setupWizardBackdrop').isVisible(), false, 'O questionário não abre sozinho.');
  assert.equal(await page.locator('#guidedTourBackdrop').isVisible().catch(() => false), false, 'A apresentação não abre sozinha.');
  assert.match(await page.locator('#v2FirstSteps').innerText(), /0 de 5 concluídos/);
  await page.locator('[data-first-step="oab"] [data-view-link="monitoring"]').click();
  await page.locator('#view-monitoring.active').waitFor();
  assert.match(await page.locator('#primaryTermRegistration').innerText(), /Informe sua OAB/);
  await page.locator('[data-view="dashboard"]').first().click();
  await page.locator('#view-dashboard.active').waitFor();
  await page.locator('[data-first-steps-hide]').click();
  assert.equal(await page.locator('#v2FirstSteps').isVisible(), false);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#view-dashboard.active').waitFor();
  assert.equal(await page.locator('#v2FirstSteps').isVisible(), false, 'Ocultar vale depois de recarregar.');
  assert.deepEqual(errors, []);
} finally {
  await session.stop();
}

console.log('[PASS] Comece por aqui e cadastro em dois passos.');
