import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startUiV2Session, prepareUiV2Page, prepareUiV2TasksFixture, prepareUiV2ProcessesFixture, switchUiV2View } from '../tests/ui_v2_helpers.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function main() {
  const session = await startUiV2Session();
  try {
    // 1. Auth Gate Visuals (Fresh unauthenticated context)
    const authContext = await session.browser.newContext({ viewport: { width: 1440, height: 900 } });
    const authPage = await authContext.newPage();
    await authPage.goto(session.server.baseUrl);
    await authPage.waitForTimeout(600);

    // Light mode
    await authPage.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await authPage.waitForTimeout(200);

    // Tab 1: Login
    await authPage.locator('#authTabLogin').click();
    await authPage.waitForTimeout(150);
    await authPage.screenshot({ path: path.join(ROOT, 'artifacts', 'auth_gate_light_login.png') });
    console.log('✓ Saved auth_gate_light_login.png');

    // Tab 2: Criar Escritório
    await authPage.locator('#authTabRegister').click();
    await authPage.waitForTimeout(150);
    await authPage.screenshot({ path: path.join(ROOT, 'artifacts', 'auth_gate_light_register.png') });
    console.log('✓ Saved auth_gate_light_register.png');

    // Tab 3: Com Convite
    await authPage.locator('#authTabInvite').click();
    await authPage.waitForTimeout(150);
    await authPage.screenshot({ path: path.join(ROOT, 'artifacts', 'auth_gate_light_invite.png') });
    console.log('✓ Saved auth_gate_light_invite.png');

    // Dark mode
    await authPage.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await authPage.waitForTimeout(200);

    // Dark Login
    await authPage.locator('#authTabLogin').click();
    await authPage.waitForTimeout(150);
    await authPage.screenshot({ path: path.join(ROOT, 'artifacts', 'auth_gate_dark_login.png') });
    console.log('✓ Saved auth_gate_dark_login.png');

    // Dark Register
    await authPage.locator('#authTabRegister').click();
    await authPage.waitForTimeout(150);
    await authPage.screenshot({ path: path.join(ROOT, 'artifacts', 'auth_gate_dark_register.png') });
    console.log('✓ Saved auth_gate_dark_register.png');

    // Dark Invite
    await authPage.locator('#authTabInvite').click();
    await authPage.waitForTimeout(150);
    await authPage.screenshot({ path: path.join(ROOT, 'artifacts', 'auth_gate_dark_invite.png') });
    console.log('✓ Saved auth_gate_dark_invite.png');
    await authContext.close();

    // 2. Authenticated App Context (Tasks and Processes)
    const appContext = await session.createContext({ viewport: { width: 1440, height: 900 } });
    const { page } = await prepareUiV2Page(appContext, session.server.baseUrl, { theme: 'light' });
    await prepareUiV2TasksFixture(page);
    await prepareUiV2ProcessesFixture(page);

    // Navigate to Tasks
    await switchUiV2View(page, 'kanban');
    // Switch to List mode
    await page.locator('#taskListViewButton').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(ROOT, 'artifacts', 'tasks_view_list.png') });
    console.log('✓ Saved tasks_view_list.png (list mode)');

    // Switch to Kanban mode
    await page.locator('#taskKanbanViewButton').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(ROOT, 'artifacts', 'tasks_view_kanban.png') });
    console.log('✓ Saved tasks_view_kanban.png (kanban mode)');

    // Navigate to Processes
    await switchUiV2View(page, 'processes');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(ROOT, 'artifacts', 'processes_view_toolbar.png') });
    console.log('✓ Saved processes_view_toolbar.png (with Sincronizar eproc A1 button)');

    // Open first process inspector
    const firstRow = page.locator('#processTable tbody tr').first();
    if (await firstRow.count() > 0) {
      await firstRow.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(ROOT, 'artifacts', 'processes_inspector_buttons.png') });
      console.log('✓ Saved processes_inspector_buttons.png');
    }

    console.log('All verification screenshots captured successfully.');
  } finally {
    await session.stop();
  }
}

main().catch(err => {
  console.error('Error during verification:', err);
  process.exit(1);
});
