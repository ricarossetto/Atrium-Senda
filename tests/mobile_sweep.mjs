import fs from 'node:fs';
import path from 'node:path';
import {
  prepareUiV2AgendaFixture,
  prepareUiV2Page,
  prepareUiV2PublicationsFixture,
  prepareUiV2TasksFixture,
  startUiV2Session
} from './ui_v2_helpers.mjs';

const width = Number(process.argv[2] || 390);
const outputs = path.resolve('artifacts', 'mobile-review');
fs.mkdirSync(outputs, { recursive: true });

const views = [
  { id: 'hoje', fixture: null },
  { id: 'tarefas', fixture: prepareUiV2TasksFixture },
  { id: 'publicacoes', fixture: prepareUiV2PublicationsFixture },
  { id: 'agenda', fixture: prepareUiV2AgendaFixture }
];

const session = await startUiV2Session();
const results = [];
try {
  for (const view of views) {
    for (const theme of ['light', 'dark']) {
      const context = await session.createContext({ viewport: { width, height: 844 } });
      try {
        const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
        if (view.fixture) await view.fixture(page);
        await page.waitForTimeout(320);
        const audit = await page.evaluate(() => {
          const active = document.querySelector('.view.active');
          const box = element => element.getBoundingClientRect();
          const visible = element => {
            const rect = box(element);
            const style = getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
          };
          const label = element => ({
            tag: element.tagName.toLowerCase(),
            id: element.id || undefined,
            cls: String(element.className || '').slice(0, 60),
            text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32)
          });
          const interactive = [...active.querySelectorAll('button, a[href], input, select, textarea, [role="button"], summary')].filter(visible);
          const small = interactive.filter(element => {
            const rect = box(element);
            return rect.width < 43.5 || rect.height < 43.5;
          }).map(element => ({ ...label(element), w: Math.round(box(element).width), h: Math.round(box(element).height) }));
          const offscreen = [...active.querySelectorAll('*')].filter(element => element.children.length === 0 && visible(element)).filter(element => {
            const rect = box(element);
            return rect.right > innerWidth + 1 || rect.left < -1;
          }).slice(0, 12).map(element => ({ ...label(element), left: Math.round(box(element).left), right: Math.round(box(element).right) }));
          const title = document.getElementById('viewTitle');
          return {
            view: active.id,
            overflow: document.documentElement.scrollWidth - innerWidth,
            title: title ? { fontSize: getComputedStyle(title).fontSize, truncated: title.scrollWidth > title.clientWidth + 1, text: title.textContent.trim() } : null,
            smallCount: small.length,
            small: small.slice(0, 14),
            offscreen
          };
        });
        const file = path.join(outputs, `${view.id}-${width}-${theme}.png`);
        await page.screenshot({ path: file });
        results.push({ requested: view.id, theme, ...audit, pageErrors, file });
      } finally {
        await context.close();
      }
    }
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await session.stop();
}
