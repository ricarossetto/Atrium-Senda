import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderInspector, renderRow } from '../js/views/ui-v2/processes-presenter.js';
import { prepareUiV2Page, prepareUiV2ProcessesFixture, startUiV2Session } from './ui_v2_helpers.mjs';

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');
const formatDate = value => value ? String(value) : '—';
const formatMinutes = value => value === 75 ? '1h15m' : String(value || '');

const unitRecord = {
  id: 'unit-process', number: '5000000-00.2026.8.21.0001', client: 'Cliente <Sintética>', opposingParty: 'Parte & Adversa',
  clientPosition: 'Autor(a)', court: 'TJRS', courtUnit: '1ª Vara', county: 'Ijuí', actionType: 'Obrigação',
  judicialPhase: 'Conhecimento', stage: 'Instrução', lastMovement: 'Despacho integral', lastMovementAt: '2026-08-29',
  registeredAt: '2026-08-20', monitoring: 'inactive', secrecy: true, risk: 'possivel', feePercentage: 30
};
const unitRow = renderRow({ item: unitRecord, escapeHtml, formatDate });
assert.match(unitRow, /data-process-id="unit-process"/);
assert.match(unitRow, /Cliente &lt;Sintética&gt;/);
assert.match(unitRow, /Monitoramento inativo/);
assert.match(unitRow, /Probabilidade informada: Possível/);
assert.match(unitRow, /Segredo de justiça/);
assert.doesNotMatch(unitRow, /data-tjrs-consult|fetch\(/, 'A linha V2 não pode consultar TJRS nem conter integração de rede.');

const unitInspector = renderInspector({
  item: unitRecord,
  summary: { openTasks: 2, linkedIntimations: 1, timeMinutes: 75, nextDeadline: '2026-09-03' },
  escapeHtml,
  formatDate,
  formatMinutes
});
for (const expected of ['Resumo operacional', '2', '1', '1h15m', '2026-09-03', 'Despacho integral', 'Probabilidade informada', '30%']) {
  assert.ok(unitInspector.includes(expected), `Inspector unitário deve preservar: ${expected}`);
}

const presenterSource = readFileSync(new URL('../js/views/ui-v2/processes-presenter.js', import.meta.url), 'utf8');
const featureSource = readFileSync(new URL('../js/features/processes.js', import.meta.url), 'utf8');
assert.doesNotMatch(presenterSource, /\bStore\b|secureFetch|\bfetch\s*\(|\.save\s*\(|\.flush\s*\(|\/api\//, 'Presenter V2 não pode acessar Store, persistência ou APIs.');
assert.equal((featureSource.match(/createProcessesFeature/g) || []).length, 1, 'A feature funcional canônica deve continuar única.');
assert.doesNotMatch(featureSource, /createProcessesV2Feature|setInterval\s*\(/, 'Não pode existir segunda feature ou timer de Processos.');

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1280, height: 800 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });
    const runtimeBaseline = await page.evaluate(() => ({ intervals: window.__uiV2RuntimeProbe.intervals }));
    const fixture = await prepareUiV2ProcessesFixture(page);
    const requests = [];
    page.on('request', request => requests.push({ method: request.method(), url: request.url() }));

    assert.equal(await page.locator('#processTableBody [data-process-id]').count(), 2);
    assert.equal(await page.locator('#processResultCount').textContent(), '2 processos');
    assert.equal(await page.locator('#processTableBody [data-process-id="ui-v2-process-inactive"]').textContent().then(text => text.includes('Monitoramento inativo')), true);
    assert.equal(await page.locator('#processTableBody [data-process-id="ui-v2-process-tjrs"]').textContent().then(text => text.includes('Segredo de justiça')), true);

    await page.locator('#processSearch').fill('Cliente Secundária');
    assert.equal(await page.locator('#processTableBody [data-process-id]').count(), 1, 'A busca local existente deve filtrar pelos mesmos campos.');
    assert.equal(await page.locator('#processResultCount').textContent(), '1 de 2 processos');
    await page.locator('#processSearch').fill('resultado inexistente sintético');
    assert.match(await page.locator('#processTableBody').textContent(), /Nenhum processo encontrado para esta busca/);
    await page.locator('#processSearch').fill('');

    const numberSort = page.locator('#processTable th[data-sort-field="number"]');
    await numberSort.locator('button').press('Enter');
    assert.equal(await numberSort.getAttribute('aria-sort'), 'ascending');
    await numberSort.locator('button').press('Enter');
    assert.equal(await numberSort.getAttribute('aria-sort'), 'descending');

    assert.equal(requests.filter(request => /\/api\/tjrs\/consult/.test(request.url)).length, 0);
    await page.locator('#processTableBody [data-process-id="ui-v2-process-tjrs"] [data-process-details]').click();
    await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
    const inspectorText = await page.locator('#processInspectorContent').textContent();
    for (const expected of [
      '5004321-12.2026.8.21.0001', 'Cliente Sintética Processos', 'Empresa Adversa Sintética', 'Segredo de justiça',
      'Tarefas abertas', '2', 'Intimações vinculadas', '1', '1h15m', '03/09/2026',
      'Despacho sintético integral', 'Responsabilidade contratual sintética', 'Probabilidade informada', 'Possível', 'Honorários cadastrados',
      'Visão financeira do processo', 'Honorários parcelados', 'R$ 1.250,00', 'Recebido', 'R$ 750,00', 'Pendente', 'R$ 500,00', 'Despesas do processo', 'R$ 120,00',
      'Linha do tempo jurídica', 'Audiência sintética vinculada', 'peticao-sintetica.pdf', 'Custas sintéticas', 'Conferência sintética'
    ]) assert.ok(inspectorText.includes(expected), `Inspector deve preservar: ${expected}`);
    assert.ok(await page.locator('.legal-timeline [data-process-timeline]').count() >= 4, 'Entidades canônicas navegáveis devem aparecer na linha do tempo.');
    assert.equal(await page.locator('[data-process-task]').count(), 3, 'Todas as tarefas vinculadas devem permanecer acessíveis no inspector.');
    assert.equal(await page.locator('#processInspectorTjrs').isVisible(), true);
    assert.equal(await page.locator('#processTableBody [data-process-id="ui-v2-process-tjrs"]').getAttribute('aria-current'), 'true');
    assert.equal(requests.filter(request => /\/api\/tjrs\/consult/.test(request.url)).length, 0, 'Abrir inspector não consulta TJRS.');

    await page.evaluate(() => document.getElementById('processInspectorBackdrop').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.locator('#processInspectorBackdrop.hidden').waitFor({ state: 'attached' });
    await page.locator('#processTableBody [data-process-id="ui-v2-process-tjrs"] [data-process-details]').click();
    await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();

    const deadlineShape = await page.evaluate(() => ({
      textOnlyDeadline: Object.hasOwn(window.Atrium.Store.state.tasks.find(item => item.id === 'ui-v2-task-text-only'), 'deadline'),
      textOnlyFatal: Object.hasOwn(window.Atrium.Store.state.tasks.find(item => item.id === 'ui-v2-task-text-only'), 'fatalDeadline'),
      intimationDeadline: Object.hasOwn(window.Atrium.Store.state.intimations[0], 'deadline')
    }));
    assert.deepEqual(deadlineShape, { textOnlyDeadline: false, textOnlyFatal: false, intimationDeadline: false });

    let tjrsRequests = 0;
    let requestPayload;
    let tjrsMode = 'success';
    await page.route('**/api/integrations/tjrs-sidecar/processes/sync', async route => {
      tjrsRequests++;
      requestPayload = route.request().postDataJSON();
      await route.fulfill({
        status: tjrsMode === 'success' ? 200 : 503,
        contentType: 'application/json',
        body: JSON.stringify(tjrsMode === 'success'
          ? {
              ok: true,
              revision: requestPayload.revision,
              process: { ...fixture.processes[0], lastMovement: 'Snapshot local sintético incorporado', lastMovementAt: '2026-09-03' },
              message: 'Snapshot local sintético incorporado.'
            }
          : { ok: false, message: 'Falha sintética controlada.' })
      });
    });
    await page.locator('#processInspectorTjrs').click();
    await page.locator('#toastRegion .toast.success', { hasText: 'Snapshot local sintético incorporado.' }).waitFor();
    assert.equal(tjrsRequests, 1);
    assert.equal(requestPayload.processId, 'ui-v2-process-tjrs');
    assert.equal(requestPayload.processNumber, '5004321-12.2026.8.21.0001');
    assert.ok(requestPayload.revision, 'Atualização do snapshot deve carregar a revisão canônica.');
    assert.equal(await page.locator('#processInspectorTjrs').isDisabled(), false);

    tjrsMode = 'failure';
    await page.locator('#processInspectorTjrs').click();
    await page.locator('#toastRegion .toast.error', { hasText: 'Falha sintética controlada.' }).waitFor();
    assert.equal(tjrsRequests, 2, 'Cada ação explícita deve gerar uma operação TJRS.');
    assert.equal(await page.locator('#processInspectorTjrs').isDisabled(), false, 'Botão deve ser restaurado após falha.');

    await page.locator('[data-process-timeline="task:ui-v2-task-open:created"]').click();
    await page.locator('#modalBackdrop[data-modal-mode="task"]:not(.hidden)').waitFor();
    assert.equal(await page.locator('#field-title').inputValue(), 'Tarefa vinculada sintética', 'O evento da linha do tempo deve abrir a tarefa exata.');
    await page.locator('#modalCancel').click();
    await page.evaluate(() => { window.Atrium.App.switchView('processes'); window.Atrium.App.renderProcesses(''); });
    await page.locator('#processTableBody [data-process-id="ui-v2-process-tjrs"] [data-process-details]').click();
    await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
    await page.locator('[data-process-client]').click();
    await page.locator('#view-contacts.active').waitFor();
    assert.match(await page.locator('#contactInspector').textContent(), /Cliente Sintética Processos/, 'O nome do cliente deve abrir o contato canônico.');
    await page.evaluate(() => { window.Atrium.App.switchView('processes'); window.Atrium.App.renderProcesses(''); });
    await page.locator('#processTableBody [data-process-id="ui-v2-process-tjrs"] [data-process-details]').click();
    await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();

    await page.locator('#processInspectorEdit').click();
    await page.locator('#modalBackdrop[data-modal-mode="process"]:not(.hidden)').waitFor();
    assert.equal(await page.locator('.process-form-section').count(), 8);
    const names = await page.locator('#modalForm [name]').evaluateAll(elements => elements.map(element => element.name));
    const expectedNames = [
      'number', 'oldNumber', 'nb', 'client', 'clientPosition', 'opposingParty', 'actionGroup', 'actionType', 'judicialPhase', 'risk', 'stage',
      'protocol', 'caseFolder', 'court', 'county', 'courtUnit', 'responsible', 'registeredAt', 'lastMovementAt', 'lastMovement', 'feeType',
      'feePercentage', 'feeAmount', 'feeMonthly', 'feeStatus', 'requisitionType', 'requisitionAmount', 'requisitionBank', 'requisitionStatus',
      'feeNotes', 'secrecy', 'monitoring', 'notes'
    ];
    assert.deepEqual([...names].sort(), [...expectedNames].sort(), 'Todos os nomes de campo devem permanecer presentes.');
    assert.equal(await page.locator('#field-client').getAttribute('required'), '');
    await page.fill('#field-stage', 'Instrução revisada na V2');
    await page.locator('#modalForm button[type="submit"]').click();
    await page.locator('#modalBackdrop.hidden').waitFor({ state: 'attached' });
    const preserved = await page.evaluate(() => {
      const item = window.Atrium.Store.state.processes.find(process => process.id === 'ui-v2-process-tjrs');
      return { stage: item.stage, source: item.source, unknownField: item.unknownField, feePercentage: item.feePercentage, secrecy: item.secrecy };
    });
    assert.deepEqual(preserved, { stage: 'Instrução revisada na V2', source: 'Cadastro sintético', unknownField: 'preservar', feePercentage: 25, secrecy: true });

    await page.locator('#processTableBody [data-process-id="ui-v2-process-inactive"] [data-process-details]').click();
    await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
    assert.equal(await page.locator('#processInspectorTjrs').isHidden(), true, 'TJRS só deve aparecer quando aplicável.');
    await page.locator('#processInspectorClose').click();
    await page.locator('#processInspectorBackdrop.hidden').waitFor({ state: 'attached' });

    await page.evaluate(() => {
      window.Atrium.Store.state.processes = [];
      window.Atrium.App.renderProcesses('');
    });
    assert.match(await page.locator('#processTableBody').textContent(), /Nenhum processo cadastrado/);
    assert.equal(await page.locator('[data-process-create]').isVisible(), true);

    let previewPayload;
    await page.route('**/api/integrations/tjrs-sidecar/processes/preview', async route => {
      previewPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          readOnly: true,
          state: 'AVAILABLE',
          draft: {
            number: '5003280-32.2026.8.21.0404',
            client: '',
            court: 'TJRS',
            county: 'Bento Gonçalves',
            courtUnit: '1ª Vara Federal de Bento Gonçalves',
            actionType: 'PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL',
            registeredAt: '2026-08-12T00:00:00.000Z',
            lastMovement: 'Intimação eletrônica expedida',
            lastMovementAt: '2026-09-03T10:00:00.000Z',
            secrecy: false,
            monitoring: 'active',
            source: 'TJRS_PUBLIC',
            judicialParties: [
              { name: 'PARTE AUTORA SINTÉTICA', role: 'AUTOR', lawyers: [] },
              { name: 'PARTE ADVERSA SINTÉTICA', role: 'REU', lawyers: [] }
            ],
            movements: [{ eventNumber: 12, date: '2026-09-03T10:00:00.000Z', description: 'Intimação eletrônica expedida', source: 'TJRS_PUBLIC' }],
            tjrsCollector: { status: 'AVAILABLE', cnj: '50032803220268210404', source: 'TJRS_PUBLIC' }
          },
          summary: { parties: 2, movements: 1 },
          message: 'Snapshot local encontrado. Revise os dados antes de cadastrar o processo.'
        })
      });
    });
    await page.locator('[data-process-create]').click();
    await page.locator('#modalBackdrop[data-modal-mode="process"]:not(.hidden)').waitFor();
    assert.equal(await page.locator('#processTjrsPreview').isVisible(), true);
    await page.locator('#field-number').fill('5003280-32.2026.8.21.0404');
    await page.locator('#processTjrsPreview').click();
    await page.locator('#processTjrsPreviewStatus', { hasText: 'Dados judiciais carregados para revisão.' }).waitFor();
    assert.deepEqual(previewPayload, { processNumber: '5003280-32.2026.8.21.0404' });
    assert.equal(await page.locator('#field-court').inputValue(), 'TJRS');
    assert.equal(await page.locator('#field-actionType').inputValue(), 'PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL');
    assert.equal(await page.locator('#field-client').inputValue(), '', 'Parte judicial não pode virar cliente automaticamente.');
    assert.equal(await page.locator('#field-opposingParty').inputValue(), '', 'Parte adversa não pode ser inferida sem posição humana.');
    assert.match(await page.locator('#processTjrsPreviewStatus').textContent(), /Nenhuma parte foi definida automaticamente como cliente/);
    await Promise.all([
      page.waitForResponse(response => response.url().includes('/api/integrations/tjrs-sidecar/processes/preview')),
      page.locator('#processTjrsPreview').click()
    ]);
    await page.locator('#field-court').fill('Órgão revisado manualmente');
    await page.locator('#field-number').fill('5001111-00.2026.8.21.0001');
    assert.equal(await page.locator('#field-court').inputValue(), 'Órgão revisado manualmente', 'Campo alterado pelo usuário deve sobreviver à invalidação do draft.');
    assert.equal(await page.locator('#field-actionType').inputValue(), '', 'Sugestão judicial antiga deve ser removida quando o CNJ muda.');
    assert.equal(await page.locator('#field-lastMovement').inputValue(), '', 'Andamento do CNJ anterior não pode permanecer no formulário.');
    assert.match(await page.locator('#processTjrsPreviewStatus').textContent(), /CNJ foi alterado/);
    await page.locator('#field-number').fill('5003280-32.2026.8.21.0404');
    await page.locator('#processTjrsPreview').click();
    await page.locator('#processTjrsPreviewStatus', { hasText: 'Dados judiciais carregados para revisão.' }).waitFor();
    assert.equal(await page.locator('#field-court').inputValue(), 'Órgão revisado manualmente', 'Nova consulta não deve sobrescrever campo manual não vazio.');
    await page.locator('#field-client').fill('Cliente definido após revisão humana');
    await page.locator('#modalForm button[type="submit"]').click();
    await page.locator('#modalBackdrop.hidden').waitFor({ state: 'attached' });
    const assisted = await page.evaluate(() => window.Atrium.Store.state.processes.find(item => item.number === '5003280-32.2026.8.21.0404'));
    assert.equal(assisted.client, 'Cliente definido após revisão humana');
    assert.equal(assisted.court, 'Órgão revisado manualmente');
    assert.equal(assisted.source, 'TJRS_PUBLIC');
    assert.equal(assisted.judicialParties.length, 2);
    assert.equal(assisted.movements.length, 1);

    const probe = await page.evaluate(() => window.__uiV2RuntimeProbe);
    assert.equal(probe.intervals, runtimeBaseline.intervals, 'Processos V2 não pode adicionar timer ao runtime existente.');
    assert.equal(requests.filter(request => request.method === 'GET' && /\/api\/tjrs\/consult/.test(request.url)).length, 0);
    assert.deepEqual(pageErrors, [], `Pageerrors: ${pageErrors.join(' | ')}`);
    assert.equal(fixture.processes.length, 2);
  } finally {
    await context.close();
  }
} finally {
  await session.stop();
}

console.log('✓ Processos V2 aprovado: tabela densa, busca/sort únicos, inspector read-first, campos preservados e TJRS somente explícito.');
