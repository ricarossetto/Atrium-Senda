import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2FinancialFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [featureSource, presenterSource, portalSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/financial.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/views/ui-v2/financial-presenter.js'), 'utf8'),
  readFile(path.join(ROOT, 'js/portal.js'), 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — UI V2 FINANCIAL OPERATIONS WORKSPACE');
console.log('===============================================================\n');

assert.equal((portalSource.match(/createFinancialFeature\s*\(/g) || []).length, 1, 'Deve existir uma única Financial Feature.');
assert.doesNotMatch(`${featureSource}\n${portalSource}`, /state\.(?:financial|financialEntries|payments|ledger)|financialStore/);
assert.doesNotMatch(presenterSource, /\bStore\b|\bfetch\s*\(|\bsave\s*\(|\bflush\s*\(|\baudit\s*\(|setInterval|state\./);
assert.match(featureSource, /proc\.requisitionAmount \?\? proc\.rpvAmount \?\? proc\.economicValue \?\? 0/);
assert.match(featureSource, /hasFeeAmount \? Number\(proc\.feeAmount\) : \(gross \* feePct \/ 100\)/);
assert.match(featureSource, /Math\.max\(0, gross - feeAmount\)/);
assert.match(featureSource, /if \(submittingEntry\) return/);
assert.match(featureSource, /store\.state = stateBeforeSubmit/);
assert.match(featureSource, /entryType === 'rpv'[\s\S]*requisitionAmount = grossAmount[\s\S]*entryType === 'exito'[\s\S]*feeAmount = grossAmount \* feePercentage \/ 100[\s\S]*entryType === 'fixo'[\s\S]*feeAmount = grossAmount[\s\S]*entryType === 'mensal'[\s\S]*feeMonthly = grossAmount/);

const session = await startUiV2Session();
try {
  const context = await session.createContext();
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { probe: true });
  await prepareUiV2FinancialFixture(page);

  const readOnlyRequests = [];
  page.on('request', request => readOnlyRequests.push({ method: request.method(), url: request.url() }));
  const initial = await page.evaluate(() => ({
    processes: JSON.stringify(window.Atrium.Store.state.processes),
    audit: window.Atrium.Store.state.audit.length,
    mutationRequests: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));

  assert.equal(await page.locator('.financial-v2-table [data-financial-record]').count(), 8);
  assert.equal(await page.locator('[data-financial-record="fin-rpv-zero"]').first().textContent().then(text => text.includes('R$\u00a00,00')), true, 'RPV zero explícito deve permanecer zero.');
  const feeZero = await page.locator('[data-financial-record="fin-fee-zero"]').first().textContent();
  assert.ok(feeZero.includes('Honorários fixos') && feeZero.includes('R$\u00a00,00'), 'feeAmount zero deve permanecer visível.');
  assert.match(await page.locator('[data-financial-record="fin-unknown"]').first().textContent(), /em_conferencia_sintetica/);
  assert.match(await page.locator('[data-financial-record="fin-final"]').first().textContent(), /Repassado & Quitado/);

  await page.locator('[data-fin-filter="rpv"]').click();
  assert.equal(await page.locator('[data-fin-filter="rpv"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.financial-v2-table [data-financial-record]').count(), 5);
  await page.locator('[data-fin-filter="honorarios"]').click();
  assert.equal(await page.locator('.financial-v2-table [data-financial-record]').count(), 3);
  await page.locator('[data-fin-filter="all"]').click();
  await page.locator('#financialSearch').fill('Status Sintético');
  assert.equal(await page.locator('.financial-v2-table [data-financial-record]').count(), 1);
  await page.locator('#financialSearch').fill('nenhuma operação correspondente');
  assert.equal(await page.locator('.financial-v2-empty').isVisible(), true);
  await page.locator('#financialSearch').fill('');

  const trigger = page.locator('#newFinancialEntryButton');
  await trigger.focus();
  await trigger.click();
  await page.waitForFunction(() => document.querySelector('#financialEntryBackdrop .financial-entry-modal')?.contains(document.activeElement));
  assert.equal(await page.locator('#appShell').getAttribute('inert'), '');
  assert.deepEqual(await page.locator('#finTypeSelect option').evaluateAll(options => options.map(option => option.value)), ['rpv', 'exito', 'fixo', 'mensal', 'despesa']);
  await page.locator('#finGrossInput').fill('1000');
  await page.locator('#finFeePctInput').fill('25');
  assert.deepEqual(await page.locator('#finSumGross, #finSumFee, #finSumNet').allTextContents(), ['R$\u00a01.000,00', 'R$\u00a0250,00', 'R$\u00a0750,00']);
  await page.keyboard.press('Escape');
  await page.locator('#financialEntryBackdrop').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'newFinancialEntryButton');

  const afterReadOnly = await page.evaluate(() => ({
    processes: JSON.stringify(window.Atrium.Store.state.processes),
    audit: window.Atrium.Store.state.audit.length,
    mutationRequests: window.__uiV2RuntimeProbe.mutationRequests.length,
    intervals: window.__uiV2RuntimeProbe.intervals
  }));
  assert.deepEqual(afterReadOnly, initial, 'Render, filtro, busca, preview e drawer devem ser somente leitura.');
  assert.deepEqual(readOnlyRequests, [], 'A apresentação financeira não deve iniciar requests.');

  const bridge = await page.evaluate(() => {
    const original = window.portalApp.openDocumentGenerator;
    const calls = [];
    window.portalApp.openDocumentGenerator = options => calls.push(options);
    document.getElementById('btnGenDocPrestacao').click();
    window.portalApp.openDocumentGenerator = original;
    return calls;
  });
  assert.deepEqual(bridge, [{ type: 'prestacao_contas_rpv' }]);

  async function openAndFill({ process = 'fin-target-custas', type = 'despesa', gross = '500', percentage = '10', description = 'Preparo recursal sintético' } = {}) {
    await page.locator('#newFinancialEntryButton').click();
    await page.locator('#finProcessSelect').selectOption(process);
    await page.locator('#finTypeSelect').selectOption(type);
    if (type === 'despesa') await page.locator('#finDescriptionInput').fill(description);
    await page.locator('#finGrossInput').fill(gross);
    await page.locator('#finFeePctInput').fill(percentage);
  }
  async function dispatchSubmit() {
    await page.locator('#financialEntryForm').evaluate(form => form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: form.querySelector('[type="submit"]') })));
  }

  await openAndFill();
  await page.locator('#financialEntryForm button[type="submit"]').click();
  await page.locator('#financialEntryBackdrop').waitFor({ state: 'hidden' });
  const expense = await page.evaluate(() => window.Atrium.Store.state.processes.find(item => item.id === 'fin-target-custas')?.expenses?.at(-1));
  assert.equal(expense.description, 'Preparo recursal sintético');
  assert.equal(expense.amount, 500);
  assert.equal(expense.status, 'pendente');
  await page.locator('[data-fin-filter="despesas"]').click();
  assert.match(await page.locator('.financial-v2-table [data-financial-record]').first().textContent(), /Preparo recursal sintético/);

  await openAndFill({ type: 'exito', gross: '1000', percentage: '' });
  await dispatchSubmit();
  assert.match(await page.locator('#toastRegion .toast.error').last().textContent(), /percentual explícito/);
  await page.locator('#financialEntryCancel').click();

  await openAndFill({ type: 'exito', gross: '1000', percentage: '101' });
  await dispatchSubmit();
  assert.match(await page.locator('#toastRegion .toast.error').last().textContent(), /entre 0 e 100/);
  await page.locator('#financialEntryCancel').click();

  await openAndFill({ type: 'fixo', gross: '-1', percentage: '0' });
  await dispatchSubmit();
  assert.match(await page.locator('#toastRegion .toast.error').last().textContent(), /válido e não negativo/);
  await page.locator('#financialEntryCancel').click();

  await page.locator('#newFinancialEntryButton').click();
  await page.locator('#finProcessSelect').evaluate(select => {
    const option = new Option('Processo inexistente', 'missing-process');
    select.add(option);
    select.value = option.value;
  });
  await page.locator('#finGrossInput').fill('100');
  await dispatchSubmit();
  assert.match(await page.locator('#toastRegion .toast.error').last().textContent(), /processo válido/);
  await page.locator('#financialEntryCancel').click();

  await openAndFill({ process: 'fin-target-rollback', type: 'fixo', gross: '1234', percentage: '0' });
  const rollbackResult = await page.evaluate(async () => {
    const store = window.Atrium.Store;
    const before = JSON.stringify(store.state);
    const original = { save: store.save, flush: store.flush };
    store.save = () => true;
    store.flush = async () => false;
    document.getElementById('financialEntryForm').dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: document.querySelector('#financialEntryForm [type="submit"]') }));
    await new Promise(resolve => setTimeout(resolve, 0));
    const result = { before, after: JSON.stringify(store.state) };
    Object.assign(store, original);
    return result;
  });
  assert.equal(rollbackResult.after, rollbackResult.before, 'flush=false deve restaurar o snapshot integral.');
  assert.equal(await page.locator('#financialEntryBackdrop').isVisible(), true, 'Rollback não pode fechar o drawer.');
  await page.locator('#financialEntryCancel').click();

  await openAndFill({ process: 'fin-target-double', type: 'fixo', gross: '222', percentage: '0' });
  const doubleResult = await page.evaluate(async () => {
    const store = window.Atrium.Store;
    const original = { upsert: store.upsert, audit: store.audit, save: store.save, flush: store.flush };
    const counts = { upsert: 0, audit: 0, save: 0, flush: 0 };
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    store.upsert = () => { counts.upsert++; };
    store.audit = () => { counts.audit++; };
    store.save = () => { counts.save++; return true; };
    store.flush = () => { counts.flush++; return pending; };
    const form = document.getElementById('financialEntryForm');
    const event = () => new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: form.querySelector('[type="submit"]') });
    form.dispatchEvent(event());
    form.dispatchEvent(event());
    await Promise.resolve();
    release(true);
    await pending;
    await new Promise(resolve => setTimeout(resolve, 0));
    Object.assign(store, original);
    return counts;
  });
  assert.deepEqual(doubleResult, { upsert: 1, audit: 1, save: 1, flush: 1 });

  assert.deepEqual(pageErrors, [], `Erros de página: ${pageErrors.join(' | ')}`);
  await context.close();
} finally {
  await session.stop();
}

console.log('✓ Financeiro V2 aprovado: apresentação, zero, filtros, validação, rollback, double-submit e integrações.');
