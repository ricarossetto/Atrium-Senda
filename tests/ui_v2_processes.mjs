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
      'Despacho sintético integral', 'Responsabilidade contratual sintética', 'Probabilidade informada', 'Possível', 'Honorários cadastrados'
    ]) assert.ok(inspectorText.includes(expected), `Inspector deve preservar: ${expected}`);
    assert.equal(await page.locator('[data-process-task]').count(), 3, 'Todas as tarefas vinculadas devem permanecer acessíveis no inspector.');
    assert.equal(await page.locator('#processInspectorTjrs').isVisible(), true);
    assert.equal(await page.locator('#processTableBody [data-process-id="ui-v2-process-tjrs"]').getAttribute('aria-current'), 'true');
    assert.equal(requests.filter(request => /\/api\/tjrs\/consult/.test(request.url)).length, 0, 'Abrir inspector não consulta TJRS.');

    const deadlineShape = await page.evaluate(() => ({
      textOnlyDeadline: Object.hasOwn(window.Atrium.Store.state.tasks.find(item => item.id === 'ui-v2-task-text-only'), 'deadline'),
      textOnlyFatal: Object.hasOwn(window.Atrium.Store.state.tasks.find(item => item.id === 'ui-v2-task-text-only'), 'fatalDeadline'),
      intimationDeadline: Object.hasOwn(window.Atrium.Store.state.intimations[0], 'deadline')
    }));
    assert.deepEqual(deadlineShape, { textOnlyDeadline: false, textOnlyFatal: false, intimationDeadline: false });

    let tjrsRequests = 0;
    let requestPayload;
    let tjrsMode = 'success';
    await page.route('**/api/tjrs/consult', async route => {
      tjrsRequests++;
      requestPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(tjrsMode === 'success'
          ? { ok: true, directUrl: 'https://tjrs.example.test/processo', message: 'Consulta sintética aberta.' }
          : { ok: false, message: 'Falha sintética controlada.' })
      });
    });
    await page.evaluate(() => {
      window.__uiV2ProcessOpenCalls = [];
      window.open = (...args) => { window.__uiV2ProcessOpenCalls.push(args); return null; };
    });
    await page.locator('#processInspectorTjrs').click();
    await page.locator('#toastRegion .toast.success', { hasText: 'Consulta sintética aberta.' }).waitFor();
    assert.equal(tjrsRequests, 1);
    assert.deepEqual(requestPayload, { processNumber: '5004321-12.2026.8.21.0001', courtUnit: '1ª Vara Cível Sintética' });
    assert.deepEqual(await page.evaluate(() => window.__uiV2ProcessOpenCalls), [['https://tjrs.example.test/processo', '_blank', 'noopener,noreferrer']]);
    assert.equal(await page.locator('#processInspectorTjrs').isDisabled(), false);

    tjrsMode = 'failure';
    await page.locator('#processInspectorTjrs').click();
    await page.locator('#toastRegion .toast.error', { hasText: 'Falha sintética controlada.' }).waitFor();
    assert.equal(tjrsRequests, 2, 'Cada ação explícita deve gerar uma operação TJRS.');
    assert.equal((await page.evaluate(() => window.__uiV2ProcessOpenCalls)).length, 1, 'Falha não pode navegar.');
    assert.equal(await page.locator('#processInspectorTjrs').isDisabled(), false, 'Botão deve ser restaurado após falha.');

    await page.locator('[data-process-task="ui-v2-task-open"]').click();
    await page.locator('#modalBackdrop[data-modal-mode="task"]:not(.hidden)').waitFor();
    assert.equal(await page.locator('#field-title').inputValue(), 'Tarefa vinculada sintética', 'A tarefa exata deve abrir pelo inspector.');
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
