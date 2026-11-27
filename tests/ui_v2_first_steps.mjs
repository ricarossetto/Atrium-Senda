import assert from 'node:assert/strict';
import { startUiV2Session } from './ui_v2_helpers.mjs';
import { FIRST_STEPS_HIDDEN_KEY, computeFirstSteps, firstStepsHiddenUserKey, hasMonitoredOab, renderFirstSteps } from '../js/views/ui-v2/first-steps.js';

console.log('--- Iniciando Teste: bloco Comece por aqui e cadastro em dois passos ---');

// 1. A OAB de exemplo não conta como informada.
assert.equal(hasMonitoredOab([{ registration: 'OAB/UF 000000', active: true }]), false);
assert.equal(hasMonitoredOab([{ registration: 'OAB/RS 000000', active: true }]), false);
assert.equal(hasMonitoredOab([{ registration: 'OAB/RS 123456', active: false }]), false);
assert.equal(hasMonitoredOab([{ registration: 'OAB/RS 123456', active: true }]), true);
assert.equal(hasMonitoredOab(undefined), false);

// 2. Os passos saem do estado oficial.
const pending = computeFirstSteps({ terms: [], processes: [], tasks: [] });
// Ordem por valor: OAB, publicações, processos e tarefa antes de proteção e certificado.
assert.deepEqual(pending.map(step => [step.id, step.done]), [['oab', false], ['publications', false], ['processes', false], ['tasks', false], ['mfa', false], ['a1', false]]);
const withCertificate = computeFirstSteps({ settings: { hasA1Certificate: true } }, { certificateValid: true });
assert.deepEqual(withCertificate.filter(step => ['a1', 'certificate', 'totp'].includes(step.id)).map(step => [step.id, step.done]), [['a1', true], ['certificate', true], ['totp', false]]);
assert.equal(computeFirstSteps({ settings: { hasA1Certificate: false } }).some(step => step.id === 'totp'), false, 'sem certificado, não pede QR Code');
assert.ok(computeFirstSteps({}).find(step => step.id === 'mfa').how.length > 2, 'cada passo ensina como fazer');
const done = computeFirstSteps({ terms: [{ registration: 'OAB/RS 123456' }], intimations: [{}], processes: [{}], tasks: [{}], settings: { hasA1Certificate: false } }, { mfaEnabled: true });
assert.ok(done.every(step => step.done));

// 2b. Passo de publicações: estado real da primeira busca, sem inventar resultado.
const oab = { terms: [{ registration: 'OAB/RS 123456' }] };
const pub = (state, firstSync) => computeFirstSteps(state, {}, firstSync).find(step => step.id === 'publications');
assert.equal(pub({}).detail, 'Depois de informar a OAB, as publicações dos últimos 60 dias aparecem aqui.');
assert.deepEqual(pub({}).actions, [], 'Sem OAB, o passo não oferece ação própria: o passo da OAB vem antes');
const running = pub(oab, { status: 'running' });
assert.equal(running.title, 'Buscando suas publicações');
assert.equal(running.busy, true);
assert.deepEqual(running.actions, []);
const empty = pub(oab, { status: 'done' });
assert.match(empty.detail, /não trouxe publicações nos últimos 60 dias/);
assert.deepEqual(empty.actions.map(action => action.view), ['monitoring'], 'Sem publicação: acompanhar processo; a planilha fica no passo seguinte, sem botão repetido');
assert.match(pub(oab, { status: 'failed' }).detail, /não terminou\. Tente de novo pelo botão Sincronizar/);
const found = pub({ ...oab, intimations: [{}, {}, { active: false }] }, { status: 'done' });
assert.equal(found.done, true);
assert.equal(found.detail, '2 publicações encontradas.');

// 3. Apresentação: quem não administra e quem já terminou não veem o bloco; ocultar persiste.
const container = { hidden: true, innerHTML: '', querySelector: () => null };
const documentRef = { getElementById: () => container };
const escapeHtml = value => String(value);
assert.equal(renderFirstSteps({ documentRef, state: {}, canManage: false, storage: null, escapeHtml }).visible, false);
assert.equal(renderFirstSteps({ documentRef, state: { terms: [{ registration: 'OAB/RS 123456' }], intimations: [{}], processes: [{}], tasks: [{}], settings: { hasA1Certificate: false } }, status: { mfaEnabled: true }, canManage: true, storage: null, escapeHtml }).visible, false);
assert.equal(renderFirstSteps({ documentRef, state: {}, canManage: true, storage: { getItem: () => 'true' }, escapeHtml }).visible, false);
// A marcação do servidor esconde o bloco mesmo com o armazenamento local vazio.
assert.equal(renderFirstSteps({ documentRef, state: {}, canManage: true, hiddenForUser: true, storage: { getItem: () => null }, escapeHtml }).visible, false);
// Ocultado neste navegador para esta conta: a marcação é levada ao servidor; chave global de outro usuário não contamina.
const scopedUserKey = firstStepsHiddenUserKey({ workspaceId: 'ws-teste', id: 'usr-teste' });
assert.equal(scopedUserKey, `${FIRST_STEPS_HIDDEN_KEY}:ws-teste:usr-teste`);
let hides = 0;
assert.equal(renderFirstSteps({ documentRef, state: { terms: [{ registration: 'OAB/RS 123456' }] }, canManage: true, userKey: scopedUserKey, storage: { getItem: key => (key === FIRST_STEPS_HIDDEN_KEY ? 'true' : null) }, escapeHtml, onHide: () => { hides += 1; } }).visible, true);
assert.equal(hides, 0, 'chave global de outro usuário não oculta nem grava no perfil');
assert.equal(renderFirstSteps({ documentRef, state: {}, canManage: true, userKey: scopedUserKey, storage: { getItem: key => (key === scopedUserKey ? 'true' : null) }, escapeHtml, onHide: () => { hides += 1; } }).visible, false);
assert.equal(hides, 1, 'marcação local vinculada ao usuário sobe para o servidor');
renderFirstSteps({ documentRef, state: {}, canManage: true, hiddenForUser: true, userKey: scopedUserKey, storage: { getItem: key => (key === scopedUserKey ? 'true' : null) }, escapeHtml, onHide: () => { hides += 1; } });
assert.equal(hides, 1, 'com a marcação no servidor, não envia de novo');
const shown = renderFirstSteps({ documentRef, state: { terms: [{ registration: 'OAB/RS 123456' }] }, canManage: true, storage: null, escapeHtml });
assert.deepEqual(shown, { visible: true, pending: 5 });
assert.match(container.innerHTML, /Como fazer/);
assert.match(container.innerHTML, /data-setup-action="a1-yes"/);
assert.match(container.innerHTML, /1 de 6 concluídos/);
const busy = renderFirstSteps({ documentRef, state: { terms: [{ registration: 'OAB/RS 123456' }] }, firstSync: { status: 'running' }, canManage: true, storage: null, escapeHtml });
assert.equal(busy.visible, true);
assert.match(container.innerHTML, /data-first-step="publications" aria-busy="true"/);
assert.match(container.innerHTML, /Buscando suas publicações/);

// 4. Jornada real: cadastro em dois passos (sem plano nem autenticador), uma pergunta e o bloco no painel, sem wizard nem apresentação.
const session = await startUiV2Session({ viewport: { width: 1280, height: 800 } });
const { server, browser } = session;
try {
  const firstContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR' });
  const page = await firstContext.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${server.baseUrl}/?auth=register`, { waitUntil: 'networkidle' });
  await page.locator('#authRegisterForm.active').waitFor();
  assert.equal(await page.locator('.auth-register-progress li').count(), 2, 'O cadastro tem dois passos.');
  const form = page.locator('#authRegisterForm');
  for (const [name, value] of Object.entries({ displayName: 'Advogada Teste', email: 'teste@example.test', password: 'Senha-Sintetica-2026!', confirmPassword: 'Senha-Sintetica-2026!' })) {
    await form.locator(`[name="${name}"]`).fill(value);
  }
  await page.locator('#authRegisterNext').click();
  await form.locator('[name="workspaceName"]').fill('Escritório Teste');
  assert.match(await form.locator('#authRegisterOfficeStep').innerText(), /encontra suas publicações/);
  assert.equal(await page.locator('#authRegisterNext').innerText(), 'Criar escritório', 'O escritório é o último passo; o plano fica para a assinatura.');
  await page.locator('#authRegisterNext').click();
  await page.locator('#productTour .product-tour-card').waitFor();
  assert.equal(await page.locator('#onboardingCertificateBackdrop').isVisible(), false, 'O cadastro não pede certificado de cara.');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('atrium_pending_setup_wizard')), null);
  await page.locator('[data-tour-skip]').click();
  await page.locator('#productTour').waitFor({ state: 'detached' });
  await page.locator('#v2FirstSteps:not([hidden])').waitFor();
  await page.waitForTimeout(900);
  assert.equal(await page.locator('#setupWizardBackdrop').isVisible(), false, 'O questionário não abre sozinho.');
  assert.equal(await page.locator('#guidedTourBackdrop').isVisible().catch(() => false), false, 'A apresentação não abre sozinha.');
  assert.match(await page.locator('#v2FirstSteps').innerText(), /0 de 6 concluídos/);
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

  // 5. Outro navegador, mesmo usuário (armazenamento vazio): nem o tour nem o bloco voltam.
  const otherContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR' });
  await otherContext.addCookies(await firstContext.cookies());
  const other = await otherContext.newPage();
  other.on('pageerror', error => errors.push(error.message));
  await other.goto(`${server.baseUrl}/`, { waitUntil: 'networkidle' });
  await other.locator('#view-dashboard.active').waitFor();
  assert.equal(await other.evaluate(() => Object.keys(localStorage).some(key => /tour|first_steps/.test(key))), false, 'Contexto novo, sem marcação local.');
  await other.waitForTimeout(1500);
  assert.equal(await other.locator('#productTour').count(), 0, 'O tour não reabre em outro navegador.');
  assert.equal(await other.locator('#v2FirstSteps').isVisible(), false, 'O bloco ocultado não reaparece em outro navegador.');
  assert.deepEqual(errors, []);
  await otherContext.close();
} finally {
  await session.stop();
}

console.log('[PASS] Comece por aqui e cadastro em dois passos.');
