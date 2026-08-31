import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderPublicationDetail, renderPublicationRow } from '../js/views/ui-v2/publications-presenter.js';
import { prepareUiV2Page, prepareUiV2PublicationsFixture, startUiV2Session } from './ui_v2_helpers.mjs';

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');
const formatDate = value => value || '—';
const formatDateTime = value => value || 'Nunca';
const formatAge = () => 'Hoje';
const unitItem = {
  id: 'publication-unit', title: 'Título <sintético>', process: '5000000-00.2026.8.21.0001',
  court: 'TJRS & Unidade', source: 'DJEN', publishedAt: '2026-08-30',
  text: 'Texto oficial\ncom 15 dias sem prazo cadastrado.', treatmentStatus: 'untreated', unread: true, urgent: true
};
const unitAct = { label: 'Manifestação', css: 'act-manifestacao' };
const unitRow = renderPublicationRow({ item: unitItem, act: unitAct, parties: 'Cliente Sintético', selected: false, escapeHtml, formatDate, formatAge });
assert.match(unitRow, /Não lida/);
assert.match(unitRow, /Não tratada/);
assert.match(unitRow, /Título &lt;sintético&gt;/);
assert.match(unitRow, /aria-controls="intimationDetail"/);

const unitDetail = renderPublicationDetail({
  item: unitItem, act: unitAct, parties: 'Cliente Sintético', linkedTasks: [], privileged: true,
  escapeHtml, formatDate, formatDateTime, formatAge
});
assert.match(unitDetail, /Texto original preservado/);
assert.match(unitDetail, /Texto oficial\ncom 15 dias sem prazo cadastrado\./);
assert.match(unitDetail, /Aguardando triagem humana/);
assert.match(unitDetail, /id="btnCreateTask"/);
assert.match(unitDetail, /id="btnSendIntimationEmail"/);

const presenterSource = readFileSync(new URL('../js/views/ui-v2/publications-presenter.js', import.meta.url), 'utf8');
const featureSource = readFileSync(new URL('../js/features/publications.js', import.meta.url), 'utf8');
const portalSource = readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
assert.doesNotMatch(presenterSource, /\bStore\b|secureFetch|\bfetch\s*\(|\.save\s*\(|\.flush\s*\(|\/api\//, 'Presenter não pode acessar Store, persistência ou API.');
assert.equal((portalSource.match(/createPublicationsFeature\(/g) || []).length, 1, 'A feature funcional deve continuar única.');
assert.doesNotMatch(featureSource, /createPublicationsV2Feature|setInterval\s*\(/, 'Não pode existir segunda feature ou timer V2.');
assert.match(featureSource, /item\.unread = false;\s*store\.save\(\);/, 'Leitura deve preservar o contrato local existente.');
assert.match(featureSource, /deadline: '',/, 'A tarefa deve continuar sem prazo inferido.');

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1280, height: 800 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });
    const fixture = await prepareUiV2PublicationsFixture(page);
    const requests = [];
    page.on('request', request => requests.push({ method: request.method(), url: request.url() }));
    const intervalBaseline = await page.evaluate(() => window.__uiV2RuntimeProbe.intervals);

    assert.equal(await page.locator('#inboxList [data-intimation-id]').count(), 4);
    assert.equal(await page.locator('#publicationResultCount').textContent(), '4 de 4 publicações');
    const urgentRow = page.locator('[data-intimation-id="ui-v2-publication-urgent"]');
    assert.match(await urgentRow.getAttribute('aria-label'), /Não lida[\s\S]*Não tratada/);
    const reviewRow = page.locator('[data-intimation-id="ui-v2-publication-review"]');
    assert.match(await reviewRow.getAttribute('aria-label'), /Lida[\s\S]*Em análise/);

    await page.locator('.pub-metric-card[data-filter="in_review"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#inboxList [data-intimation-id]').count(), 1, 'Métrica deve reutilizar o filtro canônico.');
    assert.equal(await page.locator('.pub-metric-card[data-filter="in_review"]').getAttribute('aria-pressed'), 'true');
    await page.evaluate(() => { window.Atrium.App.inboxFilter = 'all'; window.Atrium.App.renderInbox(); });

    const beforeSort = await page.locator('#inboxList [data-intimation-id]').evaluateAll(rows => rows.map(row => row.dataset.intimationId));
    await page.locator('[data-inbox-sort-col="date"]').click();
    const afterSort = await page.locator('#inboxList [data-intimation-id]').evaluateAll(rows => rows.map(row => row.dataset.intimationId));
    assert.notDeepEqual(afterSort, beforeSort, 'Sort existente deve continuar operando na única lista.');
    assert.equal(requests.filter(request => /\/api\/(?:intimations\/.+\/treatment|publications\/.+\/task|intimations\/email|publications\/email\/batch)/.test(request.url)).length, 0, 'Render, filtro e sort não podem disparar operações.');

    await urgentRow.click();
    await page.locator('#intimationDetail .detail-header').waitFor();
    const readState = await page.evaluate(() => {
      const item = window.Atrium.Store.state.intimations.find(record => record.id === 'ui-v2-publication-urgent');
      return { unread: item.unread, treatmentStatus: item.treatmentStatus, deadline: item.deadline, fatalDeadline: item.fatalDeadline };
    });
    assert.deepEqual(readState, { unread: false, treatmentStatus: 'untreated', deadline: undefined, fatalDeadline: undefined });
    const detailText = await page.locator('#intimationDetail').textContent();
    assert.match(detailText, /TEXTO OFICIAL SINTÉTICO/);
    assert.match(detailText, /Aguardando triagem humana/);
    assert.equal(await urgentRow.getAttribute('aria-pressed'), 'true');

    await page.locator('#btnCreateTask').click();
    await page.locator('#modalBackdrop[data-modal-mode="task"]:not(.hidden)').waitFor();
    assert.equal(await page.locator('#field-deadline').inputValue(), '', 'Texto “15 dias” não pode preencher deadline.');
    assert.equal(await page.locator('#field-process').inputValue(), '5004321-12.2026.8.21.0001');
    await page.locator('#modalCancel').click();

    await page.evaluate(() => { window.Atrium.App.inboxFilter = 'treated'; window.Atrium.App.renderInbox(); });
    await page.locator('[data-intimation-id="ui-v2-publication-treated"]').click();
    assert.match(await page.locator('#intimationDetail').textContent(), /Providência vinculada sintética/);
    assert.match(await page.locator('#intimationDetail').textContent(), /Advogada Tratadora Sintética/);
    assert.match(await page.locator('#intimationDetail').textContent(), /Providência conferida manualmente/);
    await page.locator('[data-open-task-id="ui-v2-publication-task"]').click();
    await page.locator('#modalBackdrop[data-modal-mode="task"]:not(.hidden)').waitFor();
    assert.equal(await page.locator('#field-title').inputValue(), 'Providência vinculada sintética');
    await page.locator('#modalCancel').click();

    await page.evaluate(() => { window.Atrium.App.inboxFilter = 'all'; window.Atrium.App.renderInbox(); });
    await page.locator('[data-intimation-id="ui-v2-publication-review"]').click();
    assert.equal(await page.locator('#btnSendIntimationEmail').count(), 1, 'Admin deve manter ação individual.');
    let individualRequests = 0;
    await page.route('**/api/intimations/email', async route => {
      individualRequests++;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await page.locator('#btnSendIntimationEmail').click();
    assert.equal(individualRequests, 0, 'Abrir modal individual não pode enviar.');
    await page.locator('#publicationEmailRecipientInput').fill('destino@example.test');
    await page.locator('#publicationEmailSubmitBtn').click();
    await page.locator('#publicationEmailBackdrop.hidden').waitFor({ state: 'attached' });
    assert.equal(individualRequests, 1, 'Envio explícito deve produzir uma operação individual.');

    let batchRequests = 0;
    await page.route('**/api/publications/email/batch', async route => {
      batchRequests++;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, emailHtml: '<p>Boletim sintético</p>', emailText: 'Boletim sintético' }) });
    });
    await page.locator('#btnEmailPublications').click();
    assert.equal(batchRequests, 0, 'Abrir boletim não pode enviar.');
    await page.locator('#emailTargetAddress').fill('boletim@example.test');
    await page.locator('#btnSendEmailDirect').click();
    await page.locator('#emailPreviewContainer', { hasText: 'Boletim sintético' }).waitFor();
    assert.equal(batchRequests, 1, 'Envio batch explícito deve produzir uma operação.');
    await page.locator('#publicationsEmailClose').click();

    await page.evaluate(() => {
      window.KellerAuth.currentUser.role = 'collaborator';
      window.Atrium.App.renderIntimationDetail();
    });
    assert.equal(await page.locator('#btnSendIntimationEmail').count(), 0, 'RBAC visual individual deve permanecer.');

    const runtime = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(element => String(element.getAttribute('id')));
      return {
        intervals: window.__uiV2RuntimeProbe.intervals,
        duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index)
      };
    });
    assert.equal(runtime.intervals, intervalBaseline, 'Publicações V2 não pode adicionar timer.');
    assert.deepEqual(runtime.duplicateIds, [], 'Não pode haver IDs duplicados.');
    assert.deepEqual(pageErrors, [], `Pageerrors: ${pageErrors.join(' | ')}`);
    assert.equal(fixture.intimations.length, 4);

    await page.evaluate(() => window.Atrium.App.switchView('configuration'));
    await page.locator('#view-configuration.active #uiModeControl').waitFor();
    await page.locator('[data-ui-mode="classic"]').click();
    await page.locator('html[data-ui="classic"]').waitFor();
    await page.evaluate(() => window.Atrium.App.switchView('inbox'));
    assert.equal(await page.locator('.v2-publications-heading').isVisible(), false);
    assert.ok(await page.locator('#inboxList .inbox-primary').count() > 0, 'Classic deve manter seu markup canônico.');
  } finally {
    await context.close();
  }
} finally {
  await session.stop();
}

console.log('✓ Publicações V2 aprovada: uma feature, leitura e tratamento independentes, tarefa sem prazo inferido e e-mail somente explícito.');
