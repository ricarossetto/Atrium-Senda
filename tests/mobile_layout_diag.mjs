import { prepareUiV2Page, prepareUiV2TasksFixture, startUiV2Session } from './ui_v2_helpers.mjs';

const width = Number(process.argv[2] || 390);
const mode = process.argv[3] || 'kanban';

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width, height: 844 } });
  const { page } = await prepareUiV2Page(context, session.server.baseUrl);
  await prepareUiV2TasksFixture(page);
  if (mode === 'list') {
    await page.locator('#taskListViewButton').click();
    await page.locator('#taskListPanel:not(.hidden)').waitFor();
  }
  await page.waitForTimeout(300);

  const dump = await page.evaluate(() => {
    const matchedRules = selector => {
      const element = document.querySelector(selector);
      if (!element) return { selector, missing: true };
      const hits = [];
      const walk = (rules, media) => {
        for (const rule of rules) {
          if (rule.cssRules && (rule.media || rule.conditionText)) { walk(rule.cssRules, rule.conditionText || media); continue; }
          if (rule.selectorText) {
            try {
              if (element.matches(rule.selectorText) && /height|width|align|display|stretch/.test(rule.style.cssText)) {
                hits.push({ media: media || null, selector: rule.selectorText, style: rule.style.cssText });
              }
            } catch {}
          }
        }
      };
      for (const sheet of document.styleSheets) {
        try { walk(sheet.cssRules, null); } catch {}
      }
      return { selector, hits };
    };
    const rect = element => {
      const value = element.getBoundingClientRect();
      return { x: Math.round(value.x), y: Math.round(value.y), w: Math.round(value.width), h: Math.round(value.height) };
    };
    const info = element => {
      const style = getComputedStyle(element);
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id || undefined,
        cls: String(element.className || '').slice(0, 90),
        rect: rect(element),
        display: style.display,
        visibility: style.visibility,
        position: style.position,
        text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70)
      };
    };
    const select = selector => document.querySelector(selector);
    const topbarActions = select('.topbar-actions');
    const card = select('.task-card');
    const column = select('.kanban-column');
    const picked = [
      '.section-toolbar', '.v2-task-heading', '#taskResultCount', '#taskViewSwitch',
      '#kanbanFilterButton', '#editKanbanColumnsButton', '#newTaskButton',
      '.global-search', '#themeToggleButton', '#syncButton', '.notification-button',
      '#v2UtilitiesMenu', '#v2UtilitiesMenu summary', '.v2-utilities-menu-panel'
    ];
    return {
      innerWidth,
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      topbar: { rect: rect(select('.topbar')), children: [...topbarActions.children].filter(child => getComputedStyle(child).display !== 'none').map(info) },
      picked: picked.map(selector => { const element = select(selector); return element ? { selector, ...info(element) } : { selector, missing: true }; }),
      duplicatedHint: [...document.querySelectorAll('p, span, div')]
        .filter(element => element.children.length === 0 && (element.textContent || '').includes('Arraste'))
        .map(info),
      toolbarChildren: [...select('.section-toolbar').children].filter(child => getComputedStyle(child).display !== 'none').map(info),
      card: card ? { rect: rect(card), children: [...card.children].map(info) } : null,
      cardParts: card ? [
        '.task-top', '.task-top-left', '.task-source', '.task-badges', '.task-priority', '.task-points',
        '.task-card-checkbox-label', '.task-checkbox-custom', '.task-card-checkbox',
        '.task-card-open', '.task-context', '.task-deadlines', '.task-effort', '.task-footer',
        '.task-move-control select', '.task-owner', '.timesheet-btn'
      ].map(selector => { const element = card.querySelector(selector); return element ? { selector, ...info(element) } : { selector, missing: true }; }) : [],
      column: column ? { rect: rect(column), header: info(column.querySelector('.column-header')), cardCount: column.querySelectorAll('.task-card').length } : null,
      taskListFirstRow: select('#taskList [data-task-list-id]') ? [...select('#taskList [data-task-list-id]').children].map(info) : null
    };
  });
  console.log(JSON.stringify(dump, null, 2));
} finally {
  await session.stop();
}
