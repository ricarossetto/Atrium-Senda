import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startUiV2Session, prepareUiV2Page, prepareUiV2EmailCalendarFixture } from './ui_v2_helpers.mjs';

const output = new URL('../artifacts/visual-qa/mail-receivers/', import.meta.url);
await mkdir(output, { recursive: true });
const session = await startUiV2Session();
try {
  for (const theme of ['light', 'dark']) {
    for (const width of [1440, 1186, 390]) {
      const context = await session.createContext({ viewport: { width, height: 844 } });
      try {
        const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme });
        await prepareUiV2EmailCalendarFixture(page);
        const rows = page.locator('.email-receiver-item');
        assert.ok(await rows.count() > 0, 'Destinatários sintéticos presentes.');
        const controls = await rows.locator('button').evaluateAll(elements => elements.map(el => {
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return { label: el.textContent.trim(), fontSize: Number.parseFloat(style.fontSize), height: rect.height, width: rect.width, color: style.color };
        }));
        for (const control of controls) {
          assert.equal(control.fontSize, 12, `${theme}/${width}: fonte do rótulo de ação legível e na escala.`);
          assert.ok(control.height >= (width === 390 ? 43.5 : 39.5), `${theme}/${width}: alvo da ação ${control.label}.`);
        }
        const gaps = await page.locator('.email-receiver-actions').evaluateAll(elements => elements.map(el => parseFloat(getComputedStyle(el).gap)));
        assert.ok(gaps.every(gap => gap >= 8), `${theme}/${width}: ações não ficam coladas.`);
        const labels = await page.locator('#atriumMailTelemetry small').evaluateAll(elements => elements.map(el => Number.parseFloat(getComputedStyle(el).fontSize)));
        assert.deepEqual(labels, [12, 12, 12], 'Pequenas legendas não herdam a redução padrão de small.');
        assert.ok(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth) <= 2);
        await rows.first().screenshot({ path: fileURLToPath(new URL(`receiver-${theme}-${width}.png`, output)) });
        assert.deepEqual(pageErrors, []);
        console.log(`PASS ${theme}/${width}: destinatários, fontes, folga, alvos e telemetria.`);
      } finally { await context.close(); }
    }
  }
} finally { await session.stop(); }
