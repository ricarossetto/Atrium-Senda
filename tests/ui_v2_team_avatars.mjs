import assert from 'node:assert/strict';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const TODAY = new Date().toISOString().slice(0, 10);

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1250, height: 900 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl);
  await page.route('**/api/auth/users', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      currentRole: 'master_admin',
      users: [
        { id: 'user-avatar-1', username: 'ricardo.teste', displayName: 'Ricardo Teste', email: 'ricardo@example.test', role: 'master_admin', status: 'active', avatar: PNG },
        { id: 'user-avatar-2', username: 'advogada.teste', displayName: 'Advogada Teste', email: 'advogada@example.test', role: 'collaborator', status: 'active', avatar: '' }
      ]
    })
  }));
  // Recarrega com o mock ativo para o diretório de integrantes do boot já nascer sintético.
  await page.reload();
  await page.locator('#appShell:not(.hidden)').waitFor();
  await page.evaluate(async today => {
    const { App, Store } = window.Atrium;
    Store.state.tasks.push({
      id: 'avatar-task-1',
      title: 'Tarefa com avatar do integrante',
      status: 'triagem',
      active: true,
      responsible: 'Ricardo Teste',
      assigneeUserId: 'user-avatar-1',
      deadline: today,
      createdAt: new Date().toISOString()
    });
    Store.state.processes.push({
      id: 'avatar-process-1',
      number: '5000000-00.2026.8.21.0010',
      client: 'Cliente Avatar Sintético',
      responsible: 'Ricardo Teste',
      responsibleUserIds: ['user-avatar-1']
    });
    Store.save();
    if (!await Store.flush()) throw new Error('Fixture save failed');
    App.renderAll();
  }, TODAY);

  await page.evaluate(() => window.Atrium.App.switchView('configuration'));
  await page.locator('[data-config-section="users"]').click();
  const memberCard = page.locator('.configuration-user-row[data-auth-user-id="user-avatar-1"]');
  await memberCard.waitFor();
  await page.waitForFunction(() => document.querySelector('.configuration-user-row[data-auth-user-id="user-avatar-1"] img.member-avatar-image'));
  assert.match(await memberCard.locator('.config-user-workload').textContent(), /1 tarefa aberta · 1 processo/, 'Carga do integrante conta tarefa e processo por id.');

  await page.evaluate(() => window.Atrium.App.switchView('kanban'));
  await page.waitForFunction(() => document.querySelector('.task-owner img.member-avatar-image'));
  assert.equal(await page.locator('.task-owner img.member-avatar-image').count(), 1, 'Cartão usa a foto do integrante vinculado.');
  await page.locator('#newTaskButton').click();
  await page.locator('#modalBackdrop[data-modal-mode="task"]:not(.hidden)').waitFor();
  assert.ok(await page.locator('#modalFields .modal-combobox-avatar').count() >= 1, 'Picker de responsável mostra avatares.');
  await page.keyboard.press('Escape');
  await page.locator('#modalBackdrop').waitFor({ state: 'hidden' });

  await page.evaluate(() => window.Atrium.App.switchView('processes'));
  const processRow = page.locator('#processTableBody [data-process-id="avatar-process-1"]');
  await processRow.waitFor();
  await processRow.click();
  await page.locator('#processInspectorBackdrop:not(.hidden)').waitFor();
  await page.waitForFunction(() => document.querySelector('.process-responsible-avatar img.member-avatar-image'));
  assert.equal(await page.locator('.process-responsible-avatar img.member-avatar-image').count(), 1, 'Inspetor do processo mostra o avatar do responsável.');

  await page.evaluate(() => window.Atrium.App.switchView('agenda'));
  await page.waitForFunction(() => document.querySelector('.agenda-activity-subtitle img.member-avatar-image'));
  assert.ok(await page.locator('.agenda-activity-subtitle img.member-avatar-image').count() >= 1, 'Atividade da agenda herda o avatar da tarefa.');

  assert.deepEqual(pageErrors, []);
  await context.close();
  console.log('PASS Equipe e avatares: membro, carga, tarefa, picker, processo e agenda com o mesmo fallback oficial');
} finally {
  await session.stop();
}
