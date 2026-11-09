import assert from 'node:assert/strict';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1186, height: 698 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl);
  await page.evaluate(async () => {
    const { Store } = window.Atrium;
    Store.state.processes.push({
      id: 'process-manual-movement',
      number: '5000000-00.2026.8.21.0004',
      client: 'Cliente do Andamento Manual',
      actionType: 'Execução de Andamento Sintético',
      court: 'TJ Sintético'
    });
    Store.save();
    if (!await Store.flush()) throw new Error('Fixture save failed');
    window.Atrium.App.renderAll();
    window.Atrium.App.switchView('processes');
  });

  const requests = [];
  page.on('request', request => requests.push({ url: request.url(), method: request.method() }));

  const processRow = page.locator('#processTableBody [data-process-id="process-manual-movement"]');
  await processRow.waitFor();
  await processRow.click();
  await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
  const newMovement = page.locator('[data-process-new-movement]');
  assert.equal(await newMovement.isVisible(), true);
  assert.equal((await newMovement.textContent()).trim(), 'Novo andamento');
  const judicialBefore = requests.filter(request => /\/api\/(?:tjrs\/consult|integrations\/(?:tjrs-sidecar\/processes\/sync|eproc)|judicial\/[^?]*(?:sync|consult))/.test(request.url)).length;
  await newMovement.click();

  await page.locator('#modalBackdrop[data-modal-mode="processMovement"]:not(.hidden)').waitFor();
  assert.equal(await page.locator('#view-processes.active').count(), 1, 'Registrar andamento não troca a view de origem.');
  await page.locator('#field-date').fill('2026-09-05');
  await page.locator('#field-description').fill('Andamento manual sintético do escritório');
  await page.locator('#field-author').fill('Advogada Teste');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });

  await page.waitForFunction(() => document.getElementById('processInspectorContent')?.textContent.includes('Andamento manual sintético do escritório'));
  const inspectorText = await page.locator('#processInspectorContent').textContent();
  assert.match(inspectorText, /Andamento manual sintético do escritório/);
  assert.match(inspectorText, /05\/09\/2026/);
  assert.match(inspectorText, /Interna/);
  assert.match(inspectorText, /Último andamento[\s\S]*Andamento manual sintético do escritório/);
  const judicialAfter = requests.filter(request => /\/api\/(?:tjrs\/consult|integrations\/(?:tjrs-sidecar\/processes\/sync|eproc)|judicial\/[^?]*(?:sync|consult))/.test(request.url));
  assert.equal(judicialAfter.length, judicialBefore, `Andamento manual não consulta nem sincroniza autos: ${judicialAfter.map(request => request.url).join(', ')}`);
  assert.ok(requests.some(request => request.method === 'POST' && /\/api\/state$/.test(request.url)), 'Andamento manual persiste pelo flush oficial do Store.');

  await page.reload();
  await page.waitForFunction(() => window.Atrium?.Store?.state?.processes?.some(item => item.id === 'process-manual-movement' && (item.movements || []).some(movement => movement.description === 'Andamento manual sintético do escritório')));
  const saved = await page.evaluate(() => window.Atrium.Store.state.processes.find(item => item.id === 'process-manual-movement'));
  assert.equal(saved.movements.length, 1);
  assert.equal(saved.movements[0].source, 'Interna');
  assert.equal(saved.movements[0].manual, true);
  assert.equal(saved.movements[0].date, '2026-09-05');
  assert.equal(saved.movements[0].author, 'Advogada Teste');
  assert.equal('deadline' in saved.movements[0], false, 'Andamento manual não cria prazo.');
  assert.equal(saved.lastMovement, 'Andamento manual sintético do escritório');
  assert.equal(saved.lastMovementAt, '2026-09-05');
  assert.deepEqual(pageErrors, []);
  await context.close();
  console.log('PASS Manual process movement is append-only, internal and persisted through the canonical Store');
} finally {
  await session.stop();
}
