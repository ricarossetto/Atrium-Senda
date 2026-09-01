import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  prepareUiV2ConfigurationAdminFixture,
  prepareUiV2Page,
  startUiV2Session
} from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [configurationSource, officeSource, systemAdminSource, presenterSource, portalSource, indexSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/configuration.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/features/office-identity.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/features/system-admin.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/views/ui-v2/configuration-presenter.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/portal.js'), 'utf8'),
  readFile(path.join(ROOT, 'index.html'), 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 CONFIGURATION + SYSTEM ADMIN');
console.log('===============================================================\n');

assert.equal((portalSource.match(/createConfigurationFeature\s*\(/g) || []).length, 1);
assert.equal((portalSource.match(/createOfficeIdentityFeature\s*\(/g) || []).length, 1);
assert.equal((portalSource.match(/createSystemAdminFeature\s*\(/g) || []).length, 1);
assert.equal((portalSource.match(/createConfigurationAdminPresenter\s*\(/g) || []).length, 1);
assert.doesNotMatch(configurationSource, /^\s*import\s/m);
assert.doesNotMatch(configurationSource, /\bfetch\s*\(/);
assert.match(officeSource, /^import \{ Store \} from '\.\.\/core\/store\.js';/m);
assert.doesNotMatch(officeSource, /\b(?:fetch|secureFetch|XMLHttpRequest)\b/);
assert.doesNotMatch(systemAdminSource, /^\s*import\s/m);
assert.match(systemAdminSource, /fetchFn\('\/api\/system\/diagnostic', \{ credentials: 'same-origin' \}\)/);
assert.doesNotMatch(presenterSource, /\bStore\b|store\.state|secureFetch|\bfetch\s*\(|\.save\s*\(|\.flush\s*\(|\baudit\s*\(/);
assert.equal((indexSource.match(/id="uiModeControl"/g) || []).length, 1);

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });
  await prepareUiV2ConfigurationAdminFixture(page);

  const initialEvidence = await page.evaluate(() => ({
    state: JSON.stringify(window.Atrium.Store.state),
    ops: window.__uiV2ConfigurationAdminOps.length,
    requests: window.__uiV2ConfigurationAdminRequests.length,
    mutations: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));
  assert.equal(initialEvidence.ops, 0);
  assert.equal(initialEvidence.requests, 0, 'Render inicial de Configurações não deve disparar requests.');

  assert.equal(await page.locator('.configuration-v2-header h2').textContent(), 'Configurações do Escritório');
  assert.deepEqual(await page.locator('.configuration-nav-heading').allTextContents(), ['Estrutura', 'Equipe', 'Fluxo', 'Sistema']);
  assert.equal(await page.locator('#configurationTabs [data-config-section]').count(), 12);
  assert.equal(await page.locator('#openOfficeIdentityFromConfiguration').count(), 1);
  assert.equal(await page.locator('#uiModeControl').count(), 1);
  assert.equal(await page.locator('#uiModeControl').isHidden(), true);
  assert.equal(await page.locator('.configuration-metric').count(), 5);
  assert.equal(await page.locator('#configurationList .configuration-row').count(), 2);
  assert.equal(await page.locator('#configurationList .config-row-open').count(), 2);
  assert.equal(await page.locator('#configurationList [data-delete-config][aria-label^="Excluir"]').count(), 2);

  await page.locator('#configurationSearch').fill('minuta');
  assert.equal(await page.locator('#configurationList .configuration-row').count(), 1);
  assert.match(await page.locator('#configurationList').textContent(), /Preparar minuta sintética/);
  assert.equal(await page.evaluate(() => window.__uiV2ConfigurationAdminRequests.length), 0);

  await page.locator('[data-config-section="actionGroups"]').click();
  assert.equal(await page.locator('[data-config-section="actionGroups"]').getAttribute('aria-current'), 'page');
  assert.equal(await page.locator('#configurationSearch').inputValue(), '');
  assert.equal(await page.locator('#configurationList .configuration-row').count(), 2);
  await page.locator('#configurationList .config-row-open').first().click();
  await page.locator('#modalBackdrop[data-modal-mode="configuration"]:not(.hidden)').waitFor();
  assert.equal(await page.locator('#modalFields input').count(), 2);
  assert.equal(await page.locator('#appShell').getAttribute('inert'), '');
  await page.keyboard.press('Escape');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });

  await page.locator('#newConfigurationButton').click();
  await page.locator('#modalBackdrop[data-modal-mode="configuration"]:not(.hidden)').waitFor();
  assert.equal(await page.locator('#modalTitle').textContent(), 'Novo item de configuração');
  await page.locator('#modalCancel').click();

  await page.locator('[data-config-section="users"]').click();
  await page.locator('#configurationList [data-auth-user-id]').first().waitFor();
  assert.equal(await page.locator('#configurationList [data-auth-user-id]').count(), 4);
  assert.equal(await page.locator('[data-auth-user-id="master-admin-synthetic"] [data-auth-user-status]').count(), 0);
  assert.equal(await page.locator('#configurationList [data-auth-user-status]').count(), 3);
  assert.match(await page.locator('[data-auth-user-id="pending-user-synthetic"]').textContent(), /Aguardando aprovação/);
  assert.match(await page.locator('[data-auth-user-id="active-user-synthetic"]').textContent(), /Ativo/);
  assert.match(await page.locator('[data-auth-user-id="inactive-user-synthetic"]').textContent(), /Suspenso/);
  await page.locator('[data-auth-user-id="pending-user-synthetic"] [data-auth-user-status]').click();
  await page.waitForFunction(() => window.__uiV2ConfigurationAdminRequests.some(request => request.url === '/api/auth/users/manage'));
  const manageRequest = await page.evaluate(() => window.__uiV2ConfigurationAdminRequests.find(request => request.url === '/api/auth/users/manage'));
  assert.deepEqual(manageRequest, { url: '/api/auth/users/manage', method: 'POST', body: { userId: 'pending-user-synthetic', status: 'active' } });

  await page.evaluate(() => {
    window.Atrium.App.currentAuthRole = 'collaborator';
    window.Atrium.App.renderConfiguration();
  });
  assert.equal(await page.locator('#configurationList [data-auth-user-status]').count(), 0);
  await page.evaluate(() => {
    window.Atrium.App.currentAuthRole = 'master_admin';
    window.Atrium.App.renderConfiguration();
  });

  const identityTrigger = page.locator('#openOfficeIdentityFromConfiguration');
  await identityTrigger.focus();
  await identityTrigger.click();
  await page.locator('#officeSetupBackdrop:not(.hidden)').waitFor();
  await page.waitForFunction(() => document.activeElement?.id === 'officeInputName');
  assert.equal(await page.locator('#officeInputName').inputValue(), 'Escritório Mineral Sintético');
  assert.equal(await page.locator('#officeInputOab').inputValue(), 'OAB/RS 000000');
  assert.equal(await page.locator('#officeLogoPreview img').count(), 0);
  assert.equal(await page.locator('#appShell').getAttribute('inert'), '');
  await page.keyboard.press('Escape');
  await page.locator('#officeSetupBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'openOfficeIdentityFromConfiguration');

  const requestsBeforeDiagnostic = await page.evaluate(() => window.__uiV2ConfigurationAdminRequests.length);
  await page.locator('[data-config-section="diagnostic"]').click();
  await page.locator('.diagnostic-v2-panel').waitFor();
  assert.equal(await page.locator('.diagnostic-v2-card').count(), 4);
  assert.match(await page.locator('.diagnostic-v2-panel').textContent(), /AES-256-GCM/);
  assert.match(await page.locator('.diagnostic-v2-panel').textContent(), /TOTP RFC 6238/);
  assert.equal(await page.evaluate(before => window.__uiV2ConfigurationAdminRequests.slice(before).filter(request => request.url === '/api/system/diagnostic').length, requestsBeforeDiagnostic), 1);
  assert.equal(await page.evaluate(() => window.__uiV2ConfigurationAdminRequests.some(request => request.url.includes('/backup/'))), false);
  assert.equal(await page.evaluate(() => window.__uiV2ConfigurationAdminRequests.some(request => request.url === '/api/system/rebuild-runtime')), false);

  await page.evaluate(() => {
    localStorage.setItem('atrium:cache:temporary', 'remove');
    localStorage.setItem('legal-record-synthetic', 'preserve');
    localStorage.setItem('atrium:ui:mode', 'classic');
  });
  await page.locator('#btnClearUiCache').click();
  assert.deepEqual(await page.evaluate(() => ({
    cache: localStorage.getItem('atrium:cache:temporary'),
    legal: localStorage.getItem('legal-record-synthetic')
  })), { cache: null, legal: 'preserve' });
  await page.locator('#btnResetVisualPrefs').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('atrium:ui:mode')), 'classic');

  await page.locator('[data-config-section="backups"]').click();
  await page.locator('.backup-v2-panel').waitFor();
  assert.match(await page.locator('.backup-v2-panel').textContent(), /SHA-256/);
  assert.match(await page.locator('.backup-v2-panel').textContent(), /AES-256-GCM/);
  assert.doesNotMatch(await page.locator('.backup-v2-panel').textContent(), /HMAC-SHA256/);
  const restoreRequestsBefore = await page.evaluate(() => window.__uiV2ConfigurationAdminRequests.filter(request => request.url === '/api/system/backup/restore').length);
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#inputRestoreBackup').setInputFiles({ name: 'cancelled.atrium-backup', mimeType: 'application/json', buffer: Buffer.from('{}') });
  assert.equal(await page.evaluate(() => window.__uiV2ConfigurationAdminRequests.filter(request => request.url === '/api/system/backup/restore').length), restoreRequestsBefore);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#inputRestoreBackup').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{') });
  assert.equal(await page.evaluate(() => window.__uiV2ConfigurationAdminRequests.filter(request => request.url === '/api/system/backup/restore').length), restoreRequestsBefore);

  await page.evaluate(() => {
    window.Atrium.Store.state.contacts.push({ id: 'PII-MARKER-MUST-NOT-BE-SENT' });
  });
  await page.locator('[data-config-section="diagnostic"]').click();
  await page.locator('#btnOpenFeedbackModal').click();
  await page.locator('#modalBackdrop[data-modal-mode="feedback"]:not(.hidden)').waitFor();
  await page.locator('#field-type').selectOption('bug');
  await page.locator('#field-component').selectOption('Configurações');
  await page.locator('#field-message').fill('Mensagem sintética sem conteúdo confidencial.');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const feedbackRequest = await page.evaluate(() => window.__uiV2ConfigurationAdminRequests.find(request => request.url === '/api/system/feedback'));
  assert.deepEqual(feedbackRequest.body, { type: 'bug', component: 'Configurações', message: 'Mensagem sintética sem conteúdo confidencial.' });
  assert.equal(JSON.stringify(feedbackRequest.body).includes('PII-MARKER-MUST-NOT-BE-SENT'), false);

  const finalEvidence = await page.evaluate(() => ({
    state: JSON.stringify(window.Atrium.Store.state),
    mutations: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals,
    duplicateIds: [...document.querySelectorAll('[id]')].map(node => node.id).filter((id, index, ids) => ids.indexOf(id) !== index)
  }));
  assert.notEqual(finalEvidence.state, initialEvidence.state, 'A fixture explícita de PII deve caracterizar o teste de minimização.');
  assert.equal(finalEvidence.intervals, initialEvidence.intervals);
  assert.deepEqual(finalEvidence.duplicateIds, []);
  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ UI V2 Configuração/Admin: arquitetura, navegação, RBAC, identidade, diagnóstico, backup e feedback PASS.');
