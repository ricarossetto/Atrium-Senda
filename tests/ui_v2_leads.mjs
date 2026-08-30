import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2LeadsFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [featureSource, presenterSource, portalSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/leads.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/views/ui-v2/leads-presenter.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/portal.js'), 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 LEGAL INTAKE / LEADS WORKSPACE');
console.log('===============================================================\n');

assert.equal((portalSource.match(/createLeadsFeature\s*\(/g) || []).length, 1, 'Deve existir uma única Leads Feature.');
assert.doesNotMatch(presenterSource, /\bStore\b|\bfetch\s*\(|\bsave\s*\(|\bflush\s*\(|\baudit\s*\(|setInterval|state\.leads/);
assert.doesNotMatch(featureSource, /state\.contacts|state\.processes|upsert\(['"]contacts|upsert\(['"]processes|\bfetch\s*\(|setInterval/);
assert.equal(portalSource.includes('this.leadStatusFilter'), false, 'Portal não deve manter shadow state do filtro.');

const session = await startUiV2Session();
try {
  const context = await session.createContext();
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });
  const fixture = await prepareUiV2LeadsFixture(page);

  const before = await page.evaluate(() => {
    const { Store } = window.Atrium;
    const calls = { upsert: 0, audit: 0, save: 0, flush: 0 };
    for (const method of Object.keys(calls)) {
      const original = Store[method];
      Store[method] = (...args) => {
        calls[method]++;
        return original?.apply(Store, args);
      };
    }
    window.__leadsV2Calls = calls;
    return {
      leads: JSON.stringify(Store.state.leads),
      contacts: JSON.stringify(Store.state.contacts),
      processes: JSON.stringify(Store.state.processes),
      mutationRequests: window.__uiV2RuntimeProbe.mutationRequests.length,
      intervals: window.__uiV2RuntimeProbe.intervals
    };
  });

  assert.equal(await page.locator('#leadCount').textContent(), '7 atendimentos');
  assert.equal(await page.locator('#leadTableBody [data-lead-id]').count(), 0, 'Classic não pode formar segunda árvore operacional em V2.');
  assert.equal(await page.locator('#leadsV2Workspace [data-lead-id]').count(), 7);
  assert.deepEqual(await page.locator('.lead-pipeline-item strong').allTextContents(), ['2', '1', '1', '1', '1']);

  const fallback = await page.locator('[data-lead-id="lead-v2-unknown"]').textContent();
  for (const expected of ['Interessado', 'Consulta inicial', 'Direto', 'Advogado(a)', 'A definir', 'Novo']) assert.match(fallback, new RegExp(expected.replace(/[()]/g, '\\$&')));

  const canonicalSearchCases = [
    ['Ana Interessada Sintética', 'lead-v2-new'],
    ['Revisão documental previdenciária', 'lead-v2-analysis'],
    ['Instagram / Redes Sociais', 'lead-v2-proposal'],
    ['Advogada Delta', 'lead-v2-closed']
  ];
  for (const [query, id] of canonicalSearchCases) {
    await page.locator('#leadSearch').fill(query);
    await page.locator(`[data-lead-id="${id}"]`).waitFor();
    assert.equal(await page.locator('#leadsV2Workspace [data-lead-id]').count(), 1);
  }
  for (const excluded of ['Relato sigiloso sintético', 'declinado', '7500']) {
    await page.locator('#leadSearch').fill(excluded);
    assert.match(await page.locator('#leadsV2Workspace').textContent(), /Nenhum atendimento registrado/);
    assert.equal(await page.locator('#leadCount').textContent(), '0 atendimentos');
  }
  await page.locator('#leadSearch').fill('');

  const leadsBeforeFilter = await page.evaluate(() => JSON.stringify(window.Atrium.Store.state.leads));
  for (const status of ['novo', 'em_analise', 'proposta', 'fechado', 'declinado']) {
    const button = page.locator(`[data-lead-filter="${status}"]`);
    await button.click();
    assert.equal(await button.getAttribute('aria-pressed'), 'true');
    const visibleStatuses = await page.locator('#leadsV2Workspace [data-lead-id]').evaluateAll(records => records.map(record => record.querySelector('.lead-v2-status')?.textContent.trim()));
    assert.ok(visibleStatuses.length >= 1);
    assert.equal(await page.locator('#leadCount').textContent(), `${visibleStatuses.length} atendimentos`);
  }
  assert.equal(await page.evaluate(() => JSON.stringify(window.Atrium.Store.state.leads)), leadsBeforeFilter);
  await page.locator('[data-lead-filter="all"]').click();

  const presentationEffects = await page.evaluate(() => ({
    calls: window.__leadsV2Calls,
    mutationRequests: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));
  assert.deepEqual(presentationEffects.calls, { upsert: 0, audit: 0, save: 0, flush: 0 });
  assert.equal(presentationEffects.mutationRequests, before.mutationRequests, 'Render, busca e filtros não podem introduzir requests.');
  assert.equal(presentationEffects.intervals, before.intervals);

  await page.locator('[data-lead-id="lead-v2-proposal"]').click();
  await page.locator('#modalTitle', { hasText: 'Editar Atendimento' }).waitFor();
  assert.deepEqual((await page.locator('#modalForm [name]').evaluateAll(elements => elements.map(element => element.name))).sort(), ['client', 'estimatedFee', 'notes', 'origin', 'responsible', 'serviceType', 'status']);
  await page.locator('#field-client').fill('Carla Proposta Editada V2');
  await page.locator('#modalForm button[type="submit"]').click();
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });
  const editResult = await page.evaluate(() => ({
    record: window.Atrium.Store.state.leads.find(lead => lead.id === 'lead-v2-proposal'),
    audit: window.Atrium.Store.state.audit.at(-1),
    calls: window.__leadsV2Calls
  }));
  assert.equal(editResult.record.id, 'lead-v2-proposal');
  assert.equal(editResult.record.registeredAt, '2026-08-22');
  assert.equal(editResult.record.client, 'Carla Proposta Editada V2');
  assert.equal(editResult.audit.action, 'Atendimento atualizado');
  assert.equal(editResult.audit.detail, 'Carla Proposta Editada V2 · Planejamento sucessório');
  assert.equal(JSON.stringify(editResult.audit).includes('Relato sigiloso sintético'), false);
  assert.equal(editResult.calls.upsert, 1);
  assert.equal(editResult.calls.audit, 1);

  await page.locator('#newLeadButton').click();
  assert.equal(await page.locator('#field-status').inputValue(), 'novo');
  assert.equal(await page.locator('#field-origin').inputValue(), 'Indicação de Cliente');
  assert.equal(await page.locator('#field-responsible').inputValue(), 'Advogada Teste UI V2');
  await page.locator('#modalCancel').click();

  const after = await page.evaluate(() => ({
    contacts: JSON.stringify(window.Atrium.Store.state.contacts),
    processes: JSON.stringify(window.Atrium.Store.state.processes),
    intervals: window.__uiV2RuntimeProbe.intervals
  }));
  assert.equal(after.contacts, before.contacts);
  assert.equal(after.processes, before.processes);
  assert.equal(after.intervals, before.intervals);
  assert.equal(fixture.leads.length, 7);
  assert.deepEqual(pageErrors, []);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ Leads V2: árvore única, pipeline, busca, filtros, CRUD e isolamento aprovados.');
