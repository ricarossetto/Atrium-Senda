import assert from 'node:assert/strict';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1186, height: 698 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl);
  const requests = [];
  page.on('request', request => requests.push({ url: request.url(), method: request.method() }));
  await page.evaluate(async () => {
    const { App, Store } = window.Atrium;
    Store.state.leads.push(
      { id: 'kanban-novo-1', client: 'Cliente Kanban Um', serviceType: 'Ação Sintética A', status: 'novo', origin: 'Indicação de Cliente', responsible: 'Advogada Teste', estimatedFee: 2500, registeredAt: '2026-09-01' },
      { id: 'kanban-novo-2', client: 'Cliente Kanban Dois', serviceType: 'Ação Sintética B', status: 'novo', origin: 'Google / Site', responsible: 'Advogada Teste', estimatedFee: 1500, registeredAt: '2026-09-02' },
      { id: 'kanban-analise', client: 'Cliente Kanban Análise', serviceType: 'Ação Sintética C', status: 'em_analise', origin: 'Outro', responsible: 'Advogada Teste', estimatedFee: 0, registeredAt: '2026-09-03' },
      { id: 'kanban-proposta', client: 'Cliente Kanban Proposta', serviceType: 'Ação Sintética D', status: 'proposta', origin: 'Outro', responsible: 'Advogada Teste', estimatedFee: 3500, registeredAt: '2026-09-04' },
      { id: 'kanban-fechado', client: 'Cliente Kanban Fechado', serviceType: 'Ação Sintética E', status: 'fechado', origin: 'Outro', responsible: 'Advogada Teste', estimatedFee: 4500, registeredAt: '2026-09-05' },
      { id: 'kanban-declinado', client: 'Cliente Kanban Declinado', serviceType: 'Ação Sintética F', status: 'declinado', origin: 'Outro', responsible: 'Advogada Teste', estimatedFee: 500, registeredAt: '2026-09-06' },
      { id: 'kanban-desconhecido', client: 'Cliente Kanban Histórico', serviceType: 'Ação Sintética G', status: 'status_historico', origin: 'Outro', responsible: 'Advogada Teste', estimatedFee: 0, registeredAt: '2026-09-07' }
    );
    Store.save();
    if (!await Store.flush()) throw new Error('Fixture save failed');
    App.renderAll();
    App.switchView('leads');
  });

  await page.locator('#leadsV2Workspace .lead-v2-record').first().waitFor();
  assert.equal(await page.locator('#leadsV2Workspace .lead-v2-record').count(), 7, 'Lista é o modo padrão.');
  assert.equal(await page.locator('#leadsV2Workspace .lead-kanban').count(), 0);
  assert.equal(await page.locator('#leadsV2Workspace .lead-pagination').count(), 1, 'A lista mantém a paginação.');

  await page.locator('#leadKanbanViewButton').click();
  await page.locator('#view-leads[data-lead-view="kanban"] .lead-kanban').waitFor();
  assert.equal(await page.locator('#leadsV2Workspace .lead-v2-record').count(), 0);
  assert.equal(await page.locator('#leadsV2Workspace .lead-pagination').count(), 0, 'O Kanban não pagina o recorte.');
  assert.equal(await page.locator('#leadsV2Workspace .lead-kanban-column').count(), 5);
  assert.equal(await page.locator('#leadsV2Workspace .lead-kanban-card').count(), 7);
  assert.equal(await page.locator('[data-lead-column="novo"] .lead-kanban-count').textContent(), '3');
  assert.equal(await page.locator('[data-lead-column="proposta"] .lead-kanban-count').textContent(), '1');
  assert.equal(await page.locator('[data-lead-column="novo"] [data-lead-id="kanban-desconhecido"]').count(), 1, 'Estágio desconhecido não pode sumir do quadro.');

  await page.locator('[data-lead-column="novo"] [data-lead-move="kanban-novo-1"]').selectOption('proposta');
  await page.waitForFunction(() => document.querySelector('[data-lead-column="proposta"] [data-lead-id="kanban-novo-1"]'));
  assert.equal(await page.locator('[data-lead-column="novo"] .lead-kanban-count').textContent(), '2');
  assert.equal(await page.locator('[data-lead-column="proposta"] .lead-kanban-count').textContent(), '2');

  const dragLeadTo = (leadId, status) => page.evaluate(({ leadId, status }) => {
    const source = document.querySelector(`[data-lead-drag="${leadId}"]`);
    const target = document.querySelector(`[data-lead-drop="${status}"]`);
    const dataTransfer = new DataTransfer();
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
  }, { leadId, status });
  await dragLeadTo('kanban-analise', 'fechado');
  await page.waitForFunction(() => document.querySelector('[data-lead-column="fechado"] [data-lead-id="kanban-analise"]'));
  assert.equal(await page.locator('[data-lead-column="em_analise"] .lead-kanban-count').textContent(), '0');
  assert.equal(await page.locator('[data-lead-column="fechado"] .lead-kanban-count').textContent(), '2');
  assert.ok(requests.some(request => request.method === 'POST' && /\/api\/state$/.test(request.url)), 'Movimento persiste pelo flush oficial do Store.');

  await page.reload();
  await page.waitForFunction(() => window.Atrium?.Store?.state?.leads?.length === 7);
  const persisted = await page.evaluate(() => ({
    moved: window.Atrium.Store.state.leads.find(lead => lead.id === 'kanban-novo-1')?.status,
    dragged: window.Atrium.Store.state.leads.find(lead => lead.id === 'kanban-analise')?.status,
    view: globalThis.localStorage?.getItem('atrium:leads:view'),
    audits: window.Atrium.Store.state.audit.filter(entry => entry.action === 'Atendimento movimentado').length
  }));
  assert.equal(persisted.moved, 'proposta');
  assert.equal(persisted.dragged, 'fechado');
  assert.equal(persisted.view, 'kanban');
  assert.equal(persisted.audits, 2);
  assert.deepEqual(pageErrors, []);
  await context.close();
  console.log('PASS Kanban de CRM agrupa, abre e movimenta estágios pelo fluxo oficial com persistência');
} finally {
  await session.stop();
}
