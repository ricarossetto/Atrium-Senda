import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJudicialIntegrationsFeature } from '../js/features/judicial-integrations.js';
import { prepareUiV2JudicialFixture, prepareUiV2Page, startUiV2Session, UI_V2_JUDICIAL_STATUS } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [featureSource, presenterSource, portalSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/judicial-integrations.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/views/ui-v2/judicial-integrations-presenter.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/portal.js'), 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 JUDICIAL CONNECTIONS WORKSPACE');
console.log('===============================================================\n');

assert.equal((portalSource.match(/createJudicialIntegrationsFeature\s*\(/g) || []).length, 1);
assert.doesNotMatch(featureSource, /^\s*import\s/m);
assert.doesNotMatch(featureSource, /\bStore\b|store\.state|localStorage|sessionStorage|\bfetch\s*\(/);
assert.doesNotMatch(presenterSource, /\bStore\b|store\.state|localStorage|sessionStorage|\bfetch\s*\(|secureFetch|setTimeout|setInterval|passphrase|pfxBase64|portalTotpSecret|qrData|\baudit\s*\(/i);

const listeners = new Map();
const ids = ['certificateGuideButton', 'judicialSetupClose', 'judicialSetupBackdrop', 'certificateFileInput', 'certificateSetupForm', 'portalQrInput', 'portalTotpForm', 'removePortalTotpButton', 'resetJudicialConnectionsButton', 'savePortalCoverageButton', 'syncJudicialNowButton', 'launchPortalLoginButton', 'portalCoverageList'];
const fakeElements = new Map(ids.map(id => [id, {
  id,
  addEventListener(type, handler) { listeners.set(`${id}:${type}`, [...(listeners.get(`${id}:${type}`) || []), handler]); },
  classList: { contains: () => true },
  closest: () => null
}]));
let requests = 0;
let presentationInit = 0;
const unitFeature = createJudicialIntegrationsFeature({
  documentRef: { getElementById: id => fakeElements.get(id) || null },
  secureFetch: async () => { requests++; return { ok: true, async json() { return UI_V2_JUDICIAL_STATUS; } }; },
  presentation: { init() { presentationInit++; } }
});
assert.equal(unitFeature.init(), true);
assert.equal(unitFeature.init(), false);
assert.equal(requests, 0, 'init não pode consultar integração judicial.');
assert.equal(presentationInit, 1);
for (const key of ['certificateGuideButton:click', 'judicialSetupClose:click', 'judicialSetupBackdrop:click', 'certificateFileInput:change', 'certificateSetupForm:submit', 'portalQrInput:change', 'portalTotpForm:submit', 'removePortalTotpButton:click', 'resetJudicialConnectionsButton:click', 'savePortalCoverageButton:click', 'syncJudicialNowButton:click', 'launchPortalLoginButton:click', 'portalCoverageList:click']) {
  assert.equal(listeners.get(key)?.length, 1, `${key} deve possuir um listener.`);
}

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });
  const before = await page.evaluate(() => ({
    state: JSON.stringify(window.Atrium.Store.state),
    revision: window.Atrium.Store.revision,
    mutations: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));
  await prepareUiV2JudicialFixture(page);

  assert.equal(await page.locator('.v2-integrations-header h2').textContent(), 'Integrações seguras');
  assert.equal(await page.locator('.judicial-integration-card').count(), 1);
  assert.match(await page.locator('#certificateIntegrationStatus').textContent(), /1 ação/);
  assert.match(await page.locator('#certificateIntegrationDetail').textContent(), /Titular Judicial Sintética/);
  await page.locator('#certificateGuideButton').click();
  await page.locator('#judicialSetupBackdrop:not(.hidden)').waitFor();
  assert.equal(await page.locator('#setupCertificateStatus').textContent(), 'A1 validado no Sandbox');
  assert.equal(await page.locator('#setupPjeOfficeStatus').textContent(), 'Aplicativo oficial disponível');
  assert.equal(await page.locator('#setupTotpStatus').textContent(), '1 portal(is) vinculado(s)');
  assert.equal(await page.locator('#a1ActiveCard').isVisible(), true);
  assert.equal(await page.locator('#managedCoverageList .managed-coverage-row').count(), 5);
  assert.match(await page.locator('#managedCoverageSummary').textContent(), /2 fonte\(s\) pública\(s\) ativa\(s\).*1 portal\(is\) conectado\(s\).*1 requer/);
  assert.equal(await page.locator('#managedCoverageList [data-coverage-kind="public"] .managed-coverage-row').count(), 2);
  assert.equal(await page.locator('#managedCoverageList [data-coverage-kind="authenticated"] .managed-coverage-row').count(), 3);
  assert.deepEqual(await page.locator('#managedCoverageList [data-coverage-kind="public"] .status-chip').allTextContents(), ['Ativo', 'Ativo']);
  assert.deepEqual(await page.locator('#managedCoverageList [data-coverage-kind="public"] .managed-coverage-next > span').allTextContents(), ['API pública oficial', 'API pública oficial']);
  assert.match(await page.locator('#managedCoverageList [data-coverage-kind="public"]').textContent(), /7 publicação.*3\/3 processo/s);
  assert.match(await page.locator('#managedReadOnlyNotice').textContent(), /nunca pratica ciência, assinatura, petição, protocolo/i);
  assert.match(await page.locator('#a1HolderName').textContent(), /Titular Judicial Sintética/);
  assert.match(await page.locator('#a1DocAndIssuer').textContent(), /\*\*\*\.123\.\*\*\*-\*\*/);
  assert.equal(await page.locator('.portal-coverage-group').count(), 3);
  assert.equal(await page.locator('[data-portal-enabled]').count(), 3);
  assert.equal(await page.locator('[data-configure-totp]').count(), 2);
  assert.deepEqual(await page.locator('.portal-coverage-row small').allTextContents(), [
    'Conectado · 2FA protegido · verificado',
    'Ação necessária · 2FA não vinculado · experimental',
    'Não configurado · sem TOTP local · não verificado em portal real'
  ]);
  assert.equal(await page.locator('#totpPortalSelect option').count(), 3);
  assert.match(await page.locator('.judicial-setup-footer .v2-only').allTextContents().then(items => items.join(' ')), /cadência, backoff e pausas para ação humana/);
  assert.match(await page.locator('.portal-auth-guide').textContent(), /certificado válido não significa sessão autenticada/i);
  assert.equal(await page.locator('#launchPortalLoginButton').textContent(), 'Abrir sessão assistida');
  await page.locator('#launchPortalLoginButton').click();
  await page.waitForFunction(() => window.__uiV2JudicialRequests.some(request => request.url.endsWith('/connect')));

  const after = await page.evaluate(() => ({
    state: JSON.stringify(window.Atrium.Store.state),
    revision: window.Atrium.Store.revision,
    mutations: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals,
    requests: window.__uiV2JudicialRequests
  }));
  assert.equal(after.state, before.state);
  assert.equal(after.revision, before.revision);
  assert.equal(after.mutations, before.mutations);
  assert.equal(after.intervals, before.intervals);
  const assistedRequest = after.requests.find(request => request.url.endsWith('/connect'));
  assert.deepEqual(assistedRequest.body, { portalIds: ['tj-sintetico', 'trf-sintetico'] });
  assert.equal(assistedRequest.method, 'POST');
  assert.ok(after.requests.filter(request => !request.url.endsWith('/connect')).every(request => request.method === 'GET' && request.url === '/api/integrations/judicial'));
  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ UI V2 Judicial Integrations: arquitetura, status, A1, cobertura e zero mutação PASS.');
