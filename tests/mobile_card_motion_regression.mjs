import assert from 'node:assert/strict';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const session = await startUiV2Session();
try {
  for (const width of [320, 375, 390, 430]) {
    for (const theme of ['light', 'dark']) {
      const context = await session.createContext({ viewport: { width, height: 844 }, reducedMotion: 'no-preference' });
      try {
        const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
        await page.locator('#view-dashboard.active').waitFor();
        await page.locator('#dashboardTaskList').evaluate(list => {
          list.innerHTML = `<div class="dashboard-task-item"><input type="checkbox" class="dashboard-task-check" aria-label="Concluir tarefa sintética"><div class="dashboard-task-body"><div class="dashboard-task-title">Prazo eproc — 25/09/2026 00:00:00</div><div class="dashboard-task-process"><strong>Cliente Teste</strong><span class="dashboard-task-process-badge">5000000-00.2026.4.04.0000</span><span class="dashboard-task-action-type"><b>PROCEDIMENTO DO JUIZADO ESPECIAL CÍVEL COM DESCRIÇÃO EXTENSA</b></span></div><div class="dashboard-task-tags"><span class="task-tag prazo">Prazo</span></div></div><div class="dashboard-task-date">08/10/2026</div></div>`;
        });
        const card = await page.evaluate(() => {
          const item = document.querySelector('#dashboardTaskList .dashboard-task-item');
          item.scrollIntoView();
          const title = item.querySelector('.dashboard-task-title');
          const date = item.querySelector('.dashboard-task-date');
          const body = item.querySelector('.dashboard-task-body');
          const process = item.querySelector('.dashboard-task-process');
          const action = item.querySelector('.dashboard-task-action-type b');
          const rect = element => element.getBoundingClientRect();
          return {
            item: rect(item), title: rect(title), date: rect(date), body: rect(body), process: rect(process), action: rect(action),
            titleSize: parseFloat(getComputedStyle(title).fontSize),
            actionClipped: action.scrollWidth > action.clientWidth + 2,
            overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth
          };
        });
        assert.ok(card.title.right <= card.date.left + 2 || card.title.bottom <= card.date.top + 2 || card.date.bottom <= card.title.top + 2, `${width}/${theme}: título não pode colidir com a data`);
        assert.ok(card.process.top >= card.date.bottom - 2 || card.process.right <= card.date.left + 2 || card.process.left >= card.date.right - 2, `${width}/${theme}: metadados não podem colidir com a data`);
        assert.ok(card.date.right <= card.item.right + 2 && card.date.left >= card.item.left - 2, `${width}/${theme}: data deve ficar dentro do cartão`);
        assert.ok(card.body.left >= card.item.left - 2 && card.body.right <= card.item.right + 2, `${width}/${theme}: corpo dentro do cartão`);
        assert.ok(card.process.right <= card.item.right + 2 && card.action.right <= card.item.right + 2, `${width}/${theme}: metadados dentro do cartão`);
        assert.ok(card.titleSize >= 12 && !card.actionClipped && card.overflow <= 2, `${width}/${theme}: informação completa, fonte legível e sem overflow`);
        if (width === 390 && theme === 'light') {
          await page.screenshot({ path: 'artifacts/mobile-review/card-synthetic-390-light.png' });
        }
        const motion = await page.evaluate(() => {
          const actions = getComputedStyle(document.querySelector('.topbar-actions'));
          const nav = getComputedStyle(document.querySelector('.v2-mobile-nav'));
          const durations = style => style.transitionDuration.split(',').map(value => parseFloat(value) * (value.includes('ms') ? .001 : 1));
          const expanded = { actions: durations(actions), nav: durations(nav) };
          document.documentElement.dataset.v2MobileChrome = 'reading';
          const reading = { actions: durations(getComputedStyle(document.querySelector('.topbar-actions'))), nav: durations(getComputedStyle(document.querySelector('.v2-mobile-nav'))) };
          return { expanded, reading };
        });
        assert.ok(motion.expanded.actions[0] >= .28 && motion.expanded.nav[0] >= .28 && motion.reading.actions[0] >= .28 && motion.reading.nav[0] >= .28, `${width}/${theme}: entrada e saída progressivas`);
        assert.deepEqual(pageErrors, [], `${width}/${theme}: nenhum pageerror`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await session.stop();
}
console.log('Card mobile e movimento: cenários sintéticos aprovados.');
