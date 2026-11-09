import { startUiV2Session, prepareUiV2Page, switchUiV2View, prepareUiV2PromptsFixture } from '../tests/ui_v2_helpers.mjs';
import { readFileSync } from 'node:fs';
import { checkPage } from 'lintapple';

const policy = JSON.parse(readFileSync('ui-policy.json', 'utf8'));
const view = process.argv[2] || 'prompts';
const theme = process.argv[3] || 'light';

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  const { page } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
  if (view === 'prompts') await prepareUiV2PromptsFixture(page);
  await switchUiV2View(page, view);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600);

  const result = await checkPage(page, policy);
  const findings = Array.isArray(result) ? result : (result.findings || []);
  if (findings.length === 0) console.log('SHAPE:', JSON.stringify(result).slice(0, 300));
  const targets = [...new Set(findings.map((f) => f.selector))];

  const info = await page.evaluate((sels) => {
    return sels.map((sel) => {
      try {
        const el = document.querySelector(sel);
        if (!el) return { sel, cls: '(not found)' };
        const chain = [];
        for (let n = el; n && n !== document.body && chain.length < 3; n = n.parentElement) {
          chain.unshift(`${(n.className || n.tagName).toString().split(' ').slice(0, 2).join('.')}`);
        }
        const cs = getComputedStyle(el);
        return {
          sel,
          tag: el.tagName.toLowerCase(),
          cls: chain.join(' > '),
          hidden: el.offsetParent === null,
          fontSize: cs.fontSize,
          gap: cs.gap,
          inset: cs.padding,
          size: `${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`,
          text: (el.innerText || el.textContent || '').trim().slice(0, 40)
        };
      } catch (err) {
        return { sel, cls: 'ERR ' + err.message };
      }
    });
  }, targets);

  const bySel = new Map(info.map((i) => [i.sel, i]));
  const agg = new Map();
  const MSG = new Map();
  for (const f of findings) {
    const i = bySel.get(f.selector) || {};
    MSG.set(`${f.rule}|${i.cls || f.selector}|${f.actual}`, f.message);
  }
  for (const f of findings) {
    const i = bySel.get(f.selector) || {};
    const key = `${f.rule}|${i.cls || f.selector}|${f.actual}`;
    agg.set(key, (agg.get(key) || 0) + 1);
  }
  const sorted = [...agg.entries()].sort((a, b) => b[1] - a[1]);
  for (const [key, count] of sorted.slice(0, 25)) {
    console.log(String(count).padStart(4), key, '::', MSG.get(key) || '');
  }
  console.log('total', findings.length, 'distinct', targets.length);
} finally {
  await session.stop();
}
process.exit(0);
