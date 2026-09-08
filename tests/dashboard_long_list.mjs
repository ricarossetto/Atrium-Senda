import './fixtures/omni-network.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { CNJ } from './fixtures/omni-network.mjs';
import { prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';
const session = await startUiV2Session();
await mkdir('artifacts/omni-ui', { recursive: true });
try {
  for (const width of [1440,390]) {
    const context = await session.createContext({ viewport: { width, height: 900 } });
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
    await page.evaluate(number => {
      const {Store,App} = window.Atrium;
      Store.state.processes = [{ id:'long-process', number, client:'Cliente Sintético', actionType:'Danos materiais' }];
      Store.state.tasks = Array.from({length:40},(_,i) => ({id:'long-'+i, title:'Tarefa Sintética '+(i+1), processId:'long-process', status:'andamento', deadline:'2099-01-02', responsible:'Equipe Sintética'}));
      App.renderAll();
    }, CNJ);
    assert.equal(await page.locator('#dashboardTaskList [data-dashboard-task-id]').count(),40);
    const layout = await page.evaluate(() => {
      const list=document.querySelector('#dashboardTaskList'), secondary=document.querySelector('.activity-inbox');
      const style=getComputedStyle(list), rect=list.getBoundingClientRect();
      return { bottom:rect.bottom, secondaryTop:secondary.getBoundingClientRect().top, maxHeight:style.maxHeight, overflow:document.documentElement.scrollWidth-innerWidth };
    });
    assert.ok(layout.bottom <= layout.secondaryTop);
    assert.equal(layout.maxHeight,'none');
    assert.ok(layout.overflow<=1);
    assert.match(await page.locator('[data-dashboard-task-id="long-0"]').textContent(), /Cliente Sintético/);
    assert.match(await page.locator('[data-dashboard-task-id="long-0"]').textContent(), /Danos materiais/);
    await page.locator('#dashboardTaskList').scrollIntoViewIfNeeded();
    await page.screenshot({path:`artifacts/omni-ui/dashboard-long-${width}.png`});
    await page.locator('[data-dashboard-task-id="long-0"]').click();
    await page.locator('#modalBackdrop[data-modal-mode="task"]:not(.hidden)').waitFor();
    assert.equal(await page.locator('#field-title').inputValue(),'Tarefa Sintética 1');
    assert.deepEqual(pageErrors,[]);
    await context.close();
    console.log('PASS long dashboard list '+width+'px: 40 tasks, client, process, action type, exact task opening');
  }
} finally { await session.stop(); }
