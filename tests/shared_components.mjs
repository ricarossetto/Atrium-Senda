import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { startTestServer } from './helpers.mjs';

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: 'pt-BR', viewport: { width: 1440, height: 900 } });
const pageErrors = [];

page.on('pageerror', error => pageErrors.push(error.message));
await page.addInitScript(() => {
  const probe = { listeners: {} };
  globalThis.__sharedComponentsProbe = probe;
  const nativeAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    const target = this === document ? 'document' : this === globalThis ? 'window' : this?.id;
    if (target && ['modalClose', 'modalCancel', 'modalBackdrop', 'themeToggleButton', 'globalSearch', 'document'].includes(target)) {
      const key = `${target}:${type}`;
      probe.listeners[key] = (probe.listeners[key] || 0) + 1;
    }
    return nativeAddEventListener.call(this, type, listener, options);
  };
});

try {
  const response = await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  assert.ok(response?.ok(), 'O portal deve carregar para o teste dos componentes compartilhados.');
  await authenticate();
  await page.locator('#appShell:not(.hidden)').waitFor();
  await dismissTour();

  const expectedListenerKeys = [
    'modalClose:click',
    'modalCancel:click',
    'modalBackdrop:click',
    'themeToggleButton:click',
    'globalSearch:input',
    'globalSearch:keydown'
  ];
  await page.waitForFunction(keys => keys.every(key => globalThis.__sharedComponentsProbe?.listeners?.[key] >= 1), expectedListenerKeys);
  const initialListeners = await readListeners();
  for (const key of expectedListenerKeys) {
    assert.equal(initialListeners[key], 1, `${key} deve ser registrado uma única vez.`);
  }

  await assertModalBehavior();
  await assertToastBehavior();
  await assertThemeBehavior();
  await assertGlobalSearchBehavior();
  await assertConflictToast();

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('keller:authenticated', { detail: window.KellerAuth.currentUser }));
  });
  await page.waitForTimeout(250);
  assert.deepEqual(await readListeners(), initialListeners, 'Autenticação repetida não pode duplicar listeners compartilhados.');

  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light', 'O tema claro deve sobreviver ao reload.');
  assert.equal(await page.evaluate(() => localStorage.getItem('atrium_theme')), 'light', 'A preferência de tema deve permanecer persistida.');
  assert.deepEqual(pageErrors, [], `Componentes compartilhados geraram pageerror: ${pageErrors.join(' | ')}`);

  console.log('✓ Componentes compartilhados aprovados: Modal, Toast, Theme, busca global, conflito 409 e listeners únicos.');
} finally {
  await browser.close();
  await server.stop();
}

async function authenticate() {
  await page.locator('#authSetupForm.active').waitFor();
  await page.locator('#authSetupForm [name="displayName"]').fill('Advogada Componentes');
  await page.locator('#authSetupForm [name="username"]').fill('admin_componentes');
  await page.locator('#authSetupForm [name="password"]').fill('Senha-Componentes-2026!');
  await page.locator('#authSetupForm [name="confirmPassword"]').fill('Senha-Componentes-2026!');
  await page.locator('#authSetupForm button[type="submit"]').click();

  await page.locator('#authTotpSetupForm.active').waitFor();
  const secret = (await page.locator('#authManualSecret').textContent()).trim();
  await page.locator('#authTotpSetupForm [name="code"]').fill(generateTotp(secret));
  await page.locator('#authTotpSetupForm button[type="submit"]').click();
  await page.locator('#authRecoveryStep.active').waitFor();
  await page.locator('#finishRecovery').click();
}

async function dismissTour() {
  await page.evaluate(() => {
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('atrium_tour_seen', 'true');
    window.Atrium.App.closeGuidedTour();
  });
}

async function assertModalBehavior() {
  await page.evaluate(() => {
    const app = window.Atrium.App;
    app.configurationSection = 'taskDefinitions';
    app.openConfigurationModal();
    const points = document.querySelector('#modalForm [name="points"]');
    points.focus();
    points.value = '95';
    points.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(60);
  assert.equal(await page.locator('#modalTitle').textContent(), 'Novo item de configuração', 'O modal deve renderizar título e campos.');
  assert.equal(await page.locator('#modalForm [name="points"]').inputValue(), '95', 'A edição rápida do campo de pontos deve ser preservada.');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'points', 'O timer de foco não pode roubar foco de outro campo do modal.');

  await page.locator('#modalForm [name="name"]').fill('TAREFA COMPONENTE COMPARTILHADO');
  await page.locator('#modalForm [name="phase"]').fill('Judicial');
  const saveResponse = page.waitForResponse(request => request.url().endsWith('/api/state') && request.request().method() === 'POST' && request.status() === 200);
  await page.locator('#modalForm button[type="submit"]').click();
  await saveResponse;
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const savedPoints = await page.evaluate(() => window.Atrium.Store.state.configuration.taskDefinitions
    .find(item => item.name === 'TAREFA COMPONENTE COMPARTILHADO')?.points);
  assert.equal(Number(savedPoints), 95, 'O submit do modal deve continuar integrado ao fluxo de domínio.');

  await openSyntheticModal();
  await page.waitForTimeout(30);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'value', 'O autofocus inicial vigente deve ser preservado.');
  await page.locator('#modalClose').click();
  await assertModalClosed('O botão de fechar deve encerrar o modal.');
  await openSyntheticModal();
  await page.locator('#modalCancel').click();
  await assertModalClosed('O botão cancelar deve encerrar o modal.');
  await openSyntheticModal();
  await page.evaluate(() => document.getElementById('modalBackdrop').dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await assertModalClosed('Um clique no backdrop deve encerrar o modal.');
  await openSyntheticModal();
  await page.keyboard.press('Escape');
  await assertModalClosed('Escape deve encerrar o modal.');
}

async function openSyntheticModal() {
  await page.evaluate(() => window.Atrium.App.openModal(
    'shared-test',
    'Modal compartilhado',
    'Caracterização',
    [{ name: 'value', label: 'Valor', required: true }],
    { value: 'preservado' }
  ));
  await page.locator('#modalBackdrop').waitFor({ state: 'visible' });
}

async function assertModalClosed(message) {
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => window.Atrium.App.modalMode), null, message);
}

async function assertToastBehavior() {
  await page.evaluate(() => {
    document.getElementById('toastRegion').replaceChildren();
    window.Atrium.App.toast('Aviso compartilhado');
    window.Atrium.App.toast('Falha compartilhada', 'error');
  });
  const toasts = page.locator('#toastRegion .toast');
  assert.equal(await toasts.count(), 2, 'Toasts consecutivos devem formar uma fila visível.');
  assert.equal(await toasts.nth(0).textContent(), 'Aviso compartilhado', 'O toast deve preservar a mensagem.');
  await expectClass(toasts.nth(1), 'error', 'O toast deve preservar o tipo visual.');
  await page.waitForTimeout(4400);
  assert.equal(await toasts.count(), 0, 'Toasts devem desaparecer após o tempo vigente.');
}

async function assertThemeBehavior() {
  await page.evaluate(() => window.Atrium.App.setTheme('dark'));
  assert.equal(await page.locator('html').getAttribute('data-theme'), null, 'O tema escuro deve remover o atributo data-theme.');
  assert.equal(await page.evaluate(() => localStorage.getItem('atrium_theme')), 'dark', 'O tema escuro deve usar a chave de armazenamento vigente.');
  await page.locator('#themeToggleButton').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light', 'O toggle deve aplicar o tema claro.');
  assert.equal(await page.locator('#themeToggleText').textContent(), 'Tema Claro', 'O rótulo do tema deve ser atualizado.');
  assert.equal(await page.evaluate(() => localStorage.getItem('atrium_theme')), 'light', 'O tema deve ser persistido no armazenamento local.');
  await page.locator('#toastRegion .toast.success', { hasText: 'Tema alternado para Modo Claro.' }).waitFor();
}

async function assertGlobalSearchBehavior() {
  await page.evaluate(() => {
    window.Atrium.Store.state.contacts.push({
      id: 'contact-shared-search',
      name: 'Contato Busca Compartilhada',
      document: '000.000.000-00',
      email: 'busca@example.test',
      phone: '(55) 99999-0000',
      role: 'Cliente'
    });
  });

  await page.keyboard.press('Control+K');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'globalSearch', 'Ctrl+K deve focar a busca global.');
  await page.locator('#globalSearch').fill('Busca Compartilhada');
  await page.locator('#globalSearchPalette:not(.hidden)').waitFor();
  const result = page.locator('[data-search-target="contact"][data-search-id="contact-shared-search"]');
  await result.waitFor();
  await result.click();
  await page.locator('#view-contacts.active').waitFor();
  assert.equal(await page.locator('#contactSearch').inputValue(), 'Contato Busca Compartilhada', 'A seleção deve manter a navegação específica do domínio.');
  await page.locator('#globalSearchPalette.hidden').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#globalSearch').inputValue(), '', 'A seleção deve limpar a busca global.');

  await page.locator('#globalSearch').focus();
  await page.locator('#globalSearch').fill('Busca Compartilhada');
  await page.locator('#globalSearchPalette:not(.hidden)').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('#globalSearchPalette.hidden').waitFor({ state: 'attached' });
  assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'globalSearch', 'Escape deve fechar e desfocar a busca.');
}

async function assertConflictToast() {
  const before = await page.locator('#toastRegion .toast.error').count();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('atrium:store-persistence-conflict')));
  const conflict = page.locator('#toastRegion .toast.error', { hasText: 'Os dados foram atualizados em outra aba. Recarregando a versão mais recente…' });
  await conflict.waitFor();
  assert.equal(await page.locator('#toastRegion .toast.error').count(), before + 1, 'O conflito 409 deve gerar exatamente um toast de erro.');
}

async function expectClass(locator, className, message) {
  const classes = String(await locator.getAttribute('class')).split(/\s+/);
  assert.ok(classes.includes(className), message);
}

function readListeners() {
  return page.evaluate(() => structuredClone(globalThis.__sharedComponentsProbe.listeners));
}
