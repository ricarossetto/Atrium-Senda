import {
  prepareUiV2AssistantFixture,
  prepareUiV2Page,
  startUiV2Session
} from './ui_v2_helpers.mjs';

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 390, height: 844 } });
  const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });

  // Rodapé do sheet de identidade
  await page.evaluate(() => window.Atrium.App.switchView('configuration'));
  await page.locator('#openOfficeIdentityFromConfiguration').click();
  await page.locator('#officeSetupBackdrop:not(.hidden)').waitFor();
  const office = await page.evaluate(() => {
    const footer = document.querySelector('#officeSetupForm > footer');
    const form = document.getElementById('officeSetupForm');
    const rect = element => { const r = element.getBoundingClientRect(); return { t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height) }; };
    return { position: getComputedStyle(footer).position, footer: rect(footer), form: rect(form), scrollTop: form.scrollTop, scrollHeight: form.scrollHeight, clientHeight: form.clientHeight };
  });
  await page.locator('#officeSetupClose').click();
  await page.locator('#officeSetupBackdrop.hidden').waitFor({ state: 'attached' });

  // Títulos por view
  const views = ['financial', 'documents', 'reports', 'links', 'processes', 'contacts', 'monitoring', 'integrations', 'leads', 'calculations', 'prompts', 'inbox', 'kanban', 'agenda', 'dashboard'];
  const titles = [];
  for (const view of views) {
    await page.evaluate(selected => window.Atrium.App.switchView(selected), view);
    await page.waitForTimeout(120);
    titles.push(await page.evaluate(() => {
      const title = document.getElementById('viewTitle');
      return { view: document.querySelector('.view.active')?.id, text: title.textContent.trim(), fontSize: getComputedStyle(title).fontSize, truncated: title.scrollWidth > title.clientWidth + 1, overflow: document.documentElement.scrollWidth - innerWidth };
    }));
  }

  // Composer do Assistente
  await prepareUiV2AssistantFixture(page);
  const assistant = await page.evaluate(() => {
    const view = document.getElementById('view-assistant');
    const rect = element => { const r = element.getBoundingClientRect(); return { t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) }; };
    const visible = element => element && element.getClientRects().length > 0;
    const composer = view.querySelector('form') || view;
    const parts = {
      textarea: view.querySelector('#aiChatInput') ? rect(view.querySelector('#aiChatInput')) : null,
      disclaimer: null,
      hint: null
    };
    for (const paragraph of view.querySelectorAll('p, small, span')) {
      if (!visible(paragraph)) continue;
      const text = (paragraph.textContent || '').trim();
      if (text.startsWith('Ao enviar, sua mensagem')) parts.disclaimer = { ...rect(paragraph), display: getComputedStyle(paragraph).display, text: text.slice(0, 40) };
      if (text.startsWith('Enter envia')) parts.hint = { ...rect(paragraph), display: getComputedStyle(paragraph).display, text: text.slice(0, 40) };
    }
    parts.buttons = [...view.querySelectorAll('button')].filter(visible).map(button => ({ id: button.id, text: (button.textContent || '').trim().slice(0, 24), ...rect(button) })).filter(button => button.t > view.getBoundingClientRect().top + 200);
    parts.composer = rect(composer);
    return parts;
  });

  await page.evaluate(() => window.Atrium.App.switchView('dashboard'));
  await page.waitForTimeout(200);
  const dashboardHeader = await page.evaluate(() => {
    const rect = element => { const r = element.getBoundingClientRect(); return { t: Math.round(r.top), l: Math.round(r.left), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width) }; };
    const header = document.querySelector('#view-dashboard .dashboard-tasks-header');
    const sort = document.querySelector('#view-dashboard .dashboard-tasks-header .inbox-sort-control');
    const filters = document.getElementById('dashboardTaskFilters');
    const count = document.getElementById('dashboardTaskCount');
    return { header: rect(header), count: rect(count), sort: rect(sort), filters: rect(filters), overflow: document.documentElement.scrollWidth - innerWidth };
  });

  await page.evaluate(() => window.Atrium.App.switchView('reports'));
  await page.waitForTimeout(200);
  const reportsToolbar = await page.evaluate(() => {
    const rect = element => { const r = element.getBoundingClientRect(); return { t: Math.round(r.top), l: Math.round(r.left), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), text: (element.textContent || '').trim().slice(0, 28) }; };
    return {
      children: [...document.querySelectorAll('#view-reports .reports-toolbar > *')].filter(element => element.getClientRects().length).map(rect),
      overflow: document.documentElement.scrollWidth - innerWidth
    };
  });

  console.log(JSON.stringify({ office, titles, assistant, dashboardHeader, reportsToolbar, pageErrors }, null, 2));
} finally {
  await session.stop();
}
