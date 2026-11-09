import assert from 'node:assert/strict';
import { startUiV2Session, prepareUiV2Page, prepareUiV2TasksFixture } from './ui_v2_helpers.mjs';

const users = [
  { id: 'u-ana', username: 'ana.teste', displayName: 'Dra. Ana Teste', email: 'ana@example.test', role: 'collaborator', status: 'active', oab: '000001', oabUf: 'RS' },
  { id: 'u-bruno', username: 'bruno.teste', displayName: 'Bruno Teste', email: 'bruno@example.test', role: 'collaborator', status: 'active', oab: '000002', oabUf: 'RS' },
  { id: 'u-carla', username: 'carla.teste', displayName: 'Carla Teste', email: 'carla@example.test', role: 'collaborator', status: 'active' }
];
const teams = [{ id: 'team-prev', name: 'Previdenciário', description: 'Equipe sintética', memberIds: ['u-ana', 'u-bruno'] }];

async function prepare(context, session, viewport) {
  await context.route('**/api/auth/users', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users, currentRole: 'admin' }) }));
  await context.route('**/api/office/teams', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ teams }) }));
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'dark', probe: true });
  await page.setViewportSize(viewport);
  await prepareUiV2TasksFixture(page);
  await page.evaluate(() => {
    const { App, Store } = window.Atrium;
    const tasks = Store.state.tasks;
    tasks[0].assigneeUserId = 'u-ana';
    tasks[0].followerUserIds = ['u-bruno', 'u-carla'];
    tasks[1].assigneeUserId = 'u-bruno';
    Store.state.intimations[0].treatmentStatus = 'untreated';
    Store.state.intimations[0].publicationLawyers = [
      { name: 'Dra. Ana Teste', oab: '000001', uf: 'RS' },
      { name: 'Bruno Teste', oab: '000002', uf: 'RS' }
    ];
    App.renderAll();
  });
  return { page, pageErrors };
}

const session = await startUiV2Session();
try {
  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepare(desktop, session, { width: 1440, height: 900 });
    await page.locator('#taskListViewButton').click();
    await page.locator('#taskList .office-involved').first().waitFor();
    const taskText = await page.locator('#taskList .office-involved').first().innerText();
    assert.match(taskText, /Ana/);
    assert.match(taskText, /Previdenciário/);

    await page.locator('#taskKanbanViewButton').click();
    await page.locator('#kanbanBoard .task-card-involved').first().waitFor();
    await page.evaluate(() => window.Atrium.App.switchView('dashboard'));
    await page.locator('#view-dashboard.active').waitFor();
    await page.locator('#dashboardTaskList .dashboard-task-involved .office-involved').first().waitFor();
    const dashboardText = await page.locator('#dashboardTaskList .dashboard-task-involved .office-involved').first().innerText();
    assert.match(dashboardText, /Ana/);
    assert.match(dashboardText, /Previdenciário/);

    await page.evaluate(() => window.Atrium.App.switchView('inbox'));
    await page.locator('#view-inbox.active').waitFor();
    await page.locator('#inboxList .publication-record-aside .office-involved').first().waitFor();
    const publicationText = await page.locator('#inboxList .publication-record-aside .office-involved').first().innerText();
    assert.match(publicationText, /Ana/);
    assert.match(publicationText, /Previdenciário/);
    assert.deepEqual(pageErrors, [], `Erros de página: ${pageErrors.join(' | ')}`);
  } finally {
    await desktop.close();
  }

  const mobile = await session.createContext({ viewport: { width: 390, height: 844 } });
  try {
    const { page, pageErrors } = await prepare(mobile, session, { width: 390, height: 844 });
    await page.locator('#taskListViewButton').click();
    await page.locator('#taskList .office-involved').first().waitFor();
    const taskText = await page.locator('#taskList .office-involved').first().innerText();
    assert.match(taskText, /Ana/);
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `Sem overflow horizontal no mobile: ${overflow}px`);
    await page.evaluate(() => window.Atrium.App.switchView('inbox'));
    await page.locator('#inboxList .office-involved').first().waitFor();
    overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `Sem overflow horizontal da publicação no mobile: ${overflow}px`);
    assert.deepEqual(pageErrors, [], `Erros de página mobile: ${pageErrors.join(' | ')}`);
  } finally {
    await mobile.close();
  }
  console.log('[PASS] Envolvidos visíveis em tarefas, Área de trabalho e publicações.');
} finally {
  await session.stop();
}
