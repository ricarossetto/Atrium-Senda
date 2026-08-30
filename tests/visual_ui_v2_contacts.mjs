import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareUiV2ContactsFixture, prepareUiV2Page, startUiV2Session } from './ui_v2_helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'artifacts', 'visual-qa', 'ui-v2-contacts');
fs.mkdirSync(OUTPUT, { recursive: true });

const SCENARIOS = [
  { file: '01-light-1440x900-list-inspector.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'client' },
  { file: '02-dark-1440x900-list-inspector.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'client' },
  { file: '03-light-1440x900-clients-filter.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'clients' },
  { file: '04-dark-1440x900-expert-selected.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'expert' },
  { file: '05-light-1440x900-new-contact-drawer.png', theme: 'light', viewport: { width: 1440, height: 900 }, state: 'new' },
  { file: '06-dark-1440x900-edit-contact-drawer.png', theme: 'dark', viewport: { width: 1440, height: 900 }, state: 'edit' },
  { file: '07-light-1280x800-long-contact.png', theme: 'light', viewport: { width: 1280, height: 800 }, state: 'long' },
  { file: '08-dark-1024x768-empty-search.png', theme: 'dark', viewport: { width: 1024, height: 768 }, state: 'empty' },
  { file: '09-light-390x844-mobile-list.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'list' },
  { file: '10-dark-390x844-mobile-inspector.png', theme: 'dark', viewport: { width: 390, height: 844 }, state: 'client' },
  { file: '11-light-390x844-mobile-edit-sheet.png', theme: 'light', viewport: { width: 390, height: 844 }, state: 'edit' }
];

const session = await startUiV2Session();
const hashes = new Set();
let assertions = 0;
try {
  for (const scenario of SCENARIOS) {
    const context = await session.createContext({ viewport: scenario.viewport });
    try {
      const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: scenario.theme });
      await prepareUiV2ContactsFixture(page);

      if (scenario.state === 'client') {
        await page.locator('[data-contact-id="ui-v2-contact-client"]').click();
      } else if (scenario.state === 'clients') {
        await page.locator('[data-contact-role-filter="cliente"]').click();
      } else if (scenario.state === 'expert') {
        await page.locator('[data-contact-role-filter="perito"]').click();
        await page.locator('[data-contact-id="ui-v2-contact-expert"]').click();
      } else if (scenario.state === 'new') {
        await page.locator('#newContactButton').click();
      } else if (scenario.state === 'edit') {
        await page.locator('[data-contact-id="ui-v2-contact-client"]').click();
        await page.locator('[data-contact-edit]').click();
      } else if (scenario.state === 'long') {
        await page.locator('[data-contact-id="ui-v2-contact-long"]').click();
      } else if (scenario.state === 'empty') {
        await page.locator('#contactSearch').fill('nenhuma pessoa sintética correspondente');
      }

      if (['new', 'edit'].includes(scenario.state)) {
        await page.locator('#modalBackdrop[data-modal-mode="contact"]:not(.hidden)').waitFor();
      }
      await page.waitForTimeout(300);

      const layout = await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
        const workspace = document.getElementById('contactsV2Workspace');
        const workspaceRect = workspace?.getBoundingClientRect();
        const inspector = document.querySelector('#contactInspector.is-open');
        const inspectorRect = inspector?.getBoundingClientRect();
        const drawer = document.querySelector('#modalBackdrop[data-modal-mode="contact"]:not(.hidden) .modal');
        const drawerRect = drawer?.getBoundingClientRect();
        const buttons = [...document.querySelectorAll('#view-contacts button')].filter(button => button.getClientRects().length > 0);
        return {
          active: document.getElementById('view-contacts').classList.contains('active'),
          ui: document.documentElement.dataset.ui,
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
          duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
          records: document.querySelectorAll('#contactsV2Workspace [data-contact-id]').length,
          empty: Boolean(document.querySelector('.contact-empty-state')),
          workspace: workspaceRect ? { left: workspaceRect.left, right: workspaceRect.right, width: innerWidth } : null,
          inspector: inspectorRect ? { left: inspectorRect.left, right: inspectorRect.right, top: inspectorRect.top, bottom: inspectorRect.bottom, width: innerWidth, height: innerHeight } : null,
          drawer: drawerRect ? { left: drawerRect.left, right: drawerRect.right, top: drawerRect.top, bottom: drawerRect.bottom, width: innerWidth, height: innerHeight, formOverflow: drawer.querySelector('form').scrollWidth - drawer.querySelector('form').clientWidth } : null,
          undersized: innerWidth <= 760 ? buttons.filter(button => {
            const rect = button.getBoundingClientRect();
            return rect.width < 43.5 || rect.height < 43.5;
          }).map(button => button.getAttribute('aria-label') || button.textContent.trim()) : []
        };
      });

      assert.equal(layout.active, true); assertions++;
      assert.equal(layout.ui, 'v2'); assertions++;
      assert.ok(layout.pageOverflow <= 2, `${scenario.file}: overflow global ${layout.pageOverflow}px.`); assertions++;
      assert.deepEqual(layout.duplicateIds, []); assertions++;
      assert.ok(layout.records > 0 || layout.empty || layout.drawer, `${scenario.file}: superfície sem conteúdo.`); assertions++;
      assert.ok(layout.workspace && layout.workspace.left >= -2 && layout.workspace.right <= layout.workspace.width + 2, `${scenario.file}: workspace fora do viewport.`); assertions++;
      assert.deepEqual(layout.undersized, [], `${scenario.file}: targets mobile abaixo de 44px: ${JSON.stringify(layout.undersized)}`); assertions++;
      assert.deepEqual(pageErrors, []); assertions++;
      if (layout.inspector) {
        assert.ok(layout.inspector.left >= -2 && layout.inspector.right <= layout.inspector.width + 2, `${scenario.file}: inspector horizontal.`); assertions++;
        assert.ok(layout.inspector.top >= -2 && layout.inspector.bottom <= layout.inspector.height + 2, `${scenario.file}: inspector vertical ${JSON.stringify(layout.inspector)}.`); assertions++;
      }
      if (layout.drawer) {
        assert.ok(layout.drawer.left >= -2 && layout.drawer.right <= layout.drawer.width + 2, `${scenario.file}: drawer horizontal.`); assertions++;
        assert.ok(layout.drawer.top >= -2 && layout.drawer.bottom <= layout.drawer.height + 2, `${scenario.file}: drawer vertical.`); assertions++;
        assert.ok(layout.drawer.formOverflow <= 2, `${scenario.file}: formulário com overflow ${layout.drawer.formOverflow}px.`); assertions++;
      }

      const output = path.join(OUTPUT, scenario.file);
      await page.screenshot({ path: output, fullPage: false });
      hashes.add(crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'));
    } finally {
      await context.close();
    }
  }

  assert.equal(hashes.size, SCENARIOS.length, 'Os 11 estados visuais devem produzir hashes distintos.');
  console.log('======================================================');
  console.log('✓ UI V2 CONTACTS VISUAL QA CONCLUÍDO!');
  console.log(`- Screenshots: ${SCENARIOS.length}`);
  console.log(`- Hashes únicos: ${hashes.size}`);
  console.log(`- Asserções: ${assertions}/${assertions}`);
  console.log(`- Artefatos: ${OUTPUT}`);
  console.log('======================================================');
} finally {
  await session.stop();
}
