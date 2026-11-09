import assert from 'node:assert/strict';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const session = await startUiV2Session({ headless: true });
let pageErrors;

try {
  const context = await session.createContext();
  const prepared = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });
  pageErrors = prepared.pageErrors;
  const page = prepared.page;
  const mutationsBefore = await page.evaluate(() => globalThis.__uiV2RuntimeProbe.mutationRequests.length);
  await page.evaluate(() => {
    const Store = window.Atrium.Store;
    Store.state.processes = [{
      id: 'fin-synthetic',
      number: '5000000-00.2026.8.21.0001',
      client: 'Cliente Sintético',
      feeInstallments: [
        { id: 'fi-aug', amount: 1000, dueDate: '2026-08-10', status: 'pendente', description: 'Parcela agosto' },
        { id: 'fi-sep', amount: 500, dueDate: '2026-09-10', status: 'pago', description: 'Parcela setembro' }
      ],
      expenses: [
        { id: 'exp-sep', amount: 200, date: '2026-09-02', status: 'pendente', description: 'Custas setembro' }
      ],
      receipts: [
        { id: 'rec-aug', amount: 300, date: '2026-08-20', status: 'recebido', description: 'Recebimento agosto' }
      ],
      requisitionAmount: 5000,
      requisitionStatus: 'requisitado',
      feePercentage: 20
    }];
    window.Atrium.App.switchView('financial');
    window.Atrium.App.renderFinancial();
  });
  await page.locator('#financialChart .financial-chart-surface').waitFor();
  assert.equal(await page.evaluate(() => globalThis.__uiV2RuntimeProbe.mutationRequests.length), mutationsBefore, 'O gráfico é leitura pura.');
  assert.ok(await page.locator('#financialChart .financial-chart-bar.is-revenue').count() >= 1, 'Deve haver barra de receita.');
  assert.ok(await page.locator('#financialChart .financial-chart-bar.is-expense').count() >= 1, 'Deve haver barra de despesa.');
  const expenseHeights = await page.locator('#financialChart .financial-chart-bar.is-expense').evaluateAll(bars => bars.map(bar => bar.getBBox().height));
  assert.ok(expenseHeights.some(height => height > 0), 'Despesa com data deve aparecer na barra de vencimento.');
  assert.equal(await page.locator('#financialChart .financial-chart-donut-segment.is-parcela').count(), 1);
  assert.equal(await page.locator('#financialChart .financial-chart-donut-segment.is-rpv').count(), 1);
  assert.equal(await page.locator('#financialChart .financial-chart-donut-segment.is-despesa').count(), 1);
  const text = await page.locator('#financialChart').innerText();
  assert.match(text, /Receitas × despesas por vencimento/i);
  assert.match(text, /Distribuição por categoria/i);
  assert.match(text, /Ver dados em tabela/i);
  assert.match(text, /RPV \/ Alvarás/i);
  assert.match(text, /Honorários/i);
  assert.deepEqual(pageErrors, []);
  await context.close();

  const emptyContext = await session.createContext();
  const empty = await prepareUiV2Page(emptyContext, session.server.baseUrl, { theme: 'dark' });
  await empty.page.evaluate(() => {
    window.Atrium.App.switchView('financial');
    window.Atrium.App.renderFinancial();
  });
  await empty.page.locator('#financialChart .financial-chart-surface').waitFor();
  assert.equal(await empty.page.locator('#financialChart .financial-chart-empty').count(), 2, 'Sem lançamentos, os dois gráficos mostram estado vazio honesto.');
  assert.deepEqual(empty.pageErrors, []);
  await emptyContext.close();

  console.log('✓ Gráfico financeiro aprovado: barras por vencimento, categorias, tabela acessível e estados vazios.');
} finally {
  await session.stop();
}
