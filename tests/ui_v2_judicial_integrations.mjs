import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJudicialIntegrationsFeature } from '../js/features/judicial-integrations.js';
import { prepareUiV2JudicialFixture, prepareUiV2Page, startUiV2Session, UI_V2_JUDICIAL_STATUS, UI_V2_PJE_STATUS } from './ui_v2_helpers.mjs';

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
assert.match(featureSource, /renderPjeCommunications\(\{ page: 1 \}\)/);
assert.match(featureSource, /renderPjeCommunications\(\{ page: pjeCommunicationsPage \+ step, direction: step \}\)/);
assert.doesNotMatch(featureSource, /\bStore\b|store\.state|localStorage|sessionStorage|\bfetch\s*\(/);
assert.doesNotMatch(presenterSource, /\bStore\b|store\.state|localStorage|sessionStorage|\bfetch\s*\(|secureFetch|setTimeout|setInterval|passphrase|pfxBase64|portalTotpSecret|qrData|\baudit\s*\(/i);

const listeners = new Map();
const ids = ['certificateGuideButton', 'judicialSetupClose', 'judicialSetupBackdrop', 'certificateFileInput', 'certificateSetupForm', 'portalQrInput', 'portalTotpForm', 'removePortalTotpButton', 'resetJudicialConnectionsButton', 'savePortalCoverageButton', 'syncJudicialNowButton', 'portalCoverageList', 'managedCoverageList', 'pjePortalsGrid', 'pjeConfigSave', 'pjeCommunicationsFilters', 'pjeCommunicationsPager'];
const fakeElements = new Map(ids.map(id => [id, {
  id,
  addEventListener(type, handler) { listeners.set(`${id}:${type}`, [...(listeners.get(`${id}:${type}`) || []), handler]); },
  classList: { contains: () => true },
  closest: () => null
}]));
let requests = 0;
let presentationInit = 0;
const unitRequests = [];
const unitFeature = createJudicialIntegrationsFeature({
  documentRef: { getElementById: id => fakeElements.get(id) || null },
  secureFetch: async (url, options = {}) => {
    requests++;
    unitRequests.push({ url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined });
    if (String(url).startsWith('/api/integrations/judicial/pje')) return { ok: true, async json() { return UI_V2_PJE_STATUS; } };
    return { ok: true, async json() { return UI_V2_JUDICIAL_STATUS; } };
  },
  presentation: { init() { presentationInit++; } },
  pollIntervalMs: 1
});
assert.equal(unitFeature.init(), true);
assert.equal(unitFeature.init(), false);
assert.equal(requests, 0, 'init não pode consultar integração judicial, inclusive o painel PJe.');
assert.equal(presentationInit, 1);
for (const key of ['certificateGuideButton:click', 'judicialSetupClose:click', 'judicialSetupBackdrop:click', 'certificateFileInput:change', 'certificateSetupForm:submit', 'portalQrInput:change', 'portalTotpForm:submit', 'removePortalTotpButton:click', 'resetJudicialConnectionsButton:click', 'savePortalCoverageButton:click', 'syncJudicialNowButton:click', 'portalCoverageList:click', 'managedCoverageList:click', 'pjePortalsGrid:click', 'pjeConfigSave:click', 'pjeCommunicationsFilters:change', 'pjeCommunicationsPager:click']) {
  assert.equal(listeners.get(key)?.length, 1, `${key} deve possuir um listener.`);
}
let monitoredSyncCalls = 0;
unitFeature.syncEprocNow = async () => { monitoredSyncCalls += 1; return true; };
await listeners.get('syncJudicialNowButton:click')[0]();
assert.equal(monitoredSyncCalls, 1, 'Botão do rodapé deve abrir o fluxo oficial com acompanhamento eproc.');
unitFeature.status = {
  portals: [
    { id: 'eproc-sintetico-a', system: 'eproc' },
    { id: 'eproc-sintetico-b', system: 'EPROC' },
    { id: 'pje-sintetico', system: 'PJe' },
    { id: 'portal-generico', system: 'Portal judicial' }
  ],
  managedCoverage: []
};
const configuredEprocPortals = [];
unitFeature.openPortalConfiguration = async portalId => { configuredEprocPortals.push(portalId); return true; };
for (const portalId of ['eproc-sintetico-a', 'eproc-sintetico-b']) {
  assert.equal(await unitFeature.reconnectPortal(portalId), true);
}
assert.deepEqual(configuredEprocPortals, ['eproc-sintetico-a', 'eproc-sintetico-b']);
const readyFeature = createJudicialIntegrationsFeature({
  documentRef: { getElementById: () => null, querySelectorAll: () => [] }
});
readyFeature.status = { portals: [
  { id: 'legacy-ready-a', canonicalId: 'eproc-ready-a', system: 'eproc', requiresTotp: false, credentialConfigured: true },
  { id: 'eproc-ready-b', system: 'eproc', requiresTotp: true, totpConfigured: true, credentialConfigured: true }
], managedCoverage: [] };
const readyRequests = [];
readyFeature.syncEprocNow = async (_jobId, options) => { readyRequests.push(options.portalIds); };
await readyFeature.openPortalConfiguration('eproc-ready-a');
await readyFeature.reconnectPortal('eproc-ready-b');
assert.deepEqual(readyRequests, [['eproc-ready-a'], ['eproc-ready-b']], 'Credenciais prontas devem iniciar somente o portal clicado, sem repetir A1/QR.');
let schedulerCalls = 0;
let genericSyncCalls = 0;
unitFeature.syncEprocNow = async () => { schedulerCalls++; };
unitFeature.syncNow = async () => { genericSyncCalls++; };
listeners.get('managedCoverageList:click')[0]({
  target: { closest: selector => selector === '[data-portal-action]' ? { dataset: { portalAction: 'sync', portalId: 'eproc-sintetico-a' } } : null }
});
assert.equal(schedulerCalls, 1, 'Sincronizar eproc conectado deve reutilizar o scheduler eproc oficial.');
assert.equal(genericSyncCalls, 0);
unitRequests.length = 0;
listeners.get('managedCoverageList:click')[0]({
  target: { closest: selector => selector === '[data-portal-action]' ? { dataset: { portalAction: 'sync', portalId: 'pje-sintetico' } } : null }
});
assert.ok(unitRequests.some(item => item.url === '/api/integrations/judicial/pje/sync' && item.body?.portalId === 'pje-sintetico'), 'Portal PJe deve rotear para o pipeline read-only (/pje/sync).');
assert.ok(unitRequests.every(item => !item.url.endsWith('/connect')), 'Portal PJe não pode cair no connect legado.');
const reconnectedNonEprocPortals = [];
unitFeature.reconnectPortal = async portalId => { reconnectedNonEprocPortals.push(portalId); return true; };
listeners.get('managedCoverageList:click')[0]({
  target: { closest: selector => selector === '[data-portal-action]' ? { dataset: { portalAction: 'sync', portalId: 'portal-generico' } } : null }
});
assert.deepEqual(reconnectedNonEprocPortals, ['portal-generico'], 'Portais sem pipeline read-only próprio preservam a reconexão direcionada existente.');
assert.equal(genericSyncCalls, 0);

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

  assert.equal(await page.locator('.v2-integrations-header h2').textContent(), 'Integrações');
  assert.equal(await page.locator('.judicial-integration-card').count(), 1);
  assert.match(await page.locator('#certificateIntegrationStatus').textContent(), /1 ação/);
  assert.match(await page.locator('#certificateIntegrationDetail').textContent(), /Titular Judicial Sintética/);
  const pjeRequestsBeforeOpen = await page.evaluate(() => window.__uiV2JudicialRequests.filter(item => item.url === '/api/integrations/judicial/pje').length);
  assert.equal(pjeRequestsBeforeOpen, 0, 'Painel PJe não pode consultar o servidor no boot; o refresh pertence à abertura do modal.');
  await page.locator('#certificateGuideButton').click();
  await page.locator('#judicialSetupBackdrop:not(.hidden)').waitFor();
  await page.waitForFunction(() => window.__uiV2JudicialRequests.some(item => item.url === '/api/integrations/judicial/pje'));
  assert.equal(await page.locator('#setupCertificateStatus').textContent(), 'A1 validado no teste');
  assert.equal(await page.locator('#setupPjeOfficeStatus').textContent(), 'Aplicativo oficial disponível');
  assert.equal(await page.locator('#setupTotpStatus').textContent(), '1 portal vinculado');
  assert.equal(await page.locator('.jco-tab').count(), 3, 'O modal judicial organiza em tres abas.');
  assert.equal(await page.locator('#jcoTabCoverage').getAttribute('aria-selected'), 'true', 'Cobertura inicia selecionada.');
  assert.equal(await page.locator('#jcoPanelCredentials').isVisible(), false, 'Credenciais iniciam ocultas.');
  assert.equal(await page.locator('#jcoPanelPreferences').isVisible(), false, 'Preferencias iniciam ocultas.');
  await page.locator('#jcoTabCredentials').click();
  assert.equal(await page.locator('#jcoTabCredentials').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#jcoPanelCoverage').isVisible(), false, 'Abrir credenciais oculta a cobertura.');
  assert.equal(await page.locator('#a1ActiveCard').isVisible(), true);
  await page.locator('#jcoTabPreferences').click();
  assert.equal(await page.locator('#jcoPanelPreferences').isVisible(), true);
  assert.equal(await page.locator('#pjeEnabledToggle').count(), 1, 'Configuracao PJe vive na aba de preferencias.');
  await page.locator('#jcoTabCoverage').click();
  assert.equal(await page.locator('#jcoTabCoverage').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#managedCoverageList .managed-coverage-row').count(), 5);
  assert.match(await page.locator('#managedCoverageSummary').textContent(), /2 fontes públicas ativas.*2 portais conectados.*1 requer/);
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
  assert.equal(await page.locator('[data-portal-action="sync"][data-portal-id="tj-sintetico"]').textContent(), 'Sincronizar');
  assert.equal(await page.locator('[data-portal-action="sync"][data-portal-id="pje-tjmt-1g"]').textContent(), 'Sincronizar');
  assert.match(await page.locator('.judicial-setup-footer .v2-only').allTextContents().then(items => items.join(' ')), /Acompanhamento da sincronização/);
  assert.equal(await page.locator('.portal-auth-guide').count(), 1);

  // Drawer de detalhe: abre pela linha, mostra meta/job do portal e fecha no Escape
  // sem fechar o modal.
  assert.equal(await page.locator('[data-portal-detail]').count(), 5, 'Cada linha de cobertura tem gatilho de detalhe.');
  await page.locator('[data-portal-detail="pje-tjmt-1g"]').click();
  assert.equal(await page.locator('#jcoPortalDrawer').isVisible(), true);
  assert.equal(await page.locator('#jcoDrawerTitle').textContent(), 'TJMT · PJe 1º grau');
  assert.match(await page.locator('#jcoDrawerBody').textContent(), /Última sincronização PJe/);
  assert.equal(await page.locator('#jcoDrawerFoot [data-portal-action="sync"][data-portal-id="pje-tjmt-1g"]').count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#jcoPortalDrawer').isVisible(), false, 'Escape fecha o drawer.');
  assert.equal(await page.locator('#judicialSetupBackdrop:not(.hidden)').count(), 1, 'Escape do drawer não fecha o modal.');

  const pjeSection = page.locator('#judicialSetupBackdrop #pjeCoverageSection');
  assert.equal(await pjeSection.count(), 1, 'Painel PJe precisa viver dentro do modal oficial.');
  assert.equal(await page.locator('#pjeCoverageSection[open]').count(), 0, 'Painel PJe inicia recolhido dentro do modal.');
  await page.locator('#pjeCoverageSection > summary').click();
  assert.equal(await page.locator('#pjeCoverageSection[open]').count(), 1);
  await page.waitForFunction(() => document.querySelectorAll('#pjePortalsGrid .pje-portal-card').length === 2);
  assert.equal(await page.locator('#pjePortalsGrid .pje-portal-card').count(), 2);
  assert.equal(await page.locator('#pjePortalsGrid [data-portal="pje-tjmt-1g"] .button').count(), 2);
  assert.match(await page.locator('#pjePortalsGrid [data-portal="pje-trt4-1g"] .pje-portal-error').textContent(), /Segundo fator PDPJ ainda não configurado/);
  await page.locator('#pjeCommunicationsList tbody tr').first().waitFor();
  assert.equal(await page.locator('#pjeCommunicationsList tbody tr').count(), 2);
  assert.equal(await page.locator('#pjeCommunicationsList tbody tr td').nth(1).textContent(), 'TJMT · PJe 1º grau');
  assert.equal(await page.locator('#pjeCommunicationsList tbody tr td').nth(2).textContent(), 'Pendentes de ciência ou de resposta, Apenas pendentes de resposta');
  assert.equal(await page.locator('#pjeCommunicationsList tbody tr td').nth(7).textContent(), 'Nova');
  assert.equal(await page.locator('#pjeCommunicationsList tbody tr').nth(1).locator('td').nth(7).textContent(), 'Em análise');
  assert.equal(await page.locator('#pjeCommunicationsPortal option').count(), 3);
  await page.evaluate(() => {
    window.__uiV2PjeCommunicationsOverride = url => {
      const pageNumber = Number(new URL(url, location.origin).searchParams.get('page'));
      return { ok: true, pageSize: 10, total: 12, items: [{
        portalId: 'pje-tjmt-1g', processNumber: `000000${pageNumber}-00.2026.8.11.0001`, status: 'untreated'
      }] };
    };
  });
  await page.locator('#pjeCommunicationsStatus').selectOption('');
  await page.locator('#pjeCommunicationsStatus').dispatchEvent('change');
  await page.waitForFunction(() => document.querySelector('#pjeCommunicationsPager')?.textContent?.includes('Página 1 de 2'));
  await page.locator('#pjeCommunicationsPager [data-pje-page="1"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#pjeCommunicationsPager')?.textContent?.includes('Página 2 de 2'));
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-pje-page')), '-1');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#pjeCommunicationsPager')?.textContent?.includes('Página 1 de 2'));
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-pje-page')), '1');
  await page.locator('[data-portal-action="sync"][data-portal-id="pje-tjmt-1g"]').click();
  await page.waitForFunction(() => window.__uiV2JudicialRequests.some(item => item.url === '/api/integrations/judicial/pje/sync' && item.body?.portalId === 'pje-tjmt-1g'));
  const requestsBeforeEprocAction = await page.evaluate(() => window.__uiV2JudicialRequests.length);
  await page.locator('[data-portal-action="reconnect"][data-portal-id="trf-sintetico"]').click();
  assert.equal(await page.locator('#totpPortalSelect').inputValue(), 'trf-sintetico');
  assert.equal(await page.locator('#portalQrInput').evaluate(element => element === document.activeElement), true);
  assert.equal(await page.evaluate(() => window.__uiV2JudicialRequests.length), requestsBeforeEprocAction, 'Concluir login do eproc deve abrir a configuração oficial sem iniciar conexão ou sync.');
  assert.equal(await page.locator('[data-portal-action="reconnect"][data-portal-id="trf-sintetico"]').textContent(), 'Configurar autenticação', 'Ação de portal usa o rótulo oficial de configuração, sem texto legado de login.');
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
  assert.ok(after.requests.every(request => !request.url.endsWith('/connect')));
  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ UI V2 Judicial Integrations: arquitetura, status, A1, cobertura e painel PJe no modal PASS.');
