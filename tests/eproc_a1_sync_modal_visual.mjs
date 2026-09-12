import assert from 'node:assert/strict';
import { prepareUiV2Page, prepareUiV2ProcessesFixture, startUiV2Session } from './ui_v2_helpers.mjs';

console.log('\n===============================================================');
console.log('  TESTE E2E: MONITOR VISUAL DE SINCRONIZAÇÃO EPROC A1');
console.log('===============================================================\n');

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });

  // Intercepta a rota /api/integrations/eproc/sweep para simular resposta realista de 3 segundos
  let sweepRequested = false;
  await page.route('**/api/integrations/eproc/sweep', async route => {
    sweepRequested = true;
    // Aguarda 2.5s para permitir acompanhar visualmente a evolução das etapas e logs
    await new Promise(resolve => setTimeout(resolve, 2500));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        enrichedCount: 3,
        message: '3 processo(s) TJRS sincronizado(s) e enriquecido(s) com sucesso!'
      })
    });
  });

  await prepareUiV2ProcessesFixture(page);

  console.log('[1/5] Verificando presença do botão Sincronizar eproc A1...');
  const btnSyncEproc = page.locator('#btnSyncEprocA1');
  await btnSyncEproc.waitFor({ state: 'visible', timeout: 5000 });
  assert.ok(await btnSyncEproc.isVisible(), 'Botão #btnSyncEprocA1 deve estar visível');
  console.log('  ✓ Botão #btnSyncEprocA1 visível na tabela de processos.');

  console.log('[2/5] Acionando Sincronizar eproc A1...');
  await btnSyncEproc.click();

  // Verifica que o botão recebeu a classe is-syncing
  const isSyncing = await page.evaluate(() => {
    const btn = document.getElementById('btnSyncEprocA1');
    return btn?.classList.contains('is-syncing') && btn?.getAttribute('aria-busy') === 'true';
  });
  assert.ok(isSyncing, 'Botão #btnSyncEprocA1 deve receber classe is-syncing e aria-busy="true"');
  console.log('  ✓ Botão ativado com spinner e indicador visual de processamento.');

  console.log('[3/5] Verificando abertura do Modal de Monitoramento (#eprocSyncModalBackdrop)...');
  const modal = page.locator('#eprocSyncModalBackdrop');
  await modal.waitFor({ state: 'visible', timeout: 3000 });
  assert.ok(await modal.isVisible(), 'Modal de sincronização eproc deve abrir visivelmente');

  // Captura evidência visual do modal em execução
  const screenshotPath = 'artifacts/eproc_sync_modal_live.png';
  await page.screenshot({ path: screenshotPath });
  console.log(`  ✓ Modal visível! Evidência salva em: ${screenshotPath}`);

  console.log('[4/5] Verificando checklist dos 5 passos e console em tempo real...');
  const step1Status = await page.locator('#eprocStep1').getAttribute('data-status');
  assert.ok(['active', 'completed'].includes(step1Status), 'Passo 1 deve estar ativo ou concluído');

  const percentLabel = await page.locator('#eprocSyncPercentLabel').textContent();
  const fillWidth = await page.evaluate(() => document.getElementById('eprocSyncModalFill')?.style.width);
  console.log(`  ✓ Progresso atual: ${percentLabel} (barra: ${fillWidth})`);

  const initialLogCount = await page.locator('#eprocSyncConsoleLogs .eproc-sync-log-line').count();
  assert.ok(initialLogCount >= 2, 'Console de logs deve conter pelo menos 2 registros iniciais');
  const firstLog = await page.locator('#eprocSyncConsoleLogs .eproc-sync-log-line').first().textContent();
  console.log(`  ✓ Primeiro log registrado: ${firstLog.trim()}`);

  console.log('[5/5] Aguardando conclusão da sincronização e validação do estado final...');
  const doneBtn = page.locator('#eprocSyncModalDone');
  await doneBtn.waitFor({ state: 'visible', timeout: 6000 });
  assert.ok(await doneBtn.isVisible(), 'Botão Concluir deve ficar visível ao término');

  const finalStatus = await page.locator('#eprocSyncStatusLabel').textContent();
  assert.match(finalStatus, /Concluída/i, 'Status deve indicar conclusão');
  const finalPercent = await page.locator('#eprocSyncPercentLabel').textContent();
  assert.equal(finalPercent.trim(), '100%', 'Percentual deve atingir 100%');

  // Todos os passos 1 a 5 devem estar marcados como "completed"
  for (let i = 1; i <= 5; i++) {
    const status = await page.locator(`#eprocStep${i}`).getAttribute('data-status');
    assert.equal(status, 'completed', `Passo ${i} deve estar concluído`);
  }
  console.log('  ✓ Todos os 5 passos do checklist concluídos com sucesso!');

  // Fecha o modal via botão Concluir
  await doneBtn.click();
  await modal.waitFor({ state: 'hidden', timeout: 3000 });
  assert.ok(await modal.isHidden(), 'Modal deve fechar após clique em Concluir');
  console.log('  ✓ Modal fechado com sucesso.');

  // Verifica que o botão voltou ao estado normal
  const isSyncingAfter = await page.evaluate(() => document.getElementById('btnSyncEprocA1')?.classList.contains('is-syncing'));
  assert.equal(isSyncingAfter, false, 'Botão deve remover classe is-syncing após término');
  console.log('  ✓ Botão restaurado ao estado inicial.');

  assert.equal(pageErrors.length, 0, `Nenhum erro de página tolerado: ${pageErrors.join('; ')}`);
  console.log('\n===============================================================');
  console.log('  SUCESSO TOTAL: MONITOR VISUAL EPROC A1 100% APROVADO!');
  console.log('===============================================================\n');
} finally {
  await session.stop();
}
