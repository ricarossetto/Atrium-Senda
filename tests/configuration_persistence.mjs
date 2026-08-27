import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import { startTestServer } from './helpers.mjs';

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ locale: 'pt-BR', viewport: { width: 1440, height: 900 } });

try {
  // 1. Setup e login inicial
  const response = await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  assert.ok(response?.ok(), 'Página inicial carregou com sucesso.');
  
  await page.locator('#authSetupForm.active').waitFor();
  await page.locator('#authSetupForm [name="displayName"]').fill('Advogado Administrador');
  await page.locator('#authSetupForm [name="username"]').fill('admin');
  await page.locator('#authSetupForm [name="password"]').fill('Senha-Forte-JurisFlow-2026!');
  await page.locator('#authSetupForm [name="confirmPassword"]').fill('Senha-Forte-JurisFlow-2026!');
  const setupResponsePromise = page.waitForResponse(r => r.url().endsWith('/api/auth/setup') && r.request().method() === 'POST');
  await page.locator('#authSetupForm button[type="submit"]').click();
  const setupPayload = await (await setupResponsePromise).json();
  
  await page.locator('#authTotpSetupForm.active').waitFor();
  const secret = (await page.locator('#authManualSecret').textContent()).trim();
  const code = generateTotp(secret);
  await page.locator('#authTotpSetupForm [name="code"]').fill(code);
  await page.locator('#authTotpSetupForm button[type="submit"]').click();
  await page.locator('#authRecoveryStep.active').waitFor({ timeout: 8000 });
  await page.locator('#finishRecovery').click();
  await page.locator('#appShell:not(.hidden)').waitFor();

  // Fechar onboarding tour
  await page.evaluate(() => {
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('atrium_tour_seen', 'true');
    window.Atrium?.App?.closeGuidedTour();
    const backdrop = document.getElementById('guidedTourBackdrop');
    if (backdrop) backdrop.classList.add('hidden');
  });

  // 2. Navegar para Configurações
  await page.locator('button[data-view="configuration"]').click();
  await page.locator('#view-configuration.active').waitFor();

  // 3. Criar taskDefinition com 90 pontos
  await page.locator('#newConfigurationButton').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'visible' });
  await page.locator('[name="name"]').fill('TAREFA DEDICADA TESTE');
  await page.locator('[name="points"]').fill('90');
  await page.locator('[name="phase"]').fill('Judicial');
  
  const createSavePromise = page.waitForResponse(r => r.url().endsWith('/api/state') && r.request().method() === 'POST' && r.status() === 200);
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  await createSavePromise;

  // 4. Localizar e abrir para edição
  await page.waitForTimeout(100);
  const row = page.locator('#configurationList [data-config-index]', { hasText: 'TAREFA DEDICADA TESTE' });
  await row.waitFor({ state: 'visible' });
  await row.click();
  await page.locator('#modalBackdrop').waitFor({ state: 'visible' });

  // 5. Testar edições rápidas com coalescing (90 -> 92 -> 95)
  await page.locator('#modalForm [name="points"]').waitFor({ state: 'visible' });
  await page.locator('#modalForm [name="points"]').fill('92');
  await page.locator('#modalForm [name="points"]').fill('95');
  assert.equal(await page.locator('#modalForm [name="points"]').inputValue(), '95', 'Input deve conter 95.');
  assert.equal(await page.locator('#modalForm [name="name"]').inputValue(), 'TAREFA DEDICADA TESTE', 'Nome deve ser preservado.');

  const editSavePromise = page.waitForResponse(r => r.url().endsWith('/api/state') && r.request().method() === 'POST' && r.status() === 200);
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  await editSavePromise;

  // 6. Nível A: DOM / UI
  await page.locator('#configurationList [data-config-index]', { hasText: '95 pontos' }).waitFor({ state: 'visible' });

  // 7. Nível B: STORE na memória
  const storePoints = await page.evaluate(() => {
    const item = (window.Atrium?.Store || window.KellerCentral?.Store)?.state?.configuration?.taskDefinitions?.find(t => t.name === 'TAREFA DEDICADA TESTE');
    return item ? Number(item.points) : null;
  });
  assert.equal(storePoints, 95, 'Store em memória deve refletir 95 pontos.');

  // 8. Nível C: BACKEND persistido com reload completo
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#view-dashboard.active').waitFor();
  await page.locator('button[data-view="configuration"]').click();
  await page.locator('#view-configuration.active').waitFor();
  await page.locator('#configurationList [data-config-index]', { hasText: '95 pontos' }).waitFor({ state: 'visible' });

  const reloadedPoints = await page.evaluate(() => {
    const item = (window.Atrium?.Store || window.KellerCentral?.Store)?.state?.configuration?.taskDefinitions?.find(t => t.name === 'TAREFA DEDICADA TESTE');
    return item ? Number(item.points) : null;
  });
  assert.equal(reloadedPoints, 95, 'Após reload, 95 pontos devem estar preservados no Store.');

  console.log('✓ Teste dedicado de persistência de configurações aprovado (UI, Store, Backend e Reload).');
} finally {
  await browser.close();
  await server.stop();
}
