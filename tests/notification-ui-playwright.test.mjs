import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { startTestServer, postJson } from './helpers.mjs';

// Watchdog: um assert que falhe não pode deixar o processo preso por navegador
// órfão (causa do hang histórico desta suíte). Encerra com código distinto.
const watchdog = setTimeout(() => {
  console.error('WATCHDOG: suíte excedeu o tempo limite.');
  process.exit(3);
}, 100_000);

console.log('--- Executando Validação E2E Playwright da UI de Notificações e Atrium Mail ---');

const server = await startTestServer({
  env: {
    RESEND_API_KEY: '',
    RESEND_WEBHOOK_SECRET: 'synthetic-notification-test-webhook-secret',
    ATRIUM_EMAIL_FROM_NOTIFICATIONS: 'notificacoes@atrium.adv.br'
  }
});

const adminPassword = 'Admin-Secure-Password-2026!';
const collaboratorPassword = 'Collab-Secure-Password-2026!';

const currentStep = () => Math.floor(Date.now() / 30000);
const recoveryIndexes = new Map();
function loginProof(username, codes) {
  const index = recoveryIndexes.get(username) || 0;
  assert.ok(Array.isArray(codes) && codes[index], `Código de recuperação sintético indisponível para ${username}`);
  recoveryIndexes.set(username, index + 1);
  return codes[index];
}

function captureDenied(page, path) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout aguardando 403 de ${path}`)), 15000);
    page.on('response', function handler(resp) {
      if (!resp.url().endsWith(path) || resp.request().method() !== 'POST') return;
      page.off('response', handler);
      clearTimeout(timeout);
      resolve(resp);
    });
  });
}

const consoleErrors = [];
const stepUpNotices = [];
let stepUpDenials = 0;
let browser;

try {
  // 1. Setup Master Admin via HTTP
  const setupRes = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin',
    displayName: 'Super Admin Atrium',
    email: 'admin@atrium.adv.br',
    password: adminPassword
  });
  const setupData = await setupRes.json();
  const adminSetupStep = currentStep();
  const adminTotp = generateTotp(setupData.manualSecret, adminSetupStep);
  const verifyRes = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setupData.setupToken,
    code: adminTotp
  });
  assert.equal(verifyRes.status, 200, 'Setup inicial do Master Admin falhou');
  const adminCookie = verifyRes.headers.get('set-cookie').split(';')[0];
  const adminSetup = await verifyRes.json();
  const adminCsrf = adminSetup.csrfToken;

  // 2. Registrar Colaborador Comum
  const regRes = await postJson(`${server.baseUrl}/api/auth/register`, {
    username: 'colaborador',
    displayName: 'Advogado Associado',
    email: 'advogado@atrium.adv.br',
    password: collaboratorPassword
  }, { Cookie: adminCookie, 'X-CSRF-Token': adminCsrf });
  const regData = await regRes.json();
  const collabSetupStep = currentStep();
  const collabTotp = generateTotp(regData.manualSecret, collabSetupStep);

  const regVerifyRes = await postJson(`${server.baseUrl}/api/auth/register/verify`, {
    setupToken: regData.setupToken,
    code: collabTotp
  });
  assert.equal(regVerifyRes.status, 200, 'Verificação do registro de colaborador falhou');
  const collabRegistration = await regVerifyRes.json();

  // Buscar lista de usuários e aprovar colaborador
  const usersRes = await fetch(`${server.baseUrl}/api/auth/users`, { headers: { Cookie: adminCookie } });
  const usersList = (await usersRes.json()).users;
  const collabUser = usersList.find(u => u.username === 'colaborador');
  assert(collabUser, 'Colaborador não encontrado na lista');

  const approvalResponse = await postJson(`${server.baseUrl}/api/auth/users/manage`, {
    userId: collabUser.id,
    status: 'active',
    password: adminPassword,
    code: adminSetup.recoveryCodes[0]
  }, { Cookie: adminCookie, 'X-CSRF-Token': adminCsrf });
  assert.equal(approvalResponse.status, 200, 'Aprovação do colaborador exige step-up válido');
  recoveryIndexes.set('admin', 1);

  // 3. Inicializar Browser Playwright
  browser = await chromium.launch({ headless: true });

  // Helper para inspecionar página
  async function testViewports(role, loginUser, loginPass, recoveryCodes, isSuperAdmin) {
    for (const theme of ['light', 'dark']) {
      for (const viewport of [{ width: 1440, height: 900, name: 'Desktop' }, { width: 390, height: 844, name: 'Mobile' }]) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();

        page.on('response', resp => {
          if (resp.status() >= 400) {
            console.log(`[HTTP ${resp.status()}] ${resp.url()}`);
          }
        });

        page.on('console', msg => {
          if (msg.type() === 'error') {
            const text = msg.text();
            // O 403 de recurso do step-up é o próprio contrato validado aqui; ele é
            // contado e reconciliado com o número de denegações deliberadas.
            if (text === 'Failed to load resource: the server responded with a status of 403 (Forbidden)') {
              stepUpNotices.push(`[${viewport.name} ${theme} ${role}] ${text}`);
              return;
            }
            // Ignorar erros esperados de rede mockada ou recursos opcionais
            if (!text.includes('favicon') && !text.includes('net::ERR')) {
              consoleErrors.push(`[${viewport.name} ${theme} ${role}] ${text}`);
            }
          }
        });

        await page.goto(server.baseUrl, { waitUntil: 'networkidle' });

        // Fazer login
        await page.locator('#authLoginForm.active').waitFor({ state: 'visible' });
        await page.locator('#authLoginForm [name="username"]').fill(loginUser);
        await page.locator('#authLoginForm [name="password"]').fill(loginPass);
        await page.locator('#authLoginForm [name="code"]').fill(loginProof(loginUser, recoveryCodes));
        await page.locator('#authLoginForm button[type="submit"]').click();

        await page.locator('#appShell:not(.hidden)').waitFor({ state: 'visible' });

        // Configurar tema e dispensar onboarding / tour para não interceptar cliques
        await page.evaluate((th) => {
          document.documentElement.dataset.theme = th;
          document.body.setAttribute('data-theme', th);
          localStorage.setItem('jurisflow_tour_seen', 'true');
          localStorage.setItem('atrium_tour_seen', 'true');
          window.KellerCentral?.App?.closeGuidedTour?.();
          const backdrop = document.getElementById('guidedTourBackdrop');
          if (backdrop) backdrop.classList.add('hidden');
        }, theme);

        if (isSuperAdmin) {
          // --- VALIDAÇÃO SUPER ADMIN ---
          // Navegar para a view de Integrações
          await page.evaluate(() => {
            if (window.Atrium?.App?.switchView) {
              window.Atrium.App.switchView('integrations');
            }
          });

          // Card ATRIUM Mail deve estar presente e visível
          const mailCard = page.locator('#atriumMailIntegrationCard');
          await mailCard.waitFor({ state: 'visible' });
          assert.equal(await mailCard.count(), 1, 'Card ATRIUM Mail deve existir para Super Admin');

          // Validar que menciona o provider Resend no texto do card
          const cardText = await mailCard.textContent();
          assert(cardText.includes('Resend'), 'Card ATRIUM Mail deve indicar o provedor Resend');
          assert(cardText.includes('ATRIUM Mail'), 'Card deve ter o título ATRIUM Mail');

          // Validar ausência absoluta de campos de configuração SMTP legados
          const smtpHost = page.locator('#smtpHostInput, input[name="smtpHost"]');
          assert.equal(await smtpHost.count(), 0, 'Campo SMTP Host não deve mais existir na UI');
          const smtpPort = page.locator('#smtpPortInput, input[name="smtpPort"]');
          assert.equal(await smtpPort.count(), 0, 'Campo SMTP Port não deve mais existir na UI');
          const smtpUser = page.locator('#smtpUserInput, input[name="smtpUser"]');
          assert.equal(await smtpUser.count(), 0, 'Campo SMTP User não deve existir na UI');
          const smtpPass = page.locator('#smtpPassInput, input[name="smtpPassword"]');
          assert.equal(await smtpPass.count(), 0, 'Campo SMTP Pass não deve existir na UI');

          // Validar status chip, métricas e fila
          const statusChip = page.locator('#emailIntegrationStatus');
          assert.equal(await statusChip.count(), 1, 'Status chip do ATRIUM Mail deve existir');

          const queueCounter = page.locator('#atriumMailQueueCount');
          assert.equal(await queueCounter.count(), 1, 'Contador de fila de outbox deve existir');

          const todayCounter = page.locator('#atriumMailTodayCount');
          assert.equal(await todayCounter.count(), 1, 'Métrica de envios hoje deve existir');

          const monthCounter = page.locator('#atriumMailMonthCount');
          assert.equal(await monthCounter.count(), 1, 'Métrica de envios no mês deve existir');

           // Step-up do toggle: o master switch fica no drawer de preferências e o
           // cancelamento preserva o estado padrão (ativado).
           await page.locator('#btnConfigureMailPreferences').click();
           await page.locator('#mailPreferencesBackdrop:not(.hidden)').waitFor({ timeout: 10_000 });
           const toggleActive = page.locator('#atriumMailToggleCheckbox');
           await toggleActive.waitFor({ state: 'visible', timeout: 10_000 });
           assert.equal(await toggleActive.isChecked(), true, 'ATRIUM Mail deve iniciar ativado por padrão');
           const deniedToggle = captureDenied(page, '/api/admin/mail/toggle');
           await toggleActive.click({ noWaitAfter: true, timeout: 10_000 });
           const deniedResponse = await deniedToggle;
           stepUpDenials += 1;
           assert.equal(deniedResponse.status(), 403, 'toggle sem step-up deve ser recusado');
           assert.equal(deniedResponse.headers()['x-atrium-reauth'], 'required', 'toggle sinaliza reautenticação por X-Atrium-Reauth');
           await page.locator('#modalBackdrop[data-modal-mode="reauth"]:not(.hidden)').waitFor({ timeout: 10_000 });
           await page.locator('#modalCancel').click({ timeout: 10_000 });
           await page.locator('#modalBackdrop').waitFor({ state: 'hidden', timeout: 10_000 });
           await page.waitForFunction(() => document.getElementById('atriumMailToggleCheckbox')?.checked === true, null, { timeout: 10_000 });
           const afterCancelStatus = await page.request.get(`${server.baseUrl}/api/admin/mail/status`);
           assert.equal(afterCancelStatus.status(), 200);
           assert.equal((await afterCancelStatus.json()).stats.enabled, true, 'cancelar step-up preserva Mail ativado');
           assert.equal(await page.locator('#mailPreferencesBackdrop.hidden').count(), 1, 'O drawer fecha antes do prompt de step-up.');

          // Step-up do envio de teste: o modal Mail fecha para o prompt não ficar
          // encoberto e é restaurado no cancelamento, sem enfileirar mensagem.
          const testBtn = page.locator('#btnTestAtriumMail');
          assert.equal(await testBtn.count(), 1, 'Botão de enviar e-mail de teste deve existir');
          await testBtn.click();
          const testModal = page.locator('#emailTestBackdrop');
          await testModal.waitFor({ state: 'visible' });
          assert.equal(await testModal.isVisible(), true, 'Modal de teste de e-mail deve abrir');
          await page.locator('#emailTestRecipientInput').fill(`fluxo-${viewport.name}-${theme}@example.test`);
          const deniedTest = captureDenied(page, '/api/admin/mail/test');
          await page.locator('#emailTestSubmitBtn').click({ noWaitAfter: true, timeout: 10_000 });
          const deniedTestResponse = await deniedTest;
          stepUpDenials += 1;
          assert.equal(deniedTestResponse.status(), 403, 'teste Mail sem step-up deve ser recusado');
          assert.equal(deniedTestResponse.headers()['x-atrium-reauth'], 'required', 'teste Mail sinaliza reautenticação por X-Atrium-Reauth');
          assert.equal(await testModal.isHidden(), true, 'modal Mail deve abrir espaço para o prompt de step-up');
          const reauthPrompt = page.locator('#modalBackdrop[data-modal-mode="reauth"]:not(.hidden)');
          await reauthPrompt.waitFor({ timeout: 10_000 });
          const promptBox = await page.locator('#modalBackdrop .modal').boundingBox();
          assert.ok(promptBox && promptBox.width > 0 && promptBox.height > 0, 'prompt de step-up deve ter geometria visível');
          await page.locator('#modalBackdrop #modalCancel').click({ timeout: 10_000 });
          await page.locator('#modalBackdrop').waitFor({ state: 'hidden', timeout: 10_000 });
          await testModal.waitFor({ state: 'visible', timeout: 10_000 });
          assert.equal(await page.locator('#emailTestRecipientInput').inputValue(), `fluxo-${viewport.name}-${theme}@example.test`, 'cancelamento preserva o destinatário digitado');
          const queueAfterTest = await page.request.get(`${server.baseUrl}/api/admin/mail/status`);
          assert.equal((await queueAfterTest.json()).stats.queue?.QUEUED || 0, 0, 'cancelar step-up não enfileira mensagem');
          await page.locator('#emailTestClose').click({ timeout: 10_000 });
          await testModal.waitFor({ state: 'hidden' });

          // Testar interação real: Botão de destinatários externos abre o modal
          const addRecipBtn = page.locator('#btnAddExternalRecipient');
          assert.equal(await addRecipBtn.count(), 1, 'Botão de adicionar destinatário externo deve existir');
          await addRecipBtn.click();
          const recipModal = page.locator('#emailReceiverModalBackdrop');
          await recipModal.waitFor({ state: 'visible' });
          assert.equal(await recipModal.isVisible(), true, 'Modal de destinatário externo deve abrir');
          // Fechar modal de destinatário
          const closeRecipBtn = page.locator('#emailReceiverModalClose');
          if (await closeRecipBtn.count() > 0) await closeRecipBtn.click();
          else await page.locator('#receiverCancelBtn').click();
          await recipModal.waitFor({ state: 'hidden' });

          // Lista de destinatários externos
          const recipientsList = page.locator('#emailReceiversList');
          assert.equal(await recipientsList.count(), 1, 'Lista de destinatários externos deve existir');
        } else {
          // --- VALIDAÇÃO USUÁRIO COMUM ---
          // 1. Garantir que nenhuma chave de API ou segredo vazou no HTML renderizado
          const pageHtml = await page.content();
          assert(!pageHtml.includes('re_test_mock_secret_key'), 'Segredo RESEND_API_KEY não pode vazar no DOM!');
          assert(!pageHtml.includes('smtpHostInput'), 'Campos legados de SMTP não podem existir no DOM do usuário comum');

          // 2. Abrir modal de Perfil do Usuário
          await page.evaluate(() => {
            if (window.KellerAuth?.openProfile) {
              window.KellerAuth.openProfile();
            } else {
              const profileBtn = document.getElementById('userProfileTrigger') || document.querySelector('[data-action="profile"]');
              profileBtn?.click();
            }
          });

          // Seção de Notificações deve existir no perfil com selects de cadência
          const notifSection = page.locator('.profile-notification-preferences');
          await notifSection.waitFor({ state: 'visible' });
          assert.equal(await notifSection.count(), 1, 'Seção de Preferências de Notificação deve existir no perfil do usuário');

          const publicationCadence = page.locator('#userPrefPublicationCadence');
          assert.equal(await publicationCadence.count(), 1, 'Select de cadência de publicações deve existir');
          // Alterar opção de cadência no perfil
          await publicationCadence.selectOption('IMMEDIATE');
          assert.equal(await publicationCadence.inputValue(), 'IMMEDIATE', 'Usuário deve conseguir selecionar cadência imediata');

          const deadlineCadence = page.locator('#userPrefDeadlineCadence');
          assert.equal(await deadlineCadence.count(), 1, 'Select de cadência de prazos deve existir');

          const hearingCadence = page.locator('#userPrefHearingCadence');
          assert.equal(await hearingCadence.count(), 1, 'Select de cadência de audiências deve existir');

          // Usuário comum não deve ter acesso de administração global de e-mail
          const mailStatusResponse = await page.request.get(`${server.baseUrl}/api/admin/mail/status`);
          assert.equal(mailStatusResponse.status(), 403, 'Apenas master_admin pode consultar o control plane Mail');
          const adminMailCard = page.locator('#atriumMailIntegrationCard');
          if (await adminMailCard.count() > 0) {
            const isVisible = await adminMailCard.isVisible();
            assert(!isVisible || (await page.locator('#btnTestAtriumMail').count() === 0), 'Usuário comum não deve poder disparar teste global');
          }
        }

        await context.close();
      }
    }
  }

  // Executar para Super Admin
  await testViewports('SUPER_ADMIN', 'admin', adminPassword, adminSetup.recoveryCodes, true);
  console.log('✓ Super Admin UI (Desktop & Mobile, Light & Dark) 100% validada.');

  // Executar para Usuário Colaborador
  await testViewports('USER', 'colaborador', collaboratorPassword, collabRegistration.recoveryCodes, false);
  console.log('✓ Usuário Comum UI (Desktop & Mobile, Light & Dark) 100% validada.');

  assert.equal(consoleErrors.length, 0, `Erros encontrados no console: ${consoleErrors.join(', ')}`);
  assert.equal(stepUpNotices.length, stepUpDenials, `Avisos 403 do console (${stepUpNotices.length}) devem coincidir com as denegações deliberadas de step-up (${stepUpDenials})`);
  console.log(`✓ Zero novos erros no console do navegador; ${stepUpDenials} denegações de step-up esperadas e reconciliadas.`);
  console.log('--- Validação Playwright concluída com sucesso! ---');
} finally {
  clearTimeout(watchdog);
  await Promise.race([
    Promise.allSettled([browser?.close(), server.stop()]),
    new Promise(resolve => setTimeout(resolve, 8000))
  ]);
}
process.exit(0);
