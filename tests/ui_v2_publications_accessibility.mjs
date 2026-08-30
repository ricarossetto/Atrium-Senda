import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareUiV2Page, prepareUiV2PublicationsFixture, startUiV2Session } from './ui_v2_helpers.mjs';

const cssSource = readFileSync(new URL('../css/views/ui-v2/publications.css', import.meta.url), 'utf8');
assert.match(cssSource, /grid-template-columns:\s*minmax\(380px, 42%\) minmax\(0, 58%\)/, 'Desktop deve declarar master/detail dentro da faixa prevista.');
assert.match(cssSource, /@media \(max-width: 767px\)/, 'Mobile sheet deve possuir breakpoint explícito.');
assert.match(cssSource, /min-height:\s*44px/, 'Alvos mobile devem declarar 44px.');
assert.match(cssSource, /white-space:\s*pre-wrap/, 'Texto original deve preservar quebras.');

const session = await startUiV2Session();
try {
  const desktop = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(desktop, session.server.baseUrl, { theme: 'dark' });
    await prepareUiV2PublicationsFixture(page);
    const layout = await page.evaluate(() => {
      const queue = document.querySelector('.inbox-list-card').getBoundingClientRect();
      const detail = document.getElementById('intimationDetail').getBoundingClientRect();
      return { queue: queue.width, detail: detail.width, total: queue.width + detail.width, overflow: document.documentElement.scrollWidth - innerWidth };
    });
    assert.ok(layout.queue / layout.total >= .38 && layout.queue / layout.total <= .46, `Fila desktop fora da faixa: ${layout.queue / layout.total}.`);
    assert.ok(layout.detail / layout.total >= .54 && layout.detail / layout.total <= .62, `Leitura desktop fora da faixa: ${layout.detail / layout.total}.`);
    assert.ok(layout.overflow <= 2);

    const record = page.locator('[data-intimation-id="ui-v2-publication-urgent"]');
    await record.focus();
    await page.keyboard.press('Enter');
    assert.equal(await record.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#intimationDetail').getAttribute('role'), 'region');
    assert.equal(await page.locator('#intimationDetail').getAttribute('aria-modal'), null, 'Detalhe split desktop não é modal.');
    assert.match(await page.locator('#publicationDetailTitle').textContent(), /Intimação sintética/);

    const filter = page.locator('#inboxFilters button[data-filter="treated"]');
    await filter.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#inboxList [data-intimation-id]').count(), 1);
    assert.deepEqual(pageErrors, []);
  } finally {
    await desktop.close();
  }

  const mobile = await session.createContext({ viewport: { width: 390, height: 844 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(mobile, session.server.baseUrl, { theme: 'light' });
    await prepareUiV2PublicationsFixture(page);
    const before = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
      const records = [...document.querySelectorAll('#inboxList [data-intimation-id]')];
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        duplicates: ids.filter((id, index) => ids.indexOf(id) !== index),
        targets: records.map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }))
      };
    });
    assert.ok(before.overflow <= 2, `Overflow mobile: ${before.overflow}px.`);
    assert.deepEqual(before.duplicates, []);
    for (const target of before.targets) {
      assert.ok(target.width >= 44 && target.height >= 44);
    }

    const origin = page.locator('[data-intimation-id="ui-v2-publication-urgent"]');
    const originText = await origin.textContent();
    for (const expected of ['Intimação sintética', '5004321-12.2026.8.21.0001', 'DJEN sintético', 'Não tratada', 'Não lida']) {
      assert.ok(originText.includes(expected), `RecordList deve expor: ${expected}`);
    }
    await origin.focus();
    await page.keyboard.press('Enter');
    await page.locator('#view-inbox.publication-detail-open').waitFor();
    assert.equal(await page.locator('#intimationDetail').getAttribute('role'), 'dialog');
    assert.equal(await page.locator('#intimationDetail').getAttribute('aria-modal'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'publicationDetailClose');
    assert.equal(await page.locator('.inbox-list-card').getAttribute('inert'), '');
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    const sheet = await page.locator('#intimationDetail').evaluate(element => {
      const rect = element.getBoundingClientRect();
      const actions = [...element.querySelectorAll('.detail-actions .button')].map(button => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height }));
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight, actions };
    });
    assert.ok(sheet.left >= -2 && sheet.right <= sheet.viewportWidth + 2);
    assert.ok(sheet.top >= -2 && sheet.bottom <= sheet.viewportHeight + 2);
    for (const target of sheet.actions) assert.ok(target.width >= 44 && target.height >= 44);

    await page.locator('#btnDiscardPublication').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'publicationDetailClose', 'Tab deve circular ao primeiro controle.');
    await page.keyboard.press('Escape');
    await page.locator('#view-inbox:not(.publication-detail-open)').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.intimationId), 'ui-v2-publication-urgent', 'Escape deve devolver foco ao registro.');
    assert.equal(await page.locator('.inbox-list-card').getAttribute('inert'), null);

    const emailButton = page.locator('#btnEmailPublications');
    await emailButton.focus();
    await emailButton.click();
    await page.locator('#publicationsEmailModalBackdrop:not(.hidden)').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'emailTargetAddress');
    assert.equal(await page.locator('#appShell').getAttribute('inert'), '');
    await page.locator('#publicationsEmailCancel').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'publicationsEmailClose', 'Overlay deve conter foco.');
    await page.keyboard.press('Escape');
    await page.locator('#publicationsEmailModalBackdrop.hidden').waitFor({ state: 'attached' });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'btnEmailPublications');
    assert.equal(await page.locator('#appShell').getAttribute('inert'), null);
    assert.deepEqual(pageErrors, []);
  } finally {
    await mobile.close();
  }
} finally {
  await session.stop();
}

console.log('✓ Acessibilidade de Publicações V2 aprovada: master/detail, RecordList, mobile sheet, foco e overlays supervisionados.');
